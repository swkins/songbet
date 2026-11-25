# V리그 선수 체급 방식 백테스트 (2026-11-25 사용자 요청 — 하나만 잘하는 선수보다 이것저것 고르고 범실 적은 선수가 체급이 높아야)
# 데이터: vleague_fetch_players.py로 받은 선수 시즌 기록(players.json·season_records.json) + KOVO 일정 json (vleague_backtest.py와 같은 폴더)
# 방법: 시즌 N 경기를 시즌 N−1 선수 기록으로 만든 팀 전력(포지션 주전 슬롯, playerOverall.ts volleyLineup과 같은 방식)으로 예측.
#   ① 팀 전력만 (logit = hca + k·차) ② 상대 보정 팀 레이팅(volleyPredict.ts) + k·차 — 둘 다 LL을 시즌 하나씩 빼고 검증(계수는 나머지 시즌으로).
import json, math, os, sys, statistics as st, itertools
sys.path.insert(0, os.path.dirname(__file__))
import vleague_backtest as vb

KD, PD = sys.argv[1], sys.argv[2]
players = json.load(open(os.path.join(PD, 'players.json'), encoding='utf-8'))
recs = json.load(open(os.path.join(PD, 'season_records.json'), encoding='utf-8'))
sig = vb.sig

def season_code(div):   # '2025-2026 [정]' → 22
    return int(div[:4]) - 2003

# 선수-시즌 행 (정규리그만, 같은 시즌 두 팀이면 각각)
rows = []
for code, rs in recs.items():
    p = players.get(code) or {}
    for r in rs or []:
        if '[정]' not in (r.get('seasonDivision') or '') or 'V' not in (r.get('leagueDivision') or ''): continue
        sets = r.get('setCount') or 0
        if sets <= 0: continue
        f = lambda k: float(r.get(k) or 0)
        # 감독·코치도 KOVO 선수 기록에 0으로 들어 있다 (여오현·장소연·박철우 등, 팀 전 경기·전 세트) → 기록이 전부 0이면 뺀다
        if not any(f(k) for k in ('point', 'digSetSuccess', 'receiveSuccess', 'setSuccess', 'error', 'blockingSetSuccess', 'serveSetSuccess', 'attackTotalSuccess')): continue
        rows.append(dict(code=code, g=p.get('gender'), pos=p.get('position'), s=season_code(r['seasonDivision']), team=r.get('teamName'), sets=sets,
                         pts=f('point') / sets, atk=f('attackTotalSuccess'), blk=f('blockingSetSuccess'), srv=f('serveSetSuccess'),
                         st=f('setSuccess'), rcv=f('receiveSuccess'), dig=f('digSetSuccess'), err=f('error') / sets))

SKILLS = {   # 포지션별로 보는 능력 (+1 = 높을수록 좋음, −1 = 낮을수록 좋음)
    'OP': {'atk': 1, 'pts': 1, 'srv': 1, 'blk': 1, 'err': -1},
    'OH': {'atk': 1, 'pts': 1, 'srv': 1, 'blk': 1, 'rcv': 1, 'dig': 1, 'err': -1},
    'MB': {'atk': 1, 'blk': 1, 'pts': 1, 'srv': 1, 'err': -1},
    'S': {'st': 1, 'dig': 1, 'srv': 1, 'blk': 1, 'err': -1},
    'L': {'dig': 1, 'rcv': 1, 'err': -1},
}
def zstats(grp):
    out = {}
    for k in ('pts', 'atk', 'blk', 'srv', 'st', 'rcv', 'dig', 'err'):
        xs = [x[k] for x in grp if x['sets'] >= 20]
        out[k] = (st.mean(xs), st.pstdev(xs) or 1) if len(xs) >= 3 else (0, 1)
    return out

def values(method, lam=0.5, errw=1.0):
    """선수-시즌 → 원점수 (리그·시즌 안에서 백분위로 바꿔 쓴다)"""
    val = {}
    for (g, s, pos), grp in itertools.groupby(sorted(rows, key=lambda x: (x['g'] or '', x['s'], x['pos'] or '')), key=lambda x: (x['g'], x['s'], x['pos'])):
        grp = list(grp); Z = zstats(grp)
        for x in grp:
            if method == 'now':     # 지금 방식 근사: 득점 + 0.15 세트 + 0.3 디그 − 0.5 범실 (세트당)
                v = x['pts'] + 0.15 * x['st'] + 0.3 * x['dig'] - 0.5 * x['err']
            else:                    # 균형: 포지션 능력 z 평균 − λ × 약점(평균 아래) 평균, 범실 가중 errw
                sk = SKILLS.get(pos) or SKILLS['OH']
                zs = []
                ws = []
                for k, d in sk.items():
                    z = max(-3, min(3, d * (x[k] - Z[k][0]) / Z[k][1]))
                    w = errw if k == 'err' else 1
                    if w > 0: zs.append(z); ws.append(w)
                v = sum(z * w for z, w in zip(zs, ws)) / sum(ws) - lam * sum(max(0, -z) * w for z, w in zip(zs, ws)) / sum(ws)
                if method == 'mix':   # 균형 + 득점량 (z) 반반
                    v = 0.5 * v + 0.5 * max(-3, min(3, (x['pts'] - Z['pts'][0]) / Z['pts'][1]))
            # 세트 적으면 평균 쪽으로 (sets / (sets + 30))
            val[(x['code'], x['s'], x['team'])] = (v, x['sets'])
    # 리그·시즌 안 백분위 → 100점 (playerOverall과 같은 눈금 대신 단순 백분위 40~95)
    out = {}
    for (g, s), keys in itertools.groupby(sorted(val, key=lambda k: (players.get(k[0], {}).get('gender') or '', k[1])), key=lambda k: (players.get(k[0], {}).get('gender'), k[1])):
        keys = list(keys)
        pool = sorted(val[k][0] for k in keys if val[k][1] >= 20)
        for k in keys:
            v, n = val[k]
            pct = sum(1 for p in pool if p <= v) / max(1, len(pool))
            sc = 40 + 55 * pct; w = n / (n + 30)
            out[k] = sc * w + 55 * (1 - w)
    return out

SLOTS = [('S', 1, 1.25), ('OP', 1, 1.25), ('OH', 2, 1.0), ('MB', 2, 0.8), ('L', 1, 0.6)]
def team_strength(members, score):
    """members = 그 시즌 그 팀 선수 코드, score(code) = 지난 시즌 점수(없으면 None → 55)"""
    tot = 0; sw = 0; slots = []
    for pos, n, w in SLOTS:
        c = sorted([score(m) for m in members if players.get(m, {}).get('position') == pos], reverse=True)[:n]
        c += [50] * (n - len(c))
        v = sum(c) / n; slots.append((v, w * n))
    mean = sum(v * w for v, w in slots) / sum(w for _, w in slots)
    pen = 0.5 * sum(w * max(0, mean - v) for v, w in slots) / sum(w for _, w in slots)
    return mean - pen

games = vb.load()
vb.run.prevR = {}
rate_out = vb.run(games, {'hca': .2, 'elo': 1, 'ek': .2})   # 상대 보정 레이팅 예측 (경기 순서 = games)

def evaluate(sc):
    # 시즌 N 팀 명단 = 그 시즌 기록 있는 선수, 점수 = N−1 시즌 점수 (팀 상관없이 그 선수)
    prev = {}
    for (code, s, team), v in sc.items(): prev[(code, s)] = max(prev.get((code, s), 0), v)
    roster = {}
    for r in rows: roster.setdefault((r['g'], r['s'], r['team']), set()).add(r['code'])
    X = []
    for g, o in zip(games, rate_out):
        s = g['season']
        if s < 19 or s > 22: continue
        mh, ma = roster.get((g['gender'], s, g['home'])), roster.get((g['gender'], s, g['away']))
        if not mh or not ma: continue
        f = lambda c: prev.get((c, s - 1), 55)
        X.append((s, team_strength(mh, f) - team_strength(ma, f), logit_(o[2]), o[3]))
    return X
logit_ = lambda p: math.log(p / (1 - p))

def fit_ll(X, use_rate):
    seasons = sorted({x[0] for x in X}); tot = 0; n = 0
    for hold in seasons:
        tr = [x for x in X if x[0] != hold]; te = [x for x in X if x[0] == hold]
        best = None
        for k in [i * 0.01 for i in range(0, 31)]:
            for h in ([0] if use_rate else [0, .1, .2, .3]):
                ll = -sum(math.log(max(1e-9, sig((x[2] if use_rate else h) + k * x[1]) if x[3] else 1 - sig((x[2] if use_rate else h) + k * x[1]))) for x in tr)
                if best is None or ll < best[0]: best = (ll, k, h)
        _, k, h = best
        tot += -sum(math.log(sig((x[2] if use_rate else h) + k * x[1]) if x[3] else 1 - sig((x[2] if use_rate else h) + k * x[1])) for x in te); n += len(te)
    return tot / n, n

if __name__ == '__main__':
    print('선수-시즌', len(rows), '· 시즌별 팀 이름 예', sorted({(r['s'], r['team']) for r in rows if r['g'] == 'FEMALE' and r['s'] >= 21})[:20])
    base = None
    for name, args in [('지금 방식 (득점 위주)', ('now',)), ('균형 (λ 0)', ('bal', 0)), ('균형 (λ 0.5)', ('bal', .5)), ('균형 (λ 1)', ('bal', 1)),
                       ('균형 λ 0.5 + 범실 2배', ('bal', .5, 2)), ('균형 λ 1 + 범실 2배', ('bal', 1, 2)),
                       ('균형 λ 0 범실 빼기', ('bal', 0, 0)), ('균형 λ 0 범실 0.5배', ('bal', 0, .5)), ('균형 λ 0 범실 2배', ('bal', 0, 2)),
                       ('균형 + 득점량 반반', ('mix', 0, 1)), ('균형 + 득점량, 범실 빼기', ('mix', 0, 0))]:
        X = evaluate(values(*args))
        a, n = fit_ll(X, False); b, _ = fit_ll(X, True)
        r0 = -sum(math.log(sig(x[2]) if x[3] else 1 - sig(x[2])) for x in X) / len(X)
        print(f'{name:24s} 팀 전력만 LL {a:.4f} | 레이팅({r0:.4f}) + 팀 전력 LL {b:.4f} | {n}경기 (2022-23~2025-26, 시즌 하나씩 빼고)')

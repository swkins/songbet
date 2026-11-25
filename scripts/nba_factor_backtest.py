# NBA 예측 요소 백테스트 (2026-11-25 사용자 요청 — 국내에서 검토한 요소를 NBA에도): 출전 선수 보정·득점 분산·최근 5경기 폼·연승연패
# 기준 = 지금 NBA 팀 레이팅 (rk 0.05, 팀 10경기 전 가속 early 4, 홈 2.5, 이번 시즌만 — playerOverall.ts nbaRatings).
# 지난 시즌 NBA 박스스코어가 DB에 없어서 이번 시즌(2026-27) 경기 순서대로: 앞 절반으로 계수를 고르고 뒤 절반으로 확인.
# 입력: player_game_stats NBA를 v_player_games(gmsc)와 묶은 json (league, game_id, date, team, is_home, player_id, gmsc, minutes, pts)
import json, sys, statistics as st
txt = open(sys.argv[1], encoding='utf-8').read()
if txt.startswith('{"result"'):
    s = json.loads(txt)['result']; txt = s[s.index('[{"json_agg"'):s.rindex(']') + 1]
rows = json.loads(txt)[0]['json_agg']
G = {}
for lg, gid, d, team, home, pid, gm, mins, pts in rows:
    g = G.setdefault(gid, {'d': d, 'T': {}})
    t = g['T'].setdefault(team, {'home': home, 'pts': 0, 'pl': [], 'ps': []})
    t['pts'] += pts or 0; t['ps'].append(pts or 0)
    if (mins or 0) > 0: t['pl'].append((pid, float(gm or 0)))
games = sorted([g for g in G.values() if len(g['T']) == 2], key=lambda g: g['d'])

def run(F):
    """F = {'lineup': c, 'p1': c, 'hhi': c, 'n10': c, 'form': c, 'streak': c}"""
    R, N, P, HIST, CON, RES, WL = {}, {}, {}, {}, {}, {}, {}
    out = []
    for g in games:
        (h, th), (a, ta) = sorted(g['T'].items(), key=lambda kv: not kv[1]['home'])
        nmin = min(N.get(h, 0), N.get(a, 0))
        kk = .05 * (1 + 4 * max(0, 10 - nmin) / 10)
        def talent(t): return sum(sorted([st.mean(P[p]) for p, _ in t['pl'] if len(P.get(p, [])) >= 2], reverse=True)[:8])
        Sh, Sa = talent(th), talent(ta)
        dh = Sh - st.mean(HIST[h]) if HIST.get(h) else 0
        da = Sa - st.mean(HIST[a]) if HIST.get(a) else 0
        def con(t, k):
            xs = CON.get(t, []); return st.mean(x[k] for x in xs) if len(xs) >= 3 else None
        def cdiff(k):
            vh, va = con(h, k), con(a, k); return (vh - va) if vh is not None and va is not None else 0
        def form(t):
            xs = RES.get(t, [])[-5:]
            if len(xs) < 3: return 0
            w = list(range(1, len(xs) + 1)); return sum(wi * x for wi, x in zip(w, xs)) / sum(w)
        def stk(t):
            n = 0
            for x in reversed(WL.get(t, [])):
                if n == 0: n = 1 if x else -1
                elif (n > 0) == x: n += 1 if x else -1
                else: break
            return max(-5, min(5, n))
        base = 2.5 + R.get(h, 0) - R.get(a, 0)
        lin = F.get('lineup', 0) * (dh - da)
        mu = base + lin + F.get('p1', 0) * cdiff('p1') + F.get('hhi', 0) * cdiff('hhi') + F.get('n10', 0) * cdiff('n10') \
            + F.get('form', 0) * (form(h) - form(a)) + F.get('streak', 0) * (stk(h) - stk(a))
        m = th['pts'] - ta['pts']
        out.append((g['d'], mu, m, nmin))
        e = m - (base + lin)          # 레이팅은 출전 보정까지 넣은 예측과의 오차로 고침 (다른 요소는 레이팅에 안 섞음)
        R[h] = R.get(h, 0) + kk * e / 2; R[a] = R.get(a, 0) - kk * e / 2
        RES.setdefault(h, []).append(m - base); RES.setdefault(a, []).append(-(m - base))
        WL.setdefault(h, []).append(m > 0); WL.setdefault(a, []).append(m < 0)
        N[h] = N.get(h, 0) + 1; N[a] = N.get(a, 0) + 1
        HIST.setdefault(h, []).append(Sh); HIST.setdefault(a, []).append(Sa)
        for t, tm in ((th, h), (ta, a)):
            for p, gm in t['pl']: P.setdefault(p, []).append(gm)
            tot = sum(t['ps']) or 1; ps = sorted(t['ps'], reverse=True)
            CON.setdefault(tm, []).append({'p1': ps[0] / tot, 'hhi': sum((x / tot) ** 2 for x in ps), 'n10': sum(1 for x in ps if x >= 10)})
    return out

def ev(xs): return st.mean(abs(x[2] - x[1]) for x in xs), st.mean((x[1] > 0) == (x[2] > 0) for x in xs if x[2] != 0)
def split(o):
    xs = [x for x in o if x[3] >= 3]; h = len(xs) // 2; return xs[:h], xs[h:]
A0, B0 = split(run({}))
print(f'NBA 이번 시즌 {len(games)}경기 · 평가 {len(A0)}+{len(B0)} (두 팀 3경기+)')
print(f'  기준(지금 레이팅): 앞 MAE {ev(A0)[0]:.2f} | 뒤 MAE {ev(B0)[0]:.2f} 적중 {ev(B0)[1]*100:.1f}%')
GRID = {'lineup': [0, .1, .2, .3, .4, .5, .6, .8], 'p1': [-40, -20, -10, 0, 10, 20, 40], 'hhi': [-150, -80, -40, 0, 40, 80, 150],
        'n10': [-2, -1, -.5, 0, .5, 1, 2], 'form': [-.3, -.2, -.1, 0, .1, .2, .3], 'streak': [-1, -.5, -.25, 0, .25, .5, 1]}
NAME = {'lineup': '출전 선수 보정', 'p1': '득점 1위 비중', 'hhi': '득점 집중도 HHI', 'n10': '10점+ 선수 수', 'form': '최근 5경기 폼', 'streak': '연승·연패'}
for k, grid in GRID.items():
    best = min(grid, key=lambda c: ev(split(run({k: c}))[0])[0])
    A, B = split(run({k: best}))
    print(f'  + {NAME[k]:10s} 계수 {best:>5} | 앞 MAE {ev(A)[0]:.2f} | 뒤 MAE {ev(B)[0]:.2f} ({ev(B)[0]-ev(B0)[0]:+.2f}) 적중 {ev(B)[1]*100:.1f}%')

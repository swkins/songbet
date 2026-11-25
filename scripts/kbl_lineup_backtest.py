# KBL·WKBL '출전 선수 보정' 백테스트 (2026-11-25 — WKBL KB스타즈: 박지수 없이 치른 초반 경기 때문에 레이팅이 낮게 잡혀 우리은행 승 예측)
# 기준 = 지금 쓰는 팀 레이팅 (rk 0.05, 홈 KBL 2·WKBL 0.5, 이번 시즌만). 추가 = c × (오늘 뛰는 선수들의 실력 합 − 그 팀이 지금까지 치른 경기들의 평균 실력 합).
#  선수 실력 = 그 경기 전까지 이번 시즌 평균 게임스코어(2경기+), 팀 실력 합 = 그날 뛴 선수 상위 8명 합.
#  레이팅도 보정한 예측과의 오차로 고친다 → 주전이 빠져서 진 경기는 레이팅을 덜 깎는다.
# 오늘 뛰는 선수는 실제 출전 명단(결장 정보가 정확할 때의 효과)을 쓴다. 계수 c는 2025-26 앞 절반으로 고르고 뒤 절반 + 2026-27로 확인.
import json, sys, statistics as st
txt = open(sys.argv[1], encoding='utf-8').read()
if txt.startswith('{"result"'):
    s = json.loads(txt)['result']; txt = s[s.index('[{"json_agg"'):s.rindex(']') + 1]
rows = json.loads(txt)[0]['json_agg']
HCA = {'KBL': 2.0, 'WKBL': 0.5}
def season_of(d): y, m = int(d[:4]), int(d[5:7]); return y + 1 if m >= 9 else y
G = {}
for lg, gid, d, team, home, pid, gm, mins, pts in rows:
    g = G.setdefault((lg, gid), {'lg': lg, 'd': d, 's': season_of(d), 'T': {}})
    t = g['T'].setdefault(team, {'home': home, 'pts': 0, 'pl': []})
    t['pts'] += pts or 0
    if (mins or 0) > 0: t['pl'].append((pid, float(gm or 0)))
games = sorted([g for g in G.values() if len(g['T']) == 2], key=lambda g: (g['lg'], g['s'], g['d']))

def run(lg, c, top=8):
    out = []; season = None
    for g in games:
        if g['lg'] != lg: continue
        if g['s'] != season: season = g['s']; R, P, HIST = {}, {}, {}
        (h, th), (a, ta) = sorted(g['T'].items(), key=lambda kv: not kv[1]['home'])
        def talent(t):
            vals = sorted([st.mean(P[p]) for p, _ in t['pl'] if len(P.get(p, [])) >= 2], reverse=True)[:top]
            return sum(vals)
        Sh, Sa = talent(th), talent(ta)
        dh = Sh - st.mean(HIST[h]) if HIST.get(h) else 0
        da = Sa - st.mean(HIST[a]) if HIST.get(a) else 0
        mu = HCA[lg] + R.get(h, 0) - R.get(a, 0) + c * (dh - da)
        m = th['pts'] - ta['pts']
        n = min(len(HIST.get(h, [])), len(HIST.get(a, [])))
        out.append((g['s'], mu, m, n, h, a, dh, da))
        e = m - mu
        R[h] = R.get(h, 0) + .05 * e / 2; R[a] = R.get(a, 0) - .05 * e / 2
        HIST.setdefault(h, []).append(Sh); HIST.setdefault(a, []).append(Sa)
        for t in (th, ta):
            for p, gm in t['pl']: P.setdefault(p, []).append(gm)
    run.state = (R, P, HIST)
    if c == 0: globals()['run0'] = [R.get('우리은행', 0) - R.get('KB스타즈', 0)]
    return out

def ev(xs):
    return st.mean(abs(x[2] - x[1]) for x in xs), st.mean((x[1] > 0) == (x[2] > 0) for x in xs if x[2] != 0)
for lg in ('KBL', 'WKBL'):
    base = run(lg, 0)
    prev = [x for x in base if x[0] == 2026 and x[3] >= 3]; half = len(prev) // 2
    best = None
    for c in [0, .1, .2, .3, .4, .5, .6, .8, 1.0]:
        o = run(lg, c); p = [x for x in o if x[0] == 2026 and x[3] >= 3]
        a = ev(p[:half])[0]
        if best is None or a < best[0]: best = (a, c)
    c = best[1]
    print(f'\n== {lg} == 계수 c = {c} (2025-26 앞 절반으로 고름)')
    for name, cc in (('지금 레이팅', 0), (f'출전 선수 보정 c={c}', c)):
        o = run(lg, cc)
        p = [x for x in o if x[0] == 2026 and x[3] >= 3]; cur = [x for x in o if x[0] == 2027 and x[3] >= 3]
        b, k = ev(p[half:]), ev(cur)
        print(f'  {name:18s} 2025-26 뒤 절반 MAE {b[0]:.2f} 적중 {b[1]*100:.1f}% ({len(p)-half}) | 2026-27 MAE {k[0]:.2f} 적중 {k[1]*100:.1f}% ({len(cur)})')
    if lg == 'WKBL':
        # 오늘(11/25) 우리은행(홈) vs KB: 각 팀 마지막 경기 출전 명단으로 실력 합, 강이슬 50%
        run(lg, c)
        R, P, HIST = run.state
        last = {}
        for g in games:
            if g['lg'] == lg and g['s'] == 2027:
                for t, v in g['T'].items(): last[t] = v
        def talent(t, drop=None, w=1.0):
            vals = sorted([(st.mean(P[p]) * (w if p == drop else 1)) for p, _ in last[t]['pl'] if len(P.get(p, [])) >= 2], reverse=True)[:8]
            return sum(vals)
        print('  선수 평균(상위):', {t: sorted([(round(st.mean(P[p]), 1), p) for p, _ in last[t]['pl'] if len(P.get(p, [])) >= 2], reverse=True)[:4] for t in ('KB스타즈', '우리은행')})
        dK = talent('KB스타즈') - st.mean(HIST['KB스타즈']); dW = talent('우리은행') - st.mean(HIST['우리은행'])
        print(f'  레이팅 우리 {R.get("우리은행",0):.2f} KB {R.get("KB스타즈",0):.2f} | 실력 변화 우리 {dW:+.1f} KB {dK:+.1f}')
        print(f'  오늘 예상 마진(우리은행 기준): 지금 방식 {0.5 + run0[0]:.1f} → 보정 {0.5 + R.get("우리은행",0) - R.get("KB스타즈",0) + c * (dW - dK):.1f}')

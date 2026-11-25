# KBL·WKBL 예측 요소 백테스트 (2026-11-25): 득점 분산(1위·상위 2명 비중, HHI)·최근 5경기 폼·연승연패
# 기준 = 지금 쓰는 팀 레이팅(nbaRatings: rk 0.05, early 0, 홈 KBL 2·WKBL 0.5, 이번 시즌만) 예상 마진.
# 요소 계수는 2025-26 앞 절반으로 고르고 뒤 절반 + 2026-27로 확인 (MAE·승패 적중).
# 입력: player_game_stats를 팀·경기로 묶은 json (league, game_id, date, team, opp, is_home, 팀득점, 1위 득점, 상위2 득점, 득점²합, 10점+ 선수 수)
import json, sys, statistics as st

txt = open(sys.argv[1], encoding='utf-8').read()
if txt.startswith('{"result"'):   # MCP execute_sql 결과 그대로 저장된 파일
    s = json.loads(txt)['result']; txt = s[s.index('[{"json_agg"'):s.rindex(']') + 1]
raw = json.loads(txt)
rows = raw[0]['json_agg'] if isinstance(raw, list) and isinstance(raw[0], dict) else raw
HCA = {'KBL': 2.0, 'WKBL': 0.5}

def season_of(d):  # 10월 시작 시즌
    y, m = int(d[:4]), int(d[5:7]); return y + 1 if m >= 9 else y

games = {}
for lg, gid, d, team, opp, home, tp, p1, p2, sq, n10 in rows:
    g = games.setdefault((lg, gid), {'lg': lg, 'd': d, 's': season_of(d)})
    g['H' if home else 'A'] = dict(team=team, tp=float(tp), p1=float(p1), p2=float(p2 or p1), hhi=float(sq) / float(tp) ** 2 if tp else 0, n10=n10)
G = sorted([g for g in games.values() if 'H' in g and 'A' in g], key=lambda g: (g['lg'], g['s'], g['d']))

def run(lg, F):
    out = []; R = {}; N = {}; HIST = {}; CON = {}; season = None
    for g in G:
        if g['lg'] != lg: continue
        if g['s'] != season: season = g['s']; R, N, HIST, CON = {}, {}, {}, {}
        h, a = g['H']['team'], g['A']['team']
        mu = HCA[lg] + R.get(h, 0) - R.get(a, 0)
        def avg(t, k):
            xs = CON.get(t, []); return st.mean(x[k] for x in xs) if len(xs) >= 3 else None
        feats = {}
        for k in ('p1', 'p2', 'hhi', 'n10'):
            vh, va = avg(h, k), avg(a, k); feats[k] = (vh - va) if vh is not None and va is not None else 0
        def form(t):
            xs = HIST.get(t, [])[-5:]
            if len(xs) < 3: return 0
            w = list(range(1, len(xs) + 1)); return sum(wi * x for wi, x in zip(w, xs)) / sum(w)
        feats['form'] = form(h) - form(a)      # 최근 5경기 '레이팅 대비 초과 마진' 가중 평균
        def stk(t):
            n = 0
            for x in reversed(HIST.get(t + '#wl', [])):
                if n == 0: n = 1 if x else -1
                elif (n > 0) == x: n += 1 if x else -1
                else: break
            return max(-5, min(5, n))
        feats['streak'] = stk(h) - stk(a)
        m = g['H']['tp'] - g['A']['tp']
        nmin = min(N.get(h, 0), N.get(a, 0))
        out.append(dict(s=g['s'], d=g['d'], mu=mu, m=m, f=feats, nmin=nmin))
        e = m - mu
        R[h] = R.get(h, 0) + .05 * e / 2; R[a] = R.get(a, 0) - .05 * e / 2
        HIST.setdefault(h, []).append(e); HIST.setdefault(a, []).append(-e)
        HIST.setdefault(h + '#wl', []).append(m > 0); HIST.setdefault(a + '#wl', []).append(m < 0)
        N[h] = N.get(h, 0) + 1; N[a] = N.get(a, 0) + 1
        for side, t in (('H', h), ('A', a)):
            x = g[side]; CON.setdefault(t, []).append({'p1': x['p1'] / x['tp'], 'p2': x['p2'] / x['tp'], 'hhi': x['hhi'], 'n10': x['n10']})
    return out

def evals(xs, k, c):
    mae = st.mean(abs(x['m'] - (x['mu'] + c * x['f'].get(k, 0))) for x in xs)
    acc = st.mean(((x['mu'] + c * x['f'].get(k, 0)) > 0) == (x['m'] > 0) for x in xs)
    return mae, acc

GRID = {'p1': [-40, -20, -10, 0, 10, 20, 40], 'p2': [-40, -20, -10, 0, 10, 20, 40], 'hhi': [-150, -80, -40, 0, 40, 80, 150],
        'n10': [-2, -1, -.5, 0, .5, 1, 2], 'form': [-.5, -.3, -.1, 0, .1, .3, .5], 'streak': [-1, -.5, -.25, 0, .25, .5, 1]}
NAME = {'p1': '득점 1위 비중', 'p2': '상위 2명 비중', 'hhi': '득점 집중도 HHI', 'n10': '10점+ 선수 수', 'form': '최근 5경기 폼', 'streak': '연승·연패'}
for lg in ('KBL', 'WKBL'):
    o = run(lg, None)
    prev = [x for x in o if x['s'] == 2026 and x['nmin'] >= 3]; cur = [x for x in o if x['s'] == 2027 and x['nmin'] >= 3]
    half = len(prev) // 2; A, B = prev[:half], prev[half:]
    b0 = evals(B, 'p1', 0); c0 = evals(cur, 'p1', 0)
    print(f'\n== {lg} ==  2025-26 앞 {len(A)} · 뒤 {len(B)} · 2026-27 {len(cur)}경기')
    print(f'  기준(지금 레이팅): 뒤 MAE {b0[0]:.2f} 적중 {b0[1]*100:.1f}% | 2026-27 MAE {c0[0]:.2f} 적중 {c0[1]*100:.1f}%')
    for k, grid in GRID.items():
        c = min(grid, key=lambda c: evals(A, k, c)[0])
        b = evals(B, k, c); cc = evals(cur, k, c)
        # 상관: 요소 차 vs 레이팅 오차 (전체 2025-26)
        xs = [x['f'][k] for x in prev]; ys = [x['m'] - x['mu'] for x in prev]
        r = st.correlation(xs, ys) if st.pstdev(xs) > 0 else 0
        print(f'  + {NAME[k]:10s} 계수 {c:>6} | 뒤 MAE {b[0]:.2f} ({b[0]-b0[0]:+.2f}) 적중 {b[1]*100:.1f}% | 2026-27 MAE {cc[0]:.2f} ({cc[0]-c0[0]:+.2f}) | 오차와 상관 {r:+.3f}')

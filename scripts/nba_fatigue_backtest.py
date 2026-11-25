# NBA 피로 요소 백테스트 (2026-11-26 사용자 요청 — 백투백·장거리 이동·연장·일정 밀집·원정 연전을 더 정밀하게).
# 데이터 = sportsbookreview 아카이브 2011-12~2021-22 정규시즌 (nba_backtest.py와 같은 파일, 날짜·팀·쿼터 점수·오픈/마감 핸디).
#  연장 = 최종 점수 ≠ 쿼터 합. 마감 핸디는 |값| < 25만 (약 930줄은 총점이 잘못 들어가 있음). 2019-20 버블(2020-07 이후)·2020-21은 이동이 비정상이라 따로 표시.
# 두 가지를 본다:
#  ① 실제 효과: 팀 레이팅(지금 앱과 같은 방식, 이번 시즌만 rk 0.05·early 4·홈 2.5)으로 낸 예상 마진의 오차를 피로 요소 차이로 회귀
#     → 우리 모델(시장 안 씀)에 넣을 크기
#  ② 시장 반영: 실제 마진 + 마감 홈 핸디(= 시장 대비 오차)를 같은 요소로 회귀 → 0 근처면 시장이 이미 반영 (베팅 신호 아님)
# 앞 5시즌(2011-15)으로 계수, 뒤(2016-18, 2021)로 확인 — MAE 비교.
import json, math, sys, datetime as dt, statistics as st
ARENA = {  # 닉네임 → (위도, 경도, UTC 대비 시차, 해발 m)
 'Hawks': (33.757, -84.396, 0, 300), 'Celtics': (42.366, -71.062, 0, 0), 'Nets': (40.683, -73.976, 0, 0), 'Hornets': (35.225, -80.839, 0, 230),
 'Bulls': (41.881, -87.674, -1, 180), 'Cavaliers': (41.497, -81.688, 0, 200), 'Mavericks': (32.79, -96.81, -1, 140), 'Nuggets': (39.749, -105.008, -2, 1600),
 'Pistons': (42.341, -83.055, 0, 190), 'Warriors': (37.768, -122.388, -3, 0), 'Rockets': (29.751, -95.362, -1, 15), 'Pacers': (39.764, -86.155, 0, 220),
 'Clippers': (34.043, -118.267, -3, 90), 'Lakers': (34.043, -118.267, -3, 90), 'Grizzlies': (35.138, -90.051, -1, 80), 'Heat': (25.781, -80.188, 0, 0),
 'Bucks': (43.045, -87.917, -1, 190), 'Timberwolves': (44.979, -93.276, -1, 250), 'Pelicans': (29.949, -90.082, -1, 0), 'Knicks': (40.751, -73.993, 0, 0),
 'Thunder': (35.463, -97.515, -1, 360), 'Magic': (28.539, -81.384, 0, 30), 'Seventysixers': (39.901, -75.172, 0, 0), 'Suns': (33.446, -112.071, -2, 330),
 'Trailblazers': (45.532, -122.667, -3, 15), 'Kings': (38.58, -121.5, -3, 10), 'Spurs': (29.427, -98.438, -1, 200), 'Raptors': (43.643, -79.379, 0, 80),
 'Jazz': (40.768, -111.901, -2, 1300), 'Wizards': (38.898, -77.021, 0, 0)}
FIX = {'NewJersey': 'Nets', 'Golden State': 'Warriors', 'LA Clippers': 'Clippers', 'Oklahoma City': 'Thunder'}
def km(a, b):
    r = math.pi / 180; dl = (b[0] - a[0]) * r; dg = (b[1] - a[1]) * r
    x = math.sin(dl / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dg / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))

raw = json.load(open(sys.argv[1]))
games = []
for g in raw:
    h, a = FIX.get(str(g['home_team']), str(g['home_team'])), FIX.get(str(g['away_team']), str(g['away_team']))
    if h not in ARENA or a not in ARENA: continue
    try:
        hs, as_ = int(g['home_final']), int(g['away_final'])
        q = lambda s: sum(int(g[f'{s}_{k}']) for k in ('1stQtr', '2ndQtr', '3rdQtr', '4thQtr'))
        ot = (hs != q('home')) or (as_ != q('away'))
    except Exception: continue
    d = dt.date(int(str(int(g['date']))[:4]), int(str(int(g['date']))[4:6]), int(str(int(g['date']))[6:8]))
    games.append(dict(s=g['season'], d=d, h=h, a=a, hs=hs, as_=as_, ot=ot, cs=(g.get('home_close_spread') if g.get('home_close_spread') is not None and abs(g['home_close_spread']) < 25 else None), os_=g.get('home_open_spread')))
games.sort(key=lambda x: (x['d'], x['h']))

# 팀별 지난 경기 기록 → 각 경기의 팀별 피로 요소
hist = {}
def feats(team, home, g):
    H = [x for x in hist.get(team, []) if x['s'] == g['s']]
    here = ARENA[g['h']]
    f = {}
    if not H: return None
    last = H[-1]; rest = (g['d'] - last['d']).days - 1
    f['b2b'] = 1 if rest == 0 else 0
    f['rest1'] = 1 if rest == 1 else 0
    f['rest3p'] = 1 if rest >= 3 else 0
    prev = ARENA[last['loc']]
    dist = km(prev, here); tz = here[2] - prev[2]
    f['km'] = dist / 1000                                  # 직전 경기장 → 오늘 (1000km 단위)
    f['b2b_km'] = f['b2b'] * dist / 1000                   # 백투백 이동 (전날 밤 비행)
    f['tz_east'] = max(0, tz) ; f['tz_west'] = max(0, -tz) # 동쪽(시계 빨라짐)·서쪽 시차
    f['ot1'] = 1 if (rest <= 1 and last['ot']) else 0      # 직전 경기 연장 (2일 안)
    f['b2b_ot'] = f['b2b'] * (1 if last['ot'] else 0)
    n4 = sum(1 for x in H if 0 < (g['d'] - x['d']).days <= 4)
    n6 = sum(1 for x in H if 0 < (g['d'] - x['d']).days <= 6)
    f['g4in6'] = 1 if n4 >= 3 or n6 >= 3 else 0            # 오늘 포함 6일 4경기(=지난 6일 3경기)
    f['g5in7'] = 1 if sum(1 for x in H if 0 < (g['d'] - x['d']).days <= 7) >= 4 else 0
    rt = 0
    for x in reversed(H):
        if x['loc'] == team_home_name(team): break
        rt += 1
    f['road_n'] = 0 if home else rt + 1                     # 원정이면 연전 몇 번째 (1 = 첫 원정)
    f['road3p'] = 1 if (not home and rt + 1 >= 3) else 0
    f['road5p'] = 1 if (not home and rt + 1 >= 5) else 0
    f['home_after_trip'] = 1 if (home and rt >= 3) else 0   # 긴 원정 끝나고 첫 홈
    k7 = 0; seq = [x for x in H if (g['d'] - x['d']).days <= 7] 
    locs = [x['loc'] for x in seq] + [g['h']]
    for i in range(1, len(locs)): k7 += km(ARENA[locs[i - 1]], ARENA[locs[i]])
    f['km7'] = k7 / 1000
    f['alt'] = 1 if (not home and here[3] >= 1000) else 0   # 고지대 원정 (덴버·유타)
    f['b2b_road'] = f['b2b'] * (0 if home else 1)
    return f
def team_home_name(team): return team
def add_hist(g):
    for t, home in ((g['h'], 1), (g['a'], 0)):
        hist.setdefault(t, []).append({'s': g['s'], 'd': g['d'], 'loc': g['h'], 'ot': g['ot']})

# 팀 레이팅 (앱과 같은 방식)
rows = []
R, N = {}, {}; cur = None
for g in games:
    if g['s'] != cur: R, N, cur = {}, {}, g['s']
    h, a = g['h'], g['a']
    fh, fa = feats(h, 1, g), feats(a, 0, g)
    nmin = min(N.get(h, 0), N.get(a, 0)); kk = .05 * (1 + 4 * max(0, 10 - nmin) / 10)
    pred = 2.5 + R.get(h, 0) - R.get(a, 0)
    m = g['hs'] - g['as_']
    bubble = g['d'] >= dt.date(2020, 7, 1) and g['d'] <= dt.date(2020, 10, 30)
    if fh and fa and nmin >= 10 and not bubble and g['s'] != 2020:
        rows.append(dict(s=g['s'], m=m, pred=pred, cs=g['cs'], fh=fh, fa=fa))
    e = m - pred; R[h] = R.get(h, 0) + kk * e / 2; R[a] = R.get(a, 0) - kk * e / 2
    N[h] = N.get(h, 0) + 1; N[a] = N.get(a, 0) + 1
    add_hist(g)
print('경기 수', len(rows))

KEYS = ['b2b', 'rest1', 'rest3p', 'km', 'b2b_km', 'tz_east', 'tz_west', 'ot1', 'b2b_ot', 'g4in6', 'g5in7', 'road3p', 'road5p', 'home_after_trip', 'km7', 'alt', 'b2b_road']
def diff(r, k): return r['fh'][k] - r['fa'][k]   # 홈 − 원정 (alt·road는 원정만 값이 있음)

# 1) 하나씩: 평균 효과 (해당 요소가 한쪽에만 있을 때 홈 관점 잔차 평균)
print('\n① 요소별 — 우리 레이팅 대비 잔차(실제 효과) / 마감 핸디 대비 잔차(시장이 못 본 것), 홈 관점 점수, 해당 경기 수')
for k in KEYS:
    xs = [(diff(r, k), r['m'] - r['pred'], (r['m'] + r['cs']) if r['cs'] is not None else None) for r in rows if diff(r, k) != 0]
    if len(xs) < 50: continue
    eff = st.mean(e * (1 if d > 0 else -1) / max(1e-9, abs(d)) for d, e, _ in xs) if k not in ('km', 'km7', 'b2b_km', 'tz_east', 'tz_west') else None
    # 연속 변수는 회귀 기울기
    num = sum(d * e for d, e, _ in xs); den = sum(d * d for d, _, _ in xs); slope = num / den
    mk = [(d, c) for d, _, c in xs if c is not None]; ms = sum(d * c for d, c in mk) / sum(d * d for d, _ in mk)
    print(f'  {k:16s} n={len(xs):5d}  실제 {slope:+.2f}점/단위   시장 대비 {ms:+.2f}')

# 2) 다중 회귀 (앞 시즌으로 맞추고 뒤 시즌 MAE) — 최소제곱
def fit(train, keys):
    X = [[diff(r, k) for k in keys] for r in train]; y = [r['m'] - r['pred'] for r in train]
    n = len(keys)
    A = [[sum(X[i][p] * X[i][q] for i in range(len(X))) + (5 if p == q else 0) for q in range(n)] for p in range(n)]
    b = [sum(X[i][p] * y[i] for i in range(len(X))) for p in range(n)]
    # 가우스 소거
    for c in range(n):
        piv = A[c][c]
        for j in range(c, n): A[c][j] /= piv
        b[c] /= piv
        for r2 in range(n):
            if r2 != c:
                fct = A[r2][c]
                for j in range(c, n): A[r2][j] -= fct * A[c][j]
                b[r2] -= fct * b[c]
    return dict(zip(keys, b))
train = [r for r in rows if r['s'] <= 2015]; test = [r for r in rows if r['s'] >= 2016]
def mae(rs, w): return st.mean(abs(r['m'] - r['pred'] - sum(w.get(k, 0) * diff(r, k) for k in w)) for r in rs)
# 지금 앱 공식 근사 (팀 컨디션 % 차 × 0.17)
def cond_now(f, home):
    p = 0
    if f['b2b']: p -= 10
    elif f['rest1']: p -= 2
    mult = 1.5 if f['b2b'] else 1 if f['rest1'] else .5
    p -= min(7, f['km'] * 1000 / 600 + (f['tz_east'] + f['tz_west']) * .7) * mult if f['km'] * 1000 >= 300 else 0
    if f['ot1']: p -= 3
    if f['g5in7']: p -= 6
    elif f['g4in6']: p -= 6
    if not home: p -= 6 if f['road5p'] else 2 if f['road3p'] else 0
    p -= min(4, f['km7'] * 1000 / 2500) if f['km7'] * 1000 >= 2500 else 0
    return p
def mae_now(rs, k=.17): return st.mean(abs(r['m'] - r['pred'] - k * (cond_now(r['fh'], 1) - cond_now(r['fa'], 0))) for r in rs)
print(f'\n② MAE (뒤 시즌 {len(test)}경기, 앞 {len(train)}경기로 맞춤)')
print(f'  피로 없음           {mae(test, {}):.3f}')
print(f'  지금 앱 공식 ×0.17  {mae_now(test):.3f}   (×0.3 {mae_now(test, .3):.3f} · ×0.5 {mae_now(test, .5):.3f})')
w_all = fit(train, KEYS)
print(f'  요소별 회귀 (전부)  {mae(test, w_all):.3f}')
for k, v in sorted(w_all.items(), key=lambda kv: -abs(kv[1])): print(f'     {k:16s} {v:+.2f}')
core = ['b2b', 'b2b_km', 'tz_east', 'ot1', 'g4in6', 'road3p', 'home_after_trip', 'alt', 'rest3p']
w_core = fit(train, core)
print(f'  핵심 요소만         {mae(test, w_core):.3f}  ', {k: round(v, 2) for k, v in w_core.items()})
# 시장 대비 (베팅 신호 여부): 회귀한 피로 차가 큰 경기만 마감 핸디 적중률
for thr in (1.5, 2.5, 3.5):
    hit = n = 0
    for r in test:
        if r['cs'] is None: continue
        adj = sum(w_core[k] * diff(r, k) for k in core)
        if abs(adj) < thr: continue
        res = r['m'] + r['cs']
        if res == 0: continue
        n += 1; hit += (res > 0) == (adj > 0)
    print(f'  피로 차 {thr}점+ 쪽 핸디 (마감): {hit}/{n} = {hit / max(1, n) * 100:.1f}%')

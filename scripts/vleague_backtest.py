# V리그 남·여 팀 결과 요소 백테스트 (2026-11-25)
# 데이터: KOVO /games/schedules?season=018..023&match=001 (scratch에 받아 둔 json 폴더를 인자로)
# 각 경기를 그 경기 전까지의 결과로만 예측 → log loss·Brier. 요소(상대 보정 레이팅·최근 5경기 폼·연승연패)의
# 계수는 앞 시즌(2021-22~2023-24)으로 고르고 뒤 시즌(2024-25·2025-26)으로 확인한다.
import json, math, sys, os, itertools

D = sys.argv[1]
sig = lambda z: 1 / (1 + math.exp(-z))
logit = lambda p: math.log(p / (1 - p))

def load():
    games = []
    for s in range(18, 24):
        fn = os.path.join(D, f's{s:03d}-001.json')
        for g in json.load(open(fn, encoding='utf-8'))['payload']:
            if g['league']['value'] != '201': continue          # 정규시즌만
            hs, as_ = g['homeTeam'].get('score'), g['awayTeam'].get('score')
            if hs is None or as_ is None or hs + as_ == 0: continue
            games.append(dict(season=s, gender=g['gender'], date=g['gameDate'], home=g['homeTeam']['name'], away=g['awayTeam']['name'], hs=hs, as_=as_))
    games.sort(key=lambda x: (x['gender'], x['season'], x['date']))
    return games

def match_from_set(p):
    q = 1 - p; return p ** 3 * (1 + 3 * q + 6 * q * q)

def run(games, P):
    """P: hca, w (시즌 세트 비율), elo (레이팅 계수), ek (레이팅 갱신), carry, form (최근 5경기), streak"""
    out = []
    for (gender, season), gs in itertools.groupby(games, key=lambda x: (x['gender'], x['season'])):
        gs = list(gs)
        if (gender, season - 1) in run.prevR and P.get('carry', 0):
            R = {t: v * P['carry'] for t, v in run.prevR[(gender, season - 1)].items()}
        else: R = {}
        SW, SL, HIST = {}, {}, {}
        for g in gs:
            h, a = g['home'], g['away']
            def ratio(t): return logit((SW.get(t, 0) + 3) / (SW.get(t, 0) + SL.get(t, 0) + 6))
            l = P['hca']
            if P.get('w'):
                p = sig(ratio(h) - ratio(a)); l += P['w'] * logit(min(.99, max(.01, match_from_set(p))))
            if P.get('elo'): l += P['elo'] * (R.get(h, 0) - R.get(a, 0))
            if P.get('form'):
                def fm(t):
                    hh = HIST.get(t, [])[-5:]
                    if not hh: return 0
                    ws = [i + 1 for i in range(len(hh))]          # 최근일수록 크게 (1..5)
                    sw = sum(w * x[0] for w, x in zip(ws, hh)); st = sum(w * (x[0] + x[1]) for w, x in zip(ws, hh))
                    return logit((sw + 3) / (st + 6))
                l += P['form'] * (fm(h) - fm(a))
            if P.get('streak'):
                def stk(t):
                    hh = HIST.get(t, []); n = 0
                    for x in reversed(hh):
                        w = x[0] > x[1]
                        if n == 0: n = 1 if w else -1
                        elif (n > 0) == w: n += 1 if w else -1
                        else: break
                    return max(-5, min(5, n))
                l += P['streak'] * (stk(h) - stk(a))
            ph = sig(l); y = 1 if g['hs'] > g['as_'] else 0
            out.append((season, gender, ph, y, min(len(HIST.get(h, [])), len(HIST.get(a, [])))))
            # 갱신
            if P.get('elo') or P.get('carry'):
                e = (g['hs'] - g['as_']) / 3 - (2 * sig(P['hca'] + P.get('elo', 1) * (R.get(h, 0) - R.get(a, 0))) - 1)
                R[h] = R.get(h, 0) + P.get('ek', .3) * e; R[a] = R.get(a, 0) - P.get('ek', .3) * e
            SW[h] = SW.get(h, 0) + g['hs']; SL[h] = SL.get(h, 0) + g['as_']
            SW[a] = SW.get(a, 0) + g['as_']; SL[a] = SL.get(a, 0) + g['hs']
            HIST.setdefault(h, []).append((g['hs'], g['as_'])); HIST.setdefault(a, []).append((g['as_'], g['hs']))
        run.prevR[(gender, season)] = R
    return out
run.prevR = {}

def score(out, seasons, minN=0):
    xs = [o for o in out if o[0] in seasons and o[4] >= minN]
    ll = -sum(math.log(o[2] if o[3] else 1 - o[2]) for o in xs) / len(xs)
    br = sum((o[2] - o[3]) ** 2 for o in xs) / len(xs)
    acc = sum((o[2] > .5) == (o[3] == 1) for o in xs) / len(xs)
    return ll, br, acc, len(xs)

if __name__ == '__main__':
    games = load()
    TRAIN, TEST, NOW = {18, 19, 20}, {21, 22}, {23}
    def fit(grid, base):
        best = None
        for vals in itertools.product(*grid.values()):
            P = dict(base, **dict(zip(grid.keys(), vals))); run.prevR = {}
            o = run(games, P); s = score(o, TRAIN)
            if best is None or s[0] < best[0][0]: best = (s, P, o)
        return best
    models = {
        '0 홈 이점만': ({'hca': [0, .1, .2, .3]}, {}),
        '1 지금 방식 (시즌 세트 비율)': ({'hca': [.1, .15, .2, .3], 'w': [.3, .5, .7, 1.0]}, {}),
        '2 상대 보정 레이팅': ({'hca': [.1, .2, .3], 'elo': [.5, 1, 1.5, 2], 'ek': [.1, .2, .3, .5]}, {}),
        '3 레이팅 + 지난 시즌 이어받기': ({'hca': [.1, .2, .3], 'elo': [1, 1.5, 2], 'ek': [.1, .2, .3], 'carry': [.3, .5, .7]}, {}),
        '4 지금 방식 + 최근 5경기 폼': ({'hca': [.15, .2, .3], 'w': [.3, .5, .7], 'form': [0, .1, .2, .3, .5]}, {}),
        '5 지금 방식 + 연승연패': ({'hca': [.15, .2, .3], 'w': [.3, .5, .7], 'streak': [-.1, -.05, 0, .05, .1]}, {}),
        '6 레이팅 + 최근 5경기 폼': ({'hca': [.2, .3], 'elo': [1, 1.5, 2], 'ek': [.1, .2, .3], 'form': [0, .1, .2, .3]}, {}),
        '7 레이팅 + 연승연패': ({'hca': [.2, .3], 'elo': [1, 1.5, 2], 'ek': [.1, .2, .3], 'streak': [-.1, -.05, 0, .05, .1]}, {}),
    }
    for name, (grid, base) in models.items():
        s, P, o = fit(grid, base)
        t = score(o, TEST); n = score(o, NOW)
        tm = score([x for x in o if x[1] == 'MALE'], TEST); tw = score([x for x in o if x[1] == 'FEMALE'], TEST)
        print(f"{name:28s} 앞 LL {s[0]:.4f} | 뒤 LL {t[0]:.4f} Brier {t[1]:.4f} 적중 {t[2]*100:.1f}% (남 {tm[0]:.4f} 여 {tw[0]:.4f}) | 2026-27 LL {n[0]:.4f} 적중 {n[2]*100:.1f}% n{n[3]} | {P}")

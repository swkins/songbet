"""nba_backtest.py 의 2단계: 조금씩 바꿔 가며(그리드) 앞 시즌으로 고르고 뒤 시즌으로 확인 + 여러 요소 합친 로지스틱 모델.
  python3 scripts/nba_backtest_tune.py [데이터 json]
"""
import os, sys, itertools
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import nba_backtest as B

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '.cache_nba_archive.json')
RAW = B.load(path)


def run(games, fn, line='close'):
    tr = [0, 0]; te = [0, 0]; seas = {}
    for g in games:
        p = fn(g)
        if p is None: continue
        r = B.grade(g, p, line)
        if r is None: continue
        box = tr if g['season'] in B.TRAIN else te
        box[0] += r; box[1] += 1
        s = seas.setdefault(g['season'], [0, 0]); s[0] += r; s[1] += 1
    pr = lambda b: b[0] / b[1] if b[1] else 0
    plus = sum(1 for v in seas.values() if v[1] >= 15 and v[0] / v[1] > .524)
    return pr(tr), tr[1], pr(te), te[1], plus, sum(1 for v in seas.values() if v[1] >= 15)


def grid(title, games, make, params, line='close', min_n=300):
    """앞 시즌 적중률(표본 min_n 이상)로 고르고 뒤 시즌 결과를 본다."""
    rows = []
    for p in params:
        fn = make(*p)
        rows.append((p,) + run(games, fn, line))
    ok = [r for r in rows if r[2] >= min_n]
    best = max(ok, key=lambda r: r[1]) if ok else None
    print(f'\n■ {title}  (조합 {len(rows)}개)')
    for r in sorted(ok, key=lambda r: -r[1])[:5]:
        print(f'   {str(r[0]):<28} 앞 {r[2]:>5} {r[1]*100:5.1f}%  뒤 {r[4]:>5} {r[3]*100:5.1f}%  시즌 {r[5]}/{r[6]}')
    if best:
        print(f'   → 앞 시즌으로 고른 것 {best[0]}: 뒤 시즌 {best[3]*100:.1f}% ({best[4]}경기)')
    return best


G = B.features(RAW)
mv, tmv, fav, dog = B.mv, B.tmv, B.fav, B.dog

grid('원정 연전 N경기째+ (쪽·정배/역배)', G,
     lambda n, side, f: (lambda g: (side if side == 'A' else 'H') if g['a_road'] >= n and (f == 'all' or (f == 'dog' and g['spc'] < 0) or (f == 'fav' and g['spc'] > 0)) else None),
     [(n, s, f) for n in (2, 3, 4, 5, 6) for s in ('A', 'H') for f in ('all', 'dog', 'fav')], min_n=200)
grid('핸디 N연속 적중 팀 반대 / 실패 팀', G,
     lambda n, mode: (lambda g: (('A' if g['h_ats_streak'] >= n else ('H' if g['a_ats_streak'] >= n else None)) if mode == 'fade'
                                 else ('H' if g['h_ats_streak'] <= -n else ('A' if g['a_ats_streak'] <= -n else None)))),
     [(n, m) for n in (2, 3, 4, 5) for m in ('fade', 'back')], min_n=200)
grid('직전 경기 핸디 대비 ±T점 팀 반대', G,
     lambda t, who: (lambda g: ('A' if (g['h_prev_ats'] or 0) >= t and who in ('h', 'both') else ('H' if (g['a_prev_ats'] or 0) >= t and who in ('a', 'both') else None))),
     [(t, w) for t in (8, 10, 12, 15, 18, 22) for w in ('h', 'a', 'both')], min_n=200)
grid('총점 이동 따라감 T점+ (오버만/언더만/둘 다)', G,
     lambda t, s: (lambda g: (('O' if tmv(g) > 0 else 'U') if abs(tmv(g)) >= t and (s == 'both' or (s == 'O') == (tmv(g) > 0)) else None)),
     [(t, s) for t in (0.5, 1, 1.5, 2, 2.5, 3, 4, 5) for s in ('both', 'O', 'U')])
grid('핸디 큰 경기 역배 (기준점 T 이상, 홈/원정)', G,
     lambda t, s: (lambda g: (dog(g) if abs(g['spc']) >= t and (s == 'all' or dog(g) == s) else None)),
     [(t, s) for t in (6, 8, 10, 12, 14) for s in ('all', 'H', 'A')])
grid('4월·3월 오버/정배', G,
     lambda m, kind: (lambda g: (('O' if kind == 'O' else fav(g)) if g['d'].month in m else None)),
     [(m, k) for m in ((4,), (3, 4), (3,)) for k in ('O', 'F')], line='close')

# 팀 폼 모델 파라미터(k·kt) 바꿔 가며 — 오픈 기준점에 건다 (이동 정보 안 씀, 아침에 거는 것과 비슷)
print('\n■ 팀 폼 모델(득실 레이팅) — 반영 속도 k·모델 비중 w·문턱 t, 오픈 기준점에 베팅')
best = None
for k in (0.03, 0.05, 0.08, 0.12):
    Gk = B.features(B.load(path), k=k, kt=0.05)
    for w in (0.3, 0.5, 0.7, 1.0):
        for t in (1, 2, 3):
            fn = lambda g, w=w, t=t: (lambda e: ('H' if e > 0 else 'A') if abs(e) >= t else None)(w * (g['model_margin'] + g['spo']))
            r = run(Gk, fn, 'open')
            if r[1] >= 300 and (best is None or r[0] > best[1][0]): best = ((k, w, t), r)
            if (w, t) in ((0.5, 1), (0.5, 2), (1.0, 3)):
                print(f'   k={k} w={w} t={t}: 앞 {r[1]} {r[0]*100:.1f}%  뒤 {r[3]} {r[2]*100:.1f}%')
print(f'   → 앞 시즌 최고 {best[0]}: 뒤 {best[1][2]*100:.1f}% ({best[1][3]}경기)')

print('\n■ 총점 폼 모델 — 반영 속도 kt·문턱 t, 오픈 총점에 베팅')
best = None
for kt in (0.02, 0.03, 0.05, 0.08):
    Gk = B.features(B.load(path), kt=kt)
    for w in (0.5, 1.0):
        for t in (2, 3, 4, 6):
            fn = lambda g, w=w, t=t: (lambda e: ('O' if e > 0 else 'U') if abs(e) >= t else None)(w * (g['model_total'] - g['to']))
            r = run(Gk, fn, 'open')
            if r[1] >= 300 and (best is None or r[0] > best[1][0]): best = ((kt, w, t), r)
            print(f'   kt={kt} w={w} t={t}: 앞 {r[1]} {r[0]*100:.1f}%  뒤 {r[3]} {r[2]*100:.1f}%')
print(f'   → 앞 시즌 최고 {best[0]}: 뒤 {best[1][2]*100:.1f}% ({best[1][3]}경기)')

# ── 여러 요소 합친 로지스틱 (앞 시즌으로 학습, 뒤 시즌 채점)
def X_ats(g):
    rd = g['h_rest'] - g['a_rest']
    return [g['spc'] / 10, mv(g), max(-2, min(2, rd)), int(g['h_rest'] == 0), int(g['a_rest'] == 0), min(g['a_road'], 6) / 6,
            int(g['h_prev_home'] is False), (g['h_prev_ats'] or 0) / 15, (g['a_prev_ats'] or 0) / 15, (g['h_prev_margin'] or 0) / 15,
            (g['a_prev_margin'] or 0) / 15, g['h_ats_streak'] / 3, g['a_ats_streak'] / 3, ((g['h_ats10'] or .5) - .5) * 2, ((g['a_ats10'] or .5) - .5) * 2,
            int(g['d'].month == 4), (g['model_margin'] + g['spc']) / 5, int(g['h_g4'] >= 3), int(g['a_g4'] >= 3)]
def X_ou(g):
    return [tmv(g), (g['model_total'] - g['tc']) / 5, abs(g['spc']) / 10, int(g['h_rest'] == 0), int(g['a_rest'] == 0), int(g['d'].month == 4),
            (g['tc'] - 210) / 10, min(g['h_ngames'], g['a_ngames']) < 10, abs(mv(g))]

def fit(X, y, lam=1.0, it=300):
    X = np.c_[np.ones(len(X)), X]; w = np.zeros(X.shape[1])
    for _ in range(it):
        p = 1 / (1 + np.exp(-X @ w)); gr = X.T @ (p - y) / len(y) + lam * np.r_[0, w[1:]] / len(y)
        H = (X.T * (p * (1 - p))) @ X / len(y) + lam * np.eye(len(w)) / len(y)
        w -= np.linalg.solve(H, gr)
    return w

for kind, Xf, ytrue in (('핸디(홈 커버)', X_ats, lambda g: g['margin'] + g['spc']), ('언오버(오버)', X_ou, lambda g: g['total'] - g['tc'])):
    tr = [g for g in G if g['season'] in B.TRAIN and ytrue(g) != 0]
    te = [g for g in G if g['season'] in B.TEST and ytrue(g) != 0]
    w = fit(np.array([Xf(g) for g in tr], float), np.array([ytrue(g) > 0 for g in tr], float), lam=50)
    def prob(gs): return 1 / (1 + np.exp(-(np.c_[np.ones(len(gs)), np.array([Xf(g) for g in gs], float)] @ w)))
    ptr, pte = prob(tr), prob(te)
    print(f'\n■ 로지스틱 {kind} — 요소 {len(Xf(tr[0]))}개, 앞 시즌 학습')
    for th in (0.51, 0.52, 0.53, 0.55, 0.57):
        for lab, gs, ps in (('앞', tr, ptr), ('뒤', te, pte)):
            sel = [(p, ytrue(g) > 0) for p, g in zip(ps, gs) if abs(p - .5) >= th - .5]
            hit = sum(1 for p, y in sel if (p > .5) == y)
            print(f'   확신 {th:.2f}+ {lab}: {len(sel):>5}경기 {hit / max(1, len(sel)) * 100:5.1f}%', end='')
        print()

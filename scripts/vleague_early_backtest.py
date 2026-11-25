# V리그 시즌 초반 가중치 백테스트 (2026-11-25 사용자 요청 — 지난 시즌은 안 쓰고, 초반엔 기록이 적으니 가중치를 다르게)
# 기준 = 상대 보정 레이팅 (hca 0.2, 갱신 0.2, 이번 시즌만 — volleyPredict.ts volleyRatings)
#  A) 초반 가속: 갱신 = 0.2 × (1 + e × (G − 두 팀 중 적은 경기 수)/G), G경기 전까지만
#  B) 초반 확신 줄이기: 레이팅 차 × n/(n + k)  (n = 두 팀 중 적은 경기 수)
# KOVO 2021-22~2025-26, 앞 3시즌으로 고르고 뒤 2시즌으로 확인. 초반(팀 8경기 전)·이후를 따로 본다.
import math, sys, itertools
sys.path.insert(0, __import__('os').path.dirname(__file__))
import vleague_backtest as vb
sig = vb.sig
games = vb.load()

def run(e=0, G=10, k=0, hca=.2, ek=.2):
    out = []
    for (gender, season), gs in itertools.groupby(games, key=lambda x: (x['gender'], x['season'])):
        R, N = {}, {}
        for g in gs:
            h, a = g['home'], g['away']
            n = min(N.get(h, 0), N.get(a, 0))
            d = R.get(h, 0) - R.get(a, 0)
            w = n / (n + k) if k else 1
            p = sig(hca + w * d)
            y = 1 if g['hs'] > g['as_'] else 0
            out.append((season, n, p, y))
            kk = ek * (1 + e * max(0, G - n) / G)
            err = (g['hs'] - g['as_']) / 3 - (2 * sig(hca + d) - 1)
            R[h] = R.get(h, 0) + kk * err; R[a] = R.get(a, 0) - kk * err
            N[h] = N.get(h, 0) + 1; N[a] = N.get(a, 0) + 1
    return out
LL = lambda xs: -sum(math.log(p if y else 1 - p) for _, _, p, y in xs) / len(xs)
def rep(name, o):
    tr = [x for x in o if x[0] <= 20]; te = [x for x in o if x[0] in (21, 22)]
    te_early = [x for x in te if x[1] < 8]; te_late = [x for x in te if x[1] >= 8]
    print(f'{name:34s} 앞 LL {LL(tr):.4f} | 뒤 LL {LL(te):.4f} (초반 8경기 전 {LL(te_early):.4f} n{len(te_early)} · 이후 {LL(te_late):.4f})')
    return LL(tr)
rep('지금 (가속·줄이기 없음)', run())
best = min(((e, G) for e in (1, 2, 3, 4, 6) for G in (5, 8, 10, 15)), key=lambda x: LL([y for y in run(e=x[0], G=x[1]) if y[0] <= 20]))
rep(f'A) 초반 가속 e={best[0]} G={best[1]}', run(e=best[0], G=best[1]))
bk = min((1, 2, 3, 5, 8), key=lambda k: LL([y for y in run(k=k) if y[0] <= 20]))
rep(f'B) 초반 확신 줄이기 k={bk}', run(k=bk))
rep(f'A+B', run(e=best[0], G=best[1], k=bk))

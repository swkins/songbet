# 세트 곡선(volleyPredict.ts CURVES)이 넣은 승률을 바꾸는지 확인 + 오늘 경기 레이팅 (2026-11-25)
import sys, math
sys.argv = sys.argv[:2]
import vleague_backtest as vb
sig, logit = vb.sig, vb.logit
CURVES = {
  'MALE': {'home': [[-1.508, 0.724], [-0.568, 0.847], [0.053, 0.934], [0.804, 0.812], [1.734, 1.001]],
           'away': [[-1.728, 1.246], [-0.58, 1.234], [-0.15, 1.161], [0.695, 0.742], [1.983, -0.062]]},
  'FEMALE': {'home': [[-1.753, 1.024], [-0.7, 1.245], [0.103, 1.093], [0.713, 1.027], [1.484, 1.429]],
             'away': [[-1.706, 0.793], [-0.666, 0.952], [-0.18, 1.147], [0.314, 1.17], [0.933, 1.476]]},
}
def curve_home(g, ph):
    fh = ph >= .5; fp = min(.97, max(.5, ph if fh else 1 - ph)); x = logit(fp)
    cum = [];
    for a, b in CURVES[g]['home' if fh else 'away']: cum.append(min(1, max(cum[-1] if cum else 0, sig(a + b * x))))
    fav = cum[2] / max(1e-9, (cum[0] + (cum[1]-cum[0]) + (cum[2]-cum[1]) + (cum[3]-cum[2]) + (cum[4]-cum[3]) + (1-cum[4])))
    return fav if fh else 1 - fav

games = vb.load()
for name, P in [('지금 방식', {'hca': .15, 'w': .5}), ('상대 보정 레이팅', {'hca': .2, 'elo': 1, 'ek': .2})]:
    vb.run.prevR = {}; o = vb.run(games, P)
    for lab, f in [('넣은 승률 그대로', lambda g, p: p), ('곡선 거친 승률', curve_home)]:
        xs = [(f(x[1], x[2]), x[3]) for x in o if x[0] in (21, 22)]
        ll = -sum(math.log(p if y else 1 - p) for p, y in xs) / len(xs)
        near = [(f(x[1], x[2]), x[3], x[2]) for x in o if x[0] in (21, 22) and .45 < x[2] < .55]
        print(f'{name} · {lab}: 뒤 시즌 LL {ll:.4f}  (45~55% 경기 {len(near)}개 평균 홈 {sum(p for p,_,_ in near)/len(near)*100:.1f}% 실제 {sum(y for _,y,_ in near)/len(near)*100:.1f}%)')

# 오늘 경기: 2026-27 여자 레이팅 (상대 보정)
vb.run.prevR = {}
P = {'hca': .2, 'elo': 1, 'ek': .2}
o = vb.run(games, P)
R = vb.run.prevR[('FEMALE', 23)]
print('2026-27 여자 레이팅 (높을수록 강함):', sorted(((round(v, 2), t) for t, v in R.items()), reverse=True))
l = P['hca'] + P['elo'] * (R['IBK기업은행'] - R['한국도로공사'])
print(f'오늘 IBK(홈) 승률 — 레이팅 모델: {sig(l)*100:.1f}%')
vb.run.prevR = {}; P3 = {'hca': .2, 'elo': 1, 'ek': .2, 'carry': .7}; vb.run(games, P3); R3 = vb.run.prevR[('FEMALE', 23)]
print(f'오늘 IBK(홈) 승률 — 레이팅 + 지난 시즌 0.7: {sig(.2 + R3["IBK기업은행"] - R3["한국도로공사"])*100:.1f}%', sorted(((round(v, 2), t) for t, v in R3.items()), reverse=True))

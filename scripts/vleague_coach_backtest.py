# V리그 감독 요소 백테스트 (2026-11-25): 감독대행 체제·감독 교체 직후가 예측보다 나빴나?
# 기준 = 상대 보정 레이팅(vleague_backtest.py 모델 2). 감독대행 기간은 뉴스 검색으로 정리 (날짜 = 대행 첫 경기 무렵).
import sys, math
import vleague_backtest as vb
sig = vb.sig
# (성별, 시즌 코드, 팀, 대행 시작, 대행 끝(정식 감독 첫 경기 전날, None = 시즌 끝))
INTERIM = [
    ('FEMALE', 18, 'IBK기업은행', '2021-11-23', '2021-12-10'),   # 서남원 경질 → 김사니 대행 → 김호철 선임
    ('MALE', 21, 'KB손해보험', '2024-10-19', '2025-01-05'),       # 리베라 개막 전 사퇴 → 블랑코 대행 → 카르발류 (날짜 근사)
    ('FEMALE', 22, 'IBK기업은행', '2025-11-23', None),            # 김호철 사퇴 → 여오현 대행
    ('MALE', 22, '삼성화재', '2025-12-20', None),                 # 김상우 사퇴 → 고준용 대행
    ('MALE', 22, '우리카드', '2025-12-31', None),                 # 파에스 → 박철우 대행
    ('MALE', 22, 'KB손해보험', '2025-12-31', None),               # 카르발류 → 하현용 대행
]
games = vb.load()
P = {'hca': .2, 'elo': 1, 'ek': .2}
vb.run.prevR = {}
out = vb.run(games, P)
GG = [g for g in games]
rows = []
for g, o in zip(GG, out):
    for side, t in (('h', g['home']), ('a', g['away'])):
        for gen, s, team, a, b in INTERIM:
            if g['gender'] == gen and g['season'] == s and t == team and g['date'] >= a and (b is None or g['date'] <= b):
                p = o[2] if side == 'h' else 1 - o[2]; y = o[3] if side == 'h' else 1 - o[3]
                rows.append((team, s, g['date'], p, y))
def show(xs, lab):
    if not xs: print(lab, '없음'); return
    ep, ay = sum(x[3] for x in xs) / len(xs), sum(x[4] for x in xs) / len(xs)
    se = math.sqrt(ep * (1 - ep) / len(xs))
    print(f'{lab}: {len(xs)}경기 · 예측 승률 {ep*100:.1f}% · 실제 {ay*100:.1f}% · 차 {(ay-ep)*100:+.1f}%p (오차 범위 ±{1.96*se*100:.1f}%p)')
show(rows, '감독대행 체제 전체')
first = []
seen = {}
for r in sorted(rows, key=lambda r: (r[0], r[1], r[2])):
    k = (r[0], r[1]); seen[k] = seen.get(k, 0) + 1
    if seen[k] <= 5: first.append(r)
show(first, '교체 직후 5경기')
show([r for r in rows if r not in first], '대행 6경기째부터')
for team, s in sorted({(r[0], r[1]) for r in rows}):
    show([r for r in rows if r[0] == team and r[1] == s], f'  {2003 + s}-{(s + 4) % 100:02d} {team}')

# 사용자 의견 (2026-11-25): 감독이 바뀐 직후는 '방향은 모르는 위험' → 예측 확신을 줄인다(50% 쪽으로),
# 바뀐 뒤 결과는 분위기 변화라 레이팅에 더 크게 반영(교체 뒤 N경기 동안 그 팀 갱신 속도 ×m).
def run_coach(shrink, nShrink, boost, nBoost):
    out = []; ll = 0; cnt = 0
    for (gender, season), gs in __import__('itertools').groupby(games, key=lambda x: (x['gender'], x['season'])):
        R = {}; since = {}
        for g in gs:
            h, a = g['home'], g['away']
            for t in (h, a):
                for gen, s, team, st, en in INTERIM:
                    if gen == gender and s == season and team == t and g['date'] >= st and t not in since: since[t] = 0
            l = .2 + R.get(h, 0) - R.get(a, 0); p = sig(l)
            risky = any(t in since and since[t] < nShrink for t in (h, a))
            if risky: p = .5 + (p - .5) * (1 - shrink)
            y = 1 if g['hs'] > g['as_'] else 0
            if season in (21, 22) or True: out.append((season, p, y, risky))
            e = (g['hs'] - g['as_']) / 3 - (2 * sig(l) - 1)
            kh = .2 * (boost if h in since and since[h] < nBoost else 1); ka = .2 * (boost if a in since and since[a] < nBoost else 1)
            R[h] = R.get(h, 0) + kh * e; R[a] = R.get(a, 0) - ka * e
            for t in (h, a):
                if t in since: since[t] += 1
    return out
def LL(xs): return -sum(math.log(p if y else 1 - p) for _, p, y, _ in xs) / len(xs)
base = run_coach(0, 0, 1, 0)
print(f'\n전체 5시즌 LL 기준 {LL(base):.5f} · 교체 관련 경기만 기준 {LL([x for x in base if x[3] or True][:0] or base):.5f}')
for shrink, n in [(.2, 3), (.3, 3), (.5, 3), (.3, 5), (.5, 5)]:
    o = run_coach(shrink, n, 1, 0); r = [x for x in o if x[3]]; rb = [b for b, x in zip(base, o) if x[3]]
    print(f'교체 뒤 {n}경기 확신 {int(shrink*100)}% 줄임: 해당 {len(r)}경기 LL {LL(rb):.4f} → {LL(r):.4f}')
for boost, n in [(1.5, 5), (2, 5), (2, 10), (3, 5)]:
    o = run_coach(0, 0, boost, n)
    print(f'교체 뒤 {n}경기 결과 ×{boost} 반영: 전체 LL {LL(base):.5f} → {LL(o):.5f}')

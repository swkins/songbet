"""NBA 예상 스코어 모델 검증 (2026-11-21 사용자 요청 — 점수차가 너무 작아 플핸만 나온다, 더 정밀하게).

모델 (경기마다 그 전 경기로만):
  팀 레이팅 R(득실, 상대 보정) · 공격 O · 수비 D 를 경기 끝날 때마다 오차 × k 만큼 고친다 (지수 가중 = 최근 경기 비중 큼).
  새 시즌은 지난 시즌 값 × carry 에서 시작.
  예상 마진 = 홈 이점 + R홈 − R원정 (+ 휴식 보정) · 예상 총점 = 리그 평균 + O홈 + D원정 + O원정 + D홈.
평가: 실제와 평균 오차(MAE), 보정 기울기(실제 = a + b × 예상, b≈1이면 크기가 맞음), 예상 마진 퍼짐, 시장 기준점과 비교.
  python3 scripts/nba_score_model.py <2011-21 json> <2025-26 json> <2026-27 json>
"""
import json, sys, math
from collections import defaultdict
from datetime import date
import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
import nba_backtest as B


def ko2en():
    import re
    src = open(__file__.rsplit('/', 2)[0] + '/src/lib/gameSchedule.ts').read()
    m = {}
    for en, short, full in re.findall(r"'([A-Za-z0-9 .]+)':\s*\['([^']+)',\s*'([^']+)'\]", src):
        m[full] = en; m[full.replace(' ', '')] = en
    m.update({'LA 레이커스': 'Los Angeles Lakers', '피닉스 선즈': 'Phoenix Suns', '필라델피아 세븐티식서스': 'Philadelphia 76ers', '골든스테이트 워리어스': 'Golden State Warriors',
              '오클라호마시티 선더': 'Oklahoma City Thunder', 'LA 클리퍼스': 'LA Clippers', '포틀랜드 트레일블레이저스': 'Portland Trail Blazers'})
    return m


def load_all(p_old, p_2526, p_2627):
    old = B.load(p_old)
    G = [dict(season=g['season'], d=g['d'], h=g['h'], a=g['a'], hs=g['hs'], as_=g['as_'], spc=g['spc'], tc=g['tc']) for g in old]
    k2e = ko2en()
    rows = json.load(open(p_2526))
    miss = set()
    for r in rows.values():
        h, a = k2e.get(r[2], r[2]), k2e.get(r[1], r[1])
        if h == r[2]: miss.add(r[2])
        G.append(dict(season=2025, d=date.fromisoformat(r[0]['date']), h=h, a=a, hs=int(r[4]), as_=int(r[3]), spc=r[7], tc=None))
    for r in json.load(open(p_2627)):
        G.append(dict(season=2026, d=date.fromisoformat(r[0]), h=r[1], a=r[2], hs=r[3], as_=r[4], spc=None, tc=None))
    if miss: print('이름 못 맞춤', miss)
    G.sort(key=lambda g: (g['d'], g['h']))
    return G


def run(G, k=0.07, kt=0.05, carry=0.6, hca=2.5, rest_k=0.0, b2b=0.0, early=0.0):
    R = defaultdict(float); O = defaultdict(float); D = defaultdict(float); last = {}; n = defaultdict(int)
    avg = 222.0; season = None
    for g in G:
        if g['season'] != season:
            if season is not None and g['season'] - season > 1:   # 시즌 사이가 비면 (2021 → 2025) 처음부터
                R.clear(); O.clear(); D.clear()
            season = g['season']
            for t in list(R): R[t] *= carry
            for t in list(O): O[t] *= carry; D[t] *= carry
            last.clear(); n.clear()
        h, a = g['h'], g['a']
        hr = min(3, (g['d'] - last[h]).days - 1) if h in last else 3
        ar = min(3, (g['d'] - last[a]).days - 1) if a in last else 3
        adj = rest_k * (hr - ar) + b2b * ((ar == 0) - (hr == 0))
        g['pm'] = hca + R[h] - R[a] + adj
        g['pt'] = avg + O[h] + D[a] + O[a] + D[h]
        g['n_min'] = min(n[h], n[a])
        m = g['hs'] - g['as_']; tot = g['hs'] + g['as_']
        kk = k * (1 + early * max(0, 10 - min(n[h], n[a])) / 10)
        e = m - g['pm']; R[h] += kk * e / 2; R[a] -= kk * e / 2
        eh = g['hs'] - (avg / 2 + O[h] + D[a] + hca / 2); ea = g['as_'] - (avg / 2 + O[a] + D[h] - hca / 2)
        O[h] += kt * eh; D[a] += kt * eh; O[a] += kt * ea; D[h] += kt * ea
        avg += 0.01 * (tot - avg)
        last[h] = last[a] = g['d']; n[h] += 1; n[a] += 1
    return G


def score(G, seasons, minn=0):
    xs = [g for g in G if g['season'] in seasons and g['n_min'] >= minn]
    pm = np.array([g['pm'] for g in xs]); act = np.array([g['hs'] - g['as_'] for g in xs], float)
    b, a = np.polyfit(pm, act, 1)
    out = dict(n=len(xs), mae=np.mean(np.abs(act - pm)), slope=b, sd=np.std(pm))
    mk = [g for g in xs if g['spc'] is not None]
    if mk:
        mm = np.array([-g['spc'] for g in mk]); aa = np.array([g['hs'] - g['as_'] for g in mk], float); pp = np.array([g['pm'] for g in mk])
        out.update(mkt_mae=np.mean(np.abs(aa - mm)), mkt_sd=np.std(mm), mae_same=np.mean(np.abs(aa - pp)), corr_mkt=np.corrcoef(pp, mm)[0, 1],
                   dog_share=np.mean([(p + (-m)) * 0 + ((p > m) != (m > 0)) for p, m in zip(pp, mm)]))
        # 모델 픽이 역배(플핸) 쪽인 비율
        out['plus_pick'] = np.mean([((p - m) > 0) != (m > 0) if m != 0 else 0.5 for p, m in zip(pp, mm)])
        hit = [((aa_ - m) > 0) == ((p - m) > 0) for p, m, aa_ in zip(pp, mm, aa) if aa_ != m and p != m]
        out['ats'] = np.mean(hit)
    tk = [g for g in xs if g.get('tc')]
    if tk:
        pt = np.array([g['pt'] for g in tk]); at = np.array([g['hs'] + g['as_'] for g in tk], float); tc = np.array([g['tc'] for g in tk])
        out.update(t_mae=np.mean(np.abs(at - pt)), t_mkt_mae=np.mean(np.abs(at - tc)), t_slope=np.polyfit(pt, at, 1)[0])
    return out


def fmt(o):
    s = f"n {o['n']:>5} | 마진 MAE {o['mae']:.2f} 기울기 {o['slope']:.2f} 퍼짐 {o['sd']:.1f}"
    if 'mkt_mae' in o: s += f" | 시장 MAE {o['mkt_mae']:.2f} 퍼짐 {o['mkt_sd']:.1f} · 상관 {o['corr_mkt']:.2f} · 플핸 픽 {o['plus_pick']*100:.0f}% · 핸디 {o['ats']*100:.1f}%"
    if 't_mae' in o: s += f" | 총점 MAE {o['t_mae']:.2f} (시장 {o['t_mkt_mae']:.2f}) 기울기 {o['t_slope']:.2f}"
    return s


if __name__ == '__main__':
    G = load_all(*sys.argv[1:4])
    OLD_TR, OLD_TE = range(2011, 2017), range(2017, 2022)
    print('■ 반영 속도 k · 시즌 이월 carry · 시즌 초 가속 early (앞 2011-16으로 고름)')
    best = None
    for k in (0.03, 0.05, 0.07, 0.1, 0.14):
        for carry in (0.4, 0.6, 0.8):
            for early in (0, 1, 2):
                p = dict(k=k, carry=carry, early=early)
                run(G, **p); o = score(G, OLD_TR, 0)
                if best is None or o['mae'] < best[0]['mae']: best = (o, p)
    print('  최적', best[1], fmt(best[0]))
    base = dict(best[1])
    for hca in (2.0, 2.5, 3.0):
        for rk in (0, 0.5, 1.0):
            for bb in (0, 1.0, 2.0):
                p = dict(base, hca=hca, rest_k=rk, b2b=bb)
                run(G, **p); o = score(G, OLD_TR, 0)
                if o['mae'] < best[0]['mae']: best = (o, p)
    print('  + 홈·휴식', best[1], fmt(best[0]))
    p = dict(best[1])
    bt = None
    for kt in (0.02, 0.03, 0.05, 0.08):
        run(G, **dict(p, kt=kt)); o = score(G, OLD_TR, 0); print(f'  kt {kt}:', fmt(o))
        if bt is None or o['t_mae'] < bt[0]: bt = (o['t_mae'], kt)
    p['kt'] = bt[1]
    run(G, **p)
    print('\n■ 확인 (앞에서 고른 값 그대로)', p)
    print('  2017-21       ', fmt(score(G, OLD_TE, 0)))
    print('  2025-26       ', fmt(score(G, [2025], 0)))
    print('  2025-26 10경기+', fmt(score(G, [2025], 10)))
    print('  2026-27 (지금) ', fmt(score(G, [2026], 0)))

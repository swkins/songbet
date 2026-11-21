"""NBA 핸디·언오버 모의베팅 백테스트 (수십 가지 방법).

데이터: sportsbookreviewsonline 아카이브(GitHub flancast90/sportsbookreview-scraper,
2011-12 ~ 2021-22 정규시즌, 팀·날짜·오픈/마감 핸디·총점·마감 머니라인).
  python3 scripts/nba_backtest.py [데이터 json 경로]
없으면 받아 온다. 결과는 표로 출력.

원칙 (CLAUDE.md 백테스트 방식)
- 모델(팀 레이팅)은 그 경기 전까지의 결과로만 만든다 (미래 정보 없음).
- 조건·파라미터는 앞 시즌(2011-12~2016-17)으로 고르고 뒤 시즌(2017-18~2021-22)으로 확인한다.
- 라인 이동 신호(오픈→마감)는 마감 기준점으로 채점한다 (이동을 본 뒤 거는 것이라 오픈 기준점으로 채점하면 미래 정보).
- 손익분기: 배당 1.91(-110) 52.4%, 1.94(마진 약 3%) 51.5%.
"""
import json, math, os, sys, urllib.request
from collections import defaultdict
from datetime import date

URL = 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/nba_archive_10Y.json'
TRAIN = range(2011, 2017)   # 시즌 시작 해
TEST = range(2017, 2022)
FIX = {'NewJersey': 'Nets', 'Golden State': 'Warriors'}


def load(path):
    if not os.path.exists(path):
        urllib.request.urlretrieve(URL, path)
    raw = json.load(open(path))
    games = []
    for x in raw:
        h, a = FIX.get(str(x['home_team']), str(x['home_team'])), FIX.get(str(x['away_team']), str(x['away_team']))
        if h == '0' or a == '0':
            continue
        try:
            hs, as_ = int(x['home_final']), int(x['away_final'])
        except (TypeError, ValueError):
            continue
        sp_o, sp_c, t_o, t_c = x['home_open_spread'], x['home_close_spread'], x['open_over_under'], x['close_over_under']
        if abs(sp_c) > 25 or abs(sp_o) > 25 or not (170 <= t_c <= 260) or not (170 <= t_o <= 260) or abs(sp_c - sp_o) > 8 or abs(t_c - t_o) > 15:
            continue
        d = int(x['date'])
        games.append(dict(season=int(x['season']), d=date(d // 10000, d // 100 % 100, d % 100), h=h, a=a, hs=hs, as_=as_,
                          spo=sp_o, spc=sp_c, to=t_o, tc=t_c, mlh=x['home_close_ml'], mla=x['away_close_ml']))
    games.sort(key=lambda g: (g['d'], g['h']))
    # 플레이오프 제외: 시즌마다 하루 6경기 이상 열린 마지막 날까지만 정규시즌
    per_day = defaultdict(int)
    for g in games:
        per_day[(g['season'], g['d'])] += 1
    last = {}
    for (s, d), n in per_day.items():
        if n >= 6 and (s not in last or d > last[s]):
            last[s] = d
    return [g for g in games if g['d'] <= last[g['season']]]


def features(games, k=0.06, kt=0.05, carry=0.65):
    """경기 전 정보만으로 특징을 붙인다."""
    last = {}            # team -> (date, home?, margin, ats_margin, team_spread)
    hist = defaultdict(list)  # team -> list of (date, home?)
    streak_ats = defaultdict(int); streak_win = defaultdict(int); road = defaultdict(int)
    r = defaultdict(float); off = defaultdict(float); de = defaultdict(float)
    season = None; avg_tot = 205.0; hca = 2.5; ats_hist = defaultdict(list); mkt_err = defaultdict(list)
    for g in games:
        if g['season'] != season:
            season = g['season']
            for t in list(r): r[t] *= carry
            for t in list(off): off[t] *= carry; de[t] *= carry
            for t in list(streak_ats): streak_ats[t] = 0; streak_win[t] = 0
            last.clear(); hist.clear(); road.clear(); ats_hist.clear()
        h, a = g['h'], g['a']
        for side, t in (('h', h), ('a', a)):
            lp = last.get(t)
            g[side + '_rest'] = min(4, (g['d'] - lp[0]).days - 1) if lp else 4
            g[side + '_prev_home'] = lp[1] if lp else None
            g[side + '_prev_margin'] = lp[2] if lp else None
            g[side + '_prev_ats'] = lp[3] if lp else None
            g[side + '_g4'] = 1 + sum(1 for d, _ in hist[t] if (g['d'] - d).days <= 3)
            g[side + '_g7'] = 1 + sum(1 for d, _ in hist[t] if (g['d'] - d).days <= 6)
            g[side + '_ats_streak'] = streak_ats[t]
            g[side + '_win_streak'] = streak_win[t]
            g[side + '_ats10'] = sum(ats_hist[t][-10:]) / len(ats_hist[t][-10:]) if len(ats_hist[t]) >= 5 else None
            g[side + '_ngames'] = len(hist[t])
        g['a_road'] = road[a] + 1
        g['model_margin'] = r[h] - r[a] + hca
        g['model_total'] = avg_tot + off[h] + de[a] + off[a] + de[h]
        g['mkt_margin'] = -g['spc']
        # 결과
        m = g['hs'] - g['as_']; tot = g['hs'] + g['as_']
        g['margin'] = m; g['total'] = tot
        # 업데이트
        err = m - g['model_margin']; r[h] += k * err; r[a] -= k * err
        ph = avg_tot / 2 + off[h] + de[a] + hca / 2; pa = avg_tot / 2 + off[a] + de[h] - hca / 2
        eh = g['hs'] - ph; ea = g['as_'] - pa
        off[h] += kt * eh; de[a] += kt * eh; off[a] += kt * ea; de[h] += kt * ea
        avg_tot += 0.01 * (tot - avg_tot)
        ats_h = m + g['spc']; ats_a = -ats_h
        for t, home, mm, at, sp in ((h, True, m, ats_h, g['spc']), (a, False, -m, ats_a, -g['spc'])):
            last[t] = (g['d'], home, mm, at, sp); hist[t].append((g['d'], home))
            if at > 0: streak_ats[t] = streak_ats[t] + 1 if streak_ats[t] > 0 else 1
            elif at < 0: streak_ats[t] = streak_ats[t] - 1 if streak_ats[t] < 0 else -1
            streak_win[t] = (streak_win[t] + 1 if streak_win[t] > 0 else 1) if mm > 0 else (streak_win[t] - 1 if streak_win[t] < 0 else -1)
            if at != 0: ats_hist[t].append(1 if at > 0 else 0)
        road[h] = 0; road[a] += 1
    return games


def grade(g, pick, line='close'):
    """pick: 'H','A','O','U' -> 1 적중, 0 미적중, None 적특"""
    if pick in ('H', 'A'):
        sp = g['spc'] if line == 'close' else g['spo']
        v = g['margin'] + sp
        if v == 0: return None
        return int((v > 0) == (pick == 'H'))
    t = g['tc'] if line == 'close' else g['to']
    if g['total'] == t: return None
    return int((g['total'] > t) == (pick == 'O'))


def mv(g): return g['spc'] - g['spo']          # 음수 = 홈 쪽으로 이동(홈이 더 정배)
def tmv(g): return g['tc'] - g['to']           # 양수 = 오버 쪽으로 이동
def fav(g): return 'H' if g['spc'] < 0 else ('A' if g['spc'] > 0 else None)
def dog(g): f = fav(g); return None if f is None else ('A' if f == 'H' else 'H')
def opp(p): return {'H': 'A', 'A': 'H', 'O': 'U', 'U': 'O'}[p]
def edge(g): return g['model_margin'] - g['mkt_margin']
def tedge(g): return g['model_total'] - g['tc']


def S(name, fn, kind='ats', line='close'):
    return dict(name=name, fn=fn, kind=kind, line=line)


def strategies():
    L = []
    # ── 핸디: 기본
    L += [S('전 경기 홈', lambda g: 'H'), S('전 경기 원정', lambda g: 'A'),
          S('전 경기 정배', fav), S('전 경기 역배', dog),
          S('홈 역배', lambda g: 'H' if g['spc'] > 0 else None), S('원정 역배', lambda g: 'A' if g['spc'] < 0 else None),
          S('홈 정배', lambda g: 'H' if g['spc'] < 0 else None), S('원정 정배', lambda g: 'A' if g['spc'] > 0 else None),
          S('큰 정배(10점+) 역배', lambda g: dog(g) if abs(g['spc']) >= 10 else None),
          S('큰 정배(10점+) 정배', lambda g: fav(g) if abs(g['spc']) >= 10 else None),
          S('접전(3점 이하) 홈', lambda g: 'H' if abs(g['spc']) <= 3 else None),
          S('홈 역배 +7.5 이상', lambda g: 'H' if g['spc'] >= 7.5 else None),
          S('원정 역배 +7.5 이상', lambda g: 'A' if g['spc'] <= -7.5 else None)]
    # ── 핸디: 배당(기준점) 흐름
    for t in (0.5, 1, 1.5, 2, 3):
        L.append(S(f'라인 이동 따라감 {t}점+', lambda g, t=t: ('H' if mv(g) < 0 else 'A') if abs(mv(g)) >= t else None))
        L.append(S(f'라인 이동 반대 {t}점+', lambda g, t=t: ('A' if mv(g) < 0 else 'H') if abs(mv(g)) >= t else None))
    L += [S('라인 고정 홈', lambda g: 'H' if mv(g) == 0 else None), S('라인 고정 원정', lambda g: 'A' if mv(g) == 0 else None),
          S('라인 고정 역배', lambda g: dog(g) if mv(g) == 0 else None),
          S('정배 쪽으로 2점+ 이동 → 역배', lambda g: dog(g) if fav(g) and ((fav(g) == 'H' and mv(g) <= -2) or (fav(g) == 'A' and mv(g) >= 2)) else None),
          S('역배 쪽으로 1.5점+ 이동 → 역배', lambda g: dog(g) if fav(g) and ((fav(g) == 'H' and mv(g) >= 1.5) or (fav(g) == 'A' and mv(g) <= -1.5)) else None),
          S('정배가 바뀜(오픈 정배 ≠ 마감 정배) → 마감 정배', lambda g: fav(g) if g['spo'] * g['spc'] < 0 else None)]
    # ── 핸디: 일정·휴식
    rd = lambda g: g['h_rest'] - g['a_rest']
    L += [S('휴식 차 +2 이상 홈', lambda g: 'H' if rd(g) >= 2 else None),
          S('휴식 차 -2 이하 원정', lambda g: 'A' if rd(g) <= -2 else None),
          S('휴식 우위 팀(1일+)', lambda g: ('H' if rd(g) > 0 else 'A') if rd(g) != 0 else None),
          S('홈 백투백 → 원정', lambda g: 'A' if g['h_rest'] == 0 else None),
          S('원정 백투백 → 홈', lambda g: 'H' if g['a_rest'] == 0 else None),
          S('원정 백투백 & 홈 휴식 1+ → 홈', lambda g: 'H' if g['a_rest'] == 0 and g['h_rest'] >= 1 else None),
          S('홈 백투백 & 원정 휴식 1+ → 원정', lambda g: 'A' if g['h_rest'] == 0 and g['a_rest'] >= 1 else None),
          S('둘 다 백투백 → 홈', lambda g: 'H' if g['h_rest'] == 0 and g['a_rest'] == 0 else None),
          S('홈 4일 3경기째 → 원정', lambda g: 'A' if g['h_g4'] >= 3 else None),
          S('원정 4일 3경기째 → 홈', lambda g: 'H' if g['a_g4'] >= 3 else None),
          S('원정 연전 4경기째+ → 홈', lambda g: 'H' if g['a_road'] >= 4 else None),
          S('원정 연전 4경기째+ → 원정', lambda g: 'A' if g['a_road'] >= 4 else None),
          S('원정 마치고 첫 홈경기 → 원정', lambda g: 'A' if g['h_prev_home'] is False else None),
          S('원정 마치고 첫 홈경기 → 홈', lambda g: 'H' if g['h_prev_home'] is False else None)]
    # ── 핸디: 직전 경기·연승연패
    L += [S('원정팀 직전 20점+ 대승 → 원정', lambda g: 'A' if (g['a_prev_margin'] or 0) >= 20 else None),
          S('원정팀 직전 20점+ 대승 → 홈', lambda g: 'H' if (g['a_prev_margin'] or 0) >= 20 else None),
          S('홈팀 직전 20점+ 대패 → 홈', lambda g: 'H' if (g['h_prev_margin'] or 0) <= -20 else None),
          S('원정팀 직전 20점+ 대패 → 원정', lambda g: 'A' if (g['a_prev_margin'] or 0) <= -20 else None),
          S('직전 핸디 15점+ 초과 팀 반대', lambda g: ('A' if (g['h_prev_ats'] or 0) >= 15 else ('H' if (g['a_prev_ats'] or 0) >= 15 else None))),
          S('직전 핸디 15점+ 미달 팀', lambda g: ('H' if (g['h_prev_ats'] or 0) <= -15 else ('A' if (g['a_prev_ats'] or 0) <= -15 else None))),
          S('핸디 3연속 적중 팀 반대', lambda g: ('A' if g['h_ats_streak'] >= 3 else ('H' if g['a_ats_streak'] >= 3 else None))),
          S('핸디 3연속 실패 팀', lambda g: ('H' if g['h_ats_streak'] <= -3 else ('A' if g['a_ats_streak'] <= -3 else None))),
          S('5연승 팀 반대', lambda g: ('A' if g['h_win_streak'] >= 5 else ('H' if g['a_win_streak'] >= 5 else None))),
          S('5연패 팀', lambda g: ('H' if g['h_win_streak'] <= -5 else ('A' if g['a_win_streak'] <= -5 else None))),
          S('최근 10경기 핸디 70%+ 팀 반대', lambda g: ('A' if (g['h_ats10'] or 0) >= .7 else ('H' if (g['a_ats10'] or 0) >= .7 else None))),
          S('최근 10경기 핸디 30% 이하 팀', lambda g: ('H' if (g['h_ats10'] if g['h_ats10'] is not None else 1) <= .3 else ('A' if (g['a_ats10'] if g['a_ats10'] is not None else 1) <= .3 else None)))]
    # ── 핸디: 시기
    L += [S('4월 정배', lambda g: fav(g) if g['d'].month == 4 else None), S('4월 역배', lambda g: dog(g) if g['d'].month == 4 else None),
          S('시즌 초(팀 10경기 전) 역배', lambda g: dog(g) if min(g['h_ngames'], g['a_ngames']) < 10 else None),
          S('3~4월 홈 역배 → 원정', lambda g: 'A' if g['d'].month in (3, 4) and g['spc'] > 0 else None)]
    # ── 핸디: 팀 폼 모델(득실 레이팅) vs 시장 — 반반 등
    for t in (2, 3, 4, 6):
        L.append(S(f'모델(폼) vs 시장 차이 {t}점+ 모델 쪽', lambda g, t=t: ('H' if edge(g) > 0 else 'A') if abs(edge(g)) >= t else None))
        L.append(S(f'모델(폼) vs 시장 차이 {t}점+ 시장 반대(역)', lambda g, t=t: ('A' if edge(g) > 0 else 'H') if abs(edge(g)) >= t else None))
    L += [S('폼 반 + 시장 반 → 모델 쪽 & 라인도 같은 쪽 이동',
            lambda g: ('H' if edge(g) > 0 else 'A') if abs(edge(g)) >= 2 and mv(g) != 0 and ((edge(g) > 0) == (mv(g) < 0)) else None),
          S('폼 쪽 & 휴식 우위 겹침', lambda g: ('H' if edge(g) > 0 else 'A') if abs(edge(g)) >= 2 and rd(g) != 0 and ((edge(g) > 0) == (rd(g) > 0)) else None)]
    # ── 언오버: 기본·흐름
    L += [S('전 경기 오버', lambda g: 'O', 'ou'), S('전 경기 언더', lambda g: 'U', 'ou')]
    for t in (1, 2, 3, 4):
        L.append(S(f'총점 이동 따라감 {t}점+', lambda g, t=t: ('O' if tmv(g) > 0 else 'U') if abs(tmv(g)) >= t else None, 'ou'))
        L.append(S(f'총점 이동 반대 {t}점+', lambda g, t=t: ('U' if tmv(g) > 0 else 'O') if abs(tmv(g)) >= t else None, 'ou'))
    L += [S('총점 고정 언더', lambda g: 'U' if tmv(g) == 0 else None, 'ou'), S('총점 고정 오버', lambda g: 'O' if tmv(g) == 0 else None, 'ou'),
          S('핸디 10점+ 경기 언더', lambda g: 'U' if abs(g['spc']) >= 10 else None, 'ou'),
          S('핸디 10점+ 경기 오버', lambda g: 'O' if abs(g['spc']) >= 10 else None, 'ou'),
          S('백투백 팀 있는 경기 언더', lambda g: 'U' if g['h_rest'] == 0 or g['a_rest'] == 0 else None, 'ou'),
          S('둘 다 백투백 오버', lambda g: 'O' if g['h_rest'] == 0 and g['a_rest'] == 0 else None, 'ou'),
          S('4월 오버', lambda g: 'O' if g['d'].month == 4 else None, 'ou'), S('4월 언더', lambda g: 'U' if g['d'].month == 4 else None, 'ou'),
          S('시즌 초 오버(팀 10경기 전)', lambda g: 'O' if min(g['h_ngames'], g['a_ngames']) < 10 else None, 'ou'),
          S('라인 이동 2점+ 경기 언더', lambda g: 'U' if abs(mv(g)) >= 2 else None, 'ou')]
    for t in (3, 5, 8):
        L.append(S(f'총점 모델 vs 기준점 {t}점+ 모델 쪽', lambda g, t=t: ('O' if tedge(g) > 0 else 'U') if abs(tedge(g)) >= t else None, 'ou'))
        L.append(S(f'총점 모델 vs 기준점 {t}점+ 반대', lambda g, t=t: ('U' if tedge(g) > 0 else 'O') if abs(tedge(g)) >= t else None, 'ou'))
    L += [S('총점 모델 쪽 & 총점 이동 같은 쪽', lambda g: ('O' if tedge(g) > 0 else 'U') if abs(tedge(g)) >= 3 and tmv(g) != 0 and ((tedge(g) > 0) == (tmv(g) > 0)) else None, 'ou')]
    # ── 오픈 기준점에 거는 버전(이동 정보 안 씀)
    L += [S('[오픈] 전 경기 홈', lambda g: 'H', 'ats', 'open'), S('[오픈] 전 경기 원정', lambda g: 'A', 'ats', 'open'),
          S('[오픈] 모델 차이 3점+ 모델 쪽', lambda g: ('H' if g['model_margin'] + g['spo'] > 0 else 'A') if abs(g['model_margin'] + g['spo']) >= 3 else None, 'ats', 'open'),
          S('[오픈] 총점 모델 5점+ 모델 쪽', lambda g: ('O' if g['model_total'] > g['to'] else 'U') if abs(g['model_total'] - g['to']) >= 5 else None, 'ou', 'open'),
          S('[오픈] 전 경기 언더', lambda g: 'U', 'ou', 'open')]
    return L


def evaluate(games, s):
    res = defaultdict(lambda: [0, 0])  # season -> [hit, n]
    for g in games:
        p = s['fn'](g)
        if p is None: continue
        r = grade(g, p, s['line'])
        if r is None: continue
        res[g['season']][0] += r; res[g['season']][1] += 1
    def agg(seasons):
        h = sum(res[x][0] for x in seasons); n = sum(res[x][1] for x in seasons)
        return h, n
    out = {}
    for lab, ss in (('train', TRAIN), ('test', TEST), ('all', list(TRAIN) + list(TEST))):
        h, n = agg(ss)
        out[lab] = (h, n, h / n if n else 0)
    out['plus_seasons'] = sum(1 for x in res if res[x][1] >= 20 and res[x][0] / res[x][1] > 0.524)
    out['seasons'] = sum(1 for x in res if res[x][1] >= 20)
    out['by_season'] = {x: res[x] for x in sorted(res)}
    return out


def roi(p, odds): return p * odds - 1


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '.cache_nba_archive.json')
    games = features(load(path))
    print(f'경기 {len(games)}  ({min(g["season"] for g in games)}-{max(g["season"] for g in games) + 1})')
    rows = []
    for s in strategies():
        e = evaluate(games, s)
        rows.append((s, e))
    def line(s, e):
        tr, te = e['train'], e['test']
        return (f"{s['name'][:40]:<40} {'핸디' if s['kind']=='ats' else '언오버'} | 앞 {tr[1]:>5} {tr[2]*100:5.1f}% | 뒤 {te[1]:>5} {te[2]*100:5.1f}%"
                f" ROI(1.94) {roi(te[2],1.94)*100:+5.1f}% | 52.4%↑ 시즌 {e['plus_seasons']}/{e['seasons']}")
    for s, e in rows:
        print(line(s, e))
    json.dump([dict(name=s['name'], kind=s['kind'], line=s['line'], train=e['train'], test=e['test'], plus=e['plus_seasons'], seasons=e['seasons'],
                    by_season=e['by_season']) for s, e in rows], open(os.environ.get('OUT', '/dev/null'), 'w'), ensure_ascii=False)
    return games


if __name__ == '__main__':
    main()

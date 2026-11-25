# V리그 지난 시즌 체급(player_base) SQL 만들기 (2026-11-25) — supabase/vb_tier.sql의 균형 점수와 같은 계산
# 사용: python scripts/vleague_base_insert.py <선수 기록 폴더> <시즌 코드(예 22 = 2025-26)> > out.sql
import json, os, sys, statistics as st, itertools
PD, S = sys.argv[1], int(sys.argv[2])
players = json.load(open(os.path.join(PD, 'players.json'), encoding='utf-8'))
recs = json.load(open(os.path.join(PD, 'season_records.json'), encoding='utf-8'))
SK = {'OP': {'atk': 1, 'pts': 1, 'srv': 1, 'blk': 1, 'err': -1}, 'OH': {'atk': 1, 'pts': 1, 'srv': 1, 'blk': 1, 'rcv': 1, 'dig': 1, 'err': -1},
      'MB': {'atk': 1, 'blk': 1, 'pts': 1, 'srv': 1, 'err': -1}, 'S': {'st': 1, 'dig': 1, 'srv': 1, 'blk': 1, 'err': -1}, 'L': {'dig': 1, 'rcv': 1, 'err': -1}}
rows = []
for code, rs in recs.items():
    p = players.get(code) or {}
    for r in rs or []:
        if '[정]' not in (r.get('seasonDivision') or '') or 'V' not in (r.get('leagueDivision') or ''): continue
        if int(r['seasonDivision'][:4]) - 2003 != S: continue
        sets = r.get('setCount') or 0
        if sets <= 0: continue
        f = lambda k: float(r.get(k) or 0)
        # 감독·코치(기록 전부 0)는 뺀다
        if not any(f(k) for k in ('point', 'digSetSuccess', 'receiveSuccess', 'setSuccess', 'error', 'blockingSetSuccess', 'serveSetSuccess', 'attackTotalSuccess')): continue
        pos = p.get('position') if p.get('position') in SK else 'OH'
        rows.append(dict(code=code, g=p.get('gender'), pos=pos, team=r.get('teamName'), gp=r.get('gameCount') or 0, sets=sets,
                         pts=f('point') / sets, atk=f('attackTotalSuccess'), blk=f('blockingSetSuccess'), srv=f('serveSetSuccess'),
                         st=f('setSuccess'), rcv=f('receiveSuccess'), dig=f('digSetSuccess'), err=f('error') / sets))
by = {}
for (g, pos), grp in itertools.groupby(sorted(rows, key=lambda x: (x['g'], x['pos'])), key=lambda x: (x['g'], x['pos'])):
    grp = list(grp)
    Z = {k: (st.mean([x[k] for x in grp if x['sets'] >= 8]), st.pstdev([x[k] for x in grp if x['sets'] >= 8]) or 1) for k in SK[pos]}
    for x in grp:
        W = {k: (0.5 if k == 'err' else 1) for k in SK[pos]}   # 범실 0.5배 (vb_tier.sql과 같음)
        z = sum(W[k] * max(-3, min(3, d * (x[k] - Z[k][0]) / Z[k][1])) for k, d in SK[pos].items()) / sum(W.values()) * x['sets'] / (x['sets'] + 30)
        key = (x['code'], 'VLEAGUE_M' if g == 'MALE' else 'VLEAGUE_W')
        if key not in by or x['gp'] > by[key][1]: by[key] = (x['team'], x['gp'], round(z, 2), players.get(x['code'], {}).get('name', ''))
season = f'{2003 + S}-{(2004 + S) % 100:02d}'
vals = ',\n'.join(f"('{lg}','{code}','{(nm or '').replace(chr(39), '')}','{(t or '').replace(chr(39), '')}',{gp},{z})" for (code, lg), (t, gp, z, nm) in by.items())
print(f"""insert into public.player_base (league, season, player_id, player_name, team, gp, min, gmsc, note, source, updated_at)
select v.lg, '{season}', v.code, coalesce(k.player_name, v.nm), v.team, v.gp, null, v.z, '균형 체급 (KOVO 시즌 기록)', 'kovo-season-records', now()
from (values
{vals}
) v(lg, code, nm, team, gp, z) left join (select distinct on (player_code) player_code, player_name from public.kovo_player_snapshots order by player_code, snapshot_date desc) k on k.player_code = v.code
on conflict (league, season, player_id) do update set gmsc = excluded.gmsc, gp = excluded.gp, team = excluded.team, player_name = excluded.player_name, note = excluded.note, source = excluded.source, updated_at = now();""")

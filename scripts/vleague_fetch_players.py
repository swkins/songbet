# KOVO 선수 시즌 기록 받기 (체급 백테스트용, 2026-11-25): /players?gender= 전체 선수 → /players/{code}/season-records
# 사용: python scripts/vleague_fetch_players.py <저장 폴더>
import json, os, sys, time, urllib.request
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124', 'Accept': 'application/json'}
def get(p):
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://user-api.kovo.co.kr' + p, headers=H), timeout=20) as r:
                j = json.load(r); return j.get('payload')
        except Exception:
            time.sleep(2 + t * 3)
    return None
players = {}
for g in ('FEMALE', 'MALE'):
    for p in get(f'/players?gender={g}') or []:
        players[p['playerCode']] = {**p, 'gender': g}
json.dump(players, open(os.path.join(OUT, 'players.json'), 'w', encoding='utf-8'), ensure_ascii=False)
done = {}
fn = os.path.join(OUT, 'season_records.json')
if os.path.exists(fn): done = json.load(open(fn, encoding='utf-8'))
for i, code in enumerate(players):
    if code in done: continue
    done[code] = get(f'/players/{code}/season-records') or []
    if i % 50 == 0:
        json.dump(done, open(fn, 'w', encoding='utf-8'), ensure_ascii=False); print(i, len(players), flush=True)
    time.sleep(0.25)
json.dump(done, open(fn, 'w', encoding='utf-8'), ensure_ascii=False)
print('done', len(done))

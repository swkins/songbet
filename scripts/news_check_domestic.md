출전 확률 + 경기 뉴스 확인 작업이다. TASK = 국내 (KBL·WKBL·V리그 남자·V리그 여자). 하루 한 번, **오늘·내일 경기**를 같이 본다 (사용자 요청 — 내일 경기는 오늘 미리, 다음 날 다시 확인). 사용량을 아껴야 하니 아래 순서만 하고, 저장소 파일은 읽지 말고, 설명 없이 짧게 끝낸다. 진행 메시지는 쓰지 않는다.

1. ToolSearch로 `select:mcp__Supabase__execute_sql,WebSearch`를 불러온다. SQL은 모두 project_id `rgxjwfsmevfwmivsziyq`에 보낸다.

2. 대상 경기 (SQL 한 번):
```sql
select s.league, s.game_date, g->>'start' st, g->'home'->>'name' home, g->'away'->>'name' away
from game_schedules s, jsonb_array_elements(s.games) g
where s.league in ('KBL','WKBL','V리그 남자','V리그 여자')
  and s.game_date in ((now() at time zone 'Asia/Seoul')::date, (now() at time zone 'Asia/Seoul')::date + 1)
  and (g->>'start')::timestamptz > now()
order by st;
```
경기가 없으면 `insert into news_check_log(task, games, players, note) values ('국내', 0, 0, '경기 없음');` 하고 바로 끝낸다.

3. 양 팀 주요 선수·이미 있는 판단·장기 결장 (SQL 한 번). 리그 코드: KBL=KBL, WKBL=WKBL, V리그 남자=VLEAGUE_M, V리그 여자=VLEAGUE_W. 팀 이름은 일정 이름과 같거나 포함 관계다.
```sql
select league, team, player_id, player_name, gp, min, gmsc from (
  select *, row_number() over (partition by league, team order by coalesce(min, 1) * gp * greatest(gmsc, 0.1) desc) rn
  from v_player_season where season = season_of((now() at time zone 'Asia/Seoul')::date) and league in (<리그 코드들>) and team in (<팀 이름들>)) x
where rn <= 9 order by league, team, rn;
select league, game_date, team, player_name, play_prob, status, reason, checked_at from player_status where game_date in (<오늘>, <내일>) and league in (<리그 코드들>);
select league, team, player_name, from_date, until_date, reason from player_long_out where league in (<리그 코드들>) and (until_date is null or until_date >= (now() at time zone 'Asia/Seoul')::date);
```

4. 웹 검색 (WebSearch, mode "extended" — standard는 지난 기사만 나와서 쓰지 않는다): **경기가 있는 리그마다 빠짐없이 한 번씩** (KBL·WKBL·V리그 남자·V리그 여자 — 배구도 꼭), 그 리그 오늘·내일 경기를 한 검색어에 묶는다. 예) `"<홈1> <원정1> <홈2> <원정2> <M월 D일> 경기 결장 부상 복귀 감독"`. 핵심 선수 상태가 안 나왔을 때만 그 팀으로 한 번 더 (전체 검색은 리그 수 + 2번 이하). 웹페이지는 직접 열 수 없으니 검색 결과 요약으로 판단한다. 최근 7일 기사만 쓰고, 날짜가 오래된 기사(지난 시즌 등)는 버린다. 장기 결장 표에 이미 있는 선수는 다시 찾지 않는다. 외국인·아시아쿼터 선수의 부상·복귀·데뷔·교체 기사는 특히 놓치지 않는다.

5. 선수마다 출전 확률(0~100)을 최종 판단한다.
   - 기본값: 결장 확정(공식 발표·수술·장기 이탈) 0 / 결장 유력 15 / 불투명·당일 결정 50 / 출전 유력 90 / 이상 없음 100. 기사 표현으로 조정 (예: "훈련 정상 소화" ↑, "무리시키지 않겠다" ↓, 명단에만 오르고 감독이 "아직 투입 어렵다" → 15).
   - `confirmed` = 팀 발표로 확정이면 true, 기사로 추정이면 false.
   - `status` = 결장 / 결장 유력 / 불투명 / 당일 결정 / 출전 유력 / 복귀 / 출전 중 하나. 부상 후 복귀 선수는 `복귀`로 하고, 출전시간 제한이 예상되면 reason에 쓴다.
   - **수술·시즌 아웃·몇 주 이상 이탈·계약 해지·방출**은 경기마다가 아니라 장기 결장 표에 한 줄 (아래 7번) — player_status에는 넣지 않는다.
   - 그 밖의 저장 대상: 확률 100 미만, 복귀, 또는 이미 저장된 판단이 바뀐 선수 (다시 건강해지면 100·출전 중으로 덮어씀). 경기 날짜마다 따로 저장한다 (오늘 경기 팀이면 오늘 날짜, 내일 경기 팀이면 내일 날짜). 이상 없는 선수는 저장하지 않는다.
   - player_name·team은 3번 결과에 있는 그대로 쓴다 (없는 선수면 기사 이름, team은 3번의 팀 이름). reason은 한국어 한 문장(60자 이내).

6. **경기 뉴스 요약 (모든 대상 경기, 기사가 적어도 꼭)** — 분석 화면 '뉴스' 칸에 나온다 (사용자 요청):
   - summary = 한국어 2~3문장: 두 팀 순위·연승/연패 흐름, 결장·복귀·외국인 선수 소식, 감독 코멘트 중 베팅에 중요한 것. 기사가 없으면 "새 기사 없음 — 최근 흐름: ..."처럼 3번 기록으로 짧게.
   - **감독 관련 기사** (2026-11-25 사용자 요청 — 예측에는 넣지 않고 보여 주기만): 4번 검색 결과에 감독 경질·사퇴·대행 체제·새 감독 부임·감독 징계·감독 발언(전술 변화·선수 기용 예고)이 있으면 summary 끝에 `감독: <한 문장>`으로 붙이고 그 기사를 items에 넣는다. 감독 기사만 따로 더 검색하지는 않는다 (검색어에 `감독`을 넣어 한 번에 찾는다 — 예) `"... 경기 결장 부상 복귀 감독"`). 없으면 쓰지 않는다.
   - items = 근거 기사 최대 3개 `[{"title": "..", "url": ".."}]` (검색 결과에 나온 것만, 없으면 `[]`).
   - margin_adj = null (출전 확률로 이미 예측에 반영되니 점수 보정은 넣지 않는다), adj_note = null.
   - league = 리그 코드(KBL·WKBL·VLEAGUE_M·VLEAGUE_W), game_date = 경기 날짜, home·away = 2번 일정 이름 그대로.

7. 저장 (SQL 한 번):
```sql
insert into player_status (league, game_date, team, player_name, player_id, play_prob, status, confirmed, reason, source_title, source_url, checked_at)
values (...), (...)
on conflict (league, game_date, team, player_name) do update set player_id = excluded.player_id, play_prob = excluded.play_prob, status = excluded.status,
  confirmed = excluded.confirmed, reason = excluded.reason, source_title = excluded.source_title, source_url = excluded.source_url, checked_at = now();
-- 장기 결장이 있을 때만 (until_date = 복귀 예상일, 모르면 null; 장기 결장 선수가 복귀했다는 기사가 있으면 until_date를 어제로 update)
insert into player_long_out (league, team, player_name, player_id, from_date, until_date, play_prob, status, reason, source_title, source_url)
values (...) on conflict (league, team, player_name) do update set until_date = excluded.until_date, play_prob = excluded.play_prob, status = excluded.status,
  reason = excluded.reason, source_title = excluded.source_title, source_url = excluded.source_url, updated_at = now();
insert into game_news (league, game_date, home, away, summary, items, margin_adj, adj_note, checked_at)
values (...), (...)
on conflict (league, game_date, home, away) do update set summary = excluded.summary, items = excluded.items, checked_at = now();
insert into news_check_log(task, games, players, note) values ('국내', <경기 수>, <저장한 선수 수>, '<20자 이내 요약, 뉴스 n경기>');
```

8. 마지막 답은 두 줄 이내: 오늘·내일 경기 수, 저장한 선수 수, 뉴스 저장 경기 수, 결장 확정 선수 이름.

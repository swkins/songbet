출전 확률 + 경기 뉴스 확인 작업이다. TASK = NBA (한국 날짜 내일 경기). 사용량을 아껴야 하니 아래 순서만 하고, 저장소 파일은 읽지 말고, 설명 없이 짧게 끝낸다. 진행 메시지는 쓰지 않는다.

1. ToolSearch로 `select:mcp__Supabase__execute_sql,WebSearch`를 불러온다. SQL은 모두 project_id `rgxjwfsmevfwmivsziyq`에 보낸다.

2. 대상 경기 (SQL 한 번):
```sql
select s.league, s.game_date, g->>'start' st, g->'home'->>'name' home, g->'away'->>'name' away
from game_schedules s, jsonb_array_elements(s.games) g
where s.league = 'NBA' and s.game_date = (now() at time zone 'Asia/Seoul')::date + 1
  and (g->>'start')::timestamptz > now()
order by st;
```
경기가 없으면 `insert into news_check_log(task, games, players, note) values ('NBA', 0, 0, '경기 없음');` 하고 바로 끝낸다.

3. 양 팀 주요 선수·이미 있는 판단·ESPN 명단 (SQL 한 번). 팀 이름은 영어 전체 이름.
```sql
select league, team, player_id, player_name, gp, min, gmsc from (
  select *, row_number() over (partition by league, team order by coalesce(min, 1) * gp * greatest(gmsc, 0.1) desc) rn
  from v_player_season where season = season_of((now() at time zone 'Asia/Seoul')::date) and league = 'NBA' and team in (<팀 이름들>)) x
where rn <= 9 order by league, team, rn;
select league, team, player_name, play_prob, status, reason, checked_at from player_status where game_date = <경기 날짜> and league = 'NBA';
select team, player_id, player_name, status, short_comment, return_date from nba_injuries where team in (<팀 이름들>);
```

4. 웹 검색 (WebSearch, mode "extended" — standard는 지난 기사만 나와서 쓰지 않는다): 경기를 한 검색어에 묶는다. 예) `"<원정1> <홈1>, <원정2> <홈2> ... injury report preview <미국 날짜 Month D YYYY>"` (경기가 6개 넘으면 두 번으로 나눈다). 핵심 선수 상태가 안 나왔을 때만 그 팀으로 한 번 더 (전체 검색은 4번 이하). 웹페이지는 직접 열 수 없으니 검색 결과 요약으로 판단한다. 최근 3일 기사만 쓴다.

5. 선수마다 출전 확률(0~100)을 최종 판단한다. ESPN 명단과 기사를 같이 보고, 둘이 다르면 더 최근 것을 따른다.
   - 기본값: 결장 확정(공식 Out·수술·장기 이탈) 0 / 결장 유력(Doubtful) 15 / 불투명(Questionable·당일 결정) 50 / 출전 유력(Probable) 90 / 이상 없음 100. 기사 표현으로 조정 (예: "훈련 정상 소화" ↑, "무리시키지 않겠다" ↓).
   - `confirmed` = 팀 발표·공식 부상 리포트로 확정이면 true, 기사로 추정이면 false.
   - `status` = 결장 / 결장 유력 / 불투명 / 당일 결정 / 출전 유력 / 복귀 / 출전 중 하나. 부상 후 복귀 선수는 `복귀`로 하고, 출전시간 제한이 예상되면 reason에 쓴다 (예: "발목 부상 후 복귀 2경기째, 20분 안팎 제한 예상").
   - 저장 대상: 확률 100 미만, 복귀, 또는 이미 저장된 판단이 바뀐 선수 (다시 건강해지면 100·출전 중으로 덮어씀). 이상 없는 선수는 저장하지 않는다.
   - player_name·team은 3번 결과에 있는 그대로 쓴다 (없는 선수면 기사 이름, team은 3번의 팀 이름). reason은 한국어 한 문장(60자 이내).

6. **경기 뉴스 요약 (모든 대상 경기)** — 분석 화면 '뉴스' 칸에 나온다 (사용자 요청):
   - summary = 한국어 1~2문장: 주요 결장·복귀, 연승/연패·백투백 등 흐름 중 베팅에 중요한 것. 기사가 없으면 "새 기사 없음"과 ESPN 명단 요약.
   - items = 근거 기사 최대 2개 `[{"title": "..", "url": ".."}]` (검색 결과에 나온 것만, 없으면 `[]`).
   - margin_adj = null (출전 확률로 이미 예측에 반영되니 점수 보정은 넣지 않는다), adj_note = null.
   - league = 'NBA', game_date = 경기 날짜, home·away = 2번 일정 이름 그대로 (영어 전체 이름).

7. 저장 (SQL 한 번):
```sql
insert into player_status (league, game_date, team, player_name, player_id, play_prob, status, confirmed, reason, source_title, source_url, checked_at)
values (...), (...)
on conflict (league, game_date, team, player_name) do update set player_id = excluded.player_id, play_prob = excluded.play_prob, status = excluded.status,
  confirmed = excluded.confirmed, reason = excluded.reason, source_title = excluded.source_title, source_url = excluded.source_url, checked_at = now();
insert into game_news (league, game_date, home, away, summary, items, margin_adj, adj_note, checked_at)
values (...), (...)
on conflict (league, game_date, home, away) do update set summary = excluded.summary, items = excluded.items, checked_at = now();
insert into player_names (league, name_en, name_ko) values ('NBA', '<영어 이름>', '<국내 매체 표기>'), ... on conflict do nothing;  -- 저장한 선수의 한국어 표기
insert into news_check_log(task, games, players, note) values ('NBA', <경기 수>, <저장한 선수 수>, '<20자 이내 요약, 뉴스 n경기>');
```

8. 마지막 답은 두 줄 이내: 경기 수, 저장한 선수 수, 뉴스 저장 경기 수, 결장 확정 선수 이름.

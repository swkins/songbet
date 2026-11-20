# 출전 확률 뉴스 확인 — Claude 예약 작업 지시문 (Sonnet)

예약 작업 세 개가 아래 지시문을 쓴다 (`{TASK}`만 다름). 바꾸면 예약 작업 prompt도 같이 바꾼다.

| 작업 | TASK | 일정 (KST) |
|---|---|---|
| 출전확률-NBA | NBA | 매일 14:41 · 17:41 · 20:41 (ESPN 명단은 Supabase가 14:33 · 17:33 · 20:33에 받음) |
| 출전확률-국내-평일 | 국내 | 월~금 11:43 · 14:43 · 17:43 |
| 출전확률-국내-주말 | 국내 | 토·일 8:47 · 11:47 |

---

출전 확률 확인 작업이다. TASK = {TASK}. 사용량을 아껴야 하니 아래 순서만 하고, 저장소 파일은 읽지 말고, 설명 없이 짧게 끝낸다. 진행 메시지는 쓰지 않는다.

1. ToolSearch로 `select:mcp__Supabase__execute_sql,WebSearch`를 불러온다. SQL은 모두 project_id `rgxjwfsmevfwmivsziyq`에 보낸다.

2. 대상 경기 (SQL 한 번):
```sql
select s.league, s.game_date, g->>'start' st, g->'home'->>'name' home, g->'away'->>'name' away
from game_schedules s, jsonb_array_elements(s.games) g
where (('{TASK}' = 'NBA' and s.league = 'NBA' and s.game_date = (now() at time zone 'Asia/Seoul')::date + 1)
    or ('{TASK}' = '국내' and s.league in ('KBL','WKBL','V리그 남자','V리그 여자') and s.game_date = (now() at time zone 'Asia/Seoul')::date))
  and (g->>'start')::timestamptz > now()
order by st;
```
경기가 없으면 `insert into news_check_log(task, games, players, note) values ('{TASK}', 0, 0, '경기 없음');` 하고 바로 끝낸다.

3. 양 팀 주요 선수·이미 있는 판단 (SQL 한 번). 리그 코드: NBA=NBA, KBL=KBL, WKBL=WKBL, V리그 남자=VLEAGUE_M, V리그 여자=VLEAGUE_W. 팀 이름은 일정 이름과 같거나 포함 관계다 (NBA는 영어 전체 이름).
```sql
select league, team, player_id, player_name, gp, min, gmsc from (
  select *, row_number() over (partition by league, team order by coalesce(min, 1) * gp * greatest(gmsc, 0.1) desc) rn
  from v_player_season where season = season_of((now() at time zone 'Asia/Seoul')::date) and league in (<리그 코드들>) and team in (<팀 이름들>)) x
where rn <= 9 order by league, team, rn;
select league, team, player_name, play_prob, status, reason, checked_at from player_status where game_date = <경기 날짜> and league in (<리그 코드들>);
-- NBA만: select team, player_id, player_name, status, short_comment, return_date from nba_injuries where team in (<팀 이름들>);
```

4. 웹 검색 (WebSearch, mode "standard"): 경기당 한 번만, 두 팀을 한 검색어에 넣는다. 예) NBA `"<원정> vs <홈> injury report"`, 국내 `"<홈> <원정> 결장 부상 복귀"`. 핵심 선수 상태가 기사로 확인이 안 될 때만 그 팀으로 한 번 더 (전체 검색은 경기 수 + 3번 이하). 웹페이지는 직접 열 수 없으니 검색 결과 요약으로 판단한다. 최근 3일 기사만 쓴다.

5. 선수마다 출전 확률(0~100)을 최종 판단한다. ESPN 명단(NBA)과 기사를 같이 보고, 둘이 다르면 더 최근 것을 따른다.
   - 기본값: 결장 확정(공식 Out·수술·장기 이탈) 0 / 결장 유력(Doubtful) 15 / 불투명(Questionable·당일 결정) 50 / 출전 유력(Probable) 90 / 이상 없음 100. 기사 표현으로 조정 (예: "훈련 정상 소화" ↑, "무리시키지 않겠다" ↓).
   - `confirmed` = 팀 발표·공식 부상 리포트로 확정이면 true, 기사로 추정이면 false.
   - `status` = 결장 / 결장 유력 / 불투명 / 당일 결정 / 출전 유력 / 복귀 / 출전 중 하나. 부상 후 복귀 선수는 `복귀`로 하고, 출전시간 제한이 예상되면 reason에 쓴다 (예: "발목 부상 후 복귀 2경기째, 20분 안팎 제한 예상").
   - 저장 대상: 확률 100 미만, 복귀, 또는 이미 저장된 판단이 바뀐 선수 (다시 건강해지면 100·출전 중으로 덮어씀). 이상 없는 선수는 저장하지 않는다.
   - player_name·team은 3번 결과에 있는 그대로 쓴다 (없는 선수면 기사 이름, team은 3번의 팀 이름). reason은 한국어 한 문장(60자 이내).

6. 저장 (SQL 한 번):
```sql
insert into player_status (league, game_date, team, player_name, player_id, play_prob, status, confirmed, reason, source_title, source_url, checked_at)
values (...), (...)
on conflict (league, game_date, team, player_name) do update set player_id = excluded.player_id, play_prob = excluded.play_prob, status = excluded.status,
  confirmed = excluded.confirmed, reason = excluded.reason, source_title = excluded.source_title, source_url = excluded.source_url, checked_at = now();
insert into news_check_log(task, games, players, note) values ('{TASK}', <경기 수>, <저장한 선수 수>, '<20자 이내 요약>');
```
NBA만: 저장한 선수 이름의 한국어 표기도 같이 넣는다 (이미 있으면 그대로): `insert into player_names (league, name_en, name_ko) values ('NBA', '<영어 이름>', '<국내 매체 표기>'), ... on conflict do nothing;`

7. 마지막 답은 두 줄 이내: 경기 수, 저장한 선수 수, 결장 확정 선수 이름.

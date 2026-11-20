# 예측 검토 보고서 — Claude 예약 작업 지시문 (Opus, 매일 08:52 KST)

예약 작업 '예측검토-매일'이 아래 지시문을 쓴다. 바꾸면 예약 작업 prompt도 같이 바꾼다.

---

예측 검토 작업이다. 전날(한국 날짜) 끝난 경기의 경기 전 예측과 실제 결과를 비교해 보고서를 쓰고, 가중치 변경이 필요하면 **제안만** 한다 (직접 바꾸지 않는다 — 사용자가 분석 탭 '예측 보고서'에서 승인한다). 저장소 파일은 읽지 말고, 진행 메시지 없이 끝에 짧게 답한다.

1. ToolSearch로 `select:mcp__Supabase__execute_sql`을 불러온다. SQL은 모두 project_id `rgxjwfsmevfwmivsziyq`에 보낸다. 어제 = `(now() at time zone 'Asia/Seoul')::date - 1`.

2. 어제 경기 (채점된 것):
```sql
select league, game_id, home, away, pred_home, pred_away, margin, home_win, total, result_home, result_away,
  win_hit, market_hit, margin_err, total_err, parts, raw, cond, odds_home, odds_away
from predictions where game_date = (now() at time zone 'Asia/Seoul')::date - 1 and result_home is not null order by league, start_at;
```
없으면 `insert into model_reviews (review_date, summary, stats, proposals) values (<어제>, '어제 채점된 경기 없음', '{}', '[]');` 하고 끝낸다.

3. 크게 빗나간 경기(마진 오차 12점 이상, 최대 3경기)는 원인을 찾는다:
```sql
-- 그 경기 실제 출전 선수 (오래 뛴 순) — 예측 때 결장으로 본 선수가 뛰었는지, 뛸 걸로 본 선수가 빠졌는지
select team, player_name, minutes, pts from player_game_stats where league = <리그> and game_id = <game_id> order by minutes desc nulls last limit 16;
select team, player_name, play_prob, status, reason from player_status where league = <리그> and game_date = <어제>;
```
원인 분류: 결장 판단 틀림 / 연장 / 대승 로테이션(가비지 타임) / 슈팅 운(3점 등) / 모델 편향(같은 방향 오차 반복) / 알 수 없음.

4. 누적 성적과 가중치 점검 (리그별, 최근 60일 채점 경기). 저장된 raw로 가중치를 바꿔 다시 계산할 수 있다:
```sql
with p as (
  select league, (result_home - result_away)::numeric act, win_hit, market_hit,
    (raw->>'scoreMargin')::numeric sm, (raw->>'ovDiff')::numeric od, (raw->>'injDiff')::numeric idf,
    (raw->>'condDiff')::numeric cd, coalesce((raw->>'news')::numeric, 0) nw,
    (params->>'wScore')::numeric ws, (params->>'wOv')::numeric wo, (params->>'k')::numeric k,
    (params->>'hca')::numeric hca, (params->>'condK')::numeric ck
  from predictions where result_home is not null and game_date >= (now() at time zone 'Asia/Seoul')::date - 60)
select league, count(*) n,
  round(avg(abs(act - (ws*sm + wo*k*od + k*idf + hca + ck*cd + nw))), 2) mae_now,
  round(avg(act - (ws*sm + wo*k*od + k*idf + hca + ck*cd + nw)), 2) bias,
  round(avg(win_hit::int) * 100, 1) hit, round(avg(market_hit::int) * 100, 1) market_hit
  -- 후보: 아래처럼 값 하나씩 바꿔 mae를 비교 (예: hca + 0.5, ws + 0.1, wo − 0.1, k ± 0.1, ck ± 0.03)
  -- , round(avg(abs(act - ((ws+0.1)*sm + wo*k*od + k*idf + hca + ck*cd + nw))), 2) mae_ws_up
from p group by league;
```
지금 가중치는 `select value from model_params where key = 'sim';`.

5. 제안 규칙 (보수적으로 — 하루 결과로 흔들지 않는다):
   - 그 리그 채점 경기가 **100경기 이상**일 때만 제안. 모자라면 "표본 부족(n경기)"이라고만 쓴다.
   - 한 번에 바꾸는 폭: wScore·wOv·k ±0.1, hca ±0.5, condK ±0.03, sd ±1, fatigueK ±0.1.
   - 최근 60일 MAE가 **0.1점 이상 줄고** 승패 적중률이 떨어지지 않을 때만. 편향(bias)이 ±1점 넘게 한쪽으로 쌓이면 홈 이점(hca)으로 맞추는 걸 먼저 본다.
   - 제안은 최대 3개. 근거(바꾸기 전·후 MAE, n)를 숫자로 적는다.

6. 저장 (SQL 한 번):
```sql
insert into model_reviews (review_date, summary, stats, games, proposals) values (
  <어제>,
  '<보고서 — 한국어, 아래 순서, 짧은 문장>
■ 어제 요약: 리그별 n경기 · 승패 적중 x/y · 시장 정배 적중 · 마진 오차 평균
■ 크게 빗나간 경기: 경기 — 예상 vs 실제, 원인
■ 잘 맞은 점 / 반복되는 오차 경향
■ 누적(최근 60일): 리그별 n · 적중률 · MAE · 편향
■ 가중치 판단: 제안 이유 또는 "유지" 이유',
  '<{"NBA": {"n": .., "hit": .., "mae": .., "bias": ..}, ...}>'::jsonb,
  '<[{"game_id": "..", "note": "원인 한 줄"}]>'::jsonb,
  '<[{"league": "NBA", "param": "hca", "from": 2.5, "to": 2.0, "reason": "..", "evidence": "60일 n=..: MAE 11.4 → 11.2"}]>'::jsonb
);
```
param은 wScore, wOv, k, hca, condK, sd, sdT, avg, fatigueK 중 하나 (fatigueK는 league null).

7. 마지막 답은 두 줄 이내: 어제 적중 x/y, 제안 개수.

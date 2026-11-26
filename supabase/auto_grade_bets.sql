-- 베팅 결과 자동 판정 (2026-11-21 사용자 요청)
-- 결과가 안 나온 단폴 베팅(축구·농구·배구)을 일정(game_schedules)의 종료 경기와 맞춰 적중/실패를 auto_result에 넣는다.
-- 최종 처리(result·손익·잔액)는 사용자가 베팅 현황에서 [확인]을 눌러야 된다 (앱의 applyResult).
-- 맞추는 법: 같은 종목·리그, 날짜 ±1일, 같은 쪽(홈/원정) 팀 이름 (띄어쓰기 무시 일치 > 포함 > 단어 겹침, NBA는 영→한 표).
-- 라이브도 최종 점수 전체로 판정 (사용자: 0:1에서 +0.5는 1:1 이상이어야 적중). 배구 총득점 오버/언더는 안 함.
-- WKBL 일정에는 점수가 없어 다음 날 새벽 들어오는 v_team_games 점수를 쓴다.

alter table public.bets add column if not exists auto_result text;      -- win | loss | push
alter table public.bets add column if not exists auto_score text;       -- '홈-원정' 최종 점수(배구는 세트)
alter table public.bets add column if not exists auto_game_id text;
alter table public.bets add column if not exists auto_at timestamptz;
alter table public.bets add column if not exists auto_note text;        -- 경기 못 찾음 / 이름 애매 / 옵션 모름
alter table public.bets add column if not exists auto_game jsonb;       -- 맞춘 경기 {home, away, start, status, hs, as} — 진행중 베팅 리그 옆 '홈 vs 원정 · 시각/점수' (2026-11-22 사용자 요청)

create table if not exists public.nba_team_ko (en text primary key, short text not null, full_name text not null);
insert into public.nba_team_ko (en, short, full_name) values
 ('Atlanta Hawks','애틀랜타','애틀랜타 호크스'),('Boston Celtics','보스턴','보스턴 셀틱스'),('Brooklyn Nets','브루클린','브루클린 네츠'),
 ('Charlotte Hornets','샬럿','샬럿 호네츠'),('Chicago Bulls','시카고','시카고 불스'),('Cleveland Cavaliers','클리블랜드','클리블랜드 캐벌리어스'),
 ('Dallas Mavericks','댈러스','댈러스 매버릭스'),('Denver Nuggets','덴버','덴버 너기츠'),('Detroit Pistons','디트로이트','디트로이트 피스톤스'),
 ('Golden State Warriors','골든스테이트','골든 스테이트 워리어스'),('Houston Rockets','휴스턴','휴스턴 로키츠'),('Indiana Pacers','인디애나','인디애나 페이서스'),
 ('LA Clippers','LA 클리퍼스','로스앤젤레스 클리퍼스'),('Los Angeles Clippers','LA 클리퍼스','로스앤젤레스 클리퍼스'),
 ('Los Angeles Lakers','LA 레이커스','로스앤젤레스 레이커스'),('Memphis Grizzlies','멤피스','멤피스 그리즐리스'),
 ('Miami Heat','마이애미','마이애미 히트'),('Milwaukee Bucks','밀워키','밀워키 벅스'),('Minnesota Timberwolves','미네소타','미네소타 팀버울브스'),
 ('New Orleans Pelicans','뉴올리언스','뉴올리언스 펠리컨스'),('New York Knicks','뉴욕','뉴욕 닉스'),('Oklahoma City Thunder','오클라호마시티','오클라호마 시티 썬더'),
 ('Orlando Magic','올랜도','올랜도 매직'),('Philadelphia 76ers','필라델피아','필라델피아 76ers'),('Phoenix Suns','피닉스','피닉스 선스'),
 ('Portland Trail Blazers','포틀랜드','포틀랜드 트레일 블레이저스'),('Sacramento Kings','새크라멘토','새크라멘토 킹스'),
 ('San Antonio Spurs','샌안토니오','샌안토니오 스퍼스'),('Toronto Raptors','토론토','토론토 랩터스'),('Utah Jazz','유타','유타 재즈'),
 ('Washington Wizards','워싱턴','워싱턴 위저즈')
on conflict (en) do nothing;

-- 베팅 팀 이름 ↔ 일정 팀 이름 후보: 3 = 같음, 2 = 한쪽이 다른 쪽 포함, 1 = 단어 하나 겹침, 0 = 아님
create or replace function public.bet_name_score(bet text, cands text[]) returns int
language plpgsql immutable as $$
declare b text := lower(regexp_replace(coalesce(bet, ''), '\s', '', 'g')); c text; cn text; best int := 0;
begin
  if b = '' then return 0; end if;
  foreach c in array cands loop
    cn := lower(regexp_replace(coalesce(c, ''), '\s', '', 'g'));
    continue when cn = '';
    if cn = b then return 3; end if;
    if length(cn) >= 2 and (position(cn in b) > 0 or position(b in cn) > 0) then best := greatest(best, 2);
    elsif exists (select 1 from unnest(string_to_array(lower(bet), ' ')) t
                  where length(t) >= 2 and t not in ('fc','sc','ac','as','rc','cf','afc','cd','ud','sd','fk','sk','sv','bk','if','us','ss','vfb','vfl','tsg','시티','유나이티드','fc서울')
                    and position(t in cn) > 0) then best := greatest(best, 1);
    end if;
  end loop;
  return best;
end $$;

create or replace function public.bet_side_names(p_sport text, p_league text, p_team jsonb) returns text[]
language sql stable as $$
  select array[p_team->>'name', p_team->>'full']
         || coalesce((select array[k.short, k.full_name] from public.nba_team_ko k where p_league = 'NBA' and k.en = p_team->>'name'), array[]::text[])
$$;

create or replace function public.auto_grade_bets() returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  r record; m text[]; side text; opt text; ta text; tb text; line numeric; ou text; sets boolean;
  best_score int; best_game jsonb; best_date date; hs numeric; as_ numeric; st text;
  v numeric; res text; n int := 0; dur interval; gj jsonb;
begin
  for r in select id, sport, league, match, bet_date, created_at from public.bets
           where result = 'pending' and parlay_group is null and coalesce(is_hidden, false) = false
             and sport in ('soccer', 'basketball', 'volleyball') and bet_date >= current_date - 10
  loop
    side := null; opt := null; ta := null; tb := null; line := null; ou := null; sets := false;
    m := regexp_match(r.match, '^(.+) vs (.+?) ([0-9]+(?:\.[0-9]+)?) (세트 )?(오버|언더)$');
    if m is not null then
      ta := m[1]; tb := m[2]; line := m[3]::numeric; sets := m[4] is not null; ou := m[5];
      if r.sport = 'volleyball' and not sets then
        update public.bets set auto_note = '배구 총득점은 자동 판정 안 함' where id = r.id and auto_note is distinct from '배구 총득점은 자동 판정 안 함';
        continue;
      end if;
    else
      m := regexp_match(r.match, '^(.+) (홈|원정) (.+)$');
      if m is null then
        update public.bets set auto_note = '문구를 못 읽음' where id = r.id and auto_note is distinct from '문구를 못 읽음';
        continue;
      end if;
      ta := m[1]; side := m[2]; opt := trim(m[3]);
      -- '팀 홈 2.5 오버'처럼 홈/원정을 고른 오버·언더도 경기 총합으로 (2026-11-26 — '옵션 모름'으로 막혔다)
      m := regexp_match(opt, '^([0-9]+(?:\.[0-9]+)?) *(세트 )?(오버|언더)$');
      if m is not null then
        line := m[1]::numeric; sets := m[2] is not null; ou := m[3];
        if r.sport = 'volleyball' and not sets then
          update public.bets set auto_note = '배구 총득점은 자동 판정 안 함' where id = r.id and auto_note is distinct from '배구 총득점은 자동 판정 안 함';
          continue;
        end if;
      end if;
    end if;

    -- 경기 고르기: 이름 점수가 가장 높은 경기, 같으면 베팅 시각(-4시간) 이후 가장 먼저 시작하는 경기
    -- (NBA 연전처럼 ±1일 안에 같은 팀 경기가 둘일 때), 베팅을 경기 뒤에 적었으면 그 전 가장 가까운 경기
    best_game := null; best_date := null; best_score := 0;
    select q.game_date, q.x, q.sc into best_date, best_game, best_score from (
      select s.game_date, x,
        case when side is null then
          case when public.bet_name_score(ta, public.bet_side_names(r.sport, r.league, x->'home')) > 0
                and public.bet_name_score(tb, public.bet_side_names(r.sport, r.league, x->'away')) > 0
               then public.bet_name_score(ta, public.bet_side_names(r.sport, r.league, x->'home'))
                  + public.bet_name_score(tb, public.bet_side_names(r.sport, r.league, x->'away')) else 0 end
        else public.bet_name_score(ta, public.bet_side_names(r.sport, r.league, case side when '홈' then x->'home' else x->'away' end)) end sc,
        (x->>'start')::timestamptz >= r.created_at - interval '4 hours' after_bet,
        (x->>'start')::timestamptz st_at
      from public.game_schedules s, jsonb_array_elements(s.games) x
      where s.sport = r.sport and s.league = r.league and s.game_date between r.bet_date - 1 and r.bet_date + 1
    ) q where q.sc > 0
    order by q.sc desc, q.after_bet desc, case when q.after_bet then q.st_at end asc, case when not q.after_bet then q.st_at end desc
    limit 1;
    if best_game is null then
      update public.bets set auto_note = '경기 못 찾음' where id = r.id and auto_note is distinct from '경기 못 찾음';
      continue;
    end if;

    -- 맞춘 경기 정보 (화면 표시용 — 경기 전·중·끝 모두, NBA는 한글 짧은 이름)
    gj := jsonb_build_object(
      'home', coalesce((select k.short from public.nba_team_ko k where r.league = 'NBA' and k.en = best_game->'home'->>'name'), best_game->'home'->>'name'),
      'away', coalesce((select k.short from public.nba_team_ko k where r.league = 'NBA' and k.en = best_game->'away'->>'name'), best_game->'away'->>'name'),
      'start', best_game->>'start', 'status', best_game->>'status',
      'hs', best_game->'home'->>'score', 'as', best_game->'away'->>'score');
    update public.bets set auto_game = gj where id = r.id and auto_game is distinct from gj;

    -- 최종 점수 (종료된 경기만)
    st := best_game->>'status'; hs := null; as_ := null;
    -- 연기·중단·취소는 판정 안 함 (2026-11-22 위트레흐트 0:0 중단이 '적중'으로 나왔다)
    if st in ('연기', '중단', '취소') or st ~* 'postpon|cancel|suspend|abandon|forfeit' then
      update public.bets set auto_result = null, auto_score = null, auto_game_id = best_game->>'id', auto_note = '경기 ' || st || ' — 직접 확인'
       where id = r.id and (auto_note is distinct from '경기 ' || st || ' — 직접 확인' or auto_result is not null);
      continue;
    end if;
    -- '종료'라도 시작 후 경기 시간만큼 안 지났으면 기다림 (축구 100분·농구 110분·배구 60분)
    dur := case r.sport when 'soccer' then interval '100 minutes' when 'basketball' then interval '110 minutes' else interval '60 minutes' end;
    if (st = '종료' or st ilike 'final%') and (best_game->>'start')::timestamptz < now() - dur then
      hs := nullif(best_game->'home'->>'score', '')::numeric; as_ := nullif(best_game->'away'->>'score', '')::numeric;
    elsif r.league = 'WKBL' and st is null and (best_game->>'start')::timestamptz < now() - interval '3 hours' then
      select t.team_score, t.opp_score into hs, as_ from public.v_team_games t
       where t.league = 'WKBL' and t.game_date = best_date and t.team = best_game->'home'->>'name' limit 1;
    end if;
    if hs is null or as_ is null then
      update public.bets set auto_result = null, auto_score = null, auto_game_id = best_game->>'id', auto_note = '경기 전·경기중'
       where id = r.id and (auto_note is distinct from '경기 전·경기중' or auto_result is not null);
      continue;
    end if;

    -- 최종 점수가 나왔으면 화면 표시에도 (WKBL은 일정에 점수가 없다)
    gj := gj || jsonb_build_object('hs', hs::int, 'as', as_::int, 'final', true);
    update public.bets set auto_game = gj where id = r.id and auto_game is distinct from gj;

    -- 판정 (라이브도 최종 점수 전체로)
    v := null;
    if ou is not null then
      v := case ou when '오버' then (hs + as_) - line else line - (hs + as_) end;
    else
      v := case side when '홈' then hs - as_ else as_ - hs end;  -- 내 팀 기준 점수차
      if opt = '승리' then v := case when v > 0 then 1 else -1 end;  -- 무승부는 실패
      elsif opt ~ '^-?[0-9]+(\.[0-9]+)? *H$' then v := v + (regexp_match(opt, '^(-?[0-9]+(?:\.[0-9]+)?)'))[1]::numeric;
      elsif opt ~ '^[0-9]+(\.[0-9]+)? *마핸$' then v := v - (regexp_match(opt, '^([0-9]+(?:\.[0-9]+)?)'))[1]::numeric;
      elsif opt ~ '^[0-9]+(\.[0-9]+)? *플핸$' then v := v + (regexp_match(opt, '^([0-9]+(?:\.[0-9]+)?)'))[1]::numeric;
      else
        update public.bets set auto_note = '옵션 모름: ' || opt where id = r.id and auto_note is distinct from '옵션 모름: ' || opt;
        continue;
      end if;
    end if;
    res := case when v > 0 then 'win' when v < 0 then 'loss' else 'push' end;
    update public.bets set auto_result = res, auto_score = hs::int || '-' || as_::int, auto_game_id = best_game->>'id', auto_at = now(), auto_note = null
     where id = r.id and (auto_result is distinct from res or auto_score is distinct from hs::int || '-' || as_::int);
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- 30분마다 (일정은 약 1시간마다 갱신)
select cron.schedule('auto-grade-bets', '17,47 * * * *', 'select public.auto_grade_bets()');

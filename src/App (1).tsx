// ─────────────────────────────────────────────────────────────
// BET TRACKER · App.tsx (rev.7 - 2026-04-25)
// ─────────────────────────────────────────────────────────────
//
// ╔═══════════════════════════════════════════════════════════╗
// ║         🔒 골든 룰 — 이 파일을 수정하는 모든 Claude에게  ║
// ╚═══════════════════════════════════════════════════════════╝
//
// 이 앱은 다중 PC/모바일 사용을 전제로 한다.
// 모든 데이터는 반드시 Supabase에 저장해야 한다.
//
// ── 규칙 1. 데이터 저장 위치 ────────────────────────────────
//  ✅ 모든 사용자 데이터 → Supabase (lib/db.ts 경유)
//  ❌ localStorage / sessionStorage / 전역변수에 저장 금지
//  ❌ useState 초기값에 실제 데이터 하드코딩 금지
//
// ── 규칙 2. 새 상태(state) 추가 시 필수 절차 ────────────────
//  (a) lib/db.ts 에 먼저 load/upsert/delete 함수 세트 추가
//  (b) App.tsx에서 useState 초기값은 반드시 "빈 값"으로 시작
//      예) useState<MyType[]>([])  또는  useState("")
//  (c) 초기 로딩 useEffect(dbReloadNonce)에서 db.load*() 호출
//  (d) save 함수는 setState + db.upsert*() 를 항상 같이 호출
//  (e) 단순 key-value 설정 → app_settings 테이블 사용
//      (별도 테이블은 구조화된 배열/객체 데이터일 때만 신설)
//
// ── 규칙 3. Supabase 테이블 현황 ────────────────────────────
//  bets            → 베팅 기록
//  deposits        → 입금 기록
//  withdrawals     → 출금 기록
//  site_states     → 사이트별 잔액/상태
//  custom_leagues  → 사용자 추가 리그
//  esports_records → E스포츠 기록
//  profit_extras   → 기타 수익
//  manual_games    → 수동 경기 등록
//  m_meta          → 종목/국가/리그 메타데이터
//  point_sites     → 포인트 교환 사이트
//  daily_quests    → 일일 퀘스트
//  code_memos      → 코드 수정 메모
//  team_names      → 팀명 한글 매핑
//  fixtures        → API-Sports 경기 캐시 (클라이언트가 직접 채움)
//  api_fetch_log   → (rev.7부터 미사용 — 호환을 위해 테이블만 유지)
//  app_settings    → 기타 설정 key-value
//                    현재 키 목록:
//                    · krw_sites           : 원화 사이트 목록
//                    · usd_sites           : 달러 사이트 목록
//                    · pext_sites          : 기타수익 사이트
//                    · pext_cats           : 기타수익 카테고리
//                    · pext_subcats        : 기타수익 서브카테고리
//                    · code_memo_draft     : 코드 메모 임시저장
//                    · league_api_map      : 리그-API 매핑
//                    · sports_test_league_map: 사용자리그 ↔ API리그 매핑
//                    · fixtures_cache_meta : 캐시 메타 (마지막 호출/콜수)
//
// ── 규칙 4. API-Sports 경기 데이터 (rev.7 변경됨) ──────────
//  rev.7부터: 클라이언트에서 fetch로 직접 API-Sports 호출.
//  Edge Function (fetch-fixtures)은 폐기 (Supabase에서 삭제 예정).
//  Supabase Cron도 삭제됨. 자동 호출은 일체 없음.
//
//  호출 정책:
//   · 사용자가 새로고침 버튼을 눌렀을 때만 호출.
//   · 캐시 신선(15분 이내)하면 API 호출 없이 fixtures 테이블만 다시 읽음.
//   · 강제 새로고침(⚡)은 캐시 무시하고 무조건 호출.
//   · 모바일 기기에서는 API 호출 자체를 막음 (IP 변동 위험).
//   · 활성 종목: ACTIVE_SPORTS 상수에 정의된 것만 호출 (현재 축구·야구·농구).
//   · 가져오는 날짜: KST 오늘+내일 2일치.
//
//  핵심 함수 (App 컴포넌트 내부):
//   · isMobileDevice()         : 모바일 감지
//   · refreshFixtures(force?)  : 새로고침 메인 (캐시 체크 + API 호출)
//   · fetchFromApiSports(...)  : 실제 API-Sports 호출
//   · fetchFixturesFromCache() : DB에서 읽기만
//
// ── 규칙 5. 에러 처리 ───────────────────────────────────────
//  로드 실패 시 빈 값 폴백 (throw 금지)
//  에러는 dataLoadErrors 배너로 사용자에게 표시
//
// ── 규칙 6. Claude에게 (파일 요청 기준) ─────────────────────
//  아래 작업은 App.tsx만으로 가능:
//    · UI 수정, 탭 추가/제거, 기존 기능 변경
//    · 이미 있는 테이블/app_settings 키 사용
//
//  아래 작업은 반드시 db.ts도 함께 요청할 것:
//    · 새로운 데이터를 Supabase에 저장해야 할 때
//    · app_settings에 새 키를 추가할 때
//    · AppSettingsBundle 타입 변경이 필요할 때
//    · 새 테이블용 load/upsert/delete 함수가 필요할 때
//
//  ⚠️ db.ts 없이 새 데이터를 추가하면 TypeScript 타입 오류 발생!
//  새 데이터 추가 시 Claude가 스스로 "db.ts도 주세요" 라고 요청할 것
//
// ── 환경변수 (Vercel) ────────────────────────────────────
//  VITE_API_SPORTS_KEY : API-Sports 키
//  키 미설정 시 새로고침 버튼은 안내 메시지를 띄우고 호출하지 않음.
//
// ─────────────────────────────────────────────────────────────
// rev.7 변경사항 (2026-04-25):
//  - Edge Function 폐기, 클라이언트 직접 호출로 회귀
//    (다만 결과는 Supabase fixtures에 그대로 저장 — 캐시 모델)
//  - Cron 제거, 자동 호출 useEffect 모두 제거
//  - 모바일 차단 로직 (IP 변동 위험 회피)
//  - 활성 종목 3종목으로 축소 (축구·야구·농구). 5종목 정의는 보존.
//  - 캐시 신선도 15분, 강제 새로고침 버튼 별도
//  - api_fetch_log 의존성 제거 → app_settings.fixtures_cache_meta 사용
// rev.6 (이전): Edge Function 자동 호출 시도 (계정 정지로 폐기)
// rev.5 (이전): 모든 사용자 데이터 Supabase 이관
// rev.4 (이전): 라이브 베팅 체크박스, 실시간 통계
// rev.3 (이전): API-Sports 직접 호출, 6종목 지원
// ─────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from "recharts";
import * as db from "./lib/db";
import { supabase } from "./lib/supabase";
import type { Bet, Deposit, Withdrawal, SiteState as SiteStateBase, Log, EsportsRecord, ProfitExtra } from "./types";

type SiteState = SiteStateBase & { pointTotal?: number };

// ── 테마 컬러 ─────────────────────────────────────────────────
const C = {
  bg:      "#111614",
  bg2:     "#182018",
  bg3:     "#1e261e",
  border:  "#2a3a2a",
  border2: "#344534",
  text:    "#dde8dd",
  muted:   "#7a9a7a",
  dim:     "#3a5a3a",
  green:   "#5ddb8a",
  orange:  "#f0944a",
  amber:   "#f5c842",
  red:     "#e05a5a",
  purple:  "#b07af5",
  teal:    "#4ad4c8",
};

// ══════════════════════════════════════════════════════════════
// rev.7: API-Sports 직접 호출 + DB 캐시 모델
// ══════════════════════════════════════════════════════════════
//   - Edge Function 폐기. 클라이언트가 직접 API-Sports에 fetch.
//   - 응답을 Supabase fixtures 테이블에 upsert (캐시).
//   - 다른 기기는 fixtures 테이블만 SELECT (읽기 전용).
//   - 모바일은 호출 자체 차단 (App 내부에서 isMobileDevice로 처리).
// ══════════════════════════════════════════════════════════════
type Sport = "football" | "baseball" | "basketball" | "volleyball" | "hockey";

interface LiveFixture {
  id: number;
  sport: Sport;
  league_id: number;
  league_name: string;
  country: string;
  home_team: string;
  away_team: string;
  start_time: string;
  status_short: string;
  status_long: string;
  elapsed: number | null;
  home_score: number | null;
  away_score: number | null;
}

// ── API-Sports 종목별 메타 (모듈 레벨 — 컴포넌트 외부에서도 사용) ──
// 5종목 정의는 보존. 실제 호출은 ACTIVE_SPORTS에 들어 있는 종목만.
// 새 종목을 활성화하려면 ACTIVE_SPORTS에 종목 id만 추가하면 끝.
const API_SPORTS_INFO = [
  { id:"football",   sport:"football"   as Sport, name:"⚽ 축구",  host:"v3.football.api-sports.io",   path:"fixtures", dailyLimit:100 },
  { id:"baseball",   sport:"baseball"   as Sport, name:"⚾ 야구",  host:"v1.baseball.api-sports.io",   path:"games",    dailyLimit:100 },
  { id:"basketball", sport:"basketball" as Sport, name:"🏀 농구",  host:"v1.basketball.api-sports.io", path:"games",    dailyLimit:100 },
  { id:"volleyball", sport:"volleyball" as Sport, name:"🏐 배구",  host:"v1.volleyball.api-sports.io", path:"games",    dailyLimit:100 },
  { id:"hockey",     sport:"hockey"     as Sport, name:"🏒 하키",  host:"v1.hockey.api-sports.io",     path:"games",    dailyLimit:100 },
] as const;

// ★ 활성 종목 — 여기에 추가하면 새로고침 시 호출됨. 나머지는 메타만 유지.
//   현재: 축구 + 야구 + 농구 (3종목). 새 API 키 안정화 후 배구/하키 추가 검토.
const ACTIVE_SPORTS: Sport[] = ["football", "baseball", "basketball"];

// ── 캐시 정책 ──────────────────────────────────────────────────
const CACHE_FRESH_MIN = 15;   // 15분 이내면 신선 → API 호출 안 함
const FETCH_DAYS = 3;         // KST 어제+오늘+내일 3일치

// ── 모바일 감지 ────────────────────────────────────────────────
// User-Agent 기반. 100% 정확하진 않지만 핸드폰 통신사 IP 차단 목적엔 충분.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Mobi|Android|iPhone|iPad|iPod|Mobile|Phone/i.test(ua);
}

// ── KST 날짜 헬퍼 ──────────────────────────────────────────────
function kstDateStr(offsetDays = 0): string {
  // KST = UTC + 9
  return new Date(Date.now() + (9 + offsetDays * 24) * 3_600_000)
    .toISOString().slice(0, 10);
}

// 점수 안전 변환 (API-Sports 응답 형태가 종목별로 다름)
function safeScore(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object") {
    if (typeof val.total === "number") return val.total;
    if (typeof val.total === "string") {
      const n = parseInt(val.total);
      return isNaN(n) ? null : n;
    }
  }
  if (typeof val === "string") {
    const n = parseInt(val);
    return isNaN(n) ? null : n;
  }
  return null;
}

// ── API-Sports 직접 호출 (한 종목 × 여러 날짜) ──────────────────
async function fetchSportFromApiSports(
  sport: Sport,
  dates: string[],
  apiKey: string
): Promise<{ rows: db.FixtureRow[]; calls: number; error?: string }> {
  if (!apiKey) return { rows: [], calls: 0, error: "API_SPORTS_KEY 미설정" };

  const info = API_SPORTS_INFO.find(a => a.sport === sport);
  if (!info) return { rows: [], calls: 0, error: `unknown sport: ${sport}` };

  const rows: db.FixtureRow[] = [];
  let calls = 0;
  let firstError: string | undefined;

  for (const date of dates) {
    const url = `https://${info.host}/${info.path}?date=${date}`;
    try {
      const r = await fetch(url, {
        headers: {
          "x-rapidapi-key":  apiKey,
          "x-rapidapi-host": info.host,
        },
      });
      calls++;
      if (!r.ok) {
        const msg = `HTTP ${r.status}`;
        if (!firstError) firstError = msg;
        // eslint-disable-next-line no-console
        console.warn(`[${sport}] ${date} ${msg}`);
        continue;
      }
      const j = await r.json();
      const arr: any[] = j?.response ?? [];
      const fetched_at = new Date().toISOString();

      for (const item of arr) {
        try {
          if (sport === "football") {
            const f = item.fixture, l = item.league, t = item.teams, g = item.goals;
            rows.push({
              fixture_id:   f.id,
              sport,
              league_id:    l.id        ?? 0,
              league_name:  l.name      ?? "",
              country:      l.country   || "",
              home_team:    t.home?.name || "",
              away_team:    t.away?.name || "",
              start_time:   f.date,
              status_short: f.status?.short   || "NS",
              status_long:  f.status?.long    || "",
              elapsed:      f.status?.elapsed ?? null,
              home_score:   safeScore(g?.home),
              away_score:   safeScore(g?.away),
              fetched_at,
            });
          } else {
            const l = item.league, t = item.teams, s = item.scores;
            rows.push({
              fixture_id:   item.id,
              sport,
              league_id:    l?.id        ?? 0,
              league_name:  l?.name      ?? "",
              country:      l?.country?.name || "",
              home_team:    t?.home?.name || "",
              away_team:    t?.away?.name || "",
              start_time:   item.date,
              status_short: item.status?.short || "NS",
              status_long:  item.status?.long  || "",
              elapsed:      item.status?.timer ?? null,
              home_score:   safeScore(s?.home),
              away_score:   safeScore(s?.away),
              fetched_at,
            });
          }
        } catch { /* 스킵 */ }
      }
    } catch (e: any) {
      calls++;
      const msg = String(e?.message ?? e);
      if (!firstError) firstError = msg;
      // eslint-disable-next-line no-console
      console.error(`[${sport}] ${date} fetch 실패:`, e);
    }
  }

  return { rows, calls, ...(firstError ? { error: firstError } : {}) };
}

async function fetchFixturesFromCache(sport: Sport): Promise<LiveFixture[]> {
  // 베팅 탭은 라이브 경기도 봐야 하므로 -3시간 ~ +30시간 범위로 조회 (rev.6 동작 유지)
  const from = new Date(Date.now() - 3  * 3_600_000).toISOString();
  const to   = new Date(Date.now() + 30 * 3_600_000).toISOString();
  const rows = await db.loadFixturesByRange(from, to, sport);
  return rows.map(row => ({
    id: row.fixture_id, sport: row.sport as Sport,
    league_id: row.league_id, league_name: row.league_name,
    country: row.country, home_team: row.home_team, away_team: row.away_team,
    start_time: row.start_time, status_short: row.status_short, status_long: row.status_long,
    elapsed: row.elapsed, home_score: row.home_score, away_score: row.away_score,
  }));
}

// ── DB 캐시: 모든 종목, KST 오늘+내일 (스포츠 테스트 탭에서 사용) ──
async function fetchAllFixturesUntilTomorrowKst(): Promise<LiveFixture[]> {
  // KST 오늘 00:00의 UTC ISO
  const nowKst = new Date(Date.now() + 9*3600_000);
  const yyyy = nowKst.getUTCFullYear();
  const mm = nowKst.getUTCMonth();
  const dd = nowKst.getUTCDate();
  // KST 오늘 00:00 → UTC -9시간
  const fromUtc = new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0) - 9*3600_000);
  // KST 모레 00:00 → UTC -9시간 (= 내일 23:59:59까지 포함)
  const toUtc = new Date(Date.UTC(yyyy, mm, dd+2, 0, 0, 0) - 9*3600_000);
  const rows = await db.loadFixturesByRange(fromUtc.toISOString(), toUtc.toISOString());
  return rows.map(row => ({
    id: row.fixture_id, sport: row.sport as Sport,
    league_id: row.league_id, league_name: row.league_name,
    country: row.country, home_team: row.home_team, away_team: row.away_team,
    start_time: row.start_time, status_short: row.status_short, status_long: row.status_long,
    elapsed: row.elapsed, home_score: row.home_score, away_score: row.away_score,
  }));
}
// ── 종목 메타 ────────────────────────────────────────────────
const SPORT_META: Record<Sport|"esports", {icon:string; label:string; color:string; kr:string}> = {
  football:   {icon:"⚽", label:"축구",    color:C.green,    kr:"축구"},
  baseball:   {icon:"⚾", label:"야구",    color:C.amber,    kr:"야구"},
  basketball: {icon:"🏀", label:"농구",    color:C.orange,   kr:"농구"},
  volleyball: {icon:"🏐", label:"배구",    color:C.teal,     kr:"배구"},
  hockey:     {icon:"🏒", label:"하키",    color:"#7ac4ff",  kr:"하키"},
  esports:    {icon:"🎮", label:"E스포츠", color:C.purple,   kr:"E스포츠"},
};
const SPORT_ORDER: (Sport|"esports")[] = ["football","baseball","basketball","volleyball","hockey","esports"];

// ── 국가 한글 매핑 ──────────────────────────────────────────
const COUNTRY_KR: Record<string,string> = {
  "England":"잉글랜드","Spain":"스페인","Germany":"독일","Italy":"이탈리아","France":"프랑스",
  "Netherlands":"네덜란드","Portugal":"포르투갈","Belgium":"벨기에","Turkey":"터키","Scotland":"스코틀랜드",
  "USA":"미국","Brazil":"브라질","Argentina":"아르헨티나","Mexico":"멕시코","Colombia":"콜롬비아",
  "Chile":"칠레","Peru":"페루","Bolivia":"볼리비아","Ecuador":"에콰도르","Uruguay":"우루과이",
  "Paraguay":"파라과이","Venezuela":"베네수엘라","Costa Rica":"코스타리카","Guatemala":"과테말라",
  "Japan":"일본","South Korea":"한국","South-Korea":"한국","Korea":"한국","China":"중국","Australia":"호주","India":"인도",
  "Saudi Arabia":"사우디","Saudi-Arabia":"사우디","UAE":"아랍에미리트","Qatar":"카타르","Iran":"이란","Iraq":"이라크",
  "Greece":"그리스","Croatia":"크로아티아","Serbia":"세르비아","Poland":"폴란드","Russia":"러시아",
  "Ukraine":"우크라이나","Czech Republic":"체코","Czech-Republic":"체코","Slovakia":"슬로바키아",
  "Hungary":"헝가리","Romania":"루마니아","Bulgaria":"불가리아","Austria":"오스트리아","Switzerland":"스위스",
  "Denmark":"덴마크","Sweden":"스웨덴","Norway":"노르웨이","Finland":"핀란드",
  "Nigeria":"나이지리아","Ghana":"가나","Egypt":"이집트","Morocco":"모로코","South Africa":"남아프리카",
  "Cameroon":"카메룬","Senegal":"세네갈","Algeria":"알제리","Tunisia":"튀니지",
  "World":"국제","Europe":"유럽","South America":"남미","Africa":"아프리카","Asia":"아시아",
  "Canada":"캐나다","Israel":"이스라엘","Cyprus":"키프로스","Albania":"알바니아",
  "North Korea":"북한","Indonesia":"인도네시아","Thailand":"태국","Vietnam":"베트남",
  "Malaysia":"말레이시아","Philippines":"필리핀","Singapore":"싱가포르",
  "International":"국제","United States":"미국","Republic of Ireland":"아일랜드",
  "Wales":"웨일즈","Northern Ireland":"북아일랜드","Taiwan":"대만","Chinese Taipei":"대만",
};
const ktr = (c:string) => COUNTRY_KR[c] || c || "";

// MLB 팀명
const MLB_TEAMS: Record<string,string> = {
  "Arizona Diamondbacks":"애리조나 다이아몬드백스","Atlanta Braves":"애틀랜타 브레이브스",
  "Baltimore Orioles":"볼티모어 오리올스","Boston Red Sox":"보스턴 레드삭스",
  "Chicago Cubs":"시카고 컵스","Chicago White Sox":"시카고 화이트삭스",
  "Cincinnati Reds":"신시내티 레즈","Cleveland Guardians":"클리블랜드 가디언스",
  "Colorado Rockies":"콜로라도 로키스","Detroit Tigers":"디트로이트 타이거스",
  "Houston Astros":"휴스턴 애스트로스","Kansas City Royals":"캔자스시티 로열스",
  "Los Angeles Angels":"LA 에인절스","Los Angeles Dodgers":"LA 다저스",
  "Miami Marlins":"마이애미 말린스","Milwaukee Brewers":"밀워키 브루어스",
  "Minnesota Twins":"미네소타 트윈스","New York Mets":"뉴욕 메츠",
  "New York Yankees":"뉴욕 양키스","Oakland Athletics":"오클랜드 애슬레틱스",
  "Athletics":"오클랜드 애슬레틱스","Philadelphia Phillies":"필라델피아 필리스",
  "Pittsburgh Pirates":"피츠버그 파이리츠","San Diego Padres":"샌디에이고 파드리스",
  "San Francisco Giants":"샌프란시스코 자이언츠","Seattle Mariners":"시애틀 매리너스",
  "St. Louis Cardinals":"세인트루이스 카디널스","Tampa Bay Rays":"탬파베이 레이스",
  "Texas Rangers":"텍사스 레인저스","Toronto Blue Jays":"토론토 블루제이스",
  "Washington Nationals":"워싱턴 내셔널스",
};
const NBA_TEAMS: Record<string,string> = {
  "Atlanta Hawks":"애틀랜타 호크스","Boston Celtics":"보스턴 셀틱스","Brooklyn Nets":"브루클린 네츠",
  "Charlotte Hornets":"샬럿 호네츠","Chicago Bulls":"시카고 불스","Cleveland Cavaliers":"클리블랜드 캐벌리어스",
  "Dallas Mavericks":"댈러스 매버릭스","Denver Nuggets":"덴버 너기츠","Detroit Pistons":"디트로이트 피스톤스",
  "Golden State Warriors":"골든스테이트 워리어스","Houston Rockets":"휴스턴 로케츠",
  "Indiana Pacers":"인디애나 페이서스","LA Clippers":"LA 클리퍼스","Los Angeles Clippers":"LA 클리퍼스",
  "Los Angeles Lakers":"LA 레이커스","Memphis Grizzlies":"멤피스 그리즐리스","Miami Heat":"마이애미 히트",
  "Milwaukee Bucks":"밀워키 벅스","Minnesota Timberwolves":"미네소타 팀버울브스",
  "New Orleans Pelicans":"뉴올리언스 펠리컨스","New York Knicks":"뉴욕 닉스",
  "Oklahoma City Thunder":"오클라호마시티 선더","Orlando Magic":"올랜도 매직",
  "Philadelphia 76ers":"필라델피아 세븐티식서스","Phoenix Suns":"피닉스 선즈",
  "Portland Trail Blazers":"포틀랜드 트레일블레이저스","Sacramento Kings":"새크라멘토 킹스",
  "San Antonio Spurs":"샌안토니오 스퍼스","Toronto Raptors":"토론토 랩터스",
  "Utah Jazz":"유타 재즈","Washington Wizards":"워싱턴 위저즈",
};
function translateTeamName(name: string, userMap: Record<string,string>): string {
  return userMap[name] || MLB_TEAMS[name] || NBA_TEAMS[name] || name;
}

type TeamNameMap = Record<string,string>;
// 팀명 매핑은 DB(team_names 테이블)에 저장됩니다. App 컴포넌트 내부에서
// useEffect로 db.loadTeamNames()를 호출해 teamNameMap state를 채웁니다.

function isLive(s:string){ return !["NS","FT","AET","FT_PEN","CANC","PST","ABD","AWD","WO","TBD","AOT","AP"].includes(s); }
function isFinished(s:string){ return ["FT","AET","FT_PEN","AOT","AP"].includes(s); }
function fmtKstTime(iso:string){ try{return new Date(iso).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false});}catch{return "";} }
function fmtKstDate(iso:string){ try{return new Date(iso).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul",month:"2-digit",day:"2-digit"});}catch{return "";} }

// ── 날짜 유틸 ──────────────────────────────────────────────────
const useTodayStr = () => {
  // KST(한국 시간) 기준으로 오늘 날짜 반환. 한국 자정에 정확히 갱신됨.
  const getKstDate = () => new Date(Date.now() + 9*3600_000).toISOString().slice(0,10);
  const [today, setToday] = useState(()=>getKstDate());
  useEffect(()=>{const id=setInterval(()=>{const n=getKstDate();setToday(p=>p!==n?n:p);},30000);return()=>clearInterval(id);},[]);
  return today;
};
const weekMonday = () => { const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day; d.setDate(d.getDate()+diff); return d.toISOString().slice(0,10); };

// ── 기본 사이트 상수 ───────────────────────────────────────────
const DEFAULT_KRW_SITES = ["이지벳","조인벳","벨라벳"];
const DEFAULT_USD_SITES = ["벳38","케이탑","벳16","고트벳","벳위즈"];

// ── 포인트 사이트 타입 ────────────────────────────────────────
interface PointSite {
  id: string;
  name: string;
  exchangeName: string;
  exchangeDate: string;
  targetAmount: number;
  targetSiteName?: string;  // 누적입금 기준 사이트 (없으면 전체)
  targetCycleDays?: number; // 목표 주기 (일수), 기본 14일(2주). 완료 후 다음 목표일까지의 기간
  sessions: PointSession[];
}
interface PointSession {
  id: string;
  completedAt: string;
  nextTargetDate: string;
}

// 일일 퀘스트
interface DailyQuest {
  id: string;
  name: string;
  createdAt: string;     // 생성 날짜 (출석체크 시작일 계산용)
  history: string[];     // 완료한 날짜 목록 (YYYY-MM-DD)
}

// 코드 수정 메모
interface CodeMemo {
  id: string;
  text: string;
  createdAt: string;     // ISO datetime
  applied: boolean;      // 반영 완료 여부
  appliedAt?: string;
}

const fmtDisp = (n:number,dollar:boolean) => dollar?`$${n%1===0?n:n.toFixed(2)}`:n.toLocaleString();
const fmtProfit = (n:number,dollar:boolean) => { const abs=Math.abs(n); const str=dollar?`$${abs%1===0?abs:abs.toFixed(2)}`:abs.toLocaleString(); return n>=0?`+${str}`:`-${str}`; };

const MAJOR:Record<string,string[]> = {
  축구:["프리미어리그","라리가","분데스리가","세리에A","리그1","챔피언스리그"],
  농구:["NBA","NCAA","유로리그"],
  야구:["MLB","KBO","NPB"],
  배구:["V리그 남자","V리그 여자"],
  E스포츠:["LCK","LPL","LEC","LCS","LCP","CBLOL"],
};
const EXTRA:Record<string,string[]> = {
  축구:["K리그","유로파리그","유로파컨퍼런스리그","UEFA 네이션스리그","에레디비시","포르투갈리그","터키 쉬퍼리그","벨기에 퍼스트A","MLS","브라질 세리에A","아르헨티나 프리메라","일본 J리그","호주 A리그"].sort(),
  농구:["NHL","NFL","UFC"].sort(),
  야구:[],
  배구:["이탈리아 세리에A","일본 V리그"].sort(),
  E스포츠:["MSI","롤드컵","발로란트 챔피언스","오버워치 리그"].sort(),
};

const getOptGroups = (cat:string) => {
  if(cat==="축구") return [{g:"홈",opts:["홈 0.5","홈 1.5","홈 2.5"]},{g:"원정",opts:["원정 0.5","원정 1.5","원정 2.5"]}];
  if(cat==="야구") return [{g:"승패",opts:["정배","역배"]},{g:"오버",opts:Array.from({length:9},(_,i)=>`${4.5+i} 오버`)},{g:"언더",opts:Array.from({length:9},(_,i)=>`${4.5+i} 언더`)}];
  if(cat==="농구") return [{g:"플핸",opts:Array.from({length:25},(_,i)=>`${5.5+i} 플핸`)},{g:"마핸",opts:Array.from({length:54},(_,i)=>`${(2.5+i).toFixed(1)} 마핸`)}];
  if(cat==="배구") return [{g:"승패",opts:["홈 승","원정 승"]},{g:"오버/언더",opts:["오버","언더"]}];
  return [];
};
const getDefaultGroup = (cat:string) => cat==="축구"?"홈":cat==="농구"?"플핸":cat==="야구"?"승패":"";
const getDefaultOpt = (_cat:string,_g:string,_league="") => "";

const TEAM_DB = ["뉴욕 양키스","LA 다저스","보스턴 레드삭스","시카고 컵스","샌프란시스코 자이언츠","휴스턴 애스트로스","애틀란타 브레이브스","뉴욕 메츠","필라델피아 필리스","샌디에이고 파드리스","시애틀 매리너스","토론토 블루제이스","미네소타 트윈스","클리블랜드 가디언스","텍사스 레인저스","탬파베이 레이스","볼티모어 오리올스","밀워키 브루어스","애리조나 다이아몬드백스","LA 에인절스","오클랜드 애슬레틱스","콜로라도 로키스","캔자스시티 로열스","피츠버그 파이리츠","신시내티 레즈","마이애미 말린스","워싱턴 내셔널스","디트로이트 타이거스","시카고 화이트삭스","세인트루이스 카디널스","LA 레이커스","골든스테이트 워리어스","보스턴 셀틱스","마이애미 히트","시카고 불스","브루클린 네츠","밀워키 벅스","피닉스 선즈","댈러스 매버릭스","덴버 너기츠","멤피스 그리즐리스","필라델피아 세븐티식서스","애틀란타 호크스","클리블랜드 캐벌리어스","뉴욕 닉스","토론토 랩터스","새크라멘토 킹스","뉴올리언스 펠리컨스","인디애나 페이서스","미네소타 팀버울브스","오클라호마시티 선더","포틀랜드 트레일블레이저스","유타 재즈","샌안토니오 스퍼스","샬럿 호네츠","워싱턴 위저즈","올랜도 매직","디트로이트 피스톤스","휴스턴 로케츠","LA 클리퍼스","맨체스터 시티","아스날","리버풀","첼시","맨체스터 유나이티드","토트넘","레알 마드리드","바르셀로나","아틀레티코 마드리드","바이에른 뮌헨","도르트문트","인테르 밀란","AC 밀란","유벤투스","파리 생제르맹","T1","Gen.G","DK","KT","BRO","NS","DRX","HLE","FNC","G2","C9","TL","NRG","100T","EG","FLY","BLG","JDG","EDG","WBG"];

const CATS = ["축구","농구","야구","배구","E스포츠"];
const SPORT_ICON:Record<string,string> = {"축구":"⚽","농구":"🏀","야구":"⚾","배구":"🏐","E스포츠":"🎮","하키":"🏒","모의":"🎯"};
const USD_TO_KRW = 1380;

const noSpin:React.CSSProperties = {MozAppearance:"textfield"} as any;
const S:React.CSSProperties = {width:"100%",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 9px",borderRadius:7,fontSize:13,...noSpin};
const L:React.CSSProperties = {fontSize:11,color:C.muted,marginBottom:3};

const KRW_HK=[10000,20000,30000,40000,50000];
const USD_HK=[10,20,30,40,50];

// ── 비밀번호 화면 ─────────────────────────────────────────────
function PasswordScreen({onAuth}:{onAuth:()=>void}) {
  const [pw,setPw]=useState("");
  const [err,setErr]=useState(false);
  const [shake,setShake]=useState(false);
  const handleSubmit=()=>{
    if(pw==="03144"){onAuth();}
    else{setErr(true);setShake(true);setPw("");setTimeout(()=>setShake(false),500);}
  };
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:20}}>
      <div style={{fontSize:36,marginBottom:4}}>⚡</div>
      <div style={{fontSize:22,fontWeight:900,letterSpacing:3,color:C.orange}}>BET TRACKER</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>관리자 인증이 필요합니다</div>
      <div style={{
        background:C.bg3,border:`1px solid ${err?C.red:C.border2}`,borderRadius:14,padding:"28px 32px",width:300,
        animation:shake?"shake 0.4s ease":"none",
      }}>
        <div style={{fontSize:12,color:C.muted,marginBottom:10,textAlign:"center"}}>🔒 비밀번호 입력</div>
        <input
          autoFocus type="password" value={pw}
          onChange={e=>{
            const v=e.target.value;
            setPw(v);setErr(false);
            // 입력 즉시 맞으면 바로 입장
            if(v==="03144"){onAuth();}
          }}
          onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
          placeholder="비밀번호"
          style={{...S,boxSizing:"border-box",textAlign:"center",fontSize:18,letterSpacing:6,marginBottom:12}}
        />
        {err&&<div style={{fontSize:11,color:C.red,textAlign:"center",marginBottom:8}}>비밀번호가 틀렸습니다</div>}
        <button onClick={handleSubmit} style={{width:"100%",background:`${C.orange}22`,border:`1px solid ${C.orange}`,color:C.orange,padding:"10px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:14}}>
          입장
        </button>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ── 공통 컴포넌트 ──────────────────────────────────────────────
function EditableCell({value,dollar,onSave,color}:{value:number,dollar:boolean,onSave:(v:number)=>void,color?:string}) {
  const [editing,setEditing]=useState(false); const [tmp,setTmp]=useState("");
  if(!editing) return <div onClick={()=>{setTmp(String(value));setEditing(true);}} style={{color:color??C.text,fontWeight:700,cursor:"pointer",textDecoration:"underline dotted",textDecorationColor:C.dim}}>{fmtDisp(value,dollar)}</div>;
  return <input autoFocus type="number" value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={()=>{const v=parseFloat(tmp);if(!isNaN(v)&&v>=0)onSave(v);setEditing(false);}} onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(tmp);if(!isNaN(v)&&v>=0)onSave(v);setEditing(false);}if(e.key==="Escape")setEditing(false);}} style={{width:"80px",background:C.bg,border:`1px solid ${C.teal}`,color:C.teal,padding:"2px 4px",borderRadius:4,fontSize:12,fontWeight:700,...noSpin}} onClick={e=>e.stopPropagation()} />;
}

// ── 실시간 환율 ──────────────────────────────────────────
async function fetchUsdKrw():Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    return Math.round(d?.rates?.KRW??1380);
  } catch { return 1380; }
}

// ═════════════════════════════════════════════════════════════
// ErrorBoundary - 어떤 에러가 나도 흰 화면 안 나오게 방어
// ═════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component<{children:React.ReactNode},{err:Error|null}> {
  constructor(p:any){super(p);this.state={err:null};}
  static getDerivedStateFromError(err:Error){return {err};}
  componentDidCatch(err:Error,info:any){console.error("[BetTracker Crash]",err,info);}
  render(){
    if(this.state.err){
      return (
        <div style={{minHeight:"100vh",background:"#111614",color:"#dde8dd",padding:24,fontFamily:"system-ui"}}>
          <div style={{fontSize:20,color:"#e05a5a",fontWeight:900,marginBottom:12}}>⚠ 앱에 에러가 발생했습니다</div>
          <div style={{fontSize:12,color:"#7a9a7a",marginBottom:8}}>에러 메시지:</div>
          <pre style={{background:"#1e261e",border:"1px solid #2a3a2a",borderRadius:8,padding:12,fontSize:11,overflow:"auto",color:"#f0944a",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
{String(this.state.err?.message || this.state.err)}
{"\n\n"}
{String(this.state.err?.stack || "")}
          </pre>
          {/* 사용자 데이터는 Supabase에 있으므로 localStorage(API 캐시)만 비움. */}
          <button onClick={()=>{try{sessionStorage.clear();localStorage.clear();}catch{};location.reload();}}
            style={{marginTop:16,padding:"10px 20px",background:"#5ddb8a22",border:"1px solid #5ddb8a",color:"#5ddb8a",borderRadius:8,cursor:"pointer",fontWeight:700}}>
            🔄 세션 초기화 후 다시 시작
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═════════════════════════════════════════════════════════════
export default function AppWrapper() {
  return <ErrorBoundary><AppMain/></ErrorBoundary>;
}

function AppMain() {
  // ── 비밀번호 / 세션 ───────────────────────────────────────
  const [authed,setAuthed]=useState(()=>{
    try{const v=sessionStorage.getItem("bt_auth");const t=sessionStorage.getItem("bt_auth_ts");
    if(v==="1"&&t&&Date.now()-parseInt(t)<2*60*60*1000)return true;}catch{}return false;
  });
  const lastActivity=useRef(Date.now());
  const handleAuth=()=>{setAuthed(true);try{sessionStorage.setItem("bt_auth","1");sessionStorage.setItem("bt_auth_ts",String(Date.now()));}catch{}};
  const logout=useCallback(()=>{setAuthed(false);try{sessionStorage.removeItem("bt_auth");sessionStorage.removeItem("bt_auth_ts");}catch{};},[]);

  useEffect(()=>{
    if(!authed)return;
    const reset=()=>{lastActivity.current=Date.now();try{sessionStorage.setItem("bt_auth_ts",String(Date.now()));}catch{}};
    window.addEventListener("mousemove",reset);window.addEventListener("keydown",reset);window.addEventListener("click",reset);window.addEventListener("touchstart",reset);
    const id=setInterval(()=>{if(Date.now()-lastActivity.current>2*60*60*1000)logout();},60000);
    return()=>{window.removeEventListener("mousemove",reset);window.removeEventListener("keydown",reset);window.removeEventListener("click",reset);window.removeEventListener("touchstart",reset);clearInterval(id);};
  },[authed,logout]);

  const today = useTodayStr();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab,setTab]=useState<"home"|"bettingCombo"|"stats"|"roi"|"strategy"|"log"|"pending"|"apiManager"|"dataManager">("home");
  // ── 데이터 탭 state ────────────────────────────────────────
  const [dataTableStats,setDataTableStats]=useState<Record<string,{rows:number,size:string,sizeBytes:number}>>({});
  const [dataStatsLoading,setDataStatsLoading]=useState(false);
  const [dataTotalSize,setDataTotalSize]=useState("");
  const [statTab,setStatTab]=useState<"overview"|"daily"|"live"|"baseball"|"football"|"basketball"|"adv">("overview");
  const [bbSub,setBbSub]=useState<"league"|"option">("league");
  const [advCat,setAdvCat]=useState("축구");
  const [advMode,setAdvMode]=useState<"league"|"option">("league");
  const [showOldDone,setShowOldDone]=useState(false);
  const [stratCat,setStratCat]=useState("축구");
  const [esportsStratLeague,setEsportsStratLeague]=useState("LCK");

  // ── 사이트 목록 ────────────────────────────────────────────
  // 🔒 DB(app_settings 테이블의 krw_sites/usd_sites 키)에 저장됨.
  //    초기값은 DEFAULT 리스트 (DB 로드 전까지 임시 사용),
  //    useEffect에서 DB 로드 후 덮어씌움.
  const [krwSites,setKrwSites]=useState<string[]>(DEFAULT_KRW_SITES);
  const [usdSites,setUsdSites]=useState<string[]>(DEFAULT_USD_SITES);
  const ALL_SITES = useMemo(()=>[...krwSites,...usdSites],[krwSites,usdSites]);
  const isUSD = useCallback((s:string)=>usdSites.includes(s),[usdSites]);

  const saveKrwSites=(sites:string[])=>{setKrwSites(sites);db.saveAppSetting("krw_sites",sites);};
  const saveUsdSites=(sites:string[])=>{setUsdSites(sites);db.saveAppSetting("usd_sites",sites);};

  const [siteManageModal,setSiteManageModal]=useState(false);
  const [newSiteName,setNewSiteName]=useState("");
  const [newSiteType,setNewSiteType]=useState<"krw"|"usd">("krw");

  const handleAddSite=()=>{
    const name=newSiteName.trim();if(!name)return;
    if(ALL_SITES.includes(name))return alert("이미 존재하는 사이트입니다.");
    if(newSiteType==="krw")saveKrwSites([...krwSites,name]);
    else saveUsdSites([...usdSites,name]);
    setNewSiteName("");
  };
  const handleDeleteSite=(site:string)=>{
    if(!window.confirm(`"${site}" 사이트를 삭제하시겠습니까?`))return;
    if(krwSites.includes(site))saveKrwSites(krwSites.filter(s=>s!==site));
    else saveUsdSites(usdSites.filter(s=>s!==site));
  };

  // ── 팀명/국가/리그 한글 매핑 ─────────────────────────────────
  // 🔒 DB(team_names 테이블)에 저장됨. 초기값은 빈 객체, useEffect에서 로드.
  // 국가/리그는 키에 prefix("country:", "league:")를 붙여 같은 테이블에 저장.
  const [teamNameMap,setTeamNameMap] = useState<Record<string,string>>({});
  const [countryNameMap,setCountryNameMap] = useState<Record<string,string>>({});
  const [leagueNameMap,setLeagueNameMap] = useState<Record<string,string>>({});
  const [teamNameModal,setTeamNameModal] = useState(false);
  const [tnSearch,setTnSearch] = useState("");
  const [tnNewEng,setTnNewEng] = useState("");
  const [tnNewKor,setTnNewKor] = useState("");

  // 인라인 이름 편집 모달 (스포츠 테스트 탭용)
  // type: "team" | "country" | "league"
  const [editNameModal,setEditNameModal] = useState<{type:"team"|"country"|"league"; original:string; current:string}|null>(null);
  const [editNameInput,setEditNameInput] = useState("");

  const saveTeamNameEntry = (eng:string,kor:string) => {
    const e = eng.trim(), k = kor.trim();
    if (!e || !k) return;
    const m = {...teamNameMap,[e]:k};
    setTeamNameMap(m);
    db.upsertTeamName(e, k);
  };
  const deleteTeamNameEntry = (eng:string) => {
    const m = {...teamNameMap}; delete m[eng];
    setTeamNameMap(m);
    db.deleteTeamName(eng);
  };

  // 국가/리그 매핑 저장/삭제 (prefix 사용)
  const saveCountryName = (orig:string, kor:string) => {
    const o = orig.trim(), k = kor.trim();
    if (!o) return;
    if (!k) {
      // 빈 값이면 삭제
      const m = {...countryNameMap}; delete m[o];
      setCountryNameMap(m);
      db.deleteTeamName(`country:${o}`);
      return;
    }
    const m = {...countryNameMap, [o]:k};
    setCountryNameMap(m);
    db.upsertTeamName(`country:${o}`, k);
  };
  const saveLeagueName = (orig:string, kor:string) => {
    const o = orig.trim(), k = kor.trim();
    if (!o) return;
    if (!k) {
      const m = {...leagueNameMap}; delete m[o];
      setLeagueNameMap(m);
      db.deleteTeamName(`league:${o}`);
      return;
    }
    const m = {...leagueNameMap, [o]:k};
    setLeagueNameMap(m);
    db.upsertTeamName(`league:${o}`, k);
  };

  const t = (name:string) => translateTeamName(name, teamNameMap);

  // ══════════════════════════════════════════════════════════
  // rev.7: fixtures 재로드 nonce
  //   refreshFixtures()가 이 nonce들을 증가시키면 sportsTest/bettingCombo
  //   탭의 useEffect가 watch하다가 DB에서 다시 읽음.
  //   ※ useState 호이스팅 없음 — 사용 위치보다 위에 선언해야 함.
  // ══════════════════════════════════════════════════════════
  const [sportsTestReloadNonce, setSportsTestReloadNonce] = useState(0);
  const [bettingFixturesReloadNonce, setBettingFixturesReloadNonce] = useState(0);

  // ══════════════════════════════════════════════════════════
  // 베팅 탭 상태 (rev.7: DB 캐시만 읽음. API 호출은 refreshFixtures가 담당)
  // ══════════════════════════════════════════════════════════
  const [bettingSport,setBettingSport]=useState<Sport|"esports">("football");
  const [bettingFixtures,setBettingFixtures]=useState<LiveFixture[]>([]);
  const [bettingLoading,setBettingLoading]=useState(false);
  const [bettingError,setBettingError]=useState("");
  const [bettingCacheInfo,setBettingCacheInfo]=useState<{fetchedAt:number|null; expiresAt:number|null}>({fetchedAt:null,expiresAt:null});
  const [nowTick,setNowTick]=useState(Date.now());

  const [bettingCountry,setBettingCountry]=useState<string>("");
  const [bettingLeague,setBettingLeague]=useState<string>("");
  const [bettingExpandedGameId,setBettingExpandedGameId]=useState<number|null>(null);

  const loadBettingData = useCallback(async(_force = false)=>{
    // _force는 호환을 위해 시그니처에 남겨두지만 본 함수는 항상 DB 캐시만 읽음.
    // 진짜 API 호출은 refreshFixtures(force) — 새로고침 버튼에서만.
    if (bettingSport === "esports") { setBettingFixtures([]); return; }
    setBettingLoading(true); setBettingError("");
    try {
      const data = await fetchFixturesFromCache(bettingSport);
      setBettingFixtures(data);
      setBettingCacheInfo({fetchedAt: Date.now(), expiresAt: null});
      if (data.length === 0) setBettingError("경기 데이터가 없습니다 (PC에서 새로고침 후 표시됩니다)");
    } catch(e:any) {
      setBettingError(e?.message || "불러오기 실패");
    } finally { setBettingLoading(false); }
  },[bettingSport]);

  // 매 30초마다 캐시 남은 시간 UI 갱신
  useEffect(()=>{
    const id = setInterval(()=>setNowTick(Date.now()), 30_000);
    return ()=>clearInterval(id);
  },[]);

  // 스포츠 탭(bettingCombo) 진입 또는 새로고침(nonce) 시 DB에서 로드
  // bettingFixturesReloadNonce, sportsTestReloadNonce 둘 다 watch
  useEffect(()=>{
    if (tab === "bettingCombo") loadSportsTestData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab, sportsTestReloadNonce, bettingFixturesReloadNonce]);

  // ※ rev.7: 15분 자동 갱신 useEffect 제거.
  const [stFixtures,setStFixtures]=useState<LiveFixture[]>([]);
  const [stLoading,setStLoading]=useState(false);
  const [stError,setStError]=useState("");
  const [stExpandedSports,setStExpandedSports]=useState<Record<string,boolean>>({football:true});
  const [stExpandedCountries,setStExpandedCountries]=useState<Record<string,boolean>>({});
  const [stSelSport,setStSelSport]=useState<Sport|"">("");
  const [stSelCountry,setStSelCountry]=useState("");
  const [stSelLeague,setStSelLeague]=useState("");
  const [stExpandedGameId,setStExpandedGameId]=useState<number|null>(null);
  const [stFetchedAt,setStFetchedAt]=useState<number|null>(null);

  const loadSportsTestData = useCallback(async()=>{
    setStLoading(true); setStError("");
    try {
      const data = await fetchAllFixturesUntilTomorrowKst();
      setStFixtures(data);
      setStFetchedAt(Date.now());
      if (data.length === 0) setStError("오늘+내일 경기 데이터가 없습니다");
    } catch(e:any) {
      setStError(e?.message || "불러오기 실패");
    } finally { setStLoading(false); }
  },[]);

  // ── 베팅 슬립 ──────────────────────────────────────────────
  interface SlipItem {
    id: string;
    game: LiveFixture;
    optLabel: string;
    odds: number;
  }
  const [slip,setSlip]=useState<SlipItem[]>([]);
  const [slipSite,setSlipSite]=useState<string>("");
  const [slipAmount,setSlipAmount]=useState<number>(10000);
  const [slipInclude,setSlipInclude]=useState<boolean>(true);
  const [slipIsLive,setSlipIsLive]=useState<boolean>(false); // ⚡ 라이브(실시간) 베팅 여부

  const slipGameIds = useMemo(()=>new Set(slip.map(s=>s.id)), [slip]);

  const handleSlipPick = useCallback((game: LiveFixture, optLabel: string) => {
    const id = `${game.id}_${optLabel}`;
    setSlip(prev => {
      // 이미 같은 조합이면 제거 (토글)
      if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
      // 같은 경기의 다른 옵션이 있으면 제거하고 새것 추가
      const filtered = prev.filter(s => s.game.id !== game.id);
      return [...filtered, { id, game, optLabel, odds: 0 }];
    });
  },[]);

  const handleSlipAdd=()=>{
    if(slip.length===0) return alert("경기를 선택하세요.");
    if(!slipSite) return alert("베팅사이트를 선택해주세요.");
    const missingOdds = slip.find(s => !s.odds || s.odds < 1);
    if(missingOdds) return alert(`${missingOdds.game.home_team} vs ${missingOdds.game.away_team} 의 배당률을 입력해주세요.`);

    const dollar=isUSD(slipSite);
    slip.forEach(item=>{
      const homeKr=translateTeamName(item.game.home_team, teamNameMap);
      const awayKr=translateTeamName(item.game.away_team, teamNameMap);
      const teamName =
        item.optLabel === "홈승" ? homeKr :
        item.optLabel === "원정승" ? awayKr :
        item.optLabel === "무승부" ? "무승부" : "";
      // league_id < 0 이면 수동 경기 (manualFixtures에서 id=-1로 변환됨)
      const isManual = item.game.league_id < 0;
      const bet:Bet={
        id:String(Date.now()+Math.random()),date:today,
        category:SPORT_META[item.game.sport]?.kr || item.game.sport,
        league:item.game.league_name,site:slipSite,
        betOption:item.optLabel,homeTeam:homeKr,awayTeam:awayKr,teamName,
        amount:slipAmount,odds:item.odds,profit:null,result:"진행중",
        includeStats:slipInclude,isDollar:dollar,
        ...({
          country: ktr(item.game.country) || stSelCountry || "",
          isLive: slipIsLive,
          // rev.8: 자동 결제용
          fixtureId: isManual ? null : item.game.id,
          fixtureSport: isManual ? null : item.game.sport,
          isManual,
        } as any),
      };
      setBetsRaw(b=>[...b,bet]);db.upsertBet(bet);
      const newSS={...siteStates,[slipSite]:{...siteStates[slipSite],betTotal:parseFloat((siteStates[slipSite].betTotal+slipAmount).toFixed(2))}};
      setSiteStatesRaw(newSS);db.upsertSiteState(slipSite,newSS[slipSite]);
      addLog("➕ 베팅",`${homeKr} vs ${awayKr}/${item.optLabel}/${fmtDisp(slipAmount,dollar)}`);
    });
    setSlip([]);
  };

  // 모의 베팅 (사용 안 하지만 타입 호환)
  const [mockBets,setMockBets]=useState<Bet[]>([]);
  const removeMockBet=(id:string)=>setMockBets(p=>p.filter(b=>b.id!==id));

  // ══════════════════════════════════════════════════════════
  // 수동 경기 시스템 (bettingManual 탭 - 기본 베팅)
  // ══════════════════════════════════════════════════════════
  interface ManualGame {
    id: string;
    country: string;
    league: string;
    homeTeam: string;
    awayTeam: string;
    sportCat: string;    // 축구/야구/농구/배구/E스포츠/하키/기타
    createdAt: number;
    homeScore?: number;   // 라이브 스코어 - 홈
    awayScore?: number;   // 라이브 스코어 - 원정
    finished?: boolean;   // 경기 종료 여부 (도장)
  }
  // 🔒 DB(manual_games 테이블)에 저장됨. 빈 배열로 시작, useEffect에서 로드.
  const [manualGames,setManualGames]=useState<ManualGame[]>([]);
  // 배열 전체를 받아서 diff → DB에 반영. 기존 호출부 그대로 사용 가능.
  const saveManualGames=(gs:ManualGame[])=>{
    setManualGames(prev=>{
      const prevMap=new Map(prev.map(g=>[g.id,g]));
      const nextMap=new Map(gs.map(g=>[g.id,g]));
      // 삭제
      for(const id of prevMap.keys()) if(!nextMap.has(id)) db.deleteManualGame(id);
      // 추가/변경 (얕은 비교로 충분 - 필드 숫자/불린/문자열만)
      for(const g of gs){
        const p=prevMap.get(g.id);
        if(!p||p.homeScore!==g.homeScore||p.awayScore!==g.awayScore||p.finished!==g.finished||
           p.country!==g.country||p.league!==g.league||p.sportCat!==g.sportCat||
           p.homeTeam!==g.homeTeam||p.awayTeam!==g.awayTeam){
          db.upsertManualGame({
            id:g.id,sportCat:g.sportCat,country:g.country,league:g.league,
            homeTeam:g.homeTeam,awayTeam:g.awayTeam,createdAt:g.createdAt,
            homeScore:g.homeScore,awayScore:g.awayScore,finished:g.finished,
          });
        }
      }
      return gs;
    });
  };

  // 커스텀 종목/국가/리그 목록 (경기 없어도 유지)
  // 🔒 DB(m_meta 테이블)에 저장됨. 빈 값으로 시작, useEffect에서 로드.
  const DEFAULT_SPORTS = ["축구","야구","농구","배구","하키","E스포츠"];
  const [customSports,setCustomSports]=useState<string[]>([]);
  const saveCustomSports=(l:string[])=>{
    setCustomSports(prev=>{
      const prevSet=new Set(prev), nextSet=new Set(l);
      for(const s of prev) if(!nextSet.has(s)) db.deleteMMeta(db.mMetaId("sport",s,"",s));
      for(const s of l) if(!prevSet.has(s)) db.upsertMMeta({id:db.mMetaId("sport",s,"",s),type:"sport",sport:s,country:"",name:s});
      return l;
    });
  };
  const allSportsList = useMemo(()=>{
    const base=[...DEFAULT_SPORTS];
    for(const c of customSports) if(!base.includes(c)) base.push(c);
    return base;
  },[customSports]);

  // { sport: { country: [leagues...] } }
  // 🔒 DB(m_meta 테이블, type='country')에 저장됨.
  const [mCountries,setMCountries]=useState<Record<string,string[]>>({});
  const saveMCountries=(m:Record<string,string[]>)=>{
    setMCountries(prev=>{
      // 각 sport별 diff 계산
      const allSports=new Set([...Object.keys(prev),...Object.keys(m)]);
      for(const sport of allSports){
        const before=new Set(prev[sport]||[]);
        const after=new Set(m[sport]||[]);
        for(const c of before) if(!after.has(c)) db.deleteMMeta(db.mMetaId("country",sport,"",c));
        for(const c of after) if(!before.has(c)) db.upsertMMeta({id:db.mMetaId("country",sport,"",c),type:"country",sport,country:"",name:c});
      }
      return m;
    });
  };

  // 🔒 DB(m_meta 테이블, type='league')에 저장됨.
  // key: `${sport}__${country}`, value: leagues
  const [mLeagues,setMLeagues]=useState<Record<string,string[]>>({});
  const saveMLeaguesStore=(m:Record<string,string[]>)=>{
    setMLeagues(prev=>{
      const allKeys=new Set([...Object.keys(prev),...Object.keys(m)]);
      for(const key of allKeys){
        const [sport,country]=key.split("__");
        if(!sport||country===undefined) continue;
        const before=new Set(prev[key]||[]);
        const after=new Set(m[key]||[]);
        for(const l of before) if(!after.has(l)) db.deleteMMeta(db.mMetaId("league",sport,country,l));
        for(const l of after) if(!before.has(l)) db.upsertMMeta({id:db.mMetaId("league",sport,country,l),type:"league",sport,country,name:l});
      }
      return m;
    });
  };

  // 경기에서 자동 추론한 것 + 수동 추가한 것을 합친 뷰
  const allCountriesForSport = useCallback((sport:string):string[]=>{
    const set = new Set<string>();
    manualGames.forEach(g=>{if(g.sportCat===sport)set.add(g.country);});
    (mCountries[sport]||[]).forEach(c=>set.add(c));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,"ko"));
  },[manualGames,mCountries]);

  const allLeaguesForCountry = useCallback((sport:string,country:string):string[]=>{
    const set = new Set<string>();
    manualGames.forEach(g=>{if(g.sportCat===sport&&g.country===country)set.add(g.league);});
    (mLeagues[`${sport}__${country}`]||[]).forEach(l=>set.add(l));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,"ko"));
  },[manualGames,mLeagues]);

  // 선택 상태
  const [mSport,setMSport]=useState<string>("축구");
  const [mCountry,setMCountry]=useState<string>("");
  const [mLeague,setMLeague]=useState<string>("");
  // 트리 확장 상태 (종목별 접기/펼치기)
  const [mExpandedSports,setMExpandedSports]=useState<Record<string,boolean>>({"축구":true});
  const [mExpandedCountries,setMExpandedCountries]=useState<Record<string,boolean>>({});
  const [mExpandedLeagues,setMExpandedLeagues]=useState<Record<string,boolean>>({});

  // 모달 상태
  const [addGameModal,setAddGameModal]=useState(false);
  const [newGame,setNewGame]=useState({homeTeam:"",awayTeam:""});
  const [addSportModal,setAddSportModal]=useState(false);
  const [newSportName,setNewSportName]=useState("");
  const [addCountryModal,setAddCountryModal]=useState<{sport:string}|null>(null);
  const [newCountryName,setNewCountryName]=useState("");
  const [addLeagueModalM,setAddLeagueModalM]=useState<{sport:string;country:string}|null>(null);
  const [newLeagueNameM,setNewLeagueNameM]=useState("");

  const handleAddManualGame=(continueAdd=false)=>{
    const {homeTeam,awayTeam}=newGame;
    if(!mSport||!mCountry||!mLeague)return alert("먼저 좌측에서 종목/국가/리그를 선택해주세요.");
    if(!homeTeam.trim()||!awayTeam.trim())return alert("홈팀과 원정팀을 입력해주세요.");
    const h=homeTeam.trim(), a=awayTeam.trim();
    if (h===a) return alert("홈팀과 원정팀이 같을 수 없습니다.");
    // 중복 체크: 같은 종목/국가/리그/홈팀/원정팀 + 미종료
    const dup = manualGames.find(x =>
      x.sportCat===mSport && x.country===mCountry && x.league===mLeague &&
      x.homeTeam===h && x.awayTeam===a && !x.finished
    );
    if (dup) return alert(`이미 추가된 경기입니다.\n${mCountry}/${mLeague}\n${h} vs ${a}`);
    const g:ManualGame={
      id:String(Date.now()),
      country:mCountry,league:mLeague,
      homeTeam:h,awayTeam:a,
      sportCat:mSport,createdAt:Date.now(),
    };
    saveManualGames([g,...manualGames]);
    setNewGame({homeTeam:"",awayTeam:""});
    addLog("➕ 경기 추가",`${mCountry}/${mLeague}/${h} vs ${a}`);
    if (continueAdd) {
      // 모달 유지, 홈팀 input으로 포커스 이동
      setTimeout(()=>{const el=document.getElementById("add-game-home")as HTMLInputElement|null;if(el)el.focus();},30);
    } else {
      // 모달 닫고 추가한 경기 자동 선택 (베팅 옵션 영역이 바로 보이도록)
      setManualExpandedId(g.id);
      setAddGameModal(false);
    }
  };

  const handleAddSport=()=>{
    const n=newSportName.trim();if(!n)return;
    if(allSportsList.includes(n))return alert(`이미 존재하는 종목입니다: "${n}"`);
    saveCustomSports([...customSports,n]);
    setAddSportModal(false);setNewSportName("");
    setMExpandedSports(p=>({...p,[n]:true}));
  };

  const handleAddCountry=(continueToLeague=false)=>{
    if(!addCountryModal)return;
    const n=newCountryName.trim();if(!n)return;
    const sport=addCountryModal.sport;
    const list=mCountries[sport]||[];
    if(list.includes(n)||allCountriesForSport(sport).includes(n)){
      if(!continueToLeague) return alert(`이미 존재하는 국가입니다: "${sport} / ${n}"`);
      // 이미 있으면 그냥 바로 리그 추가로 넘어감
      setAddCountryModal(null);setNewCountryName("");
      setAddLeagueModalM({sport,country:n});
      return;
    }
    saveMCountries({...mCountries,[sport]:[...list,n]});
    setMExpandedCountries(p=>({...p,[`${sport}__${n}`]:true}));
    setAddCountryModal(null);setNewCountryName("");
    if (continueToLeague) {
      // 바로 리그 추가 모달 열기
      setAddLeagueModalM({sport,country:n});
    }
  };

  const handleAddLeagueM=()=>{
    if(!addLeagueModalM)return;
    const n=newLeagueNameM.trim();if(!n)return;
    const {sport,country}=addLeagueModalM;
    const key=`${sport}__${country}`;
    const list=mLeagues[key]||[];
    if(list.includes(n)||allLeaguesForCountry(sport,country).includes(n))return alert(`이미 존재하는 리그입니다: "${sport} / ${country} / ${n}"`);
    saveMLeaguesStore({...mLeagues,[key]:[...list,n]});
    // 추가된 리그 자동 선택
    setMSport(sport);
    setMCountry(country);
    setMLeague(n);
    setMExpandedSports(p=>({...p,[sport]:true}));
    setMExpandedCountries(p=>({...p,[key]:true}));
    setManualExpandedId(null);
    setAddLeagueModalM(null);setNewLeagueNameM("");
  };

  // ── 이름 수정 모달 상태 ──
  const [editMetaModal,setEditMetaModal]=useState<{type:"sport"|"country"|"league";sport?:string;country?:string;league?:string;oldName:string}|null>(null);
  const [editMetaNewName,setEditMetaNewName]=useState("");

  const handleEditMeta=()=>{
    if(!editMetaModal)return;
    const newName=editMetaNewName.trim();if(!newName)return;
    if(newName===editMetaModal.oldName){setEditMetaModal(null);return;}

    if(editMetaModal.type==="sport"){
      const oldName=editMetaModal.oldName;
      // 기본 종목도 수정 허용: customSports 업데이트 + 경기 데이터 sportCat 변경
      const idx=customSports.indexOf(oldName);
      if(idx>=0){
        const newList=[...customSports]; newList[idx]=newName;
        saveCustomSports(newList);
      } else {
        // 기본 종목을 수정할 때는 customSports에 새 이름 추가 (원본 숨김)
        // 그런데 DEFAULT_SPORTS는 하드코딩이라 무시되므로 customSports에 추가
        if(!allSportsList.includes(newName)) saveCustomSports([...customSports,newName]);
      }
      // 관련 데이터 마이그레이션
      saveManualGames(manualGames.map(g=>g.sportCat===oldName?{...g,sportCat:newName}:g));
      const newCountries={...mCountries};
      if(newCountries[oldName]){newCountries[newName]=newCountries[oldName];delete newCountries[oldName];saveMCountries(newCountries);}
      const newLeagues={...mLeagues};
      Object.keys(newLeagues).forEach(k=>{
        if(k.startsWith(oldName+"__")){const newKey=newName+k.substring(oldName.length);newLeagues[newKey]=newLeagues[k];delete newLeagues[k];}
      });
      saveMLeaguesStore(newLeagues);
      if(mSport===oldName)setMSport(newName);
      addLog("✏️ 종목 수정",`${oldName} → ${newName}`);
    }
    else if(editMetaModal.type==="country"){
      const {sport,oldName}=editMetaModal;
      if(!sport)return;
      // mCountries 업데이트
      const list=mCountries[sport]||[];
      const idx=list.indexOf(oldName);
      if(idx>=0){
        const newList=[...list];newList[idx]=newName;
        saveMCountries({...mCountries,[sport]:newList});
      } else {
        saveMCountries({...mCountries,[sport]:[...list,newName]});
      }
      // 경기 데이터 업데이트
      saveManualGames(manualGames.map(g=>g.sportCat===sport&&g.country===oldName?{...g,country:newName}:g));
      // mLeagues 키 변경
      const oldKey=`${sport}__${oldName}`;const newKey=`${sport}__${newName}`;
      if(mLeagues[oldKey]){
        const newMap={...mLeagues};newMap[newKey]=newMap[oldKey];delete newMap[oldKey];
        saveMLeaguesStore(newMap);
      }
      if(mCountry===oldName)setMCountry(newName);
      addLog("✏️ 국가 수정",`${sport}/${oldName} → ${newName}`);
    }
    else if(editMetaModal.type==="league"){
      const {sport,country,oldName}=editMetaModal;
      if(!sport||!country)return;
      const key=`${sport}__${country}`;
      const list=mLeagues[key]||[];
      const idx=list.indexOf(oldName);
      if(idx>=0){
        const newList=[...list];newList[idx]=newName;
        saveMLeaguesStore({...mLeagues,[key]:newList});
      } else {
        saveMLeaguesStore({...mLeagues,[key]:[...list,newName]});
      }
      saveManualGames(manualGames.map(g=>g.sportCat===sport&&g.country===country&&g.league===oldName?{...g,league:newName}:g));
      if(mLeague===oldName)setMLeague(newName);
      addLog("✏️ 리그 수정",`${sport}/${country}/${oldName} → ${newName}`);
    }
    setEditMetaModal(null);setEditMetaNewName("");
  };

  // 카테고리 메타 삭제 (수정 모달에서)
  const handleDeleteMeta = () => {
    if(!editMetaModal)return;
    const {type,sport,country,oldName}=editMetaModal;

    if(type==="sport"){
      const relatedGames = manualGames.filter(g=>g.sportCat===oldName).length;
      if(!window.confirm(`종목 "${oldName}" 을(를) 삭제하시겠습니까?\n이 종목의 경기 ${relatedGames}개와 모든 국가/리그가 함께 삭제됩니다.\n\n(진행중 베팅은 유지되지만 카테고리 링크가 끊어집니다.)`)) return;
      // customSports에서 제거
      saveCustomSports(customSports.filter(s=>s!==oldName));
      // 관련 경기 삭제
      saveManualGames(manualGames.filter(g=>g.sportCat!==oldName));
      // 관련 국가/리그 삭제
      const newCountries={...mCountries};delete newCountries[oldName];saveMCountries(newCountries);
      const newLeagues={...mLeagues};
      Object.keys(newLeagues).forEach(k=>{if(k.startsWith(oldName+"__"))delete newLeagues[k];});
      saveMLeaguesStore(newLeagues);
      if(mSport===oldName){setMSport("");setMCountry("");setMLeague("");}
      addLog("🗑 종목 삭제",oldName);
    }
    else if(type==="country" && sport){
      const relatedGames = manualGames.filter(g=>g.sportCat===sport&&g.country===oldName).length;
      if(!window.confirm(`국가 "${oldName}" 을(를) 삭제하시겠습니까?\n이 국가의 경기 ${relatedGames}개와 모든 리그가 함께 삭제됩니다.`)) return;
      // mCountries에서 제거
      saveMCountries({...mCountries,[sport]:(mCountries[sport]||[]).filter(c=>c!==oldName)});
      // 관련 경기 삭제
      saveManualGames(manualGames.filter(g=>!(g.sportCat===sport&&g.country===oldName)));
      // 관련 리그 삭제
      const oldKey=`${sport}__${oldName}`;
      const newLeagues={...mLeagues};delete newLeagues[oldKey];saveMLeaguesStore(newLeagues);
      if(mCountry===oldName){setMCountry("");setMLeague("");}
      addLog("🗑 국가 삭제",`${sport}/${oldName}`);
    }
    else if(type==="league" && sport && country){
      const relatedGames = manualGames.filter(g=>g.sportCat===sport&&g.country===country&&g.league===oldName).length;
      if(!window.confirm(`리그 "${oldName}" 을(를) 삭제하시겠습니까?\n이 리그의 경기 ${relatedGames}개가 함께 삭제됩니다.`)) return;
      const key=`${sport}__${country}`;
      saveMLeaguesStore({...mLeagues,[key]:(mLeagues[key]||[]).filter(l=>l!==oldName)});
      saveManualGames(manualGames.filter(g=>!(g.sportCat===sport&&g.country===country&&g.league===oldName)));
      if(mLeague===oldName)setMLeague("");
      addLog("🗑 리그 삭제",`${sport}/${country}/${oldName}`);
    }
    setEditMetaModal(null);setEditMetaNewName("");
  };

  const handleDeleteManualGame=(id:string)=>{
    if(!window.confirm("이 경기를 삭제하시겠습니까?"))return;
    saveManualGames(manualGames.filter(g=>g.id!==id));
    setManualSlip(p=>p.filter(s=>s.game.id!==id));
  };

  // 수동 경기 슬립
  interface ManualSlipItem {
    id: string;
    game: ManualGame;
    optLabel: string;
    odds: number;
  }
  const [manualSlip,setManualSlip]=useState<ManualSlipItem[]>([]);
  const [manualSlipSite,setManualSlipSite]=useState<string>("");
  const [manualSlipAmount,setManualSlipAmount]=useState<number>(10000);
  const [manualSlipInclude,setManualSlipInclude]=useState<boolean>(true);
  const [manualExpandedId,setManualExpandedId]=useState<string|null>(null);
  // 빠른 입금/포인트 모달 (홈 대시보드에서 호출)
  const [quickActionMode,setQuickActionMode]=useState<"deposit"|"point"|null>(null);
  const [quickActionSite,setQuickActionSite]=useState<string>("");
  const [quickActionAmt,setQuickActionAmt]=useState<number>(0);
  // 대시보드 인라인 입금/포인트 폼
  const [dashSite,setDashSite]=useState<string>("");
  const [dashAmt,setDashAmt]=useState<number>(0);

  const [slipOddsInputStr,setSlipOddsInputStr]=useState<string>(""); // 배당 입력 중인 문자열 (포커스 중에만 사용)
  // 농구 기타 베팅 수동 입력 모달 (마핸/플핸 숫자 직접 입력)
  const [customHandiModal,setCustomHandiModal]=useState<{game:ManualGame}|null>(null);
  const [customHandiType,setCustomHandiType]=useState<"플핸"|"마핸">("플핸");
  const [customHandiTeam,setCustomHandiTeam]=useState<"home"|"away">("home");
  const [customHandiLine,setCustomHandiLine]=useState<string>("");

  const manualSlipKeys = useMemo(()=>new Set(manualSlip.map(s=>s.id)),[manualSlip]);

  const handleManualSlipPick = (game: ManualGame, optLabel: string) => {
    const id = `${game.id}_${optLabel}`;
    setManualSlip(prev => {
      // 같은 옵션을 다시 누르면 제거 (토글)
      if (prev.some(s=>s.id===id)) return prev.filter(s=>s.id!==id);
      // 폴더베팅 없이 단일베팅만: 완전히 덮어씌움
      return [{id, game, optLabel, odds:0}];
    });
  };

  const handleManualSlipAdd=()=>{
    if(manualSlip.length===0)return alert("경기를 선택하세요.");
    if(!manualSlipSite)return alert("베팅사이트를 선택해주세요.");
    const missing = manualSlip.find(s => !s.odds || s.odds < 1);
    if(missing)return alert(`${missing.game.homeTeam} vs ${missing.game.awayTeam} 의 배당률을 입력해주세요.`);

    // 베팅 옵션 카테고리 분류 (승패 | 오언 | 핸디캡)
    const categorizeOpt = (opt:string): "승패"|"오언"|"핸디캡"|"기타" => {
      if (opt==="홈승"||opt==="원정승"||opt==="무승부") return "승패";
      if (opt.endsWith(" 승")) return "승패";
      if (/^(오버|언더)/.test(opt)) return "오언";
      if (/\([+-]?[\d.]+\)$/.test(opt)) return "핸디캡"; // "팀명 (1.5)" 형식
      return "기타";
    };

    // 같은 경기 + 같은 카테고리로 이미 진행중 베팅이 있는지 검사
    for (const item of manualSlip) {
      const g = item.game;
      const newCat = categorizeOpt(item.optLabel);
      const existing = pending.find(b => {
        if (!b.homeTeam || !b.awayTeam) return false;
        if (b.homeTeam !== g.homeTeam || b.awayTeam !== g.awayTeam) return false;
        if (b.league !== g.league) return false;
        return categorizeOpt(b.betOption) === newCat;
      });
      if (existing) {
        const existingDisplay = existing.betOption==="홈승" && existing.homeTeam ? `${existing.homeTeam} 승` :
                                existing.betOption==="원정승" && existing.awayTeam ? `${existing.awayTeam} 승` :
                                existing.betOption;
        const ok = window.confirm(
          `⚠️ 중복 베팅 경고\n\n` +
          `${g.homeTeam} vs ${g.awayTeam} 경기에\n` +
          `이미 "${newCat}" 카테고리로 베팅이 진행중입니다:\n\n` +
          `  기존: ${existingDisplay} (${existing.site}, ${fmtDisp(existing.amount,existing.isDollar)})\n` +
          `  신규: ${item.optLabel} (${manualSlipSite})\n\n` +
          `그래도 베팅하시겠습니까?`
        );
        if (!ok) return;
      }
    }

    const dollar=isUSD(manualSlipSite);
    manualSlip.forEach(item=>{
      const opt=item.optLabel;
      // ★ "홈승" → "한화 승", "원정승" → "LG 승" 형식으로 변환해서 저장
      const displayOpt =
        opt==="홈승" ? `${item.game.homeTeam} 승` :
        opt==="원정승" ? `${item.game.awayTeam} 승` :
        opt;
      // 선택한 옵션
      const teamName =
        opt==="홈승" ? item.game.homeTeam :
        opt==="원정승" ? item.game.awayTeam :
        opt==="무승부" ? "무승부" : "";
      const bet:Bet={
        id:String(Date.now()+Math.random()),
        date:today,
        category:item.game.sportCat,
        league:item.game.league,
        site:manualSlipSite,
        betOption:displayOpt,
        // ★ 모든 경우에 홈/원정 둘 다 저장 (표시는 PendingCard에서 결정)
        homeTeam:item.game.homeTeam,
        awayTeam:item.game.awayTeam,
        teamName,
        amount:manualSlipAmount,
        odds:item.odds,
        profit:null,
        result:"진행중",
        includeStats:manualSlipInclude,
        isDollar:dollar,
        ...({country: item.game.country} as any),
      };
      setBetsRaw(b=>[...b,bet]);
      db.upsertBet(bet);
      const newSS={...siteStates,[manualSlipSite]:{...siteStates[manualSlipSite],betTotal:parseFloat((siteStates[manualSlipSite].betTotal+manualSlipAmount).toFixed(2))}};
      setSiteStatesRaw(newSS);
      db.upsertSiteState(manualSlipSite,newSS[manualSlipSite]);
      addLog("➕ 베팅",`${item.game.homeTeam} vs ${item.game.awayTeam}/${displayOpt}/${fmtDisp(manualSlipAmount,dollar)}`);
    });
    setManualSlip([]);
    setManualSlipSite("");
    setManualSlipAmount(0);
  };

  // ══════════════════════════════════════════════════════════
  // 라이브 스코어 시스템 (진행중 탭 좌측)
  // ══════════════════════════════════════════════════════════
  const [liveScoreSport,setLiveScoreSport]=useState<"축구"|"야구"|"농구">("축구");

  // 베팅 옵션과 스코어로 적중/실패 판정
  const judgeBetResult = (b:Bet, homeScore:number, awayScore:number): "승"|"패"|null => {
    const opt = b.betOption;
    const total = homeScore + awayScore;
    // 1) 홈승/원정승/무승부 (구 데이터)
    if (opt === "홈승") return homeScore>awayScore ? "승" : "패";
    if (opt === "원정승") return awayScore>homeScore ? "승" : "패";
    if (opt === "무승부") return homeScore===awayScore ? "승" : "패";
    // 2) "팀명 승" 형식 (신 데이터)
    if (b.homeTeam && opt === `${b.homeTeam} 승`) return homeScore>awayScore ? "승" : "패";
    if (b.awayTeam && opt === `${b.awayTeam} 승`) return awayScore>homeScore ? "승" : "패";
    // 3) "오버 (X.X)" / "언더 (X.X)"
    //  - 오버 6.5, 합 7 → 적중 / 합 6 → 실패
    //  - 언더 8.5, 합 8 → 적중 / 합 9 → 실패
    //  - 정수 라인(드문 경우)에서 합 == line이면 푸시(null) = 수동 확인 필요
    const ouMatch = opt.match(/^(오버|언더)\s*\(([\d.]+)\)$/) || opt.match(/^(오버|언더)\s+([\d.]+)$/);
    if (ouMatch) {
      const kind = ouMatch[1];
      const line = parseFloat(ouMatch[2]);
      if (kind === "오버") return total>line ? "승" : total<line ? "패" : null;
      if (kind === "언더") return total<line ? "승" : total>line ? "패" : null;
    }
    // 4) 단순 "오버"/"언더" (구 데이터, 기준점 모름) - 판정 불가
    if (opt === "오버" || opt === "언더") return null;
    // 5) 핸디캡: "팀명 (+1.5)" / "팀명 (-1.5)" / "팀명 (1.5)"
    if (b.homeTeam) {
      const hMatch = opt.match(new RegExp(`^${b.homeTeam.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*\\(([+-]?[\\d.]+)\\)$`));
      if (hMatch) {
        const line = parseFloat(hMatch[1]);
        const handi = homeScore + line - awayScore;
        return handi>0 ? "승" : handi<0 ? "패" : null;
      }
    }
    if (b.awayTeam) {
      const aMatch = opt.match(new RegExp(`^${b.awayTeam.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*\\(([+-]?[\\d.]+)\\)$`));
      if (aMatch) {
        const line = parseFloat(aMatch[1]);
        const handi = awayScore + line - homeScore;
        return handi>0 ? "승" : handi<0 ? "패" : null;
      }
    }
    return null;
  };

  // 스코어 입력 (저장만). NaN이면 필드 삭제.
  const handleScoreChange = (gameId:string, field:"homeScore"|"awayScore", value:number) => {
    setManualGames(prev=>{
      let changed: ManualGame | null = null;
      const updated = prev.map(g => {
        if (g.id!==gameId) return g;
        if (Number.isNaN(value)) {
          const ng = {...g};
          delete ng[field];
          changed = ng;
          return ng;
        }
        const ng = {...g, [field]:value};
        changed = ng;
        return ng;
      });
      if (changed) {
        const c = changed as ManualGame;
        db.upsertManualGame({
          id:c.id,sportCat:c.sportCat,country:c.country,league:c.league,
          homeTeam:c.homeTeam,awayTeam:c.awayTeam,createdAt:c.createdAt,
          homeScore:c.homeScore,awayScore:c.awayScore,finished:c.finished,
        });
      }
      return updated;
    });
  };

  // 양쪽 스코어가 다 입력됐을 때 종료 처리 (blur/Tab 시 호출)
  const finishGameIfReady = (gameId:string) => {
    const g = manualGames.find(x=>x.id===gameId);
    if (!g || g.finished) return;
    if (g.homeScore===undefined || g.awayScore===undefined) return;
    setManualGames(prev=>{
      const updated = prev.map(x => x.id===gameId ? {...x, finished:true} : x);
      return updated;
    });
    // DB 동기화
    db.upsertManualGame({
      id:g.id,sportCat:g.sportCat,country:g.country,league:g.league,
      homeTeam:g.homeTeam,awayTeam:g.awayTeam,createdAt:g.createdAt,
      homeScore:g.homeScore,awayScore:g.awayScore,finished:true,
    });
    addLog("🏁 경기 종료",`${g.homeTeam} ${g.homeScore}:${g.awayScore} ${g.awayTeam}`);
  };

  // 종료된 경기 일괄 제거 (라이브 스코어 영역에서)
  const handleClearFinishedGames = () => {
    const sportFinished = manualGames.filter(g=>g.sportCat===liveScoreSport && g.finished);
    if (sportFinished.length===0) return alert("종료된 경기가 없습니다.");
    if (!window.confirm(`${liveScoreSport} 종료된 경기 ${sportFinished.length}건을 라이브 스코어에서 제거합니다.\n(베팅 데이터는 유지됩니다.)`)) return;
    // 종료된 경기는 manualGames에서 완전 삭제 (카테고리에서도 사라짐)
    saveManualGames(manualGames.filter(g => !(g.sportCat===liveScoreSport && g.finished)));
    addLog("🗑 일괄 제거",`${liveScoreSport} ${sportFinished.length}건`);
  };

  // 경기 종료 토글 (수동 - 양쪽 스코어 다 비웠을 때 등 예외 케이스용, 더 이상 UI 없음)
  const handleUnfinishGame = (gameId:string) => {
    saveManualGames(manualGames.map(g => g.id===gameId ? {...g, finished:false} : g));
  };

  // 경기 취소 - 관련된 모든 진행중 베팅을 취소 + 사이트 잔액 복구
  const handleCancelGame = (gameId:string) => {
    const g = manualGames.find(x=>x.id===gameId);
    if (!g) return;
    const relatedBets = bets.filter(b =>
      b.result === "진행중" &&
      b.homeTeam === g.homeTeam && b.awayTeam === g.awayTeam &&
      b.league === g.league && b.category === g.sportCat
    );
    const cnt = relatedBets.length;
    const msg = cnt > 0
      ? `"${g.homeTeam} vs ${g.awayTeam}" 경기를 취소하시겠습니까?\n\n관련 진행중 베팅 ${cnt}건이 모두 취소되고, 베팅금이 잔여 잔액으로 복구됩니다.`
      : `"${g.homeTeam} vs ${g.awayTeam}" 경기를 취소하시겠습니까?`;
    if (!window.confirm(msg)) return;

    if (cnt > 0) {
      const reductionBySite: Record<string, number> = {};
      for (const b of relatedBets) {
        reductionBySite[b.site] = (reductionBySite[b.site] || 0) + b.amount;
      }
      const remainingBets = bets.filter(b => !relatedBets.find(rb => rb.id === b.id));
      setBetsRaw(remainingBets);
      relatedBets.forEach(b => db.deleteBet(b.id));
      const newSiteStates = {...siteStates};
      for (const [site, reduction] of Object.entries(reductionBySite)) {
        if (newSiteStates[site]) {
          const newBetTotal = parseFloat(Math.max(0, newSiteStates[site].betTotal - reduction).toFixed(2));
          newSiteStates[site] = {...newSiteStates[site], betTotal: newBetTotal};
          db.upsertSiteState(site, newSiteStates[site]);
        }
      }
      setSiteStatesRaw(newSiteStates);
    }

    saveManualGames(manualGames.filter(x => x.id !== gameId));
    setManualSlip(p => p.filter(s => s.game.id !== gameId));

    addLog("⛔ 경기 취소", `${g.homeTeam} vs ${g.awayTeam}${cnt>0?` (베팅 ${cnt}건 취소)`:""}`);
  };

  // 베팅 결과 확인 (적중/실패 도장 후 사용자가 확인 → updateResult 호출)
  const handleConfirmBetResult = (betId:string, result:"승"|"패") => {
    updateResult(betId, result);
  };

  // ── 포인트 탭 ─────────────────────────────────────────────
  // 🔒 DB(point_sites 테이블)에 저장됨. 빈 배열로 시작, useEffect에서 로드.
  const [pointSites,setPointSites]=useState<PointSite[]>([]);
  const savePointSites=(sites:PointSite[])=>{
    setPointSites(prev=>{
      const prevMap=new Map(prev.map(p=>[p.id,p]));
      const nextMap=new Map(sites.map(p=>[p.id,p]));
      for(const id of prevMap.keys()) if(!nextMap.has(id)) db.deletePointSite(id);
      for(const p of sites){
        const before=prevMap.get(p.id);
        if(!before || JSON.stringify(before)!==JSON.stringify(p)){
          db.upsertPointSite({
            id:p.id, name:p.name, exchangeName:p.exchangeName, exchangeDate:p.exchangeDate,
            targetAmount:p.targetAmount, targetSiteName:p.targetSiteName,
            targetCycleDays:p.targetCycleDays||14, sessions:p.sessions||[],
          });
        }
      }
      return sites;
    });
  };

  const [addPointSiteModal,setAddPointSiteModal]=useState(false);
  const [newPointSite,setNewPointSite]=useState<{name:string,exchangeName:string,exchangeDate:string,targetAmount:number,targetSiteName:string,targetCycleDays:number}>({name:"올인구조대",exchangeName:"포인트교환",exchangeDate:"2025-05-04",targetAmount:2000000,targetSiteName:"",targetCycleDays:14});

  const handleAddPointSite=()=>{
    const site:PointSite={id:String(Date.now()),name:newPointSite.name,exchangeName:newPointSite.exchangeName,exchangeDate:newPointSite.exchangeDate,targetAmount:newPointSite.targetAmount,targetSiteName:newPointSite.targetSiteName||undefined,targetCycleDays:newPointSite.targetCycleDays||14,sessions:[]};
    const updated=[...pointSites,site];
    savePointSites(updated);
    setAddPointSiteModal(false);
    const resetDate=new Date();resetDate.setDate(resetDate.getDate()+14);
    setNewPointSite({name:"올인구조대",exchangeName:"포인트교환",exchangeDate:resetDate.toISOString().slice(0,10),targetAmount:2000000,targetSiteName:"",targetCycleDays:14});
  };

  // ── 일일 퀘스트 ────────────────────────────────────────────
  // 🔒 DB(daily_quests 테이블)에 저장됨. 빈 배열로 시작, useEffect에서 로드.
  const [dailyQuests,setDailyQuestsRaw]=useState<DailyQuest[]>([]);
  const saveDailyQuests=(qs:DailyQuest[])=>{
    setDailyQuestsRaw(prev=>{
      const prevMap=new Map(prev.map(q=>[q.id,q]));
      const nextMap=new Map(qs.map(q=>[q.id,q]));
      for(const id of prevMap.keys()) if(!nextMap.has(id)) db.deleteDailyQuest(id);
      for(const q of qs){
        const before=prevMap.get(q.id);
        if(!before || before.name!==q.name || before.createdAt!==q.createdAt
           || JSON.stringify(before.history)!==JSON.stringify(q.history)){
          db.upsertDailyQuest({id:q.id,name:q.name,createdAt:q.createdAt,history:q.history||[]});
        }
      }
      return qs;
    });
  };

  // 오늘 완료 여부 (history에 today 있는지)
  const isQuestDoneToday = (q:DailyQuest) => q.history.includes(today);

  // 토글: 오늘 체크 ↔ 해제
  const toggleQuestToday = (id:string) => {
    saveDailyQuests(dailyQuests.map(q=>{
      if(q.id!==id) return q;
      const has = q.history.includes(today);
      return {...q, history: has ? q.history.filter(d=>d!==today) : [...q.history, today].sort()};
    }));
  };

  const [newQuestName,setNewQuestName]=useState("");
  const [questCalendarExpanded,setQuestCalendarExpanded]=useState<Record<string,boolean>>({});
  const handleAddQuest = () => {
    const n = newQuestName.trim();
    if(!n) return;
    if(dailyQuests.some(q=>q.name===n)) return alert("이미 존재하는 퀘스트입니다");
    const newQuest:DailyQuest = {id:String(Date.now()),name:n,createdAt:today,history:[]};
    saveDailyQuests([...dailyQuests, newQuest]);
    setNewQuestName("");
  };
  const handleDeleteQuest = (id:string) => {
    const q = dailyQuests.find(x=>x.id===id);
    if(!q) return;
    if(!window.confirm(`"${q.name}" 퀘스트를 삭제하시겠습니까?\n(출석 기록도 함께 삭제됩니다)`))return;
    saveDailyQuests(dailyQuests.filter(x=>x.id!==id));
  };

  // 출석 일수 (createdAt부터 today까지의 달력일수)
  const questAttendanceDay = (q:DailyQuest) => {
    const start = new Date(q.createdAt);
    const now = new Date(today);
    const diff = Math.floor((now.getTime()-start.getTime())/(1000*60*60*24)) + 1;
    return Math.max(1, diff);
  };

  // ── 코드 수정 메모 ─────────────────────────────────────────
  // 🔒 DB(code_memos 테이블)에 저장됨. 빈 배열로 시작, useEffect에서 로드.
  const [codeMemos,setCodeMemosRaw]=useState<CodeMemo[]>([]);
  const saveCodeMemos=(ms:CodeMemo[])=>{
    setCodeMemosRaw(prev=>{
      const prevMap=new Map(prev.map(m=>[m.id,m]));
      const nextMap=new Map(ms.map(m=>[m.id,m]));
      for(const id of prevMap.keys()) if(!nextMap.has(id)) db.deleteCodeMemo(id);
      for(const m of ms){
        const before=prevMap.get(m.id);
        if(!before || JSON.stringify(before)!==JSON.stringify(m)){
          db.upsertCodeMemo(m as any);
        }
      }
      return ms;
    });
  };
  const [codeMemoOpen,setCodeMemoOpen]=useState(false);
  // 🔒 메모 초안도 DB(app_settings[code_memo_draft])에 저장됨.
  //    초기값은 "1. ", useEffect에서 로드 덮어씀.
  const [newMemoText,setNewMemoTextRaw]=useState<string>("1. ");
  const setNewMemoText=(v:string)=>{setNewMemoTextRaw(v);db.saveAppSetting("code_memo_draft",v);};
  // 인라인 편집 중인 메모 ID + 임시 텍스트
  const [editingMemoId,setEditingMemoId]=useState<string|null>(null);
  const [editingMemoText,setEditingMemoText]=useState<string>("");
  // 💾 저장 버튼 클릭 시각 (저장됨 표시용)
  const [draftSavedAt,setDraftSavedAt]=useState<number|null>(null);
  // ✍️ 메모 textarea ref (열릴 때 자동 포커스 + 커서 끝으로)
  const memoTextareaRef = useRef<HTMLTextAreaElement|null>(null);
  useEffect(()=>{
    if(codeMemoOpen){
      // 패널 렌더 후 textarea 포커스 + 커서를 텍스트 마지막 뒤로
      setTimeout(()=>{
        const el = memoTextareaRef.current;
        if(el){
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
          // 스크롤도 끝으로
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    }
  },[codeMemoOpen]);

  // 💾 작업 중 메모 저장 (DB: app_settings.code_memo_draft) + 창 자동 닫기
  const handleSaveDraft = () => {
    const t = newMemoText.trim();
    if(!t || t==="1." || t==="1") return;
    db.saveAppSetting("code_memo_draft", newMemoText);
    setDraftSavedAt(Date.now());
    // 저장 후 자동으로 창 닫기
    setCodeMemoOpen(false);
  };
  // ✓ 반영 = 현재 작업 중 메모를 "반영 완료" 목록으로 이동 + 입력창 비우기
  const handleAddMemo = () => {
    const t = newMemoText.trim();
    if(!t || t==="1." || t==="1") return;
    if(!window.confirm("이 메모를 반영 완료 목록으로 옮길까요?\n(작업 중 입력창은 비워집니다)")) return;
    const m:CodeMemo = {id:String(Date.now()),text:t,createdAt:new Date().toISOString(),applied:true,appliedAt:new Date().toISOString()};
    saveCodeMemos([m, ...codeMemos]);
    setNewMemoText("1. ");
  };
  const handleApplyMemo = (id:string) => {
    saveCodeMemos(codeMemos.map(m=>m.id===id?{...m,applied:!m.applied,appliedAt:!m.applied?new Date().toISOString():undefined}:m));
  };
  const handleDeleteMemo = (id:string) => {
    if(!window.confirm("이 메모를 삭제하시겠습니까?"))return;
    saveCodeMemos(codeMemos.filter(m=>m.id!==id));
    if(editingMemoId===id){setEditingMemoId(null);setEditingMemoText("");}
  };
  // 인라인 편집 시작
  const startEditMemo = (id:string) => {
    const m = codeMemos.find(x=>x.id===id);
    if(!m) return;
    setEditingMemoId(id);
    setEditingMemoText(m.text);
  };
  // 인라인 편집 저장
  const saveEditMemo = () => {
    if(!editingMemoId) return;
    const t = editingMemoText.trim();
    if(!t){
      if(window.confirm("내용이 비었습니다. 메모를 삭제할까요?")){
        saveCodeMemos(codeMemos.filter(m=>m.id!==editingMemoId));
      }
      setEditingMemoId(null);setEditingMemoText("");
      return;
    }
    saveCodeMemos(codeMemos.map(m=>m.id===editingMemoId?{...m,text:t}:m));
    setEditingMemoId(null);setEditingMemoText("");
  };
  // 자동 번호 매기기 - textarea 내에서 Enter 시 다음 번호 자동 추가
  const handleMemoKeyDown = (e:React.KeyboardEvent<HTMLTextAreaElement>, isEditing:boolean) => {
    const target = e.target as HTMLTextAreaElement;
    const value = target.value;
    const cursor = target.selectionStart;

    // Ctrl+S 또는 Cmd+S → 저장 (편집중이면 편집저장, 새 입력이면 임시저장만 - 반영은 버튼)
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="s"){
      e.preventDefault();
      if(isEditing) saveEditMemo();
      else handleSaveDraft();
      return;
    }
    // ESC: 편집 중이면 편집 취소만, 입력 중이면 부모에서 처리 (창 닫기)
    if(e.key==="Escape" && isEditing){
      e.preventDefault();
      setEditingMemoId(null);setEditingMemoText("");
      return;
    }
    // Enter → 다음 줄에 자동 번호 추가
    if(e.key==="Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey){
      // 현재 라인의 시작 찾기
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const lineStart = before.lastIndexOf("\n") + 1;
      const currentLine = before.slice(lineStart);
      // 현재 라인이 "N." 또는 "N. text" 형태인지 검사
      const numMatch = currentLine.match(/^(\d+)\.\s*(.*)$/);
      if(numMatch){
        const curNum = parseInt(numMatch[1],10);
        const curContent = numMatch[2];
        // 만약 라인에 내용이 없는 상태에서 Enter → 번호 제거 (출력 종료)
        if(!curContent.trim()){
          e.preventDefault();
          const newValue = before.slice(0, lineStart) + after;
          const newCursor = lineStart;
          if(isEditing) setEditingMemoText(newValue);
          else setNewMemoText(newValue);
          setTimeout(()=>{target.setSelectionRange(newCursor,newCursor);},0);
          return;
        }
        // 다음 번호 자동 추가
        e.preventDefault();
        const nextNum = curNum + 1;
        const insert = `\n${nextNum}. `;
        const newValue = before + insert + after;
        const newCursor = cursor + insert.length;
        if(isEditing) setEditingMemoText(newValue);
        else setNewMemoText(newValue);
        setTimeout(()=>{target.setSelectionRange(newCursor,newCursor);},0);
        return;
      }
      // 번호 없는 라인이면 그냥 줄바꿈
    }
  };


  const getNextTargetDate=(fromDate:string,cycleDays:number=14)=>{
    const d=new Date(fromDate);
    d.setDate(d.getDate()+cycleDays);
    return d.toISOString().slice(0,10);
  };

  const handlePointExchangeComplete=(siteId:string)=>{
    const site = pointSites.find(s=>s.id===siteId);
    if(!site) return;
    const cycle = site.targetCycleDays || 14;
    const cycleLabel = cycle===14?"2주":cycle===7?"1주":cycle===21?"3주":cycle===28?"4주":`${cycle}일`;
    const targetMsg = site.targetAmount>0
      ? `목표 ${site.targetAmount.toLocaleString()}원, 목표 주기 ${cycleLabel}`
      : `목표 없음 (입금만 추적), 목표 주기 ${cycleLabel}`;
    if(!window.confirm(`"${site.name}" 현금교환 완료 처리?\n\n같은 목표(${targetMsg})로 ${cycleLabel} 더해서 다시 이어서 진행하시겠습니까?`)) return;
    const now=new Date().toISOString().slice(0,10);
    // 다음 주기는 이전 마감일 기준 + cycleDays (현재 진행 중인 baseDate 기준)
    const baseDate = site.sessions.length>0
      ? site.sessions[site.sessions.length-1].nextTargetDate
      : site.exchangeDate;
    const nextTarget=getNextTargetDate(baseDate,cycle);
    const session:PointSession={id:String(Date.now()),completedAt:now,nextTargetDate:nextTarget};
    const updated=pointSites.map(s=>{
      if(s.id!==siteId)return s;
      return{...s,sessions:[...s.sessions,session]};
    });
    savePointSites(updated);
  };

  // 실시간 환율
  const [usdKrw,setUsdKrw]=useState(USD_TO_KRW);
  useEffect(()=>{fetchUsdKrw().then(setUsdKrw);},[]);

  // 베팅 내역 탭 - 사이트별 "오늘 완료" 펼침 상태
  const [siteDoneExpanded,setSiteDoneExpanded]=useState<Record<string,boolean>>({});

  // ── Supabase 데이터 ────────────────────────────────────────
  const [dbReady, setDbReady] = useState(false);
  const [bets,setBetsRaw]=useState<Bet[]>([]);
  const [deposits,setDepositsRaw]=useState<Deposit[]>([]);
  const [withdrawals,setWithdrawalsRaw]=useState<Withdrawal[]>([]);
  const [siteStates,setSiteStatesRaw]=useState<Record<string,SiteState>>(
    ()=>Object.fromEntries(ALL_SITES.map(s=>[s,{deposited:0,betTotal:0,active:false,isDollar:isUSD(s),pointTotal:0}]))
  );
  const [customLeagues,setCustomLeaguesRaw]=useState<Record<string,string[]>>({});
  const [esportsRecords,setEsportsRecordsRaw]=useState<EsportsRecord[]>([]);
  const [profitExtras,setProfitExtrasRaw]=useState<(ProfitExtra & {subSubCategory?:string})[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);

  // 🔒 DB(app_settings 테이블의 pext_sites/pext_cats/pext_subcats 키)에 저장됨.
  //    빈 배열로 시작, useEffect에서 로드.
  const [pextSiteList,setPextSiteList]=useState<string[]>([]);
  const [pextCatList,setPextCatList]=useState<string[]>([]);
  const [pextSubCatList,setPextSubCatList]=useState<string[]>([]);

  const savePextSiteList=(list:string[])=>{setPextSiteList(list);db.saveAppSetting("pext_sites",list);};
  const savePextCatList=(list:string[])=>{setPextCatList(list);db.saveAppSetting("pext_cats",list);};
  const savePextSubCatList=(list:string[])=>{setPextSubCatList(list);db.saveAppSetting("pext_subcats",list);};

  // 데이터 로드 실패 기록용 (상단 배너에서 사용)
  const [dataLoadErrors,setDataLoadErrors]=useState<string[]>([]);
  const [dbReloadNonce,setDbReloadNonce]=useState(0); // 재시도 트리거

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const errors:string[]=[];
      const safe=async<T,>(label:string,fn:()=>Promise<T>,fallback:T):Promise<T>=>{
        try{return await fn();}catch(e){console.error(`[load] ${label}`,e);errors.push(label);return fallback;}
      };

      // ─── 1단계: 사이트 리스트 먼저 로드 (site_states 로드가 이 값을 필요로 함) ───
      const settings = await safe("app_settings",()=>db.loadAppSettingsBundle(),{
        krw_sites:null,usd_sites:null,pext_sites:[],pext_cats:[],pext_subcats:[],code_memo_draft:"1. ",league_api_map:{},sports_test_league_map:{},fixtures_cache_meta:{...db.EMPTY_FIXTURES_CACHE_META},
      });
      if(cancelled)return;
      const krw = settings.krw_sites ?? DEFAULT_KRW_SITES;
      const usd = settings.usd_sites ?? DEFAULT_USD_SITES;
      setKrwSites(krw);
      setUsdSites(usd);
      // krw_sites/usd_sites가 DB에 없던 경우(최초 실행) - 기본값을 DB에도 저장
      if(!settings.krw_sites) db.saveAppSetting("krw_sites",DEFAULT_KRW_SITES);
      if(!settings.usd_sites) db.saveAppSetting("usd_sites",DEFAULT_USD_SITES);
      // pext 목록
      setPextSiteList(settings.pext_sites);
      setPextCatList(settings.pext_cats);
      setPextSubCatList(settings.pext_subcats);
      // 코드 메모 draft
      setNewMemoTextRaw(settings.code_memo_draft);

      // ─── 2단계: 나머지 모두 병렬 로드 ───
      const allSitesNow=[...krw,...usd];
      const isUSDNow=(s:string)=>usd.includes(s);
      const [b,dep,wth,ss,cl,er,pe, mg, mm, ps, dq, cm, tn] = await Promise.all([
        safe("bets",            ()=>db.loadBets(),           [] as Bet[]),
        safe("deposits",        ()=>db.loadDeposits(),       [] as Deposit[]),
        safe("withdrawals",     ()=>db.loadWithdrawals(),    [] as Withdrawal[]),
        safe("site_states",     ()=>db.loadSiteStates(allSitesNow,isUSDNow), {} as Record<string,SiteState>),
        safe("custom_leagues",  ()=>db.loadCustomLeagues(),  {} as Record<string,string[]>),
        safe("esports_records", ()=>db.loadEsportsRecords(), [] as EsportsRecord[]),
        safe("profit_extras",   ()=>db.loadProfitExtras(),   [] as ProfitExtra[]),
        safe("manual_games",    ()=>db.loadManualGames(),    [] as db.ManualGameRow[]),
        safe("m_meta",          ()=>db.loadMMeta(),          [] as db.MMetaRow[]),
        safe("point_sites",     ()=>db.loadPointSites(),     [] as db.PointSiteRow[]),
        safe("daily_quests",    ()=>db.loadDailyQuests(),    [] as db.DailyQuestRow[]),
        safe("code_memos",      ()=>db.loadCodeMemos<CodeMemo>(), [] as CodeMemo[]),
        safe("team_names",      ()=>db.loadTeamNames(),      {} as Record<string,string>),
      ]);
      if(cancelled)return;

      // 기존 상태들
      setBetsRaw(b);setDepositsRaw(dep);setWithdrawalsRaw(wth);
      setSiteStatesRaw(ss);setCustomLeaguesRaw(cl);setEsportsRecordsRaw(er);setProfitExtrasRaw(pe);

      // profit_extras에서 사이트/카테고리 목록 자동 보강 (기존 동작 유지, DB에도 저장)
      const extraSites=new Set(pe.map((x:ProfitExtra)=>x.category));
      const extraCats=new Set(pe.map((x:ProfitExtra)=>x.subCategory).filter(Boolean));
      const extraSubcats=new Set(pe.map((x:any)=>x.subSubCategory).filter(Boolean));
      if(extraSites.size>0){
        const merged=[...new Set([...settings.pext_sites,...Array.from(extraSites)])];
        setPextSiteList(merged); db.saveAppSetting("pext_sites",merged);
      }
      if(extraCats.size>0){
        const merged=[...new Set([...settings.pext_cats,...Array.from(extraCats)])];
        setPextCatList(merged); db.saveAppSetting("pext_cats",merged);
      }
      if(extraSubcats.size>0){
        const merged=[...new Set([...settings.pext_subcats,...Array.from(extraSubcats) as string[]])];
        setPextSubCatList(merged); db.saveAppSetting("pext_subcats",merged);
      }

      // 수동 경기: DB Row → ManualGame 타입
      setManualGames(mg.map(r=>({
        id:r.id, country:r.country, league:r.league,
        homeTeam:r.homeTeam, awayTeam:r.awayTeam,
        sportCat:r.sportCat, createdAt:r.createdAt,
        homeScore:r.homeScore, awayScore:r.awayScore, finished:r.finished,
      })));

      // m_meta: type별로 분류 → customSports / mCountries / mLeagues 재구성
      const _customSports:string[]=[];
      const _mCountries:Record<string,string[]>={};
      const _mLeagues:Record<string,string[]>={};
      for(const row of mm){
        if(row.type==="sport"){
          if(!_customSports.includes(row.name)) _customSports.push(row.name);
        } else if(row.type==="country"){
          if(!_mCountries[row.sport]) _mCountries[row.sport]=[];
          if(!_mCountries[row.sport].includes(row.name)) _mCountries[row.sport].push(row.name);
        } else if(row.type==="league"){
          const key=`${row.sport}__${row.country}`;
          if(!_mLeagues[key]) _mLeagues[key]=[];
          if(!_mLeagues[key].includes(row.name)) _mLeagues[key].push(row.name);
        }
      }
      setCustomSports(_customSports);
      setMCountries(_mCountries);
      setMLeagues(_mLeagues);

      // 포인트 사이트 / 일일 퀘스트 / 코드 메모 / 팀명 매핑
      setPointSites(ps.map(p=>({
        id:p.id,name:p.name,exchangeName:p.exchangeName,exchangeDate:p.exchangeDate,
        targetAmount:p.targetAmount,targetSiteName:p.targetSiteName,
        targetCycleDays:p.targetCycleDays,sessions:p.sessions as any,
      })) as PointSite[]);
      setDailyQuestsRaw(dq.map(q=>({id:q.id,name:q.name,createdAt:q.createdAt,history:q.history})) as DailyQuest[]);
      setCodeMemosRaw(cm);
      // team_names 테이블에서 prefix로 분리: team:* / country:* / league:*
      {
        const teams:Record<string,string> = {};
        const countries:Record<string,string> = {};
        const leagues:Record<string,string> = {};
        for (const [k,v] of Object.entries(tn)) {
          if (k.startsWith("country:")) countries[k.slice(8)] = v as string;
          else if (k.startsWith("league:")) leagues[k.slice(7)] = v as string;
          else teams[k] = v as string;
        }
        setTeamNameMap(teams);
        setCountryNameMap(countries);
        setLeagueNameMap(leagues);
      }
      if(settings.league_api_map) setLeagueApiMap(settings.league_api_map as Record<string,string>);
      if(settings.sports_test_league_map) setStLeagueMap(settings.sports_test_league_map as Record<string,string>);

      setDataLoadErrors(errors);
      setDbReady(true);
    })();
    return ()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dbReloadNonce]);

  const addLog=(type:string,desc:string)=>setLogs(p=>[{id:String(Date.now()),ts:new Date().toLocaleString("ko-KR"),type,desc},...p].slice(0,200));

  // 최근 로그 행동 취소 (첫번째 로그만)
  const undoLastLog = () => {
    if (logs.length===0) return alert("취소할 로그가 없습니다.");
    const log = logs[0];
    const t = log.type;
    const d = log.desc;
    // 취소 가능 타입 처리
    if (t==="➕ 베팅") {
      // 가장 최근 베팅 영구삭제
      const latestBet = [...bets].sort((a,b)=>parseFloat(b.id)-parseFloat(a.id))[0];
      if (!latestBet) return alert("취소할 베팅 데이터가 없습니다.");
      if (!window.confirm(`최근 베팅을 취소하시겠습니까?\n${d}`)) return;
      setBetsRaw(b=>b.filter(x=>x.id!==latestBet.id));
      db.deleteBet(latestBet.id);
      // 사이트 betTotal 감소
      if (siteStates[latestBet.site]) {
        const updated = {...siteStates[latestBet.site],betTotal:parseFloat(Math.max(0, siteStates[latestBet.site].betTotal-latestBet.amount).toFixed(2))};
        setSiteStatesRaw(p=>({...p,[latestBet.site]:updated}));
        db.upsertSiteState(latestBet.site,updated);
      }
      setLogs(p=>p.slice(1));
      addLog("↶ 로그 취소",`${t} 취소됨`);
      return;
    }
    if (t==="✅ 적중" || t==="❌ 실패") {
      // 가장 최근 결과 처리된 베팅 찾기 (desc에 homeTeam/teamName 포함)
      const targetResult = t==="✅ 적중" ? "승" : "패";
      const candidates = bets.filter(b=>b.result===targetResult && (b.homeTeam===d||b.teamName===d));
      const latestProcessed = [...candidates].sort((a,b)=>parseFloat(b.id)-parseFloat(a.id))[0];
      if (!latestProcessed) return alert(`해당 ${t} 처리된 베팅을 찾을 수 없습니다.`);
      if (!window.confirm(`${t} 처리를 취소하고 진행중으로 되돌리시겠습니까?\n${d}`)) return;
      revertToPending(latestProcessed.id);
      setLogs(p=>p.slice(1));
      return;
    }
    if (t==="🚫 취소") {
      // 취소된 베팅을 다시 진행중으로
      const candidates = bets.filter(b=>b.result==="취소" && (b.homeTeam===d||b.teamName===d));
      const latest = [...candidates].sort((a,b)=>parseFloat(b.id)-parseFloat(a.id))[0];
      if (!latest) return alert("취소된 베팅을 찾을 수 없습니다.");
      if (!window.confirm(`취소를 되돌려 진행중으로 복귀합니다.\n${d}`)) return;
      revertToPending(latest.id);
      setLogs(p=>p.slice(1));
      return;
    }
    if (t==="💵 입금") {
      // 가장 최근 deposit 삭제
      const latestDep = [...deposits].sort((a,b)=>parseFloat(b.id)-parseFloat(a.id))[0];
      if (!latestDep) return alert("취소할 입금 기록이 없습니다.");
      if (!window.confirm(`최근 입금을 취소하시겠습니까?\n${d}`)) return;
      setDepositsRaw(dp=>dp.filter(x=>x.id!==latestDep.id));
      // NOTE: db.deleteDeposit 미구현 상태이므로 로컬만 반영 (새로고침 시 복원될 수 있음)
      // 사이트 deposited 감소
      if (siteStates[latestDep.site]) {
        const updated = {...siteStates[latestDep.site],deposited:parseFloat(Math.max(0, siteStates[latestDep.site].deposited-latestDep.amount).toFixed(2))};
        setSiteStatesRaw(p=>({...p,[latestDep.site]:updated}));
        db.upsertSiteState(latestDep.site,updated);
      }
      setLogs(p=>p.slice(1));
      addLog("↶ 로그 취소",`${t} 취소됨`);
      return;
    }
    alert(`"${t}" 유형의 로그는 자동 취소할 수 없습니다.\n해당 탭에서 직접 되돌려주세요.`);
  };

  const exportData = () => {
    const data={exportedAt:new Date().toISOString(),bets,deposits,withdrawals,siteStates,customLeagues,esportsRecords,profitExtras};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`bettracker_${today}.json`;a.click();URL.revokeObjectURL(url);
    addLog("📤 백업",today);
  };
  const importData=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const data=JSON.parse(ev.target?.result as string);
        if(data.bets){for(const b of data.bets)await db.upsertBet(b);setBetsRaw(data.bets);}
        if(data.deposits){for(const d of data.deposits)await db.insertDeposit(d).catch(()=>{});setDepositsRaw(data.deposits);}
        if(data.withdrawals){for(const w of data.withdrawals)await db.insertWithdrawal(w).catch(()=>{});setWithdrawalsRaw(data.withdrawals);}
        if(data.siteStates){for(const [site,st] of Object.entries(data.siteStates as Record<string,SiteState>))await db.upsertSiteState(site,st);setSiteStatesRaw(data.siteStates);}
        if(data.customLeagues)setCustomLeaguesRaw(data.customLeagues);
        if(data.esportsRecords){for(const r of data.esportsRecords)await db.insertEsportsRecord(r).catch(()=>{});setEsportsRecordsRaw(data.esportsRecords);}
        if(data.profitExtras){for(const p of data.profitExtras)await db.insertProfitExtra(p).catch(()=>{});setProfitExtrasRaw(data.profitExtras);}
        alert("불러오기 완료!");addLog("📥 복구","완료");
      }catch{alert("파일 오류");}
    };
    reader.readAsText(file);e.target.value="";
  };

  // ── 리그 ─────────────────────────────────────────────────
  const getLeagues=(cat:string)=>{
    const major=MAJOR[cat]||[],extra=EXTRA[cat]||[];
    const custom=(customLeagues[cat]||[]).filter(l=>![...major,...extra].includes(l)).sort((a,b)=>a.localeCompare(b,"ko"));
    return{major,others:[...extra,...custom].sort((a,b)=>a.localeCompare(b,"ko"))};
  };
  const allLeagues=(cat:string)=>{const{major,others}=getLeagues(cat);return[...major,...others];};

  // ── 모달 상태 ─────────────────────────────────────────────
  const [addLeagueModal,setAddLeagueModal]=useState<{cat:string}|null>(null);
  const [editLeagueModal,setEditLeagueModal]=useState<{cat:string;old:string;idx:number}|null>(null);
  const [newLeagueName,setNewLeagueName]=useState("");
  const [editLeagueName,setEditLeagueName]=useState("");
  const [closeModal,setCloseModal]=useState<{site:string}|null>(null);
  const [closeWithdrawAmt,setCloseWithdrawAmt]=useState(0);
  const [deleteModal,setDeleteModal]=useState<{betId:string}|null>(null);
  const leagueInputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(addLeagueModal&&leagueInputRef.current)setTimeout(()=>leagueInputRef.current?.focus(),50);},[addLeagueModal]);

  // ESC 키로 모든 팝업 닫기
  useEffect(()=>{
    const handler = (e:KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (quickActionMode) { setQuickActionMode(null); setQuickActionSite(""); setQuickActionAmt(0); return; }
      if (customHandiModal) { setCustomHandiModal(null); setCustomHandiLine(""); return; }
      if (addGameModal) { setAddGameModal(false); setNewGame({homeTeam:"",awayTeam:""}); return; }
      if (addSportModal) { setAddSportModal(false); setNewSportName(""); return; }
      if (addCountryModal) { setAddCountryModal(null); setNewCountryName(""); return; }
      if (addLeagueModalM) { setAddLeagueModalM(null); setNewLeagueNameM(""); return; }
      if (addLeagueModal) { setAddLeagueModal(null); setNewLeagueName(""); return; }
      if (editMetaModal) { setEditMetaModal(null); setEditMetaNewName(""); return; }
      if (closeModal) { setCloseModal(null); return; }
      if (deleteModal) { setDeleteModal(null); return; }
      // 코드 메모 패널 닫기 - 작성중 텍스트를 DB에 저장
      if (codeMemoOpen) {
        // 인라인 편집 중이라면 textarea 자체에서 처리되므로 여기 안 옴
        db.saveAppSetting("code_memo_draft", newMemoText);
        setDraftSavedAt(Date.now());
        setCodeMemoOpen(false);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [quickActionMode,customHandiModal,addGameModal,addSportModal,addCountryModal,addLeagueModalM,addLeagueModal,editMetaModal,closeModal,deleteModal,codeMemoOpen,newMemoText]);

  // ── 입금 폼 ──────────────────────────────────────────────
  const [depSite,setDepSite]=useState("");
  const depIsDollar=depSite?isUSD(depSite):false;
  const [depAmt,setDepAmt]=useState(0);
  const [depPoint,setDepPoint]=useState(0);

  // 활성 상태 OR 입금액 있는 사이트 모두 포함 (마감 전까지 유지)
  const activeSiteNames=ALL_SITES.filter(s=>{
    const st=siteStates[s];
    if (!st) return false;
    return st.active || (st.deposited||0) > 0;
  });

  // ── E스포츠 기록 ─────────────────────────────────────────
  const [esRec,setEsRec]=useState({league:"LCK",date:today,teamA:"",teamB:"",scoreA:0,scoreB:0});

  // ── API 관리 탭 state (rev.7 — Edge Function 폐기, 클라이언트 직접 호출) ─
  // API_SPORTS_INFO / ACTIVE_SPORTS / CACHE_FRESH_MIN 은 모듈 레벨에 정의됨.
  // sportsTestReloadNonce / bettingFixturesReloadNonce 는 베팅 탭 state 위쪽에서 선언됨.
  // 캐시 메타 (마지막 호출 시각, 콜 수 등)를 fixtures_cache_meta 키에서 로드.
  const [cacheMeta, setCacheMeta] = useState<db.FixturesCacheMeta>({ ...db.EMPTY_FIXTURES_CACHE_META });
  // 새로고침 진행 중 표시
  const [refreshLoading, setRefreshLoading] = useState(false);
  // 새로고침 결과 메시지 (UI 배너용)
  const [refreshNote, setRefreshNote] = useState<{kind:"info"|"success"|"warn"|"error"; text:string}|null>(null);
  // 모바일 여부 (한 번만 계산)
  const isMobile = useMemo(() => isMobileDevice(), []);

  const fmtRelTime = (iso: string | null) => {
    if (!iso) return "없음";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return mins + "분 전";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "시간 전";
    return Math.floor(hrs/24) + "일 전";
  };

  const autoSettle = useCallback(async () => {
    const freshBets = await db.loadBets();
    const targets = freshBets.filter(b=>b.result==="진행중"&&(b as any).fixtureId!=null&&!(b as any).isManual);
    if (targets.length===0) return;
    const fixtureIds=[...new Set(targets.map(b=>Number((b as any).fixtureId)))].filter(n=>!isNaN(n)&&n>0);
    if (fixtureIds.length===0) return;
    const {data:rows,error}=await supabase.from('fixtures').select('fixture_id,sport,status_short,home_score,away_score').in('fixture_id',fixtureIds);
    if (error||!rows) return;
    const fixtureMap=new Map<number,any>();
    for(const r of rows) fixtureMap.set(Number(r.fixture_id),r);
    const updatedBets:Bet[]=[];
    for(const bet of targets){
      const fid=Number((bet as any).fixtureId);
      const row=fixtureMap.get(fid);
      if(!row) continue;
      const status=row.status_short as string;
      const hs=row.home_score as number|null;
      const as_=row.away_score as number|null;
      let newResult:string|null=null;
      if(status==='FT'||status==='AET'||status==='PEN'){
        if(hs===null||as_===null) continue;
        const opt=bet.betOption, total=hs+as_;
        if(opt==="홈승") newResult=hs>as_?"승":"패";
        else if(opt==="원정승") newResult=as_>hs?"승":"패";
        else if(opt==="무승부") newResult=hs===as_?"승":"패";
        else if(opt.startsWith("오버")){const l=parseFloat(opt.replace(/[^0-9.]/g,""));if(!isNaN(l))newResult=total>l?"승":"패";}
        else if(opt.startsWith("언더")){const l=parseFloat(opt.replace(/[^0-9.]/g,""));if(!isNaN(l))newResult=total<l?"승":"패";}
        else if(opt.includes("(")){
          const m=opt.match(/\(([+-]?[\d.]+)\)/);
          if(m){
            const line=parseFloat(m[1]);
            const isHome=!!(bet.homeTeam&&opt.includes(bet.homeTeam));
            const myScore=isHome?hs:as_, oppScore=isHome?as_:hs;
            const handi=myScore+line-oppScore;
            if(handi>0) newResult="승";
            else if(handi<0) newResult="패";
          }
        }
      } else if(status==='CANC') newResult="취소";
      else if(status==='PST') newResult="연기";
      else if(status==='ABD') newResult="중단";
      if(newResult){
        // 바로 확정 안 함 — 대기_* 저장. 사용자 확인 버튼 누를 때 최종 확정
        const pr=newResult==="승"?"대기_승":newResult==="패"?"대기_패":newResult==="취소"?"대기_취소":newResult==="연기"?"대기_연기":"대기_중단";
        const updated={...bet,result:pr,profit:null} as Bet;
        updatedBets.push(updated); db.upsertBet(updated);
      }
    }
    if(updatedBets.length>0) setBetsRaw(prev=>prev.map(b=>{const u=updatedBets.find(u=>u.id===b.id);return u??b;}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── 새로고침 메인 함수 ───────────────────────────────────────
  // force=false: 캐시(15분) 신선하면 API 호출 안 하고 DB만 다시 읽음.
  // force=true:  캐시 무시하고 무조건 호출 (⚡ 강제 새로고침).
  // 모바일이면 항상 호출 차단 후 안내.
  // 호출 후엔 sportsTest/bettingCombo 탭의 표시 데이터도 다시 로드되도록
  //   onAfterRefresh 콜백에서 재로딩 트리거.
  const refreshFixtures = useCallback(async (opts: { force?: boolean } = {}): Promise<void> => {
    const force = !!opts.force;

    // 1) 모바일 차단
    if (isMobile) {
      setRefreshNote({
        kind: "warn",
        text: "📱 모바일에서는 API 호출이 차단됩니다. 데이터는 PC에서 새로고침해주세요. (지금 보이는 건 마지막 PC 호출 결과)",
      });
      return;
    }

    // 2) API 키 확인 (Vercel 환경변수)
    const apiKey = (import.meta as any).env?.VITE_API_SPORTS_KEY as string | undefined;
    if (!apiKey) {
      setRefreshNote({
        kind: "error",
        text: "❌ VITE_API_SPORTS_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정 → Environment Variables 에서 추가하세요.",
      });
      return;
    }

    setRefreshLoading(true);
    try {
      // 3) 캐시 신선도 체크 (force=false일 때만)
      const meta = await db.loadFixturesCacheMeta();
      if (!force && meta.lastFetchedAt) {
        const ageMin = (Date.now() - new Date(meta.lastFetchedAt).getTime()) / 60_000;
        if (ageMin < CACHE_FRESH_MIN) {
          setCacheMeta(meta);
          setRefreshNote({
            kind: "info",
            text: `🟢 캐시 사용 (${Math.floor(ageMin)}분 전 데이터, ${CACHE_FRESH_MIN}분 이내라 호출 생략). 강제로 받으려면 ⚡ 버튼을 누르세요.`,
          });
          // 화면에 표시되는 데이터는 외부에서 재로딩하므로 nonce만 올림
          setSportsTestReloadNonce(n => n + 1);
          setBettingFixturesReloadNonce(n => n + 1);
          return;
        }
      }

      // 4) 그저께 이전 데이터 자동 삭제 (KST 기준 2일 전 00:00 이전)
      try {
        const kstYesterday = new Date(Date.now() + 9*3600_000);
        kstYesterday.setUTCHours(0,0,0,0);
        kstYesterday.setUTCDate(kstYesterday.getUTCDate() - 1);
        const deleteBeforeUtc = new Date(kstYesterday.getTime() - 9*3600_000).toISOString();
        await supabase.from('fixtures').delete().lt('start_time', deleteBeforeUtc);
      } catch(e) { console.warn('[refreshFixtures] 오래된 데이터 삭제 실패:', e); }

      // 5) 활성 종목 × 날짜 호출 (어제 + 오늘 + 내일)
      const dates = Array.from({length: FETCH_DAYS}, (_, i) => kstDateStr(i - 1));
      const lastCallsBySport: Record<string, number> = {};
      const lastResultBySport: Record<string, { fetched: number; upserted: number; error?: string }> = {};
      let totalCalls = 0;
      const errorMsgs: string[] = [];

      for (const sport of ACTIVE_SPORTS) {
        const { rows, calls, error } = await fetchSportFromApiSports(sport, dates, apiKey);
        totalCalls += calls;
        lastCallsBySport[sport] = calls;

        let upserted = 0;
        if (rows.length > 0) {
          const res = await db.upsertFixtureRows(rows);
          if (res.ok) upserted = rows.length;
          else if (res.error) errorMsgs.push(`${sport}: ${res.error}`);
        }
        lastResultBySport[sport] = {
          fetched: rows.length,
          upserted,
          ...(error ? { error } : {}),
        };
        if (error) errorMsgs.push(`${sport}: ${error}`);
      }

      // 6) 캐시 메타 갱신 (오늘 누적도 함께)
      const todayKst = kstDateStr(0);
      const carryToday = meta.todayDateKst === todayKst ? (meta.todayTotalCalls || 0) : 0;
      const nextMeta: db.FixturesCacheMeta = {
        lastFetchedAt: new Date().toISOString(),
        lastCallsBySport,
        lastTotalCalls: totalCalls,
        lastResultBySport,
        todayDateKst: todayKst,
        todayTotalCalls: carryToday + totalCalls,
      };
      await db.saveFixturesCacheMeta(nextMeta);
      setCacheMeta(nextMeta);

      // 7) 결과 안내
      if (errorMsgs.length === 0) {
        const summary = ACTIVE_SPORTS.map(sp => {
          const r = lastResultBySport[sp];
          return `${sp}: ${r?.upserted ?? 0}건`;
        }).join(", ");
        setRefreshNote({
          kind: "success",
          text: `✅ 새로고침 완료 — 총 ${totalCalls}콜 (${summary})`,
        });
      } else {
        setRefreshNote({
          kind: "error",
          text: `⚠ 일부 오류 — ${errorMsgs.slice(0, 2).join(" · ")}${errorMsgs.length > 2 ? " 외" : ""}`,
        });
      }

      // 8) 다른 탭(스포츠 테스트, 베팅 탭)이 새 데이터를 다시 읽도록 nonce 증가
      setSportsTestReloadNonce(n => n + 1);
      setBettingFixturesReloadNonce(n => n + 1);

      // 9) 자동 결제 — 진행중 베팅 × 최신 fixtures 대조
      await autoSettle();

    } catch (e: any) {
      setRefreshNote({
        kind: "error",
        text: `❌ 새로고침 실패: ${String(e?.message ?? e)}`,
      });
    } finally {
      setRefreshLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, autoSettle]);

  // ── 캐시 메타 초기 로드 ──────────────────────────────────────
  useEffect(() => {
    db.loadFixturesCacheMeta().then(setCacheMeta).catch(()=>{});
  }, []);

  // ── 데이터 탭: 테이블 용량 조회 ─────────────────────────────
  const loadDataStats = useCallback(async()=>{
    setDataStatsLoading(true);
    try {
      // get_table_sizes RPC 시도
      const { data } = await (supabase.rpc as any)("get_table_sizes").catch(()=>({data:null}));
      if (data && Array.isArray(data)) {
        const m: Record<string,{rows:number,size:string,sizeBytes:number}> = {};
        let totalBytes = 0;
        for (const row of data) {
          m[row.table_name] = { rows: Number(row.row_count), size: row.size_pretty, sizeBytes: Number(row.size_bytes)||0 };
          totalBytes += Number(row.size_bytes)||0;
        }
        setDataTableStats(m);
        setDataTotalSize(totalBytes>0 ? (totalBytes/1024/1024).toFixed(2)+" MB" : "");
      } else {
        // fallback: count만 조회
        const tableKeys = ["bets","fixtures","deposits","withdrawals","manual_games","team_names","app_settings","logs","custom_leagues","m_meta","site_states"];
        const m: Record<string,{rows:number,size:string,sizeBytes:number}> = {};
        await Promise.all(tableKeys.map(async k=>{
          const { count } = await supabase.from(k as any).select("*",{count:"exact",head:true});
          m[k] = { rows: count||0, size:"-", sizeBytes:0 };
        }));
        setDataTableStats(m);
        setDataTotalSize("");
      }
    } catch(e) { console.error(e); }
    finally { setDataStatsLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // 데이터 탭 진입 시 자동 조회
  useEffect(()=>{
    if(tab==="dataManager") loadDataStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab]);

  // ── 자동 결제 함수 ───────────────────────────────────────────
  // refreshFixtures() 호출 후 실행.
  // 진행중 베팅 중 fixtureId 있는 것만 대상.
  // fixtures 테이블에서 결과 조회 → 승/패/취소/연기/중단 자동 판정.
  // 판정 후 bets 테이블 업데이트 + 로컬 state 반영.
  // 확인 버튼은 UI에서 처리 (여기선 판정만).
  // ── 리그-API 매핑 state ──────────────────────────────────────
  // 리그별로 어떤 API를 사용하는지 매핑 { "리그명": "sport_id" }
  // app_settings 테이블에 "league_api_map" 키로 저장
  const [leagueApiMap, setLeagueApiMap] = useState<Record<string,string>>({});
  const saveLeagueApiMap = (m: Record<string,string>) => {
    setLeagueApiMap(m);
    db.saveAppSetting("league_api_map", m);
  };
  // 리그 API 매핑 모달
  const [leagueApiModal, setLeagueApiModal] = useState<{league:string; sport:string; country:string}|null>(null);
  const [leagueApiTab, setLeagueApiTab] = useState<"recommend"|"all">("recommend");

  // ── [스포츠 테스트] 사용자 리그 ↔ API 리그 매핑 ──────────────
  // 키: 사용자 리그 식별자 "{sport_kr}__{country}__{league}"
  // 값: API league_id (number를 string으로)
  // app_settings 테이블에 "sports_test_league_map" 키로 저장
  const [stLeagueMap, setStLeagueMap] = useState<Record<string,string>>({});
  const saveStLeagueMap = (m: Record<string,string>) => {
    setStLeagueMap(m);
    db.saveAppSetting("sports_test_league_map", m);
  };
  // 매핑 선택 모달 (리그 클릭 시 열림)
  const [stMappingModal, setStMappingModal] = useState<{sport:Sport; sportKr:string; country:string; league:string}|null>(null);
  const [stMappingSelectedId, setStMappingSelectedId] = useState<string>("");

  // ── 수익률 기타 ──────────────────────────────────────────
  const [pextForm,setPextForm]=useState({category:"",subCategory:"",subSubCategory:"",amount:0,note:"",isIncome:true});
  // 기타수익 카테고리 추가 모달
  const [pextAddMenu,setPextAddMenu]=useState<null|{type:"site"|"cat"|"subcat"}>(null);
  const [pextAddName,setPextAddName]=useState("");
  // 기타수익 펼침 상태
  const [pextExpanded,setPextExpanded]=useState<Record<string,boolean>>({});
  // 기타수익 입력 모드: 폼 펼침
  const [pextFormOpen,setPextFormOpen]=useState(false);
  const [newPextSite,setNewPextSite]=useState("");
  const [newPextCat,setNewPextCat]=useState("");

  // ── 리그 핸들러 ──────────────────────────────────────────
  const handleAddLeague=()=>{
    const name=newLeagueName.trim();if(!name||!addLeagueModal)return;
    setCustomLeaguesRaw(p=>({...p,[addLeagueModal.cat]:[...(p[addLeagueModal.cat]||[]),name]}));
    db.insertCustomLeague(addLeagueModal.cat,name);
    setNewLeagueName("");setAddLeagueModal(null);addLog("➕ 리그 추가",`${addLeagueModal.cat}/${name}`);
  };
  const handleEditLeague=()=>{
    const name=editLeagueName.trim();if(!name||!editLeagueModal)return;
    setCustomLeaguesRaw(p=>{const arr=[...(p[editLeagueModal.cat]||[])];arr[editLeagueModal.idx]=name;return{...p,[editLeagueModal.cat]:arr};});
    db.updateCustomLeague(editLeagueModal.cat,editLeagueModal.old,name);
    setEditLeagueModal(null);setEditLeagueName("");
  };

  const cancelBet=(id:string)=>{
    if(!window.confirm("베팅을 취소하시겠습니까?"))return;
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    setBetsRaw(b=>b.filter(x=>x.id!==id));db.deleteBet(id);
    const newSS2={...siteStates,[bet.site]:{...siteStates[bet.site],betTotal:parseFloat(Math.max(0,siteStates[bet.site].betTotal-bet.amount).toFixed(2))}};
    setSiteStatesRaw(newSS2);db.upsertSiteState(bet.site,newSS2[bet.site]);
    addLog("🚫 취소",bet.homeTeam||bet.teamName||id);
  };

  const handleDeposit=()=>{
    if(!depSite)return alert("사이트를 선택해주세요.");
    if(depAmt<=0&&depPoint<=0)return;
    if(depAmt>0){
      const newDep={id:String(Date.now()),site:depSite,amount:depAmt,date:today,isDollar:depIsDollar};
      setDepositsRaw(d=>[...d,newDep]);db.insertDeposit(newDep);
      const newSS3={...siteStates,[depSite]:{...siteStates[depSite],deposited:parseFloat((siteStates[depSite].deposited+depAmt).toFixed(2)),active:true,isDollar:depIsDollar}};
      setSiteStatesRaw(newSS3);db.upsertSiteState(depSite,newSS3[depSite]);
      addLog("💵 입금",`${depSite}/${fmtDisp(depAmt,depIsDollar)}`);
    }
    if(depPoint>0){
      const curSS=siteStates[depSite];
      const prevPoint=parseFloat(String(curSS.pointTotal||0));
      const updatedSiteP={...curSS,active:true,isDollar:depIsDollar,betTotal:parseFloat((curSS.betTotal+depPoint).toFixed(2)),pointTotal:parseFloat((prevPoint+depPoint).toFixed(2))};
      const newSS4={...siteStates,[depSite]:updatedSiteP};
      setSiteStatesRaw(newSS4);
      db.upsertSiteState(depSite,updatedSiteP);
      addLog("🎁 포인트",`${depSite}/${fmtDisp(depPoint,depIsDollar)}`);
    }
    setDepSite("");setDepAmt(0);setDepPoint(0);
  };

  // 포인트 전용 추가 (입금 통계엔 기록 X, 사이트 잔여금만 증가)
  const handleAddPoint=(site:string, amount:number)=>{
    if(!site) return alert("사이트를 선택해주세요.");
    if(!amount||amount<=0) return alert("포인트 금액을 입력해주세요.");
    const dollar=isUSD(site);
    const curSS = siteStates[site] || {deposited:0,betTotal:0,active:false,isDollar:dollar,pointTotal:0};
    const prevPoint = parseFloat(String(curSS.pointTotal||0));
    const updated = {
      ...curSS,
      active: true,
      isDollar: dollar,
      // deposited에 +하여 잔여금(=deposited-betTotal) 증가 → 베팅 가능 금액 증가
      deposited: parseFloat((curSS.deposited + amount).toFixed(2)),
      pointTotal: parseFloat((prevPoint + amount).toFixed(2)),
    };
    setSiteStatesRaw(p=>({...p,[site]:updated}));
    db.upsertSiteState(site,updated);
    addLog("🎁 포인트",`${site}/${fmtDisp(amount,dollar)}`);
    // deposits 배열(입금 통계)엔 추가하지 않음 - 수익률 계산에서 제외
  };

  const handleClose=(site:string)=>{setCloseWithdrawAmt(0);setCloseModal({site});};
  const confirmClose=()=>{
    if(!closeModal)return;const site=closeModal.site;
    const dollar=isUSD(site);
    // 진행중 베팅 있으면 재확인
    const pendingBetsAtSite = bets.filter(b=>b.site===site && b.result==="진행중");
    if(pendingBetsAtSite.length>0){
      if(!window.confirm(`⚠ ${site}에 진행중 베팅 ${pendingBetsAtSite.length}건이 있습니다.\n\n그래도 마감하시겠어요?\n(진행중 베팅은 결과 확정 시까지 유지됩니다)`)){
        return;
      }
    }
    // 세션 수익 계산 (직전 출금 이후 입금액 - 이번 출금액)
    const siteWths = withdrawals.filter(w=>w.site===site).sort((a,b)=>a.date.localeCompare(b.date));
    const prevWthDate = siteWths.length>0 ? siteWths[siteWths.length-1].date : "0000-00-00";
    const sessionDepSum = deposits.filter(d=>d.site===site && d.date>prevWthDate).reduce((s,d)=>s+d.amount,0);
    const sessionNet = closeWithdrawAmt - sessionDepSum;

    if(closeWithdrawAmt>0){
      const newWth={id:String(Date.now()),site,amount:closeWithdrawAmt,date:today,isDollar:dollar};
      setWithdrawalsRaw(w=>[...w,newWth]);db.insertWithdrawal(newWth);
    }
    // ★ 마감 시에만 사이트 초기화 (deposited, betTotal, pointTotal 모두 0)
    const closedSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false,pointTotal:0}};
    setSiteStatesRaw(closedSS);db.upsertSiteState(site,closedSS[site]);
    // 로그에 세션 수익 표시
    const netStr = `${sessionNet>=0?"+":""}${fmtDisp(sessionNet,dollar)}`;
    addLog("🔒 마감",`${site} · 입금 ${fmtDisp(sessionDepSum,dollar)} → 출금 ${fmtDisp(closeWithdrawAmt,dollar)} = ${netStr}`);
    setCloseModal(null);
  };
  const cancelSite=(site:string)=>{
    if(!window.confirm(`${site} 취소? 입금 금액도 삭제됩니다.`))return;
    const cancelledSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false,pointTotal:0}};
    setSiteStatesRaw(cancelledSS);db.upsertSiteState(site,cancelledSS[site]);
    setDepositsRaw(d=>d.filter(dep=>dep.site!==site));db.deleteDepositsBySite(site);
    addLog("❌ 사이트 취소",site);
  };
  const updateResult=(id:string,result:string)=>{
    setBetsRaw(b=>{
      const next=b.map(bet=>{
        if(bet.id!==id)return bet;
        const profit=result==="승"?parseFloat((bet.amount*bet.odds-bet.amount).toFixed(2)):result==="패"?-bet.amount:0;
        const updated={...bet,result,profit};db.upsertBet(updated);
        addLog(result==="승"?"✅ 적중":"❌ 실패",bet.homeTeam||bet.teamName||"");
        return updated;
      });
      return next;
    });
  };

  // 확인 버튼 — 대기_* 최종 확정. siteStates 절대 건드리지 않음
  const confirmResult=(id:string)=>{
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    const actualResult=bet.result==="대기_승"?"승":bet.result==="대기_패"?"패":(bet.result==="대기_취소"||bet.result==="대기_연기"||bet.result==="대기_중단")?"취소":["취소","연기","중단"].includes(bet.result)?"취소":bet.result;
    const finalProfit=actualResult==="승"?parseFloat((bet.amount*bet.odds-bet.amount).toFixed(2)):actualResult==="패"?-bet.amount:0;
    const confirmed={...bet,result:actualResult,profit:finalProfit} as Bet;
    setBetsRaw(b=>b.map(x=>x.id===id?confirmed:x));
    db.upsertBet(confirmed);
    addLog(actualResult==="취소"?"↩ 환원":actualResult==="승"?"✅ 확인":"❌ 확인",`${bet.homeTeam||bet.teamName||""}`);
  };
  const revertToPending=(id:string)=>{
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    // result/profit만 되돌림 — siteStates(입금/베팅/잔여) 절대 건드리지 않음
    const reverted={...bet,result:"진행중",profit:null};
    setBetsRaw(b=>b.map(x=>x.id===id?reverted:x));
    db.upsertBet(reverted);
    addLog("↩ 처리 취소",`${bet.site}/${bet.homeTeam||bet.teamName||id}`);
    setTimeout(()=>autoSettle(),300);
  };
  const deleteFromStats=(id:string)=>{
    setBetsRaw(b=>b.map(bet=>{if(bet.id!==id)return bet;const u={...bet,includeStats:false};db.upsertBet(u);return u;}));
    addLog("🗑 통계삭제","");
  };
  const deleteForever=(id:string)=>{
    setBetsRaw(b=>b.filter(x=>x.id!==id));db.deleteBet(id);addLog("💥 영구삭제","");
  };
  const handleDeleteChoice=(choice:"stats"|"forever")=>{if(!deleteModal)return;choice==="stats"?deleteFromStats(deleteModal.betId):deleteForever(deleteModal.betId);setDeleteModal(null);};

  const isOverUnder=(opt:string)=>opt.includes("오버")||opt.includes("언더");

  // ── 진행중 베팅 카드 렌더링 헬퍼 (도장 UI) ────────────────────
  // 스포츠 탭 / 베팅 내역 탭 공용
  const renderPendingCard = (b: Bet) => {
    const title=(b.homeTeam&&b.awayTeam)?`${b.homeTeam} vs ${b.awayTeam}`:(b.teamName||"-");
    const displayBetOption=b.betOption==="홈승"&&b.homeTeam?`${b.homeTeam} 승`:b.betOption==="원정승"&&b.awayTeam?`${b.awayTeam} 승`:b.betOption;
    const dollar=b.isDollar;
    const isManual=(b as any).isManual===true;
    const hasFixtureId=!isManual&&(b as any).fixtureId!=null;

    // 대기_* = 자동 판정 완료, 사용자 확인 대기
    const autoResult = b.result.startsWith("대기_");
    const actualResult = b.result==="대기_승"?"승":b.result==="대기_패"?"패":b.result==="대기_취소"?"취소":b.result==="대기_연기"?"연기":b.result==="대기_중단"?"중단":b.result;
    const stampColor = actualResult==="승"?C.green:actualResult==="패"?C.red:C.amber;
    const stampText = actualResult==="승"?"적중":actualResult==="패"?"실패":actualResult==="취소"?"취소":actualResult==="연기"?"연기":"중단";

    return (
      <div key={b.id} style={{position:"relative",background:autoResult?`${stampColor}0d`:C.bg3,border:`1px solid ${autoResult?stampColor+"99":C.amber+"44"}`,borderRadius:7,padding:"9px 11px",marginBottom:6,overflow:"hidden"}}>
        {autoResult && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:1}}>
            <div style={{border:`5px solid ${stampColor}`,borderRadius:10,padding:"8px 22px",transform:"rotate(-12deg)",fontSize:26,fontWeight:900,color:stampColor,letterSpacing:6,opacity:0.7,textShadow:`0 0 12px ${stampColor}`,background:`${stampColor}18`}}>{stampText}</div>
          </div>
        )}
        <div style={{position:"relative",zIndex:2,opacity:autoResult?0.5:1}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5,flexWrap:"wrap"}}>
            <span style={{fontSize:13,flexShrink:0}}>{SPORT_ICON[b.category]||"🎯"}</span>
            <span style={{fontSize:9,color:dollar?C.amber:C.green,background:`${dollar?C.amber:C.green}22`,border:`1px solid ${dollar?C.amber:C.green}44`,padding:"1px 5px",borderRadius:3,fontWeight:700}}>{dollar?"$":"₩"} {b.site}</span>
            {(b as any).country && <span style={{fontSize:9,color:C.teal,background:`${C.teal}11`,border:`1px solid ${C.teal}33`,padding:"1px 5px",borderRadius:3,fontWeight:700}}>{(b as any).country}</span>}
            {b.league && <span style={{fontSize:9,color:C.muted,background:C.bg,padding:"1px 5px",borderRadius:3}}>{b.league}</span>}
            {isManual && <span style={{fontSize:9,color:C.purple,background:`${C.purple}22`,border:`1px solid ${C.purple}44`,padding:"1px 5px",borderRadius:3,fontWeight:700}}>수동</span>}
            <span style={{fontSize:11,color:C.orange,fontWeight:800,marginLeft:"auto"}}>{displayBetOption}</span>
          </div>
          <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:6,lineHeight:1.3,wordBreak:"break-word"}}>{title}</div>
          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:8,flex:1,minWidth:100}}>
              <span style={{fontSize:10,color:C.muted}}>배당 <span style={{color:C.teal,fontWeight:800,fontSize:11}}>{b.odds}</span></span>
              <span style={{fontSize:11,color:C.amber,fontWeight:800}}>{fmtDisp(b.amount,b.isDollar)}</span>
            </div>
            {!autoResult && (
              <div style={{display:"flex",gap:3,flexShrink:0}}>
                {isManual||!hasFixtureId?(<><button onClick={()=>updateResult(b.id,"승")} style={{background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontWeight:800,fontSize:11}}>적중</button><button onClick={()=>updateResult(b.id,"패")} style={{background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontWeight:800,fontSize:11}}>실패</button></>):null}
                <button onClick={()=>cancelBet(b.id)} style={{background:C.bg,border:`1px solid ${C.border2}`,color:C.muted,padding:"4px 10px",borderRadius:4,cursor:"pointer",fontSize:11}}>취소</button>
              </div>
            )}
          </div>
        </div>
        {autoResult && (
          <div style={{position:"relative",zIndex:3,marginTop:8,display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>confirmResult(b.id)} style={{padding:"6px 20px",borderRadius:6,fontWeight:900,fontSize:13,cursor:"pointer",letterSpacing:1,background:stampColor,border:`2px solid ${stampColor}`,color:C.bg,boxShadow:`0 2px 10px ${stampColor}66`}}>
              {actualResult==="승"?"✅ 적중 확인":actualResult==="패"?"❌ 실패 확인":"✔ 확인"}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── 통계 계산 ─────────────────────────────────────────────
  const weekDeposits=useMemo(()=>{
    const wm=weekMonday(),m:Record<string,number>=Object.fromEntries(ALL_SITES.map(s=>[s,0]));
    deposits.filter(d=>d.date>=wm).forEach(d=>{m[d.site]+=d.amount;});return m;
  },[deposits,ALL_SITES]);

  const pending=bets.filter(b=>b.result==="진행중"||b.result.startsWith("대기_"));
  // 진행중 최신순 정렬 — bettingCombo + sportsTest 탭 공용
  const pendingSorted=[...pending].sort((a,b)=>{
    const ta=parseFloat(a.id)||0;
    const tb=parseFloat(b.id)||0;
    return tb-ta;
  });
  // ⚡ 라이브 베팅(isLive=true)은 별도 "실시간" 통계에서만 집계되도록 done에서 제외
  const done=bets.filter(b=>!b.result.startsWith("대기_")&&b.result!=="진행중"&&b.includeStats!==false&&(b as any).isLive!==true);
  const doneFull=bets.filter(b=>!b.result.startsWith("대기_")&&b.result!=="진행중"&&(b as any).isLive!==true);
  const doneTodayFull=doneFull.filter(b=>b.date===today);
  const doneOldFull=doneFull.filter(b=>b.date!==today);
  const krwProfit=done.filter(b=>!b.isDollar).reduce((s,b)=>s+(b.profit??0),0);
  const usdProfit=done.filter(b=>b.isDollar).reduce((s,b)=>s+(b.profit??0),0);
  const wins=done.filter(b=>b.result==="승").length;
  const winRate=done.length>0?Math.round(wins/done.length*100):0;
  const avgOdds=done.length>0?(done.reduce((s,b)=>s+b.odds,0)/done.length).toFixed(2):"0";

  const dailyStats=useMemo(()=>{
    const m:Record<string,{profit:number,count:number,wins:number,bet:number}>={};
    done.filter(b=>!b.isDollar).forEach(b=>{if(!m[b.date])m[b.date]={profit:0,count:0,wins:0,bet:0};m[b.date].profit+=b.profit??0;m[b.date].count++;m[b.date].bet+=b.amount;if(b.result==="승")m[b.date].wins++;});
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date:date.slice(5),fullDate:date,...v,winRate:Math.round(v.wins/v.count*100),roi:v.bet>0?((v.profit/v.bet)*100).toFixed(1):"0"}));
  },[done]);
  const cumCurve=useMemo(()=>{let c=0;return dailyStats.map(d=>{c+=d.profit;return{date:d.date,cumProfit:c};});},[dailyStats]);
  const {maxW,maxL,curS}=useMemo(()=>{
    const sorted=[...done].sort((a,b)=>a.date.localeCompare(b.date));
    let mW=0,mL=0,cW=0,cL=0;
    sorted.forEach(b=>{if(b.result==="승"){cW++;cL=0;mW=Math.max(mW,cW);}else if(b.result==="패"){cL++;cW=0;mL=Math.max(mL,cL);}});
    const lr=sorted.length?sorted[sorted.length-1].result:"";
    return{maxW:mW,maxL:mL,curS:lr==="승"?`${cW}연승`:lr==="패"?`${cL}연패`:"—"};
  },[done]);
  const baseballDone=done.filter(b=>b.category==="야구");
  const bbLeagueStats=useMemo(()=>[...new Set(baseballDone.map(b=>b.league))].map(league=>({league,data:["역배","오버","언더"].map(opt=>{const bs=baseballDone.filter(b=>b.league===league&&(opt==="역배"?b.betOption==="역배":opt==="오버"?b.betOption.includes("오버"):b.betOption.includes("언더")));const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{opt,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})})),[baseballDone]);
  const bbOptStats=useMemo(()=>["역배","오버","언더"].map(opt=>({opt,data:[...new Set(baseballDone.filter(b=>opt==="역배"?b.betOption==="역배":opt==="오버"?b.betOption.includes("오버"):b.betOption.includes("언더")).map(b=>b.league))].map(league=>{const bs=baseballDone.filter(b=>b.league===league&&(opt==="역배"?b.betOption==="역배":opt==="오버"?b.betOption.includes("오버"):b.betOption.includes("언더")));const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{league,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})})),[baseballDone]);
  const advStats=useMemo(()=>{
    const catDone=done.filter(b=>b.category===advCat);
    if(advMode==="league")return[...new Set(catDone.map(b=>b.league))].map(league=>({key:league,subs:[...new Set(catDone.filter(b=>b.league===league).map(b=>b.betOption))].map(opt=>{const bs=catDone.filter(b=>b.league===league&&b.betOption===opt);const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{name:opt,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})}));
    return[...new Set(catDone.map(b=>b.betOption))].map(opt=>({key:opt,subs:[...new Set(catDone.filter(b=>b.betOption===opt).map(b=>b.league))].map(league=>{const bs=catDone.filter(b=>b.betOption===opt&&b.league===league);const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{name:league,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})}));
  },[done,advCat,advMode]);

  // 전체 ROI (KRW 기준)
  const roiPctOverall = useMemo(()=>{
    const totalBet = done.reduce((s,b)=>s+b.amount,0);
    const totalProf = done.reduce((s,b)=>s+(b.profit??0),0);
    return totalBet>0 ? ((totalProf/totalBet)*100).toFixed(1) : "0";
  },[done]);

  // ── 야구: 승패 / 언오버 종합 통계 ──
  const baseballSummary = useMemo(()=>{
    const calc = (filt:(b:Bet)=>boolean)=>{
      const bs = baseballDone.filter(filt);
      const profit = bs.reduce((s,b)=>s+(b.profit??0),0);
      const bet = bs.reduce((s,b)=>s+b.amount,0);
      const wins = bs.filter(b=>b.result==="승").length;
      return {count:bs.length,profit,bet,wins,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};
    };
    return {
      정배: calc(b=>b.betOption==="정배"),
      역배: calc(b=>b.betOption==="역배"),
      오버: calc(b=>b.betOption.includes("오버")),
      언더: calc(b=>b.betOption.includes("언더")),
    };
  },[baseballDone]);

  // ── 야구 리그별 종합 (승패+언오버) ──
  const baseballLeagueSummary = useMemo(()=>{
    const leagues = [...new Set(baseballDone.map(b=>b.league))];
    return leagues.map(league=>{
      const calc = (filt:(b:Bet)=>boolean)=>{
        const bs = baseballDone.filter(b=>b.league===league && filt(b));
        const profit = bs.reduce((s,b)=>s+(b.profit??0),0);
        const bet = bs.reduce((s,b)=>s+b.amount,0);
        const wins = bs.filter(b=>b.result==="승").length;
        return {count:bs.length,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};
      };
      const totalProfit = baseballDone.filter(b=>b.league===league).reduce((s,b)=>s+(b.profit??0),0);
      return {
        league,
        totalProfit,
        winLose: calc(b=>b.betOption==="정배"||b.betOption==="역배"),
        overUnder: calc(b=>b.betOption.includes("오버")||b.betOption.includes("언더")),
      };
    }).sort((a,b)=>b.totalProfit - a.totalProfit);
  },[baseballDone]);

  // ── 축구 옵션별 (홈/원정 0.5/1.5/2.5) ──
  const footballDone = done.filter(b=>b.category==="축구");
  const footballOptStats = useMemo(()=>{
    const opts = ["홈 0.5","홈 1.5","홈 2.5","원정 0.5","원정 1.5","원정 2.5"];
    return opts.map(opt=>{
      const bs = footballDone.filter(b=>b.betOption===opt);
      const profit = bs.reduce((s,b)=>s+(b.profit??0),0);
      const bet = bs.reduce((s,b)=>s+b.amount,0);
      const wins = bs.filter(b=>b.result==="승").length;
      return {opt, count:bs.length, profit, bet, wins,
        roi: bet>0?parseFloat(((profit/bet)*100).toFixed(1)):0,
        winRate: bs.length>0?Math.round(wins/bs.length*100):0};
    });
  },[footballDone]);

  // ── 축구 리그별 종합 ──
  const footballLeagueSummary = useMemo(()=>{
    const leagues = [...new Set(footballDone.map(b=>b.league))];
    return leagues.map(league=>{
      const bs = footballDone.filter(b=>b.league===league);
      const profit = bs.reduce((s,b)=>s+(b.profit??0),0);
      const bet = bs.reduce((s,b)=>s+b.amount,0);
      const wins = bs.filter(b=>b.result==="승").length;
      return {league, count:bs.length, profit,
        roi: bet>0?((profit/bet)*100).toFixed(1):"0",
        winRate: bs.length>0?Math.round(wins/bs.length*100):0};
    }).sort((a,b)=>b.profit-a.profit);
  },[footballDone]);

  // ── 농구 5.5 ~ 29.5 플핸 옵션별 ──
  const basketballDone = done.filter(b=>b.category==="농구");
  const basketballOptStats = useMemo(()=>{
    const opts:string[] = [];
    for(let v=5.5; v<=29.5; v+=1) opts.push(`${v} 플핸`);
    return opts.map(opt=>{
      const bs = basketballDone.filter(b=>b.betOption===opt);
      const profit = bs.reduce((s,b)=>s+(b.profit??0),0);
      const bet = bs.reduce((s,b)=>s+b.amount,0);
      const wins = bs.filter(b=>b.result==="승").length;
      return {opt, label:opt.replace(" 플핸",""), count:bs.length, profit, bet, wins,
        roi: bet>0?parseFloat(((profit/bet)*100).toFixed(1)):0,
        winRate: bs.length>0?Math.round(wins/bs.length*100):0};
    });
  },[basketballDone]);

  // ── 농구 리그별 종합 ──
  const basketballLeagueSummary = useMemo(()=>{
    const leagues = [...new Set(basketballDone.map(b=>b.league))];
    return leagues.map(league=>{
      const bs = basketballDone.filter(b=>b.league===league);
      const profit = bs.reduce((s,b)=>s+(b.profit??0),0);
      const bet = bs.reduce((s,b)=>s+b.amount,0);
      const wins = bs.filter(b=>b.result==="승").length;
      return {league, count:bs.length, profit,
        roi: bet>0?((profit/bet)*100).toFixed(1):"0",
        winRate: bs.length>0?Math.round(wins/bs.length*100):0};
    }).sort((a,b)=>b.profit-a.profit);
  },[basketballDone]);

  const roiStats=useMemo(()=>{
    return ALL_SITES.map(site=>{
      const dollar=isUSD(site);
      const siteWths=withdrawals.filter(w=>w.site===site).sort((a,b)=>a.date.localeCompare(b.date));
      if(siteWths.length===0)return null;
      const siteDepsAll=deposits.filter(d=>d.site===site).sort((a,b)=>a.date.localeCompare(b.date));
      const sessions=siteWths.map((wth,idx)=>{
        const prevWthDate=idx>0?siteWths[idx-1].date:"0000-00-00";
        const sessionDeps=siteDepsAll.filter(d=>d.date>prevWthDate&&d.date<=wth.date);
        const totalDep=sessionDeps.reduce((s,d)=>s+d.amount,0);
        const netKRW=dollar?(wth.amount-totalDep)*usdKrw:(wth.amount-totalDep);
        return{sessionIdx:idx+1,wthDate:wth.date,wthAmt:wth.amount,totalDep,netKRW,deps:sessionDeps};
      });
      const totalDep=sessions.reduce((s,ss)=>s+ss.totalDep,0);
      const totalWth=siteWths.reduce((s,w)=>s+w.amount,0);
      const netKRW=sessions.reduce((s,ss)=>s+ss.netKRW,0);
      return{site,dollar,totalDep,totalWth,netKRW,sessions,hasData:true};
    }).filter(Boolean) as {site:string,dollar:boolean,totalDep:number,totalWth:number,netKRW:number,sessions:any[],hasData:boolean}[];
  },[deposits,withdrawals,usdKrw,ALL_SITES,isUSD]);

  const activeTotalKrwDep=ALL_SITES.filter(s=>!isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].deposited:0),0);
  const activeTotalUsdDep=ALL_SITES.filter(s=>isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].deposited:0),0);
  const activeTotalKrwBet=ALL_SITES.filter(s=>!isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].betTotal:0),0);
  const activeTotalUsdBet=ALL_SITES.filter(s=>isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].betTotal:0),0);

  const extraRoiStats=useMemo(()=>{
    const cats:Record<string,{income:number,expense:number,items:any[],bySub:Record<string,{income:number,expense:number,items:any[],bySubSub:Record<string,{income:number,expense:number,items:any[]}>}>}>={};
    profitExtras.forEach((e:any)=>{
      if(!cats[e.category])cats[e.category]={income:0,expense:0,items:[],bySub:{}};
      if(e.isIncome)cats[e.category].income+=e.amount;else cats[e.category].expense+=e.amount;
      cats[e.category].items.push(e);
      const sub = e.subCategory||"기타";
      if(!cats[e.category].bySub[sub])cats[e.category].bySub[sub]={income:0,expense:0,items:[],bySubSub:{}};
      if(e.isIncome)cats[e.category].bySub[sub].income+=e.amount;else cats[e.category].bySub[sub].expense+=e.amount;
      cats[e.category].bySub[sub].items.push(e);
      const subSub = e.subSubCategory||"-";
      if(!cats[e.category].bySub[sub].bySubSub[subSub])cats[e.category].bySub[sub].bySubSub[subSub]={income:0,expense:0,items:[]};
      if(e.isIncome)cats[e.category].bySub[sub].bySubSub[subSub].income+=e.amount;else cats[e.category].bySub[sub].bySubSub[subSub].expense+=e.amount;
      cats[e.category].bySub[sub].bySubSub[subSub].items.push(e);
    });
    return cats;
  },[profitExtras]);

  const totalRoiKRW=useMemo(()=>roiStats.reduce((s,r)=>s+r.netKRW,0)+profitExtras.reduce((s,e)=>s+(e.isIncome?e.amount:-e.amount),0),[roiStats,profitExtras]);

  // ── 주간/월간/일별 수익률 통계 ─────────────────────────────
  const dateRanges = useMemo(()=>{
    const t = new Date(today+"T00:00:00");
    const day = t.getDay(); // 0=일, 1=월
    const monOff = day===0?-6:1-day;
    const weekStart = new Date(t); weekStart.setDate(t.getDate()+monOff);
    const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
    const monthEnd = new Date(t.getFullYear(), t.getMonth()+1, 0);
    const weekStartStr = weekStart.toISOString().slice(0,10);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const monthEndStr = monthEnd.toISOString().slice(0,10);
    return {weekStartStr, monthStartStr, monthEndStr,
      monthYear: t.getFullYear(), monthIdx: t.getMonth(),
      monthDays: monthEnd.getDate(),
      monthFirstDow: monthStart.getDay()};
  },[today]);

  // 환율 적용해서 KRW로 환산하는 헬퍼
  const toKRW = useCallback((amt:number, dollar:boolean)=>dollar?amt*usdKrw:amt,[usdKrw]);

  // 일별 종합 수익 (베팅 + 기타수익 - 기타지출)
  // 입금/출금은 사이트별 마감 정산 후에만 수익 인정되므로 일별 그래프엔 베팅+기타만
  const dailyAllRoi = useMemo(()=>{
    const m:Record<string,{betProfit:number,extraIncome:number,extraExpense:number,deposit:number,withdraw:number,betCount:number}>={};
    bets.filter(b=>b.result==="승"||b.result==="패").forEach(b=>{
      if(!m[b.date]) m[b.date]={betProfit:0,extraIncome:0,extraExpense:0,deposit:0,withdraw:0,betCount:0};
      m[b.date].betProfit += toKRW(b.profit??0, b.isDollar);
      m[b.date].betCount++;
    });
    profitExtras.forEach(e=>{
      if(!m[e.date]) m[e.date]={betProfit:0,extraIncome:0,extraExpense:0,deposit:0,withdraw:0,betCount:0};
      if(e.isIncome) m[e.date].extraIncome += e.amount;
      else m[e.date].extraExpense += e.amount;
    });
    deposits.forEach(d=>{
      if(!m[d.date]) m[d.date]={betProfit:0,extraIncome:0,extraExpense:0,deposit:0,withdraw:0,betCount:0};
      m[d.date].deposit += toKRW(d.amount, d.isDollar);
    });
    withdrawals.forEach(w=>{
      if(!m[w.date]) m[w.date]={betProfit:0,extraIncome:0,extraExpense:0,deposit:0,withdraw:0,betCount:0};
      m[w.date].withdraw += toKRW(w.amount, w.isDollar);
    });
    return Object.entries(m)
      .map(([date,v])=>({date, ...v, total: v.betProfit + v.extraIncome - v.extraExpense}))
      .sort((a,b)=>b.date.localeCompare(a.date)); // 최근 → 과거
  },[bets, profitExtras, deposits, withdrawals, toKRW]);

  // 이번 주 수익
  const weekRoi = useMemo(()=>{
    return dailyAllRoi.filter(d=>d.date>=dateRanges.weekStartStr && d.date<=today)
      .reduce((s,d)=>s+d.total,0);
  },[dailyAllRoi, dateRanges.weekStartStr, today]);

  // 이번 달 수익
  const monthRoi = useMemo(()=>{
    return dailyAllRoi.filter(d=>d.date>=dateRanges.monthStartStr && d.date<=dateRanges.monthEndStr)
      .reduce((s,d)=>s+d.total,0);
  },[dailyAllRoi, dateRanges.monthStartStr, dateRanges.monthEndStr]);

  // 이번 달 캘린더용 데이터 (날짜 → 일별 수익)
  const monthCalendar = useMemo(()=>{
    const map:Record<string,{betProfit:number,extraIncome:number,extraExpense:number,deposit:number,withdraw:number,total:number,betCount:number}>={};
    dailyAllRoi.forEach(d=>{
      if(d.date>=dateRanges.monthStartStr && d.date<=dateRanges.monthEndStr){
        map[d.date] = d;
      }
    });
    return map;
  },[dailyAllRoi, dateRanges.monthStartStr, dateRanges.monthEndStr]);

  const esportsPrediction=useMemo(()=>{
    const teams:Record<string,{wins:number,losses:number,scored:number,conceded:number}>={};
    esportsRecords.filter(r=>r.league===esportsStratLeague).forEach(r=>{
      if(!teams[r.teamA])teams[r.teamA]={wins:0,losses:0,scored:0,conceded:0};
      if(!teams[r.teamB])teams[r.teamB]={wins:0,losses:0,scored:0,conceded:0};
      if(r.scoreA>r.scoreB){teams[r.teamA].wins++;teams[r.teamB].losses++;}else{teams[r.teamB].wins++;teams[r.teamA].losses++;}
      teams[r.teamA].scored+=r.scoreA;teams[r.teamA].conceded+=r.scoreB;
      teams[r.teamB].scored+=r.scoreB;teams[r.teamB].conceded+=r.scoreA;
    });return teams;
  },[esportsRecords,esportsStratLeague]);

  const krwRemaining=activeSiteNames.filter(s=>!isUSD(s)).reduce((sum,site)=>{const st=siteStates[site]||{deposited:0,betTotal:0};return sum+Math.max(0,st.deposited-st.betTotal);},0);
  const usdRemaining=activeSiteNames.filter(s=>isUSD(s)).reduce((sum,site)=>{const st=siteStates[site]||{deposited:0,betTotal:0};return sum+Math.max(0,st.deposited-st.betTotal);},0);

  // ── 현재 세션(마감 전) 사이트별 실시간 수익 ──
  // 마지막 마감(=출금) 이후의 베팅들 중 결과가 확정된 것만 합산
  // 진행중 베팅은 제외, 포인트는 입금/수익 계산에 미포함
  const currentSessionProfits = useMemo(()=>{
    const result:Record<string,{
      profit:number,        // 결과 확정된 베팅 순수익
      betCount:number,      // 결과 확정된 베팅 수
      pendingCount:number,  // 진행중 베팅 수
      sessionDep:number,    // 이번 세션 입금액 (포인트 미포함)
      roi:number,           // 수익률 % (입금 기준)
      sessionStartDate:string, // 세션 시작 날짜 (직전 마감 다음날)
    }> = {};
    ALL_SITES.forEach(site=>{
      // 마지막 출금(마감) 날짜 찾기
      const siteWths = withdrawals.filter(w=>w.site===site).sort((a,b)=>a.date.localeCompare(b.date));
      const prevWthDate = siteWths.length>0 ? siteWths[siteWths.length-1].date : "0000-00-00";
      // 직전 마감 이후 입금
      const sessionDeps = deposits.filter(d=>d.site===site && d.date>prevWthDate);
      const sessionDep = sessionDeps.reduce((s,d)=>s+d.amount,0);
      // 직전 마감 이후 베팅
      const sessionBets = bets.filter(b=>b.site===site && b.date>prevWthDate);
      const doneBets = sessionBets.filter(b=>b.result==="승"||b.result==="패");
      const profit = doneBets.reduce((s,b)=>s+(b.profit??0),0);
      const pendingCount = sessionBets.filter(b=>b.result==="진행중").length;
      const totalBetAmt = doneBets.reduce((s,b)=>s+b.amount,0);
      const roi = totalBetAmt>0 ? (profit/totalBetAmt)*100 : 0;
      result[site] = {
        profit,
        betCount: doneBets.length,
        pendingCount,
        sessionDep,
        roi,
        sessionStartDate: prevWthDate==="0000-00-00" ? (sessionDeps[0]?.date || "") : prevWthDate,
      };
    });
    return result;
  },[bets, deposits, withdrawals, ALL_SITES]);

  // 활성 사이트 전체 세션 수익 합계 (KRW 환산)
  const activeSessionProfitKRW = useMemo(()=>{
    return activeSiteNames.reduce((sum,site)=>{
      const sp = currentSessionProfits[site];
      if(!sp) return sum;
      return sum + (isUSD(site) ? sp.profit*usdKrw : sp.profit);
    },0);
  },[activeSiteNames, currentSessionProfits, usdKrw, isUSD]);

  // ── 서브 컴포넌트 ─────────────────────────────────────────
  const StatCard=({label,value,color,sub}:{label:string,value:string|number,color?:string,sub?:string})=>(
    <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 12px",minWidth:0}}>
      <div style={{fontSize:10,color:C.muted,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
      <div style={{fontSize:17,fontWeight:800,color:color??C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:C.dim,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sub}</div>}
    </div>
  );
  const SubRow=({s}:{s:any,key?:any})=>(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
      <div style={{flex:1,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
      <div style={{color:s.profit>=0?C.green:C.red,fontWeight:700,minWidth:70,textAlign:"right"}}>{fmtProfit(s.profit,false)}</div>
      <div style={{color:Number(s.roi)>=0?C.green:C.red,minWidth:55,textAlign:"right",fontSize:11}}>ROI {s.roi}%</div>
      <div style={{color:C.teal,minWidth:40,textAlign:"right",fontSize:11}}>{s.winRate}%</div>
      <div style={{color:C.dim,minWidth:30,textAlign:"right",fontSize:11}}>{s.count}건</div>
    </div>
  );

  const [editingBetId,setEditingBetId]=useState<string|null>(null);
  const [editBetForm,setEditBetForm]=useState<Partial<Bet>>({});
  const [editBetOddsRaw,setEditBetOddsRaw]=useState<string>("");

  const PendingCard=({b}:{b:Bet,key?:any})=>renderPendingCard(b) as React.ReactElement;

  const DoneCard=({b}:{b:Bet,key?:any})=>{
    const rc=b.result==="승"?C.green:b.result==="패"?C.red:C.amber;
    const title = (b.homeTeam && b.awayTeam) ? `${b.homeTeam} vs ${b.awayTeam}` : (b.teamName || "-");
    // ★ 구 데이터 "홈승"/"원정승" → "팀명 승"
    const displayBetOption =
      b.betOption==="홈승" && b.homeTeam ? `${b.homeTeam} 승` :
      b.betOption==="원정승" && b.awayTeam ? `${b.awayTeam} 승` :
      b.betOption;
    return(
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:7,padding:9,opacity:b.includeStats===false?0.5:0.9}}>
        {!b.includeStats&&<div style={{fontSize:8,color:C.dim,marginBottom:2}}>통계제외</div>}
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div><div style={{fontSize:9,color:C.muted}}>{b.date}·{displayBetOption}</div></div>
          <div style={{textAlign:"right",flexShrink:0,marginLeft:3}}>
            <div style={{fontSize:9,color:rc,border:`1px solid ${rc}44`,borderRadius:3,padding:"1px 4px",marginBottom:2}}>{b.result}</div>
            {b.profit!==null&&<div style={{fontSize:10,fontWeight:800,color:b.profit>=0?C.green:C.red}}>{fmtProfit(b.profit,b.isDollar)}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:3}}>
          {["승","패"].map(r=>(<button key={r} onClick={()=>updateResult(b.id,r)} style={{flex:1,background:b.result===r?C.border2:"transparent",border:`1px solid ${b.result===r?C.border2:C.border}`,color:b.result===r?C.text:C.dim,padding:"3px",borderRadius:3,cursor:"pointer",fontSize:10}}>{r==="승"?"적중":"실패"}</button>))}
          <button onClick={()=>revertToPending(b.id)} title="진행중으로 되돌리기" style={{background:`${C.amber}11`,border:`1px solid ${C.amber}66`,color:C.amber,padding:"3px 8px",borderRadius:3,cursor:"pointer",fontSize:10,fontWeight:700}}>↩ 처리취소</button>
          <button onClick={()=>setDeleteModal({betId:b.id})} title="삭제" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.dim,padding:"3px 5px",borderRadius:3,cursor:"pointer",fontSize:10}}>🗑</button>
        </div>
      </div>
    );
  };

  const tabBtn=(active:boolean,ac:string)=>({padding:"7px 18px",borderRadius:7,border:active?`1px solid ${ac}`:`1px solid ${C.border}`,background:active?`${ac}22`:"transparent",color:active?ac:C.muted,cursor:"pointer",fontWeight:700,fontSize:12} as React.CSSProperties);
  const siteBtn=(active:boolean,dollar:boolean)=>({padding:"4px 10px",borderRadius:5,border:active?`1px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?`${dollar?C.amber:C.green}22`:C.bg2,color:active?dollar?C.amber:C.green:C.muted,cursor:"pointer",fontSize:11,fontWeight:active?700:400} as React.CSSProperties);

  // ── 베팅 탭 트리 & 리그 게임 계산 (반드시 early return 전에 호출) ──
  const bettingTree = useMemo(()=>{
    const tree:Record<string,Record<string,LiveFixture[]>> = {};
    for (const f of bettingFixtures) {
      const c = ktr(f.country); const l = f.league_name;
      if (!tree[c]) tree[c] = {};
      if (!tree[c][l]) tree[c][l] = [];
      tree[c][l].push(f);
    }
    return tree;
  },[bettingFixtures]);

  const bettingCountries = useMemo(()=>{
    const ord = ["한국","미국","일본","잉글랜드","스페인","독일","이탈리아","프랑스","유럽","국제"];
    return Object.keys(bettingTree).sort((a,b)=>{
      const ai=ord.indexOf(a), bi=ord.indexOf(b);
      if (ai>=0 && bi>=0) return ai-bi;
      if (ai>=0) return -1;
      if (bi>=0) return 1;
      return a.localeCompare(b,"ko");
    });
  },[bettingTree]);

  const bettingLeagueGames = useMemo(()=>{
    if (!bettingCountry || !bettingLeague) return [];
    return (bettingTree[bettingCountry]?.[bettingLeague] || [])
      .sort((a,b)=>new Date(a.start_time).getTime()-new Date(b.start_time).getTime());
  },[bettingTree, bettingCountry, bettingLeague]);

  if(!authed) return <PasswordScreen onAuth={handleAuth}/>;
  if(!dbReady) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32}}>⚡</div>
      <div style={{color:C.orange,fontSize:18,fontWeight:800,letterSpacing:2}}>BET TRACKER</div>
      <div style={{color:C.muted,fontSize:13}}>Supabase에서 데이터 불러오는 중...</div>
    </div>
  );

  const bettingCacheMsg = (()=>{
    if (!bettingCacheInfo.fetchedAt || !bettingCacheInfo.expiresAt) return "캐시 없음";
    const remain = bettingCacheInfo.expiresAt - nowTick;
    if (remain <= 0) return "캐시 만료 · 새로고침 시 재호출";
    const m = Math.ceil(remain/60_000);
    return `다음 갱신까지 ${m}분`;
  })();

  const spColor = SPORT_META[bettingSport].color;

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>

      {/* ── 데이터 로드 실패 배너 ── */}
      {dataLoadErrors.length>0 && (
        <div style={{background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,fontSize:13}}>
          <div style={{flex:1}}>
            <b>⚠ 데이터 로드 실패</b> · 일부 데이터를 불러오지 못했습니다.
            <span style={{opacity:0.7,marginLeft:8}}>({dataLoadErrors.join(", ")})</span>
          </div>
          <button onClick={()=>{setDataLoadErrors([]);setDbReloadNonce(n=>n+1);}}
            style={{padding:"5px 12px",borderRadius:5,border:`1px solid ${C.red}`,background:"transparent",color:C.red,cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>
            🔄 다시 시도
          </button>
          <button onClick={()=>setDataLoadErrors([])}
            style={{padding:"5px 10px",borderRadius:5,border:`1px solid ${C.red}66`,background:"transparent",color:C.red,cursor:"pointer",fontSize:12}}>
            ✕
          </button>
        </div>
      )}
      {/* ── 모달들 ── */}
      {siteManageModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.teal}`,borderRadius:14,padding:24,width:380,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.teal,marginBottom:16}}>🏢 사이트 관리</div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              <input value={newSiteName} onChange={e=>setNewSiteName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddSite()} placeholder="사이트 이름" style={{...S,flex:1,boxSizing:"border-box"}}/>
              <select value={newSiteType} onChange={e=>setNewSiteType(e.target.value as "krw"|"usd")} style={{...S,width:"auto"}}>
                <option value="krw">₩ 원화</option>
                <option value="usd">$ 달러</option>
              </select>
              <button onClick={handleAddSite} style={{padding:"7px 14px",background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,borderRadius:6,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>추가</button>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>원화 사이트</div>
            {krwSites.map(s=>(
              <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.bg2,borderRadius:6,marginBottom:4}}>
                <span style={{fontSize:12,color:C.green}}>₩ {s}</span>
                <button onClick={()=>handleDeleteSite(s)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,padding:"2px 8px",borderRadius:4,cursor:"pointer",fontSize:11}}>삭제</button>
              </div>
            ))}
            <div style={{fontSize:12,color:C.muted,margin:"12px 0 8px"}}>달러 사이트</div>
            {usdSites.map(s=>(
              <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.bg2,borderRadius:6,marginBottom:4}}>
                <span style={{fontSize:12,color:C.amber}}>$ {s}</span>
                <button onClick={()=>handleDeleteSite(s)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,padding:"2px 8px",borderRadius:4,cursor:"pointer",fontSize:11}}>삭제</button>
              </div>
            ))}
            <button onClick={()=>setSiteManageModal(false)} style={{width:"100%",marginTop:16,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>닫기</button>
          </div>
        </div>
      )}

      {addPointSiteModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.teal}`,borderRadius:14,padding:24,width:420,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.teal,marginBottom:16}}>🎁 포인트 사이트 추가</div>
            <div style={{marginBottom:8}}><div style={L}>사이트명</div><input value={newPointSite.name} onChange={e=>setNewPointSite(p=>({...p,name:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:8}}><div style={L}>교환 이름</div><input value={newPointSite.exchangeName} onChange={e=>setNewPointSite(p=>({...p,exchangeName:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:8}}><div style={L}>교환 목표 날짜</div><input type="date" value={newPointSite.exchangeDate} onChange={e=>setNewPointSite(p=>({...p,exchangeDate:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:8}}>
              <div style={L}>목표 금액 (원화) · <span style={{color:C.dim}}>0이면 목표 없음 (입금 추적만)</span></div>
              <input type="text" inputMode="numeric"
                value={newPointSite.targetAmount? newPointSite.targetAmount.toLocaleString("en-US"):""}
                onChange={e=>{
                  const cleaned = e.target.value.replace(/[^0-9]/g,"");
                  const v = parseInt(cleaned)||0;
                  setNewPointSite(p=>({...p,targetAmount:v}));
                }}
                placeholder="0 (목표 없음)"
                style={{...S,boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:8}}>
              <div style={L}>🔁 목표 주기 (완료 후 다음 교환일까지의 기간)</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {[
                  {d:7,l:"1주"},{d:14,l:"2주"},{d:21,l:"3주"},{d:28,l:"4주"},
                ].map(opt=>(
                  <button key={opt.d} onClick={()=>setNewPointSite(p=>({...p,targetCycleDays:opt.d}))}
                    style={{flex:1,padding:"6px 0",borderRadius:5,cursor:"pointer",border:newPointSite.targetCycleDays===opt.d?`2px solid ${C.teal}`:`1px solid ${C.border}`,background:newPointSite.targetCycleDays===opt.d?`${C.teal}22`:C.bg2,color:newPointSite.targetCycleDays===opt.d?C.teal:C.muted,fontWeight:newPointSite.targetCycleDays===opt.d?800:600,fontSize:11}}>
                    {opt.l} ({opt.d}일)
                  </button>
                ))}
              </div>
              <input type="number"
                value={newPointSite.targetCycleDays||14}
                onChange={e=>setNewPointSite(p=>({...p,targetCycleDays:parseInt(e.target.value)||14}))}
                min={1} max={365}
                style={{...S,boxSizing:"border-box",...noSpin}}
                placeholder="직접 입력 (일수)"/>
              <div style={{fontSize:9,color:C.dim,marginTop:3}}>완료 시 같은 목표/주기로 자동 다음 사이클 시작 (목표일 + 주기일)</div>
            </div>
            {/* 기준 사이트 선택 - 누적입금 계산할 사이트 */}
            <div style={{marginBottom:16}}>
              <div style={L}>📍 누적입금 기준 사이트</div>
              <select value={newPointSite.targetSiteName} onChange={e=>setNewPointSite(p=>({...p,targetSiteName:e.target.value}))} style={{...S,boxSizing:"border-box"}}>
                <option value="">전체 사이트 합산</option>
                {ALL_SITES.map(s=><option key={s} value={s}>{isUSD(s)?"$":"₩"} {s}</option>)}
              </select>
              <div style={{fontSize:9,color:C.dim,marginTop:3}}>특정 사이트의 입금만 카운트하려면 선택, 전체면 비워두세요</div>
            </div>
            <div style={{display:"flex",gap:8}}><button onClick={handleAddPointSite} style={{flex:1,background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,padding:"8px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button><button onClick={()=>setAddPointSiteModal(false)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button></div>
          </div>
        </div>
      )}

      {/* 빠른 입금/포인트 모달 (홈 대시보드에서 호출) */}
      {quickActionMode && (()=>{
        const isDep = quickActionMode==="deposit";
        const color = isDep ? C.green : C.amber;
        const icon = isDep ? "💵" : "🎁";
        const title = isDep ? "입금 추가" : "포인트 추가";
        const desc = isDep ? "입금 통계에 기록됩니다" : "입금 통계엔 기록되지 않고 사이트 잔여금만 증가합니다";
        const confirm = () => {
          if (!quickActionSite) return alert("사이트를 선택해주세요.");
          if (quickActionAmt<=0) return alert("금액을 입력해주세요.");
          if (isDep) {
            const dollar = isUSD(quickActionSite);
            const newDep = {id:String(Date.now()),site:quickActionSite,amount:quickActionAmt,date:today,isDollar:dollar};
            setDepositsRaw(d=>[...d,newDep]);
            db.insertDeposit(newDep);
            const curSS = siteStates[quickActionSite] || {deposited:0,betTotal:0,active:false,isDollar:dollar,pointTotal:0};
            const newSS = {...curSS,deposited:parseFloat((curSS.deposited+quickActionAmt).toFixed(2)),active:true,isDollar:dollar};
            setSiteStatesRaw(p=>({...p,[quickActionSite]:newSS}));
            db.upsertSiteState(quickActionSite,newSS);
            addLog("💵 입금",`${quickActionSite}/${fmtDisp(quickActionAmt,dollar)}`);
          } else {
            handleAddPoint(quickActionSite, quickActionAmt);
          }
          setQuickActionMode(null); setQuickActionSite(""); setQuickActionAmt(0);
        };
        return (
          <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:C.bg3,border:`1px solid ${color}`,borderRadius:14,padding:22,width:380}}>
              <div style={{fontSize:15,fontWeight:800,color:color,marginBottom:5}}>{icon} {title}</div>
              <div style={{fontSize:10,color:C.dim,marginBottom:12}}>{desc}</div>

              {/* 사이트 선택 */}
              <div style={{marginBottom:11}}>
                <div style={{...L,fontSize:12,marginBottom:5}}>1️⃣ 사이트</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {ALL_SITES.map(s=>{
                    const dollar=isUSD(s);
                    const active=quickActionSite===s;
                    return <button key={s} onClick={()=>{setQuickActionSite(s);if(quickActionAmt===0)setQuickActionAmt(dollar?(isDep?7:5):(isDep?10000:5000));}}
                      style={{padding:"6px 10px",borderRadius:5,border:active?`2px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?`${dollar?C.amber:C.green}33`:C.bg2,color:active?(dollar?C.amber:C.green):C.muted,cursor:"pointer",fontSize:11,fontWeight:active?800:500}}>
                      {dollar?"$":"₩"} {s}
                    </button>;
                  })}
                </div>
              </div>

              {/* 금액 */}
              <div style={{marginBottom:14}}>
                <div style={{...L,fontSize:12,marginBottom:5}}>2️⃣ 금액</div>
                <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:5}}>
                  <button onClick={()=>setQuickActionAmt(a=>Math.max(0,a-(isUSD(quickActionSite)?1:10000)))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.red,width:32,height:38,borderRadius:5,cursor:"pointer",fontSize:16,fontWeight:700}}>−</button>
                  <input autoFocus type="number" value={quickActionAmt||""} onChange={e=>setQuickActionAmt(parseFloat(e.target.value)||0)}
                    onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();confirm();}}}
                    placeholder={isUSD(quickActionSite)?"$ 금액":"₩ 금액"}
                    style={{...S,boxSizing:"border-box",fontSize:15,padding:"9px",fontWeight:800,textAlign:"center" as const,color:isUSD(quickActionSite)?C.amber:C.green,...noSpin}}/>
                  <button onClick={()=>setQuickActionAmt(a=>a+(isUSD(quickActionSite)?1:10000))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.green,width:32,height:38,borderRadius:5,cursor:"pointer",fontSize:16,fontWeight:700}}>+</button>
                </div>
                {quickActionSite && <div style={{display:"flex",gap:3}}>
                  {(isUSD(quickActionSite)?USD_HK:KRW_HK).map(v=><button key={v} onClick={()=>setQuickActionAmt(v)} style={{flex:1,padding:"4px 0",borderRadius:4,border:`1px solid ${isUSD(quickActionSite)?C.amber+"44":C.green+"44"}`,background:quickActionAmt===v?`${isUSD(quickActionSite)?C.amber:C.green}22`:C.bg,color:isUSD(quickActionSite)?C.amber:C.green,cursor:"pointer",fontSize:10,fontWeight:700}}>{isUSD(quickActionSite)?`$${v}`:`${v/10000}만`}</button>)}
                </div>}
              </div>

              <div style={{display:"flex",gap:8}}>
                <button onClick={confirm} style={{flex:1,background:`${color}22`,border:`1px solid ${color}`,color:color,padding:"10px",borderRadius:7,cursor:"pointer",fontWeight:800}}>✅ {title}</button>
                <button onClick={()=>{setQuickActionMode(null);setQuickActionSite("");setQuickActionAmt(0);}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"10px",borderRadius:7,cursor:"pointer"}}>취소</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 기타 베팅 - 마핸/플핸 숫자 직접 입력 (농구) */}
      {customHandiModal && (()=>{
        const g = customHandiModal.game;
        const team = customHandiTeam==="home" ? g.homeTeam : g.awayTeam;
        const teamColor = customHandiTeam==="home" ? C.green : C.teal;
        return (
          <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:C.bg3,border:`1px solid ${C.purple}`,borderRadius:14,padding:24,width:400}}>
              <div style={{fontSize:15,fontWeight:800,color:C.purple,marginBottom:8}}>🎯 기타 베팅 (핸디캡 수동 입력)</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:14,background:C.bg2,padding:"8px 12px",borderRadius:6}}>
                {g.homeTeam} vs {g.awayTeam}
              </div>

              {/* 플핸 / 마핸 선택 */}
              <div style={{marginBottom:12}}>
                <div style={{...L,fontSize:12,marginBottom:5}}>1️⃣ 핸디캡 유형</div>
                <div style={{display:"flex",gap:6}}>
                  {(["플핸","마핸"] as const).map(t=>{
                    const active=customHandiType===t;
                    return <button key={t} onClick={()=>setCustomHandiType(t)}
                      style={{flex:1,padding:"10px",borderRadius:6,cursor:"pointer",border:active?`2px solid ${C.amber}`:`1px solid ${C.border}`,background:active?`${C.amber}22`:C.bg2,color:active?C.amber:C.muted,fontWeight:active?800:600,fontSize:13}}>
                      {t==="플핸"?"➕ 플핸 (플러스)":"➖ 마핸 (마이너스)"}
                    </button>;
                  })}
                </div>
              </div>

              {/* 팀 선택 */}
              <div style={{marginBottom:12}}>
                <div style={{...L,fontSize:12,marginBottom:5}}>2️⃣ 어느 팀</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setCustomHandiTeam("home")}
                    style={{flex:1,padding:"10px",borderRadius:6,cursor:"pointer",border:customHandiTeam==="home"?`2px solid ${C.green}`:`1px solid ${C.border}`,background:customHandiTeam==="home"?`${C.green}22`:C.bg2,color:customHandiTeam==="home"?C.green:C.muted,fontWeight:customHandiTeam==="home"?800:600,fontSize:13}}>
                    🏠 {g.homeTeam}
                  </button>
                  <button onClick={()=>setCustomHandiTeam("away")}
                    style={{flex:1,padding:"10px",borderRadius:6,cursor:"pointer",border:customHandiTeam==="away"?`2px solid ${C.teal}`:`1px solid ${C.border}`,background:customHandiTeam==="away"?`${C.teal}22`:C.bg2,color:customHandiTeam==="away"?C.teal:C.muted,fontWeight:customHandiTeam==="away"?800:600,fontSize:13}}>
                    ✈️ {g.awayTeam}
                  </button>
                </div>
              </div>

              {/* 숫자 입력 */}
              <div style={{marginBottom:14}}>
                <div style={{...L,fontSize:12,marginBottom:5}}>3️⃣ 숫자 (소수점 .5 권장)</div>
                <input autoFocus type="text" inputMode="decimal" value={customHandiLine}
                  onChange={e=>setCustomHandiLine(e.target.value.replace(/[^0-9.]/g,""))}
                  onKeyDown={e=>{
                    if(e.key==="Enter"){
                      e.preventDefault();
                      const n=parseFloat(customHandiLine);
                      if(!n||n<=0)return alert("유효한 숫자를 입력해주세요.");
                      const signedLine = customHandiType==="플핸" ? n : -n;
                      const lbl =
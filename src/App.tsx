// ╔═══════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║   🧪  테스트 푸시용 파일  —  배포 확인 후 이 주석 블록 삭제 요망   ║
// ║                                                                  ║
// ║   • 목적: Vercel 빌드 / Supabase 연결 정상 동작 확인              ║
// ║   • 주의: 이 주석 블록은 다음 작업 시 Claude에게 "삭제해줘"       ║
// ║          라고 말하면 깨끗이 정리해 줍니다                         ║
// ║   • 생성: 2026-04-27                                              ║
// ║                                                                  ║
// ╚═══════════════════════════════════════════════════════════════╝

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
//   · 가져오는 날짜: KST 어제+오늘+내일 3일치 (어제는 종료된 경기 결과 반영용).
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
const FETCH_DAYS = 3;         // KST 어제+오늘+내일 3일치 (어제는 결과 반영용)

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

// ═══════════════════════════════════════════════════════════════
// ── 배당(Odds) — API-Sports odds 엔드포인트 호출 + 캐싱 ──────────
// ═══════════════════════════════════════════════════════════════
//   football: GET https://v3.football.api-sports.io/odds?fixture={id}
//   baseball/basketball/volleyball/hockey: /odds?game={id}
//   응답 구조 (요약):
//     response: [{
//       fixture/game: { id, ... },
//       bookmakers: [{
//         id, name, bets: [{
//           id, name: "Match Winner" | "Asian Handicap" | "Goals Over/Under" | ...,
//           values: [{ value: "Home" | "Draw" | "Away" | "Over 2.5" | ..., odd: "1.85" }]
//         }]
//       }]
//     }]
//
// 표준화된 OddsMap 구조:
//   {
//     home: number | null,      // 홈승 (Match Winner / Home Win)
//     draw: number | null,      // 무승부
//     away: number | null,      // 원정승
//     handicap: { [line: string]: { home: number, away: number } },   // "0.5" → {home:1.85, away:2.05}
//     total: { [line: string]: { over: number, under: number } },     // "2.5" → {over:1.95, under:1.85}
//   }
export type OddsMap = {
  home: number | null;
  draw: number | null;
  away: number | null;
  handicap: Record<string, { home?: number; away?: number }>;
  total: Record<string, { over?: number; under?: number }>;
  bookmaker?: string;   // 어느 북메이커에서 가져왔는지
  fetched_at: string;   // ISO 시각
};

// 메모리 캐시 — { fixtureId: { data, ts } }
const _oddsCache = new Map<number, { data: OddsMap; ts: number }>();
const ODDS_CACHE_TTL_MS = 10 * 60 * 1000;  // 10분

// 우선순위 북메이커 (있으면 우선 선택)
const PREFERRED_BOOKMAKERS = ["Bet365", "Pinnacle", "1xBet", "William Hill", "Marathonbet"];

// 한 마켓의 values 배열에서 home/draw/away 추출
function _parseMatchWinner(values: any[]): { home: number | null; draw: number | null; away: number | null } {
  let home: number | null = null, draw: number | null = null, away: number | null = null;
  for (const v of (values || [])) {
    const lbl = String(v?.value || "").toLowerCase().trim();
    const od = parseFloat(v?.odd);
    if (!isFinite(od) || od < 1) continue;
    if (lbl === "home" || lbl === "1") home = od;
    else if (lbl === "draw" || lbl === "x") draw = od;
    else if (lbl === "away" || lbl === "2") away = od;
  }
  return { home, draw, away };
}

// 핸디캡 파싱: "Home -1.5", "Away +2.5", "Home (-0.5)", 등
// 결과: { "1.5": { home: 1.85, away: 2.05 } } 형태로
//   ("0.5 핸디"는 한 줄에 양팀 odd가 묶임. 줄 라벨은 양수 절댓값으로 통일.)
function _parseHandicap(values: any[]): Record<string, { home?: number; away?: number }> {
  const out: Record<string, { home?: number; away?: number }> = {};
  for (const v of (values || [])) {
    const raw = String(v?.value || "").trim();
    const od = parseFloat(v?.odd);
    if (!isFinite(od) || od < 1) continue;
    // 형식: "Home -1.5" / "Away +1.5" / "Home (-1.5)" / "Home -1" 등
    const m = raw.match(/^(home|away)\s*\(?\s*([+-]?\d+(?:\.\d+)?)/i);
    if (!m) continue;
    const side = m[1].toLowerCase() as "home" | "away";
    const lineNum = Math.abs(parseFloat(m[2]));
    if (!isFinite(lineNum)) continue;
    const key = lineNum.toFixed(1).replace(/\.0$/, ".0"); // "1.5", "0.5"
    if (!out[key]) out[key] = {};
    out[key][side] = od;
  }
  return out;
}

// 오버언더 파싱: "Over 2.5", "Under 2.5"
function _parseOverUnder(values: any[]): Record<string, { over?: number; under?: number }> {
  const out: Record<string, { over?: number; under?: number }> = {};
  for (const v of (values || [])) {
    const raw = String(v?.value || "").trim();
    const od = parseFloat(v?.odd);
    if (!isFinite(od) || od < 1) continue;
    const m = raw.match(/^(over|under)\s*(\d+(?:\.\d+)?)/i);
    if (!m) continue;
    const side = m[1].toLowerCase() as "over" | "under";
    const lineNum = parseFloat(m[2]);
    if (!isFinite(lineNum)) continue;
    const key = lineNum.toString();
    if (!out[key]) out[key] = {};
    out[key][side] = od;
  }
  return out;
}

// API 응답 → OddsMap 변환
function parseOddsResponse(arr: any[]): OddsMap {
  const result: OddsMap = {
    home: null, draw: null, away: null,
    handicap: {}, total: {},
    fetched_at: new Date().toISOString(),
  };
  if (!Array.isArray(arr) || arr.length === 0) return result;

  // 응답에 여러 fixture가 올 수도 있지만 우리는 fixture/game ID로 필터링한 상태라 첫 번째만 사용
  const item = arr[0];
  const bookmakers: any[] = item?.bookmakers || [];
  if (bookmakers.length === 0) return result;

  // 우선순위 북메이커 선택
  let chosen: any = null;
  for (const pref of PREFERRED_BOOKMAKERS) {
    const found = bookmakers.find(b => String(b?.name || "").toLowerCase().includes(pref.toLowerCase()));
    if (found) { chosen = found; break; }
  }
  if (!chosen) chosen = bookmakers[0];
  if (!chosen) return result;

  result.bookmaker = chosen?.name || "";
  const bets: any[] = chosen?.bets || [];

  for (const bet of bets) {
    const betName = String(bet?.name || "").toLowerCase();
    const values = bet?.values || [];

    // 승무패: "Match Winner" (football), "Home/Away" (baseball/basketball - 무승부 없음)
    if (betName.includes("match winner") || betName === "home/away" || betName === "winner") {
      const w = _parseMatchWinner(values);
      if (w.home !== null) result.home = w.home;
      if (w.draw !== null) result.draw = w.draw;
      if (w.away !== null) result.away = w.away;
    }
    // 핸디캡: "Asian Handicap", "Handicap", "Asian Handicap (1st Half)" 등
    else if (betName.includes("handicap") && !betName.includes("half")) {
      const h = _parseHandicap(values);
      Object.assign(result.handicap, h);
    }
    // 오버언더: "Goals Over/Under" (football), "Over/Under" (baseball/basketball)
    else if (betName.includes("over/under") || betName.includes("total") || betName === "goals over/under") {
      const t = _parseOverUnder(values);
      Object.assign(result.total, t);
    }
  }

  return result;
}

// 단일 경기 odds fetch (캐시 우선)
async function fetchOddsForFixture(
  sport: Sport,
  fixtureId: number,
  apiKey: string,
  forceRefresh: boolean = false
): Promise<{ data: OddsMap | null; cached: boolean; error?: string }> {
  if (!apiKey) return { data: null, cached: false, error: "API_SPORTS_KEY 미설정" };
  if (!fixtureId || fixtureId < 0) return { data: null, cached: false, error: "잘못된 fixture id" };

  // 캐시 확인
  if (!forceRefresh) {
    const cached = _oddsCache.get(fixtureId);
    if (cached && (Date.now() - cached.ts) < ODDS_CACHE_TTL_MS) {
      return { data: cached.data, cached: true };
    }
  }

  const info = API_SPORTS_INFO.find(a => a.sport === sport);
  if (!info) return { data: null, cached: false, error: `unknown sport: ${sport}` };

  // football은 fixture, 나머지는 game 파라미터
  const param = sport === "football" ? "fixture" : "game";
  const url = `https://${info.host}/odds?${param}=${fixtureId}`;

  try {
    const r = await fetch(url, {
      headers: {
        "x-rapidapi-key":  apiKey,
        "x-rapidapi-host": info.host,
      },
    });
    if (!r.ok) {
      return { data: null, cached: false, error: `HTTP ${r.status}` };
    }
    const j = await r.json();
    const arr = j?.response ?? [];
    const data = parseOddsResponse(arr);
    _oddsCache.set(fixtureId, { data, ts: Date.now() });
    return { data, cached: false };
  } catch (e: any) {
    return { data: null, cached: false, error: e?.message || "fetch 실패" };
  }
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

// ── DB 캐시: 모든 종목, KST 어제+오늘+내일 (스포츠 테스트 탭에서 사용) ──
async function fetchAllFixturesUntilTomorrowKst(): Promise<LiveFixture[]> {
  // KST 오늘 00:00의 UTC ISO
  const nowKst = new Date(Date.now() + 9*3600_000);
  const yyyy = nowKst.getUTCFullYear();
  const mm = nowKst.getUTCMonth();
  const dd = nowKst.getUTCDate();
  // KST 어제 00:00 → UTC -9시간 (어제 데이터부터 포함하여 결과 반영용)
  const fromUtc = new Date(Date.UTC(yyyy, mm, dd-1, 0, 0, 0) - 9*3600_000);
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

// ── 경기 상태 분류 ───────────────────────────────────────────
// API-Sports의 status_short 코드를 의미별로 분류
// NS=Not Started, FT=Full Time(종료), PST=Postponed(연기), CANC=Cancelled(취소)
// ABD=Abandoned(중단), TBD=To Be Defined(미정), 그 외(1H, 2H, HT, LIVE 등)=라이브
function isUpcoming(s:string){ return s==="NS" || s==="TBD"; }
function isLive(s:string){ return !["NS","FT","AET","FT_PEN","CANC","PST","ABD","AWD","WO","TBD","AOT","AP"].includes(s); }
function isFinished(s:string){ return ["FT","AET","FT_PEN","AOT","AP"].includes(s); }
function isPostponed(s:string){ return ["PST","CANC","ABD","AWD","WO"].includes(s); }
// 한글 라벨 (status_short 기반 - status_long의 영문 그대로 노출 방지)
function statusLabel(s:string):string {
  if (s==="NS"||s==="TBD") return "예정";
  if (isFinished(s)) return "종료";
  if (s==="PST") return "연기됨";
  if (s==="CANC") return "취소됨";
  if (s==="ABD") return "중단됨";
  if (s==="AWD") return "기권승";
  if (s==="WO") return "부전승";
  if (s==="HT") return "하프타임";
  if (s==="1H") return "전반";
  if (s==="2H") return "후반";
  if (s==="ET") return "연장";
  if (s==="P"||s==="PEN") return "승부차기";
  if (isLive(s)) return "진행중";
  return s;
}
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
  targetCycleDays?: number; // [구버전 호환] 목표 기간 (일수). targetStartDate/EndDate가 있으면 무시됨.
  // ★ rev.8: 목표 기간을 날짜 범위로 직접 지정 (있으면 cycleDays보다 우선)
  targetStartDate?: string; // 누적 입금 집계 시작일 (YYYY-MM-DD, 포함)
  targetEndDate?: string;   // 누적 입금 집계 종료일 (YYYY-MM-DD, 포함). 보통 exchangeDate와 같거나 그 직전
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
  if(cat==="축구") return [{g:"홈",opts:["홈 0.5","홈 1.5"]},{g:"원정",opts:["원정 0.5","원정 1.5"]}];
  if(cat==="야구") return [{g:"승패",opts:["정배","역배"]},{g:"오버",opts:Array.from({length:14},(_,i)=>`${4.5+i} 오버`)},{g:"언더",opts:Array.from({length:14},(_,i)=>`${4.5+i} 언더`)}];
  if(cat==="농구") return [{g:"마핸",opts:Array.from({length:8},(_,i)=>`${(2.5+i).toFixed(1)} 마핸`)},{g:"플핸",opts:Array.from({length:5},(_,i)=>`${(10.5+i).toFixed(1)} 플핸`)}];
  if(cat==="배구") return [{g:"승패",opts:["홈 승","원정 승"]},{g:"오버/언더",opts:["오버","언더"]}];
  return [];
};
const getDefaultGroup = (cat:string) => cat==="축구"?"홈":cat==="농구"?"마핸":cat==="야구"?"승패":"";
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

  // ⚠️ 요청 #1: "bettingComboTest" 탭 삭제 — tab 타입 정의에서도 제거
  const [tab,setTab]=useState<"home"|"bettingCombo"|"stats"|"roi"|"strategy"|"pending"|"apiManager"|"dataManager"|"logs">("home");
  // ── 데이터 탭 state ────────────────────────────────────────
  const [dataTableStats,setDataTableStats]=useState<Record<string,{rows:number,size:string,sizeBytes:number}>>({});
  const [dataStatsLoading,setDataStatsLoading]=useState(false);
  const [dataTotalSize,setDataTotalSize]=useState("");
  // ⚠️ 요청 #6: 통계 탭에서 baseball/football/basketball 타입을 "sport"(종목별) 하나로 통합
  const [statTab,setStatTab]=useState<"overview"|"daily"|"live"|"sport"|"adv">("overview");
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
  const [stExpandedSports,setStExpandedSports]=useState<Record<string,boolean>>({});
  const [stExpandedCountries,setStExpandedCountries]=useState<Record<string,boolean>>({});
  const [stSelSport,setStSelSport]=useState<Sport|"">("");
  const [stSelCountry,setStSelCountry]=useState("");
  const [stSelLeague,setStSelLeague]=useState("");
  const [stExpandedGameId,setStExpandedGameId]=useState<number|null>(null);
  // 오늘 경기 중 종료된 그룹 펼침 여부 (기본: 접힘)
  const [stShowFinished,setStShowFinished]=useState<boolean>(false);
  // ★ "진행 중인 수동 경기" (어제 또는 그 이전에 추가된 미종료 수동 경기) 펼침 여부 (기본: 접힘)
  //   사용자 요청: 하루 지난 수동 경기는 삭제하지 않고 자동으로 접어놓기. 헤더 클릭 시 펼침.
  const [stShowManualOngoing, setStShowManualOngoing] = useState<boolean>(false);
  // ★ 종목별 "숨긴 국가/리그도 표시" 토글 — true면 베팅 가능 경기 0개라도 표시
  const [stShowHidden, setStShowHidden] = useState<Record<string, boolean>>({});
  // ★ 종목별 "숨김 처리된(finished=true) 수동 경기 보기" 토글
  //   사용자 요청: 결과 입력으로 finished 된 경기를 7일 자동 삭제 전까지 다시 볼 수 있게
  const [stShowFinishedManual, setStShowFinishedManual] = useState<Record<string, boolean>>({});
  const [stFetchedAt,setStFetchedAt]=useState<number|null>(null);

  const loadSportsTestData = useCallback(async()=>{
    setStLoading(true); setStError("");
    try {
      const data = await fetchAllFixturesUntilTomorrowKst();
      setStFixtures(data);
      setStFetchedAt(Date.now());
      if (data.length === 0) setStError("어제+오늘+내일 경기 데이터가 없습니다");
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

  // ── [스포츠 테스트] 배당(Odds) 상태 ──────────────────────────────
  //   fixtureId → OddsMap | "loading" | { error: string }
  const [oddsByFixture, setOddsByFixture] = useState<Record<number, OddsMap | "loading" | { error: string }>>({});

  // 단일 경기 odds 가져오기 (테스트 탭 전용)
  const fetchOddsFor = useCallback(async (sport: Sport, fixtureId: number, force: boolean = false) => {
    if (!fixtureId || fixtureId < 0) return;
    const apiKey = (import.meta as any).env?.VITE_API_SPORTS_KEY as string | undefined;
    if (!apiKey) {
      setOddsByFixture(p => ({ ...p, [fixtureId]: { error: "API 키 미설정" } }));
      return;
    }
    setOddsByFixture(p => ({ ...p, [fixtureId]: "loading" }));
    const res = await fetchOddsForFixture(sport, fixtureId, apiKey, force);
    if (res.data) {
      setOddsByFixture(p => ({ ...p, [fixtureId]: res.data! }));
    } else {
      setOddsByFixture(p => ({ ...p, [fixtureId]: { error: res.error || "조회 실패" } }));
    }
  }, []);

  // 옵션 라벨 → 배당 조회
  // optLabel 예시:
  //   - "홈승" / "원정승" / "무승부"
  //   - "팀명 (1.5)" / "팀명 (-0.5)" → 핸디캡
  //   - "오버 (2.5)" / "언더 (2.5)" → 오버언더
  const getOddsForOption = useCallback((odds: OddsMap | undefined, optLabel: string, homeTeam: string, awayTeam: string): number | null => {
    if (!odds) return null;
    if (optLabel === "홈승") return odds.home ?? null;
    if (optLabel === "원정승") return odds.away ?? null;
    if (optLabel === "무승부") return odds.draw ?? null;

    // 핸디캡: "팀명 (1.5)" or "팀명 (-0.5)"
    const handiMatch = optLabel.match(/^(.+?)\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*\)\s*$/);
    if (handiMatch) {
      const teamPart = handiMatch[1].trim();
      const lineNum = Math.abs(parseFloat(handiMatch[2]));
      const lineKey = lineNum.toFixed(1).replace(/\.0$/, ".0");
      const handi = odds.handicap?.[lineKey];
      if (!handi) return null;
      // 팀명이 home인지 away인지 판별
      // 한글 팀명일 수 있으므로 정확히 일치하는지로만 판별
      const homeKr = (translateTeamName(homeTeam, teamNameMap) || homeTeam || "").trim();
      const awayKr = (translateTeamName(awayTeam, teamNameMap) || awayTeam || "").trim();
      if (teamPart === homeKr || teamPart === homeTeam) return handi.home ?? null;
      if (teamPart === awayKr || teamPart === awayTeam) return handi.away ?? null;
      return null;
    }

    // 오버언더: "오버 (2.5)" / "언더 (2.5)"
    const ouMatch = optLabel.match(/^(오버|언더)\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*$/);
    if (ouMatch) {
      const side = ouMatch[1];
      const lineKey = ouMatch[2];
      const tot = odds.total?.[lineKey];
      if (!tot) return null;
      return side === "오버" ? (tot.over ?? null) : (tot.under ?? null);
    }

    return null;
  }, [teamNameMap]);

  const slipGameIds = useMemo(()=>new Set(slip.map(s=>s.id)), [slip]);

  const handleSlipPick = useCallback((game: LiveFixture, optLabel: string) => {
    const id = `${game.id}_${optLabel}`;
    setSlip(prev => {
      // 같은 옵션을 다시 누르면 제거 (토글)
      if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
      // 폴더베팅 없이 단일베팅만: 완전히 덮어씌움 (마지막 클릭이 슬립을 차지)
      return [{ id, game, optLabel, odds: 0 }];
    });
  },[]);

  const handleSlipAdd=()=>{
    if(slip.length===0) return alert("경기를 선택하세요.");
    if(!slipSite) return alert("베팅사이트를 선택해주세요.");
    const missingOdds = slip.find(s => !s.odds || s.odds < 1);
    if(missingOdds) return alert(`${missingOdds.game.home_team} vs ${missingOdds.game.away_team} 의 배당률을 입력해주세요.`);

    // ★ 시작된/종료된/연기된 경기는 베팅 차단 (수동 경기 제외)
    //   라이브 베팅 체크박스가 켜진 경우엔 진행중 경기도 허용
    const blockedGame = slip.find(s => {
      const isManual = s.game.league_id < 0;
      if (isManual) return false; // 수동 경기는 항상 허용
      const st = s.game.status_short;
      // 종료/연기/취소된 경기는 항상 차단
      if (isFinished(st) || isPostponed(st)) return true;
      // 라이브 경기는 라이브 베팅 체크 시에만 허용
      if (isLive(st) && !slipIsLive) return true;
      return false;
    });
    if (blockedGame) {
      const st = blockedGame.game.status_short;
      const homeKr = translateTeamName(blockedGame.game.home_team, teamNameMap);
      const awayKr = translateTeamName(blockedGame.game.away_team, teamNameMap);
      const reason = isFinished(st) ? "이미 종료된"
        : isPostponed(st) ? `${statusLabel(st)} 처리된`
        : "이미 시작된";
      return alert(`${reason} 경기는 베팅할 수 없습니다.\n\n${homeKr} vs ${awayKr} (${statusLabel(st)})\n\n진행중인 경기에 베팅하려면 "⚡ 라이브 베팅" 체크박스를 켜주세요.`);
    }

    // ★ 같은 경기 + 같은 카테고리(승패/오언/핸디캡)로 이미 진행중인 베팅이 있는지 검사
    //   승패 ↔ 오언은 같은 경기에 다른 카테고리이므로 허용 (요구사항: 승패, 언오버는 같은거로 간주X)
    const categorizeOpt = (opt:string): "승패"|"오언"|"핸디캡"|"기타" => {
      if (opt==="홈승"||opt==="원정승"||opt==="무승부") return "승패";
      if (opt.endsWith(" 승")) return "승패";
      if (/^(오버|언더)/.test(opt)) return "오언";
      if (/\([+-]?[\d.]+\)$/.test(opt)) return "핸디캡"; // "팀명 (1.5)" 형식
      return "기타";
    };
    for (const item of slip) {
      const homeKr = translateTeamName(item.game.home_team, teamNameMap);
      const awayKr = translateTeamName(item.game.away_team, teamNameMap);
      const newCat = categorizeOpt(item.optLabel);
      const existing = pending.find(b => {
        if (!b.homeTeam || !b.awayTeam) return false;
        if (b.homeTeam !== homeKr || b.awayTeam !== awayKr) return false;
        if (b.league !== item.game.league_name) return false;
        return categorizeOpt(b.betOption) === newCat;
      });
      if (existing) {
        const existingDisplay = existing.betOption==="홈승" && existing.homeTeam ? `${existing.homeTeam} 승` :
                                existing.betOption==="원정승" && existing.awayTeam ? `${existing.awayTeam} 승` :
                                existing.betOption;
        const ok = window.confirm(
          `⚠️ 이미 베팅한적이 있습니다\n\n` +
          `${homeKr} vs ${awayKr} 경기에\n` +
          `이미 "${newCat}" 카테고리로 베팅이 진행중입니다:\n\n` +
          `  기존: ${existingDisplay} (${existing.site}, ${fmtDisp(existing.amount,existing.isDollar)})\n` +
          `  신규: ${item.optLabel} (${slipSite})\n\n` +
          `그래도 베팅하시겠습니까?`
        );
        if (!ok) return;
      }
    }

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
    // ★ 베팅 완료 후 사이트 선택 해제 (실수 방지)
    setSlip([]);
    setSlipSite("");
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
            targetCycleDays:p.targetCycleDays||14,
            // ★ rev.8: 날짜 범위 필드 (DB 스키마에 컬럼이 추가되어야 영구 보존됨)
            targetStartDate:p.targetStartDate,
            targetEndDate:p.targetEndDate,
            sessions:p.sessions||[],
          } as any);
        }
      }
      return sites;
    });
  };

  const [addPointSiteModal,setAddPointSiteModal]=useState(false);
  // 포인트 교환 추가 모달 — 프리셋 패널 펼침 상태 (기본: 접힘)
  const [pointPresetPanelOpen,setPointPresetPanelOpen]=useState(false);
  // ── 포인트 교환 추가 모달 state ─────────────────────────────
  // 사이트명/교환이름은 통합되어 exchangeName 하나로 관리됨 (name도 같은 값으로 저장).
  // targetStartDate/targetEndDate: 목표 누적 입금 집계 기간 (직접 날짜 범위 지정)
  const [newPointSite,setNewPointSite]=useState<{name:string,exchangeName:string,exchangeDate:string,targetAmount:number,targetSiteName:string,targetCycleDays:number,targetStartDate:string,targetEndDate:string}>({name:"",exchangeName:"",exchangeDate:"",targetAmount:2000000,targetSiteName:"",targetCycleDays:30,targetStartDate:"",targetEndDate:""});
  // 인라인 달력 펼침 상태 + 표시 중인 월 + 클릭 단계 (1번째: 시작, 2번째: 종료)
  const [pointDateCalOpen,setPointDateCalOpen]=useState(false);
  const [pointDateCalMonth,setPointDateCalMonth]=useState<string>(""); // YYYY-MM
  const [pointDateClickStep,setPointDateClickStep]=useState<"start"|"end">("start");

  // ── 포인트 교환 프리셋 (저장된 교환 조건) ─────────────────────
  // 🔒 DB(app_settings.point_exchange_presets)에 저장됨. 빈 배열로 시작.
  // 사용자가 자주 쓰는 조건(이름·금액·기간·기준사이트)을 저장해두고
  // 새 포인트 교환 추가 시 클릭 한 번으로 모든 필드를 채울 수 있게 함.
  const [pointPresets,setPointPresets]=useState<db.PointExchangePreset[]>([]);
  const savePointPresets=(list:db.PointExchangePreset[])=>{
    setPointPresets(list);
    db.saveAppSetting("point_exchange_presets",list);
  };

  // 프리셋 저장 (현재 모달 입력값 → 프리셋으로)
  const handleSavePointPreset=()=>{
    const name = newPointSite.exchangeName.trim();
    if(!name) return alert("교환 이름을 먼저 입력해주세요.");
    if(pointPresets.some(p=>p.exchangeName===name)) {
      if(!window.confirm(`"${name}" 프리셋이 이미 있습니다. 덮어쓰시겠습니까?`)) return;
    }
    const preset:db.PointExchangePreset = {
      id: String(Date.now()),
      exchangeName: name,
      targetAmount: newPointSite.targetAmount,
      targetCycleDays: newPointSite.targetCycleDays || 30,
      targetSiteName: newPointSite.targetSiteName || undefined,
      createdAt: new Date().toISOString(),
    };
    // 같은 이름은 교체, 아니면 추가
    const filtered = pointPresets.filter(p=>p.exchangeName!==name);
    savePointPresets([...filtered, preset]);
    alert(`✅ "${name}" 프리셋 저장됨`);
  };

  // 프리셋 불러오기 (모달 필드를 프리셋 값으로 채움. 날짜는 비움)
  const handleLoadPointPreset=(presetId:string)=>{
    const preset = pointPresets.find(p=>p.id===presetId);
    if(!preset) return;
    setNewPointSite({
      name: preset.exchangeName,
      exchangeName: preset.exchangeName,
      exchangeDate: "",  // 날짜는 사용자가 매번 새로 지정
      targetAmount: preset.targetAmount,
      targetSiteName: preset.targetSiteName || "",
      targetCycleDays: preset.targetCycleDays,
      targetStartDate: "", // 매번 새로 달력에서 지정
      targetEndDate: "",
    });
  };

  // 프리셋 삭제
  const handleDeletePointPreset=(presetId:string)=>{
    const preset = pointPresets.find(p=>p.id===presetId);
    if(!preset) return;
    if(!window.confirm(`"${preset.exchangeName}" 프리셋을 삭제하시겠습니까?`)) return;
    savePointPresets(pointPresets.filter(p=>p.id!==presetId));
  };

  const handleAddPointSite=()=>{
    // 입력 검증
    const name = newPointSite.exchangeName.trim();
    if(!name) { alert("교환 이름을 입력해주세요."); return; }
    if(!newPointSite.exchangeDate) { alert("교환 목표 날짜를 선택해주세요."); return; }
    // 날짜 범위 검증 (둘 다 선택했어야 함)
    if(!newPointSite.targetStartDate || !newPointSite.targetEndDate) {
      alert("목표 기간(시작일~종료일)을 달력에서 선택해주세요.");
      return;
    }
    if(newPointSite.targetStartDate > newPointSite.targetEndDate) {
      alert("시작일이 종료일보다 늦습니다. 다시 선택해주세요.");
      return;
    }
    // name과 exchangeName은 같은 값으로 통합 저장
    const site:PointSite={
      id:String(Date.now()),
      name:name,
      exchangeName:name,
      exchangeDate:newPointSite.exchangeDate,
      targetAmount:newPointSite.targetAmount,
      targetSiteName:newPointSite.targetSiteName||undefined,
      targetCycleDays:newPointSite.targetCycleDays||30, // 호환용 — 새 필드 우선
      targetStartDate:newPointSite.targetStartDate,
      targetEndDate:newPointSite.targetEndDate,
      sessions:[],
    };
    const updated=[...pointSites,site];
    savePointSites(updated);
    setAddPointSiteModal(false);
    // 모달 초기화 — 다음에 열릴 때를 위해 빈 값으로
    setNewPointSite({name:"",exchangeName:"",exchangeDate:"",targetAmount:2000000,targetSiteName:"",targetCycleDays:30,targetStartDate:"",targetEndDate:""});
    setPointDateCalOpen(false);
    setPointDateClickStep("start");
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

  // 토글: 임의 날짜 체크 ↔ 해제 (캘린더에서 과거 날짜 직접 클릭용)
  // 미래 날짜는 토글 불가 (실수 방지)
  // 과거 날짜는 createdAt 이전이어도 자유롭게 체크 가능
  const toggleQuestDate = (id:string, dateStr:string) => {
    if (dateStr > today) return; // 미래는 무시
    saveDailyQuests(dailyQuests.map(q=>{
      if(q.id!==id) return q;
      const has = q.history.includes(dateStr);
      return {...q, history: has ? q.history.filter(d=>d!==dateStr) : [...q.history, dateStr].sort()};
    }));
  };

  const [newQuestName,setNewQuestName]=useState("");
  // 퀘스트 이름 인라인 수정용 state (id → 임시 입력값)
  const [editingQuestId,setEditingQuestId]=useState<string|null>(null);
  const [editingQuestName,setEditingQuestName]=useState("");
  // 퀘스트 이름 변경 저장
  const handleRenameQuest = (id:string) => {
    const newName = editingQuestName.trim();
    if(!newName) {
      setEditingQuestId(null);
      setEditingQuestName("");
      return;
    }
    // 같은 이름은 그냥 닫기
    const cur = dailyQuests.find(q=>q.id===id);
    if(cur && cur.name===newName) {
      setEditingQuestId(null);
      setEditingQuestName("");
      return;
    }
    // 다른 퀘스트와 이름 중복 검사
    if(dailyQuests.some(q=>q.id!==id && q.name===newName)) {
      alert("이미 존재하는 퀘스트 이름입니다");
      return;
    }
    saveDailyQuests(dailyQuests.map(q=>q.id===id ? {...q, name:newName} : q));
    setEditingQuestId(null);
    setEditingQuestName("");
  };
  const [questCalendarExpanded,setQuestCalendarExpanded]=useState<Record<string,boolean>>({});
  // 각 퀘스트가 달력에서 현재 보고 있는 월 (YYYY-MM 형식). 없으면 today 기준.
  const [questCalendarMonth,setQuestCalendarMonth]=useState<Record<string,string>>({});
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
  // 출석 횟수 초기화 — history만 비우고 퀘스트 자체는 유지. createdAt도 today로 리셋
  const handleResetQuestAttendance = (id:string) => {
    const q = dailyQuests.find(x=>x.id===id);
    if(!q) return;
    if(q.history.length===0) { alert("초기화할 출석 기록이 없습니다."); return; }
    if(!window.confirm(`"${q.name}" 출석 횟수를 초기화하시겠습니까?\n\n현재 출석: ${q.history.length}회\n시작일: ${q.createdAt}\n\n→ 출석 0회, 시작일 ${today}로 리셋됩니다.\n(퀘스트 자체는 유지됩니다)`)) return;
    saveDailyQuests(dailyQuests.map(x=>x.id===id ? {...x, history:[], createdAt: today} : x));
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
    // 사이클 길이 결정: 새 날짜 범위가 있으면 그 일수, 없으면 기존 cycleDays
    const useDateRange = !!(site.targetStartDate && site.targetEndDate);
    let cycle:number;
    let periodLabel:string;
    if (useDateRange) {
      const ms = new Date(site.targetEndDate!+"T00:00:00Z").getTime() - new Date(site.targetStartDate!+"T00:00:00Z").getTime();
      cycle = Math.round(ms/(1000*60*60*24)) + 1;
      periodLabel = `${site.targetStartDate} ~ ${site.targetEndDate} (${cycle}일)`;
    } else {
      cycle = site.targetCycleDays || 30;
      periodLabel = cycle===7?"1주":cycle===14?"2주":cycle===30?"1달":cycle===60?"2달":cycle===90?"3달":`${cycle}일`;
    }
    const targetMsg = site.targetAmount>0
      ? `목표 ${site.targetAmount.toLocaleString()}원, 목표 기간 ${periodLabel}`
      : `목표 없음 (입금만 추적), 목표 기간 ${periodLabel}`;
    if(!window.confirm(`"${site.name}" 현금교환 완료 처리?\n\n같은 조건(${targetMsg})으로 ${cycle}일 후를 다음 교환일로 잡고 이어서 진행하시겠습니까?`)) return;
    const now=new Date().toISOString().slice(0,10);
    // 다음 교환일 = 이전 교환일 + cycleDays (사이클 길이만큼 뒤로)
    const baseDate = site.sessions.length>0
      ? site.sessions[site.sessions.length-1].nextTargetDate
      : site.exchangeDate;
    const nextTarget=getNextTargetDate(baseDate,cycle);
    const session:PointSession={id:String(Date.now()),completedAt:now,nextTargetDate:nextTarget};
    const updated=pointSites.map(s=>{
      if(s.id!==siteId)return s;
      // 새 날짜 범위도 사이클만큼 뒤로 이동시켜 갱신 (있던 경우만)
      if (useDateRange) {
        const newStart = getNextTargetDate(s.targetStartDate!, cycle);
        const newEnd = getNextTargetDate(s.targetEndDate!, cycle);
        return {...s, sessions:[...s.sessions,session], targetStartDate:newStart, targetEndDate:newEnd};
      }
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
        krw_sites:null,usd_sites:null,pext_sites:[],pext_cats:[],pext_subcats:[],code_memo_draft:"1. ",league_api_map:{},sports_test_league_map:{},fixtures_cache_meta:{...db.EMPTY_FIXTURES_CACHE_META},point_exchange_presets:[],odds_api_io_key:"",
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
      // 포인트 교환 프리셋
      setPointPresets(settings.point_exchange_presets);

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
        targetCycleDays:p.targetCycleDays,
        // ★ rev.8: DB 스키마에 필드가 있으면 가져옴 (없으면 undefined). 구버전 데이터 호환.
        targetStartDate:(p as any).targetStartDate,
        targetEndDate:(p as any).targetEndDate,
        sessions:p.sessions as any,
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
      // ⚠️ 요청 #2: odds-api.io 키 복원 코드 삭제됨 (DB의 odds_api_io_key는 그대로 두지만 사용 안 함)

      // ─── 자동 정리: 오래된 캐시 데이터 삭제 (하루에 1회만 실행) ───
      // 통계에 영향 주는 테이블(bets, deposits, withdrawals, profit_extras 등)은
      // 절대 건드리지 않음. fixtures/manual_games 캐시성 데이터만.
      try {
        const todayStr = new Date().toISOString().slice(0,10); // YYYY-MM-DD
        const lastPurgeDate = localStorage.getItem("bt_last_purge_date");
        if (lastPurgeDate !== todayStr) {
          // 비동기로 백그라운드 실행 — 앱 로딩 차단하지 않음
          (async()=>{
            const fxDeleted = await db.purgeOldFixtures(7);
            // ★ 수동 경기 자동 삭제 기간: 30일 → 7일 (사용자 요청)
            //   finished=true 로 처리된 경기는 화면에서 숨김 처리되며,
            //   7일 경과 후 DB 자동 삭제. "숨김 경기 보기" 토글로 7일 이내엔 다시 볼 수 있음.
            const mgDeleted = await db.purgeOldManualGames(7);
            localStorage.setItem("bt_last_purge_date", todayStr);
            if (fxDeleted > 0 || mgDeleted > 0) {
              console.log(`[자동 정리] fixtures: ${fxDeleted}행 삭제, manual_games: ${mgDeleted}행 삭제`);
            }
          })();
        }
      } catch (e) {
        // 정리 실패해도 앱 동작에는 영향 없음
        console.warn("[자동 정리] 실패:", e);
      }

      setDataLoadErrors(errors);
      setDbReady(true);
    })();
    return ()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dbReloadNonce]);

  const addLog=(type:string,desc:string)=>setLogs(p=>[{id:String(Date.now()),ts:new Date().toLocaleString("ko
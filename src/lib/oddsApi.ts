// ──────────────────────────────────────────────────────────────────
// lib/oddsApi.ts — odds-api.io 통신 모듈
// ──────────────────────────────────────────────────────────────────
// odds-api.io v3 API 래퍼.
//   Base URL: https://api.odds-api.io/v3
//   인증:     query param apiKey (Vercel 환경변수 VITE_ODDS_API_KEY)
//   무료 티어: 시간당 100req / 북메이커 2개 제한
//
// 1단계: 단순 fetch 함수만 제공. DB 저장/캐시 없음.
//   상위 호출자(App.tsx)가 결과를 받아서 직접 처리.
// ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.odds-api.io/v3";

// 무료 티어에서 쓸 수 있는 북메이커 (한 번에 최대 2개)
// Bet365가 가장 광범위 / Pinnacle은 sharp book → 가치 베팅용
export const DEFAULT_BOOKMAKERS = "Bet365,Pinnacle";

// odds-api.io의 종목 슬러그 (현재 앱이 다루는 5종목 매핑)
//   football=축구, basketball=농구, baseball=야구, hockey=하키, volleyball=배구
export type OddsApiSport = "football" | "basketball" | "baseball" | "hockey" | "volleyball";

export const SPORT_KR_TO_SLUG: Record<string, OddsApiSport> = {
  "축구": "football",
  "농구": "basketball",
  "야구": "baseball",
  "하키": "hockey",
  "배구": "volleyball",
};

// ──────────────────────────────────────────────────────────────────
// 응답 타입 (odds-api.io v3 스키마 기반, 실측해서 보강 필요할 수 있음)
// ──────────────────────────────────────────────────────────────────
export interface OddsApiEvent {
  id: number;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
  date: string;       // ISO 8601
  sport: { name: string; slug: string };
  league: { name: string; slug: string };
  status: string;     // "pending" | "live" | "finished" 등
  scores?: { home: number; away: number };
}

// 다양한 마켓의 outcome 가격
export interface OddsOutcome {
  name: string;       // "Home" / "Away" / "Draw" / "Over 2.5" 등
  price: number;      // 소수 배당
  point?: number;     // 핸디캡/오버언더 라인
}

export interface OddsMarket {
  key: string;        // "h2h" / "spreads" / "totals" 등
  outcomes: OddsOutcome[];
}

export interface OddsBookmaker {
  key: string;        // "bet365" 등
  title: string;      // "Bet365"
  last_update?: string;
  markets: OddsMarket[];
}

export interface OddsApiOdds {
  id: number;         // event id
  bookmakers: OddsBookmaker[];
}

// ──────────────────────────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────────────────────────
// 외부에서 주입된 키 (예: app_settings에 저장된 사용자 키)
// 환경변수가 없을 때 폴백.
let _injectedApiKey: string | null = null;
export function setApiKey(key: string | null) {
  _injectedApiKey = (key && key.trim() !== "") ? key.trim() : null;
}

function getApiKey(): string | null {
  // 1) Vite 환경변수 우선
  const k = (import.meta as any).env?.VITE_ODDS_API_KEY as string | undefined;
  if (k && k.trim() !== "") return k.trim();
  // 2) 주입된 키 폴백
  return _injectedApiKey;
}

class OddsApiError extends Error {
  status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.status = status;
  }
}

async function apiGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new OddsApiError("VITE_ODDS_API_KEY 환경변수가 설정되지 않았습니다");

  const qs = new URLSearchParams();
  qs.set("apiKey", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }

  const url = `${BASE_URL}${path}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OddsApiError(`HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return await res.json() as T;
}

// ──────────────────────────────────────────────────────────────────
// 공개 함수
// ──────────────────────────────────────────────────────────────────

/**
 * 특정 종목의 예정된(pending) 경기 목록 조회.
 * @param sport - 종목 슬러그 (football, basketball 등)
 * @param bookmaker - 한 명만 (무료 티어). 결과는 이 북메이커의 배당이 있는 경기만 반환됨
 * @returns 경기 배열 (날짜 오름차순)
 */
export async function fetchEvents(
  sport: OddsApiSport,
  bookmaker: string = "Bet365"
): Promise<OddsApiEvent[]> {
  const result = await apiGet<OddsApiEvent[]>("/events", {
    sport,
    status: "pending",
    bookmaker,
  });
  // 날짜 오름차순 정렬 (가장 빠른 경기부터)
  return [...(result ?? [])].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/**
 * 여러 경기의 배당을 한번에 조회 (최대 10개, 1req).
 * 무료 티어 효율적 사용의 핵심.
 * @param eventIds - event id 배열 (최대 10)
 * @param bookmakers - 북메이커 콤마 구분 (무료 티어 최대 2)
 */
export async function fetchMultiOdds(
  eventIds: number[],
  bookmakers: string = DEFAULT_BOOKMAKERS
): Promise<OddsApiOdds[]> {
  if (eventIds.length === 0) return [];
  if (eventIds.length > 10) {
    throw new OddsApiError(`multi-odds는 최대 10개까지. 받은 개수: ${eventIds.length}`);
  }
  const result = await apiGet<OddsApiOdds[]>("/multi-odds", {
    eventIds: eventIds.join(","),
    bookmakers,
  });
  return result ?? [];
}

/**
 * "다음 N개 경기 + 배당" 통합 fetch.
 * 1단계 핵심 함수: 사용자가 [📥 가져오기] 버튼 누르면 호출.
 *
 * @param sport - 종목
 * @param excludeEventIds - 이미 가져온 event id (제외)
 * @param count - 가져올 경기 수 (기본 10, 무료 multi-odds 한계)
 * @returns 경기 + 각 경기의 배당이 매칭된 배열
 */
export async function fetchNextEventsWithOdds(
  sport: OddsApiSport,
  excludeEventIds: Set<number>,
  count: number = 10
): Promise<{ events: OddsApiEvent[]; odds: OddsApiOdds[]; reqCount: number }> {
  // 1) 경기 목록 (1req)
  const allEvents = await fetchEvents(sport);
  // 2) 이미 가져온 것 제외
  const remaining = allEvents.filter(e => !excludeEventIds.has(e.id));
  if (remaining.length === 0) {
    return { events: [], odds: [], reqCount: 1 };
  }
  // 3) 다음 N개만 추림
  const nextBatch = remaining.slice(0, count);
  // 4) 배당 일괄 조회 (1req)
  const odds = await fetchMultiOdds(nextBatch.map(e => e.id));
  return { events: nextBatch, odds, reqCount: 2 };
}

/**
 * API 키가 설정되어 있는지 확인.
 */
export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

/**
 * 간단한 연결 테스트 — sports 엔드포인트는 quota 차감 없음.
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiGet("/sports", {});
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

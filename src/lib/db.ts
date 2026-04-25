// ═════════════════════════════════════════════════════════════════════
// BET TRACKER · db.ts (rev.6 - 2026-04-25)
// ═════════════════════════════════════════════════════════════════════
//
// 🔒 골든 룰 (반드시 지킬 것)
// ─────────────────────────────────────────────────────────────────────
// 1) 이 앱의 모든 영속 데이터는 반드시 Supabase(이 파일)를 거친다.
//    → localStorage / sessionStorage / IndexedDB 에 직접 저장 금지
//    → 유일한 예외: 외부 API 임시 캐시(예: bt_apisports_*). 사용자가 입력한
//      데이터는 절대 예외가 될 수 없다.
// 2) 새 상태를 추가한다면:
//    (a) 이 파일에 테이블용 load/upsert/delete 함수 세트를 먼저 만든다.
//    (b) App.tsx에서 useState 초기값은 "빈 값"으로만 시작한다.
//    (c) 초기 로딩 useEffect에서 load를 호출해 세팅한다.
//    (d) save 함수는 state 변경과 동시에 이 파일의 upsert를 호출한다.
// 3) 단순 문자열/배열 같은 1회성 설정은 app_settings (key-value)로 통합한다.
//    새 테이블을 만들 필요가 있는지 먼저 판단하라.
// 4) 로드 실패 시 빈 값으로 폴백(throw 금지, 에러는 console.error). UI는
//    App.tsx의 dataLoadErrors 배너로 안내.
//
// rev.6 변경사항 (2026-04-25):
//  - Edge Function 폐기 → 클라이언트 직접 호출 + DB 캐시 모델로 전환
//  - fixtures 테이블 관련 함수 추가:
//      · clearAllFixtures()       : 마이그레이션용 초기화
//      · upsertFixtureRows(rows)  : API 응답 저장 (sport+fixture_id 기준 upsert)
//      · loadFixturesByRange()    : 시작시간 범위로 조회 (캐시 읽기)
//  - app_settings에 'fixtures_cache_meta' 키 추가:
//      마지막 fetch 시각, 종목별 콜 수 등을 기록 (api_fetch_log 대체)
//  - api_fetch_log 테이블은 그대로 두지만 본 앱에서는 더 이상 쓰지 않음
//
// 이 주석을 보는 모든 Claude / 개발자는 위 규칙을 따를 것.
// ═════════════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import type { Bet, Deposit, Withdrawal, SiteState, EsportsRecord, ProfitExtra } from '../types'

// ═════════════════════════════════════════════════════════════════════
// 공통 에러 헬퍼
// ═════════════════════════════════════════════════════════════════════
// 로드 실패 시 앱이 멎으면 안 되므로 빈 값을 반환하고 콘솔에만 기록.
// App.tsx 측에서 dataLoadErrors 상태로 수집해 사용자에게 배너 표시.
function logLoadError(table: string, err: any) {
  // eslint-disable-next-line no-console
  console.error(`[db] load '${table}' 실패:`, err)
}
function logSaveError(table: string, err: any) {
  // eslint-disable-next-line no-console
  console.error(`[db] save '${table}' 실패:`, err)
}

// ── BETS ──────────────────────────────────────────────────────
export async function loadBets(): Promise<Bet[]> {
  try {
    const { data, error } = await supabase.from('bets').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id, date: r.date, category: r.category, league: r.league, site: r.site,
      betOption: r.bet_option, homeTeam: r.home_team ?? undefined, awayTeam: r.away_team ?? undefined,
      teamName: r.team_name ?? undefined, amount: Number(r.amount), odds: Number(r.odds),
      profit: r.profit != null ? Number(r.profit) : null,
      result: r.result, includeStats: r.include_stats, isDollar: r.is_dollar,
      // 추가 필드
      ...(r.country != null ? { country: r.country } : {}),
      ...(r.match_type != null ? { matchType: r.match_type } : {}),
      // rev.8: 자동 결제용 필드
      ...(r.fixture_id != null ? { fixtureId: Number(r.fixture_id) } : {}),
      ...(r.fixture_sport != null ? { fixtureSport: r.fixture_sport } : {}),
      ...(r.is_manual != null ? { isManual: r.is_manual } : {}),
    } as Bet))
  } catch (e) { logLoadError('bets', e); return [] }
}
export async function upsertBet(b: Bet) {
  try {
    await supabase.from('bets').upsert({
      id: b.id, date: b.date, category: b.category, league: b.league, site: b.site,
      bet_option: b.betOption, home_team: b.homeTeam ?? null, away_team: b.awayTeam ?? null,
      team_name: b.teamName ?? null, amount: b.amount, odds: b.odds, profit: b.profit,
      result: b.result, include_stats: b.includeStats, is_dollar: b.isDollar,
      country: (b as any).country ?? null,
      match_type: (b as any).matchType ?? null,
      // rev.8: 자동 결제용 필드
      fixture_id: (b as any).fixtureId ?? null,
      fixture_sport: (b as any).fixtureSport ?? null,
      is_manual: (b as any).isManual ?? false,
    })
  } catch (e) { logSaveError('bets', e) }
}
export async function deleteBet(id: string) {
  try { await supabase.from('bets').delete().eq('id', id) }
  catch (e) { logSaveError('bets', e) }
}

// ── DEPOSITS ──────────────────────────────────────────────────
export async function loadDeposits(): Promise<Deposit[]> {
  try {
    const { data, error } = await supabase.from('deposits').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({ id: r.id, site: r.site, amount: Number(r.amount), date: r.date, isDollar: r.is_dollar }))
  } catch (e) { logLoadError('deposits', e); return [] }
}
export async function insertDeposit(d: Deposit) {
  try { await supabase.from('deposits').insert({ id: d.id, site: d.site, amount: d.amount, date: d.date, is_dollar: d.isDollar }) }
  catch (e) { logSaveError('deposits', e) }
}
export async function deleteDeposit(id: string) {
  try { await supabase.from('deposits').delete().eq('id', id) }
  catch (e) { logSaveError('deposits', e) }
}
export async function deleteDepositsBySite(site: string) {
  try { await supabase.from('deposits').delete().eq('site', site) }
  catch (e) { logSaveError('deposits', e) }
}

// ── WITHDRAWALS ───────────────────────────────────────────────
export async function loadWithdrawals(): Promise<Withdrawal[]> {
  try {
    const { data, error } = await supabase.from('withdrawals').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({ id: r.id, site: r.site, amount: Number(r.amount), date: r.date, isDollar: r.is_dollar }))
  } catch (e) { logLoadError('withdrawals', e); return [] }
}
export async function insertWithdrawal(w: Withdrawal) {
  try { await supabase.from('withdrawals').insert({ id: w.id, site: w.site, amount: w.amount, date: w.date, is_dollar: w.isDollar }) }
  catch (e) { logSaveError('withdrawals', e) }
}

// ── SITE STATES ───────────────────────────────────────────────
export async function loadSiteStates(
  allSites: string[], isUSDFn: (s: string) => boolean
): Promise<Record<string, SiteState>> {
  try {
    const { data, error } = await supabase.from('site_states').select('*')
    if (error) throw error
    const result: Record<string, SiteState> = Object.fromEntries(
      allSites.map(s => [s, { deposited: 0, betTotal: 0, active: false, isDollar: isUSDFn(s) }])
    )
    for (const r of data ?? []) {
      result[r.site] = {
        deposited: Number(r.deposited),
        betTotal: Number(r.bet_total),
        active: r.active,
        isDollar: r.is_dollar,
        ...(r.point_total != null ? { pointTotal: Number(r.point_total) } : {}),
      } as SiteState
    }
    return result
  } catch (e) {
    logLoadError('site_states', e)
    return Object.fromEntries(
      allSites.map(s => [s, { deposited: 0, betTotal: 0, active: false, isDollar: isUSDFn(s) }])
    )
  }
}
export async function upsertSiteState(site: string, st: SiteState) {
  try {
    await supabase.from('site_states').upsert({
      site, deposited: st.deposited, bet_total: st.betTotal, active: st.active, is_dollar: st.isDollar,
      point_total: (st as any).pointTotal ?? 0,
      updated_at: new Date().toISOString(),
    })
  } catch (e) { logSaveError('site_states', e) }
}

// ── CUSTOM LEAGUES ────────────────────────────────────────────
export async function loadCustomLeagues(): Promise<Record<string, string[]>> {
  try {
    const { data, error } = await supabase.from('custom_leagues').select('*').order('id')
    if (error) throw error
    const result: Record<string, string[]> = {}
    for (const r of data ?? []) {
      if (!result[r.category]) result[r.category] = []
      result[r.category].push(r.name)
    }
    return result
  } catch (e) { logLoadError('custom_leagues', e); return {} }
}
export async function insertCustomLeague(category: string, name: string) {
  try { await supabase.from('custom_leagues').insert({ category, name }) }
  catch (e) { logSaveError('custom_leagues', e) }
}
export async function updateCustomLeague(category: string, oldName: string, newName: string) {
  try { await supabase.from('custom_leagues').update({ name: newName }).eq('category', category).eq('name', oldName) }
  catch (e) { logSaveError('custom_leagues', e) }
}

// ── ESPORTS RECORDS ───────────────────────────────────────────
export async function loadEsportsRecords(): Promise<EsportsRecord[]> {
  try {
    const { data, error } = await supabase.from('esports_records').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({ id: r.id, league: r.league, date: r.date, teamA: r.team_a, teamB: r.team_b, scoreA: r.score_a, scoreB: r.score_b }))
  } catch (e) { logLoadError('esports_records', e); return [] }
}
export async function insertEsportsRecord(r: EsportsRecord) {
  try { await supabase.from('esports_records').insert({ id: r.id, league: r.league, date: r.date, team_a: r.teamA, team_b: r.teamB, score_a: r.scoreA, score_b: r.scoreB }) }
  catch (e) { logSaveError('esports_records', e) }
}
export async function deleteEsportsRecord(id: string) {
  try { await supabase.from('esports_records').delete().eq('id', id) }
  catch (e) { logSaveError('esports_records', e) }
}

// ── PROFIT EXTRAS ─────────────────────────────────────────────
export async function loadProfitExtras(): Promise<ProfitExtra[]> {
  try {
    const { data, error } = await supabase.from('profit_extras').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({ id: r.id, category: r.category, subCategory: r.sub_category ?? '', amount: Number(r.amount), date: r.date, note: r.note ?? '', isIncome: r.is_income }))
  } catch (e) { logLoadError('profit_extras', e); return [] }
}
export async function insertProfitExtra(e: ProfitExtra) {
  try { await supabase.from('profit_extras').insert({ id: e.id, category: e.category, sub_category: e.subCategory, amount: e.amount, date: e.date, note: e.note, is_income: e.isIncome }) }
  catch (err) { logSaveError('profit_extras', err) }
}
export async function deleteProfitExtra(id: string) {
  try { await supabase.from('profit_extras').delete().eq('id', id) }
  catch (e) { logSaveError('profit_extras', e) }
}

// ═════════════════════════════════════════════════════════════
// MANUAL GAMES (수동 추가 경기) ★ 기존 ★
// ═════════════════════════════════════════════════════════════
// PC ↔ 모바일 동기화. 스코어/finished도 동기화됩니다.
export interface ManualGameRow {
  id: string
  sportCat: string
  country: string
  league: string
  homeTeam: string
  awayTeam: string
  createdAt: number
  homeScore?: number
  awayScore?: number
  finished?: boolean
}

export async function loadManualGames(): Promise<ManualGameRow[]> {
  try {
    const { data, error } = await supabase.from('manual_games').select('*').order('created_at_num', { ascending: false })
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id,
      sportCat: r.sport_cat,
      country: r.country,
      league: r.league,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      createdAt: Number(r.created_at_num),
      homeScore: r.home_score == null ? undefined : Number(r.home_score),
      awayScore: r.away_score == null ? undefined : Number(r.away_score),
      finished: r.finished ?? false,
    }))
  } catch (e) { logLoadError('manual_games', e); return [] }
}

export async function upsertManualGame(g: ManualGameRow) {
  try {
    await supabase.from('manual_games').upsert({
      id: g.id,
      sport_cat: g.sportCat,
      country: g.country,
      league: g.league,
      home_team: g.homeTeam,
      away_team: g.awayTeam,
      created_at_num: g.createdAt,
      home_score: g.homeScore ?? null,
      away_score: g.awayScore ?? null,
      finished: g.finished ?? false,
    })
  } catch (e) { logSaveError('manual_games', e) }
}

export async function deleteManualGame(id: string) {
  try { await supabase.from('manual_games').delete().eq('id', id) }
  catch (e) { logSaveError('manual_games', e) }
}

export async function deleteManualGamesBySport(sportCat: string) {
  try { await supabase.from('manual_games').delete().eq('sport_cat', sportCat) }
  catch (e) { logSaveError('manual_games', e) }
}

export async function deleteManualGamesBySportCountry(sportCat: string, country: string) {
  try { await supabase.from('manual_games').delete().eq('sport_cat', sportCat).eq('country', country) }
  catch (e) { logSaveError('manual_games', e) }
}

export async function deleteManualGamesBySportCountryLeague(sportCat: string, country: string, league: string) {
  try { await supabase.from('manual_games').delete().eq('sport_cat', sportCat).eq('country', country).eq('league', league) }
  catch (e) { logSaveError('manual_games', e) }
}

// 종목/국가 이름 변경 시 manual_games 의 sport_cat/country/league 도 같이 변경
export async function renameManualGameSport(oldSport: string, newSport: string) {
  try { await supabase.from('manual_games').update({ sport_cat: newSport }).eq('sport_cat', oldSport) }
  catch (e) { logSaveError('manual_games', e) }
}
export async function renameManualGameCountry(sportCat: string, oldCountry: string, newCountry: string) {
  try { await supabase.from('manual_games').update({ country: newCountry }).eq('sport_cat', sportCat).eq('country', oldCountry) }
  catch (e) { logSaveError('manual_games', e) }
}
export async function renameManualGameLeague(sportCat: string, country: string, oldLeague: string, newLeague: string) {
  try { await supabase.from('manual_games').update({ league: newLeague }).eq('sport_cat', sportCat).eq('country', country).eq('league', oldLeague) }
  catch (e) { logSaveError('manual_games', e) }
}

// ═════════════════════════════════════════════════════════════
// M_META (수동 추가 종목/국가/리그 메타) ★ 기존 ★
// ═════════════════════════════════════════════════════════════
// type='sport':   sport=종목이름, country='', name=종목이름
// type='country': sport=종목이름, country='', name=국가이름
// type='league':  sport=종목이름, country=국가이름, name=리그이름
export type MMetaType = 'sport' | 'country' | 'league'
export interface MMetaRow {
  id: string
  type: MMetaType
  sport: string
  country: string
  name: string
}

export function mMetaId(type: MMetaType, sport: string, country: string, name: string): string {
  return `${type}|${sport}|${country}|${name}`
}

export async function loadMMeta(): Promise<MMetaRow[]> {
  try {
    const { data, error } = await supabase.from('m_meta').select('*')
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id, type: r.type, sport: r.sport, country: r.country ?? '', name: r.name,
    }))
  } catch (e) { logLoadError('m_meta', e); return [] }
}

export async function upsertMMeta(row: MMetaRow) {
  try {
    await supabase.from('m_meta').upsert({
      id: row.id, type: row.type, sport: row.sport, country: row.country, name: row.name,
    })
  } catch (e) { logSaveError('m_meta', e) }
}

export async function deleteMMeta(id: string) {
  try { await supabase.from('m_meta').delete().eq('id', id) }
  catch (e) { logSaveError('m_meta', e) }
}

export async function deleteMMetaBySport(sport: string) {
  try { await supabase.from('m_meta').delete().eq('sport', sport) }
  catch (e) { logSaveError('m_meta', e) }
}

export async function deleteMMetaBySportCountry(sport: string, country: string) {
  try { await supabase.from('m_meta').delete().eq('sport', sport).eq('country', country) }
  catch (e) { logSaveError('m_meta', e) }
}

// ═════════════════════════════════════════════════════════════
// POINT SITES (포인트 교환 사이트) ★ 신규 ★
// ═════════════════════════════════════════════════════════════
// 기존 localStorage "bt_point_sites" 대체
// App.tsx의 PointSession과 호환: id/completedAt/nextTargetDate 필수,
// amount는 선택(기존 데이터 호환). 추가 필드도 허용하기 위해 느슨하게 정의.
export interface PointSiteSession {
  id?: string
  completedAt: string
  nextTargetDate: string
  amount?: number
  [k: string]: any
}
export interface PointSiteRow {
  id: string
  name: string
  exchangeName: string
  exchangeDate: string
  targetAmount: number
  targetSiteName?: string
  targetCycleDays: number
  sessions: PointSiteSession[]
}

export async function loadPointSites(): Promise<PointSiteRow[]> {
  try {
    const { data, error } = await supabase.from('point_sites').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id,
      name: r.name,
      exchangeName: r.exchange_name,
      exchangeDate: r.exchange_date,
      targetAmount: Number(r.target_amount ?? 0),
      targetSiteName: r.target_site_name ?? undefined,
      targetCycleDays: r.target_cycle_days ?? 14,
      sessions: Array.isArray(r.sessions) ? r.sessions : [],
    }))
  } catch (e) { logLoadError('point_sites', e); return [] }
}

export async function upsertPointSite(p: PointSiteRow) {
  try {
    await supabase.from('point_sites').upsert({
      id: p.id,
      name: p.name,
      exchange_name: p.exchangeName,
      exchange_date: p.exchangeDate,
      target_amount: p.targetAmount,
      target_site_name: p.targetSiteName ?? null,
      target_cycle_days: p.targetCycleDays,
      sessions: p.sessions,
    })
  } catch (e) { logSaveError('point_sites', e) }
}

export async function deletePointSite(id: string) {
  try { await supabase.from('point_sites').delete().eq('id', id) }
  catch (e) { logSaveError('point_sites', e) }
}

// ═════════════════════════════════════════════════════════════
// DAILY QUESTS (일일 퀘스트 + 출석) ★ 신규 ★
// ═════════════════════════════════════════════════════════════
// 기존 localStorage "bt_daily_quests" 대체
export interface DailyQuestRow {
  id: string
  name: string
  createdAt: string    // YYYY-MM-DD
  history: string[]    // 출석한 날짜들
}

export async function loadDailyQuests(): Promise<DailyQuestRow[]> {
  try {
    const { data, error } = await supabase.from('daily_quests').select('*').order('created_ts')
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      history: Array.isArray(r.history) ? r.history : [],
    }))
  } catch (e) { logLoadError('daily_quests', e); return [] }
}

export async function upsertDailyQuest(q: DailyQuestRow) {
  try {
    await supabase.from('daily_quests').upsert({
      id: q.id,
      name: q.name,
      created_at: q.createdAt,
      history: q.history,
    })
  } catch (e) { logSaveError('daily_quests', e) }
}

export async function deleteDailyQuest(id: string) {
  try { await supabase.from('daily_quests').delete().eq('id', id) }
  catch (e) { logSaveError('daily_quests', e) }
}

// ═════════════════════════════════════════════════════════════
// CODE MEMOS (코드 수정 메모) ★ 신규 ★
// ═════════════════════════════════════════════════════════════
// 기존 localStorage "bt_code_memos" 대체
// CodeMemo 타입의 모든 필드를 payload(jsonb)에 저장
export async function loadCodeMemos<T = any>(): Promise<T[]> {
  try {
    const { data, error } = await supabase.from('code_memos').select('*').order('created_ts')
    if (error) throw error
    return (data ?? []).map(r => r.payload as T)
  } catch (e) { logLoadError('code_memos', e); return [] }
}

export async function upsertCodeMemo(memo: { id: string } & Record<string, any>) {
  try {
    await supabase.from('code_memos').upsert({
      id: memo.id,
      payload: memo,
    })
  } catch (e) { logSaveError('code_memos', e) }
}

export async function deleteCodeMemo(id: string) {
  try { await supabase.from('code_memos').delete().eq('id', id) }
  catch (e) { logSaveError('code_memos', e) }
}

// ═════════════════════════════════════════════════════════════
// TEAM NAMES (팀명 한글 번역 매핑) ★ 신규 ★
// ═════════════════════════════════════════════════════════════
// 기존 localStorage "bt_team_names" 대체
// { [원본팀명]: 번역팀명 } 형태의 Record
export type TeamNameMap = Record<string, string>

export async function loadTeamNames(): Promise<TeamNameMap> {
  try {
    const { data, error } = await supabase.from('team_names').select('*')
    if (error) throw error
    const m: TeamNameMap = {}
    for (const r of data ?? []) m[r.original] = r.translated
    return m
  } catch (e) { logLoadError('team_names', e); return {} }
}

export async function upsertTeamName(original: string, translated: string) {
  try {
    await supabase.from('team_names').upsert({
      original, translated, updated_at: new Date().toISOString(),
    })
  } catch (e) { logSaveError('team_names', e) }
}

export async function deleteTeamName(original: string) {
  try { await supabase.from('team_names').delete().eq('original', original) }
  catch (e) { logSaveError('team_names', e) }
}

// 전체 맵을 한 번에 대체 (기존 지우고 새로 쓰기)
export async function replaceTeamNames(map: TeamNameMap) {
  try {
    // 현재 DB의 모든 원본 키 조회
    const { data: existing } = await supabase.from('team_names').select('original')
    const existingKeys = new Set((existing ?? []).map((r: any) => r.original))
    const newKeys = new Set(Object.keys(map))

    // 삭제할 키 (DB에는 있는데 새 맵에는 없는 것)
    const toDelete = [...existingKeys].filter(k => !newKeys.has(k))
    if (toDelete.length > 0) {
      await supabase.from('team_names').delete().in('original', toDelete)
    }
    // upsert로 추가/갱신
    const rows = Object.entries(map).map(([original, translated]) => ({
      original, translated, updated_at: new Date().toISOString(),
    }))
    if (rows.length > 0) {
      await supabase.from('team_names').upsert(rows)
    }
  } catch (e) { logSaveError('team_names', e) }
}

// ═════════════════════════════════════════════════════════════
// APP SETTINGS (단순 key-value 설정들) ★ 신규 ★
// ═════════════════════════════════════════════════════════════
// 다음 키들을 이 테이블 하나로 통합 저장:
//   - krw_sites      : string[]   (구 bt_krw_sites)
//   - usd_sites      : string[]   (구 bt_usd_sites)
//   - pext_sites     : string[]   (구 bt_pext_sites)
//   - pext_cats      : string[]   (구 bt_pext_cats)
//   - pext_subcats   : string[]   (구 bt_pext_subcats)
//   - code_memo_draft: string     (구 bt_code_memo_draft)
//
// 새로 단순 설정을 추가해야 한다면 여기 새 테이블 만들지 말고 이 테이블에
// 키 하나 더 얹는 걸 우선 고려하라.

export async function loadAppSetting<T = any>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
    if (error) throw error
    if (!data) return fallback
    return data.value as T
  } catch (e) { logLoadError(`app_settings[${key}]`, e); return fallback }
}

export async function saveAppSetting(key: string, value: any) {
  try {
    await supabase.from('app_settings').upsert({
      key, value, updated_at: new Date().toISOString(),
    })
  } catch (e) { logSaveError(`app_settings[${key}]`, e) }
}

// 여러 설정을 한 번에 로드 (초기 로딩 시 사용)
export interface FixturesCacheMeta {
  // 마지막 API 호출 시각 (ISO). 캐시 신선도 판정에 사용.
  lastFetchedAt: string | null
  // 마지막 호출에서 종목별로 사용된 콜 수
  lastCallsBySport: Record<string, number>
  // 마지막 호출의 총 API 콜 수
  lastTotalCalls: number
  // 마지막 호출에서 종목별로 가져온/저장한 경기 수
  lastResultBySport: Record<string, { fetched: number; upserted: number; error?: string }>
  // 오늘(KST) 누적 콜 수 (자정에 자동 리셋되도록 날짜와 함께 저장)
  todayDateKst: string  // YYYY-MM-DD
  todayTotalCalls: number
}

export const EMPTY_FIXTURES_CACHE_META: FixturesCacheMeta = {
  lastFetchedAt: null,
  lastCallsBySport: {},
  lastTotalCalls: 0,
  lastResultBySport: {},
  todayDateKst: '',
  todayTotalCalls: 0,
}

export interface AppSettingsBundle {
  krw_sites: string[] | null
  usd_sites: string[] | null
  pext_sites: string[]
  pext_cats: string[]
  pext_subcats: string[]
  code_memo_draft: string
  league_api_map: Record<string, string>
  sports_test_league_map: Record<string, string>
  fixtures_cache_meta: FixturesCacheMeta
}
export async function loadAppSettingsBundle(): Promise<AppSettingsBundle> {
  try {
    const { data, error } = await supabase.from('app_settings').select('*')
    if (error) throw error
    const map: Record<string, any> = {}
    for (const r of data ?? []) map[r.key] = r.value
    const cacheMetaRaw = map.fixtures_cache_meta
    const cacheMeta: FixturesCacheMeta =
      cacheMetaRaw && typeof cacheMetaRaw === 'object'
        ? {
            lastFetchedAt: typeof cacheMetaRaw.lastFetchedAt === 'string' ? cacheMetaRaw.lastFetchedAt : null,
            lastCallsBySport: typeof cacheMetaRaw.lastCallsBySport === 'object' && cacheMetaRaw.lastCallsBySport !== null ? cacheMetaRaw.lastCallsBySport : {},
            lastTotalCalls: typeof cacheMetaRaw.lastTotalCalls === 'number' ? cacheMetaRaw.lastTotalCalls : 0,
            lastResultBySport: typeof cacheMetaRaw.lastResultBySport === 'object' && cacheMetaRaw.lastResultBySport !== null ? cacheMetaRaw.lastResultBySport : {},
            todayDateKst: typeof cacheMetaRaw.todayDateKst === 'string' ? cacheMetaRaw.todayDateKst : '',
            todayTotalCalls: typeof cacheMetaRaw.todayTotalCalls === 'number' ? cacheMetaRaw.todayTotalCalls : 0,
          }
        : { ...EMPTY_FIXTURES_CACHE_META }
    return {
      krw_sites: Array.isArray(map.krw_sites) ? map.krw_sites : null,
      usd_sites: Array.isArray(map.usd_sites) ? map.usd_sites : null,
      pext_sites: Array.isArray(map.pext_sites) ? map.pext_sites : [],
      pext_cats: Array.isArray(map.pext_cats) ? map.pext_cats : [],
      pext_subcats: Array.isArray(map.pext_subcats) ? map.pext_subcats : [],
      code_memo_draft: typeof map.code_memo_draft === 'string' ? map.code_memo_draft : '1. ',
      league_api_map: typeof map.league_api_map === 'object' && map.league_api_map !== null ? map.league_api_map : {},
      sports_test_league_map: typeof map.sports_test_league_map === 'object' && map.sports_test_league_map !== null ? map.sports_test_league_map : {},
      fixtures_cache_meta: cacheMeta,
    }
  } catch (e) {
    logLoadError('app_settings', e)
    return {
      krw_sites: null, usd_sites: null,
      pext_sites: [], pext_cats: [], pext_subcats: [],
      code_memo_draft: '1. ',
      league_api_map: {},
      sports_test_league_map: {},
      fixtures_cache_meta: { ...EMPTY_FIXTURES_CACHE_META },
    }
  }
}

// ═════════════════════════════════════════════════════════════
// FIXTURES (API-Sports 경기 캐시) ★ rev.6 신규 ★
// ═════════════════════════════════════════════════════════════
// rev.6부터 클라이언트가 직접 API-Sports 호출 → 결과를 이 테이블에 캐시.
// 다른 기기/탭은 이 테이블에서 읽기만. 모바일은 절대 쓰기 금지(App.tsx 책임).
//
// onConflict: (sport, fixture_id) — 같은 경기는 매번 갱신.
// 테이블 스키마는 기존 Edge Function이 만들어 둔 것을 그대로 재사용.
export interface FixtureRow {
  fixture_id:   number
  sport:        string  // 'football' | 'baseball' | 'basketball' | 'volleyball' | 'hockey'
  league_id:    number
  league_name:  string
  country:      string
  home_team:    string
  away_team:    string
  start_time:   string  // ISO
  status_short: string
  status_long:  string
  elapsed:      number | null
  home_score:   number | null
  away_score:   number | null
  fetched_at:   string  // ISO
}

// 마이그레이션용: 기존 Edge Function이 넣어둔 데이터를 한 번 비우고 시작.
// rev.6 첫 실행 시 사용자가 명시적으로 호출.
export async function clearAllFixtures(): Promise<{ ok: boolean; error?: string }> {
  try {
    // delete with no filter requires a where clause in supabase-js;
    // fixture_id >= 0 효과적으로 "전체"를 의미.
    const { error } = await supabase.from('fixtures').delete().gte('fixture_id', 0)
    if (error) throw error
    return { ok: true }
  } catch (e: any) {
    logSaveError('fixtures(clear)', e)
    return { ok: false, error: String(e?.message ?? e) }
  }
}

// API-Sports 응답을 fixtures 테이블에 upsert.
// 빈 배열이 들어오면 아무 것도 하지 않음.
export async function upsertFixtureRows(rows: FixtureRow[]): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true }
  try {
    const { error } = await supabase
      .from('fixtures')
      .upsert(rows, { onConflict: 'fixture_id,sport' })
    if (error) throw error
    return { ok: true }
  } catch (e: any) {
    logSaveError('fixtures(upsert)', e)
    return { ok: false, error: String(e?.message ?? e) }
  }
}

// 시간 범위로 fixtures 조회 (캐시 읽기 전용).
// sport를 지정하면 해당 종목만, 빈 문자열이면 전체.
export async function loadFixturesByRange(
  fromIso: string,
  toIso: string,
  sport?: string
): Promise<FixtureRow[]> {
  try {
    let q = supabase
      .from('fixtures')
      .select('*')
      .gte('start_time', fromIso)
      .lte('start_time', toIso)
      .order('start_time', { ascending: true })
      .limit(10000)
    if (sport) q = q.eq('sport', sport)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as FixtureRow[]
  } catch (e) {
    logLoadError('fixtures(range)', e)
    return []
  }
}

// 캐시 메타 저장/조회 헬퍼 (app_settings의 fixtures_cache_meta 키 래퍼)
export async function loadFixturesCacheMeta(): Promise<FixturesCacheMeta> {
  return loadAppSetting<FixturesCacheMeta>('fixtures_cache_meta', { ...EMPTY_FIXTURES_CACHE_META })
}

export async function saveFixturesCacheMeta(meta: FixturesCacheMeta): Promise<void> {
  await saveAppSetting('fixtures_cache_meta', meta)
}

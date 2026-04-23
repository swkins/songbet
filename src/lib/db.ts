import { supabase } from './supabase'
import type { Bet, Deposit, Withdrawal, SiteState, EsportsRecord, ProfitExtra } from '../types'

// ── BETS ──────────────────────────────────────────────────────
export async function loadBets(): Promise<Bet[]> {
  const { data } = await supabase.from('bets').select('*').order('created_at')
  return (data ?? []).map(r => ({
    id: r.id, date: r.date, category: r.category, league: r.league, site: r.site,
    betOption: r.bet_option, homeTeam: r.home_team ?? undefined, awayTeam: r.away_team ?? undefined,
    teamName: r.team_name ?? undefined, amount: Number(r.amount), odds: Number(r.odds),
    profit: r.profit != null ? Number(r.profit) : null,
    result: r.result, includeStats: r.include_stats, isDollar: r.is_dollar,
    // 추가 필드 (기존 행에는 없을 수 있음)
    ...(r.country != null ? { country: r.country } : {}),
    ...(r.match_type != null ? { matchType: r.match_type } : {}),
  } as Bet))
}
export async function upsertBet(b: Bet) {
  await supabase.from('bets').upsert({
    id: b.id, date: b.date, category: b.category, league: b.league, site: b.site,
    bet_option: b.betOption, home_team: b.homeTeam ?? null, away_team: b.awayTeam ?? null,
    team_name: b.teamName ?? null, amount: b.amount, odds: b.odds, profit: b.profit,
    result: b.result, include_stats: b.includeStats, is_dollar: b.isDollar,
    // 추가 필드
    country: (b as any).country ?? null,
    match_type: (b as any).matchType ?? null,
  })
}
export async function deleteBet(id: string) {
  await supabase.from('bets').delete().eq('id', id)
}

// ── DEPOSITS ──────────────────────────────────────────────────
export async function loadDeposits(): Promise<Deposit[]> {
  const { data } = await supabase.from('deposits').select('*').order('created_at')
  return (data ?? []).map(r => ({ id: r.id, site: r.site, amount: Number(r.amount), date: r.date, isDollar: r.is_dollar }))
}
export async function insertDeposit(d: Deposit) {
  await supabase.from('deposits').insert({ id: d.id, site: d.site, amount: d.amount, date: d.date, is_dollar: d.isDollar })
}
export async function deleteDeposit(id: string) {
  await supabase.from('deposits').delete().eq('id', id)
}
export async function deleteDepositsBySite(site: string) {
  await supabase.from('deposits').delete().eq('site', site)
}

// ── WITHDRAWALS ───────────────────────────────────────────────
export async function loadWithdrawals(): Promise<Withdrawal[]> {
  const { data } = await supabase.from('withdrawals').select('*').order('created_at')
  return (data ?? []).map(r => ({ id: r.id, site: r.site, amount: Number(r.amount), date: r.date, isDollar: r.is_dollar }))
}
export async function insertWithdrawal(w: Withdrawal) {
  await supabase.from('withdrawals').insert({ id: w.id, site: w.site, amount: w.amount, date: w.date, is_dollar: w.isDollar })
}

// ── SITE STATES ───────────────────────────────────────────────
export async function loadSiteStates(
  allSites: string[], isUSDFn: (s: string) => boolean
): Promise<Record<string, SiteState>> {
  const { data } = await supabase.from('site_states').select('*')
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
}
export async function upsertSiteState(site: string, st: SiteState) {
  await supabase.from('site_states').upsert({
    site, deposited: st.deposited, bet_total: st.betTotal, active: st.active, is_dollar: st.isDollar,
    point_total: (st as any).pointTotal ?? 0,
    updated_at: new Date().toISOString(),
  })
}

// ── CUSTOM LEAGUES ────────────────────────────────────────────
export async function loadCustomLeagues(): Promise<Record<string, string[]>> {
  const { data } = await supabase.from('custom_leagues').select('*').order('id')
  const result: Record<string, string[]> = {}
  for (const r of data ?? []) {
    if (!result[r.category]) result[r.category] = []
    result[r.category].push(r.name)
  }
  return result
}
export async function insertCustomLeague(category: string, name: string) {
  await supabase.from('custom_leagues').insert({ category, name })
}
export async function updateCustomLeague(category: string, oldName: string, newName: string) {
  await supabase.from('custom_leagues').update({ name: newName }).eq('category', category).eq('name', oldName)
}

// ── ESPORTS RECORDS ───────────────────────────────────────────
export async function loadEsportsRecords(): Promise<EsportsRecord[]> {
  const { data } = await supabase.from('esports_records').select('*').order('created_at')
  return (data ?? []).map(r => ({ id: r.id, league: r.league, date: r.date, teamA: r.team_a, teamB: r.team_b, scoreA: r.score_a, scoreB: r.score_b }))
}
export async function insertEsportsRecord(r: EsportsRecord) {
  await supabase.from('esports_records').insert({ id: r.id, league: r.league, date: r.date, team_a: r.teamA, team_b: r.teamB, score_a: r.scoreA, score_b: r.scoreB })
}
export async function deleteEsportsRecord(id: string) {
  await supabase.from('esports_records').delete().eq('id', id)
}

// ── PROFIT EXTRAS ─────────────────────────────────────────────
export async function loadProfitExtras(): Promise<ProfitExtra[]> {
  const { data } = await supabase.from('profit_extras').select('*').order('created_at')
  return (data ?? []).map(r => ({ id: r.id, category: r.category, subCategory: r.sub_category ?? '', amount: Number(r.amount), date: r.date, note: r.note ?? '', isIncome: r.is_income }))
}
export async function insertProfitExtra(e: ProfitExtra) {
  await supabase.from('profit_extras').insert({ id: e.id, category: e.category, sub_category: e.subCategory, amount: e.amount, date: e.date, note: e.note, is_income: e.isIncome })
}
export async function deleteProfitExtra(id: string) {
  await supabase.from('profit_extras').delete().eq('id', id)
}

// ═════════════════════════════════════════════════════════════
// MANUAL GAMES (수동 추가 경기) ★ 신규 ★
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
  const { data } = await supabase.from('manual_games').select('*').order('created_at_num', { ascending: false })
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
}

export async function upsertManualGame(g: ManualGameRow) {
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
}

export async function deleteManualGame(id: string) {
  await supabase.from('manual_games').delete().eq('id', id)
}

export async function deleteManualGamesBySport(sportCat: string) {
  await supabase.from('manual_games').delete().eq('sport_cat', sportCat)
}

export async function deleteManualGamesBySportCountry(sportCat: string, country: string) {
  await supabase.from('manual_games').delete().eq('sport_cat', sportCat).eq('country', country)
}

export async function deleteManualGamesBySportCountryLeague(sportCat: string, country: string, league: string) {
  await supabase.from('manual_games').delete().eq('sport_cat', sportCat).eq('country', country).eq('league', league)
}

// 종목/국가 이름 변경 시 manual_games 의 sport_cat/country/league 도 같이 변경
export async function renameManualGameSport(oldSport: string, newSport: string) {
  await supabase.from('manual_games').update({ sport_cat: newSport }).eq('sport_cat', oldSport)
}
export async function renameManualGameCountry(sportCat: string, oldCountry: string, newCountry: string) {
  await supabase.from('manual_games').update({ country: newCountry }).eq('sport_cat', sportCat).eq('country', oldCountry)
}
export async function renameManualGameLeague(sportCat: string, country: string, oldLeague: string, newLeague: string) {
  await supabase.from('manual_games').update({ league: newLeague }).eq('sport_cat', sportCat).eq('country', country).eq('league', oldLeague)
}

// ═════════════════════════════════════════════════════════════
// M_META (수동 추가 종목/국가/리그 메타) ★ 신규 ★
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
  const { data } = await supabase.from('m_meta').select('*')
  return (data ?? []).map(r => ({
    id: r.id, type: r.type, sport: r.sport, country: r.country ?? '', name: r.name,
  }))
}

export async function upsertMMeta(row: MMetaRow) {
  await supabase.from('m_meta').upsert({
    id: row.id, type: row.type, sport: row.sport, country: row.country, name: row.name,
  })
}

export async function deleteMMeta(id: string) {
  await supabase.from('m_meta').delete().eq('id', id)
}

export async function deleteMMetaBySport(sport: string) {
  await supabase.from('m_meta').delete().eq('sport', sport)
}

export async function deleteMMetaBySportCountry(sport: string, country: string) {
  await supabase.from('m_meta').delete().eq('sport', sport).eq('country', country)
}

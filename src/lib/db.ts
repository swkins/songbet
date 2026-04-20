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
  }))
}
export async function upsertBet(b: Bet) {
  await supabase.from('bets').upsert({
    id: b.id, date: b.date, category: b.category, league: b.league, site: b.site,
    bet_option: b.betOption, home_team: b.homeTeam ?? null, away_team: b.awayTeam ?? null,
    team_name: b.teamName ?? null, amount: b.amount, odds: b.odds, profit: b.profit,
    result: b.result, include_stats: b.includeStats, is_dollar: b.isDollar,
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
    result[r.site] = { deposited: Number(r.deposited), betTotal: Number(r.bet_total), active: r.active, isDollar: r.is_dollar }
  }
  return result
}
export async function upsertSiteState(site: string, st: SiteState) {
  await supabase.from('site_states').upsert({
    site, deposited: st.deposited, bet_total: st.betTotal, active: st.active, is_dollar: st.isDollar,
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

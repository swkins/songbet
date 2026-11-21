// ─── 승패 배당 시간대별 기록 (Supabase odds_snapshots) — 분석 탭 일정 옆·오른쪽 변동표 ─────
// NBA = Action Network 9개 북 평균(오픈·홈 티켓% 포함), 국내 = BetExplorer 평균배당, 축구 = ESPN · DraftKings 승무패(오픈 포함), K리그·J2 = BetExplorer 승무패. 홈/원정은 일정 기준.
import { supabase } from './supabase'

export interface OddsSnap {
  id: number; fetched_at: string; league: string; game_date: string; game_id: string; source: string
  home_odds: number | null; away_odds: number | null; open_home: number | null; open_away: number | null
  draw_odds?: number | null; open_draw?: number | null   // 축구만 (ESPN · DraftKings 승무패)
  home_tickets: number | null; books: number | null; match_name: string | null
}

/** fromDate(KST) 이후 경기의 배당 기록 → 경기 id별, 오래된 것부터 */
export async function loadOdds(fromDate: string): Promise<Record<string, OddsSnap[]>> {
  const { data } = await supabase.from('odds_snapshots').select('*').gte('game_date', fromDate).order('fetched_at')
  const out: Record<string, OddsSnap[]> = {}
  for (const r of (data ?? []) as OddsSnap[]) {
    const s = { ...r, home_odds: num(r.home_odds), away_odds: num(r.away_odds), open_home: num(r.open_home), open_away: num(r.open_away), draw_odds: num(r.draw_odds), open_draw: num(r.open_draw), home_tickets: num(r.home_tickets) }
    ;(out[r.game_id] ??= []).push(s)
  }
  return out
}
const num = (v: unknown) => (v == null ? null : Number(v))

/** 기준(오픈이 있으면 오픈, 없으면 첫 기록) 대비 지금 배당 변화 */
export function oddsTrend(list: OddsSnap[] | undefined) {
  if (!list?.length) return null
  const last = list[list.length - 1], first = list[0]
  const baseH = last.open_home ?? first.home_odds, baseA = last.open_away ?? first.away_odds
  return { last, baseH, baseA, dH: last.home_odds != null && baseH != null ? +(last.home_odds - baseH).toFixed(2) : 0, dA: last.away_odds != null && baseA != null ? +(last.away_odds - baseA).toFixed(2) : 0 }
}

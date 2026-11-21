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

// ─── NBA 핸디·언오버 기준점 (odds_lines — collect-odds가 바뀐 때만 한 줄, 사용자 요청 2026-11-21) ─────
// spread: line = 홈 기준점(예 -12.5 = 홈 마핸 12.5), home/away_odds = 그 라인 양쪽 배당 / total: line = 총점, home = 오버, away = 언더
export interface OddsLine {
  id: number; fetched_at: string; league: string; game_date: string; game_id: string; market: 'spread' | 'total'
  line: number; home_odds: number | null; away_odds: number | null; open_line: number | null; open_home: number | null; open_away: number | null; books: number | null; source: string | null
}
const lineRow = (r: OddsLine): OddsLine => ({ ...r, line: Number(r.line), home_odds: num(r.home_odds), away_odds: num(r.away_odds), open_line: num(r.open_line), open_home: num(r.open_home), open_away: num(r.open_away) })
/** fromDate(KST) 이후 경기의 기준점 기록 → 경기 id별, 오래된 것부터 */
export async function loadLines(fromDate: string): Promise<Record<string, OddsLine[]>> {
  const { data } = await supabase.from('odds_lines').select('*').gte('game_date', fromDate).order('fetched_at')
  const out: Record<string, OddsLine[]> = {}
  for (const r of (data ?? []) as OddsLine[]) (out[r.game_id] ??= []).push(lineRow(r))
  return out
}
export async function loadGameLines(gameId: string): Promise<OddsLine[]> {
  const { data } = await supabase.from('odds_lines').select('*').eq('game_id', gameId).order('fetched_at')
  return ((data ?? []) as OddsLine[]).map(lineRow)
}
export const lastLine = (list: OddsLine[] | undefined, market: 'spread' | 'total') => [...(list ?? [])].reverse().find(l => l.market === market) ?? null

// 정규분포 누적 근사 (DB 트리거 phi_approx와 같은 식)
const phi = (x: number) => 1 / (1 + Math.exp(-1.702 * x))
/** 예상 마진(홈) vs 홈 기준점 → 마핸/플핸 픽과 커버 확률 (DB predictions_lines 트리거와 같은 계산) */
export function atsPick(margin: number, line: number, sd = 13.5) {
  const p = phi((margin + line) / sd)
  const home = margin + line >= 0
  // 홈이 정배(line < 0)면 홈 쪽 = 마핸, 원정 쪽 = 플핸. line > 0이면 반대. line 0이면 둘 다 0 핸디
  const homeMinus = line < 0
  const kind = line === 0 ? '0' : (home === homeMinus ? '마핸' : '플핸')
  return { side: home ? 'home' as const : 'away' as const, kind, prob: Math.round(Math.max(p, 1 - p) * 1000) / 10, edge: Math.round((margin + line) * 10) / 10 }
}
export function ouPick(total: number, line: number, sdT = 18) {
  const p = phi((total - line) / sdT)
  return { side: total >= line ? 'over' as const : 'under' as const, prob: Math.round(Math.max(p, 1 - p) * 1000) / 10, edge: Math.round((total - line) * 10) / 10 }
}
/** 홈 기준점 표기: -12.5 → '홈 -12.5', 3.5 → '홈 +3.5' */
export const fmtLine = (v: number) => `${v > 0 ? '+' : ''}${v}`

// ─── 추천 (사용자 요청 2026-11-21 — 내 모델 확률을 지금 배당과 비교해 갈 만한 것만) ─────
// 추천 확률 = 시장 확률(양쪽 배당 마진 뺀 값) + REC_SHRINK × (모델 확률 − 시장 확률) — 검증 전 모델을 그대로 믿으면 다 추천이 돼서 반만 믿는다.
// 기대수익 = 추천 확률 × 배당 − 1. 추천 = +3% 이상 & 배당 1.30 이상 3.00 미만 (모든 종목 공통 배당 범위 — 사용자 규칙).
// DB 트리거(predictions_rec)도 같은 식으로 rec_* 칸에 저장·채점 — 바꾸면 둘 다 바꾼다.
export const REC_RULE = { minEv: 0.03, minOdds: 1.3, maxOdds: 3.0, shrink: 0.5 }
/** 모델 확률 p, 이 쪽 배당 o, 반대쪽 배당 oo → 추천 확률·기대수익(%)·추천 여부 */
export function recOf(p: number, o: number | null | undefined, oo: number | null | undefined) {
  if (!o || !oo || o <= 1 || oo <= 1) return null
  const q = (1 / o) / (1 / o + 1 / oo)
  const pr = q + REC_RULE.shrink * (p - q)
  const ev = pr * o - 1
  return { market: Math.round(q * 1000) / 10, prob: Math.round(pr * 1000) / 10, ev: Math.round(ev * 1000) / 10, rec: o >= REC_RULE.minOdds && o < REC_RULE.maxOdds && ev >= REC_RULE.minEv }
}

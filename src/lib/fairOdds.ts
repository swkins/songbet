// 피나클 공정 배당 (2026-11-28 사용자 요청 — 롤링 위주라 "손실이 가장 적은 베팅"을 고르는 도구)
// 데이터: collect-soccer가 5대 리그마다 저장하는 pin_matchups(game_id 연결)·pin_odds(바뀐 때만 = 변동 기록, SQL supabase/pin_odds.sql)
// 공정 확률 = 피나클 배당에서 마진을 뺀 값 (파워 방식 — 마진을 고배당 쪽에 더 많이 얹는 북메이커 습성 반영, 비례 방식보다 정확하다고 알려짐)
// 기대수익 = 공정 확률 × 사이트 배당 − 1  (−2% = 100만 원 돌리면 평균 2만 원 손해)
import { supabase } from './supabase'

export interface PinRow { matchup_id: number; market: 'ml' | 'spread' | 'total'; line: number | null; p1: number; p2: number | null; p3: number; fetched_at: string }
export interface PinPrice { p: number; fair: number; odds: number; open?: number }   // p 공정 확률 · fair 공정 배당 · odds 피나클 배당 · open 피나클 첫 배당
export interface PinFair {
  fetched_at: string
  margin: number                                // 승무패 마진 (예 0.025 = 2.5%)
  ml?: { home: PinPrice; draw: PinPrice; away: PinPrice }
  spread: Record<string, { home: PinPrice; away: PinPrice }>   // 키 = 홈 기준 핸디 ('-0.5', '1.5' …)
  total: Record<string, { over: PinPrice; under: PinPrice }>   // 키 = 기준점 ('2.5' …)
}

/** 파워 방식 마진 제거: Σ (1/o)^k = 1 이 되는 k를 찾아 p = (1/o)^k */
export function devig(odds: number[]): number[] {
  const q = odds.map(o => 1 / o)
  let lo = 0.5, hi = 2
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2
    const s = q.reduce((a, x) => a + x ** k, 0)
    if (s > 1) lo = k; else hi = k
  }
  const k = (lo + hi) / 2
  return q.map(x => x ** k)
}

const key = (l: number | null) => (l == null ? '' : String(Number(l)))
const price = (p: number, odds: number, open?: number): PinPrice => ({ p, fair: 1 / p, odds, open })

function build(rows: PinRow[]): PinFair | null {
  if (!rows.length) return null
  // rows: 오래된 것 → 최신 순
  const first = new Map<string, PinRow>(), last = new Map<string, PinRow>()
  for (const r of rows) { const k = `${r.market}|${key(r.line)}`; if (!first.has(k)) first.set(k, r); last.set(k, r) }
  const out: PinFair = { fetched_at: rows[rows.length - 1].fetched_at, margin: 0, spread: {}, total: {} }
  for (const [k, r] of last) {
    const o = first.get(k)!
    if (r.market === 'ml' && r.p2) {
      const [h, d, a] = devig([Number(r.p1), Number(r.p2), Number(r.p3)])
      out.ml = { home: price(h, Number(r.p1), Number(o.p1)), draw: price(d, Number(r.p2), Number(o.p2)), away: price(a, Number(r.p3), Number(o.p3)) }
      out.margin = 1 / Number(r.p1) + 1 / Number(r.p2) + 1 / Number(r.p3) - 1
    } else if (r.market === 'spread') {
      const [h, a] = devig([Number(r.p1), Number(r.p3)])
      out.spread[key(r.line)] = { home: price(h, Number(r.p1), Number(o.p1)), away: price(a, Number(r.p3), Number(o.p3)) }
    } else if (r.market === 'total') {
      const [ov, un] = devig([Number(r.p1), Number(r.p3)])
      out.total[key(r.line)] = { over: price(ov, Number(r.p1), Number(o.p1)), under: price(un, Number(r.p3), Number(o.p3)) }
    }
    if (r.fetched_at > out.fetched_at) out.fetched_at = r.fetched_at
  }
  return out
}

/** 경기(game_schedules id)별 피나클 공정 배당. 경기 시작 전 마지막 기록까지만 (시작 후 = 마감 배당 그대로). */
export async function loadPinFair(gameIds: string[]): Promise<Record<string, PinFair>> {
  if (!gameIds.length) return {}
  const { data: mus } = await supabase.from('pin_matchups').select('matchup_id,game_id,start_at').in('game_id', gameIds)
  const byMu = new Map<number, { game_id: string; start_at: string }>()
  for (const m of (mus ?? []) as { matchup_id: number; game_id: string; start_at: string }[]) byMu.set(m.matchup_id, m)
  if (!byMu.size) return {}
  const rows: PinRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('pin_odds').select('matchup_id,market,line,p1,p2,p3,fetched_at')
      .in('matchup_id', [...byMu.keys()]).order('fetched_at', { ascending: true }).range(from, from + 999)
    rows.push(...((data ?? []) as PinRow[]))
    if (!data || data.length < 1000) break
  }
  const grouped = new Map<string, PinRow[]>()
  for (const r of rows) {
    const m = byMu.get(r.matchup_id); if (!m || r.fetched_at > m.start_at) continue
    const g = grouped.get(m.game_id) ?? []; g.push(r); grouped.set(m.game_id, g)
  }
  const out: Record<string, PinFair> = {}
  for (const [g, rs] of grouped) { const f = build(rs); if (f) out[g] = f }
  return out
}

/** 베팅 옵션 → 피나클 공정 가격. side = 'home' | 'away' | 'game', opt = 저장 문구의 옵션 부분 ('승리' · '0.5 H' · '-1.5 H' · '2.5 오버' …) */
export function fairFor(f: PinFair | undefined, side: 'home' | 'away' | 'game', opt: string): PinPrice | null {
  if (!f) return null
  const o = opt.trim()
  if (o === '승리' && side !== 'game') return f.ml?.[side] ?? null
  if (o === '무승부' || o === '무') return f.ml?.draw ?? null
  const h = o.match(/^([+-]?\d+(?:\.\d+)?)\s*H$/)
  if (h && side !== 'game') {
    const L = Number(h[1])            // 고른 팀 기준 핸디 (+0.5 = 비기거나 이기면 적중)
    const homeLine = side === 'home' ? L : -L
    const sp = f.spread[String(homeLine)]
    if (sp) return sp[side]
    // ±0.5는 승무패로도 계산 (피나클 핸디에 ±0.5 줄이 없을 때)
    if (Math.abs(L) === 0.5 && f.ml) {
      const me = f.ml[side], op = f.ml[side === 'home' ? 'away' : 'home']
      const p = L < 0 ? me.p : 1 - op.p
      return { p, fair: 1 / p, odds: NaN }
    }
    return null
  }
  const t = o.match(/(\d+(?:\.\d+)?)\s*(오버|언더)$/)
  if (t) { const tt = f.total[String(Number(t[1]))]; return tt ? (t[2] === '오버' ? tt.over : tt.under) : null }
  return null
}

/** 사이트 배당의 기대수익 (공정 확률 기준) */
export const evOf = (p: number, odds: number) => p * odds - 1
/** 기대 손실이 lossPct(예 0.03 = 3%) 이내가 되는 최소 배당 */
export const minOddsFor = (p: number, lossPct: number) => (1 - lossPct) / p

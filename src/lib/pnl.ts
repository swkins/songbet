import dayjs from 'dayjs'
import type { Bet } from '../types'

// ─── 일별/월별 손익 집계 — 통계(전체 탭)와 대시보드 요약 위젯이 같이 쓴다 ───────────────
// 결과처리 시각(result_at, 없으면 베팅일)의 날짜로 묶는다. 두폴은 손익이 첫 경기에만 저장되므로
// 건수는 첫 경기만 세고 손익은 그대로 더하면 첫 경기 종목으로 잡힌다.
export interface PnLSportAgg { gain: number; loss: number; net: number; count: number }
export interface PnLAgg { count: number; gain: number; loss: number; net: number; bySport: Record<string, PnLSportAgg> }

export function settledDayOf(b: Pick<Bet, 'result_at' | 'bet_date'>): string {
  return b.result_at ? dayjs(b.result_at).format('YYYY-MM-DD') : b.bet_date
}

export function aggregatePnL(list: Bet[]): PnLAgg {
  const agg: PnLAgg = { count: 0, gain: 0, loss: 0, net: 0, bySport: {} }
  for (const b of list) {
    const isExtraLeg = b.parlay_group !== null && b.parlay_leg > 1
    const sp = (agg.bySport[b.sport] ??= { gain: 0, loss: 0, net: 0, count: 0 })
    if (!isExtraLeg) { agg.count++; sp.count++ }
    if (b.profit > 0) { agg.gain += b.profit; sp.gain += b.profit }
    else if (b.profit < 0) { agg.loss += b.profit; sp.loss += b.profit }
    agg.net += b.profit; sp.net += b.profit
  }
  return agg
}

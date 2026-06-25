export type Sport = 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'hockey' | 'esports' | 'other'
export type Market = 'moneyline' | 'handicap' | 'over' | 'under' | 'correct_score' | 'other'
export type BetResult = 'win' | 'loss' | 'push' | 'pending'
export type CashflowType = 'income' | 'expense'

export interface Site {
  id: string; created_at: string; name: string; balance: number
  active: boolean; sort_order: number; rolling_target: number; rolling_done: number
  last_deposit: number
  deposit_bet_done: number
  point_deposit: number
  total_withdrawal: number
  currency: 'krw' | 'usd'
  bet_type: 'single' | 'double'   // 단폴 or 두폴
  settlement_only: boolean          // 결산 전용 사이트 (대시보드 베팅현황에 미표시)
}
export interface Bet {
  id: string; created_at: string; bet_date: string; sport: Sport
  league: string; match: string; market: Market; pick: string
  odds: number; stake: number; result: BetResult; profit: number; memo: string
  site_id: string | null
  parlay_group: string | null   // 두폴 그룹 uuid
  parlay_leg: number            // 1 or 2
}
export interface Todo {
  id: string; created_at: string; todo_date: string; content: string
  done: boolean; check_count: number; check_dates: string[]
}
export interface Cashflow {
  id: string; created_at: string; flow_date: string; type: CashflowType
  category: string; description: string; amount: number; site_id: string | null
  currency: 'krw' | 'usd'
  usd_krw_rate: number | null
  amount_krw: number | null
}
export interface ActionLog {
  id: string; created_at: string; action_type: 'insert' | 'update' | 'delete'
  table_name: string; record_id: string | null
  before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; description: string
  cashflow_id: string | null
}
export type Tab = 'dashboard' | 'stats' | 'settlement' | 'simul' | 'rulebook'

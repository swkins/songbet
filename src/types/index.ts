export type Sport = 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'esports' | 'other'
export type Market = 'moneyline' | 'handicap' | 'over' | 'under' | 'correct_score' | 'other'
export type BetResult = 'win' | 'loss' | 'push' | 'pending'
export type CashflowType = 'income' | 'expense'

export interface Site {
  id: string; created_at: string; name: string; balance: number
  active: boolean; sort_order: number; rolling_target: number; rolling_done: number
  last_deposit: number;    // 최근 입금액
  deposit_bet_done: number // 입금 후 베팅된 누적액
}
export interface Bet {
  id: string; created_at: string; bet_date: string; sport: Sport
  league: string; match: string; market: Market; pick: string
  odds: number; stake: number; result: BetResult; profit: number; memo: string; site_id: string | null
}
export interface Todo {
  id: string; created_at: string; todo_date: string; content: string
  done: boolean; check_count: number; check_dates: string[]
}
export interface Cashflow {
  id: string; created_at: string; flow_date: string; type: CashflowType
  category: string; description: string; amount: number; site_id: string | null
}
export interface ActionLog {
  id: string; created_at: string; action_type: 'insert' | 'update' | 'delete'
  table_name: string; record_id: string | null
  before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; description: string
}
export type Tab = 'dashboard' | 'stats' | 'settlement'

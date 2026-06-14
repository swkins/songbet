export type Sport = 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'esports' | 'other'
export type Market = 'handicap' | 'over_under' | 'moneyline' | 'correct_score' | 'other'
export type BetResult = 'win' | 'loss' | 'push' | 'pending'
export type CashflowType = 'income' | 'expense'

export interface Site {
  id: string
  created_at: string
  name: string
  balance: number
  active: boolean
  sort_order: number
}

export interface Bet {
  id: string
  created_at: string
  bet_date: string
  sport: Sport
  league: string
  match: string
  market: Market
  pick: string
  odds: number
  stake: number
  result: BetResult
  profit: number
  memo: string
  site_id: string | null
}

export interface Todo {
  id: string
  created_at: string
  todo_date: string
  content: string
  done: boolean
  check_count: number
  check_dates: string[]
}

export interface Cashflow {
  id: string
  created_at: string
  flow_date: string
  type: CashflowType
  category: string
  description: string
  amount: number
}

export type Tab = 'dashboard' | 'bets' | 'stats'

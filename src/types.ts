export interface Bet {
  id: string; date: string; category: string; league: string; site: string
  betOption: string; homeTeam?: string; awayTeam?: string; teamName?: string
  amount: number; odds: number; profit: number | null
  result: string; includeStats: boolean; isDollar: boolean
}
export interface Deposit { id: string; site: string; amount: number; date: string; isDollar: boolean }
export interface Withdrawal { id: string; site: string; amount: number; date: string; isDollar: boolean }
export interface SiteState { deposited: number; betTotal: number; active: boolean; isDollar: boolean }
export interface Log { id: string; ts: string; type: string; desc: string }
export interface EsportsRecord { id: string; league: string; date: string; teamA: string; teamB: string; scoreA: number; scoreB: number }
export interface ProfitExtra { id: string; category: string; subCategory: string; amount: number; date: string; note: string; isIncome: boolean }
export interface OddsGame {
  id: string; sport: string; leagueName: string; commence: string; home: string; away: string
  bookmakers: { key: string; title: string; homeOdds: number; awayOdds: number; drawOdds?: number }[]
  bestHome: number; bestAway: number; bestDraw?: number
}
export interface OddsSnapshot { ts: number; home: number; away: number; draw?: number }
export type OddsAlert = '급락' | '연속하락' | '하락' | null

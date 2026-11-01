import dayjs from 'dayjs'

// Supabase `picks` 테이블 한 줄 — 픽 탭(src/pages/Picks.tsx)과 베팅추가 "추천픽"(Dashboard)에서 같이 쓴다.
export interface Pick {
  id: string; created_at: string; kickoff_at: string | null
  sport: string; league: string; home_team: string; away_team: string
  grade: number | null; stake: number | null
  market_type: string | null; pick_label: string; pick_side: string | null; line: number | null
  base_odds: number | null; ticket_info: string | null; flow_info: string | null; rationale: string | null
  tags: string[] | null; rule_version: string | null; game_key: string | null; sort_order: number | null
}
export interface PickBetLite { match: string; stake: number; odds: number; result: string; profit: number; bet_date: string; sport: string; site_id?: string | null; is_mock?: boolean }

export const SPORT_EMOJI: Record<string, string> = { soccer: '⚽', baseball: '⚾', basketball: '🏀', volleyball: '🏐', esports: '🎮' }

const isOU = (p: Pick) => p.pick_side === 'under' || p.pick_side === 'over'
// 추천픽으로 건 베팅은 memo에 "추천픽|홈팀|원정팀"을 남겨, 진행중 목록에서 두 팀을 같이 보여준다 (사용자 요청).
// 4번째 칸은 픽 별점(grade) — 통계 추천픽 탭이 이 별점으로 나눈다 (금액을 고쳐 걸어도 별점은 픽 그대로).
// 캐시아웃하면 memo 뒤에 " · 캐시아웃 …"이 붙으므로 그 앞까지만 읽는다.
export const PICK_MEMO_PREFIX = '추천픽|'
export function pickMemo(p: Pick): string { return `${PICK_MEMO_PREFIX}${p.home_team}|${p.away_team}|${p.grade ?? ''}` }
export function parsePickMemo(memo: string | null | undefined): { home: string; away: string; grade: number | null } | null {
  if (!memo || !memo.startsWith(PICK_MEMO_PREFIX)) return null
  const [home, away, g] = memo.slice(PICK_MEMO_PREFIX.length).split(' · ')[0].split('|')
  const grade = g ? Number(g) : NaN
  return home && away ? { home, away, grade: Number.isFinite(grade) ? grade : null } : null
}
export const isPickBet = (b: { memo?: string | null }) => !!b.memo && b.memo.startsWith(PICK_MEMO_PREFIX)

export const pickTeam = (p: Pick) => p.pick_side === 'home' ? p.home_team : p.pick_side === 'away' ? p.away_team : ''

// 픽과 같은 베팅 찾기: 경기일 ±1일, 핸디·승은 픽 팀 이름이, 언오버는 두 팀 중 하나와 언더/오버가 경기 내용에 있어야 한다
export function matchBets<B extends PickBetLite>(p: Pick, bets: B[]): B[] {
  const day = dayjs(p.kickoff_at ?? p.created_at)
  const near = bets.filter(b => !b.is_mock && Math.abs(dayjs(b.bet_date).diff(day.startOf('day'), 'day')) <= 1)
  if (isOU(p)) {
    const word = p.pick_side === 'under' ? /언더|under/i : /오버|over/i
    return near.filter(b => word.test(b.match) && (b.match.includes(p.home_team) || b.match.includes(p.away_team)))
  }
  const team = pickTeam(p)
  if (!team) return []
  const short = team.replace(/^(FC|AS|SC)\s+|\s+(FC|SC)$/g, '').trim()
  return near.filter(b => !/언더|오버|under|over/i.test(b.match) && (b.match.includes(team) || (short.length >= 2 && b.match.includes(short))))
}

// 픽 → 베팅 내용(직접 베팅에서 만드는 형식과 같게: "팀 홈 0.5 H", "팀 원정 승리", "홈팀 vs 원정팀 2.5 언더")
export function pickToContent(p: Pick): string {
  const side = p.pick_side === 'home' ? '홈' : p.pick_side === 'away' ? '원정' : ''
  const line = p.line != null ? Number(p.line) : null
  const minus = /-\s?\d/.test(p.pick_label)
  const fmt = (n: number) => String(Math.abs(n))
  if (isOU(p)) return [`${p.home_team} vs ${p.away_team}`, line != null ? fmt(line) : '', p.pick_side === 'under' ? '언더' : '오버'].filter(Boolean).join(' ')
  const team = pickTeam(p) || p.pick_label
  if (line == null || /승/.test(p.market_type ?? '') && !/핸디/.test(p.market_type ?? '')) return [team, side, '승리'].filter(Boolean).join(' ')
  if (p.sport === 'soccer') return [team, side, `${minus ? '-' : ''}${fmt(line)} H`].filter(Boolean).join(' ')
  return [team, side, fmt(line), minus ? '마핸' : '플핸'].filter(Boolean).join(' ')
}

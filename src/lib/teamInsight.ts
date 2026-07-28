// ─── 팀 이름 기반 자동완성 / 최근 성적 / 종목 추론 유틸 ──────────────
// Dashboard.tsx(베팅현황)의 경기 내용 입력창에서 사용한다.
// bet.match 텍스트에서 핸디캡/라인 숫자·괄호·오버언더 등 잡음을 제거해
// "팀 이름"에 가까운 문자열을 뽑아내고, 그걸 기준으로 자동완성 후보를 만든다.

export interface TeamCandidate { name: string; lastDate: string }

export interface BetLite {
  sport: string
  match: string
  result: string
  profit: number
  bet_date: string
  created_at: string
  league?: string | null
}

export interface TeamInsight {
  sport: string
  recentN: number
  wins: number
  losses: number
  pushes: number
  profit: number
  streakType: 'win' | 'loss' | null
  streakCount: number
  totalSettled: number
}

// 경기 내용에서 핸디캡/토탈 라인 숫자, 오버/언더, 괄호 안 내용(상대팀 등) 제거
export function extractTeamCandidate(match: string): string {
  return match
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(오버|언더|over|under)\b/gi, ' ')
    .replace(/[+-]?\d+(\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 과거 베팅 전체에서 고유한 팀 이름 후보를 뽑아 최근 사용순으로 정렬
export function buildTeamCandidates(bets: { match: string; bet_date: string }[]): TeamCandidate[] {
  const map = new Map<string, string>()
  for (const b of bets) {
    const name = extractTeamCandidate(b.match)
    if (!name) continue
    const prev = map.get(name)
    if (!prev || b.bet_date > prev) map.set(name, b.bet_date)
  }
  return Array.from(map.entries())
    .map(([name, lastDate]) => ({ name, lastDate }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

// 입력값을 포함하는 팀 이름 후보를 최대 limit개 반환 (자동완성 드롭다운용)
export function suggestTeamCandidates(query: string, candidates: TeamCandidate[], limit = 8): string[] {
  const q = query.trim()
  if (!q) return []
  const out: string[] = []
  for (const c of candidates) {
    if (c.name.includes(q)) out.push(c.name)
    if (out.length >= limit) break
  }
  return out
}

// 입력된 팀 이름(문자열 포함 여부)으로 과거 베팅을 찾아 최근 성적/연승연패/종목을 계산
export function getTeamInsight(query: string, bets: BetLite[], recentN = 10): TeamInsight | null {
  const q = query.trim()
  if (!q) return null
  const matched = [...bets]
    .filter(b => b.match.includes(q))
    .sort((a, b) => (b.bet_date + b.created_at).localeCompare(a.bet_date + a.created_at))
  if (!matched.length) return null

  const settled = matched.filter(b => b.result !== 'pending')
  if (!settled.length) {
    return { sport: matched[0].sport, recentN: 0, wins: 0, losses: 0, pushes: 0, profit: 0, streakType: null, streakCount: 0, totalSettled: 0 }
  }

  const recent = settled.slice(0, recentN)
  const wins = recent.filter(b => b.result === 'win').length
  const losses = recent.filter(b => b.result === 'loss').length
  const pushes = recent.filter(b => b.result === 'push').length
  const profit = recent.reduce((s, b) => s + b.profit, 0)

  let streakType: 'win' | 'loss' | null = null
  let streakCount = 0
  for (const b of settled) {
    if (b.result !== 'win' && b.result !== 'loss') break
    if (streakType === null) { streakType = b.result as 'win' | 'loss'; streakCount = 1 }
    else if (b.result === streakType) streakCount++
    else break
  }

  return { sport: matched[0].sport, recentN: recent.length, wins, losses, pushes, profit, streakType, streakCount, totalSettled: settled.length }
}

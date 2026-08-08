// ─── 완료된 LoL 경기 결과 + 세트별 상세 통계 (분석 탭 전용) ─────────────
// 두 개의 Riot 공식 API를 쓴다:
//   1) esports-api.lolesports.com  — 일정/최종 스코어 (getSchedule)
//   2) feed.lolesports.com/livestats — 세트 하나의 시간대별 스냅샷(킬/오브젝트/골드 등, getWindow)
// livestats는 원래 "라이브 관전용"이라 커버리지가 리그마다 다르고, 오래된 경기는 사라질 수 있다.
// 그래서 상세 통계 커버리지가 확실히 좋은 리그(LCK/LPL/LEC/LCS)만 지원 대상으로 하고,
// 그 안에서도 상세 통계 호출이 실패하면 최종 스코어만 보여주고 조용히 넘어간다(에러로 막지 않음).

const ESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw'
const LIVESTATS_API = 'https://feed.lolesports.com/livestats/v1'
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'

export const SUPPORTED_LEAGUES: { code: string; label: string; slugs: string[] }[] = [
  { code: 'LCK', label: 'LCK', slugs: ['lck'] },
  { code: 'LPL', label: 'LPL', slugs: ['lpl'] },
  { code: 'LEC', label: 'LEC', slugs: ['lec'] },
  { code: 'LCS', label: 'LCS', slugs: ['lcs'] },
]

export interface CompletedMatch {
  id: string
  league: string
  leagueLabel: string
  startTime: string
  bestOf: number
  teamA: string; teamACode?: string; scoreA: number
  teamB: string; teamBCode?: string; scoreB: number
}

export interface TeamGameStats {
  kills: number; towers: number; inhibitors: number; barons: number
  dragons: number; dragonTypes: string[]
  totalGold: number
}
export interface GameDetailStats {
  gameNumber: number
  durationSeconds: number | null
  teamA: TeamGameStats
  teamB: TeamGameStats
}

let leagueIdCache: Record<string, string> | null = null
async function resolveLeagueIds(): Promise<Record<string, string>> {
  if (leagueIdCache) return leagueIdCache
  const res = await fetch(`${ESPORTS_API}/getLeagues?hl=en-US`, { headers: { 'x-api-key': API_KEY } })
  if (!res.ok) throw new Error(`getLeagues failed (HTTP ${res.status})`)
  const json = await res.json()
  const leagues: { id: string; slug: string }[] = json?.data?.leagues ?? []
  const map: Record<string, string> = {}
  for (const l of SUPPORTED_LEAGUES) {
    const found = leagues.find(x => l.slugs.includes(x.slug))
    if (found) map[l.code] = found.id
  }
  leagueIdCache = map
  return map
}

// 지정한 리그의 최근 완료 경기(최대 days일 전까지)를 가져온다. 기본 페이지로 부족하면 "older" 방향으로 몇 페이지 더 넘긴다.
export async function fetchRecentCompletedMatches(leagueCode: string, days = 7): Promise<CompletedMatch[]> {
  const ids = await resolveLeagueIds()
  const leagueId = ids[leagueCode]
  if (!leagueId) return []
  const meta = SUPPORTED_LEAGUES.find(l => l.code === leagueCode)!
  const cutoff = Date.now() - days * 86400000

  const results: CompletedMatch[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 4; page++) {
    const url = pageToken
      ? `${ESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}&pageToken=${pageToken}`
      : `${ESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}`
    const res = await fetch(url, { headers: { 'x-api-key': API_KEY } })
    if (!res.ok) break
    const json = await res.json()
    const events: any[] = json?.data?.schedule?.events ?? []
    let sawWithinRange = false
    for (const e of events) {
      if (e.state !== 'completed') continue
      const t = new Date(e.startTime).getTime()
      if (t < cutoff) continue
      sawWithinRange = true
      const teams = e.match?.teams ?? []
      if (teams.length < 2) continue
      results.push({
        id: e.match?.id ?? e.id,
        league: leagueCode, leagueLabel: meta.label,
        startTime: e.startTime,
        bestOf: e.match?.strategy?.count ?? 3,
        teamA: teams[0]?.name || '?', teamACode: teams[0]?.code, scoreA: teams[0]?.result?.gameWins ?? 0,
        teamB: teams[1]?.name || '?', teamBCode: teams[1]?.code, scoreB: teams[1]?.result?.gameWins ?? 0,
      })
    }
    // 오래된 방향(older) 페이지 — 지정 기간을 다 못 채웠으면 계속 따라간다
    const older = json?.data?.schedule?.pages?.older
    if (!older || (!sawWithinRange && page > 0)) break
    pageToken = older
  }
  results.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  return results
}

// 경기(시리즈) 하나의 세트별 game id 목록을 가져온다. getSchedule 응답엔 이 정보가 없어서,
// 경기 상세 전용 엔드포인트(getEventDetails)를 따로 불러야 한다 — 그래서 목록을 펼칠 때(lazy) 호출한다.
export async function fetchEventGames(matchId: string): Promise<{ id: string; number: number; state: string }[]> {
  try {
    const res = await fetch(`${ESPORTS_API}/getEventDetails?hl=en-US&id=${matchId}`, { headers: { 'x-api-key': API_KEY } })
    if (!res.ok) return []
    const json = await res.json()
    const games: any[] = json?.data?.event?.match?.games ?? []
    return games.map(g => ({ id: String(g.id), number: g.number ?? 0, state: g.state }))
  } catch { return [] }
}

// 세트 하나(gameId)의 최종 팀 스탯(킬/타워/억제기/내셔/드래곤/골드)을 livestats에서 가져온다.
// 이 API는 라이브 관전용이라 커버리지가 일정하지 않다 — 실패하거나 데이터가 없으면 null을 반환하고,
// 호출 쪽에서 "상세 통계 없음"으로 처리한다(에러를 던지지 않음).
export async function fetchGameDetailStats(gameId: string): Promise<GameDetailStats | null> {
  try {
    const res = await fetch(`${LIVESTATS_API}/window/${gameId}`)
    if (!res.ok) return null
    const json = await res.json()
    const frames: any[] = json?.frames ?? []
    if (frames.length === 0) return null
    const last = frames[frames.length - 1]
    const blue = last?.blueTeam
    const red = last?.redTeam
    if (!blue || !red) return null
    const toStats = (t: any): TeamGameStats => ({
      kills: t.totalKills ?? 0,
      towers: t.towers ?? 0,
      inhibitors: t.inhibitors ?? 0,
      barons: t.barons ?? 0,
      dragons: Array.isArray(t.dragons) ? t.dragons.length : 0,
      dragonTypes: Array.isArray(t.dragons) ? t.dragons : [],
      totalGold: t.totalGold ?? 0,
    })
    const startMs = new Date(frames[0]?.rfc460Timestamp).getTime()
    const endMs = new Date(last?.rfc460Timestamp).getTime()
    return {
      gameNumber: 0, // 호출 쪽에서 채움
      durationSeconds: isFinite(startMs) && isFinite(endMs) ? Math.round((endMs - startMs) / 1000) : null,
      teamA: toStats(blue), teamB: toStats(red),
    }
  } catch { return null }
}

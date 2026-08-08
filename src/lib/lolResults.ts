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
  raw?: unknown // 디버그용: livestats 원본 응답(마지막 프레임). 화면에서 "원본 보기"로 확인 가능.
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

// 지정한 리그의 지금 라이브로 진행 중인 경기(있으면)를 가져온다.
// livestats API에 애초에 데이터가 있는지 없는지를 확인하는 가장 확실한 방법 — 라이브 경기는
// 지금 중계되고 있는 게 확실하니 데이터가 없을 수 없다(완료된 지 오래된 경기는 만료돼서 사라질 수 있음).
export async function fetchLiveMatch(leagueCode: string): Promise<CompletedMatch | null> {
  const ids = await resolveLeagueIds()
  const leagueId = ids[leagueCode]
  if (!leagueId) return null
  const meta = SUPPORTED_LEAGUES.find(l => l.code === leagueCode)!
  const res = await fetch(`${ESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}`, { headers: { 'x-api-key': API_KEY } })
  if (!res.ok) return null
  const json = await res.json()
  const events: any[] = json?.data?.schedule?.events ?? []
  const live = events.find(e => e.state === 'inProgress')
  if (!live) return null
  const teams = live.match?.teams ?? []
  if (teams.length < 2) return null
  return {
    id: live.match?.id ?? live.id,
    league: leagueCode, leagueLabel: meta.label,
    startTime: live.startTime,
    bestOf: live.match?.strategy?.count ?? 3,
    teamA: teams[0]?.name || '?', teamACode: teams[0]?.code, scoreA: teams[0]?.result?.gameWins ?? 0,
    teamB: teams[1]?.name || '?', teamBCode: teams[1]?.code, scoreB: teams[1]?.result?.gameWins ?? 0,
  }
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
// 이 API는 startingTime을 안 주면 "기록이 시작되는 맨 처음"(로딩/밴픽 직후, 전부 0)부터 10개씩 끊어서
// 준다는 걸 실제 응답으로 확인했다 — 그래서 마지막 프레임의 시각을 다음 요청의 startingTime으로 계속
// 밀어가며(페이지네이션) gameState가 더 이상 "in_game"이 아니게 되거나(경기 종료) 더 진행이 안 될 때까지
// 따라간 뒤, 마지막으로 얻은 프레임을 "최종 스탯"으로 쓴다.
// 여전히 커버리지가 일정하지 않을 수 있어서, 실패하거나 데이터가 없으면 null을 반환하고
// 호출 쪽에서 "상세 통계 없음"으로 처리한다(에러를 던지지 않음).
export async function fetchGameDetailStats(gameId: string): Promise<GameDetailStats | null> {
  let startingTime: string | undefined
  let frames: any[] = []
  let firstEverFrame: any = null
  const seenTimestamps = new Set<string>()
  let prevTsMs: number | null = null
  let stallCount = 0
  try {
    for (let iter = 0; iter < 50; iter++) {
      const url = startingTime
        ? `${LIVESTATS_API}/window/${gameId}?startingTime=${encodeURIComponent(startingTime)}`
        : `${LIVESTATS_API}/window/${gameId}`
      const res = await fetch(url)
      if (!res.ok) { if (iter === 0) console.warn(`[lolResults] window/${gameId}: HTTP ${res.status}`); break }
      const json = await res.json()
      const batch: any[] = json?.frames ?? []
      if (iter === 0) console.info(`[lolResults] window/${gameId} 첫 응답:`, json)
      if (batch.length === 0) break // 이 이상은 데이터가 없다는 뜻 -> 지금까지 모은 frames를 최종으로 씀
      if (!firstEverFrame) firstEverFrame = batch[0]
      frames = batch
      const last = batch[batch.length - 1]
      if (last?.gameState && last.gameState !== 'in_game') break // 경기 종료 상태 도달 -> 여기서 멈춤
      const lastTs = last?.rfc460Timestamp
      if (!lastTs || seenTimestamps.has(lastTs)) break // 더 진행이 안 되면(같은 시각 반복) 무한루프 방지로 중단
      seenTimestamps.add(lastTs)

      // 초반(로딩/밴픽 단계)엔 프레임 간격이 극도로 촘촘해서(실제로 확인된 사례: 10개가 19ms 안에 다 몰림)
      // 매번 마지막 시각으로만 전진하면 사실상 제자리걸음이 된다. 그래서 진행이 2초 미만으로 3번
      // 연속 정체되면 30초씩 강제로 앞으로 점프해서 그 구간을 빠르게 빠져나간다.
      const lastTsMs = new Date(lastTs).getTime()
      if (prevTsMs != null && lastTsMs - prevTsMs < 2000) stallCount++
      else stallCount = 0
      prevTsMs = lastTsMs
      startingTime = stallCount >= 3 ? new Date(lastTsMs + 30_000).toISOString() : lastTs
    }
  } catch (err) { console.warn(`[lolResults] window/${gameId}: 호출 실패`, err); return null }

  if (frames.length === 0) { console.warn(`[lolResults] window/${gameId}: frames 없음`); return null }
  const last = frames[frames.length - 1]
  const blue = last?.blueTeam
  const red = last?.redTeam
  if (!blue || !red) { console.warn(`[lolResults] window/${gameId}: blueTeam/redTeam 없음 -`, last); return null }
  const toStats = (t: any): TeamGameStats => ({
    kills: t.totalKills ?? 0,
    towers: t.towers ?? 0,
    inhibitors: t.inhibitors ?? 0,
    barons: t.barons ?? 0,
    dragons: Array.isArray(t.dragons) ? t.dragons.length : 0,
    dragonTypes: Array.isArray(t.dragons) ? t.dragons : [],
    totalGold: t.totalGold ?? 0,
  })
  const startMs = new Date(firstEverFrame?.rfc460Timestamp).getTime()
  const endMs = new Date(last?.rfc460Timestamp).getTime()
  return {
    gameNumber: 0, // 호출 쪽에서 채움
    durationSeconds: isFinite(startMs) && isFinite(endMs) ? Math.round((endMs - startMs) / 1000) : null,
    teamA: toStats(blue), teamB: toStats(red),
    raw: { finalFrameCount: frames.length, lastFrame: last },
  }
}

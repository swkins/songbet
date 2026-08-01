// ─── LoL e스포츠 일정/전적 조회 + 최근 폼 기반 승부 예측 유틸 ─────────────
// Analysis.tsx(분석 탭)에서 사용한다.
// lolesports 공개 API로 리그별 일정(과거 결과 + 예정 경기)을 가져오고,
// 팀 단위로 필터링해 최근 전적 · 다음 일정 · 세트(맵) 스코어 확률 분포를 계산한다.

import dayjs from 'dayjs'

export const LEAGUES: { code: string; label: string; slugs: string[] }[] = [
  { code: 'LCK',   label: 'LCK',   slugs: ['lck'] },
  { code: 'LPL',   label: 'LPL',   slugs: ['lpl'] },
  { code: 'LEC',   label: 'LEC',   slugs: ['lec'] },
  { code: 'LCS',   label: 'LCS',   slugs: ['lcs'] },
  { code: 'LCP',   label: 'LCP',   slugs: ['lcp'] },
  { code: 'CBLOL', label: 'CBLOL', slugs: ['cblol', 'cblol-brazil'] },
]

const LOLESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw'
const LOLESPORTS_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'

// getLeagues 응답은 세션 동안 재사용 (요청 절약)
let leagueIdCache: Record<string, string> | null = null

async function resolveLeagueIds(): Promise<Record<string, string>> {
  if (leagueIdCache) return leagueIdCache
  const res = await fetch(`${LOLESPORTS_API}/getLeagues?hl=en-US`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!res.ok) throw new Error('getLeagues failed')
  const json = await res.json()
  const leagues: { id: string; slug: string }[] = json?.data?.leagues ?? []
  const map: Record<string, string> = {}
  for (const l of LEAGUES) {
    const found = leagues.find(x => l.slugs.includes(x.slug))
    if (found) map[l.code] = found.id
  }
  leagueIdCache = map
  return map
}

export interface RawScheduleEvent {
  id: string
  startTime: string
  state: string // 'completed' | 'unstarted' | 'inProgress'
  blockName?: string
  match?: {
    id: string
    strategy?: { type: string; count: number }
    teams: { name: string; code?: string; result?: { gameWins: number } }[]
  }
}

interface CacheEntry { events: RawScheduleEvent[]; fetchedAt: number }
const scheduleCache: Record<string, CacheEntry> = {}
const CACHE_TTL_MS = 3 * 60 * 1000
const FETCH_PAGES = 3 // 최근 폼 계산에 쓸 만큼 과거 경기를 충분히 확보하기 위해 여러 페이지를 이어붙임

// 리그 일정(완료 + 예정 경기)을 페이지네이션으로 모아서 반환. TTL 캐시 적용.
export async function fetchScheduleEvents(leagueCode: string, opts?: { forceRefresh?: boolean }): Promise<RawScheduleEvent[]> {
  const cached = scheduleCache[leagueCode]
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.events
  }
  const ids = await resolveLeagueIds()
  const leagueId = ids[leagueCode]
  if (!leagueId) throw new Error('league id not found')

  let events: RawScheduleEvent[] = []
  let pageToken: string | undefined
  for (let i = 0; i < FETCH_PAGES; i++) {
    const url = pageToken
      ? `${LOLESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}&pageToken=${pageToken}`
      : `${LOLESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}`
    const res = await fetch(url, { headers: { 'x-api-key': LOLESPORTS_KEY } })
    if (!res.ok) break
    const json = await res.json()
    const pageEvents: RawScheduleEvent[] = json?.data?.schedule?.events ?? []
    events = events.concat(pageEvents)
    pageToken = json?.data?.schedule?.pages?.older
    if (!pageToken) break
  }

  // match id 기준 중복 제거 (페이지 경계에서 겹치는 경우가 있음)
  const seen = new Set<string>()
  const dedup: RawScheduleEvent[] = []
  for (const e of events) {
    const key = e.match?.id ?? e.id
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(e)
  }
  scheduleCache[leagueCode] = { events: dedup, fetchedAt: Date.now() }
  return dedup
}

export interface MatchResult {
  id: string
  startTime: string
  teamA: string; teamB: string
  scoreA: number; scoreB: number
}

// 리그 전체 최근 완료 경기 목록 (리그 화면 상단 "최근 경기" 카드용)
export async function fetchRecentMatches(leagueCode: string): Promise<MatchResult[]> {
  const events = await fetchScheduleEvents(leagueCode)
  return events
    .filter(e => e.state === 'completed' && e.match)
    .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
    .slice(0, 8)
    .map(e => {
      const teams = e.match!.teams ?? []
      return {
        id: e.match!.id ?? e.startTime,
        startTime: e.startTime,
        teamA: teams[0]?.name ?? '?', teamB: teams[1]?.name ?? '?',
        scoreA: teams[0]?.result?.gameWins ?? 0, scoreB: teams[1]?.result?.gameWins ?? 0,
      }
    })
}

export function teamNameMatches(t: { name: string; code?: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const n = (t.name ?? '').trim().toLowerCase()
  const c = (t.code ?? '').trim().toLowerCase()
  if (!n && !c) return false
  return n === q || c === q || n.includes(q) || q.includes(n)
}

export interface TeamGameRecord { opponent: string; teamScore: number; oppScore: number; startTime: string; bestOf: number }
export interface TeamUpcomingMatch { matchId: string; opponent: string; startTime: string; bestOf: number; blockName?: string }

// 특정 팀 이름으로 리그 전체 일정을 필터링해 완료 경기 / 예정 경기로 분리
export function extractTeamData(events: RawScheduleEvent[], teamQuery: string): { completed: TeamGameRecord[]; upcoming: TeamUpcomingMatch[] } {
  const completed: TeamGameRecord[] = []
  const upcoming: TeamUpcomingMatch[] = []
  for (const e of events) {
    const teams = e.match?.teams ?? []
    if (teams.length < 2) continue
    const idx = teams.findIndex(t => teamNameMatches(t, teamQuery))
    if (idx === -1) continue
    const opp = teams[1 - idx]
    const bestOf = e.match?.strategy?.count ?? 3
    if (e.state === 'completed') {
      completed.push({
        opponent: opp?.name ?? '?',
        teamScore: teams[idx]?.result?.gameWins ?? 0,
        oppScore: opp?.result?.gameWins ?? 0,
        startTime: e.startTime,
        bestOf,
      })
    } else if (e.state === 'unstarted') {
      upcoming.push({
        matchId: e.match?.id ?? e.id,
        opponent: opp?.name ?? '?',
        startTime: e.startTime,
        bestOf,
        blockName: e.blockName,
      })
    }
  }
  completed.sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
  upcoming.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
  return { completed, upcoming }
}

export interface FormStats {
  gameWinRate: number   // 세트(맵) 단위 승률
  seriesWinRate: number // 시리즈(매치) 단위 승률
  seriesPlayed: number
  gamesPlayed: number
  wins: number
  losses: number
}

// 최근 N개 시리즈 기록으로 폼 계산 (세트 승률 60% + 시리즈 승률 40% 가중 결합에 사용)
export function computeForm(records: TeamGameRecord[]): FormStats {
  if (records.length === 0) {
    return { gameWinRate: 0.5, seriesWinRate: 0.5, seriesPlayed: 0, gamesPlayed: 0, wins: 0, losses: 0 }
  }
  let gameWins = 0, gamesPlayed = 0, seriesWins = 0
  for (const r of records) {
    gameWins += r.teamScore
    gamesPlayed += r.teamScore + r.oppScore
    if (r.teamScore > r.oppScore) seriesWins++
  }
  return {
    gameWinRate: gamesPlayed > 0 ? gameWins / gamesPlayed : 0.5,
    seriesWinRate: seriesWins / records.length,
    seriesPlayed: records.length,
    gamesPlayed,
    wins: seriesWins,
    losses: records.length - seriesWins,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// 두 팀의 최근 폼을 비교해 "한 세트(맵)를 이길 확률"을 추정
// (세트 승률과 시리즈 승률을 가중 결합한 값의 상대적 차이를 0.5 기준으로 보정)
export function matchupProbability(formA: FormStats, formB: FormStats): number {
  const combinedA = formA.seriesPlayed > 0 ? 0.6 * formA.gameWinRate + 0.4 * formA.seriesWinRate : 0.5
  const combinedB = formB.seriesPlayed > 0 ? 0.6 * formB.gameWinRate + 0.4 * formB.seriesWinRate : 0.5
  const raw = 0.5 + (combinedA - combinedB)
  return clamp(raw, 0.08, 0.92)
}

function nCr(n: number, r: number): number {
  if (r < 0 || r > n) return 0
  let result = 1
  for (let i = 0; i < r; i++) result = (result * (n - i)) / (i + 1)
  return result
}

export interface ScoreProb { score: string; winner: 'A' | 'B'; prob: number }

// bestOf(1/3/5...)와 세트 승률 p(A가 한 세트를 이길 확률)로 시리즈 스코어 확률 분포 계산
// (음이항분포: P(k승 m패로 종료) = C(k-1+m, m) * p^k * (1-p)^m)
export function seriesScoreProbabilities(p: number, bestOf: number): ScoreProb[] {
  const bo = bestOf && bestOf > 1 ? bestOf : 1
  if (bo === 1) {
    return [
      { score: '1:0', winner: 'A', prob: p },
      { score: '0:1', winner: 'B', prob: 1 - p },
    ]
  }
  const k = Math.ceil(bo / 2)
  const out: ScoreProb[] = []
  for (let m = 0; m < k; m++) {
    const comb = nCr(k - 1 + m, m)
    out.push({ score: `${k}:${m}`, winner: 'A', prob: comb * Math.pow(p, k) * Math.pow(1 - p, m) })
    out.push({ score: `${m}:${k}`, winner: 'B', prob: comb * Math.pow(1 - p, k) * Math.pow(p, m) })
  }
  return out.sort((a, b) => b.prob - a.prob)
}

// ─── 팀 로스터 (getTeams) ─────────────────────────────────────────
// lolesports API는 국적/입단일/계약기간을 제공하지 않는다 (선수 ID·실명·포지션만 제공).
// 국적/계약 정보는 esports_roster 테이블의 별도 컬럼에 사용자가 직접 입력해 관리한다.
export interface RawPlayer { id: string; summonerName: string; firstName?: string; lastName?: string; image?: string; role?: string }
export interface RawTeam { code: string; image?: string; name: string; id: string; slug: string; players: RawPlayer[] }

interface TeamsCacheEntry { teams: RawTeam[]; fetchedAt: number }
const teamsCache: Record<string, TeamsCacheEntry> = {}

export async function fetchLeagueTeams(leagueCode: string, opts?: { forceRefresh?: boolean }): Promise<RawTeam[]> {
  const cached = teamsCache[leagueCode]
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.teams
  const ids = await resolveLeagueIds()
  const leagueId = ids[leagueCode]
  if (!leagueId) throw new Error('league id not found')
  const res = await fetch(`${LOLESPORTS_API}/getTeams?hl=en-US&id=${leagueId}`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!res.ok) throw new Error('getTeams failed')
  const json = await res.json()
  const teams: RawTeam[] = json?.data?.teams ?? []
  teamsCache[leagueCode] = { teams, fetchedAt: Date.now() }
  return teams
}

// ─── 리그 순위 (getTournamentsForLeague → getStandings) ─────────────
export interface StandingEntry { code: string; name: string; wins: number; losses: number; ordinal: number }

interface StandingsCacheEntry { standings: StandingEntry[]; fetchedAt: number }
const standingsCache: Record<string, StandingsCacheEntry> = {}

export async function fetchStandings(leagueCode: string, opts?: { forceRefresh?: boolean }): Promise<StandingEntry[]> {
  const cached = standingsCache[leagueCode]
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.standings
  const ids = await resolveLeagueIds()
  const leagueId = ids[leagueCode]
  if (!leagueId) throw new Error('league id not found')

  const tRes = await fetch(`${LOLESPORTS_API}/getTournamentsForLeague?hl=en-US&leagueId=${leagueId}`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!tRes.ok) throw new Error('getTournamentsForLeague failed')
  const tJson = await tRes.json()
  const tournaments: { id: string; startDate: string; endDate: string }[] = tJson?.data?.leagues?.[0]?.tournaments ?? []
  if (tournaments.length === 0) {
    standingsCache[leagueCode] = { standings: [], fetchedAt: Date.now() }
    return []
  }
  const now = dayjs()
  let tournament = tournaments.find(t => dayjs(t.startDate).isBefore(now) && dayjs(t.endDate).isAfter(now))
  if (!tournament) {
    tournament = [...tournaments].sort((a, b) => dayjs(b.endDate).valueOf() - dayjs(a.endDate).valueOf())[0]
  }

  const sRes = await fetch(`${LOLESPORTS_API}/getStandings?hl=en-US&tournamentId=${tournament.id}`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!sRes.ok) throw new Error('getStandings failed')
  const sJson = await sRes.json()
  const stages: any[] = sJson?.data?.standings?.[0]?.stages ?? []
  const lastStage = stages[stages.length - 1]
  const rankingsRaw: any[] = lastStage?.sections?.flatMap((sec: any) => sec.rankings ?? []) ?? []
  const out: StandingEntry[] = []
  for (const r of rankingsRaw) {
    for (const t of r.teams ?? []) {
      out.push({ code: t.code ?? '', name: t.name ?? '', wins: t.record?.wins ?? 0, losses: t.record?.losses ?? 0, ordinal: r.ordinal ?? 0 })
    }
  }
  out.sort((a, b) => a.ordinal - b.ordinal)
  standingsCache[leagueCode] = { standings: out, fetchedAt: Date.now() }
  return out
}

// 일정 데이터 안에서 팀의 게임 내 약자(code)를 찾음 (예: KIWOOM DRX → DRX, Ground Zero → GZ)
export function findTeamCode(events: RawScheduleEvent[], teamQuery: string): string | null {
  for (const e of events) {
    const teams = e.match?.teams ?? []
    const found = teams.find(t => teamNameMatches(t, teamQuery))
    if (found?.code) return found.code
  }
  return null
}

export interface OddsValue { impliedProb: number; ev: number; edgePct: number; isValue: boolean }

// 배당 대비 기대값(EV) 계산. EV > 0 이면 모델 확률 기준 "베팅 가치 있음"
export function computeOddsValue(modelProb: number, decimalOdds: number): OddsValue | null {
  if (!decimalOdds || !isFinite(decimalOdds) || decimalOdds <= 1) return null
  const impliedProb = 1 / decimalOdds
  const ev = modelProb * decimalOdds - 1
  const edgePct = (modelProb - impliedProb) * 100
  return { impliedProb, ev, edgePct, isValue: ev > 0.001 }
}

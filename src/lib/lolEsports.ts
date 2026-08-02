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

// 최근 N일 이내의 경기만 필터 (기본 30일 = 최근 한 달 폼 계산용)
export function filterRecentGames(records: TeamGameRecord[], days = 30): TeamGameRecord[] {
  const cutoff = dayjs().subtract(days, 'day')
  return records.filter(r => dayjs(r.startTime).isAfter(cutoff))
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

// ─── 세트 흐름 판정 (완벽한 승리 / 리드 지킨 승리 / 역전승 / 박빙·후반장악) ───
export type NarrativeTeam = 'team1' | 'team2'

export interface GameStatsInput {
  team1Kills: number; team2Kills: number
  team1Dragons: number; team2Dragons: number
  team1Towers: number; team2Towers: number
  team1Inhibitors: number; team2Inhibitors: number
  team1Barons: number; team2Barons: number
  winnerTeam: NarrativeTeam
  firstBloodTeam?: NarrativeTeam | null
  firstTowerTeam?: NarrativeTeam | null
  firstDragonTeam?: NarrativeTeam | null
  firstBaronTeam?: NarrativeTeam | null
  fifthKillTeam?: NarrativeTeam | null
  tenthKillTeam?: NarrativeTeam | null
  durationSeconds?: number | null // 있으면 "완벽한 승리" 판정에 게임 길이를 반영 (짧을수록 완벽승 인정, 길수록 엄격해짐)
}

export interface GameNarrative {
  label: string
  detail: string
  earlyLeader: NarrativeTeam | 'even' | null
  dominanceScore: number // 승자 관점 최종 격차 점수 (클수록 압도적)
}

// 초반 마일스톤(첫 킬/첫 타워/첫 내셔/5킬·10킬 선취) + 최종 오브젝트 격차 + 게임 길이를 함께 봐서
// "완벽한 승리 / 리드를 지킨 승리 / 역전승 / 박빙·후반장악"으로 분류.
// 완벽한 승리는 "모든 게 다 맞아떨어져야 빨리 끝난다"는 전제로, 게임이 길어질수록 기준을 엄격하게 잡고
// 40분 이상이면 격차가 아무리 커도 완벽한 승리로 보지 않는다 (그만큼 저항이 있었다는 뜻이므로).
export function classifyGameNarrative(g: GameStatsInput): GameNarrative {
  const loser: NarrativeTeam = g.winnerTeam === 'team1' ? 'team2' : 'team1'

  const milestones = [g.firstBloodTeam, g.firstTowerTeam, g.firstDragonTeam, g.firstBaronTeam, g.fifthKillTeam, g.tenthKillTeam]
  let team1Early = 0, team2Early = 0
  for (const m of milestones) {
    if (m === 'team1') team1Early++
    else if (m === 'team2') team2Early++
  }
  const totalMarked = team1Early + team2Early
  let earlyLeader: NarrativeTeam | 'even' | null = null
  if (totalMarked > 0) {
    earlyLeader = team1Early > team2Early ? 'team1' : team2Early > team1Early ? 'team2' : 'even'
  }

  const sign = g.winnerTeam === 'team1' ? 1 : -1
  const killsDiff = sign * (g.team1Kills - g.team2Kills)
  const dragonsDiff = sign * (g.team1Dragons - g.team2Dragons)
  const towersDiff = sign * (g.team1Towers - g.team2Towers)
  const inhibsDiff = sign * (g.team1Inhibitors - g.team2Inhibitors)
  const baronsDiff = sign * (g.team1Barons - g.team2Barons)
  const dominanceScore = killsDiff * 1 + dragonsDiff * 1.5 + towersDiff * 1.2 + inhibsDiff * 2.5 + baronsDiff * 3

  const winnerHadEarlyLead = earlyLeader === g.winnerTeam
  const loserHadEarlyLead = earlyLeader === loser

  // 게임 길이에 따라 "완벽한 승리" 문턱값을 동적으로 조정. 짧을수록 관대하게, 길수록 엄격하게.
  const durationMin = g.durationSeconds != null ? g.durationSeconds / 60 : null
  let perfectThreshold = 8
  let perfectAllowed = true
  if (durationMin != null) {
    if (durationMin <= 26) perfectThreshold = 6
    else if (durationMin <= 30) perfectThreshold = 8
    else if (durationMin <= 34) perfectThreshold = 10
    else perfectThreshold = 14 // 34~40분: 사실상 웬만한 격차로는 안 뜨게
    if (durationMin >= 40) perfectAllowed = false // 40분 이상은 격차가 아무리 커도 완벽승 아님
  }

  let label: string, detail: string
  if (loserHadEarlyLead) {
    label = '역전승'
    detail = '초반 주요 지표(첫 킬·첫 타워·첫 드래곤·첫 내셔·5킬/10킬 선취)에서는 패배팀이 앞섰지만, 최종적으로는 승리팀이 뒤집었습니다.'
  } else if (winnerHadEarlyLead && dominanceScore >= perfectThreshold && perfectAllowed) {
    label = '완벽한 승리'
    detail = durationMin != null
      ? `초반 마일스톤과 최종 오브젝트·킬 격차 모두에서 일방적으로 앞섰고, ${Math.round(durationMin)}분 만에 빠르게 끝낸 스타트-투-피니시 승리입니다.`
      : '초반 마일스톤과 최종 오브젝트·킬 격차 모두에서 일방적으로 앞선 스타트-투-피니시 승리입니다.'
  } else if (winnerHadEarlyLead) {
    label = '리드를 지킨 승리'
    detail = durationMin != null && durationMin >= 34
      ? `초반 주도권은 잡았지만 게임이 ${Math.round(durationMin)}분까지 길어진 걸 보면 상대의 저항이 만만치 않았습니다.`
      : '초반 주도권을 잡은 뒤 큰 흔들림 없이 승리로 연결했습니다.'
  } else if (earlyLeader === 'even' || earlyLeader === null) {
    label = dominanceScore >= 8 ? '후반 장악승' : '박빙의 승리'
    detail = dominanceScore >= 8
      ? '초반은 팽팽했지만 중후반 오브젝트 싸움에서 확실히 앞서며 승리했습니다.'
      : '초반부터 끝까지 큰 격차 없이 접전 끝에 승리했습니다.'
  } else {
    label = '박빙의 승리'
    detail = '초반과 최종 스탯 모두 큰 차이가 없는 접전이었습니다.'
  }

  return { label, detail, earlyLeader, dominanceScore }
}

// ─── 세트 상세 스코어 (라인전/오브젝트/한타/운영/스노볼/마무리) ─────────
// 주의: 골드 그래프·분당 타임스탬프가 없는 상태에서의 근사치다.
// "라인전"과 "한타"를 완벽히 분리할 수단이 없어 초반 마일스톤(퍼스트 킬/5킬선취)을
// 라인전 대리지표로, 분당 킬 격차를 한타 대리지표로 쓰는 식의 근사임을 전제로 한다.
export interface DetailedGameScores {
  laning: number          // 라인전 (0~10)
  objectiveControl: number // 오브젝트 컨트롤 (0~10)
  teamfight: number        // 한타능력 (0~10)
  macro: number            // 운영능력 (0~10)
  snowball: number         // 스노볼 (0~10)
  closing: number          // 마무리능력 (0~10)
}

export function computeDetailedScores(g: GameStatsInput & { durationSeconds?: number | null }): DetailedGameScores {
  const clamp10 = (v: number) => Math.max(0, Math.min(10, v))
  const pt = (m?: NarrativeTeam | null) => m === 'team1' ? 1 : m === 'team2' ? -1 : 0
  const sign = g.winnerTeam === 'team1' ? 1 : -1
  const durationMin = g.durationSeconds ? g.durationSeconds / 60 : 30

  const killDiff = g.team1Kills - g.team2Kills
  const towerDiff = g.team1Towers - g.team2Towers
  const dragonDiff = g.team1Dragons - g.team2Dragons
  const baronDiff = g.team1Barons - g.team2Barons
  const inhibDiff = g.team1Inhibitors - g.team2Inhibitors

  // 라인전: 퍼스트 블러드 + 5킬 선취(초반 지표), 첫 타워는 약하게 반영
  const laning = clamp10(5 + pt(g.firstBloodTeam) * 2 + pt(g.fifthKillTeam) * 2.5 + pt(g.firstTowerTeam) * 0.5)

  // 오브젝트 컨트롤: 드래곤/바론 실제 획득 격차 + 퍼스트 드래곤/바론
  const objectiveControl = clamp10(5 + dragonDiff * 0.8 + baronDiff * 1.3 + pt(g.firstDragonTeam) * 0.6 + pt(g.firstBaronTeam) * 0.6)

  // 한타능력: 분당 킬 격차(교전 효율) + 10킬 선취(중반 교전 주도권)
  const teamfight = clamp10(5 + (killDiff / Math.max(durationMin, 10)) * 8 + pt(g.tenthKillTeam) * 1)

  // 운영능력: 타워/억제기 격차 (라인전보다 한 단계 넓은 맵 장악력)
  const macro = clamp10(5 + towerDiff * 0.45 + inhibDiff * 1.1)

  // 스노볼: 초반 마일스톤을 얼마나 쥐었는지 + 최종 격차 크기 - (게임이 길어질수록 스노볼 약화로 간주)
  const earlyLeadCount = pt(g.firstBloodTeam) + pt(g.firstTowerTeam) + pt(g.firstDragonTeam)
  const gapMagnitude = Math.abs(towerDiff) * 0.4 + Math.abs(dragonDiff) * 0.6 + Math.abs(baronDiff) * 1
  const durationPenalty = durationMin > 33 ? 1.5 : durationMin < 24 ? -0.5 : 0
  const snowball = clamp10(5 + sign * (earlyLeadCount * 1 + gapMagnitude * 0.5 - durationPenalty))

  // 마무리능력: classifyGameNarrative의 earlyLeader 판정 + 경기시간을 함께 반영.
  // 어떤 케이스든 "짧게 끝낼수록 마무리가 좋다"는 원칙이 일관되게 적용되도록,
  // 25분 이하면 +1, 40분 이상이면 -1, 그 사이는 선형으로 이어지는 시간 보너스를 공통으로 더한다.
  const narrative = classifyGameNarrative(g)
  const loser: NarrativeTeam = g.winnerTeam === 'team1' ? 'team2' : 'team1'
  const iWon = g.winnerTeam === 'team1'
  const loserHadEarlyLead = narrative.earlyLeader === loser
  const iHadEarlyLead = narrative.earlyLeader === 'team1'
  const durationBonus = durationMin == null ? 0
    : durationMin <= 25 ? 1
    : durationMin >= 40 ? -1
    : 1 - (durationMin - 25) * (2 / 15)
  let closing: number
  if (iWon) {
    closing = loserHadEarlyLead ? 9 + durationBonus * 0.5   // 역전승: 이미 최상위권이라 시간 영향은 절반만
      : iHadEarlyLead ? 7 + durationBonus                    // 리드를 끝까지 지킨 승: 시간 영향 그대로
      : 6 + durationBonus                                     // 초반 팽팽했던 승: 시간 영향 그대로
  } else {
    closing = iHadEarlyLead ? 2 - Math.max(0, -durationBonus) * 0.5 // 리드 날림: 오래 끌수록 더 나쁘게
      : 4 // 그냥 진 경우는 "마무리"를 논할 상황이 아니라 시간 무관
  }

  return { laning, objectiveControl, teamfight, macro, snowball, closing: clamp10(closing) }
}

// team1/team2 관점을 뒤집은 입력을 만든다 (양쪽 점수를 각자 시점에서 정확히 계산하기 위함).
// 단순히 10-score로 미러링하지 않는 이유: 마무리능력처럼 클램프/비대칭 로직이 섞인 지표가 있어서
// 각자 관점으로 다시 계산하는 게 더 정확하다.
function swapPerspective(g: GameStatsInput): GameStatsInput {
  const flip = (m?: NarrativeTeam | null): NarrativeTeam | null | undefined =>
    m === 'team1' ? 'team2' : m === 'team2' ? 'team1' : m
  return {
    team1Kills: g.team2Kills, team2Kills: g.team1Kills,
    team1Dragons: g.team2Dragons, team2Dragons: g.team1Dragons,
    team1Towers: g.team2Towers, team2Towers: g.team1Towers,
    team1Inhibitors: g.team2Inhibitors, team2Inhibitors: g.team1Inhibitors,
    team1Barons: g.team2Barons, team2Barons: g.team1Barons,
    winnerTeam: (flip(g.winnerTeam) ?? 'team1') as NarrativeTeam,
    firstBloodTeam: flip(g.firstBloodTeam), firstTowerTeam: flip(g.firstTowerTeam),
    firstDragonTeam: flip(g.firstDragonTeam), firstBaronTeam: flip(g.firstBaronTeam),
    fifthKillTeam: flip(g.fifthKillTeam), tenthKillTeam: flip(g.tenthKillTeam),
    durationSeconds: g.durationSeconds,
  }
}

// 한쪽 관점으로만 보여주지 않고, 양팀 각자 시점에서의 점수를 함께 반환
export function computeBothSidesScores(g: GameStatsInput): { team1: DetailedGameScores; team2: DetailedGameScores } {
  return { team1: computeDetailedScores(g), team2: computeDetailedScores(swapPerspective(g)) }
}

// ─── "플레이 점수" (1~100) ──────────────────────────────────────────
// 경기시간을 "격차 자체를 조절하는 축"으로 삼는다:
//   - 짧게 끝난 경기(20분 이하) → 한쪽이 확실히 압도했다는 뜻이므로 격차를 크게 증폭(×1.6)
//   - 평균 페이스(32분) → 중립(×1.0), 지금까지 계산된 격차를 그대로 반영
//   - 길게 끌린 경기(45분 이상) → 그만큼 접전이었다는 뜻이므로 격차를 크게 압축(×0.5)
// 라인전/오브젝트/교전/운영/마무리 5개 세부지표 합(0~50, 중립값 25)에서 얼마나 벗어났는지를
// "격차의 원재료"로 쓰고, 거기에 위 시간 배율을 곱해서 최종 점수를 50 기준 위아래로 벌리거나 좁힌다.
// 마무리 지표 안에 승/패가 반영돼 있어서 이긴 팀이 진 팀보다 낮게 나오는 경우는 거의 없지만,
// 격차의 "크기"는 이제 순수하게 경기시간이 결정한다.
function durationSpreadMultiplier(durationMin: number): number {
  if (durationMin <= 20) return 1.6
  if (durationMin >= 45) return 0.5
  if (durationMin <= 32) return 1.6 - (durationMin - 20) * (0.6 / 12)  // 20~32분: 1.6 → 1.0
  return 1.0 - (durationMin - 32) * (0.5 / 13)                          // 32~45분: 1.0 → 0.5
}

export function computePerfectionScore(g: GameStatsInput): number {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const durationMin = g.durationSeconds != null ? g.durationSeconds / 60 : 32
  const d = computeDetailedScores(g)
  const sum = d.laning + d.objectiveControl + d.teamfight + d.macro + d.closing // 0~50, 중립=25
  const deviation = sum - 25
  const spread = durationSpreadMultiplier(durationMin)
  return Math.round(clamp(50 + deviation * 2 * spread, 0, 100))
}




export function computeBothSidesPerfection(g: GameStatsInput): { team1: number; team2: number } {
  return { team1: computePerfectionScore(g), team2: computePerfectionScore(swapPerspective(g)) }
}

// ─── 팀 체급 점수 (수동 입력된 최근 경기 기반) ──────────────────────
export interface TeamPowerScore {
  powerScore: number // 0~100
  avgPerfection: number
  winRate: number
  gamesAnalyzed: number // 분석에 사용된 "시리즈"(BO3/BO5 매치) 수
}

// 시간 가중치: 최근 1~2달(60일)은 완만하게 줄고, 그 이후로는 30일마다 절반씩 급격히 줄어든다.
function timeDecayWeight(daysAgo: number): number {
  const d = Math.max(0, daysAgo)
  if (d <= 60) return 1 - 0.3 * (d / 60)
  return 0.7 * Math.pow(0.5, (d - 60) / 30)
}

// 체급 점수는 "개별 세트"가 아니라 "시리즈(매치) 단위"로 계산한다.
// 이유: BO3에서 2-1로 이긴 시리즈는, 중간에 한 세트를 내줬어도 명백히 좋은 결과다.
// 세트 단위로 쪼개서 계산하면 "시리즈는 이겼지만 한 세트를 크게 내준" 경우가
// 독립된 "패배 이변"으로 잘못 카운트되어 체급이 부당하게 깎이는 문제가 있었다.
export interface SeriesRecordForPower {
  winnerTeam: NarrativeTeam    // 시리즈 승자 (세트 다수결)
  avgPerfection: number        // 시리즈 내 세트별 완벽도 점수 평균 (0~100)
  sweep: boolean                // 상대에게 세트를 하나도 안 내준 완전 스윕이었는지
  daysAgo?: number              // 시리즈 이후 지난 일수 (없으면 인덱스로 7일 간격 추정)
  opponentPriorScore?: number   // 상대 팀의 사전(prior) 체급 점수 0~100 (모르면 50=중립)
}

// 1단계: 상대 체급을 고려하지 않고, 순수 실적만으로 매긴 사전 점수.
// "일단 이겨야 체급"이라는 전제로 승률 비중을 완벽도보다 높게 두고, 스윕승(2-0/3-0)에는 추가 보너스를 준다.
// 표본이 적을 때(특히 소수 경기 100% 승률처럼 극단적인 경우) 50점 쪽으로 완화(shrinkage)해서 과대평가를 막는다.
export function computeTeamPriorScore(series: SeriesRecordForPower[]): TeamPowerScore {
  if (series.length === 0) return { powerScore: 50, avgPerfection: 50, winRate: 0.5, gamesAnalyzed: 0 }
  let weightSum = 0, perfectionWeighted = 0, winWeighted = 0, sweepWinWeighted = 0
  series.forEach((r, i) => {
    const w = timeDecayWeight(r.daysAgo ?? i * 7)
    weightSum += w
    perfectionWeighted += r.avgPerfection * w
    const won = r.winnerTeam === 'team1' ? 1 : 0
    winWeighted += won * w
    if (won && r.sweep) sweepWinWeighted += w
  })
  const avgPerfection = perfectionWeighted / weightSum
  const winRate = winWeighted / weightSum
  const sweepWinRate = sweepWinWeighted / weightSum
  // 완벽도 35% + 승률 55% + 스윕승 비율 보너스 10%
  const rawScore = avgPerfection * 0.35 + (winRate * 100) * 0.55 + sweepWinRate * 100 * 0.10
  // 표본 8시리즈 미만이면 50점 쪽으로 당겨서 소수 경기의 극단값을 완화
  const confidence = Math.min(1, series.length / 8)
  const powerScore = 50 + (rawScore - 50) * confidence
  return { powerScore, avgPerfection, winRate, gamesAnalyzed: series.length }
}

// 2단계: 최종 체급 점수 — 이변 보정.
// 상대 사전 점수 대비 기대 승률과 실제 결과의 차이("이변" surprise)만큼 점수를 움직인다.
//   - 체급 낮은 팀이 높은 팀을 시리즈에서 이김(이변) → 크게 상승
//   - 체급 높은 팀이 낮은 팀을 이김(예상대로) → 조금만 상승
//   - 체급 높은 팀이 낮은 팀에게 짐(역이변) → 크게 하락
// 시리즈를 완전 스윕했으면(sweep) 그 시리즈의 영향력을 추가로 더 크게 준다.
export function computeTeamPowerScore(series: SeriesRecordForPower[], myPriorScore = 50): TeamPowerScore {
  if (series.length === 0) return { powerScore: 50, avgPerfection: 50, winRate: 0.5, gamesAnalyzed: 0 }
  const K = 55
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  let weightSum = 0, scoreWeighted = 0, perfectionWeighted = 0, winWeighted = 0
  series.forEach((r, i) => {
    const w = timeDecayWeight(r.daysAgo ?? i * 7)
    weightSum += w
    perfectionWeighted += r.avgPerfection * w
    const actual = r.winnerTeam === 'team1' ? 1 : 0
    winWeighted += actual * w

    const oppPrior = r.opponentPriorScore ?? 50
    const expected = powerScoreMatchupProbability(myPriorScore, oppPrior)
    const surprise = actual - expected
    let marginFactor = 0.5 + Math.abs(r.avgPerfection - 50) / 100
    if (r.sweep) marginFactor += 0.15
    const seriesScore = clamp(50 + surprise * marginFactor * K, 0, 100)
    scoreWeighted += seriesScore * w
  })
  const avgPerfection = perfectionWeighted / weightSum
  const winRate = winWeighted / weightSum
  const powerScore = scoreWeighted / weightSum
  return { powerScore, avgPerfection, winRate, gamesAnalyzed: series.length }
}



// 두 팀의 체급 점수 차이를 승률로 변환 (Elo와 비슷한 로지스틱 곡선, 표본이 적을 수 있어 5~95%로 클램프)
export function powerScoreMatchupProbability(powerA: number, powerB: number): number {
  const diff = powerA - powerB
  const raw = 1 / (1 + Math.pow(10, -diff / 25))
  return Math.max(0.05, Math.min(0.95, raw))
}

// 배당 대비 기대값(EV) 계산. EV > 0 이면 모델 확률 기준 "베팅 가치 있음"
export function computeOddsValue(modelProb: number, decimalOdds: number): OddsValue | null {
  if (!decimalOdds || !isFinite(decimalOdds) || decimalOdds <= 1) return null
  const impliedProb = 1 / decimalOdds
  const ev = modelProb * decimalOdds - 1
  const edgePct = (modelProb - impliedProb) * 100
  return { impliedProb, ev, edgePct, isValue: ev > 0.001 }
}

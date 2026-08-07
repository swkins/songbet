// ─── LoL e스포츠 일정/전적 조회 + 최근 폼 기반 승부 예측 유틸 ─────────────
// Analysis.tsx(분석 탭)에서 사용한다.
// lolesports 공개 API로 리그별 일정(과거 결과 + 예정 경기)을 가져오고,
// 팀 단위로 필터링해 최근 전적 · 다음 일정 · 세트(맵) 스코어 확률 분포를 계산한다.

import dayjs from 'dayjs'
import { supabase } from './supabase'

export const LEAGUES: { code: string; label: string; slugs: string[] }[] = [
  { code: 'LCK',   label: 'LCK',   slugs: ['lck'] },
  { code: 'LCKCL', label: 'LCK CL', slugs: ['lck_challengers_league', 'lck-challengers-league', 'lck-cl', 'lckcl', 'challengers_korea', 'lck cl'] },
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
  if (!res.ok) throw new Error(`getLeagues failed (HTTP ${res.status}${res.status === 429 ? ' - 요청 제한(rate limit)' : ''})`)
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

// ─── 수동 경기 추가 (자동 일정 조회가 안 되는 리그, 예: LCK CL 등의 폴백용) ───
export interface ManualEsportsEvent {
  id: string
  league: string
  start_time: string
  state: 'completed' | 'unstarted'
  team_a_name: string
  team_a_code: string | null
  team_b_name: string
  team_b_code: string | null
  score_a: number | null
  score_b: number | null
  best_of: number
  created_at: string
}

// 수동 입력 행을 기존 화면 로직(RawScheduleEvent)이 그대로 소비할 수 있는 형태로 변환
export function manualEventToRawEvent(m: ManualEsportsEvent): RawScheduleEvent {
  return {
    id: `manual-${m.id}`,
    startTime: m.start_time,
    state: m.state,
    match: {
      id: `manual-${m.id}`,
      strategy: { type: 'bestOf', count: m.best_of },
      teams: [
        { name: m.team_a_name, code: m.team_a_code ?? undefined, result: m.state === 'completed' ? { gameWins: m.score_a ?? 0 } : undefined },
        { name: m.team_b_name, code: m.team_b_code ?? undefined, result: m.state === 'completed' ? { gameWins: m.score_b ?? 0 } : undefined },
      ],
    },
  }
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
const lastLiveFetchAt: Record<string, number> = {} // Supabase에 저장된, 실제로 lolesports API를 호출했던 마지막 시각 (화면에 "마지막 호출" 표시용)
const FETCH_PAGES = 3 // 최근 폼 계산에 쓸 만큼 과거 경기를 충분히 확보하기 위해 여러 페이지를 이어붙임

// 화면에 "마지막 호출 시각"을 보여주기 위한 조회용 (직전에 fetchScheduleEvents를 호출한 적이 있을 때만 값이 있음)
export function getLastLiveFetchAt(leagueCode: string): number | null {
  return lastLiveFetchAt[leagueCode] ?? null
}

// 리그 일정(완료 + 예정 경기) 조회.
// lolesports API는 요청 제한(rate limit)이 걸리기 쉬워서, 기본적으로는 Supabase에 저장해둔 캐시만 읽는다.
// 실제 lolesports API 호출은 forceRefresh(= "API 호출" 버튼을 눌렀을 때)일 때만 일어나고,
// 그 결과를 Supabase에 저장해서 다음 페이지 로드/새로고침(F5) 때는 API를 다시 부르지 않고 Supabase에서만 읽는다.
// 아직 한 번도 캐시가 만들어진 적 없는 리그(최초 1회)는 빈 화면 대신 API를 한 번 호출해 채워준다.
export async function fetchScheduleEvents(leagueCode: string, opts?: { forceRefresh?: boolean }): Promise<RawScheduleEvent[]> {
  // 같은 세션 안에서 방금 받아온 값이면 재사용 (짧은 시간 내 중복 호출 방지용, Supabase 왕복도 줄임)
  const mem = scheduleCache[leagueCode]
  if (!opts?.forceRefresh && mem && Date.now() - mem.fetchedAt < 15_000) {
    return mem.events
  }

  if (!opts?.forceRefresh) {
    const { data } = await supabase.from('esports_schedule_cache')
      .select('events, fetched_at').eq('league', leagueCode).maybeSingle()
    if (data?.events) {
      const cachedEvents = data.events as RawScheduleEvent[]
      scheduleCache[leagueCode] = { events: cachedEvents, fetchedAt: Date.now() }
      if (data.fetched_at) lastLiveFetchAt[leagueCode] = new Date(data.fetched_at).getTime()
      return cachedEvents
    }
    // Supabase에 캐시가 전혀 없는 최초 상태 → 아래로 내려가서 API를 한 번 호출해 채운다.
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
    if (!res.ok) {
      // 첫 페이지부터 실패하면(레이트리밋 등) 빈 목록을 조용히 반환하지 않고 원인을 알 수 있게 던진다.
      // 이후 페이지 실패는 이미 받아온 데이터라도 살리기 위해 조용히 중단한다.
      if (i === 0) throw new Error(`getSchedule failed (HTTP ${res.status}${res.status === 429 ? ' - 요청 제한(rate limit)' : ''})`)
      break
    }
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
  const nowMs = Date.now()
  scheduleCache[leagueCode] = { events: dedup, fetchedAt: nowMs }
  lastLiveFetchAt[leagueCode] = nowMs
  await supabase.from('esports_schedule_cache')
    .upsert({ league: leagueCode, events: dedup, fetched_at: new Date(nowMs).toISOString() }, { onConflict: 'league' })
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

// lolesports API가 일부 경기에서 팀 이름 대신 코드만 내려주거나(예: "JD Gaming" 대신 "JDG"),
// 표기 형식이 제각각인 경우가 있어서(예: "EDWARD GAMING" vs "EDward Gaming", "WeiboGaming" vs "Weibo Gaming",
// "Xi'an Team WE" vs "Team WE") 정규화(공백/대소문자/구두점 제거) 비교를 기본으로 하고,
// 정규화로도 안 잡히는 완전히 다른 표기(예: "Beijing JDG Esports")는 별도 별칭으로 등록한다.
function normalizeTeamStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const TEAM_CODE_ALIASES: Record<string, string> = {
  // LPL
  jdg: 'jd gaming', tt: 'thundertalk gaming', lgd: 'lgd gaming', edg: 'edward gaming', ig: 'invictus gaming',
  tes: 'top esports', we: 'team we', lng: 'lng esports', nip: 'ninjas in pyjamas', omg: 'oh my god',
  al: "anyone's legend", blg: 'bilibili gaming', wbg: 'weibo gaming', up: 'ultra prime',
  // 정규화 매칭으로 안 뚫리는 완전히 다른 표기(구단 정식 브랜드명 등)
  beijingjdgesports: 'jd gaming', shanghaiedwardgaming: 'edward gaming',
  // LEC
  fnc: 'fnatic', g2: 'g2 esports', gx: 'giantx', kc: 'karmine corp', vit: 'team vitality', th: 'team heretics',
  shf: 'shifters', mkoi: 'movistar koi', sk: 'sk gaming', navi: 'natus vincere',
  // LCS
  c9: 'cloud9', dig: 'dignitas', fly: 'flyquest', sr: 'shopify rebellion', tl: 'team liquid', sen: 'sentinels', dsg: 'disguised',
  // LCP
  ctbc: 'ctbc flying oyster', gam: 'gam esports', fsh: 'fukuoka softbank hawks', sw: 'secret whales',
  dfm: 'detonation focusme', mvk: 'mvk esports', dcg: 'deep cross gaming', gzg: 'ground zero gaming',
  // CBLOL
  fx: 'fluxo w7m', fur: 'furia', kyd: 'keyd stars', lou: 'loud', pain: 'pain gaming', red: 'red canids', lev: 'leviatán', los: 'los',
}

// 짧은 문자열(팀 코드류)이 다른 팀명 "중간"에 우연히 걸리는 걸 막기 위한 단어 경계 포함 검사.
// 예: "NS"가 "DNS Challengers"의 "dNS" 부분에 걸려서 잘못 매칭되는 사고를 방지.
function wordBoundaryIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack)
}

export function teamNameMatches(t: { name: string; code?: string | null }, query: string): boolean {
  const qRaw = query.trim().toLowerCase()
  if (!qRaw) return false
  const nRaw = (t.name ?? '').trim().toLowerCase()
  const cRaw = (t.code ?? '').trim().toLowerCase()
  if (!nRaw && !cRaw) return false

  // 완전 일치는 항상 가장 먼저, 가장 신뢰도 높게 매칭
  if (nRaw === qRaw || cRaw === qRaw) return true

  const q = normalizeTeamStr(qRaw)
  const n = normalizeTeamStr(nRaw)
  const c = normalizeTeamStr(cRaw)
  if (n === q || c === q) return true

  // 4자 이하의 짧은 문자열(코드류)은 부분 포함 매칭을 하면 오탐(예: "NS" ⊂ "DNS")이 생기기 쉬우므로
  // 원본 표기에서 단어 경계가 있을 때만 포함 매칭을 허용한다.
  if (qRaw.length <= 4) {
    if (wordBoundaryIncludes(nRaw, qRaw) || wordBoundaryIncludes(cRaw, qRaw)) return true
  } else {
    if (nRaw.includes(qRaw) || qRaw.includes(nRaw) || n.includes(q) || q.includes(n)) return true
  }

  const alias = TEAM_CODE_ALIASES[qRaw] ?? TEAM_CODE_ALIASES[q]
  if (alias) {
    const na = normalizeTeamStr(alias)
    if (n === na) return true
    if (qRaw.length > 4 && (n.includes(na) || na.includes(n))) return true
  }
  return false
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

// 시리즈 전체 관점의 확률 요약: 강팀 일반승 vs 약팀 1경기+ 승리, 강팀 스윕(예: 2:0) vs 약팀 일반승 비교용.
// p는 A가 한 세트(맵)를 이길 확률. favIsA=true면 A가 강팀.
export interface SeriesOutcomeSummary {
  favIsA: boolean
  favWinProb: number         // 강팀이 시리즈를 이길 확률(일반승, 스코어 무관)
  underWinProb: number       // 약팀이 시리즈를 이길 확률(일반승, 스코어 무관)
  favSweepProb: number       // 강팀이 스윕(예: BO3면 2:0, BO5면 3:0)으로 이길 확률
  underAtLeastOneGameProb: number // 약팀이 최소 1세트라도 따낼 확률 (= 1 - 강팀 스윕 확률)
  sweepScore: string          // 강팀 스윕 스코어 표기 (예: "2:0")
}

export function seriesOutcomeSummary(p: number, bestOf: number): SeriesOutcomeSummary {
  const bo = bestOf && bestOf > 1 ? bestOf : 1
  const k = Math.ceil(bo / 2)
  const scoreProbs = seriesScoreProbabilities(p, bestOf)
  const aWinProb = scoreProbs.filter(sp => sp.winner === 'A').reduce((s, x) => s + x.prob, 0)
  const bWinProb = 1 - aWinProb
  const favIsA = p >= 0.5
  const favWinProb = favIsA ? aWinProb : bWinProb
  const underWinProb = favIsA ? bWinProb : aWinProb
  const sweepScore = `${k}:0`
  const favSweepProb = favIsA
    ? (scoreProbs.find(sp => sp.winner === 'A' && sp.score === sweepScore)?.prob ?? aWinProb)
    : (scoreProbs.find(sp => sp.winner === 'B' && sp.score === `0:${k}`)?.prob ?? bWinProb)
  return {
    favIsA, favWinProb, underWinProb, favSweepProb,
    underAtLeastOneGameProb: 1 - favSweepProb,
    sweepScore,
  }
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
const MISC_CACHE_TTL_MS = 3 * 60 * 1000 // fetchLeagueTeams/fetchStandings용 인메모리 TTL (일정 캐시와는 별개)

export async function fetchLeagueTeams(leagueCode: string, opts?: { forceRefresh?: boolean }): Promise<RawTeam[]> {
  const cached = teamsCache[leagueCode]
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < MISC_CACHE_TTL_MS) return cached.teams
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
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < MISC_CACHE_TTL_MS) return cached.standings
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
  // 30분 이하 = 빠른 마무리, 30~33분 = 평균적인 게임 시간, 33분 초과 = 질질 끌린 경기라는 기준으로 재정의.
  // 27~29분처럼 30분보다도 더 짧게 끝난 경우는 그만큼 실력차가 크다는 뜻이라 문턱을 더 낮게(=더 관대하게) 잡는다.
  const durationMin = g.durationSeconds != null ? g.durationSeconds / 60 : null
  let perfectThreshold = 8
  let perfectAllowed = true
  if (durationMin != null) {
    if (durationMin <= 24) perfectThreshold = 5
    else if (durationMin <= 27) perfectThreshold = 6
    else if (durationMin <= 30) perfectThreshold = 8
    else if (durationMin <= 33) perfectThreshold = 12 // 평균 게임 시간대: 완벽승 인정 기준을 크게 높임
    else perfectThreshold = 18 // 33분 초과: 사실상 웬만한 격차로는 안 뜨게
    if (durationMin > 33) perfectAllowed = false // 33분(평균) 넘게 끌렸으면 격차가 아무리 커도 "완벽한 승리"는 아님
  }

  let label: string, detail: string
  if (loserHadEarlyLead) {
    label = '역전승'
    detail = '초반 주요 지표(퍼스트 1킬·퍼스트 타워·퍼스트 드래곤·퍼스트 내셔·퍼스트 5킬/퍼스트 10킬)에서는 패배팀이 앞섰지만, 최종적으로는 승리팀이 뒤집었습니다.'
  } else if (winnerHadEarlyLead && dominanceScore >= perfectThreshold && perfectAllowed) {
    label = '완벽한 승리'
    detail = durationMin != null && durationMin <= 30
      ? `초반 마일스톤과 최종 오브젝트·킬 격차 모두에서 일방적으로 앞섰고, ${Math.round(durationMin)}분 만에 빠르게 끝낸 스타트-투-피니시 승리입니다.`
      : '초반 마일스톤과 최종 오브젝트·킬 격차 모두에서 일방적으로 앞선 스타트-투-피니시 승리입니다.'
  } else if (winnerHadEarlyLead) {
    label = '리드를 지킨 승리'
    detail = durationMin != null && durationMin > 33
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
  // 30분 이하로 끝냈으면 보너스(-값), 30~33분은 평균이라 중립, 33분 초과로 끌렸으면 페널티
  const durationPenalty = durationMin > 33 ? 1.5 : durationMin <= 30 ? -0.5 : 0
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
    : durationMin <= 30 ? 1
    : durationMin >= 40 ? -1
    : 1 - (durationMin - 30) * (2 / 10)
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
// 경기시간을 "격차 자체를 조절하는 축"으로 삼는다. 기준은 30분/33분:
//   - 30분 이하로 끝난 경기 → 그만큼 실력차가 크다는 뜻이므로 격차를 크게 증폭. 30분에서 멀어질수록
//     (27분, 24분처럼 더 빨리 끝날수록) 증폭을 더 키운다 — "30분 내로 끝내는 것도 힘든데 그보다도
//     더 빨리 끝내는 건 실력차가 훨씬 크다는 뜻"이라는 전제.
//   - 30~33분 → 평균적인 게임 페이스이므로 중립(×1.0), 지금까지 계산된 격차를 그대로 반영.
//   - 33분 초과 → 질질 끌렸다는 뜻이므로 격차를 압축. 특히 35분을 넘어가면 "아주 미세한 차이"만
//     남도록 배율을 크게 낮춘다.
function durationSpreadMultiplier(durationMin: number): number {
  if (durationMin <= 20) return 1.8
  if (durationMin <= 27) return 1.8 - (durationMin - 20) * (0.3 / 7)   // 20~27분: 1.8 → 1.5
  if (durationMin <= 30) return 1.5 - (durationMin - 27) * (0.3 / 3)   // 27~30분: 1.5 → 1.2
  if (durationMin <= 33) return 1.0                                    // 30~33분: 평균 페이스, 중립
  if (durationMin <= 35) return 1.0 - (durationMin - 33) * (0.7 / 2)   // 33~35분: 1.0 → 0.3
  return 0.2                                                            // 35분 초과: 아주 미세한 차이만
}

export function computePerfectionScore(g: GameStatsInput): number {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const durationMin = g.durationSeconds != null ? g.durationSeconds / 60 : 32
  const d = computeDetailedScores(g)
  const sum = d.laning + d.objectiveControl + d.teamfight + d.macro + d.closing // 0~50, 중립=25
  const deviation = sum - 25
  const baseSpread = durationSpreadMultiplier(durationMin)
  // 이미 스탯 격차 자체가 큰(=원래도 실력차가 컸던) 경기는 "빨리 끝낸 것"에 대한 추가 가산을 줄인다.
  // (실력차가 큰 상태에서 30분 내로 끝내는 건 당연한 결과이지, 별도로 더 보상할 일은 아니라는 전제)
  const dampenedExtra = (baseSpread - 1) * (10 / (10 + Math.abs(deviation)))
  const effectiveSpread = 1 + dampenedExtra
  let score = clamp(50 + deviation * 2 * effectiveSpread, 0, 100)
  // 약팀 상대로 오래 끌리더라도 승리는 승리 — 이겼다면 아무리 배율이 낮아도 최소한 미미하게는 중립(50점)보다 높아야 한다.
  if (g.winnerTeam === 'team1') score = Math.max(score, 51)
  return Math.round(score)
}




export function computeBothSidesPerfection(g: GameStatsInput): { team1: number; team2: number } {
  return { team1: computePerfectionScore(g), team2: computePerfectionScore(swapPerspective(g)) }
}

// ─── 팀 체급 점수: 최근일수록 가중치를 더 주는 가중평균 방식 ────────────
// (기존엔 라이엇 GPR 공식처럼 경기 순서대로 하나씩 누적 갱신했는데, 그러면 최근 경기 하나에 점수가
// 크게 출렁이는 느낌이 있었다. 대신 "모든 경기를 다 반영하되, 최근 경기일수록 가중치를 지수적으로
// 크게 준다"는 방식으로 바꿨다 — 반감기(half-life) 60일: 60일 지난 경기는 가중치가 절반, 120일
// 지난 경기는 1/4... 이렇게 매끄럽게 줄어든다. 계산상 반감기 60일이면 최근 약 2개월 안의 경기가
// 전체 가중치의 대략 절반을 차지하게 된다.)
export interface TeamPowerScore {
  powerScore: number // 0~100
  winRate: number
  gamesAnalyzed: number
}

const ELO_SCALE = 25   // 파워점수 차이를 승률로 변환할 때 쓰는 로지스틱 기울기(powerScoreMatchupProbability에서 사용)
export const POWER_HALF_LIFE_DAYS = 60   // 가중치가 절반으로 줄어드는 기간(일)
export const POWER_WINDOW_DAYS = 180     // 이보다 오래된 경기는 계산에서 제외(6개월 — DB에서 지우진 않고 계산에서만 뺀다)
export const POWER_RECENT_FORM_WEIGHT = 0.8  // 최종 점수 중 "반감기 가중평균(최근폼)"이 차지하는 비중. 나머지(1-이값)는 그 6개월 구간의 단순평균 — 표본이 적을 때 노이즈를 눌러주는 안정판 역할.
const YEAR_BOUNDARY_DISCOUNT = 0.6       // 연도가 바뀌면(=로스터 개편이 몰리는 시점) 그 전 연도 경기 가중치에 추가로 곱하는 배율

export interface WeightedMatchRecord {
  teamAId: string
  teamBId: string
  matchStartTime: string
  gameNumber: number
  winnerIsA: boolean
  perfectionA: number // 0~100, computeBothSidesPerfection 결과(팀A 관점 플레이 점수)
  perfectionB: number
}

export interface WeightedGameLog {
  teamId: string
  opponentId: string
  matchStartTime: string
  gameNumber: number
  won: boolean
  gameScore: number   // 이 경기 하나만 놓고 본 체급 점수(0~100) — 승패 + 얼마나 압도적으로 이겼는지
  weight: number       // "지금" 시점 기준 이 경기의 가중치(0~1, 최신일수록 1에 가까움)
  daysAgo: number      // 지금으로부터 며칠 전 경기인지
  ratingAsOf: number   // 그 경기 시점까지의 데이터만으로 계산한 그 시점 기준 파워 점수(히스토리 차트용)
}

export interface WeightedPowerResult {
  ratings: Record<string, number>
  log: Record<string, WeightedGameLog[]> // 팀별로 시간순 정렬
}

// 반감기 감쇠 + "연도가 다르면" 추가 할인. LoL은 보통 연말~연초 사이에 로스터 개편이 몰리기 때문에,
// 단순히 날짜 차이만 보는 것보다 "작년 경기"에 한 번 더 페널티를 주는 게 실제 폼 변화에 더 가깝다.
function recencyWeight(matchStartTime: string, referenceTimeMs: number, halfLifeDays: number): number {
  const daysAgo = Math.max(0, (referenceTimeMs - new Date(matchStartTime).getTime()) / 86400000)
  let w = Math.pow(0.5, daysAgo / halfLifeDays)
  const matchYear = new Date(matchStartTime).getUTCFullYear()
  const refYear = new Date(referenceTimeMs).getUTCFullYear()
  if (matchYear !== refYear) w *= YEAR_BOUNDARY_DISCOUNT
  return w
}

// 경기 하나의 "체급 점수"(0~100): 승패를 기본 축으로 삼고(이기면 62점대, 지면 38점대에서 출발),
// 그 경기의 플레이 점수 차이(얼마나 압도적으로 이기고 졌는지)를 더해 세분화한다.
// 압도적인 승리는 신승보다 높게, 신승은 압도적 패배보다는 높게 나온다.
function gameScoreFor(won: boolean, ownPerfection: number, oppPerfection: number): number {
  const base = won ? 62 : 38
  const marginAdj = (ownPerfection - oppPerfection) / 5   // 플레이 점수차(-100~100)를 대략 -20~20으로 눌러서 반영
  return Math.max(5, Math.min(95, base + marginAdj))
}

// matches: 리그 전체 세트 기록(중복 없이 한 방향씩만). fallback: 경기가 하나도 없는 팀에 쓸 기본값(GPR 기반).
export function computeWeightedPowerRatings(
  matches: WeightedMatchRecord[],
  fallback: Record<string, number>,
  referenceTimeMs: number = Date.now(),
  halfLifeDays: number = POWER_HALF_LIFE_DAYS,
  windowDays: number = POWER_WINDOW_DAYS,
  recentFormWeight: number = POWER_RECENT_FORM_WEIGHT,
): WeightedPowerResult {
  type Entry = { teamId: string; opponentId: string; matchStartTime: string; gameNumber: number; won: boolean; gameScore: number }
  const byTeam: Record<string, Entry[]> = {}
  for (const m of matches) {
    // 6개월(windowDays)보다 오래된 경기는 계산에서 아예 제외 — DB에서 지우는 게 아니라 이 계산에서만 뺀다.
    const daysAgo = (referenceTimeMs - new Date(m.matchStartTime).getTime()) / 86400000
    if (daysAgo > windowDays) continue
    const scoreA = gameScoreFor(m.winnerIsA, m.perfectionA, m.perfectionB)
    const scoreB = gameScoreFor(!m.winnerIsA, m.perfectionB, m.perfectionA)
    ;(byTeam[m.teamAId] ??= []).push({ teamId: m.teamAId, opponentId: m.teamBId, matchStartTime: m.matchStartTime, gameNumber: m.gameNumber, won: m.winnerIsA, gameScore: scoreA })
    ;(byTeam[m.teamBId] ??= []).push({ teamId: m.teamBId, opponentId: m.teamAId, matchStartTime: m.matchStartTime, gameNumber: m.gameNumber, won: !m.winnerIsA, gameScore: scoreB })
  }
  const ratings: Record<string, number> = {}
  const log: Record<string, WeightedGameLog[]> = {}
  for (const teamId of Object.keys(byTeam)) {
    const entries = byTeam[teamId].sort((a, b) =>
      new Date(a.matchStartTime).getTime() - new Date(b.matchStartTime).getTime() || a.gameNumber - b.gameNumber
    )
    // 최종 점수 = 반감기 가중평균(recentFormWeight 비중, "최근폼") + 이 구간(6개월) 단순평균(나머지 비중, "기본 체급" 안정판)
    let wSum = 0, wScoreSum = 0, plainSum = 0
    for (const e of entries) {
      const w = recencyWeight(e.matchStartTime, referenceTimeMs, halfLifeDays)
      wSum += w; wScoreSum += w * e.gameScore
      plainSum += e.gameScore
    }
    if (wSum > 0) {
      const weightedAvg = wScoreSum / wSum
      const plainAvg = plainSum / entries.length
      ratings[teamId] = recentFormWeight * weightedAvg + (1 - recentFormWeight) * plainAvg
    } else {
      ratings[teamId] = fallback[teamId] ?? 50
    }

    // 히스토리(차트/목록용): 각 경기 "그 시점"까지의 데이터만으로 계산한 가중평균 — 시간에 따른 폼 변화를 보여준다.
    const teamLog: WeightedGameLog[] = []
    for (let i = 0; i < entries.length; i++) {
      const refTime = new Date(entries[i].matchStartTime).getTime()
      let ws = 0, wss = 0, ps = 0
      for (let j = 0; j <= i; j++) {
        const w = recencyWeight(entries[j].matchStartTime, refTime, halfLifeDays)
        ws += w; wss += w * entries[j].gameScore
        ps += entries[j].gameScore
      }
      const ratingAsOf = ws > 0 ? recentFormWeight * (wss / ws) + (1 - recentFormWeight) * (ps / (i + 1)) : (fallback[teamId] ?? 50)
      teamLog.push({
        teamId, opponentId: entries[i].opponentId, matchStartTime: entries[i].matchStartTime, gameNumber: entries[i].gameNumber,
        won: entries[i].won, gameScore: entries[i].gameScore,
        weight: recencyWeight(entries[i].matchStartTime, referenceTimeMs, halfLifeDays),
        daysAgo: Math.max(0, (referenceTimeMs - refTime) / 86400000),
        ratingAsOf,
      })
    }
    log[teamId] = teamLog
  }
  for (const teamId of Object.keys(fallback)) {
    if (!(teamId in ratings)) ratings[teamId] = fallback[teamId]
  }
  return { ratings, log }
}

// 두 팀의 체급 점수 차이를 승률로 변환 (Elo와 비슷한 로지스틱 곡선, 표본이 적을 수 있어 5~95%로 클램프)
export function powerScoreMatchupProbability(powerA: number, powerB: number): number {
  const diff = powerA - powerB
  const raw = 1 / (1 + Math.pow(10, -diff / ELO_SCALE))
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

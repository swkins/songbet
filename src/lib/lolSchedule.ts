// ─── LoL 오늘/내일 경기 일정 조회 (베팅 등록 폼에서 사용) ─────────────
// Analysis 탭이 쓰던 lolesports 공개 API를 그대로 쓰되, 여긴 목적이 다르다:
// 과거 전적/파워랭킹 계산용이 아니라 "지금 베팅할 경기 고르기"가 목적이라
// 오늘~내일 사이의 경기만 가볍게 가져온다.
// 캐시는 Supabase(lol_schedule_cache, 날짜별 1행)에 저장 — PC/모바일 등 기기가 달라도 같은 날이면
// 첫 번째로 부른 기기만 실제 lolesports API를 호출하고, 그 이후엔 전부 이 캐시를 읽는다.

import { supabase } from './supabase'

const LEAGUES: { code: string; label: string; slugs: string[] }[] = [
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

export interface UpcomingLolMatch {
  id: string
  league: string
  leagueLabel: string
  startTime: string
  bestOf: number
  teamA: string; teamACode?: string
  teamB: string; teamBCode?: string
}

let leagueIdCache: Record<string, string> | null = null
async function resolveLeagueIds(): Promise<Record<string, string>> {
  if (leagueIdCache) return leagueIdCache
  const res = await fetch(`${LOLESPORTS_API}/getLeagues?hl=en-US`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!res.ok) throw new Error(`getLeagues failed (HTTP ${res.status})`)
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

// 세션 안에서 방금 받아온 값이면(같은 페이지 안에서 폼을 여러 번 열 때) Supabase 왕복도 생략
let memCache: { date: string; matches: UpcomingLolMatch[] } | null = null

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function fetchLiveFromLolesports(): Promise<UpcomingLolMatch[]> {
  const ids = await resolveLeagueIds()
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(); to.setDate(to.getDate() + 1); to.setHours(23, 59, 59, 999)

  const results: UpcomingLolMatch[] = []
  let anyOk = false
  for (const l of LEAGUES) {
    const leagueId = ids[l.code]
    if (!leagueId) continue
    try {
      const res = await fetch(`${LOLESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
      if (!res.ok) continue
      anyOk = true
      const json = await res.json()
      const events: any[] = json?.data?.schedule?.events ?? []
      for (const e of events) {
        if (e.state !== 'unstarted' && e.state !== 'inProgress') continue
        const t = new Date(e.startTime)
        if (t < from || t > to) continue
        const teams = e.match?.teams ?? []
        if (teams.length < 2) continue
        results.push({
          id: e.match?.id ?? e.id,
          league: l.code, leagueLabel: l.label,
          startTime: e.startTime,
          bestOf: e.match?.strategy?.count ?? 3,
          teamA: teams[0]?.name || 'TBD', teamACode: teams[0]?.code,
          teamB: teams[1]?.name || 'TBD', teamBCode: teams[1]?.code,
        })
      }
    } catch { /* 리그 하나 실패해도 나머지는 계속 진행 */ }
  }
  if (!anyOk) throw new Error('일정 조회 실패 (네트워크 또는 API 오류)')
  results.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  return results
}

// 7일 지난 캐시 행 삭제 (오늘·내일 것만 필요하니 일주일이면 충분히 여유 있게 남겨두는 것)
async function purgeOldScheduleCache() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  await supabase.from('lol_schedule_cache').delete().lt('cache_date', cutoffStr)
}

// 오늘 00:00 ~ 내일 23:59(로컬 시각 기준) 사이에 열리는 LoL 경기를 모든 리그 통합해서 가져온다.
// 순서: 세션 메모리 캐시 → Supabase 캐시(오늘 날짜 행) → (둘 다 없을 때만) 실제 lolesports API 호출 후 Supabase에 저장.
// 날짜가 바뀌면 자동으로 새로 호출된다(cache_date가 today와 안 맞으면 무시).
export async function fetchTodayTomorrowLolMatches(opts?: { forceRefresh?: boolean }): Promise<UpcomingLolMatch[]> {
  const today = todayKey()
  purgeOldScheduleCache() // 매번 기다릴 필요 없어서 결과를 기다리지 않고 백그라운드로 흘려보냄

  if (!opts?.forceRefresh) {
    if (memCache && memCache.date === today) return memCache.matches
    const { data } = await supabase.from('lol_schedule_cache').select('matches').eq('cache_date', today).maybeSingle()
    if (data?.matches) {
      const matches = data.matches as UpcomingLolMatch[]
      memCache = { date: today, matches }
      return matches
    }
  }

  const results = await fetchLiveFromLolesports()
  memCache = { date: today, matches: results }
  await supabase.from('lol_schedule_cache').upsert({ cache_date: today, matches: results, fetched_at: new Date().toISOString() }, { onConflict: 'cache_date' })
  return results
}

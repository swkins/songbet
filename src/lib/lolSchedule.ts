// ─── LoL 오늘/내일 경기 일정 조회 (베팅 등록 폼에서 사용) ─────────────
// Analysis 탭이 쓰던 lolesports 공개 API를 그대로 쓰되, 여긴 목적이 다르다:
// 과거 전적/파워랭킹 계산용이 아니라 "지금 베팅할 경기 고르기"가 목적이라
// 오늘~내일 사이의 경기만 가볍게 가져온다.
// 캐시는 Supabase(lol_schedule_cache, 날짜별 1행)에 저장 — PC/모바일 등 기기가 달라도 같은 날이면
// 첫 번째로 부른 기기만 실제 lolesports API를 호출하고, 그 이후엔 전부 이 캐시를 읽는다.

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
    // slug가 같은 게 여러 개 내려올 가능성을 대비해 전부 로그로 남긴다 — 그 중 첫 번째를 쓰는데,
    // 만약 여러 개가 잡히면(예: 지역/시즌별로 리그 엔티티가 분리돼 있는 경우) 엉뚱한 걸 골랐을 수 있음.
    const matches = leagues.filter(x => l.slugs.includes(x.slug))
    if (matches.length > 1) console.warn(`[lolSchedule] ${l.code}: slug 일치가 ${matches.length}개 —`, matches)
    if (matches[0]) map[l.code] = matches[0].id
  }
  leagueIdCache = map
  console.info('[lolSchedule] 리그 ID 매핑:', map)
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
    // 진단용: 리그 ID를 못 찾으면(=slug 매칭 실패) 바로 알 수 있게 로그를 남긴다.
    if (!leagueId) { console.warn(`[lolSchedule] ${l.code}: leagueId를 못 찾음 (slug 매칭 실패)`); continue }
    let total = 0, byState = 0, byDate = 0, byTeams = 0, included = 0
    try {
      // 기본 페이지(가장 최근 완료 + 다음 예정 몇 경기)만으로는 하루에 경기가 여러 개인 리그(LPL 등)의
      // 이틀 뒤까지 경기를 다 못 담을 수 있어서, "newer"(미래 방향) 페이지가 있으면 최대 3페이지까지
      // 더 따라간다. 그래도 시간 범위(from~to)를 벗어나면 그 즉시 멈춘다.
      let pageToken: string | undefined
      for (let page = 0; page < 4; page++) {
        const url = pageToken
          ? `${LOLESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}&pageToken=${pageToken}`
          : `${LOLESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}`
        const res = await fetch(url, { headers: { 'x-api-key': LOLESPORTS_KEY } })
        if (!res.ok) { console.warn(`[lolSchedule] ${l.code}: getSchedule HTTP ${res.status}`); break }
        anyOk = true
        const json = await res.json()
        const events: any[] = json?.data?.schedule?.events ?? []
        total += events.length
        let sawWithinRange = false
        for (const e of events) {
          if (e.state !== 'unstarted' && e.state !== 'inProgress') { byState++; continue }
          const t = new Date(e.startTime)
          if (t < from || t > to) { byDate++; continue }
          sawWithinRange = true
          const teams = e.match?.teams ?? []
          if (teams.length < 2) { byTeams++; console.warn(`[lolSchedule] ${l.code}: teams 부족으로 제외 -`, e.startTime, teams); continue }
          included++
          results.push({
            id: e.match?.id ?? e.id,
            league: l.code, leagueLabel: l.label,
            startTime: e.startTime,
            bestOf: e.match?.strategy?.count ?? 3,
            teamA: teams[0]?.name || 'TBD', teamACode: teams[0]?.code,
            teamB: teams[1]?.name || 'TBD', teamBCode: teams[1]?.code,
          })
        }
        const next = json?.data?.schedule?.pages?.newer ?? json?.data?.schedule?.pages?.next
        // 다음 페이지 토큰이 없거나, 이번 페이지에 범위 안 경기가 하나도 없었으면(이미 범위를 넘어섰다는 뜻) 중단
        if (!next || (!sawWithinRange && page > 0)) break
        pageToken = next
      }
    } catch (err) { console.warn(`[lolSchedule] ${l.code}: 호출 실패`, err) /* 리그 하나 실패해도 나머지는 계속 진행 */ }
    // 진단용 요약: 리그별로 몇 개 받아서 몇 개가 어떤 이유로 걸러지고 몇 개가 최종 포함됐는지
    console.info(`[lolSchedule] ${l.code} (id=${leagueId}): 전체 ${total}건 → 상태제외 ${byState} · 날짜범위제외 ${byDate} · 팀정보부족제외 ${byTeams} · 포함 ${included}`)
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

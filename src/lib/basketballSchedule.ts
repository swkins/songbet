// ─── 농구 경기 일정 조회 (베팅 등록 폼에서 사용, ESPN 히든 API 기반) ─────
// LOL/축구/야구와 동일한 패턴: site.api.espn.com/apis/site/v2/sports/basketball/{리그}/scoreboard
// 요청에 따라 NBA·WNBA만 가져온다 (G리그·호주 NBL 등은 뺌).
// KBL·WKBL·CBA·B리그(일본)·유로리그는 이 API에 슬러그 자체가 없어서(github.com/pseudo-r/Public-ESPN-API 확인)
// 여전히 못 가져온다 — 기존처럼 리그란에 직접 입력해서 쓰면 된다.

import { supabase } from './supabase'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball'

export const BASKETBALL_LEAGUES: { code: string; label: string; slug: string }[] = [
  { code: 'NBA',  label: 'NBA',  slug: 'nba' },
  { code: 'WNBA', label: 'WNBA', slug: 'wnba' },
  // KBL, WKBL, CBA, B리그, 유로리그: ESPN 히든 API에 리그 자체가 없어서 못 넣음 (위 주석 참고)
]

export interface UpcomingBasketballMatch {
  id: string
  league: string
  leagueLabel: string
  startTime: string
  teamA: string
  teamB: string
}

function fmtDateDash(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDateCompact(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function fetchLeagueDay(slug: string, dateCompact: string): Promise<any[]> {
  try {
    const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${dateCompact}&limit=100`
    const res = await fetch(url)
    if (!res.ok) { console.warn(`[basketballSchedule] ${slug} ${dateCompact}: HTTP ${res.status}`); return [] }
    const json = await res.json()
    return json?.events ?? []
  } catch (err) {
    console.warn(`[basketballSchedule] ${slug} ${dateCompact}: 호출 실패`, err)
    return []
  }
}

async function fetchLiveFromESPN(): Promise<UpcomingBasketballMatch[]> {
  const WINDOW_DAYS = 5
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(Date.now() + i * 86400000))
  const dateCompacts = days.map(fmtDateCompact)

  const perLeague = await Promise.all(BASKETBALL_LEAGUES.map(async l => {
    const perDay = await Promise.all(dateCompacts.map(d => fetchLeagueDay(l.slug, d)))
    const events = perDay.flat()
    const matches: UpcomingBasketballMatch[] = []
    for (const e of events) {
      const comp = e?.competitions?.[0]
      const competitors: any[] = comp?.competitors ?? []
      const home = competitors.find(c => c.homeAway === 'home')
      const away = competitors.find(c => c.homeAway === 'away')
      if (!home?.team || !away?.team) continue
      const state = comp?.status?.type?.state
      if (state === 'post') continue
      matches.push({
        id: String(e.id),
        league: l.code, leagueLabel: l.label,
        startTime: e.date,
        teamA: home.team.displayName || home.team.shortDisplayName || home.team.name,
        teamB: away.team.displayName || away.team.shortDisplayName || away.team.name,
      })
    }
    console.info(`[basketballSchedule] ${l.label}(${l.slug}): ${matches.length}건`)
    return matches
  }))

  const results = perLeague.flat()
  const seen = new Set<string>()
  const deduped = results.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
  deduped.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  console.info(`[basketballSchedule] 총 ${deduped.length}건 (중복 제거 후, ${WINDOW_DAYS}일치, ${BASKETBALL_LEAGUES.length}개 리그)`)
  return deduped
}

let memCache: { date: string; matches: UpcomingBasketballMatch[] } | null = null

function todayKey(): string {
  return fmtDateDash(new Date())
}

async function purgeOldCache() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
  await supabase.from('basketball_schedule_cache').delete().lt('cache_date', fmtDateDash(cutoff))
}

// 앞으로 5일치 경기를 가져온다 (LOL·축구와 동일한 Supabase 일별 캐시 패턴)
export async function fetchUpcomingBasketballMatches(opts?: { forceRefresh?: boolean }): Promise<UpcomingBasketballMatch[]> {
  const today = todayKey()
  purgeOldCache()

  if (!opts?.forceRefresh) {
    if (memCache && memCache.date === today) return memCache.matches
    const { data } = await supabase.from('basketball_schedule_cache').select('matches').eq('cache_date', today).maybeSingle()
    if (data?.matches) {
      const matches = data.matches as UpcomingBasketballMatch[]
      memCache = { date: today, matches }
      return matches
    }
  }

  const results = await fetchLiveFromESPN()
  memCache = { date: today, matches: results }
  await supabase.from('basketball_schedule_cache').upsert({ cache_date: today, matches: results, fetched_at: new Date().toISOString() }, { onConflict: 'cache_date' })
  return results
}

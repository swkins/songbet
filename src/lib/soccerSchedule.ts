// ─── 축구 경기 일정 조회 (베팅 등록 폼에서 사용, ESPN 히든 API 기반) ─────
// TheSportsDB 무료 키는 실제로 호출당 3건까지만 잘라서 주는 걸 로그로 확인해서(콘솔 진단 결과),
// ESPN의 비공식(히든) API로 교체했다 — site.api.espn.com/apis/site/v2/sports/soccer/{리그}/scoreboard
// 여기도 가입/키 필요 없음. 리그 슬러그는 커뮤니티가 검증해둔 목록(github.com/pseudo-r/Public-ESPN-API) 기준.
// 주의: K리그는 이 API에 아예 리그 슬러그가 없어서(확인됨) 이번엔 뺐다. J1리그(jpn.1)는 있음.

import { supabase } from './supabase'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

export const SOCCER_LEAGUES: { code: string; label: string; slug: string }[] = [
  { code: 'EPL',         label: 'EPL',          slug: 'eng.1' },
  { code: 'LALIGA',      label: '라리가',        slug: 'esp.1' },
  { code: 'BUNDES',      label: '분데스리가',    slug: 'ger.1' },
  { code: 'SERIEA',      label: '세리에A',       slug: 'ita.1' },
  { code: 'LIGUE1',      label: '리그앙',        slug: 'fra.1' },
  { code: 'J1',          label: 'J1리그',        slug: 'jpn.1' },
  { code: 'EREDIVISIE',  label: '에레디비지에',  slug: 'ned.1' },
  { code: 'PRIMEIRA',    label: '프리메이라',    slug: 'por.1' },
  { code: 'BRASILEIRAO', label: '브라질레이랑',  slug: 'bra.1' },
  { code: 'MLS',         label: 'MLS',           slug: 'usa.1' },
]

export interface UpcomingSoccerMatch {
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
    if (!res.ok) { console.warn(`[soccerSchedule] ${slug} ${dateCompact}: HTTP ${res.status}`); return [] }
    const json = await res.json()
    return json?.events ?? []
  } catch (err) {
    console.warn(`[soccerSchedule] ${slug} ${dateCompact}: 호출 실패`, err)
    return []
  }
}

async function fetchLiveFromESPN(): Promise<UpcomingSoccerMatch[]> {
  const WINDOW_DAYS = 10
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(Date.now() + i * 86400000))
  const results: UpcomingSoccerMatch[] = []

  for (const l of SOCCER_LEAGUES) {
    let leagueCount = 0
    for (const d of days) {
      const events = await fetchLeagueDay(l.slug, fmtDateCompact(d))
      for (const e of events) {
        const comp = e?.competitions?.[0]
        const competitors: any[] = comp?.competitors ?? []
        const home = competitors.find(c => c.homeAway === 'home')
        const away = competitors.find(c => c.homeAway === 'away')
        if (!home?.team || !away?.team) continue
        // 이미 끝난 경기는 제외 (완료 상태만 걸러내고, 예정/진행중은 포함)
        const state = comp?.status?.type?.state
        if (state === 'post') continue
        results.push({
          id: String(e.id),
          league: l.code, leagueLabel: l.label,
          startTime: e.date,
          teamA: home.team.displayName || home.team.shortDisplayName || home.team.name,
          teamB: away.team.displayName || away.team.shortDisplayName || away.team.name,
        })
        leagueCount++
      }
    }
    console.info(`[soccerSchedule] ${l.label}(${l.slug}): ${leagueCount}건`)
  }
  // 같은 경기가 여러 날짜 조회에 중복으로 안 잡히게 id 기준 중복 제거
  const seen = new Set<string>()
  const deduped = results.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
  deduped.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  console.info(`[soccerSchedule] 총 ${deduped.length}건 (중복 제거 후, ${WINDOW_DAYS}일치, ${SOCCER_LEAGUES.length}개 리그)`)
  return deduped
}

let memCache: { date: string; matches: UpcomingSoccerMatch[] } | null = null

function todayKey(): string {
  return fmtDateDash(new Date())
}

async function purgeOldSoccerCache() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
  await supabase.from('soccer_schedule_cache').delete().lt('cache_date', fmtDateDash(cutoff))
}

// 앞으로 10일치(로컬 시각 기준) 경기를 리그 통합해서 가져온다. Supabase에 "오늘 날짜" 기준으로 캐시해서,
// 어느 기기에서 부르든 그날 처음 한 번만 실제 ESPN을 호출하고 나머진 캐시를 읽는다(LOL과 동일 패턴).
export async function fetchUpcomingSoccerMatches(opts?: { forceRefresh?: boolean }): Promise<UpcomingSoccerMatch[]> {
  const today = todayKey()
  purgeOldSoccerCache() // 기다릴 필요 없어서 백그라운드로 흘려보냄

  if (!opts?.forceRefresh) {
    if (memCache && memCache.date === today) return memCache.matches
    const { data } = await supabase.from('soccer_schedule_cache').select('matches').eq('cache_date', today).maybeSingle()
    if (data?.matches) {
      const matches = data.matches as UpcomingSoccerMatch[]
      memCache = { date: today, matches }
      return matches
    }
  }

  const results = await fetchLiveFromESPN()
  memCache = { date: today, matches: results }
  await supabase.from('soccer_schedule_cache').upsert({ cache_date: today, matches: results, fetched_at: new Date().toISOString() }, { onConflict: 'cache_date' })
  return results
}

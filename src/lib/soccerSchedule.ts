// ─── 축구 오늘/내일 경기 일정 조회 (베팅 등록 폼에서 사용, LOL 방식과 동일) ─────
// TheSportsDB의 공개 무료 테스트 키("123")를 쓴다 — 가입도 개인 키 발급도 필요 없다(lolesports 때와 같은 방식).
// eventsday.php?d=날짜&s=Soccer 하나로 그날 전 세계 축구 경기를 한 번에 받아온 뒤,
// 원하는 리그(strLeague 텍스트)만 걸러낸다 — 리그별 ID를 몰라도 되게끔.
// 리그명 정확한 표기를 100% 확인은 못 해서(TheSportsDB가 보통 "국가명 + 리그명" 형태로 등록함),
// 키워드 포함 방식으로 느슨하게 매칭한다 — 혹시 안 잡히는 리그가 있으면 키워드를 조정하면 된다.

import { supabase } from './supabase'

const SPORTSDB_KEY = '123'
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json'

export const SOCCER_LEAGUES: { code: string; label: string; keywords: string[] }[] = [
  { code: 'KLEAGUE',     label: 'K리그1',      keywords: ['k league 1', 'k-league 1', 'korean k league'] },
  { code: 'J1',          label: 'J1리그',       keywords: ['j1 league', 'j.league division 1', 'japanese j1'] },
  { code: 'EPL',         label: 'EPL',          keywords: ['english premier league'] },
  { code: 'LALIGA',      label: '라리가',       keywords: ['la liga', 'spanish la liga'] },
  { code: 'BUNDES',      label: '분데스리가',   keywords: ['german bundesliga'] },
  { code: 'SERIEA',      label: '세리에A',      keywords: ['italian serie a'] },
  { code: 'LIGUE1',      label: '리그앙',       keywords: ['french ligue 1'] },
  { code: 'EREDIVISIE',  label: '에레디비지에', keywords: ['dutch eredivisie'] },
  { code: 'PRIMEIRA',    label: '프리메이라',   keywords: ['portuguese primeira liga'] },
  { code: 'BRASILEIRAO', label: '브라질레이랑', keywords: ['brazilian serie a'] },
  { code: 'MLS',         label: 'MLS',          keywords: ['american major league soccer'] },
]

export interface UpcomingSoccerMatch {
  id: string
  league: string
  leagueLabel: string
  startTime: string
  teamA: string
  teamB: string
}

function matchLeague(strLeague: string): { code: string; label: string } | null {
  const lower = (strLeague || '').toLowerCase()
  for (const l of SOCCER_LEAGUES) {
    if (l.keywords.some(k => lower.includes(k))) return { code: l.code, label: l.label }
  }
  return null
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function fetchDay(dateStr: string): Promise<any[]> {
  try {
    const res = await fetch(`${SPORTSDB_BASE}/${SPORTSDB_KEY}/eventsday.php?d=${dateStr}&s=Soccer`)
    if (!res.ok) { console.warn(`[soccerSchedule] eventsday ${dateStr}: HTTP ${res.status}`); return [] }
    const json = await res.json()
    return json?.events ?? []
  } catch (err) {
    console.warn(`[soccerSchedule] eventsday ${dateStr}: 호출 실패`, err)
    return []
  }
}

async function fetchLiveFromSportsDB(): Promise<UpcomingSoccerMatch[]> {
  // 오늘·내일에 경기가 없는 리그도 있어서(비시즌·라운드 사이 텀 등), 앞으로 10일치를 넉넉히 받아온 뒤
  // 화면에서 오늘/내일/이후 탭으로 나눠 보여준다. 무료 키라 호출 자체는 하루 한 번(캐시)이라 여러 날짜를
  // 한 번에 불러도 문제없다.
  const WINDOW_DAYS = 10
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => fmtDate(new Date(Date.now() + i * 86400000)))
  const perDay = await Promise.all(days.map(fetchDay))
  const all = perDay.flat()
  const results: UpcomingSoccerMatch[] = []
  for (const e of all) {
    const matched = matchLeague(e?.strLeague)
    if (!matched) continue
    if (!e.strHomeTeam || !e.strAwayTeam) continue
    const startTime = e.strTimestamp
      ? `${e.strTimestamp}Z`
      : `${e.dateEvent}T${(e.strTime || '00:00:00').length === 5 ? e.strTime + ':00' : (e.strTime || '00:00:00')}Z`
    results.push({
      id: String(e.idEvent), league: matched.code, leagueLabel: matched.label,
      startTime, teamA: e.strHomeTeam, teamB: e.strAwayTeam,
    })
  }
  results.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  return results
}

let memCache: { date: string; matches: UpcomingSoccerMatch[] } | null = null

function todayKey(): string {
  return fmtDate(new Date())
}

async function purgeOldSoccerCache() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
  await supabase.from('soccer_schedule_cache').delete().lt('cache_date', fmtDate(cutoff))
}

// 앞으로 10일치(로컬 시각 기준) 경기를 리그 통합해서 가져온다. Supabase에 "오늘 날짜" 기준으로 캐시해서,
// 어느 기기에서 부르든 그날 처음 한 번만 실제 TheSportsDB를 호출하고 나머진 캐시를 읽는다(LOL과 동일 패턴).
// 화면에서 오늘/내일/이후로 나눠 보여주는 건 호출 쪽(Dashboard) 책임 — 여긴 그냥 앞으로 10일치를 다 준다.
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

  const results = await fetchLiveFromSportsDB()
  memCache = { date: today, matches: results }
  await supabase.from('soccer_schedule_cache').upsert({ cache_date: today, matches: results, fetched_at: new Date().toISOString() }, { onConflict: 'cache_date' })
  return results
}

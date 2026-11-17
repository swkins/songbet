// 다음 경기 일정 받아서 game_schedules에 저장 (한국 날짜 기준).
// body: { dates?: ['YYYY-MM-DD', ...] (KST, 기본 = 오늘·내일) }
// pg_cron 'update-schedule-random'이 약 1시간마다(분은 매번 랜덤) public.run_update_schedule()로 부른다 — supabase/cron_update_schedule.sql
// 배포: Supabase MCP deploy_edge_function (verify_jwt true, anon 키로 호출)
//
// 출처 (네이버 스포츠는 Supabase 서버에서 응답이 없어 못 씀):
//  - NBA: ESPN scoreboard (브라우저 UA 필수, 미국 날짜 하루씩 — KST 하루 = 미국 전날·당일), 막히면 NBA 공식 CDN
//  - KBL: api.kbl.or.kr/match/list (헤더 Channel: WEB, TeamCode: XX 필수), EASL 등 다른 대회도 같이 옴 → 정규·PO만
//  - WKBL: wkbl.or.kr/game/sch/inc_list_1_new.asp (HTML 목록). 사이트가 첫 팀에 'away' 클래스를 붙이지만
//          경기장이 첫 팀 홈이라(예: 신한은행 인천도원) 첫 팀 = 홈으로 본다.
//  - V리그 남·여: user-api.kovo.co.kr/mains/games/schedules?gender=MALE|FEMALE (오늘 앞뒤 며칠)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const compact = (d: string) => d.replaceAll('-', '')
const kstIso = (date: string, hhmm: string) => new Date(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(-2)}:00+09:00`).toISOString()

interface Team { name?: string; full?: string | null; abbr?: string | null; record?: string | null; score?: string | number | null }
interface Game { id: string; start: string; home: Team; away: Team; venue?: string | null; status?: string | null; note?: string | null }

// ── NBA ──
async function espnDay(d: string) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact(d)}`, { headers: { ...UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`espn ${d} ${res.status}`)
  return (await res.json()).events ?? []
}
async function nbaFromEspn(date: string): Promise<Game[]> {
  const prev = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10)
  const events = [...await espnDay(prev), ...await espnDay(date)]
  return events.filter((e: any) => kstDate(Date.parse(e.date)) === date).map((e: any) => {
    const c = e.competitions?.[0]
    const team = (side: string): Team => {
      const t = c?.competitors?.find((x: any) => x.homeAway === side)
      return { name: t?.team?.displayName, abbr: t?.team?.abbreviation, record: t?.records?.[0]?.summary ?? null, score: t?.score ?? null }
    }
    return { id: String(e.id), start: e.date, home: team('home'), away: team('away'), venue: c?.venue?.fullName ?? null, status: c?.status?.type?.shortDetail ?? null }
  })
}
async function nbaFromCdn(date: string): Promise<Game[]> {
  const res = await fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', { headers: { ...UA, Referer: 'https://www.nba.com/' } })
  if (!res.ok) throw new Error(`nbacdn ${res.status}`)
  const json = await res.json()
  const out: Game[] = []
  for (const d of json?.leagueSchedule?.gameDates ?? []) for (const g of d.games ?? []) {
    const start = g.gameDateTimeUTC
    if (!start || kstDate(Date.parse(start)) !== date) continue
    const team = (t: any): Team => ({ name: `${t?.teamCity ?? ''} ${t?.teamName ?? ''}`.trim(), abbr: t?.teamTricode, record: t?.wins != null ? `${t.wins}-${t.losses}` : null })
    out.push({ id: String(g.gameId), start, home: team(g.homeTeam), away: team(g.awayTeam), venue: g.arenaName ?? null, status: g.gameStatusText ?? null })
  }
  return out
}
async function nba(dates: string[]) {
  const out: Record<string, Game[]> = {}
  for (const d of dates) { try { out[d] = await nbaFromEspn(d) } catch { out[d] = await nbaFromCdn(d) } }
  return out
}

// ── KBL ──
async function kbl(dates: string[]) {
  const sorted = [...dates].sort()
  const res = await fetch(`https://api.kbl.or.kr/match/list?fromDate=${compact(sorted[0])}&toDate=${compact(sorted.at(-1)!)}&tcodeList=all`,
    { headers: { ...UA, Channel: 'WEB', TeamCode: 'XX', Referer: 'https://www.kbl.or.kr/', Origin: 'https://www.kbl.or.kr' } })
  if (!res.ok) throw new Error(`kbl ${res.status}`)
  const list: any[] = await res.json()
  const out: Record<string, Game[]> = Object.fromEntries(dates.map(d => [d, []]))
  for (const g of list) {
    if (g.gameCode === '07' || g.seasonCategory === 'EA') continue // EASL 등 국제 대회 제외
    const date = `${g.gameDate.slice(0, 4)}-${g.gameDate.slice(4, 6)}-${g.gameDate.slice(6, 8)}`
    if (!out[date]) continue
    out[date].push({
      id: String(g.gmkey), start: kstIso(date, g.gameStart ?? '1900'),
      home: { name: g.tnameH, full: g.tnameFH || null, score: g.isStarted ? g.scoreH : null }, away: { name: g.tnameA, full: g.tnameFA || null, score: g.isStarted ? g.scoreA : null },
      venue: g.stadiumnameF || g.stadiumname || null, status: g.isEnded ? '종료' : g.isStarted ? '진행 중' : null,
      note: g.seasonCategoryName && g.seasonCategoryName !== '정규시즌' ? g.seasonCategoryName : null,
    })
  }
  return out
}

// ── WKBL ──
async function wkbl(dates: string[]) {
  const page = await (await fetch('https://www.wkbl.or.kr/game/sch/schedule1.asp', { headers: UA })).text()
  const season = page.match(/season_gu\s*=\s*['"]?(\d{3})/)?.[1] ?? page.match(/season_gu=(\d{3})/)?.[1]
  if (!season) throw new Error('wkbl season_gu 못 찾음')
  const out: Record<string, Game[]> = Object.fromEntries(dates.map(d => [d, []]))
  for (const ym of [...new Set(dates.map(d => compact(d).slice(0, 6)))]) {
    const res = await fetch(`https://www.wkbl.or.kr/game/sch/inc_list_1_new.asp?season_gu=${season}&ym=${ym}&viewType=1&gun=1`, { headers: UA })
    if (!res.ok) throw new Error(`wkbl ${res.status}`)
    const html = await res.text()
    let n = 0
    for (const m of html.matchAll(/<tr id="(\d{8})"[^>]*>([\s\S]*?)<\/tr>/g)) {
      const date = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`
      if (!out[date]) continue
      const teams = [...m[2].matchAll(/team_name[^"]*"[^>]*data-kr="([^"]+)"/g)].map(x => x[1])
      if (teams.length < 2) continue
      const time = m[2].match(/<td>\s*(\d{1,2}:\d{2})\s*<\/td>/)?.[1] ?? '19:00'
      const venue = m[2].match(/<td class="language" data-kr="([^"]+)"/)?.[1] ?? null
      out[date].push({ id: `wkbl-${m[1]}-${n++}`, start: kstIso(date, time.padStart(5, '0')), home: { name: teams[0] }, away: { name: teams[1] }, venue })
    }
  }
  return out
}

// ── V리그 ──
async function kovo(gender: 'MALE' | 'FEMALE', dates: string[]) {
  const res = await fetch(`https://user-api.kovo.co.kr/mains/games/schedules?gender=${gender}`, { headers: { ...UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`kovo ${res.status}`)
  const list: any[] = (await res.json()).payload ?? []
  const out: Record<string, Game[]> = Object.fromEntries(dates.map(d => [d, []]))
  for (const g of list) {
    if (!out[g.gameDate]) continue
    const ended = !!g.endTime
    out[g.gameDate].push({
      id: `kovo-${g.season?.value}-${g.league?.value}-${g.number}-${gender}`, start: kstIso(g.gameDate, g.startTime ?? '19:00'),
      home: { name: g.homeTeam?.name, score: ended || g.currentSet ? g.homeTeam?.score : null },
      away: { name: g.awayTeam?.name, score: ended || g.currentSet ? g.awayTeam?.score : null },
      venue: g.place ?? null, status: ended ? '종료' : g.currentSet ? `${g.currentSet}세트` : null,
      note: g.league?.name && g.league.name !== 'Regular Season' ? g.league.name : null,
    })
  }
  return out
}

const SOURCES: { sport: string; league: string; run: (dates: string[]) => Promise<Record<string, Game[]>> }[] = [
  { sport: 'basketball', league: 'NBA', run: nba },
  { sport: 'basketball', league: 'KBL', run: kbl },
  { sport: 'basketball', league: 'WKBL', run: wkbl },
  { sport: 'volleyball', league: 'V리그 남자', run: d => kovo('MALE', d) },
  { sport: 'volleyball', league: 'V리그 여자', run: d => kovo('FEMALE', d) },
]

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const dates: string[] = body?.dates ?? [kstDate(Date.now()), kstDate(Date.now() + 86400000)]
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const out = await Promise.all(SOURCES.map(async s => {
    try {
      const byDate = await s.run(dates)
      const rows = Object.entries(byDate).map(([game_date, games]) => ({
        sport: s.sport, league: s.league, game_date, games: games.sort((a, b) => a.start.localeCompare(b.start)), fetched_at: new Date().toISOString(),
      }))
      const { error } = await sb.from('game_schedules').upsert(rows)
      return { league: s.league, counts: Object.fromEntries(rows.map(r => [r.game_date, r.games.length])), dbError: error?.message }
    } catch (e) {
      return { league: s.league, error: String(e) } // 실패한 리그는 예전 데이터 그대로 둔다
    }
  }))
  // 일주일 지난 일정은 지운다
  await sb.from('game_schedules').delete().lt('game_date', kstDate(Date.now() - 7 * 86400000))
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

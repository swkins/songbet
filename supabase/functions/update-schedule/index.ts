// 다음 경기 일정 받아서 game_schedules에 저장 (한국 날짜 기준).
// body: { dates?: ['YYYY-MM-DD', ...] (KST, 기본 = 오늘·내일) }
// pg_cron 'update-schedule-am'(10:00 KST)·'update-schedule-pm'(22:00 KST)이 부른다.
// NBA: ESPN scoreboard (미국 날짜 하루씩, KST 하루 = 미국 전날·당일), 막히면 NBA 공식 CDN.
// 배포: Supabase MCP deploy_edge_function (verify_jwt true, anon 키로 호출)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept': 'application/json' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const compact = (d: string) => d.replaceAll('-', '')

async function espnDay(d: string) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact(d)}`, { headers: UA })
  if (!res.ok) throw new Error(`espn ${d} ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).events ?? []
}

async function nbaFromEspn(date: string, prev: string) {
  const events = [...await espnDay(prev), ...await espnDay(date)]
  return events.filter((e: any) => kstDate(Date.parse(e.date)) === date).map((e: any) => {
    const c = e.competitions?.[0]
    const team = (side: string) => {
      const t = c?.competitors?.find((x: any) => x.homeAway === side)
      return { name: t?.team?.displayName, abbr: t?.team?.abbreviation, record: t?.records?.[0]?.summary ?? null, score: t?.score ?? null }
    }
    return { id: String(e.id), start: e.date, home: team('home'), away: team('away'), venue: c?.venue?.fullName ?? null, status: c?.status?.type?.shortDetail ?? null }
  })
}

async function nbaFromCdn(date: string) {
  const res = await fetch('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', { headers: { ...UA, 'Referer': 'https://www.nba.com/', 'Origin': 'https://www.nba.com' } })
  if (!res.ok) throw new Error(`nbacdn ${res.status}`)
  const json = await res.json()
  const out: any[] = []
  for (const d of json?.leagueSchedule?.gameDates ?? []) for (const g of d.games ?? []) {
    const start = g.gameDateTimeUTC
    if (!start || kstDate(Date.parse(start)) !== date) continue
    const team = (t: any) => ({ name: `${t?.teamCity ?? ''} ${t?.teamName ?? ''}`.trim(), abbr: t?.teamTricode, record: t?.wins != null ? `${t.wins}-${t.losses}` : null, score: null })
    out.push({ id: String(g.gameId), start, home: team(g.homeTeam), away: team(g.awayTeam), venue: g.arenaName ?? null, status: g.gameStatusText ?? null })
  }
  return out
}

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const dates: string[] = body?.dates ?? [kstDate(Date.now()), kstDate(Date.now() + 86400000)]
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const out: any[] = []
  for (const date of dates) {
    const prev = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10)
    const errors: string[] = []
    let games: any[] | null = null, source = ''
    try { games = await nbaFromEspn(date, prev); source = 'espn' } catch (e) { errors.push(String(e)) }
    if (!games) { try { games = await nbaFromCdn(date); source = 'nba.com' } catch (e) { errors.push(String(e)) } }
    if (!games) { out.push({ league: 'NBA', date, errors }); continue }
    games.sort((a, b) => a.start.localeCompare(b.start))
    const { error } = await sb.from('game_schedules').upsert({ sport: 'basketball', league: 'NBA', game_date: date, games, fetched_at: new Date().toISOString() })
    out.push({ league: 'NBA', date, source, count: games.length, errors, dbError: error?.message })
  }
  // 일주일 지난 일정은 지운다
  await sb.from('game_schedules').delete().lt('game_date', kstDate(Date.now() - 7 * 86400000))
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

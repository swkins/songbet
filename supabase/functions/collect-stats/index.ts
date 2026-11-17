// 선수 경기별 기록 수집 → player_game_stats (오버롤 체급·최근폼용).
// body: { group: 'nba' | 'domestic', from?: 'YYYY-MM-DD', max?: number }
//  - nba: ESPN scoreboard(미국 날짜) → 끝난 경기 → summary 박스스코어. pg_cron 매일 18~19시 KST(랜덤 분).
//  - domestic: KBL(api.kbl.or.kr match/{gmkey}/player-stat) · WKBL(ajax_game_result_2.asp 박스스코어 HTML)
//              · V리그(KOVO 선수 시즌 누적 스냅샷 → 전날 차이로 경기 기록). pg_cron 매일 새벽 3~4시 KST(랜덤 분).
//  이미 넣은 경기는 건너뛴다. 한 번에 max경기까지만(기본 40) — 시즌 첫 수집은 여러 번 불러 채운다(응답 remaining).
//  보관: 지난 시즌까지만 (그 전 시즌은 지움), KOVO 스냅샷은 14일.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const compact = (d: string) => d.replaceAll('-', '')
const dash = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
function seasonOf(d: string) { const y = +d.slice(0, 4), m = +d.slice(5, 7); const s = m >= 8 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}` }
const SEASON_START: Record<string, string> = { NBA: '2026-10-20', KBL: '2026-10-01', WKBL: '2026-10-25' }
const int = (v: unknown) => { const n = parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : null }
const pair = (v: unknown): [number | null, number | null] => { const m = String(v ?? '').match(/(\d+)\s*-\s*(\d+)/); return m ? [+m[1], +m[2]] : [null, null] }
const mins = (v: unknown) => { const s = String(v ?? ''); const m = s.match(/^(\d+):(\d+)$/); return m ? +m[1] + +m[2] / 60 : (Number.isFinite(+s) ? +s : null) }

type Row = Record<string, unknown>
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function existingIds(db: ReturnType<typeof sb>, league: string, from: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (let p = 0; ; p += 1000) {
    const { data } = await db.from('player_game_stats').select('game_id').eq('league', league).gte('game_date', from).range(p, p + 999)
    data?.forEach(r => out.add(r.game_id)); if (!data || data.length < 1000) break
  }
  return out
}
// 시작 날짜: 지정이 없으면 마지막으로 넣은 경기 이틀 전부터 (처음이면 시즌 시작)
async function startFrom(db: ReturnType<typeof sb>, league: string, given?: string): Promise<string> {
  if (given) return given
  const { data } = await db.from('player_game_stats').select('game_date').eq('league', league).order('game_date', { ascending: false }).limit(1)
  return data?.[0]?.game_date ? addDays(data[0].game_date, -2) : SEASON_START[league]
}
async function insert(db: ReturnType<typeof sb>, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('player_game_stats').upsert(rows.slice(i, i + 500), { onConflict: 'league,game_id,player_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

// ── NBA (ESPN) ──
async function nba(db: ReturnType<typeof sb>, from: string, max: number) {
  const today = kstDate(Date.now()), have = await existingIds(db, 'NBA', addDays(from, -1))
  const todo: string[] = []
  for (let d = from; d <= today && todo.length < max * 3; d = addDays(d, 1)) {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact(d)}`, { headers: UA })
    if (!res.ok) continue
    for (const e of (await res.json()).events ?? []) if (e?.status?.type?.completed && !have.has(String(e.id))) todo.push(String(e.id))
  }
  let done = 0; const rows: Row[] = []
  for (const id of todo.slice(0, max)) {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`, { headers: UA })
    if (!res.ok) continue
    const j = await res.json()
    const comp = j?.header?.competitions?.[0]; const cs: any[] = comp?.competitors ?? []
    const date = kstDate(Date.parse(comp?.date)); const season = seasonOf(date)
    for (const tb of j?.boxscore?.players ?? []) {
      const me = cs.find(c => String(c.team?.id) === String(tb.team?.id)); const opp = cs.find(c => c !== me)
      const st = tb.statistics?.[0]; if (!st) continue
      const keys: string[] = (st.keys ?? st.names ?? []).map((k: string) => k.toLowerCase())
      const at = (k: string[], s: string[]) => { const i = keys.findIndex(x => k.includes(x)); return i >= 0 ? s[i] : undefined }
      for (const a of st.athletes ?? []) {
        if (a.didNotPlay || !a.stats?.length) continue
        const s: string[] = a.stats
        const [fgm, fga] = pair(at(['fieldgoalsmade-fieldgoalsattempted', 'fg'], s))
        const [tpm, tpa] = pair(at(['threepointfieldgoalsmade-threepointfieldgoalsattempted', '3pt'], s))
        const [ftm, fta] = pair(at(['freethrowsmade-freethrowsattempted', 'ft'], s))
        rows.push({
          league: 'NBA', season, game_id: id, game_date: date, team: tb.team?.displayName, opp: opp?.team?.displayName ?? null, is_home: me?.homeAway === 'home',
          player_id: String(a.athlete?.id), player_name: a.athlete?.displayName, pos: a.athlete?.position?.abbreviation ?? null, starter: !!a.starter,
          minutes: mins(at(['minutes', 'min'], s)), pts: int(at(['points', 'pts'], s)), reb: int(at(['rebounds', 'reb'], s)), ast: int(at(['assists', 'ast'], s)),
          stl: int(at(['steals', 'stl'], s)), blk: int(at(['blocks', 'blk'], s)), tov: int(at(['turnovers', 'to'], s)),
          fgm, fga, tpm, tpa, ftm, fta, plus_minus: int(String(at(['plusminus', '+/-'], s) ?? '').replace('+', '')),
          extra: { team_score: int(me?.score), opp_score: int(opp?.score) },
        })
      }
    }
    done++
  }
  await insert(db, rows)
  return { league: 'NBA', games: done, rows: rows.length, remaining: Math.max(0, todo.length - done) }
}

// ── KBL ──
const KBL_H = { ...UA, Channel: 'WEB', TeamCode: 'XX', Referer: 'https://www.kbl.or.kr/', Origin: 'https://www.kbl.or.kr' }
async function kbl(db: ReturnType<typeof sb>, from: string, max: number) {
  const today = kstDate(Date.now()), have = await existingIds(db, 'KBL', from)
  const res = await fetch(`https://api.kbl.or.kr/match/list?fromDate=${compact(from)}&toDate=${compact(today)}&tcodeList=all`, { headers: KBL_H })
  if (!res.ok) throw new Error(`kbl list ${res.status}`)
  const games = ((await res.json()) as any[]).filter(g => g.isEnded && (g.seasonCategoryName === '정규시즌' || /플레이오프|챔피언/.test(g.seasonCategoryName ?? '')) && !have.has(String(g.gmkey)))  // 컵대회·EASL 등 제외
  let done = 0; const rows: Row[] = []
  for (const g of games.slice(0, max)) {
    const r = await fetch(`https://api.kbl.or.kr/match/${g.gmkey}/player-stat`, { headers: KBL_H })
    if (!r.ok) continue
    const date = dash(g.gameDate)
    for (const p of (await r.json()) as any[]) {
      const rc = p.records ?? {}; const pl = p.player ?? {}
      if (!rc.playMin && !rc.playSec) continue
      const home = String(pl.tcode) === String(g.tcodeH)
      rows.push({
        league: 'KBL', season: seasonOf(date), game_id: String(g.gmkey), game_date: date, team: pl.tname ?? (home ? g.tnameH : g.tnameA), opp: home ? g.tnameA : g.tnameH, is_home: home,
        player_id: String(pl.pcode), player_name: pl.pname, pos: pl.pos ?? null, starter: null,
        minutes: (rc.playMin ?? 0) + (rc.playSec ?? 0) / 60, pts: rc.score ?? null, reb: rc.rb ?? null, ast: rc.ast ?? null, stl: rc.stl ?? null, blk: rc.bs ?? null, tov: rc.to ?? null,
        fgm: rc.fgt ?? null, fga: rc.fgtA ?? null, tpm: rc.threep ?? null, tpa: rc.threepA ?? null, ftm: rc.ft ?? null, fta: rc.ftA ?? null, plus_minus: rc.marginCn ?? null,
        extra: { team_score: home ? g.scoreH : g.scoreA, opp_score: home ? g.scoreA : g.scoreH, per: rc.per, netrtg: rc.netrtg, usg: rc.usgRt, foreign: pl.playerFlag === '1' || undefined },
      })
    }
    done++
  }
  await insert(db, rows)
  return { league: 'KBL', games: done, rows: rows.length, remaining: Math.max(0, games.length - done) }
}

// ── WKBL ──
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
async function wkbl(db: ReturnType<typeof sb>, from: string, max: number) {
  const today = kstDate(Date.now()), have = await existingIds(db, 'WKBL', from)
  const page = await (await fetch('https://www.wkbl.or.kr/game/sch/schedule1.asp', { headers: UA })).text()
  const seasonGu = page.match(/season_gu\s*=\s*['"]?(\d{3})/)?.[1] ?? page.match(/season_gu=(\d{3})/)?.[1]
  if (!seasonGu) throw new Error('wkbl season_gu')
  const yms: string[] = []
  for (let d = from.slice(0, 7); d <= today.slice(0, 7); d = addDays(`${d}-01`, 32).slice(0, 7)) yms.push(d.replace('-', ''))
  const todo: { no: string; ym: string; date: string; home: string; away: string }[] = []
  for (const ym of yms) {
    const html = await (await fetch(`https://www.wkbl.or.kr/game/sch/inc_list_1_new.asp?season_gu=${seasonGu}&ym=${ym}&viewType=1&gun=1`, { headers: UA })).text()
    for (const m of html.matchAll(/<tr id="(\d{8})"[^>]*>([\s\S]*?)<\/tr>/g)) {
      const no = m[2].match(/game_no=(\d+)/)?.[1]; if (!no) continue
      const teams = [...m[2].matchAll(/team_name[^"]*"[^>]*data-kr="([^"]+)"/g)].map(x => x[1])
      const id = `wkbl-${seasonGu}-${no}`
      if (!have.has(id) && teams.length >= 2) todo.push({ no, ym, date: dash(m[1]), home: teams[0], away: teams[1] })
    }
  }
  let done = 0; const rows: Row[] = []
  for (const g of todo.slice(0, max)) {
    // 이 서버는 요청 헤더를 붙이면 400(Invalid Header)을 내서 헤더 없이 부른다
    const html = await (await fetch(`https://www.wkbl.or.kr/game/ajax/ajax_game_result_2.asp?season_gu=${seasonGu}&game_type=01&game_no=${g.no}&ym=${g.ym}&h_player=&a_player=`)).text()
    const id = `wkbl-${seasonGu}-${g.no}`
    // 팀 이름 h4 다음 표가 그 팀 선수 기록
    const parts = html.split(/<h4 class="tit_area[^"]*"[^>]*data-kr="/).slice(1)
    const totals: Record<string, number> = {}
    const teamRows: { team: string; rows: Row[] }[] = []
    for (const part of parts) {
      const team = part.slice(0, part.indexOf('"'))
      const body = part.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]; if (!body) continue
      const list: Row[] = []
      for (const tr of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1])
        if (tds.length < 15) continue
        const pno = tds[0].match(/pno=(\d+)/)?.[1]; const name = strip(tds[0])
        if (!pno) { if (name.includes('합계')) totals[team] = int(strip(tds[14])) ?? 0; continue }
        const [p2m, p2a] = pair(strip(tds[3])); const [tpm, tpa] = pair(strip(tds[4])); const [ftm, fta] = pair(strip(tds[5]))
        list.push({ player_id: pno, player_name: name, pos: strip(tds[1]) || null, minutes: mins(strip(tds[2])),
          fgm: (p2m ?? 0) + (tpm ?? 0), fga: (p2a ?? 0) + (tpa ?? 0), tpm, tpa, ftm, fta,
          reb: int(strip(tds[8])), ast: int(strip(tds[9])), stl: int(strip(tds[11])), tov: int(strip(tds[12])), blk: int(strip(tds[13])), pts: int(strip(tds[14])) })
      }
      if (list.length) { teamRows.push({ team, rows: list }); totals[team] ??= list.reduce((a, r) => a + ((r.pts as number) ?? 0), 0) }
    }
    if (teamRows.length < 2) continue
    for (const { team, rows: list } of teamRows) {
      const opp = teamRows.find(t => t.team !== team)?.team ?? null
      for (const r of list) rows.push({ league: 'WKBL', season: seasonOf(g.date), game_id: id, game_date: g.date, team, opp, is_home: team === g.home, starter: null, plus_minus: null,
        ...r, extra: { team_score: totals[team] ?? null, opp_score: opp ? totals[opp] ?? null : null } })
    }
    done++
  }
  await insert(db, rows)
  return { league: 'WKBL', games: done, rows: rows.length, remaining: Math.max(0, todo.length - done) }
}

// ── V리그 (KOVO): 시즌 누적 스냅샷 → 전날 대비 차이 = 그 경기 기록 ──
const KOVO = 'https://user-api.kovo.co.kr'
const KH = { ...UA, Accept: 'application/json', 'Accept-Language': 'ko' }
async function kovoJson(path: string) { const r = await fetch(KOVO + path, { headers: KH }); if (!r.ok) return null; const j = await r.json(); return j?.result?.status === 200 ? j.payload : null }
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}
const VB_KEYS = ['attackTry', 'attackSuccess', 'attackError', 'blockTry', 'blockSuccess', 'serveTry', 'serveSuccess', 'serveError', 'setTry', 'setSuccess', 'receiveTry', 'receiveSuccess', 'digTry', 'digSuccess', 'setCount']
async function kovo(db: ReturnType<typeof sb>) {
  const today = kstDate(Date.now())
  // 팀 이름: 경기 일정에서 코드→이름
  const names: Record<string, string> = {}
  for (const gender of ['MALE', 'FEMALE']) for (const g of (await kovoJson(`/mains/games/schedules?gender=${gender}`)) ?? []) { names[g.homeTeam?.code] = g.homeTeam?.name; names[g.awayTeam?.code] = g.awayTeam?.name }
  const codes = [...Array.from({ length: 12 }, (_, i) => String(1001 + i)), ...Array.from({ length: 12 }, (_, i) => String(2001 + i))]
  const rosters = await pool(codes, 6, async c => ({ c, players: ((await kovoJson(`/teams/${c}/players`)) ?? []) as any[] }))
  const players = rosters.flatMap(r => r.players.filter(p => p.visible !== false).map(p => ({ code: String(p.playerCode), name: p.name, team: r.c })))
  const snaps = (await pool(players, 10, async p => {
    const d = await kovoJson(`/players/${p.code}/season-record-detail`)
    return d && d.gameCount ? { snapshot_date: today, gender: p.team.startsWith('1') ? 'MALE' : 'FEMALE', player_code: p.code, player_name: p.name, team_code: p.team, game_count: d.gameCount, stats: d } : null
  })).filter(Boolean) as Row[]
  if (snaps.length) { const { error } = await db.from('kovo_player_snapshots').upsert(snaps); if (error) throw new Error(error.message) }
  // 바로 전 스냅샷과 비교 — 경기 수가 정확히 1 늘었으면 그 경기 기록
  const { data: prevRows } = await db.from('kovo_player_snapshots').select('*').lt('snapshot_date', today).gte('snapshot_date', addDays(today, -7)).order('snapshot_date', { ascending: false })
  const prev = new Map<string, any>(); (prevRows ?? []).forEach(r => { if (!prev.has(r.player_code)) prev.set(r.player_code, r) })
  const rows: Row[] = []; const date = addDays(today, -1)
  for (const s of snaps as any[]) {
    const p = prev.get(s.player_code); if (!p || s.game_count - p.game_count !== 1) continue
    const d: Record<string, number> = {}; for (const k of VB_KEYS) d[k] = (s.stats[k] ?? 0) - (p.stats?.[k] ?? 0)
    const league = s.gender === 'MALE' ? 'VLEAGUE_M' : 'VLEAGUE_W'
    rows.push({ league, season: seasonOf(date), game_id: `kovo-${s.team_code}-${p.snapshot_date}-${today}`, game_date: date, team: names[s.team_code] ?? s.team_code, opp: null, is_home: null,
      player_id: s.player_code, player_name: s.player_name, pos: null, starter: null, minutes: null,
      pts: d.attackSuccess + d.blockSuccess + d.serveSuccess, reb: null, ast: null, stl: null, blk: d.blockSuccess, tov: null,
      fgm: null, fga: null, tpm: null, tpa: null, ftm: null, fta: null, plus_minus: null, extra: { ...d, from_snapshot: p.snapshot_date } })
  }
  await insert(db, rows)
  await db.from('kovo_player_snapshots').delete().lt('snapshot_date', addDays(today, -14))
  return { league: 'VLEAGUE', snapshots: snaps.length, rows: rows.length }
}

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const db = sb(); const max = body.max ?? 40
  const jobs: [string, () => Promise<unknown>][] = body.group === 'nba'
    ? [['NBA', async () => nba(db, await startFrom(db, 'NBA', body.from), max)]]
    : [['KBL', async () => kbl(db, await startFrom(db, 'KBL', body.from), max)], ['WKBL', async () => wkbl(db, await startFrom(db, 'WKBL', body.from), max)],
       ...(body.skipKovo ? [] : [['VLEAGUE', () => kovo(db)] as [string, () => Promise<unknown>]])]
  const out: unknown[] = []
  for (const [name, fn] of jobs) { try { out.push(await fn()) } catch (e) { out.push({ league: name, error: String(e) }) } }
  // 보관: 지난 시즌까지만
  const cur = seasonOf(kstDate(Date.now())); const prevSeason = `${+cur.slice(0, 4) - 1}-${cur.slice(2, 4)}`
  await db.from('player_game_stats').delete().lt('season', prevSeason)
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

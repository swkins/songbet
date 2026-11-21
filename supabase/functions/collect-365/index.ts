// 365Scores 배구 일정·결과·배당 (2026-11-22 사용자 요청 — BetExplorer보다 365Scores를 먼저)
//  - V리그 남·여: 일정·결과는 KOVO 그대로(경기 id·선수 기록·예측이 이어지게), 배당만 365Scores(Bet365 승패, 오픈 포함) → KOVO 경기에 시작 시각(±40분)으로 맞춤.
//    collect-odds(BetExplorer)는 최근 3시간 안에 365Scores가 남은 경기 배당을 다 받았으면 건너뛴다 (백업).
//  - 해외 배구(이탈리아·폴란드·터키·브라질 남·여, 체코 남자, 벨기에 여자): 일정·결과·배당 모두 365Scores → game_schedules (id '365-경기id').
// 출처: webws.365scores.com/web/games/current/?competitions=<id> (그 리그 앞뒤 경기 약 15~20개, userCountryId=1이어야 배당이 붙음 — 한국·미국은 배당 없음).
//   공식 공개 API가 아니라 앱이 쓰는 주소 — 막히면 odds_fetch_log status blocked/error. 리그 사이 1~2.5초 쉼.
// 팀 이름: DB sports_team_names(sport, league, src = 365 영어 이름, ko = 리그 관리 등록 이름) → 없으면 영어 이름에서 ' (W)'만 뗀 것.
// 상태: statusGroup 2 경기 전 · 3 경기중(statusText 'Set 2' 등) · 4 끝(Ended → '종료', Postponed → '연기', Cancelled → '취소', Abandoned/Suspended → '중단').
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const SRC = '365-bet365'

// own = 일정·결과도 365Scores로 (false = V리그: 배당만)
const LEAGUES: { league: string; comp: number; own: boolean }[] = [
  { league: 'V리그 남자', comp: 8344, own: false }, { league: 'V리그 여자', comp: 8343, own: false },
  { league: '이탈리아 남자', comp: 5723, own: true }, { league: '이탈리아 여자', comp: 5729, own: true },
  { league: '폴란드 남자', comp: 5772, own: true }, { league: '폴란드 여자', comp: 8093, own: true },
  { league: '터키 남자', comp: 5766, own: true }, { league: '터키 여자', comp: 7897, own: true },
  { league: '브라질 남자', comp: 5710, own: true }, { league: '브라질 여자', comp: 5711, own: true },
  { league: '체코 남자', comp: 5757, own: true }, { league: '벨기에 여자', comp: 8301, own: true },
]

const statusOf = (g: any): string | null => {
  const t = String(g.statusText ?? '')
  if (g.statusGroup === 3) return t || '경기 중'
  if (g.statusGroup === 4) {
    if (/postpon|delay/i.test(t)) return '연기'
    if (/cancel/i.test(t)) return '취소'
    if (/abandon|suspend|interrupt/i.test(t)) return '중단'
    return '종료'
  }
  return null
}

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const only: string | undefined = body.league
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: nm } = await db.from('sports_team_names').select('league, src, ko').eq('sport', 'volleyball')
  const names = new Map((nm ?? []).map((r: any) => [`${r.league}|${r.src}`, r.ko]))
  const today = kstDate(Date.now())
  const window = new Set([-1, 0, 1, 2].map(d => kstDate(Date.now() + d * 86400000)))
  const results: Record<string, unknown> = {}

  for (const [i, L] of LEAGUES.filter(l => !only || l.league === only).entries()) {
    if (i) await sleep(1000 + Math.random() * 1500)
    const log = async (status: string, note: Record<string, unknown>) => { await db.from('odds_fetch_log').insert({ league: L.league, status, note: { src: '365', ...note } }); results[L.league] = { status, ...note } }
    let games: any[] = []
    try {
      const r = await fetch(`https://webws.365scores.com/web/games/current/?appTypeId=5&langId=1&timezoneName=Asia/Seoul&userCountryId=1&competitions=${L.comp}&showOdds=true`, { headers: UA })
      if (r.status === 429 || r.status === 403) { await log('blocked', { http: r.status }); continue }
      if (!r.ok) { await log('error', { http: r.status }); continue }
      games = (await r.json())?.games ?? []
    } catch (e) { await log('error', { message: String(e).slice(0, 120) }); continue }

    const nameOf = (n: string) => names.get(`${L.league}|${n}`) ?? n.replace(/\s*\(W\)\s*$/, '')
    const odds: { id: string; date: string; h: number; a: number; oh: number | null; oa: number | null; name: string }[] = []
    let matched = 0
    if (L.own) {
      // 리그 관리 팀 목록에 새 팀 추가 (베팅추가 팀 이름 추천·자동 판정 이름 맞추기용)
      const teamRows = [...new Set(games.flatMap(g => [g.homeCompetitor?.name, g.awayCompetitor?.name]).filter(Boolean).map((n: string) => nameOf(n)))].map(name => ({ league: L.league, name }))
      if (teamRows.length) await db.from('volleyball_teams').upsert(teamRows, { onConflict: 'league,name', ignoreDuplicates: true })
      // 일정·결과 → game_schedules (창 안 날짜만 통째로)
      const byDate: Record<string, any[]> = {}
      for (const g of games) {
        const start = new Date(g.startTime).toISOString(); const date = kstDate(Date.parse(start))
        if (!window.has(date)) continue
        const st = statusOf(g)
        const sc = (c: any) => (st && st !== '연기' && st !== '취소' && Number(c?.score) >= 0) ? Number(c.score) : null
        const row = { id: `365-${g.id}`, start, status: st,
          home: { name: nameOf(g.homeCompetitor?.name ?? '?'), full: g.homeCompetitor?.name ?? null, score: sc(g.homeCompetitor) },
          away: { name: nameOf(g.awayCompetitor?.name ?? '?'), full: g.awayCompetitor?.name ?? null, score: sc(g.awayCompetitor) } }
        ;(byDate[date] ??= []).push(row)
        if (g.statusGroup === 2 && g.odds?.options?.length >= 2) {
          const o1 = g.odds.options.find((o: any) => o.num === 1), o2 = g.odds.options.find((o: any) => o.num === 2)
          if (o1?.rate?.decimal && o2?.rate?.decimal) odds.push({ id: row.id, date, h: o1.rate.decimal, a: o2.rate.decimal, oh: o1.originalRate?.decimal ?? null, oa: o2.originalRate?.decimal ?? null, name: `${row.home.full} - ${row.away.full}` })
        }
      }
      const rows = Object.entries(byDate).map(([game_date, gs]) => ({ sport: 'volleyball', league: L.league, game_date, games: gs.sort((a, b) => a.start.localeCompare(b.start)), fetched_at: new Date().toISOString() }))
      if (rows.length) { const { error } = await db.from('game_schedules').upsert(rows); if (error) { await log('error', { message: `schedule ${error.message}` }); continue } }
    } else {
      // V리그: KOVO 경기에 시작 시각으로 맞춰 배당만
      const { data: srows } = await db.from('game_schedules').select('game_date, games').eq('league', L.league).gte('game_date', today)
      const kovo = (srows ?? []).flatMap((r: any) => (r.games ?? []).map((g: any) => ({ id: g.id, start: g.start, date: r.game_date, home: g.home?.name, away: g.away?.name })))
      for (const g of games) {
        if (g.statusGroup !== 2 || !(g.odds?.options?.length >= 2)) continue
        const t = Date.parse(g.startTime)
        const cand = kovo.filter(k => Math.abs(Date.parse(k.start) - t) <= 40 * 60000)
        if (cand.length !== 1) continue
        const o1 = g.odds.options.find((o: any) => o.num === 1), o2 = g.odds.options.find((o: any) => o.num === 2)
        if (!o1?.rate?.decimal || !o2?.rate?.decimal) continue
        matched++
        odds.push({ id: cand[0].id, date: cand[0].date, h: o1.rate.decimal, a: o2.rate.decimal, oh: o1.originalRate?.decimal ?? null, oa: o2.originalRate?.decimal ?? null, name: `${g.homeCompetitor?.name} - ${g.awayCompetitor?.name}` })
      }
    }
    // 배당: 같은 출처 마지막 값과 다를 때만
    let changed = 0
    for (const o of odds) {
      const { data: prev } = await db.from('odds_snapshots').select('home_odds, away_odds').eq('game_id', o.id).eq('source', SRC).order('fetched_at', { ascending: false }).limit(1)
      const p = prev?.[0]
      if (p && Number(p.home_odds) === o.h && Number(p.away_odds) === o.a) continue
      const { error } = await db.from('odds_snapshots').insert({ league: L.league, game_date: o.date, game_id: o.id, source: SRC, home_odds: o.h, away_odds: o.a, open_home: o.oh, open_away: o.oa, books: 1, match_name: o.name })
      if (!error) changed++
    }
    await log('ok', { games: games.length, odds: odds.length, changed, ...(L.own ? {} : { matched }) })
  }
  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
})

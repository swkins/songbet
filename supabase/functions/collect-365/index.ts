// 365Scores 배구·KBL 일정·결과·배당 (2026-11-22 사용자 요청 — BetExplorer보다 365Scores를 먼저; 2026-11-28 KBL 추가 — 배당만, 일정은 KBL 공식 그대로; KBL은 핸디·언오버 기준점도 odds_lines에)
//  - V리그 남·여: 일정·결과는 KOVO 그대로(경기 id·선수 기록·예측이 이어지게), 배당만 365Scores(Bet365 승패, 오픈 포함) → KOVO 경기에 시작 시각(±40분)으로 맞춤.
//    collect-odds(BetExplorer)는 최근 3시간 안에 365Scores가 남은 경기 배당을 다 받았으면 건너뛴다 (백업).
//  - (해외 배구 일정·결과·배당은 2026-11-22 사용자 요청으로 뺐다 — own: true 리그는 일정·결과도 365Scores → game_schedules id '365-경기id')
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
// 2026-11-22 사용자 요청으로 해외 배구(이탈리아·폴란드·터키·브라질·체코·벨기에)는 뺐다 — 다시 넣으려면 own: true 줄을 더하면 된다
//  (id: 이탈리아 남 5723·여 5729, 폴란드 남 5772·여 8093, 터키 남 5766·여 7897, 브라질 남 5710·여 5711, 체코 남 5757, 벨기에 여 8301)
const LEAGUES: { league: string; comp: number; own: boolean; sport: string }[] = [
  { league: 'V리그 남자', comp: 8344, own: false, sport: 'volleyball' }, { league: 'V리그 여자', comp: 8343, own: false, sport: 'volleyball' },
  { league: 'KBL', comp: 401, own: false, sport: 'basketball' },
]
// 같은 시각 경기가 여럿일 때(KBL 주말 등) 팀 이름으로 고른다: 365 영어 이름 → 일정 한글 이름에 들어 있는 글자 (collect-odds ALIAS와 같음)
const ALIAS: Record<string, [RegExp, string][]> = {
  KBL: [[/thunders|samsung/i, '삼성'], [/sakers|\blg\b|changwon/i, 'LG'], [/knights|\bsk\b/i, 'SK'], [/mobis|phoebus|ulsan/i, '현대모비스'], [/sono|goyang/i, '소노'], [/wonju|promy|\bdb\b/i, 'DB'],
        [/kcc|egis|busan/i, 'KCC'], [/kogas|pegasus|daegu/i, '가스공사'], [/suwon|\bkt\b|sonicboom/i, 'KT'], [/jungkwanjang|anyang|red boosters|kgc/i, '정관장']],
}

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
  const { data: nm } = await db.from('sports_team_names').select('league, src, ko').in('sport', ['volleyball', 'basketball'])
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
    const linked = new Map<number, { id: string; date: string }>()   // 365 경기 id → 우리 경기 (KBL 핸디·언오버용)
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
      const kovo = (srows ?? []).flatMap((r: any) => (r.games ?? []).map((g: any) => ({ id: g.id, start: g.start, date: r.game_date, home: `${g.home?.name ?? ''} ${g.home?.full ?? ''}`, away: `${g.away?.name ?? ''} ${g.away?.full ?? ''}` })))
      for (const g of games) {
        if (g.statusGroup !== 2) continue
        const t = Date.parse(g.startTime)
        let cand = kovo.filter(k => Math.abs(Date.parse(k.start) - t) <= 40 * 60000)
        if (cand.length > 1 && ALIAS[L.league]) {
          const kw = (n: string) => ALIAS[L.league].find(([re]) => re.test(n ?? ''))?.[1]
          const kh = kw(g.homeCompetitor?.name), ka = kw(g.awayCompetitor?.name)
          cand = cand.filter(k => (!kh || String(k.home ?? '').includes(kh)) && (!ka || String(k.away ?? '').includes(ka)))
        }
        if (cand.length !== 1) continue
        linked.set(g.id, { id: cand[0].id, date: cand[0].date })
        if (!(g.odds?.options?.length >= 2)) continue
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
    // KBL 핸디·언오버 기준점 (2026-11-28 사용자 요청 — 기준점 모의베팅용): /web/bets/lines/ = Bet365 메인 + 대안 라인(±0.5·1점).
    //  기준점 = 양쪽 배당이 가장 비슷한 라인 (NBA와 같은 규칙, 같으면 .5 라인). Spread 'Home' 옵션 lead = 홈 기준 핸디(+1.5 = 홈 플핸) → odds_lines.line 그대로.
    //  Total: home_odds = 오버, away_odds = 언더. open_line = 우리가 처음 받은 기준점 (365는 라인별 첫 배당만 줌 — 진짜 오픈 라인은 없음). 바뀐 때만 한 줄.
    let lineChanged = 0, lineGames = 0
    if (L.league === 'KBL' && linked.size) {
      try {
        await sleep(800 + Math.random() * 1200)
        const r = await fetch(`https://webws.365scores.com/web/bets/lines/?appTypeId=5&langId=1&timezoneName=Asia/Seoul&userCountryId=1&games=${[...linked.keys()].join(',')}`, { headers: UA })
        const lines: any[] = r.ok ? ((await r.json())?.lines ?? []) : []
        const pick = (gid: number, type: number) => {
          const cands = lines.filter(l => l.gameId === gid && l.lineTypeId === type && l.bookmakerId === 14).map(l => {
            const o = (n: string) => l.options?.find((x: any) => x.name === n)
            if (type === 35) { const h = o('Home'), a = o('Away'); if (!h?.rate?.decimal || !a?.rate?.decimal || h.lead == null) return null
              return { line: Number(h.lead), h: h.rate.decimal, a: a.rate.decimal, oh: h.originalRate?.decimal ?? null, oa: a.originalRate?.decimal ?? null } }
            const ov = o('Over'), un = o('Under'), v = Number(l.internalOptionValue)
            if (!ov?.rate?.decimal || !un?.rate?.decimal || !Number.isFinite(v)) return null
            return { line: v, h: ov.rate.decimal, a: un.rate.decimal, oh: ov.originalRate?.decimal ?? null, oa: un.originalRate?.decimal ?? null }
          }).filter(Boolean) as { line: number; h: number; a: number; oh: number | null; oa: number | null }[]
          return cands.sort((x, y) => Math.abs(x.h - x.a) - Math.abs(y.h - y.a) || (Math.abs(y.line % 1) - Math.abs(x.line % 1)))[0] ?? null
        }
        for (const [gid, ours] of linked) {
          let any = false
          for (const [type, market] of [[35, 'spread'], [34, 'total']] as const) {
            const m = pick(gid, type); if (!m) continue
            any = true
            const { data: prev } = await db.from('odds_lines').select('line, home_odds, away_odds, open_line').eq('game_id', ours.id).eq('market', market).eq('source', SRC).order('fetched_at', { ascending: false }).limit(1)
            const p = prev?.[0]
            if (p && Number(p.line) === m.line && Number(p.home_odds) === m.h && Number(p.away_odds) === m.a) continue
            const { error } = await db.from('odds_lines').insert({ league: L.league, game_date: ours.date, game_id: ours.id, market, line: m.line, home_odds: m.h, away_odds: m.a,
              open_line: p ? Number(p.open_line ?? p.line) : m.line, open_home: m.oh, open_away: m.oa, books: 1, source: SRC })
            if (!error) lineChanged++
          }
          if (any) lineGames++
        }
      } catch (e) { results[`${L.league} lines`] = String(e).slice(0, 120) }
    }
    await log('ok', { games: games.length, odds: odds.length, changed, ...(L.own ? {} : { matched, linked: linked.size }), ...(L.league === 'KBL' ? { lineGames, lineChanged } : {}) })
  }
  return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } })
})

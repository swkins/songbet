// 승패 배당 수집 → odds_snapshots (바뀌었을 때만 한 줄) + odds_fetch_log (매 요청 결과).
// body: { league: 'NBA' | 'KBL' | 'WKBL' | 'V리그 남자' | 'V리그 여자' }
// 리그마다 pg_cron 작업이 따로 30~120분 랜덤으로 부른다 (public.run_collect_odds — supabase/cron_collect.sql).
//  - NBA: Action Network scoreboard (미국 날짜, 한 번에 전 경기, 9개 북 평균, book 30 = 오픈, 홈 티켓 %)
//  - 국내: BetExplorer 리그 페이지 1번 (평균배당, 왼쪽 팀 = 홈). 몇 초 간격 여러 번이면 429 → 국내 리그끼리 3분 이상 띄움(SQL 쪽).
//    429면 다른 지역(x-region)으로 자기 자신을 한 번 더 부른다. 부르는 시각은 경기 시간 기준(supabase/cron_collect_slots.sql).
//  - KBL·WKBL (2026-11-28 사용자 요청 — BetExplorer 429 대신): KBL = 365Scores(collect-365, Bet365)가 먼저(최근 3시간 안에 다 받았으면 건너뜀),
//    그다음 Oddsportal 리그 페이지 1번(페이지 안 initialOddsMap = 북 평균 avgOdds·북 수 cntActive, cols 1|2 = 홈·원정 순서) → 못 받으면 BetExplorer(백업).
//  오늘·내일 끝나지 않은 경기가 없으면 요청하지 않는다.
//  + NBA 핸디·언오버 기준점(2026-11-21 사용자 요청) → odds_lines: 북마다 주력 라인(대안 라인 제외)을 모아 가장 많은 라인(같으면 양쪽 배당이 더 비슷한 쪽),
//    그 라인 북 평균 배당, book 30 = 오픈. 바뀌었을 때만 한 줄 (= 기준점 변경 히스토리). 예측·채점은 DB 트리거(supabase/nba_lines.sql).
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const OP: Record<string, string> = {
  KBL: 'https://www.oddsportal.com/basketball/south-korea/kbl/',
  WKBL: 'https://www.oddsportal.com/basketball/south-korea/wkbl-women/',
}
const BE: Record<string, string> = {
  KBL: 'https://www.betexplorer.com/basketball/south-korea/kbl/',
  WKBL: 'https://www.betexplorer.com/basketball/south-korea/wkbl-women/',
  'V리그 남자': 'https://www.betexplorer.com/volleyball/south-korea/volleyball-league/',
  'V리그 여자': 'https://www.betexplorer.com/volleyball/south-korea/volleyball-league-women/',
}
// BetExplorer 영어 팀 이름 → 일정(공식 사이트) 한글 팀 이름에 들어 있는 글자. 못 찾으면 로그에 unmatched로 남는다.
const ALIAS: Record<string, [RegExp, string][]> = {
  KBL: [[/thunders/i, '삼성'], [/sakers/i, 'LG'], [/knights/i, 'SK'], [/mobis|phoebus/i, '현대모비스'], [/sono/i, '소노'], [/wonju|promy/i, 'DB'],
        [/kcc|egis/i, 'KCC'], [/kogas|pegasus/i, '가스공사'], [/suwon|\bkt\b|sonicboom/i, 'KT'], [/jungkwanjang|anyang|red boosters/i, '정관장']],
  WKBL: [[/s-birds|shinhan/i, '신한'], [/kb stars/i, 'KB'], [/hana/i, '하나'], [/woori/i, '우리'], [/samsung|blue minx/i, '삼성'], [/bnk/i, 'BNK']],
  'V리그 남자': [[/blue fangs|samsung/i, '삼성화재'], [/woori/i, '우리카드'], [/korean air|jumbos/i, '대한항공'], [/hyundai|skywalkers/i, '현대캐피탈'],
                [/\bkb\b|insurance/i, 'KB'], [/\bok\b|savings|financial/i, 'OK'], [/kepco|vixtorm/i, '한국전력']],
  'V리그 여자': [[/soop/i, 'SOOP'], [/hillstate|hyundai/i, '현대건설'], [/ibk|altos/i, 'IBK'], [/red sparks|jung ?kwan ?jang|jkj|daejeon/i, '정관장'],
                [/pink spiders|he?ungkuk/i, '흥국'], [/gs caltex|kixx/i, 'GS'], [/expressway|hi-?pass/i, '도로공사'], [/pepper/i, '페퍼']],
}
const dec = (am: number) => +(am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am)).toFixed(2)
const lastWord = (s: string) => (s ?? '').trim().split(/\s+/).pop()?.toLowerCase() ?? ''

interface Game { id: string; start: string; home: string; away: string; date: string }
interface Line { game: Game; market: 'spread' | 'total'; line: number; h: number; a: number; open: number | null; oh: number | null; oa: number | null; books: number }
interface Odds { game: Game; home: number; away: number; openH?: number | null; openA?: number | null; tix?: number | null; books?: number; name: string; src?: string }

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const league: string = body.league
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const log = async (status: string, note: Record<string, unknown>) => { await db.from('odds_fetch_log').insert({ league, status, note }) ; return new Response(JSON.stringify({ league, status, ...note }), { headers: { 'Content-Type': 'application/json' } }) }
  if (!league || (league !== 'NBA' && !BE[league])) return log('error', { message: 'unknown league' })

  // 오늘·내일 끝나지 않은 경기 (시작 후 3시간 지나면 끝난 걸로)
  const today = kstDate(Date.now()), tomorrow = kstDate(Date.now() + 86400000)
  const { data: rows } = await db.from('game_schedules').select('game_date, games').eq('league', league).in('game_date', [today, tomorrow])
  const games: Game[] = (rows ?? []).flatMap((r: any) => (r.games ?? []).map((g: any) => ({ id: g.id, start: g.start, home: g.home?.full || g.home?.name, away: g.away?.full || g.away?.name, date: r.game_date })))
    .filter(g => Date.parse(g.start) + 3 * 3600000 > Date.now())
  if (!games.length) return log('skipped', { message: '오늘·내일 남은 경기 없음' })
  // V리그: 365Scores(collect-365, Bet365)가 먼저 — 최근 3시간 안에 남은 경기 배당을 다 받았으면 BetExplorer는 안 부른다 (2026-11-22 사용자 요청, BetExplorer = 백업)
  if (league.startsWith('V리그') || league === 'KBL') {
    const { data: l3 } = await db.from('odds_fetch_log').select('note').eq('league', league).eq('status', 'ok').gte('fetched_at', new Date(Date.now() - 3 * 3600000).toISOString()).order('fetched_at', { ascending: false }).limit(20)
    const last365 = (l3 ?? []).find((x: any) => x.note?.src === '365')
    if (last365 && Number(last365.note?.odds ?? 0) >= games.length) return log('skipped', { message: '365Scores 배당 있음 — BetExplorer 안 부름' })
  }

  const found: Odds[] = []; const unmatched: string[] = []; const lines: Line[] = []
  try {
    if (league === 'NBA') {
      // Action Network은 미국 동부 날짜 — 경기 시작 시각 -5시간
      const dates = [...new Set(games.map(g => new Date(Date.parse(g.start) - 5 * 3600000).toISOString().slice(0, 10).replaceAll('-', '')))]
      for (const d of dates) {
        const res = await fetch(`https://api.actionnetwork.com/web/v2/scoreboard/nba?bookIds=15,30,79,2988,75,123,71,68,69&periods=event&date=${d}`,
          { headers: { ...UA, Accept: 'application/json', Origin: 'https://www.actionnetwork.com', Referer: 'https://www.actionnetwork.com/' } })
        if (res.status === 429) return log('blocked', { http: 429 })
        if (!res.ok) return log('error', { http: res.status })
        for (const gm of (await res.json()).games ?? []) {
          const team = (id: unknown) => (gm.teams ?? []).find((t: any) => String(t.id) === String(id))?.full_name ?? ''
          const h = team(gm.home_team_id), a = team(gm.away_team_id)
          const g = games.find(x => Math.abs(Date.parse(x.start) - Date.parse(gm.start_time)) < 20 * 60000 && lastWord(x.home) === lastWord(h))
          if (!g) continue
          const hs: number[] = [], as: number[] = []; let oh: number | null = null, oa: number | null = null, tix: number | null = null; let books = 0
          for (const [book, m] of Object.entries<any>(gm.markets ?? {})) {
            const ml: any[] = m?.event?.moneyline ?? []; if (!ml.length) continue
            const H = ml.find(o => o.side === 'home'), A = ml.find(o => o.side === 'away'); if (!H || !A) continue
            if (book === '30') { oh = dec(H.odds); oa = dec(A.odds); continue }
            hs.push(dec(H.odds)); as.push(dec(A.odds)); books++
            if (tix == null && H.bet_info?.tickets?.percent != null) tix = H.bet_info.tickets.percent
          }
          if (!hs.length) continue
          const avg = (v: number[]) => +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)
          found.push({ game: g, home: avg(hs), away: avg(as), openH: oh, openA: oa, tix, books, name: `${a} @ ${h}` })
          // 기준점: spread(홈 라인) · total
          for (const market of ['spread', 'total'] as const) {
            const [sa, sb] = market === 'spread' ? ['home', 'away'] : ['over', 'under']
            const per: { v: number; h: number; a: number }[] = []; let open: { v: number; h: number; a: number } | null = null
            for (const [book, m] of Object.entries<any>(gm.markets ?? {})) {
              const xs: any[] = (m?.event?.[market] ?? []).filter((o: any) => !o.is_alt_market)
              const A = xs.find(o => o.side === sa), B = xs.find(o => o.side === sb)
              if (!A || !B || A.value == null || A.odds == null || B.odds == null) continue
              const row = { v: Number(A.value), h: dec(A.odds), a: dec(B.odds) }
              if (book === '30') open = row; else per.push(row)
            }
            if (!per.length) continue
            const by = new Map<number, { h: number; a: number }[]>()
            per.forEach(r => by.set(r.v, [...(by.get(r.v) ?? []), r]))
            const [v, rs] = [...by.entries()].sort((x, y) => y[1].length - x[1].length
              || Math.abs(avg(x[1].map(r => r.h)) - avg(x[1].map(r => r.a))) - Math.abs(avg(y[1].map(r => r.h)) - avg(y[1].map(r => r.a))))[0]
            lines.push({ game: g, market, line: v, h: avg(rs.map(r => r.h)), a: avg(rs.map(r => r.a)), open: open?.v ?? null, oh: open?.h ?? null, oa: open?.a ?? null, books: rs.length })
          }
        }
      }
    }
    // Oddsportal (KBL·WKBL) — 한 번에 그 리그 다음 경기들 + 북 평균 배당
    let opNote: string | null = null
    if (OP[league]) {
      try {
        const r = await fetch(OP[league], { headers: { ...UA, 'Accept-Language': 'en' } })
        if (!r.ok) opNote = `oddsportal ${r.status}`
        else {
          let t = await r.text()
          for (let i = 0; i < 5 && t.includes('\\"'); i++) t = t.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          const kw = (s: string) => ALIAS[league].find(([re]) => re.test(s ?? ''))?.[1]
          const seen = new Set<string>()
          for (const m of t.matchAll(/"home-name":"([^"]+)","away-name":"([^"]+)"[\s\S]{0,2500}?"encodeEventId":"([A-Za-z0-9]+)","colClassName":"datet t(\d+)/g)) {
            const [, hn, an, eid, ts] = m
            if (seen.has(eid)) continue; seen.add(eid)
            const om = t.match(new RegExp(`"${eid}":\\{"event":\\d+,"odds":\\[\\{"active":(?:true|false),"maxOdds":[0-9.]+,"avgOdds":([0-9.]+)[\\s\\S]*?"cntActive":(\\d+)[\\s\\S]*?\\{"active":(?:true|false),"maxOdds":[0-9.]+,"avgOdds":([0-9.]+)`))
            if (!om) continue
            const kh = kw(hn), ka = kw(an), start = Number(ts) * 1000
            const g = games.find(x => Math.abs(Date.parse(x.start) - start) <= 40 * 60000 && kh && ka && x.home?.includes(kh) && x.away?.includes(ka))
            if (!g) { unmatched.push(`op:${hn} - ${an}`); continue }
            found.push({ game: g, home: +om[1], away: +om[3], books: +om[2], name: `${hn} - ${an}`, src: 'oddsportal' })
          }
          if (!found.length) opNote = 'oddsportal 0경기'
        }
      } catch (e) { opNote = `oddsportal ${String(e).slice(0, 60)}` }
    }
    if (league !== 'NBA' && !found.length) {
      const res = await fetch(BE[league], { headers: { ...UA, 'Accept-Language': 'en' } })
      if (res.status === 429 || body.test429 === 1) {
        // 429면 다른 지역(다른 IP)에서 한 번만 더 (2026-11-22 — Supabase 서버 IP를 여럿이 같이 써서 간격과 상관없이 막힘)
        const here = Deno.env.get('SB_REGION') ?? null
        if (!body.retry) {
          const regions = ['ap-northeast-2', 'ap-southeast-1', 'ap-northeast-1', 'ap-southeast-2'].filter(r => r !== here)
          const rg = regions[Math.floor(Math.random() * regions.length)]
          await db.from('odds_fetch_log').insert({ league, status: 'blocked', note: { http: 429, region: here, retry: rg } })
          const r2 = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/collect-odds`, { method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'x-region': rg },
            body: JSON.stringify({ league, retry: 1 }) })
          return new Response(await r2.text(), { headers: { 'Content-Type': 'application/json' } })
        }
        return log('blocked', { http: 429, region: here, retried: true })
      }
      if (!res.ok) return log('error', { http: res.status })
      const html = await res.text()
      for (const tr of html.split('<tr')) {
        if (!tr.includes('data-odd=')) continue
        const m = tr.match(/href="\/(?:basketball|volleyball)\/south-korea\/[^"]+\/[A-Za-z0-9]{8}\/"[^>]*>([\s\S]*?)<\/a>/); if (!m) continue
        const name = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        if (/\d+:\d+/.test(name)) continue // 끝난 경기
        const odds = [...tr.matchAll(/data-odd="([0-9.]+)"/g)].map(x => +x[1]); if (odds.length < 2) continue
        const [bh, ba] = name.split(' - ')
        const kw = (s: string) => ALIAS[league].find(([re]) => re.test(s ?? ''))?.[1]
        const kh = kw(bh), ka = kw(ba)
        const g = kh && ka ? games.find(x => x.home?.includes(kh) && x.away?.includes(ka)) : undefined
        if (!g) { unmatched.push(name); continue }
        found.push({ game: g, home: odds[0], away: odds[1], name })
      }
    }
    if (opNote) unmatched.push(opNote)
  } catch (e) { return log('error', { message: String(e) }) }

  // 바뀐 것만 저장
  let changed = 0
  for (const o of found) {
    const src = o.src ?? (league === 'NBA' ? 'actionnetwork' : 'betexplorer')
    // 같은 출처 마지막 값과 비교 (출처가 섞여도 오르내림이 생기지 않게)
    const { data: prev } = await db.from('odds_snapshots').select('home_odds, away_odds').eq('game_id', o.game.id).eq('source', src).order('fetched_at', { ascending: false }).limit(1)
    const p = prev?.[0]
    if (p && Number(p.home_odds) === o.home && Number(p.away_odds) === o.away) continue
    const { error } = await db.from('odds_snapshots').insert({ league, game_date: o.game.date, game_id: o.game.id, source: src,
      home_odds: o.home, away_odds: o.away, open_home: o.openH ?? null, open_away: o.openA ?? null, home_tickets: o.tix ?? null, books: o.books ?? null, match_name: o.name })
    if (!error) changed++
  }
  // 기준점: 라인이나 배당이 바뀐 것만 (변경 히스토리)
  let lineChanged = 0
  for (const l of lines) {
    const { data: prev } = await db.from('odds_lines').select('line, home_odds, away_odds').eq('game_id', l.game.id).eq('market', l.market).order('fetched_at', { ascending: false }).limit(1)
    const p = prev?.[0]
    if (p && Number(p.line) === l.line && Number(p.home_odds) === l.h && Number(p.away_odds) === l.a) continue
    const { error } = await db.from('odds_lines').insert({ league, game_date: l.game.date, game_id: l.game.id, market: l.market, line: l.line, home_odds: l.h, away_odds: l.a,
      open_line: l.open, open_home: l.oh, open_away: l.oa, books: l.books, source: 'actionnetwork' })
    if (!error) lineChanged++
  }
  // 보관: 경기 7일 지난 배당, 7일 지난 로그
  await db.from('odds_snapshots').delete().lt('game_date', kstDate(Date.now() - 7 * 86400000))
  await db.from('odds_fetch_log').delete().lt('fetched_at', new Date(Date.now() - 7 * 86400000).toISOString())
  return log('ok', { games: games.length, matched: found.length, changed, lines: lines.length, lineChanged, unmatched })
})

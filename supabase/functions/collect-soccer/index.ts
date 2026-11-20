// 축구 5대 리그 일정 + 승무패 배당 (사용자 요청 — 5대 리그만, 배당은 일반 승무패만).
// body: { league: '잉글랜드 1부' | '스페인 1부' | '이탈리아 1부' | '독일 1부' | '프랑스 1부' }
// 리그마다 pg_cron 작업이 따로 부른다 (public.run_collect_soccer — supabase/cron_soccer.sql):
//  다른 리그 배당·축구 작업이나 일정 업데이트가 3분 안에 돌았으면 3~10분 미루고, 보통 40~100분 뒤, 오늘·내일 경기가 없으면 2.5~4시간 뒤.
// 출처: ESPN scoreboard (NBA 일정과 같은 API). 한 번 부르면 일정과 DraftKings 배당(오픈·현재)이 같이 온다.
//  - 날짜 범위(dates=A-B)는 400 → UTC 날짜 하루씩, 사이에 1.5~4초 쉼. 한국 하루 = UTC 전날 15시~당일 15시라 UTC 3일치(어제·오늘·내일).
//  - 응답이 gzip이면 Deno fetch가 알아서 푼다.
// + 핸디 배당: Action Network 북메이커 주력 핸디 평균 → soccer_lines (룰북 베팅 찾기용)
// 저장: game_schedules(sport soccer, league = 리그 관리 이름, 팀 이름 = 리그 관리 등록 한글 이름, full = ESPN 영어 이름)
//       odds_snapshots(home·draw·away, open_*, 바뀌었을 때만) · odds_fetch_log(매번)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Action Network 리그 이름 (핸디 배당 — 룰북 베팅 찾기용)
const AN_LEAGUE: Record<string, string> = { '잉글랜드 1부': 'epl', '스페인 1부': 'laliga', '이탈리아 1부': 'seriea', '독일 1부': 'bundesliga', '프랑스 1부': 'ligue1' }
const CODE: Record<string, string> = { '잉글랜드 1부': 'eng.1', '스페인 1부': 'esp.1', '이탈리아 1부': 'ita.1', '독일 1부': 'ger.1', '프랑스 1부': 'fra.1' }
// ESPN 영어 이름 → 리그 관리에 등록된 한글 이름 (2026-27 시즌, 등록 이름 그대로 — 오타 포함)
const KO: Record<string, string> = {
  // 잉글랜드
  'AFC Bournemouth': '본머스 AFC', Arsenal: '아스날', 'Aston Villa': '애스턴 빌라', Brentford: '브렌트포드', 'Brighton & Hove Albion': '브라이튼 호브 알비언',
  Chelsea: '첼시', 'Coventry City': '코벤트리 시티', 'Crystal Palace': '크리스털 펠리스', Everton: '에버튼', Fulham: '풀럼', 'Hull City': '헐 시티',
  'Ipswich Town': '입스위치 타운', 'Leeds United': '리즈 유나이티드', Liverpool: '리버풀', 'Manchester City': '멘체스터 시티', 'Manchester United': '맨체스터 유나이티드',
  'Newcastle United': '뉴캐슬 유나이티드', 'Nottingham Forest': '노팅엄 포레스트', Sunderland: '선덜랜드', 'Tottenham Hotspur': '토트넘 핫스퍼',
  // 스페인
  'Alavés': '데포르티보 알라베스', 'Athletic Club': '아슬레틱 클럽', 'Atlético Madrid': '아틀레티코 마드리드', Barcelona: 'FC 바르셀로나', 'Celta Vigo': 'RC 셀타',
  Deportivo: '데포르티보 라코루냐', Elche: '엘체', Espanyol: 'RCD 에스파뇰 바르셀로나', Getafe: '헤타페', Levante: '레반테', 'Málaga': '말라가', Osasuna: 'CA 오사수나',
  'Racing Santander': '라싱 산탄데르', 'Rayo Vallecano': '라요 바예카노', 'Real Betis': '레알 베티스', 'Real Madrid': '레알 마드리드', 'Real Sociedad': '레알 소시에다드',
  Sevilla: '세비야 FC', Valencia: '발렌시아 CF', Villarreal: '비야레알 CF',
  // 이탈리아
  'AC Milan': 'AC 밀란', 'AS Roma': 'AS 로마', Atalanta: '아탈란타', Bologna: '볼로냐', Cagliari: '칼리아리', Como: '코모', Fiorentina: '피오렌티나', Frosinone: '프로시노네',
  Genoa: '제노아', Internazionale: '인테르 밀란', Juventus: '유벤투스', Lazio: '라치오', Lecce: '레체', Monza: '몬차', Napoli: '나폴리', Parma: '파르마', Sassuolo: '사수올로',
  Torino: '토리노', Udinese: '우디네세', Venezia: '베네치아',
  // 독일
  '1. FC Union Berlin': 'FC 우니온 베틀린', 'Bayer Leverkusen': '바이어 04 레버쿠젠', 'Bayern Munich': 'FC 바이에른 뮌헨', 'Borussia Dortmund': '보루시아 도르트문트',
  'Borussia Mönchengladbach': '보루시아 묀헨글라트바흐', 'Eintracht Frankfurt': '아인트라흐트 프랑크푸르트', 'FC Augsburg': 'FC 아우크스부르크', 'FC Cologne': 'FC 쾰른',
  'Hamburg SV': '함부르거 SV', Mainz: 'FSV 마인츠 05', 'RB Leipzig': 'RB 라이프치히', 'SC Freiburg': 'SC 프라이부르크', 'SC Paderborn 07': 'SC 파더본 07', 'Schalke 04': '샬케 04',
  'SV Elversberg': 'SV 엘버스베르크', 'TSG Hoffenheim': 'TSG 호펜하임', 'VfB Stuttgart': 'VfB 슈투트가르트', 'Werder Bremen': 'SV 베르더 브레멘',
  // 프랑스
  'AJ Auxerre': 'AJ 오세르', Angers: '앙제 SCO', 'AS Monaco': 'AS 모나코', Brest: '스타드 브레스투아 29', 'Le Havre AC': '아브르 아슬레틱 클럽', 'Le Mans': '르망', Lens: 'RC 랑스',
  Lille: 'LOSC 릴', Lorient: '로리앙', Lyon: '리옹', Marseille: '마르세유', Nice: 'OGC 니스', 'Paris FC': '파리 FC', 'Paris Saint-Germain': '파리 생제르망',
  'Stade Rennais': '스타드 렌 FC', Strasbourg: 'RC 스트라스부르 알자스', Toulouse: '툴루즈 FC', Troyes: '트루아 AC',
}
// 미국식 배당 → 소수 ("+450" → 5.50, "-200" → 1.50, "EVEN" → 2.00)
const dec = (s: unknown): number | null => {
  if (s == null) return null
  const t = String(s).trim().toUpperCase()
  if (t === 'EVEN' || t === 'EV') return 2
  const n = Number(t.replace('+', '')); if (!Number.isFinite(n) || n === 0) return null
  return +(n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)).toFixed(2)
}

interface Team { name?: string; full?: string | null; abbr?: string | null; record?: string | null; score?: string | number | null }
interface Game { id: string; start: string; home: Team; away: Team; venue?: string | null; status?: string | null; note?: string | null }

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const league: string = body.league
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const log = async (status: string, note: Record<string, unknown>) => { await db.from('odds_fetch_log').insert({ league, status, note }); return new Response(JSON.stringify({ league, status, ...note }), { headers: { 'Content-Type': 'application/json' } }) }
  const code = CODE[league]
  if (!code) return log('error', { message: 'unknown league' })

  const today = kstDate(Date.now()), tomorrow = kstDate(Date.now() + 86400000)
  const utcDays = [-1, 0, 1].map(d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10).replaceAll('-', ''))
  const events: any[] = []
  try {
    for (const [i, d] of utcDays.entries()) {
      if (i) await sleep(1500 + Math.random() * 2500)
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${d}`, { headers: UA })
      if (res.status === 429 || res.status === 403) return log('blocked', { http: res.status, date: d })
      if (!res.ok) return log('error', { http: res.status, date: d })
      events.push(...((await res.json()).events ?? []))
    }
  } catch (e) { return log('error', { message: String(e) }) }

  const byDate: Record<string, Game[]> = { [today]: [], [tomorrow]: [] }
  const odds: { game: Game; date: string; state: string; h: number | null; d: number | null; a: number | null; oh: number | null; od: number | null; oa: number | null }[] = []
  const unknown = new Set<string>(), seen = new Set<string>()
  for (const e of events) {
    const date = kstDate(Date.parse(e.date))
    if (!byDate[date] || seen.has(String(e.id))) continue
    seen.add(String(e.id))
    const c = e.competitions?.[0]
    const state: string = c?.status?.type?.state ?? e.status?.type?.state ?? 'pre'   // pre · in · post
    const side = (s: string): Team => {
      const t = c?.competitors?.find((x: any) => x.homeAway === s)
      const en: string = t?.team?.displayName ?? '?'
      if (!KO[en]) unknown.add(en)
      return { name: KO[en] ?? en, full: en, abbr: t?.team?.abbreviation ?? null, record: t?.records?.[0]?.summary ?? null, score: state === 'pre' ? null : t?.score ?? null }
    }
    const g: Game = { id: `soc-${e.id}`, start: new Date(Date.parse(e.date)).toISOString(), home: side('home'), away: side('away'), venue: c?.venue?.fullName ?? null,
      status: state === 'post' ? '종료' : state === 'in' ? (c?.status?.type?.shortDetail ?? '경기 중') : null }
    byDate[date].push(g)
    const ml = c?.odds?.[0]?.moneyline
    if (state === 'pre' && ml) odds.push({ game: g, date, state,
      h: dec(ml.home?.close?.odds), d: dec(ml.draw?.close?.odds), a: dec(ml.away?.close?.odds),
      oh: dec(ml.home?.open?.odds), od: dec(ml.draw?.open?.odds), oa: dec(ml.away?.open?.odds) })
  }

  const rows = Object.entries(byDate).map(([game_date, games]) => ({ sport: 'soccer', league, game_date, games: games.sort((a, b) => a.start.localeCompare(b.start)), fetched_at: new Date().toISOString() }))
  const { error: se } = await db.from('game_schedules').upsert(rows)
  if (se) return log('error', { message: `schedule ${se.message}` })

  // 배당: 바뀐 것만 저장
  let changed = 0
  for (const o of odds) {
    if (!o.h || !o.a) continue
    const { data: prev } = await db.from('odds_snapshots').select('home_odds, away_odds, draw_odds').eq('game_id', o.game.id).order('fetched_at', { ascending: false }).limit(1)
    const p = prev?.[0]
    if (p && Number(p.home_odds) === o.h && Number(p.away_odds) === o.a && Number(p.draw_odds) === (o.d ?? 0)) continue
    const { error } = await db.from('odds_snapshots').insert({ league, game_date: o.date, game_id: o.game.id, source: 'espn-draftkings', home_odds: o.h, away_odds: o.a, draw_odds: o.d,
      open_home: o.oh, open_away: o.oa, open_draw: o.od, books: 1, match_name: `${o.game.home.full} - ${o.game.away.full}` })
    if (!error) changed++
  }
  // 핸디 배당: Action Network (미국 동부 날짜, 한 번에 그날 전 리그) — 북메이커별 주력 핸디(±0.5·±1.5·±2.5)를 기준점별 평균 → soccer_lines
  let lines = 0, anMatched = 0
  try {
    const pre = rows.flatMap(r => r.games).filter(g => !g.status)
    const usDates = [...new Set(pre.map(g => new Date(Date.parse(g.start) - 5 * 3600000).toISOString().slice(0, 10).replaceAll('-', '')))]
    const tok = (s: string) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['club', 'city'].includes(w))
    for (const [i, d] of usDates.entries()) {
      await sleep(i ? 2000 + Math.random() * 2000 : 1000)
      const r = await fetch(`https://api.actionnetwork.com/web/v2/scoreboard/soccer?bookIds=15,30,79,2988,75,123,71,68,69&periods=event&date=${d}`,
        { headers: { ...UA, Origin: 'https://www.actionnetwork.com', Referer: 'https://www.actionnetwork.com/' } })
      if (!r.ok) continue
      for (const ag of (await r.json()).games ?? []) {
        if (ag.league_name !== AN_LEAGUE[league]) continue
        const team = (id: unknown) => (ag.teams ?? []).find((t: any) => String(t.id) === String(id))?.full_name ?? ''
        const ah = tok(team(ag.home_team_id)), aa = tok(team(ag.away_team_id))
        const g = pre.find(x => Math.abs(Date.parse(x.start) - Date.parse(ag.start_time)) < 20 * 60000
          && (tok(x.home.full ?? '').some(w => ah.includes(w)) || tok(x.away.full ?? '').some(w => aa.includes(w))))
        if (!g) continue
        anMatched++
        const acc = new Map<string, { side: string; line: number; sum: number; n: number }>()
        for (const [book, m] of Object.entries<any>(ag.markets ?? {})) {
          if (book === '30') continue   // 30 = 오픈 배당
          for (const sp of m?.event?.spread ?? []) {
            const o = dec(sp.odds); if (!o || sp.value == null) continue
            const k = `${sp.side}|${sp.value}`; const a = acc.get(k) ?? { side: sp.side, line: Number(sp.value), sum: 0, n: 0 }
            a.sum += o; a.n++; acc.set(k, a)
          }
        }
        const up = [...acc.values()].map(a => ({ game_id: g.id, league, side: a.side, line: a.line, odds: Math.round(a.sum / a.n * 100) / 100, books: a.n, source: 'actionnetwork', fetched_at: new Date().toISOString() }))
        if (up.length) { const { error } = await db.from('soccer_lines').upsert(up); if (!error) lines += up.length }
      }
    }
  } catch { /* 핸디는 없어도 일정·승무패는 저장됨 */ }

  return log('ok', { anMatched, lines, games: rows.reduce((s, r) => s + r.games.length, 0), counts: Object.fromEntries(rows.map(r => [r.game_date, r.games.length])), odds: odds.length, changed, unmatched: [...unknown] })
})

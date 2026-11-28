// 축구 일정 + 승무패 배당 (사용자 요청 — 5대 리그로 시작, 2026-11-21 리그 관리의 나머지 리그도 연결. 배당은 일반 승무패만).
// body: { league: 리그 관리 이름 } — ESPN(아래 ESPN 표) · K리그 1·2부(K리그 공식 API) · J리그2(J리그 공식 데이터 사이트)
// 리그마다 pg_cron 작업이 따로 부른다 (public.run_collect_soccer — supabase/cron_soccer.sql).
// 출처:
//  - ESPN scoreboard: 한 번 부르면 일정과 DraftKings 배당(오픈·현재)이 같이 온다.
//    날짜 범위(dates=A-B)는 400 → UTC 날짜 하루씩, 사이에 1.5~4초 쉼. 한국 하루 = UTC 전날 15시~당일 15시라 UTC 3일치(어제·오늘·내일).
//  - K리그: POST https://www.kleague.com/getScheduleList.do {leagueId:'1'|'2', year, month:'09'(두 자리)} — 한국 시간, 한글 이름, 팀 코드(K01…), gameStatus 'FE'·endYn 'Y' = 종료.
//  - J2: https://data.j-league.or.jp/SFMS01/search (HTML 표, 일본 시간 = 한국 시간, 팀은 jleague.jp/club/<코드>/ 링크).
//  - K리그·J2 승무패·핸디 배당 = 피나클 (2026-11-22 사용자 요청 — BetExplorer 429 때문에): guest.api.arcadia.pinnacle.com 리그 matchups + markets/straight
//    (사이트에 공개로 들어 있는 x-api-key — 바뀌면 PIN_KEY 고침). 핸디(±0.25~±2.5, 대안 라인 포함)는 soccer_lines(source pinnacle).
//    피나클에서 한 경기도 못 맞추면 백업으로 BetExplorer fixtures (data-odd 1·X·2, 연달아 부르면 429).
// 팀 이름 = 리그 관리 등록 한글 이름: DB soccer_team_names(league, src, ko) — league 칸이 그 리그면 그 리그 것, 없으면 아무 리그(친선경기용), 그다음 아래 KO 표.
//   src = ESPN 영어 이름 · 'kl:K21'(K리그 팀 코드) · 'jl:sapporo'(J리그 코드) · 'bx:Daejeon'(BetExplorer 이름 앞부분 — 가장 긴 것). 못 찾으면 영어 이름 그대로 + 로그 unmatched.
// + 피나클 5대 리그 (2026-11-28 사용자 요청 — 롤링용 공정 배당): 리그 전체 경기(보통 1주일치)의 승무패·핸디(±0.5·±1.5·±2.5)·총골(1.5·2.5·3.5)을
//   pin_matchups(경기, 우리 일정 game_id 연결)·pin_odds(바뀐 때만 = 변동 기록, 첫 줄 오픈·킥오프 전 마지막 줄 마감)에 저장 — SQL supabase/pin_odds.sql.
//   일정·승무패 메인(odds_snapshots)은 그대로 ESPN·DraftKings.
// + 핸디 배당: Action Network 북메이커 주력 핸디 평균 → soccer_lines (룰북 베팅 찾기용, 5대 리그·MLS)
// 저장: game_schedules(sport soccer, league = 리그 관리 이름, full = 원래 이름) · odds_snapshots(home·draw·away, 바뀌었을 때만) · odds_fetch_log(매번)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'application/json' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Action Network 리그 이름 (핸디 배당 — 룰북 베팅 찾기용)
const AN_LEAGUE: Record<string, string> = { '프리미어리그': 'epl', '라리가': 'laliga', '세리에A': 'seriea', '분데스리가': 'bundesliga', '리그1': 'ligue1', '미국': 'mls' }
const CODE: Record<string, string> = {
  '프리미어리그': 'eng.1', '라리가': 'esp.1', '세리에A': 'ita.1', '분데스리가': 'ger.1', '리그1': 'fra.1',
  '챔피언쉽': 'eng.2', '잉글랜드 리그1': 'eng.3', '라리가2': 'esp.2', '세리에B': 'ita.2', '분데스리가2': 'ger.2', '리그2': 'fra.2',
  '에레디비시': 'ned.1', '프리메이라리가': 'por.1', '쥬필러리그': 'bel.1', '터키': 'tur.1', '그리스': 'gre.1', '덴마크': 'den.1', '오스트리아': 'aut.1', '스코틀랜드': 'sco.1', '스웨덴': 'swe.1',
  '미국': 'usa.1', '멕시코': 'mex.1', '브라질': 'bra.1', '아르헨티나': 'arg.1', 'J리그1': 'jpn.1', '호주': 'aus.1', '중국': 'chn.1',
  '챔피언스리그': 'uefa.champions', '유로파리그': 'uefa.europa', '컨퍼런스리그': 'uefa.europa.conf',   // UEFA 클럽 대회 (2026-11-24 사용자 요청)
  '아시아 챔피언스리그': 'afc.champions', '아시아 챔피언스리그2': 'afc.cup',   // AFC 챔피언스리그 엘리트·챔피언스리그 2 (2026-11-24 사용자 요청)
  '네이션스 리그': 'uefa.nations', '국제 친선 경기': 'fifa.friendly',   // A매치(국가대표)만 — 클럽 친선(club.friendly)은 사용자 요청으로 뺌
}
// ESPN에 없는 리그 (스위스·아일랜드·체코·핀란드는 사용자 요청으로 뺌)
const KLEAGUE: Record<string, string> = { 'K리그1': '1', 'K리그2': '2' }
// 피나클 리그 id (못 찾으면 이름으로 다시 찾음)
const PIN: Record<string, [number, RegExp]> = { 'K리그1': [207551, /^Korea Republic - K League 1$/], 'K리그2': [207552, /^Korea Republic - K League 2$/], 'J리그2': [2159, /^Japan - J2 League$/] }
const PIN_KEY = 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R'
const PIN_URL = 'https://guest.api.arcadia.pinnacle.com/0.1'
// 피나클 5대 리그 id (못 찾으면 이름으로 다시 찾음)
const PIN5: Record<string, [number, RegExp]> = { '프리미어리그': [1980, /^England - Premier League$/], '라리가': [2196, /^Spain - La Liga$/],
  '세리에A': [2436, /^Italy - Serie A$/], '분데스리가': [1842, /^Germany - Bundesliga$/], '리그1': [2036, /^France - Ligue 1$/] }
const PIN5_SPREAD = new Set([0.5, 1.5, 2.5]), PIN5_TOTAL = new Set([1.5, 2.5, 3.5])
const pinDec = (p: number) => Math.round((p > 0 ? 1 + p / 100 : 1 + 100 / -p) * 1000) / 1000
const BX: Record<string, string> = { 'K리그1': 'south-korea/k-league-1', 'K리그2': 'south-korea/k-league-2', 'J리그2': 'japan/j2-league' }
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

// ESPN 'post'에는 연기·중단·취소도 들어 있다 (2026-11-22 위트레흐트 0:0 중단을 '종료'로 저장해 자동 판정이 적중으로 나왔다) — 정상 종료만 '종료'
const postStatus = (t: any): string => {
  const n = String(t?.name ?? '')
  if (/POSTPON|DELAY/.test(n)) return '연기'
  if (/ABANDON|SUSPEND/.test(n)) return '중단'
  if (/CANCEL|FORFEIT/.test(n)) return '취소'
  if (/FULL_TIME|FINAL/.test(n) || (t?.completed && !n)) return '종료'
  return t?.shortDetail || n || '종료?'
}

interface Team { name?: string; full?: string | null; abbr?: string | null; record?: string | null; score?: string | number | null }
interface Game { id: string; start: string; home: Team; away: Team; venue?: string | null; status?: string | null; note?: string | null }

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const league: string = body.league
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const log = async (status: string, note: Record<string, unknown>) => { await db.from('odds_fetch_log').insert({ league, status, note }); return new Response(JSON.stringify({ league, status, ...note }), { headers: { 'Content-Type': 'application/json' } }) }
  if (!CODE[league] && !KLEAGUE[league] && league !== 'J리그2') return log('error', { message: 'unknown league' })

  // 팀 이름 표
  const { data: nm } = await db.from('soccer_team_names').select('league, src, ko')
  const mine = new Map<string, string>(), any = new Map<string, string>()
  for (const r of nm ?? []) { if (r.league === league) mine.set(r.src, r.ko); else if (!any.has(r.src)) any.set(r.src, r.ko) }
  const unknown = new Set<string>()
  const ko = (src: string, show = src): string => {
    const v = mine.get(src) ?? KO[src] ?? any.get(src)
    if (!v) unknown.add(show)
    return v ?? show
  }

  const today = kstDate(Date.now()), tomorrow = kstDate(Date.now() + 86400000)
  // 어제(한국 날짜)도 받는다 (2026-11-25 — 밤 9시대 시작해 자정 넘어 끝나는 경기가 '72분' 경기중으로 멈춰 결과 판정이 안 됐다:
  //  자정이 지나면 어제 줄을 더는 갱신하지 않았기 때문). 어제 줄은 통째로 덮지 않고 이미 저장된 경기만 새 값으로 바꾼다 (UTC 3일로는 어제 오전 경기가 빠져서).
  const yesterday = kstDate(Date.now() - 86400000)
  const byDate: Record<string, Game[]> = { [yesterday]: [], [today]: [], [tomorrow]: [] }
  // 2.5 오버·언더 등 총골 배당 (2026-11-26 사용자 요청 — 룰북 '무 4.0↑ & 2.5 오버 1.60↑') → soccer_lines side 'over'·'under'
  const totRows: { game_id: string; league: string; side: string; line: number; odds: number; books: number; source: string; fetched_at: string }[] = []
  const addTot = (game_id: string, side: string, line: unknown, o: number | null, books: number, source: string) => {
    const l = Number(line); if (!o || !Number.isFinite(l) || l <= 0) return
    totRows.push({ game_id, league, side, line: l, odds: Math.round(o * 100) / 100, books, source, fetched_at: new Date().toISOString() })
  }
  const odds: { game: Game; date: string; h: number | null; d: number | null; a: number | null; oh: number | null; od: number | null; oa: number | null; src: string }[] = []

  if (CODE[league]) {
    const code = CODE[league]
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
    const seen = new Set<string>()
    for (const e of events) {
      const date = kstDate(Date.parse(e.date))
      if (!byDate[date] || seen.has(String(e.id))) continue
      seen.add(String(e.id))
      const c = e.competitions?.[0]
      const state: string = c?.status?.type?.state ?? e.status?.type?.state ?? 'pre'   // pre · in · post
      const side = (s: string): Team => {
        const t = c?.competitors?.find((x: any) => x.homeAway === s)
        const en: string = t?.team?.displayName ?? '?'
        return { name: ko(en), full: en, abbr: t?.team?.abbreviation ?? null, record: t?.records?.[0]?.summary ?? null, score: state === 'pre' ? null : t?.score ?? null }
      }
      const g: Game = { id: `soc-${e.id}`, start: new Date(Date.parse(e.date)).toISOString(), home: side('home'), away: side('away'), venue: c?.venue?.fullName ?? null,
        status: state === 'post' ? postStatus(c?.status?.type ?? e.status?.type) : state === 'in' ? (c?.status?.type?.shortDetail ?? '경기 중') : null }
      byDate[date].push(g)
      const ml = c?.odds?.[0]?.moneyline
      if (state === 'pre' && ml) odds.push({ game: g, date, src: 'espn-draftkings',
        h: dec(ml.home?.close?.odds), d: dec(ml.draw?.close?.odds), a: dec(ml.away?.close?.odds),
        oh: dec(ml.home?.open?.odds), od: dec(ml.draw?.open?.odds), oa: dec(ml.away?.open?.odds) })
      const o0 = c?.odds?.[0]
      if (state === 'pre' && o0?.overUnder != null) {
        addTot(g.id, 'over', o0.overUnder, dec(o0.total?.over?.close?.odds ?? o0.overOdds), 1, 'espn-draftkings')
        addTot(g.id, 'under', o0.overUnder, dec(o0.total?.under?.close?.odds ?? o0.underOdds), 1, 'espn-draftkings')
      }
    }
  } else if (KLEAGUE[league]) {
    // K리그 공식 API — 오늘·내일이 걸친 달(한두 번)
    const months = [...new Set([today, tomorrow].map(d => d.slice(0, 7)))]
    try {
      for (const [i, ym] of months.entries()) {
        if (i) await sleep(1500 + Math.random() * 2000)
        const res = await fetch('https://www.kleague.com/getScheduleList.do', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' },
          body: JSON.stringify({ leagueId: KLEAGUE[league], year: ym.slice(0, 4), month: ym.slice(5, 7) }) })
        if (res.status === 429 || res.status === 403) return log('blocked', { http: res.status })
        if (!res.ok) return log('error', { http: res.status })
        for (const x of (await res.json())?.data?.scheduleList ?? []) {
          const date = String(x.gameDate ?? '').replaceAll('.', '-')
          if (!byDate[date]) continue
          const ended = x.endYn === 'Y' || x.gameStatus === 'FE'
          const start = new Date(`${date}T${/^\d\d:\d\d$/.test(x.gameTime ?? '') ? x.gameTime : '00:00'}:00+09:00`).toISOString()
          const started = ended || Date.now() >= Date.parse(start)
          const side = (id: string, short: string, goal: unknown): Team => ({ name: ko(`kl:${id}`, short), full: short, abbr: id, score: started ? (goal as number) ?? null : null })
          byDate[date].push({ id: `kl${KLEAGUE[league]}-${x.year}-${x.gameId}`, start, home: side(x.homeTeam, x.homeTeamName, x.homeGoal), away: side(x.awayTeam, x.awayTeamName, x.awayGoal),
            venue: x.fieldNameFull ?? x.fieldName ?? null, status: ended ? '종료' : null, note: x.codeName || null })
        }
      }
    } catch (e) { return log('error', { message: String(e) }) }
  } else {
    // J2 — J리그 공식 데이터 사이트 (시즌 전체 표, 2026/27 시즌 = competition_years 2026)
    const year = Number(today.slice(5, 7)) >= 7 ? today.slice(0, 4) : String(Number(today.slice(0, 4)) - 1)
    try {
      const res = await fetch(`https://data.j-league.or.jp/SFMS01/search?competition_years=${year}&competition_frame_ids=2`, { headers: { ...UA, Accept: 'text/html' } })
      if (res.status === 429 || res.status === 403) return log('blocked', { http: res.status })
      if (!res.ok) return log('error', { http: res.status })
      const html = await res.text()
      const txt = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      for (const tr of html.split('<tr').slice(1)) {
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1])
        const di = tds.findIndex(t => /^\d\d\/\d\d\/\d\d/.test(txt(t)))
        if (di < 0 || tds.length < di + 5) continue
        const [yy, mm, dd] = txt(tds[di]).slice(0, 8).split('/')
        const date = `20${yy}-${mm}-${dd}`
        if (!byDate[date]) continue
        const time = txt(tds[di + 1]).match(/\d{1,2}:\d\d/)?.[0] ?? '00:00'
        const club = (t: string) => ({ code: t.match(/\/club\/([a-z0-9]+)\//)?.[1] ?? '', jp: txt(t) })
        const H = club(tds[di + 2]), A = club(tds[di + 4])
        const sc = txt(tds[di + 3]).match(/(\d+)\s*-\s*(\d+)/)
        const start = new Date(`${date}T${time.padStart(5, '0')}:00+09:00`).toISOString()
        byDate[date].push({ id: `jl2-${date}-${H.code || H.jp}`, start,
          home: { name: ko(`jl:${H.code}`, H.jp), full: H.jp, abbr: H.code || null, score: sc ? sc[1] : null },
          away: { name: ko(`jl:${A.code}`, A.jp), full: A.jp, abbr: A.code || null, score: sc ? sc[2] : null },
          venue: txt(tds[di + 5] ?? '') || null, status: sc ? '종료' : null })
      }
    } catch (e) { return log('error', { message: String(e) }) }
  }

  // K리그·J2 이름: soccer_team_names 'pn:'(피나클)·'bx:'(BetExplorer) 앞부분이 가장 길게 맞는 것 (피나클 이름은 BetExplorer 이름과 앞부분이 같다)
  const nameKeys = (pfx: string) => [...new Set([...mine.keys(), ...any.keys()])].filter(k => k.startsWith(pfx)).map(k => k.slice(pfx.length)).sort((a, b) => b.length - a.length)
  const byPrefix = (n: string) => {
    for (const pfx of ['pn:', 'bx:']) { const k = nameKeys(pfx).find(k => n.toLowerCase().startsWith(k.toLowerCase())); if (k) return mine.get(pfx + k) ?? any.get(pfx + k) }
    return undefined
  }
  const preGames = () => Object.entries(byDate).filter(([date]) => date !== yesterday).flatMap(([date, gs]) => gs.filter(g => !g.status).map(g => ({ g, date })))
  let pinMatched = 0, pinLines = 0
  if (PIN[league]) {
    try {
      const H = { 'User-Agent': UA['User-Agent'], Accept: 'application/json', 'x-api-key': PIN_KEY, Referer: 'https://www.pinnacle.com/', Origin: 'https://www.pinnacle.com' }
      let [id] = PIN[league]
      let mres = await fetch(`${PIN_URL}/leagues/${id}/matchups`, { headers: H })
      if (!mres.ok) {
        const ls = await (await fetch(`${PIN_URL}/sports/29/leagues?all=false`, { headers: H })).json()
        const L = (ls as any[]).find(x => PIN[league][1].test(x.name))
        if (L) { id = L.id; mres = await fetch(`${PIN_URL}/leagues/${id}/matchups`, { headers: H }) }
      }
      if (!mres.ok) unknown.add(`Pinnacle ${mres.status}`)
      else {
        const mus: any[] = await mres.json()
        const mks: any[] = await (await fetch(`${PIN_URL}/leagues/${id}/markets/straight`, { headers: H })).json()
        const pre = preGames(); const lineRows: any[] = []
        for (const m of mus) {
          if (m.parentId || m.participants?.length !== 2) continue
          const ph = m.participants.find((p: any) => p.alignment === 'home'), pa = m.participants.find((p: any) => p.alignment === 'away'); if (!ph || !pa) continue
          const kh = byPrefix(ph.name), ka = byPrefix(pa.name)
          if (!kh) unknown.add(`pn:${ph.name}`)
          if (!ka) unknown.add(`pn:${pa.name}`)
          const t = Date.parse(m.startTime)
          const hit = pre.find(x => Math.abs(Date.parse(x.g.start) - t) < 30 * 60000 && ((kh && x.g.home.name === kh) || (ka && x.g.away.name === ka)))
          if (!hit) continue
          const ms = mks.filter(x => x.matchupId === m.id && x.period === 0)
          const ml = ms.find(x => x.type === 'moneyline')
          const pr = (d: string) => { const p = ml?.prices?.find((x: any) => x.designation === d); return p ? pinDec(p.price) : null }
          if (ml && pr('home') && pr('away')) { odds.push({ game: hit.g, date: hit.date, src: 'pinnacle', h: pr('home'), d: pr('draw'), a: pr('away'), oh: null, od: null, oa: null }); pinMatched++ }
          for (const sp of ms.filter(x => x.type === 'spread'))
            for (const p of sp.prices ?? []) if (p.points != null) lineRows.push({ game_id: hit.g.id, league, side: p.designation, line: Number(p.points), odds: pinDec(p.price), books: 1, source: 'pinnacle', fetched_at: new Date().toISOString() })
          for (const tt of ms.filter(x => x.type === 'total'))
            for (const p of tt.prices ?? []) if (p.points != null && (p.designation === 'over' || p.designation === 'under')) addTot(hit.g.id, p.designation, p.points, pinDec(p.price), 1, 'pinnacle')
        }
        const uniq = [...new Map(lineRows.map(r => [`${r.game_id}|${r.side}|${r.line}`, r])).values()]
        if (uniq.length) { const { error } = await db.from('soccer_lines').upsert(uniq); if (!error) pinLines = uniq.length }
      }
    } catch (e) { unknown.add(`Pinnacle ${String(e).slice(0, 80)}`) }
  }

  // 백업: 피나클에서 한 경기도 못 맞췄을 때만 BetExplorer fixtures (1·X·2)
  if (BX[league] && pinMatched === 0 && preGames().length) {
    try {
      await sleep(1500 + Math.random() * 2500)
      const res = await fetch(`https://www.betexplorer.com/football/${BX[league]}/fixtures/`, { headers: { ...UA, Accept: 'text/html', 'Accept-Language': 'en' } })
      if (res.status === 429) unknown.add('BetExplorer 429')
      else if (res.ok) {
        const html = await res.text()
        const pre = preGames()
        for (const tr of html.split('<tr').slice(1)) {
          if (!tr.includes('data-odd=')) continue
          const m = tr.match(/class="in-match"><span>([^<]+)<\/span>\s*-\s*<span>([^<]+)<\/span>/); if (!m) continue
          const o = [...tr.matchAll(/data-odd="([0-9.]+)"/g)].map(x => +x[1]); if (o.length < 3) continue
          const kh = byPrefix(m[1].trim()), ka = byPrefix(m[2].trim())
          if (!kh) unknown.add(`bx:${m[1].trim()}`)
          if (!ka) unknown.add(`bx:${m[2].trim()}`)
          const hit = kh && ka ? pre.find(x => x.g.home.name === kh && x.g.away.name === ka) : undefined
          if (hit) odds.push({ game: hit.g, date: hit.date, src: 'betexplorer', h: o[0], d: o[1], a: o[2], oh: null, od: null, oa: null })
        }
      }
    } catch { /* 배당은 없어도 일정은 저장 */ }
  }

  // 어제 줄: 저장된 경기 중 새로 받은 것만 바꿔 끼움 (없던 경기는 안 넣음, 어제 줄이 없으면 건너뜀)
  const fresh = new Map(byDate[yesterday].map(g => [g.id, g]))
  delete byDate[yesterday]
  let yRow: { game_date: string; games: Game[] } | null = null
  if (fresh.size) {
    const { data: prevY } = await db.from('game_schedules').select('games').eq('sport', 'soccer').eq('league', league).eq('game_date', yesterday).maybeSingle()
    const old: Game[] = prevY?.games ?? []
    if (old.some(g => fresh.has(g.id))) yRow = { game_date: yesterday, games: old.map(g => fresh.get(g.id) ?? g) }
  }
  const rows = [...Object.entries(byDate).map(([game_date, games]) => ({ game_date, games })), ...(yRow ? [yRow] : [])]
    .map(({ game_date, games }) => ({ sport: 'soccer', league, game_date, games: games.sort((a, b) => a.start.localeCompare(b.start)), fetched_at: new Date().toISOString() }))
  const { error: se } = await db.from('game_schedules').upsert(rows)
  if (se) return log('error', { message: `schedule ${se.message}` })

  // 배당: 바뀐 것만 저장
  let changed = 0
  for (const o of odds) {
    if (!o.h || !o.a || o.date === yesterday) continue
    const { data: prev } = await db.from('odds_snapshots').select('home_odds, away_odds, draw_odds').eq('game_id', o.game.id).order('fetched_at', { ascending: false }).limit(1)
    const p = prev?.[0]
    if (p && Number(p.home_odds) === o.h && Number(p.away_odds) === o.a && Number(p.draw_odds) === (o.d ?? 0)) continue
    const { error } = await db.from('odds_snapshots').insert({ league, game_date: o.date, game_id: o.game.id, source: o.src, home_odds: o.h, away_odds: o.a, draw_odds: o.d,
      open_home: o.oh, open_away: o.oa, open_draw: o.od, books: 1, match_name: `${o.game.home.full} - ${o.game.away.full}` })
    if (!error) changed++
  }
  // 피나클 5대 리그 → pin_matchups·pin_odds
  const pin5: Record<string, unknown> = {}
  if (PIN5[league]) try {
    const H = { 'User-Agent': UA['User-Agent'], Accept: 'application/json', 'x-api-key': PIN_KEY, Referer: 'https://www.pinnacle.com/', Origin: 'https://www.pinnacle.com' }
    let [id] = PIN5[league]
    await sleep(1000 + Math.random() * 1500)
    let mres = await fetch(`${PIN_URL}/leagues/${id}/matchups`, { headers: H })
    if (!mres.ok) {
      const ls = await (await fetch(`${PIN_URL}/sports/29/leagues?all=false`, { headers: H })).json()
      const L = (ls as any[]).find(x => PIN5[league][1].test(x.name))
      if (L) { id = L.id; mres = await fetch(`${PIN_URL}/leagues/${id}/matchups`, { headers: H }) }
    }
    if (!mres.ok) pin5.http = mres.status
    else {
      const mus: any[] = await mres.json()
      await sleep(800 + Math.random() * 1200)
      const kres = await fetch(`${PIN_URL}/leagues/${id}/markets/straight`, { headers: H })
      const mks: any[] = kres.ok ? await kres.json() : []
      if (!kres.ok) pin5.marketsHttp = kres.status
      const now = new Date().toISOString()
      const tok = (s: string) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['club', 'city', 'united'].includes(w))
      const ours = rows.flatMap(r => r.games)
      const linked: any[] = [], unlinked: any[] = [], cand: any[] = []
      for (const m of mus) {
        if (m.parentId || (m.type ?? 'matchup') !== 'matchup' || m.participants?.length !== 2) continue
        const ph = m.participants.find((p: any) => p.alignment === 'home'), pa = m.participants.find((p: any) => p.alignment === 'away'); if (!ph || !pa) continue
        const t = Date.parse(m.startTime), th = tok(ph.name), ta = tok(pa.name)
        let best: Game | null = null, bs = 0
        for (const g of ours) {
          if (Math.abs(Date.parse(g.start) - t) > 30 * 60000) continue
          const sc = (tok(g.home.full ?? g.home.name).some(w => th.includes(w)) ? 1 : 0) + (tok(g.away.full ?? g.away.name).some(w => ta.includes(w)) ? 1 : 0)
          if (sc > bs) { bs = sc; best = g }
        }
        const row = { matchup_id: m.id, league, start_at: new Date(t).toISOString(), home: ph.name, away: pa.name, last_seen: now }
        if (best) linked.push({ ...row, game_id: best.id }); else unlinked.push(row)
        for (const x of mks) {
          if (x.matchupId !== m.id || x.period !== 0) continue
          const pr = (d: string) => { const q = x.prices?.find((y: any) => y.designation === d); return q ? pinDec(q.price) : null }
          const pt = (d: string) => { const q = x.prices?.find((y: any) => y.designation === d); return q?.points != null ? Number(q.points) : null }
          if (x.type === 'moneyline') cand.push({ matchup_id: m.id, market: 'ml', line: null, alt: false, p1: pr('home'), p2: pr('draw'), p3: pr('away') })
          else if (x.type === 'spread') { const l = pt('home'); if (l != null && PIN5_SPREAD.has(Math.abs(l))) cand.push({ matchup_id: m.id, market: 'spread', line: l, alt: !!x.isAlternate, p1: pr('home'), p2: null, p3: pr('away') }) }
          else if (x.type === 'total') { const l = pt('over'); if (l != null && PIN5_TOTAL.has(l)) cand.push({ matchup_id: m.id, market: 'total', line: l, alt: !!x.isAlternate, p1: pr('over'), p2: null, p3: pr('under') }) }
        }
      }
      if (linked.length) await db.from('pin_matchups').upsert(linked, { defaultToNull: false })
      if (unlinked.length) await db.from('pin_matchups').upsert(unlinked, { defaultToNull: false })
      // 바뀐 것만 (시장·기준점마다 마지막 줄과 비교)
      const ids = [...new Set(cand.map(c => c.matchup_id))]
      const last = new Map<string, any>()
      if (ids.length) {
        const { data: prev } = await db.from('pin_odds').select('matchup_id,market,line,alt,p1,p2,p3').in('matchup_id', ids).order('fetched_at', { ascending: false }).limit(10000)
        for (const r of prev ?? []) { const k = `${r.matchup_id}|${r.market}|${r.line == null ? '' : Number(r.line)}`; if (!last.has(k)) last.set(k, r) }
      }
      const same = (a: any, b: number | null) => (a == null ? null : Number(a)) === b
      // 같은 시장·기준점이 두 번 오면 주력 라인(alt false) 하나만
      const uniq = new Map<string, any>()
      for (const c of cand) { const k = `${c.matchup_id}|${c.market}|${c.line == null ? '' : c.line}`; const u = uniq.get(k); if (!u || (u.alt && !c.alt)) uniq.set(k, c) }
      const ins = [...uniq.values()].filter(c => c.p1 && c.p3).filter(c => {
        const p = last.get(`${c.matchup_id}|${c.market}|${c.line == null ? '' : c.line}`)
        return !p || !same(p.p1, c.p1) || !same(p.p2, c.p2) || !same(p.p3, c.p3) || p.alt !== c.alt
      }).map(c => ({ ...c, fetched_at: now }))
      if (ins.length) { const { error } = await db.from('pin_odds').insert(ins); if (error) pin5.error = error.message }
      Object.assign(pin5, { matchups: linked.length + unlinked.length, linked: linked.length, markets: cand.length, inserted: ins.length,
        unlinkedToday: unlinked.filter(u => ours.length && Date.parse(u.start_at) < Date.now() + 2 * 86400000).map(u => `${u.home} - ${u.away}`) })
    }
  } catch (e) { pin5.error = String(e).slice(0, 120) }

  // 핸디 배당: Action Network (미국 동부 날짜, 한 번에 그날 전 리그) — 북메이커별 주력 핸디(±0.5·±1.5·±2.5)를 기준점별 평균 → soccer_lines
  let lines = 0, anMatched = 0
  if (AN_LEAGUE[league]) try {
    const pre = rows.filter(r => r.game_date !== yesterday).flatMap(r => r.games).filter(g => !g.status)
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
        const tacc = new Map<string, { side: string; line: number; sum: number; n: number }>()
        for (const [book, m] of Object.entries<any>(ag.markets ?? {})) {
          if (book === '30') continue   // 30 = 오픈 배당
          for (const sp of m?.event?.spread ?? []) {
            const o = dec(sp.odds); if (!o || sp.value == null) continue
            const k = `${sp.side}|${sp.value}`; const a = acc.get(k) ?? { side: sp.side, line: Number(sp.value), sum: 0, n: 0 }
            a.sum += o; a.n++; acc.set(k, a)
          }
          for (const tt of m?.event?.total ?? []) {
            const o = dec(tt.odds); if (!o || tt.value == null || (tt.side !== 'over' && tt.side !== 'under')) continue
            const k = `${tt.side}|${tt.value}`; const a = tacc.get(k) ?? { side: tt.side, line: Number(tt.value), sum: 0, n: 0 }
            a.sum += o; a.n++; tacc.set(k, a)
          }
        }
        const up = [...acc.values()].map(a => ({ game_id: g.id, league, side: a.side, line: a.line, odds: Math.round(a.sum / a.n * 100) / 100, books: a.n, source: 'actionnetwork', fetched_at: new Date().toISOString() }))
        if (up.length) { const { error } = await db.from('soccer_lines').upsert(up); if (!error) lines += up.length }
        for (const a of tacc.values()) addTot(g.id, a.side, a.line, a.sum / a.n, a.n, 'actionnetwork')
      }
    }
  } catch { /* 핸디는 없어도 일정·승무패는 저장됨 */ }

  // 총골 저장: 같은 경기·쪽·기준점은 북 수가 많은 출처 (Action Network 평균 > DraftKings·피나클 한 곳)
  let totals = 0
  const totBest = new Map<string, typeof totRows[number]>()
  for (const r of totRows) { const k = `${r.game_id}|${r.side}|${r.line}`; const p = totBest.get(k); if (!p || r.books >= p.books) totBest.set(k, r) }
  if (totBest.size) { const { error } = await db.from('soccer_lines').upsert([...totBest.values()]); if (!error) totals = totBest.size }

  return log('ok', { pin5, pinMatched, pinLines, anMatched, lines, totals, games: rows.reduce((s, r) => s + r.games.length, 0), counts: Object.fromEntries(rows.map(r => [r.game_date, r.games.length])), odds: odds.length, changed, unmatched: [...unknown] })
})

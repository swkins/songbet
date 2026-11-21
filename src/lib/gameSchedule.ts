// ─── 경기 일정 (Supabase game_schedules) — 분석 탭·베팅추가 공용 ─────
// 일정은 Supabase 함수 update-schedule이 넣는다 (supabase/functions/update-schedule).
import dayjs from 'dayjs'
import { supabase } from './supabase'

export interface ScheduleTeam { name?: string; full?: string; abbr?: string; record?: string | null; score?: string | number | null }
export interface ScheduleGame { id: string; start: string; home: ScheduleTeam; away: ScheduleTeam; venue?: string | null; status?: string | null; note?: string | null }
export interface ScheduleRow { sport: string; league: string; game_date: string; games: ScheduleGame[]; fetched_at: string }

export type GameState = 'pre' | 'live' | 'ended'
// 일정은 하루 몇 번만 갱신되므로, 상태가 '경기 전'으로 남아 있어도 시작 후 이 시간이 지나면 끝난 걸로 본다
const MAX_GAME_HOURS = 3

export function gameState(g: ScheduleGame, now = Date.now()): GameState {
  if (g.status === '종료' || /final/i.test(g.status ?? '')) return 'ended'
  const start = Date.parse(g.start)
  if (now >= start + MAX_GAME_HOURS * 3600000) return 'ended'
  // ESPN은 경기 전에도 status("11/17 - 7:30 PM EST")·점수 0이 와서, 시작 시각이 지났을 때만 진행 중으로 본다
  if (now >= start) return 'live'
  return 'pre'
}

// NBA는 ESPN 영어 이름 → 한글 (짧은 이름은 분석 탭, 긴 이름은 등록 팀과 맞추는 데 씀)
const NBA: Record<string, [string, string]> = {
  'Atlanta Hawks': ['애틀랜타', '애틀랜타 호크스'], 'Boston Celtics': ['보스턴', '보스턴 셀틱스'], 'Brooklyn Nets': ['브루클린', '브루클린 네츠'],
  'Charlotte Hornets': ['샬럿', '샬럿 호네츠'], 'Chicago Bulls': ['시카고', '시카고 불스'], 'Cleveland Cavaliers': ['클리블랜드', '클리블랜드 캐벌리어스'],
  'Dallas Mavericks': ['댈러스', '댈러스 매버릭스'], 'Denver Nuggets': ['덴버', '덴버 너기츠'], 'Detroit Pistons': ['디트로이트', '디트로이트 피스톤스'],
  'Golden State Warriors': ['골든스테이트', '골든 스테이트 워리어스'], 'Houston Rockets': ['휴스턴', '휴스턴 로키츠'], 'Indiana Pacers': ['인디애나', '인디애나 페이서스'],
  'LA Clippers': ['LA 클리퍼스', '로스앤젤레스 클리퍼스'], 'Los Angeles Clippers': ['LA 클리퍼스', '로스앤젤레스 클리퍼스'],
  'Los Angeles Lakers': ['LA 레이커스', '로스앤젤레스 레이커스'], 'Memphis Grizzlies': ['멤피스', '멤피스 그리즐리스'],
  'Miami Heat': ['마이애미', '마이애미 히트'], 'Milwaukee Bucks': ['밀워키', '밀워키 벅스'], 'Minnesota Timberwolves': ['미네소타', '미네소타 팀버울브스'],
  'New Orleans Pelicans': ['뉴올리언스', '뉴올리언스 펠리컨스'], 'New York Knicks': ['뉴욕', '뉴욕 닉스'], 'Oklahoma City Thunder': ['오클라호마시티', '오클라호마 시티 썬더'],
  'Orlando Magic': ['올랜도', '올랜도 매직'], 'Philadelphia 76ers': ['필라델피아', '필라델피아 76ers'], 'Phoenix Suns': ['피닉스', '피닉스 선스'],
  'Portland Trail Blazers': ['포틀랜드', '포틀랜드 트레일 블레이저스'], 'Sacramento Kings': ['새크라멘토', '새크라멘토 킹스'],
  'San Antonio Spurs': ['샌안토니오', '샌안토니오 스퍼스'], 'Toronto Raptors': ['토론토', '토론토 랩터스'], 'Utah Jazz': ['유타', '유타 재즈'],
  'Washington Wizards': ['워싱턴', '워싱턴 위저즈'],
}
// 화면용 리그 이름 앞 나라 (2026-11-22 사용자 요청 — 베팅 모드 종목·리그 "잉글랜드: 프리미어리그"). 저장·비교는 원래 이름 그대로.
const LEAGUE_COUNTRY: Record<string, [string, string?]> = {
  '프리미어리그': ['잉글랜드'], '챔피언쉽': ['잉글랜드'], '잉글랜드 리그1': ['잉글랜드', '리그1'],
  '라리가': ['스페인'], '라리가2': ['스페인'], '세리에A': ['이탈리아'], '세리에B': ['이탈리아'],
  '분데스리가': ['독일'], '분데스리가2': ['독일'], '리그1': ['프랑스'], '리그2': ['프랑스'],
  '에레디비시': ['네덜란드'], '프리메이라리가': ['포르투갈'], '쥬필러리그': ['벨기에'],
  'K리그1': ['대한민국'], 'K리그2': ['대한민국'], 'J리그1': ['일본'], 'J리그2': ['일본'],
}
/** "잉글랜드: 프리미어리그" — 나라가 정해진 리그만, 나머지는 그대로 */
export const leagueLabel = (lg: string) => { const c = LEAGUE_COUNTRY[lg]; return c ? `${c[0]}: ${c[1] ?? lg}` : lg }
/** 화면용 짧은 이름 */
export const koName = (n?: string) => (n && NBA[n]?.[0]) || n || '?'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** 일정의 팀 이름 → 리그 관리에 등록된 팀 이름 (베팅 기록·통계가 같은 이름으로 쌓이게).
 *  같은 리그 등록 팀 중: 띄어쓰기 무시 일치 → 한쪽이 다른 쪽을 포함(하나뿐일 때) → 단어가 가장 많이 겹치는 팀(하나뿐일 때).
 *  못 찾으면 일정 이름 그대로 (팀 이름이 바뀐 경우 등). */
export function resolveTeamName(t: ScheduleTeam, league: string, registered: { league: string; name: string }[]): string {
  const pool = registered.filter(r => r.league === league)
  const names = [t.name && NBA[t.name]?.[1], t.full, t.name].filter((x): x is string => !!x)
  for (const nm of names) {
    const n = norm(nm)
    const exact = pool.find(r => norm(r.name) === n)
    if (exact) return exact.name
    const contains = pool.filter(r => norm(r.name).includes(n) || n.includes(norm(r.name)))
    if (contains.length === 1) return contains[0].name
  }
  for (const nm of names) {
    const tokens = nm.split(/\s+/).filter(w => w.length >= 2).map(norm)
    if (tokens.length < 2) continue
    const scored = pool.map(r => ({ r, s: tokens.filter(w => norm(r.name).includes(w)).length })).filter(x => x.s > 0)
    const best = Math.max(0, ...scored.map(x => x.s))
    const top = scored.filter(x => x.s === best)
    if (best > 0 && top.length === 1) return top[0].r.name
  }
  return names[0] ? (t.name && NBA[t.name]?.[1]) || t.full || t.name! : '?'
}

/** 오늘부터의 일정 (모든 종목) */
export async function loadSchedules(sport?: string, from?: string): Promise<ScheduleRow[]> {
  let q = supabase.from('game_schedules').select('sport, league, game_date, games, fetched_at').gte('game_date', from ?? dayjs().format('YYYY-MM-DD')).order('game_date')
  if (sport) q = q.eq('sport', sport)
  const { data } = await q
  return (data ?? []) as ScheduleRow[]
}

/** 베팅추가용: 끝나지 않은 경기(경기 전·경기 중)만, 팀 이름은 등록 팀 이름으로 */
export interface BetPickGame { id: string; sport: string; league: string; start: string; state: GameState; status?: string | null; home: string; away: string }
export function upcomingForBet(rows: ScheduleRow[], registered: { league: string; name: string; sport?: string }[]): BetPickGame[] {
  const now = Date.now()
  return rows.flatMap(r => r.games.map(g => ({ g, r })))
    .map(({ g, r }) => ({ g, r, state: gameState(g, now) }))
    .filter(x => x.state !== 'ended')
    .map(({ g, r, state }) => {
      const reg = registered.filter(t => !t.sport || t.sport === r.sport)
      return { id: g.id, sport: r.sport, league: r.league, start: g.start, state, status: g.status, home: resolveTeamName(g.home, r.league, reg), away: resolveTeamName(g.away, r.league, reg) }
    })
    .sort((a, b) => a.start.localeCompare(b.start))
}

// 리그 순서 (사용자 요청): 축구는 5대 리그를 맨 위(이 순서), 그다음 K리그·J리그, 농구는 NBA를 맨 위, 나머지는 가나다순 — 분석 탭·베팅 모드 공용
// 축구 리그 이름 (2026-11-21 사용자 요청으로 바꿈): 잉글랜드 1부 → 프리미어리그 … 일본 2부 → J리그2, 잉글랜드 3부 → 잉글랜드 리그1
const TOP_LEAGUES: Record<string, string[]> = {
  // 5대 리그 → 프리메이라리가·쥬필러리그·에레디비시 → 2부 리그 → K리그·J리그 → 나머지 가나다순 (사용자 요청 2026-11-21)
  soccer: ['프리미어리그', '라리가', '세리에A', '분데스리가', '리그1', '프리메이라리가', '쥬필러리그', '에레디비시',
    '챔피언쉽', '라리가2', '세리에B', '분데스리가2', '리그2', '잉글랜드 리그1', 'K리그1', 'K리그2', 'J리그1', 'J리그2'],
  basketball: ['NBA'],
  // 배구: V리그 먼저, 그다음 365Scores 해외 리그 (2026-11-22)
  volleyball: ['V리그 남자', 'V리그 여자', '이탈리아 남자', '이탈리아 여자', '폴란드 남자', '폴란드 여자', '터키 남자', '터키 여자', '브라질 남자', '브라질 여자', '체코 남자', '벨기에 여자'],
}
/** 리그 이름 순서 — 축구는 TOP_LEAGUES 순서 먼저, 그다음 K리그·J리그(영문 시작 — 'ko' 정렬은 영문을 맨 뒤로 보내서), 나머지 가나다순 (사용자 요청 2026-11-21) */
export function leagueNameCompare(a: string, b: string): number {
  // 축구 리그는 분석 탭과 같은 순서(TOP_LEAGUES.soccer), 그 밖은 K리그·J리그 먼저 → 가나다순
  const top = TOP_LEAGUES.soccer
  const r = (x: string) => { const i = top.indexOf(x); return i >= 0 ? i : top.length + (x.startsWith('K리그') ? 0 : x.startsWith('J리그') ? 1 : 2) }
  return r(a) - r(b) || a.localeCompare(b, 'ko')
}
export function sortLeagues(sport: string, leagues: string[]): string[] {
  const top = TOP_LEAGUES[sport] ?? []
  const rank = (l: string) => { const i = top.indexOf(l); return i < 0 ? top.length : i }
  return [...leagues].sort((a, b) => rank(a) - rank(b) || leagueNameCompare(a, b))
}

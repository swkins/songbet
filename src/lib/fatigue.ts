// ─── 팀 컨디션 % (피로도) — 100 = 2일 이상 쉬고 홈 경기, 낮을수록 피곤 ─────
// 사용자 요청: 백투백(홈·원정 조합), 비행 거리·시차, 5일 3경기·7일 4경기 같은 일정 밀도, 원정 연전까지.
// 데이터: 이번 시즌 박스스코어(v_team_games: 날짜·홈/원정·상대) + 구장 좌표. 사용량 없이 화면에서 계산.
// 감점 값은 처음 넣은 값(커뮤니티·블로그에서 말하는 백투백 1.5~3점 수준에 맞춤) — 지난 시즌 백테스트로 다듬을 것.

// NBA 구장 [위도, 경도, 시간대(동부=0, 중부=-1, 산악=-2, 서부=-3)]
const NBA_ARENA: Record<string, [number, number, number]> = {
  'Atlanta Hawks': [33.757, -84.396, 0], 'Boston Celtics': [42.366, -71.062, 0], 'Brooklyn Nets': [40.683, -73.976, 0],
  'Charlotte Hornets': [35.225, -80.839, 0], 'Chicago Bulls': [41.881, -87.674, -1], 'Cleveland Cavaliers': [41.497, -81.688, 0],
  'Dallas Mavericks': [32.790, -96.810, -1], 'Denver Nuggets': [39.749, -105.008, -2], 'Detroit Pistons': [42.341, -83.055, 0],
  'Golden State Warriors': [37.768, -122.388, -3], 'Houston Rockets': [29.751, -95.362, -1], 'Indiana Pacers': [39.764, -86.155, 0],
  'LA Clippers': [33.945, -118.343, -3], 'Los Angeles Lakers': [34.043, -118.267, -3], 'Memphis Grizzlies': [35.138, -90.051, -1],
  'Miami Heat': [25.781, -80.188, 0], 'Milwaukee Bucks': [43.045, -87.917, -1], 'Minnesota Timberwolves': [44.979, -93.276, -1],
  'New Orleans Pelicans': [29.949, -90.082, -1], 'New York Knicks': [40.751, -73.993, 0], 'Oklahoma City Thunder': [35.463, -97.515, -1],
  'Orlando Magic': [28.539, -81.384, 0], 'Philadelphia 76ers': [39.901, -75.172, 0], 'Phoenix Suns': [33.446, -112.071, -2],
  'Portland Trail Blazers': [45.532, -122.667, -3], 'Sacramento Kings': [38.580, -121.500, -3], 'San Antonio Spurs': [29.427, -98.438, -1],
  'Toronto Raptors': [43.643, -79.379, 0], 'Utah Jazz': [40.768, -111.901, -2], 'Washington Wizards': [38.898, -77.021, 0],
}

function km(a: [number, number, number], b: [number, number, number]): number {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

export interface PastGame { game_date: string; is_home: boolean | null; opp: string | null; game_id?: string; team_min?: number | null; team_score?: number | null; opp_score?: number | null }

const REG_MIN: Record<string, number> = { NBA: 48, KBL: 40, WKBL: 40 }
/** 팀 출전시간 합계로 연장 횟수 (1OT = 5분 × 5명 = 25분) */
export function otCount(league: string, teamMin?: number | null): number {
  const reg = REG_MIN[league]; if (!reg || !teamMin) return 0
  return Math.max(0, Math.round((teamMin / 5 - reg) / 5))
}
export interface Condition {
  pct: number                       // 40~100
  items: { text: string; pts: number }[]   // 감점 이유
  b2b: boolean
  restDays: number | null           // 직전 경기 뒤 쉰 날 (0 = 백투백)
  margin?: number                   // NBA: 피로 점수 합 (예상 마진에 그대로 더함, 0 이하) — items.pts도 점수
}

// ─── NBA 팀 피로 = 점수 (2026-11-26 사용자 요청 — 백투백·장거리 이동·연장·일정 밀집·원정 연전을 정밀하게, 데이터보다 크게) ─────
// 근거: scripts/nba_fatigue_backtest.py (2011-22, 11,119경기, 우리 팀 레이팅 대비 실제 효과): 백투백 −1.1(앞 시즌)~−2.1(뒤 시즌) ·
//  백투백+전날 연장 추가 −1.1~−1.8 · 백투백 전날 이동 1,000km당 −0.35 · 2일 안 연장 −0.5 · 고지대 원정 −1.1~−1.3 · 6일 4경기 −0.7~0 ·
//  원정 연전·시차·누적 이동은 거의 0 (원정 연전이 힘든 건 그 안의 백투백·밀집 때문). 시장은 이미 거의 다 반영(남는 건 연장 −0.7·밀집 −0.3).
//  사용자 요청 "반영할 수 있는 최대한, 너무 과하지 않게" → 아래 값으로 배율을 바꿔 가며 같은 데이터 MAE: 피로 없음 10.411 · ×0.5 10.375 ·
//  **지금 값(×0.75) 10.384** · ×1.0 10.414(없는 것과 같음) · ×1.25 10.464 — 예측이 나빠지지 않는 가장 큰 쪽 (2011-16·2018-22도 같은 순서).
//  원정 연전도 넣음(사용자 판단, 데이터상 효과 작음). 3일+ 휴식 등 플러스는 시즌마다 부호가 바뀌어 안 넣음. 예측 보고서로 확인하며 조정.
export const NBA_FATIGUE = {
  b2b: -1.9,              // 백투백
  b2bKm: -0.5,            // 백투백 전날 밤 이동 1,000km당
  rest1Km: -0.2,          // 하루 쉬고 이동 1,000km당 (장거리 비행)
  ot: [-1.5, -0.75, -0.4], // 연장 1번당: 전날 · 2일 전 · 3일 전
  dense: [[7, 5, -1.1], [6, 4, -0.75], [4, 3, -0.5]] as [number, number, number][],   // 일정 밀집 (오늘 포함, 가장 큰 것 하나)
  road: [[5, -1.1], [4, -0.75], [3, -0.4]] as [number, number][],                      // 원정 n연전째 (오늘 원정 포함)
  altitude: -0.9,         // 덴버·유타 원정
  floor: -6,              // 합계 최저
}
const ALTITUDE = new Set(['Denver Nuggets', 'Utah Jazz'])
function nbaFatigue(team: string, isHome: boolean, host: string, gameDate: string, games: PastGame[]): Condition {
  const F = NBA_FATIGUE
  const items: { text: string; pts: number }[] = []
  const add = (text: string, pts: number) => { if (pts < -0.05) items.push({ text, pts: Math.round(pts * 10) / 10 }) }
  const loc = (g: PastGame) => NBA_ARENA[(g.is_home ? team : g.opp) ?? ''] ?? null
  const here = NBA_ARENA[host] ?? null
  const last = games[0]
  const restDays = last ? dayDiff(last.game_date, gameDate) - 1 : null
  const b2b = restDays === 0
  const tag = (h: boolean | null) => (h ? '홈' : '원정')
  if (b2b) add(`백투백 (${tag(last!.is_home)} → ${tag(isHome)})`, F.b2b)
  if (last && here && (b2b || restDays === 1)) {
    const from = loc(last)
    if (from) {
      const d = km(from, here), tz = from[2] - here[2]
      if (d >= 300) add(`${b2b ? '전날 밤' : '하루 쉬고'} 이동 ${Math.round(d).toLocaleString()}km${tz ? ` · 시차 ${Math.abs(tz)}시간` : ''}`, (b2b ? F.b2bKm : F.rest1Km) * d / 1000)
    }
  }
  for (const g of games) {
    const ago = dayDiff(g.game_date, gameDate), ot = otCount('NBA', g.team_min)
    if (ago > 3 || !ot) continue
    add(`${ago === 1 ? '전날' : `${ago}일 전`} ${ot > 1 ? `${ot}차 ` : ''}연장`, ot * F.ot[ago - 1])
  }
  const within = (n: number) => 1 + games.filter(g => dayDiff(g.game_date, gameDate) < n).length
  const hit = F.dense.find(([days, cnt]) => within(days) >= cnt)
  if (hit) add(`${hit[0]}일 ${within(hit[0])}경기`, hit[2])
  if (!isHome) {
    let k = 1; while (k - 1 < games.length && games[k - 1].is_home === false) k++
    const r = F.road.find(([n]) => k >= n)
    if (r) add(`원정 ${k}연전째`, r[1])
    if (ALTITUDE.has(host)) add('고지대 원정', F.altitude)
  }
  const margin = Math.max(F.floor, Math.round(items.reduce((a, x) => a + x.pts, 0) * 10) / 10)
  // pct는 예전 화면 색·모의베팅(컨디션 차)용으로만: 1점 = 5%
  return { pct: Math.max(40, Math.round(100 + margin * 5)), items, b2b, restDays, margin }
}

/** team = 기록상 팀 이름, isHome = 오늘 홈인지, host = 오늘 경기장 팀(홈팀) 이름, past = 이번 시즌 그 팀 경기(오늘 전) */
export function teamCondition(league: string, team: string, isHome: boolean, host: string, gameDate: string, past: PastGame[]): Condition {
  const nba = league === 'NBA'
  const games = past.filter(g => g.game_date < gameDate).sort((a, b) => b.game_date.localeCompare(a.game_date))
  if (nba) return nbaFatigue(team, isHome, host, gameDate, games)
  const items: { text: string; pts: number }[] = []
  const add = (text: string, pts: number) => { if (pts < 0) items.push({ text, pts: Math.round(pts * 10) / 10 }) }
  const loc = (g: PastGame) => NBA_ARENA[(g.is_home ? team : g.opp) ?? ''] ?? null
  const here = NBA_ARENA[host] ?? null

  const last = games[0]
  const restDays = last ? dayDiff(last.game_date, gameDate) - 1 : null
  const b2b = restDays === 0
  const tag = (h: boolean | null) => (h ? '홈' : '원정')

  // 1) 휴식: 백투백 −10, 하루 휴식 −2
  if (b2b) add(`백투백 (${tag(last!.is_home)} → ${tag(isHome)})`, -10)
  else if (restDays === 1) add('하루 휴식', -2)

  // 2) 직전 경기장 → 오늘 경기장 이동 (NBA): 600km당 −1 (최대 −7), 시차 1시간당 −0.7 — 백투백 ×1.5 · 하루 휴식 ×1 · 2일+ 휴식 ×0.5
  if (nba && last && here) {
    const from = loc(last)
    if (from) {
      const d = km(from, here), tz = Math.abs(from[2] - here[2])
      const mul = b2b ? 1.5 : restDays === 1 ? 1 : 0.5
      if (d >= 300) add(`이동 ${Math.round(d).toLocaleString()}km${tz ? ` · 시차 ${tz}시간` : ''}${b2b ? ' (백투백 이동)' : ''}`, -Math.min(7, d / 600 + tz * 0.7) * mul)
    }
  }

  // 2b) 최근 연장: 전날 1OT당 −3 · 2일 전 −2 · 3일 전 −1
  for (const g of games) {
    const ago = dayDiff(g.game_date, gameDate), ot = otCount(league, g.team_min)
    if (ago > 3 || !ot) continue
    add(`${ago === 1 ? '전날' : `${ago}일 전`} ${ot > 1 ? `${ot}차 ` : ''}연장`, -ot * (ago === 1 ? 3 : ago === 2 ? 2 : 1))
  }

  // 3) 일정 밀도 (오늘 포함): 4일 3경기 −6 · 5일 3경기 −4 · 6일 4경기 −8 · 7일 4경기 −6 · 7일 5경기 −10 — 가장 큰 것 하나
  const within = (n: number) => 1 + games.filter(g => dayDiff(g.game_date, gameDate) < n).length
  const dens: [number, number, number][] = [[7, 5, -10], [6, 4, -8], [4, 3, -6], [7, 4, -6], [5, 3, -4]]
  const hit = dens.find(([days, cnt]) => within(days) >= cnt)
  if (hit) add(`${hit[0]}일 ${within(hit[0])}경기`, hit[2])

  // 4) 원정 연전 (오늘 원정 포함): 3연전 −2 · 4연전 −4 · 5연전+ −6
  if (!isHome) {
    let k = 1; while (k - 1 < games.length && games[k - 1].is_home === false) k++
    if (k >= 3) add(`원정 ${k}연전`, k >= 5 ? -6 : k === 4 ? -4 : -2)
  }

  // 5) 최근 7일 누적 이동 (NBA, 직전 이동 뺀 나머지): 2,500km당 −1 (최대 −4)
  if (nba && here) {
    const recent = games.filter(g => dayDiff(g.game_date, gameDate) <= 7).reverse()   // 오래된 순
    let tot = 0
    for (let i = 1; i < recent.length; i++) { const a = loc(recent[i - 1]), b = loc(recent[i]); if (a && b) tot += km(a, b) }
    if (tot >= 2500) add(`최근 7일 이동 ${Math.round(tot).toLocaleString()}km`, -Math.min(4, tot / 2500))
  }

  const pct = Math.max(40, Math.round(100 + items.reduce((a, x) => a + x.pts, 0)))
  return { pct, items, b2b, restDays }
}

/** 컨디션 1%p 차이 = 점수 (NBA 0.17 — 홈 백투백 −10%면 약 1.7점, 원정 장거리 백투백 −20%면 약 3.4점) */
export const COND_K: Record<string, number> = { NBA: 0.17, KBL: 0.13, WKBL: 0.11 }

export function conditionColor(p: number): string {
  return p >= 95 ? '#00E87A' : p >= 85 ? '#A3E635' : p >= 75 ? '#FACC15' : p >= 60 ? '#FF8C42' : '#FF4D6D'
}
export const conditionLabel = (p: number) => p >= 95 ? '좋음' : p >= 85 ? '보통' : p >= 75 ? '피로' : p >= 60 ? '피로 누적' : '피로 경고'

// ─── 선수 피로도 (출전시간 부담) ─────
// 팀 컨디션(일정·이동) 위에 선수 개인 감점: 직전 경기 많이 뛴 정도, 최근 7일 누적 출전시간. 대승·대패로 로테이션 돌린 경기는 표시만.
// 화면 % = 팀 컨디션 − 개인 감점, 75% 아래면 '누적 경고'. 시뮬레이션은 개인 감점 × 0.35만큼 그 선수 오버롤을 깎는다.
export interface PlayerFatigue { pen: number; items: { text: string; pts: number }[]; note: string | null }
export function playerFatigue(league: string, seasonMin: number | null, gameDate: string,
  teamGames: PastGame[], mins: Map<string, number | null>): PlayerFatigue {
  const items: { text: string; pts: number }[] = []
  let note: string | null = null
  const nba = league === 'NBA'
  const games = teamGames.filter(g => g.game_date < gameDate).sort((a, b) => b.game_date.localeCompare(a.game_date))
  const sMin = seasonMin ?? 20
  const last = games[0]
  if (last && last.game_id) {
    const ago = dayDiff(last.game_date, gameDate), m = mins.get(last.game_id)
    if (m != null && ago <= 2) {
      const thr = Math.max(sMin + 4, nba ? 34 : 30)
      const ot = otCount(league, last.team_min)
      if (m > thr) items.push({ text: `${ago === 1 ? '전날' : '2일 전'} ${Math.round(m)}분${ot ? ` (연장)` : ''}`, pts: -Math.round(Math.min(8, (m - thr) * (ago === 1 ? 1 : 0.5)) * 10) / 10 })
      const margin = last.team_score != null && last.opp_score != null ? last.team_score - last.opp_score : null
      if (margin != null && Math.abs(margin) >= 20 && m < sMin - 5) note = `${margin > 0 ? '대승' : '대패'}(${margin > 0 ? '+' : ''}${margin}) 로테이션 — 직전 ${Math.round(m)}분 (평소 ${Math.round(sMin)}분)`
    }
  }
  // 최근 7일 누적 (오늘 전)
  const wk = games.filter(g => dayDiff(g.game_date, gameDate) <= 7 && g.game_id)
  const load = wk.reduce((a, g) => a + (mins.get(g.game_id!) ?? 0), 0)
  const lim = nba ? 110 : 95
  if (wk.length >= 3 && load > lim) items.push({ text: `7일 ${Math.round(load)}분 (${wk.length}경기)`, pts: -Math.round(Math.min(6, (load - lim) / 6) * 10) / 10 })
  return { pen: -items.reduce((a, x) => a + x.pts, 0), items, note }
}

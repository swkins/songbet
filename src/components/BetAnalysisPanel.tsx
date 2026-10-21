import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ComposedChart, Line, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { basketCurves, soccerCurves, volleyCurves, type CurveChartData } from '../lib/curveChart'
import type { Odds as VolleyOdds, Game as VolleyGame } from '../lib/volleyJudge'
import { cleanGames, type Game as BasketGame, type Odds as BasketOdds } from '../lib/basketJudge'
import { latestSeason, MAX_SEASONS, recentSeasons, seasonSummary, seasonWeigher } from '../lib/seasonWeight'
import { NBA_GAMES } from '../data/nbaGames'
import { KBL_GAMES } from '../data/kblGames'
import { CBA_GAMES } from '../data/cbaGames'
import { BLEAGUE_GAMES } from '../data/bleagueGames'
import { EUROLEAGUE_GAMES } from '../data/euroleagueGames'
import { NBL_GAMES } from '../data/nblGames'
import { judgeNba } from '../leagues/nba'
import { judgeKbl } from '../leagues/kbl'
import { judgeCba } from '../leagues/cba'
import { judgeBleague } from '../leagues/bleague'
import { judgeEuroleague } from '../leagues/euroleague'
import { judgeNbl } from '../leagues/nbl'
import { KRMEN_GAMES } from '../data/krMenGames'
import { KRWOMEN_GAMES } from '../data/krWomenGames'
import { ITMEN_GAMES } from '../data/itMenGames'
import { ITWOMEN_GAMES } from '../data/itWomenGames'
import { TRMEN_GAMES } from '../data/trMenGames'
import { TRWOMEN_GAMES } from '../data/trWomenGames'
import { PLMEN_GAMES } from '../data/plMenGames'
import { PLWOMEN_GAMES } from '../data/plWomenGames'
import { judgeKrMen } from '../leagues/krMen'
import { judgeKrWomen } from '../leagues/krWomen'
import { judgeItMen } from '../leagues/itMen'
import { judgeItWomen } from '../leagues/itWomen'
import { judgeTrMen } from '../leagues/trMen'
import { judgeTrWomen } from '../leagues/trWomen'
import { judgePlMen } from '../leagues/plMen'
import { judgePlWomen } from '../leagues/plWomen'
import { cleanGames as cleanSoccer, type Game as SoccerGame, type Odds as SoccerOdds } from '../lib/soccerJudge'
import { EPL_GAMES } from '../data/eplGames'
import { LALIGA_GAMES } from '../data/laligaGames'
import { BUNDESLIGA_GAMES } from '../data/bundesligaGames'
import { judgeEpl } from '../leagues/epl'
import { judgeLaliga } from '../leagues/laliga'
import { judgeBundesliga } from '../leagues/bundesliga'
import { UCL_GAMES } from '../data/uclGames'
import { judgeUcl } from '../leagues/ucl'
import { LIGUE1_GAMES } from '../data/ligue1Games'
import { EREDIVISIE_GAMES } from '../data/eredivisieGames'
import { PORTUGAL_GAMES } from '../data/portugalGames'
import { SUPERLIG_GAMES } from '../data/superligGames'
import { J1_GAMES } from '../data/j1Games'
import { J2_GAMES } from '../data/j2Games'
import { K1_GAMES } from '../data/k1Games'
import { K2_GAMES } from '../data/k2Games'
import { MLS_GAMES } from '../data/mlsGames'
import { CHAMPIONSHIP_GAMES } from '../data/championshipGames'
import { LALIGA2_GAMES } from '../data/laliga2Games'
import { BUNDESLIGA2_GAMES } from '../data/bundesliga2Games'
import { SERIEB_GAMES } from '../data/seriebGames'
import { LIGUE2_GAMES } from '../data/ligue2Games'
import { LEAGUEONE_GAMES } from '../data/leagueoneGames'
import { SAUDI_GAMES } from '../data/saudiGames'
import { BRAZIL_GAMES } from '../data/brazilGames'
import { CHINA_GAMES } from '../data/chinaGames'
import { DENMARK_GAMES } from '../data/denmarkGames'
import { SCOTLAND_GAMES } from '../data/scotlandGames'
import { ALEAGUE_GAMES } from '../data/aleagueGames'
import { AUSTRIA_GAMES } from '../data/austriaGames'
import { POLAND_GAMES } from '../data/polandGames'
import { SERIEA_GAMES } from '../data/serieaGames'
import { judgeLigue1 } from '../leagues/ligue1'
import { judgeEredivisie } from '../leagues/eredivisie'
import { judgePortugal } from '../leagues/portugal'
import { judgeSuperlig } from '../leagues/superlig'
import { judgeJ1 } from '../leagues/j1'
import { judgeJ2 } from '../leagues/j2'
import { judgeK1 } from '../leagues/k1'
import { judgeK2 } from '../leagues/k2'
import { judgeMls } from '../leagues/mls'
import { judgeChampionship } from '../leagues/championship'
import { judgeLaliga2 } from '../leagues/laliga2'
import { judgeBundesliga2 } from '../leagues/bundesliga2'
import { judgeSerieb } from '../leagues/serieb'
import { judgeLigue2 } from '../leagues/ligue2'
import { judgeLeagueone } from '../leagues/leagueone'
import { judgeSaudi } from '../leagues/saudi'
import { judgeBrazil } from '../leagues/brazil'
import { judgeChina } from '../leagues/china'
import { judgeDenmark } from '../leagues/denmark'
import { judgeScotland } from '../leagues/scotland'
import { judgeAleague } from '../leagues/aleague'
import { judgeAustria } from '../leagues/austria'
import { judgePoland } from '../leagues/poland'
import { judgeSeriea } from '../leagues/seriea'

/* ── 베팅분석 — 대시보드 사이트 현황 자리에서 탭으로 바꿔 보는 패널. 종목 → 리그를 고르고 배당을 넣으면 과거 경기 데이터로 각 베팅의 가치(기대수익)를 판정 ──
   판정기는 종목·리그별로 등록한다(리그마다 과거 경기 데이터 + 최소 표본 수가 다름 — src/leagues).
   지금은 축구 6개·배구 8개·농구 6개 리그이고, 다른 종목/리그는 과거 데이터가 생기면 JUDGES에 추가하면 된다.
   종목마다 판정기 입력·출력 모양이 조금 달라서(농구는 기준점 + 적특) 아래 공통 모양으로 맞춰서 쓴다. */

// 판정 결과 공통 모양 — 배구/농구 판정기 결과가 모두 이 모양을 만족한다
interface JudgeBet {
  key: string; name: string; site: number
  hit: number; se: number; be: number; ev: number; err: number
  strength: number; strengthLabel: string; n: number; eligible: boolean
  push?: number  // 농구 정수 기준점 적특 비율
  check?: { n: number; hit: number; roi: number; seasons: number; seasonsUp: number }  // 같은 배당대 과거 실적
  plusCheck?: { n: number; hit: number }  // 축구 플핸: 무·역배 배당이 비슷했던 과거 경기 적중률
}
interface JudgeOut {
  fav: number; favIsHome: boolean; margin: number; marketN: number
  minusHome?: boolean  // 축구: 사이트가 핸디 마이너스를 준 쪽이 홈인지
  expMargin?: number  // 농구·축구: 표본의 정배 평균 점수차(골차)
  curveMargin?: number  // 농구: 전 배당대 곡선으로 본 이 배당의 정배 평균 점수차
  band?: { lo: number; hi: number }; bandN?: number  // 배구: 넣은 정배 배당의 0.1 구간과 그 구간 실제 경기 수 (판정은 전 배당대 곡선)
  bets: JudgeBet[]; recommended: JudgeBet[]; leastLoss: JudgeBet | null
}
// kind: 'odds' = 배당(3자리 → 1.23, 다음 칸 이동) / 'line' = 농구 기준점(그대로 입력, 예: 5.5)
// line·side: 축구 핸디캡 칸 (기준점과 홈/원정 — 정배 쪽이면 마핸 -line, 역배 쪽이면 플핸 +line) · solo: 이 칸 뒤에서 줄을 바꾼다
// showIf: 이 조건일 때만 칸을 보여준다 (안 보이는 칸의 배당은 판정에 쓰지 않는다) · lineGroup: 농구 기준점 몇 번째 묶음인지 ('+ 기준점 추가'로 늘린 만큼만 보임)
interface OddsField { key: string; label: string; kind?: 'odds' | 'line'; required?: boolean; line?: number; side?: 'home' | 'away'; solo?: boolean; showIf?: (v: Record<string, number | null>) => boolean; lineGroup?: number }
interface LeagueJudge {
  key: string; label: string; note: string
  fields: OddsField[]
  perRow?: number  // 입력칸 한 줄에 몇 칸 (축구 3 — 승무패 한 줄, 나머지 2). 칸 자리는 모든 종목 3칸 기준
  run: (v: Record<string, number | null>) => JudgeOut | null
  profile: () => { n: number; weighted: boolean; items: [string, string][] }  // 리그 특성 요약 (판정기가 쓰는 과거 경기 기준, weighted = 최근 시즌 가중 적용)
  recNote: string
  data: () => ReturnType<typeof seasonSummary>  // 데이터 현황 (시즌별 경기 수·반영 여부·반영도)
  curves?: () => CurveChartData  // 곡선 그래프 (농구 점수차 곡선 · 배구 결과별 적중률 곡선)
}
interface SportJudges { key: string; label: string; emoji: string; leagues: LeagueJudge[] }

const VOLLEY_FIELDS: OddsField[] = [
  { key: 'home', label: '홈', required: true }, { key: 'away', label: '원정', required: true },
  { key: 'm15', label: '-1.5 H' }, { key: 'p25', label: '+2.5 H' },  // -1.5는 정배, +2.5는 역배
  { key: 'o35', label: '3.5 오버' }, { key: 'u45', label: '4.5 언더' },
]

const BASKET_FIELDS: OddsField[] = [
  { key: 'home', label: '홈', required: true }, { key: 'away', label: '원정', required: true },
  { key: 'line', label: '기준점', kind: 'line' },
  { key: 'hh', label: '홈 H' }, { key: 'ah', label: '원정 H' },
  // 기준점 추가 (최대 3개) — 같은 경기의 다른 기준점·배당을 나란히 비교 (예: +2.5 1.97 vs +3.5 1.82)
  ...[2, 3].flatMap(n => [
    { key: `line${n}`, label: `기준점 ${n}`, kind: 'line' as const, lineGroup: n },
    { key: `hh${n}`, label: '홈 H', lineGroup: n }, { key: `ah${n}`, label: '원정 H', lineGroup: n },
  ]),
]

// 승무패는 사이트 순서대로 홈 승 → 무 → 원정 승, 그다음 홈/원정 핸디캡을 기준점마다 짝으로
// 축구 핸디 칸은 승무패 세 배당을 다 넣은 뒤, 정배 배당에 맞는 기준점만 보여준다 (사용자 요청)
//  정배 1.39 이하 → 역배 +2.5 / 1.40~1.79 → 역배 +1.5 / 1.80 이상 → ±0.5 (홈·원정 둘 다 — 0.5 배당으로 사이트가 어느 쪽에 -0.5를 줬는지 알아낸다)
//  축구는 정배 승과 역배 플핸(+0.5·+1.5·+2.5)만 본다 (사용자 요청 — 마핸은 뺐다. 강정배 -1.5 칸은 커밋 cc2726b까지 있었다)
const soccerFav = (v: Record<string, number | null>) => v.home != null && v.draw != null && v.away != null ? Math.min(v.home, v.away) : null
const SOCCER_LINE_SHOW: Record<number, (fav: number) => boolean> = {
  2.5: fav => fav < 1.4,
  1.5: fav => fav >= 1.4 && fav < 1.8,
  0.5: fav => fav >= 1.8,
}
// 2.5 오버 해볼 만한 구역 (리그별 · 홈정배/원정정배 따로) — 이 구역일 때만 2.5 오버·언더 칸을 보여준다 (언더 배당은 마진 확인용)
// 2021-22~2023-24로 고르고 2024-25·2025-26으로 확인해서 유지된 구역만 (라리가는 확인 시즌에 50% 안팎으로 무너져서 없음)
type OuRange = { favMax?: number; drawMin?: number; drawMax?: number }
export type OuZone = { home?: OuRange; away?: OuRange }
const inOuZone = (zone: OuZone | undefined, v: Record<string, number | null>) => {
  const fav = soccerFav(v)
  if (!zone || fav == null || v.draw == null || v.home == null || v.away == null) return false
  const r = zone[v.home <= v.away ? 'home' : 'away']
  return !!r && fav < (r.favMax ?? 99) && v.draw >= (r.drawMin ?? 0) && v.draw < (r.drawMax ?? 99)
}
const soccerFields = (zone?: OuZone): OddsField[] => [
  ...SOCCER_FIELDS,
  { key: 'o25', label: '2.5 오버', showIf: v => inOuZone(zone, v) }, { key: 'u25', label: '2.5 언더', solo: true, showIf: v => inOuZone(zone, v) },
]
const SOCCER_FIELDS: OddsField[] = [
  { key: 'home', label: '홈', required: true }, { key: 'draw', label: '무', required: true },
  { key: 'away', label: '원정', required: true, solo: true },
  ...[0.5, 1.5, 2.5].flatMap(L => (['home', 'away'] as const).map(side => ({
    key: `${side[0]}${String(L).replace('.', '')}`, label: `${side === 'home' ? '홈' : '원정'} H ${L}`, line: L, side, solo: side === 'away',
    // 1.5·2.5는 역배 쪽(플핸) 칸만
    showIf: (v: Record<string, number | null>) => { const fav = soccerFav(v); return fav != null && SOCCER_LINE_SHOW[L](fav) && (L === 0.5 || side !== (v.home! <= v.away! ? 'home' : 'away')) },
  }))),
]

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`

/* 리그 특성 요약 — 판정기가 맞게 만들어졌는지 눈으로 확인하는 용도. 과거 경기 전체 기준 비율 */
function volleyProfile(allGames: VolleyGame[]) {
  const games = recentSeasons(allGames) // 판정기와 같이 최근 5시즌만
  const n = games.length
  const weight = seasonWeigher(games)
  // 최근 시즌 가중 비율 (판정기와 같은 가중치)
  let sw = 0, favWin = 0, homeWin = 0, m15 = 0, p25 = 0, o35 = 0, u45 = 0, margin = 0, favOdds = 0
  for (const g of games) {
    const [h, a, hs, as] = g
    const w = weight(g)
    sw += w
    const favHome = h <= a
    const fs = favHome ? hs : as, us = favHome ? as : hs
    if (fs > us) favWin += w
    if (hs > as) homeWin += w
    if (fs === 3 && us <= 1) m15 += w
    if (!(fs === 3 && us === 0)) p25 += w
    if (hs + as >= 4) o35 += w
    if (hs + as <= 4) u45 += w
    margin += w * (1 / h + 1 / a - 1)
    favOdds += w * Math.min(h, a)
  }
  const r = (k: number) => k / sw
  return {
    n, weighted: latestSeason(games) != null, items: [
      ['정배 승률', pct(r(favWin))], ['홈 승률', pct(r(homeWin))], ['정배 -1.5 (3-0·3-1)', pct(r(m15))],
      ['역배 +2.5 (1세트↑)', pct(r(p25))], ['3.5 오버 (4세트↑)', pct(r(o35))], ['4.5 언더', pct(r(u45))],
      ['풀세트(3-2)', pct(1 - r(u45))], ['정배 평균배당', r(favOdds).toFixed(2)], ['평균 마진', pct(r(margin))],
    ] as [string, string][],
  }
}
function basketProfile(raw: BasketGame[]) {
  const games = recentSeasons(cleanGames(raw)) // 판정기와 같이 최근 5시즌만
  const n = games.length
  const weight = seasonWeigher(games)
  let sw = 0, favWin = 0, homeWin = 0, favMargin = 0, total = 0, margin = 0, favOdds = 0, big = 0
  for (const g of games) {
    const [h, a, hs, as] = g
    const w = weight(g)
    sw += w
    const m = h <= a ? hs - as : as - hs
    if (m > 0) favWin += w
    if (hs > as) homeWin += w
    if (m >= 10) big += w
    favMargin += w * m; total += w * (hs + as)
    margin += w * (1 / h + 1 / a - 1)
    favOdds += w * Math.min(h, a)
  }
  const r = (k: number) => k / sw
  return {
    n, weighted: latestSeason(games) != null, items: [
      ['정배 승률', pct(r(favWin))], ['홈 승률', pct(r(homeWin))], ['정배 평균 점수차', `${r(favMargin) >= 0 ? '+' : ''}${r(favMargin).toFixed(1)}`],
      ['정배 10점차↑ 승', pct(r(big))], ['총점 평균', r(total).toFixed(1)], ['정배 평균배당', r(favOdds).toFixed(2)], ['평균 마진', pct(r(margin))],
    ] as [string, string][],
  }
}

function soccerProfile(raw: SoccerGame[]) {
  const games = recentSeasons(cleanSoccer(raw)) // 판정기와 같이 최근 5시즌만
  const n = games.length
  const weight = seasonWeigher(games)
  let sw = 0, favWin = 0, homeWin = 0, draw = 0, big = 0, total = 0, o25 = 0, btts = 0, margin = 0, favOdds = 0
  let swH = 0, winH = 0, swA = 0, winA = 0  // 홈정배 / 원정정배 따로 정배 승률
  for (const g of games) {
    const [h, a, hs, as, , d] = g
    const w = weight(g)
    sw += w
    const m = h <= a ? hs - as : as - hs
    if (h <= a) { swH += w; if (m > 0) winH += w } else { swA += w; if (m > 0) winA += w }
    if (m > 0) favWin += w
    if (hs > as) homeWin += w
    if (m === 0) draw += w
    if (m >= 2) big += w
    if (hs + as > 2.5) o25 += w
    if (hs > 0 && as > 0) btts += w
    total += w * (hs + as)
    margin += w * (1 / h + 1 / d + 1 / a - 1)
    favOdds += w * Math.min(h, a)
  }
  const r = (k: number) => k / sw
  return {
    n, weighted: latestSeason(games) != null, items: [
      ['정배 승률', pct(r(favWin))], ['홈정배 승률', pct(winH / swH)], ['원정정배 승률', pct(winA / swA)], ['홈 승률', pct(r(homeWin))], ['무승부', pct(r(draw))], ['정배 2골차↑ 승', pct(r(big))],
      ['평균 골', r(total).toFixed(2)], ['2.5 오버', pct(r(o25))], ['양팀 득점', pct(r(btts))], ['정배 평균배당', r(favOdds).toFixed(2)], ['평균 마진', pct(r(margin))],
    ] as [string, string][],
  }
}

type VolleyJudgeFn = (o: VolleyOdds) => JudgeOut | null
type BasketJudgeFn = (o: BasketOdds) => JudgeOut | null
type SoccerJudgeFn = (o: SoccerOdds) => JudgeOut | null
const SOCCER_REC = '정배 승과 역배 플핸(+0.5·+1.5·+2.5)만 추천 · 기대수익 -3% 이상 + 배당 1.30 이상 3.00 미만 (정배 승은 1.55 미만 + 같은 배당대 과거 실적이 시즌 60% 이상 플러스) + 적중률 50% 이상 · 핸디캡은 반 골 기준점이라 적특 없음'
const VOLLEY_REC = '기대수익 플러스 + 배당 1.30 이상 3.00 미만 + 적중률 50% 이상 · 홈 승·원정 승은 추천 안 함 (3시즌 백테스트에서 모든 리그 마이너스) · 세트 판정은 홈정배/원정정배 따로'
const BASKET_REC = '기대수익 플러스 + 배당 1.30 이상 3.00 미만 + 적중률 50% 이상 · 홈 승·원정 승은 1.75 미만 + 같은 배당대 과거 실적 시즌 60% 이상 플러스 (NBA·KBL·유로리그는 승 추천 안 함) · 핸디·승 적중률은 점수차 곡선 · 기준점이 정수면 적특(환불) 반영'
// 축구: 낮은 쪽 승 배당이 이 이상이면 접전(정배 없음)으로 표시 — 18개 리그 평균 정배 37% 대 역배 34% (사용자 지적: 2.50~3.20은 정배가 아니다)
const SOCCER_EVEN_FROM = 2.5
// 처음 열 때 한 번만 계산
function once<T>(f: () => T): () => T { let v: T | undefined; return () => (v ??= f()) }
function volleyLeague(key: string, label: string, note: string, judge: VolleyJudgeFn, games: VolleyGame[]): LeagueJudge {
  return {
    key, label, note, fields: VOLLEY_FIELDS, recNote: VOLLEY_REC, profile: () => volleyProfile(games), data: () => seasonSummary(games), curves: once(() => volleyCurves(games)),
    run: v => judge({ home: v.home, away: v.away, m15: v.m15, o35: v.o35, u45: v.u45, p25: v.p25 }),
  }
}
function basketLeague(key: string, label: string, note: string, judge: BasketJudgeFn, games: BasketGame[]): LeagueJudge {
  return {
    key, label, note, fields: BASKET_FIELDS, recNote: BASKET_REC, profile: () => basketProfile(games), data: () => seasonSummary(cleanGames(games)), curves: once(() => basketCurves(games)),
    // 홈/원정 핸디캡 배당으로 받고, 승패 배당이 낮은 쪽(정배)이 자동으로 -기준점 마핸이 된다
    run: v => {
      const favHome = v.home != null && v.away != null && v.home <= v.away
      return judge({
        home: v.home, away: v.away, line: v.line, mh: favHome ? v.hh : v.ah, ph: favHome ? v.ah : v.hh,
        line2: v.line2, mh2: favHome ? v.hh2 : v.ah2, ph2: favHome ? v.ah2 : v.hh2,
        line3: v.line3, mh3: favHome ? v.hh3 : v.ah3, ph3: favHome ? v.ah3 : v.hh3,
      })
    },
  }
}

function soccerLeague(key: string, label: string, note: string, judge: SoccerJudgeFn, games: SoccerGame[], ouZone?: OuZone): LeagueJudge {
  return {
    key, label, note, fields: soccerFields(ouZone), perRow: 3, recNote: SOCCER_REC, profile: () => soccerProfile(games), data: () => seasonSummary(cleanSoccer(games)), curves: once(() => soccerCurves(games)),
    run: v => judge({
      home: v.home, draw: v.draw, away: v.away, h05: v.h05, a05: v.a05, h15: v.h15, a15: v.a15, h25: v.h25, a25: v.a25, o25: v.o25, u25: v.u25,
    }),
  }
}

const JUDGES: SportJudges[] = [
  {
    key: 'soccer', label: '축구', emoji: '⚽', leagues: [
      soccerLeague('epl', 'EPL', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeEpl, EPL_GAMES,
        // 홈정배: 정배 1.50 미만 & 무 5.5 이상 (학습 73% → 확인 66%) / 원정정배: 정배 2.00 미만 & 무 4.3~5.5 (66% → 73%)
        { home: { favMax: 1.5, drawMin: 5.5 }, away: { favMax: 2.0, drawMin: 4.3, drawMax: 5.5 } }),
      soccerLeague('laliga', '라리가', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeLaliga, LALIGA_GAMES),
      soccerLeague('bundesliga', '분데스리가', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeBundesliga, BUNDESLIGA_GAMES,
        // 홈정배: 정배 1.30 미만 (학습 77% → 확인 91%) / 원정정배: 정배 1.50 미만 & 무 5.0 이상 (74% → 75%)
        { home: { favMax: 1.3 }, away: { favMax: 1.5, drawMin: 5.0 } }),
      soccerLeague('seriea', '세리에A', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeSeriea, SERIEA_GAMES),
        // 2.5 오버 구역 없음 — 학습 시즌에 좋던 조건이 확인 시즌에 45~57%로 떨어짐 (세리에A는 골이 적은 리그, 2.5 오버 49%)
      soccerLeague('ligue1', '리그1', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeLigue1, LIGUE1_GAMES,
        // 홈정배: 정배 1.40 미만 & 무 5.5 이상 (학습 79% → 확인 65%) / 원정정배: 확인 시즌 58%라 구역 없음
        { home: { favMax: 1.4, drawMin: 5.5 } }),
      soccerLeague('eredivisie', '에레디비시', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeEredivisie, EREDIVISIE_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('portugal', '포르투갈', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgePortugal, PORTUGAL_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('superlig', '튀르키예', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeSuperlig, SUPERLIG_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('j1', 'J1리그', '2021 ~ 2025 시즌 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeJ1, J1_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('j2', 'J2리그', '2021 ~ 2025 시즌 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeJ2, J2_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('k1', 'K리그1', '2021 ~ 2025 시즌 정규 33라운드, 파이널 라운드 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeK1, K1_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('k2', 'K리그2', '2021 ~ 2025 시즌 정규리그, 승격 플레이오프 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeK2, K2_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('mls', 'MLS', '2021 ~ 2025 시즌 정규리그, 플레이오프 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeMls, MLS_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('championship', '챔피언십', '2021-22 ~ 2025-26 정규리그, 승격 플레이오프 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeChampionship, CHAMPIONSHIP_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('laliga2', '라리가2', '2021-22 ~ 2025-26 정규리그, 승격 플레이오프 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeLaliga2, LALIGA2_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('bundesliga2', '분데스리가2', '2021-22 ~ 2025-26 정규리그, 승강 플레이오프 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeBundesliga2, BUNDESLIGA2_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('serieb', '세리에B', '2021-22 ~ 2025-26 정규리그, 플레이오프 제외 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeSerieb, SERIEB_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('ligue2', '리그2', '2021-22 ~ 2025-26 정규리그, 승격 플레이오프 제외 (BetExplorer 평균 배당, 몰수·취소 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeLigue2, LIGUE2_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('leagueone', '리그원', '2021-22 ~ 2025-26 정규리그, 승격 플레이오프 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeLeagueone, LEAGUEONE_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('saudi', '사우디', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeSaudi, SAUDI_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('brazil', '브라질', '2021 ~ 2025 시즌 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeBrazil, BRAZIL_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('china', '중국', '2021 ~ 2025 시즌 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeChina, CHINA_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('denmark', '덴마크', '2021-22 ~ 2025-26 정규 22라운드, 챔피언십·강등 라운드 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeDenmark, DENMARK_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('scotland', '스코틀랜드', '2021-22 ~ 2025-26 정규 33라운드, 스플릿 이후 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgeScotland, SCOTLAND_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('aleague', '호주 A리그', '2021-22 ~ 2025-26 정규리그, 파이널 시리즈 제외 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 60경기', judgeAleague, ALEAGUE_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('austria', '오스트리아', '2021-22 ~ 2025-26 정규 22라운드, 챔피언십·강등 라운드 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 60경기', judgeAustria, AUSTRIA_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('poland', '폴란드', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당, 몰수 경기 제외) · 비교 경기는 홈정배/원정정배 따로, 승무패 세 배당이 비슷한 200경기', judgePoland, POLAND_GAMES),
        // 2.5 오버 구역 없음 (아직 리그별 검증 전)
      soccerLeague('ucl', '챔피언스리그', '2021-22 ~ 2025-26 조별리그·리그 페이즈, 토너먼트 제외 (BetExplorer 평균 배당) · 비교 경기는 홈정배/원정정배 따로, 세 배당이 비슷한 80경기', judgeUcl, UCL_GAMES,
        // 홈정배: 정배 1.50 미만 & 무 6.5 이상 (학습 81% → 확인 68%) / 원정정배: 정배 1.70 미만 & 무 5.5 미만 (78% → 67%) — 표본 작음
        { home: { favMax: 1.5, drawMin: 6.5 }, away: { favMax: 1.7, drawMax: 5.5 } }),
    ],
  },
  { key: 'baseball', label: '야구', emoji: '⚾', leagues: [] },
  {
    key: 'basketball', label: '농구', emoji: '🏀', leagues: [
      basketLeague('nba', 'NBA', '2021-22 ~ 2025-26 정규시즌 (BetExplorer 평균 배당)', judgeNba, NBA_GAMES),
      basketLeague('kbl', 'KBL', '2021-22 ~ 2025-26 정규시즌 (BetExplorer 평균 배당)', judgeKbl, KBL_GAMES),
      basketLeague('cba', 'CBA', '2021-22 ~ 2025-26 정규시즌 (BetExplorer 평균 배당)', judgeCba, CBA_GAMES),
      basketLeague('bleague', 'B.LEAGUE', 'B1 2021-22 ~ 2025-26 정규시즌 (BetExplorer 평균 배당)', judgeBleague, BLEAGUE_GAMES),
      basketLeague('euroleague', '유로리그', '2021-22 ~ 2025-26 정규시즌 (BetExplorer 평균 배당)', judgeEuroleague, EUROLEAGUE_GAMES),
      basketLeague('nbl', '호주 NBL', '2021-22 ~ 2025-26 정규시즌 (BetExplorer 평균 배당)', judgeNbl, NBL_GAMES),
    ],
  },
  {
    key: 'volleyball', label: '배구', emoji: '🏐', leagues: [
      volleyLeague('krMen', '한국 남자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgeKrMen, KRMEN_GAMES),
      volleyLeague('krWomen', '한국 여자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgeKrWomen, KRWOMEN_GAMES),
      volleyLeague('itMen', '이탈리아 남자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgeItMen, ITMEN_GAMES),
      volleyLeague('itWomen', '이탈리아 여자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgeItWomen, ITWOMEN_GAMES),
      volleyLeague('trMen', '터키 남자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgeTrMen, TRMEN_GAMES),
      volleyLeague('trWomen', '터키 여자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgeTrWomen, TRWOMEN_GAMES),
      volleyLeague('plMen', '폴란드 남자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgePlMen, PLMEN_GAMES),
      volleyLeague('plWomen', '폴란드 여자', '2021-22 ~ 2025-26 정규시즌 (BetExplorer)', judgePlWomen, PLWOMEN_GAMES),
    ],
  },
  { key: 'esports', label: 'LOL', emoji: '🎮', leagues: [] },
]

const signedPct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

// tabs: 카드 제목 자리에 들어갈 사이트 현황 / 베팅분석 전환 버튼 · active: 지금 화면에 보이는지 (보일 때 홈 승 칸에 커서)
export default function BetAnalysisPanel({ tabs, active = true }: { tabs: ReactNode; active?: boolean }) {
  const [sportKey, setSportKey] = useState('volleyball')
  const sport = JUDGES.find(s => s.key === sportKey)!
  const [leagueKey, setLeagueKey] = useState<string | null>(sport.leagues[0]?.key ?? null)
  const league = sport.leagues.find(l => l.key === leagueKey) ?? null
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [openRow, setOpenRow] = useState<string | null>(null)  // 판정 표에서 눌러서 상세를 펼친 줄
  const [lineCount, setLineCount] = useState(1)  // 농구 기준점 개수 (1~3, '+ 기준점 추가')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  // 항상 홈 승 칸에 커서 — 처음 보일 때, 종목·리그를 바꿀 때, 초기화할 때 바로 홈 승부터 칠 수 있게
  const [focusTick, setFocusTick] = useState(0)
  useEffect(() => {
    if (active) inputRefs.current[0]?.focus({ preventScroll: true })
  }, [active, sportKey, leagueKey, focusTick])
  function reset() { setRaw({}); setLineCount(1); setFocusTick(t => t + 1) }
  // 기준점은 정수만 치고 넘어가면 .5를 붙인다 (5 → 5.5, 13 → 13.5). 정수 기준점은 5.0처럼 소수점까지 치면 그대로 둔다
  function finishLine(key: string) {
    setRaw(p => /^\d+$/.test(p[key] ?? '') ? { ...p, [key]: `${p[key]}.5` } : p)
  }

  function pickSport(key: string) {
    const s = JUDGES.find(x => x.key === key)!
    setSportKey(key); setLeagueKey(s.leagues[0]?.key ?? null); setRaw({}); setLineCount(1); setFocusTick(t => t + 1)
  }
  // 숫자 3자리만 치면 배당으로 바꾸고(123 → 1.23) 다음 칸으로 이동
  function change(idx: number, key: string, v: string, kind: 'odds' | 'line' = 'odds') {
    let clean = v.replace(/[^0-9.]/g, '')
    // 기준점은 배당이 아니라 점수라 3자리 변환 없이 그대로 받는다 (5.5, 12, 10.5 …)
    if (kind === 'line') { setRaw(p => ({ ...p, [key]: clean })); return }
    // 이미 배당(1.85)이 들어있는 칸에 숫자를 더 치면 덧붙이지 않고 새로 친 숫자부터 다시 받는다
    if (/^\d\.\d{2}$/.test(raw[key] ?? '') && /^\d\.\d{3,}$/.test(clean)) clean = clean.slice(4)
    const isTriple = /^\d{3}$/.test(clean)
    setRaw(p => ({ ...p, [key]: isTriple ? (Number(clean) / 100).toFixed(2) : clean }))
    // 바로 다음 칸으로 포커스 — 빠르게 이어 치거나 붙여넣어도 다음 숫자가 이 칸에 덧붙지 않게 즉시 옮긴다
    if (isTriple) {
      const el = inputRefs.current[idx + 1]
      if (el) { el.focus(); el.select() }
      // 이 입력으로 새 칸이 생기면(축구: 원정 승을 넣는 순간 핸디 칸이 나타남) 화면이 바뀐 뒤 그 새 칸으로 다시 옮긴다
      setTimeout(() => {
        const el2 = inputRefs.current[idx + 1]
        if (el2 && el2 !== el && (!el || (document.activeElement === el && !el.value))) { el2.focus(); el2.select() }
      }, 0)
    }
  }
  const vals: Record<string, number | null> = {}
  for (const f of league?.fields ?? []) {
    const n = parseFloat(raw[f.key] ?? '')
    vals[f.key] = f.kind === 'line' ? (Number.isFinite(n) && n >= 0 ? n : null) : (n > 1 ? n : null)
  }
  // 조건부 칸(축구 핸디): 지금 안 보이는 칸은 판정에서 뺀다
  const fields = (league?.fields ?? []).filter(f => (!f.showIf || f.showIf(vals)) && (f.lineGroup ?? 1) <= lineCount)
  const canAddLine = (league?.fields ?? []).some(f => (f.lineGroup ?? 1) > lineCount)
  for (const f of league?.fields ?? []) if (!fields.includes(f)) vals[f.key] = null
  const out = league ? league.run(vals) : null
  // 농구 마핸/플핸 줄 이름에 홈/원정과 실제 기준점을 붙여서 보여준다 (홈 마핸 -5.5 / 원정 플핸 +5.5)
  const lineV = vals.line
  const favHome = vals.home != null && vals.away != null && vals.home <= vals.away
  // 기준점 최대 3개: mh/ph는 기준점, mh2/ph2는 기준점 2, mh3/ph3는 기준점 3
  const isHcap = (key: string) => /^(mh|ph)[23]?$/.test(key)
  const lineNo = (key: string) => key.match(/[23]$/)?.[0] ?? ''
  const lineOf = (key: string) => (lineNo(key) ? vals[`line${lineNo(key)}`] : lineV)
  const sideOf = (key: string) => key.startsWith('mh') === favHome ? '홈' : '원정'
  const betName = (b: JudgeBet) => isHcap(b.key) && lineOf(b.key) != null ? `${sideOf(b.key)} ${b.key.startsWith('mh') ? '마핸 -' : '플핸 +'}${lineOf(b.key)}` : b.name
  // 판정 결과의 마핸/플핸을 입력 칸(홈 핸디캡/원정 핸디캡) 순서로 맞춘다
  const fieldKeyOf = (key: string) => isHcap(key) ? `${sideOf(key) === '홈' ? 'hh' : 'ah'}${lineNo(key)}` : key
  // 홈/원정 핸디캡 칸 이름 옆에 지금 배당 기준으로 마핸/플핸 어느 쪽인지 붙여준다
  // 칸 이름 아래 작은 글씨 — 기준점은 자동 .5 안내, 핸디캡은 지금 배당 기준 마핸/플핸 (이름 폭을 줄여 칸이 좁아도 한 줄에 두 칸)
  const fieldSub = (f: OddsField) => {
    if (f.line != null) {
      if (vals.home == null || vals.away == null) return null
      return `${(f.side === 'home') === (out?.minusHome ?? favHome) ? '마핸 -' : '플핸 +'}${f.line}`
    }
    if (!/^(hh|ah)[23]?$/.test(f.key) || vals.home == null || vals.away == null) return null
    const isFav = f.key.startsWith('hh') === favHome
    const ln = lineOf(f.key)
    return `${isFav ? '마핸 -' : '플핸 +'}${ln ?? '기준점'}`
  }
  // 입력칸 자리는 모든 종목 한 줄 3칸 기준. 축구는 3칸(승무패)을 다 쓰고, 농구·배구는 2칸씩만 써서 세로 배치는 그대로.
  // 각 칸이 한 줄의 몇째(0/1/2) 자리인지 — 첫째 자리가 아니면 이름 앞에 간격 (기준점·solo 칸 뒤에서 줄 바꿈)
  const SLOTS = 3
  const perRow = league?.perRow ?? 2
  const inputCol: number[] = []
  const rowEnd: boolean[] = []
  let col = 0
  for (const f of fields) {
    const end = f.kind === 'line' || !!f.solo || col + 1 >= perRow
    inputCol.push(col); rowEnd.push(end); col = end ? 0 : col + 1
  }
  const recommendedKeys = new Set(out?.recommended.map(b => b.key) ?? [])
  const requiredLabels = fields.filter(f => f.required).map(f => f.label).join(' / ')

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)',
    color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })

  return (
    <div className="card" style={{ padding: '10px 14px' }}>
        <div className="flex-between mb-10">
          {tabs}
        </div>

        {/* 종목 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {JUDGES.map(s => (
            <button key={s.key} onClick={() => pickSport(s.key)} style={{ ...chip(s.key === sportKey), opacity: s.leagues.length ? 1 : 0.55 }}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* 리그 */}
        {sport.leagues.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {sport.label}는 아직 판단기에 쓸 과거 경기 데이터가 없습니다.
          </div>
        ) : (
          <>
            {/* 리그 칩 + 리그 정보(ⓘ) — 데이터 현황·기준 데이터·리그 특성·판정 기준은 ⓘ에 마우스를 올리거나 눌렀을 때만 */}
            <div style={{ position: 'relative', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              {sport.leagues.map(l => (
                <button key={l.key} onClick={() => { setLeagueKey(l.key); setRaw({}); setLineCount(1); setFocusTick(t => t + 1) }} style={{ ...chip(l.key === leagueKey), fontSize: 11, padding: '4px 10px' }}>{l.label}</button>
              ))}
              {league && <LeagueInfo league={league} fav={vals.home != null && vals.away != null ? Math.min(vals.home, vals.away) : null} favIsHome={vals.home != null && vals.away != null ? vals.home <= vals.away : null} />}
            </div>
          </>
        )}

        {league && (
          <>
            {/* 배당 입력 — 좌측 정렬, 한 줄에 두 칸씩 (이름 바로 옆에 입력칸, 그 옆에 다음 이름·입력칸). 입력칸은 모두 같은 크기.
                농구 기준점은 혼자 한 줄 → 홈 핸디캡/원정 핸디캡이 아래 줄에 짝으로 */}
            <div className="bet-inputs">
              {fields.map((f, i) => (
                <label key={f.key} style={{ display: 'contents' }}>
                  <span className="bet-inputs__label" style={{ paddingLeft: inputCol[i] > 0 ? 12 : 0, fontSize: 10, fontWeight: 700, color: f.required ? 'var(--text-primary)' : f.kind === 'line' ? 'var(--gold)' : 'var(--text-muted)' }}>{f.label}{f.required && ' *'}{fieldSub(f) && <div style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)' }}>{fieldSub(f)}</div>}</span>
                  <input ref={el => { inputRefs.current[i] = el }} className="form-input bet-odds-input" inputMode="decimal"
                    onBlur={f.kind === 'line' ? () => finishLine(f.key) : undefined}
                    value={raw[f.key] ?? ''} onChange={e => change(i, f.key, e.target.value, f.kind)} onFocus={e => e.target.select()}
                    onKeyDown={e => { if (e.key === 'Escape') { reset(); return } if (e.key === 'Enter') { const el = inputRefs.current[i + 1]; if (el) { el.focus(); el.select() } } }}
                    style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                  {rowEnd[i] && inputCol[i] < SLOTS - 1 && <span className="bet-inputs__rest" style={{ gridColumn: `span ${2 * (SLOTS - 1 - inputCol[i])}` }} />}
                </label>
              ))}
            </div>
            {canAddLine && (
              <button onClick={() => setLineCount(c => c + 1)} style={{ marginTop: -4, marginBottom: 10, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>+ 기준점 추가</button>
            )}

            {!out ? (
              <div style={{ padding: '14px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{requiredLabels} 배당을 넣으면 판정</div>
            ) : (
              <>
                <div title={`비교 경기 ${out.marketN}경기${out.expMargin != null ? ` · 비교 경기 정배 평균 점수차 ${out.expMargin >= 0 ? '+' : ''}${out.expMargin.toFixed(1)}` : ''}`}
                  style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {out.minusHome !== undefined && out.fav >= SOCCER_EVEN_FROM
                    ? <span title="낮은 쪽 배당이 2.50 이상이면 두 팀 승 확률이 거의 같다 (평균 37% 대 34%) — 정배가 아니라 접전">접전 <b style={{ color: 'var(--text-primary)' }}>정배 없음</b> (낮은 쪽 {out.favIsHome ? '홈' : '원정'} {out.fav.toFixed(2)})</span>
                    : <span>정배 <b style={{ color: 'var(--text-primary)' }}>{out.favIsHome ? '홈' : '원정'} {out.fav.toFixed(2)}</b></span>}
                  <span>마진 <b style={{ color: out.margin <= 0.05 ? 'var(--green)' : 'var(--orange)' }}>{pct(out.margin)}</b></span>
                  {out.curveMargin != null && <span title="같은 쪽 정배 과거 경기 전체(모든 배당대)로 본, 이 배당 경기의 정배 평균 점수차 — 기준점이 이보다 낮으면 마핸, 높으면 플핸 쪽이 유리">예상 점수차 <b style={{ color: 'var(--text-primary)' }}>{out.favIsHome ? '홈' : '원정'} {out.curveMargin >= 0 ? '+' : ''}{out.curveMargin.toFixed(1)}</b></span>}
                  {out.band && <span title="같은 쪽 정배 과거 경기를 모든 배당대로 배당-적중률 곡선을 맞추고, 넣은 배당 자리 값을 읽는다">곡선 <b style={{ color: 'var(--text-primary)' }}>{out.favIsHome ? '홈' : '원정'}정배 전 배당대 {out.marketN}경기</b> · {out.band.lo.toFixed(2)}~{out.band.hi.toFixed(2)} 실제 <b style={{ color: 'var(--text-primary)' }}>{out.bandN}경기</b></span>}
                  {vals.o25 != null && vals.u25 != null && <span>2.5 오버/언더 마진 <b style={{ color: 1 / vals.o25 + 1 / vals.u25 - 1 <= 0.05 ? 'var(--green)' : 'var(--orange)' }}>{pct(1 / vals.o25 + 1 / vals.u25 - 1)}</b></span>}
                </div>

                <div className="table-wrap">
                  <table className="bet-judge-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>베팅</th><th className="td-right">배당</th><th className="td-right">적중률</th>
                        <th className="td-right">손익분기</th><th className="td-right">기대수익</th><th>판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...out.bets].sort((x, y) => league.fields.findIndex(f => f.key === fieldKeyOf(x.key)) - league.fields.findIndex(f => f.key === fieldKeyOf(y.key))).map(b => <JudgeRow key={b.key} b={b} name={betName(b)} recommended={recommendedKeys.has(b.key)} recNote={league.recNote} open={openRow === b.key} onToggle={() => setOpenRow(k => k === b.key ? null : b.key)} />)}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12 }}>
                  {out.recommended.length > 0 ? (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--green)' }}>추천</span>{' '}
                      {out.recommended.map((b, i) => (
                        <span key={b.key}>{i > 0 && ' · '}<b>{betName(b)}</b> {b.site.toFixed(2)} ({signedPct(b.ev)}, {b.strengthLabel})</span>
                      ))}
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>추천 없음</span>
                      {out.leastLoss && <span style={{ color: 'var(--text-secondary)' }}> — 그나마 손해가 적은 건 <b>{betName(out.leastLoss)}</b> {out.leastLoss.site.toFixed(2)} ({signedPct(out.leastLoss.ev)})</span>}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
    </div>
  )
}

// 리그 정보 ⓘ — 마우스를 올리면 보이고, 누르면 고정(다시 누르거나 바깥을 누르면 닫힘).
// 데이터 현황 · 기준 데이터 · 리그 특성 · 판정 기준(추천 조건·베팅 강도) · 곡선 그래프를 한곳에 모아 평소 화면을 간단하게 (사용자 요청)
function LeagueInfo({ league, fav, favIsHome }: { league: LeagueJudge; fav: number | null; favIsHome: boolean | null }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pinned) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPinned(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [pinned])
  const pr = league.profile()
  const open = hover || pinned
  return (
    // 정보 창은 리그 줄(부모, position: relative) 기준으로 왼쪽에 맞춰 띄운다 — 버튼 위치와 상관없이 카드 안에 들어오게
    <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button onClick={() => setPinned(p => !p)} title="리그 정보" style={{ width: 24, height: 24, borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', border: `1px solid ${open ? 'var(--gold-border)' : 'var(--border)'}`, background: open ? 'var(--gold-bg)' : 'var(--bg-elevated)', color: open ? 'var(--gold)' : 'var(--text-muted)' }}>i</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30, width: 'min(600px, 100%)', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
          <DataStatus league={league} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>기준 데이터: {league.note}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>{league.label} 특성 ({pr.n}경기 · {pr.weighted ? '최근 시즌 가중' : '시즌 정보 없음, 가중 미적용'})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', marginBottom: 8 }}>
            {pr.items.map(([k, v]) => (
              <span key={k} style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{k} <b style={{ color: 'var(--text-primary)' }}>{v}</b></span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            추천 조건: {league.recNote} · ±는 95% 오차<br />
            판정: 기대수익 -3% 이상이면 추천 — 3% 초과 ★★★ · 0~3% ★★ · -3~0% ★. 패스는 이유를 함께 표시<br />
            표의 줄에 마우스를 올리거나 누르면 오차·경기 수 등 상세가 나옵니다
          </div>
          {league.curves && <div style={{ marginTop: 8 }}><CurveChart key={league.key} data={league.curves()} fav={fav} favIsHome={favIsHome} /></div>}
        </div>
      )}
    </div>
  )
}

// 데이터 현황 — 고른 리그의 시즌마다 파일이 있는지(✓ 경기 수 · 반영도 / ✗ 없음)를 한 줄로.
// 최근 5시즌만 판정에 쓰고, 그보다 오래된 시즌은 데이터에 남겨 두되 "미적용"으로 표시한다
function DataStatus({ league }: { league: LeagueJudge }) {
  const have = league.data()
  const m = league.note.match(/(\d{4})-\d{2}\s*~\s*(\d{4})-\d{2}/)
  const newest = Math.max(m ? +m[2] + 1 : 0, ...have.map(x => x.season))
  // 있어야 할 시즌 = 가장 최근 시즌부터 5시즌 + 데이터에 남아 있는 더 오래된 시즌
  const seasons = [...new Set([...Array.from({ length: MAX_SEASONS }, (_, i) => newest - MAX_SEASONS + 1 + i), ...have.map(x => x.season)])].sort((a, b) => a - b)
  // 한 해 시즌 리그(J1리그 '2021 ~ 2025 시즌')는 그 해로, 나머지는 21/22처럼
  const singleYear = !m && /\d{4}\s*~\s*\d{4}/.test(league.note)
  const label = (y: number) => (singleYear ? String(y) : `${String(y - 1).slice(2)}/${String(y).slice(2)}`)
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '2px 7px', borderRadius: 5, fontSize: 10, whiteSpace: 'nowrap', border: '1px solid var(--border)' }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginRight: 2 }}>데이터</span>
      {seasons.map(y => {
        const s = have.find(x => x.season === y)
        if (!s) return <span key={y} style={{ ...chip, color: 'var(--orange)', borderColor: 'var(--orange)' }}><b>{label(y)}</b> ✗ 없음</span>
        if (!s.applied) return <span key={y} style={{ ...chip, color: 'var(--text-muted)', opacity: 0.7 }}><b>{label(y)}</b> 보관 · 미적용</span>
        return (
          <span key={y} style={{ ...chip, color: 'var(--text-primary)', borderColor: s.w >= 0.99 ? 'var(--green-border)' : 'var(--border)' }}>
            <b>{label(y)}</b><span style={{ color: 'var(--green)' }}>✓</span>{s.n}<span style={{ color: s.w >= 0.99 ? 'var(--green)' : 'var(--text-muted)' }}>· {Math.round(s.w * 100)}%</span>
          </span>
        )
      })}
    </div>
  )
}

// 판정 색: 패스 회색 · ★ 주황 · ★★ 금색 · ★★★ 초록
function strengthColor(v: number) {
  return v === 0 ? 'var(--text-muted)' : v === 1 ? 'var(--orange)' : v === 2 ? 'var(--gold)' : 'var(--green)'
}

// 오차·경기 수·적특·배당범위 같은 상세는 평소엔 숨기고, 줄에 마우스를 올리면(툴팁) / 누르면(아래로 펼침) 보여준다
function JudgeRow({ b, name, recommended, recNote, open, onToggle }: { b: JudgeBet; name: string; recommended: boolean; recNote: string; open: boolean; onToggle: () => void }) {
  const evColor = b.ev > 0 ? 'var(--green)' : b.strength > 0 ? 'var(--orange)' : 'var(--red)'
  const detail = [
    `적중률 ${pct(b.hit)} ±${pct(b.se)} (비교 ${b.n}경기)`,
    b.push ? `적특 ${pct(b.push)}` : null,
    `기대수익 ${signedPct(b.ev)} ±${pct(b.err)}`,
    b.plusCheck ? `무·역배 배당 비슷한 경기에서 적중 ${pct(b.plusCheck.hit)} (${b.plusCheck.n}경기, 이 배당이면 ${b.plusCheck.hit * b.site > 1 ? '이득' : '손해'})` : null,
    b.check ? `같은 배당대 과거 실적 ${pct(b.check.hit)} · 수익률 ${signedPct(b.check.roi)} (${b.check.n}경기 · 플러스 시즌 ${b.check.seasonsUp}/${b.check.seasons})` : null,
    !b.eligible ? `추천 배당범위 밖 (${recNote.split(' · ')[0]})` : null,
  ].filter(Boolean) as string[]
  return (
    <>
    <tr onClick={onToggle} title={detail.join('\n')} style={{ cursor: 'pointer', ...(recommended ? { background: 'var(--green-bg)' } : !b.eligible ? { opacity: 0.55 } : {}) }}>
      <td style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{name}</td>
      <td className="td-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.site.toFixed(2)}</td>
      <td className="td-right" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{pct(b.hit)}</td>
      <td className="td-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.be.toFixed(2)}</td>
      <td className="td-right" style={{ fontSize: 12, fontWeight: 700, color: evColor, whiteSpace: 'nowrap' }}>{signedPct(b.ev)}</td>
      <td style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: strengthColor(b.strength) }}>
        {b.strength > 0
          ? <span>추천 · {b.strengthLabel}</span>
          : <span style={{ fontWeight: 400, fontSize: 10 }}>패스 · {b.strengthLabel}</span>}
      </td>
    </tr>
    {open && (
      <tr style={{ background: 'var(--bg-elevated)' }}>
        <td colSpan={6} style={{ fontSize: 10, color: 'var(--text-secondary)', paddingTop: 4, paddingBottom: 6 }}>{detail.join(' · ')}</td>
      </tr>
    )}
    </>
  )
}

// 리그 곡선 그래프 — x = 정배 배당, 선 = 곡선(판정에 쓰는 값), 점 = 그 배당대(0.05 단위) 실제 값 · 점 크기 = 경기 수.
// 홈정배 금색 / 원정정배 하늘색. 배당을 넣으면 그 정배 배당에 세로선
function CurveChart({ data, fav, favIsHome }: { data: CurveChartData; fav: number | null; favIsHome: boolean | null }) {
  const [mk, setMk] = useState(data.markets[0].key)
  const m = data.markets.find(x => x.key === mk) ?? data.markets[0]
  const [lo, hi] = useMemo(() => {
    const xs = [...m.home.curve, ...m.away.curve].map(p => p.x)
    return [Math.min(...xs), Math.max(...xs)]
  }, [m])
  const HOME = 'var(--gold)', AWAY = 'var(--cyan)'
  const fmt = (v: number) => (m.unit === '%' ? `${v.toFixed(1)}%` : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)
  const chipStyle = (on: boolean): React.CSSProperties => ({ padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', border: `1px solid ${on ? 'var(--gold-border)' : 'var(--border)'}`, background: on ? 'var(--gold-bg)' : 'var(--bg-elevated)', color: on ? 'var(--gold)' : 'var(--text-secondary)' })
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {data.markets.length > 1 ? data.markets.map(x => <button key={x.key} onClick={() => setMk(x.key)} style={chipStyle(x.key === m.key)}>{x.label}</button>)
          : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{m.label}</span>}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <b style={{ color: HOME }}>━ 홈정배</b> {m.home.n}경기 · <b style={{ color: AWAY }}>━ 원정정배</b> {m.away.n}경기 · 선 = 곡선, 점 = 실제 (클수록 경기 많음)
        </span>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 16, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis type="number" dataKey="x" domain={[lo, hi]} tickCount={8} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => v.toFixed(2)} />
            <YAxis type="number" dataKey="y" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => (m.unit === '%' ? `${v}%` : `${v}`)} width={42} domain={['auto', 'auto']} />
            <ZAxis type="number" dataKey="n" range={[12, 90]} />
            {m.unit === '점' && <ReferenceLine y={0} stroke="var(--text-muted)" />}
            {m.unit === '%' && <ReferenceLine y={50} stroke="var(--text-muted)" strokeDasharray="3 3" />}
            {fav != null && <ReferenceLine x={fav} stroke={favIsHome ? HOME : AWAY} strokeDasharray="4 3" label={{ value: fav.toFixed(2), position: 'top', fontSize: 9, fill: 'var(--text-primary)' }} />}
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(v: number, name: string) => [name === 'n' ? `${v}경기` : name === 'x' ? v.toFixed(2) : fmt(v), name === 'x' ? '정배 배당' : name === 'n' ? '경기 수' : m.label]}
            />
            <Scatter name="홈정배 실제" data={m.home.dots} fill={HOME} fillOpacity={0.45} />
            <Scatter name="원정정배 실제" data={m.away.dots} fill={AWAY} fillOpacity={0.45} />
            <Line name="홈정배 곡선" data={m.home.curve} dataKey="y" type="monotone" stroke={HOME} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name="원정정배 곡선" data={m.away.curve} dataKey="y" type="monotone" stroke={AWAY} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

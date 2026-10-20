import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
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

/* ── 베팅분석 — 대시보드 사이트 현황 자리에서 탭으로 바꿔 보는 패널. 종목 → 리그를 고르고 배당을 넣으면 과거 경기 데이터로 각 베팅의 가치(기대수익)를 판정 ──
   판정기는 종목·리그별로 등록한다(리그마다 과거 경기 데이터 + 최소 표본 수가 다름 — src/leagues).
   지금은 축구 3개·배구 8개·농구 6개 리그이고, 다른 종목/리그는 과거 데이터가 생기면 JUDGES에 추가하면 된다.
   종목마다 판정기 입력·출력 모양이 조금 달라서(농구는 기준점 + 적특) 아래 공통 모양으로 맞춰서 쓴다. */

// 판정 결과 공통 모양 — 배구/농구 판정기 결과가 모두 이 모양을 만족한다
interface JudgeBet {
  key: string; name: string; site: number
  hit: number; se: number; be: number; ev: number; err: number
  strength: number; strengthLabel: string; n: number; eligible: boolean
  push?: number  // 농구 정수 기준점 적특 비율
}
interface JudgeOut {
  fav: number; favIsHome: boolean; margin: number; marketN: number
  expMargin?: number  // 농구·축구: 표본의 정배 평균 점수차(골차)
  rule?: { text: string; keys: string[] }  // 축구: 내 룰북 기준 이 경기에서 할 베팅
  bets: JudgeBet[]; recommended: JudgeBet[]; leastLoss: JudgeBet | null
}
// kind: 'odds' = 배당(3자리 → 1.23, 다음 칸 이동) / 'line' = 농구 기준점(그대로 입력, 예: 5.5)
// line·side: 축구 핸디캡 칸 (기준점과 홈/원정 — 정배 쪽이면 마핸 -line, 역배 쪽이면 플핸 +line) · solo: 이 칸 뒤에서 줄을 바꾼다
interface OddsField { key: string; label: string; kind?: 'odds' | 'line'; required?: boolean; line?: number; side?: 'home' | 'away'; solo?: boolean }
interface LeagueJudge {
  key: string; label: string; note: string
  fields: OddsField[]
  perRow?: number  // 입력칸 한 줄에 몇 칸 (축구 3 — 승무패 한 줄, 나머지 2). 칸 자리는 모든 종목 3칸 기준
  run: (v: Record<string, number | null>) => JudgeOut | null
  profile: () => { n: number; weighted: boolean; items: [string, string][] }  // 리그 특성 요약 (판정기가 쓰는 과거 경기 기준, weighted = 최근 시즌 가중 적용)
  recNote: string
  data: () => ReturnType<typeof seasonSummary>  // 데이터 현황 (시즌별 경기 수·반영 여부·반영도)
}
interface SportJudges { key: string; label: string; emoji: string; leagues: LeagueJudge[] }

const VOLLEY_FIELDS: OddsField[] = [
  { key: 'home', label: '홈 승', required: true }, { key: 'away', label: '원정 승', required: true },
  { key: 'm15', label: '정배 -1.5 마핸' }, { key: 'p25', label: '역배 +2.5 플핸' },
  { key: 'o35', label: '3.5 오버' }, { key: 'u45', label: '4.5 언더' },
]

const BASKET_FIELDS: OddsField[] = [
  { key: 'home', label: '홈 승', required: true }, { key: 'away', label: '원정 승', required: true },
  { key: 'line', label: '기준점', kind: 'line' },
  { key: 'hh', label: '홈 핸디캡' }, { key: 'ah', label: '원정 핸디캡' },
]

// 승무패는 사이트 순서대로 홈 승 → 무 → 원정 승, 그다음 홈/원정 핸디캡을 기준점마다 짝으로
const SOCCER_FIELDS: OddsField[] = [
  { key: 'home', label: '홈 승', required: true }, { key: 'draw', label: '무', required: true },
  { key: 'away', label: '원정 승', required: true, solo: true },
  ...[0.5, 1.5, 2.5].flatMap(L => (['home', 'away'] as const).map(side => ({
    key: `${side[0]}${String(L).replace('.', '')}`, label: `${side === 'home' ? '홈' : '원정'} 핸디 ${L}`, line: L, side, solo: side === 'away',
  }))),
  { key: 'o25', label: '2.5 오버' },
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
  for (const g of games) {
    const [h, a, hs, as, , d] = g
    const w = weight(g)
    sw += w
    const m = h <= a ? hs - as : as - hs
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
      ['정배 승률', pct(r(favWin))], ['홈 승률', pct(r(homeWin))], ['무승부', pct(r(draw))], ['정배 2골차↑ 승', pct(r(big))],
      ['평균 골', r(total).toFixed(2)], ['2.5 오버', pct(r(o25))], ['양팀 득점', pct(r(btts))], ['정배 평균배당', r(favOdds).toFixed(2)], ['평균 마진', pct(r(margin))],
    ] as [string, string][],
  }
}

type VolleyJudgeFn = (o: VolleyOdds) => JudgeOut | null
type BasketJudgeFn = (o: BasketOdds) => JudgeOut | null
type SoccerJudgeFn = (o: SoccerOdds) => JudgeOut | null
const SOCCER_REC = '기대수익 플러스 + 배당 1.10 이상 3.00 미만 · 핸디캡은 반 골 기준점이라 적특 없음'
const VOLLEY_REC = '기대수익 플러스 + 배당 1.30 이상 2.00 미만 (원정 승은 추천 제외)'
const BASKET_REC = '기대수익 플러스 + 배당 1.30 이상 2.50 미만 · 기준점이 정수면 적특(환불) 반영'
function volleyLeague(key: string, label: string, note: string, judge: VolleyJudgeFn, games: VolleyGame[]): LeagueJudge {
  return {
    key, label, note, fields: VOLLEY_FIELDS, recNote: VOLLEY_REC, profile: () => volleyProfile(games), data: () => seasonSummary(games),
    run: v => judge({ home: v.home, away: v.away, m15: v.m15, o35: v.o35, u45: v.u45, p25: v.p25 }),
  }
}
function basketLeague(key: string, label: string, note: string, judge: BasketJudgeFn, games: BasketGame[]): LeagueJudge {
  return {
    key, label, note, fields: BASKET_FIELDS, recNote: BASKET_REC, profile: () => basketProfile(games), data: () => seasonSummary(cleanGames(games)),
    // 홈/원정 핸디캡 배당으로 받고, 승패 배당이 낮은 쪽(정배)이 자동으로 -기준점 마핸이 된다
    run: v => {
      const favHome = v.home != null && v.away != null && v.home <= v.away
      return judge({ home: v.home, away: v.away, line: v.line, mh: favHome ? v.hh : v.ah, ph: favHome ? v.ah : v.hh })
    },
  }
}

function soccerLeague(key: string, label: string, note: string, judge: SoccerJudgeFn, games: SoccerGame[]): LeagueJudge {
  return {
    key, label, note, fields: SOCCER_FIELDS, perRow: 3, recNote: SOCCER_REC, profile: () => soccerProfile(games), data: () => seasonSummary(cleanSoccer(games)),
    run: v => judge({
      home: v.home, draw: v.draw, away: v.away, h05: v.h05, a05: v.a05, h15: v.h15, a15: v.a15, h25: v.h25, a25: v.a25, o25: v.o25,
    }),
  }
}

const JUDGES: SportJudges[] = [
  {
    key: 'soccer', label: '축구', emoji: '⚽', leagues: [
      soccerLeague('epl', 'EPL', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당)', judgeEpl, EPL_GAMES),
      soccerLeague('laliga', '라리가', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당)', judgeLaliga, LALIGA_GAMES),
      soccerLeague('bundesliga', '분데스리가', '2021-22 ~ 2025-26 정규리그 (BetExplorer 평균 배당)', judgeBundesliga, BUNDESLIGA_GAMES),
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
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  // 항상 홈 승 칸에 커서 — 처음 보일 때, 종목·리그를 바꿀 때, 초기화할 때 바로 홈 승부터 칠 수 있게
  const [focusTick, setFocusTick] = useState(0)
  useEffect(() => {
    if (active) inputRefs.current[0]?.focus({ preventScroll: true })
  }, [active, sportKey, leagueKey, focusTick])
  function reset() { setRaw({}); setFocusTick(t => t + 1) }
  // 기준점은 정수만 치고 넘어가면 .5를 붙인다 (5 → 5.5, 13 → 13.5). 정수 기준점은 5.0처럼 소수점까지 치면 그대로 둔다
  function finishLine(key: string) {
    setRaw(p => /^\d+$/.test(p[key] ?? '') ? { ...p, [key]: `${p[key]}.5` } : p)
  }

  function pickSport(key: string) {
    const s = JUDGES.find(x => x.key === key)!
    setSportKey(key); setLeagueKey(s.leagues[0]?.key ?? null); setRaw({}); setFocusTick(t => t + 1)
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
    if (isTriple) { const el = inputRefs.current[idx + 1]; if (el) { el.focus(); el.select() } }
  }
  const vals: Record<string, number | null> = {}
  for (const f of league?.fields ?? []) {
    const n = parseFloat(raw[f.key] ?? '')
    vals[f.key] = f.kind === 'line' ? (Number.isFinite(n) && n >= 0 ? n : null) : (n > 1 ? n : null)
  }
  const out = league ? league.run(vals) : null
  // 농구 마핸/플핸 줄 이름에 홈/원정과 실제 기준점을 붙여서 보여준다 (홈 마핸 -5.5 / 원정 플핸 +5.5)
  const lineV = vals.line
  const favHome = vals.home != null && vals.away != null && vals.home <= vals.away
  const sideOf = (key: string) => (key === 'mh') === favHome ? '홈' : '원정'
  const betName = (b: JudgeBet) => lineV != null && (b.key === 'mh' || b.key === 'ph') ? `${sideOf(b.key)} ${b.key === 'mh' ? '마핸 -' : '플핸 +'}${lineV}` : b.name
  // 판정 결과의 마핸/플핸을 입력 칸(홈 핸디캡/원정 핸디캡) 순서로 맞춘다
  const fieldKeyOf = (key: string) => key === 'mh' || key === 'ph' ? (sideOf(key) === '홈' ? 'hh' : 'ah') : key
  // 홈/원정 핸디캡 칸 이름 옆에 지금 배당 기준으로 마핸/플핸 어느 쪽인지 붙여준다
  // 칸 이름 아래 작은 글씨 — 기준점은 자동 .5 안내, 핸디캡은 지금 배당 기준 마핸/플핸 (이름 폭을 줄여 칸이 좁아도 한 줄에 두 칸)
  const fieldSub = (f: OddsField) => {
    if (f.kind === 'line') return '5 → 5.5 자동'
    if (f.line != null) {
      if (vals.home == null || vals.away == null) return null
      return `${(f.side === 'home') === favHome ? '마핸 -' : '플핸 +'}${f.line}`
    }
    if ((f.key !== 'hh' && f.key !== 'ah') || vals.home == null || vals.away == null) return null
    const isFav = (f.key === 'hh') === favHome
    return `${isFav ? '마핸 -' : '플핸 +'}${lineV ?? '기준점'}`
  }
  // 입력칸 자리는 모든 종목 한 줄 3칸 기준. 축구는 3칸(승무패)을 다 쓰고, 농구·배구는 2칸씩만 써서 세로 배치는 그대로.
  // 각 칸이 한 줄의 몇째(0/1/2) 자리인지 — 첫째 자리가 아니면 이름 앞에 간격 (기준점·solo 칸 뒤에서 줄 바꿈)
  const SLOTS = 3
  const perRow = league?.perRow ?? 2
  const inputCol: number[] = []
  const rowEnd: boolean[] = []
  let col = 0
  for (const f of league?.fields ?? []) {
    const end = f.kind === 'line' || !!f.solo || col + 1 >= perRow
    inputCol.push(col); rowEnd.push(end); col = end ? 0 : col + 1
  }
  const recommendedKeys = new Set(out?.recommended.map(b => b.key) ?? [])
  const ruleKeys = new Set(out?.rule?.keys ?? [])
  const requiredLabels = (league?.fields ?? []).filter(f => f.required).map(f => f.label).join(' / ')

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
          <button onClick={reset} title="배당 초기화" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}><RotateCcw size={12} /> 초기화</button>
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {sport.leagues.map(l => (
                <button key={l.key} onClick={() => { setLeagueKey(l.key); setRaw({}); setFocusTick(t => t + 1) }} style={{ ...chip(l.key === leagueKey), fontSize: 11, padding: '4px 10px' }}>{l.label}</button>
              ))}
            </div>
            {league && <DataStatus league={league} />}
            {league && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>기준 데이터: {league.note}</div>}
            {league && (() => {
              const pr = league.profile()
              const items = pr.items
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '7px 10px', marginBottom: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)' }}>{league.label} 특성 ({pr.n}경기 · {pr.weighted ? '최근 시즌 가중' : '시즌 정보 없음, 가중 미적용'})</span>
                  {items.map(([k, v]) => (
                    <span key={k} style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{k} <b style={{ color: 'var(--text-primary)' }}>{v}</b></span>
                  ))}
                </div>
              )
            })()}
          </>
        )}

        {league && (
          <>
            {/* 배당 입력 — 좌측 정렬, 한 줄에 두 칸씩 (이름 바로 옆에 입력칸, 그 옆에 다음 이름·입력칸). 입력칸은 모두 같은 크기.
                농구 기준점은 혼자 한 줄 → 홈 핸디캡/원정 핸디캡이 아래 줄에 짝으로 */}
            <div className="bet-inputs">
              {league.fields.map((f, i) => (
                <label key={f.key} style={{ display: 'contents' }}>
                  <span className="bet-inputs__label" style={{ paddingLeft: inputCol[i] > 0 ? 12 : 0, fontSize: 10, fontWeight: 700, color: f.required ? 'var(--text-primary)' : f.kind === 'line' ? 'var(--gold)' : 'var(--text-muted)' }}>{f.label}{f.required && ' *'}{fieldSub(f) && <div style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--text-muted)' }}>{fieldSub(f)}</div>}</span>
                  <input ref={el => { inputRefs.current[i] = el }} className="form-input bet-odds-input" inputMode="decimal" placeholder={f.kind === 'line' ? '5 → 5.5' : '185=1.85'}
                    onBlur={f.kind === 'line' ? () => finishLine(f.key) : undefined}
                    value={raw[f.key] ?? ''} onChange={e => change(i, f.key, e.target.value, f.kind)} onFocus={e => e.target.select()}
                    onKeyDown={e => { if (e.key === 'Enter') { const el = inputRefs.current[i + 1]; if (el) { el.focus(); el.select() } } }}
                    style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                  {rowEnd[i] && inputCol[i] < SLOTS - 1 && <span className="bet-inputs__rest" style={{ gridColumn: `span ${2 * (SLOTS - 1 - inputCol[i])}` }} />}
                </label>
              ))}
            </div>

            {!out ? (
              <div style={{ padding: '14px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{requiredLabels} 배당을 넣으면 판정합니다 (나머지는 있는 것만 넣어도 됨{league.fields.some(f => f.kind === 'line') ? ' · 마핸/플핸은 기준점도 넣어야 판정' : ''})</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <span>정배 <b style={{ color: 'var(--text-primary)' }}>{out.favIsHome ? '홈' : '원정'} {out.fav.toFixed(2)}</b></span>
                  <span>마진 <b style={{ color: out.margin <= 0.05 ? 'var(--green)' : 'var(--orange)' }}>{pct(out.margin)}</b></span>
                  <span>비교 경기 <b style={{ color: 'var(--text-primary)' }}>{out.marketN}</b></span>
                  {out.rule && <span>내 룰 <b style={{ color: out.rule.keys.length ? 'var(--gold)' : 'var(--text-muted)' }}>{out.rule.text}</b></span>}
                  {out.expMargin != null && <span>비교 경기 정배 평균 점수차 <b style={{ color: 'var(--text-primary)' }}>{out.expMargin >= 0 ? '+' : ''}{out.expMargin.toFixed(1)}</b></span>}
                </div>

                <div className="table-wrap">
                  <table className="bet-judge-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>베팅</th><th className="td-right">배당</th><th className="td-right">과거 적중률</th>
                        <th className="td-right">손익분기</th><th className="td-right">기대수익</th><th>베팅 강도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...out.bets].sort((x, y) => league.fields.findIndex(f => f.key === fieldKeyOf(x.key)) - league.fields.findIndex(f => f.key === fieldKeyOf(y.key))).map(b => <JudgeRow key={b.key} b={b} name={betName(b)} recommended={recommendedKeys.has(b.key)} rule={ruleKeys.has(b.key)} />)}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12 }}>
                  {out.recommended.length > 0 ? (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--green)' }}>추천</span>{' '}
                      {out.recommended.map((b, i) => (
                        <span key={b.key}>{i > 0 && ' · '}<b>{betName(b)}</b> {b.site.toFixed(2)} ({signedPct(b.ev)}, {b.strength}점)</span>
                      ))}
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>추천 없음</span>
                      {out.leastLoss && <span style={{ color: 'var(--text-secondary)' }}> — 그나마 손해가 적은 건 <b>{betName(out.leastLoss)}</b> {out.leastLoss.site.toFixed(2)} ({signedPct(out.leastLoss.ev)})</span>}
                    </>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    추천 조건: {league.recNote} · ±는 95% 오차<br />
                    베팅 강도: 0 패스(오차 감안해도 마이너스) · 1~3 약(마이너스지만 오차 범위 안) · 4~10 플러스(기대수익 크고 확실할수록 높음)
                  </div>
                </div>
              </>
            )}
          </>
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
  const label = (y: number) => `${String(y - 1).slice(2)}/${String(y).slice(2)}`
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

// 베팅 강도 색: 0 회색(패스) · 1~3 주황(약) · 4~6 금색(중) · 7~10 초록(강/최강)
function strengthColor(v: number) {
  return v === 0 ? 'var(--text-muted)' : v <= 3 ? 'var(--orange)' : v <= 6 ? 'var(--gold)' : 'var(--green)'
}

// rule: 축구 내 룰북이 이 경기에서 고르는 베팅 (이름 옆에 '룰' 표시)
function JudgeRow({ b, name, recommended, rule = false }: { b: JudgeBet; name: string; recommended: boolean; rule?: boolean }) {
  const evColor = b.ev > 0 ? 'var(--green)' : 'var(--red)'
  return (
    <tr style={recommended ? { background: 'var(--green-bg)' } : !b.eligible ? { opacity: 0.55 } : undefined}>
      <td style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{name}{rule && <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, fontSize: 9, color: 'var(--gold)', border: '1px solid var(--gold-border)' }}>룰</span>}</td>
      <td className="td-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.site.toFixed(2)}</td>
      {/* 오차·경기 수 같은 보조 정보는 아랫줄에 작게 — 가로 스크롤 없이 표가 한 번에 보이게 */}
      <td className="td-right" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{pct(b.hit)}<div style={{ fontSize: 9, color: 'var(--text-muted)' }}>±{pct(b.se)}{b.push ? ` · 적특 ${pct(b.push)}` : ''} · {b.n}경기</div></td>
      <td className="td-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.be.toFixed(2)}</td>
      <td className="td-right" style={{ fontSize: 12, fontWeight: 700, color: evColor, whiteSpace: 'nowrap' }}>{signedPct(b.ev)}<div style={{ fontWeight: 400, fontSize: 9, color: 'var(--text-muted)' }}>±{pct(b.err)}</div></td>
      <td style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: strengthColor(b.strength) }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 13 }}>{b.strength}<span style={{ fontSize: 9, opacity: 0.7 }}>/10</span></span>
          <span style={{ display: 'inline-block', width: 32, height: 5, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${b.strength * 10}%`, height: '100%', background: strengthColor(b.strength) }} />
          </span>
          {b.strengthLabel}
        </span>
        {!b.eligible && <div style={{ fontWeight: 400, fontSize: 9, color: 'var(--text-muted)' }}>배당범위 밖</div>}
      </td>
    </tr>
  )
}

// ─── 배구 예측 (V리그 남·여) — 세트 스코어 분포 ─────
// 1) 홈 승률 = 우리 모델만 (2026-11-21 사용자 요청 — 배당은 섞지 않고 비교용. 처음엔 빗나가도 예측 보고서로 조금씩 고친다):
//    logit 홈 승률 = 홈 이점 hca + wScore × 팀 세트 득실 logit + wOv × k × 선수 오버롤(포지션 슬롯) 차
//    팀 세트 득실: 이번 시즌 딴 세트 비율을 (딴+3)/(전체+6)로 평균 쪽으로 당겨 logit → 두 팀 차 = 세트 1개 이길 확률 →
//      5세트 3선승으로 경기 승률 (p³·(1 + 3q + 6q²)). 경기 결과 = vb_games (KOVO 시즌 일정).
// 2) 세트 스코어: 과거 V리그 경기(남 630·여 615, 2021-22~2025-26, 시즌 가중)로 맞춘 곡선 —
//    "정배 승률(logit) → 정배 세트차 ≥ c" 로지스틱 5개(c = +3·+2·+1·−1·−2), 홈정배/원정정배 따로 (oddsCurve와 같은 방식).
//    여기 넣는 정배 승률은 위 1)의 값 — 시장 배당이 그 경기에서 했던 역할을 우리 승률이 대신한다.
// 가중치: model_params leagues.VLEAGUE_M/W — hca = 홈 이점(logit), k = 오버롤 1점당 logit, wScore = 팀 레이팅 비중, wOv = 오버롤 비중.
//  2026-11-25: 팀 세트 득실 → 상대 보정 레이팅(volleyRatings)으로 바꾸며 hca 0.2·wScore 1 (백테스트로 맞춘 값), 오버롤 0.5는 그대로(지난 시즌 선수 기록이 없어 검증 못 함).
const sig = (z: number) => 1 / (1 + Math.exp(-z))
const logit = (p: number) => Math.log(p / (1 - p))

// [a, b] — P(정배 세트차 ≥ c) = sig(a + b·logit(정배 승률)), c = +3, +2, +1, −1, −2 (scratch 스크립트로 2026-11-20 적합)
const CURVES: Record<string, Record<'home' | 'away', [number, number][]>> = {
  VLEAGUE_M: {
    home: [[-1.508, 0.724], [-0.568, 0.847], [0.053, 0.934], [0.804, 0.812], [1.734, 1.001]],
    away: [[-1.728, 1.246], [-0.58, 1.234], [-0.15, 1.161], [0.695, 0.742], [1.983, -0.062]],
  },
  VLEAGUE_W: {
    home: [[-1.753, 1.024], [-0.7, 1.245], [0.103, 1.093], [0.713, 1.027], [1.484, 1.429]],
    away: [[-1.706, 0.793], [-0.666, 0.952], [-0.18, 1.147], [0.314, 1.17], [0.933, 1.476]],
  },
}

export type SetScore = '3-0' | '3-1' | '3-2' | '2-3' | '1-3' | '0-3'
export const SET_SCORES: SetScore[] = ['3-0', '3-1', '3-2', '2-3', '1-3', '0-3']
const DIFF: Record<SetScore, number> = { '3-0': 3, '3-1': 2, '3-2': 1, '2-3': -1, '1-3': -2, '0-3': -3 }

/** 홈 승률(우리 값) → 홈 기준 세트 스코어 확률 */
export function setDistribution(code: string, homeProb: number): Record<SetScore, number> | null {
  const c = CURVES[code]; if (!c) return null
  const favHome = homeProb >= 0.5
  const fp = Math.min(0.97, Math.max(0.5, favHome ? homeProb : 1 - homeProb))
  const x = logit(fp)
  const cum: number[] = []
  for (const [a, b] of c[favHome ? "home" : "away"]) cum.push(Math.min(1, Math.max(cum.length ? cum[cum.length - 1] : 0, sig(a + b * x))))   // 누적이라 줄어들면 안 됨
  // 정배 기준 +3 +2 +1 −1 −2 −3
  const fav = [cum[0], cum[1] - cum[0], cum[2] - cum[1], cum[3] - cum[2], cum[4] - cum[3], 1 - cum[4]].map(v => Math.max(0, v))
  const s = fav.reduce((a, b) => a + b, 0)
  // 승률은 넣은 값 그대로 두고 곡선은 '이기면 몇 세트로, 지면 몇 세트로'만 정한다 (2026-11-25 — 곡선이 승률을 바꿨다:
  //  원정 정배 50.7%를 넣으면 곡선이 정배 승 46%로 내려 홈 53.7%로 뒤집혔다(오늘 IBK–도로공사). 2024-25·2025-26 백테스트에서
  //  곡선 거친 승률 LL 0.6412 vs 넣은 승률 그대로 0.6394 — 그대로가 낫다, scripts/vleague_backtest_curve.py)
  const fw = (fav[0] + fav[1] + fav[2]) / s, want = favHome ? homeProb : 1 - homeProb
  const sc = (i: number) => (i < 3 ? (fw > 0 ? want / fw : 0) : (fw < 1 ? (1 - want) / (1 - fw) : 0)) / s
  const order: SetScore[] = favHome ? SET_SCORES : ['0-3', '1-3', '2-3', '3-2', '3-1', '3-0']
  return Object.fromEntries(order.map((k, i) => [k, fav[i] * sc(i)])) as Record<SetScore, number>
}

export interface VolleyResult {
  homeWin: number            // %
  dist: Record<SetScore, number>
  best: SetScore             // 가장 나올 법한 세트 스코어
  expDiff: number            // 홈 기준 기대 세트차
  expSets: number            // 기대 세트 수
  over35: number             // 4세트 이상 %
  full: number               // 5세트 %
  modelHome: number          // 오버롤 모델만의 홈 승률 %
  marketHome: number | null  // 시장(마진 뺀) 홈 승률 % — 비교용
  teamHome?: number | null   // 팀 레이팅만의 홈 승률 % (홈 이점 포함)
}

// ─── 상대 보정 팀 레이팅 (2026-11-25 사용자 요청 — 약한 팀에 진 것·강한 팀을 이긴 것을 다르게) ─────
// 경기 순서대로: 예상 = 2·sig(홈 이점 + R홈 − R원정) − 1, 실제 = 세트차/3 → 오차 × 0.2만큼 두 팀 레이팅을 고친다 (이번 시즌만).
// 최근 경기일수록 비중이 크다 (최근 폼). 홈 승률 logit = hca + (R홈 − R원정) × wScore.
// KOVO 2021-22~2025-26 백테스트 (scripts/vleague_backtest.py, 앞 3시즌으로 고르고 뒤 2시즌 확인): 지금까지 쓰던 시즌 세트 비율
//  LL 0.6438 · 적중 64.3% → 레이팅 0.6394 · 64.5%. 최근 5경기 폼·연승연패를 더 얹어도 나아지지 않았다(레이팅에 이미 들어 있음).
export const VB_RATING = { hca: 0.2, k: 0.2 }
export function volleyRatings(games: { game_date: string; home: string; away: string; home_sets: number | null; away_sets: number | null }[]): Map<string, { r: number; n: number }> {
  const R = new Map<string, { r: number; n: number }>()
  const g = (t: string) => R.get(t) ?? { r: 0, n: 0 }
  for (const x of [...games].sort((a, b) => a.game_date.localeCompare(b.game_date))) {
    if (x.home_sets == null || x.away_sets == null || x.home_sets + x.away_sets === 0) continue
    const h = g(x.home), a = g(x.away)
    const e = (x.home_sets - x.away_sets) / 3 - (2 * sig(VB_RATING.hca + h.r - a.r) - 1)
    R.set(x.home, { r: h.r + VB_RATING.k * e, n: h.n + 1 }); R.set(x.away, { r: a.r - VB_RATING.k * e, n: a.n + 1 })
  }
  return R
}

// 감독 요소는 예측에 안 넣는다 (2026-11-25 사용자 결정 — 뉴스에서 감독 관련 기사만 찾아 보여 줌).
//  참고로 교체 직후 5경기 확신 30% 줄이기는 KOVO 교체 6번 28경기 LL 0.7505 → 0.7172였다 (scripts/vleague_coach_backtest.py).
export interface VolleyTeam { sw?: number; sl?: number; vr?: number }

/** 팀 세트 득실 → logit 경기 승률 (두 팀 세트 기록이 있을 때) — 예전 방식, 레이팅이 없을 때만 */
export function teamSetLogit(home?: { sw?: number; sl?: number } | null, away?: { sw?: number; sl?: number } | null): number | null {
  if (!home?.sw && !home?.sl || !away?.sw && !away?.sl) return null
  const r = (t: { sw?: number; sl?: number }) => logit(((t.sw ?? 0) + 3) / ((t.sw ?? 0) + (t.sl ?? 0) + 6))
  const p = sig(r(home!) - r(away!)), q = 1 - p
  const m = p ** 3 * (1 + 3 * q + 6 * q * q)
  return logit(Math.min(0.99, Math.max(0.01, m)))
}
export function predictVolley(code: string, diff: number, p: { hca: number; k: number; wScore: number; wOv: number }, odds: { home: number; away: number } | null,
  team?: { home?: VolleyTeam | null; away?: VolleyTeam | null }): VolleyResult | null {
  const lt = team?.home?.vr != null && team?.away?.vr != null ? team.home.vr - team.away.vr : teamSetLogit(team?.home, team?.away)
  const lm = p.hca + p.k * diff                                  // 오버롤만 (비교 표시용)
  const l = p.hca + p.wOv * p.k * diff + p.wScore * (lt ?? 0)    // 우리 모델
  const pm = odds && odds.home > 1 && odds.away > 1 ? (1 / odds.home) / (1 / odds.home + 1 / odds.away) : null   // 시장 (비교용, 섞지 않음)
  const dist = setDistribution(code, sig(l)); if (!dist) return null
  const r1 = (v: number) => Math.round(v * 1000) / 10
  const homeWin = dist['3-0'] + dist['3-1'] + dist['3-2']
  // 예상 세트 스코어 = 이길 쪽 + 세트 수 중앙값 (2026-11-24 사용자 지적 두 번):
  //  ① 이길 쪽 안에서 가장 유력한 스코어 → 승률 55~60%에도 3:0 (3-0·3-1이 거의 같아서)
  //  ② 세트차 중앙값 → 3:2가 나오는데 옆 칸 4.5 언더(5세트 안 감)는 68% — 서로 모순
  //  지금: 이길 쪽 = 홈 승률 50% 기준, 세트 수 = 양쪽 합친 세트 수 분포의 중앙값 (3세트 = 3:0+0:3, 4세트 = 3:1+1:3, 5세트 = 3:2+2:3).
  //  그래서 3.5 오버 ≥ 50%면 4세트 이상, 4.5 언더 ≥ 50%면 4세트 이하 — 옆 칸과 늘 맞는다.
  //  3:0은 셧아웃(양쪽) 확률이 50%↑일 때만(정배 승률 약 85~90%↑), 5세트는 풀세트 확률이 50%를 넘어야 해서 거의 안 나온다.
  const homeSide = homeWin >= 0.5
  const p3 = dist['3-0'] + dist['0-3'], p4 = dist['3-1'] + dist['1-3']
  const sets = p3 >= 0.5 ? 3 : p3 + p4 >= 0.5 ? 4 : 5
  const best = (homeSide ? `3-${sets - 3}` : `${sets - 3}-3`) as SetScore
  const expDiff = SET_SCORES.reduce((a, k) => a + DIFF[k] * dist[k], 0)
  const expSets = 3 * (dist['3-0'] + dist['0-3']) + 4 * (dist['3-1'] + dist['1-3']) + 5 * (dist['3-2'] + dist['2-3'])
  return { homeWin: r1(homeWin), dist, best, expDiff: Math.round(expDiff * 100) / 100, expSets: Math.round(expSets * 100) / 100,
    over35: r1(1 - dist['3-0'] - dist['0-3']), full: r1(dist['3-2'] + dist['2-3']), modelHome: r1(sig(lm)), marketHome: pm == null ? null : r1(pm), teamHome: lt == null ? null : r1(sig(lt + p.hca)) }
}

// ─── 2만 번 시뮬레이션 (사용자 요청 — 가장 많이 나온 세트 스코어 + 예상 총득점) ─────
// 경기별 세트 점수 기록이 없어서 점수는 랠리 모델로 만든다:
//  1) 세트 스코어는 위 분포(과거 V리그 곡선)에서 뽑는다 → 세트 스코어 비율은 곡선 그대로.
//  2) 세트마다 '홈이 랠리 1점을 딸 확률 r'로 25점(5세트 15점)·2점 차까지 한 점씩 친다.
//     r은 분포에서 나온 홈 세트 승률(홈이 따는 세트 수 / 전체 세트 수)에 맞춘다. 정해진 세트 승자와 다르게 끝나면 다시 친다.
//  r = 0.5일 때 세트당 약 44.7점 (5세트 15점). 실제 V리그 득점으로 맞춘 값이 아니다 — 검증 전.
export const VOLLEY_TOTAL_LINES = Array.from({ length: 13 }, (_, i) => 174.5 + i)

/** 랠리 확률 r로 to점 세트를 홈이 이길 확률 (정확한 계산) */
function setWinProb(r: number, to: number): number {
  const q = 1 - r
  const P: number[][] = Array.from({ length: to }, () => new Array(to).fill(0))
  P[0][0] = 1
  let win = 0
  for (let h = 0; h < to; h++) for (let a = 0; a < to; a++) {
    const v = P[h][a]; if (!v || (h === to - 1 && a === to - 1)) continue
    if (h + 1 === to) win += v * r; else P[h + 1][a] += v * r
    if (a + 1 < to) P[h][a + 1] += v * q
  }
  const deuce = P[to - 1][to - 1]
  return win + deuce * (r * r) / (r * r + q * q)
}
function rallyProb(setHome: number): number {
  let lo = 0.3, hi = 0.7
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (setWinProb(m, 25) < setHome) lo = m; else hi = m }
  return (lo + hi) / 2
}
function rng(seed: number) {   // 같은 경기면 같은 결과 (화면이 다시 그려져도 숫자가 안 흔들리게)
  let t = seed >>> 0
  return () => { t += 0x6D2B79F5; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296 }
}

export interface VolleySim {
  n: number
  scores: { score: SetScore; pct: number }[]   // 많이 나온 순
  best: SetScore; bestPct: number
  homePts: number; awayPts: number              // 평균 득점
  total: number; median: number; lo: number; hi: number   // 총득점 평균·중앙값·가운데 80% 범위
  overs: { line: number; over: number }[]       // 총득점 기준점별 오버 %
  overAll: { line: number; over: number }[]     // 140.5~220.5 모든 .5 기준점 오버 % (포인트 오버·언더 별점 구간용)
  rally: number                                 // 홈 랠리 확률
}

export function simulateVolley(dist: Record<SetScore, number>, n = 20000, seed = 1): VolleySim {
  const rand = rng(seed)
  const eHome = 3 * (dist['3-0'] + dist['3-1'] + dist['3-2']) + 2 * dist['2-3'] + dist['1-3']
  const eAll = SET_SCORES.reduce((a, k) => a + dist[k] * (3 + (k.includes('1') ? 1 : 0) + (k.includes('2') ? 2 : 0)), 0)
  const r = rallyProb(Math.min(0.9, Math.max(0.1, eHome / eAll)))
  const cdf: [SetScore, number][] = []; let c = 0
  for (const k of SET_SCORES) { c += dist[k]; cdf.push([k, c]) }
  const playSet = (to: number, homeWins: boolean): [number, number] => {
    for (let t = 0; ; t++) {
      let h = 0, a = 0
      while (!((h >= to || a >= to) && Math.abs(h - a) >= 2)) { if (rand() < r) h++; else a++ }
      if ((h > a) === homeWins) return [h, a]
      if (t >= 30) return [a, h]   // 거의 없는 경우 — 뒤집어서 끝냄
    }
  }
  const count: Record<string, number> = {}
  const totals: number[] = new Array(n)
  let sh = 0, sa = 0
  for (let i = 0; i < n; i++) {
    const u = rand() * c
    const score = (cdf.find(([, v]) => u <= v) ?? cdf[cdf.length - 1])[0]
    count[score] = (count[score] ?? 0) + 1
    const hs = Number(score[0]), as = Number(score[2]), sets = hs + as, homeMatch = hs > as
    // 마지막 세트는 경기 이긴 팀, 앞 세트에 진 팀이 딴 세트를 무작위 자리에
    const loserSets = homeMatch ? as : hs
    const order: boolean[] = new Array(sets - 1).fill(homeMatch)
    const idx = [...Array(sets - 1).keys()]
    for (let j = 0; j < loserSets; j++) { const p = Math.floor(rand() * idx.length); order[idx.splice(p, 1)[0]] = !homeMatch }
    order.push(homeMatch)
    let H = 0, A = 0
    order.forEach((hw, s) => { const [h, a] = playSet(s === 4 ? 15 : 25, hw); H += h; A += a })
    sh += H; sa += A; totals[i] = H + A
  }
  totals.sort((x, y) => x - y)
  const q = (p: number) => totals[Math.min(n - 1, Math.floor(p * n))]
  const r1 = (v: number) => Math.round(v * 10) / 10
  const scores = SET_SCORES.map(score => ({ score, pct: r1(((count[score] ?? 0) / n) * 100) })).sort((x, y) => y.pct - x.pct)
  const overOf = (line: number) => {
    let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (totals[m] > line) hi = m; else lo = m + 1 }
    return { line, over: r1(((n - lo) / n) * 100) }
  }
  const overs = VOLLEY_TOTAL_LINES.map(overOf)
  const overAll = Array.from({ length: 81 }, (_, i) => overOf(140.5 + i))
  return { n, scores, best: scores[0].score, bestPct: scores[0].pct, homePts: r1(sh / n), awayPts: r1(sa / n),
    total: r1((sh + sa) / n), median: q(0.5), lo: q(0.1), hi: q(0.9), overs, overAll, rally: Math.round(r * 1000) / 1000 }
}

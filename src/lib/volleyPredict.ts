// ─── 배구 예측 (V리그 남·여) — 세트 스코어 분포 ─────
// 1) 승률: 선수 오버롤 팀 전력 차 → 로지스틱 (홈 이점 포함), 배당이 있으면 시장 승률과 섞는다 (기본 시장 0.7 : 모델 0.3, logit 기준).
// 2) 세트 스코어: 과거 V리그 경기(남 630·여 615, 2021-22~2025-26, 시즌 가중)로 맞춘 곡선 —
//    "정배 승률(logit) → 정배 세트차 ≥ c" 로지스틱 5개(c = +3·+2·+1·−1·−2), 홈정배/원정정배 따로 (oddsCurve와 같은 방식).
//    여기 넣는 정배 승률은 위 1)의 값 — 시장 배당이 그 경기에서 했던 역할을 우리 승률이 대신한다.
// 가중치: model_params leagues.VLEAGUE_M/W — hca = 홈 이점(logit), k = 오버롤 1점당 logit, wScore = 시장 비중, wOv = 모델 비중.
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
  const order: SetScore[] = favHome ? SET_SCORES : ['0-3', '1-3', '2-3', '3-2', '3-1', '3-0']
  return Object.fromEntries(order.map((k, i) => [k, fav[i] / s])) as Record<SetScore, number>
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
  marketHome: number | null  // 시장(마진 뺀) 홈 승률 %
}

export function predictVolley(code: string, diff: number, p: { hca: number; k: number; wScore: number; wOv: number }, odds: { home: number; away: number } | null): VolleyResult | null {
  const lm = p.hca + p.k * diff
  const pm = odds && odds.home > 1 && odds.away > 1 ? (1 / odds.home) / (1 / odds.home + 1 / odds.away) : null
  const l = pm == null ? lm : (p.wScore * logit(pm) + p.wOv * lm) / (p.wScore + p.wOv)
  const dist = setDistribution(code, sig(l)); if (!dist) return null
  const r1 = (v: number) => Math.round(v * 1000) / 10
  const best = SET_SCORES.reduce((a, b) => (dist[b] > dist[a] ? b : a))
  const homeWin = dist['3-0'] + dist['3-1'] + dist['3-2']
  const expDiff = SET_SCORES.reduce((a, k) => a + DIFF[k] * dist[k], 0)
  const expSets = 3 * (dist['3-0'] + dist['0-3']) + 4 * (dist['3-1'] + dist['1-3']) + 5 * (dist['3-2'] + dist['2-3'])
  return { homeWin: r1(homeWin), dist, best, expDiff: Math.round(expDiff * 100) / 100, expSets: Math.round(expSets * 100) / 100,
    over35: r1(1 - dist['3-0'] - dist['0-3']), full: r1(dist['3-2'] + dist['2-3']), modelHome: r1(sig(lm)), marketHome: pm == null ? null : r1(pm) }
}

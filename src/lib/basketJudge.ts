import { betStrength } from './judgeScore';
import { logit } from './oddsCurve';
import { fitMargin, type MarginCurve, type MarginRow } from './marginCurve';
import { oddsHistory, winGate, type OddsCheck } from './oddsCheck';
import { recentSeasons, seasonWeigher, weightedMean, weightedStat } from './seasonWeight';

// [홈배당, 원정배당, 홈점수, 원정점수, 시즌(끝나는 해, 선택)] — 시즌이 있으면 최근 시즌일수록 가중치를 크게 (seasonWeight.ts)
export type Game = [number, number, number, number, number?];

export type BetKey = 'home' | 'away' | 'mh' | 'ph' | 'mh2' | 'ph2' | 'mh3' | 'ph3';

export interface Odds {
  home: number | null; // 홈 승 배당
  away: number | null; // 원정 승 배당
  line: number | null; // 기준점 (정배 기준, 양수. 예: 5.5 → 정배 -5.5 / 역배 +5.5)
  mh: number | null; // 정배 -기준점 마핸 배당
  ph: number | null; // 역배 +기준점 플핸 배당
  // 두 번째·세 번째 기준점 (같은 경기 다른 기준점·배당을 나란히 비교할 때 — 선택)
  line2?: number | null; mh2?: number | null; ph2?: number | null;
  line3?: number | null; mh3?: number | null; ph3?: number | null;
}

export interface BetResult {
  key: BetKey;
  name: string;
  site: number;
  hit: number; // 과거 적중률 (적특 제외)
  push: number; // 적특 비율 (정수 기준점일 때)
  se: number; // 적중률 95% 오차
  be: number; // 손익분기 배당
  ev: number; // 기대수익 (0.05 = +5%)
  err: number; // 기대수익 95% 오차
  strengthLabel: string; // 패스 / 약 / 중 / 강 / 최강
  strength: number; // 베팅 강도 0~10점 (0 = 패스)
  n: number;
  eligible: boolean; // 사이트 배당이 추천 범위 안
  check?: OddsCheck; // 승 베팅: 같은 배당대 과거 실적
}

export interface JudgeOutput {
  fav: number;
  favIsHome: boolean;
  margin: number; // 승패 배당 마진
  marketN: number; // 점수차 곡선에 쓴 같은 쪽 정배 경기 수 (모든 배당대)
  expMargin: number; // 그 배당대(±winBand) 실제 평균 점수차 (진 경기는 마이너스로 같이 평균)
  curveMargin: number; // 점수차 곡선으로 본 이 배당의 평균 점수차
  bets: BetResult[];
  recommended: BetResult[]; // 추천 (강도 > 0), 강도·기대수익 내림차순
  leastLoss: BetResult | null; // 전부 마이너스일 때 가장 덜 잃는 쪽
}

const NAMES: Record<BetKey, string> = {
  home: '홈', away: '원정', mh: '마핸 (정배 -)', ph: '플핸 (역배 +)', mh2: '마핸 2 (정배 -)', ph2: '플핸 2 (역배 +)', mh3: '마핸 3 (정배 -)', ph3: '플핸 3 (역배 +)',
};

// 농구 판정은 점수차 곡선 하나로 (사용자 요청 — 핸디 구역 같은 다른 가이드는 빼고 심플하게, src/lib/marginCurve.ts):
//  같은 쪽 정배(홈정배/원정정배) 과거 경기 전체(모든 배당대)로 "정배 배당 → 평균 점수차" 곡선과 퍼짐을 맞춘다. 진 경기는 마이너스 점수차로 같이 들어간다.
//  핸디: 마핸 -L = 점수차 > L, 플핸 +L = 점수차 < L. 3시즌 백테스트(이전 시즌으로만, 반점 기준점 0.5~24.5 중 예상 점수차 ±6) Brier:
//   예전 비교 경기 비율 0.2396 · 기준점별 승률 곡선 0.2377 · 점수차 곡선 0.2375 (NBL 0.2435 → 0.2410)
//  승: 점수차 곡선의 "점수차 > 0"(꾸역승·대승·패배 모두 반영)과 그 배당대(±winBand, 가까울수록 크게) 실제 승률의 반반. Brier 0.1952,
//   승 추천 리그(CBA·B.LEAGUE·NBL) 69건 +22.2%. 점수차 곡선만은 Brier 0.1951이지만 시장과 거의 같아 추천이 거의 안 나오고(CBA·B.LEAGUE 0건),
//   그 배당대 평균 점수차로만 보면 Brier 0.1963으로 덜 정확했다
export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  winMaxOdds: number; // 홈 승·원정 승 추천 상한 배당 (미만)
  winSeasonShare: number; // 승 베팅: 같은 배당대 과거 실적이 플러스였던 시즌 비율이 이 이상이어야 추천
  winOff: boolean; // 이 리그는 승 추천 안 함 (적중률·손익분기는 보여주고 강도 0)
  // 승의 배당대 실제 승률 범위: 같은 쪽 정배, 정배 배당 ±winBand (1.40 → 1.32~1.48), 가까울수록 크게 (삼각 가중). 경기 수를 채우려고 넓히지 않는다
  // (사용자 요청 — 예전엔 200경기를 채우려고 KBL 원정 1.10에 1.01~1.50까지 봤다)
  winBand: number;
}
// 농구 승 추천 기준 — 리그별 3시즌 백테스트(각 시즌을 이전 시즌으로만 판정, 평균배당)로 정함:
//  1.75 미만 + 같은 배당대 과거 실적 시즌 60% 이상 플러스, NBA·KBL·유로리그는 어떤 방식으로도 마이너스라 승 추천을 끈다 (leagues/*.ts winOff)

// 판정에 쓸 수 없는 경기 제외: 동점(0:0 등 취소·미진행), 배당 1.00 이하(빈 값), 두 배당 마진이 마이너스(배당 기록 오류)
export function cleanGames(games: Game[]): Game[] {
  return games.filter(([h, a, hs, as]) => hs !== as && h > 1 && a > 1 && 1 / h + 1 / a >= 1);
}

export function createJudge(rawGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(cleanGames(rawGames)); // 최근 5시즌만
  const weight = seasonWeigher(games);
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 3.0, winMaxOdds: 1.75, winSeasonShare: 0.6, winOff: false, winBand: 0.08, ...base };
  const check = oddsHistory<'home' | 'away'>(games.map((g) => ({ odds: { home: g[0], away: g[1] }, won: { home: g[2] > g[3], away: g[3] > g[2] }, w: weight(g), season: g[4] })));
  // 같은 쪽 정배 과거 경기 전체 (모든 정배 배당대) — x = logit(정배 확률), m = 정배 기준 점수차, fav = 정배 배당
  const sides = new Map<boolean, { rows: (MarginRow & { fav: number })[]; curve: MarginCurve | null }>();
  for (const side of [true, false]) {
    const rows = games.filter((g) => (g[0] <= g[1]) === side).map((g) => ({ x: logit(favProb(g[0], g[1])), w: weight(g), m: side ? g[2] - g[3] : g[3] - g[2], fav: Math.min(g[0], g[1]) }));
    sides.set(side, { rows, curve: fitMargin(rows) });
  }
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(sides, check, odds, { ...defaults, ...o });
}

// 승패 배당 → 마진 뺀 정배 승 확률
const favProb = (h: number, a: number) => (1 / Math.min(h, a)) / (1 / h + 1 / a);

type Sides = Map<boolean, { rows: (MarginRow & { fav: number })[]; curve: MarginCurve | null }>;

function judgeWith(sides: Sides, oddsCheck: ReturnType<typeof oddsHistory<'home' | 'away'>>, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, away: a } = odds;
  if (!h || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;
  const { rows, curve: mc } = sides.get(favIsHome)!;
  if (!mc) return null;
  const x0 = logit(favProb(h, a));
  const W = (r: { w: number }) => r.w;

  const bets: BetResult[] = [];
  const add = (key: BetKey, site: number | null, s: { n: number; pw: number; pp: number; se: number }) => {
    // 표본이 없거나 한 번도 안 맞았으면 손익분기가 무한대가 되므로 판정하지 않는다
    if (!site || !s.n || !s.pw) return;
    const pl = 1 - s.pw - s.pp;
    const be = (s.pw + pl) / s.pw; // 적특 제외 손익분기: pw*(o-1) = pl
    const ev = s.pw * (site - 1) - pl;
    const isWin = key === 'home' || key === 'away';
    // 승 베팅은 winMaxOdds 미만까지만 추천 범위 (정배 승 1.75~1.90부터 거의 모든 리그 수익률 마이너스)
    const eligible = site >= opts.minOdds && site < (isWin ? opts.winMaxOdds : opts.maxOdds);
    // 추천 배당범위 밖이거나 적중률 50% 미만이면 강도 0 (judgeScore.betStrength), 승은 같은 배당대 과거 실적까지 (oddsCheck.winGate)
    const check = isWin ? oddsCheck(key, site) : undefined;
    const st = isWin && opts.winOff ? { label: '승 추천 안 함', v: 0 } : winGate(betStrength(ev, s.pw, eligible), check, opts.winSeasonShare);
    bets.push({
      key, name: NAMES[key], site, hit: s.pw, push: s.pp, se: s.se, be, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n,
      eligible, check,
    });
  };

  // 승: 점수차 곡선의 "점수차 > 0" 반 + 그 배당대(±winBand, 가까울수록 크게) 실제 승률 반. 그 배당대 경기가 없으면 곡선만
  const wb = opts.winBand;
  const near = rows.filter((r) => Math.abs(r.fav - fav) <= wb + 1e-9).map((r) => ({ m: r.m, w: r.w * Math.max(0.05, 1 - Math.abs(r.fav - fav) / (wb + 0.005)) }));
  const band = weightedStat(near, W, (r) => (r.m > 0 ? 1 : -1));
  const cw = mc.over(x0, 0.5);
  const pFav = Math.min(0.995, Math.max(0.005, band.n ? 0.5 * cw.p + 0.5 * band.pw : cw.p));
  const se = band.n ? 0.5 * cw.se + 0.5 * band.se : cw.se;
  add('home', odds.home, { n: rows.length, pw: favIsHome ? pFav : 1 - pFav, pp: 0, se });
  add('away', odds.away, { n: rows.length, pw: favIsHome ? 1 - pFav : pFav, pp: 0, se });

  // 핸디: 기준점 최대 3개 — 정배 -L 마핸 = 점수차 > L, 역배 +L 플핸 = 점수차 < L (정수 기준점은 점수차 = L이 적특)
  // 핸디 구역(정배 배당대별로 마핸/플핸 추천을 막던 hcapZone)은 사용자 요청으로 뺐다 (구역이 있던 마지막 커밋 bb77c32)
  const hcap = (L: number, minus: boolean) => {
    const over = mc.over(x0, L); // 점수차 > L
    const atLeast = Number.isInteger(L) ? mc.over(x0, L - 1) : over; // 점수차 ≥ L
    return { n: rows.length, pw: minus ? over.p : 1 - atLeast.p, pp: Math.max(0, atLeast.p - over.p), se: over.se };
  };
  for (const [L, mk, pk, mo, po] of [
    [odds.line, 'mh', 'ph', odds.mh, odds.ph],
    [odds.line2, 'mh2', 'ph2', odds.mh2, odds.ph2],
    [odds.line3, 'mh3', 'ph3', odds.mh3, odds.ph3],
  ] as const) {
    if (L == null || L < 0) continue;
    add(mk, mo ?? null, hcap(L, true));
    add(pk, po ?? null, hcap(L, false));
  }

  const recommended = bets.filter((b) => b.strength > 0).sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / a - 1, marketN: rows.length,
    expMargin: near.length ? weightedMean(near, W, (r) => r.m) : mc.mean(x0), curveMargin: mc.mean(x0),
    bets, recommended, leastLoss,
  };
}

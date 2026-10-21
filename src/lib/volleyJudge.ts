import { betStrength } from './judgeScore';
import { oddsHistory, shrinkFactor, winGate, type OddsCheck } from './oddsCheck';
import { recentSeasons, seasonWeigher, weightedMean, weightedStat } from './seasonWeight';

// [홈배당, 원정배당, 홈세트, 원정세트, 시즌(끝나는 해, 선택)] — 시즌이 있으면 최근 시즌일수록 가중치를 크게 (seasonWeight.ts)
export type Game = [number, number, number, number, number?];

export type BetKey = 'home' | 'away' | 'm15' | 'o35' | 'u45' | 'p25';

export interface Odds {
  home: number | null;
  away: number | null;
  m15: number | null; // 정배 -1.5 마핸
  o35: number | null; // 3.5 오버
  u45: number | null; // 4.5 언더
  p25: number | null; // 역배 +2.5 플핸
}

export interface BetResult {
  key: BetKey;
  name: string;
  site: number;
  hit: number; // 과거 적중률
  se: number; // 95% 오차
  be: number; // 손익분기 배당
  ev: number; // 기대수익 (0.05 = +5%)
  err: number; // 기대수익 95% 오차
  strengthLabel: string; // 패스 / 약 / 중 / 강 / 최강
  strength: number; // 베팅 강도 0~10점 (0 = 패스)
  n: number;
  eligible: boolean; // 사이트 배당 1.30 이상 3.00 미만 (추천 배당범위)
  check?: OddsCheck; // 승 베팅: 같은 배당대 과거 실적
}

export interface JudgeOutput {
  fav: number;
  favIsHome: boolean;
  margin: number;
  marketN: number;
  band: { lo: number; hi: number }; // 비교한 정배 배당 구간 (예: 1.20~1.29)
  bets: BetResult[];
  recommended: BetResult[]; // EV>0 & eligible, EV 내림차순
  leastLoss: BetResult | null;
}

const NAMES: Record<BetKey, string> = {
  home: '홈', away: '원정', m15: '-1.5 마핸', o35: '3.5 오버', u45: '4.5 언더', p25: '+2.5 플핸',
};

// 가중 적중률 (최근 시즌 경기일수록 크게 반영)
function stat<T>(rows: T[], weight: (r: T) => number, test: (r: T) => boolean) {
  const s = weightedStat(rows, weight, (r) => (test(r) ? 1 : -1));
  return { n: s.n, p: s.pw, se: s.se };
}


export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  // 비교 경기 = 정배가 같은 쪽(홈정배/원정정배)이고 정배 배당이 같은 0.1 구간인 경기 (정배 1.20 → 1.20~1.29). 경기 수가 적어도 넓히지 않는다
  // (사용자 요청: 예전엔 최소 경기 수(리그별 123~217)를 채우려고 범위를 넓혀서, 정배 1.20에 1.10~1.31 경기까지 섞여 +2.5·3.5 오버를 부풀렸다)
  band: number;
  winMaxOdds: number; // 홈 승·원정 승 추천 상한 배당 (미만)
  winSeasonShare: number; // 승 베팅: 같은 배당대 과거 실적이 플러스였던 시즌 비율이 이 이상이어야 추천
  winAnchor: boolean; // 승 적중률을 시장 확률 기준으로 잡을지 (false면 비교 경기 비율 그대로)
  winOff: boolean; // 승 추천 안 함 (적중률·손익분기는 보여주고 강도 0)
}
// 배구 승 추천은 끈다 — 리그별 3시즌 백테스트(각 시즌을 이전 시즌으로만 판정, 평균배당)에서 예전 방식 홈 승 475건 -8.7%,
// 원정 승 234건 -12.5%였고, 시장 기준 보정·같은 배당대 실적·상한을 어떻게 조합해도 8개 리그 모두 마이너스였다 (사용자 요청: 보수적으로)

export function createJudge(allGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(allGames); // 최근 5시즌만
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 3.0, band: 0.1, winMaxOdds: 1.75, winSeasonShare: 0.6, winAnchor: true, winOff: true, ...base };
  const weight = seasonWeigher(games);
  const check = oddsHistory<'home' | 'away'>(games.map((g) => ({ odds: { home: g[0], away: g[1] }, won: { home: g[2] > g[3], away: g[3] > g[2] }, w: weight(g), season: g[4] })));
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(games, weight, check, odds, { ...defaults, ...o });
}

// 승패 배당 → 마진 뺀 정배 승 확률
const favProb = (h: number, a: number) => (1 / Math.min(h, a)) / (1 / h + 1 / a);

function judgeWith(games: Game[], weight: (g: Game) => number, oddsCheck: ReturnType<typeof oddsHistory<'home' | 'away'>>, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, away: a } = odds;
  if (!h || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 비교 경기: 정배가 같은 쪽(홈정배 / 원정정배)이고 정배 배당이 같은 0.1 구간인 경기 — 홈정배와 원정정배를 섞지 않는다 (사용자 요청)
  // 정배 쪽(fs)과 역배 쪽(us)의 세트 수로 환산 (배당은 0.01 단위 정수로 바꿔서 구간 경계 오차를 없앤다)
  const step = Math.round(opts.band * 100);
  const loC = Math.floor(Math.round(fav * 100) / step) * step;
  const inBand = (g: Game) => { const c = Math.round(Math.min(g[0], g[1]) * 100); return c >= loC && c < loC + step; };
  const rows = games.filter((g) => (g[0] <= g[1]) === favIsHome && inBand(g));
  const band = { lo: loC / 100, hi: (loC + step - 1) / 100 };
  const F = rows.map((g) => {
    const f = g[0] <= g[1];
    return { fs: f ? g[2] : g[3], us: f ? g[3] : g[2], w: weight(g), pf: favProb(g[0], g[1]) };
  });

  const bets: BetResult[] = [];
  const add = (key: BetKey, site: number | null, s: { n: number; p: number; se: number }) => {
    // 비교 경기가 없거나 한 번도 안 맞았으면 손익분기(1/적중률)가 무한대가 되므로 판정하지 않는다
    if (!site || s.n === 0 || s.p === 0) return;
    const be = 1 / s.p;
    const ev = site * s.p - 1;
    const isWin = key === 'home' || key === 'away';
    // 승 베팅은 winMaxOdds 미만까지만 추천 범위
    const eligible = site >= opts.minOdds && site < (isWin ? opts.winMaxOdds : opts.maxOdds);
    // 추천 배당범위 밖이거나 적중률 50% 미만이면 강도 0 (judgeScore.betStrength), 승은 같은 배당대 과거 실적까지 (oddsCheck.winGate)
    const check = isWin ? oddsCheck(key, site) : undefined;
    const st = isWin && opts.winOff ? { label: '승 추천 안 함', v: 0 } : winGate(betStrength(ev, s.p, eligible), check, opts.winSeasonShare);
    bets.push({
      key, name: NAMES[key], site, hit: s.p, se: s.se, be, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n,
      eligible, check,
    });
  };

  const W = (x: { w: number }) => x.w;
  // 승 적중률은 시장 확률 기준: 이 경기 정배 승 확률 + 비교 경기에서 정배가 시장보다 얼마나 더/덜 이겼나 (표본 작을수록 줄임)
  const base = stat(F, W, (x) => x.fs === 3);
  const pFav = opts.winAnchor ? Math.min(0.995, Math.max(0.005, favProb(h, a) + shrinkFactor(F.map((x) => x.w)) * weightedMean(F, W, (x) => (x.fs === 3 ? 1 : 0) - x.pf))) : base.p;
  const seAt = (p: number) => (base.p * (1 - base.p) ? base.se * Math.sqrt((p * (1 - p)) / (base.p * (1 - base.p))) : base.se);
  const favStat = { n: base.n, p: pFav, se: seAt(pFav) }, dogStat = { n: base.n, p: 1 - pFav, se: seAt(1 - pFav) };
  add('home', odds.home, favIsHome ? favStat : dogStat);
  add('away', odds.away, favIsHome ? dogStat : favStat);
  add('m15', odds.m15, stat(F, W, (x) => x.fs === 3 && x.us <= 1));
  add('o35', odds.o35, stat(F, W, (x) => x.fs + x.us >= 4));
  add('u45', odds.u45, stat(F, W, (x) => x.fs + x.us <= 4));
  add('p25', odds.p25, stat(F, W, (x) => !(x.fs === 3 && x.us === 0)));

  // 원정 승은 추천에서 제외 (원하면 아래 필터에서 key !== 'away' 조건 삭제)
  const recommended = bets
    .filter((b) => b.strength > 0 && b.key !== 'away')
    .sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / a - 1, marketN: rows.length, band,
    bets, recommended, leastLoss,
  };
}

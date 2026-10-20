import { strengthOf } from './judgeScore';
import { recentSeasons, seasonWeigher, weightedStat } from './seasonWeight';

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
  eligible: boolean; // 사이트 배당 1.30 이상 2.0 미만
}

export interface JudgeOutput {
  fav: number;
  favIsHome: boolean;
  margin: number;
  marketN: number;
  bets: BetResult[];
  recommended: BetResult[]; // EV>0 & eligible, EV 내림차순
  leastLoss: BetResult | null;
}

const NAMES: Record<BetKey, string> = {
  home: '홈 승', away: '원정 승', m15: '-1.5 마핸', o35: '3.5 오버', u45: '4.5 언더', p25: '+2.5 플핸',
};

// 기준 배당 x 주변 로그 창을 넓혀가며 최소 n 경기 확보
function pick(games: Game[], getX: (g: Game) => number, x: number, minN: number): { rows: Game[]; w: number } {
  let w = 0.03;
  let rows: Game[] = [];
  while (w <= 0.3) {
    rows = games.filter((g) => Math.abs(Math.log(getX(g) / x)) <= w);
    if (rows.length >= minN) break;
    w += 0.01;
  }
  return { rows, w };
}

// 가중 적중률 (최근 시즌 경기일수록 크게 반영)
function stat<T>(rows: T[], weight: (r: T) => number, test: (r: T) => boolean) {
  const s = weightedStat(rows, weight, (r) => (test(r) ? 1 : -1));
  return { n: s.n, p: s.pw, se: s.se };
}


export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  minMarketN: number; // 마켓(-1.5/오버/언더/플핸) 표본 최소 경기 수
  minSideN: number; // 홈 승/원정 승 표본 최소 경기 수
}

export function createJudge(allGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(allGames); // 최근 5시즌만
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 2.0, minMarketN: 150, minSideN: 120, ...base };
  const weight = seasonWeigher(games);
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(games, weight, odds, { ...defaults, ...o });
}

function judgeWith(games: Game[], weight: (g: Game) => number, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, away: a } = odds;
  if (!h || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 정배 쪽(fs)과 역배 쪽(us)의 세트 수로 환산
  const mk = pick(games, (g) => Math.min(g[0], g[1]), fav, opts.minMarketN);
  const F = mk.rows.map((g) => {
    const f = g[0] <= g[1];
    return { fs: f ? g[2] : g[3], us: f ? g[3] : g[2], w: weight(g) };
  });

  const bets: BetResult[] = [];
  const add = (key: BetKey, site: number | null, s: { n: number; p: number; se: number }) => {
    // 비교 경기가 없거나 한 번도 안 맞았으면 손익분기(1/적중률)가 무한대가 되므로 판정하지 않는다
    if (!site || s.n === 0 || s.p === 0) return;
    const be = 1 / s.p;
    const ev = site * s.p - 1;
    const st = strengthOf(ev, site * s.se);
    bets.push({
      key, name: NAMES[key], site, hit: s.p, se: s.se, be, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n,
      eligible: site >= opts.minOdds && site < opts.maxOdds,
    });
  };

  const sh = pick(games, (g) => g[0], h, opts.minSideN); // 홈 승: 홈 배당이 비슷한 경기
  const sa = pick(games, (g) => g[1], a, opts.minSideN); // 원정 승: 원정 배당이 비슷한 경기
  const W = (x: { w: number }) => x.w;
  add('home', odds.home, stat(sh.rows, weight, (g) => g[2] > g[3]));
  add('away', odds.away, stat(sa.rows, weight, (g) => g[3] > g[2]));
  add('m15', odds.m15, stat(F, W, (x) => x.fs === 3 && x.us <= 1));
  add('o35', odds.o35, stat(F, W, (x) => x.fs + x.us >= 4));
  add('u45', odds.u45, stat(F, W, (x) => x.fs + x.us <= 4));
  add('p25', odds.p25, stat(F, W, (x) => !(x.fs === 3 && x.us === 0)));

  // 원정 승은 추천에서 제외 (원하면 아래 필터에서 key !== 'away' 조건 삭제)
  const recommended = bets
    .filter((b) => b.ev > 0 && b.eligible && b.key !== 'away')
    .sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / a - 1, marketN: mk.rows.length,
    bets, recommended, leastLoss,
  };
}

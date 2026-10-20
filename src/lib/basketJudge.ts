import { strengthOf } from './judgeScore';
import { seasonWeigher, weightedMean, weightedStat } from './seasonWeight';

// [홈배당, 원정배당, 홈점수, 원정점수, 시즌(끝나는 해, 선택)] — 시즌이 있으면 최근 시즌일수록 가중치를 크게 (seasonWeight.ts)
export type Game = [number, number, number, number, number?];

export type BetKey = 'home' | 'away' | 'mh' | 'ph';

export interface Odds {
  home: number | null; // 홈 승 배당
  away: number | null; // 원정 승 배당
  line: number | null; // 기준점 (정배 기준, 양수. 예: 5.5 → 정배 -5.5 / 역배 +5.5)
  mh: number | null; // 정배 -기준점 마핸 배당
  ph: number | null; // 역배 +기준점 플핸 배당
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
}

export interface JudgeOutput {
  fav: number;
  favIsHome: boolean;
  margin: number; // 승패 배당 마진
  marketN: number; // 핸디캡 표본 경기 수
  expMargin: number; // 표본에서 정배 평균 점수차
  bets: BetResult[];
  recommended: BetResult[]; // EV>0 & eligible, EV 내림차순
  leastLoss: BetResult | null; // 전부 마이너스일 때 가장 덜 잃는 쪽
}

const NAMES: Record<BetKey, string> = {
  home: '홈 승', away: '원정 승', mh: '마핸 (정배 -)', ph: '플핸 (역배 +)',
};

// 기준 배당 x 주변 로그 창을 넓혀가며 최소 n 경기 확보
function pick<T>(games: T[], getX: (g: T) => number, x: number, minN: number): T[] {
  let w = 0.02;
  let rows: T[] = [];
  while (w <= 0.4) {
    rows = games.filter((g) => Math.abs(Math.log(getX(g) / x)) <= w);
    if (rows.length >= minN) break;
    w += 0.01;
  }
  return rows;
}



export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  minMarketN: number; // 표본 최소 경기 수 (정배 배당 + 정배 홈/원정이 같은 경기 — 승패·핸디캡 모두 이 표본)
}

// 판정에 쓸 수 없는 경기 제외: 동점(0:0 등 취소·미진행), 배당 1.00 이하(빈 값), 두 배당 마진이 마이너스(배당 기록 오류)
export function cleanGames(games: Game[]): Game[] {
  return games.filter(([h, a, hs, as]) => hs !== as && h > 1 && a > 1 && 1 / h + 1 / a >= 1);
}

export function createJudge(rawGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = cleanGames(rawGames);
  const weight = seasonWeigher(games);
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 2.5, minMarketN: 200, ...base };
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(games, weight, odds, { ...defaults, ...o });
}

function judgeWith(games: Game[], weight: (g: Game) => number, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, away: a } = odds;
  if (!h || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 핸디캡 표본: 정배 배당이 비슷하고, 정배가 같은 쪽(홈/원정)인 경기 → 정배 기준 점수차
  const same = games.filter((g) => (g[0] <= g[1]) === favIsHome);
  const mk = pick(same, (g) => Math.min(g[0], g[1]), fav, opts.minMarketN);
  // 정배 기준 점수차 + 그 경기의 시즌 가중치 (최근 시즌일수록 크게)
  const FM = mk.map((g) => ({ m: g[0] <= g[1] ? g[2] - g[3] : g[3] - g[2], w: weight(g) }));
  const W = (r: { w: number }) => r.w;
  const stat3 = (res: (m: number) => 1 | 0 | -1) => weightedStat(FM, W, (r) => res(r.m));
  const expMargin = weightedMean(FM, W, (r) => r.m);

  const bets: BetResult[] = [];
  const add = (key: BetKey, site: number | null, s: { n: number; pw: number; pp: number; se: number }) => {
    // 표본이 없거나 한 번도 안 맞았으면 손익분기가 무한대가 되므로 판정하지 않는다
    if (!site || !s.n || !s.pw) return;
    const pl = 1 - s.pw - s.pp;
    const be = (s.pw + pl) / s.pw; // 적특 제외 손익분기: pw*(o-1) = pl
    const ev = s.pw * (site - 1) - pl;
    const st = strengthOf(ev, site * s.se);
    bets.push({
      key, name: NAMES[key], site, hit: s.pw, push: s.pp, se: s.se, be, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n,
      eligible: site >= opts.minOdds && site < opts.maxOdds,
    });
  };

  // 홈 승/원정 승도 핸디캡과 같은 표본(FM)으로 본다 — 표본이 다르면 역배 +1.5(= 역배 승 + 1점차 패)가
  // 역배 승보다 몇 %씩 더 잘 맞는 것처럼 나와서, 일반승이 나은 경기에도 플핸을 추천하는 문제가 있었다
  const favRes = (m: number): 1 | -1 => (m > 0 ? 1 : -1);
  const dogRes = (m: number): 1 | -1 => (m < 0 ? 1 : -1);
  add('home', odds.home, stat3(favIsHome ? favRes : dogRes));
  add('away', odds.away, stat3(favIsHome ? dogRes : favRes));

  const L = odds.line;
  if (L != null && L >= 0) {
    add('mh', odds.mh, stat3((m) => (m > L ? 1 : m === L ? 0 : -1)));
    add('ph', odds.ph, stat3((m) => (m < L ? 1 : m === L ? 0 : -1)));
  }

  const recommended = bets.filter((b) => b.ev > 0 && b.eligible).sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / a - 1, marketN: mk.length, expMargin,
    bets, recommended, leastLoss,
  };
}

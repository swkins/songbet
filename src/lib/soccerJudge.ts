import { strengthOf } from './judgeScore';
import { recentSeasons, seasonWeigher, weightedMean, weightedStat } from './seasonWeight';

// [홈배당, 원정배당, 홈골, 원정골, 시즌(끝나는 해), 무배당] — 앞 5칸은 배구·농구와 같은 순서라 시즌 가중치(seasonWeight.ts)를 그대로 쓴다
export type Game = [number, number, number, number, number, number];

export type BetKey = 'home' | 'draw' | 'away' | 'h05' | 'a05' | 'h15' | 'a15' | 'h25' | 'a25' | 'o25';

export interface Odds {
  home: number | null; // 홈 승
  draw: number | null; // 무
  away: number | null; // 원정 승
  h05: number | null; a05: number | null; // 홈/원정 핸디캡 0.5 (정배 쪽은 -0.5, 역배 쪽은 +0.5)
  h15: number | null; a15: number | null; // 1.5
  h25: number | null; a25: number | null; // 2.5
  o25: number | null; // 2.5 오버
}

export interface BetResult {
  key: BetKey;
  name: string;
  site: number;
  hit: number; // 과거 적중률
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
  margin: number; // 승무패 배당 마진
  marketN: number; // 비교 경기 수
  expMargin: number; // 비교 경기 정배 평균 골차
  bets: BetResult[];
  recommended: BetResult[]; // EV>0 & eligible, 강도 내림차순
  leastLoss: BetResult | null; // 전부 마이너스일 때 가장 덜 잃는 쪽
  rule: { text: string; keys: BetKey[] }; // 내 룰북 기준 이 경기에서 할 베팅
}

const LINES = { '05': 0.5, '15': 1.5, '25': 2.5 } as const;

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

// 내 룰북 (정배 배당 기준). 1.60~1.68 · 2.20 이상 · 1.10 미만은 룰 없음
//  1.10~1.29 역배 +2.5 / 1.30~1.59 정배 승 / 1.69~1.89 역배 +1.5 / 1.90~2.19 역배 +0.5 · 정배 1.01~1.39면 2.5 오버도
export function ruleFor(fav: number, favIsHome: boolean): { text: string; keys: BetKey[] } {
  const dog = favIsHome ? 'a' : 'h';
  const parts: string[] = [];
  const keys: BetKey[] = [];
  const f = Math.round(fav * 100);
  if (f >= 110 && f <= 129) { parts.push('역배 +2.5'); keys.push(`${dog}25` as BetKey); }
  else if (f >= 130 && f <= 159) { parts.push('정배 승'); keys.push(favIsHome ? 'home' : 'away'); }
  else if (f >= 169 && f <= 189) { parts.push('역배 +1.5'); keys.push(`${dog}15` as BetKey); }
  else if (f >= 190 && f <= 219) { parts.push('역배 +0.5'); keys.push(`${dog}05` as BetKey); }
  if (f >= 101 && f <= 139) { parts.push('2.5 오버'); keys.push('o25'); }
  return { text: parts.length ? parts.join(' + ') : '해당 룰 없음', keys };
}

export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  minMarketN: number; // 비교 경기 최소 수 (정배 배당이 비슷한 경기)
}

// 판정에 쓸 수 없는 경기 제외: 배당 1.00 이하(빈 값)
export function cleanGames(games: Game[]): Game[] {
  return games.filter(([h, a, , , , d]) => h > 1 && a > 1 && d > 1);
}

export function createJudge(rawGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(cleanGames(rawGames)); // 최근 5시즌만
  const weight = seasonWeigher(games);
  const defaults: JudgeOptions = { minOdds: 1.1, maxOdds: 3.0, minMarketN: 150, ...base };
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(games, weight, odds, { ...defaults, ...o });
}

function judgeWith(games: Game[], weight: (g: Game) => number, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, draw: d, away: a } = odds;
  if (!h || !d || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 비교 경기: 정배 배당이 비슷한 경기 → 정배 기준 골차(m)와 총골(t)
  // 축구는 홈/원정 정배를 나누면 강정배 구간 원정정배 표본이 너무 적어서(리그당 수십 경기) 정배 배당만으로 고른다
  const mk = pick(games, (g) => Math.min(g[0], g[1]), fav, opts.minMarketN);
  const F = mk.map((g) => ({ m: g[0] <= g[1] ? g[2] - g[3] : g[3] - g[2], t: g[2] + g[3], w: weight(g) }));
  const W = (r: { w: number }) => r.w;
  type R = (typeof F)[number];
  const stat = (test: (r: R) => boolean) => weightedStat(F, W, (r) => (test(r) ? 1 : -1));
  const expMargin = weightedMean(F, W, (r) => r.m);

  const bets: BetResult[] = [];
  const add = (key: BetKey, name: string, site: number | null, test: (r: R) => boolean) => {
    if (!site) return; // 안 넣은 배당은 판정하지 않는다
    const s = stat(test);
    // 표본이 없거나 한 번도 안 맞았으면 손익분기(1/적중률)가 무한대가 되므로 판정하지 않는다
    if (!s.n || !s.pw) return;
    const ev = site * s.pw - 1;
    const st = strengthOf(ev, site * s.se);
    bets.push({
      key, name, site, hit: s.pw, se: s.se, be: 1 / s.pw, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n,
      eligible: site >= opts.minOdds && site < opts.maxOdds,
    });
  };

  // 정배 승 = m > 0, 역배 승 = m < 0
  add('home', '홈 승', h, (r) => (favIsHome ? r.m > 0 : r.m < 0));
  add('draw', '무', d, (r) => r.m === 0);
  add('away', '원정 승', a, (r) => (favIsHome ? r.m < 0 : r.m > 0));
  // 핸디캡 (반 골 기준점이라 적특 없음): 정배 -L은 L골차 넘게 이기면, 역배 +L은 정배가 L골차 미만이면 적중
  for (const [sfx, L] of Object.entries(LINES)) {
    for (const side of ['h', 'a'] as const) {
      const isFav = (side === 'h') === favIsHome;
      const name = `${side === 'h' ? '홈' : '원정'} ${isFav ? '마핸 -' : '플핸 +'}${L}`;
      add(`${side}${sfx}` as BetKey, name, odds[`${side}${sfx}` as BetKey], (r) => (isFav ? r.m > L : r.m < L));
    }
  }
  add('o25', '2.5 오버', odds.o25, (r) => r.t > 2.5);

  const recommended = bets.filter((b) => b.ev > 0 && b.eligible).sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / d + 1 / a - 1, marketN: mk.length, expMargin,
    bets, recommended, leastLoss, rule: ruleFor(fav, favIsHome),
  };
}

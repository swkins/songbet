import { betStrength } from './judgeScore';
import { recentSeasons, seasonWeigher, weightedMean, weightedStat } from './seasonWeight';

// [홈배당, 원정배당, 홈골, 원정골, 시즌(끝나는 해), 무배당] — 앞 5칸은 배구·농구와 같은 순서라 시즌 가중치(seasonWeight.ts)를 그대로 쓴다
export type Game = [number, number, number, number, number, number];

export type BetKey = 'home' | 'draw' | 'away' | 'h05' | 'a05' | 'h15' | 'a15' | 'h25' | 'a25' | 'o25' | 'u25' | 'o35' | 'u35';

export interface Odds {
  home: number | null; // 홈 승
  draw: number | null; // 무
  away: number | null; // 원정 승
  h05: number | null; a05: number | null; // 홈/원정 핸디캡 0.5 (정배 쪽은 -0.5, 역배 쪽은 +0.5)
  h15: number | null; a15: number | null; // 1.5
  h25: number | null; a25: number | null; // 2.5
  o25: number | null; u25: number | null; // 2.5 오버 / 언더
  o35: number | null; u35: number | null; // 3.5 오버 / 언더
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
  rule: { text: string; keys: BetKey[]; min: Partial<Record<BetKey, number>> }; // 내 룰북 기준 이 경기에서 할 베팅 · min = 이 배당 이상일 때만
}

const LINES = { '05': 0.5, '15': 1.5, '25': 2.5 } as const;

// 승무패 세 배당 → 마진을 뺀 [정배, 무, 역배] 확률 (사이트마다 다른 마진을 걷어내고 비교)
function probs(home: number, draw: number, away: number): [number, number, number] {
  const fav = Math.min(home, away), dog = Math.max(home, away);
  const s = 1 / fav + 1 / draw + 1 / dog;
  return [1 / fav / s, 1 / draw / s, 1 / dog / s];
}

const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
};

// 2.5 오버 룰 조건: 정배 1.01~1.39 & 무 5.5 이상 (강정배인데 무배당이 낮으면 시장이 저득점을 본다는 뜻 — 적중률이 61%로 떨어지고 시즌별로도 흔들렸다)
const isOverRule = (fav: number, draw: number) => Math.round(fav * 100) >= 101 && Math.round(fav * 100) <= 139 && draw >= 5.5;

// 2.5 오버 룰 기준 배당 = 그 리그 과거 같은 조건 경기의 손익분기 × 1.05 (5% 여유). 시즌 가중 적중률로 계산해서 새 시즌을 넣으면 같이 바뀐다
export function overRuleMin(rawGames: Game[]): number | undefined {
  const games = recentSeasons(cleanGames(rawGames));
  const weight = seasonWeigher(games);
  const s = weightedStat(games.filter((g) => isOverRule(Math.min(g[0], g[1]), g[5])), weight, (g) => (g[2] + g[3] > 2.5 ? 1 : -1));
  return s.pw ? Math.ceil((1.05 / s.pw) * 100) / 100 : undefined;
}

// 내 룰북 (정배 배당 기준). 1.60~1.68 · 2.20 이상 · 1.10 미만은 룰 없음
//  1.10~1.29 역배 +2.5 / 1.30~1.59 정배 승 / 1.69~1.89 역배 +1.5 / 1.90~2.19 역배 +0.5 · 정배 1.01~1.39 & 무 5.5 이상이면 2.5 오버도 (overMin 배당 이상일 때만)
export function ruleFor(fav: number, favIsHome: boolean, draw: number, overMin?: number): JudgeOutput['rule'] {
  const dog = favIsHome ? 'a' : 'h';
  const parts: string[] = [];
  const keys: BetKey[] = [];
  const min: JudgeOutput['rule']['min'] = {};
  const f = Math.round(fav * 100);
  if (f >= 110 && f <= 129) { parts.push('역배 +2.5'); keys.push(`${dog}25` as BetKey); }
  else if (f >= 130 && f <= 159) { parts.push('정배 승'); keys.push(favIsHome ? 'home' : 'away'); }
  else if (f >= 169 && f <= 189) { parts.push('역배 +1.5'); keys.push(`${dog}15` as BetKey); }
  else if (f >= 190 && f <= 219) { parts.push('역배 +0.5'); keys.push(`${dog}05` as BetKey); }
  if (isOverRule(fav, draw)) {
    parts.push(overMin ? `2.5 오버 ${overMin.toFixed(2)}↑` : '2.5 오버'); keys.push('o25');
    if (overMin) min.o25 = overMin;
  }
  return { text: parts.length ? parts.join(' + ') : '해당 룰 없음', keys, min };
}

export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  sampleN: number; // 비교 경기 수 (세 배당이 가장 비슷한 경기)
  overMin?: number; // 2.5 오버 룰 기준 배당 (리그별, overRuleMin)
}

// 판정에 쓸 수 없는 경기 제외: 배당 1.00 이하(빈 값)
export function cleanGames(games: Game[]): Game[] {
  return games.filter(([h, a, , , , d]) => h > 1 && a > 1 && d > 1);
}

// 비교 경기는 그 리그 과거 경기 중 승무패 세 배당(마진 뺀 확률)이 가장 비슷한 경기 sampleN개 — 리그마다 자기 데이터로만 판정한다.
// 정배 배당만 보면 같은 정배 1.75라도 저득점·무승부 경기(무배당 낮음)와 다득점 경기(무배당 높음)가 섞여서
// 핸디·언더오버 판정이 크게 틀렸다 — 지난 시즌 백테스트로 세 배당 방식이 모든 베팅 종류에서 더 잘 맞았다.
export function createJudge(rawGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(cleanGames(rawGames)); // 최근 5시즌만
  const weight = seasonWeigher(games);
  const P = games.map((g) => probs(g[0], g[5], g[1]));
  const sd = [0, 1, 2].map((i) => std(P.map((p) => p[i]))); // 세 확률을 같은 눈금으로 맞춰 거리 계산
  const rows = games.map((g, i) => ({ g, p: P[i], w: weight(g) }));
  const defaults: JudgeOptions = { minOdds: 1.1, maxOdds: 3.0, sampleN: 200, ...base };
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(rows, sd, odds, { ...defaults, ...o });
}

type Row = { g: Game; p: [number, number, number]; w: number };

function judgeWith(rows: Row[], sd: number[], odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, draw: d, away: a } = odds;
  if (!h || !d || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 비교 경기: 세 배당이 가장 비슷한 경기 → 정배 기준 골차(m)와 총골(t)
  const q = probs(h, d, a);
  const dist = (p: number[]) => Math.hypot((p[0] - q[0]) / sd[0], (p[1] - q[1]) / sd[1], (p[2] - q[2]) / sd[2]);
  const mk = rows.map((r) => ({ r, k: dist(r.p) })).sort((x, y) => x.k - y.k).slice(0, opts.sampleN).map((x) => x.r);
  const F = mk.map(({ g, p, w }) => ({ m: g[0] <= g[1] ? g[2] - g[3] : g[3] - g[2], t: g[2] + g[3], p, w }));
  const W = (r: { w: number }) => r.w;
  type R = (typeof F)[number];
  const stat = (test: (r: R) => boolean) => weightedStat(F, W, (r) => (test(r) ? 1 : -1));
  const expMargin = weightedMean(F, W, (r) => r.m);

  const bets: BetResult[] = [];
  // market: 승무패 배당으로 시장 확률을 알 수 있는 베팅(승무패, ±0.5)은 [정배, 무, 역배] 중 어느 확률의 합인지.
  // 이런 베팅은 "이 경기 시장 확률 + 비교 경기에서 실제가 시장보다 얼마나 더/덜 나왔나"로 적중률을 잡는다.
  // 비교 경기 비율을 그대로 쓰면 정배 1.09처럼 과거에 드문 경기는 비교 경기가 더 약한 정배(1.3대)까지 넓어져서
  // 무·역배 확률을 크게 부풀렸다 (EPL 정배 1.15 미만: 판정기 무 14.5% vs 시장 9% vs 실제 0%) — 시즌 하나씩 빼고 검증해 전체 정확도도 같거나 나았다
  const add = (key: BetKey, name: string, site: number | null, test: (r: R) => boolean, market?: [number, number, number]) => {
    if (!site) return; // 안 넣은 배당은 판정하지 않는다
    let s = stat(test);
    if (market && s.n) {
      const mp = (p: number[]) => market[0] * p[0] + market[1] * p[1] + market[2] * p[2];
      const pw = Math.min(0.995, Math.max(0.005, mp(q) + weightedMean(F, W, (r) => (test(r) ? 1 : 0) - mp(r.p))));
      s = { ...s, pw, se: s.se && s.pw * (1 - s.pw) ? s.se * Math.sqrt((pw * (1 - pw)) / (s.pw * (1 - s.pw))) : s.se };
    }
    // 표본이 없거나 한 번도 안 맞았으면 손익분기(1/적중률)가 무한대가 되므로 판정하지 않는다
    if (!s.n || !s.pw) return;
    const ev = site * s.pw - 1;
    const eligible = site >= opts.minOdds && site < opts.maxOdds;
    // 추천 배당범위 밖(고배당·초저배당은 과거 데이터가 적어 숫자를 못 믿음)이거나 적중률 50% 미만이면 강도 0
    const st = betStrength(ev, site * s.se, s.pw, eligible);
    bets.push({
      key, name, site, hit: s.pw, se: s.se, be: 1 / s.pw, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n, eligible,
    });
  };

  // 정배 승 = m > 0, 역배 승 = m < 0 (시장 확률 [정배, 무, 역배] 기준)
  const FAV: [number, number, number] = [1, 0, 0], DRAW: [number, number, number] = [0, 1, 0], DOG: [number, number, number] = [0, 0, 1];
  add('home', '홈 승', h, (r) => (favIsHome ? r.m > 0 : r.m < 0), favIsHome ? FAV : DOG);
  add('draw', '무', d, (r) => r.m === 0, DRAW);
  add('away', '원정 승', a, (r) => (favIsHome ? r.m < 0 : r.m > 0), favIsHome ? DOG : FAV);
  // 핸디캡 (반 골 기준점이라 적특 없음): 정배 -L은 L골차 넘게 이기면, 역배 +L은 정배가 L골차 미만이면 적중
  // ±0.5는 승무패와 같은 결과라 시장 확률 기준 (정배 -0.5 = 정배 승, 역배 +0.5 = 무 + 역배 승)
  for (const [sfx, L] of Object.entries(LINES)) {
    for (const side of ['h', 'a'] as const) {
      const isFav = (side === 'h') === favIsHome;
      const name = `${side === 'h' ? '홈' : '원정'} ${isFav ? '마핸 -' : '플핸 +'}${L}`;
      const market: [number, number, number] | undefined = L === 0.5 ? (isFav ? FAV : [0, 1, 1]) : undefined;
      add(`${side}${sfx}` as BetKey, name, odds[`${side}${sfx}` as BetKey], (r) => (isFav ? r.m > L : r.m < L), market);
    }
  }
  add('o25', '2.5 오버', odds.o25, (r) => r.t > 2.5);
  add('u25', '2.5 언더', odds.u25, (r) => r.t < 2.5);
  add('o35', '3.5 오버', odds.o35, (r) => r.t > 3.5);
  add('u35', '3.5 언더', odds.u35, (r) => r.t < 3.5);

  const recommended = bets.filter((b) => b.ev > 0 && b.strength > 0).sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / d + 1 / a - 1, marketN: mk.length, expMargin,
    bets, recommended, leastLoss, rule: ruleFor(fav, favIsHome, d, opts.overMin),
  };
}

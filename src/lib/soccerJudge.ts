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
  check?: { n: number; hit: number; roi: number; seasons: number; seasonsUp: number }; // 같은 배당대 과거 실적 (승무패·정배 -0.5 — 이 리그에서 그 결과의 배당이 비슷했던 경기들의 실제 적중률·수익률)
}

export interface JudgeOutput {
  fav: number;
  favIsHome: boolean;
  minusHome: boolean; // 핸디캡 마이너스 쪽이 홈인지 (0.5 핸디 배당으로 사이트 기준을 알아낸다)
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
// 홈정배 / 원정정배 따로 계산한다 (예: EPL 홈정배 70% → 1.51, 원정정배 53% → 2.00). 같은 조건 경기가 10경기 미만이면 기준 없음
export type OverMin = { home?: number; away?: number };
export function overRuleMin(rawGames: Game[]): OverMin {
  const games = recentSeasons(cleanGames(rawGames));
  const weight = seasonWeigher(games);
  const min = (favHome: boolean) => {
    const rows = games.filter((g) => (g[0] <= g[1]) === favHome && isOverRule(Math.min(g[0], g[1]), g[5]));
    const s = weightedStat(rows, weight, (g) => (g[2] + g[3] > 2.5 ? 1 : -1));
    return rows.length >= 10 && s.pw ? Math.ceil((1.05 / s.pw) * 100) / 100 : undefined;
  };
  return { home: min(true), away: min(false) };
}

// 3.5 오버 룰 조건: 홈정배 & 정배 1.01~1.29 & 무 minDraw 이상 (분데스리가 5.5, 나머지 7.5) — 리그별·홈원정별로 보니 이 조건에서만 3.5 오버가 꾸준했다
// (분데스 홈정배 57~62%, EPL 52%, 챔스 56%. 라리가는 해당 조건이 거의 없음)
const isOver35Rule = (fav: number, favIsHome: boolean, draw: number, minDraw: number) =>
  favIsHome && Math.round(fav * 100) >= 101 && Math.round(fav * 100) <= 129 && draw >= minDraw;

// 3.5 오버 룰 기준 배당 = 그 리그 홈정배 같은 조건 경기의 손익분기 × 1.05. 10경기 미만이면 기준 없음
export function over35RuleMin(rawGames: Game[], minDraw: number): number | undefined {
  const games = recentSeasons(cleanGames(rawGames));
  const weight = seasonWeigher(games);
  const rows = games.filter((g) => isOver35Rule(Math.min(g[0], g[1]), g[0] <= g[1], g[5], minDraw));
  const s = weightedStat(rows, weight, (g) => (g[2] + g[3] > 3.5 ? 1 : -1));
  return rows.length >= 10 && s.pw ? Math.ceil((1.05 / s.pw) * 100) / 100 : undefined;
}

// 내 룰북 (정배 배당 기준). 1.60~1.68 · 2.20 이상 · 1.10 미만은 룰 없음
//  1.10~1.29 역배 +2.5 / 1.30~1.59 정배 승 / 1.69~1.89 역배 +1.5 / 1.90~2.19 역배 +0.5 · 정배 1.01~1.39 & 무 5.5 이상이면 2.5 오버도 (overMin 배당 이상일 때만)
// minusHome: 사이트가 핸디 마이너스를 준 쪽 — 룰의 '역배 +핸디'는 플러스를 받은 쪽에 건다 (보통 승무패 역배와 같다)
export function ruleFor(fav: number, favIsHome: boolean, draw: number, overMin?: number, o35?: { minDraw: number; min?: number }, minusHome = favIsHome): JudgeOutput['rule'] {
  const dog = minusHome ? 'a' : 'h';
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
  if (o35 && isOver35Rule(fav, favIsHome, draw, o35.minDraw)) {
    parts.push(o35.min ? `3.5 오버 ${o35.min.toFixed(2)}↑` : '3.5 오버'); keys.push('o35');
    if (o35.min) min.o35 = o35.min;
  }
  return { text: parts.length ? parts.join(' + ') : '해당 룰 없음', keys, min };
}

export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  sampleN: number; // 비교 경기 수 (세 배당이 가장 비슷한 경기)
  overMin?: OverMin; // 2.5 오버 룰 기준 배당 (리그별 · 홈정배/원정정배 따로, overRuleMin)
  winSeasonShare: number; // 승 베팅: 같은 배당대 과거 실적이 플러스였던 시즌 비율이 이 이상이어야 추천 (0.6)
  // 홈 승·원정 승(·같은 결과인 -0.5) 추천 상한 배당 (미만, 1.75) — 정배 승 1.90부터는 4개 리그 거의 모두 적중률 50% 밑이고,
  // 3시즌 백테스트(이전 시즌으로만 판정)에서 상한 1.90은 152건 +2.3%(EPL 77건 -10.9%), 1.75는 83건 +12.8%(EPL 26건 +3.6%)였다.
  // 시즌 일관성 0.6을 더하면 67건 +8.0% — 둘 다 오차 ±15~17%라 확정은 아니지만 엉뚱한 추천이 크게 줄어 보수적으로 1.75 + 0.6
  winMaxOdds: number;
  over35Draw?: number; // 3.5 오버 룰 무배당 하한 (기본 7.5, 분데스리가 5.5)
  over35Min?: number; // 3.5 오버 룰 기준 배당 (over35RuleMin)
}

// 승무패 적중률을 시장 확률에서 얼마나 벗어나게 볼지 줄이는 정도 — 비교 경기에서 나온 "시장보다 더/덜 나온 차이"에
// 유효 경기 수 / (유효 경기 수 + SHRINK_K)를 곱한다. 표본이 작을수록 시장 확률 쪽으로 붙는다
// (챔스 홈 2.42: 비교 경기 80개가 우연히 시장보다 14%p 더 이겨서 +28.5% 최강이 나왔다. 백테스트에서 200이 가장 나았다)
const SHRINK_K = 200;

// 같은 배당대 과거 실적: 이 리그에서 그 결과(홈 승/무/원정 승)의 배당이 비슷했던 경기들 — 로그 창을 넓혀가며 60경기 이상
// 이 실적의 수익률이 0 이하면 판정기 기대수익이 플러스여도 강도 0 ('배당대 실적 미달')
type OutcomeKind = 'home' | 'draw' | 'away';
function oddsHistory(games: Game[], weight: (g: Game) => number) {
  const hist = games.map((g) => ({ odds: { home: g[0], draw: g[5], away: g[1] }, won: { home: g[2] > g[3], draw: g[2] === g[3], away: g[3] > g[2] }, w: weight(g), season: g[4] }));
  return (kind: OutcomeKind, site: number) => {
    let bw = 0.03;
    let rows = hist;
    while (bw <= 0.3) {
      rows = hist.filter((h) => Math.abs(Math.log(h.odds[kind] / site)) <= bw);
      if (rows.length >= 60) break;
      bw += 0.01;
    }
    if (!rows.length) return undefined;
    const sw = rows.reduce((a, h) => a + h.w, 0);
    const hit = rows.reduce((a, h) => a + (h.won[kind] ? h.w : 0), 0) / sw;
    const roi = rows.reduce((a, h) => a + h.w * (h.won[kind] ? h.odds[kind] - 1 : -1), 0) / sw;
    // 시즌별 일관성: 5경기 이상 있는 시즌 중 수익률이 플러스였던 시즌 수
    const bySeason = new Map<number, number[]>();
    for (const h of rows) { const x = bySeason.get(h.season) ?? []; x.push(h.won[kind] ? h.odds[kind] - 1 : -1); bySeason.set(h.season, x); }
    const counted = [...bySeason.values()].filter((x) => x.length >= 5);
    const seasonsUp = counted.filter((x) => x.reduce((a, b) => a + b, 0) > 0).length;
    return { n: rows.length, hit, roi, seasons: counted.length, seasonsUp };
  };
}

// 판정에 쓸 수 없는 경기 제외: 배당 1.00 이하(빈 값)
export function cleanGames(games: Game[]): Game[] {
  return games.filter(([h, a, , , , d]) => h > 1 && a > 1 && d > 1);
}

// 비교 경기는 그 리그 과거 경기 중 정배가 같은 쪽(홈정배 / 원정정배)인 경기에서 승무패 세 배당(마진 뺀 확률)이 가장 비슷한 경기 sampleN개
// — 리그마다 자기 데이터로만, 홈정배와 원정정배도 따로 판정한다 (사용자 요청: 원정정배는 표본이 작아도 홈정배와 섞지 않는다).
// 정배 배당만 보면 같은 정배 1.75라도 저득점·무승부 경기(무배당 낮음)와 다득점 경기(무배당 높음)가 섞여서
// 핸디·언더오버 판정이 크게 틀렸다 — 지난 시즌 백테스트로 세 배당 방식이 모든 베팅 종류에서 더 잘 맞았다.
export function createJudge(rawGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(cleanGames(rawGames)); // 최근 5시즌만
  const weight = seasonWeigher(games);
  const P = games.map((g) => probs(g[0], g[5], g[1]));
  const sd = [0, 1, 2].map((i) => std(P.map((p) => p[i]))); // 세 확률을 같은 눈금으로 맞춰 거리 계산
  const rows = games.map((g, i) => ({ g, p: P[i], w: weight(g), favHome: g[0] <= g[1] }));
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 3.0, winMaxOdds: 1.75, winSeasonShare: 0.6, sampleN: 200, ...base };
  const check = oddsHistory(games, weight);
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(rows, sd, check, odds, { ...defaults, ...o });
}

type Row = { g: Game; p: [number, number, number]; w: number; favHome: boolean };

function judgeWith(rows: Row[], sd: number[], oddsCheck: ReturnType<typeof oddsHistory>, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, draw: d, away: a } = odds;
  if (!h || !d || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 비교 경기: 정배가 같은 쪽(홈/원정)인 경기 중 세 배당이 가장 비슷한 경기 → 정배 기준 골차(m)와 총골(t)
  const q = probs(h, d, a);
  const dist = (p: number[]) => Math.hypot((p[0] - q[0]) / sd[0], (p[1] - q[1]) / sd[1], (p[2] - q[2]) / sd[2]);
  const mk = rows.filter((r) => r.favHome === favIsHome).map((r) => ({ r, k: dist(r.p) })).sort((x, y) => x.k - y.k).slice(0, opts.sampleN).map((x) => x.r);
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
  const sw = F.reduce((a, r) => a + r.w, 0), sw2 = F.reduce((a, r) => a + r.w * r.w, 0);
  const shrink = sw ? (sw * sw) / sw2 / ((sw * sw) / sw2 + SHRINK_K) : 0;
  const add = (key: BetKey, name: string, site: number | null, test: (r: R) => boolean, market?: [number, number, number], checkKind?: OutcomeKind) => {
    if (!site) return; // 안 넣은 배당은 판정하지 않는다
    let s = stat(test);
    if (market && s.n) {
      const mp = (p: number[]) => market[0] * p[0] + market[1] * p[1] + market[2] * p[2];
      const pw = Math.min(0.995, Math.max(0.005, mp(q) + shrink * weightedMean(F, W, (r) => (test(r) ? 1 : 0) - mp(r.p))));
      s = { ...s, pw, se: s.se && s.pw * (1 - s.pw) ? s.se * Math.sqrt((pw * (1 - pw)) / (s.pw * (1 - s.pw))) : s.se };
    }
    // 표본이 없거나 한 번도 안 맞았으면 손익분기(1/적중률)가 무한대가 되므로 판정하지 않는다
    if (!s.n || !s.pw) return;
    const ev = site * s.pw - 1;
    // 승 베팅(홈 승·원정 승·-0.5)은 winMaxOdds(1.75) 미만까지만 추천 범위
    const eligible = site >= opts.minOdds && site < (checkKind && checkKind !== 'draw' ? opts.winMaxOdds : opts.maxOdds);
    // 추천 배당범위 밖(고배당·초저배당은 과거 데이터가 적어 숫자를 못 믿음)이거나 적중률 50% 미만이면 강도 0
    let st = betStrength(ev, site * s.se, s.pw, eligible);
    const check = checkKind ? oddsCheck(checkKind, site) : undefined;
    if (st.v > 0 && check && check.roi <= 0) st = { label: '배당대 실적 미달', v: 0 };
    const isWin = checkKind === 'home' || checkKind === 'away';
    if (st.v > 0 && isWin && check && check.seasons && check.seasonsUp / check.seasons < opts.winSeasonShare) st = { label: '시즌 일관성 부족', v: 0 };
    bets.push({
      key, name, site, hit: s.pw, se: s.se, be: 1 / s.pw, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n, eligible, check,
    });
  };

  // 정배 승 = m > 0, 역배 승 = m < 0 (시장 확률 [정배, 무, 역배] 기준)
  const FAV: [number, number, number] = [1, 0, 0], DRAW: [number, number, number] = [0, 1, 0], DOG: [number, number, number] = [0, 0, 1];
  add('home', '홈 승', h, (r) => (favIsHome ? r.m > 0 : r.m < 0), favIsHome ? FAV : DOG, 'home');
  add('draw', '무', d, (r) => r.m === 0, DRAW, 'draw');
  add('away', '원정 승', a, (r) => (favIsHome ? r.m < 0 : r.m > 0), favIsHome ? DOG : FAV, 'away');
  // 핸디캡 (반 골 기준점이라 적특 없음): -L은 그 팀이 L골차 넘게 이기면, +L은 그 팀이 L골차 넘게 지지 않으면 적중.
  // 어느 쪽이 마이너스인지는 사이트가 정한다 — 승무패가 거의 같은 경기(홈 2.42 / 원정 2.44)에서 사이트는 원정에 -0.5를 줬는데
  // 판정기가 승무패 배당만 보고 홈을 -0.5로 계산해 플핸·마핸이 뒤집혔다. 0.5 핸디 배당이 있으면 그 배당이 홈 승 쪽(-0.5)과
  // 홈 승+무 쪽(+0.5) 중 어느 시장 배당에 가까운지로 마이너스 쪽을 정하고, 없으면 승무패 정배 쪽을 마이너스로 본다.
  // hm = 홈 기준 골차 (비교 경기도 이번 경기와 정배 쪽이 같아서 정배 기준 골차를 그대로 홈 기준으로 바꿀 수 있다)
  const hm = (r: R) => (favIsHome ? r.m : -r.m);
  const pHome = favIsHome ? q[0] : q[2], pAway = favIsHome ? q[2] : q[0];
  const nearer = (x: number, minus: number, plus: number) => Math.abs(Math.log(x / minus)) <= Math.abs(Math.log(x / plus));
  const minusHome = odds.h05 ? nearer(odds.h05, 1 / pHome, 1 / (1 - pAway))
    : odds.a05 ? !nearer(odds.a05, 1 / pAway, 1 / (1 - pHome))
    : favIsHome;
  const HOME_WIN: [number, number, number] = favIsHome ? FAV : DOG, AWAY_WIN: [number, number, number] = favIsHome ? DOG : FAV;
  for (const [sfx, L] of Object.entries(LINES)) {
    for (const side of ['h', 'a'] as const) {
      const isMinus = (side === 'h') === minusHome;
      const name = `${side === 'h' ? '홈' : '원정'} ${isMinus ? '마핸 -' : '플핸 +'}${L}`;
      const sideMargin = (r: R) => (side === 'h' ? hm(r) : -hm(r)); // 이 팀 기준 골차
      // ±0.5는 승무패와 같은 결과라 시장 확률 기준 (-0.5 = 그 팀 승, +0.5 = 그 팀 승 또는 무 = 상대 승이 아님)
      const win = side === 'h' ? HOME_WIN : AWAY_WIN, oppWin = side === 'h' ? AWAY_WIN : HOME_WIN;
      const market: [number, number, number] | undefined = L === 0.5 ? (isMinus ? win : (oppWin.map((v) => 1 - v) as [number, number, number])) : undefined;
      // -0.5는 그 팀 승과 같은 결과라 그 쪽 승 배당의 같은 배당대 실적도 확인한다
      const checkKind: OutcomeKind | undefined = L === 0.5 && isMinus ? (side === 'h' ? 'home' : 'away') : undefined;
      add(`${side}${sfx}` as BetKey, name, odds[`${side}${sfx}` as BetKey], (r) => (isMinus ? sideMargin(r) > L : sideMargin(r) > -L), market, checkKind);
    }
  }
  add('o25', '2.5 오버', odds.o25, (r) => r.t > 2.5);
  add('u25', '2.5 언더', odds.u25, (r) => r.t < 2.5);
  add('o35', '3.5 오버', odds.o35, (r) => r.t > 3.5);
  add('u35', '3.5 언더', odds.u35, (r) => r.t < 3.5);

  const recommended = bets.filter((b) => b.ev > 0 && b.strength > 0).sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, minusHome, margin: 1 / h + 1 / d + 1 / a - 1, marketN: mk.length, expMargin,
    bets, recommended, leastLoss, rule: ruleFor(fav, favIsHome, d, favIsHome ? opts.overMin?.home : opts.overMin?.away, { minDraw: opts.over35Draw ?? 7.5, min: opts.over35Min }, minusHome),
  };
}

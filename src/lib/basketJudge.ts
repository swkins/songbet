import { betStrength } from './judgeScore';
import { fitCurve, logit, type Curve } from './oddsCurve';
import { oddsHistory, shrinkFactor, winGate, type OddsCheck } from './oddsCheck';
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
  marketN: number; // 핸디캡 표본 경기 수
  expMargin: number; // 표본에서 정배 평균 점수차
  bets: BetResult[];
  recommended: BetResult[]; // EV>0 & eligible, EV 내림차순
  leastLoss: BetResult | null; // 전부 마이너스일 때 가장 덜 잃는 쪽
}

const NAMES: Record<BetKey, string> = {
  home: '홈', away: '원정', mh: '마핸 (정배 -)', ph: '플핸 (역배 +)', mh2: '마핸 2 (정배 -)', ph2: '플핸 2 (역배 +)', mh3: '마핸 3 (정배 -)', ph3: '플핸 3 (역배 +)',
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
  winMaxOdds: number; // 홈 승·원정 승 추천 상한 배당 (미만)
  winSeasonShare: number; // 승 베팅: 같은 배당대 과거 실적이 플러스였던 시즌 비율이 이 이상이어야 추천
  winAnchor: boolean; // 승 적중률을 시장 확률 기준으로 잡을지 (false면 비교 경기 비율 그대로)
  winOff: boolean; // 이 리그는 승 추천 안 함 (적중률·손익분기는 보여주고 강도 0)
  // 핸디 구역 (홈정배/원정정배 따로): 마핸은 정배 배당 mhBelow 미만에서만, 플핸은 phFrom 이상에서만 추천·가이드
  // (호주 NBL 1.45/1.45 — 강정배는 크게 이기고 약한 정배는 못 이긴다)
  // 핸디 적중률 = 배당-적중률 곡선 (같은 쪽 정배 전 배당대 경기로 기준점마다 로지스틱, oddsCurve.ts). 3시즌 백테스트(이전 시즌으로만, 반점 기준점
  // 0.5~24.5 중 시장 예상 점수차 ±6) Brier: 예전 비교 경기 비율 0.2396 → 곡선 0.2377, 6개 리그 모두 개선 (2차 곡선 0.2379)
  curveHcap: boolean;
  // 승은 곡선을 안 쓴다 — Brier는 0.1957 → 0.1949로 조금 좋았지만 NBL·CBA는 나빠졌고, 승 추천 수익이 CBA +14.3%→+9.9%, NBA·KBL도 나빠짐
  curveWin: boolean;
  hcapZone: { home?: { mhBelow?: number; phFrom?: number }; away?: { mhBelow?: number; phFrom?: number } } | null;
}
// 농구 승 추천 기준 — 리그별 3시즌 백테스트(각 시즌을 이전 시즌으로만 판정, 평균배당)로 정함:
//  예전(비교 경기 비율, 1.30~3.00) 1701건 -1.4% · 시장 기준 보정 140건 -7.0% · 비교 경기 비율 + 상한 1.75 + 시즌 일관성 0.6 376건 -2.5%
//  (CBA 26건 +25%, B.LEAGUE 28건 +18%, NBA 208건 -2.8%, 유로리그 95건 -14%, KBL 19건 -9%)
//  → 기본은 비교 경기 비율 + 1.75 + 0.6, NBA·KBL·유로리그는 어떤 방식으로도 마이너스라 승 추천을 끈다 (leagues/*.ts winOff)

// 판정에 쓸 수 없는 경기 제외: 동점(0:0 등 취소·미진행), 배당 1.00 이하(빈 값), 두 배당 마진이 마이너스(배당 기록 오류)
export function cleanGames(games: Game[]): Game[] {
  return games.filter(([h, a, hs, as]) => hs !== as && h > 1 && a > 1 && 1 / h + 1 / a >= 1);
}

export function createJudge(rawGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(cleanGames(rawGames)); // 최근 5시즌만
  const weight = seasonWeigher(games);
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 3.0, minMarketN: 200, winMaxOdds: 1.75, winSeasonShare: 0.6, winAnchor: false, winOff: false, curveHcap: true, curveWin: false, hcapZone: null, ...base };
  const check = oddsHistory<'home' | 'away'>(games.map((g) => ({ odds: { home: g[0], away: g[1] }, won: { home: g[2] > g[3], away: g[3] > g[2] }, w: weight(g), season: g[4] })));
  // 곡선용: 같은 쪽 정배 과거 경기 전체 (모든 정배 배당대) — x = logit(정배 확률), m = 정배 기준 점수차
  const sideRows = new Map<boolean, CurveRow[]>();
  for (const side of [true, false]) sideRows.set(side, games.filter((g) => (g[0] <= g[1]) === side).map((g) => ({ x: logit(favProb(g[0], g[1])), w: weight(g), m: side ? g[2] - g[3] : g[3] - g[2] })));
  const cache = new Map<string, Curve | null>();
  const curve: CurveFn = (side, key, test) => {
    const id = `${side}:${key}`;
    if (!cache.has(id)) cache.set(id, fitCurve(sideRows.get(side)!.map((r) => ({ x: r.x, w: r.w, y: test(r.m) ? 1 : 0 }))));
    return cache.get(id)!;
  };
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(games, weight, check, sideRows, curve, odds, { ...defaults, ...o });
}

interface CurveRow { x: number; w: number; m: number }
type CurveFn = (side: boolean, key: string, test: (m: number) => boolean) => Curve | null;

// 승패 배당 → 마진 뺀 정배 승 확률
const favProb = (h: number, a: number) => (1 / Math.min(h, a)) / (1 / h + 1 / a);

function judgeWith(games: Game[], weight: (g: Game) => number, oddsCheck: ReturnType<typeof oddsHistory<'home' | 'away'>>, sideRows: Map<boolean, CurveRow[]>, curve: CurveFn, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, away: a } = odds;
  if (!h || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 핸디캡 표본: 정배 배당이 비슷하고, 정배가 같은 쪽(홈/원정)인 경기 → 정배 기준 점수차
  const same = games.filter((g) => (g[0] <= g[1]) === favIsHome);
  const mk = pick(same, (g) => Math.min(g[0], g[1]), fav, opts.minMarketN);
  // 정배 기준 점수차 + 그 경기의 시즌 가중치 (최근 시즌일수록 크게)
  const FM = mk.map((g) => ({ m: g[0] <= g[1] ? g[2] - g[3] : g[3] - g[2], w: weight(g), pf: favProb(g[0], g[1]) }));
  const W = (r: { w: number }) => r.w;
  const stat3 = (res: (m: number) => 1 | 0 | -1) => weightedStat(FM, W, (r) => res(r.m));
  const expMargin = weightedMean(FM, W, (r) => r.m);
  // 곡선: 같은 쪽 정배 과거 경기 전체로 "정배 확률 → 이 결과가 나올 확률" 로지스틱을 맞추고 이 경기 자리 값을 읽는다 (oddsCurve.ts)
  const all = sideRows.get(favIsHome)!;
  const x0 = logit(favProb(h, a));
  const at = (key: string, test: (m: number) => boolean) => curve(favIsHome, key, test)?.at(x0) ?? { p: 0, se: 0 };
  const curveStat3 = (L: number, minus: boolean) => {
    const over = at(`>${L}`, (m) => m > L), under = at(`<${L}`, (m) => m < L);
    const pp = Number.isInteger(L) ? Math.max(0, 1 - over.p - under.p) : 0; // 정수 기준점만 적특
    const r = minus ? over : under;
    return { n: all.length, pw: Number.isInteger(L) ? r.p : (minus ? over.p : 1 - over.p), pp, se: r.se || over.se };
  };

  const zone = opts.hcapZone?.[favIsHome ? 'home' : 'away'];
  const mhOff = zone?.mhBelow != null && fav >= zone.mhBelow;
  const phOff = zone?.phFrom != null && fav < zone.phFrom;
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
    const st = isWin && opts.winOff ? { label: '승 추천 안 함', v: 0 }
      : key.startsWith('mh') && mhOff ? { label: '마핸 추천 안 함', v: 0 }
      : key.startsWith('ph') && phOff ? { label: '플핸 추천 안 함', v: 0 }
      : winGate(betStrength(ev, s.pw, eligible), check, opts.winSeasonShare);
    bets.push({
      key, name: NAMES[key], site, hit: s.pw, push: s.pp, se: s.se, be, ev, err: site * s.se,
      strengthLabel: st.label, strength: st.v, n: s.n,
      eligible, check,
    });
  };

  // 홈 승/원정 승도 핸디캡과 같은 표본(FM)으로 본다 — 표본이 다르면 역배 +1.5(= 역배 승 + 1점차 패)가
  // 역배 승보다 몇 %씩 더 잘 맞는 것처럼 나와서, 일반승이 나은 경기에도 플핸을 추천하는 문제가 있었다
  // 승 적중률은 시장 확률 기준: 이 경기 정배 승 확률 + 비교 경기에서 정배가 시장보다 얼마나 더/덜 이겼나 (표본 작을수록 줄임)
  // — 비교 경기 비율을 그대로 쓰면 아주 강한 정배처럼 드문 경기에서 비교 경기가 약한 정배까지 넓어져 역배 승을 부풀린다
  const favRes = (m: number): 1 | -1 => (m > 0 ? 1 : -1);
  const base = stat3(favRes);
  const cw = opts.curveWin ? at('win', (m) => m > 0) : null;
  const pFav = cw ? cw.p : opts.winAnchor ? Math.min(0.995, Math.max(0.005, favProb(h, a) + shrinkFactor(FM.map((r) => r.w)) * weightedMean(FM, W, (r) => (r.m > 0 ? 1 : 0) - r.pf))) : base.pw;
  const seAt = (p: number) => (base.pw * (1 - base.pw) ? base.se * Math.sqrt((p * (1 - p)) / (base.pw * (1 - base.pw))) : base.se);
  const wn = cw ? all.length : base.n, wse = cw ? cw.se : seAt(pFav);
  const favStat = { n: wn, pw: pFav, pp: 0, se: wse };
  const dogStat = { n: wn, pw: 1 - pFav, pp: 0, se: cw ? cw.se : seAt(1 - pFav) };
  add('home', odds.home, favIsHome ? favStat : dogStat);
  add('away', odds.away, favIsHome ? dogStat : favStat);

  // 기준점 최대 3개 — 각각 정배 -L 마핸 / 역배 +L 플핸
  for (const [L, mk, pk, mo, po] of [
    [odds.line, 'mh', 'ph', odds.mh, odds.ph],
    [odds.line2, 'mh2', 'ph2', odds.mh2, odds.ph2],
    [odds.line3, 'mh3', 'ph3', odds.mh3, odds.ph3],
  ] as const) {
    if (L == null || L < 0) continue;
    add(mk, mo ?? null, opts.curveHcap ? curveStat3(L, true) : stat3((m) => (m > L ? 1 : m === L ? 0 : -1)));
    add(pk, po ?? null, opts.curveHcap ? curveStat3(L, false) : stat3((m) => (m < L ? 1 : m === L ? 0 : -1)));
  }

  const recommended = bets.filter((b) => b.strength > 0).sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / a - 1, marketN: mk.length, expMargin,
    bets, recommended, leastLoss,
  };
}

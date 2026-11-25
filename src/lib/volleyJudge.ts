import { betStrength } from './judgeScore';
import { fitCurve, logit, type Curve } from './oddsCurve';
import { oddsHistory, winGate, type OddsCheck } from './oddsCheck';
import { recentSeasons, seasonWeigher } from './seasonWeight';

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
  marketN: number; // 곡선에 쓴 같은 쪽 정배 경기 수 (모든 배당대)
  band: { lo: number; hi: number }; // 참고: 넣은 정배 배당의 0.1 구간 (예: 1.20~1.29)
  bandN: number; // 그 구간의 실제 경기 수
  bets: BetResult[];
  recommended: BetResult[]; // EV>0 & eligible, EV 내림차순
  leastLoss: BetResult | null;
}

const NAMES: Record<BetKey, string> = {
  home: '홈', away: '원정', m15: '-1.5 마핸', o35: '3.5 오버', u45: '4.5 언더', p25: '+2.5 플핸',
};


export interface JudgeOptions {
  minOdds: number; // 추천 하한 사이트 배당
  maxOdds: number; // 추천 상한 사이트 배당 (미만)
  band: number; // 화면 참고용 구간 폭 (판정은 곡선으로)
  winMaxOdds: number; // 홈 승·원정 승 추천 상한 배당 (미만)
  winSeasonShare: number; // 승 베팅: 같은 배당대 과거 실적이 플러스였던 시즌 비율이 이 이상이어야 추천
  winOff: boolean; // 승 추천 안 함 (적중률·손익분기는 보여주고 강도 0)
}
// 배구 승 추천은 끈다 — 리그별 3시즌 백테스트(각 시즌을 이전 시즌으로만 판정, 평균배당)에서 예전 방식 홈 승 475건 -8.7%,
// 원정 승 234건 -12.5%였고, 시장 기준 보정·같은 배당대 실적·상한을 어떻게 조합해도 8개 리그 모두 마이너스였다 (사용자 요청: 보수적으로)

export function createJudge(allGames: Game[], base: Partial<JudgeOptions> = {}) {
  const games = recentSeasons(allGames); // 최근 5시즌만
  const defaults: JudgeOptions = { minOdds: 1.3, maxOdds: 3.0, band: 0.1, winMaxOdds: 1.75, winSeasonShare: 0.6, winOff: true, ...base };
  const weight = seasonWeigher(games);
  // 적중률 = 배당-적중률 곡선 (oddsCurve.ts): 같은 쪽 정배 과거 경기 전체(모든 배당대)로 홈정배/원정정배·결과별로 따로 맞춘다.
  // 3시즌 백테스트(각 시즌을 이전 시즌으로만, 8개 리그 · 승/-1.5/3.5오버/4.5언더/+2.5) Brier: 0.1 구간 0.2044 → 곡선 0.1959, 8개 리그 모두 개선
  // (2차 곡선·국소 곡선도 봤지만 직선 로지스틱이 가장 좋았다). 예전 방식(최소 경기 수 채우려 범위 넓힘)은 구간 끝 배당을 부풀렸다
  const curves = new Map<string, Curve | null>();
  const sideN = new Map<boolean, number>(); // 같은 쪽 정배 경기 수
  for (const side of [true, false]) {
    const rows = games.filter((g) => (g[0] <= g[1]) === side).map((g) => {
      const fs = side ? g[2] : g[3], us = side ? g[3] : g[2];
      return { x: logit(favProb(g[0], g[1])), w: weight(g), fs, us };
    });
    for (const k of SET_KEYS) curves.set(`${side}:${k}`, fitCurve(rows.map((r) => ({ x: r.x, w: r.w, y: HIT[k](r.fs, r.us) ? 1 : 0 }))));
    sideN.set(side, rows.length);
  }
  const check = oddsHistory<'home' | 'away'>(games.map((g) => ({ odds: { home: g[0], away: g[1] }, won: { home: g[2] > g[3], away: g[3] > g[2] }, w: weight(g), season: g[4] })));
  return (odds: Odds, o: Partial<JudgeOptions> = {}): JudgeOutput | null =>
    judgeWith(games, curves, sideN.get(odds.home != null && odds.away != null && odds.home <= odds.away) ?? 0, check, odds, { ...defaults, ...o });
}

// 결과별 적중 (fs = 정배 세트, us = 역배 세트)
type SetKey = 'win' | 'm15' | 'o35' | 'u45' | 'p25';
const SET_KEYS: SetKey[] = ['win', 'm15', 'o35', 'u45', 'p25'];
const HIT: Record<SetKey, (fs: number, us: number) => boolean> = {
  win: (fs) => fs === 3,
  m15: (fs, us) => fs === 3 && us <= 1,
  o35: (fs, us) => fs + us >= 4,
  u45: (fs, us) => fs + us <= 4,
  p25: (fs, us) => !(fs === 3 && us === 0),
};

// 승패 배당 → 마진 뺀 정배 승 확률
const favProb = (h: number, a: number) => (1 / Math.min(h, a)) / (1 / h + 1 / a);

function judgeWith(games: Game[], curves: Map<string, Curve | null>, n: number, oddsCheck: ReturnType<typeof oddsHistory<'home' | 'away'>>, odds: Odds, opts: JudgeOptions): JudgeOutput | null {
  const { home: h, away: a } = odds;
  if (!h || !a) return null;
  const fav = Math.min(h, a);
  const favIsHome = h <= a;

  // 참고 표시: 넣은 정배 배당의 0.1 구간 실제 경기 수 (판정은 곡선)
  const loC = Math.floor(Math.round(fav * 100) / Math.round(opts.band * 100)) * Math.round(opts.band * 100);
  const hiC = loC + Math.round(opts.band * 100);
  const bandN = games.filter((g) => (g[0] <= g[1]) === favIsHome && Math.round(Math.min(g[0], g[1]) * 100) >= loC && Math.round(Math.min(g[0], g[1]) * 100) < hiC).length;
  const band = { lo: loC / 100, hi: (hiC - 1) / 100 };
  const x0 = logit(favProb(h, a));
  const stat = (k: SetKey) => { const c = curves.get(`${favIsHome}:${k}`); const r = c ? c.at(x0) : { p: 0, se: 0 }; return { n, p: r.p, se: r.se }; };

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

  const fw = stat('win');
  const dogStat = { n, p: 1 - fw.p, se: fw.se };
  add('home', odds.home, favIsHome ? fw : dogStat);
  add('away', odds.away, favIsHome ? dogStat : fw);
  add('m15', odds.m15, stat('m15'));
  add('o35', odds.o35, stat('o35'));
  add('u45', odds.u45, stat('u45'));
  add('p25', odds.p25, stat('p25'));

  // 원정 승은 추천에서 제외 (원하면 아래 필터에서 key !== 'away' 조건 삭제)
  const recommended = bets
    .filter((b) => b.strength > 0 && b.key !== 'away')
    .sort((x, y) => y.strength - x.strength || y.ev - x.ev);
  const leastLoss = [...bets].filter((b) => b.eligible).sort((x, y) => y.ev - x.ev)[0] ?? null;

  return {
    fav, favIsHome, margin: 1 / h + 1 / a - 1, marketN: n, band, bandN,
    bets, recommended, leastLoss,
  };
}

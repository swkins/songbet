// 리그별 곡선 그래프 데이터 (베팅분석 화면 "곡선" 보기) — 판정기와 같은 데이터·가중치·곡선으로 만든다.
// x = 정배 배당, 선 = 곡선 값, 점 = 그 배당대(0.05 단위) 실제 값 (점 크기 = 경기 수). 홈정배/원정정배 따로.
import { cleanGames, type Game as BasketGame } from './basketJudge';
import type { Game as VolleyGame } from './volleyJudge';
import { fitMargin } from './marginCurve';
import { fitCurve, logit } from './oddsCurve';
import { recentSeasons, seasonWeigher, weightedMean } from './seasonWeight';

export interface CurveSide { curve: { x: number; y: number }[]; dots: { x: number; y: number; n: number }[]; n: number }
export interface CurveMarket { key: string; label: string; unit: '점' | '%'; home: CurveSide; away: CurveSide }
export interface CurveChartData { markets: CurveMarket[] }

type G = readonly [number, number, number, number, number?];
const favProb = (h: number, a: number) => (1 / Math.min(h, a)) / (1 / h + 1 / a);
const STEP = 0.05;

// 곡선을 그릴 정배 배당 범위와, 정배 배당만으로 x(마진 뺀 정배 확률의 logit)를 잡기 위한 리그 평균 마진
function axis(games: readonly G[], side: boolean) {
  const favs = games.filter((g) => (g[0] <= g[1]) === side).map((g) => Math.min(g[0], g[1])).sort((p, q) => p - q);
  const q = (t: number) => favs[Math.min(favs.length - 1, Math.floor(t * favs.length))] ?? 1.5;
  const lo = Math.max(1.02, Math.floor(q(0.01) * 50) / 50), hi = Math.min(2.2, Math.ceil(q(0.99) * 50) / 50);
  const over = games.reduce((s, g) => s + 1 / g[0] + 1 / g[1] - 1, 0) / Math.max(1, games.length);
  const xs: number[] = [];
  for (let f = lo; f <= hi + 1e-9; f += 0.02) xs.push(Math.round(f * 100) / 100);
  return { xs, toX: (f: number) => logit(Math.min(0.995, (1 / f) / (1 + over))) };
}

// 0.05 배당대마다 실제 값 (가중 평균), 5경기 미만 구간은 뺀다
function dotsOf<T extends { fav: number; w: number }>(rows: T[], val: (r: T) => number, scale: number) {
  const by = new Map<number, T[]>();
  for (const r of rows) { const k = Math.floor(r.fav / STEP + 1e-9) * STEP; by.set(k, [...(by.get(k) ?? []), r]); }
  return [...by.entries()].filter(([, rs]) => rs.length >= 5).sort((p, q) => p[0] - q[0])
    .map(([k, rs]) => ({ x: Math.round((k + STEP / 2) * 1000) / 1000, y: Math.round(weightedMean(rs, (r) => r.w, val) * scale * 10) / 10, n: rs.length }));
}

export function basketCurves(raw: BasketGame[]): CurveChartData {
  const games = recentSeasons(cleanGames(raw));
  const weight = seasonWeigher(games);
  const side = (home: boolean): CurveSide => {
    const rows = games.filter((g) => (g[0] <= g[1]) === home).map((g) => ({ x: logit(favProb(g[0], g[1])), w: weight(g), m: home ? g[2] - g[3] : g[3] - g[2], fav: Math.min(g[0], g[1]) }));
    const mc = fitMargin(rows);
    const { xs, toX } = axis(games, home);
    return { n: rows.length, curve: mc ? xs.map((f) => ({ x: f, y: Math.round(mc.mean(toX(f)) * 10) / 10 })) : [], dots: dotsOf(rows, (r) => r.m, 1) };
  };
  return { markets: [{ key: 'margin', label: '평균 점수차', unit: '점', home: side(true), away: side(false) }] };
}

const VOLLEY_MARKETS: { key: string; label: string; hit: (fs: number, us: number) => boolean }[] = [
  { key: 'm15', label: '-1.5 마핸', hit: (fs, us) => fs === 3 && us <= 1 },
  { key: 'p25', label: '+2.5 플핸', hit: (fs, us) => !(fs === 3 && us === 0) },
  { key: 'o35', label: '3.5 오버', hit: (fs, us) => fs + us >= 4 },
  { key: 'u45', label: '4.5 언더', hit: (fs, us) => fs + us <= 4 },
  { key: 'win', label: '정배 승', hit: (fs) => fs === 3 },
];

export function volleyCurves(raw: VolleyGame[]): CurveChartData {
  const games = recentSeasons(raw);
  const weight = seasonWeigher(games);
  const rowsOf = (home: boolean) => games.filter((g) => (g[0] <= g[1]) === home).map((g) => ({ x: logit(favProb(g[0], g[1])), w: weight(g), fs: home ? g[2] : g[3], us: home ? g[3] : g[2], fav: Math.min(g[0], g[1]) }));
  const R = { home: rowsOf(true), away: rowsOf(false) };
  const side = (home: boolean, hit: (fs: number, us: number) => boolean): CurveSide => {
    const rows = home ? R.home : R.away;
    const c = fitCurve(rows.map((r) => ({ x: r.x, w: r.w, y: hit(r.fs, r.us) ? 1 : 0 })));
    const { xs, toX } = axis(games, home);
    return { n: rows.length, curve: c ? xs.map((f) => ({ x: f, y: Math.round(c.at(toX(f)).p * 1000) / 10 })) : [], dots: dotsOf(rows, (r) => (hit(r.fs, r.us) ? 1 : 0), 100) };
  };
  return { markets: VOLLEY_MARKETS.map((m) => ({ key: m.key, label: m.label, unit: '%', home: side(true, m.hit), away: side(false, m.hit) })) };
}

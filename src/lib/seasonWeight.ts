// 최근 시즌 가중치 — 배구·농구 판정기와 리그 특성 요약이 같이 쓴다.
// 경기 데이터 5번째 칸에 시즌(끝나는 해, 2025-26 → 2026)이 있으면, 그 리그의 가장 최근 시즌을 1.0으로 두고
// 한 시즌 오래될 때마다 ×0.8 (최소 0.3): 5시즌이면 1.0 · 0.8 · 0.64 · 0.51 · 0.41.
// 새 시즌을 추가하면 그 시즌이 1.0이 되고 나머지는 자동으로 한 칸씩 줄어든다. 시즌 칸이 없는 경기는 1.0.
export const SEASON_DECAY = 0.8;
export const SEASON_MIN_WEIGHT = 0.3;
// 모든 리그 공통으로 최근 5시즌만 쓴다 — 새 시즌을 넣으면 가장 오래된 시즌은 자동으로 빠진다
export const MAX_SEASONS = 5;

type WithSeason = readonly [number, number, number, number, number?];

export function latestSeason(games: readonly WithSeason[]): number | null {
  let latest: number | null = null;
  for (const g of games) if (g[4] != null && (latest == null || g[4] > latest)) latest = g[4];
  return latest;
}

// 최근 MAX_SEASONS 시즌 경기만 남긴다 (시즌 칸이 없는 경기는 그대로)
export function recentSeasons<T extends WithSeason>(games: readonly T[]): T[] {
  const latest = latestSeason(games);
  return games.filter((g) => latest == null || g[4] == null || g[4] > latest - MAX_SEASONS);
}

// 경기 → 가중치 함수 (리그 데이터 전체 기준으로 최신 시즌을 정한다)
export function seasonWeigher(games: readonly WithSeason[]): (g: WithSeason) => number {
  const latest = latestSeason(games);
  return (g) => (latest == null || g[4] == null ? 1 : Math.max(SEASON_MIN_WEIGHT, SEASON_DECAY ** (latest - g[4])));
}

// 가중 승/적특/패 비율. n은 실제 경기 수, 오차는 가중치를 반영한 유효 경기 수로 계산
export function weightedStat<T>(rows: readonly T[], weight: (r: T) => number, res: (r: T) => 1 | 0 | -1) {
  let sw = 0, sw2 = 0, ww = 0, wp = 0;
  for (const r of rows) {
    const w = weight(r);
    sw += w; sw2 += w * w;
    const v = res(r);
    if (v === 1) ww += w; else if (v === 0) wp += w;
  }
  const n = rows.length;
  if (!sw) return { n, pw: 0, pp: 0, se: 0 };
  const pw = ww / sw, pp = wp / sw;
  const nEff = (sw * sw) / sw2;
  return { n, pw, pp, se: 1.96 * Math.sqrt((pw * (1 - pw)) / nEff) };
}

export function weightedMean<T>(rows: readonly T[], weight: (r: T) => number, value: (r: T) => number) {
  let sw = 0, s = 0;
  for (const r of rows) { const w = weight(r); sw += w; s += w * value(r); }
  return sw ? s / sw : 0;
}

// 데이터 현황 — 시즌별 경기 수와 반영도(가중치). 시즌 칸이 없는 데이터면 seasons가 빈 배열
export function seasonSummary(games: readonly WithSeason[]): { total: number; seasons: { season: number; n: number; w: number }[] } {
  const weight = seasonWeigher(games);
  const by = new Map<number, number>();
  for (const g of games) if (g[4] != null) by.set(g[4], (by.get(g[4]) ?? 0) + 1);
  const seasons = [...by.entries()].sort((a, b) => a[0] - b[0])
    .map(([season, n]) => ({ season, n, w: weight([0, 0, 0, 0, season]) }));
  return { total: games.length, seasons };
}

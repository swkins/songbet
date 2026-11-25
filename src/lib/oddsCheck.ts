// 승 베팅 공통 안전장치 (축구·농구·배구 판정기가 같이 쓴다)

// 승 적중률을 "이 경기 시장 확률 + 비교 경기에서 실제가 시장보다 얼마나 더/덜 나왔나"로 잡을 때,
// 그 차이에 유효 경기 수 / (유효 경기 수 + SHRINK_K)를 곱해서 표본이 작을수록 시장 확률 쪽으로 붙인다
// (축구 챔스 홈 2.42: 비교 경기 80개가 우연히 시장보다 14%p 더 이겨 +28.5% 최강이 나왔다 — 백테스트에서 200이 가장 나았다)
export const SHRINK_K = 200;
export function shrinkFactor(weights: number[]): number {
  const sw = weights.reduce((a, b) => a + b, 0), sw2 = weights.reduce((a, b) => a + b * b, 0);
  if (!sw) return 0;
  const nEff = (sw * sw) / sw2;
  return nEff / (nEff + SHRINK_K);
}

export interface OddsCheck { n: number; hit: number; roi: number; seasons: number; seasonsUp: number }

// 같은 배당대 과거 실적: 그 결과(홈 승/원정 승/무)의 배당이 비슷했던 과거 경기들 — 로그 창을 넓혀가며 60경기 이상.
// 실제 적중률·수익률(그때 배당 기준)과, 5경기 이상 있는 시즌 중 수익률이 플러스였던 시즌 수
export function oddsHistory<K extends string>(hist: { odds: Record<K, number>; won: Record<K, boolean>; w: number; season?: number }[]) {
  return (kind: K, site: number): OddsCheck | undefined => {
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
    const bySeason = new Map<number, number[]>();
    for (const h of rows) {
      const x = bySeason.get(h.season ?? 0) ?? [];
      x.push(h.won[kind] ? h.odds[kind] - 1 : -1);
      bySeason.set(h.season ?? 0, x);
    }
    const counted = [...bySeason.values()].filter((x) => x.length >= 5);
    const seasonsUp = counted.filter((x) => x.reduce((a, b) => a + b, 0) > 0).length;
    return { n: rows.length, hit, roi, seasons: counted.length, seasonsUp };
  };
}

// 승 베팅 강도 마지막 관문: 같은 배당대 과거 수익률이 0 이하이거나, 플러스 시즌 비율이 seasonShare 미만이면 0점
export function winGate(st: { label: string; v: number }, check: OddsCheck | undefined, seasonShare: number): { label: string; v: number } {
  if (st.v === 0 || !check) return st;
  if (check.roi <= 0) return { label: '배당대 실적 미달', v: 0 };
  if (check.seasons && check.seasonsUp / check.seasons < seasonShare) return { label: '시즌 일관성 부족', v: 0 };
  return st;
}

// 정배 배당 → 적중률 곡선. 같은 쪽 정배(홈정배/원정정배) 과거 경기 전체(모든 배당대)로
// 가중 로지스틱 회귀 logit(적중) = a + b·logit(정배 확률) 를 맞추고, 넣은 배당 자리의 값을 읽는다.
// 1.20 경기가 적어도 1.14·1.21·1.26 … 전 배당대 경기로 1.20 자리를 유추한다 (사용자 요청).

const sig = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => Math.log(p / (1 - p));

export interface Curve {
  at: (x: number) => { p: number; se: number }; // x = logit(정배 확률), se = 95% 오차
}

// rows: x = logit(정배 확률), y = 적중 0/1, w = 시즌 가중치
export function fitCurve(rows: readonly { x: number; y: number; w: number }[]): Curve | null {
  if (rows.length < 2) return null;
  let a = 0, b = 0;
  let H = [[0, 0], [0, 0]];
  for (let it = 0; it < 50; it++) {
    let g0 = 0, g1 = 0, h00 = 1e-6, h01 = 0, h11 = 1e-6; // 아주 작은 릿지 (한쪽만 나온 표본에서 발산 방지)
    for (const r of rows) {
      const p = sig(a + b * r.x);
      const e = r.w * (r.y - p), q = r.w * p * (1 - p);
      g0 += e; g1 += e * r.x; h00 += q; h01 += q * r.x; h11 += q * r.x * r.x;
    }
    H = [[h00, h01], [h01, h11]];
    const det = h00 * h11 - h01 * h01;
    const da = (h11 * g0 - h01 * g1) / det, db = (h00 * g1 - h01 * g0) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  const det = H[0][0] * H[1][1] - H[0][1] * H[0][1];
  const inv = [[H[1][1] / det, -H[0][1] / det], [-H[0][1] / det, H[0][0] / det]];
  return {
    at: (x) => {
      const p = sig(a + b * x);
      const v = inv[0][0] + 2 * x * inv[0][1] + x * x * inv[1][1];
      return { p, se: 1.96 * p * (1 - p) * Math.sqrt(Math.max(0, v)) };
    },
  };
}

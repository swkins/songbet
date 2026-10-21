// 정배 배당 → 점수차 곡선 (사용자 요청). 같은 쪽 정배 과거 경기 전체(모든 배당대)로
//  평균 점수차 μ(x) = a + b·x  (x = logit(정배 확률), 진 경기는 마이너스 점수차로 같이 들어간다)
//  퍼짐 s(x) = 평균 |μ와의 차이| 직선 × √(π/2)  (강정배·약정배의 점수차 퍼짐이 다를 수 있어서)
// 를 맞추고, 실제 점수차가 평균에서 얼마나 벗어났는지(퍼짐으로 나눈 값)의 실제 분포로 "점수차 > t" 확률을 낸다.
// 승 = 점수차 > 0, 마핸 -L = 점수차 > L, 플핸 +L = 점수차 < L — 모두 같은 곡선 하나로 본다.

export interface MarginRow { x: number; m: number; w: number }

export interface MarginCurve {
  mean: (x: number) => number; // 평균 점수차
  // 점수차가 t보다 클 확률 (점수는 정수라 연속 보정: t가 정수면 t+0.5 기준), 95% 오차
  over: (x: number, t: number) => { p: number; se: number };
  // 평균 점수차를 mu로 바꿔 넣었을 때 (퍼짐은 x 자리 그대로) — 그 배당대 실제 평균 점수차로 볼 때
  overAt: (mu: number, x: number, t: number) => number;
  n: number;
}

function wls(rows: readonly { x: number; y: number; w: number }[]) {
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const r of rows) { sw += r.w; sx += r.w * r.x; sy += r.w * r.y; sxx += r.w * r.x * r.x; sxy += r.w * r.x * r.y; }
  if (!sw) return { a: 0, b: 0 };
  const d = sw * sxx - sx * sx;
  const b = d ? (sw * sxy - sx * sy) / d : 0;
  return { a: (sy - b * sx) / sw, b };
}

export function fitMargin(rows: readonly MarginRow[]): MarginCurve | null {
  if (rows.length < 10) return null;
  const mu = wls(rows.map((r) => ({ x: r.x, y: r.m, w: r.w })));
  const mean = (x: number) => mu.a + mu.b * x;
  const sp = wls(rows.map((r) => ({ x: r.x, y: Math.abs(r.m - mean(r.x)), w: r.w })));
  const scale = (x: number) => Math.max(1, (sp.a + sp.b * x) * Math.sqrt(Math.PI / 2));
  // 표준화한 차이를 정렬해 두고 가중 누적합으로 꼬리 확률을 바로 읽는다
  const z = rows.map((r) => ({ z: (r.m - mean(r.x)) / scale(r.x), w: r.w })).sort((p, q) => p.z - q.z);
  const cum: number[] = []; let acc = 0;
  for (const r of z) { acc += r.w; cum.push(acc); }
  const sw = acc, sw2 = rows.reduce((s, r) => s + r.w * r.w, 0), nEff = (sw * sw) / sw2;
  const tail = (c: number) => { // Σw[z > c] / Σw
    let lo = 0, hi = z.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (z[mid].z <= c) lo = mid + 1; else hi = mid; }
    return (sw - (lo ? cum[lo - 1] : 0)) / sw;
  };
  const at = (mu: number, x: number, t: number) => tail(((Number.isInteger(t) ? t + 0.5 : t) - mu) / scale(x));
  return {
    mean, n: rows.length, overAt: at,
    over: (x, t) => {
      const tt = Number.isInteger(t) ? t + 0.5 : t;
      const p = tail((tt - mean(x)) / scale(x));
      return { p, se: 1.96 * Math.sqrt((p * (1 - p)) / nEff) };
    },
  };
}

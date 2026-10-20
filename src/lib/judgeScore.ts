// 가치판단기 공통 베팅 강도 0~10점 (배구·농구 판정기가 같이 쓴다)
//  - 기대수익이 오차(95%)를 감안해도 마이너스(ev + err ≤ 0)면 0점 = 패스
//  - 기대수익이 마이너스지만 오차 범위 안이면 1~3점 (0에 가까울수록 3점)
//  - 기대수익이 플러스면 4~10점: 기대수익 크기(15% 이상이면 만점)와 확실성(하한도 플러스면 만점)을 반반 반영
export function strengthOf(ev: number, err: number): { label: string; v: number } {
  let v: number;
  if (ev + err <= 0) v = 0;
  else if (ev <= 0) v = Math.round(1 + 2 * (1 + ev / err));
  else v = Math.round(4 + 3 * Math.min(1, ev / 0.15) + 3 * Math.min(1, err > 0 ? ev / err : 1));
  v = Math.max(0, Math.min(10, v));
  const label = v === 0 ? '패스' : v <= 3 ? '약' : v <= 6 ? '중' : v <= 8 ? '강' : '최강';
  return { label, v };
}

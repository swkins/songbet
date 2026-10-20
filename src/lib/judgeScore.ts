// 추천하려면 과거 적중률이 이 이상이어야 한다 — 적중률 낮은 고배당은 기대수익이 플러스로 나와도 실제로는 크게 잃었다(백테스트)
export const MIN_HIT = 0.5;

// 판정 표의 베팅 강도: 추천 배당범위 밖이거나 적중률이 MIN_HIT 미만이면 기대수익과 상관없이 0점 (추천에서도 빠진다)
export function betStrength(ev: number, err: number, hit: number, eligible: boolean): { label: string; v: number } {
  if (!eligible) return { label: '범위 밖', v: 0 };
  if (hit < MIN_HIT) return { label: '적중률 낮음', v: 0 };
  return strengthOf(ev, err);
}

// 가치판단기 공통 베팅 강도 0~10점 (축구·배구·농구 판정기가 같이 쓴다)
//  - 기대수익이 마이너스면 오차 범위 안이어도 0점 = 패스 (예전엔 오차 안의 마이너스를 1~3점으로 줘서 -21%도 '약'으로 보였다)
//  - 기대수익이 플러스면 1~10점: 기대수익 크기(15% 이상이면 만점)와 확실성(오차 하한도 플러스면 만점)을 반반 반영
//    → 플러스라도 오차에 묻히는 작은 기대수익은 1~3점(약)
export function strengthOf(ev: number, err: number): { label: string; v: number } {
  let v: number;
  if (ev <= 0) v = 0;
  else v = Math.round(1 + 4.5 * Math.min(1, ev / 0.15) + 4.5 * Math.min(1, err > 0 ? ev / err : 1));
  v = Math.max(0, Math.min(10, v));
  const label = v === 0 ? '패스' : v <= 3 ? '약' : v <= 6 ? '중' : v <= 8 ? '강' : '최강';
  return { label, v };
}

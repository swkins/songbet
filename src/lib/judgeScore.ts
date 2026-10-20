// 추천하려면 과거 적중률이 이 이상이어야 한다 — 적중률 낮은 고배당은 기대수익이 플러스로 나와도 실제로는 크게 잃었다(백테스트)
export const MIN_HIT = 0.5;

// 판정 (모든 종목 공통): 손익분기보다 배당이 높으면(기대수익 플러스) 추천, 아니면 패스 — 패스는 이유를 label로 보여준다.
// 추천 배당범위 밖이거나 적중률이 MIN_HIT 미만이면 기대수익과 상관없이 패스 (사용자 요청으로 정한 기준)
export function betStrength(ev: number, hit: number, eligible: boolean): { label: string; v: number } {
  if (!eligible) return { label: '배당 범위 밖', v: 0 };
  if (hit < MIN_HIT) return { label: '적중률 50% 미만', v: 0 };
  return strengthOf(ev);
}

// 추천 등급 (사용자 요청: 1~10점 대신 강·중·약 세 단계) — 기대수익 10% 이상 강(3), 5% 이상 중(2), 그 밖의 플러스 약(1), 마이너스는 패스(0)
export function strengthOf(ev: number): { label: string; v: number } {
  if (ev <= 0) return { label: '기대수익 마이너스', v: 0 };
  if (ev >= 0.1) return { label: '강', v: 3 };
  if (ev >= 0.05) return { label: '중', v: 2 };
  return { label: '약', v: 1 };
}

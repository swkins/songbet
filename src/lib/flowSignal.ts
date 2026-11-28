// 축구 배당 흐름 신호 (2026-11-28 사용자 요청 — 배당이 떨어지는 쪽만 가리키고, 노이즈/신호/과함을 판단. 베팅 옵션은 사용자가 고른다)
// 기준은 football-data 2021-22~2025-26 백테스트(남긴 리그 10개, 경기 1~3일 전 → 마감 북 평균 배당) — 확률 변화(마진 뺀 값) 구간별:
//   정배  1~2%p  −4.4%  2~3.5 +1.1%  3.5~5 −0.3%  5~8 +5.4%  8%p+ +15.8% (133경기)   ← 축구는 '과하게 떨어진 정배'가 오히려 가장 잘 맞음
//   역배  1~2%p −12.1%  2~3.5 −10.0%  3.5~5 +6.0%  5~8 +6.7%  8%p+ +8.3% (61경기)    ← 역배 소폭 하락은 함정 (평균보다 더 잃음)
//   (수익률 = 10시간 전쯤 걸었다고 보고 1~3일 전·마감 배당의 중간으로 추정)
export type Side = 'home' | 'away'
export type Level = 'none' | 'noise' | 'trap' | 'signal' | 'strong'
export interface FlowPoint { t: string; ph: number; pa: number; h?: number; a?: number }
export interface FlowSignal {
  side: Side | null; fav: boolean; dp: number                 // 돈이 들어온 쪽 · 그쪽이 오픈 때 정배였나 · 확률 변화(0.03 = 3%p)
  level: Level; title: string; why: string
  oddsOpen?: number; oddsNow?: number
  streak: number; retrace: boolean                            // 마지막에 같은 방향으로 연속 몇 번 · 정점에서 40% 이상 되돌아오는 중
  changes: number; other: number                               // 반대쪽 확률 변화
}

export const FLOW_BANDS = {
  fav: [{ lo: 0, hi: 0.02, roi: '−4.4%' }, { lo: 0.02, hi: 0.05, roi: '+0.4%' }, { lo: 0.05, hi: 0.08, roi: '+5.4%' }, { lo: 0.08, hi: 1, roi: '+15.8%' }],
  dog: [{ lo: 0, hi: 0.035, roi: '−11%' }, { lo: 0.035, hi: 0.08, roi: '+6~7%' }, { lo: 0.08, hi: 1, roi: '+8.3%' }],
}

export function soccerSignal(hist: FlowPoint[]): FlowSignal | null {
  if (!hist.length) return null
  const o = hist[0], n = hist[hist.length - 1]
  const dh = n.ph - o.ph, da = n.pa - o.pa
  const changes = hist.length - 1
  if (Math.max(dh, da) < 0.01) {
    return { side: null, fav: false, dp: Math.max(dh, da), level: 'none', title: '흐름 없음', why: changes ? `오픈 이후 ${changes}번 바뀌었지만 어느 쪽도 1%p 넘게 안 움직임` : '아직 배당이 한 번도 안 바뀜',
      streak: 0, retrace: false, changes, other: 0 }
  }
  const side: Side = dh >= da ? 'home' : 'away'
  const p = (x: FlowPoint) => (side === 'home' ? x.ph : x.pa)
  const fav = side === 'home' ? o.ph >= o.pa : o.pa > o.ph
  const dp = p(n) - p(o), other = side === 'home' ? da : dh
  let streak = 0
  for (let i = hist.length - 1; i > 0; i--) { const d = p(hist[i]) - p(hist[i - 1]); if (d > 0.001) streak++; else if (d < -0.001) break }
  const peak = Math.max(...hist.map(p))
  const retrace = peak - p(o) >= 0.015 && (peak - p(n)) / (peak - p(o)) >= 0.4
  const pp = (x: number) => `${(x * 100).toFixed(1)}%p`
  let level: Level, title: string, why: string
  if (fav) {
    if (dp < 0.02) { level = 'noise'; title = '거의 노이즈'; why = `정배 쪽 +${pp(dp)} — 2%p 미만은 과거 평균과 같음(약 −4%)` }
    else if (dp < 0.05) { level = 'signal'; title = '신호 (약함)'; why = `정배 쪽 +${pp(dp)} — 과거 2~5%p 구간은 본전 근처(약 +0~1%)` }
    else { level = 'strong'; title = dp >= 0.08 ? '강한 신호 · 과하게 쏠림' : '강한 신호'; why = `정배 쪽 +${pp(dp)} — 과거 축구에선 크게 떨어진 정배가 오히려 더 맞음 (5~8%p 약 +5%, 8%p+ 약 +16%). 결장·선발 뉴스로 움직였다면 이미 반영됐을 수 있음` }
  } else {
    if (dp < 0.035) { level = 'trap'; title = '노이즈 · 함정 주의'; why = `역배 쪽 +${pp(dp)} — 역배 소폭 하락은 과거 오히려 더 잃음(약 −10~−12%)` }
    else if (dp < 0.08) { level = 'signal'; title = '확실한 신호'; why = `역배 쪽 +${pp(dp)} — 과거 3.5~8%p 구간 약 +6~7%` }
    else { level = 'strong'; title = '강한 신호 · 과하게 쏠림'; why = `역배 쪽 +${pp(dp)} — 과거 8%p+ 약 +8% (61경기, 표본 적음)` }
  }
  return { side, fav, dp, level, title, why, oddsOpen: side === 'home' ? o.h : o.a, oddsNow: side === 'home' ? n.h : n.a, streak, retrace, changes, other }
}

// 리그별 흐름 신뢰도 (같은 백테스트 — 10시간 전 따라가기 추정 수익률·플러스 시즌) — 화면에 한 줄
export const LEAGUE_FLOW: Record<string, { grade: '좋음' | '관찰' | '신호 약함' | '검증 전'; note: string }> = {
  '프리메이라리가': { grade: '좋음', note: '약 +4.8% · 시즌 3/5 (흔들림 큼)' },
  '프리미어리그': { grade: '좋음', note: '약 +4.0% · 시즌 3/5 (흔들림 큼)' },
  '에레디비시': { grade: '관찰', note: '약 +3.6% · 지난 시즌 −25%' },
  '챔피언쉽': { grade: '관찰', note: '약 +0.7% · 본전 근처' },
  '쥬필러리그': { grade: '관찰', note: '약 +0.2% · 본전 근처' },
  '터키': { grade: '관찰', note: '약 −0.7% · 최근 3시즌 하락' },
  '세리에A': { grade: '신호 약함', note: '약 −1.9% · 배당이 처음부터 정확 — 롤링용' },
  '분데스리가': { grade: '신호 약함', note: '약 −4.2% · 배당이 처음부터 정확 — 롤링용' },
  '라리가': { grade: '신호 약함', note: '약 −4.4% · 배당이 처음부터 정확 — 롤링용' },
  '리그1': { grade: '신호 약함', note: '약 −4.7% · 배당이 처음부터 정확 — 롤링용' },
}

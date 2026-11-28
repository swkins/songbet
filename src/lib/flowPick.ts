// 배당 흐름 추천 (2026-11-28 사용자 요청 — NBA·축구는 배당 흐름만으로 추천, 국내 리그는 뉴스·오버롤로 직접 분석)
// 모델·결장·뉴스는 안 씀. 시장(피나클·미국 북)이 이미 다 반영한다고 보고, 돈이 어디로 움직였는지만 본다.
import type { OddsLine } from './odds'

export type Stars = 0 | 1 | 2 | 3

// ─── NBA 핸디 기준점 이동 ───────────────────────────────
// 근거 (돈이 몰린 쪽을 마감 기준점으로 걸었을 때 적중, 손익분기 52.4%):
//               2011-22 (12,145경기)   2025-26 (1,230경기)
// 역배 쪽 2.5~3     57.4% (270)          55.6% (63)    ← 두 기간 모두 플러스 = 신호
// 역배 쪽 3.5+      55.0% (171)          54.9% (71)    ← 신호
// 역배 쪽 1.5~2     48.6% (995)          55.4% (83)    엇갈림 → 약함
// 정배 쪽 1.5~2     50.0% (1715)         55.9% (136)   엇갈림 → 약함
// 정배 쪽 2.5~3     50.6% (532)          48.8% (43)    없음
// 정배 쪽 3.5+      44.2% (269)          57.5% (40)    반대로 엇갈림 → 패스
// 0.5~1점           48.9~52.5%                         없음
// 오픈 기준점으로 걸었으면 돈 쪽이 55~70% — 사이트가 아직 오픈 근처 기준점을 주면 그만큼 유리.
export interface NbaFlow {
  open: number; now: number; move: number            // 홈 기준점 (−5.5 = 홈 마핸 5.5), move = now − open
  side: 'home' | 'away' | null                       // 돈이 몰린 쪽
  toward: 'fav' | 'dog' | null                       // 오픈 때 정배 쪽 / 역배 쪽
  stars: Stars
  verdict: string                                     // 한 줄 판정
  why: string                                         // 근거
  sideLineOpen: number | null; sideLineNow: number | null   // 돈 쪽 팀 기준 핸디 (오픈 / 지금)
  changes: number
}

export function nbaFlow(lines: OddsLine[] | undefined): NbaFlow | null {
  const sp = (lines ?? []).filter(l => l.market === 'spread')
  if (!sp.length) return null
  const first = sp[0], last = sp[sp.length - 1]
  const open = first.open_line ?? last.open_line ?? first.line
  const now = last.line
  const move = Math.round((now - open) * 10) / 10
  const changes = sp.length - 1
  const base = { open, now, move, changes }
  if (Math.abs(move) < 1.5) {
    return { ...base, side: move === 0 ? null : move < 0 ? 'home' : 'away', toward: null, stars: 0, sideLineOpen: null, sideLineNow: null,
      verdict: '신호 없음', why: move === 0 ? '오픈 이후 기준점 그대로' : `기준점 ${Math.abs(move)}점 이동 — 1점 이하는 과거 48~52%로 의미 없음` }
  }
  const side: 'home' | 'away' = move < 0 ? 'home' : 'away'
  const fav = open < 0 ? 'home' : open > 0 ? 'away' : null
  const toward: 'fav' | 'dog' = fav === side ? 'fav' : 'dog'
  const m = Math.abs(move)
  const sideLineOpen = side === 'home' ? open : -open, sideLineNow = side === 'home' ? now : -now
  let stars: Stars = 0, verdict = '', why = ''
  if (toward === 'dog' && m >= 2.5) { stars = 2; verdict = '따라가기'; why = `역배 쪽으로 ${m}점 이동 — 과거 두 기간 모두 돈 쪽 55~57% (2011-22 ${m >= 3.5 ? '55.0% · 171경기' : '57.4% · 270경기'}, 2025-26 ${m >= 3.5 ? '54.9% · 71경기' : '55.6% · 63경기'})` }
  else if (toward === 'dog') { stars = 1; verdict = '약하게 따라가기'; why = '역배 쪽 1.5~2점 이동 — 2025-26 55.4%(83경기)지만 2011-22는 48.6%로 엇갈림' }
  else if (m <= 2) { stars = 1; verdict = '약하게 따라가기'; why = '정배 쪽 1.5~2점 이동 — 2025-26 55.9%(136경기)지만 2011-22는 50.0%로 엇갈림' }
  else if (m <= 3) { stars = 0; verdict = '패스'; why = '정배 쪽 2.5~3점 이동 — 과거 두 기간 모두 49~51% (이미 다 반영)' }
  else { stars = 0; verdict = '패스 (엇갈림)'; why = '정배 쪽 3.5점+ 과하게 이동 — 2011-22는 반대(역배) 55.8%, 2025-26은 따라가기 57.5%(40경기)로 정반대' }
  return { ...base, side, toward, stars, verdict, why, sideLineOpen, sideLineNow }
}

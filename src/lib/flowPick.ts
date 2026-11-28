// 배당 흐름 추천 (2026-11-28 사용자 요청 — NBA·축구는 배당 흐름만으로 추천, 국내 리그는 뉴스·오버롤로 직접 분석)
// 모델·결장·뉴스는 안 씀. 시장(피나클·미국 북)이 이미 다 반영한다고 보고, 돈이 어디로 움직였는지만 본다.
import type { OddsLine } from './odds'
import { devig, type PinFair } from './fairOdds'

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

// ─── 축구 피나클 승무패 흐름 → 옵션 추천 ─────────────────
// 근거 (5대 리그 2021-26 백테스트): 피나클 오픈도 정확하고(log loss 오픈 0.9712 · 마감 0.9683), 움직임은 오픈을 거의 정확히 고친다.
// → 지금 피나클 공정 확률 = 가장 좋은 추정. 피나클 배당 자체엔 우위 없음, 사이트 배당이 공정 배당 이상일 때만 플러스.
// 돈이 들어온 옵션(오픈보다 확률이 오른 쪽)은 사이트가 늦게 따라오는 경우가 많아 그쪽을 먼저 본다.
// 1.30 미만 · 무승부 · 역배 승(→ +0.5·+1.5로)·적특 있는 정수 핸디는 추천 안 함 (사용자 규칙).
export interface SoccerOpt {
  label: string; side: 'home' | 'away' | 'game'; opt: string   // opt = 베팅 문구 옵션 ('승리' · '0.5 H' · '2.5 오버')
  p: number; pOpen: number | null; fair: number
  stars: Stars; flow: string
}
export interface SoccerFlow {
  moneySide: 'home' | 'away' | null; moneyName: string | null; dp: number   // 돈 쪽과 오픈 대비 확률 변화 (%p 단위 소수, 0.03 = 3%p)
  streak: number                                                            // 마지막에 같은 방향으로 연속 움직인 횟수
  changes: number
  opts: SoccerOpt[]
}

const pairOpen = (a?: number, b?: number) => (a && b && Number.isFinite(a) && Number.isFinite(b) ? devig([a, b])[0] : null)

export function soccerFlow(f: PinFair | undefined | null, H: string, A: string): SoccerFlow | null {
  if (!f?.ml) return null
  const hs = f.history
  const o = hs[0], n = hs[hs.length - 1]
  const dh = o && n ? n.ph - o.ph : 0, da = o && n ? n.pa - o.pa : 0
  const moneySide = Math.max(dh, da) < 0.01 ? null : dh >= da ? 'home' : 'away'
  // 연속: 끝에서부터 돈 쪽 확률이 계속 오른 횟수
  let streak = 0
  if (moneySide) for (let i = hs.length - 1; i > 0; i--) {
    const d = moneySide === 'home' ? hs[i].ph - hs[i - 1].ph : hs[i].pa - hs[i - 1].pa
    if (d > 0.001) streak++; else if (d < -0.001) break
  }
  const fav: 'home' | 'away' = f.ml.home.p >= f.ml.away.p ? 'home' : 'away'
  const dog = fav === 'home' ? 'away' : 'home'
  const nm = (s: 'home' | 'away') => (s === 'home' ? H : A)
  const opts: SoccerOpt[] = []
  const add = (label: string, side: SoccerOpt['side'], opt: string, p: number, pOpen: number | null) => {
    const fair = 1 / p
    if (fair < 1.3) return                                   // 공정 배당부터 1.30 미만이면 사이트는 더 낮다
    const d = pOpen == null ? 0 : p - pOpen
    const stars: Stars = d >= 0.02 ? 2 : d >= 0.01 ? 1 : 0
    const flow = pOpen == null ? '흐름 기록 없음' : `${(pOpen * 100).toFixed(1)}% → ${(p * 100).toFixed(1)}% (${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%p)`
    opts.push({ label, side, opt, p, pOpen, fair, stars, flow })
  }
  // 정배 승
  add(`${nm(fav)} 승리`, fav, '승리', f.ml[fav].p, o ? (fav === 'home' ? o.ph : o.pa) : null)
  // 역배 +0.5 (= 정배가 못 이김)
  add(`${nm(dog)} +0.5`, dog, '0.5 H', 1 - f.ml[fav].p, o ? 1 - (fav === 'home' ? o.ph : o.pa) : null)
  // ±1.5 · ±2.5 (피나클 핸디가 있을 때)
  for (const L of [1.5, 2.5]) {
    const homeLine = fav === 'home' ? -L : L                     // 홈 기준 핸디 키
    const sp = f.spread[String(homeLine)]
    if (!sp) continue
    const favP = fav === 'home' ? sp.home : sp.away, dogP = fav === 'home' ? sp.away : sp.home
    add(`${nm(fav)} -${L}`, fav, `-${L} H`, favP.p, pairOpen(favP.open, dogP.open))
    add(`${nm(dog)} +${L}`, dog, `${L} H`, dogP.p, pairOpen(dogP.open, favP.open))
  }
  const t = f.total['2.5']
  if (t) {
    add('2.5 오버', 'game', '2.5 오버', t.over.p, pairOpen(t.over.open, t.under.open))
    add('2.5 언더', 'game', '2.5 언더', t.under.p, pairOpen(t.under.open, t.over.open))
  }
  opts.sort((a, b) => b.stars - a.stars || b.p - a.p)
  return { moneySide, moneyName: moneySide ? nm(moneySide) : null, dp: moneySide === 'home' ? dh : moneySide === 'away' ? da : 0, streak, changes: Math.max(0, hs.length - 1), opts }
}

// ─── 축구 룰북 베팅 찾기 (사용자 요청) ─────
// 승무패(ESPN·DraftKings, odds_snapshots 최신)로 정배·역배를 정하고 Supabase soccer_rules 조건에 맞는 경기를 고른다.
// 핸디 배당: Action Network 북메이커 평균(soccer_lines) — 없으면 승무패로 맞춘 포아송 골 모형으로 추정(마진 5% 붙여 '추정' 표시).
// 정배 = 승무패에서 낮은 쪽(홈이든 원정이든), 역배 = 반대쪽.
import { supabase } from './supabase'

export type BetKind = 'fav_win' | 'fav_minus15' | 'fav_plus05' | 'dog_plus15' | 'dog_plus25' | 'over25'
export interface SoccerRule {
  id: number; sort: number; name: string; enabled: boolean
  fav_min: number | null; fav_max: number | null; dog_min: number | null; dog_max: number | null; draw_min: number | null; draw_max: number | null
  bet: BetKind; min_odds: number | null; note: string | null
}
export const BET_LABEL: Record<BetKind, string> = { fav_win: '정배 승', fav_minus15: '정배 -1.5', fav_plus05: '정배 +0.5', dog_plus15: '역배 +1.5', dog_plus25: '역배 +2.5', over25: '2.5 오버' }

export async function loadRules(): Promise<SoccerRule[]> {
  const { data } = await supabase.from('soccer_rules').select('*').order('sort')
  return ((data ?? []) as any[]).map(r => ({ ...r, ...Object.fromEntries(['fav_min', 'fav_max', 'dog_min', 'dog_max', 'draw_min', 'draw_max', 'min_odds'].map(k => [k, r[k] == null ? null : Number(r[k])])) })) as SoccerRule[]
}
export async function saveRule(r: Partial<SoccerRule> & { id?: number }) {
  const { id, ...rest } = r
  return id ? supabase.from('soccer_rules').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id) : supabase.from('soccer_rules').insert(rest)
}
export interface Line { game_id: string; side: 'home' | 'away' | 'over' | 'under'; line: number; odds: number; books: number }
export async function loadLines(gameIds: string[]): Promise<Line[]> {
  if (!gameIds.length) return []
  const { data } = await supabase.from('soccer_lines').select('game_id, side, line, odds, books').in('game_id', gameIds)
  return ((data ?? []) as any[]).map(l => ({ ...l, line: Number(l.line), odds: Number(l.odds) }))
}

// ── 포아송 골 모형: 마진 뺀 홈승·원정승 확률에 맞는 두 팀 기대 골(λ) → 골차 분포 ──
const pois = (l: number, k: number) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p }
function diffDist(lh: number, la: number): number[] {   // index = 골차 + 10 (홈 기준)
  const d = new Array(21).fill(0)
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) d[h - a + 10] += pois(lh, h) * pois(la, a)
  return d
}
export function fitGoals(pH: number, pA: number): number[] { const { lh, la } = fitLambdas(pH, pA); return diffDist(lh, la) }
// 2.5 오버 = 두 팀 합계 3골 이상 (포아송 λ 합)
export function overProb(lh: number, la: number, line = 2.5): number {
  let under = 0; for (let k = 0; k <= Math.floor(line); k++) under += pois(lh + la, k)
  return 1 - under
}
export function fitLambdas(pH: number, pA: number): { lh: number; la: number } {
  let best = { e: 1e9, lh: 1.4, la: 1.1 }
  const tryIt = (lh: number, la: number) => {
    const d = diffDist(lh, la); let h = 0, a = 0
    for (let i = 0; i < 21; i++) { if (i > 10) h += d[i]; if (i < 10) a += d[i] }
    const e = (h - pH) ** 2 + (a - pA) ** 2
    if (e < best.e) best = { e, lh, la }
  }
  for (let lh = 0.2; lh <= 4.5; lh += 0.1) for (let la = 0.1; la <= 4; la += 0.1) tryIt(lh, la)
  const c = best
  for (let lh = c.lh - 0.1; lh <= c.lh + 0.1; lh += 0.01) for (let la = Math.max(0.05, c.la - 0.1); la <= c.la + 0.1; la += 0.01) tryIt(lh, la)
  return { lh: best.lh, la: best.la }
}
// side 쪽 핸디 line(예: home -1.5, away +2.5)이 맞을 확률
export function lineProb(dist: number[], side: 'home' | 'away', line: number): number {
  let p = 0
  for (let i = 0; i < 21; i++) { const diff = (i - 10) * (side === 'home' ? 1 : -1); if (diff + line > 0) p += dist[i] }
  return p
}

export interface Pick { rule: SoccerRule; side: 'home' | 'away'; team: string; kind: BetKind; line: number | null; odds: number | null; estimated: boolean; books: number | null; prob: number | null; okOdds: boolean; label: string; optLabel: string }
export interface Judged {
  game: { id: string; league: string; start: string; home: string; away: string; sport: string }
  h: number; d: number; a: number; fav: 'home' | 'away'; favOdds: number; dogOdds: number
  picks: Pick[]; reasons: string[]; edge: string[]
}

const between = (v: number, lo: number | null, hi: number | null) => (lo == null || v >= lo) && (hi == null || v <= hi)
const near = (v: number, b: number | null, tol: number) => b != null && Math.abs(v - b) <= tol

export function judge(game: Judged['game'], o: { h: number; d: number; a: number }, rules: SoccerRule[], lines: Line[]): Judged {
  const fav: 'home' | 'away' = o.h <= o.a ? 'home' : 'away', dog = fav === 'home' ? 'away' : 'home'
  const favOdds = Math.min(o.h, o.a), dogOdds = Math.max(o.h, o.a)
  const s = 1 / o.h + 1 / o.d + 1 / o.a
  let lam: { lh: number; la: number } | null = null
  const getLam = () => (lam ??= fitLambdas(1 / o.h / s, 1 / o.a / s))
  let dist: number[] | null = null
  const getDist = () => (dist ??= diffDist(getLam().lh, getLam().la))
  const teamOf = (side: 'home' | 'away') => (side === 'home' ? game.home : game.away)
  const picks: Pick[] = [], reasons: string[] = [], edge: string[] = []
  for (const r of rules.filter(x => x.enabled)) {
    // 조건마다 통과 여부 + 경계 근처(사이트 배당이 조금 다르면 바뀔 수 있음: 정배 ±0.03, 역배·무 ±3%)
    const conds = [
      { ok: between(favOdds, r.fav_min, r.fav_max), near: near(favOdds, r.fav_min, 0.03) || near(favOdds, r.fav_max, 0.03), msg: `정배 ${favOdds} (${r.fav_min ?? ''}~${r.fav_max ?? ''} 밖)` },
      { ok: between(dogOdds, r.dog_min, r.dog_max), near: near(dogOdds, r.dog_min, dogOdds * 0.03) || near(dogOdds, r.dog_max, dogOdds * 0.03), msg: `역배 ${dogOdds}${r.dog_min != null ? ` < ${r.dog_min}` : ''}${r.dog_max != null ? ` > ${r.dog_max}` : ''}` },
      { ok: between(o.d, r.draw_min, r.draw_max), near: near(o.d, r.draw_min, o.d * 0.03) || near(o.d, r.draw_max, o.d * 0.03), msg: `무 ${o.d}${r.draw_max != null ? ` > ${r.draw_max}` : ''}${r.draw_min != null ? ` < ${r.draw_min}` : ''}` },
    ]
    const failed = conds.filter(c => !c.ok)
    // 떨어진 조건이 모두 경계 근처면 '경계 — 확인' (예: 정배 1.29인데 R3 1.30부터)
    if (failed.length) { if (failed.every(c => c.near)) edge.push(`${r.name} ${BET_LABEL[r.bet]}: ${failed.map(c => c.msg).join(' · ')} — 경계, 사이트 배당 확인`); continue }
    const isEdge = conds.some(c => c.near)
    if (r.bet === 'over25') {
      // 2.5 오버 (2026-11-26 사용자 룰: 무 4.0↑ & 오버 배당 1.60↑) — 배당은 해외 북 오버 2.5(soccer_lines side 'over'), 없으면 포아송 추정
      const l = lines.find(x => x.game_id === game.id && x.side === 'over' && x.line === 2.5)
      const prob = overProb(getLam().lh, getLam().la)
      const odds = l ? l.odds : Math.round(0.95 / prob * 100) / 100
      picks.push({ rule: r, side: fav, team: '', kind: r.bet, line: 2.5, odds, estimated: !l, books: l?.books ?? null, prob,
        okOdds: r.min_odds == null || odds >= r.min_odds, optLabel: '2.5 오버', label: `${game.home} vs ${game.away} 2.5 오버` })
      if (isEdge) edge.push(`${r.name}: 조건 경계에 걸쳐 있음 — 사이트 배당 확인`)
      continue
    }
    const side = r.bet.startsWith('fav') ? fav : dog
    const line = r.bet === 'fav_win' ? null : r.bet === 'fav_minus15' ? -1.5 : r.bet === 'fav_plus05' ? 0.5 : r.bet === 'dog_plus15' ? 1.5 : 2.5
    let odds: number | null = null, estimated = false, books: number | null = null, prob: number | null = null
    if (line == null) { odds = favOdds; prob = 1 / (fav === 'home' ? o.h : o.a) / s }
    else {
      const l = lines.find(x => x.game_id === game.id && x.side === side && x.line === line)
      prob = lineProb(getDist(), side, line)
      if (l) { odds = l.odds; books = l.books } else { odds = Math.round(0.95 / prob * 100) / 100; estimated = true }
    }
    const okOdds = r.min_odds == null || (odds != null && odds >= r.min_odds)
    const sideKo = side === 'home' ? '홈' : '원정'
    const optLabel = line == null ? '승리' : `${line} H`   // 기존 축구 기록 문구: '승리' · '0.5 H' · '1.5 H' · '2.5 H' · '-1.5 H'
    picks.push({ rule: r, side, team: teamOf(side), kind: r.bet, line, odds, estimated, books, prob, okOdds, optLabel,
      label: `${teamOf(side)} ${sideKo} ${line == null ? '승리' : `${line > 0 ? '+' : ''}${line}`}` })
    if (isEdge) edge.push(`${r.name}: 조건 경계에 걸쳐 있음 — 사이트 배당 확인`)
  }
  if (!picks.length && !edge.length) {
    // 패스 이유: 정배 구간이 맞는 룰 기준으로 한 줄
    const r = rules.filter(x => x.enabled).find(x => between(favOdds, x.fav_min, x.fav_max))
    reasons.push(r ? `${r.name}: ${[!between(dogOdds, r.dog_min, r.dog_max) ? `역배 ${dogOdds}${r.dog_min != null ? ` < ${r.dog_min}` : ''}${r.dog_max != null ? ` > ${r.dog_max}` : ''}` : '', !between(o.d, r.draw_min, r.draw_max) ? `무 ${o.d}${r.draw_max != null ? ` > ${r.draw_max}` : ''}` : ''].filter(Boolean).join(' · ')}` : `정배 ${favOdds} — 해당 구간 룰 없음`)
  }
  return { game, h: o.h, d: o.d, a: o.a, fav, favOdds, dogOdds, picks, reasons, edge }
}

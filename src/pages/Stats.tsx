import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Sport, Market, Site } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts'
import dayjs from 'dayjs'
import { Trash2, X, Check, Pencil } from 'lucide-react'
import { inferBaseballLeague, inferSoccerLeague, koCompare, KBO_TEAMS, MLB_TEAMS, NPB_TEAMS, type LeagueOverride } from '../lib/league'
import { sportGlyph } from '../components/SportIcons'

const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: 'soccer',     label: '축구', emoji: '⚽' },
  { value: 'baseball',   label: '야구', emoji: '⚾' },
  { value: 'basketball', label: '농구', emoji: '🏀' },
  { value: 'volleyball', label: '배구', emoji: '🏐' },
  { value: 'esports',    label: 'LOL',  emoji: '🎮' },
  { value: 'hockey',     label: '하키', emoji: '🏒' },
  { value: 'other',      label: '기타', emoji: '📋' },
]
const MARKET_LABELS: Record<Market, string> = {
  moneyline:'승패', handicap:'핸디캡', over:'오버', under:'언더', correct_score:'정확한스코어', other:'기타',
}

// ─── 종목별 룰북 요약 (통계 탭 상단 표시용) ───────────────────────────
const RULEBOOK_SUMMARY: Partial<Record<Sport, string[]>> = {
  soccer: [
    '정배 1.20~1.39 → 반대쪽 +2.5 핸디캡',
    '정배 1.40~1.79 → 반대쪽 +1.5 핸디캡',
    '정배 1.80 이상(반대쪽 4.00 미만) → 반대쪽 +0.5 핸디캡',
  ],
  baseball: [
    '언오버 기준점 8.5 (MLB 최빈값, 전 리그 공통 적용)',
    '8.5 이하(언더 정배·투수전) → 역배팀 런라인: +2.5 우선 → 1.40 미만이면 +1.5로 좁힘 (배당 1.40~1.99)',
    '8.5 초과(오버 정배·타격전) → 역배팀 팀득점 오버: 최저 라인부터 1.40~1.99 될 때까지 한 단계씩 상향',
  ],
  basketball: [
    'NBA 기준, 정배 방향 확인 후 언더독 핸디캡 +4.5 ~ +14.5 범위 탐색',
    '배당이 1.90에 가장 가까운 라인 선택 (밴드 1.40~1.99 내)',
  ],
  esports: [
    'BO1 / BO3 / BO5 선택에 따라 베팅 옵션이 달라짐 (기본값 BO3)',
    'BO1: 별도 마켓 없이 팀 선택만으로 확정',
    'BO3: 1.5 플핸 / -1.5 핸디캡 / 일반승 중 선택',
    'BO5: -1.5 핸디캡 / 1.5 플핸 / 3.5 세트오버 / 일반승 중 선택',
    '모든 리그·상시 적용, 배당은 공통 밴드 1.40~1.99',
  ],
}

function RulebookSummaryCard({ sport }: { sport: Sport }) {
  const lines = RULEBOOK_SUMMARY[sport]
  if (!lines) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.3px' }}>📋 룰북 요약 · 전 종목 공통 배당 1.40~1.99</div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.7, paddingLeft: 12, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 0, color: 'var(--text-muted)' }}>·</span>{l}
        </div>
      ))}
    </div>
  )
}

// ─── 공통 유틸 ─────────────────────────────────────────────────────
function calcStats(bets: Bet[]) {
  const settled = bets.filter(b => b.result !== 'pending')
  const wins = settled.filter(b => b.result === 'win')
  const losses = settled.filter(b => b.result === 'loss')
  const pushes = settled.filter(b => b.result === 'push')
  const total = settled.length
  const winRate = total > 0 ? wins.length / total * 100 : 0
  const stake = settled.reduce((s, b) => s + b.stake, 0)
  const profit = settled.reduce((s, b) => s + b.profit, 0)
  const roi = stake > 0 ? profit / stake * 100 : 0
  const avgOdds = total > 0 ? settled.reduce((s, b) => s + b.odds, 0) / total : 0
  return { settled, wins, losses, pushes, total, winRate, stake, profit, roi, avgOdds }
}

// ─── 전체 탭: 종목 × 베팅옵션(승패/핸디캡/오버/언더)별 적중률·수익률을 한 표로 ──────
function MarketTypeOverviewSection({ settled }: { settled: Bet[] }) {
  const MARKET_SPORTS: { value: Sport; label: string; emoji: string }[] = [
    { value: 'soccer', label: '축구', emoji: '⚽' },
    { value: 'baseball', label: '야구', emoji: '⚾' },
    { value: 'basketball', label: '농구', emoji: '🏀' },
    { value: 'volleyball', label: '배구', emoji: '🏐' },
    { value: 'esports', label: 'LOL', emoji: '🎮' },
  ]
  const MARKETS: { value: Market; label: string }[] = [
    { value: 'moneyline', label: '승패' },
    { value: 'handicap', label: '핸디캡' },
    { value: 'over', label: '오버' },
    { value: 'under', label: '언더' },
  ]
  const rows = MARKET_SPORTS.filter(s => settled.some(b => b.sport === s.value))
  if (rows.length === 0) return null

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 8 }}>종목 × 베팅옵션별 성적</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>종목</th>
              {MARKETS.map(m => (
                <th key={m.value} style={{ textAlign: 'center', padding: '4px 6px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{m.label}</th>
              ))}
              <th style={{ textAlign: 'center', padding: '4px 8px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const sportBets = settled.filter(b => b.sport === s.value)
              const totalStats = calcStats(sportBets)
              return (
                <tr key={s.value} style={{ borderBottom: '1px solid var(--border-light)', height: 30 }}>
                  <td style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{s.emoji} {s.label}</td>
                  {MARKETS.map(m => {
                    const mb = sportBets.filter(b => b.market === m.value)
                    const st = mb.length > 0 ? calcStats(mb) : null
                    return (
                      <td key={m.value} style={{ textAlign: 'center', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        {st ? (
                          <>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{st.total}건 · {st.winRate.toFixed(0)}%</div>
                            <div style={{ fontWeight: 700, color: st.roi >= 0 ? 'var(--green)' : 'var(--red)' }}>{st.roi >= 0 ? '+' : ''}{st.roi.toFixed(1)}%</div>
                          </>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, color: totalStats.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{totalStats.profit >= 0 ? '+' : ''}{totalStats.profit.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}% · {totalStats.total}건</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 룰북 기반 통계 행 ─────────────────────────────────────────────
type RowColor = 'S' | 'A' | 'B' | 'none'

const TIER_STYLE: Record<RowColor, { color: string; bg: string; border: string; label: string }> = {
  S:    { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.25)',  label: 'S' },
  A:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  label: 'A' },
  B:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  label: 'B' },
  none: { color: 'var(--text-secondary)', bg: 'transparent', border: 'transparent', label: '—' },
}

interface RuleRow { label: string; bets: Bet[]; tier: RowColor; breakeven?: string }

// ─── 마켓 표별 하단에 붙는 "총 수익률" 요약 줄 ─────────────────────────
function MarketTotalRow({ bets }: { bets: Bet[] }) {
  const s = calcStats(bets)
  if (s.total === 0) return null
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>총 수익률 ({s.total}건)</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: s.winRate >= 50 ? '#4ade80' : '#f87171' }}>{s.winRate.toFixed(0)}%</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</span>
        <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: s.profit >= 0 ? '#4ade80' : '#f87171' }}>{s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString()}원</span>
      </div>
    </div>
  )
}

function RuleStatsTable({ title, rows, extra }: { title: string; rows: RuleRow[]; extra?: React.ReactNode }) {
  const hasBets = rows.some(r => r.bets.filter(b => b.result !== 'pending').length > 0)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', flex: '1 0 250px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{title}</div>
      {!hasBets && <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>데이터 없음</div>}
      {hasBets && (
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700 }}>구간</th>
              <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, padding: '3px 4px' }}>건</th>
              <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, padding: '3px 4px' }}>승률</th>
              <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, padding: '3px 4px' }}>ROI</th>
              <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, padding: '3px 4px' }}>손익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = calcStats(r.bets)
              const ts = TIER_STYLE[r.tier]
              const isEmpty = s.total === 0
              return (
                <tr key={r.label} style={{ borderBottom: '1px solid var(--border-light)', background: isEmpty ? 'transparent' : ts.bg, opacity: isEmpty ? 0.4 : 1 }}>
                  <td style={{ padding: '5px 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {r.tier !== 'none' && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: ts.color, background: ts.bg, border: `1px solid ${ts.border}`, borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>{ts.label}</span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600 }}>{r.label}</span>
                    {r.breakeven && !isEmpty && (
                      <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>손분 {r.breakeven}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', padding: '5px 4px', fontSize: 10, color: 'var(--text-secondary)' }}>{isEmpty ? '—' : s.total}</td>
                  <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                    {isEmpty ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, color: s.winRate >= 50 ? '#4ade80' : '#f87171' }}>{s.winRate.toFixed(0)}%</span>}
                  </td>
                  <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                    {isEmpty ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</span>}
                  </td>
                  <td style={{ textAlign: 'center', padding: '5px 4px', whiteSpace: 'nowrap' }}>
                    {isEmpty ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, color: s.profit >= 0 ? '#4ade80' : '#f87171' }}>{s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString()}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {extra}
    </div>
  )
}

// ─── 그외 베팅 패널 ───────────────────────────────────────────────
function OtherBetsPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  if (!settled.length) return null
  const s = calcStats(settled)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>룰북 외 베팅</div>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>{settled.length}건</span>
        <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 'auto', color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>ROI {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: s.profit >= 0 ? '#4ade80' : '#f87171' }}>{s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString()}원</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
        {settled.slice(0, 30).map(b => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, padding: '4px 6px', background: 'var(--bg-elevated)', borderRadius: 5 }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{b.bet_date.slice(5)}</span>
            <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pick}</span>
            <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>@{b.odds.toFixed(2)}</span>
            <span style={{ fontWeight: 700, flexShrink: 0, color: b.result === 'win' ? '#4ade80' : b.result === 'loss' ? '#f87171' : 'var(--text-muted)' }}>
              {b.result === 'win' ? `+${b.profit.toLocaleString()}` : b.result === 'loss' ? `-${b.stake.toLocaleString()}` : 'PUSH'}
            </span>
          </div>
        ))}
        {settled.length > 30 && <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 4 }}>+ {settled.length - 30}건 더</div>}
      </div>
    </div>
  )
}

// ─── 야구 리그 추론 (팀 이름 기반) ──────────────────────────────
// KBO_TEAMS / MLB_TEAMS / NPB_TEAMS / inferBaseballLeague 는 ../lib/league 에서 가져옴 (Dashboard와 공용)
const inferLeague = inferBaseballLeague

// ─── 야구 상세 통계 (룰북 기반) ──────────────────────────────────
// 배당(odds) 앞의 "N.N 언더/오버" 형태에서 라인 숫자를 추출
function extractTotalLine(pick: string): number | null {
  const m = pick?.match(/(\d+\.?\d*)\s*(?:언더|오버|under|over)/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return isNaN(n) ? null : n
}
function formatLine(n: number): string { return n.toFixed(1).replace(/\.0$/, '') }

// 오버 픽 텍스트에 포함된 야구 팀 이름 개수 — 1개면 팀오버(특정 팀의 득점 오버), 2개면 전체(양팀 합산) 오버로 판별
function countBaseballTeamNames(text: string): number {
  if (!text) return 0
  const all = [...KBO_TEAMS, ...MLB_TEAMS, ...NPB_TEAMS]
  const matched = new Set<string>()
  for (const t of all) if (text.includes(t)) matched.add(t)
  return matched.size
}

// 핸디캡(+N.N / -N.N / 부호없는 N.N) 픽 텍스트에서 라인 숫자 추출 (부호 무관, 절대값).
// 베팅옵션 칩으로 고른 "1.5 핸디"/"-1.5 핸디캡"/"1.5 H"처럼 숫자 뒤에
// "핸디/핸디캡/플핸/마핸/H" 접미어가 붙어 있을 수 있으므로 그 접미어까지 허용하고 문자열 끝 기준으로만 찾는다.
function extractHandicapLine(pick: string): number | null {
  const m = pick?.match(/([+-]?\s*\d+\.?\d*)\s*(?:핸디캡|핸디|플핸|마핸|h)?\s*$/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(/\s+/g, ''))
  return isNaN(n) ? null : Math.abs(n)
}
// 저장된 문구("팀이름 홈 1.5 핸디" / "팀이름 원정")에서 홈/원정 표시를 찾는다 (베팅추가에서 붙인 표시).
function extractSide(match: string): '홈' | '원정' | null {
  const m = match?.match(/(?:^|\s)(홈|원정)(?:\s|$)/)
  return m ? (m[1] as '홈' | '원정') : null
}

// 승패(역배·정배) — 2.1 ~ 2.9 구간을 0.1 단위로 고정 커버 (티어 배지는 더 이상 사용하지 않음) (티어 배지는 더 이상 사용하지 않음)
function baseballMlRows(ml: Bet[]): RuleRow[] {
  const rows: RuleRow[] = []
  for (let lo = 2.1; lo <= 2.9 + 1e-9; lo = Math.round((lo + 0.1) * 10) / 10) {
    const hi = Math.round((lo + 0.1) * 10) / 10
    const rowBets = ml.filter(b => b.odds >= lo && b.odds < hi)
    rows.push({ label: lo.toFixed(1), tier: 'none', bets: rowBets })
  }
  return rows
}


// ─── 야구 리그 판별 (다른 종목과 동일한 로직) ────────────────────────
// bet.league 값이 최우선(직접 지정/자동완성으로 저장된 값), 없으면 팀 이름 기반 KBO/MLB/NPB 추론(과거 데이터 호환),
// 그래도 안 되면 미확인(ETC). 이렇게 하면 KBO/MLB/NPB는 기존과 동일하게 동작하면서
// 사용자가 새 리그를 자유롭게 추가해도 축구/농구 등과 같은 방식으로 통계에 반영된다.
function baseballLeagueKeyOf(b: Bet, overrides: LeagueOverride[]): string {
  if (b.league && b.league.trim()) return b.league.trim()
  return inferLeague(b.match, overrides) ?? 'ETC'
}

// ─── 야구: 일반승 / 오버 / 언더 세 마켓만 — 좌측 리그명(가나다순) 고정, 우측에 마켓별 성적,
// 맨 우측에 3개 마켓 합산 총손익/ROI를 붙인 통합 표 (축구 리그 통합표와 동일한 구조로 갈아엎음) ──
function BaseballDetailPanel({ bets, overrides, knownLeagues, onRenameLeague, onDeleteLeague }: {
  bets: Bet[]
  overrides: LeagueOverride[]; knownLeagues: string[]
  onRenameLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteLeague: (name: string) => Promise<void>
}) {
  const allSettled = bets.filter(b => b.result !== 'pending')
  const leagueKeyOf = (b: Bet) => baseballLeagueKeyOf(b, overrides)
  const FIXED = ['KBO', 'MLB', 'NPB', 'CPBL', 'LMB']
  const allKnownLeagues = Array.from(new Set([...FIXED, ...knownLeagues]))

  const ml = allSettled.filter(b => b.market === 'moneyline')
  const hcap = allSettled.filter(b => b.market === 'handicap')
  // -1.5 마핸(정규 핸디캡, 강팀 쪽)과 5F 0.5 플핸(5회까지 핸디캡)만 추적 — 오버/언더는 제외
  const hcapMinus15 = hcap.filter(b => !/5F/i.test(b.pick) && extractHandicapLine(b.pick) === 1.5 && extractHandicapSign(b.pick) === '-')
  const hcap5f05 = hcap.filter(b => /5F/i.test(b.pick) && extractHandicapLine(b.pick) === 0.5)

  const BASEBALL_MARKETS: { key: 'ml' | 'hcapMinus15' | 'hcap5f05'; label: string; bets: Bet[] }[] = [
    { key: 'ml', label: '일반승', bets: ml },
    { key: 'hcapMinus15', label: '-1.5 마핸', bets: hcapMinus15 },
    { key: 'hcap5f05', label: '5F 0.5 플핸', bets: hcap5f05 },
  ]

  function cellStats(bets: Bet[]) {
    if (!bets.length) return null
    return calcStats(bets)
  }

  // 좌측 리그 목록 — 3개 마켓 중 하나에라도 정산된 베팅이 있는 리그만, 가나다순 (KBO/MLB/NPB 등 고정 리그 + 추가 등록 리그 통합)
  const trackedBets = [...ml, ...hcapMinus15, ...hcap5f05]
  const leaguesWithData = new Set(trackedBets.map(leagueKeyOf))
  const leagueNames = allKnownLeagues.filter(l => leaguesWithData.has(l)).sort(koCompare)

  // 세 마켓에 안 걸리는 나머지(오버/언더/기타 등)는 룰북 외로 이동
  const trackedIds = new Set(trackedBets.map(b => b.id))
  const otherBets = allSettled.filter(b => !trackedIds.has(b.id))

  return (
    <div>
      {/* 리그별 통합 표 */}
      <div style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>⚾ 리그별 성적 (일반승 · -1.5 마핸 · 5F 0.5 플핸, 리그명 가나다순, 맨 우측 3개 마켓 합산)</div>
        {leagueNames.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>리그</th>
                  {BASEBALL_MARKETS.map(m => (
                    <th key={m.key} style={{ textAlign: 'center', padding: '4px 6px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>⚾ {m.label}</th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '4px 8px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>총손익 · ROI</th>
                </tr>
              </thead>
              <tbody>
                {leagueNames.map(league => {
                  const perMarketBets = BASEBALL_MARKETS.map(m => m.bets.filter(b => leagueKeyOf(b) === league))
                  const totalBets = perMarketBets.flat()
                  const totalStats = cellStats(totalBets)
                  return (
                    <tr key={league} style={{ borderBottom: '1px solid var(--border-light)', height: 26 }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{league}</td>
                      {perMarketBets.map((mb, i) => {
                        const s = cellStats(mb)
                        return (
                          <td key={i} style={{ textAlign: 'center', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                            {s ? (
                              <>
                                <span style={{ color: 'var(--text-muted)' }}>{s.total}건 </span>
                                <span style={{ fontWeight: 700, color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(0)}%</span>
                              </>
                            ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>
                        {totalStats ? (
                          <>
                            <span style={{ fontWeight: 700, color: totalStats.profit >= 0 ? '#4ade80' : '#f87171' }}>{totalStats.profit >= 0 ? '+' : ''}{totalStats.profit.toLocaleString()}</span>
                            <span style={{ marginLeft: 6, fontWeight: 700, color: totalStats.roi >= 0 ? '#4ade80' : '#f87171' }}>{totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%</span>
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '8px 0' }}>등록된 리그의 정산 데이터가 없습니다.</div>
        )}

        <div style={{ marginTop: 10 }}>
          <LeagueManageList leagues={knownLeagues} onRename={onRenameLeague} onDelete={onDeleteLeague} />
        </div>
      </div>

      {/* 마켓별 배당 0.1단위 구간 상세 — 적중률 + ROI + 총 수익률(금액 포함) */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RuleStatsTable title="⚾ 일반승 — 0.1단위 배당 구간별" rows={oddsBinRows(ml)} extra={<MarketTotalRow bets={ml} />} />
        <RuleStatsTable title="⚾ -1.5 마핸 — 0.1단위 배당 구간별" rows={oddsBinRows(hcapMinus15)} extra={<MarketTotalRow bets={hcapMinus15} />} />
        <RuleStatsTable title="⚾ 5F 0.5 플핸 — 0.1단위 배당 구간별" rows={oddsBinRows(hcap5f05)} extra={<MarketTotalRow bets={hcap5f05} />} />
      </div>

      <OtherBetsPanel bets={otherBets} />
    </div>
  )
}

// ─── 배당 0.1단위 구간 집계 (공통) ─────────────────────────────────
// 배당*10을 정수 구간 인덱스로 변환해서 묶는다 — 최고 배당이 1.90/2.00처럼 정확히 .0으로
// 떨어지는 경우 그 구간 자체가 통째로 누락되던 부동소수점 버그(loEnd가 한 구간 앞에서
// 멈춤)를 막기 위함. 아주 작은 epsilon만 더해 부동소수점 오차(1.9000000001 등)도 보정한다.
function oddsBucketIndex(odds: number): number {
  return Math.floor(odds * 10 + 1e-6)
}
function oddsBinRows(list: Bet[]): RuleRow[] {
  if (!list.length) return []
  const buckets = list.map(b => oddsBucketIndex(b.odds))
  const minB = Math.min(...buckets)
  const maxB = Math.max(...buckets)
  const rows: RuleRow[] = []
  for (let idx = minB; idx <= maxB; idx++) {
    const rowBets = list.filter(b => oddsBucketIndex(b.odds) === idx)
    if (rowBets.length > 0) rows.push({ label: (idx / 10).toFixed(1), tier: 'none', bets: rowBets })
  }
  return rows
}

// ─── 자유 리그(축구/LOL 등) 판별 ──────────────────────────────────
// bet.league 값이 있으면 그대로 사용(베팅현황에서 직접 지정/자동추론된 값),
// 없는 과거 데이터는 팀 키워드 매핑(soccer_league_overrides / esports_league_overrides)으로 추론.
// 둘 다 없으면 미확인(ETC) 처리.
function freeLeagueOf(b: Bet, overrides: LeagueOverride[]): string {
  if (b.league && b.league.trim()) return b.league.trim()
  return inferSoccerLeague(b.match, overrides) ?? 'ETC'
}

// ─── 등록된 리그 이름 수정/삭제 (축구/LOL 공용) ─────────────────────
function LeagueManageList({ leagues, onRename, onDelete }: {
  leagues: string[]
  onRename: (oldName: string, newName: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  if (!leagues.length) return null
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ marginTop: 8, fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'var(--font-body)',
          border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
        <Pencil size={11} /> 등록된 리그 관리 ({leagues.length})
      </button>
      {open && <LeagueManageModal leagues={leagues} onRename={onRename} onDelete={onDelete} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── 등록된 리그 관리 모달 (수정/삭제, 삭제는 재확인 후 진행) ─────────
function LeagueManageModal({ leagues, onRename, onDelete, onClose }: {
  leagues: string[]
  onRename: (oldName: string, newName: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // 모달이 떠 있는 동안은 뒤쪽 페이지가 휠 스크롤되지 않도록 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  async function submitRename(oldName: string) {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === oldName) { setEditing(null); return }
    setBusy(oldName)
    await onRename(oldName, trimmed)
    setBusy(null); setEditing(null)
  }
  async function confirmDelete(name: string) {
    setBusy(name)
    await onDelete(name)
    setBusy(null); setConfirmTarget(null)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, width: 380, maxWidth: '100%', maxHeight: '75vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>등록된 리그 관리</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={16} /></button>
        </div>
        {leagues.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>등록된 리그가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leagues.map(l => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 30 }}>
                {editing === l ? (
                  <>
                    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(l); if (e.key === 'Escape') setEditing(null) }}
                      className="form-input" style={{ flex: 1, fontSize: 11, padding: '4px 6px' }} />
                    <button onClick={() => submitRename(l)} disabled={busy === l} title="저장"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex', padding: 2 }}><Check size={13} /></button>
                    <button onClick={() => setEditing(null)} disabled={busy === l} title="취소"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
                  </>
                ) : confirmTarget === l ? (
                  <>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>"{l}" 정말 삭제하시겠습니까?</span>
                    <button onClick={() => confirmDelete(l)} disabled={busy === l}
                      style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-body)', border: '1px solid var(--red-border)', background: 'var(--red-bg)', color: 'var(--red)' }}>
                      {busy === l ? '삭제중...' : '삭제'}
                    </button>
                    <button onClick={() => setConfirmTarget(null)} disabled={busy === l}
                      style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-body)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{busy === l ? '처리중...' : l}</span>
                    <button onClick={() => { setEditing(l); setDraft(l) }} disabled={busy !== null} title="이름 수정"
                      style={{ border: 'none', background: 'none', cursor: busy !== null ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><Pencil size={12} /></button>
                    <button onClick={() => setConfirmTarget(l)} disabled={busy !== null} title="리그 삭제"
                      style={{ border: 'none', background: 'none', cursor: busy !== null ? 'not-allowed' : 'pointer', color: 'var(--red)', display: 'flex', padding: 2 }}><Trash2 size={12} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 축구 상세 통계 (배당 흐름 기반 — 마켓별 0.1단위 구간 통계) ──────
function SoccerDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  // market 컬럼이 과거 저장 시점의 분류 버그로 잘못 저장된 경우를 대비해, 문구 자체에서
  // 라인 숫자를 읽어낼 수 있으면(extractHandicapLine) market 값과 무관하게 핸디캡으로 인정한다.
  const hcap = settled.filter(b => b.market === 'handicap' || extractHandicapLine(b.pick) !== null)

  // 홈 0.5/1.5/2.5 플핸, 원정 0.5/1.5/2.5 플핸 — 총 6개 구간으로 나눠서 각각 0.1단위 배당 구간별
  // 적중률·수익률 + 전체 총 수익률을 표시. 그 외(마핸, 일반승, 다른 라인, 오버/언더 등)는 룰북 외로 이동.
  const HCAP_LINES = [0.5, 1.5, 2.5] as const
  const sideTables = HCAP_LINES.flatMap(line => {
    const lineBets = hcap.filter(b => extractHandicapLine(b.pick) === line && extractHandicapSign(b.pick) !== '-')
    const home = lineBets.filter(b => extractSide(b.match) === '홈')
    const away = lineBets.filter(b => extractSide(b.match) === '원정')
    return [
      { title: `⚽ 홈 ${line} 플핸 — 0.1단위 배당 구간별`, rows: oddsBinRows(home), all: home },
      { title: `⚽ 원정 ${line} 플핸 — 0.1단위 배당 구간별`, rows: oddsBinRows(away), all: away },
    ]
  })

  // 언더(2.5/3.5/4.5) — 배당옵션별 + 리그별 (초안)
  const under = settled.filter(b => b.market === 'under')
  const UNDER_LINES = [2.5, 3.5, 4.5]
  const underByLine = UNDER_LINES.map(line => under.filter(b => extractTotalLine(b.pick) === line))

  const ruleIds = new Set([...sideTables.flatMap(t => t.all), ...underByLine.flat()].map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {sideTables.map(t => <RuleStatsTable key={t.title} title={t.title} rows={t.rows} extra={<MarketTotalRow bets={t.all} />} />)}
      </div>
      <SoccerUnderByLeagueSection lines={UNDER_LINES} lineBets={underByLine} />
      <OtherBetsPanel bets={otherBets} />
    </div>
  )
}

// ─── 축구 언더 — 라인별(2.5/3.5/4.5) × 리그별 (초안) ────────────────
// 리그 미지정 베팅은 "미분류"로 묶어서 함께 보여줌. league 컬럼값 그대로 사용(과거 팀 키워드 추론은 적용 안 함).
function SoccerUnderByLeagueSection({ lines, lineBets }: { lines: number[]; lineBets: Bet[][] }) {
  const leagueKeyOf = (b: Bet) => (b.league && b.league.trim()) ? b.league.trim() : '미분류'
  const leagueNames = Array.from(new Set(lineBets.flat().map(leagueKeyOf))).sort(koCompare)

  function cellStats(list: Bet[]) {
    if (!list.length) return null
    return calcStats(list)
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>⚽ 언더 — 라인별 · 리그별 (초안)</div>
      {leagueNames.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>리그</th>
                {lines.map(l => (
                  <th key={l} style={{ textAlign: 'center', padding: '4px 6px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{l} 언더</th>
                ))}
                <th style={{ textAlign: 'center', padding: '4px 8px', fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>총손익 · ROI</th>
              </tr>
            </thead>
            <tbody>
              {leagueNames.map(league => {
                const perLine = lineBets.map(list => list.filter(b => leagueKeyOf(b) === league))
                const totalBets = perLine.flat()
                const totalStats = cellStats(totalBets)
                return (
                  <tr key={league} style={{ borderBottom: '1px solid var(--border-light)', height: 26 }}>
                    <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{league}</td>
                    {perLine.map((lb, i) => {
                      const s = cellStats(lb)
                      return (
                        <td key={i} style={{ textAlign: 'center', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                          {s ? (
                            <>
                              <span style={{ color: 'var(--text-muted)' }}>{s.total}건 </span>
                              <span style={{ fontWeight: 700, color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(0)}%</span>
                            </>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>
                      {totalStats ? (
                        <>
                          <span style={{ fontWeight: 700, color: totalStats.profit >= 0 ? '#4ade80' : '#f87171' }}>{totalStats.profit >= 0 ? '+' : ''}{totalStats.profit.toLocaleString()}</span>
                          <span style={{ marginLeft: 6, fontWeight: 700, color: totalStats.roi >= 0 ? '#4ade80' : '#f87171' }}>{totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%</span>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '8px 0' }}>정산된 언더 베팅이 없습니다.</div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {lines.map((l, i) => (
          <RuleStatsTable key={l} title={`⚽ ${l} 언더 — 0.1단위 배당 구간별`} rows={oddsBinRows(lineBets[i])} extra={<MarketTotalRow bets={lineBets[i]} />} />
        ))}
      </div>
    </div>
  )
}

// ─── 농구 상세 통계 (배당 흐름 기반 — 마켓별 0.1단위 구간 통계) ──────
function BasketballDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const ml = settled.filter(b => b.market === 'moneyline')
  const hcap = settled.filter(b => b.market === 'handicap')
  const overBets = settled.filter(b => b.market === 'over')
  const underBets = settled.filter(b => b.market === 'under')

  // 핸디캡 — 라인별(4.5 ~ 13.5, 1.0단위) 적중률/수익률
  const hcapLineRows: RuleRow[] = (() => {
    const rows: RuleRow[] = []
    for (let line = 4.5; line <= 13.5 + 1e-9; line = Math.round((line + 1.0) * 10) / 10) {
      const lineBets = hcap.filter(b => extractHandicapLine(b.pick) === line)
      rows.push({ label: formatLine(line), tier: 'none', bets: lineBets })
    }
    return rows
  })()

  const tables = [
    { title: '🏀 승패 — 0.1단위 배당 구간별', rows: oddsBinRows(ml) },
    { title: '🏀 오버 — 0.1단위 배당 구간별', rows: oddsBinRows(overBets) },
    { title: '🏀 언더 — 0.1단위 배당 구간별', rows: oddsBinRows(underBets) },
  ].filter(t => t.rows.length > 0)

  const ruleIds = new Set([...tables.flatMap(t => t.rows.flatMap(r => r.bets)), ...hcapLineRows.flatMap(r => r.bets)].map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RuleStatsTable title="🏀 핸디캡 — 라인별(4.5~13.5) 적중률" rows={hcapLineRows} />
        {tables.map(t => <RuleStatsTable key={t.title} title={t.title} rows={t.rows} />)}
      </div>
      <OtherBetsPanel bets={otherBets} />
    </div>
  )
}

// ─── 기타 종목 상세 ───────────────────────────────────────────────
function GenericDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const byMarket = (['moneyline','handicap','over','under'] as Market[]).map(mkt => {
    const mb = settled.filter(b => b.market === mkt)
    if (!mb.length) return null
    const s = calcStats(mb)
    return { mkt, label: { moneyline:'승패', handicap:'핸디캡', over:'오버', under:'언더', correct_score:'정확한스코어', other:'기타' }[mkt], ...s }
  }).filter(Boolean) as ({ mkt: Market; label: string } & ReturnType<typeof calcStats>)[]

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {byMarket.map(r => (
        <div key={r.mkt} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', minWidth: 150 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>{r.label} ({r.total}건)</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: r.roi >= 0 ? '#4ade80' : '#f87171' }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>승률 <span style={{ fontWeight: 700, color: r.winRate >= 50 ? '#4ade80' : '#f87171' }}>{r.winRate.toFixed(1)}%</span></div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>손익 <span style={{ fontWeight: 700, color: r.profit >= 0 ? '#4ade80' : '#f87171' }}>{r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}</span></div>
        </div>
      ))}
    </div>
  )
}


// ─── LOL(e스포츠): 리그별 성적 (가나다순, 승률·ROI·손익) + 미확인 팀 매핑 ──
function GenericLeagueSection({ emoji, bets, overrides, knownLeagues, onRenameLeague, onDeleteLeague }: {
  emoji: string
  bets: Bet[]
  overrides: LeagueOverride[]; knownLeagues: string[]
  onRenameLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteLeague: (name: string) => Promise<void>
}) {
  const allSettled = bets.filter(b => b.result !== 'pending')
  const leagueKeyOf = (b: Bet) => freeLeagueOf(b, overrides)

  const leagueNames = Array.from(new Set(allSettled.map(leagueKeyOf).filter(l => l !== 'ETC'))).sort(koCompare)
  const rows: RuleRow[] = leagueNames.map(l => ({ label: l, tier: 'none', bets: allSettled.filter(b => leagueKeyOf(b) === l) }))

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>{emoji} 리그별 성적 (가나다순)</div>
      {rows.length > 0
        ? <RuleStatsTable title="리그별 승률·ROI·손익" rows={rows} />
        : <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>정산된 베팅이 없습니다.</div>}

      <div style={{ marginTop: 10 }}>
        <LeagueManageList leagues={knownLeagues} onRename={onRenameLeague} onDelete={onDeleteLeague} />
      </div>
    </div>
  )
}

interface LeagueSectionProps {
  bets: Bet[]
  overrides: LeagueOverride[]; knownLeagues: string[]
  onRenameLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteLeague: (name: string) => Promise<void>
}

// LOL 베팅 내용(match 텍스트)을 베팅 옵션(일반승/핸디캡/세트승)으로 분류.
// "N세트 승"이 "일반승"보다 먼저 걸려야 한다(둘 다 "승"으로 끝나므로 세트 패턴을 먼저 체크).
function classifyLolOption(content: string): '일반승' | '핸디캡' | '세트승' | '기타' {
  const s = content.trim()
  if (/\d+세트\s*승\s*$/.test(s)) return '세트승'
  if (/[+-]?\d+(\.\d+)?\s*(?:핸디캡|핸디|플핸|마핸|h)?\s*$/i.test(s)) return '핸디캡'
  if (/승\s*$/.test(s) || /\bml\s*$/i.test(s)) return '일반승'
  return '기타'
}

function extractHandicapSign(pick: string): '+' | '-' | null {
  const m = pick?.match(/([+-])\s*\d+\.?\d*\s*(?:핸디캡|핸디|플핸|마핸|h)?\s*$/i)
  return m ? (m[1] as '+' | '-') : null
}

// ─── LOL(e스포츠) 전용: 베팅 옵션별 — 일반승/마핸/플핸/세트승 각각 0.1단위 배당 구간별 성적 ──
function EsportsMarketTypeSection({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const ml = settled.filter(b => classifyLolOption(b.match) === '일반승')
  const setWin = settled.filter(b => classifyLolOption(b.match) === '세트승')
  const hcap = settled.filter(b => classifyLolOption(b.match) === '핸디캡')
  const hcapMinus = hcap.filter(b => extractHandicapSign(b.match) === '-') // 마핸(강팀)
  const hcapPlus = hcap.filter(b => extractHandicapSign(b.match) === '+') // 플핸(약팀)

  const tables = [
    { title: '🎮 일반승 — 0.1단위 배당 구간별', rows: oddsBinRows(ml) },
    { title: '🎮 마이너스 핸디캡(강팀) — 0.1단위 배당 구간별', rows: oddsBinRows(hcapMinus) },
    { title: '🎮 플러스 핸디캡(약팀) — 0.1단위 배당 구간별', rows: oddsBinRows(hcapPlus) },
    { title: '🎮 세트승 — 0.1단위 배당 구간별', rows: oddsBinRows(setWin) },
  ].filter(t => t.rows.length > 0)

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>🎮 베팅 옵션별 성적 (배당 0.1단위 구간)</div>
      {tables.length > 0 ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {tables.map(t => <RuleStatsTable key={t.title} title={t.title} rows={t.rows} />)}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>정산된 LOL 베팅이 없습니다.</div>
      )}
    </div>
  )
}

function EsportsDetailPanel(props: LeagueSectionProps) {
  return (
    <div>
      <GenericLeagueSection emoji="🎮" {...props} />
      <EsportsMarketTypeSection bets={props.bets} />
    </div>
  )
}

function BasketballLeagueDetailPanel(props: LeagueSectionProps) {
  return (
    <div>
      <GenericLeagueSection emoji="🏀" {...props} />
      <BasketballDetailPanel bets={props.bets} />
    </div>
  )
}

function VolleyballDetailPanel(props: LeagueSectionProps) {
  return (
    <div>
      <GenericLeagueSection emoji="🏐" {...props} />
      <GenericDetailPanel bets={props.bets} />
    </div>
  )
}


/* ── 데이터 삭제 대상 (종목 / 라이브 공용) ── */
interface DeleteTarget { label: string; emoji: string; matchFn: (b: Bet) => boolean }

/* ── 데이터 삭제 모달 (종목 / 라이브 공용) ── */
function DeleteBetsModal({ target, bets, onClose, onDeleted }: {
  target: DeleteTarget; bets: Bet[]; onClose: () => void; onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const allMatched = bets.filter(target.matchFn)
  // 진행중(pending) 베팅은 절대 삭제 대상에 포함하지 않음 — 결과 처리 전까지는 보존
  const matchedBets = allMatched.filter(b => b.result !== 'pending')
  const pendingBets = allMatched.filter(b => b.result === 'pending')
  const CONFIRM_WORD = target.label

  async function doDelete() {
    if (confirm !== CONFIRM_WORD || matchedBets.length === 0) return
    setDeleting(true)
    const ids = matchedBets.map(b => b.id)
    // 배치 삭제 (in 조건)
    const { error } = await supabase.from('bets').delete().in('id', ids)
    if (!error) {
      // 각 건별로 삭제 로그 기록 (before_data 보존 → 되돌리기/복구 가능하도록)
      await Promise.all(matchedBets.map(b => logAction({
        action_type: 'delete', table_name: 'bets', record_id: b.id,
        before_data: b as unknown as Record<string, unknown>,
        description: `${target.label} 데이터 일괄삭제: ${b.match}`,
      })))
    }
    setDeleting(false)
    if (!error) { onDeleted(); onClose() }
    else alert('삭제 실패: ' + error.message)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Trash2 size={16} color="var(--red)" />
          {target.emoji} {target.label} 데이터 삭제
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2 }}><X size={15} /></button>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-sm)', marginBottom: 10, fontSize: 12, color: 'var(--red)' }}>
          ⚠️ <strong>{target.label}</strong> 결과처리 완료 데이터 <strong>{matchedBets.length}건</strong>이 영구 삭제됩니다.<br />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>이 작업은 되돌릴 수 없습니다.</span>
        </div>
        {pendingBets.length > 0 && (
          <div style={{ padding: '8px 12px', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 11, color: 'var(--green)' }}>
            ✓ 진행중(대기) 베팅 <strong>{pendingBets.length}건</strong>은 삭제되지 않고 베팅현황에 그대로 유지됩니다.
          </div>
        )}
        {matchedBets.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '8px 0' }}>삭제할 완료 데이터가 없습니다.</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
              확인을 위해 <strong style={{ color: 'var(--text-primary)' }}>"{CONFIRM_WORD}"</strong> 를 입력하세요
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                placeholder={CONFIRM_WORD}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirm === CONFIRM_WORD && doDelete()}
                autoFocus
              />
              <button
                className="btn"
                style={{ background: 'var(--red)', color: '#fff', border: 'none', flexShrink: 0, opacity: confirm !== CONFIRM_WORD ? 0.4 : 1 }}
                disabled={confirm !== CONFIRM_WORD || deleting}
                onClick={doDelete}
              >
                {deleting ? '삭제중...' : '삭제'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// ─── 라이브 베팅 전용 통계 (모든 종목 통합, 종목별/체결 로그 병행 표시) ──
function LivePanel({ bets, onDeleteRequest }: { bets: Bet[]; onDeleteRequest: () => void }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const stats = calcStats(settled)
  const bySport = SPORTS.map(s => ({ ...s, ...calcStats(settled.filter(b => b.sport === s.value)) })).filter(r => r.total > 0)

  if (stats.total === 0) return (
    <div>
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>🔴 결과 처리된 라이브 베팅이 없습니다</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        {[
          { label: '승률', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins.length}W ${stats.losses.length}L`, cls: stats.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
          { label: '총 손익', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit.toLocaleString()}`, sub: `${stats.total}건`, cls: stats.profit >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: `${stats.stake.toLocaleString()}`, cls: stats.roi >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: '평균 배당', value: stats.avgOdds.toFixed(2), sub: '', cls: '' },
        ].map(t => (
          <div key={t.label} className="card stat-tile" style={{ flex: '1 0 110px', maxWidth: 160, padding: '10px 12px' }}>
            <div className={`stat-value ${t.cls}`} style={{ fontSize: 16 }}>{t.value}</div>
            <div className="stat-label">{t.label}</div>
            {t.sub && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t.sub}</div>}
          </div>
        ))}
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>

      {bySport.length > 0 && (
        <div className="card" style={{ width: 320 }}>
          <div className="card-title">종목별 성적</div>
          <table style={{ width: '100%' }}>
            <thead><tr><th>종목</th><th className="td-right">건</th><th className="td-right">승률</th><th className="td-right">ROI</th><th className="td-right">손익</th></tr></thead>
            <tbody>
              {bySport.map(r => (
                <tr key={r.value}>
                  <td style={{ fontWeight: 700, fontSize: 11 }}>{r.emoji} {r.label}</td>
                  <td className="td-right" style={{ color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.total}</td>
                  <td className="td-right" style={{ whiteSpace: 'nowrap' }}><span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.winRate.toFixed(0)}%</span></td>
                  <td className="td-right" style={{ whiteSpace: 'nowrap' }}><span className={r.roi >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span></td>
                  <td className="td-right" style={{ whiteSpace: 'nowrap' }}><span className={r.profit >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settled.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>🔴 라이브 베팅 내역</div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>{settled.length}건</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {settled.slice().sort((a, b) => b.bet_date.localeCompare(a.bet_date)).slice(0, 50).map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, padding: '4px 6px', background: 'var(--bg-elevated)', borderRadius: 5 }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{b.bet_date.slice(5)}</span>
                <span style={{ flexShrink: 0 }}>{sportGlyph(b.sport) ?? '📋'}</span>
                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pick}</span>
                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>@{b.odds.toFixed(2)}</span>
                <span style={{ fontWeight: 700, flexShrink: 0, color: b.result === 'win' ? '#4ade80' : b.result === 'loss' ? '#f87171' : 'var(--text-muted)' }}>
                  {b.result === 'win' ? `+${b.profit.toLocaleString()}` : b.result === 'loss' ? `-${b.stake.toLocaleString()}` : 'PUSH'}
                </span>
              </div>
            ))}
            {settled.length > 50 && <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 4 }}>+ {settled.length - 50}건 더</div>}
          </div>
        </div>
      )}
    </div>
  )
}


function SportPanel({ bets, sport, onDeleteRequest, leagueOverrides, baseballLeagues, onRenameBaseballLeague, onDeleteBaseballLeague, esportsOverrides, esportsLeagues, onRenameEsportsLeague, onDeleteEsportsLeague, basketballOverrides, basketballLeagues, onRenameBasketballLeague, onDeleteBasketballLeague, volleyballOverrides, volleyballLeagues, onRenameVolleyballLeague, onDeleteVolleyballLeague }: {
  bets: Bet[]; sport: typeof SPORTS[0]; onDeleteRequest: () => void
  leagueOverrides: LeagueOverride[]
  baseballLeagues: string[]
  onRenameBaseballLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteBaseballLeague: (name: string) => Promise<void>
  esportsOverrides: LeagueOverride[]; esportsLeagues: string[]
  onRenameEsportsLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteEsportsLeague: (name: string) => Promise<void>
  basketballOverrides: LeagueOverride[]; basketballLeagues: string[]
  onRenameBasketballLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteBasketballLeague: (name: string) => Promise<void>
  volleyballOverrides: LeagueOverride[]; volleyballLeagues: string[]
  onRenameVolleyballLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteVolleyballLeague: (name: string) => Promise<void>
}) {
  const periodBets = bets.filter(b => b.sport === sport.value)
  const sb    = periodBets
  const stats = calcStats(sb)
  const byMarket = (['moneyline', 'handicap', 'over', 'under'] as Market[]).map(mkt => {
    const mb = sb.filter(b => b.market === mkt && b.result !== 'pending')
    if (!mb.length) return null
    const s = calcStats(mb)
    return { mkt, label: MARKET_LABELS[mkt], ...s }
  }).filter(Boolean) as ({ mkt: Market; label: string } & ReturnType<typeof calcStats>)[]

  if (stats.total === 0) return (
    <div>
      <RulebookSummaryCard sport={sport.value} />
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>결과 처리된 베팅이 없습니다</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>
    </div>
  )

  const profitCurve = (() => {
    let cum = 0
    return stats.settled.sort((a, b) => a.bet_date.localeCompare(b.bet_date)).map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <RulebookSummaryCard sport={sport.value} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        {[
          { label: '승률', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins.length}W ${stats.losses.length}L`, cls: stats.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
          { label: '총 손익', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit.toLocaleString()}`, sub: `${stats.total}건`, cls: stats.profit >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: `${stats.stake.toLocaleString()}`, cls: stats.roi >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: '평균 배당', value: stats.avgOdds.toFixed(2), sub: '', cls: '' },
        ].map(t => (
          <div key={t.label} className="card stat-tile" style={{ flex: '1 0 110px', maxWidth: 160, padding: '10px 12px' }}>
            <div className={`stat-value ${t.cls}`} style={{ fontSize: 16 }}>{t.value}</div>
            <div className="stat-label">{t.label}</div>
            {t.sub && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t.sub}</div>}
          </div>
        ))}
        {/* 삭제 버튼 */}
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {byMarket.length > 0 && sport.value !== 'soccer' && (
          <div className="card" style={{ width: 280, flexShrink: 0 }}>
            <div className="card-title">마켓별 성적</div>
            <table style={{ width: '100%' }}>
              <thead><tr><th>마켓</th><th className="td-right">건</th><th className="td-right">승률</th><th className="td-right">ROI</th><th className="td-right">손익</th></tr></thead>
              <tbody>
                {byMarket.map(r => (
                  <tr key={r.mkt}>
                    <td style={{ fontWeight: 700, fontSize: 11 }}>{r.label}</td>
                    <td className="td-right" style={{ color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.total}</td>
                    <td className="td-right" style={{ whiteSpace: 'nowrap' }}><span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.winRate.toFixed(0)}%</span></td>
                    <td className="td-right" style={{ whiteSpace: 'nowrap' }}><span className={r.roi >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span></td>
                    <td className="td-right" style={{ whiteSpace: 'nowrap' }}><span className={r.profit >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sport.value === 'baseball'   && <BaseballDetailPanel bets={periodBets} overrides={leagueOverrides} knownLeagues={baseballLeagues} onRenameLeague={onRenameBaseballLeague} onDeleteLeague={onDeleteBaseballLeague} />}
        {sport.value === 'soccer'     && <SoccerDetailPanel bets={periodBets} />}
        {sport.value === 'basketball' && <BasketballLeagueDetailPanel bets={periodBets} overrides={basketballOverrides} knownLeagues={basketballLeagues} onRenameLeague={onRenameBasketballLeague} onDeleteLeague={onDeleteBasketballLeague} />}
        {sport.value === 'esports'    && <EsportsDetailPanel bets={periodBets} overrides={esportsOverrides} knownLeagues={esportsLeagues} onRenameLeague={onRenameEsportsLeague} onDeleteLeague={onDeleteEsportsLeague} />}
        {sport.value === 'volleyball' && <VolleyballDetailPanel bets={periodBets} overrides={volleyballOverrides} knownLeagues={volleyballLeagues} onRenameLeague={onRenameVolleyballLeague} onDeleteLeague={onDeleteVolleyballLeague} />}
        {!['baseball','soccer','basketball','esports','volleyball'].includes(sport.value) && <GenericDetailPanel bets={periodBets} />}
      </div>

      {profitCurve.length > 1 && (
        <div className="card">
          <div className="card-title">누적 손익 곡선</div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id={`pg-${sport.value}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={v => (v/1000).toFixed(0)+'K'} />
              <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                formatter={(v: number) => [`${v.toLocaleString()}`, '누적손익']} labelFormatter={l => dayjs(l).format('MM/DD')} />
              <Area type="monotone" dataKey="profit" stroke={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill={`url(#pg-${sport.value})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Stats() {
  const [rawBets, setRawBets] = useState<Bet[]>([])
  const [sites, setSites]     = useState<Site[]>([])
  const [rateMap, setRateMap] = useState<Record<string, number>>({})
  const [period, setPeriod]   = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [activeSport, setActiveSport] = useState<Sport | 'all' | 'parlay' | 'live'>('all')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [leagueOverrides, setLeagueOverrides] = useState<LeagueOverride[]>([])
  const [baseballLeagues, setBaseballLeagues] = useState<string[]>([])
  const [esportsOverrides, setEsportsOverrides] = useState<LeagueOverride[]>([])
  const [esportsLeagues, setEsportsLeagues] = useState<string[]>([])
  const [basketballOverrides, setBasketballOverrides] = useState<LeagueOverride[]>([])
  const [basketballLeagues, setBasketballLeagues] = useState<string[]>([])
  const [volleyballOverrides, setVolleyballOverrides] = useState<LeagueOverride[]>([])
  const [volleyballLeagues, setVolleyballLeagues] = useState<string[]>([])

  const BASEBALL_FIXED_LEAGUES = ['KBO', 'MLB', 'NPB', 'CPBL', 'LMB']

  useEffect(() => { loadBets(); loadSites(); loadRates(); loadBaseballLeagueData(); loadEsportsLeagueData(); loadBasketballLeagueData(); loadVolleyballLeagueData() }, [])
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').order('bet_date').order('created_at')
    if (data) setRawBets(data)
  }
  async function loadSites() {
    const { data } = await supabase.from('sites').select('*')
    if (data) setSites(data)
  }
  async function loadRates() {
    const { data } = await supabase.from('exchange_rates').select('rate_date, usd_krw').order('rate_date')
    if (data) {
      const map: Record<string, number> = {}
      data.forEach(r => { map[r.rate_date] = r.usd_krw })
      setRateMap(map)
    }
  }
  // 야구 리그 — 기존 league_overrides 테이블(팀 키워드→리그)은 그대로 쓰되,
  // KBO/MLB/NPB 외에 사용자가 추가한 리그는 baseball_leagues 테이블에 등록해 축구/농구 등과 같은 방식으로 관리
  async function loadBaseballLeagueData() {
    const [{ data: ovr }, { data: leagues }] = await Promise.all([
      supabase.from('league_overrides').select('keyword, league'),
      supabase.from('baseball_leagues').select('name').order('sort_order').order('name'),
    ])
    if (ovr) setLeagueOverrides(ovr as LeagueOverride[])
    const custom = Array.from(new Set([...(leagues ?? []).map(l => l.name), ...(ovr ?? []).map(o => o.league)]))
      .filter(l => !BASEBALL_FIXED_LEAGUES.includes(l)).sort(koCompare)
    setBaseballLeagues(custom)
  }
  async function renameBaseballLeague(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName || BASEBALL_FIXED_LEAGUES.includes(oldName)) return
    await supabase.from('baseball_leagues').update({ name: newName }).eq('name', oldName)
    await supabase.from('league_overrides').update({ league: newName }).eq('league', oldName)
    await supabase.from('bets').update({ league: newName }).eq('league', oldName).eq('sport', 'baseball')
    await Promise.all([loadBaseballLeagueData(), loadBets()])
  }
  async function deleteBaseballLeague(name: string) {
    if (BASEBALL_FIXED_LEAGUES.includes(name)) return
    await supabase.from('league_overrides').delete().eq('league', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'baseball')
    await supabase.from('baseball_leagues').delete().eq('name', name)
    await Promise.all([loadBaseballLeagueData(), loadBets()])
  }
  async function loadEsportsLeagueData() {
    const [{ data: ovr }, { data: leagues }] = await Promise.all([
      supabase.from('esports_league_overrides').select('keyword, league'),
      supabase.from('esports_leagues').select('name').order('sort_order').order('name'),
    ])
    if (ovr) setEsportsOverrides(ovr as LeagueOverride[])
    setEsportsLeagues(Array.from(new Set([...(leagues ?? []).map(l => l.name), ...(ovr ?? []).map(o => o.league)])).sort(koCompare))
  }
  async function renameEsportsLeague(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return
    await supabase.from('esports_leagues').update({ name: newName }).eq('name', oldName)
    await supabase.from('esports_league_overrides').update({ league: newName }).eq('league', oldName)
    await supabase.from('bets').update({ league: newName }).eq('league', oldName).eq('sport', 'esports')
    await Promise.all([loadEsportsLeagueData(), loadBets()])
  }
  async function deleteEsportsLeague(name: string) {
    await supabase.from('esports_league_overrides').delete().eq('league', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'esports')
    await supabase.from('esports_leagues').delete().eq('name', name)
    await Promise.all([loadEsportsLeagueData(), loadBets()])
  }

  async function loadBasketballLeagueData() {
    const [{ data: ovr }, { data: leagues }] = await Promise.all([
      supabase.from('basketball_league_overrides').select('keyword, league'),
      supabase.from('basketball_leagues').select('name').order('sort_order').order('name'),
    ])
    if (ovr) setBasketballOverrides(ovr as LeagueOverride[])
    setBasketballLeagues(Array.from(new Set([...(leagues ?? []).map(l => l.name), ...(ovr ?? []).map(o => o.league)])).sort(koCompare))
  }
  async function renameBasketballLeague(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return
    await supabase.from('basketball_leagues').update({ name: newName }).eq('name', oldName)
    await supabase.from('basketball_league_overrides').update({ league: newName }).eq('league', oldName)
    await supabase.from('bets').update({ league: newName }).eq('league', oldName).eq('sport', 'basketball')
    await Promise.all([loadBasketballLeagueData(), loadBets()])
  }
  async function deleteBasketballLeague(name: string) {
    await supabase.from('basketball_league_overrides').delete().eq('league', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'basketball')
    await supabase.from('basketball_leagues').delete().eq('name', name)
    await Promise.all([loadBasketballLeagueData(), loadBets()])
  }

  async function loadVolleyballLeagueData() {
    const [{ data: ovr }, { data: leagues }] = await Promise.all([
      supabase.from('volleyball_league_overrides').select('keyword, league'),
      supabase.from('volleyball_leagues').select('name').order('sort_order').order('name'),
    ])
    if (ovr) setVolleyballOverrides(ovr as LeagueOverride[])
    setVolleyballLeagues(Array.from(new Set([...(leagues ?? []).map(l => l.name), ...(ovr ?? []).map(o => o.league)])).sort(koCompare))
  }
  async function renameVolleyballLeague(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return
    await supabase.from('volleyball_leagues').update({ name: newName }).eq('name', oldName)
    await supabase.from('volleyball_league_overrides').update({ league: newName }).eq('league', oldName)
    await supabase.from('bets').update({ league: newName }).eq('league', oldName).eq('sport', 'volleyball')
    await Promise.all([loadVolleyballLeagueData(), loadBets()])
  }
  async function deleteVolleyballLeague(name: string) {
    await supabase.from('volleyball_league_overrides').delete().eq('league', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'volleyball')
    await supabase.from('volleyball_leagues').delete().eq('name', name)
    await Promise.all([loadVolleyballLeagueData(), loadBets()])
  }

  // 달러 사이트 베팅을 원화로 환산 — 결과처리 시점에 저장된 환율 우선,
  // 없으면(과거 데이터 등) 베팅일 기준 가장 가까운 캐시 환율 사용, 그마저 없으면 최근 환율/기본값
  const FALLBACK_USD_KRW = 1350
  const rateDates = Object.keys(rateMap).sort()
  function nearestRate(betDate: string): number {
    if (rateMap[betDate]) return rateMap[betDate]
    if (!rateDates.length) return FALLBACK_USD_KRW
    let best = rateDates[0]; let bestDiff = Infinity
    for (const d of rateDates) {
      const diff = Math.abs(dayjs(d).diff(dayjs(betDate), 'day'))
      if (diff < bestDiff) { bestDiff = diff; best = d }
    }
    return rateMap[best] ?? FALLBACK_USD_KRW
  }
  const siteCurrency = new Map(sites.map(s => [s.id, s.currency]))
  const bets: Bet[] = rawBets.map(b => {
    if (siteCurrency.get(b.site_id ?? '') !== 'usd') return b
    const rate = b.usd_krw_rate ?? nearestRate(b.bet_date)
    return { ...b, stake: Math.round(b.stake * rate), profit: Math.round(b.profit * rate) }
  })

  const periodAll = bets.filter(b => {
    if (period === 'all') return true
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return dayjs(b.bet_date).isAfter(dayjs().subtract(days, 'day'))
  })
  // 두폴(합산) 베팅은 개별 다리로 중복 집계되지 않도록 일반/종목별 통계에서는 제외하고, 별도로 집계한다.
  // 라이브 체크된 베팅도 각 종목/전체 통계에서 제외하고 "라이브" 탭에서만 별도로 집계한다.
  const periodFiltered = periodAll.filter(b => b.parlay_group === null && !b.is_live)
  const liveBets = periodAll.filter(b => b.is_live)
  // 두폴은 leg1에만 실제 stake/profit이 기록되므로 leg1만 뽑아서 "다폴 한 건" 단위로 집계
  const parlayLegs = periodAll.filter(b => b.parlay_group !== null && b.parlay_leg === 1)
  const parlayStats = calcStats(parlayLegs)
  // 그룹별 다리 수 계산 (기간 필터 기준 — 표시용) 및 전체 기준 (삭제 매칭용, 기간 무관)
  const periodGroupLegCount: Record<string, number> = {}
  periodAll.forEach(b => { if (b.parlay_group) periodGroupLegCount[b.parlay_group] = (periodGroupLegCount[b.parlay_group] ?? 0) + 1 })
  const fullGroupLegCount: Record<string, number> = {}
  bets.forEach(b => { if (b.parlay_group) fullGroupLegCount[b.parlay_group] = (fullGroupLegCount[b.parlay_group] ?? 0) + 1 })
  const parlay2Legs = parlayLegs.filter(b => periodGroupLegCount[b.parlay_group!] === 2)
  const parlay3Legs = parlayLegs.filter(b => periodGroupLegCount[b.parlay_group!] === 3)
  const parlay4pLegs = parlayLegs.filter(b => (periodGroupLegCount[b.parlay_group!] ?? 0) >= 4)
  const parlay2Stats = calcStats(parlay2Legs)
  const parlay3Stats = calcStats(parlay3Legs)
  const parlay4pStats = calcStats(parlay4pLegs)

  const stats   = calcStats(periodFiltered)
  const settled = periodFiltered.filter(b => b.result !== 'pending')
  const sportCounts = SPORTS.map(s => ({ ...s, count: settled.filter(b => b.sport === s.value).length }))

  // 총 손익 전일 대비 — 기간 필터와 무관하게 항상 오늘 하루치 손익과 어제 하루치 손익을 비교
  const todayStr = dayjs().format('YYYY-MM-DD')
  const yesterdayStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  const todayProfit = bets.filter(b => b.result !== 'pending' && b.bet_date === todayStr).reduce((a, b) => a + b.profit, 0)
  const yesterdayProfit = bets.filter(b => b.result !== 'pending' && b.bet_date === yesterdayStr).reduce((a, b) => a + b.profit, 0)
  const dodDelta = todayProfit - yesterdayProfit

  const profitCurve = (() => {
    let cum = 0
    return settled.sort((a, b) => a.bet_date.localeCompare(b.bet_date)).map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  const bySport = sportCounts.filter(s => s.count > 0).map(s => {
    const sb = settled.filter(b => b.sport === s.value)
    return { label: s.label, winRate: Math.round(sb.filter(b => b.result === 'win').length / sb.length * 100), count: sb.length }
  })

  return (
    <div className="page">
      <div className="flex-between mb-16">
        <h1 className="page-title">통계</h1>
        <div className="filter-bar" style={{ margin: 0 }}>
          {(['all','7d','30d','90d'] as const).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'all' ? '전체' : p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
            </button>
          ))}
        </div>
      </div>

      <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {([
              { value: 'all' as const, label: '전체', emoji: '📊', cnt: settled.length },
              { value: 'soccer' as const, label: '축구', emoji: '⚽', cnt: settled.filter(b => b.sport === 'soccer').length },
              { value: 'baseball' as const, label: '야구', emoji: '⚾', cnt: settled.filter(b => b.sport === 'baseball').length },
              { value: 'basketball' as const, label: '농구', emoji: '🏀', cnt: settled.filter(b => b.sport === 'basketball').length },
              { value: 'volleyball' as const, label: '배구', emoji: '🏐', cnt: settled.filter(b => b.sport === 'volleyball').length },
              { value: 'esports' as const, label: 'LOL', emoji: '🎮', cnt: settled.filter(b => b.sport === 'esports').length },
              { value: 'hockey' as const, label: '하키', emoji: '🏒', cnt: settled.filter(b => b.sport === 'hockey').length },
              { value: 'parlay' as const, label: '다폴', emoji: '🔗', cnt: parlayStats.total },
              { value: 'live' as const, label: '라이브', emoji: '🔴', cnt: liveBets.filter(b => b.result !== 'pending').length },
            ]).map(s => (
              <button key={s.value}
                onClick={() => setActiveSport(s.value)}
                style={{ padding: '10px 20px', borderRadius: 8, border: activeSport === s.value ? '2px solid var(--gold)' : '1px solid var(--border)', background: activeSport === s.value ? 'var(--gold-bg)' : 'var(--bg-card)', color: activeSport === s.value ? 'var(--gold)' : 'var(--text-secondary)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
                {(s.value === 'parlay' || s.value === 'live') ? <span style={{ fontSize: 17 }}>{s.emoji}</span> : (sportGlyph(s.value as Sport, '1.3em') ?? <span style={{ fontSize: 17 }}>{s.emoji}</span>)} {s.label} <span style={{ opacity: 0.7, fontSize: 12 }}>({s.cnt})</span>
              </button>
            ))}
          </div>

          {activeSport === 'all' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: '승률', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins.length}W ${stats.losses.length}L ${stats.pushes.length}P`, cls: stats.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
                  { label: '총 손익', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit.toLocaleString()}`, sub: `${stats.total}건`, cls: stats.profit >= 0 ? 'profit-pos' : 'profit-neg' },
                  { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: `${stats.stake.toLocaleString()}`, cls: stats.roi >= 0 ? 'profit-pos' : 'profit-neg' },
                  { label: '평균 배당', value: stats.avgOdds.toFixed(2), sub: '', cls: '' },
                ].map(t => (
                  <div key={t.label} className="card stat-tile" style={{ flex: '1 0 120px', maxWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <div className={`stat-value ${t.cls}`}>{t.value}</div>
                      {t.label === '총 손익' && dodDelta !== 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: dodDelta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          전일대비 {dodDelta >= 0 ? '+' : ''}{dodDelta.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="stat-label">{t.label}</div>
                    {t.sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{t.sub}</div>}
                  </div>
                ))}
              </div>

              <MarketTypeOverviewSection settled={settled} />

              <div>
                <div className="card-title" style={{ marginBottom: 8 }}>종목별 수익률</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { value: 'soccer', label: '축구', emoji: '⚽' },
                    { value: 'baseball', label: '야구', emoji: '⚾' },
                    { value: 'basketball', label: '농구', emoji: '🏀' },
                    { value: 'volleyball', label: '배구', emoji: '🏐' },
                    { value: 'hockey', label: '하키', emoji: '🏒' },
                    { value: 'esports', label: 'LOL', emoji: '🎮' },
                  ]).map(s => {
                    const sb = settled.filter(b => b.sport === s.value)
                    const wins = sb.filter(b => b.result === 'win').length
                    const wr = Math.round(wins / sb.length * 100)
                    const profit = sb.reduce((acc, b) => acc + b.profit, 0)
                    const stake = sb.reduce((acc, b) => acc + b.stake, 0)
                    const roi = stake > 0 ? profit / stake * 100 : 0
                    const isPos = profit > 0
                    return (
                      <div key={s.value}
                        onClick={() => setActiveSport(s.value as Sport)}
                        style={{ flex: '1 0 140px', background: 'var(--bg-card)', border: `1px solid ${isPos ? 'var(--green-border)' : 'var(--red-border)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{sportGlyph(s.value, '1.3em') ?? <span style={{ fontSize: 16 }}>{s.emoji}</span>} {s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)', color: isPos ? 'var(--green)' : 'var(--red)', marginBottom: 2 }}>
                          {isPos ? '+' : ''}{profit.toLocaleString()}원
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>승률 <span style={{ color: wr >= 50 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{wr}%</span></span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ROI <span style={{ color: isPos ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{roi >= 0 ? '+' : ''}{roi.toFixed(1)}%</span></span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sb.length}건</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {(() => {
                const trendSports = ([
                  { value: 'soccer' as const,     label: '축구',   color: '#3498db' },
                  { value: 'baseball' as const,    label: '야구',   color: '#e74c3c' },
                  { value: 'basketball' as const,  label: '농구',   color: '#f39c12' },
                  { value: 'volleyball' as const,  label: '배구',   color: '#9b59b6' },
                  { value: 'hockey' as const,      label: '하키',   color: '#1abc9c' },
                  { value: 'esports' as const,     label: 'LOL',    color: '#2ecc71' },
                ]).filter(s => settled.some(b => b.sport === s.value))
                if (trendSports.length === 0) return null

                const dates = Array.from(new Set(settled.map(b => b.bet_date))).sort()
                const cum: Record<string, number> = {}
                trendSports.forEach(s => { cum[s.value] = 0 })
                const trendData = dates.map(d => {
                  trendSports.forEach(s => {
                    cum[s.value] += settled.filter(b => b.bet_date === d && b.sport === s.value).reduce((a, b) => a + b.profit, 0)
                  })
                  const row: Record<string, string | number> = { date: d }
                  trendSports.forEach(s => { row[s.value] = cum[s.value] })
                  return row
                })

                return (
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 8 }}>종목별 수익 추세</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trendData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
                        <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                          formatter={(v: number, name: string) => [`${v.toLocaleString()}원`, trendSports.find(s => s.value === name)?.label ?? name]}
                          labelFormatter={l => dayjs(l).format('YYYY-MM-DD')} />
                        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => trendSports.find(s => s.value === v)?.label ?? v} />
                        {trendSports.map(s => (
                          <Line key={s.value} type="monotone" dataKey={s.value} name={s.value} stroke={s.color} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}
            </div>
          )}
          {activeSport === 'parlay' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {parlayStats.total === 0 ? (
                <div className="card"><div className="empty"><div className="empty-icon">🔗</div>결과 처리된 다폴 베팅이 없습니다</div></div>
              ) : (
                <>
                  {([
                    { key: '2' as const, title: '두폴', sub: '2다리', legs: parlay2Legs, s: parlay2Stats, matches: (n: number) => n === 2 },
                    { key: '3' as const, title: '세폴', sub: '3다리', legs: parlay3Legs, s: parlay3Stats, matches: (n: number) => n === 3 },
                    { key: '4' as const, title: '포폴+', sub: '4다리 이상', legs: parlay4pLegs, s: parlay4pStats, matches: (n: number) => n >= 4 },
                  ]).filter(g => g.s.total > 0).map(g => (
                    <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ alignSelf: 'center', marginRight: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{g.title}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 5 }}>{g.sub}</span>
                        </div>
                        {[
                          { label: '승률', value: `${g.s.winRate.toFixed(1)}%`, sub: `${g.s.wins.length}W ${g.s.losses.length}L ${g.s.pushes.length}P`, cls: g.s.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
                          { label: '총 손익', value: `${g.s.profit >= 0 ? '+' : ''}${g.s.profit.toLocaleString()}`, sub: `${g.s.total}건`, cls: g.s.profit >= 0 ? 'profit-pos' : 'profit-neg' },
                          { label: 'ROI', value: `${g.s.roi >= 0 ? '+' : ''}${g.s.roi.toFixed(1)}%`, sub: `${g.s.stake.toLocaleString()}`, cls: g.s.roi >= 0 ? 'profit-pos' : 'profit-neg' },
                          { label: '평균 배당', value: g.s.avgOdds.toFixed(2), sub: '', cls: '' },
                        ].map(t => (
                          <div key={t.label} className="card stat-tile" style={{ flex: '1 0 110px', maxWidth: 160, padding: '10px 12px' }}>
                            <div className={`stat-value ${t.cls}`} style={{ fontSize: 16 }}>{t.value}</div>
                            <div className="stat-label">{t.label}</div>
                            {t.sub && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t.sub}</div>}
                          </div>
                        ))}
                        <button
                          onClick={() => setDeleteTarget({
                            label: g.title, emoji: '🔗',
                            matchFn: b => b.parlay_group !== null && g.matches(fullGroupLegCount[b.parlay_group!] ?? 0),
                          })}
                          className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
                          <Trash2 size={11} /> 데이터 삭제
                        </button>
                      </div>

                      <div className="card">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {g.legs.filter(b => b.result !== 'pending').sort((a, b) => b.bet_date.localeCompare(a.bet_date)).map(b => {
                            const legs = periodAll.filter(x => x.parlay_group === b.parlay_group).sort((x, y) => x.parlay_leg - y.parlay_leg)
                            return (
                              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 12 }}>
                                <span style={{ color: 'var(--text-muted)', width: 78, flexShrink: 0 }}>{b.bet_date}</span>
                                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{legs.map(l => l.match).join(' × ')}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{b.odds.toFixed(2)}</span>
                                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: b.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {b.profit >= 0 ? '+' : ''}{b.profit.toLocaleString()}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {activeSport === 'live' && (
            <LivePanel
              bets={liveBets}
              onDeleteRequest={() => setDeleteTarget({ label: '라이브', emoji: '🔴', matchFn: b => b.is_live === true })}
            />
          )}
          {activeSport !== 'all' && activeSport !== 'parlay' && activeSport !== 'live' && (
            <SportPanel
              bets={periodFiltered}
              sport={SPORTS.find(s => s.value === activeSport)!}
              leagueOverrides={leagueOverrides}
              baseballLeagues={baseballLeagues}
              onRenameBaseballLeague={renameBaseballLeague}
              onDeleteBaseballLeague={deleteBaseballLeague}
              esportsOverrides={esportsOverrides}
              esportsLeagues={esportsLeagues}
              onRenameEsportsLeague={renameEsportsLeague}
              onDeleteEsportsLeague={deleteEsportsLeague}
              basketballOverrides={basketballOverrides}
              basketballLeagues={basketballLeagues}
              onRenameBasketballLeague={renameBasketballLeague}
              onDeleteBasketballLeague={deleteBasketballLeague}
              volleyballOverrides={volleyballOverrides}
              volleyballLeagues={volleyballLeagues}
              onRenameVolleyballLeague={renameVolleyballLeague}
              onDeleteVolleyballLeague={deleteVolleyballLeague}
              onDeleteRequest={() => {
                const sp = SPORTS.find(s => s.value === activeSport)!
                setDeleteTarget({ label: sp.label, emoji: sp.emoji, matchFn: b => b.sport === sp.value && b.parlay_group === null && !b.is_live })
              }}
            />
          )}
        </>

      {/* 데이터 삭제 모달 (종목 공용) */}
      {deleteTarget && (
        <DeleteBetsModal
          target={deleteTarget}
          bets={bets}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { loadBets(); setActiveSport('all') }}
        />
      )}
    </div>
  )
}

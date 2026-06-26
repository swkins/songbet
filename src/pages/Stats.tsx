import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import dayjs from 'dayjs'
import { Trash2, X } from 'lucide-react'

const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: 'soccer',     label: '축구', emoji: '⚽' },
  { value: 'baseball',   label: '야구', emoji: '⚾' },
  { value: 'basketball', label: '농구', emoji: '🏀' },
  { value: 'volleyball', label: '배구', emoji: '🏐' },
  { value: 'hockey',     label: '하키', emoji: '🏒' },
  { value: 'esports',    label: 'LOL',  emoji: '🎮' },
  { value: 'other',      label: '기타', emoji: '📋' },
]
const MARKET_LABELS: Record<Market, string> = {
  moneyline:'승패', handicap:'핸디캡', over:'오버', under:'언더', correct_score:'정확한스코어', other:'기타',
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

function pickHasLine(pick: string, line: string): boolean { return pick?.includes(line) ?? false }

// ─── 룰북 기반 통계 행 ─────────────────────────────────────────────
type RowColor = 'S' | 'A' | 'B' | 'none'

const TIER_STYLE: Record<RowColor, { color: string; bg: string; border: string; label: string }> = {
  S:    { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.25)',  label: 'S' },
  A:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  label: 'A' },
  B:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  label: 'B' },
  none: { color: 'var(--text-secondary)', bg: 'transparent', border: 'transparent', label: '—' },
}

interface RuleRow { label: string; bets: Bet[]; tier: RowColor; breakeven?: string }

function RuleStatsTable({ title, rows, extra }: { title: string; rows: RuleRow[]; extra?: React.ReactNode }) {
  const hasBets = rows.some(r => r.bets.filter(b => b.result !== 'pending').length > 0)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', flex: '1 0 220px' }}>
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
                  <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                    {isEmpty ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, color: s.profit >= 0 ? '#4ade80' : '#f87171' }}>{s.profit >= 0 ? '+' : ''}{(s.profit/1000).toFixed(0)}K</span>}
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

// ─── 야구 상세 통계 (룰북 기반) ──────────────────────────────────
function BaseballDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const ml = settled.filter(b => b.market === 'moneyline')
  const under = settled.filter(b => b.market === 'under')

  // 역배 — 리그별 구간 분류
  function mlInRange(b: Bet, lo: number, hi: number) { return b.odds >= lo && b.odds < hi }

  const mlRows: RuleRow[] = [
    { label: '2.10~2.49', tier: 'S', breakeven: '~49%', bets: ml.filter(b => mlInRange(b, 2.10, 2.50)) },
    { label: '2.50~2.79', tier: 'A', breakeven: '~44%', bets: ml.filter(b => mlInRange(b, 2.50, 2.80)) },
    { label: '2.80↑ (KBO)', tier: 'A', bets: ml.filter(b => b.odds >= 2.80) },
  ]
  const mlOther = ml.filter(b => b.odds < 2.10)

  // 언더 — 배당 구간
  const unRows: RuleRow[] = [
    { label: '1.90~2.09', tier: 'S', breakeven: '51%', bets: under.filter(b => b.odds >= 1.90 && b.odds < 2.10) },
    { label: '2.10~2.29', tier: 'A', breakeven: '48%', bets: under.filter(b => b.odds >= 2.10 && b.odds < 2.30) },
    { label: '2.30~2.49', tier: 'B', breakeven: '44%', bets: under.filter(b => b.odds >= 2.30 && b.odds < 2.50) },
  ]
  const unOther = under.filter(b => b.odds < 1.90 || b.odds >= 2.50)

  // 그외
  const ruleIds = new Set([...mlRows.flatMap(r => r.bets), ...unRows.flatMap(r => r.bets)].map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RuleStatsTable title="⚾ 역배 — 배당 구간별" rows={mlRows}
          extra={mlOther.length > 0 ? <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>2.09↓ 제외: {mlOther.length}건</div> : undefined} />
        <RuleStatsTable title="⚾ 언더 — 배당 구간별" rows={unRows}
          extra={unOther.length > 0 ? <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>범위 외: {unOther.length}건</div> : undefined} />
      </div>
      <OtherBetsPanel bets={otherBets} />
    </div>
  )
}

// ─── 축구 상세 통계 (룰북 기반) ──────────────────────────────────
function SoccerDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const under25 = settled.filter(b => (b.market === 'under') && pickHasLine(b.pick, '2.5'))

  // 강팀 배당 구간 × 언더 배당 티어
  // 강팀 배당은 match 필드에 없어서 — 언더 배당으로만 티어 구분 + 강팀 배당 범위 메모
  const u25Rows: RuleRow[] = [
    { label: '언더 1.80~2.09 (S)', tier: 'S', bets: under25.filter(b => b.odds >= 1.80 && b.odds < 2.10) },
    { label: '언더 2.10~2.29 (A)', tier: 'A', bets: under25.filter(b => b.odds >= 2.10 && b.odds < 2.30) },
  ]
  const u25Other = under25.filter(b => b.odds < 1.80 || b.odds >= 2.30)

  // 나머지 시장별
  const ml = settled.filter(b => b.market === 'moneyline')
  const hcap = settled.filter(b => b.market === 'handicap')
  const overBets = settled.filter(b => b.market === 'over')
  const underOther = settled.filter(b => b.market === 'under' && !pickHasLine(b.pick, '2.5'))

  const mlRows: RuleRow[] = [
    { label: '1.40~1.79', tier: 'none', bets: ml.filter(b => b.odds >= 1.40 && b.odds < 1.80) },
    { label: '1.80~2.49', tier: 'none', bets: ml.filter(b => b.odds >= 1.80 && b.odds < 2.50) },
    { label: '2.50↑', tier: 'none', bets: ml.filter(b => b.odds >= 2.50) },
    { label: '1.39↓', tier: 'none', bets: ml.filter(b => b.odds < 1.40) },
  ]

  // 그외
  const ruleIds = new Set(u25Rows.flatMap(r => r.bets).map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RuleStatsTable title="⚽ 2.5 언더 — 언더 배당 티어별" rows={u25Rows}
          extra={
            <div style={{ marginTop: 6 }}>
              {u25Other.length > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>티어 외: {u25Other.length}건</div>}
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>* 강팀 배당 1.40~1.79 필터 미적용 (데이터 미보유)</div>
            </div>
          } />
        <RuleStatsTable title="승패 배당 구간별 (참고)" rows={mlRows} />
        {(hcap.length > 0 || overBets.length > 0 || underOther.length > 0) && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', flex: '1 0 180px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>기타 마켓</div>
            {[
              { label: '핸디캡', bets: hcap },
              { label: '오버', bets: overBets },
              { label: '언더(2.5외)', bets: underOther },
            ].filter(r => r.bets.length > 0).map(r => {
              const s = calcStats(r.bets)
              return (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 70 }}>{r.label} ({s.total}건)</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.winRate >= 50 ? '#4ade80' : '#f87171' }}>{s.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <OtherBetsPanel bets={otherBets} />
    </div>
  )
}

// ─── 농구 상세 통계 (룰북 기반) ──────────────────────────────────
function BasketballDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const hcap = settled.filter(b => b.market === 'handicap')
  const under = settled.filter(b => b.market === 'under')
  const ml    = settled.filter(b => b.market === 'moneyline')

  function getSpread(pick: string): number | null {
    const m = pick?.match(/[+\-]?(\d+\.?\d*)/)
    if (!m) return null
    return pick.includes('-') ? -parseFloat(m[1]) : parseFloat(m[1])
  }

  // 플핸 (+스프레드)
  const plusHcap = hcap.filter(b => { const s = getSpread(b.pick); return s !== null && s > 0 })
  const pRows: RuleRow[] = [
    { label: '+6.5~+9.5', tier: 'S', bets: plusHcap.filter(b => { const s = getSpread(b.pick)!; return s >= 6.5 && s <= 9.5 && b.odds >= 1.90 }) },
    { label: '+10.5~+12.5', tier: 'A', bets: plusHcap.filter(b => { const s = getSpread(b.pick)!; return s >= 10.5 && s <= 12.5 && b.odds >= 1.90 }) },
    { label: '+5.5/+13.5~+14.5', tier: 'B', bets: plusHcap.filter(b => { const s = getSpread(b.pick)!; return (s === 5.5 || (s >= 13.5 && s <= 14.5)) && b.odds >= 1.90 }) },
  ]
  const pOther = plusHcap.filter(b => !pRows.flatMap(r => r.bets).find(x => x.id === b.id))

  // 마핸 (- 스프레드)
  const minusHcap = hcap.filter(b => { const s = getSpread(b.pick); return s !== null && s < 0 })

  // 언더 — 정배 배당 1.20~1.59 기준 (정배 배당 데이터 없으므로 언더 배당으로만)
  const unRows: RuleRow[] = [
    { label: '언더 2.00↑ (1순위)', tier: 'S', bets: under.filter(b => b.odds >= 2.00) },
    { label: '언더 1.90~1.99 (2순위)', tier: 'A', bets: under.filter(b => b.odds >= 1.90 && b.odds < 2.00) },
  ]
  const unOther = under.filter(b => b.odds < 1.90)

  // 그외
  const ruleIds = new Set([...pRows.flatMap(r => r.bets), ...unRows.flatMap(r => r.bets)].map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RuleStatsTable title="🏀 플핸 — 스프레드 티어별 (배당 1.90↑)" rows={pRows}
          extra={pOther.length > 0 ? <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>범위 외 / 배당 미달: {pOther.length}건</div> : undefined} />
        <RuleStatsTable title="🏀 언더 — 배당 구간별" rows={unRows}
          extra={
            <div style={{ marginTop: 6 }}>
              {unOther.length > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>1.89↓ 제외: {unOther.length}건</div>}
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>* 정배 배당 1.20~1.59 필터 미적용 (데이터 미보유)</div>
            </div>
          } />
        {(minusHcap.length > 0 || ml.length > 0) && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', flex: '1 0 180px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>기타 마켓</div>
            {[
              { label: '마핸(-스프레드)', bets: minusHcap },
              { label: '승패', bets: ml },
            ].filter(r => r.bets.length > 0).map(r => {
              const s = calcStats(r.bets)
              return (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 90 }}>{r.label} ({s.total}건)</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.winRate >= 50 ? '#4ade80' : '#f87171' }}>{s.winRate.toFixed(0)}%</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: s.roi >= 0 ? '#4ade80' : '#f87171' }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        )}
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


// ─── 라이브 베팅 패널 ─────────────────────────────────────────────
function LivePanel({ bets }: { bets: Bet[] }) {
  const liveBets = bets.filter(b => b.is_live && b.result !== 'pending')
  const pendingLive = bets.filter(b => b.is_live && b.result === 'pending')

  if (liveBets.length === 0 && pendingLive.length === 0) return (
    <div className="card"><div className="empty"><div className="empty-icon">🔴</div>라이브 베팅 기록이 없습니다</div></div>
  )

  const s = calcStats(liveBets)

  // 종목별 집계
  type SportStat = { sp: Sport; emoji: string } & ReturnType<typeof calcStats>
  const bySport = (['soccer','baseball','basketball','volleyball','hockey','esports','other'] as Sport[]).reduce<SportStat[]>((acc, sp) => {
    const sb = liveBets.filter(b => b.sport === sp)
    if (!sb.length) return acc
    const ss = calcStats(sb)
    const emoji = { soccer:'⚽', baseball:'⚾', basketball:'🏀', volleyball:'🏐', hockey:'🏒', esports:'🎮', other:'📋' }[sp]
    acc.push({ sp, emoji, ...ss })
    return acc
  }, [])

  // 마켓별 집계
  type MarketStat = { mkt: Market; label: string } & ReturnType<typeof calcStats>
  const byMarket = (['moneyline','handicap','over','under'] as Market[]).reduce<MarketStat[]>((acc, mkt) => {
    const mb = liveBets.filter(b => b.market === mkt)
    if (!mb.length) return acc
    const ms = calcStats(mb)
    const label = { moneyline:'승패', handicap:'핸디캡', over:'오버', under:'언더', correct_score:'정확한스코어', other:'기타' }[mkt]
    acc.push({ mkt, label, ...ms })
    return acc
  }, [])

  // 누적 손익 곡선
  const profitCurve = (() => {
    let cum = 0
    return [...liveBets].sort((a,b) => a.bet_date.localeCompare(b.bet_date))
      .map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* 요약 타일 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: '승률', value: `${s.winRate.toFixed(1)}%`, sub: `${s.wins.length}W ${s.losses.length}L`, cls: s.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
          { label: '총 손익', value: `${s.profit >= 0 ? '+' : ''}${s.profit.toLocaleString()}`, sub: `${s.total}건`, cls: s.profit >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: 'ROI', value: `${s.roi >= 0 ? '+' : ''}${s.roi.toFixed(1)}%`, sub: `${s.stake.toLocaleString()}`, cls: s.roi >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: '평균 배당', value: s.avgOdds.toFixed(2), sub: '', cls: '' },
        ].map(t => (
          <div key={t.label} className="card stat-tile" style={{ flex: '1 0 120px', maxWidth: 180 }}>
            <div className={`stat-value ${t.cls}`}>{t.value}</div>
            <div className="stat-label">{t.label}</div>
            {t.sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{t.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* 종목별 */}
        {bySport.length > 0 && (
          <div className="card" style={{ flex: '1 0 200px' }}>
            <div className="card-title">종목별</div>
            <table style={{ width: '100%', fontSize: 11 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: 'var(--text-secondary)' }}>종목</th>
                <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', padding: '3px 4px' }}>건</th>
                <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', padding: '3px 4px' }}>승률</th>
                <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', padding: '3px 4px' }}>ROI</th>
              </tr></thead>
              <tbody>
                {bySport.map(r => (
                  <tr key={r.sp} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '5px 6px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.emoji} {r.sp}</td>
                    <td style={{ textAlign: 'center', padding: '5px 4px', fontSize: 10, color: 'var(--text-secondary)' }}>{r.total}</td>
                    <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: r.winRate >= 50 ? '#4ade80' : '#f87171' }}>{r.winRate.toFixed(0)}%</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.roi >= 0 ? '#4ade80' : '#f87171' }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 마켓별 */}
        {byMarket.length > 0 && (
          <div className="card" style={{ flex: '1 0 200px' }}>
            <div className="card-title">마켓별</div>
            <table style={{ width: '100%', fontSize: 11 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: 'var(--text-secondary)' }}>마켓</th>
                <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', padding: '3px 4px' }}>건</th>
                <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', padding: '3px 4px' }}>승률</th>
                <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)', padding: '3px 4px' }}>ROI</th>
              </tr></thead>
              <tbody>
                {byMarket.map(r => (
                  <tr key={r.mkt} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '5px 6px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</td>
                    <td style={{ textAlign: 'center', padding: '5px 4px', fontSize: 10, color: 'var(--text-secondary)' }}>{r.total}</td>
                    <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: r.winRate >= 50 ? '#4ade80' : '#f87171' }}>{r.winRate.toFixed(0)}%</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '5px 4px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.roi >= 0 ? '#4ade80' : '#f87171' }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 누적 손익 곡선 */}
      {profitCurve.length > 1 && (
        <div className="card">
          <div className="card-title">누적 손익 곡선</div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="pg-live" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={s.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={v => (v/1000).toFixed(0)+'K'} />
              <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                formatter={(v: number) => [`${v.toLocaleString()}`, '누적손익']} labelFormatter={l => dayjs(l).format('MM/DD')} />
              <Area type="monotone" dataKey="profit" stroke={s.profit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill="url(#pg-live)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 대기중 라이브 베팅 */}
      {pendingLive.length > 0 && (
        <div className="card">
          <div className="card-title">대기중 라이브 ({pendingLive.length}건)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pendingLive.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '5px 6px', background: 'var(--bg-elevated)', borderRadius: 5, border: '1px solid rgba(248,113,113,0.2)' }}>
                <span style={{ fontSize: 9, color: '#f87171', fontWeight: 700, flexShrink: 0 }}>🔴 LIVE</span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{b.bet_date.slice(5)}</span>
                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pick}</span>
                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>@{b.odds.toFixed(2)}</span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{b.stake.toLocaleString()}원</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 베팅 목록 */}
      {liveBets.length > 0 && (
        <div className="card">
          <div className="card-title">라이브 베팅 목록 ({liveBets.length}건)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {liveBets.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, padding: '5px 6px', background: 'var(--bg-elevated)', borderRadius: 5 }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{b.bet_date.slice(5)}</span>
                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pick}</span>
                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>@{b.odds.toFixed(2)}</span>
                <span style={{ fontWeight: 700, flexShrink: 0, color: b.result === 'win' ? '#4ade80' : b.result === 'loss' ? '#f87171' : 'var(--text-muted)' }}>
                  {b.result === 'win' ? `+${b.profit.toLocaleString()}` : b.result === 'loss' ? `-${b.stake.toLocaleString()}` : 'PUSH'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


function ParlayPanel({ bets }: { bets: Bet[] }) {
  // parlay_group이 있는 베팅만 필터
  const parlayBets = bets.filter(b => b.parlay_group !== null && b.result !== 'pending')
  // 그룹별로 묶기 (parlay_leg=1 기준으로 대표)
  const groups = Array.from(new Set(parlayBets.map(b => b.parlay_group))).map(g => {
    const legs = parlayBets.filter(b => b.parlay_group === g).sort((a,b) => a.parlay_leg - b.parlay_leg)
    const rep = legs[0]
    return { group: g, legs, result: rep?.result ?? 'pending', odds: rep?.odds ?? 0, stake: rep?.stake ?? 0, profit: rep?.profit ?? 0 }
  })
  const wins = groups.filter(g => g.result === 'win')
  const losses = groups.filter(g => g.result === 'loss')
  const total = groups.length
  const winRate = total > 0 ? wins.length / total * 100 : 0
  const totalStake = groups.reduce((s,g) => s + g.stake, 0)
  const totalProfit = groups.reduce((s,g) => s + g.profit, 0)
  const roi = totalStake > 0 ? totalProfit / totalStake * 100 : 0
  const avgOdds = total > 0 ? groups.reduce((s,g) => s + g.odds, 0) / total : 0

  if (total === 0) return (
    <div className="card"><div className="empty"><div className="empty-icon">2️⃣</div>두폴 베팅 기록이 없습니다</div></div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 요약 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: '승률', value: `${winRate.toFixed(1)}%`, sub: `${wins.length}W ${losses.length}L`, cls: winRate >= 50 ? 'profit-pos' : 'profit-neg' },
          { label: '총 손익', value: `${totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}`, sub: `${total}건`, cls: totalProfit >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: 'ROI', value: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`, sub: `투자 ${totalStake.toLocaleString()}`, cls: roi >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: '평균 배당', value: avgOdds.toFixed(2), sub: '', cls: '' },
        ].map(t => (
          <div key={t.label} className="card stat-tile" style={{ flex: '1 0 120px', maxWidth: 180 }}>
            <div className={`stat-value ${t.cls}`}>{t.value}</div>
            <div className="stat-label">{t.label}</div>
            {t.sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* 두폴 목록 */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>두폴 베팅 목록 ({total}건)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(g => {
            const isWin = g.result === 'win', isLoss = g.result === 'loss'
            return (
              <div key={g.group} style={{ background: 'var(--bg-elevated)', border: `1px solid ${isWin ? 'var(--green-border)' : isLoss ? 'var(--red-border)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px' }}>
                {g.legs.map((leg, idx) => (
                  <div key={leg.id} style={{ display: 'flex', gap: 6, marginBottom: idx < g.legs.length - 1 ? 4 : 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 18, flexShrink: 0 }}>{idx===0?'①':'②'}</span>
                    <span style={{ fontSize: 12, color: isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-primary)', flex: 1 }}>{leg.match}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>배당 {g.odds.toFixed(2)} / {g.stake.toLocaleString()}원</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-muted)' }}>
                    {isWin ? `+${g.profit.toLocaleString()}원` : isLoss ? `-${g.stake.toLocaleString()}원` : 'PUSH'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


/* ── 종목별 데이터 삭제 모달 ── */
function DeleteBetsModal({ sport, bets, onClose, onDeleted }: {
  sport: typeof SPORTS[0]; bets: Bet[]; onClose: () => void; onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const sportBets = bets.filter(b => b.sport === sport.value)
  const CONFIRM_WORD = sport.label

  async function doDelete() {
    if (confirm !== CONFIRM_WORD) return
    setDeleting(true)
    const ids = sportBets.map(b => b.id)
    // 배치 삭제 (in 조건)
    const { error } = await supabase.from('bets').delete().in('id', ids)
    setDeleting(false)
    if (!error) { onDeleted(); onClose() }
    else alert('삭제 실패: ' + error.message)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Trash2 size={16} color="var(--red)" />
          {sport.emoji} {sport.label} 데이터 삭제
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2 }}><X size={15} /></button>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
          ⚠️ <strong>{sport.label}</strong> 베팅 데이터 <strong>{sportBets.length}건</strong>이 영구 삭제됩니다.<br />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>이 작업은 되돌릴 수 없습니다.</span>
        </div>
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
      </div>
    </div>
  )
}


// ─── 룰북 패널 (종목별) ────────────────────────────────────────────
function RulebookPanel({ sport }: { sport: Sport }) {
  const S = { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' }
  const A = { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' }
  const B = { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' }

  function Tier({ tier, label, range, note, color, bg, border }: {
    tier: string; label: string; range: string; note: string; color: string; bg: string; border: string
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, background: bg, border: `1px solid ${border}`, color, borderRadius: 4, padding: '1px 6px', width: 52, textAlign: 'center', flexShrink: 0 }}>{tier} {label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{range}</span>
        {note && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{note}</span>}
      </div>
    )
  }

  function Pass({ text }: { text: string }) {
    return (
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2, display: 'flex', gap: 4 }}>
        <span style={{ color: '#f87171', fontWeight: 700, flexShrink: 0 }}>✕</span>{text}
      </div>
    )
  }

  if (sport === 'baseball') return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      {/* 역배 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', flex: '1 0 260px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 8 }}>⚾ 역배 — 진입 구간</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { lg: 'MLB', s: '2.10~2.49', a: '2.50~2.79', pass: '2.80↑' },
            { lg: 'NPB', s: '2.10~2.49', a: '2.50~2.59', pass: '2.60↑' },
            { lg: 'KBO', s: '2.10~2.49', a: '2.50↑ 무제한', pass: '—' },
          ].map(r => (
            <div key={r.lg} style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', width: 32, flexShrink: 0 }}>{r.lg}</span>
              <span style={{ fontSize: 9, background: S.bg, border: `1px solid ${S.border}`, color: S.color, borderRadius: 4, padding: '1px 5px' }}>S {r.s}</span>
              <span style={{ fontSize: 9, background: A.bg, border: `1px solid ${A.border}`, color: A.color, borderRadius: 4, padding: '1px 5px' }}>A {r.a}</span>
              {r.pass !== '—' && <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>✕{r.pass}</span>}
            </div>
          ))}
        </div>
      </div>
      {/* 언더 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', flex: '1 0 220px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 8 }}>⚾ 언더 — 티어 기준 (MLB·NPB·KBO 동일)</div>
        <Tier tier="S" label="1순위" range="1.90~2.09" note="메인" {...S} />
        <Tier tier="A" label="2순위" range="2.10~2.29" note="여유시" {...A} />
        <Tier tier="B" label="3순위" range="2.30~2.49" note="소액" {...B} />
        <Pass text="1.89↓ 패스" />
      </div>
    </div>
  )

  if (sport === 'soccer') return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', flex: '1 0 340px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 8 }}>⚽ 2.5 언더 — EPL·라리가·분데스·세리에·리그앙·UCL</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
          강팀 배당 <strong style={{ color: 'var(--text-primary)' }}>1.40~1.79</strong> (홈/원정 무관) + 언더 배당 <strong style={{ color: 'var(--text-primary)' }}>1.80 이상</strong>
        </div>
        <Tier tier="S" label="1순위" range="1.80~2.09" note="메인" {...S} />
        <Tier tier="A" label="2순위" range="2.10~2.29" note="테스트" {...A} />
        <div style={{ marginTop: 6 }}>
          <Pass text="강팀 1.39↓ 또는 1.80↑ 패스" />
          <Pass text="언더 배당 1.79↓ 패스" />
        </div>
      </div>
    </div>
  )

  if (sport === 'basketball') return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      {/* 플핸 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', flex: '1 0 220px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 8 }}>🏀 플핸(+스프레드) — 배당 1.90↑</div>
        <Tier tier="S" label="1순위" range="+6.5~+9.5" note="메인" {...S} />
        <Tier tier="A" label="2순위" range="+10.5~+12.5" note="2순위" {...A} />
        <Tier tier="B" label="3순위" range="+5.5/+13.5~+14.5" note="소액" {...B} />
        <Pass text="1.89↓ 패스" />
      </div>
      {/* 언더 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', flex: '1 0 220px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 8 }}>🏀 언더 — 마진 7% 이하</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
          정배 배당 <strong style={{ color: 'var(--text-primary)' }}>1.20~1.59</strong> (범위 밖 패스)
        </div>
        <Tier tier="" label="1순위" range="언더 2.00↑" note="" color="#4ade80" bg="rgba(74,222,128,0.1)" border="rgba(74,222,128,0.3)" />
        <Tier tier="" label="2순위" range="언더 1.90~1.99" note="" color="#60a5fa" bg="rgba(96,165,250,0.1)" border="rgba(96,165,250,0.3)" />
        <Pass text="언더 1.89↓ 패스" />
      </div>
    </div>
  )

  return null
}

function SportPanel({ bets, sport, onDeleteRequest }: {
  bets: Bet[]; sport: typeof SPORTS[0]; onDeleteRequest: () => void
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

  const showRulebook = ['baseball','soccer','basketball'].includes(sport.value)

  if (stats.total === 0) return (
    <div>
      {showRulebook && <RulebookPanel sport={sport.value as Sport} />}
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
      {showRulebook && <RulebookPanel sport={sport.value as Sport} />}
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
        {byMarket.length > 0 && (
          <div className="card" style={{ width: 220, flexShrink: 0 }}>
            <div className="card-title">마켓별 성적</div>
            <table>
              <thead><tr><th>마켓</th><th className="td-right">건</th><th className="td-right">승률</th><th className="td-right">ROI</th></tr></thead>
              <tbody>
                {byMarket.map(r => (
                  <tr key={r.mkt}>
                    <td style={{ fontWeight: 700, fontSize: 11 }}>{r.label}</td>
                    <td className="td-right" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{r.total}</td>
                    <td className="td-right"><span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.winRate.toFixed(0)}%</span></td>
                    <td className="td-right"><span className={r.roi >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sport.value === 'baseball'   && <BaseballDetailPanel bets={periodBets} />}
        {sport.value === 'soccer'     && <SoccerDetailPanel bets={periodBets} />}
        {sport.value === 'basketball' && <BasketballDetailPanel bets={periodBets} />}
        {!['baseball','soccer','basketball'].includes(sport.value) && <GenericDetailPanel bets={periodBets} />}
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
  const [bets, setBets]       = useState<Bet[]>([])
  const [period, setPeriod]   = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [activeSport, setActiveSport] = useState<Sport | 'all' | 'parlay' | 'live'>('all')
  const [deleteTarget, setDeleteTarget] = useState<typeof SPORTS[0] | null>(null)

  useEffect(() => { loadBets() }, [])
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').order('bet_date').order('created_at')
    if (data) setBets(data)
  }

  const periodAll = bets.filter(b => {
    if (period === 'all') return true
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return dayjs(b.bet_date).isAfter(dayjs().subtract(days, 'day'))
  })
  // 라이브 베팅은 라이브 탭에서만 집계 — 일반 통계에서 제외
  const periodFiltered = periodAll.filter(b => !b.is_live)

  const stats   = calcStats(periodFiltered)
  const settled = periodFiltered.filter(b => b.result !== 'pending')
  const sportCounts = SPORTS.map(s => ({ ...s, count: settled.filter(b => b.sport === s.value).length }))

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

      {settled.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">📊</div>결과 처리된 베팅이 없습니다</div></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {([
              { value: 'all' as const, label: '전체', emoji: '📊', cnt: settled.length },
              { value: 'soccer' as const, label: '축구', emoji: '⚽', cnt: settled.filter(b => b.sport === 'soccer').length },
              { value: 'baseball' as const, label: '야구', emoji: '⚾', cnt: settled.filter(b => b.sport === 'baseball').length },
              { value: 'basketball' as const, label: '농구', emoji: '🏀', cnt: settled.filter(b => b.sport === 'basketball').length },
              { value: 'volleyball' as const, label: '배구', emoji: '🏐', cnt: settled.filter(b => b.sport === 'volleyball').length },
              { value: 'hockey' as const, label: '하키', emoji: '🏒', cnt: settled.filter(b => b.sport === 'hockey').length },
              { value: 'esports' as const, label: 'LOL', emoji: '🎮', cnt: settled.filter(b => b.sport === 'esports').length },
            { value: 'parlay' as const, label: '두폴', emoji: '2️⃣', cnt: settled.filter(b => b.parlay_group !== null).length },
              { value: 'live' as const, label: '라이브', emoji: '🔴', cnt: settled.filter(b => b.is_live).length },
            ]).map(s => (
              <button key={s.value}
                onClick={() => setActiveSport(s.value)}
                style={{ padding: '10px 20px', borderRadius: 8, border: activeSport === s.value ? '2px solid var(--gold)' : '1px solid var(--border)', background: activeSport === s.value ? 'var(--gold-bg)' : 'var(--bg-card)', color: activeSport === s.value ? 'var(--gold)' : 'var(--text-secondary)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}>
                {s.emoji} {s.label} <span style={{ opacity: 0.7, fontSize: 12 }}>({s.cnt})</span>
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
                    <div className={`stat-value ${t.cls}`}>{t.value}</div>
                    <div className="stat-label">{t.label}</div>
                    {t.sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{t.sub}</div>}
                  </div>
                ))}
              </div>

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
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{s.emoji} {s.label}</div>
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
            </div>
          )}
          {activeSport !== 'all' && activeSport !== 'parlay' && (
            <SportPanel
              bets={periodFiltered}
              sport={SPORTS.find(s => s.value === activeSport)!}
              onDeleteRequest={() => setDeleteTarget(SPORTS.find(s => s.value === activeSport)!)}
            />
          )}
          {activeSport === 'parlay' && (
            <ParlayPanel bets={periodFiltered} />
          )}
          {activeSport === 'live' && (
            <LivePanel bets={periodAll} />
          )}
        </>
      )}

      {/* 종목 데이터 삭제 모달 */}
      {deleteTarget && (
        <DeleteBetsModal
          sport={deleteTarget}
          bets={bets}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { loadBets(); setActiveSport('all') }}
        />
      )}
    </div>
  )
}

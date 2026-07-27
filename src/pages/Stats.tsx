import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Sport, Market, Site } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts'
import dayjs from 'dayjs'
import { Trash2, X, Plus } from 'lucide-react'
import { inferBaseballLeague, inferSoccerLeague, koCompare, type LeagueOverride, type BaseballLeague } from '../lib/league'

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
type League = BaseballLeague
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

// 핸디캡(+N.N / -N.N) 픽 텍스트에서 라인 숫자 추출 (부호 무관, 절대값)
function extractHandicapLine(pick: string): number | null {
  const m = pick?.match(/([+-]\s*\d+\.?\d*)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/\s+/g, ''))
  return isNaN(n) ? null : Math.abs(n)
}

// ─── 야구 승패 배당구간 등급 (황금구간 v1 · 2026-07) ────────────────
// S = 황금구간(흐름 무관 무조건), A = 흐름구간(배당 하락 방향 확인 필요), none = 회피
function mlTier(odds: number): RowColor {
  if (odds >= 2.2 && odds < 2.6) return 'S'
  if ((odds >= 1.6 && odds < 2.2) || (odds >= 2.6 && odds < 3.0)) return 'A'
  return 'none'
}

// 승패(역배·정배) — 2.1 ~ 2.9 구간을 0.1 단위로 고정 커버
function baseballMlRows(ml: Bet[]): RuleRow[] {
  const rows: RuleRow[] = []
  for (let lo = 2.1; lo <= 2.9 + 1e-9; lo = Math.round((lo + 0.1) * 10) / 10) {
    const hi = Math.round((lo + 0.1) * 10) / 10
    const rowBets = ml.filter(b => b.odds >= lo && b.odds < hi)
    rows.push({ label: lo.toFixed(1), tier: mlTier(lo), bets: rowBets })
  }
  return rows
}

const LEAGUE_BUTTONS: { league: League; label: string }[] = [
  { league: 'KBO', label: '🇰🇷 KBO' }, { league: 'MLB', label: '🇺🇸 MLB' }, { league: 'NPB', label: '🇯🇵 NPB' },
]

// ─── 기타(리그 미확인) 항목 재배정 UI ────────────────────────────────
function UnmatchedLeagueGroup({ matchText, bets, onAssign }: {
  matchText: string; bets: Bet[]
  onAssign: (keyword: string, league: League) => Promise<void>
}) {
  const [keyword, setKeyword] = useState(matchText)
  const [saving, setSaving] = useState<League | null>(null)
  const s = calcStats(bets)
  async function assign(league: League) {
    if (!keyword.trim()) return
    setSaving(league)
    await onAssign(keyword.trim(), league)
    setSaving(null)
  }
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{matchText}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>{s.total}건</span>
        {s.total > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: s.profit >= 0 ? '#4ade80' : '#f87171' }}>{s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString()}원</span>}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
        어떤 팀 이름 때문에 인식이 안 됐는지 확인하고, 필요하면 아래에서 판별용 키워드를 수정한 뒤 리그를 지정하세요. 지정하면 이 키워드가 포함된 베팅은 앞으로 항상 해당 리그로 분류됩니다.
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder="판별 키워드 (예: 팀 이름)"
          className="form-input"
          style={{ flex: '1 0 160px', fontSize: 11, padding: '5px 8px' }} />
        {LEAGUE_BUTTONS.map(l => (
          <button key={l.league} onClick={() => assign(l.league)} disabled={saving !== null}
            style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
              border: '1px solid var(--green-border)', background: 'var(--green-bg)', color: 'var(--green)' }}>
            {saving === l.league ? '저장중...' : `→ ${l.label}`}
          </button>
        ))}
      </div>
    </div>
  )
}

function BaseballDetailPanel({ bets, overrides, onAddOverride }: {
  bets: Bet[]
  overrides: LeagueOverride[]
  onAddOverride: (keyword: string, league: League) => Promise<void>
}) {
  const allSettled = bets.filter(b => b.result !== 'pending')
  const leagueKeyOf = (b: Bet): League | 'ETC' => inferLeague(b.match, overrides) ?? 'ETC'

  const leagueSummary: { league: League | 'ETC'; label: string } [] = [
    { league: 'KBO', label: '🇰🇷 KBO' }, { league: 'MLB', label: '🇺🇸 MLB' }, { league: 'NPB', label: '🇯🇵 NPB' },
    { league: 'ETC', label: '❓ 기타(리그 미확인)' },
  ]
  const leagueStats = leagueSummary
    .map(({ league, label }) => ({ league, label, ...calcStats(allSettled.filter(b => leagueKeyOf(b) === league)) }))
    .filter(r => r.total > 0)

  // KBO / MLB / NPB — 승패(2.1~2.9) 배당구간별 적중률·수익률을 클릭 없이 바로 표시
  const leagueTables = LEAGUE_BUTTONS.map(({ league, label }) => {
    const leagueBets = allSettled.filter(b => leagueKeyOf(b) === league)
    const mlBets = leagueBets.filter(b => b.market === 'moneyline')
    const otherBets = leagueBets.filter(b => b.market !== 'moneyline')
    return { league, label, rows: baseballMlRows(mlBets), otherBets }
  }).filter(t => t.rows.some(r => r.bets.length > 0) || t.otherBets.length > 0)

  // 기타(리그 미확인) — 어떤 경기명이 원인인지 보여주고 리그로 재배정
  const etcBets = allSettled.filter(b => leagueKeyOf(b) === 'ETC')
  const etcGroups = Array.from(
    etcBets.reduce((map, b) => {
      if (!map.has(b.match)) map.set(b.match, [])
      map.get(b.match)!.push(b)
      return map
    }, new Map<string, Bet[]>())
  ).sort((a, b) => b[1].length - a[1].length)

  return (
    <div>
      {/* 리그별 요약 카드 */}
      {leagueStats.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {leagueStats.map(r => (
            <div key={r.league} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', minWidth: 130 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{r.label}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.total}건</span>
                <span style={{ fontSize: 12, fontWeight: 700 }} className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>{r.winRate.toFixed(0)}%</span>
                <span style={{ fontSize: 11, fontWeight: 700 }} className={r.profit >= 0 ? 'profit-pos' : 'profit-neg'}>{r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KBO / MLB / NPB 승패 배당구간별 테이블 — 바로 표시 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {leagueTables.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '20px 0' }}>데이터 없음</div>
        )}
        {leagueTables.map(t => (
          <RuleStatsTable key={t.league} title={`⚾ [${t.label}] 승패 — 2.1~2.9 0.1단위 배당 구간별`} rows={t.rows} />
        ))}
      </div>
      {leagueTables.some(t => t.otherBets.length > 0) && (
        <OtherBetsPanel bets={leagueTables.flatMap(t => t.otherBets)} />
      )}

      {/* 기타(리그 미확인) — 원인 확인 및 재배정 */}
      {etcGroups.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>❓ 기타(리그 미확인) — {etcBets.length}건, 팀 이름 확인 후 리그 재배정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {etcGroups.map(([matchText, groupBets]) => (
              <UnmatchedLeagueGroup key={matchText} matchText={matchText} bets={groupBets} onAssign={onAddOverride} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 배당 0.1단위 구간 집계 (공통) ─────────────────────────────────
function oddsBinRows(list: Bet[]): RuleRow[] {
  if (!list.length) return []
  const odds = list.map(b => b.odds)
  const loStart = Math.floor(Math.min(...odds) * 10) / 10
  const loEnd = Math.floor((Math.max(...odds) - 0.0001) * 10) / 10
  const rows: RuleRow[] = []
  for (let lo = loStart; lo <= loEnd + 1e-9; lo = Math.round((lo + 0.1) * 10) / 10) {
    const hi = Math.round((lo + 0.1) * 10) / 10
    const rowBets = list.filter(b => b.odds >= lo && b.odds < hi)
    if (rowBets.length > 0) rows.push({ label: lo.toFixed(1), tier: 'none', bets: rowBets })
  }
  return rows
}

// ─── 축구 리그 판별 ───────────────────────────────────────────────
// bet.league 값이 있으면 그대로 사용(베팅현황에서 직접 지정/자동추론된 값),
// 없는 과거 데이터는 팀 키워드 매핑(soccer_league_overrides)으로 추론. 둘 다 없으면 미확인(ETC) 처리.
function soccerLeagueOf(b: Bet, overrides: LeagueOverride[]): string {
  if (b.league && b.league.trim()) return b.league.trim()
  return inferSoccerLeague(b.match, overrides) ?? 'ETC'
}

// ─── 축구 리그 추가 입력 ──────────────────────────────────────────
function AddSoccerLeagueInput({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!name.trim()) return
    setSaving(true); await onAdd(name.trim()); setName(''); setSaving(false)
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="새 리그 이름 (예: 프리미어리그)"
        className="form-input" style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} />
      <button onClick={submit} disabled={saving || !name.trim()}
        style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
          border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
        <Plus size={11} /> 리그 추가
      </button>
    </div>
  )
}

// ─── 축구: 리그 미확인 팀 → 리그 매핑 지정 ───────────────────────
function UnmatchedSoccerLeagueGroup({ matchText, bets, knownLeagues, onAssign }: {
  matchText: string; bets: Bet[]; knownLeagues: string[]
  onAssign: (keyword: string, league: string) => Promise<void>
}) {
  const [keyword, setKeyword] = useState(matchText)
  const [newLeague, setNewLeague] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const s = calcStats(bets)
  async function assign(league: string) {
    if (!keyword.trim() || !league.trim()) return
    setSaving(league)
    await onAssign(keyword.trim(), league.trim())
    setSaving(null)
  }
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{matchText}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>{s.total}건</span>
        {s.total > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: s.profit >= 0 ? '#4ade80' : '#f87171' }}>{s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString()}원</span>}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
        판별용 키워드(팀 이름)를 확인/수정한 뒤 리그를 지정하세요. 지정하면 이 키워드가 포함된 베팅은 앞으로 항상 해당 리그로 분류됩니다.
      </div>
      <input value={keyword} onChange={e => setKeyword(e.target.value)}
        placeholder="판별 키워드 (예: 팀 이름)"
        className="form-input"
        style={{ width: '100%', fontSize: 11, padding: '5px 8px', marginBottom: 6 }} />
      {knownLeagues.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <select
            defaultValue=""
            disabled={saving !== null}
            onChange={e => { const v = e.target.value; if (v) { assign(v); e.target.value = '' } }}
            className="form-input"
            style={{ flex: 1, fontSize: 11, padding: '5px 8px', cursor: saving ? 'not-allowed' : 'pointer' }}>
            <option value="" disabled>{saving ? '저장중...' : '리그 선택 →'}</option>
            {knownLeagues.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={newLeague} onChange={e => setNewLeague(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && assign(newLeague)}
          placeholder="새 리그로 지정"
          className="form-input" style={{ flex: 1, fontSize: 11, padding: '5px 8px' }} />
        <button onClick={() => assign(newLeague)} disabled={saving !== null || !newLeague.trim()}
          style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
            border: '1px solid var(--gold-border)', background: 'var(--gold-bg)', color: 'var(--gold)' }}>
          → 지정
        </button>
      </div>
    </div>
  )
}

// ─── 축구: 리그별 성적 (좌: 리그명 가나다순, 우: 승률·ROI·손익 — 배당 구간은 제외) ──
function SoccerLeagueSection({ bets, overrides, knownLeagues, onAddOverride, onAddLeague }: {
  bets: Bet[]
  overrides: LeagueOverride[]; knownLeagues: string[]
  onAddOverride: (keyword: string, league: string) => Promise<void>
  onAddLeague: (name: string) => Promise<void>
}) {
  const allSettled = bets.filter(b => b.result !== 'pending')
  const leagueKeyOf = (b: Bet) => soccerLeagueOf(b, overrides)

  const leagueNames = Array.from(new Set(allSettled.map(leagueKeyOf).filter(l => l !== 'ETC'))).sort(koCompare)
  const rows: RuleRow[] = leagueNames.map(l => ({ label: l, tier: 'none', bets: allSettled.filter(b => leagueKeyOf(b) === l) }))

  const etcBets = allSettled.filter(b => leagueKeyOf(b) === 'ETC')
  const etcGroups = Array.from(
    etcBets.reduce((map, b) => {
      if (!map.has(b.match)) map.set(b.match, [])
      map.get(b.match)!.push(b)
      return map
    }, new Map<string, Bet[]>())
  ).sort((a, b) => b[1].length - a[1].length)

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>⚽ 리그별 성적 (가나다순)</div>
      {rows.length > 0
        ? <RuleStatsTable title="리그별 승률·ROI·손익" rows={rows} />
        : <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>리그가 지정된 베팅이 없습니다. 아래에서 팀을 리그에 매핑해 주세요.</div>}

      <div style={{ marginTop: 10 }}>
        <AddSoccerLeagueInput onAdd={onAddLeague} />
      </div>

      {etcGroups.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>❓ 리그 미확인 — {etcBets.length}건, 팀 이름 확인 후 리그 매핑</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {etcGroups.map(([matchText, groupBets]) => (
              <UnmatchedSoccerLeagueGroup key={matchText} matchText={matchText} bets={groupBets} knownLeagues={knownLeagues} onAssign={onAddOverride} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 축구 상세 통계 (배당 흐름 기반 — 마켓별 0.1단위 구간 통계) ──────
function SoccerDetailPanel({ bets, overrides, knownLeagues, onAddOverride, onAddLeague }: {
  bets: Bet[]
  overrides: LeagueOverride[]; knownLeagues: string[]
  onAddOverride: (keyword: string, league: string) => Promise<void>
  onAddLeague: (name: string) => Promise<void>
}) {
  const settled = bets.filter(b => b.result !== 'pending')
  const ml = settled.filter(b => b.market === 'moneyline')
  const hcap = settled.filter(b => b.market === 'handicap')
  const hcap15 = hcap.filter(b => extractHandicapLine(b.pick) === 1.5)
  const hcap25 = hcap.filter(b => extractHandicapLine(b.pick) === 2.5)

  // 베팅을 일반승(승무패) / 핸디캡 1.5 플핸 / 핸디캡 2.5 플핸 세 가지로 구분,
  // 각각 0.1단위 배당 구간별 적중률·수익률을 표시. 그 외(다른 라인, 오버/언더 등)는 룰북 외로 이동.
  const tables = [
    { title: '⚽ 일반승(승무패) — 0.1단위 배당 구간별', rows: oddsBinRows(ml) },
    { title: '⚽ 핸디캡 1.5 플핸 — 0.1단위 배당 구간별', rows: oddsBinRows(hcap15) },
    { title: '⚽ 핸디캡 2.5 플핸 — 0.1단위 배당 구간별', rows: oddsBinRows(hcap25) },
  ].filter(t => t.rows.length > 0)

  const ruleIds = new Set(tables.flatMap(t => t.rows.flatMap(r => r.bets)).map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <SoccerLeagueSection bets={bets} overrides={overrides} knownLeagues={knownLeagues} onAddOverride={onAddOverride} onAddLeague={onAddLeague} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {tables.map(t => <RuleStatsTable key={t.title} title={t.title} rows={t.rows} />)}
      </div>
      <OtherBetsPanel bets={otherBets} />
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


// ─── 라이브 베팅 패널 ─────────────────────────────────────────────
function LivePanel({ bets, onDeleteRequest }: { bets: Bet[]; onDeleteRequest: () => void }) {
  const liveBets = bets.filter(b => b.is_live && b.result !== 'pending')
  const pendingLive = bets.filter(b => b.is_live && b.result === 'pending')

  if (liveBets.length === 0 && pendingLive.length === 0) return (
    <div className="card"><div className="empty"><div className="empty-icon">🔴</div>라이브 베팅 기록이 없습니다</div></div>
  )
  if (liveBets.length === 0) return (
    <div>
      <div className="card"><div className="empty"><div className="empty-icon">🔴</div>결과 처리된 라이브 베팅이 없습니다</div></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>
    </div>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
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
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>

      {/* 종목별 카드 */}
      {bySport.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {bySport.map(r => {
            // 해당 종목 마켓별
            const mkts = (['moneyline','handicap','over','under'] as Market[]).reduce<{ label: string; total: number; winRate: number; roi: number }[]>((acc, mkt) => {
              const mb = r.settled.filter(b => b.market === mkt)
              if (!mb.length) return acc
              const ms = calcStats(mb)
              acc.push({ label: { moneyline:'승패', handicap:'핸디캡', over:'오버', under:'언더', correct_score:'정확한스코어', other:'기타' }[mkt], ...ms })
              return acc
            }, [])
            return (
              <div key={r.sp} className="card" style={{ flex: '1 0 160px', minWidth: 160, maxWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>{r.emoji}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{r.sp}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{r.total}건</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: r.roi >= 0 ? '#4ade80' : '#f87171' }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</div>
                    <div style={{ fontSize: 9, color: r.winRate >= 50 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{r.winRate.toFixed(0)}% 승률</div>
                  </div>
                </div>
                <div style={{ height: 1, background: 'var(--border)', marginBottom: 6 }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: r.profit >= 0 ? '#4ade80' : '#f87171', marginBottom: 6 }}>
                  손익 {r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}원
                </div>
                {mkts.map(m => (
                  <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-secondary)', width: 40, flexShrink: 0 }}>{m.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 20 }}>{m.total}건</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: m.winRate >= 50 ? '#4ade80' : '#f87171', width: 30 }}>{m.winRate.toFixed(0)}%</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: m.roi >= 0 ? '#4ade80' : '#f87171' }}>{m.roi >= 0 ? '+' : ''}{m.roi.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

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


function SportPanel({ bets, sport, onDeleteRequest, leagueOverrides, onAddLeagueOverride, soccerOverrides, soccerLeagues, onAddSoccerOverride, onAddSoccerLeague }: {
  bets: Bet[]; sport: typeof SPORTS[0]; onDeleteRequest: () => void
  leagueOverrides: LeagueOverride[]; onAddLeagueOverride: (keyword: string, league: League) => Promise<void>
  soccerOverrides: LeagueOverride[]; soccerLeagues: string[]
  onAddSoccerOverride: (keyword: string, league: string) => Promise<void>
  onAddSoccerLeague: (name: string) => Promise<void>
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
        {sport.value === 'baseball'   && <BaseballDetailPanel bets={periodBets} overrides={leagueOverrides} onAddOverride={onAddLeagueOverride} />}
        {sport.value === 'soccer'     && <SoccerDetailPanel bets={periodBets} overrides={soccerOverrides} knownLeagues={soccerLeagues} onAddOverride={onAddSoccerOverride} onAddLeague={onAddSoccerLeague} />}
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
  const [rawBets, setRawBets] = useState<Bet[]>([])
  const [sites, setSites]     = useState<Site[]>([])
  const [rateMap, setRateMap] = useState<Record<string, number>>({})
  const [period, setPeriod]   = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [activeSport, setActiveSport] = useState<Sport | 'all' | 'live'>('all')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [leagueOverrides, setLeagueOverrides] = useState<LeagueOverride[]>([])
  const [soccerOverrides, setSoccerOverrides] = useState<LeagueOverride[]>([])
  const [soccerLeagues, setSoccerLeagues] = useState<string[]>([])

  useEffect(() => { loadBets(); loadSites(); loadRates(); loadLeagueOverrides(); loadSoccerLeagueData() }, [])
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
  async function loadLeagueOverrides() {
    const { data } = await supabase.from('league_overrides').select('keyword, league')
    if (data) setLeagueOverrides(data as LeagueOverride[])
  }
  async function addLeagueOverride(keyword: string, league: League) {
    const { data } = await supabase.from('league_overrides').upsert({ keyword, league }, { onConflict: 'keyword' }).select().single()
    if (data) setLeagueOverrides(p => [...p.filter(o => o.keyword !== keyword), { keyword: data.keyword, league: data.league }])
  }
  async function loadSoccerLeagueData() {
    const [{ data: ovr }, { data: leagues }] = await Promise.all([
      supabase.from('soccer_league_overrides').select('keyword, league'),
      supabase.from('soccer_leagues').select('name').order('sort_order').order('name'),
    ])
    if (ovr) setSoccerOverrides(ovr as LeagueOverride[])
    setSoccerLeagues(Array.from(new Set([...(leagues ?? []).map(l => l.name), ...(ovr ?? []).map(o => o.league)])).sort(koCompare))
  }
  async function addSoccerLeagueOverride(keyword: string, league: string) {
    await supabase.from('soccer_leagues').upsert({ name: league }, { onConflict: 'name', ignoreDuplicates: true })
    const { data } = await supabase.from('soccer_league_overrides').upsert({ keyword, league }, { onConflict: 'keyword' }).select().single()
    if (data) setSoccerOverrides(p => [...p.filter(o => o.keyword !== keyword), { keyword: data.keyword, league: data.league }])
    setSoccerLeagues(p => Array.from(new Set([...p, league])).sort(koCompare))
  }
  async function addSoccerLeague(name: string) {
    await supabase.from('soccer_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    setSoccerLeagues(p => Array.from(new Set([...p, name])).sort(koCompare))
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
  // 라이브 베팅은 라이브 탭에서만 집계, 두폴(합산) 베팅은 개별 다리로 중복 집계되지 않도록 일반/종목별 통계에서는 제외
  const periodFiltered = periodAll.filter(b => !b.is_live && b.parlay_group === null)

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
              { value: 'live' as const, label: '라이브', emoji: '🔴', cnt: periodAll.filter(b => b.is_live && b.result !== 'pending').length },
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
          {activeSport !== 'all' && activeSport !== 'live' && (
            <SportPanel
              bets={periodFiltered}
              sport={SPORTS.find(s => s.value === activeSport)!}
              leagueOverrides={leagueOverrides}
              onAddLeagueOverride={addLeagueOverride}
              soccerOverrides={soccerOverrides}
              soccerLeagues={soccerLeagues}
              onAddSoccerOverride={addSoccerLeagueOverride}
              onAddSoccerLeague={addSoccerLeague}
              onDeleteRequest={() => {
                const sp = SPORTS.find(s => s.value === activeSport)!
                setDeleteTarget({ label: sp.label, emoji: sp.emoji, matchFn: b => b.sport === sp.value && !b.is_live && b.parlay_group === null })
              }}
            />
          )}
          {activeSport === 'live' && (
            <LivePanel bets={periodAll} onDeleteRequest={() => setDeleteTarget({ label: '라이브', emoji: '🔴', matchFn: b => b.is_live })} />
          )}
        </>
      )}

      {/* 데이터 삭제 모달 (종목 / 라이브 공용) */}
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

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Sport, Market, Site } from '../types'
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
// 대부분 팀 이름이 리그 간 겹치지 않아 자동 판별 가능. 유일한 예외는 "롯데"
// (KBO 롯데 자이언츠 / NPB 치바롯데마린즈 중복) — 다른 팀과 함께 언급되면 그 팀 기준으로 판별되고,
// "롯데" 단독으로만 나오면 KBO로 추정한다.
const KBO_TEAMS = ['KT','LG','NC','삼성','SSG','기아','두산','키움','한화']
const MLB_TEAMS = [
  '애리조나','애틀랜타','볼티모어','보스턴','시카고 컵스','화이트삭스','신시내티','클리블랜드','콜로라도',
  '디트로이트','휴스턴','캔자스시티','LA에인절스','LA다저스','마이애미','밀워키','미네소타',
  '뉴욕M','뉴욕메츠','뉴욕Y','뉴욕양키스','오클랜드','필라델피아','피츠버그','샌디에이고','샌프란시스코',
  '시애틀','세인트루이스','탬파베이','텍사스','토론토','워싱턴',
]
const NPB_TEAMS = ['요미우리','한신','주니치','요코하마','히로시마','야쿠르트','소프트뱅크','니혼햄','오릭스','세이부','라쿠텐']

type League = 'KBO' | 'MLB' | 'NPB'
function inferLeague(matchText: string): League | null {
  if (!matchText) return null
  const found = new Set<League>()
  if (KBO_TEAMS.some(t => matchText.includes(t))) found.add('KBO')
  if (MLB_TEAMS.some(t => matchText.includes(t))) found.add('MLB')
  if (NPB_TEAMS.some(t => matchText.includes(t))) found.add('NPB')
  if (found.size === 1) return [...found][0]
  if (found.size > 1) return null // 팀 이름이 뒤섞여 있어 판별 불가 (거의 발생하지 않음)
  if (matchText.includes('롯데')) return 'KBO' // 단독 "롯데"는 KBO로 추정
  return null
}

// ─── 야구 상세 통계 (룰북 기반) ──────────────────────────────────
// 배당(odds) 앞의 "N.N 언더/오버" 형태에서 라인 숫자를 추출
function extractTotalLine(pick: string): number | null {
  const m = pick?.match(/(\d+\.?\d*)\s*(?:언더|오버|under|over)/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return isNaN(n) ? null : n
}
function formatLine(n: number): string { return n.toFixed(1).replace(/\.0$/, '') }

// ─── 야구 승패 배당구간 등급 (황금구간 v1 · 2026-07) ────────────────
// S = 황금구간(흐름 무관 무조건), A = 흐름구간(배당 하락 방향 확인 필요), none = 회피
function mlTier(odds: number): RowColor {
  if (odds >= 2.2 && odds < 2.6) return 'S'
  if ((odds >= 1.6 && odds < 2.2) || (odds >= 2.6 && odds < 3.0)) return 'A'
  return 'none'
}

function BaseballRulebookSummary() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>⚾ 야구 룰북 요약 v1.1 (배당구간 · 라인무브)</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: TIER_STYLE.S.color, background: TIER_STYLE.S.bg, border: `1px solid ${TIER_STYLE.S.border}`, borderRadius: 4, padding: '2px 6px' }}>S 황금구간</span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>2.20 ~ 2.59 — 흐름 무관 무조건 진입</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: TIER_STYLE.A.color, background: TIER_STYLE.A.bg, border: `1px solid ${TIER_STYLE.A.border}`, borderRadius: 4, padding: '2px 6px' }}>A 흐름구간</span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>1.60 ~ 2.19 / 2.60 ~ 2.99 — 배당 떨어지는 방향 확인 후 진입, 흐름 없으면 패스</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>회피</span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>1.59 이하 / 3.00 이상 — 흐름 무관 패스</span>
      </div>

      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>언더/오버 — 방향 고정 없음</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          라인 자체 이동(예: 8.5→9) = 강한 신호, 이동 방향 따라가기 (반영 후 진입도 유효)<br />
          배당(주스)만 이동, 라인 고정 = 약한 신호, 원인 확인 후 판단<br />
          "무조건 언더/오버" 없음 — 매치업(선발·불펜·날씨·구장) 기반이 기본, 라인무브는 확인 도구
        </div>
      </div>
    </div>
  )
}

function BaseballDetailPanel({ bets }: { bets: Bet[] }) {
  const [leagueFilter, setLeagueFilter] = useState<League | 'ETC' | 'all'>('all')

  const allSettled = bets.filter(b => b.result !== 'pending')
  const leagueKeyOf = (b: Bet): League | 'ETC' => inferLeague(b.match) ?? 'ETC'

  const leagueSummary: { league: League | 'ETC'; label: string } [] = [
    { league: 'KBO', label: '🇰🇷 KBO' }, { league: 'MLB', label: '🇺🇸 MLB' }, { league: 'NPB', label: '🇯🇵 NPB' },
    { league: 'ETC', label: '❓ 기타(리그 미확인)' },
  ]
  const leagueStats = leagueSummary
    .map(({ league, label }) => ({ league, label, ...calcStats(allSettled.filter(b => leagueKeyOf(b) === league)) }))
    .filter(r => r.total > 0)

  const settled = leagueFilter === 'all' ? allSettled : allSettled.filter(b => leagueKeyOf(b) === leagueFilter)
  const ml = settled.filter(b => b.market === 'moneyline')
  const under = settled.filter(b => b.market === 'under')
  const over = settled.filter(b => b.market === 'over')

  // 승패(역배·정배 전체) — 실제 베팅한 배당 범위를 0.1 단위로 전부 커버 (룰북 등급 없이 순수 통계)
  const mlRows: RuleRow[] = (() => {
    if (!ml.length) return []
    const odds = ml.map(b => b.odds)
    const loStart = Math.floor(Math.min(...odds) * 10) / 10
    const loEnd = Math.floor((Math.max(...odds) - 0.0001) * 10) / 10
    const rows: RuleRow[] = []
    for (let lo = loStart; lo <= loEnd + 1e-9; lo = Math.round((lo + 0.1) * 10) / 10) {
      const hi = Math.round((lo + 0.1) * 10) / 10
      const rowBets = ml.filter(b => b.odds >= lo && b.odds < hi)
      if (rowBets.length > 0) rows.push({ label: lo.toFixed(1), tier: mlTier(lo), bets: rowBets })
    }
    return rows
  })()

  // 언더 / 오버 — 배당 구간이 아닌 총점 라인(7.5, 8, 8.5 ...) 별로 적중률 집계
  function groupByLine(list: Bet[]): { rows: RuleRow[]; noLineCount: number } {
    const map = new Map<number, Bet[]>()
    let noLineCount = 0
    list.forEach(b => {
      const line = extractTotalLine(b.pick)
      if (line === null) { noLineCount++; return }
      if (!map.has(line)) map.set(line, [])
      map.get(line)!.push(b)
    })
    const rows = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([line, lineBets]) => ({ label: formatLine(line), tier: 'none' as RowColor, bets: lineBets }))
    return { rows, noLineCount }
  }
  const { rows: underRows, noLineCount: underNoLine } = groupByLine(under)
  const { rows: overRows, noLineCount: overNoLine } = groupByLine(over)

  // 그외
  const ruleIds = new Set([...mlRows.flatMap(r => r.bets), ...underRows.flatMap(r => r.bets), ...overRows.flatMap(r => r.bets)].map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <BaseballRulebookSummary />

      {/* 리그별 요약 + 필터 탭 (팀 이름으로 자동 추론) */}
      {leagueStats.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setLeagueFilter('all')}
              style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                border: `1px solid ${leagueFilter === 'all' ? 'var(--green-border)' : 'var(--border)'}`,
                background: leagueFilter === 'all' ? 'var(--green-bg)' : 'var(--bg-elevated)',
                color: leagueFilter === 'all' ? 'var(--green)' : 'var(--text-muted)' }}>전체</button>
            {leagueStats.map(r => (
              <button key={r.league} onClick={() => setLeagueFilter(r.league)}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  border: `1px solid ${leagueFilter === r.league ? 'var(--green-border)' : 'var(--border)'}`,
                  background: leagueFilter === r.league ? 'var(--green-bg)' : 'var(--bg-elevated)',
                  color: leagueFilter === r.league ? 'var(--green)' : 'var(--text-muted)' }}>{r.label} ({r.total})</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RuleStatsTable title="⚾ 승패(전체) — 0.1단위 배당 구간별" rows={mlRows} />
        <RuleStatsTable title="⚾ 언더 — 라인별 적중률" rows={underRows}
          extra={underNoLine > 0 ? <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>라인 미확인: {underNoLine}건</div> : undefined} />
        <RuleStatsTable title="⚾ 오버 — 라인별 적중률" rows={overRows}
          extra={overNoLine > 0 ? <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>라인 미확인: {overNoLine}건</div> : undefined} />
      </div>
      <OtherBetsPanel bets={otherBets} />
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

// ─── 축구 상세 통계 (배당 흐름 기반 — 마켓별 0.1단위 구간 통계) ──────
function SoccerDetailPanel({ bets }: { bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const ml = settled.filter(b => b.market === 'moneyline')
  const hcap = settled.filter(b => b.market === 'handicap')
  const overBets = settled.filter(b => b.market === 'over')
  const underBets = settled.filter(b => b.market === 'under')

  const tables = [
    { title: '⚽ 승패 — 0.1단위 배당 구간별', rows: oddsBinRows(ml) },
    { title: '⚽ 핸디캡 — 0.1단위 배당 구간별', rows: oddsBinRows(hcap) },
    { title: '⚽ 오버 — 0.1단위 배당 구간별', rows: oddsBinRows(overBets) },
    { title: '⚽ 언더 — 0.1단위 배당 구간별', rows: oddsBinRows(underBets) },
  ].filter(t => t.rows.length > 0)

  const ruleIds = new Set(tables.flatMap(t => t.rows.flatMap(r => r.bets)).map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
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

  const tables = [
    { title: '🏀 승패 — 0.1단위 배당 구간별', rows: oddsBinRows(ml) },
    { title: '🏀 핸디캡 — 0.1단위 배당 구간별', rows: oddsBinRows(hcap) },
    { title: '🏀 오버 — 0.1단위 배당 구간별', rows: oddsBinRows(overBets) },
    { title: '🏀 언더 — 0.1단위 배당 구간별', rows: oddsBinRows(underBets) },
  ].filter(t => t.rows.length > 0)

  const ruleIds = new Set(tables.flatMap(t => t.rows.flatMap(r => r.bets)).map(b => b.id))
  const otherBets = settled.filter(b => !ruleIds.has(b.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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



function ParlayPanel({ bets, onDeleteRequest }: { bets: Bet[]; onDeleteRequest: () => void }) {
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
    <div>
      <div className="card"><div className="empty"><div className="empty-icon">2️⃣</div>두폴 베팅 기록이 없습니다</div></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 요약 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
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
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
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


/* ── 데이터 삭제 대상 (종목 / 라이브 / 두폴 공용) ── */
interface DeleteTarget { label: string; emoji: string; matchFn: (b: Bet) => boolean }

/* ── 데이터 삭제 모달 (종목 / 라이브 / 두폴 공용) ── */
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
  const [rawBets, setRawBets] = useState<Bet[]>([])
  const [sites, setSites]     = useState<Site[]>([])
  const [rateMap, setRateMap] = useState<Record<string, number>>({})
  const [period, setPeriod]   = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [activeSport, setActiveSport] = useState<Sport | 'all' | 'parlay' | 'live'>('all')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  useEffect(() => { loadBets(); loadSites(); loadRates() }, [])
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
  // 라이브 베팅은 라이브 탭에서만, 두폴 베팅은 두폴 탭에서만 집계 — 일반/종목별 통계에서는 제외
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
          {activeSport !== 'all' && activeSport !== 'parlay' && activeSport !== 'live' && (
            <SportPanel
              bets={periodFiltered}
              sport={SPORTS.find(s => s.value === activeSport)!}
              onDeleteRequest={() => {
                const sp = SPORTS.find(s => s.value === activeSport)!
                setDeleteTarget({ label: sp.label, emoji: sp.emoji, matchFn: b => b.sport === sp.value && !b.is_live && b.parlay_group === null })
              }}
            />
          )}
          {activeSport === 'parlay' && (
            <ParlayPanel bets={periodAll} onDeleteRequest={() => setDeleteTarget({ label: '두폴', emoji: '2️⃣', matchFn: b => b.parlay_group !== null })} />
          )}
          {activeSport === 'live' && (
            <LivePanel bets={periodAll} onDeleteRequest={() => setDeleteTarget({ label: '라이브', emoji: '🔴', matchFn: b => b.is_live })} />
          )}
        </>
      )}

      {/* 데이터 삭제 모달 (종목 / 라이브 / 두폴 공용) */}
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

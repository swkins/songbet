import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { koName } from '../lib/gameSchedule'

// ─── 예측 보고서 'NBA 모의베팅 · 방법별 적중률' ─────────────────────────────────────────────
// mock_bets = DB가 앞으로의 NBA 경기에 방법(mock_strategies)마다 자동으로 모의 베팅 (supabase/nba_mock_bets.sql)
//   시점 pre22 = 21:45 KST (사용자 22시 베팅) · close = 경기 시작 30분 전 안 · 기준점·배당 = 그때까지 받은 마지막 값, 끝나면 채점.
// 핸디 손익분기 ≈ 52.4% (배당 1.91). 표본 100건 전에는 참고만.

interface Stat { strategy: string; timing: 'pre22' | 'close'; market: 'spread' | 'total'; label: string | null; source: string | null; note: string | null; sort: number | null
  n: number; hits: number; pushes: number; profit: number | null; n7: number; hits7: number; pending: number; last_date: string | null }
interface Bet { id: number; game_date: string; home: string; away: string; timing: string; side: string; line: number; odds: number; hit: boolean | null; push: boolean | null; profit: number | null; result_home: number | null; result_away: number | null }

const BE = 0.524
const pctTxt = (h: number, n: number) => n ? `${Math.round(h / n * 1000) / 10}%` : '–'
const color = (h: number, n: number) => !n ? 'var(--text-muted)' : h / n > BE ? 'var(--green)' : 'var(--red)'

function sideText(b: Bet) {
  if (b.side === 'over' || b.side === 'under') return `${b.side === 'over' ? '오버' : '언더'} ${b.line}`
  const l = Number(b.line), home = b.side === 'home', mine = home ? l : -l
  return `${koName(home ? b.home : b.away)} ${mine === 0 ? '0' : mine < 0 ? `마핸 ${-mine}` : `플핸 ${mine}`}`
}

export default function MockBetStats() {
  const [stats, setStats] = useState<Stat[]>([])
  const [mkt, setMkt] = useState<'all' | 'spread' | 'total'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('v_mock_bet_stats').select('*').then(({ data }) => { setStats((data ?? []) as Stat[]); setLoading(false) })
  }, [])
  useEffect(() => {
    setBets([])
    if (!open) return
    supabase.from('mock_bets').select('id,game_date,home,away,timing,side,line,odds,hit,push,profit,result_home,result_away')
      .eq('strategy', open).order('game_date', { ascending: false }).limit(60).then(({ data }) => setBets((data ?? []) as Bet[]))
  }, [open])

  const rows = useMemo(() => {
    const m = new Map<string, { key: string; label: string; market: string; source: string | null; note: string | null; sort: number; pre?: Stat; close?: Stat }>()
    stats.forEach(s => {
      if (!m.has(s.strategy)) m.set(s.strategy, { key: s.strategy, label: s.label ?? s.strategy, market: s.market, source: s.source, note: s.note, sort: s.sort ?? 999 })
      m.get(s.strategy)![s.timing === 'pre22' ? 'pre' : 'close'] = s
    })
    const tot = (r: { pre?: Stat; close?: Stat }) => (r.pre?.n ?? 0) + (r.close?.n ?? 0)
    const rate = (r: { pre?: Stat; close?: Stat }) => { const n = tot(r); return n ? ((r.pre?.hits ?? 0) + (r.close?.hits ?? 0)) / n : -1 }
    return [...m.values()].filter(r => mkt === 'all' || r.market === mkt).sort((a, b) => rate(b) - rate(a) || a.sort - b.sort)
  }, [stats, mkt])

  const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 6px', borderBottom: '1px solid var(--border)', fontSize: 12, verticalAlign: 'top' }
  const cell = (s?: Stat) => s && (s.n || s.pending) ? (
    <td style={td}>
      <span style={{ fontWeight: 800, color: color(s.hits, s.n) }}>{s.n ? `${s.hits}/${s.n} (${pctTxt(s.hits, s.n)})` : '–'}</span>
      {s.n > 0 && s.profit != null && <span style={{ fontSize: 10, color: Number(s.profit) > 0 ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>{Number(s.profit) > 0 ? '+' : ''}{Math.round(Number(s.profit) / (s.n + s.pushes) * 1000) / 10}%</span>}
      {s.pending > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>대기 {s.pending}</div>}
    </td>) : <td style={{ ...td, color: 'var(--text-muted)' }}>–</td>

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: 'var(--bg-elevated)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>NBA 모의베팅 · 방법별 적중률</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>모든 경기에 방법마다 자동으로 모의 베팅 → 끝나면 채점 · 22시 = 21:45 기준점 · 직전 = 시작 30분 전 · 손익분기 52.4% · 수익률 = 1씩 걸었을 때 · 표본 100건 전엔 참고만</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {([['all', '전체'], ['spread', '핸디'], ['total', '언오버']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setMkt(k)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${mkt === k ? 'var(--gold-border)' : 'var(--border)'}`, background: mkt === k ? 'var(--gold-bg)' : 'none', color: mkt === k ? 'var(--gold)' : 'var(--text-secondary)' }}>{t}</button>
          ))}
        </div>
      </div>
      {loading ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>불러오는 중…</div> : !rows.length ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>아직 모의베팅이 없어요 (매일 21:45와 경기 시작 30분 전에 자동으로 걸어요)</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>방법</th><th style={th}>시장</th><th style={th}>22시 기준</th><th style={th}>경기 직전</th><th style={th}>최근 7일</th><th style={th}>백테스트 근거</th></tr></thead>
          <tbody>{rows.map(r => {
            const n7 = (r.pre?.n7 ?? 0) + (r.close?.n7 ?? 0), h7 = (r.pre?.hits7 ?? 0) + (r.close?.hits7 ?? 0)
            return [
              <tr key={r.key} onClick={() => setOpen(open === r.key ? null : r.key)} style={{ cursor: 'pointer', background: open === r.key ? 'var(--gold-bg)' : undefined }}>
                <td style={{ ...td, fontWeight: 700 }}>{r.label}{r.note && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{r.note}</div>}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.market === 'spread' ? '핸디' : '언오버'}</td>
                {cell(r.pre)}{cell(r.close)}
                <td style={{ ...td, color: color(h7, n7) }}>{n7 ? `${h7}/${n7} (${pctTxt(h7, n7)})` : '–'}</td>
                <td style={{ ...td, fontSize: 10, color: 'var(--text-muted)' }}>{r.source}</td>
              </tr>,
              open === r.key && (
                <tr key={r.key + '-x'}><td colSpan={6} style={{ ...td, background: 'var(--bg)' }}>
                  {!bets.length ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>불러오는 중…</span> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th style={th}>날짜</th><th style={th}>경기 (홈 - 원정)</th><th style={th}>시점</th><th style={th}>픽</th><th style={th}>배당</th><th style={th}>결과</th></tr></thead>
                      <tbody>{bets.map(b => (
                        <tr key={b.id}>
                          <td style={td}>{dayjs(b.game_date).format('M/D')}</td>
                          <td style={td}>{koName(b.home)} - {koName(b.away)}</td>
                          <td style={{ ...td, color: 'var(--text-muted)' }}>{b.timing === 'pre22' ? '22시' : '직전'}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{sideText(b)}</td>
                          <td style={{ ...td, fontFamily: 'var(--font-num)' }}>{Number(b.odds).toFixed(2)}</td>
                          <td style={td}>{b.result_home == null ? <span style={{ color: 'var(--text-muted)' }}>대기</span> : b.push ? '적특' : <span style={{ color: b.hit ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{b.hit ? '✓' : '✗'} {b.result_home}-{b.result_away}</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </td></tr>
              ),
            ]
          })}</tbody>
        </table>
      )}
    </div>
  )
}

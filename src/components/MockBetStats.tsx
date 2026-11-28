import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { koName } from '../lib/gameSchedule'

// ─── 예측 보고서 'NBA 모의베팅 · 방법별 적중률' ─────────────────────────────────────────────
// mock_bets = DB가 앞으로의 NBA 경기에 방법(mock_strategies)마다 자동으로 모의 베팅 (supabase/nba_mock_bets.sql)
//   시점 pre22 = 21:45 KST (사용자 22시 베팅) · close = 경기 시작 30분 전 안 · 기준점·배당 = 그때까지 받은 마지막 값, 끝나면 채점.
// 핸디 손익분기 ≈ 52.4% (배당 1.91). 표본 100건 전에는 참고만.

interface Stat { league?: string; strategy: string; timing: 'pre22' | 'bet' | 'close'; market: 'spread' | 'total'; label: string | null; source: string | null; note: string | null; sort: number | null
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

// KBL (2026-11-28 사용자 요청): 같은 표, league 'KBL' · 시점 'bet' = 평일 14:40·주말 09:40 (사용자 베팅 시간) — supabase/kbl_mock_bets.sql
const PRE = (t: string) => t === 'pre22' || t === 'bet'
export default function MockBetStats({ league = 'NBA' }: { league?: 'NBA' | 'KBL' }) {
  const kbl = league === 'KBL'
  const [stats, setStats] = useState<Stat[]>([])
  const [mkt, setMkt] = useState<'all' | 'spread' | 'total'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('v_mock_bet_stats').select('*').eq('league', league).then(({ data }) => { setStats((data ?? []) as Stat[]); setLoading(false) })
  }, [league])
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
      m.get(s.strategy)![PRE(s.timing) ? 'pre' : 'close'] = s
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
        <span style={{ fontSize: 14, fontWeight: 800 }}>{league} 모의베팅 · 방법별 적중률</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kbl
          ? '모든 경기에 방법마다 자동으로 모의 베팅 → 끝나면 채점 · 기준점 = 365Scores Bet365 메인 라인 · 베팅 시간 = 평일 14:40·주말 09:40 (15분 전에 배당 새로 받음) · 직전 = 시작 30분 전 (비교용) · 정수 기준점 같으면 적특 · 손익분기 약 54% (배당 1.83) · 표본 100건 전엔 참고만'
          : '모든 경기에 방법마다 자동으로 모의 베팅 → 끝나면 채점 · 22시 = 21:45 기준점 (내가 거는 시간, 21:15에 배당 새로 받음) · 직전 = 시작 30분 전 (비교용 — 22시보다 좋으면 늦게 걸수록 유리) · 손익분기 52.4% · 수익률 = 1씩 걸었을 때 · 표본 100건 전엔 참고만'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {([['all', '전체'], ['spread', '핸디'], ['total', '언오버']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setMkt(k)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${mkt === k ? 'var(--gold-border)' : 'var(--border)'}`, background: mkt === k ? 'var(--gold-bg)' : 'none', color: mkt === k ? 'var(--gold)' : 'var(--text-secondary)' }}>{t}</button>
          ))}
        </div>
      </div>
      {loading ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>불러오는 중…</div> : !rows.length ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{kbl ? '아직 모의베팅이 없어요 (경기 날 평일 14:40·주말 09:40과 시작 30분 전에 자동으로 걸어요 — 기준점이 올라온 경기만)' : '아직 모의베팅이 없어요 (매일 21:45와 경기 시작 30분 전에 자동으로 걸어요)'}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>방법</th><th style={th}>시장</th><th style={th}>{kbl ? '베팅 시간 (실제)' : '22시 기준 (실제)'}</th><th style={th}>경기 직전 (비교)</th><th style={th}>최근 7일</th><th style={th}>백테스트 근거</th></tr></thead>
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
                          <td style={{ ...td, color: 'var(--text-muted)' }}>{b.timing === 'pre22' ? '22시' : b.timing === 'bet' ? '베팅 시간' : '직전'}</td>
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

// ─── 분석 화면 (NBA 경기 하나): 이 경기에 걸린 모의베팅 — 방법별 22시·직전 픽, 그 방법 누적 적중률, 핸디·언오버 방법들이 어느 쪽에 몰렸나 ─────
interface GameBet extends Bet { strategy: string; market: 'spread' | 'total' }
// 양쪽 다 거는 기본 방법·'반대로' 비교용 방법 — 쏠림 요약에서는 뺀다
const COMPARE = new Set(['kbl_home_all', 'kbl_away_all', 'kbl_fav_all', 'kbl_dog_all', 'kbl_over_all', 'kbl_under_all', 'kbl_move_fade', 'kbl_tmove_fade', 'home_all', 'away_all', 'fav_all', 'dog_all', 'over_all', 'under_all', 'model_fade3', 'model_ou_fade5', 'pub60_follow', 'move_fade1', 'tmove_fade2', 'fat_tired8'])
export function MockBetsForGame({ gameId, league = 'NBA' }: { gameId: string; league?: 'NBA' | 'KBL' }) {
  const kbl = league === 'KBL'
  const [bets, setBets] = useState<GameBet[] | null>(null)
  const [stats, setStats] = useState<Stat[]>([])
  const [open, setOpen] = useState(false)   // 기본은 한 줄 요약만, 누르면 방법별 표 (사용자 요청)
  useEffect(() => {
    setBets(null)
    Promise.all([
      supabase.from('mock_bets').select('id,game_date,home,away,timing,side,line,odds,hit,push,profit,result_home,result_away,strategy,market').eq('game_id', gameId),
      supabase.from('v_mock_bet_stats').select('*').eq('league', league),
    ]).then(([b, s]) => { setBets((b.data ?? []) as GameBet[]); setStats((s.data ?? []) as Stat[]) })
  }, [gameId])
  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)' }
  const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid var(--border)', fontSize: 11, verticalAlign: 'top' }
  if (bets == null) return null
  const keys = [...new Set(bets.map(b => b.strategy))]
  const info = (k: string) => stats.find(s => s.strategy === k)
  const rec = (k: string) => { const xs = stats.filter(s => s.strategy === k); const n = xs.reduce((a, s) => a + s.n, 0), h = xs.reduce((a, s) => a + s.hits, 0); return { n, h } }
  const rows = keys.map(k => ({ k, label: info(k)?.label ?? k, market: bets.find(b => b.strategy === k)!.market, sort: info(k)?.sort ?? 999,
    pre: bets.find(b => b.strategy === k && PRE(b.timing)), close: bets.find(b => b.strategy === k && b.timing === 'close') }))
    .sort((a, b) => a.sort - b.sort)
  // 쏠림: 최신 시점(직전 있으면 직전, 없으면 22시) 기준 방법 수 — 요약은 비교용 방법 빼고
  const latest = rows.map(r => r.close ?? r.pre).filter((x): x is GameBet => !!x)
  const cnt = (m: string, side: string, all = false) => latest.filter(b => b.market === m && b.side === side && (all || !COMPARE.has(b.strategy))).length
  const one = latest[0]
  const graded = latest.filter(b => !COMPARE.has(b.strategy) && b.result_home != null && !b.push)
  const gHit = graded.filter(b => b.hit).length
  const pickCell = (b?: GameBet) => !b ? <td style={{ ...td, color: 'var(--text-muted)' }}>–</td> : (
    <td style={td}>
      <span style={{ fontWeight: 700 }}>{sideText(b)}</span> <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-num)' }}>@{Number(b.odds).toFixed(2)}</span>
      {b.result_home != null && <span style={{ marginLeft: 4, fontWeight: 700, color: b.push ? 'var(--text-muted)' : b.hit ? 'var(--green)' : 'var(--red)' }}>{b.push ? '적특' : b.hit ? '✓' : '✗'}</span>}
    </td>)
  return (
    <div style={{ ...box, borderColor: 'var(--blue-border)' }}>
      {/* 한 줄 요약 (누르면 펼침) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer', fontSize: 12 }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>모의베팅 {open ? '▾' : '▸'}</span>
        {!bets.length ? <span style={{ color: 'var(--text-muted)' }}>{kbl ? '아직 안 걸었어요 (경기 날 평일 14:40·주말 09:40에 자동 — 기준점이 올라온 경기만)' : '아직 안 걸었어요 (매일 21:45에 자동)'}</span> : one && <>
          <span>핸디 <b>{koName(one.home)} {cnt('spread', 'home')}</b> : <b>{koName(one.away)} {cnt('spread', 'away')}</b></span>
          <span>언오버 <b>오버 {cnt('total', 'over')}</b> : <b>언더 {cnt('total', 'under')}</b></span>
          {graded.length > 0 && <span style={{ fontWeight: 700, color: gHit / graded.length > 0.524 ? 'var(--green)' : 'var(--red)' }}>결과 {gHit}/{graded.length} 적중</span>}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>방법 수 (비교용 빼고)</span>
        </>}
      </div>
      {open && bets.length > 0 && <>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 2px' }}>조건이 맞은 방법 {keys.length}개 · {kbl ? '베팅 시간(평일 14:40·주말 09:40)' : '21:45(22시 기준)'}·경기 시작 30분 전(직전)에 자동으로 걸고 끝나면 채점 · 누적 = 그 방법 전체 경기 성적</div>
        {one && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, margin: '4px 0' }}>
            <span>핸디: <b>{koName(one.home)} 쪽 {cnt('spread', 'home', true)}개</b> · <b>{koName(one.away)} 쪽 {cnt('spread', 'away', true)}개</b></span>
            <span>언오버: <b>오버 {cnt('total', 'over', true)}개</b> · <b>언더 {cnt('total', 'under', true)}개</b></span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>('전 경기 홈/원정·오버/언더'처럼 양쪽 다 거는 비교용 방법 포함 — 쏠림은 참고만)</span>
          </div>
        )}
        {open && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <thead><tr><th style={th}>방법</th><th style={th}>시장</th><th style={th}>{kbl ? '베팅 시간 픽' : '22시 픽'}</th><th style={th}>직전 픽</th><th style={th}>이 방법 누적</th></tr></thead>
            <tbody>{rows.map(r => { const { n, h } = rec(r.k); return (
              <tr key={r.k}>
                <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{r.market === 'spread' ? '핸디' : '언오버'}</td>
                {pickCell(r.pre)}{pickCell(r.close)}
                <td style={{ ...td, color: color(h, n), fontWeight: 700 }}>{n ? `${h}/${n} (${pctTxt(h, n)})` : '–'}</td>
              </tr>) })}</tbody>
          </table>
        )}
      </>}
    </div>
  )
}

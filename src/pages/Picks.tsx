import React, { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { matchBets, SPORT_EMOJI, type Pick, type PickBetLite } from '../lib/picks'

// ─── 픽 (사용자 요청): Supabase `picks` 테이블을 그대로 나열 ─────────────────
// 새 픽이 들어오면 실시간(Supabase Realtime, picks 테이블을 supabase_realtime에 등록함)으로 바로 반영하고,
// 실시간 연결이 끊겨도 창으로 돌아올 때·1분마다 다시 불러온다.
// 실제로 건 베팅(bets)과 팀 이름으로 맞춰 "베팅함" 표시.

interface BetLite extends PickBetLite {}

function stars(g: number | null) {
  const n = Math.max(0, Math.min(5, g ?? 0))
  return <span style={{ color: '#fbbf24', letterSpacing: -1, whiteSpace: 'nowrap' }}>{'★'.repeat(n)}<span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - n)}</span></span>
}

export default function Picks() {
  const [picks, setPicks] = useState<Pick[]>([])
  const [bets, setBets] = useState<BetLite[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)

  async function load() {
    const since = dayjs().subtract(30, 'day').format('YYYY-MM-DD')
    const [{ data: pd }, { data: bd }] = await Promise.all([
      supabase.from('picks').select('*').order('kickoff_at', { ascending: false }).order('sort_order').limit(500),
      supabase.from('bets').select('match, stake, odds, result, profit, bet_date, sport').eq('is_mock', false).gte('bet_date', since),
    ])
    if (pd) setPicks(pd as Pick[])
    if (bd) setBets(bd as BetLite[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('picks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, payload => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          setPicks(p => p.filter(x => x.id !== id))
          return
        }
        const row = payload.new as Pick
        setPicks(p => [row, ...p.filter(x => x.id !== row.id)])
        if (payload.eventType === 'INSERT') setNewIds(s => new Set(s).add(row.id))
      })
      .subscribe(status => setLive(status === 'SUBSCRIBED'))
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(load, 60_000)
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus); window.clearInterval(timer) }
  }, [])

  // 경기일(한국시간) 최신순, 같은 날은 별점 높은 순 → sort_order
  const groups = useMemo(() => {
    const by = new Map<string, Pick[]>()
    for (const p of picks) {
      const d = dayjs(p.kickoff_at ?? p.created_at).format('YYYY-MM-DD')
      by.set(d, [...(by.get(d) ?? []), p])
    }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, ps]) => [d,
      ps.sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? ''))] as const)
  }, [picks])

  const th: React.CSSProperties = { fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, padding: '6px 6px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { fontSize: 11, padding: '6px 6px', borderBottom: '1px solid var(--border-light)', verticalAlign: 'top' }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="card-title" style={{ margin: 0, fontSize: 14 }}>픽</div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{picks.length}건</span>
        <span title={live ? '새 픽이 들어오면 바로 표시' : '실시간 연결 안 됨 — 1분마다·창 돌아올 때 새로 불러옴'}
          style={{ fontSize: 10, fontWeight: 700, color: live ? '#4ade80' : 'var(--text-muted)' }}>● {live ? '실시간' : '1분마다 갱신'}</span>
        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', fontSize: 10 }} onClick={load}>새로고침</button>
      </div>

      {loading ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>불러오는 중…</div>
        : groups.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>저장된 픽이 없습니다</div>
        : groups.map(([date, ps]) => {
          const placed = ps.filter(p => matchBets(p, bets).length > 0).length
          return (
            <div key={date} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{dayjs(date).format('M월 D일')} ({'일월화수목금토'[dayjs(date).day()]})</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>픽 {ps.length}건 · 베팅함 {placed}건</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={th}>시간</th><th style={th}>추천도</th><th style={th}>리그</th><th style={th}>경기 (홈 vs 원정)</th>
                      <th style={th}>픽</th><th style={{ ...th, textAlign: 'right' }}>배당</th><th style={{ ...th, textAlign: 'right' }}>금액</th>
                      <th style={th}>티켓</th><th style={th}>배당 흐름</th><th style={th}>베팅</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ps.map(p => {
                      const mb = matchBets(p, bets)
                      const isNew = newIds.has(p.id)
                      const open = openId === p.id
                      const pickTeam = p.pick_side === 'home' ? p.home_team : p.pick_side === 'away' ? p.away_team : ''
                      return (
                        <React.Fragment key={p.id}>
                          <tr onClick={() => setOpenId(open ? null : p.id)} style={{ cursor: 'pointer', background: isNew ? 'rgba(74,222,128,0.08)' : undefined }}>
                            <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.kickoff_at ? dayjs(p.kickoff_at).format('HH:mm') : '—'}</td>
                            <td style={td}>{stars(p.grade)}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{SPORT_EMOJI[p.sport] ?? ''} {p.league}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <span style={{ fontWeight: p.home_team === pickTeam ? 800 : 400 }}>{p.home_team}</span>
                              <span style={{ color: 'var(--text-muted)' }}> vs </span>
                              <span style={{ fontWeight: p.away_team === pickTeam ? 800 : 400 }}>{p.away_team}</span>
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {p.pick_label}{p.market_type && <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>{p.market_type}</span>}
                              {isNew && <span style={{ fontSize: 9, fontWeight: 800, color: '#4ade80', marginLeft: 4 }}>NEW</span>}
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>{p.base_odds != null ? Number(p.base_odds).toFixed(2) : '—'}</td>
                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{p.stake != null ? Number(p.stake).toLocaleString() : '—'}</td>
                            <td style={{ ...td, color: 'var(--text-secondary)', maxWidth: 170 }}>{p.ticket_info ?? '—'}</td>
                            <td style={{ ...td, color: 'var(--text-secondary)', maxWidth: 190 }}>{p.flow_info ?? '—'}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {mb.length === 0 ? <span style={{ color: 'var(--text-muted)' }}>—</span> : mb.map((b, i) => (
                                <div key={i} style={{ fontSize: 10, fontWeight: 700, color: b.result === 'win' ? '#4ade80' : b.result === 'loss' ? '#f87171' : 'var(--text-secondary)' }}>
                                  {Number(b.stake).toLocaleString()} @{Number(b.odds).toFixed(2)} {b.result === 'pending' ? '진행중' : b.result === 'win' ? `+${Number(b.profit).toLocaleString()}` : b.result === 'loss' ? '실패' : b.result}
                                </div>
                              ))}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={10} style={{ ...td, background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-secondary)' }}>
                                <div><b style={{ color: 'var(--text-primary)' }}>근거</b> {p.rationale ?? '—'}</div>
                                <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {(p.tags ?? []).map(t => <span key={t} style={{ fontSize: 9, border: '1px solid var(--border)', borderRadius: 4, padding: '0 5px' }}>{t}</span>)}
                                  {p.rule_version && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>룰 {p.rule_version}</span>}
                                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>등록 {dayjs(p.created_at).format('M/D HH:mm')}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
    </div>
  )
}

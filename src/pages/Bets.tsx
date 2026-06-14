import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, Check, X, Ticket } from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer', label: '축구' }, { value: 'baseball', label: '야구' },
  { value: 'basketball', label: '농구' }, { value: 'volleyball', label: '배구' },
  { value: 'esports', label: 'e스포츠' }, { value: 'other', label: '기타' },
]
const MARKETS: { value: Market; label: string }[] = [
  { value: 'handicap', label: '핸디캡' }, { value: 'over_under', label: '오버/언더' },
  { value: 'moneyline', label: '승패' }, { value: 'correct_score', label: '정확한스코어' },
  { value: 'other', label: '기타' },
]
const sL = (s: Sport) => SPORTS.find(x => x.value === s)?.label ?? s
const mL = (m: Market) => MARKETS.find(x => x.value === m)?.label ?? m

// 배당 자동변환: 125 → 1.25, 190 → 1.90, 1.90 → 1.90
function parseOdds(raw: string): number {
  const n = Number(raw)
  if (!raw || isNaN(n)) return 0
  if (n >= 100) return n / 100
  return n
}

interface SlipForm { content: string; sport: Sport; market: Market; pick: string; odds: string }
const emptySlip = (): SlipForm => ({ content: '', sport: 'soccer', market: 'handicap', pick: '', odds: '' })

export default function Bets() {
  const [sites, setSites] = useState<Site[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [showSlip, setShowSlip] = useState(false)
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)
  const [slipForm, setSlipForm] = useState<SlipForm>(emptySlip())
  const [showAddSite, setShowAddSite] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [slipAmount, setSlipAmount] = useState('')
  const [resultTarget, setResultTarget] = useState<Bet | null>(null)
  const [resultValue, setResultValue] = useState<BetResult>('win')

  useEffect(() => { loadSites(); loadBets() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) {
      setSites(data)
      if (data.length > 0 && !activeSiteId) setActiveSiteId(data[0].id)
    }
  }
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*')
      .order('bet_date', { ascending: false }).order('created_at', { ascending: false })
    if (data) setBets(data)
  }

  const activeSite = sites.find(s => s.id === activeSiteId) ?? null
  const odds = parseOdds(slipForm.odds)
  const oddsDisplay = odds > 0 ? odds.toFixed(2) : ''

  async function addSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites')
      .insert({ name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length, rolling_target: 0, rolling_done: 0 })
      .select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'sites', record_id: data.id, after_data: data, description: `사이트 추가: ${data.name}` })
      setSites(p => [...p, data]); setActiveSiteId(data.id); setNewSiteName(''); setShowAddSite(false)
    }
  }

  async function deleteSite(id: string) {
    const site = sites.find(s => s.id === id)
    if (!site || !confirm(`${site.name} 삭제?`)) return
    await logAction({ action_type: 'delete', table_name: 'sites', record_id: id, before_data: site as never, description: `사이트 삭제: ${site.name}` })
    await supabase.from('sites').delete().eq('id', id)
    setSites(p => p.filter(s => s.id !== id))
    if (activeSiteId === id) setActiveSiteId(sites.find(s => s.id !== id)?.id ?? null)
  }

  async function doDeposit() {
    if (!activeSite || !slipAmount) return
    const amount = Number(slipAmount)
    if (!amount) return
    const before = { ...activeSite }
    const { data } = await supabase.from('sites')
      .update({ balance: activeSite.balance + amount, active: true }).eq('id', activeSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${activeSite.name} 입금 +${amount.toLocaleString()}원` })
      setSites(p => p.map(s => s.id === data.id ? data : s)); setSlipAmount('')
    }
  }

  async function doBet() {
    if (!activeSite || !slipForm.content || !slipForm.odds || !slipAmount) return
    const stake = Number(slipAmount)
    if (!stake) return
    if (stake > activeSite.balance) { alert('잔액이 부족합니다'); return }
    const finalOdds = parseOdds(slipForm.odds)
    const { data: betData } = await supabase.from('bets').insert({
      bet_date: dayjs().format('YYYY-MM-DD'),
      sport: slipForm.sport, league: '', match: slipForm.content,
      market: slipForm.market, pick: slipForm.pick,
      odds: finalOdds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: activeSite.id,
    }).select().single()
    if (!betData) return
    const siteBefore = { ...activeSite }
    const { data: siteData } = await supabase.from('sites')
      .update({ balance: activeSite.balance - stake, rolling_done: activeSite.rolling_done + stake })
      .eq('id', activeSite.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${activeSite.name}] 베팅: ${slipForm.content} / ${slipForm.pick} / ${stake.toLocaleString()}원` })
      await logAction({ action_type: 'update', table_name: 'sites', record_id: siteData.id, before_data: siteBefore as never, after_data: siteData as never, description: `[${activeSite.name}] 잔액 -${stake.toLocaleString()}원` })
      setBets(p => [betData, ...p]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      setSlipForm(emptySlip()); setSlipAmount('')
    }
  }

  async function saveResult() {
    if (!resultTarget) return
    const { stake, odds: bOdds, site_id } = resultTarget
    const profit = resultValue === 'win' ? Math.round(stake * (bOdds - 1)) : resultValue === 'loss' ? -stake : 0
    const before = { ...resultTarget }
    const { data } = await supabase.from('bets').update({ result: resultValue, profit }).eq('id', resultTarget.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `결과: ${resultTarget.match} → ${resultValue === 'win' ? '적중' : resultValue === 'loss' ? '실패' : '적특'}` })
      setBets(p => p.map(b => b.id === resultTarget.id ? data : b))
      const site = sites.find(s => s.id === site_id)
      if (site) {
        const delta = resultValue === 'win' ? stake + profit : resultValue === 'push' ? stake : 0
        if (delta) {
          const { data: sd } = await supabase.from('sites').update({ balance: site.balance + delta }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === site.id ? sd : s))
        }
      }
    }
    setResultTarget(null)
  }

  async function deleteBet(bet: Bet) {
    if (!confirm('삭제?')) return
    await logAction({ action_type: 'delete', table_name: 'bets', record_id: bet.id, before_data: bet as never, description: `베팅 삭제: ${bet.match}` })
    await supabase.from('bets').delete().eq('id', bet.id)
    setBets(p => p.filter(b => b.id !== bet.id))
  }

  const rollingPct = (s: Site) => s.rolling_target > 0 ? Math.min(100, Math.round(s.rolling_done / s.rolling_target * 100)) : 0
  const rollingLeft = (s: Site) => Math.max(0, s.rolling_target - s.rolling_done)

  return (
    <div className="page">
      <div className="flex-between mb-20">
        <h1 className="page-title">베팅</h1>
      </div>

      {/* 사이트 가로 요약 카드 */}
      {sites.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {sites.map(site => {
            const sb = bets.filter(b => b.site_id === site.id)
            const pending = sb.filter(b => b.result === 'pending').length
            return (
              <div key={site.id} style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px',
                minWidth: 160,
                flex: '1 1 160px',
                maxWidth: 220,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{site.name}</div>
                <div className={site.balance >= 0 ? 'profit-pos' : 'profit-neg'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700 }}>
                  {site.balance.toLocaleString()}원
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                  총 {sb.length}건
                  {pending > 0 && <span style={{ marginLeft: 6, color: 'var(--yellow)' }}>대기 {pending}</span>}
                </div>
                {site.rolling_target > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginBottom: 3 }}>
                      <span>롤링</span>
                      <span style={{ color: 'var(--gold)' }}>{rollingPct(site)}%</span>
                    </div>
                    <div className="rolling-bar">
                      <div className="rolling-fill" style={{ width: `${rollingPct(site)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 사이트별 베팅 목록 */}
      {bets.length === 0 && sites.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🎯</div>
            우측 하단 버튼으로 베팅을 추가하세요
          </div>
        </div>
      )}

      {sites.map(site => {
        const sb = bets.filter(b => b.site_id === site.id)
        if (sb.length === 0) return null
        return (
          <div key={site.id} className="site-section">
            <div className="site-section-header">
              <span className="site-section-name">{site.name}</span>
              {sb.filter(b => b.result === 'pending').length > 0 && (
                <span className="badge badge-pending">{sb.filter(b => b.result === 'pending').length}대기</span>
              )}
              <span className={`fw-7 ${site.balance >= 0 ? 'profit-pos' : 'profit-neg'}`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginLeft: 'auto' }}>
                {site.balance.toLocaleString()}원
              </span>
            </div>
            <div className="site-section-table">
              <table>
                <thead>
                  <tr>
                    <th>날짜</th><th>내용</th><th>종목</th><th>마켓</th><th>픽</th>
                    <th className="td-right">배당</th><th className="td-right">베팅액</th>
                    <th className="td-right">손익</th><th>결과</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sb.map(b => (
                    <tr key={b.id}>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 11 }}>{b.bet_date}</td>
                      <td style={{ fontWeight: 600 }}>{b.match}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{sL(b.sport)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{mL(b.market)}</td>
                      <td>{b.pick}</td>
                      <td className="td-right td-mono">{b.odds.toFixed(2)}</td>
                      <td className="td-right td-mono">{b.stake.toLocaleString()}</td>
                      <td className={`td-right td-mono ${b.profit > 0 ? 'profit-pos' : b.profit < 0 ? 'profit-neg' : 'profit-zero'}`}>
                        {b.result === 'pending' ? '—' : `${b.profit >= 0 ? '+' : ''}${b.profit.toLocaleString()}`}
                      </td>
                      <td><span className={`badge badge-${b.result}`}>
                        {b.result === 'pending' ? '대기' : b.result === 'win' ? '적중' : b.result === 'loss' ? '실패' : '적특'}
                      </span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {b.result === 'pending' && (
                            <button className="btn btn-xs btn-ghost"
                              onClick={() => { setResultTarget(b); setResultValue('win') }}>결과</button>
                          )}
                          <button className="btn btn-icon btn-danger btn-sm" onClick={() => deleteBet(b)}>
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* ── FAB ── */}
      <button className="fab-bet" onClick={() => setShowSlip(true)} title="베팅 추가">
        <Ticket size={20} />
      </button>

      {/* ── 베팅 슬립 모달 ── */}
      {showSlip && (
        <div className="modal-overlay" onClick={() => setShowSlip(false)}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            maxHeight: '90vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)' }}>
                BET SLIP
              </span>
              <button onClick={() => setShowSlip(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '16px' }}>
              {/* 사이트 선택 버튼들 */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {sites.map(s => (
                  <button key={s.id}
                    onClick={() => setActiveSiteId(s.id)}
                    style={{
                      padding: '4px 12px', borderRadius: 20,
                      border: `1px solid ${activeSiteId === s.id ? 'var(--gold)' : 'var(--border)'}`,
                      background: activeSiteId === s.id ? 'var(--gold-bg)' : 'transparent',
                      color: activeSiteId === s.id ? 'var(--gold)' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                    }}>
                    {s.name}
                  </button>
                ))}
                <button
                  onClick={() => setShowAddSite(true)}
                  style={{
                    padding: '4px 10px', borderRadius: 20,
                    border: '1px dashed var(--border)',
                    background: 'transparent', color: 'var(--text-secondary)',
                    fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                  <Plus size={10} /> 사이트
                </button>
              </div>

              {/* 선택된 사이트 잔액 + 롤링 */}
              {activeSite && (
                <div style={{
                  padding: '10px 14px', marginBottom: 14,
                  background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeSite.rolling_target > 0 ? 8 : 0 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 2 }}>잔액</div>
                      <div className={activeSite.balance >= 0 ? 'profit-pos' : 'profit-neg'}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}>
                        {activeSite.balance.toLocaleString()}원
                      </div>
                    </div>
                    {activeSite.rolling_target > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 2 }}>남은 롤링</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>
                          {rollingLeft(activeSite).toLocaleString()}원
                        </div>
                      </div>
                    )}
                  </div>
                  {activeSite.rolling_target > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        <span>롤링 진행률</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                          {rollingPct(activeSite)}% ({activeSite.rolling_done.toLocaleString()} / {activeSite.rolling_target.toLocaleString()})
                        </span>
                      </div>
                      <div className="rolling-bar">
                        <div className="rolling-fill" style={{ width: `${rollingPct(activeSite)}%` }} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 베팅 폼 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">내용</label>
                  <input className="form-input" placeholder="예: 맨시티 vs 아스날 / 오늘의 픽"
                    value={slipForm.content} onChange={e => setSlipForm(p => ({ ...p, content: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label">종목</label>
                    <select className="form-select" value={slipForm.sport}
                      onChange={e => setSlipForm(p => ({ ...p, sport: e.target.value as Sport }))}>
                      {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">마켓</label>
                    <select className="form-select" value={slipForm.market}
                      onChange={e => setSlipForm(p => ({ ...p, market: e.target.value as Market }))}>
                      {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label">픽</label>
                    <input className="form-input" placeholder="홈 -1.5 / 언더 2.5"
                      value={slipForm.pick} onChange={e => setSlipForm(p => ({ ...p, pick: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      배당
                      {oddsDisplay && <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700 }}>→ {oddsDisplay}</span>}
                    </label>
                    <input className="form-input" placeholder="125 = 1.25"
                      value={slipForm.odds}
                      onChange={e => setSlipForm(p => ({ ...p, odds: e.target.value }))} />
                  </div>
                </div>

                {/* 예상 수익 */}
                {odds > 0 && slipAmount && Number(slipAmount) > 0 && (
                  <div style={{
                    padding: '8px 12px', background: 'var(--green-bg)',
                    border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', fontSize: 12,
                  }}>
                    예상 수익: <strong className="profit-pos">+{Math.round(Number(slipAmount) * (odds - 1)).toLocaleString()}원</strong>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                      반환 {(Number(slipAmount) * odds).toLocaleString()}원
                    </span>
                  </div>
                )}

                {/* 금액 + 입금/베팅 */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    금액 입력
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="form-input" type="number" placeholder="금액 (원)"
                      value={slipAmount} onChange={e => setSlipAmount(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doBet()}
                      style={{ flex: 1 }} />
                    <button className="btn btn-green" style={{ flexShrink: 0 }} onClick={doDeposit}>입금</button>
                    <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={doBet}>
                      <Check size={13} /> 베팅
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
                    입금: 잔액 충전 · 베팅: 위 내용으로 등록 후 잔액 차감
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 사이트 추가 모달 */}
      {showAddSite && (
        <div className="modal-overlay" onClick={() => setShowAddSite(false)}>
          <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">사이트 추가</div>
            <div className="form-group mb-16">
              <label className="form-label">사이트 이름</label>
              <input className="form-input" placeholder="예: 1xBet, EZBET"
                value={newSiteName} onChange={e => setNewSiteName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSite()} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddSite(false)}>취소</button>
              <button className="btn btn-primary" onClick={addSite}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 처리 모달 */}
      {resultTarget && (
        <div className="modal-overlay" onClick={() => setResultTarget(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">결과 처리</div>
            <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{resultTarget.match}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                {resultTarget.pick} · {resultTarget.odds.toFixed(2)} · {resultTarget.stake.toLocaleString()}원
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['win', 'loss', 'push'] as const).map(r => (
                <button key={r} className={`btn ${resultValue === r ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ flex: 1 }} onClick={() => setResultValue(r)}>
                  {r === 'win' ? '✅ 적중' : r === 'loss' ? '❌ 실패' : '↩️ 적특'}
                </button>
              ))}
            </div>
            {resultValue === 'win' && (
              <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14 }}>
                수익: <strong className="profit-pos">+{Math.round(resultTarget.stake * (resultTarget.odds - 1)).toLocaleString()}원</strong>
              </div>
            )}
            {resultValue === 'loss' && (
              <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14 }}>
                손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResultTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}><Check size={13} /> 확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Check, X, Ticket, ChevronUp, ChevronDown, Pencil } from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer', label: '축구' }, { value: 'baseball', label: '야구' },
  { value: 'basketball', label: '농구' }, { value: 'volleyball', label: '배구' },
  { value: 'esports', label: 'e스포츠' }, { value: 'other', label: '기타' },
]

const MARKETS = [
  { value: 'moneyline',     label: '승패',       pickType: 'none',   hint: '' },
  { value: 'handicap',      label: '핸디캡',      pickType: 'number', hint: '예: 2.5 또는 -1.5' },
  { value: 'over',          label: '오버',        pickType: 'number', hint: '예: 2.5' },
  { value: 'under',         label: '언더',        pickType: 'number', hint: '예: 2.5' },
  { value: 'correct_score', label: '정확한스코어', pickType: 'text',   hint: '예: 2-1' },
  { value: 'other',         label: '기타',        pickType: 'text',   hint: '' },
] as const

type MarketValue = typeof MARKETS[number]['value']

function parseOdds(raw: string): number {
  const clean = raw.trim()
  if (!clean) return 0
  const n = Number(clean)
  if (isNaN(n) || n <= 0) return 0
  if (Number.isInteger(n) && n >= 100) return n / 100
  return n
}

function buildPickLabel(market: MarketValue, pick: string): string {
  if (!pick) return ''
  if (market === 'over') return `${pick} 오버`
  if (market === 'under') return `${pick} 언더`
  if (market === 'handicap') {
    const n = Number(pick)
    if (!isNaN(n)) return n < 0 ? `마이너스 핸디 ${Math.abs(n)}` : `핸디 ${n}`
  }
  return pick
}

interface SlipForm {
  sport: Sport; content: string; market: MarketValue; pick: string; odds: string
}
const emptySlip = (): SlipForm => ({ sport: 'soccer', content: '', market: 'moneyline', pick: '', odds: '' })

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

  // 수정 모달
  const [editTarget, setEditTarget] = useState<Bet | null>(null)
  const [editForm, setEditForm] = useState<SlipForm>(emptySlip())
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')

  const oddsRef = useRef<HTMLInputElement>(null)

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
  const currentMarket = MARKETS.find(m => m.value === slipForm.market)
  const oddsVal = parseOdds(slipForm.odds)
  const editCurrentMarket = MARKETS.find(m => m.value === editForm.market)
  const editOddsVal = parseOdds(editForm.odds)

  function handleOddsChange(raw: string, isEdit = false) {
    const clean = raw.replace(/[^0-9.]/g, '')
    const converted = /^\d{3}$/.test(clean) ? (Number(clean) / 100).toFixed(2) : clean
    if (isEdit) setEditForm(p => ({ ...p, odds: converted }))
    else setSlipForm(p => ({ ...p, odds: converted }))
  }

  function openEditModal(bet: Bet) {
    let rawPick = bet.pick
    const mkt = bet.market as MarketValue
    if (mkt === 'over' && rawPick.endsWith(' 오버')) rawPick = rawPick.replace(' 오버', '')
    if (mkt === 'under' && rawPick.endsWith(' 언더')) rawPick = rawPick.replace(' 언더', '')
    if (mkt === 'handicap') {
      const m1 = rawPick.match(/마이너스 핸디 ([\d.]+)/); if (m1) rawPick = `-${m1[1]}`
      else { const m2 = rawPick.match(/핸디 ([\d.]+)/); if (m2) rawPick = m2[1] }
    }
    setEditTarget(bet)
    setEditForm({ sport: bet.sport, content: bet.match, market: mkt, pick: rawPick, odds: bet.odds.toFixed(2) })
    setEditAmount(String(bet.stake))
    setEditDate(bet.bet_date)
  }

  async function saveEdit() {
    if (!editTarget) return
    const finalOdds = parseOdds(editForm.odds)
    if (!editForm.content || finalOdds <= 0 || !editAmount) return
    const pickLabel = buildPickLabel(editForm.market as MarketValue, editForm.pick)
    const before = { ...editTarget }
    let profit = editTarget.profit
    if (editTarget.result === 'win')  profit = Math.round(Number(editAmount) * (finalOdds - 1))
    if (editTarget.result === 'loss') profit = -Number(editAmount)
    if (editTarget.result === 'push') profit = 0
    const { data } = await supabase.from('bets').update({
      bet_date: editDate, sport: editForm.sport, match: editForm.content,
      market: editForm.market as Market, pick: pickLabel,
      odds: finalOdds, stake: Number(editAmount), profit,
    }).eq('id', editTarget.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `베팅 수정: ${data.match}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
    }
    setEditTarget(null)
  }

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
    const amount = Number(slipAmount); if (!amount) return
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
    const stake = Number(slipAmount); if (!stake) return
    if (stake > activeSite.balance) { alert('잔액이 부족합니다'); return }
    const finalOdds = parseOdds(slipForm.odds)
    if (finalOdds <= 0) { alert('배당을 올바르게 입력하세요'); return }
    const pickLabel = buildPickLabel(slipForm.market, slipForm.pick)
    const { data: betData } = await supabase.from('bets').insert({
      bet_date: dayjs().format('YYYY-MM-DD'), sport: slipForm.sport, league: '', match: slipForm.content,
      market: slipForm.market as Market, pick: pickLabel,
      odds: finalOdds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: activeSite.id,
    }).select().single()
    if (!betData) return
    const siteBefore = { ...activeSite }
    const { data: siteData } = await supabase.from('sites')
      .update({ balance: activeSite.balance - stake, rolling_done: activeSite.rolling_done + stake })
      .eq('id', activeSite.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${activeSite.name}] ${slipForm.content} / ${pickLabel} / ${stake.toLocaleString()}원` })
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
  const betsBySite = (siteId: string) => bets.filter(b => b.site_id === siteId)
  const colCount = sites.length

  /* ── 공통 모달 컨테이너 스타일 ── */
  const slipContainerSt: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460,
    boxShadow: '0 20px 60px rgba(0,0,0,0.7)', maxHeight: '92vh', overflowY: 'auto',
  }
  const slipHeaderSt: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
  }

  return (
    <div className="page">
      <div className="flex-between mb-16">
        <h1 className="page-title">베팅</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAddSite(true)}>
          <Plus size={12} /> 사이트 추가
        </button>
      </div>

      {sites.length > 0 && (
        <div className="site-grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(140px, 1fr))` }}>
          {sites.map(site => (
            <div key={site.id} className="site-col-head">
              {site.name}
              <button onClick={() => deleteSite(site.id)}
                style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.4, padding: 2, display: 'flex' }}
                title="삭제"><X size={10} /></button>
            </div>
          ))}

          {sites.map(site => (
            <div key={site.id} className="site-balance-cell">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className={`site-balance-num ${site.balance >= 0 ? 'profit-pos' : 'profit-neg'}`}>{site.balance.toLocaleString()}</div>
                <div className="site-balance-arrows">
                  <button className="site-arrow-btn" title="입금" onClick={() => { setActiveSiteId(site.id); setShowSlip(true) }}><ChevronUp size={9} /></button>
                  <button className="site-arrow-btn" title="베팅" onClick={() => { setActiveSiteId(site.id); setShowSlip(true) }}><ChevronDown size={9} /></button>
                </div>
              </div>
              {site.rolling_target > 0 && (
                <div style={{ width: '100%', marginTop: 4 }}>
                  <div className="rolling-bar"><div className="rolling-fill" style={{ width: `${rollingPct(site)}%` }} /></div>
                  <div style={{ fontSize: 9, color: 'var(--gold)', textAlign: 'center', marginTop: 2 }}>{rollingPct(site)}%</div>
                </div>
              )}
            </div>
          ))}

          {(() => {
            const maxRows = Math.max(...sites.map(s => betsBySite(s.id).length), 1)
            return Array.from({ length: maxRows }).map((_, rowIdx) =>
              sites.map(site => {
                const bet = betsBySite(site.id)[rowIdx]
                return (
                  <div key={`${site.id}-${rowIdx}`} className="site-bets-col">
                    {bet ? (
                      <div
                        className={`site-bet-entry ${bet.result === 'win' ? 'win' : ''}`}
                        style={{ position: 'relative' }}
                        onMouseEnter={e => { const el = e.currentTarget.querySelector('.bet-act') as HTMLElement; if (el) el.style.opacity = '1' }}
                        onMouseLeave={e => { const el = e.currentTarget.querySelector('.bet-act') as HTMLElement; if (el) el.style.opacity = '0' }}
                      >
                        <div className="site-bet-match">
                          {bet.match}
                          {bet.pick && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> {bet.pick}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                          <span className="site-bet-odds">{bet.odds.toFixed(2)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className={`badge badge-${bet.result}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                              {bet.result === 'pending' ? '대기' : bet.result === 'win' ? '적중' : bet.result === 'loss' ? '실패' : '적특'}
                            </span>
                            {bet.result === 'pending' && (
                              <button className="btn-xs btn-ghost btn" style={{ fontSize: 9, padding: '1px 5px' }}
                                onClick={() => { setResultTarget(bet); setResultValue('win') }}>결과</button>
                            )}
                            {/* hover 시 수정/삭제 */}
                            <div className="bet-act" style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: 0, transition: 'opacity 0.15s' }}>
                              <button title="수정" onClick={() => openEditModal(bet)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', opacity: 0.9, padding: 1, display: 'flex' }}>
                                <Pencil size={10} />
                              </button>
                              <button title="삭제" onClick={() => deleteBet(bet)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: 0.6, padding: 1, display: 'flex' }}>
                                <X size={10} />
                              </button>
                            </div>
                          </div>
                        </div>
                        {bet.result !== 'pending' && (
                          <div style={{ fontSize: 10, marginTop: 1 }} className={bet.profit >= 0 ? 'profit-pos' : 'profit-neg'}>
                            {bet.profit >= 0 ? '+' : ''}{bet.profit.toLocaleString()}원
                          </div>
                        )}
                      </div>
                    ) : <div style={{ height: 20 }} />}
                  </div>
                )
              })
            )
          })()}
        </div>
      )}

      {sites.length === 0 && (
        <div className="card"><div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하고 베팅을 시작하세요</div></div>
      )}

      <button className="fab-bet" onClick={() => setShowSlip(true)} title="베팅 추가"><Ticket size={20} /></button>

      {/* ── 베팅 슬립 모달 ── */}
      {showSlip && (
        <div className="modal-overlay" onClick={() => setShowSlip(false)}>
          <div style={slipContainerSt} onClick={e => e.stopPropagation()}>
            <div style={slipHeaderSt}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)' }}>BET SLIP</span>
              <button onClick={() => setShowSlip(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={14} /></button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {sites.map(s => (
                  <button key={s.id} onClick={() => setActiveSiteId(s.id)} style={{
                    padding: '4px 11px', borderRadius: 20,
                    border: `1px solid ${activeSiteId === s.id ? 'var(--gold)' : 'var(--border)'}`,
                    background: activeSiteId === s.id ? 'var(--gold-bg)' : 'transparent',
                    color: activeSiteId === s.id ? 'var(--gold)' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                  }}>{s.name}</button>
                ))}
                <button onClick={() => setShowAddSite(true)} style={{ padding: '4px 10px', borderRadius: 20, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Plus size={10} /> 사이트
                </button>
              </div>

              {activeSite && (
                <div style={{ padding: '10px 14px', marginBottom: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 2 }}>잔액</div>
                      <div className={activeSite.balance >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}>{activeSite.balance.toLocaleString()}원</div>
                    </div>
                    {activeSite.rolling_target > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 2 }}>남은 롤링</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{rollingLeft(activeSite).toLocaleString()}원</div>
                      </div>
                    )}
                  </div>
                  {activeSite.rolling_target > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 3 }}>
                        <span>롤링 진행률</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{rollingPct(activeSite)}% ({activeSite.rolling_done.toLocaleString()} / {activeSite.rolling_target.toLocaleString()})</span>
                      </div>
                      <div className="rolling-bar"><div className="rolling-fill" style={{ width: `${rollingPct(activeSite)}%` }} /></div>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, marginBottom: 8 }}>
                <div className="form-group">
                  <label className="form-label">종목</label>
                  <select className="form-select" value={slipForm.sport} onChange={e => setSlipForm(p => ({ ...p, sport: e.target.value as Sport }))}>
                    {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">내용</label>
                  <input className="form-input" placeholder="예: 맨시티 vs 아스날" value={slipForm.content} onChange={e => setSlipForm(p => ({ ...p, content: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div className="form-group">
                  <label className="form-label">마켓</label>
                  <select className="form-select" value={slipForm.market} onChange={e => setSlipForm(p => ({ ...p, market: e.target.value as MarketValue, pick: '' }))}>
                    {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">픽 {currentMarket?.pickType === 'none' ? <span style={{ fontWeight: 400, fontSize: 9, color: 'var(--text-muted)' }}>(선택 없음)</span> : <span style={{ fontWeight: 400, fontSize: 9, color: 'var(--text-muted)' }}>(선택사항)</span>}</label>
                  {currentMarket?.pickType === 'none'
                    ? <input className="form-input" disabled placeholder="—" style={{ opacity: 0.4, cursor: 'not-allowed' }} value="" readOnly />
                    : <input className="form-input" placeholder={currentMarket?.hint ?? ''} type={currentMarket?.pickType === 'number' ? 'number' : 'text'} step="0.5" value={slipForm.pick} onChange={e => setSlipForm(p => ({ ...p, pick: e.target.value }))} />
                  }
                </div>
              </div>

              {slipForm.pick && currentMarket?.pickType !== 'none' && (
                <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 8, padding: '4px 8px', background: 'var(--gold-bg)', borderRadius: 4, border: '1px solid var(--gold-border)' }}>
                  ↳ {buildPickLabel(slipForm.market, slipForm.pick)}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div className="form-group">
                  <label className="form-label">배당 {slipForm.odds && oddsVal > 0 && <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700, fontSize: 11 }}>→ {oddsVal.toFixed(2)}</span>}</label>
                  <input ref={oddsRef} className="form-input" placeholder="125 = 1.25" value={slipForm.odds}
                    onChange={e => handleOddsChange(e.target.value)}
                    onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setSlipForm(p => ({ ...p, odds: n.toFixed(2) })) }} />
                </div>
                <div className="form-group">
                  <label className="form-label">금액 (원)</label>
                  <input className="form-input" type="number" placeholder="베팅액" value={slipAmount} onChange={e => setSlipAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && doBet()} />
                </div>
              </div>

              {oddsVal > 0 && slipAmount && Number(slipAmount) > 0 && (
                <div style={{ padding: '8px 12px', marginBottom: 10, background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  예상 수익: <strong className="profit-pos">+{Math.round(Number(slipAmount) * (oddsVal - 1)).toLocaleString()}원</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>반환 {Math.round(Number(slipAmount) * oddsVal).toLocaleString()}원</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-green" style={{ flex: 1 }} onClick={doDeposit}>입금</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={doBet}><Check size={13} /> 베팅 등록</button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, textAlign: 'center' }}>입금: 잔액 충전 · 베팅: 위 내용으로 베팅 등록 후 잔액 차감</div>
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
              <input className="form-input" placeholder="예: 1xBet, EZBET" value={newSiteName} onChange={e => setNewSiteName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSite()} autoFocus />
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{resultTarget.pick} · {resultTarget.odds.toFixed(2)} · {resultTarget.stake.toLocaleString()}원</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['win', 'loss', 'push'] as const).map(r => (
                <button key={r} className={`btn ${resultValue === r ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setResultValue(r)}>
                  {r === 'win' ? '✅ 적중' : r === 'loss' ? '❌ 실패' : '↩️ 적특'}
                </button>
              ))}
            </div>
            {resultValue === 'win' && <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14 }}>수익: <strong className="profit-pos">+{Math.round(resultTarget.stake * (resultTarget.odds - 1)).toLocaleString()}원</strong></div>}
            {resultValue === 'loss' && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14 }}>손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong></div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResultTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}><Check size={13} /> 확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 베팅 수정 모달 ── */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div style={slipContainerSt} onClick={e => e.stopPropagation()}>
            <div style={slipHeaderSt}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)' }}>BET EDIT</span>
              <button onClick={() => setEditTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={14} /></button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input type="date" className="form-input" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">종목</label>
                  <select className="form-select" value={editForm.sport} onChange={e => setEditForm(p => ({ ...p, sport: e.target.value as Sport }))}>
                    {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">내용</label>
                  <input className="form-input" value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">마켓</label>
                  <select className="form-select" value={editForm.market} onChange={e => setEditForm(p => ({ ...p, market: e.target.value as MarketValue, pick: '' }))}>
                    {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">픽</label>
                  {editCurrentMarket?.pickType === 'none'
                    ? <input className="form-input" disabled placeholder="—" style={{ opacity: 0.4, cursor: 'not-allowed' }} value="" readOnly />
                    : <input className="form-input" placeholder={editCurrentMarket?.hint ?? ''} type={editCurrentMarket?.pickType === 'number' ? 'number' : 'text'} step="0.5" value={editForm.pick} onChange={e => setEditForm(p => ({ ...p, pick: e.target.value }))} />
                  }
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">배당 {editForm.odds && editOddsVal > 0 && <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700, fontSize: 11 }}>→ {editOddsVal.toFixed(2)}</span>}</label>
                  <input className="form-input" placeholder="125 = 1.25" value={editForm.odds}
                    onChange={e => handleOddsChange(e.target.value, true)}
                    onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setEditForm(p => ({ ...p, odds: n.toFixed(2) })) }} />
                </div>
                <div className="form-group">
                  <label className="form-label">금액 (원)</label>
                  <input className="form-input" type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditTarget(null)}>취소</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveEdit}><Check size={13} /> 수정 저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Site, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, Check, Settings, SendHorizonal } from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer', label: '축구' },
  { value: 'baseball', label: '야구' },
  { value: 'basketball', label: '농구' },
  { value: 'volleyball', label: '배구' },
  { value: 'esports', label: 'e스포츠' },
  { value: 'other', label: '기타' },
]
const MARKETS: { value: Market; label: string }[] = [
  { value: 'handicap', label: '핸디캡' },
  { value: 'over_under', label: '오버/언더' },
  { value: 'moneyline', label: '승패' },
  { value: 'correct_score', label: '정확한스코어' },
  { value: 'other', label: '기타' },
]
const sportLabel = (s: Sport) => SPORTS.find(x => x.value === s)?.label ?? s
const marketLabel = (m: Market) => MARKETS.find(x => x.value === m)?.label ?? m

interface InlineForm { match: string; sport: Sport; market: Market; pick: string; odds: string; stake: string }
const emptyInline = (): InlineForm => ({ match:'', sport:'soccer', market:'handicap', pick:'', odds:'', stake:'' })

export default function Bets() {
  const [sites, setSites] = useState<Site[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [showSiteModal, setShowSiteModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [depositSite, setDepositSite] = useState<Site | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [inlineForms, setInlineForms] = useState<Record<string, InlineForm>>({})
  const [resultTarget, setResultTarget] = useState<Bet | null>(null)
  const [resultValue, setResultValue] = useState<BetResult>('win')

  useEffect(() => { loadSites(); loadBets() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) {
      setSites(data)
      const forms: Record<string, InlineForm> = {}
      data.forEach((s: Site) => { forms[s.id] = emptyInline() })
      setInlineForms(forms)
    }
  }

  async function loadBets() {
    const { data } = await supabase.from('bets').select('*')
      .order('bet_date', { ascending: false }).order('created_at', { ascending: false })
    if (data) setBets(data)
  }

  function setForm(siteId: string, field: keyof InlineForm, value: string) {
    setInlineForms(p => ({ ...p, [siteId]: { ...p[siteId], [field]: value } }))
  }

  async function addSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites')
      .insert({ name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length })
      .select().single()
    if (data) { setSites(p => [...p, data]); setInlineForms(p => ({ ...p, [data.id]: emptyInline() })); setNewSiteName('') }
  }

  async function deleteSite(id: string) {
    if (!confirm('사이트를 삭제할까요?')) return
    await supabase.from('sites').delete().eq('id', id)
    setSites(p => p.filter(s => s.id !== id))
  }

  async function depositToSite() {
    if (!depositSite || !depositAmount) return
    const newBalance = depositSite.balance + Number(depositAmount)
    const { data } = await supabase.from('sites')
      .update({ balance: newBalance, active: true }).eq('id', depositSite.id).select().single()
    if (data) { setSites(p => p.map(s => s.id === depositSite.id ? data : s)); setDepositSite(null); setDepositAmount('') }
  }

  async function submitBet(siteId: string) {
    const f = inlineForms[siteId]
    if (!f?.match || !f.odds || !f.stake) return
    const odds = Number(f.odds); const stake = Number(f.stake)
    const site = sites.find(s => s.id === siteId)
    const { data } = await supabase.from('bets').insert({
      bet_date: dayjs().format('YYYY-MM-DD'),
      sport: f.sport, league: '', match: f.match, market: f.market,
      pick: f.pick, odds, stake, result: 'pending', profit: 0, memo: '', site_id: siteId,
    }).select().single()
    if (data) {
      setBets(p => [data, ...p])
      if (site) {
        const { data: sd } = await supabase.from('sites')
          .update({ balance: site.balance - stake }).eq('id', siteId).select().single()
        if (sd) setSites(p => p.map(s => s.id === siteId ? sd : s))
      }
      setInlineForms(p => ({ ...p, [siteId]: emptyInline() }))
    }
  }

  async function deleteBet(bet: Bet) {
    if (!confirm('삭제할까요?')) return
    await supabase.from('bets').delete().eq('id', bet.id)
    setBets(p => p.filter(b => b.id !== bet.id))
  }

  async function saveResult() {
    if (!resultTarget) return
    const { stake, odds, site_id } = resultTarget
    const profit = resultValue === 'win' ? Math.round(stake * (odds - 1)) : resultValue === 'loss' ? -stake : 0
    const { data } = await supabase.from('bets')
      .update({ result: resultValue, profit }).eq('id', resultTarget.id).select().single()
    if (data) {
      setBets(p => p.map(b => b.id === resultTarget.id ? data : b))
      const site = sites.find(s => s.id === site_id)
      if (site) {
        const delta = resultValue === 'win' ? stake + profit : resultValue === 'push' ? stake : 0
        if (delta) {
          const { data: sd } = await supabase.from('sites')
            .update({ balance: site.balance + delta }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === site.id ? sd : s))
        }
      }
    }
    setResultTarget(null)
  }

  const activeSites = sites.filter(s => s.active)
  const inactiveSites = sites.filter(s => !s.active)

  return (
    <div className="page">
      <div className="flex-between mb-20">
        <h1 className="page-title">베팅</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowSiteModal(true)}>
          <Settings size={13} /> 사이트 관리
        </button>
      </div>

      {/* 입금 대기 */}
      {inactiveSites.length > 0 && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, letterSpacing:'0.5px' }}>입금 대기</span>
          {inactiveSites.map(s => (
            <button key={s.id} className="btn btn-ghost btn-sm"
              onClick={() => { setDepositSite(s); setDepositAmount('') }}>
              {s.name} <span style={{ color:'var(--accent)', fontSize:10 }}>→ 입금</span>
            </button>
          ))}
        </div>
      )}

      {sites.length === 0 && (
        <div className="card"><div className="empty">
          <div className="empty-icon">🎰</div>
          사이트 관리에서 베팅 사이트를 추가하세요
        </div></div>
      )}

      {/* 활성 사이트 — 가로 스크롤 */}
      {activeSites.length > 0 && (
        <div className="sites-row">
          {activeSites.map(site => {
            const f = inlineForms[site.id] ?? emptyInline()
            const siteBets = bets.filter(b => b.site_id === site.id)
            const pending = siteBets.filter(b => b.result === 'pending').length

            return (
              <div key={site.id} className="site-col">
                {/* 헤더 */}
                <div className="site-col-header">
                  <span className="site-col-name">{site.name}</span>
                  {pending > 0 && <span className="badge badge-pending">{pending}대기</span>}
                  <span className={`site-col-balance ${site.balance >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                    {site.balance.toLocaleString()}원
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{ padding:'3px 8px', fontSize:11 }}
                    onClick={() => { setDepositSite(site); setDepositAmount('') }}>
                    입금
                  </button>
                </div>

                {/* 베팅 목록 */}
                <div className="site-bet-list">
                  {siteBets.length === 0 && (
                    <div style={{ padding:'20px 16px', textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>
                      베팅 없음
                    </div>
                  )}
                  {siteBets.map(b => (
                    <div key={b.id} className="site-bet-item">
                      <div className="flex-between mb-4">
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{b.match}</span>
                        <span className={`badge badge-${b.result}`}>
                          {b.result==='pending'?'대기':b.result==='win'?'적중':b.result==='loss'?'실패':'적특'}
                        </span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6 }}>
                        {sportLabel(b.sport)} · {marketLabel(b.market)}
                        {b.pick && ` · ${b.pick}`}
                      </div>
                      <div className="flex-between">
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-secondary)' }}>
                          {b.odds.toFixed(2)} · {b.stake.toLocaleString()}원
                        </span>
                        <span className={b.profit>0?'profit-pos':b.profit<0?'profit-neg':'profit-zero'}
                          style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>
                          {b.result!=='pending'?`${b.profit>=0?'+':''}${b.profit.toLocaleString()}`:'—'}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:4, marginTop:8 }}>
                        {b.result==='pending' && (
                          <button className="btn btn-ghost btn-sm" style={{ flex:1, fontSize:11 }}
                            onClick={() => { setResultTarget(b); setResultValue('win') }}>
                            결과 처리
                          </button>
                        )}
                        <button className="btn btn-icon btn-danger btn-sm" onClick={() => deleteBet(b)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 인라인 입력 폼 */}
                <div className="site-bet-form">
                  <input className="form-input" placeholder="경기 (예: 맨시티 vs 아스날)"
                    value={f.match} onChange={e => setForm(site.id,'match',e.target.value)}
                    onKeyDown={e => e.key==='Enter' && submitBet(site.id)} />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    <select className="form-select" value={f.sport}
                      onChange={e => setForm(site.id,'sport',e.target.value)}>
                      {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select className="form-select" value={f.market}
                      onChange={e => setForm(site.id,'market',e.target.value)}>
                      {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <input className="form-input" placeholder="픽 (예: 홈 -1.5, 언더 2.5)"
                    value={f.pick} onChange={e => setForm(site.id,'pick',e.target.value)} />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:6, alignItems:'center' }}>
                    <input className="form-input" placeholder="배당" type="number" step="0.01"
                      value={f.odds} onChange={e => setForm(site.id,'odds',e.target.value)} />
                    <input className="form-input" placeholder="금액 (원)" type="number"
                      value={f.stake} onChange={e => setForm(site.id,'stake',e.target.value)}
                      onKeyDown={e => e.key==='Enter' && submitBet(site.id)} />
                    <button className="btn btn-primary" style={{ padding:'7px 12px' }}
                      onClick={() => submitBet(site.id)}>
                      <SendHorizonal size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 사이트 관리 모달 */}
      {showSiteModal && (
        <div className="modal-overlay" onClick={() => setShowSiteModal(false)}>
          <div className="modal" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">사이트 관리</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {sites.length===0 && <div style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:12 }}>등록된 사이트 없음</div>}
              {sites.map(s => (
                <div key={s.id} className="flex-between" style={{ padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
                  <div>
                    <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{s.name}</span>
                    <span style={{ fontSize:11, marginLeft:8, color:s.active?'var(--green)':'var(--text-muted)' }}>
                      {s.active?'활성':'대기중'}
                    </span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteSite(s.id)}><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
            <div className="flex-center gap-8">
              <input className="form-input" placeholder="사이트 이름 (예: 1xBet, EZBET)"
                value={newSiteName} onChange={e => setNewSiteName(e.target.value)}
                onKeyDown={e => e.key==='Enter' && addSite()} />
              <button className="btn btn-primary" onClick={addSite} style={{ flexShrink:0 }}><Plus size={14}/></button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSiteModal(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 입금 모달 */}
      {depositSite && (
        <div className="modal-overlay" onClick={() => setDepositSite(null)}>
          <div className="modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{depositSite.name} 입금</div>
            <div style={{ marginBottom:12, fontSize:13, color:'var(--text-secondary)' }}>
              현재 잔액: <strong style={{ fontFamily:'var(--font-mono)', color:'var(--text-primary)' }}>{depositSite.balance.toLocaleString()}원</strong>
            </div>
            <div className="form-group">
              <label className="form-label">입금액 (원)</label>
              <input type="number" className="form-input" placeholder="0"
                value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                onKeyDown={e => e.key==='Enter' && depositToSite()} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDepositSite(null)}>취소</button>
              <button className="btn btn-primary" onClick={depositToSite}>입금 확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 처리 모달 */}
      {resultTarget && (
        <div className="modal-overlay" onClick={() => setResultTarget(null)}>
          <div className="modal" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">결과 처리</div>
            <div style={{ marginBottom:14, padding:'12px 14px', background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>{resultTarget.match}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-secondary)' }}>
                {resultTarget.pick} · {resultTarget.odds} · {resultTarget.stake.toLocaleString()}원
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              {(['win','loss','push'] as const).map(r => (
                <button key={r} className={`btn ${resultValue===r?'btn-primary':'btn-ghost'}`} style={{ flex:1 }}
                  onClick={() => setResultValue(r)}>
                  {r==='win'?'✅ 적중':r==='loss'?'❌ 실패':'↩️ 적특'}
                </button>
              ))}
            </div>
            {resultValue==='win' && (
              <div style={{ background:'var(--green-bg)', padding:'10px 14px', borderRadius:'var(--radius-sm)', fontSize:13, marginBottom:14, border:'1px solid #0D4028' }}>
                수익: <strong className="profit-pos">+{Math.round(resultTarget.stake*(resultTarget.odds-1)).toLocaleString()}원</strong>
              </div>
            )}
            {resultValue==='loss' && (
              <div style={{ background:'var(--red-bg)', padding:'10px 14px', borderRadius:'var(--radius-sm)', fontSize:13, marginBottom:14, border:'1px solid #4A1818' }}>
                손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResultTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}><Check size={14}/> 확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

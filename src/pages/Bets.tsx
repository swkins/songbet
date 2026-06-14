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

interface InlineForm {
  match: string
  sport: Sport
  market: Market
  pick: string
  odds: string
  stake: string
}

const emptyInline = (): InlineForm => ({
  match: '', sport: 'soccer', market: 'handicap', pick: '', odds: '', stake: ''
})

export default function Bets() {
  const [sites, setSites] = useState<Site[]>([])
  const [bets, setBets] = useState<Bet[]>([])

  // 사이트 관리 모달
  const [showSiteModal, setShowSiteModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')

  // 입금 모달
  const [depositSite, setDepositSite] = useState<Site | null>(null)
  const [depositAmount, setDepositAmount] = useState('')

  // 인라인 폼: siteId → InlineForm
  const [inlineForms, setInlineForms] = useState<Record<string, InlineForm>>({})

  // 결과 처리 모달
  const [resultTarget, setResultTarget] = useState<Bet | null>(null)
  const [resultValue, setResultValue] = useState<BetResult>('win')

  useEffect(() => { loadSites(); loadBets() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) {
      setSites(data)
      // 각 사이트 인라인 폼 초기화
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

  function updateForm(siteId: string, field: keyof InlineForm, value: string) {
    setInlineForms(p => ({ ...p, [siteId]: { ...p[siteId], [field]: value } }))
  }

  async function addSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites')
      .insert({ name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length })
      .select().single()
    if (data) {
      setSites(p => [...p, data])
      setInlineForms(p => ({ ...p, [data.id]: emptyInline() }))
      setNewSiteName('')
    }
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
      .update({ balance: newBalance, active: true })
      .eq('id', depositSite.id).select().single()
    if (data) {
      setSites(p => p.map(s => s.id === depositSite.id ? data : s))
      setDepositSite(null); setDepositAmount('')
    }
  }

  async function submitBet(siteId: string) {
    const f = inlineForms[siteId]
    if (!f?.match || !f.odds || !f.stake) return
    const odds = Number(f.odds)
    const stake = Number(f.stake)
    const site = sites.find(s => s.id === siteId)

    const { data } = await supabase.from('bets').insert({
      bet_date: dayjs().format('YYYY-MM-DD'),
      sport: f.sport, league: '', match: f.match,
      market: f.market, pick: f.pick,
      odds, stake, result: 'pending', profit: 0, memo: '', site_id: siteId,
    }).select().single()

    if (data) {
      setBets(p => [data, ...p])
      // 잔액 차감
      if (site) {
        const newBal = site.balance - stake
        const { data: sd } = await supabase.from('sites')
          .update({ balance: newBal }).eq('id', siteId).select().single()
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
    const profit = resultValue === 'win' ? Math.round(stake * (odds - 1))
      : resultValue === 'loss' ? -stake : 0
    const { data } = await supabase.from('bets')
      .update({ result: resultValue, profit }).eq('id', resultTarget.id).select().single()
    if (data) {
      setBets(p => p.map(b => b.id === resultTarget.id ? data : b))
      const site = sites.find(s => s.id === site_id)
      if (site) {
        const delta = resultValue === 'win' ? stake + profit : resultValue === 'push' ? stake : 0
        if (delta !== 0) {
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
  const betsBySite = (siteId: string) => bets.filter(b => b.site_id === siteId)

  return (
    <div className="page">
      <div className="flex-between mb-20">
        <h1 className="page-title">베팅</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowSiteModal(true)}>
          <Settings size={13} /> 사이트 관리
        </button>
      </div>

      {/* 입금 대기 사이트 */}
      {inactiveSites.length > 0 && (
        <div className="mb-20" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>입금 대기:</span>
          {inactiveSites.map(s => (
            <button key={s.id} className="btn btn-ghost btn-sm"
              onClick={() => { setDepositSite(s); setDepositAmount('') }}>
              {s.name} <span style={{ fontSize: 10, color: 'var(--accent)' }}>입금 →</span>
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

      {/* 사이트별 전체너비 카드 */}
      <div className="sites-wrap">
        {activeSites.map(site => {
          const siteBets = betsBySite(site.id)
          const f = inlineForms[site.id] ?? emptyInline()
          const pending = siteBets.filter(b => b.result === 'pending').length

          return (
            <div key={site.id} className="site-card">
              {/* 헤더 */}
              <div className="site-card-header">
                <div className="site-card-name">{site.name}</div>
                {pending > 0 && (
                  <span className="badge badge-pending">{pending}건 대기</span>
                )}
                <div className={`site-card-balance ${site.balance >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                  {site.balance.toLocaleString()}원
                </div>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setDepositSite(site); setDepositAmount('') }}>
                  입금
                </button>
              </div>

              {/* 기존 베팅 목록 */}
              {siteBets.length > 0 && (
                <div>
                  {/* 컬럼 헤더 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 80px 100px 90px 90px 90px 100px',
                    gap: 8, padding: '7px 20px',
                    background: 'var(--bg-elevated)',
                    fontSize: 10, color: 'var(--text-muted)',
                    fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
                    borderBottom: '1px solid var(--border-light)'
                  }}>
                    <span>경기</span>
                    <span>종목</span>
                    <span>마켓</span>
                    <span>픽</span>
                    <span style={{ textAlign: 'right' }}>배당</span>
                    <span style={{ textAlign: 'right' }}>베팅액</span>
                    <span style={{ textAlign: 'right' }}>결과/손익</span>
                  </div>

                  {siteBets.map(b => (
                    <div key={b.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 80px 100px 90px 90px 90px 100px',
                      gap: 8, padding: '11px 20px',
                      borderBottom: '1px solid var(--border-light)',
                      alignItems: 'center',
                      transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{b.match}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sportLabel(b.sport)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{marketLabel(b.market)}</span>
                      <span style={{ fontSize: 12 }}>{b.pick}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {b.odds.toFixed(2)}
                      </span>
                      <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {b.stake.toLocaleString()}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {b.result === 'pending' ? (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                            onClick={() => { setResultTarget(b); setResultValue('win') }}>
                            결과처리
                          </button>
                        ) : (
                          <>
                            <span className={`badge badge-${b.result}`}>
                              {b.result === 'win' ? '적중' : b.result === 'loss' ? '실패' : '적특'}
                            </span>
                            <span className={`${b.profit > 0 ? 'profit-pos' : b.profit < 0 ? 'profit-neg' : 'profit-zero'}`}
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {b.profit >= 0 ? '+' : ''}{b.profit.toLocaleString()}
                            </span>
                          </>
                        )}
                        <button className="btn btn-icon btn-danger btn-sm" onClick={() => deleteBet(b)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 인라인 베팅 입력 폼 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 110px 1fr 90px 90px auto',
                gap: 8, padding: '10px 20px',
                background: 'var(--bg)',
                borderTop: siteBets.length > 0 ? '1px solid var(--border)' : undefined,
                alignItems: 'center'
              }}>
                <input className="form-input" placeholder="경기 (예: 맨시티 vs 아스날)"
                  value={f.match} onChange={e => updateForm(site.id, 'match', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitBet(site.id)}
                  style={{ fontSize: 12, padding: '7px 10px', background: 'var(--bg-card)' }} />
                <select className="form-select" value={f.sport}
                  onChange={e => updateForm(site.id, 'sport', e.target.value)}
                  style={{ fontSize: 12, padding: '7px 8px', background: 'var(--bg-card)' }}>
                  {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select className="form-select" value={f.market}
                  onChange={e => updateForm(site.id, 'market', e.target.value)}
                  style={{ fontSize: 12, padding: '7px 8px', background: 'var(--bg-card)' }}>
                  {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input className="form-input" placeholder="픽"
                  value={f.pick} onChange={e => updateForm(site.id, 'pick', e.target.value)}
                  style={{ fontSize: 12, padding: '7px 10px', background: 'var(--bg-card)' }} />
                <input className="form-input" placeholder="배당" type="number" step="0.01"
                  value={f.odds} onChange={e => updateForm(site.id, 'odds', e.target.value)}
                  style={{ fontSize: 12, padding: '7px 10px', background: 'var(--bg-card)' }} />
                <input className="form-input" placeholder="금액" type="number"
                  value={f.stake} onChange={e => updateForm(site.id, 'stake', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitBet(site.id)}
                  style={{ fontSize: 12, padding: '7px 10px', background: 'var(--bg-card)' }} />
                <button className="btn btn-primary btn-sm" onClick={() => submitBet(site.id)}
                  style={{ padding: '7px 12px' }}>
                  <SendHorizonal size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 사이트 관리 모달 */}
      {showSiteModal && (
        <div className="modal-overlay" onClick={() => setShowSiteModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">사이트 관리</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {sites.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                  등록된 사이트 없음
                </div>
              )}
              {sites.map(s => (
                <div key={s.id} className="flex-between" style={{
                  padding: '10px 14px', background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)'
                }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 11, marginLeft: 8, color: s.active ? 'var(--green)' : 'var(--text-muted)' }}>
                      {s.active ? '활성' : '대기중'}
                    </span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteSite(s.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex-center gap-8">
              <input className="form-input" placeholder="사이트 이름 (예: 1xBet)"
                value={newSiteName} onChange={e => setNewSiteName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSite()} />
              <button className="btn btn-primary" onClick={addSite} style={{ flexShrink: 0 }}>
                <Plus size={14} />
              </button>
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
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{depositSite.name} 입금</div>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
              현재 잔액: <strong style={{ fontFamily: 'var(--font-mono)' }}>{depositSite.balance.toLocaleString()}원</strong>
            </div>
            <div className="form-group">
              <label className="form-label">입금액 (원)</label>
              <input type="number" className="form-input" placeholder="0"
                value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && depositToSite()} autoFocus />
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
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">결과 처리</div>
            <div style={{ marginBottom: 14, color: 'var(--text-secondary)', fontSize: 13 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{resultTarget.match}</strong><br />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {resultTarget.pick} · {resultTarget.odds} · {resultTarget.stake.toLocaleString()}원
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['win', 'loss', 'push'] as const).map(r => (
                <button key={r}
                  className={`btn ${resultValue === r ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ flex: 1 }} onClick={() => setResultValue(r)}>
                  {r === 'win' ? '✅ 적중' : r === 'loss' ? '❌ 실패' : '↩️ 적특'}
                </button>
              ))}
            </div>
            {resultValue === 'win' && (
              <div style={{ background: 'var(--green-bg)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14, border: '1px solid #1A4A2E' }}>
                수익: <strong className="profit-pos">+{Math.round(resultTarget.stake * (resultTarget.odds - 1)).toLocaleString()}원</strong>
              </div>
            )}
            {resultValue === 'loss' && (
              <div style={{ background: 'var(--red-bg)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 14, border: '1px solid #4A1E1E' }}>
                손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResultTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}>
                <Check size={14} /> 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

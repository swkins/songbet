import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Cashflow, Site } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, TrendingUp, TrendingDown, X, Pencil, Check } from 'lucide-react'

const DEFAULT_CATS = ['베팅수익', '베팅손실', '급여', '식비', '교통', '쇼핑', '기타']
const DASHBOARD_CATS = ['베팅수익', '베팅손실', '베팅입금']

type Tab = 'form' | 'category' | 'site'

export default function Settlement() {
  const today = dayjs().format('YYYY-MM-DD')
  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [categories, setCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cf_cats') || 'null') || DEFAULT_CATS } catch { return DEFAULT_CATS }
  })

  // modal
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('form')
  const [form, setForm] = useState({ flow_date: today, type: 'income' as 'income' | 'expense', site_id: '', category: '', amount: '' })

  // category mgr
  const [newCat, setNewCat] = useState('')
  const [editCat, setEditCat] = useState<string | null>(null)
  const [editCatVal, setEditCatVal] = useState('')

  // site mgr (결산 전용 사이트 = active:false 이면서 dashboard에서 생성 안 된 것)
  // 구분: cashflow-only 사이트는 settlement_only 플래그 대신, 대시보드 사이트는 active OR total_withdrawal>0
  // 여기서는 "last_deposit===0 && total_withdrawal===0 && !active" → 결산 전용으로 간주
  const settlementSites = sites.filter(s => !s.active && (s.last_deposit ?? 0) === 0 && (s.total_withdrawal ?? 0) === 0)
  const dashboardSites = sites.filter(s => !settlementSites.some(ss => ss.id === s.id))

  const [newSiteName, setNewSiteName] = useState('')
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [editSiteVal, setEditSiteVal] = useState('')

  useEffect(() => { loadCashflows(); loadSites() }, [])

  async function loadCashflows() {
    const { data } = await supabase.from('cashflows').select('*').order('flow_date', { ascending: false }).limit(100)
    if (data) setCashflows(data)
  }
  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }

  // 카테고리
  function saveCats(cats: string[]) { setCategories(cats); localStorage.setItem('cf_cats', JSON.stringify(cats)) }
  function addCat() {
    if (!newCat.trim() || categories.includes(newCat.trim())) return
    saveCats([...categories, newCat.trim()]); setNewCat('')
  }
  function removeCat(cat: string) {
    if (DASHBOARD_CATS.includes(cat)) return
    saveCats(categories.filter(c => c !== cat))
  }
  function startEditCat(cat: string) { setEditCat(cat); setEditCatVal(cat) }
  function confirmEditCat(cat: string) {
    if (!editCatVal.trim() || editCatVal === cat) { setEditCat(null); return }
    saveCats(categories.map(c => c === cat ? editCatVal.trim() : c))
    setEditCat(null)
  }

  // 결산 전용 사이트 추가
  async function addSettlementSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites').insert({
      name: newSiteName.trim(), balance: 0, active: false,
      sort_order: sites.length, rolling_target: 0, rolling_done: 0,
      last_deposit: 0, deposit_bet_done: 0, point_deposit: 0, total_withdrawal: 0,
      currency: 'krw', bet_type: 'single'
    }).select().single()
    if (data) { setSites(p => [...p, data]); setNewSiteName('') }
  }
  async function deleteSettlementSite(s: Site) {
    await supabase.from('sites').delete().eq('id', s.id)
    setSites(p => p.filter(x => x.id !== s.id))
  }
  function startEditSite(s: Site) { setEditSite(s); setEditSiteVal(s.name) }
  async function confirmEditSite() {
    if (!editSite || !editSiteVal.trim()) { setEditSite(null); return }
    const { data } = await supabase.from('sites').update({ name: editSiteVal.trim() }).eq('id', editSite.id).select().single()
    if (data) setSites(p => p.map(x => x.id === data.id ? data : x))
    setEditSite(null)
  }

  // cashflow 저장
  async function saveCashflow() {
    if (!form.amount) return
    const siteName = sites.find(s => s.id === form.site_id)?.name ?? ''
    const desc = siteName ? `${siteName} / ${form.category}` : form.category
    const { data } = await supabase.from('cashflows').insert({
      flow_date: form.flow_date, type: form.type, category: form.category,
      description: desc, amount: Number(form.amount), site_id: form.site_id || null,
    }).select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'cashflows', record_id: data.id, after_data: data as never, description: `수입/지출 추가: ${desc} ${Number(form.amount).toLocaleString()}원` })
      setCashflows(p => [data, ...p])
      setShowModal(false)
      setForm({ flow_date: today, type: 'income', site_id: '', category: '', amount: '' })
    }
  }

  async function deleteCashflow(cf: Cashflow) {
    await logAction({ action_type: 'delete', table_name: 'cashflows', record_id: cf.id, before_data: cf as never, description: `수입/지출 삭제: ${cf.description}` })
    await supabase.from('cashflows').delete().eq('id', cf.id)
    setCashflows(p => p.filter(c => c.id !== cf.id))
  }

  const totalIncome = cashflows.filter(c => c.type === 'income').reduce((s, c) => s + c.amount, 0)
  const totalExpense = cashflows.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)
  const balance = totalIncome - totalExpense
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="page">
      <div className="flex-between mb-16">
        <h1 className="page-title">결산</h1>
        <button className="btn btn-primary" style={{ fontSize: 14, padding: '8px 20px', gap: 6 }} onClick={() => { setShowModal(true); setActiveTab('form') }}>
          <Plus size={16} /> 추가
        </button>
      </div>

      {/* 요약 */}
      <div className="grid-3 mb-16">
        <div className="card stat-tile">
          <div className="stat-value profit-pos">{fmt(totalIncome)}</div>
          <div className="stat-label">총 수입</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-value profit-neg">{fmt(totalExpense)}</div>
          <div className="stat-label">총 지출</div>
        </div>
        <div className="card stat-tile">
          <div className={`stat-value ${balance >= 0 ? 'profit-pos' : 'profit-neg'}`}>{balance >= 0 ? '+' : ''}{fmt(balance)}</div>
          <div className="stat-label">순 수지</div>
        </div>
      </div>

      {/* 내역 */}
      <div className="card">
        <div className="card-title">내역</div>
        {cashflows.length === 0 && <div className="empty"><div className="empty-icon">💰</div>내역이 없습니다</div>}
        <div style={{ overflowY: 'auto', maxHeight: 560 }}>
          {cashflows.map(c => (
            <div key={c.id} className="flex-between" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div className="flex-center gap-8">
                <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: c.type === 'income' ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${c.type === 'income' ? 'var(--green-border)' : 'var(--red-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.type === 'income' ? <TrendingUp size={12} color="var(--green)" /> : <TrendingDown size={12} color="var(--red)" />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{c.flow_date}</div>
                </div>
              </div>
              <div className="flex-center gap-8">
                <span className={c.type === 'income' ? 'profit-pos' : 'profit-neg'} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  {c.type === 'income' ? '+' : '-'}{c.amount.toLocaleString()}
                </span>
                <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteCashflow(c)}><Trash2 size={11} color="var(--text-secondary)" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>

            {/* 탭 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              {([['form', '수입/지출 추가'], ['category', '카테고리 관리'], ['site', '사이트 관리']] as const).map(([t, label]) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: activeTab === t ? 'var(--gold)' : 'var(--bg-elevated)', color: activeTab === t ? '#000' : 'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '0 4px' }}><X size={16} /></button>
            </div>

            {/* 수입/지출 추가 탭 */}
            {activeTab === 'form' && (
              <>
                <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
                  {(['income', 'expense'] as const).map(t => (
                    <button key={t} className={`btn ${form.type === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setForm(p => ({ ...p, type: t }))} style={{ flex: 1 }}>
                      {t === 'income' ? '💰 수입' : '💸 지출'}
                    </button>
                  ))}
                </div>
                <div className="form-row form-row-2 mb-10">
                  <div className="form-group">
                    <label className="form-label">날짜</label>
                    <input type="date" className="form-input" value={form.flow_date} onChange={e => setForm(p => ({ ...p, flow_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">금액 (원)</label>
                    <input type="number" className="form-input" placeholder="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group mb-10">
                  <label className="form-label">사이트</label>
                  <select className="form-select" value={form.site_id} onChange={e => setForm(p => ({ ...p, site_id: e.target.value }))}>
                    <option value="">없음</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label className="form-label">카테고리</label>
                  <select className="form-select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="">선택 안 함</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setShowModal(false)}>취소</button>
                  <button className="btn btn-primary" onClick={saveCashflow}>저장</button>
                </div>
              </>
            )}

            {/* 카테고리 관리 탭 */}
            {activeTab === 'category' && (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {categories.map(cat => (
                    <div key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12 }}>
                      {editCat === cat ? (
                        <>
                          <input value={editCatVal} onChange={e => setEditCatVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmEditCat(cat)}
                            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12, width: 80 }} autoFocus />
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex', padding: 0 }} onClick={() => confirmEditCat(cat)}><Check size={11} /></button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }} onClick={() => setEditCat(null)}><X size={11} /></button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'var(--text-primary)' }}>{cat}</span>
                          {!DASHBOARD_CATS.includes(cat) && (
                            <>
                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }} onClick={() => startEditCat(cat)}><Pencil size={10} /></button>
                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }} onClick={() => removeCat(cat)}><X size={10} /></button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex-center gap-6">
                  <input className="form-input" placeholder="새 카테고리..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
                  <button className="btn btn-primary btn-sm" onClick={addCat} style={{ flexShrink: 0 }}>추가</button>
                </div>
              </div>
            )}

            {/* 사이트 관리 탭 */}
            {activeTab === 'site' && (
              <div>
                {dashboardSites.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.5px' }}>대시보드 사이트 (수정 불가)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {dashboardSites.map(s => (
                        <span key={s.id} style={{ padding: '3px 8px', borderRadius: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>{s.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.5px' }}>결산 전용 사이트</div>
                {settlementSites.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>없음</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                  {settlementSites.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      {editSite?.id === s.id ? (
                        <>
                          <input value={editSiteVal} onChange={e => setEditSiteVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmEditSite()}
                            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12 }} autoFocus />
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex', padding: 0 }} onClick={confirmEditSite}><Check size={12} /></button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }} onClick={() => setEditSite(null)}><X size={12} /></button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{s.name}</span>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }} onClick={() => startEditSite(s)}><Pencil size={12} /></button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex', padding: 0 }} onClick={() => deleteSettlementSite(s)}><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex-center gap-6">
                  <input className="form-input" placeholder="새 사이트 이름..." value={newSiteName} onChange={e => setNewSiteName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSettlementSite()} />
                  <button className="btn btn-primary btn-sm" onClick={addSettlementSite} style={{ flexShrink: 0 }}>추가</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Cashflow, Site } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, TrendingUp, TrendingDown, X } from 'lucide-react'

const DEFAULT_CATS = ['베팅수익', '베팅손실', '급여', '식비', '교통', '쇼핑', '기타']

export default function Settlement() {
  const today = dayjs().format('YYYY-MM-DD')
  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [categories, setCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cf_cats') || 'null') || DEFAULT_CATS } catch { return DEFAULT_CATS }
  })
  const [newCat, setNewCat] = useState('')
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ flow_date: today, type: 'income' as 'income' | 'expense', site_id: '', category: '', amount: '' })

  useEffect(() => { loadCashflows(); loadSites() }, [])

  async function loadCashflows() {
    const { data } = await supabase.from('cashflows').select('*').order('flow_date', { ascending: false }).limit(100)
    if (data) setCashflows(data)
  }
  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }

  function saveCats(cats: string[]) { setCategories(cats); localStorage.setItem('cf_cats', JSON.stringify(cats)) }
  function addCat() { if (!newCat.trim() || categories.includes(newCat.trim())) return; saveCats([...categories, newCat.trim()]); setNewCat('') }
  function removeCat(cat: string) { saveCats(categories.filter(c => c !== cat)) }

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
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus size={12} /> 추가</button>
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

      {/* 추가 모달 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="flex-between mb-16">
              <div className="modal-title" style={{ marginBottom: 0 }}>수입 / 지출 추가</div>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setShowCatMgr(p => !p)}>카테고리 관리</button>
            </div>

            {showCatMgr && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>카테고리</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {categories.map(cat => (
                    <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-primary)' }}>
                      {cat}
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0 }} onClick={() => removeCat(cat)}><X size={9} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex-center gap-6">
                  <input className="form-input" placeholder="추가..." style={{ fontSize: 11, padding: '5px 8px' }} value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
                  <button className="btn btn-primary btn-sm" onClick={addCat} style={{ flexShrink: 0 }}>추가</button>
                </div>
              </div>
            )}

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

            <div className="form-group">
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
          </div>
        </div>
      )}
    </div>
  )
}

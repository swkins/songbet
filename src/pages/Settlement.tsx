import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Cashflow, Site } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, TrendingUp, TrendingDown, X, Pencil, Check, Settings, Tag, Globe } from 'lucide-react'

const DEFAULT_CATS = ['베팅수익', '베팅손실', '급여', '식비', '교통', '쇼핑', '기타']
const DASHBOARD_CATS = ['베팅수익', '베팅손실', '베팅입금']

type ModalTab = 'form' | 'category' | 'site'
type ListFilter = 'all' | 'income' | 'expense'

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 58px)', overflow: 'hidden', background: 'var(--bg)' },

  // 상단 요약
  summary: { display: 'flex', gap: 8, padding: '12px 14px 10px', flexShrink: 0 },
  summaryCard: { flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  summaryLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' },
  summaryValue: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-num)', letterSpacing: '-0.5px' },

  // 필터 탭
  filterRow: { display: 'flex', gap: 6, padding: '0 14px 10px', flexShrink: 0 },
  filterBtn: { flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)' },
  filterBtnActive: { background: 'var(--bg-elevated)', border: '1px solid var(--gold)', color: 'var(--gold)' },

  // 내역 리스트
  list: { flex: 1, overflowY: 'auto', padding: '0 14px' },
  listItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--border-light)' },
  listIcon: { width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  listMeta: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listDate: { fontSize: 10, color: 'var(--text-muted)', marginTop: 1 },
  listAmount: { fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-num)', flexShrink: 0 },
  listDel: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, color: 'var(--text-muted)', flexShrink: 0 },

  // FAB
  fab: { position: 'fixed', bottom: 20, right: 18, width: 56, height: 56, borderRadius: '50%', background: 'var(--gold)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(245,166,35,0.4)', zIndex: 200 },

  // 모달 오버레이
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'flex-end' },
  sheet: { width: '100%', background: 'var(--bg-card)', borderRadius: '18px 18px 0 0', padding: '0 0 32px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 0' },
  sheetTabRow: { display: 'flex', gap: 0, padding: '14px 14px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  sheetTab: { flex: 1, padding: '8px 6px', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  sheetTabActive: { color: 'var(--gold)', borderBottomColor: 'var(--gold)' },
  sheetBody: { flex: 1, overflowY: 'auto', padding: '16px 14px 0' },

  // form 요소
  typeRow: { display: 'flex', gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, padding: '13px 0', borderRadius: 10, border: '2px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' },
  typeBtnIn: { border: '2px solid var(--green)', background: 'var(--green-bg)', color: 'var(--green)' },
  typeBtnEx: { border: '2px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)' },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: 6, display: 'block' },
  input: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', fontSize: 15, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none', marginBottom: 12 },
  select: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none', marginBottom: 12, appearance: 'none' as const },
  actionRow: { display: 'flex', gap: 8, marginTop: 4 },
  cancelBtn: { flex: 1, padding: '13px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' },
  saveBtn: { flex: 2, padding: '13px 0', borderRadius: 10, border: 'none', background: 'var(--gold)', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#000', fontFamily: 'var(--font-body)' },

  // 카테고리 / 사이트 관리
  chip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12, marginBottom: 6, marginRight: 5 },
  chipLocked: { opacity: 0.5 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 },
  addRow: { display: 'flex', gap: 8, marginTop: 10 },
  addInput: { flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none' },
  addBtn: { padding: '11px 18px', borderRadius: 9, border: 'none', background: 'var(--gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#000', fontFamily: 'var(--font-body)', flexShrink: 0 },
  siteRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: 7 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
}

export default function Settlement() {
  const today = dayjs().format('YYYY-MM-DD')
  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [categories, setCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cf_cats') || 'null') || DEFAULT_CATS } catch { return DEFAULT_CATS }
  })
  const [filter, setFilter] = useState<ListFilter>('all')
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<ModalTab>('form')
  const [form, setForm] = useState({ flow_date: today, type: 'income' as 'income' | 'expense', site_id: '', category: '', amount: '' })

  const [newCat, setNewCat] = useState('')
  const [editCat, setEditCat] = useState<string | null>(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [editSiteVal, setEditSiteVal] = useState('')

  const settlementSites = sites.filter(s => !s.active && (s.last_deposit ?? 0) === 0 && (s.total_withdrawal ?? 0) === 0)
  const dashboardSites = sites.filter(s => !settlementSites.some(ss => ss.id === s.id))

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
  function removeCat(cat: string) { if (DASHBOARD_CATS.includes(cat)) return; saveCats(categories.filter(c => c !== cat)) }
  function confirmEditCat(cat: string) {
    if (!editCatVal.trim() || editCatVal === cat) { setEditCat(null); return }
    saveCats(categories.map(c => c === cat ? editCatVal.trim() : c)); setEditCat(null)
  }

  async function addSettlementSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites').insert({ name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length, rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0, point_deposit: 0, total_withdrawal: 0, currency: 'krw', bet_type: 'single' }).select().single()
    if (data) { setSites(p => [...p, data]); setNewSiteName('') }
  }
  async function deleteSettlementSite(site: Site) {
    await supabase.from('sites').delete().eq('id', site.id)
    setSites(p => p.filter(x => x.id !== site.id))
  }
  async function confirmEditSite() {
    if (!editSite || !editSiteVal.trim()) { setEditSite(null); return }
    const { data } = await supabase.from('sites').update({ name: editSiteVal.trim() }).eq('id', editSite.id).select().single()
    if (data) setSites(p => p.map(x => x.id === data.id ? data : x))
    setEditSite(null)
  }

  async function saveCashflow() {
    if (!form.amount) return
    const siteName = sites.find(s => s.id === form.site_id)?.name ?? ''
    const desc = siteName ? `${siteName} / ${form.category || '기타'}` : (form.category || '기타')
    const { data } = await supabase.from('cashflows').insert({
      flow_date: form.flow_date, type: form.type, category: form.category || '기타',
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
    await logAction({ action_type: 'delete', table_name: 'cashflows', record_id: cf.id, before_data: cf as never, description: `삭제: ${cf.description}` })
    await supabase.from('cashflows').delete().eq('id', cf.id)
    setCashflows(p => p.filter(c => c.id !== cf.id))
  }

  const totalIncome = cashflows.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0)
  const totalExpense = cashflows.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0)
  const balance = totalIncome - totalExpense
  const filtered = filter === 'all' ? cashflows : cashflows.filter(c => c.type === filter)
  const fmt = (n: number) => n.toLocaleString('ko-KR')

  return (
    <div style={s.page}>

      {/* 상단 요약 3칸 */}
      <div style={s.summary}>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>수입</span>
          <span style={{ ...s.summaryValue, color: 'var(--green)' }}>+{fmt(totalIncome)}</span>
        </div>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>지출</span>
          <span style={{ ...s.summaryValue, color: 'var(--red)' }}>-{fmt(totalExpense)}</span>
        </div>
        <div style={s.summaryCard}>
          <span style={s.summaryLabel}>수지</span>
          <span style={{ ...s.summaryValue, color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {balance >= 0 ? '+' : ''}{fmt(balance)}
          </span>
        </div>
      </div>

      {/* 3컬럼 리스트 */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 14px', minHeight: 0, overflow: 'hidden' }}>
        {(['expense', 'income', 'all'] as const).map(col => {
          const colLabel = col === 'expense' ? '지출' : col === 'income' ? '수입' : '추가'
          const colItems = col === 'all'
            ? cashflows.filter(c => !['베팅입금','베팅수익','베팅손실'].includes(c.category))
            : cashflows.filter(c => c.type === col)
          const colColor = col === 'expense' ? 'var(--red)' : col === 'income' ? 'var(--green)' : 'var(--gold)'
          return (
            <div key={col} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colColor }}>{colLabel}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{colItems.length}건</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {colItems.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>내역 없음</div>}
                {colItems.map(c => (
                  <div key={c.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</span>
                      <button style={s.listDel} onClick={() => deleteCashflow(c)}><Trash2 size={11} /></button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.flow_date}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: c.type === 'income' ? 'var(--green)' : 'var(--red)' }}>
                        {c.type === 'income' ? '+' : '-'}{fmt(c.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* FAB */}
      <button style={s.fab} onClick={() => { setShowModal(true); setActiveTab('form') }}>
        <Plus size={26} color="#000" />
      </button>

      {/* 바텀 시트 모달 */}
      {showModal && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && undefined}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />

            {/* 탭 */}
            <div style={s.sheetTabRow}>
              {([
                ['form', '추가', <Plus size={12} />],
                ['category', '카테고리', <Tag size={12} />],
                ['site', '사이트', <Globe size={12} />],
              ] as const).map(([t, label, icon]) => (
                <button key={t} style={{ ...s.sheetTab, ...(activeTab === t ? s.sheetTabActive : {}) }} onClick={() => setActiveTab(t as ModalTab)}>
                  {icon}{label}
                </button>
              ))}
              <button style={{ ...s.iconBtn, marginLeft: 'auto', color: 'var(--text-muted)', padding: '0 6px' }} onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={s.sheetBody}>

              {/* ── 추가 탭 ── */}
              {activeTab === 'form' && (
                <>
                  <div style={s.typeRow}>
                    <button style={{ ...s.typeBtn, ...(form.type === 'income' ? s.typeBtnIn : {}) }} onClick={() => setForm(p => ({ ...p, type: 'income' }))}>💰 수입</button>
                    <button style={{ ...s.typeBtn, ...(form.type === 'expense' ? s.typeBtnEx : {}) }} onClick={() => setForm(p => ({ ...p, type: 'expense' }))}>💸 지출</button>
                  </div>
                  <label style={s.label}>금액 (원)</label>
                  <input type="number" inputMode="numeric" placeholder="0" style={s.input} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                  <label style={s.label}>날짜</label>
                  <input type="date" style={s.input} value={form.flow_date} onChange={e => setForm(p => ({ ...p, flow_date: e.target.value }))} />
                  <label style={s.label}>사이트</label>
                  <select style={s.select} value={form.site_id} onChange={e => setForm(p => ({ ...p, site_id: e.target.value }))}>
                    <option value="">없음</option>
                    {sites.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                  <label style={s.label}>카테고리</label>
                  <select style={s.select} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="">선택 안 함</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <div style={s.actionRow}>
                    <button style={s.cancelBtn} onClick={() => setShowModal(false)}>취소</button>
                    <button style={s.saveBtn} onClick={saveCashflow}>저장</button>
                  </div>
                </>
              )}

              {/* ── 카테고리 탭 ── */}
              {activeTab === 'category' && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {categories.map(cat => (
                      <div key={cat} style={{ ...s.chip, ...(DASHBOARD_CATS.includes(cat) ? s.chipLocked : {}) }}>
                        {editCat === cat ? (
                          <>
                            <input value={editCatVal} onChange={e => setEditCatVal(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && confirmEditCat(cat)}
                              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12, width: 70 }} autoFocus />
                            <button style={{ ...s.iconBtn, color: 'var(--green)' }} onClick={() => confirmEditCat(cat)}><Check size={12} /></button>
                            <button style={{ ...s.iconBtn, color: 'var(--text-muted)' }} onClick={() => setEditCat(null)}><X size={12} /></button>
                          </>
                        ) : (
                          <>
                            <span style={{ color: 'var(--text-primary)' }}>{cat}</span>
                            {!DASHBOARD_CATS.includes(cat) && (
                              <>
                                <button style={{ ...s.iconBtn, color: 'var(--text-muted)' }} onClick={() => { setEditCat(cat); setEditCatVal(cat) }}><Pencil size={10} /></button>
                                <button style={{ ...s.iconBtn, color: 'var(--text-muted)' }} onClick={() => removeCat(cat)}><X size={10} /></button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={s.addRow}>
                    <input style={s.addInput} placeholder="새 카테고리..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
                    <button style={s.addBtn} onClick={addCat}>추가</button>
                  </div>
                </>
              )}

              {/* ── 사이트 탭 ── */}
              {activeTab === 'site' && (
                <>
                  {dashboardSites.length > 0 && (
                    <>
                      <div style={s.sectionLabel}>대시보드 사이트 (수정 불가)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 14 }}>
                        {dashboardSites.map(st => (
                          <span key={st.id} style={{ ...s.chip, ...s.chipLocked }}>{st.name}</span>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={s.sectionLabel}>결산 전용 사이트</div>
                  {settlementSites.map(st => (
                    <div key={st.id} style={s.siteRow}>
                      {editSite?.id === st.id ? (
                        <>
                          <input value={editSiteVal} onChange={e => setEditSiteVal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && confirmEditSite()}
                            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14 }} autoFocus />
                          <button style={{ ...s.iconBtn, color: 'var(--green)' }} onClick={confirmEditSite}><Check size={14} /></button>
                          <button style={{ ...s.iconBtn, color: 'var(--text-muted)' }} onClick={() => setEditSite(null)}><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)' }}>{st.name}</span>
                          <button style={{ ...s.iconBtn, color: 'var(--text-muted)', marginRight: 8 }} onClick={() => { setEditSite(st); setEditSiteVal(st.name) }}><Pencil size={14} /></button>
                          <button style={{ ...s.iconBtn, color: 'var(--red)' }} onClick={() => deleteSettlementSite(st)}><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  ))}
                  {settlementSites.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>없음</div>}
                  <div style={s.addRow}>
                    <input style={s.addInput} placeholder="새 사이트 이름..." value={newSiteName} onChange={e => setNewSiteName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSettlementSite()} />
                    <button style={s.addBtn} onClick={addSettlementSite}>추가</button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

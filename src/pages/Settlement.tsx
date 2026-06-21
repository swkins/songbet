import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Cashflow, Site } from '../types'
import dayjs from 'dayjs'
import {
  Plus, Trash2, X, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, Tag, Globe, Pencil, Check,
} from 'lucide-react'

// 베팅손실 제거, 베팅입금은 대시보드 전용이라 잠금만
const DEFAULT_CATS = ['베팅수익', '급여', '식비', '교통', '쇼핑', '기타']
const LOCKED_CATS  = ['베팅수익', '베팅입금']  // 삭제/편집 불가

/* ────────── helpers ────────── */
function fmt(n: number) { return n.toLocaleString('ko-KR') }

const COLORS = [
  '#F5A623','#E74C3C','#2ECC71','#3498DB','#9B59B6',
  '#1ABC9C','#E67E22','#34495E','#F39C12','#16A085',
]

export default function Settlement() {
  const today = dayjs().format('YYYY-MM-DD')

  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [categories, setCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cf_cats') || 'null') || DEFAULT_CATS } catch { return DEFAULT_CATS }
  })

  /* 폼 상태 */
  const [formType, setFormType]   = useState<'income' | 'expense'>('income')
  const [formDate, setFormDate]   = useState(today)
  const [formAmount, setFormAmount] = useState('')
  const [formSiteId, setFormSiteId] = useState('')
  const [formCat, setFormCat]     = useState('')
  const [saving, setSaving]       = useState(false)

  /* 목록 월 필터 */
  const [viewMonth, setViewMonth] = useState(dayjs().startOf('month'))

  /* 관리 패널 */
  const [mgmtTab, setMgmtTab]     = useState<'none' | 'category' | 'site'>('none')
  const [newCat, setNewCat]       = useState('')
  const [editCat, setEditCat]     = useState<string | null>(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [editSite, setEditSite]   = useState<Site | null>(null)
  const [editSiteVal, setEditSiteVal] = useState('')

  useEffect(() => { loadCashflows(); loadSites() }, [])

  async function loadCashflows() {
    const { data } = await supabase.from('cashflows').select('*').order('flow_date', { ascending: false }).limit(300)
    if (data) setCashflows(data)
  }
  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }

  /* ── 저장 ── */
  async function saveCashflow() {
    if (!formAmount || saving) return
    setSaving(true)
    const siteName = sites.find(s => s.id === formSiteId)?.name ?? ''
    const desc = siteName ? `${siteName} / ${formCat || '기타'}` : formCat || '기타'
    const { data } = await supabase.from('cashflows').insert({
      flow_date: formDate, type: formType, category: formCat || '기타',
      description: desc, amount: Number(formAmount.replace(/,/g, '')), site_id: formSiteId || null,
    }).select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'cashflows', record_id: data.id, after_data: data as never, description: `수입/지출 추가: ${desc} ${Number(formAmount.replace(/,/g, '')).toLocaleString()}원` })
      setCashflows(p => [data, ...p])
      setFormAmount(''); setFormSiteId(''); setFormCat('')
    }
    setSaving(false)
  }

  async function deleteCashflow(cf: Cashflow) {
    await logAction({ action_type: 'delete', table_name: 'cashflows', record_id: cf.id, before_data: cf as never, description: `삭제: ${cf.description}` })
    await supabase.from('cashflows').delete().eq('id', cf.id)
    setCashflows(p => p.filter(c => c.id !== cf.id))
  }

  /* ── 카테고리 관리 ── */
  function saveCats(cats: string[]) { setCategories(cats); localStorage.setItem('cf_cats', JSON.stringify(cats)) }
  function addCat() { if (!newCat.trim() || categories.includes(newCat.trim())) return; saveCats([...categories, newCat.trim()]); setNewCat('') }
  function removeCat(cat: string) { if (LOCKED_CATS.includes(cat)) return; saveCats(categories.filter(c => c !== cat)) }
  function confirmEditCat(cat: string) {
    if (!editCatVal.trim() || editCatVal === cat) { setEditCat(null); return }
    saveCats(categories.map(c => c === cat ? editCatVal.trim() : c)); setEditCat(null)
  }

  /* ── 사이트 관리 ── */
  const settlementSites = sites.filter(s => s.settlement_only)
  const dashboardSites  = sites.filter(s => !s.settlement_only)

  async function addSettlementSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites').insert({
      name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
      point_deposit: 0, total_withdrawal: 0, currency: 'krw', bet_type: 'single',
      settlement_only: true,
    }).select().single()
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

  /* ── 전체 합계 ── */
  const allIncome  = cashflows.filter(c => c.type === 'income').reduce((s, c) => s + c.amount, 0)
  const allExpense = cashflows.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)
  const allBalance = allIncome - allExpense

  /* ── 이번달 사이트별 합계 ── */
  const thisMonthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const thisMonthEnd   = dayjs().endOf('month').format('YYYY-MM-DD')

  const monthSiteExpense = useMemo(() => {
    const map: Record<string, number> = {}
    cashflows
      .filter(c => c.type === 'expense' && c.flow_date >= thisMonthStart && c.flow_date <= thisMonthEnd && c.site_id)
      .forEach(c => { map[c.site_id!] = (map[c.site_id!] ?? 0) + c.amount })
    return Object.entries(map)
      .map(([siteId, amt]) => ({ name: sites.find(s => s.id === siteId)?.name ?? siteId, amt }))
      .sort((a, b) => b.amt - a.amt)
  }, [cashflows, sites, thisMonthStart, thisMonthEnd])

  const monthSiteIncome = useMemo(() => {
    const map: Record<string, number> = {}
    cashflows
      .filter(c => c.type === 'income' && c.flow_date >= thisMonthStart && c.flow_date <= thisMonthEnd && c.site_id)
      .forEach(c => { map[c.site_id!] = (map[c.site_id!] ?? 0) + c.amount })
    return Object.entries(map)
      .map(([siteId, amt]) => ({ name: sites.find(s => s.id === siteId)?.name ?? siteId, amt }))
      .sort((a, b) => b.amt - a.amt)
  }, [cashflows, sites, thisMonthStart, thisMonthEnd])

  /* ── 월별 바 차트 (최근 6개월) ── */
  const monthlySummary = useMemo(() => {
    const months: { label: string; income: number; expense: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, 'month')
      const from = m.startOf('month').format('YYYY-MM-DD')
      const to   = m.endOf('month').format('YYYY-MM-DD')
      const inc = cashflows.filter(c => c.type === 'income'  && c.flow_date >= from && c.flow_date <= to).reduce((s, c) => s + c.amount, 0)
      const exp = cashflows.filter(c => c.type === 'expense' && c.flow_date >= from && c.flow_date <= to).reduce((s, c) => s + c.amount, 0)
      months.push({ label: m.format('M월'), income: inc, expense: exp })
    }
    return months
  }, [cashflows])

  const maxMonthly = Math.max(...monthlySummary.flatMap(m => [m.income, m.expense]), 1)

  /* ── 목록 (월별) ── */
  const monthFrom  = viewMonth.format('YYYY-MM-DD')
  const monthTo    = viewMonth.endOf('month').format('YYYY-MM-DD')
  const monthFlows = cashflows.filter(c => c.flow_date >= monthFrom && c.flow_date <= monthTo)

  const groupedByDate = useMemo(() => {
    const map: Record<string, Cashflow[]> = {}
    monthFlows.forEach(c => { if (!map[c.flow_date]) map[c.flow_date] = []; map[c.flow_date].push(c) })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [monthFlows])

  const monthIncome  = monthFlows.filter(c => c.type === 'income').reduce((s, c) => s + c.amount, 0)
  const monthExpense = monthFlows.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)

  const maxSiteExpense = Math.max(...monthSiteExpense.map(x => x.amt), 1)
  const maxSiteIncome  = Math.max(...monthSiteIncome.map(x => x.amt), 1)

  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']

  /* ────────── RENDER ────────── */
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', overflow: 'hidden', background: 'var(--bg)', gap: 0 }}>

      {/* ═══ 좌: 추가 폼 (320px) ═══ */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* 날짜 — 최상단 */}
        <div style={{ padding: '12px 12px 0' }}>
          <div style={labelSt}>날짜</div>
          <input type="date" style={{ ...inputSt, marginBottom: 10 }} value={formDate} onChange={e => setFormDate(e.target.value)} />
        </div>

        {/* 수입/지출 토글 */}
        <div style={{ padding: '0 12px' }}>
          <div style={{ display: 'flex' }}>
            <button onClick={() => setFormType('income')} style={{
              flex: 1, padding: '10px 0', borderRadius: '8px 0 0 8px',
              border: '2px solid', borderRight: formType === 'income' ? '2px solid var(--green)' : '1px solid var(--border)',
              borderColor: formType === 'income' ? 'var(--green)' : 'var(--border)',
              background: formType === 'income' ? 'var(--green-bg)' : 'var(--bg-elevated)',
              color: formType === 'income' ? 'var(--green)' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
              boxShadow: formType === 'income' ? '0 0 0 1px var(--green)' : 'none',
            }}>💰 수입</button>
            <button onClick={() => setFormType('expense')} style={{
              flex: 1, padding: '10px 0', borderRadius: '0 8px 8px 0',
              border: '2px solid', borderLeft: 'none',
              borderColor: formType === 'expense' ? 'var(--red)' : 'var(--border)',
              background: formType === 'expense' ? 'var(--red-bg)' : 'var(--bg-elevated)',
              color: formType === 'expense' ? 'var(--red)' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
              boxShadow: formType === 'expense' ? '0 0 0 1px var(--red)' : 'none',
            }}>💸 지출</button>
          </div>
        </div>

        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 금액 */}
          <div>
            <div style={labelSt}>금액 (원)</div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              style={{ ...inputSt, MozAppearance: 'textfield' } as React.CSSProperties}
              value={formAmount ? Number(formAmount.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, '')
                if (raw === '' || /^\d+$/.test(raw)) setFormAmount(raw)
              }}
              onKeyDown={e => e.key === 'Enter' && saveCashflow()}
              autoFocus
            />
          </div>

          {/* 사이트 */}
          <div>
            <div style={labelSt}>사이트</div>
            <select style={inputSt} value={formSiteId} onChange={e => setFormSiteId(e.target.value)}>
              <option value="">없음</option>
              {sites.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>

          {/* 카테고리 */}
          <div>
            <div style={labelSt}>카테고리</div>
            <select style={inputSt} value={formCat} onChange={e => setFormCat(e.target.value)}>
              <option value="">선택 안 함</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* 저장 */}
          <button onClick={saveCashflow} disabled={!formAmount || saving} style={{
            padding: '12px 0', borderRadius: 8, border: 'none',
            background: !formAmount || saving ? 'var(--border)' : 'var(--gold)',
            color: !formAmount || saving ? 'var(--text-muted)' : '#000',
            fontWeight: 700, fontSize: 14, cursor: !formAmount || saving ? 'default' : 'pointer',
            fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Plus size={16} /> 저장
          </button>
        </div>

        {/* 관리 탭 */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['category', '카테고리', <Tag size={11} />], ['site', '사이트', <Globe size={11} />]] as const).map(([t, label, icon]) => (
              <button key={t} onClick={() => setMgmtTab(prev => prev === t ? 'none' : t)} style={{
                flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: mgmtTab === t ? 'var(--gold-bg)' : 'var(--bg-elevated)',
                border: `1px solid ${mgmtTab === t ? 'var(--gold-border)' : 'var(--border)'}`,
                color: mgmtTab === t ? 'var(--gold)' : 'var(--text-muted)',
              }}>{icon}{label}</button>
            ))}
          </div>

          {/* 카테고리 관리 */}
          {mgmtTab === 'category' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {categories.map(cat => (
                  <div key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 11, opacity: LOCKED_CATS.includes(cat) ? 0.5 : 1 }}>
                    {editCat === cat ? (
                      <>
                        <input value={editCatVal} onChange={e => setEditCatVal(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && confirmEditCat(cat)}
                          style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 11, width: 60 }} autoFocus />
                        <button onClick={() => confirmEditCat(cat)} style={iconBtnSt}><Check size={10} color="var(--green)" /></button>
                        <button onClick={() => setEditCat(null)} style={iconBtnSt}><X size={10} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ color: 'var(--text-primary)' }}>{cat}</span>
                        {!LOCKED_CATS.includes(cat) && (
                          <>
                            <button onClick={() => { setEditCat(cat); setEditCatVal(cat) }} style={iconBtnSt}><Pencil size={9} /></button>
                            <button onClick={() => removeCat(cat)} style={iconBtnSt}><X size={9} /></button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...inputSt, flex: 1 }} placeholder="새 카테고리..." value={newCat}
                  onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
                <button onClick={addCat} style={mgmtAddBtnSt}>추가</button>
              </div>
            </div>
          )}

          {/* 사이트 관리 */}
          {mgmtTab === 'site' && (
            <div style={{ marginTop: 10 }}>
              {dashboardSites.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={sectionLabelSt}>대시보드 사이트</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {dashboardSites.map(st => <span key={st.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: 0.6 }}>{st.name}</span>)}
                  </div>
                </div>
              )}
              <div style={sectionLabelSt}>결산 전용 사이트</div>
              {settlementSites.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: 5 }}>
                  {editSite?.id === st.id ? (
                    <>
                      <input value={editSiteVal} onChange={e => setEditSiteVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && confirmEditSite()}
                        style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12 }} autoFocus />
                      <button onClick={confirmEditSite} style={iconBtnSt}><Check size={12} color="var(--green)" /></button>
                      <button onClick={() => setEditSite(null)} style={iconBtnSt}><X size={12} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{st.name}</span>
                      <button onClick={() => { setEditSite(st); setEditSiteVal(st.name) }} style={iconBtnSt}><Pencil size={11} /></button>
                      <button onClick={() => deleteSettlementSite(st)} style={iconBtnSt}><Trash2 size={11} color="var(--red)" /></button>
                    </>
                  )}
                </div>
              ))}
              {settlementSites.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>없음</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...inputSt, flex: 1 }} placeholder="새 사이트..." value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSettlementSite()} />
                <button onClick={addSettlementSite} style={mgmtAddBtnSt}>추가</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 중: 날짜별 목록 (340px) ═══ */}
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 월 네비 */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => setViewMonth(p => p.subtract(1, 'month'))} style={navBtnSt}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{viewMonth.format('YYYY년 M월')}</span>
            <button onClick={() => setViewMonth(p => p.add(1, 'month'))} style={navBtnSt}><ChevronRight size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={miniSummSt}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>수입</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--green)' }}>+{fmt(monthIncome)}</span>
            </div>
            <div style={miniSummSt}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>지출</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--red)' }}>-{fmt(monthExpense)}</span>
            </div>
            <div style={miniSummSt}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>수익</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: (monthIncome - monthExpense) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {(monthIncome - monthExpense) >= 0 ? '+' : ''}{fmt(monthIncome - monthExpense)}
              </span>
            </div>
          </div>
        </div>

        {/* 날짜별 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {groupedByDate.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>이 달의 내역이 없습니다</div>
          )}
          {groupedByDate.map(([date, items]) => {
            const dayInc = items.filter(c => c.type === 'income').reduce((s, c) => s + c.amount, 0)
            const dayExp = items.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)
            return (
              <div key={date} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {dayjs(date).date()}일({DOW_KO[dayjs(date).day()]})
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {dayInc > 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-num)', color: 'var(--green)', fontWeight: 600 }}>+{fmt(dayInc)}</span>}
                    {dayExp > 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-num)', color: 'var(--red)', fontWeight: 600 }}>-{fmt(dayExp)}</span>}
                  </div>
                </div>
                {items.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-light)', marginBottom: 5 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: c.type === 'income' ? 'var(--green-bg)' : 'var(--red-bg)',
                    }}>
                      {c.type === 'income' ? <TrendingUp size={14} color="var(--green)" /> : <TrendingDown size={14} color="var(--red)" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.category}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-num)', flexShrink: 0, color: c.type === 'income' ? 'var(--green)' : 'var(--red)' }}>
                      {c.type === 'income' ? '+' : '-'}{fmt(c.amount)}
                    </span>
                    <button onClick={() => deleteCashflow(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ 우: 통계 ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '14px 16px', gap: 14 }}>

        {/* 전체 수지 요약 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: '총 수입', val: allIncome,  color: 'var(--green)', prefix: '+' },
            { label: '총 지출', val: allExpense, color: 'var(--red)',   prefix: '-' },
            { label: '순수익',  val: allBalance, color: allBalance >= 0 ? 'var(--green)' : 'var(--red)', prefix: allBalance >= 0 ? '+' : '' },
          ].map(({ label, val, color, prefix }) => (
            <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-num)', color }}>{prefix}{fmt(val)}</div>
            </div>
          ))}
        </div>

        {/* 이번달 사이트별 — 좌: 지출 / 우: 수입 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          {/* 지출 */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
              이번달 지출 — 사이트별
            </div>
            {monthSiteExpense.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>내역 없음</div>}
            {monthSiteExpense.map(({ name, amt }, i) => {
              const pct = Math.round(amt / maxSiteExpense * 100)
              return (
                <div key={name} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--red)', flexShrink: 0 }}>-{fmt(amt)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: COLORS[i % COLORS.length], width: `${pct}%`, opacity: 0.85 }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 수입 */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
              이번달 수입 — 사이트별
            </div>
            {monthSiteIncome.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>내역 없음</div>}
            {monthSiteIncome.map(({ name, amt }, i) => {
              const pct = Math.round(amt / maxSiteIncome * 100)
              return (
                <div key={name} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--green)', flexShrink: 0 }}>+{fmt(amt)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: COLORS[i % COLORS.length], width: `${pct}%`, opacity: 0.85 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 월별 바 차트 */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>월별 수입 / 지출</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 100 }}>
            {monthlySummary.map((m, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 80 }}>
                  <div style={{ flex: 1, background: 'var(--green)', borderRadius: '3px 3px 0 0', height: `${Math.round(m.income / maxMonthly * 80)}px`, minHeight: m.income > 0 ? 3 : 0, opacity: 0.85 }} title={`수입 ${fmt(m.income)}`} />
                  <div style={{ flex: 1, background: 'var(--red)', borderRadius: '3px 3px 0 0', height: `${Math.round(m.expense / maxMonthly * 80)}px`, minHeight: m.expense > 0 ? 3 : 0, opacity: 0.85 }} title={`지출 ${fmt(m.expense)}`} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{m.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)' }} /> 수입
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)' }} /> 지출
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ── 공통 스타일 상수 ── */
const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px',
  textTransform: 'uppercase', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}
const iconBtnSt: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: 'var(--text-muted)',
}
const navBtnSt: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
  display: 'flex', alignItems: 'center', padding: '4px 6px', color: 'var(--text-secondary)',
}
const miniSummSt: React.CSSProperties = {
  flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7,
  padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 2,
}
const sectionLabelSt: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.7px', marginBottom: 6,
}
const mgmtAddBtnSt: React.CSSProperties = {
  padding: '0 12px', borderRadius: 7, border: 'none', background: 'var(--gold)',
  color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12,
  fontFamily: 'var(--font-body)', flexShrink: 0,
}

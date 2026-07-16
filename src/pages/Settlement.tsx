import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Cashflow, Site } from '../types'
import dayjs from 'dayjs'
import {
  Plus, Trash2, X, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, ChevronDown, Pencil, Check, ArrowUp, ArrowDown, Bookmark, BookmarkCheck,
  RefreshCw,
} from 'lucide-react'

const DEFAULT_CATS = ['베팅수익', '급여', '식비', '교통', '쇼핑', '기타']
const LOCKED_CATS = ['베팅입금']

interface CfCategory { id: number; name: string; sort_order: number }
interface CfPreset {
  id: number; name: string; amount: string
  site_id: string; category: string; type: 'income' | 'expense'
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

const COLORS = [
  '#F5A623','#E74C3C','#2ECC71','#3498DB','#9B59B6',
  '#1ABC9C','#E67E22','#34495E','#F39C12','#16A085',
]

// ── 환율 가져오기 (오늘자 캐시 우선, 없으면 API 호출 후 저장, 실패시 최근값)
async function getUsdKrwRate(): Promise<{ rate: number; date: string; updatedAt: string }> {
  const today = dayjs().format('YYYY-MM-DD')
  const { data: cached } = await supabase
    .from('exchange_rates').select('usd_krw, rate_date, fetched_at').eq('rate_date', today).single()
  if (cached) return { rate: Number(cached.usd_krw), date: cached.rate_date, updatedAt: cached.fetched_at }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const json = await res.json()
    const rate = json?.rates?.KRW
    if (rate) {
      const { data: inserted } = await supabase
        .from('exchange_rates').upsert({ rate_date: today, usd_krw: rate }).select('usd_krw, rate_date, fetched_at').single()
      if (inserted) return { rate: Number(inserted.usd_krw), date: inserted.rate_date, updatedAt: inserted.fetched_at }
      return { rate, date: today, updatedAt: new Date().toISOString() }
    }
  } catch {}
  const { data: latest } = await supabase
    .from('exchange_rates').select('usd_krw, rate_date, fetched_at').order('rate_date', { ascending: false }).limit(1).single()
  if (latest) return { rate: Number(latest.usd_krw), date: latest.rate_date, updatedAt: latest.fetched_at }
  return { rate: 1350, date: today, updatedAt: new Date().toISOString() }
}

// 7일 이상 된 환율 데이터 삭제
async function purgeOldExchangeRates() {
  const cutoff = dayjs().subtract(7, 'day').format('YYYY-MM-DD')
  await supabase.from('exchange_rates').delete().lt('rate_date', cutoff)
}

function DepositSummary({ sites, cashflows, rateInfo }: {
  sites: { id: string; name: string; currency: string }[]
  cashflows: { flow_date: string; type: string; amount: number; site_id: string | null; currency?: string; usd_krw_rate?: number | null; amount_krw?: number | null }[]
  rateInfo: { rate: number } | null
}) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const weekStart  = dayjs().startOf('isoWeek').format('YYYY-MM-DD')
  const weekEnd    = dayjs().endOf('isoWeek').format('YYYY-MM-DD')
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const monthEnd   = dayjs().endOf('month').format('YYYY-MM-DD')
  const from = mode === 'week' ? weekStart : monthStart
  const to   = mode === 'week' ? weekEnd   : monthEnd
  const filtered = cashflows.filter(c => c.type === 'expense' && c.flow_date >= from && c.flow_date <= to)

  function toKrwAmt(c: typeof filtered[0]): number {
    if (c.currency !== 'usd') return c.amount
    if (c.amount_krw != null) return Number(c.amount_krw)
    return Math.round(c.amount * (rateInfo?.rate ?? 1350))
  }

  const total = filtered.reduce((a, c) => a + toKrwAmt(c), 0)

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>입금 현황</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['week', 'month'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: '1px solid', cursor: 'pointer', fontFamily: 'var(--font-body)',
              background: mode === m ? 'var(--gold-bg)' : 'none',
              borderColor: mode === m ? 'var(--gold-border)' : 'var(--border)',
              color: mode === m ? 'var(--gold)' : 'var(--text-muted)',
            }}>{m === 'week' ? '이번주' : '한달'}</button>
          ))}
        </div>
      </div>
      {sites.map(s => {
        const siteCfs = filtered.filter(c => c.site_id === s.id)
        const amt = siteCfs.reduce((a, c) => a + toKrwAmt(c), 0)
        if (amt === 0) return null
        const isUsd = s.currency === 'usd'
        const usdRaw = isUsd ? siteCfs.reduce((a, c) => a + c.amount, 0) : 0
        return (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {s.name}
              {isUsd && <span style={{ fontSize: 9, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>USD</span>}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>{amt.toLocaleString()}원</span>
              {isUsd && <span style={{ fontFamily: 'var(--font-num)', fontSize: 10, color: 'var(--text-muted)' }}>${usdRaw.toLocaleString()}</span>}
            </div>
          </div>
        )
      })}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>합계</span>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 800, color: 'var(--orange)' }}>{total.toLocaleString()}원</span>
      </div>
    </div>
  )
}

// ── 환율 배너 (결산 통계 상단에 표시)
function ExchangeRateBanner({ rateInfo, onRefresh, refreshing }: {
  rateInfo: { rate: number; date: string; updatedAt: string } | null
  onRefresh: () => void
  refreshing: boolean
}) {
  if (!rateInfo) return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>환율 로딩 중...</div>
    </div>
  )
  const updatedStr = dayjs(rateInfo.updatedAt).format('YYYY-MM-DD HH:mm')
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--blue-border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>USD/KRW</span>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
          {fmt(Math.round(rateInfo.rate))}원
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>= $1</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>최종수정 {updatedStr}</span>
        <button onClick={onRefresh} disabled={refreshing} title="환율 새로고침"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', opacity: refreshing ? 0.5 : 1 }}>
          <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>
    </div>
  )
}

export default function Settlement() {
  const today = dayjs().format('YYYY-MM-DD')

  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [categories, setCategories] = useState<CfCategory[]>([])
  const [presets, setPresets] = useState<CfPreset[]>([])

  // 환율 상태
  const [rateInfo, setRateInfo] = useState<{ rate: number; date: string; updatedAt: string } | null>(null)
  const [rateRefreshing, setRateRefreshing] = useState(false)

  const [formType, setFormType]     = useState<'income' | 'expense'>('income')
  const [formDate, setFormDate]     = useState(today)
  const [formAmount, setFormAmount] = useState('')
  const [formSiteId, setFormSiteId] = useState('')
  const [formCat, setFormCat]       = useState('')
  const [saving, setSaving]         = useState(false)

  const [viewMonth, setViewMonth] = useState(dayjs().startOf('month'))

  const [catDropOpen, setCatDropOpen]   = useState(false)
  const [siteDropOpen, setSiteDropOpen] = useState(false)
  const [presetDropOpen, setPresetDropOpen] = useState(false)

  const [newCat, setNewCat]         = useState('')
  const [editCat, setEditCat]       = useState<number | null>(null)
  const [editCatVal, setEditCatVal] = useState('')
  const [newSiteName, setNewSiteName] = useState('')
  const [editSite, setEditSite]       = useState<Site | null>(null)
  const [editSiteVal, setEditSiteVal] = useState('')

  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName]         = useState('')

  useEffect(() => {
    loadCashflows(); loadSites(); loadCategories(); loadPresets()
    // 환율 로드 + 7일 이상 데이터 정리
    getUsdKrwRate().then(setRateInfo)
    purgeOldExchangeRates()
  }, [])

  async function refreshRate() {
    setRateRefreshing(true)
    // 오늘 캐시 삭제 후 재호출 (강제 갱신)
    await supabase.from('exchange_rates').delete().eq('rate_date', today)
    const info = await getUsdKrwRate()
    setRateInfo(info)
    setRateRefreshing(false)
  }

  async function loadCashflows() {
    const { data } = await supabase.from('cashflows').select('*').order('flow_date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    if (data) setCashflows(data)
  }
  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }
  async function loadCategories() {
    const { data } = await supabase.from('cf_categories').select('*').order('sort_order')
    if (data && data.length > 0) {
      setCategories(data)
    } else {
      const rows = DEFAULT_CATS.map((name, i) => ({ name, sort_order: i }))
      const { data: inserted } = await supabase.from('cf_categories').insert(rows).select().order('sort_order')
      if (inserted) setCategories(inserted)
    }
  }
  async function loadPresets() {
    const { data } = await supabase.from('cf_presets').select('*').order('id')
    if (data) setPresets(data as CfPreset[])
  }

  /* ── 저장 ── */
  async function saveCashflow() {
    if (!formAmount || saving) return
    setSaving(true)
    const siteName = sites.find(s => s.id === formSiteId)?.name ?? ''
    const site = sites.find(s => s.id === formSiteId)
    const isusd = site?.currency === 'usd'
    const desc = siteName ? `${siteName} / ${formCat || '기타'}` : formCat || '기타'
    const amountNum = Number(formAmount.replace(/,/g, ''))

    // USD 항목이면 당일 환율 저장
    let usdKrwRate: number | null = null
    let amountKrw: number | null = null
    if (isusd) {
      const info = rateInfo ?? await getUsdKrwRate().then(r => { setRateInfo(r); return r })
      usdKrwRate = info?.rate ?? 1350
      amountKrw = Math.round(amountNum * usdKrwRate)
    }

    const { data } = await supabase.from('cashflows').insert({
      flow_date: formDate, type: formType, category: formCat || '기타',
      description: desc, amount: amountNum, site_id: formSiteId || null,
      currency: isusd ? 'usd' : 'krw',
      usd_krw_rate: usdKrwRate,
      amount_krw: isusd ? amountKrw : amountNum,
    }).select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'cashflows', record_id: data.id, after_data: data as never, description: `수입/지출 추가: ${desc} ${amountNum.toLocaleString()}${isusd ? '$' : '원'}` })
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

  /* ── 카테고리 ── */
  async function addCat() {
    if (!newCat.trim() || categories.some(c => c.name === newCat.trim())) return
    const sort_order = categories.length
    const { data } = await supabase.from('cf_categories').insert({ name: newCat.trim(), sort_order }).select().single()
    if (data) { setCategories(p => [...p, data]); setNewCat('') }
  }
  async function removeCat(cat: CfCategory) {
    if (LOCKED_CATS.includes(cat.name)) return
    await supabase.from('cf_categories').delete().eq('id', cat.id)
    setCategories(p => p.filter(c => c.id !== cat.id))
    if (formCat === cat.name) setFormCat('')
  }
  async function confirmEditCat(cat: CfCategory) {
    if (!editCatVal.trim() || editCatVal === cat.name) { setEditCat(null); return }
    const { data } = await supabase.from('cf_categories').update({ name: editCatVal.trim() }).eq('id', cat.id).select().single()
    if (data) setCategories(p => p.map(c => c.id === data.id ? data : c))
    setEditCat(null)
  }
  async function reorderCat(fromCat: CfCategory, toCat: CfCategory) {
    if (fromCat.id === toCat.id) return
    const arr = [...categories]
    const fi = arr.findIndex(c => c.id === fromCat.id)
    const ti = arr.findIndex(c => c.id === toCat.id)
    const [moved] = arr.splice(fi, 1); arr.splice(ti, 0, moved)
    const updated = arr.map((c, i) => ({ ...c, sort_order: i }))
    setCategories(updated)
    for (const c of updated) await supabase.from('cf_categories').update({ sort_order: c.sort_order }).eq('id', c.id)
  }

  /* ── 사이트 관리 ── */
  const settlementSites = sites.filter(s => s.settlement_only)
  const dashboardSites  = sites.filter(s => !s.settlement_only)

  async function reorderSettlementSite(fromId: string, toId: string) {
    if (fromId === toId) return
    const arr = [...settlementSites]
    const fi = arr.findIndex(s => s.id === fromId); const ti = arr.findIndex(s => s.id === toId)
    const [moved] = arr.splice(fi, 1); arr.splice(ti, 0, moved)
    const updated = arr.map((s, i) => ({ ...s, sort_order: i + dashboardSites.length }))
    setSites(p => p.map(s => updated.find(u => u.id === s.id) ?? s))
    for (const s of updated) await supabase.from('sites').update({ sort_order: s.sort_order }).eq('id', s.id)
  }
  async function addSettlementSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites').insert({
      name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
      point_deposit: 0, total_withdrawal: 0, currency: 'krw', bet_type: 'single', settlement_only: true,
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

  /* ── 프리셋 ── */
  async function savePreset() {
    if (!presetName.trim()) return
    const { data } = await supabase.from('cf_presets').insert({
      name: presetName.trim(), amount: formAmount, site_id: formSiteId, category: formCat, type: formType,
    }).select().single()
    if (data) setPresets(p => [...p, data as CfPreset])
    setShowSavePreset(false); setPresetName('')
  }
  function applyPreset(preset: CfPreset) {
    setFormType(preset.type); setFormAmount(preset.amount); setFormSiteId(preset.site_id); setFormCat(preset.category)
    setPresetDropOpen(false)
  }
  async function deletePreset(id: number) {
    await supabase.from('cf_presets').delete().eq('id', id)
    setPresets(p => p.filter(x => x.id !== id))
  }

  /* ── 합계 계산 (달러/원화 분리, 원화 환산 포함) ── */
  // 달러 cashflow는 amount_krw(저장된 당일환율 환산값) 사용, 없으면 현재 rate로 환산
  function toKrw(cf: Cashflow): number {
    if (cf.currency !== 'usd') return cf.amount
    if (cf.amount_krw != null) return Number(cf.amount_krw)
    return Math.round(cf.amount * (rateInfo?.rate ?? 1350))
  }

  const allIncome  = cashflows.filter(c => c.type === 'income').reduce((s, c) => s + toKrw(c), 0)
  const allExpense = cashflows.filter(c => c.type === 'expense').reduce((s, c) => s + toKrw(c), 0)
  const allBalance = allIncome - allExpense

  const thisMonthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const thisMonthEnd   = dayjs().endOf('month').format('YYYY-MM-DD')

  // 이번달 사이트별 손익 + 전체 누적 사이트별 손익을 함께 계산 (비교용)
  const monthSiteBreakdown = useMemo(() => {
    const monthMap: Record<string, { income: number; expense: number }> = {}
    const totalMap: Record<string, { income: number; expense: number }> = {}
    cashflows.filter(c => c.site_id).forEach(c => {
      if (!totalMap[c.site_id!]) totalMap[c.site_id!] = { income: 0, expense: 0 }
      if (c.type === 'income') totalMap[c.site_id!].income += toKrw(c)
      else if (c.type === 'expense') totalMap[c.site_id!].expense += toKrw(c)
    })
    cashflows.filter(c => c.flow_date >= thisMonthStart && c.flow_date <= thisMonthEnd && c.site_id).forEach(c => {
      if (!monthMap[c.site_id!]) monthMap[c.site_id!] = { income: 0, expense: 0 }
      if (c.type === 'income') monthMap[c.site_id!].income += toKrw(c)
      else if (c.type === 'expense') monthMap[c.site_id!].expense += toKrw(c)
    })
    return Object.entries(monthMap)
      .map(([siteId, v]) => {
        const t = totalMap[siteId] ?? { income: 0, expense: 0 }
        return {
          name: sites.find(s => s.id === siteId)?.name ?? siteId,
          income: v.income, expense: v.expense, net: v.income - v.expense,
          totalIncome: t.income, totalExpense: t.expense, totalNet: t.income - t.expense,
        }
      })
      .sort((a, b) => b.net - a.net)
  }, [cashflows, sites, thisMonthStart, thisMonthEnd, rateInfo])

  const monthlySummary = useMemo(() => {
    const months: { label: string; income: number; expense: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, 'month')
      const from = m.startOf('month').format('YYYY-MM-DD')
      const to   = m.endOf('month').format('YYYY-MM-DD')
      const inc = cashflows.filter(c => c.type === 'income'  && c.flow_date >= from && c.flow_date <= to).reduce((s, c) => s + toKrw(c), 0)
      const exp = cashflows.filter(c => c.type === 'expense' && c.flow_date >= from && c.flow_date <= to).reduce((s, c) => s + toKrw(c), 0)
      months.push({ label: m.format('M월'), income: inc, expense: exp })
    }
    return months
  }, [cashflows, rateInfo])

  const maxMonthly = Math.max(...monthlySummary.flatMap(m => [m.income, m.expense]), 1)

  const monthFrom  = viewMonth.format('YYYY-MM-DD')
  const monthTo    = viewMonth.endOf('month').format('YYYY-MM-DD')
  const monthFlows = cashflows.filter(c => c.flow_date >= monthFrom && c.flow_date <= monthTo)

  const groupedByDate = useMemo(() => {
    const map: Record<string, Cashflow[]> = {}
    monthFlows.forEach(c => { if (!map[c.flow_date]) map[c.flow_date] = []; map[c.flow_date].push(c) })
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => [date, [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))] as [string, Cashflow[]])
  }, [monthFlows])

  const monthIncome  = monthFlows.filter(c => c.type === 'income').reduce((s, c) => s + toKrw(c), 0)
  const monthExpense = monthFlows.filter(c => c.type === 'expense').reduce((s, c) => s + toKrw(c), 0)

  // 달러 cashflow 원화 환산 표시용
  function usdKrwLabel(cf: Cashflow): string | null {
    if (cf.currency !== 'usd') return null
    const krw = cf.amount_krw != null ? Number(cf.amount_krw) : Math.round(cf.amount * (rateInfo?.rate ?? 1350))
    const rateStr = cf.usd_krw_rate ? `@${Math.round(Number(cf.usd_krw_rate)).toLocaleString()}` : ''
    return `₩${krw.toLocaleString()}${rateStr}`
  }

  // 이번달 달러 수입/지출 원화 환산 합계
  const monthUsdIncomeKrw = monthFlows.filter(c => c.type === 'income' && c.currency === 'usd').reduce((s, c) => s + toKrw(c), 0)
  const monthUsdExpenseKrw = monthFlows.filter(c => c.type === 'expense' && c.currency === 'usd').reduce((s, c) => s + toKrw(c), 0)
  const hasUsdInMonth = monthUsdIncomeKrw > 0 || monthUsdExpenseKrw > 0

  const thisMonthIncomeTotal  = cashflows.filter(c => c.type === 'income'  && c.flow_date >= thisMonthStart && c.flow_date <= thisMonthEnd).reduce((s, c) => s + toKrw(c), 0)
  const thisMonthExpenseTotal = cashflows.filter(c => c.type === 'expense' && c.flow_date >= thisMonthStart && c.flow_date <= thisMonthEnd).reduce((s, c) => s + toKrw(c), 0)
  const thisMonthNetTotal = thisMonthIncomeTotal - thisMonthExpenseTotal

  const maxSiteBreakdownIncome  = Math.max(...monthSiteBreakdown.map(x => x.income), 1)
  const maxSiteBreakdownExpense = Math.max(...monthSiteBreakdown.map(x => x.expense), 1)
  const maxSiteBreakdownNetAbs  = Math.max(...monthSiteBreakdown.map(x => Math.abs(x.net)), 1)
  const maxSiteTotalIncome  = Math.max(...monthSiteBreakdown.map(x => x.totalIncome), 1)
  const maxSiteTotalExpense = Math.max(...monthSiteBreakdown.map(x => x.totalExpense), 1)
  const maxSiteTotalNetAbs  = Math.max(...monthSiteBreakdown.map(x => Math.abs(x.totalNet)), 1)
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']

  const catNames = categories.map(c => c.name)

  // 선택된 사이트의 통화
  const selectedSiteCurrency = sites.find(s => s.id === formSiteId)?.currency ?? 'krw'
  const formIsUsd = selectedSiteCurrency === 'usd'

  return (
    <div className="settlement-layout" style={{ display: 'flex', height: 'calc(100vh - 58px)', overflow: 'hidden', background: 'var(--bg)', gap: 0 }}>

      {/* ═══ 좌: 추가 폼 (320px) ═══ */}
      <div className="settlement-col settlement-col-form" style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <div style={{ padding: '12px 12px 0' }}>
          <div style={labelSt}>날짜</div>
          <input type="date" style={{ ...inputSt, marginBottom: 10 }} value={formDate} onChange={e => setFormDate(e.target.value)} />
        </div>

        <div style={{ padding: '0 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button onClick={() => setFormType('income')} style={{ padding: '10px 0', borderRadius: 8, border: `2px solid ${formType === 'income' ? 'var(--green)' : 'var(--border)'}`, background: formType === 'income' ? 'var(--green-bg)' : 'var(--bg-elevated)', color: formType === 'income' ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>💰 수입</button>
            <button onClick={() => setFormType('expense')} style={{ padding: '10px 0', borderRadius: 8, border: `2px solid ${formType === 'expense' ? 'var(--red)' : 'var(--border)'}`, background: formType === 'expense' ? 'var(--red-bg)' : 'var(--bg-elevated)', color: formType === 'expense' ? 'var(--red)' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>💸 지출</button>
          </div>
        </div>

        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 금액 */}
          <div>
            <div style={labelSt}>금액 ({formIsUsd ? '$' : '원'})</div>
            <input type="text" inputMode="numeric" placeholder="0"
              style={{ ...inputSt, MozAppearance: 'textfield' } as React.CSSProperties}
              value={formAmount ? Number(formAmount.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
              onChange={e => { const raw = e.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setFormAmount(raw) }}
              onKeyDown={e => e.key === 'Enter' && saveCashflow()} autoFocus />
            {/* USD이면 환산 미리보기 */}
            {formIsUsd && formAmount && rateInfo && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-num)' }}>
                ≈ ₩{Math.round(Number(formAmount.replace(/,/g,'')) * rateInfo.rate).toLocaleString()} (@{Math.round(rateInfo.rate).toLocaleString()})
              </div>
            )}
          </div>

          {/* 사이트 드롭다운 */}
          <div style={{ position: 'relative' }}>
            <div style={labelSt}>사이트</div>
            <button onClick={() => { setSiteDropOpen(p => !p); setCatDropOpen(false); setPresetDropOpen(false) }}
              style={{ ...inputSt, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: formSiteId ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {formSiteId ? (sites.find(s => s.id === formSiteId)?.name ?? '없음') : '없음'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {formIsUsd && <span style={{ fontSize: 9, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>USD</span>}
                <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: siteDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </div>
            </button>
            {siteDropOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setSiteDropOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                  <div onClick={() => { setFormSiteId(''); setSiteDropOpen(false) }}
                    style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: !formSiteId ? 'var(--gold)' : 'var(--text-muted)', background: !formSiteId ? 'var(--gold-bg)' : 'none' }}>없음</div>
                  {sites.map((st, i) => (
                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border-light)' }}>
                      <div onClick={() => { setFormSiteId(st.id); setSiteDropOpen(false) }}
                        style={{ flex: 1, padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: formSiteId === st.id ? 'var(--gold)' : 'var(--text-primary)', background: formSiteId === st.id ? 'var(--gold-bg)' : 'none' }}>
                        {editSite?.id === st.id ? (
                          <input value={editSiteVal} onChange={e => setEditSiteVal(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') confirmEditSite() }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, width: '100%' }} autoFocus />
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {st.name}
                            {st.currency === 'usd' && <span style={{ fontSize: 9, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>USD</span>}
                          </span>
                        )}
                      </div>
                      {!st.settlement_only && <span style={{ fontSize: 9, color: 'var(--text-muted)', padding: '0 4px', flexShrink: 0 }}>대시보드</span>}
                      <div style={{ display: 'flex', gap: 2, padding: '0 6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        {editSite?.id === st.id ? (
                          <>
                            <button onClick={confirmEditSite} style={iconBtnSt}><Check size={11} color="var(--green)" /></button>
                            <button onClick={() => setEditSite(null)} style={iconBtnSt}><X size={11} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditSite(st); setEditSiteVal(st.name) }} style={iconBtnSt}><Pencil size={11} /></button>
                            {i > 0 && <button onClick={() => reorderSettlementSite(st.id, sites.filter(s => !s.settlement_only === st.settlement_only ? true : s.settlement_only)[i - 1]?.id ?? '')} style={iconBtnSt}><ArrowUp size={11} /></button>}
                            {i < sites.length - 1 && <button onClick={() => reorderSettlementSite(st.id, sites[i + 1]?.id ?? '')} style={iconBtnSt}><ArrowDown size={11} /></button>}
                            {st.settlement_only && <button onClick={() => deleteSettlementSite(st)} style={iconBtnSt}><Trash2 size={11} color="var(--red)" /></button>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px', display: 'flex', gap: 6, background: 'var(--bg-elevated)' }}>
                    <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none' }}
                      placeholder="결산 전용 사이트 추가..." value={newSiteName}
                      onChange={e => setNewSiteName(e.target.value)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addSettlementSite() }}
                      onClick={e => e.stopPropagation()} />
                    <button onClick={e => { e.stopPropagation(); addSettlementSite() }} style={{ background: 'var(--gold)', border: 'none', borderRadius: 6, padding: '0 10px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-body)', flexShrink: 0 }}>추가</button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 카테고리 드롭다운 */}
          <div style={{ position: 'relative' }}>
            <div style={labelSt}>카테고리</div>
            <button onClick={() => { setCatDropOpen(p => !p); setSiteDropOpen(false); setPresetDropOpen(false) }}
              style={{ ...inputSt, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: formCat ? 'var(--text-primary)' : 'var(--text-muted)' }}>{formCat || '선택 안 함'}</span>
              <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: catDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {catDropOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setCatDropOpen(false)} />
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                  <div onClick={() => { setFormCat(''); setCatDropOpen(false) }}
                    style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: !formCat ? 'var(--gold)' : 'var(--text-muted)', background: !formCat ? 'var(--gold-bg)' : 'none' }}>선택 안 함</div>
                  {categories.map((cat, i) => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border-light)' }}>
                      <div onClick={() => { if (editCat !== cat.id) { setFormCat(cat.name); setCatDropOpen(false) } }}
                        style={{ flex: 1, padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: formCat === cat.name ? 'var(--gold)' : 'var(--text-primary)', background: formCat === cat.name ? 'var(--gold-bg)' : 'none' }}>
                        {editCat === cat.id ? (
                          <input value={editCatVal} onChange={e => setEditCatVal(e.target.value)}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') confirmEditCat(cat) }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, width: '100%' }} autoFocus />
                        ) : cat.name}
                      </div>
                      <div style={{ display: 'flex', gap: 2, padding: '0 6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        {LOCKED_CATS.includes(cat.name) ? (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', padding: '0 2px' }}>잠금</span>
                        ) : editCat === cat.id ? (
                          <>
                            <button onClick={() => confirmEditCat(cat)} style={iconBtnSt}><Check size={11} color="var(--green)" /></button>
                            <button onClick={() => setEditCat(null)} style={iconBtnSt}><X size={11} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditCat(cat.id); setEditCatVal(cat.name) }} style={iconBtnSt}><Pencil size={11} /></button>
                            {i > 0 && <button onClick={() => reorderCat(cat, categories[i - 1])} style={iconBtnSt}><ArrowUp size={11} /></button>}
                            {i < categories.length - 1 && <button onClick={() => reorderCat(cat, categories[i + 1])} style={iconBtnSt}><ArrowDown size={11} /></button>}
                            <button onClick={() => removeCat(cat)} style={iconBtnSt}><Trash2 size={11} color="var(--red)" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px', display: 'flex', gap: 6, background: 'var(--bg-elevated)' }}>
                    <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none' }}
                      placeholder="새 카테고리..." value={newCat}
                      onChange={e => setNewCat(e.target.value)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') addCat() }}
                      onClick={e => e.stopPropagation()} />
                    <button onClick={e => { e.stopPropagation(); addCat() }} style={{ background: 'var(--gold)', border: 'none', borderRadius: 6, padding: '0 10px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-body)', flexShrink: 0 }}>추가</button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 프리셋 행 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <button onClick={() => { setPresetDropOpen(p => !p); setCatDropOpen(false); setSiteDropOpen(false) }}
                style={{ ...inputSt, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', padding: '8px 12px', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <BookmarkCheck size={13} /> 프리셋 불러오기
                </span>
                <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: presetDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {presetDropOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setPresetDropOpen(false)} />
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                    {presets.length === 0 && (
                      <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>저장된 프리셋 없음</div>
                    )}
                    {presets.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border-light)' }}>
                        <div onClick={() => applyPreset(p)}
                          style={{ flex: 1, padding: '9px 12px', cursor: 'pointer', fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {p.type === 'income' ? '💰' : '💸'} {p.amount ? `${Number(p.amount).toLocaleString()}` : '금액 없음'}
                            {p.category ? ` · ${p.category}` : ''}
                            {p.site_id ? ` · ${sites.find(s => s.id === p.site_id)?.name ?? ''}` : ''}
                          </div>
                        </div>
                        <button onClick={() => deletePreset(p.id)} style={{ ...iconBtnSt, padding: '0 8px' }}>
                          <Trash2 size={11} color="var(--red)" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => { setShowSavePreset(true); setPresetName('') }}
              title="현재 상태로 프리셋 저장"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', color: 'var(--gold)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Bookmark size={14} />
            </button>
          </div>

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

        <DepositSummary sites={sites} cashflows={cashflows} rateInfo={rateInfo} />
      </div>

      {/* ═══ 중: 날짜별 목록 (400px) ═══ */}
      <div className="settlement-col settlement-col-list" style={{ width: 400, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => setViewMonth(p => p.subtract(1, 'month'))} style={navBtnSt}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{viewMonth.format('YYYY년 M월')}</span>
            <button onClick={() => setViewMonth(p => p.add(1, 'month'))} style={navBtnSt}><ChevronRight size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={miniSummSt}><span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>수입</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--green)' }}>+{fmt(monthIncome)}</span></div>
            <div style={miniSummSt}><span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>지출</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--red)' }}>-{fmt(monthExpense)}</span></div>
            <div style={miniSummSt}><span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>수익</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: (monthIncome - monthExpense) >= 0 ? 'var(--green)' : 'var(--red)' }}>{(monthIncome - monthExpense) >= 0 ? '+' : ''}{fmt(monthIncome - monthExpense)}</span></div>
          </div>
          {/* 달러 항목이 있는 달이면 원화 환산 합계 표시 */}
          {hasUsdInMonth && (
            <div style={{ marginTop: 6, padding: '5px 8px', background: 'var(--blue-bg)', borderRadius: 6, border: '1px solid var(--blue-border)', fontSize: 10, color: 'var(--blue)', display: 'flex', gap: 10 }}>
              <span>USD→₩ 환산 포함</span>
              {monthUsdIncomeKrw > 0 && <span>수입 +{fmt(monthUsdIncomeKrw)}</span>}
              {monthUsdExpenseKrw > 0 && <span>지출 -{fmt(monthUsdExpenseKrw)}</span>}
            </div>
          )}
        </div>

        <div className="settlement-list-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {groupedByDate.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>이 달의 내역이 없습니다</div>
          )}
          {groupedByDate.map(([date, items]) => {
            const dayInc = items.filter(c => c.type === 'income').reduce((s, c) => s + toKrw(c), 0)
            const dayExp = items.filter(c => c.type === 'expense').reduce((s, c) => s + toKrw(c), 0)
            return (
              <div key={date} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{dayjs(date).date()}일({DOW_KO[dayjs(date).day()]})</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {dayInc > 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-num)', color: 'var(--green)', fontWeight: 600 }}>+{fmt(dayInc)}</span>}
                    {dayExp > 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-num)', color: 'var(--red)', fontWeight: 600 }}>-{fmt(dayExp)}</span>}
                  </div>
                </div>
                {items.map(c => {
                  const krwLabel = usdKrwLabel(c)
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border-light)', marginBottom: 5 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.type === 'income' ? 'var(--green-bg)' : 'var(--red-bg)' }}>
                        {c.type === 'income' ? <TrendingUp size={14} color="var(--green)" /> : <TrendingDown size={14} color="var(--red)" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.category}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-num)', color: c.type === 'income' ? 'var(--green)' : 'var(--red)' }}>
                          {c.type === 'income' ? '+' : '-'}{c.currency === 'usd' ? '$' : ''}{fmt(c.amount)}{c.currency !== 'usd' ? '' : ''}
                        </span>
                        {/* 달러이면 원화 환산 괄호 표시 */}
                        {krwLabel && (
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-num)', color: 'var(--blue)', opacity: 0.85 }}>({krwLabel})</span>
                        )}
                      </div>
                      <button onClick={() => deleteCashflow(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}><Trash2 size={12} /></button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ 우: 통계 ═══ */}
      <div className="settlement-col settlement-col-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '14px 16px', gap: 14 }}>

        {/* 환율 배너 — 최상단 */}
        <ExchangeRateBanner rateInfo={rateInfo} onRefresh={refreshRate} refreshing={rateRefreshing} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: '수입',  total: allIncome,  month: thisMonthIncomeTotal,  color: 'var(--green)', prefix: '+' },
            { label: '지출',  total: allExpense, month: thisMonthExpenseTotal, color: 'var(--red)',   prefix: '-' },
            { label: '순수익', total: allBalance, month: thisMonthNetTotal,     color: allBalance >= 0 ? 'var(--green)' : 'var(--red)', prefix: allBalance >= 0 ? '+' : '' },
          ].map(({ label, total, month, color, prefix }) => {
            const isNet = label === '순수익'
            const monthColor  = isNet ? (month >= 0 ? 'var(--green)' : 'var(--red)') : color
            const monthPrefix = isNet ? (month >= 0 ? '+' : '') : prefix
            return (
              <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-num)', color }}>{prefix}{fmt(total)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>전체 누적</div>
                <div style={{ borderTop: '1px dashed var(--border)', marginTop: 8, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>이번달</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: monthColor }}>{monthPrefix}{fmt(month)}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>사이트별 손익 (이번달 · 전체누적 비교)</div>
          {monthSiteBreakdown.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>내역 없음</div>}
          {monthSiteBreakdown.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(48px, auto) 1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
              <span />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', textAlign: 'right' }}>수입</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)', textAlign: 'right' }}>지출</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>순수익</span>
            </div>
          )}
          {monthSiteBreakdown.map(({ name, income, expense, net, totalIncome, totalExpense, totalNet }, i) => {
            const incPct = Math.round(income / maxSiteBreakdownIncome * 100)
            const expPct = Math.round(expense / maxSiteBreakdownExpense * 100)
            const netPct = Math.round(Math.abs(net) / maxSiteBreakdownNetAbs * 100)
            const netColor = net >= 0 ? 'var(--green)' : 'var(--red)'
            const totIncPct = Math.round(totalIncome / maxSiteTotalIncome * 100)
            const totExpPct = Math.round(totalExpense / maxSiteTotalExpense * 100)
            const totNetPct = Math.round(Math.abs(totalNet) / maxSiteTotalNetAbs * 100)
            const totNetColor = totalNet >= 0 ? 'var(--green)' : 'var(--red)'
            return (
              <div key={name} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: i < monthSiteBreakdown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>

                {/* 이번달 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(48px, auto) 1fr 1fr 1fr', gap: 4, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>이번달</span>
                  <div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--green)', marginBottom: 2 }}>+{fmt(income)}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: 'var(--green)', width: `${incPct}%`, marginLeft: 'auto', opacity: 0.85 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--red)', marginBottom: 2 }}>-{fmt(expense)}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: 'var(--red)', width: `${expPct}%`, marginLeft: 'auto', opacity: 0.85 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-num)', color: netColor, marginBottom: 2 }}>{net >= 0 ? '+' : ''}{fmt(net)}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: netColor, width: `${netPct}%`, marginLeft: 'auto', opacity: 0.85 }} />
                    </div>
                  </div>
                </div>

                {/* 전체누적 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(48px, auto) 1fr 1fr 1fr', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>전체누적</span>
                  <div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--green)', opacity: 0.7, marginBottom: 2 }}>+{fmt(totalIncome)}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: 'var(--green)', width: `${totIncPct}%`, marginLeft: 'auto', opacity: 0.4 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--red)', opacity: 0.7, marginBottom: 2 }}>-{fmt(totalExpense)}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: 'var(--red)', width: `${totExpPct}%`, marginLeft: 'auto', opacity: 0.4 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-num)', color: totNetColor, opacity: 0.7, marginBottom: 2 }}>{totalNet >= 0 ? '+' : ''}{fmt(totalNet)}</div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: totNetColor, width: `${totNetPct}%`, marginLeft: 'auto', opacity: 0.4 }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

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
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)' }} /> 수입</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)' }} /> 지출</span>
          </div>
        </div>
      </div>

      {/* ── 프리셋 저장 모달 ── */}
      {showSavePreset && (
        <div className="modal-overlay" onClick={() => setShowSavePreset(false)}>
          <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">프리셋 저장</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
              <div>{formType === 'income' ? '💰 수입' : '💸 지출'}</div>
              {formAmount && <div>금액: {Number(formAmount).toLocaleString()}{formIsUsd ? '$' : '원'}</div>}
              {formSiteId && <div>사이트: {sites.find(s => s.id === formSiteId)?.name}</div>}
              {formCat && <div>카테고리: {formCat}</div>}
            </div>
            <div className="form-group mb-16">
              <label className="form-label">프리셋 이름</label>
              <input className="form-input" placeholder="예: 월급, 넷마블 입금" value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePreset()} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSavePreset(false)}>취소</button>
              <button className="btn btn-primary" onClick={savePreset} disabled={!presetName.trim()}><Bookmark size={13} /> 저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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

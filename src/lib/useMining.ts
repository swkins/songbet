import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { logAction } from './logger'
import dayjs from 'dayjs'

export interface MiningEntry {
  id: string
  created_at: string
  entry_date: string
  site_name: string
  start_point: number
  target_point: number
  current_point: number
  sort_order: number
}

export interface MiningCashout {
  id: string
  site_name: string
  last_cashout_at: string | null
  next_allowed_at: string | null
  goal_date: string | null   // 'YYYY-MM-DD' — 현금교환 목표 날짜 (= 채굴 눈금 게이지의 마감일)
  auto_set_2w: boolean       // on이면 현금교환 실행 시 목표 날짜를 자동으로 2주 뒤로 설정
  perf_site_ids: string[]    // 실적현황 대상 베팅사이트 id 목록
  perf_period: '2w' | '1m' | null // 목표 날짜로부터 얼마나 이전 시기까지의 실적을 볼지
  perf_amount: number        // 실적 목표 금액
  memo: string               // 사이트별 자유 메모
}

export const MINING_HISTORY_DAYS = 59 // 오늘 포함 60일치 (달력 2개월 안팎 + 그래프 30일 + 일평균 계산용)

export function fmtMining(n: number) { return Math.round(n).toLocaleString('ko-KR') }
export function minedOf(e: MiningEntry) { return e.current_point - e.start_point }

/** 채굴 데이터 로딩/승계/추가/수정/삭제 공용 훅. Mining.tsx(전체 페이지)와
 *  대시보드 좌측 사이드바 위젯이 이 훅을 공유해서 로직이 두 곳에서 갈라지지 않게 한다. */
export function useMiningData() {
  const today = dayjs().format('YYYY-MM-DD')

  const [entries, setEntries] = useState<MiningEntry[]>([])
  const [history, setHistory] = useState<MiningEntry[]>([]) // 최근 60일치 전체 (오늘 포함)
  const [loading, setLoading] = useState(true)
  const [cashouts, setCashouts] = useState<MiningCashout[]>([])

  useEffect(() => { init(); loadCashouts() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCashouts() {
    const { data } = await supabase.from('mining_cashouts').select('*')
    if (data) setCashouts(data as MiningCashout[])
  }

  // 오늘 데이터를 불러오면서, 어제(혹은 그 이전 마지막 기록일)의 마지막 현재 포인트를
  // 오늘의 시작 포인트로 자동 승계한다 — 아직 오늘 기록이 없는 사이트만 대상.
  async function init() {
    setLoading(true)
    const from = dayjs().subtract(MINING_HISTORY_DAYS, 'day').format('YYYY-MM-DD')
    const { data } = await supabase
      .from('mining_entries').select('*')
      .gte('entry_date', from)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: true })

    const all = (data ?? []) as MiningEntry[]
    const todays = all.filter(e => e.entry_date === today)
    const todaySites = new Set(todays.map(e => e.site_name))

    const seen = new Set<string>()
    const toInsert: Array<Omit<MiningEntry, 'id' | 'created_at'>> = []
    for (const e of all) {
      if (e.entry_date >= today) continue
      if (todaySites.has(e.site_name) || seen.has(e.site_name)) continue
      seen.add(e.site_name)
      toInsert.push({
        entry_date: today,
        site_name: e.site_name,
        start_point: e.current_point,
        target_point: e.target_point,
        current_point: e.current_point,
        sort_order: e.sort_order,
      })
    }

    let finalToday = todays
    let finalAll = all
    if (toInsert.length > 0) {
      const { data: inserted } = await supabase.from('mining_entries').insert(toInsert).select()
      if (inserted) {
        finalToday = [...todays, ...(inserted as MiningEntry[])]
        finalAll = [...(inserted as MiningEntry[]), ...all]
      }
    }
    setEntries(finalToday.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)))
    setHistory(finalAll)
    setLoading(false)
  }

  const knownSites = useMemo(() => Array.from(new Set(history.map(h => h.site_name))), [history])

  async function addEntry(name: string, start: number, target: number): Promise<'ok' | 'duplicate' | 'error'> {
    const maxOrder = entries.reduce((a, e) => Math.max(a, e.sort_order), 0)
    const { data, error } = await supabase
      .from('mining_entries')
      .insert({
        entry_date: today,
        site_name: name,
        start_point: start,
        target_point: target,
        current_point: start,
        sort_order: maxOrder + 1,
      })
      .select().single()
    if (!error && data) {
      setEntries(prev => [...prev, data as MiningEntry])
      setHistory(prev => [data as MiningEntry, ...prev])
      return 'ok'
    }
    if (error?.code === '23505') return 'duplicate'
    return 'error'
  }

  async function updateField(entry: MiningEntry, field: 'start_point' | 'target_point' | 'current_point', value: number) {
    const { data } = await supabase
      .from('mining_entries').update({ [field]: value }).eq('id', entry.id).select().single()
    if (data) {
      setEntries(prev => prev.map(e => e.id === entry.id ? (data as MiningEntry) : e))
      setHistory(prev => prev.map(e => e.id === entry.id ? (data as MiningEntry) : e))
    }
  }

  async function deleteEntry(id: string) {
    await supabase.from('mining_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setHistory(prev => prev.filter(e => e.id !== id))
  }

  function cashoutFor(siteName: string): MiningCashout | undefined {
    return cashouts.find(c => c.site_name === siteName)
  }

  /** 현금교환 목표 날짜 설정. */
  async function setCashGoal(siteName: string, goalDate: string) {
    const existing = cashoutFor(siteName)
    const payload = { site_name: siteName, goal_date: goalDate }
    const { data } = existing
      ? await supabase.from('mining_cashouts').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('mining_cashouts').insert(payload).select().single()
    if (data) setCashouts(prev => existing ? prev.map(c => c.id === (data as MiningCashout).id ? (data as MiningCashout) : c) : [...prev, data as MiningCashout])
  }

  /** 2주 자동 설정 토글: on이면 현금교환 실행 시 목표 날짜가 자동으로 오늘로부터 2주 뒤로 설정된다. */
  async function setAutoSet2w(siteName: string, enabled: boolean) {
    const existing = cashoutFor(siteName)
    const payload = { site_name: siteName, auto_set_2w: enabled }
    const { data } = existing
      ? await supabase.from('mining_cashouts').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('mining_cashouts').insert(payload).select().single()
    if (data) setCashouts(prev => existing ? prev.map(c => c.id === (data as MiningCashout).id ? (data as MiningCashout) : c) : [...prev, data as MiningCashout])
  }

  /** 실적현황 목표 설정: 베팅사이트 목록 + 기간(목표 날짜로부터 얼마나 이전까지) + 목표 금액. */
  async function setPerfGoal(siteName: string, siteIds: string[], period: '2w' | '1m', amount: number) {
    const existing = cashoutFor(siteName)
    const payload = { site_name: siteName, perf_site_ids: siteIds, perf_period: period, perf_amount: amount }
    const { data } = existing
      ? await supabase.from('mining_cashouts').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('mining_cashouts').insert(payload).select().single()
    if (data) setCashouts(prev => existing ? prev.map(c => c.id === (data as MiningCashout).id ? (data as MiningCashout) : c) : [...prev, data as MiningCashout])
  }

  /** 현금교환 실행: 오늘 기록의 현재가에서 교환한 만큼을 빼고, 그 값을 시작가/현재가로 새로 설정한다.
   *  자동 설정이 켜져 있으면 목표 날짜를 오늘로부터 2주 뒤로 자동 설정한다.
   *  결산(cashflows)에도 "현금교환" 카테고리로 수입 기록을 남긴다. */
  async function doCashout(entry: MiningEntry, amount: number) {
    const newPoint = entry.current_point - amount
    const { data } = await supabase.from('mining_entries')
      .update({ start_point: newPoint, current_point: newPoint }).eq('id', entry.id).select().single()
    if (data) {
      setEntries(prev => prev.map(e => e.id === entry.id ? (data as MiningEntry) : e))
      setHistory(prev => prev.map(e => e.id === entry.id ? (data as MiningEntry) : e))
    }
    const now = dayjs()
    const existing = cashoutFor(entry.site_name)
    const autoOn = existing?.auto_set_2w ?? true
    const payload: Record<string, unknown> = {
      site_name: entry.site_name,
      last_cashout_at: now.toISOString(),
      next_allowed_at: now.add(14, 'day').toISOString(),
    }
    if (autoOn) payload.goal_date = now.add(14, 'day').format('YYYY-MM-DD')
    const { data: cd } = existing
      ? await supabase.from('mining_cashouts').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('mining_cashouts').insert(payload).select().single()
    if (cd) setCashouts(prev => existing ? prev.map(c => c.id === (cd as MiningCashout).id ? (cd as MiningCashout) : c) : [...prev, cd as MiningCashout])

    const { data: cf } = await supabase.from('cashflows').insert({
      flow_date: today, type: 'income', category: '현금교환',
      description: `${entry.site_name} 채굴 현금교환`, amount,
      site_id: null, currency: 'krw', usd_krw_rate: null, amount_krw: amount,
    }).select().single()
    await logAction({
      action_type: 'update', table_name: 'mining_entries', record_id: entry.id,
      before_data: entry as never, after_data: (data ?? entry) as never,
      description: `${entry.site_name} 채굴 현금교환 +${amount.toLocaleString()}`,
      cashflow_id: cf?.id ?? null,
    })
  }

  /** 사이트 메모 저장. */
  async function setMemo(siteName: string, memo: string) {
    const existing = cashoutFor(siteName)
    const payload = { site_name: siteName, memo }
    const { data } = existing
      ? await supabase.from('mining_cashouts').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('mining_cashouts').insert(payload).select().single()
    if (data) setCashouts(prev => existing ? prev.map(c => c.id === (data as MiningCashout).id ? (data as MiningCashout) : c) : [...prev, data as MiningCashout])
  }

  return { today, entries, history, loading, knownSites, addEntry, updateField, deleteEntry, cashouts, cashoutFor, setCashGoal, setAutoSet2w, setPerfGoal, setMemo, doCashout }
}

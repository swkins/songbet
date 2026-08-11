import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
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

  useEffect(() => { init() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  return { today, entries, history, loading, knownSites, addEntry, updateField, deleteEntry }
}

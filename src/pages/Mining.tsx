import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { Plus, Trash2, Pencil, Check, X, ClipboardPaste, ChevronLeft, ChevronRight, CalendarDays, LayoutList } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMiningData, fmtMining as fmt, minedOf as mined, type MiningEntry } from '../lib/useMining'

const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px',
  textTransform: 'uppercase', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

export default function Mining() {
  const { today, entries, history, loading, knownSites, addEntry: addEntryToDb, updateField, deleteEntry: deleteEntryFromDb } = useMiningData()

  const [viewMode, setViewMode] = useState<'today' | 'calendar'>('today')
  const [calendarMonth, setCalendarMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [addModalOpen, setAddModalOpen] = useState(false)

  // 추가 폼
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)

  // 인라인 편집 (시작/목표/현재 포인트 공통)
  type EditField = 'start' | 'target' | 'current'
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null)
  const [editVal, setEditVal] = useState('')

  function startEdit(entry: MiningEntry, field: EditField) {
    setEditing({ id: entry.id, field })
    if (field === 'current') {
      setEditVal('') // 현재 포인트는 수정 시 빈칸으로 시작
    } else {
      setEditVal(String(field === 'start' ? entry.start_point : entry.target_point))
    }
  }
  function cancelEdit() { setEditing(null); setEditVal('') }

  async function pasteToEdit() {
    try {
      const text = await navigator.clipboard.readText()
      const digits = text.replace(/[^\d]/g, '')
      if (digits) setEditVal(digits)
    } catch {
      // 클립보드 접근 실패 (권한 거부 등) — 무시하고 직접 입력하도록 둔다
    }
  }

  // 날짜별 총 채굴량 (모든 사이트 합산) — 달력/그래프 공용
  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of history) {
      map.set(e.entry_date, (map.get(e.entry_date) ?? 0) + Math.max(0, mined(e)))
    }
    return map
  }, [history])

  // 사이트별 일일 평균 채굴량 (최근 60일 기록 기준)
  const siteAverages = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>()
    for (const e of history) {
      const cur = sums.get(e.site_name) ?? { total: 0, count: 0 }
      cur.total += Math.max(0, mined(e)); cur.count += 1
      sums.set(e.site_name, cur)
    }
    const out = new Map<string, number>()
    sums.forEach((v, k) => out.set(k, v.count > 0 ? v.total / v.count : 0))
    return out
  }, [history])

  const graphData = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
      days.push({ date: d, label: dayjs(d).format('M/D'), total: dailyTotals.get(d) ?? 0 })
    }
    return days
  }, [dailyTotals])

  const calendarWeeks = useMemo(() => {
    const startOfMonth = calendarMonth.startOf('month')
    const daysInMonth = calendarMonth.daysInMonth()
    const startDay = startOfMonth.day() // 0=일
    const cells: (Dayjs | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(calendarMonth.date(d))
    while (cells.length % 7 !== 0) cells.push(null)
    const weeks: (Dayjs | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    return weeks
  }, [calendarMonth])

  const calendarMonthTotal = useMemo(() => {
    let sum = 0
    dailyTotals.forEach((v, k) => { if (dayjs(k).isSame(calendarMonth, 'month')) sum += v })
    return sum
  }, [dailyTotals, calendarMonth])

  async function addEntry() {
    if (!newName.trim() || saving) return
    setSaving(true)
    const startNum = Number(newStart.replace(/,/g, '')) || 0
    const targetNum = Number(newTarget.replace(/,/g, '')) || 0
    const result = await addEntryToDb(newName.trim(), startNum, targetNum)
    if (result === 'ok') {
      setNewName(''); setNewStart(''); setNewTarget('')
      setAddModalOpen(false)
    } else if (result === 'duplicate') {
      alert('오늘 이미 등록된 사이트입니다.')
    }
    setSaving(false)
  }

  async function saveEdit(entry: MiningEntry) {
    if (!editing || editing.id !== entry.id) return
    const num = Number(editVal.replace(/,/g, ''))
    if (Number.isNaN(num) || editVal === '') { cancelEdit(); return }
    const column = editing.field === 'start' ? 'start_point' : editing.field === 'target' ? 'target_point' : 'current_point'
    await updateField(entry, column, num)
    cancelEdit()
  }

  async function deleteEntry(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteEntryFromDb(id)
  }

  const totals = useMemo(() => {
    const total_mined = entries.reduce((a, e) => a + Math.max(0, mined(e)), 0)
    const target = entries.reduce((a, e) => a + e.target_point, 0)
    return { mined: total_mined, target }
  }, [entries])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ═══ 사이트별 진행현황 / 달력·그래프 ═══ */}
      <div className="mining-content" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <button onClick={() => setViewMode('today')} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
            border: `1px solid ${viewMode === 'today' ? 'var(--gold-border)' : 'var(--border)'}`,
            background: viewMode === 'today' ? 'var(--gold-bg)' : 'var(--bg-elevated)',
            color: viewMode === 'today' ? 'var(--gold)' : 'var(--text-secondary)',
          }}><LayoutList size={13} /> 오늘 현황</button>
          <button onClick={() => setViewMode('calendar')} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
            border: `1px solid ${viewMode === 'calendar' ? 'var(--gold-border)' : 'var(--border)'}`,
            background: viewMode === 'calendar' ? 'var(--gold-bg)' : 'var(--bg-elevated)',
            color: viewMode === 'calendar' ? 'var(--gold)' : 'var(--text-secondary)',
          }}><CalendarDays size={13} /> 달력·그래프</button>

          {viewMode === 'today' && entries.length > 0 && (
            <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              오늘 합계 <b style={{ color: 'var(--gold)', fontFamily: 'var(--font-num)' }}>{fmt(totals.mined)}</b>
              <span style={{ color: 'var(--text-muted)' }}> / {fmt(totals.target)}</span>
            </span>
          )}

          <button onClick={() => setAddModalOpen(true)} style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', border: 'none', background: 'var(--gold)', color: '#000',
          }}><Plus size={14} /> 사이트 추가</button>
        </div>

        {viewMode === 'today' ? (
          <>
            {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</div>}
            {!loading && entries.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
                {'+'} 버튼으로 사이트를 추가하면 오늘의 채굴 현황이 여기 표시됩니다.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {entries.map(e => {
                const m = mined(e)
                const remaining = e.target_point - m
                const isExcess = e.target_point > 0 && remaining < 0
                const pct = e.target_point > 0 ? Math.min(100, Math.max(0, m / e.target_point * 100)) : 0
                const done = e.target_point > 0 && m >= e.target_point
                const tickStep = 10000
                const tickCount = e.target_point > tickStep ? Math.floor(e.target_point / tickStep) : 0
                const avg = siteAverages.get(e.site_name) ?? 0
                const isEditingTarget = editing?.id === e.id && editing.field === 'target'
                const isEditingStart = editing?.id === e.id && editing.field === 'start'
                const isEditingCurrent = editing?.id === e.id && editing.field === 'current'

                return (
                  <div key={e.id} style={{
                    background: 'var(--bg-card)', border: `1px solid ${done ? 'var(--green-border)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '16px 18px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{e.site_name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {avg > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>일평균 <b style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-num)' }}>{fmt(avg)}</b></span>}
                        {done && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-border)', padding: '1px 6px', borderRadius: 4 }}>완료</span>}
                        <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontFamily: 'var(--font-num)', fontSize: 22, fontWeight: 800, color: done ? 'var(--green)' : 'var(--gold)' }}>
                        {fmt(m)}
                      </span>
                      {isEditingTarget ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/</span>
                          <input autoFocus style={{ width: 100, background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: '4px 7px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                            inputMode="numeric" value={editVal}
                            onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                            onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                          <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={14} /></button>
                          <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
                        </div>
                      ) : (
                        <span onClick={() => startEdit(e, 'target')} style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-num)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                          / {fmt(e.target_point)} <Pencil size={11} />
                        </span>
                      )}
                    </div>

                    {/* 진행률 바 + 1만 단위 눈금 (더 크게, 위아래로 튀어나오게) */}
                    <div style={{ position: 'relative', height: 11, background: 'var(--bg-elevated)', borderRadius: 5 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 5, transition: 'width 0.4s ease',
                          background: done ? 'var(--green)' : 'linear-gradient(90deg, var(--orange), #FFAD42)' }} />
                      </div>
                      {Array.from({ length: tickCount }, (_, i) => i + 1).map(i => {
                        const tickPct = (tickStep * i / e.target_point) * 100
                        const passed = m >= tickStep * i
                        return (
                          <div key={i} title={`${fmt(tickStep * i)}`} style={{
                            position: 'absolute', left: `${tickPct}%`, top: -4, bottom: -4, width: 3, borderRadius: 2,
                            background: passed ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.5)',
                          }} />
                        )
                      })}
                    </div>

                    {/* 퍼센트 + 남음/초과 — 눈에 잘 띄도록 강조 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <span style={{ fontFamily: 'var(--font-num)', fontSize: 26, fontWeight: 800, color: done ? 'var(--green)' : 'var(--text-primary)' }}>
                        {pct.toFixed(0)}%
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-num)', padding: '4px 11px', borderRadius: 999,
                        background: isExcess ? 'var(--green-bg)' : 'var(--bg-elevated)',
                        color: isExcess ? 'var(--green)' : 'var(--text-secondary)',
                        border: `1px solid ${isExcess ? 'var(--green-border)' : 'var(--border)'}`,
                      }}>
                        {isExcess ? `초과 ${fmt(-remaining)}` : `남음 ${fmt(Math.max(0, remaining))}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, flexWrap: 'wrap' }}>
                      {/* 시작 포인트 */}
                      {isEditingStart ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>시작</span>
                          <input autoFocus style={{ width: 100, background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: '4px 7px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                            inputMode="numeric" value={editVal}
                            onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                            onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                          <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                          <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                        </div>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>시작</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-num)' }}>{fmt(e.start_point)}</span>
                          <button onClick={() => startEdit(e, 'start')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><Pencil size={10} /></button>
                        </span>
                      )}

                      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

                      {/* 현재 포인트 */}
                      {isEditingCurrent ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>현재</span>
                          <input autoFocus style={{ width: 120, background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                            inputMode="numeric"
                            placeholder="붙여넣기 또는 입력"
                            value={editVal}
                            onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                            onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                          <button onClick={pasteToEdit} title="클립보드에서 붙여넣기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', display: 'flex' }}><ClipboardPaste size={14} /></button>
                          <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={14} /></button>
                          <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
                        </div>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>현재</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-num)' }}>{fmt(e.current_point)}</span>
                          <button onClick={() => startEdit(e, 'current')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><Pencil size={12} /></button>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ─ 달력 ─ */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button onClick={() => setCalendarMonth(m => m.subtract(1, 'month'))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                  <ChevronLeft size={18} />
                </button>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {calendarMonth.format('YYYY년 M월')}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>합계 {fmt(calendarMonthTotal)}</span>
                </div>
                <button onClick={() => setCalendarMonth(m => m.add(1, 'month'))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
                ))}
              </div>
              {calendarWeeks.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                  {week.map((d, di) => {
                    if (!d) return <div key={di} />
                    const dateStr = d.format('YYYY-MM-DD')
                    const total = dailyTotals.get(dateStr) ?? 0
                    const isToday = dateStr === today
                    return (
                      <div key={di} style={{
                        borderRadius: 8, padding: '6px 4px', minHeight: 52,
                        background: total > 0 ? 'var(--gold-bg)' : 'var(--bg-elevated)',
                        border: `1px solid ${isToday ? 'var(--gold-border)' : 'transparent'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      }}>
                        <span style={{ fontSize: 10, color: isToday ? 'var(--gold)' : 'var(--text-muted)', fontWeight: isToday ? 700 : 500 }}>{d.date()}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-num)', fontWeight: 700, color: total > 0 ? 'var(--gold)' : 'var(--text-muted)', textAlign: 'center', wordBreak: 'keep-all' }}>
                          {total > 0 ? fmt(total) : '-'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* ─ 그래프 (최근 30일) ─ */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>최근 30일 채굴량</div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={graphData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={2} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: 'var(--text-secondary)' }}
                      formatter={(v: number) => [fmt(v), '채굴량']} />
                    <Bar dataKey="total" fill="var(--gold)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ─ 사이트별 일평균 ─ */}
            {siteAverages.size > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>사이트별 일평균 채굴량</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from(siteAverages.entries()).sort((a, b) => b[1] - a[1]).map(([name, avg]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{name}</span>
                      <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--gold)' }}>{fmt(avg)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ 사이트 추가 모달 — 평소엔 숨겨져 있고 버튼으로만 열림 ═══ */}
      {addModalOpen && (
        <div onClick={() => setAddModalOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={ev => ev.stopPropagation()} style={{
            width: '100%', maxWidth: 360, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {dayjs(today).format('MM.DD')} 채굴 사이트 추가
              </div>
              <button onClick={() => setAddModalOpen(false)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={labelSt}>사이트명</div>
              <input autoFocus style={inputSt} placeholder="사이트 이름"
                list="mining-known-sites"
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEntry()} />
              <datalist id="mining-known-sites">
                {knownSites.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={labelSt}>오늘 최초 시작 포인트</div>
              <input style={inputSt} inputMode="numeric" placeholder="0"
                value={newStart ? Number(newStart.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                onChange={e => { const raw = e.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setNewStart(raw) }}
                onKeyDown={e => e.key === 'Enter' && addEntry()} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={labelSt}>목표량</div>
              <input style={inputSt} inputMode="numeric" placeholder="0"
                value={newTarget ? Number(newTarget.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                onChange={e => { const raw = e.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setNewTarget(raw) }}
                onKeyDown={e => e.key === 'Enter' && addEntry()} />
            </div>

            <button onClick={addEntry} disabled={!newName.trim() || saving} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 0', borderRadius: 8, border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed',
              background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)',
              opacity: newName.trim() ? 1 : 0.5,
            }}>
              <Plus size={14} /> 채굴 시작
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

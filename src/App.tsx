import { useState, useEffect, useRef } from 'react'
import type { Tab, ActionLog, Todo } from './types'
import Dashboard from './pages/Dashboard'
import Settlement from './pages/Settlement'
import Stats from './pages/Stats'
import { supabase } from './lib/supabase'
import { purgeOldLogs } from './lib/logger'
import dayjs from 'dayjs'
<<<<<<< HEAD
import { RotateCcw, ClipboardList, X, LayoutTemplate, Code2, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Save, CheckSquare, Plus, Trash2, Settings, Pin, GripVertical, Percent } from 'lucide-react'
=======
import { RotateCcw, ClipboardList, X, LayoutTemplate, Code2, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Save, CheckSquare, Plus, Trash2, Settings, Pin, StickyNote } from 'lucide-react'
>>>>>>> 22b24436488e9b88c464513c73306be4a38f7d0f

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'stats', label: '통계' },
  { id: 'settlement', label: '결산' },
]

const WIDTH_OPTIONS: { label: string; value: string }[] = [
  { label: '전체', value: '100%' },
  { label: '1920', value: '1920px' },
  { label: '1760', value: '1760px' },
  { label: '1600', value: '1600px' },
  { label: '1280', value: '1280px' },
  { label: '1024', value: '1024px' },
]

interface CodeNote {
  id: string
  created_at: string
  content: string
  applied_at: string | null
  applied_content: string | null
}

// 엔터 시 다음 번호 자동 삽입
function handleNumberedEnter(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (v: string) => void
) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const el = e.currentTarget
  const pos = el.selectionStart
  const before = value.slice(0, pos)
  const after = value.slice(pos)
  const lines = before.split('\n')
  const curLine = lines[lines.length - 1]
  const match = curLine.match(/^(\d+)\.\s?/)
  if (match) {
    const nextNum = parseInt(match[1]) + 1
    const insert = `\n${nextNum}. `
    const newVal = before + insert + after
    onChange(newVal)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = pos + insert.length
      // 6. 새 행이 보이도록 스크롤 맨 아래로
      el.scrollTop = el.scrollHeight
    })
  } else {
    const insert = '\n'
    const newVal = before + insert + after
    onChange(newVal)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = pos + 1
      // 6. 새 행이 보이도록 스크롤 맨 아래로
      el.scrollTop = el.scrollHeight
    })
  }
}

/* ── 미니 달력 (할 일 패널용) ── */
function MiniCalendarApp({ checkedDates, onToggle }: { checkedDates: string[]; onToggle: (d: string) => void }) {
  const [viewMonth, setViewMonth] = useState(dayjs().startOf('month'))
  const today = dayjs().format('YYYY-MM-DD')
  const startDay = viewMonth.startOf('month').day()
  const cells: (string | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: viewMonth.daysInMonth() }, (_, i) => viewMonth.date(i + 1).format('YYYY-MM-DD')),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  return (
    <div className="mini-cal">
      <div className="mini-cal-header">
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }} onClick={() => setViewMonth(p => p.subtract(1, 'month'))}><ChevronLeft size={11} /></button>
        <span style={{ fontSize: 10 }}>{viewMonth.format('YYYY.MM')}</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }} onClick={() => setViewMonth(p => p.add(1, 'month'))}><ChevronRight size={11} /></button>
      </div>
      <div className="mini-cal-grid">
        {['일','월','화','수','목','금','토'].map(d => <div key={d} className="mini-cal-dow">{d}</div>)}
        {cells.map((date, i) => date
          ? <div key={i} className={`mini-cal-day ${checkedDates.includes(date) ? 'checked' : ''} ${date === today ? 'today' : ''}`} onClick={() => onToggle(date)}>{dayjs(date).date()}</div>
          : <div key={i} />
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [showLog, setShowLog] = useState(false)
  const [showTodo, setShowTodo] = useState(false)
  const [showMargin, setShowMargin] = useState(false)
  const [marginCount, setMarginCount] = useState<2 | 3>(2)
  const [marginOdds, setMarginOdds] = useState<string[]>(['', '', ''])
  const marginInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [showWidthMenu, setShowWidthMenu] = useState(false)
  const [pinCode, setPinCode] = useState(false)       // 코드수정 고정
  const [todoSettingsId, setTodoSettingsId] = useState<string | null>(null)
  const [todoSettingsPos, setTodoSettingsPos] = useState<{top: number; right: number}>({ top: 0, right: 0 })
  const [undoing, setUndoing] = useState<string | null>(null)
  const [maxWidth, setMaxWidth] = useState<string>(() => localStorage.getItem('sb_width') ?? '1920px')

  // 메모장 패널
  const [showMemo, setShowMemo] = useState(false)
  const [memoId, setMemoId] = useState<string | null>(null)
  const [memoContent, setMemoContent] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)
  const [memoSavedFlash, setMemoSavedFlash] = useState(false)
  const memoLoaded = useRef(false)
  const memoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 코드 수정 패널
  const [showCode, setShowCode] = useState(false)
  const [codeNotes, setCodeNotes] = useState<CodeNote[]>([])
  const [draftContent, setDraftContent] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [collapsedApplied, setCollapsedApplied] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)  // 펼쳐진 반영 항목
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ctrl+S 저장 단축키
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (showCode && draftContent.trim()) saveDraft(draftContent)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCode, draftContent])

  useEffect(() => {
    loadLogs(); purgeOldLogs()
    const t = setInterval(loadLogs, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const h = () => loadLogs()
    window.addEventListener('log-updated', h)
    return () => window.removeEventListener('log-updated', h)
  }, [])

  const justOpenedCode = useRef(false)

  // 오늘 할 일 (Nav 패널용)
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodoText, setNewTodoText] = useState('')
  const todayStr = dayjs().format('YYYY-MM-DD')
  const todoDragId = { current: '' }; const todoOverId = { current: '' }
  const uncheckedCount = todos.filter(t => !t.check_dates.includes(todayStr)).length

  useEffect(() => { loadTodos() }, [])
  async function loadTodos() {
    const { data } = await supabase.from('todos').select('*').order('sort_order', { ascending: true }).order('created_at')
    if (data) setTodos(data as Todo[])
  }
  async function toggleTodoApp(todo: Todo) {
    const isChecked = todo.check_dates.includes(todayStr)
    const newDates = isChecked ? todo.check_dates.filter((d: string) => d !== todayStr) : [...todo.check_dates, todayStr]
    const { data } = await supabase.from('todos').update({ done: !isChecked, check_dates: newDates, check_count: newDates.length }).eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data as Todo : t))
  }
  async function addTodoApp() {
    if (!newTodoText.trim()) return
    const { data } = await supabase.from('todos').insert({ todo_date: todayStr, content: newTodoText.trim(), done: false, check_count: 0, check_dates: [] }).select().single()
    if (data) { setTodos(p => [...p, data as Todo]); setNewTodoText('') }
  }
  async function reorderTodosApp(draggedId: string, overId: string) {
    const from = todos.findIndex(t => t.id === draggedId)
    const to   = todos.findIndex(t => t.id === overId)
    if (from === -1 || to === -1 || from === to) return
    const reordered = [...todos]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setTodos(reordered)
    await Promise.all(reordered.map((t, i) =>
      supabase.from('todos').update({ sort_order: i }).eq('id', t.id)
    ))
  }
    async function deleteTodoApp(id: string) {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(p => p.filter(t => t.id !== id))
  }
  async function resetTodoApp(todo: Todo) {
    const { data } = await supabase.from('todos').update({ check_dates: [], check_count: 0, done: false }).eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data as Todo : t))
  }
  async function toggleCalDateApp(todo: Todo, date: string) {
    const has = todo.check_dates.includes(date)
    const newDates = has ? todo.check_dates.filter((d: string) => d !== date) : [...todo.check_dates, date]
    const { data } = await supabase.from('todos').update({ check_dates: newDates, check_count: newDates.length, done: newDates.includes(todayStr) }).eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data as Todo : t))
  }

  // 마진율 계산기 — 숫자 3자리 입력 시 자동으로 소숫점 배당(예: 124 → 1.24)으로 변환하고
  // 다음 칸으로 커서를 이동시켜 연속 입력(예: 6자리 = 두 칸)이 가능하도록 함
  function handleMarginOddsChange(idx: number, raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    const isTriple = /^\d{3}$/.test(clean)
    setMarginOdds(prev => {
      const next = [...prev]
      next[idx] = isTriple ? (Number(clean) / 100).toFixed(2) : clean
      return next
    })
    if (isTriple && idx + 1 < marginCount) {
      requestAnimationFrame(() => {
        const nextEl = marginInputRefs.current[idx + 1]
        if (nextEl) { nextEl.focus(); nextEl.select() }
      })
    }
  }
  function resetMargin() { setMarginOdds(['', '', '']) }
  function marginTier(pct: number): { label: string; color: string; bg: string; border: string } {
    if (pct < 0)  return { label: '차익 기회 🔥', color: 'var(--cyan)',   bg: 'var(--cyan-bg)',   border: 'var(--cyan-border)' }
    if (pct <= 2) return { label: '최상',          color: 'var(--green)',  bg: 'var(--green-bg)',  border: 'var(--green-border)' }
    if (pct <= 4) return { label: '좋음',          color: 'var(--green)',  bg: 'var(--green-bg)',  border: 'var(--green-border)' }
    if (pct <= 6) return { label: '보통',          color: 'var(--gold)',   bg: 'var(--gold-bg)',   border: 'var(--gold-border)' }
    if (pct <= 8) return { label: '낮음',          color: 'var(--orange)', bg: 'var(--orange-bg)', border: 'var(--orange-border)' }
    return           { label: '나쁨',          color: 'var(--red)',    bg: 'var(--red-bg)',    border: 'var(--red-border)' }
  }
  const activeMarginOdds = marginOdds.slice(0, marginCount)
  const parsedMarginOdds = activeMarginOdds.map(o => parseFloat(o))
  const marginAllValid = parsedMarginOdds.length === marginCount && parsedMarginOdds.every(n => !isNaN(n) && n > 0)
  const marginPct = marginAllValid ? (parsedMarginOdds.reduce((a, n) => a + 1 / n, 0) - 1) * 100 : null
  const marginTierInfo = marginPct !== null ? marginTier(marginPct) : null

  useEffect(() => {
    if (showCode) {
      justOpenedCode.current = true
      loadCodeNotes()
      purgeOldApplied()
    }
  }, [showCode])

  // codeNotes 로딩 완료 후 draft 복원 (패널 열릴 때만)
  useEffect(() => {
    if (!showCode || !justOpenedCode.current) return
    justOpenedCode.current = false
    const pending = codeNotes.find(n => !n.applied_at)
    if (pending) {
      setDraftId(pending.id)
      setDraftContent(pending.content)
    } else {
      setDraftId(null)
      setDraftContent('1. ')
    }
    // 가장 최근 반영 항목만 자동 펼치기
    const latestApplied = codeNotes.filter(n => !!n.applied_at)[0]
    if (latestApplied) setExpandedNoteId(latestApplied.id)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    })
  }, [codeNotes])

  // 메모장 — 패널 열릴 때 최초 1회 로드, 이후엔 그대로 유지
  useEffect(() => {
    if (showMemo && !memoLoaded.current) {
      memoLoaded.current = true
      loadMemo()
    }
  }, [showMemo])

  async function loadMemo() {
    const { data } = await supabase.from('memos').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (data) { setMemoId(data.id); setMemoContent(data.content ?? '') }
  }

  async function saveMemo(content: string) {
    setMemoSaving(true)
    if (memoId) {
      const { data } = await supabase.from('memos').update({ content, updated_at: new Date().toISOString() }).eq('id', memoId).select().single()
      if (data) setMemoId(data.id)
    } else {
      const { data } = await supabase.from('memos').insert({ content }).select().single()
      if (data) setMemoId(data.id)
    }
    setMemoSaving(false)
    setMemoSavedFlash(true)
    setTimeout(() => setMemoSavedFlash(false), 1200)
  }

  function handleMemoChange(v: string) {
    setMemoContent(v)
    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current)
    memoSaveTimer.current = setTimeout(() => saveMemo(v), 800)
  }

  function setWidth(w: string) {
    setMaxWidth(w)
    localStorage.setItem('sb_width', w)
    setShowWidthMenu(false)
  }

  async function loadLogs() {
    const { data } = await supabase.from('action_logs').select('*')
      .order('created_at', { ascending: false }).limit(60)
    if (data) setLogs(data as ActionLog[])
  }

  async function undoAction(log: ActionLog) {
    setUndoing(log.id)
    try {
      if (log.action_type === 'insert' && log.record_id)
        await supabase.from(log.table_name).delete().eq('id', log.record_id)
      else if (log.action_type === 'delete' && log.before_data)
        await supabase.from(log.table_name).insert(log.before_data)
      else if (log.action_type === 'update' && log.before_data && log.record_id)
        await supabase.from(log.table_name).update(log.before_data).eq('id', log.record_id)
      // 입금/출금과 함께 생성된 cashflow도 같이 삭제
      if (log.cashflow_id)
        await supabase.from('cashflows').delete().eq('id', log.cashflow_id)
      await supabase.from('action_logs').delete().eq('id', log.id)
      setLogs(p => p.filter(l => l.id !== log.id))
      window.location.reload()
    } catch (e) { alert('되돌리기 실패: ' + String(e)) }
    setUndoing(null)
  }

  async function loadCodeNotes() {
    const { data } = await supabase.from('code_notes').select('*')
      .order('created_at', { ascending: false })
    if (data) setCodeNotes(data as CodeNote[])
  }

  async function saveDraft(content: string, quiet = false) {
    if (!content.trim()) return
    if (!quiet) setSaving(true)
    if (draftId) {
      const { data } = await supabase.from('code_notes').update({ content }).eq('id', draftId).select().single()
      if (data) setCodeNotes(p => p.map(n => n.id === draftId ? data as CodeNote : n))
    } else {
      const { data } = await supabase.from('code_notes').insert({ content }).select().single()
      if (data) {
        setDraftId((data as CodeNote).id)
        setCodeNotes(p => [data as CodeNote, ...p])
      }
    }
    if (!quiet) {
      setSaving(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      // 3. 저장 버튼 클릭 시 패널 자동 닫기
      setShowCode(false)
    }
  }

  // 2. 반영목록 하루 지난 항목 자동 삭제
  async function purgeOldApplied() {
    const cutoff = dayjs().subtract(1, 'day').toISOString()
    const { data } = await supabase.from('code_notes')
      .select('id')
      .not('applied_at', 'is', null)
      .lt('applied_at', cutoff)
    if (data && data.length > 0) {
      const ids = data.map((r: { id: string }) => r.id)
      await supabase.from('code_notes').delete().in('id', ids)
      setCodeNotes(p => p.filter(n => !ids.includes(n.id)))
    }
  }

  function handleDraftChange(v: string) {
    setDraftContent(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveDraft(v, true), 1500)
  }

  function handleDraftBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveDraft(draftContent, true)
  }

  async function applyNote() {
    if (!draftContent.trim()) return
    setApplying(true)
    let noteId = draftId
    if (!noteId) {
      const { data } = await supabase.from('code_notes').insert({ content: draftContent }).select().single()
      if (!data) { setApplying(false); return }
      noteId = (data as CodeNote).id
    }
    const now = new Date().toISOString()
    const { data } = await supabase.from('code_notes')
      .update({ applied_at: now, applied_content: draftContent })
      .eq('id', noteId).select().single()
    if (data) {
      try { await navigator.clipboard.writeText(draftContent) } catch { /* 무시 */ }
      setCopiedId(noteId)
      setTimeout(() => setCopiedId(null), 2000)
      setCodeNotes(p => p.map(n => n.id === noteId ? data as CodeNote : n))
      setDraftId(null)
      setDraftContent('1. ')
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length }
      })
    }
    setApplying(false)
  }

  const pending = codeNotes.find(n => !n.applied_at)
  const applied = codeNotes.filter(n => !!n.applied_at)
  const currentLabel = WIDTH_OPTIONS.find(o => o.value === maxWidth)?.label ?? '전체'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className="nav">
        <div className="nav-inner" style={{ maxWidth, margin: '0 auto', width: '100%' }}>
          <div className="nav-logo">SongBet</div>
          <div className="nav-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>

            {/* 마진율 계산기 버튼 */}
            <button onClick={() => { setShowMargin(p => !p); if (showCode) setShowCode(false); if (showLog) setShowLog(false); if (showTodo) setShowTodo(false) }} style={{
              background: showMargin ? 'var(--gold-bg)' : 'transparent',
              border: `1px solid ${showMargin ? 'var(--gold-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: showMargin ? 'var(--gold)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
            }}>
              <Percent size={13} />마진율
            </button>

            {/* 오늘 할 일 버튼 */}
<<<<<<< HEAD
            <button onClick={() => { setShowTodo(p => !p); if (showCode) setShowCode(false); if (showLog) setShowLog(false); if (showMargin) setShowMargin(false) }} style={{
=======
            <button onClick={() => { setShowTodo(p => !p); if (showCode) setShowCode(false); if (showLog) setShowLog(false); if (showMemo) setShowMemo(false) }} style={{
>>>>>>> 22b24436488e9b88c464513c73306be4a38f7d0f
              background: showTodo ? 'rgba(245,166,35,0.15)' : 'transparent',
              border: `1px solid ${showTodo ? 'var(--gold-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              color: showTodo ? 'var(--gold)' : 'var(--text-secondary)',
              position: 'relative',
            }}>
              <CheckSquare size={13} />
              {uncheckedCount > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  background: 'var(--red)', color: '#fff',
                  borderRadius: '50%', fontSize: 9, fontWeight: 800,
                  width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}>{uncheckedCount}</span>
              )}
            </button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowWidthMenu(p => !p)} style={{
                background: showWidthMenu ? 'var(--gold-bg)' : 'transparent',
                border: `1px solid ${showWidthMenu ? 'var(--gold-border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', color: showWidthMenu ? 'var(--gold)' : 'var(--text-secondary)',
                cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}>
                <LayoutTemplate size={13} />{currentLabel}
              </button>
              {showWidthMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowWidthMenu(false)} />
                  <div style={{ position: 'absolute', top: 32, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 160, overflow: 'hidden', minWidth: 110 }}>
                    {WIDTH_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setWidth(o.value)} style={{
                        display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                        background: maxWidth === o.value ? 'var(--gold-bg)' : 'none',
                        border: 'none', borderBottom: '1px solid var(--border-light)',
                        color: maxWidth === o.value ? 'var(--gold)' : 'var(--text-primary)',
                        cursor: 'pointer', fontSize: 12, fontWeight: maxWidth === o.value ? 700 : 400,
                        fontFamily: 'var(--font-body)',
                      }}>
                        {o.label}
                        {maxWidth === o.value && <span style={{ marginLeft: 6, fontSize: 10 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 메모장 버튼 */}
            <button onClick={() => { setShowMemo(p => !p); if (showCode) setShowCode(false); if (showLog) setShowLog(false); if (showTodo) setShowTodo(false) }} style={{
              background: showMemo ? 'var(--purple-bg)' : 'transparent',
              border: `1px solid ${showMemo ? 'var(--purple-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: showMemo ? 'var(--purple)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
            }}>
              <StickyNote size={13} />메모
            </button>

            {/* 코드 수정 버튼 */}
<<<<<<< HEAD
            <button onClick={() => { setShowCode(p => !p); if (showLog) setShowLog(false); if (showTodo) setShowTodo(false); if (showMargin) setShowMargin(false) }} style={{
=======
            <button onClick={() => { setShowCode(p => !p); if (showLog) setShowLog(false); if (showTodo) setShowTodo(false); if (showMemo) setShowMemo(false) }} style={{
>>>>>>> 22b24436488e9b88c464513c73306be4a38f7d0f
              background: showCode ? 'var(--cyan-bg)' : 'transparent',
              border: `1px solid ${showCode ? 'var(--cyan-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: showCode ? 'var(--cyan)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
            }}>
              <Code2 size={13} />코드수정
            </button>

            {/* LOG 버튼 — 숫자 뱃지 제거 */}
<<<<<<< HEAD
            <button onClick={() => { setShowLog(p => !p); if (showCode) setShowCode(false); if (showTodo) setShowTodo(false); if (showMargin) setShowMargin(false) }} style={{
=======
            <button onClick={() => { setShowLog(p => !p); if (showCode) setShowCode(false); if (showTodo) setShowTodo(false); if (showMemo) setShowMemo(false) }} style={{
>>>>>>> 22b24436488e9b88c464513c73306be4a38f7d0f
              background: showLog ? 'var(--gold-bg)' : 'transparent',
              border: `1px solid ${showLog ? 'var(--gold-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: showLog ? 'var(--gold)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
            }}>
              <ClipboardList size={13} />LOG
            </button>
          </div>
        </div>
      </nav>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth, minWidth: 0 }}>
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'stats' && <Stats />}
          {tab === 'settlement' && <Settlement />}
        </div>
      </div>

      {/* 코드 수정 패널 */}
      {showCode && (
        <>
          {!pinCode && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowCode(false)} />}
          <div style={{
            position: 'fixed', top: 56, right: 16, width: 340,
            maxHeight: 'calc(100vh - 72px)',
            background: 'var(--bg-card)', border: '1px solid var(--cyan-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            zIndex: 160, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--cyan)' }}>코드 수정 메모</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setPinCode(p => !p)}
                  title={pinCode ? '고정 해제' : '항상 위에 고정'}
                  style={{
                    background: pinCode ? 'var(--cyan-bg)' : 'none',
                    border: `1px solid ${pinCode ? 'var(--cyan-border)' : 'var(--border)'}`,
                    borderRadius: 4, cursor: 'pointer', color: pinCode ? 'var(--cyan)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', padding: '2px 5px', gap: 3,
                    fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)',
                  }}>
                  <Pin size={10} /> {pinCode ? '고정중' : '고정'}
                </button>
                <button onClick={() => { setShowCode(false); setPinCode(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={12} /></button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* 편집 영역 */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <textarea
                  ref={textareaRef}
                  value={draftContent}
                  onChange={e => handleDraftChange(e.target.value)}
                  onBlur={handleDraftBlur}
                  onKeyDown={e => handleNumberedEnter(e, draftContent, handleDraftChange)}
                  placeholder={'1. 수정할 내용 입력\n2. 엔터 시 번호 자동 증가'}
                  style={{
                    width: '100%', minHeight: 260, resize: 'vertical',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.7,
                    padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--cyan)' }}
                  onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                {/* 저장 / 반영 버튼 행 */}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => saveDraft(draftContent)}
                    disabled={!draftContent.trim() || saving}
                    style={{
                      flex: 1, padding: '7px 0',
                      background: savedFlash ? 'var(--green-bg)' : (draftContent.trim() ? 'var(--bg-elevated)' : 'var(--bg-elevated)'),
                      border: `1px solid ${savedFlash ? 'var(--green-border)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      color: savedFlash ? 'var(--green)' : (draftContent.trim() ? 'var(--text-secondary)' : 'var(--text-muted)'),
                      cursor: draftContent.trim() ? 'pointer' : 'not-allowed',
                      fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      transition: 'all 0.15s',
                    }}>
                    {savedFlash ? <><Check size={11} />저장됨</> : saving ? '저장중...' : <><Save size={11} />저장</>}
                  </button>
                  <button
                    onClick={applyNote}
                    disabled={!draftContent.trim() || applying}
                    style={{
                      flex: 1, padding: '7px 0',
                      background: draftContent.trim() ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
                      border: `1px solid ${draftContent.trim() ? 'var(--cyan-border)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      color: draftContent.trim() ? 'var(--cyan)' : 'var(--text-muted)',
                      cursor: draftContent.trim() ? 'pointer' : 'not-allowed',
                      fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      transition: 'all 0.15s',
                    }}>
                    {applying ? '처리중...' : copiedId === (draftId ?? '_') ? <><Check size={11} />복사됨!</> : '반영'}
                  </button>
                </div>
              </div>

              {/* 반영 목록 */}
              {applied.length > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => setCollapsedApplied(p => !p)}
                    style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>반영 목록 ({applied.length})</span>
                    {collapsedApplied ? <ChevronDown size={11} color="var(--text-muted)" /> : <ChevronUp size={11} color="var(--text-muted)" />}
                  </button>
                  {!collapsedApplied && applied.map(note => {
                    const isExpanded = expandedNoteId === note.id
                    return (
                      <div key={note.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        {/* 항목 헤더 — 클릭으로 펼치기/접기 */}
                        <button
                          onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                          style={{ width: '100%', background: isExpanded ? 'var(--bg-elevated)' : 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{dayjs(note.applied_at!).format('MM/DD HH:mm')}</span>
                          {isExpanded ? <ChevronUp size={10} color="var(--text-muted)" /> : <ChevronDown size={10} color="var(--text-muted)" />}
                        </button>
                        {/* 펼쳐진 내용 */}
                        {isExpanded && (
                          <div style={{ padding: '0 14px 10px' }}>
                            <pre style={{
                              fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                              fontFamily: 'var(--font-body)',
                            }}>
                              {note.applied_content}
                            </pre>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                try { await navigator.clipboard.writeText(note.applied_content ?? '') } catch { /* 무시 */ }
                                setCopiedId(note.id)
                                setTimeout(() => setCopiedId(null), 2000)
                              }}
                              style={{ marginTop: 6, fontSize: 9, fontWeight: 700, color: copiedId === note.id ? 'var(--green)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
                              {copiedId === note.id ? <><Check size={9} />복사됨</> : '복사'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 마진율 계산기 패널 — 코드 수정 메모 패널의 좌측에 위치 */}
      {showMargin && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowMargin(false)} />
          <div style={{
            position: 'fixed', top: 56, right: 372, width: 270,
            background: 'var(--bg-card)', border: '1px solid var(--gold-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            zIndex: 160, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--gold)' }}>마진율 계산기</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setMarginCount(p => p === 2 ? 3 : 2)}
                  title="배당 칸 수 전환 (2구/3구)"
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                    color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 7px',
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)',
                  }}>
                  {marginCount}구
                </button>
                <button onClick={resetMargin} title="초기화" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  <RotateCcw size={12} />
                </button>
                <button onClick={() => setShowMargin(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={12} /></button>
              </div>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Array.from({ length: marginCount }).map((_, i) => (
                <input
                  key={i}
                  ref={el => { marginInputRefs.current[i] = el }}
                  className="form-input"
                  type="text"
                  inputMode="decimal"
                  placeholder={`배당 ${i + 1} (예: 124 → 1.24)`}
                  value={marginOdds[i]}
                  onChange={e => handleMarginOddsChange(i, e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', textAlign: 'center', fontSize: 14 }}
                  autoFocus={i === 0}
                />
              ))}

              <div style={{
                marginTop: 4, padding: '12px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'center',
                background: marginTierInfo?.bg ?? 'var(--bg-elevated)',
                border: `1px solid ${marginTierInfo?.border ?? 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>
                {marginPct !== null && marginTierInfo ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-num)', color: marginTierInfo.color, lineHeight: 1.2 }}>
                      {marginPct.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: marginTierInfo.color, marginTop: 3 }}>
                      {marginTierInfo.label}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>배당을 모두 입력하세요</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 오늘 할 일 패널 */}
      {showTodo && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowTodo(false)} />
          <div style={{
            position: 'fixed', top: 56, right: 16, width: 300,
            maxHeight: 'calc(100vh - 72px)',
            background: 'var(--bg-card)', border: '1px solid var(--gold-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            zIndex: 160, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--gold)' }}>오늘 할 일</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {todos.filter(t => t.check_dates.includes(todayStr)).length}/{todos.length}
                </span>
                <button onClick={() => setShowTodo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={12} /></button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {todos.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>할 일이 없습니다</div>
              )}
              {todos.map(todo => {
                const isChecked = todo.check_dates.includes(todayStr)
                const isSettingsOpen = todoSettingsId === todo.id
                return (
                  <div key={todo.id} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border-light)' }}>
                      {/* 드래그 전용 핸들 — 텍스트/체크박스 클릭과 분리해서 순서 이동은 여기서만 */}
                      <span
                        draggable
                        onDragStart={() => { todoDragId.current = todo.id }}
                        onDragOver={e => { e.preventDefault(); todoOverId.current = todo.id }}
                        onDragEnd={() => {
                          if (todoDragId.current && todoOverId.current && todoDragId.current !== todoOverId.current)
                            reorderTodosApp(todoDragId.current, todoOverId.current)
                          todoDragId.current = ''; todoOverId.current = ''
                        }}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'grab', color: 'var(--text-muted)', flexShrink: 0 }}
                      >
                        <GripVertical size={13} />
                      </span>
                      <button
                        onClick={() => toggleTodoApp(todo)}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                          background: isChecked ? 'var(--green)' : 'transparent',
                          border: `2px solid ${isChecked ? 'var(--green)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}>
                        {isChecked && <Check size={10} color="#000" strokeWidth={3} />}
                      </button>
                      {/* 글자 영역 클릭으로도 체크 토글 */}
                      <span
                        onClick={() => toggleTodoApp(todo)}
                        style={{ flex: 1, fontSize: 13, color: isChecked ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: isChecked ? 'line-through' : 'none', cursor: 'pointer', userSelect: 'none' }}>
                        {todo.content}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                        {todo.check_count}회
                      </span>
                      <button
                        onClick={e => {
                          if (isSettingsOpen) { setTodoSettingsId(null); return }
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTodoSettingsPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                          setTodoSettingsId(todo.id)
                        }}
                        style={{ background: isSettingsOpen ? 'var(--bg-elevated)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 3, borderRadius: 4, flexShrink: 0 }}>
                        <Settings size={11} />
                      </button>
                    </div>
                    {/* 설정 팝업 — fixed로 화면 기준 위치 */}
                    {isSettingsOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={() => setTodoSettingsId(null)} />
                        <div style={{
                          position: 'fixed', top: todoSettingsPos.top, right: todoSettingsPos.right, zIndex: 310,
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                          minWidth: 220, padding: '8px 0',
                        }} onClick={e => e.stopPropagation()}>
                          {/* 달력 */}
                          <div style={{ padding: '4px 12px 8px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>달력</div>
                            <MiniCalendarApp checkedDates={todo.check_dates} onToggle={d => toggleCalDateApp(todo, d)} />
                          </div>
                          <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
                          {/* 초기화 */}
                          <button
                            onClick={() => { resetTodoApp(todo); setTodoSettingsId(null) }}
                            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-body)', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <RotateCcw size={12} color="var(--gold)" /> 초기화
                          </button>
                          {/* 삭제 */}
                          <button
                            onClick={() => { deleteTodoApp(todo.id); setTodoSettingsId(null) }}
                            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-body)', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <Trash2 size={12} /> 삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {/* 추가 입력 */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 6 }}>
              <input
                style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none' }}
                placeholder="할 일 추가..."
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTodoApp()}
              />
              <button onClick={addTodoApp} style={{ background: 'var(--gold)', border: 'none', borderRadius: 7, padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Plus size={14} color="#000" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* LOG 패널 */}
      {showLog && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowLog(false)} />
          <div style={{ position: 'fixed', top: 56, right: 16, width: 300, maxHeight: 460, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 160, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Action Log</span>
              <button onClick={() => setShowLog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={12} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {logs.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>로그 없음</div>}
              {logs.map(log => (
                <div key={log.id} style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}>{log.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{dayjs(log.created_at).format('MM/DD HH:mm')}</div>
                  <button disabled={undoing === log.id} onClick={() => undoAction(log)} style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: undoing === log.id ? 'var(--text-secondary)' : 'var(--gold)', cursor: undoing === log.id ? 'not-allowed' : 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-body)', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <RotateCcw size={9} />{undoing === log.id ? '처리중...' : '되돌리기'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 메모장 패널 */}
      {showMemo && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowMemo(false)} />
          <div style={{
            position: 'fixed', top: 56, right: 16, width: 320,
            maxHeight: 'calc(100vh - 72px)',
            background: 'var(--bg-card)', border: '1px solid var(--purple-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            zIndex: 160, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--purple)' }}>메모장</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: memoSavedFlash ? 'var(--green)' : 'var(--text-secondary)' }}>
                  {memoSaving ? '저장중...' : memoSavedFlash ? '저장됨' : ''}
                </span>
                <button onClick={() => setShowMemo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={12} /></button>
              </div>
            </div>
            <textarea
              value={memoContent}
              onChange={e => handleMemoChange(e.target.value)}
              placeholder="메모를 입력하세요..."
              style={{
                flex: 1, minHeight: 260, resize: 'vertical', border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                fontSize: 13, lineHeight: 1.5, padding: '12px 14px',
              }}
              autoFocus
            />
          </div>
        </>
      )}
    </div>
  )
}

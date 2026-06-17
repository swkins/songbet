import { useState, useEffect, useRef } from 'react'
import type { Tab, ActionLog } from './types'
import Dashboard from './pages/Dashboard'
import Settlement from './pages/Settlement'
import Stats from './pages/Stats'
import { supabase } from './lib/supabase'
import { purgeOldLogs } from './lib/logger'
import dayjs from 'dayjs'
import { RotateCcw, ClipboardList, X, LayoutTemplate, Code2, Check, ChevronDown, ChevronUp, Save } from 'lucide-react'

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

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [showLog, setShowLog] = useState(false)
  const [showWidthMenu, setShowWidthMenu] = useState(false)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [maxWidth, setMaxWidth] = useState<string>(() => localStorage.getItem('sb_width') ?? '1920px')

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    })
  }, [codeNotes])

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

            {/* 화면폭 설정 */}
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

            {/* 코드 수정 버튼 */}
            <button onClick={() => { setShowCode(p => !p); if (showLog) setShowLog(false) }} style={{
              background: showCode ? 'var(--cyan-bg)' : 'transparent',
              border: `1px solid ${showCode ? 'var(--cyan-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: showCode ? 'var(--cyan)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
            }}>
              <Code2 size={13} />코드수정
            </button>

            {/* LOG 버튼 — 숫자 뱃지 제거 */}
            <button onClick={() => { setShowLog(p => !p); if (showCode) setShowCode(false) }} style={{
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
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setShowCode(false)} />
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
              <button onClick={() => setShowCode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={12} /></button>
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
                  {!collapsedApplied && applied.map(note => (
                    <div key={note.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{dayjs(note.applied_at!).format('MM/DD HH:mm')}</span>
                        <button
                          onClick={async () => {
                            try { await navigator.clipboard.writeText(note.applied_content ?? '') } catch { /* 무시 */ }
                            setCopiedId(note.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                          style={{ fontSize: 9, fontWeight: 700, color: copiedId === note.id ? 'var(--green)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
                          {copiedId === note.id ? <><Check size={9} />복사됨</> : '복사'}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 80, overflow: 'hidden', maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
                        {note.applied_content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
    </div>
  )
}

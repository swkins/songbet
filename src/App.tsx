import { useState, useEffect, useRef } from 'react'
import type { Tab, ActionLog } from './types'
import Dashboard from './pages/Dashboard'
import Settlement from './pages/Settlement'
import Stats from './pages/Stats'
import { supabase } from './lib/supabase'
import { purgeOldLogs } from './lib/logger'
import dayjs from 'dayjs'
import { RotateCcw, ClipboardList, X, LayoutTemplate, Code2, Check, ChevronDown, ChevronUp } from 'lucide-react'

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
  const [draftId, setDraftId] = useState<string | null>(null)   // 현재 편집 중인 미반영 note id (null = 새 항목)
  const [applying, setApplying] = useState<string | null>(null)
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

  useEffect(() => {
    if (showCode) loadCodeNotes()
  }, [showCode])

  // 패널 열릴 때 미반영 draft 복원
  useEffect(() => {
    if (!showCode) return
    const pending = codeNotes.find(n => !n.applied_at)
    if (pending) {
      setDraftId(pending.id)
      setDraftContent(pending.content)
    } else {
      setDraftId(null)
      setDraftContent('')
    }
  }, [showCode, codeNotes.length])

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

  // draft 자동저장 (blur or 타이머)
  async function saveDraft(content: string) {
    if (!content.trim()) return
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
  }

  function handleDraftChange(v: string) {
    setDraftContent(v)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveDraft(v), 1500)
  }

  function handleDraftBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveDraft(draftContent)
  }

  // 반영 버튼
  async function applyNote() {
    if (!draftContent.trim()) return
    setApplying('applying')
    let noteId = draftId
    // 없으면 먼저 저장
    if (!noteId) {
      const { data } = await supabase.from('code_notes').insert({ content: draftContent }).select().single()
      if (!data) { setApplying(null); return }
      noteId = (data as CodeNote).id
    }
    const now = new Date().toISOString()
    const { data } = await supabase.from('code_notes')
      .update({ applied_at: now, applied_content: draftContent })
      .eq('id', noteId).select().single()
    if (data) {
      // 클립보드 복사
      try { await navigator.clipboard.writeText(draftContent) } catch { /* 무시 */ }
      setCopiedId(noteId)
      setTimeout(() => setCopiedId(null), 2000)
      setCodeNotes(p => p.map(n => n.id === noteId ? data as CodeNote : n))
      // draft 초기화 (다음 항목 새로 작성)
      setDraftId(null)
      setDraftContent('')
    }
    setApplying(null)
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

            {/* LOG 버튼 */}
            <button onClick={() => { setShowLog(p => !p); if (showCode) setShowCode(false) }} style={{
              background: showLog ? 'var(--gold-bg)' : 'transparent',
              border: `1px solid ${showLog ? 'var(--gold-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', color: showLog ? 'var(--gold)' : 'var(--text-secondary)',
              cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s', position: 'relative',
            }}>
              <ClipboardList size={13} />LOG
              {logs.length > 0 && (
                <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--gold)', color: '#000', borderRadius: '50%', width: 15, height: 15, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {logs.length > 99 ? '99' : logs.length}
                </span>
              )}
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
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>수정 내용</span>
                  {pending && draftId === pending.id && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>자동저장됨</span>
                  )}
                </div>
                <textarea
                  ref={textareaRef}
                  value={draftContent}
                  onChange={e => handleDraftChange(e.target.value)}
                  onBlur={handleDraftBlur}
                  placeholder={'수정할 내용을 입력하세요.\n\n예시:\n- Dashboard.tsx: 베팅 추가 버튼 색상 변경\n- App.tsx: 기본 폭 1920px로 수정'}
                  style={{
                    width: '100%', minHeight: 160, resize: 'vertical',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.6,
                    padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--cyan)' }}
                  onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                />
                <button
                  onClick={applyNote}
                  disabled={!draftContent.trim() || applying === 'applying'}
                  style={{
                    marginTop: 8, width: '100%', padding: '8px 0',
                    background: draftContent.trim() ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
                    border: `1px solid ${draftContent.trim() ? 'var(--cyan-border)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)', color: draftContent.trim() ? 'var(--cyan)' : 'var(--text-muted)',
                    cursor: draftContent.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all 0.15s',
                  }}>
                  {applying === 'applying' ? '처리중...' : copiedId && copiedId === draftId ? <><Check size={12} /> 복사됨!</> : '반영'}
                </button>
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

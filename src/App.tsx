import { useState, useEffect } from 'react'
import type { Tab, ActionLog } from './types'
import Dashboard from './pages/Dashboard'
import Settlement from './pages/Settlement'
import Stats from './pages/Stats'
import { supabase } from './lib/supabase'
import { purgeOldLogs } from './lib/logger'
import dayjs from 'dayjs'
import { RotateCcw, ClipboardList, X, LayoutTemplate } from 'lucide-react'

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

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [showLog, setShowLog] = useState(false)
  const [showWidthMenu, setShowWidthMenu] = useState(false)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [maxWidth, setMaxWidth] = useState<string>(() => localStorage.getItem('sb_width') ?? '1920px')

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

            {/* LOG 버튼 */}
            <button onClick={() => setShowLog(p => !p)} style={{
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

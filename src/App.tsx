import { useState, useEffect } from 'react'
import type { Tab, ActionLog } from './types'
import Dashboard from './pages/Dashboard'
import Bets from './pages/Bets'
import Stats from './pages/Stats'
import { supabase } from './lib/supabase'
import { purgeOldLogs } from './lib/logger'
import dayjs from 'dayjs'
import { RotateCcw, ClipboardList, X } from 'lucide-react'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'bets', label: '베팅' },
  { id: 'stats', label: '통계' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [showLog, setShowLog] = useState(false)
  const [undoing, setUndoing] = useState<string | null>(null)

  useEffect(() => {
    loadLogs()
    purgeOldLogs()
    const t = setInterval(loadLogs, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const handler = () => loadLogs()
    window.addEventListener('log-updated', handler)
    return () => window.removeEventListener('log-updated', handler)
  }, [])

  async function loadLogs() {
    const { data } = await supabase
      .from('action_logs').select('*')
      .order('created_at', { ascending: false }).limit(60)
    if (data) setLogs(data as ActionLog[])
  }

  async function undoAction(log: ActionLog) {
    setUndoing(log.id)
    try {
      if (log.action_type === 'insert' && log.record_id) {
        await supabase.from(log.table_name).delete().eq('id', log.record_id)
      } else if (log.action_type === 'delete' && log.before_data) {
        await supabase.from(log.table_name).insert(log.before_data)
      } else if (log.action_type === 'update' && log.before_data && log.record_id) {
        await supabase.from(log.table_name).update(log.before_data).eq('id', log.record_id)
      }
      await supabase.from('action_logs').delete().eq('id', log.id)
      setLogs(p => p.filter(l => l.id !== log.id))
      window.location.reload()
    } catch (e) {
      alert('되돌리기 실패: ' + String(e))
    }
    setUndoing(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-logo">SongBet</div>
          <div className="nav-tabs">
            {TABS.map(t => (
              <button key={t.id}
                className={`nav-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {/* 로그 아이콘 - 우측 상단 */}
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setShowLog(p => !p)}
              style={{
                background: showLog ? 'var(--gold-bg)' : 'transparent',
                border: `1px solid ${showLog ? 'var(--gold-border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: showLog ? 'var(--gold)' : 'var(--text-secondary)',
                cursor: 'pointer', padding: '5px 10px',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
                transition: 'all 0.15s', position: 'relative',
              }}>
              <ClipboardList size={14} />
              LOG
              {logs.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  background: 'var(--gold)', color: '#000',
                  borderRadius: '50%', width: 16, height: 16,
                  fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {logs.length > 99 ? '99' : logs.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      <div style={{ flex: 1 }}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'bets' && <Bets />}
        {tab === 'stats' && <Stats />}
      </div>

      {/* 로그 드롭다운 패널 */}
      {showLog && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 150 }}
            onClick={() => setShowLog(false)}
          />
          <div style={{
            position: 'fixed', top: 56, right: 24,
            width: 320, maxHeight: 480,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            zIndex: 160,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--bg-elevated)',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Action Log
              </span>
              <button onClick={() => setShowLog(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                <X size={13} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {logs.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                  로그 없음
                </div>
              )}
              {logs.map(log => (
                <div key={log.id} style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}>{log.description}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {dayjs(log.created_at).format('MM/DD HH:mm')}
                  </div>
                  <button
                    disabled={undoing === log.id}
                    onClick={() => undoAction(log)}
                    style={{
                      marginTop: 5, fontSize: 10, fontWeight: 700,
                      color: undoing === log.id ? 'var(--text-secondary)' : 'var(--gold)',
                      cursor: undoing === log.id ? 'not-allowed' : 'pointer',
                      background: 'none', border: 'none',
                      fontFamily: 'var(--font-body)', padding: 0,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                    <RotateCcw size={9} />
                    {undoing === log.id ? '처리중...' : '되돌리기'}
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

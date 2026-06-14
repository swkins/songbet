import { useState, useEffect } from 'react'
import type { Tab, ActionLog } from './types'
import Dashboard from './pages/Dashboard'
import Bets from './pages/Bets'
import Stats from './pages/Stats'
import { supabase } from './lib/supabase'
import { purgeOldLogs } from './lib/logger'
import dayjs from 'dayjs'
import { RotateCcw } from 'lucide-react'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'bets', label: '베팅' },
  { id: 'stats', label: '통계' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [logs, setLogs] = useState<ActionLog[]>([])
  const [undoing, setUndoing] = useState<string | null>(null)

  useEffect(() => {
    loadLogs()
    purgeOldLogs()
    // 30초마다 로그 갱신
    const t = setInterval(loadLogs, 30000)
    return () => clearInterval(t)
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
      // 페이지 새로고침으로 상태 반영
      window.location.reload()
    } catch (e) {
      alert('되돌리기 실패: ' + String(e))
    }
    setUndoing(null)
  }

  // 외부에서 로그 추가 시 갱신하기 위해 이벤트 리스닝
  useEffect(() => {
    const handler = () => loadLogs()
    window.addEventListener('log-updated', handler)
    return () => window.removeEventListener('log-updated', handler)
  }, [])

  return (
    <div className="app-layout">
      <div className="app-main">
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
          </div>
        </nav>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'bets' && <Bets />}
        {tab === 'stats' && <Stats />}
      </div>

      {/* ── 우측 고정 로그 패널 ── */}
      <aside className="log-panel">
        <div className="log-panel-header">Action Log</div>
        <div className="log-list">
          {logs.length === 0 && (
            <div className="empty" style={{ padding: '20px 12px' }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>📋</div>
              로그 없음
            </div>
          )}
          {logs.map(log => (
            <div key={log.id} className="log-item">
              <div className="log-desc">{log.description}</div>
              <div className="log-time">{dayjs(log.created_at).format('MM/DD HH:mm')}</div>
              <button
                className="log-undo"
                disabled={undoing === log.id}
                onClick={() => undoAction(log)}>
                <RotateCcw size={9} />
                {undoing === log.id ? '처리중...' : '되돌리기'}
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

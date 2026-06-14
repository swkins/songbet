import { useState } from 'react'
import type { Tab } from './types'
import Dashboard from './pages/Dashboard'
import Bets from './pages/Bets'
import Stats from './pages/Stats'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'bets', label: '베팅' },
  { id: 'stats', label: '통계' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-logo">SongBet</div>
        <div className="nav-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'bets' && <Bets />}
      {tab === 'stats' && <Stats />}
    </div>
  )
}

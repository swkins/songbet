import { useState } from 'react'
import SoccerAnalysis from './analysis/SoccerAnalysis'

// '분석' 탭 — 종목별 서브메뉴를 갖는 컨테이너. 지금은 축구만 있지만,
// 나중에 다른 종목(야구/농구 등) 분석을 추가할 때 SUB_TABS에 항목만 늘리면 됨.
type AnalysisSubTab = 'soccer'
const SUB_TABS: { id: AnalysisSubTab; label: string }[] = [
  { id: 'soccer', label: '⚽ 축구' },
]

export default function AnalysisPage() {
  const [subTab, setSubTab] = useState<AnalysisSubTab>('soccer')

  return (
    <div className="page">
      <div className="page-title" style={{ marginBottom: 12 }}>분석</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
              border: `1px solid ${subTab === t.id ? 'var(--gold-border)' : 'var(--border)'}`,
              background: subTab === t.id ? 'var(--gold-bg)' : 'transparent',
              color: subTab === t.id ? 'var(--gold)' : 'var(--text-secondary)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'soccer' && <SoccerAnalysis />}
    </div>
  )
}

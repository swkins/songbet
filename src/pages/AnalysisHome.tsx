import { useState } from 'react'

// '분석' 탭 (결산 오른쪽) — 종목별 서브메뉴만 있는 빈 페이지.
// 각 종목 내용은 나중에 채운다. (기존 AnalysisPage.tsx·Analysis.tsx와는 별개)
type SportTab = 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'lol'
const SPORT_TABS: { id: SportTab; label: string }[] = [
  { id: 'soccer',     label: '⚽ 축구' },
  { id: 'baseball',   label: '⚾ 야구' },
  { id: 'basketball', label: '🏀 농구' },
  { id: 'volleyball', label: '🏐 배구' },
  { id: 'lol',        label: '🎮 LOL' },
]

export default function AnalysisHome() {
  const [tab, setTab] = useState<SportTab>('soccer')
  const current = SPORT_TABS.find(t => t.id === tab)!

  return (
    <div className="page">
      <div className="page-title" style={{ marginBottom: 12 }}>분석</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {SPORT_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
              border: `1px solid ${tab === t.id ? 'var(--gold-border)' : 'var(--border)'}`,
              background: tab === t.id ? 'var(--gold-bg)' : 'transparent',
              color: tab === t.id ? 'var(--gold)' : 'var(--text-secondary)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '40px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{current.label} 분석</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>준비 중입니다</div>
      </div>
    </div>
  )
}

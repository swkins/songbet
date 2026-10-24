import { useEffect } from 'react'
import BetAnalysisPanel from '../components/BetAnalysisPanel'

// 베팅분석 단독 화면 — 상단 '베팅분석' 버튼이 새 창(?view=analysis)으로 연다
export default function BetAnalysisPage() {
  useEffect(() => { document.title = 'SongBet 베팅분석' }, [])
  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <BetAnalysisPanel tabs={<span className="card-title" style={{ margin: 0 }}>베팅분석</span>} />
    </div>
  )
}

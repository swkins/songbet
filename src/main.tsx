import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// ?view=analysis — 베팅분석만 띄우는 새 창 (과거 경기 데이터가 커서 이 화면에서만 불러온다)
const BetAnalysisPage = lazy(() => import('./pages/BetAnalysisPage'))
const App = lazy(() => import('./App'))
const isAnalysis = new URLSearchParams(window.location.search).get('view') === 'analysis'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>{isAnalysis ? <BetAnalysisPage /> : <App />}</Suspense>
  </React.StrictMode>
)

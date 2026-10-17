import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import RulebookNotes from './pages/RulebookNotes'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* 대시보드 "룰북" 버튼이 ?view=rulebook 으로 새창을 띄운다 */}
    {new URLSearchParams(window.location.search).get('view') === 'rulebook' ? <RulebookNotes /> : <App />}
  </React.StrictMode>
)

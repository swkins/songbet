import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LeagueManage from './pages/LeagueManage'
import './index.css'

const STRUCTURED_SPORTS = ['soccer', 'baseball', 'basketball', 'volleyball', 'esports'] as const
type StructuredSport = typeof STRUCTURED_SPORTS[number]

const leagueManageSport = new URLSearchParams(window.location.search).get('league_manage')
const isValidLeagueManageSport = (v: string | null): v is StructuredSport =>
  !!v && (STRUCTURED_SPORTS as readonly string[]).includes(v)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isValidLeagueManageSport(leagueManageSport) ? <LeagueManage sport={leagueManageSport} /> : <App />}
  </React.StrictMode>
)

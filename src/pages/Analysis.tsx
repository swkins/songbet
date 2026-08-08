import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import {
  SUPPORTED_LEAGUES, fetchRecentCompletedMatches, fetchEventGames, fetchGameDetailStats,
  type CompletedMatch, type GameDetailStats,
} from '../lib/lolResults'

const DRAGON_LABEL: Record<string, string> = {
  infernal: '화염', ocean: '바다', mountain: '대지', cloud: '바람',
  hextech: '헥스텍', chemtech: '화학공학', elder: '장로',
}

function DetailCard({ i, d }: { i: number; d: GameDetailStats | null }) {
  const [showRaw, setShowRaw] = useState(false)
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', fontSize: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 700 }}>
          {i + 1}세트{d?.durationSeconds ? ` · ${Math.floor(d.durationSeconds / 60)}:${String(d.durationSeconds % 60).padStart(2, '0')}` : ''}
        </span>
        {d?.raw != null && (
          <button type="button" onClick={() => setShowRaw(p => !p)} style={{ fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            {showRaw ? '원본 숨기기' : '원본 보기'}
          </button>
        )}
      </div>
      {!d ? (
        <div style={{ color: 'var(--text-muted)' }}>상세 통계 없음 (라이브 통계 미제공 경기)</div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          킬 {d.teamA.kills} : {d.teamB.kills} · 타워 {d.teamA.towers} : {d.teamB.towers} · 억제기 {d.teamA.inhibitors} : {d.teamB.inhibitors} · 내셔 {d.teamA.barons} : {d.teamB.barons}
          <br />
          드래곤 {d.teamA.dragons} : {d.teamB.dragons}
          {(d.teamA.dragonTypes.length > 0 || d.teamB.dragonTypes.length > 0) && (
            <span style={{ color: 'var(--text-muted)' }}> ({[...d.teamA.dragonTypes, ...d.teamB.dragonTypes].map(t => DRAGON_LABEL[t] ?? t).join(', ')})</span>
          )}
          <br />
          골드 {(d.teamA.totalGold / 1000).toFixed(1)}k : {(d.teamB.totalGold / 1000).toFixed(1)}k
        </div>
      )}
      {showRaw && d?.raw != null && (
        <pre style={{ marginTop: 6, padding: 6, background: 'var(--bg-card)', borderRadius: 4, fontSize: 9, color: 'var(--text-muted)', overflowX: 'auto', maxHeight: 240, overflowY: 'auto' }}>
          {JSON.stringify(d.raw, null, 2)}
        </pre>
      )}
    </div>
  )
}

function MatchRow({ m }: { m: CompletedMatch }) {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState<(GameDetailStats | null)[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [noGames, setNoGames] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && details === null && !noGames) {
      setLoading(true)
      const games = (await fetchEventGames(m.id)).filter(g => g.state === 'completed').sort((a, b) => a.number - b.number)
      if (games.length === 0) { setNoGames(true); setLoading(false); return }
      const results = await Promise.all(games.map(g => fetchGameDetailStats(g.id)))
      setDetails(results.map((r, i) => r ? { ...r, gameNumber: games[i].number } : null))
      setLoading(false)
    }
  }

  const nameA = m.teamACode || m.teamA
  const nameB = m.teamBCode || m.teamB
  const aWon = m.scoreA > m.scoreB

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px', cursor: 'pointer' }}>
        {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 44, flexShrink: 0 }}>{dayjs(m.startTime).format('MM/DD')}</span>
        <span style={{ fontSize: 13, fontWeight: aWon ? 800 : 500, color: aWon ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1, textAlign: 'right' }}>{nameA}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', width: 40, textAlign: 'center' }}>{m.scoreA} : {m.scoreB}</span>
        <span style={{ fontSize: 13, fontWeight: !aWon ? 800 : 500, color: !aWon ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1 }}>{nameB}</span>
      </div>
      {open && (
        <div style={{ padding: '0 4px 12px 26px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {noGames && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>이 경기의 세트별 상세 통계는 제공되지 않습니다.</div>
          )}
          {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>세트별 상세 통계 불러오는 중...</div>}
          {!loading && details && details.map((d, i) => <DetailCard key={i} i={i} d={d} />)}
        </div>
      )}
    </div>
  )
}

export default function Analysis() {
  const [league, setLeague] = useState(SUPPORTED_LEAGUES[0].code)
  const [matches, setMatches] = useState<CompletedMatch[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  function load() {
    setLoading(true); setError(false); setMatches(null)
    fetchRecentCompletedMatches(league, 7)
      .then(setMatches)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [league])

  return (
    <div className="page">
      <div className="flex-between mb-16">
        <h1 className="page-title">분석</h1>
        <button className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <RefreshCw size={12} /> 새로고침
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {SUPPORTED_LEAGUES.map(l => (
          <button key={l.code} onClick={() => setLeague(l.code)}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
              border: `1px solid ${league === l.code ? 'var(--gold-border)' : 'var(--border)'}`,
              background: league === l.code ? 'var(--gold-bg)' : 'var(--bg-card)',
              color: league === l.code ? 'var(--gold)' : 'var(--text-secondary)',
            }}>{l.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>
          최근 완료 경기 <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>· 최근 7일 · Riot 공식 API 기준 · 항목을 누르면 세트별 상세 통계</span>
        </div>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>불러오는 중...</div>}
        {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '16px 0', textAlign: 'center' }}>일정을 불러오지 못했습니다</div>}
        {!loading && !error && matches && matches.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>최근 7일 안에 완료된 경기가 없습니다</div>
        )}
        {!loading && !error && matches && matches.length > 0 && (
          <div>
            {matches.map(m => <MatchRow key={m.id} m={m} />)}
          </div>
        )}
      </div>
    </div>
  )
}

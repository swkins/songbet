import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import {
  SUPPORTED_LEAGUES, fetchRecentCompletedMatches, fetchLiveMatch, fetchEventGames, fetchGameDetailStats,
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

function LiveTestPanel({ league }: { league: string }) {
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const [live, setLive] = useState<CompletedMatch | null>(null)
  const [detail, setDetail] = useState<GameDetailStats | null | 'none'>(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    setChecking(true); setChecked(false); setLive(null); setDetail(null)
    const m = await fetchLiveMatch(league).catch(() => null)
    setLive(m); setChecked(true); setChecking(false)
  }

  async function testDetail() {
    if (!live) return
    setLoading(true)
    const games = await fetchEventGames(live.id)
    const target = games.find(g => g.state === 'inProgress') ?? games[games.length - 1]
    if (!target) { setDetail('none'); setLoading(false); return }
    const d = await fetchGameDetailStats(target.id)
    setDetail(d)
    setLoading(false)
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>
        라이브 데이터 테스트 <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>· livestats API에 데이터가 애초에 존재하는지 확인용</span>
      </div>
      <button className="btn btn-ghost" onClick={check} disabled={checking} style={{ fontSize: 11, marginBottom: 8 }}>
        {checking ? '확인 중...' : `지금 ${SUPPORTED_LEAGUES.find(l => l.code === league)?.label} 라이브 경기 있는지 확인`}
      </button>
      {checked && !live && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>지금 이 리그에 라이브 경기가 없습니다. 다른 리그로 시도하거나, 경기 시간에 다시 확인해주세요.</div>}
      {live && (
        <div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>🔴 라이브: {live.teamACode || live.teamA} vs {live.teamBCode || live.teamB}</div>
          <button className="btn btn-primary" onClick={testDetail} disabled={loading} style={{ fontSize: 11, marginBottom: 8 }}>
            {loading ? '조회 중...' : '이 경기 실시간 통계 가져오기'}
          </button>
          {detail === 'none' && <div style={{ fontSize: 11, color: 'var(--red)' }}>진행 중인 게임 ID를 못 찾았습니다.</div>}
          {detail && detail !== 'none' && (
            <div style={{ fontSize: 11 }}>
              {detail.teamA.kills === 0 && detail.teamB.kills === 0 && detail.teamA.totalGold === 0 ? (
                <div style={{ color: 'var(--red)' }}>라이브인데도 전부 0으로 나옵니다 — 이 리그는 API에 상세 통계 자체가 없는 것으로 보입니다.</div>
              ) : (
                <div style={{ color: 'var(--green)' }}>✓ 실시간 데이터 확인됨 — 킬 {detail.teamA.kills}:{detail.teamB.kills} · 골드 {(detail.teamA.totalGold/1000).toFixed(1)}k:{(detail.teamB.totalGold/1000).toFixed(1)}k</div>
              )}
            </div>
          )}
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

      <LiveTestPanel league={league} />

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

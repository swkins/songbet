import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import { Plus, Trash2, ChevronLeft, ChevronDown, ChevronUp, ExternalLink, RefreshCw, TrendingUp, Users } from 'lucide-react'
import {
  LEAGUES, fetchScheduleEvents, extractTeamData, computeForm, matchupProbability,
  seriesScoreProbabilities, computeOddsValue, fetchStandings, fetchLeagueTeams, findTeamCode, teamNameMatches,
  type RawScheduleEvent, type StandingEntry,
} from '../lib/lolEsports'

interface EsportsTeam { id: string; league: string; name: string; comment: string; sort_order: number }
interface EsportsRosterPlayer {
  id: string; team_id: string; name: string; comment: string; sort_order: number
  role: string | null; nationality: string | null; joined_at: string | null; contract_until: string | null
  lolesports_player_id?: string | null
}
type RosterPatch = Partial<Pick<EsportsRosterPlayer, 'comment' | 'role' | 'nationality' | 'joined_at' | 'contract_until'>>

// ─── 공용 UI 조각 ──────────────────────────────────────────────────
function CommentBox({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setDraft(value) }, [value])
  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} style={{ fontSize: 11, color: value ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: 'text', padding: '4px 6px', borderRadius: 5, background: 'var(--bg-elevated)', minHeight: 18 }}>
        {value || placeholder}
      </div>
    )
  }
  return (
    <textarea
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
      style={{ width: '100%', fontSize: 11, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--gold-border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', resize: 'vertical', minHeight: 40 }}
    />
  )
}

// 선수 프로필의 짧은 한 줄 필드 (포지션/국적/합류일/계약기간) — 클릭하면 인라인 편집
function InlineField({ label, value, onSave, placeholder }: { label: string; value: string | null; onSave: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value ?? '')
  const [editing, setEditing] = useState(false)
  useEffect(() => { setDraft(value ?? '') }, [value])
  return (
    <div>
      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      {editing ? (
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft !== (value ?? '')) onSave(draft) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          style={{ width: '100%', fontSize: 11, padding: '3px 5px', borderRadius: 4, border: '1px solid var(--gold-border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        />
      ) : (
        <div onClick={() => setEditing(true)} style={{ fontSize: 11, color: value ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: 'text', padding: '3px 5px', borderRadius: 4, background: 'var(--bg-card)', minHeight: 16 }}>
          {value || placeholder}
        </div>
      )}
    </div>
  )
}

function TeamCodeBadge({ code }: { code: string | null }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 4, padding: '2px 5px', flexShrink: 0, letterSpacing: 0.3 }}>
      {code ?? '?'}
    </span>
  )
}

// ─── 좌측: 순위 + 최근 폼 점수 ────────────────────────────────────
function StandingsPanel({ leagueCode, events }: { leagueCode: string; events: RawScheduleEvent[] | null }) {
  const [standings, setStandings] = useState<StandingEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function load(forceRefresh?: boolean) {
    setLoading(true); setError(false)
    try {
      setStandings(await fetchStandings(leagueCode, { forceRefresh }))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [leagueCode])

  const rows = useMemo(() => {
    if (!standings) return []
    return standings.map(s => {
      const form = events ? computeForm(extractTeamData(events, s.name || s.code).completed.slice(0, 10)) : null
      const formScore = form && form.seriesPlayed > 0 ? Math.round((0.6 * form.gameWinRate + 0.4 * form.seriesWinRate) * 100) : null
      return { ...s, formScore }
    })
  }, [standings, events])

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>순위 · 최근 폼</div>
        <button onClick={() => load(true)} disabled={loading} style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
        </button>
      </div>
      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>순위 데이터를 가져올 수 없습니다.</div>}
      {!loading && !error && rows.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>진행 중인 스플릿 순위 정보가 없습니다.</div>}
      {!loading && !error && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((r, i) => (
            <div key={r.code + i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
              <span style={{ width: 14, color: 'var(--text-muted)', flexShrink: 0 }}>{r.ordinal}</span>
              <span style={{ width: 36, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{r.code || '?'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>{r.wins}승{r.losses}패</span>
              {r.formScore !== null && (
                <span style={{ width: 30, textAlign: 'right', flexShrink: 0, fontWeight: 800, color: r.formScore >= 55 ? 'var(--green)' : r.formScore <= 45 ? 'var(--red)' : 'var(--text-secondary)' }}>
                  {r.formScore}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>
        순위/승패는 공식 스탠딩, 폼 점수는 최근 10세트 기준 자체 계산치입니다.
      </div>
    </div>
  )
}

// ─── 중앙: 최근 경기 ────────────────────────────────────────────
function RecentMatchesPanel({ leagueCode, events, loading, error }: { leagueCode: string; events: RawScheduleEvent[] | null; loading: boolean; error: boolean }) {
  const matches = useMemo(() => {
    if (!events) return []
    return events
      .filter(e => e.state === 'completed' && e.match)
      .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
      .slice(0, 8)
      .map(e => {
        const teams = e.match!.teams ?? []
        return {
          id: e.match!.id ?? e.startTime, startTime: e.startTime,
          teamA: teams[0]?.name ?? '?', codeA: teams[0]?.code ?? '',
          teamB: teams[1]?.name ?? '?', codeB: teams[1]?.code ?? '',
          scoreA: teams[0]?.result?.gameWins ?? 0, scoreB: teams[1]?.result?.gameWins ?? 0,
        }
      })
  }, [events])

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>최근 경기</div>
        <a href={`https://lolesports.com/en-US/leagues/${leagueCode.toLowerCase()}`} target="_blank" rel="noreferrer"
          style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          lolesports.com <ExternalLink size={10} />
        </a>
      </div>
      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>최근 경기 데이터를 가져올 수 없습니다 (외부 API 접속 제한일 수 있음).</div>}
      {!loading && !error && matches.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>최근 완료된 경기가 없습니다</div>}
      {!loading && !error && matches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {matches.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 58 }}>{dayjs(m.startTime).format('MM/DD HH:mm')}</span>
              <span style={{ flex: 1, textAlign: 'right', fontWeight: m.scoreA > m.scoreB ? 800 : 400, color: m.scoreA > m.scoreB ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.codeA || m.teamA}</span>
              <span style={{ fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{m.scoreA} : {m.scoreB}</span>
              <span style={{ flex: 1, fontWeight: m.scoreB > m.scoreA ? 800 : 400, color: m.scoreB > m.scoreA ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.codeB || m.teamB}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 우측: 앞으로의 일정 + 승부 예측 ──────────────────────────────
function UpcomingRow({ event, events }: { event: RawScheduleEvent; events: RawScheduleEvent[] }) {
  const teams = event.match?.teams ?? []
  const teamA = teams[0], teamB = teams[1]
  const bestOf = event.match?.strategy?.count ?? 3
  const formA = useMemo(() => computeForm(extractTeamData(events, teamA?.name ?? '').completed.slice(0, 10)), [events, teamA?.name])
  const formB = useMemo(() => computeForm(extractTeamData(events, teamB?.name ?? '').completed.slice(0, 10)), [events, teamB?.name])
  const p = matchupProbability(formA, formB)
  const scoreProbs = seriesScoreProbabilities(p, bestOf)
  const top = scoreProbs[0]
  const topLabel = top.winner === 'A' ? (teamA?.code || teamA?.name) : (teamB?.code || teamB?.name)

  return (
    <div style={{ padding: '8px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)', width: 76, flexShrink: 0 }}>{dayjs(event.startTime).format('MM/DD HH:mm')}</span>
        <span style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>{teamA?.code || teamA?.name}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>BO{bestOf}</span>
        <span style={{ flex: 1, fontWeight: 700 }}>{teamB?.code || teamB?.name}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
        예측 승률 <b style={{ color: 'var(--text-secondary)' }}>{(p * 100).toFixed(0)}%</b> : <b style={{ color: 'var(--text-secondary)' }}>{((1 - p) * 100).toFixed(0)}%</b>
        {' · '}예상 스코어 <b style={{ color: 'var(--gold)' }}>{topLabel} {top.score}</b> ({(top.prob * 100).toFixed(0)}%)
      </div>
    </div>
  )
}

function UpcomingPanel({ events, loading, error }: { events: RawScheduleEvent[] | null; loading: boolean; error: boolean }) {
  const upcoming = useMemo(() => {
    if (!events) return []
    return events
      .filter(e => e.state === 'unstarted' && e.match)
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf())
      .slice(0, 8)
  }, [events])

  return (
    <div className="card">
      <div className="card-title">앞으로의 일정 · 승부 예측</div>
      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>일정 데이터를 가져올 수 없습니다.</div>}
      {!loading && !error && upcoming.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>예정된 경기가 없습니다</div>}
      {!loading && !error && upcoming.length > 0 && events && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {upcoming.map(e => <UpcomingRow key={e.match!.id ?? e.id} event={e} events={events} />)}
        </div>
      )}
    </div>
  )
}

// ─── 팀 카드 안: 경기 분석(다음 상대 예측 + 배당 가치) ────────────
function TeamAnalysisPanel({ teamName, events, loading, error }: {
  teamName: string; events: RawScheduleEvent[] | null; loading: boolean; error: boolean
}) {
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({})

  const { completed, upcoming } = useMemo(
    () => events ? extractTeamData(events, teamName) : { completed: [], upcoming: [] },
    [events, teamName]
  )
  const recentGames = completed.slice(0, 10)
  const form = useMemo(() => computeForm(recentGames), [recentGames])

  const next = upcoming[0]
  const oppRecentGames = useMemo(() => {
    if (!events || !next) return []
    return extractTeamData(events, next.opponent).completed.slice(0, 10)
  }, [events, next?.opponent])
  const oppForm = useMemo(() => computeForm(oppRecentGames), [oppRecentGames])

  const pMap = next ? matchupProbability(form, oppForm) : 0.5
  const scoreProbs = next ? seriesScoreProbabilities(pMap, next.bestOf) : []

  function setOdds(score: string, v: string) {
    setOddsInputs(p => ({ ...p, [score]: v }))
  }

  return (
    <div className="card" style={{ marginBottom: 10, background: 'var(--bg-elevated)' }}>
      <div className="card-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
        <TrendingUp size={11} /> 경기 분석
      </div>

      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>데이터를 가져올 수 없습니다 (외부 API 접속 제한일 수 있음).</div>}

      {!loading && !error && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              최근 전적{form.seriesPlayed > 0 && ` · 최근 ${form.seriesPlayed}세트 ${form.wins}승 ${form.losses}패 (시리즈 승률 ${(form.seriesWinRate * 100).toFixed(0)}% · 맵 승률 ${(form.gameWinRate * 100).toFixed(0)}%)`}
            </div>
            {recentGames.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>기록된 경기가 없습니다 (팀 이름이 lolesports 표기와 다를 수 있어요)</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentGames.map((g, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '5px 8px', background: 'var(--bg-card)', borderRadius: 6 }}>
                  <span style={{ color: 'var(--text-muted)', width: 50, flexShrink: 0 }}>{dayjs(g.startTime).format('MM/DD')}</span>
                  <span style={{ flex: 1 }}>vs {g.opponent}</span>
                  <span style={{ fontWeight: 800, color: g.teamScore > g.oppScore ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{g.teamScore} : {g.oppScore}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: next ? 12 : 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>앞으로의 일정</div>
            {upcoming.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>예정된 경기가 없습니다</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {upcoming.slice(0, 5).map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '5px 8px', background: 'var(--bg-card)', borderRadius: 6 }}>
                  <span style={{ color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>{dayjs(u.startTime).format('MM/DD HH:mm')}</span>
                  <span style={{ flex: 1 }}>vs {u.opponent}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>BO{u.bestOf}</span>
                </div>
              ))}
            </div>
          </div>

          {next && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                승부 예측 · vs {next.opponent} (BO{next.bestOf})
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                최근 폼 기준 세트 승률: <b style={{ color: 'var(--text-secondary)' }}>{teamName} {(pMap * 100).toFixed(0)}%</b> vs <b style={{ color: 'var(--text-secondary)' }}>{next.opponent} {((1 - pMap) * 100).toFixed(0)}%</b>
                {oppForm.seriesPlayed === 0 && ' · 상대팀 최근 기록 부족(50% 기준 적용)'}
                <br />배당을 입력하면 모델 확률 대비 기대값(EV)을 보여드려요. EV가 양수(초록)면 베팅 가치가 있다는 뜻입니다.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scoreProbs.map(sp => {
                  const label = sp.winner === 'A' ? `${teamName} ${sp.score}` : `${next.opponent} ${sp.score}`
                  const odds = parseFloat(oddsInputs[sp.score] ?? '')
                  const value = computeOddsValue(sp.prob, odds)
                  return (
                    <div key={sp.score + sp.winner} style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 8px', borderRadius: 6,
                      background: value?.isValue ? 'var(--green-bg)' : 'var(--bg-card)',
                      border: value?.isValue ? '1px solid var(--green-border)' : '1px solid transparent',
                    }}>
                      <span style={{ flex: 1, fontWeight: 700 }}>{label}</span>
                      <span style={{ width: 46, textAlign: 'right', color: 'var(--gold)', fontWeight: 800, flexShrink: 0 }}>{(sp.prob * 100).toFixed(1)}%</span>
                      <input
                        value={oddsInputs[sp.score] ?? ''}
                        onChange={e => setOdds(sp.score, e.target.value)}
                        placeholder="배당"
                        inputMode="decimal"
                        style={{ width: 54, fontSize: 11, padding: '3px 5px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', textAlign: 'right', flexShrink: 0 }}
                      />
                      {value && (
                        <span style={{ width: 62, textAlign: 'right', fontSize: 10, fontWeight: 700, color: value.isValue ? 'var(--green)' : 'var(--text-muted)', flexShrink: 0 }}>
                          {value.isValue ? `+EV ${value.edgePct.toFixed(1)}%` : `${value.edgePct.toFixed(1)}%`}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TeamCard({ team, roster, events, eventsLoading, eventsError, syncing, onSyncRoster, onAddPlayer, onSaveTeamComment, onUpdatePlayer, onDeletePlayer, onDeleteTeam }: {
  team: EsportsTeam
  roster: EsportsRosterPlayer[]
  events: RawScheduleEvent[] | null
  eventsLoading: boolean
  eventsError: boolean
  syncing: boolean
  onSyncRoster: (teamId: string, teamName: string) => void
  onAddPlayer: (teamId: string, name: string) => void
  onSaveTeamComment: (teamId: string, comment: string) => void
  onUpdatePlayer: (playerId: string, patch: RosterPatch) => void
  onDeletePlayer: (playerId: string) => void
  onDeleteTeam: (teamId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [newPlayer, setNewPlayer] = useState('')
  const code = useMemo(() => events ? findTeamCode(events, team.name) : null, [events, team.name])

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <TeamCodeBadge code={code} />
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{team.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{roster.length}명</span>
        <button onClick={e => { e.stopPropagation(); if (confirm(`${team.name} 팀을 삭제하시겠습니까? (로스터도 함께 삭제됩니다)`)) onDeleteTeam(team.id) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}>
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          <TeamAnalysisPanel teamName={team.name} events={events} loading={eventsLoading} error={eventsError} />
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>팀 코멘트</div>
            <CommentBox value={team.comment} onSave={v => onSaveTeamComment(team.id, v)} placeholder="팀에 대한 코멘트를 입력하세요..." />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>로스터</div>
            <button onClick={() => onSyncRoster(team.id, team.name)} disabled={syncing}
              className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users size={11} /> lolesports 로스터 동기화
              <RefreshCw size={10} style={{ animation: syncing ? 'spin 1s linear infinite' : undefined }} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {roster.map(p => (
              <div key={p.id} style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{p.name}</span>
                  <button onClick={() => onDeletePlayer(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <InlineField label="포지션" value={p.role} onSave={v => onUpdatePlayer(p.id, { role: v })} placeholder="TOP/JUG/MID/BOT/SUP" />
                  <InlineField label="국적" value={p.nationality} onSave={v => onUpdatePlayer(p.id, { nationality: v })} placeholder="예: KR" />
                  <InlineField label="합류일" value={p.joined_at} onSave={v => onUpdatePlayer(p.id, { joined_at: v })} placeholder="예: 2024-11" />
                  <InlineField label="계약기간" value={p.contract_until} onSave={v => onUpdatePlayer(p.id, { contract_until: v })} placeholder="예: 2026-11" />
                </div>
                <CommentBox value={p.comment} onSave={v => onUpdatePlayer(p.id, { comment: v })} placeholder="선수 코멘트..." />
              </div>
            ))}
            {roster.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>로스터가 없습니다. 위 "lolesports 로스터 동기화" 버튼으로 선수 명단(ID·포지션)을 자동으로 불러올 수 있어요.</div>}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
            국적·합류일·계약기간은 lolesports 공개 API에서 제공하지 않아 자동으로 채울 수 없습니다. 나무위키/Leaguepedia 등을 참고해 직접 입력해 주세요.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newPlayer} onChange={e => setNewPlayer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newPlayer.trim()) { onAddPlayer(team.id, newPlayer.trim()); setNewPlayer('') } }}
              placeholder="선수 이름 추가..." className="form-input" style={{ flex: 1, fontSize: 11, padding: '6px 8px' }} />
            <button onClick={() => { if (newPlayer.trim()) { onAddPlayer(team.id, newPlayer.trim()); setNewPlayer('') } }}
              className="btn btn-primary" style={{ padding: '6px 10px' }}>
              <Plus size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LeagueView({ code, label, onBack }: { code: string; label: string; onBack: () => void }) {
  const [teams, setTeams] = useState<EsportsTeam[]>([])
  const [roster, setRoster] = useState<EsportsRosterPlayer[]>([])
  const [newTeam, setNewTeam] = useState('')
  const [events, setEvents] = useState<RawScheduleEvent[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(false)
  const [syncingTeamId, setSyncingTeamId] = useState<string | null>(null)

  async function load() {
    const { data: teamData } = await supabase.from('esports_teams').select('*').eq('league', code).order('sort_order').order('created_at')
    const teamsList = (teamData as EsportsTeam[]) ?? []
    setTeams(teamsList)
    if (teamsList.length > 0) {
      const { data: rosterData } = await supabase.from('esports_roster').select('*').in('team_id', teamsList.map(t => t.id)).order('sort_order').order('created_at')
      setRoster((rosterData as EsportsRosterPlayer[]) ?? [])
    } else {
      setRoster([])
    }
  }
  async function loadEvents(forceRefresh?: boolean) {
    setEventsLoading(true); setEventsError(false)
    try {
      setEvents(await fetchScheduleEvents(code, { forceRefresh }))
    } catch {
      setEventsError(true)
    } finally {
      setEventsLoading(false)
    }
  }
  useEffect(() => { load(); loadEvents() }, [code])

  async function addTeam() {
    if (!newTeam.trim()) return
    const { data } = await supabase.from('esports_teams').insert({ league: code, name: newTeam.trim(), comment: '', sort_order: teams.length }).select().single()
    if (data) { setTeams(p => [...p, data as EsportsTeam]); setNewTeam('') }
  }
  async function deleteTeam(teamId: string) {
    await supabase.from('esports_teams').delete().eq('id', teamId)
    setTeams(p => p.filter(t => t.id !== teamId))
    setRoster(p => p.filter(r => r.team_id !== teamId))
  }
  async function saveTeamComment(teamId: string, comment: string) {
    const { data } = await supabase.from('esports_teams').update({ comment }).eq('id', teamId).select().single()
    if (data) setTeams(p => p.map(t => t.id === teamId ? data as EsportsTeam : t))
  }
  async function addPlayer(teamId: string, name: string) {
    const count = roster.filter(r => r.team_id === teamId).length
    const { data } = await supabase.from('esports_roster').insert({ team_id: teamId, name, comment: '', sort_order: count }).select().single()
    if (data) setRoster(p => [...p, data as EsportsRosterPlayer])
  }
  async function deletePlayer(playerId: string) {
    await supabase.from('esports_roster').delete().eq('id', playerId)
    setRoster(p => p.filter(r => r.id !== playerId))
  }
  async function updatePlayer(playerId: string, patch: RosterPatch) {
    const { data } = await supabase.from('esports_roster').update(patch).eq('id', playerId).select().single()
    if (data) setRoster(p => p.map(r => r.id === playerId ? data as EsportsRosterPlayer : r))
  }
  async function syncRoster(teamId: string, teamName: string) {
    setSyncingTeamId(teamId)
    try {
      const apiTeams = await fetchLeagueTeams(code)
      const match = apiTeams.find(t => teamNameMatches(t, teamName))
      if (!match) {
        alert(`lolesports에서 "${teamName}" 팀을 찾지 못했습니다. 저장된 팀 이름이 lolesports 표기와 다를 수 있어요.`)
        return
      }
      for (const p of match.players) {
        const displayName = (p.summonerName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) || '이름 없음'
        const existing = roster.find(r => r.team_id === teamId && r.lolesports_player_id === p.id)
        if (existing) {
          const { data } = await supabase.from('esports_roster').update({ name: displayName, role: p.role ?? null }).eq('id', existing.id).select().single()
          if (data) setRoster(prev => prev.map(r => r.id === existing.id ? data as EsportsRosterPlayer : r))
        } else {
          const count = roster.filter(r => r.team_id === teamId).length
          const { data } = await supabase.from('esports_roster').insert({
            team_id: teamId, name: displayName, comment: '', sort_order: count, role: p.role ?? null, lolesports_player_id: p.id,
          }).select().single()
          if (data) setRoster(prev => [...prev, data as EsportsRosterPlayer])
        }
      }
    } catch {
      alert('로스터 동기화 중 오류가 발생했습니다 (외부 API 접속 제한일 수 있음).')
    } finally {
      setSyncingTeamId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onBack} className="btn btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={13} /> 목록
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>{label}</h2>
        <button onClick={() => loadEvents(true)} disabled={eventsLoading} className="btn btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={12} style={{ animation: eventsLoading ? 'spin 1s linear infinite' : undefined }} /> 새로고침
        </button>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <StandingsPanel leagueCode={code} events={events} />
        </div>
        <div style={{ flex: '2 1 320px', minWidth: 280 }}>
          <RecentMatchesPanel leagueCode={code} events={events} loading={eventsLoading} error={eventsError} />
        </div>
        <div style={{ flex: '2 1 320px', minWidth: 280 }}>
          <UpcomingPanel events={events} loading={eventsLoading} error={eventsError} />
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: 8 }}>팀 목록</div>
      {teams.map(t => (
        <TeamCard key={t.id} team={t} roster={roster.filter(r => r.team_id === t.id)}
          events={events} eventsLoading={eventsLoading} eventsError={eventsError}
          syncing={syncingTeamId === t.id} onSyncRoster={syncRoster}
          onAddPlayer={addPlayer} onSaveTeamComment={saveTeamComment} onUpdatePlayer={updatePlayer}
          onDeletePlayer={deletePlayer} onDeleteTeam={deleteTeam} />
      ))}
      <div className="card" style={{ display: 'flex', gap: 6 }}>
        <input value={newTeam} onChange={e => setNewTeam(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTeam()}
          placeholder="팀 이름 추가..." className="form-input" style={{ flex: 1 }} />
        <button onClick={addTeam} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> 팀 추가
        </button>
      </div>
    </div>
  )
}

export default function Analysis() {
  const [activeLeague, setActiveLeague] = useState<string | null>(null)

  if (activeLeague) {
    const l = LEAGUES.find(x => x.code === activeLeague)!
    return (
      <div className="page">
        <LeagueView code={l.code} label={l.label} onBack={() => setActiveLeague(null)} />
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 16 }}>분석</h1>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {LEAGUES.map(l => (
          <button key={l.code} onClick={() => setActiveLeague(l.code)}
            style={{ flex: '1 0 140px', padding: '20px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold-border)'; e.currentTarget.style.color = 'var(--gold)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)' }}>
            🎮 {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

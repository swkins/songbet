import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import { Plus, Trash2, ChevronLeft, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react'

interface EsportsTeam { id: string; league: string; name: string; comment: string; sort_order: number }
interface EsportsRosterPlayer { id: string; team_id: string; name: string; comment: string; sort_order: number }

const LEAGUES: { code: string; label: string; slugs: string[] }[] = [
  { code: 'LCK',   label: 'LCK',   slugs: ['lck'] },
  { code: 'LPL',   label: 'LPL',   slugs: ['lpl'] },
  { code: 'LEC',   label: 'LEC',   slugs: ['lec'] },
  { code: 'LCS',   label: 'LCS',   slugs: ['lcs'] },
  { code: 'LCP',   label: 'LCP',   slugs: ['lcp'] },
  { code: 'CBLOL', label: 'CBLOL', slugs: ['cblol', 'cblol-brazil'] },
]

const LOLESPORTS_API = 'https://esports-api.lolesports.com/persisted/gw'
const LOLESPORTS_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'

interface MatchResult {
  id: string
  startTime: string
  teamA: string; teamB: string
  scoreA: number; scoreB: number
}

// getLeagues 응답은 세션 동안 재사용 (요청 절약)
let leagueIdCache: Record<string, string> | null = null

async function resolveLeagueIds(): Promise<Record<string, string>> {
  if (leagueIdCache) return leagueIdCache
  const res = await fetch(`${LOLESPORTS_API}/getLeagues?hl=en-US`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!res.ok) throw new Error('getLeagues failed')
  const json = await res.json()
  const leagues: { id: string; slug: string }[] = json?.data?.leagues ?? []
  const map: Record<string, string> = {}
  for (const l of LEAGUES) {
    const found = leagues.find(x => l.slugs.includes(x.slug))
    if (found) map[l.code] = found.id
  }
  leagueIdCache = map
  return map
}

async function fetchRecentMatches(leagueCode: string): Promise<MatchResult[]> {
  const ids = await resolveLeagueIds()
  const leagueId = ids[leagueCode]
  if (!leagueId) throw new Error('league id not found')
  const res = await fetch(`${LOLESPORTS_API}/getSchedule?hl=en-US&leagueId=${leagueId}`, { headers: { 'x-api-key': LOLESPORTS_KEY } })
  if (!res.ok) throw new Error('getSchedule failed')
  const json = await res.json()
  const events: any[] = json?.data?.schedule?.events ?? []
  return events
    .filter(e => e.state === 'completed' && e.match)
    .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
    .slice(0, 8)
    .map(e => {
      const teams = e.match.teams ?? []
      return {
        id: e.match.id ?? e.startTime,
        startTime: e.startTime,
        teamA: teams[0]?.name ?? '?', teamB: teams[1]?.name ?? '?',
        scoreA: teams[0]?.result?.gameWins ?? 0, scoreB: teams[1]?.result?.gameWins ?? 0,
      }
    })
}

function RecentMatches({ leagueCode, leagueLabel }: { leagueCode: string; leagueLabel: string }) {
  const [matches, setMatches] = useState<MatchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function load() {
    setLoading(true); setError(false)
    try {
      const data = await fetchRecentMatches(leagueCode)
      setMatches(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [leagueCode])

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>🎮 {leagueLabel} 최근 경기</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href={`https://lolesports.com/en-US/leagues/${leagueCode.toLowerCase()}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
            lolesports.com <ExternalLink size={10} />
          </a>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          </button>
        </div>
      </div>
      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0' }}>불러오는 중...</div>}
      {!loading && error && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0' }}>
          최근 경기 데이터를 가져올 수 없습니다 (외부 API 접속 제한일 수 있음). 위 링크에서 직접 확인해 주세요.
        </div>
      )}
      {!loading && !error && matches && matches.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0' }}>최근 완료된 경기가 없습니다</div>
      )}
      {!loading && !error && matches && matches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {matches.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 70 }}>{dayjs(m.startTime).format('MM/DD HH:mm')}</span>
              <span style={{ flex: 1, textAlign: 'right', fontWeight: m.scoreA > m.scoreB ? 800 : 400, color: m.scoreA > m.scoreB ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.teamA}</span>
              <span style={{ fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{m.scoreA} : {m.scoreB}</span>
              <span style={{ flex: 1, fontWeight: m.scoreB > m.scoreA ? 800 : 400, color: m.scoreB > m.scoreA ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.teamB}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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

function TeamCard({ team, roster, onAddPlayer, onSaveTeamComment, onSavePlayerComment, onDeletePlayer, onDeleteTeam }: {
  team: EsportsTeam
  roster: EsportsRosterPlayer[]
  onAddPlayer: (teamId: string, name: string) => void
  onSaveTeamComment: (teamId: string, comment: string) => void
  onSavePlayerComment: (playerId: string, comment: string) => void
  onDeletePlayer: (playerId: string) => void
  onDeleteTeam: (teamId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [newPlayer, setNewPlayer] = useState('')
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{team.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{roster.length}명</span>
        <button onClick={e => { e.stopPropagation(); if (confirm(`${team.name} 팀을 삭제하시겠습니까? (로스터도 함께 삭제됩니다)`)) onDeleteTeam(team.id) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}>
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>팀 코멘트</div>
            <CommentBox value={team.comment} onSave={v => onSaveTeamComment(team.id, v)} placeholder="팀에 대한 코멘트를 입력하세요..." />
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>로스터</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {roster.map(p => (
              <div key={p.id} style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{p.name}</span>
                  <button onClick={() => onDeletePlayer(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
                <CommentBox value={p.comment} onSave={v => onSavePlayerComment(p.id, v)} placeholder="선수 코멘트..." />
              </div>
            ))}
            {roster.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>로스터가 없습니다</div>}
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
  useEffect(() => { load() }, [code])

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
  async function savePlayerComment(playerId: string, comment: string) {
    const { data } = await supabase.from('esports_roster').update({ comment }).eq('id', playerId).select().single()
    if (data) setRoster(p => p.map(r => r.id === playerId ? data as EsportsRosterPlayer : r))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={onBack} className="btn btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={13} /> 목록
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{label}</h2>
      </div>

      <RecentMatches leagueCode={code} leagueLabel={label} />

      <div className="card-title" style={{ marginBottom: 8 }}>팀 목록</div>
      {teams.map(t => (
        <TeamCard key={t.id} team={t} roster={roster.filter(r => r.team_id === t.id)}
          onAddPlayer={addPlayer} onSaveTeamComment={saveTeamComment} onSavePlayerComment={savePlayerComment}
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

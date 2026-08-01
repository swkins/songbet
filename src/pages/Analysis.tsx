import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import { Plus, Trash2, ChevronDown, ChevronUp, ExternalLink, RefreshCw, TrendingUp, Users, BookOpen, AlertTriangle } from 'lucide-react'
import {
  LEAGUES, fetchScheduleEvents, extractTeamData, computeForm, matchupProbability, filterRecentGames,
  seriesScoreProbabilities, computeOddsValue, fetchLeagueTeams, findTeamCode, teamNameMatches,
  classifyGameNarrative, type RawScheduleEvent, type TeamGameRecord, type NarrativeTeam,
} from '../lib/lolEsports'

interface EsportsTeam {
  id: string; league: string; name: string; comment: string; sort_order: number
  namuwiki_url: string | null; namuwiki_last_checked: string | null; namuwiki_changed: boolean
}
interface EsportsRosterPlayer {
  id: string; team_id: string; name: string; comment: string; sort_order: number
  role: string | null; nationality: string | null; joined_at: string | null; contract_until: string | null
  lolesports_player_id?: string | null
}
type RosterPatch = Partial<Pick<EsportsRosterPlayer, 'comment' | 'role' | 'nationality' | 'joined_at' | 'contract_until'>>

interface EsportsGameStat {
  id: string
  team_id: string
  team2_name: string
  match_start_time: string | null
  game_number: number
  duration_seconds: number | null
  team1_kills: number | null; team2_kills: number | null
  team1_dragons: number | null; team2_dragons: number | null
  team1_towers: number | null; team2_towers: number | null
  team1_inhibitors: number | null; team2_inhibitors: number | null
  team1_barons: number | null; team2_barons: number | null
  winner_team: NarrativeTeam | null
  first_blood_team: NarrativeTeam | null
  first_tower_team: NarrativeTeam | null
  first_baron_team: NarrativeTeam | null
  fifth_kill_team: NarrativeTeam | null
  tenth_kill_team: NarrativeTeam | null
  notes: string | null
}

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
  const formA = useMemo(() => computeForm(filterRecentGames(extractTeamData(events, teamA?.name ?? '').completed)), [events, teamA?.name])
  const formB = useMemo(() => computeForm(filterRecentGames(extractTeamData(events, teamB?.name ?? '').completed)), [events, teamB?.name])
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

// ─── 세트 기록 수동 입력 ────────────────────────────────────────
function StatPairInput({ label, valueA, valueB, onChangeA, onChangeB }: {
  label: string; valueA: string; valueB: string; onChangeA: (v: string) => void; onChangeB: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 46, flexShrink: 0 }}>{label}</span>
      <input value={valueA} onChange={e => onChangeA(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric"
        style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>:</span>
      <input value={valueB} onChange={e => onChangeB(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric"
        style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
    </div>
  )
}

function MilestoneSelect({ label, value, onChange, teamName, opponentName }: {
  label: string; value: NarrativeTeam | ''; onChange: (v: NarrativeTeam | '') => void; teamName: string; opponentName: string
}) {
  return (
    <div>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value as NarrativeTeam | '')}
        style={{ width: '100%', fontSize: 10, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
        <option value="">모름</option>
        <option value="team1">{teamName}</option>
        <option value="team2">{opponentName}</option>
      </select>
    </div>
  )
}

interface GameStatForm {
  gameNumber: number
  durationMin: string; durationSec: string
  team1Kills: string; team2Kills: string
  team1Dragons: string; team2Dragons: string
  team1Towers: string; team2Towers: string
  team1Inhibitors: string; team2Inhibitors: string
  team1Barons: string; team2Barons: string
  winnerTeam: NarrativeTeam
  firstBloodTeam: NarrativeTeam | ''
  firstTowerTeam: NarrativeTeam | ''
  firstBaronTeam: NarrativeTeam | ''
  fifthKillTeam: NarrativeTeam | ''
  tenthKillTeam: NarrativeTeam | ''
}

function emptyGameStatForm(gameNumber: number): GameStatForm {
  return {
    gameNumber, durationMin: '', durationSec: '',
    team1Kills: '', team2Kills: '', team1Dragons: '', team2Dragons: '',
    team1Towers: '', team2Towers: '', team1Inhibitors: '', team2Inhibitors: '',
    team1Barons: '', team2Barons: '', winnerTeam: 'team1',
    firstBloodTeam: '', firstTowerTeam: '', firstBaronTeam: '', fifthKillTeam: '', tenthKillTeam: '',
  }
}

function GameStatCard({ stat, teamName, onDelete }: { stat: EsportsGameStat; teamName: string; onDelete: (id: string) => void }) {
  const narrative = classifyGameNarrative({
    team1Kills: stat.team1_kills ?? 0, team2Kills: stat.team2_kills ?? 0,
    team1Dragons: stat.team1_dragons ?? 0, team2Dragons: stat.team2_dragons ?? 0,
    team1Towers: stat.team1_towers ?? 0, team2Towers: stat.team2_towers ?? 0,
    team1Inhibitors: stat.team1_inhibitors ?? 0, team2Inhibitors: stat.team2_inhibitors ?? 0,
    team1Barons: stat.team1_barons ?? 0, team2Barons: stat.team2_barons ?? 0,
    winnerTeam: stat.winner_team ?? 'team1',
    firstBloodTeam: stat.first_blood_team, firstTowerTeam: stat.first_tower_team, firstBaronTeam: stat.first_baron_team,
    fifthKillTeam: stat.fifth_kill_team, tenthKillTeam: stat.tenth_kill_team,
  })
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', fontSize: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 800 }}>
          {stat.game_number}세트{stat.duration_seconds ? ` · ${Math.floor(stat.duration_seconds / 60)}:${String(stat.duration_seconds % 60).padStart(2, '0')}` : ''}
        </span>
        <button onClick={() => onDelete(stat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <Trash2 size={10} />
        </button>
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.6 }}>
        킬 {stat.team1_kills ?? '-'}:{stat.team2_kills ?? '-'} · 드래곤 {stat.team1_dragons ?? '-'}:{stat.team2_dragons ?? '-'} · 타워 {stat.team1_towers ?? '-'}:{stat.team2_towers ?? '-'} · 억제기 {stat.team1_inhibitors ?? '-'}:{stat.team2_inhibitors ?? '-'} · 바론 {stat.team1_barons ?? '-'}:{stat.team2_barons ?? '-'}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 4, padding: '2px 6px', marginBottom: 4 }}>
        {narrative.label}
      </div>
      <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{narrative.detail}</div>
    </div>
  )
}

function RecentMatchRow({ teamId, teamName, game }: { teamId: string; teamName: string; game: TeamGameRecord }) {
  const [expanded, setExpanded] = useState(false)
  const [sets, setSets] = useState<EsportsGameStat[] | null>(null)
  const [loadingSets, setLoadingSets] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<GameStatForm>(() => emptyGameStatForm(1))
  const [saving, setSaving] = useState(false)

  async function loadSets() {
    setLoadingSets(true)
    const { data } = await supabase.from('esports_game_stats').select('*')
      .eq('team_id', teamId).eq('team2_name', game.opponent).eq('match_start_time', game.startTime)
      .order('game_number')
    setSets((data as EsportsGameStat[]) ?? [])
    setLoadingSets(false)
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next && sets === null) loadSets()
  }

  function openAddForm() {
    setForm(emptyGameStatForm((sets?.length ?? 0) + 1))
    setShowForm(true)
  }

  async function saveSet() {
    setSaving(true)
    const toInt = (v: string) => v === '' ? null : parseInt(v, 10)
    const duration = (form.durationMin || form.durationSec)
      ? (parseInt(form.durationMin || '0', 10) * 60 + parseInt(form.durationSec || '0', 10))
      : null
    const payload = {
      team_id: teamId, team2_name: game.opponent, match_start_time: game.startTime, game_number: form.gameNumber,
      duration_seconds: duration,
      team1_kills: toInt(form.team1Kills), team2_kills: toInt(form.team2Kills),
      team1_dragons: toInt(form.team1Dragons), team2_dragons: toInt(form.team2Dragons),
      team1_towers: toInt(form.team1Towers), team2_towers: toInt(form.team2Towers),
      team1_inhibitors: toInt(form.team1Inhibitors), team2_inhibitors: toInt(form.team2Inhibitors),
      team1_barons: toInt(form.team1Barons), team2_barons: toInt(form.team2Barons),
      winner_team: form.winnerTeam,
      first_blood_team: form.firstBloodTeam || null,
      first_tower_team: form.firstTowerTeam || null,
      first_baron_team: form.firstBaronTeam || null,
      fifth_kill_team: form.fifthKillTeam || null,
      tenth_kill_team: form.tenthKillTeam || null,
      source: 'manual',
    }
    const { data } = await supabase.from('esports_game_stats')
      .upsert(payload, { onConflict: 'team_id,team2_name,match_start_time,game_number' })
      .select().single()
    if (data) {
      setSets(prev => {
        const others = (prev ?? []).filter(s => s.game_number !== (data as EsportsGameStat).game_number)
        return [...others, data as EsportsGameStat].sort((a, b) => a.game_number - b.game_number)
      })
      setShowForm(false)
    }
    setSaving(false)
  }

  async function deleteSet(id: string) {
    await supabase.from('esports_game_stats').delete().eq('id', id)
    setSets(prev => (prev ?? []).filter(s => s.id !== id))
  }

  return (
    <div>
      <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '5px 8px', background: 'var(--bg-card)', borderRadius: 6, cursor: 'pointer' }}>
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        <span style={{ color: 'var(--text-muted)', width: 50, flexShrink: 0 }}>{dayjs(game.startTime).format('MM/DD')}</span>
        <span style={{ flex: 1 }}>vs {game.opponent}</span>
        <span style={{ fontWeight: 800, color: game.teamScore > game.oppScore ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{game.teamScore} : {game.oppScore}</span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 8px 8px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loadingSets && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>불러오는 중...</div>}
          {!loadingSets && sets && sets.map(s => (
            <GameStatCard key={s.id} stat={s} teamName={teamName} onDelete={deleteSet} />
          ))}
          {!loadingSets && sets && sets.length === 0 && !showForm && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>기록된 세트가 없습니다.</div>
          )}
          {!showForm && (
            <button onClick={openAddForm} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={10} /> 세트 기록 추가
            </button>
          )}
          {showForm && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700 }}>{form.gameNumber}세트 기록 입력</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 46 }}>게임시간</span>
                <input value={form.durationMin} onChange={e => setForm(f => ({ ...f, durationMin: e.target.value.replace(/[^0-9]/g, '') }))}
                  placeholder="분" inputMode="numeric" style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>분</span>
                <input value={form.durationSec} onChange={e => setForm(f => ({ ...f, durationSec: e.target.value.replace(/[^0-9]/g, '') }))}
                  placeholder="초" inputMode="numeric" style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>초</span>
              </div>
              <StatPairInput label="킬" valueA={form.team1Kills} valueB={form.team2Kills} onChangeA={v => setForm(f => ({ ...f, team1Kills: v }))} onChangeB={v => setForm(f => ({ ...f, team2Kills: v }))} />
              <StatPairInput label="드래곤" valueA={form.team1Dragons} valueB={form.team2Dragons} onChangeA={v => setForm(f => ({ ...f, team1Dragons: v }))} onChangeB={v => setForm(f => ({ ...f, team2Dragons: v }))} />
              <StatPairInput label="타워" valueA={form.team1Towers} valueB={form.team2Towers} onChangeA={v => setForm(f => ({ ...f, team1Towers: v }))} onChangeB={v => setForm(f => ({ ...f, team2Towers: v }))} />
              <StatPairInput label="억제기" valueA={form.team1Inhibitors} valueB={form.team2Inhibitors} onChangeA={v => setForm(f => ({ ...f, team1Inhibitors: v }))} onChangeB={v => setForm(f => ({ ...f, team2Inhibitors: v }))} />
              <StatPairInput label="바론" valueA={form.team1Barons} valueB={form.team2Barons} onChangeA={v => setForm(f => ({ ...f, team1Barons: v }))} onChangeB={v => setForm(f => ({ ...f, team2Barons: v }))} />

              <div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 2 }}>승리팀</div>
                <select value={form.winnerTeam} onChange={e => setForm(f => ({ ...f, winnerTeam: e.target.value as NarrativeTeam }))}
                  style={{ width: '100%', fontSize: 10, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                  <option value="team1">{teamName}</option>
                  <option value="team2">{game.opponent}</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <MilestoneSelect label="첫 킬" value={form.firstBloodTeam} onChange={v => setForm(f => ({ ...f, firstBloodTeam: v }))} teamName={teamName} opponentName={game.opponent} />
                <MilestoneSelect label="첫 타워" value={form.firstTowerTeam} onChange={v => setForm(f => ({ ...f, firstTowerTeam: v }))} teamName={teamName} opponentName={game.opponent} />
                <MilestoneSelect label="첫 내셔" value={form.firstBaronTeam} onChange={v => setForm(f => ({ ...f, firstBaronTeam: v }))} teamName={teamName} opponentName={game.opponent} />
                <MilestoneSelect label="5번째 킬 선취" value={form.fifthKillTeam} onChange={v => setForm(f => ({ ...f, fifthKillTeam: v }))} teamName={teamName} opponentName={game.opponent} />
                <MilestoneSelect label="10번째 킬 선취" value={form.tenthKillTeam} onChange={v => setForm(f => ({ ...f, tenthKillTeam: v }))} teamName={teamName} opponentName={game.opponent} />
              </div>

              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }}>취소</button>
                <button onClick={saveSet} disabled={saving} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 11 }}>{saving ? '저장 중...' : '저장'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 팀 카드 안: 경기 분석(다음 상대 예측 + 배당 가치) ────────────
function TeamAnalysisPanel({ teamId, teamName, events, loading, error }: {
  teamId: string; teamName: string; events: RawScheduleEvent[] | null; loading: boolean; error: boolean
}) {
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({})

  const { completed, upcoming } = useMemo(
    () => events ? extractTeamData(events, teamName) : { completed: [], upcoming: [] },
    [events, teamName]
  )
  const recentGames = filterRecentGames(completed)
  const form = useMemo(() => computeForm(recentGames), [recentGames])

  const next = upcoming[0]
  const oppRecentGames = useMemo(() => {
    if (!events || !next) return []
    return filterRecentGames(extractTeamData(events, next.opponent).completed)
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
              최근 전적 (최근 한 달){form.seriesPlayed > 0 && ` · ${form.seriesPlayed}세트 ${form.wins}승 ${form.losses}패 (시리즈 승률 ${(form.seriesWinRate * 100).toFixed(0)}% · 맵 승률 ${(form.gameWinRate * 100).toFixed(0)}%)`}
            </div>
            {recentGames.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>기록된 경기가 없습니다 (팀 이름이 lolesports 표기와 다를 수 있어요)</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentGames.map((g, i) => (
                <RecentMatchRow key={i} teamId={teamId} teamName={teamName} game={g} />
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

// ─── 팀 카드 안: 나무위키 연동 (서버사이드 조회 + 변경 감지) ────────
function NamuwikiPanel({ team, onSaveUrl, onRefreshed }: {
  team: EsportsTeam
  onSaveUrl: (teamId: string, url: string) => void
  onRefreshed: (teamId: string, patch: { namuwiki_last_checked: string; namuwiki_changed: boolean }) => void
}) {
  const [urlDraft, setUrlDraft] = useState(team.namuwiki_url ?? '')
  const [editingUrl, setEditingUrl] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => { setUrlDraft(team.namuwiki_url ?? '') }, [team.namuwiki_url])

  async function refresh() {
    if (!team.namuwiki_url) return
    setLoading(true); setError(false)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('namuwiki-check', { body: { teamId: team.id } })
      if (fnError || !data || data.error) throw new Error('fetch failed')
      setPreview(data.text as string)
      onRefreshed(team.id, { namuwiki_last_checked: new Date().toISOString(), namuwiki_changed: false })
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="card-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          <BookOpen size={11} /> 나무위키 연동
          {team.namuwiki_changed && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 4, padding: '2px 6px', marginLeft: 4 }}>
              <AlertTriangle size={9} /> 변경 감지됨
            </span>
          )}
        </div>
        {team.namuwiki_url && (
          <button onClick={refresh} disabled={loading} className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} /> 새로고침
          </button>
        )}
      </div>

      {!editingUrl && team.namuwiki_url && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <a href={team.namuwiki_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            {team.namuwiki_url} <ExternalLink size={9} style={{ display: 'inline' }} />
          </a>
          <button onClick={() => setEditingUrl(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 9 }}>수정</button>
        </div>
      )}
      {(editingUrl || !team.namuwiki_url) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input value={urlDraft} onChange={e => setUrlDraft(e.target.value)}
            placeholder="나무위키 팀 문서 주소 (예: https://namu.wiki/w/...)"
            className="form-input" style={{ flex: 1, fontSize: 11, padding: '5px 7px' }} />
          <button onClick={() => { if (urlDraft.trim()) { onSaveUrl(team.id, urlDraft.trim()); setEditingUrl(false) } }}
            className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 11 }}>저장</button>
        </div>
      )}

      {team.namuwiki_last_checked && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
          마지막 확인: {dayjs(team.namuwiki_last_checked).format('MM/DD HH:mm')} (매일 자동 확인 · 변경 감지 시 배지 표시)
        </div>
      )}

      {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>나무위키 페이지를 불러오는 중...</div>}
      {!loading && error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>나무위키 페이지를 가져오지 못했습니다.</div>}
      {!loading && !error && preview && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 6, padding: '8px 10px', maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontFamily: 'monospace' }}>
          {preview}
        </div>
      )}
      {!team.namuwiki_url && !editingUrl && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          나무위키 문서 주소를 등록하면 매일 자동으로 변경 여부를 확인하고, 새로고침으로 최신 로스터 변경 이력을 바로 볼 수 있어요. 실제 값 반영은 확인 후 직접 편집해 주세요 (위키 서술은 검증되지 않을 수 있어 자동 반영하지 않습니다).
        </div>
      )}
    </div>
  )
}

function TeamCard({ team, roster, events, eventsLoading, eventsError, syncing, onSyncRoster, onAddPlayer, onSaveTeamComment, onUpdatePlayer, onDeletePlayer, onDeleteTeam, onSaveNamuwikiUrl, onNamuwikiRefreshed }: {
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
  onSaveNamuwikiUrl: (teamId: string, url: string) => void
  onNamuwikiRefreshed: (teamId: string, patch: { namuwiki_last_checked: string; namuwiki_changed: boolean }) => void
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
          <TeamAnalysisPanel teamId={team.id} teamName={team.name} events={events} loading={eventsLoading} error={eventsError} />
          <NamuwikiPanel team={team} onSaveUrl={onSaveNamuwikiUrl} onRefreshed={onNamuwikiRefreshed} />
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

function LeagueView({ code, label }: { code: string; label: string }) {
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
  async function saveNamuwikiUrl(teamId: string, url: string) {
    const { data } = await supabase.from('esports_teams').update({ namuwiki_url: url, namuwiki_changed: false }).eq('id', teamId).select().single()
    if (data) setTeams(p => p.map(t => t.id === teamId ? data as EsportsTeam : t))
  }
  function namuwikiRefreshed(teamId: string, patch: { namuwiki_last_checked: string; namuwiki_changed: boolean }) {
    setTeams(p => p.map(t => t.id === teamId ? { ...t, ...patch } : t))
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
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>{label}</h2>
        <button onClick={() => loadEvents(true)} disabled={eventsLoading} className="btn btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={12} style={{ animation: eventsLoading ? 'spin 1s linear infinite' : undefined }} /> 새로고침
        </button>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <RecentMatchesPanel leagueCode={code} events={events} loading={eventsLoading} error={eventsError} />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <UpcomingPanel events={events} loading={eventsLoading} error={eventsError} />
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: 8 }}>팀 목록</div>
      {teams.map(t => (
        <TeamCard key={t.id} team={t} roster={roster.filter(r => r.team_id === t.id)}
          events={events} eventsLoading={eventsLoading} eventsError={eventsError}
          syncing={syncingTeamId === t.id} onSyncRoster={syncRoster}
          onAddPlayer={addPlayer} onSaveTeamComment={saveTeamComment} onUpdatePlayer={updatePlayer}
          onDeletePlayer={deletePlayer} onDeleteTeam={deleteTeam}
          onSaveNamuwikiUrl={saveNamuwikiUrl} onNamuwikiRefreshed={namuwikiRefreshed} />
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
  const [activeLeague, setActiveLeague] = useState<string>(LEAGUES[0].code)
  const l = LEAGUES.find(x => x.code === activeLeague)!

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 16 }}>분석</h1>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 168, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, position: 'sticky', top: 14 }}>
          {LEAGUES.map(lg => {
            const active = lg.code === activeLeague
            return (
              <button key={lg.code} onClick={() => setActiveLeague(lg.code)}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: active ? 'var(--gold-bg)' : 'var(--bg-card)',
                  color: active ? 'var(--gold)' : 'var(--text-primary)',
                  fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s',
                }}>
                🎮 {lg.label}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <LeagueView key={l.code} code={l.code} label={l.label} />
        </div>
      </div>
    </div>
  )
}

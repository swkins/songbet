import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, ExternalLink, RefreshCw, TrendingUp } from 'lucide-react'
import {
  LEAGUES, fetchScheduleEvents, extractTeamData, computeForm, matchupProbability, filterRecentGames,
  seriesScoreProbabilities, computeOddsValue, teamNameMatches,
  classifyGameNarrative, computeBothSidesScores, computeBothSidesPerfection, computePerfectionScore,
  computeTeamPowerScore, computeTeamPriorScore, powerScoreMatchupProbability,
  type RawScheduleEvent, type TeamGameRecord, type NarrativeTeam, type TeamPowerScore, type SetRecordForPower,
} from '../lib/lolEsports'

interface EsportsTeam {
  id: string; league: string; name: string; comment: string; sort_order: number
  namuwiki_url: string | null; namuwiki_last_checked: string | null; namuwiki_changed: boolean
}

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
  team1_gold: number | null; team2_gold: number | null
  winner_team: NarrativeTeam | null
  first_blood_team: NarrativeTeam | null
  first_tower_team: NarrativeTeam | null
  first_dragon_team: NarrativeTeam | null
  first_baron_team: NarrativeTeam | null
  fifth_kill_team: NarrativeTeam | null
  tenth_kill_team: NarrativeTeam | null
  notes: string | null
  source: string
}

// 리그 목록 안에서 어느 팀이 우리가 추적 중인 팀(esports_teams)인지 찾아서
// {teamId, teamName, opponent} 형태로 반환. 세트 기록 입력/저장은 이 팀의 관점(team1)으로 저장된다.
function resolveMatchTeam(teams: EsportsTeam[], teamAName: string, teamBName: string, codeA?: string, codeB?: string): { teamId: string; teamName: string; opponent: string; isA: boolean } | null {
  const a = teams.find(t => teamNameMatches(t, teamAName) || (codeA && teamNameMatches(t, codeA)))
  if (a) return { teamId: a.id, teamName: a.name, opponent: teamBName, isA: true }
  const b = teams.find(t => teamNameMatches(t, teamBName) || (codeB && teamNameMatches(t, codeB)))
  if (b) return { teamId: b.id, teamName: b.name, opponent: teamAName, isA: false }
  return null
}

// ─── 중앙: 최근 경기 (클릭하면 바로 펼쳐져서 세트 기록 입력 + 분석 가능) ──
function RecentMatchesPanel({ leagueCode, events, loading, error, teams }: { leagueCode: string; events: RawScheduleEvent[] | null; loading: boolean; error: boolean; teams: EsportsTeam[] }) {
  const matches = useMemo(() => {
    if (!events) return []
    const cutoff = dayjs().subtract(30, 'day')
    return events
      .filter(e => e.state === 'completed' && e.match && dayjs(e.startTime).isAfter(cutoff))
      .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
      .slice(0, 40) // 최근 한 달 기준, 과도한 렌더링만 방지하는 안전장치
      .map(e => {
        const teams = e.match!.teams ?? []
        return {
          id: e.match!.id ?? e.startTime, startTime: e.startTime,
          teamA: teams[0]?.name ?? '?', codeA: teams[0]?.code ?? '',
          teamB: teams[1]?.name ?? '?', codeB: teams[1]?.code ?? '',
          scoreA: teams[0]?.result?.gameWins ?? 0, scoreB: teams[1]?.result?.gameWins ?? 0,
          bestOf: e.match!.strategy?.count ?? 3,
        }
      })
  }, [events])

  // 각 경기에 세트 기록이 입력돼있는지 스코어 옆에 배지로 보여주기 위해, 관련 팀들의 기록을 한 번에 조회
  const [recordedByTeam, setRecordedByTeam] = useState<Record<string, EsportsGameStat[]>>({})
  const [showAll, setShowAll] = useState(false)
  const visibleMatches = showAll ? matches : matches.slice(0, 8)
  // 자동 팀 매칭이 실패한 경기를 사용자가 수동으로 지정할 수 있게 하는 예외 처리
  const [overrides, setOverrides] = useState<Record<string, { teamId: string; isA: boolean }>>({})
  useEffect(() => {
    const ids = Array.from(new Set(
      matches.map(m => resolveMatchTeam(teams, m.teamA, m.teamB, m.codeA, m.codeB)?.teamId).filter((x): x is string => !!x)
    ))
    if (ids.length === 0) { setRecordedByTeam({}); return }
    supabase.from('esports_game_stats').select('*').in('team_id', ids).then(({ data }) => {
      const grouped: Record<string, EsportsGameStat[]> = {}
      for (const row of (data as EsportsGameStat[]) ?? []) {
        if (!grouped[row.team_id]) grouped[row.team_id] = []
        grouped[row.team_id].push(row)
      }
      setRecordedByTeam(grouped)
    })
  }, [matches, teams])

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>최근 경기 <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>· 클릭해서 세트 기록 입력</span></div>
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
          {visibleMatches.map(m => {
            const auto = resolveMatchTeam(teams, m.teamA, m.teamB, m.codeA, m.codeB)
            const ov = overrides[m.id]
            const resolved = auto ?? (ov ? {
              teamId: ov.teamId,
              teamName: teams.find(t => t.id === ov.teamId)?.name ?? '',
              opponent: ov.isA ? (m.codeB || m.teamB) : (m.codeA || m.teamA),
              isA: ov.isA,
            } : null)
            if (!resolved) {
              // 자동 매칭 실패 (예: lolesports API가 이 경기만 팀 이름을 다르게 내려준 경우) → 수동 선택으로 우회
              return (
                <div key={m.id} style={{ padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: 0.6 }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 58 }}>{dayjs(m.startTime).format('MM/DD HH:mm')}</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>{m.codeA || m.teamA}</span>
                    <span style={{ fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{m.scoreA} : {m.scoreB}</span>
                    <span style={{ flex: 1 }}>{m.codeB || m.teamB}</span>
                  </div>
                  <select
                    value=""
                    onChange={e => {
                      const teamId = e.target.value
                      if (!teamId) return
                      const chosen = teams.find(t => t.id === teamId)
                      const isA = chosen ? (teamNameMatches(chosen, m.teamA) || teamNameMatches(chosen, m.codeA)) : true
                      setOverrides(prev => ({ ...prev, [m.id]: { teamId, isA } }))
                    }}
                    style={{ width: '100%', marginTop: 4, fontSize: 10, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    <option value="">자동 매칭 실패 · 수동으로 팀 선택해서 입력하기</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )
            }
            const teamScore = resolved.isA ? m.scoreA : m.scoreB
            const oppScore = resolved.isA ? m.scoreB : m.scoreA
            const recordCount = (recordedByTeam[resolved.teamId] ?? []).filter(s => {
              const d = dayjs(s.match_start_time)
              const inRange = d.isAfter(dayjs(m.startTime).subtract(1, 'day')) && d.isBefore(dayjs(m.startTime).add(1, 'day'))
              return inRange && (teamNameMatches({ name: s.team2_name }, resolved.opponent) || teamNameMatches({ name: resolved.opponent }, s.team2_name))
            }).length
            const codeA = m.codeA || m.teamA
            const codeB = m.codeB || m.teamB
            return (
              <RecentMatchRow key={m.id} teamId={resolved.teamId} teamName={resolved.teamName}
                game={{ opponent: resolved.opponent, teamScore, oppScore, startTime: m.startTime, bestOf: m.bestOf }}
                displayA={codeA} displayB={codeB} scoreA={m.scoreA} scoreB={m.scoreB} teams={teams}
                recordCount={recordCount}
                teamCode={resolved.isA ? codeA : codeB} opponentCode={resolved.isA ? codeB : codeA} />
            )
          })}
          {matches.length > 8 && (
            <button onClick={() => setShowAll(v => !v)} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 10, alignSelf: 'center', marginTop: 2 }}>
              {showAll ? '접기' : `${matches.length - 8}경기 더 보기 (최근 30일)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 우측: 앞으로의 일정 + 승부 예측 ──────────────────────────────
function UpcomingRow({ event, events, teams, powerScores }: {
  event: RawScheduleEvent; events: RawScheduleEvent[]; teams: EsportsTeam[]; powerScores: Record<string, TeamPowerScore>
}) {
  const [expanded, setExpanded] = useState(false)
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({})
  const matchTeams = event.match?.teams ?? []
  const teamA = matchTeams[0], teamB = matchTeams[1]
  const bestOf = event.match?.strategy?.count ?? 3

  const idA = useMemo(() => teams.find(t => teamNameMatches(t, teamA?.name ?? ''))?.id ?? null, [teams, teamA?.name])
  const idB = useMemo(() => teams.find(t => teamNameMatches(t, teamB?.name ?? ''))?.id ?? null, [teams, teamB?.name])
  const powerA = idA ? powerScores[idA] : undefined
  const powerB = idB ? powerScores[idB] : undefined
  const usePower = !!(powerA && powerB && powerA.gamesAnalyzed > 0 && powerB.gamesAnalyzed > 0)

  // 체급 점수 데이터가 부족하면 lolesports 시리즈/세트 승률 기반으로 폴백
  const formA = useMemo(() => computeForm(filterRecentGames(extractTeamData(events, teamA?.name ?? '').completed)), [events, teamA?.name])
  const formB = useMemo(() => computeForm(filterRecentGames(extractTeamData(events, teamB?.name ?? '').completed)), [events, teamB?.name])

  const p = usePower && powerA && powerB ? powerScoreMatchupProbability(powerA.powerScore, powerB.powerScore) : matchupProbability(formA, formB)
  const scoreProbs = seriesScoreProbabilities(p, bestOf)
  const top = scoreProbs[0]
  const topLabel = top.winner === 'A' ? (teamA?.code || teamA?.name) : (teamB?.code || teamB?.name)

  function setOdds(score: string, v: string) {
    setOddsInputs(prev => ({ ...prev, [score]: v }))
  }

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 6 }}>
      <div onClick={() => setExpanded(v => !v)} style={{ padding: '8px 8px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          <span style={{ color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>{dayjs(event.startTime).format('MM/DD HH:mm')}</span>
          <span style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>{teamA?.code || teamA?.name}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>BO{bestOf}</span>
          <span style={{ flex: 1, fontWeight: 700 }}>{teamB?.code || teamB?.name}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
          예측 승률 <b style={{ color: 'var(--text-secondary)' }}>{(p * 100).toFixed(0)}%</b> : <b style={{ color: 'var(--text-secondary)' }}>{((1 - p) * 100).toFixed(0)}%</b>
          {' · '}예상 스코어 <b style={{ color: 'var(--gold)' }}>{topLabel} {top.score}</b> ({(top.prob * 100).toFixed(0)}%)
          {usePower && powerA && powerB
            ? <div style={{ marginTop: 2 }}>체급 기반 · {teamA?.code || teamA?.name} {powerA.powerScore.toFixed(1)} : {powerB.powerScore.toFixed(1)} {teamB?.code || teamB?.name}</div>
            : <div style={{ marginTop: 2 }}>체급 데이터 부족 · lolesports 전적 기반 폴백</div>}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 8px 8px 8px' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
            배당을 입력하면 모델 확률 대비 기대값(EV)을 보여드려요. EV가 양수(초록)면 베팅 가치가 있다는 뜻입니다.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scoreProbs.map(sp => {
              const label = sp.winner === 'A' ? `${teamA?.code || teamA?.name} ${sp.score}` : `${teamB?.code || teamB?.name} ${sp.score}`
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
                    onClick={e => e.stopPropagation()}
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
    </div>
  )
}

function UpcomingPanel({ events, loading, error, teams, powerScores }: {
  events: RawScheduleEvent[] | null; loading: boolean; error: boolean; teams: EsportsTeam[]; powerScores: Record<string, TeamPowerScore>
}) {
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
          {upcoming.map(e => <UpcomingRow key={e.match!.id ?? e.id} event={e} events={events} teams={teams} powerScores={powerScores} />)}
        </div>
      )}
    </div>
  )
}

// ─── 세트 기록 수동 입력 ────────────────────────────────────────
function milestoneLabel(m: NarrativeTeam | null, teamLabel: string, oppLabel: string): string {
  return m === 'team1' ? teamLabel : m === 'team2' ? oppLabel : '기록없음'
}

// 세부 지표 하나가 어떤 원본 수치로 계산됐는지 마우스 오버로 보여주기 위한 설명 텍스트
function metricTooltip(metricKey: string, s: EsportsGameStat, teamLabel: string, oppLabel: string, earlyLeader: NarrativeTeam | 'even' | null): string {
  const dur = s.duration_seconds != null ? `${Math.floor(s.duration_seconds / 60)}분 ${s.duration_seconds % 60}초` : '경기시간 미입력'
  switch (metricKey) {
    case 'laning':
      return `퍼스트 블러드: ${milestoneLabel(s.first_blood_team, teamLabel, oppLabel)} · 5킬 선취: ${milestoneLabel(s.fifth_kill_team, teamLabel, oppLabel)} · 퍼스트 타워: ${milestoneLabel(s.first_tower_team, teamLabel, oppLabel)}`
    case 'objective':
      return `드래곤 ${s.team1_dragons ?? '-'}:${s.team2_dragons ?? '-'} · 내셔 ${s.team1_barons ?? '-'}:${s.team2_barons ?? '-'} · 퍼스트 드래곤: ${milestoneLabel(s.first_dragon_team, teamLabel, oppLabel)} · 퍼스트 내셔: ${milestoneLabel(s.first_baron_team, teamLabel, oppLabel)}`
    case 'teamfight':
      return `킬 ${s.team1_kills ?? '-'}:${s.team2_kills ?? '-'} (${dur} 기준 분당 킬 격차로 환산) · 10킬 선취: ${milestoneLabel(s.tenth_kill_team, teamLabel, oppLabel)}`
    case 'macro':
      return `타워 ${s.team1_towers ?? '-'}:${s.team2_towers ?? '-'} · 억제기 ${s.team1_inhibitors ?? '-'}:${s.team2_inhibitors ?? '-'}`
    case 'closing':
      return `승자: ${s.winner_team === 'team1' ? teamLabel : oppLabel} · 초반 주도권: ${earlyLeader === 'team1' ? teamLabel : earlyLeader === 'team2' ? oppLabel : earlyLeader === 'even' ? '팽팽' : '기록없음'} (초반에 밀렸다가 뒤집었으면 높은 점수)`
    default:
      return ''
  }
}

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

function MilestoneButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, fontSize: 9, padding: '4px 4px', borderRadius: 4, cursor: 'pointer',
      border: `1px solid ${selected ? 'var(--gold-border)' : 'var(--border)'}`,
      background: selected ? 'var(--gold)' : 'var(--bg-card)',
      color: selected ? 'var(--bg-card)' : 'var(--text-secondary)',
      fontWeight: selected ? 800 : 500, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </button>
  )
}

function MilestoneSelect({ label, value, onChange, teamName, opponentName }: {
  label: string; value: NarrativeTeam | ''; onChange: (v: NarrativeTeam | '') => void; teamName: string; opponentName: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 44, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        <MilestoneButton selected={value === ''} onClick={() => onChange('')}>모름</MilestoneButton>
        <MilestoneButton selected={value === 'team1'} onClick={() => onChange('team1')}>{teamName}</MilestoneButton>
        <MilestoneButton selected={value === 'team2'} onClick={() => onChange('team2')}>{opponentName}</MilestoneButton>
      </div>
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
  firstDragonTeam: NarrativeTeam | ''
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
    firstBloodTeam: '', firstTowerTeam: '', firstDragonTeam: '', firstBaronTeam: '', fifthKillTeam: '', tenthKillTeam: '',
  }
}

function GameStatCard({ stat, teamName, onDelete, onEdit }: { stat: EsportsGameStat; teamName: string; onDelete: (id: string) => void; onEdit: (stat: EsportsGameStat) => void }) {
  const input = {
    team1Kills: stat.team1_kills ?? 0, team2Kills: stat.team2_kills ?? 0,
    team1Dragons: stat.team1_dragons ?? 0, team2Dragons: stat.team2_dragons ?? 0,
    team1Towers: stat.team1_towers ?? 0, team2Towers: stat.team2_towers ?? 0,
    team1Inhibitors: stat.team1_inhibitors ?? 0, team2Inhibitors: stat.team2_inhibitors ?? 0,
    team1Barons: stat.team1_barons ?? 0, team2Barons: stat.team2_barons ?? 0,
    winnerTeam: stat.winner_team ?? 'team1' as NarrativeTeam,
    firstBloodTeam: stat.first_blood_team, firstTowerTeam: stat.first_tower_team, firstDragonTeam: stat.first_dragon_team, firstBaronTeam: stat.first_baron_team,
    fifthKillTeam: stat.fifth_kill_team, tenthKillTeam: stat.tenth_kill_team,
    durationSeconds: stat.duration_seconds,
  }
  const narrative = classifyGameNarrative(input)
  const winScore = computeBothSidesPerfection(input)
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px', fontSize: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
          {stat.game_number}세트{stat.duration_seconds ? ` · ${Math.floor(stat.duration_seconds / 60)}:${String(stat.duration_seconds % 60).padStart(2, '0')}` : ''}
          <span style={{
            fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
            color: stat.source === 'golgg' ? 'var(--gold)' : 'var(--text-muted)',
            background: stat.source === 'golgg' ? 'var(--gold-bg)' : 'var(--bg-card)',
            border: `1px solid ${stat.source === 'golgg' ? 'var(--gold-border)' : 'var(--border)'}`,
          }}>
            {stat.source === 'golgg' ? 'gol.gg 자동' : '수동입력'}
          </span>
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onEdit(stat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <Pencil size={10} />
          </button>
          <button onClick={() => onDelete(stat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.6 }}>
        킬 {stat.team1_kills ?? '-'}:{stat.team2_kills ?? '-'} · 내셔 {stat.team1_barons ?? '-'}:{stat.team2_barons ?? '-'} · 드래곤 {stat.team1_dragons ?? '-'}:{stat.team2_dragons ?? '-'} · 타워 {stat.team1_towers ?? '-'}:{stat.team2_towers ?? '-'} · 억제기 {stat.team1_inhibitors ?? '-'}:{stat.team2_inhibitors ?? '-'}{stat.team1_gold != null ? ` · 골드 ${stat.team1_gold}k:${stat.team2_gold}k` : ''}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 4, padding: '2px 6px', marginBottom: 4 }}>
        플레이 점수 {winScore.team1} : {winScore.team2} <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({teamName} : {stat.team2_name}, 100점 만점)</span>
      </div>
      <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{narrative.detail}</div>
    </div>
  )
}

function RecentMatchRow({ teamId, teamName, game, displayA, displayB, scoreA, scoreB, teams, recordCount, teamCode, opponentCode }: {
  teamId: string; teamName: string; game: TeamGameRecord
  displayA?: string; displayB?: string; scoreA?: number; scoreB?: number
  teams: EsportsTeam[]; recordCount?: number
  teamCode?: string; opponentCode?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [sets, setSets] = useState<EsportsGameStat[] | null>(null)
  const [loadingSets, setLoadingSets] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<GameStatForm>(() => emptyGameStatForm(1))
  const [saving, setSaving] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  // 상대팀도 우리가 추적 중인 팀이면(예: DK도 esports_teams에 있으면) 그쪽 team_id도 찾아둔다.
  // 세트 저장 시 양쪽에 다 기록해야 상대팀 체급 점수에도 이 경기가 반영된다.
  const opponentTeamId = useMemo(() => teams.find(t => teamNameMatches(t, game.opponent))?.id ?? null, [teams, game.opponent])
  // 기록 입력 폼에서는 풀네임 대신 약자(코드)를 쓴다. 코드가 없으면 풀네임으로 폴백.
  const teamLabel = teamCode || teamName
  const oppLabel = opponentCode || game.opponent

  async function loadSets() {
    setLoadingSets(true)
    // gol.gg 자동수집 데이터는 상대팀 표기(예: "Gen.G")와 날짜만 있고 정확한 시각/lolesports 표기명("Gen.G Esports")과
    // 일치하지 않으므로, 날짜 ±1일 범위 + 느슨한 팀명 매칭(teamNameMatches)으로 찾는다.
    // 수동 입력 데이터(정확한 team2_name/match_start_time)도 이 범위 안에 포함되므로 함께 잡힌다.
    const dayStart = dayjs(game.startTime).subtract(1, 'day').startOf('day').toISOString()
    const dayEnd = dayjs(game.startTime).add(1, 'day').endOf('day').toISOString()
    const { data } = await supabase.from('esports_game_stats').select('*')
      .eq('team_id', teamId)
      .gte('match_start_time', dayStart)
      .lte('match_start_time', dayEnd)
      .order('game_number')
    const all = (data as EsportsGameStat[]) ?? []
    const filtered = all.filter(s => teamNameMatches({ name: s.team2_name }, game.opponent) || teamNameMatches({ name: game.opponent }, s.team2_name))
    setSets(filtered)
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

  function openEditForm(stat: EsportsGameStat) {
    const toStr = (v: number | null) => v == null ? '' : String(v)
    setForm({
      gameNumber: stat.game_number,
      durationMin: stat.duration_seconds != null ? String(Math.floor(stat.duration_seconds / 60)) : '',
      durationSec: stat.duration_seconds != null ? String(stat.duration_seconds % 60) : '',
      team1Kills: toStr(stat.team1_kills), team2Kills: toStr(stat.team2_kills),
      team1Dragons: toStr(stat.team1_dragons), team2Dragons: toStr(stat.team2_dragons),
      team1Towers: toStr(stat.team1_towers), team2Towers: toStr(stat.team2_towers),
      team1Inhibitors: toStr(stat.team1_inhibitors), team2Inhibitors: toStr(stat.team2_inhibitors),
      team1Barons: toStr(stat.team1_barons), team2Barons: toStr(stat.team2_barons),
      winnerTeam: stat.winner_team ?? 'team1',
      firstBloodTeam: stat.first_blood_team ?? '', firstTowerTeam: stat.first_tower_team ?? '',
      firstDragonTeam: stat.first_dragon_team ?? '', firstBaronTeam: stat.first_baron_team ?? '',
      fifthKillTeam: stat.fifth_kill_team ?? '', tenthKillTeam: stat.tenth_kill_team ?? '',
    })
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
      first_dragon_team: form.firstDragonTeam || null,
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

    // 상대팀도 추적 중인 팀이면, 상대팀 관점(team1=상대팀)으로 뒤집어서 똑같이 저장.
    // 이걸 안 하면 상대팀은 이 경기가 체급 점수 계산에 아예 안 잡힌다.
    if (opponentTeamId) {
      const flip = (v: NarrativeTeam | null) => v === 'team1' ? 'team2' : v === 'team2' ? 'team1' : null
      const mirrorPayload = {
        team_id: opponentTeamId, team2_name: teamName, match_start_time: game.startTime, game_number: form.gameNumber,
        duration_seconds: duration,
        team1_kills: payload.team2_kills, team2_kills: payload.team1_kills,
        team1_dragons: payload.team2_dragons, team2_dragons: payload.team1_dragons,
        team1_towers: payload.team2_towers, team2_towers: payload.team1_towers,
        team1_inhibitors: payload.team2_inhibitors, team2_inhibitors: payload.team1_inhibitors,
        team1_barons: payload.team2_barons, team2_barons: payload.team1_barons,
        winner_team: flip(payload.winner_team as NarrativeTeam),
        first_blood_team: flip(payload.first_blood_team as NarrativeTeam | null),
        first_tower_team: flip(payload.first_tower_team as NarrativeTeam | null),
        first_dragon_team: flip(payload.first_dragon_team as NarrativeTeam | null),
        first_baron_team: flip(payload.first_baron_team as NarrativeTeam | null),
        fifth_kill_team: flip(payload.fifth_kill_team as NarrativeTeam | null),
        tenth_kill_team: flip(payload.tenth_kill_team as NarrativeTeam | null),
        source: 'manual',
      }
      await supabase.from('esports_game_stats').upsert(mirrorPayload, { onConflict: 'team_id,team2_name,match_start_time,game_number' })
    }
    setSaving(false)
  }

  async function deleteSet(id: string) {
    const target = (sets ?? []).find(s => s.id === id)
    await supabase.from('esports_game_stats').delete().eq('id', id)
    setSets(prev => (prev ?? []).filter(s => s.id !== id))
    if (target && opponentTeamId) {
      await supabase.from('esports_game_stats').delete()
        .eq('team_id', opponentTeamId).eq('team2_name', teamName)
        .eq('match_start_time', game.startTime).eq('game_number', target.game_number)
    }
  }

  // 세트별 서사 판정 + 세트별(개별) 양쪽 관점 세부 지표를 만든다 (시리즈 전체 평균은 노이즈가 껴서 안 씀, 순수 로직/AI 없음)
  const seriesAnalysis = useMemo(() => {
    if (!sets || sets.length === 0) return null
    const perSet = sets.map(s => {
      const input = {
        team1Kills: s.team1_kills ?? 0, team2Kills: s.team2_kills ?? 0,
        team1Dragons: s.team1_dragons ?? 0, team2Dragons: s.team2_dragons ?? 0,
        team1Towers: s.team1_towers ?? 0, team2Towers: s.team2_towers ?? 0,
        team1Inhibitors: s.team1_inhibitors ?? 0, team2Inhibitors: s.team2_inhibitors ?? 0,
        team1Barons: s.team1_barons ?? 0, team2Barons: s.team2_barons ?? 0,
        winnerTeam: s.winner_team ?? 'team1' as NarrativeTeam,
        firstBloodTeam: s.first_blood_team, firstTowerTeam: s.first_tower_team,
        firstDragonTeam: s.first_dragon_team, firstBaronTeam: s.first_baron_team,
        fifthKillTeam: s.fifth_kill_team, tenthKillTeam: s.tenth_kill_team,
        durationSeconds: s.duration_seconds,
      }
      return {
        gameNumber: s.game_number,
        narrative: classifyGameNarrative(input),
        winnerTeam: s.winner_team,
        both: computeBothSidesScores(input),
        perfection: computeBothSidesPerfection(input),
        stat: s,
      }
    })
    const sum = (key: 'team1_kills' | 'team2_kills' | 'team1_dragons' | 'team2_dragons' | 'team1_towers' | 'team2_towers' | 'team1_barons' | 'team2_barons') =>
      sets.reduce((acc, s) => acc + (s[key] ?? 0), 0)
    const ourWins = sets.filter(s => s.winner_team === 'team1').length
    const oppWins = sets.length - ourWins

    return { perSet, ourWins, oppWins,
      kills: { our: sum('team1_kills'), opp: sum('team2_kills') },
      dragons: { our: sum('team1_dragons'), opp: sum('team2_dragons') },
      towers: { our: sum('team1_towers'), opp: sum('team2_towers') },
      barons: { our: sum('team1_barons'), opp: sum('team2_barons') },
    }
  }, [sets])

  const headerA = displayA ?? teamName
  const headerB = displayB ?? game.opponent
  const hScoreA = scoreA ?? game.teamScore
  const hScoreB = scoreB ?? game.oppScore

  return (
    <div>
      <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '5px 8px', background: 'var(--bg-card)', borderRadius: 6, cursor: 'pointer' }}>
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        <span style={{ color: 'var(--text-muted)', width: 50, flexShrink: 0 }}>{dayjs(game.startTime).format('MM/DD')}</span>
        <span style={{ flex: 1, textAlign: 'right', fontWeight: hScoreA > hScoreB ? 800 : 400 }}>{headerA}</span>
        <span style={{ fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{hScoreA} : {hScoreB}</span>
        {recordCount != null && (
          recordCount > 0
            ? <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>입력됨 {recordCount}</span>
            : <span style={{ fontSize: 8, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>미입력</span>
        )}
        <span style={{ flex: 1, fontWeight: hScoreB > hScoreA ? 800 : 400 }}>{headerB}</span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 8px 8px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loadingSets && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>불러오는 중...</div>}
          {!loadingSets && sets && sets.map(s => (
            <GameStatCard key={s.id} stat={s} teamName={teamName} onDelete={deleteSet} onEdit={openEditForm} />
          ))}
          {!loadingSets && sets && sets.length === 0 && !showForm && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>기록된 세트가 없습니다. 아래에서 세트별로 입력해 주세요.</div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            {!showForm && (
              <button onClick={openAddForm} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={10} /> 세트 기록 추가
              </button>
            )}
            {sets && sets.length > 0 && (
              <button onClick={() => setShowAnalysis(v => !v)} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={10} /> {showAnalysis ? '분석 닫기' : '분석 보기'}
              </button>
            )}
          </div>
          {showAnalysis && seriesAnalysis && (
            <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: 10, fontSize: 11 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                시리즈 스코어 {seriesAnalysis.ourWins} : {seriesAnalysis.oppWins} ({teamName} 관점)
              </div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6 }}>
                합계 — 킬 {seriesAnalysis.kills.our}:{seriesAnalysis.kills.opp} · 내셔 {seriesAnalysis.barons.our}:{seriesAnalysis.barons.opp} · 드래곤 {seriesAnalysis.dragons.our}:{seriesAnalysis.dragons.opp} · 타워 {seriesAnalysis.towers.our}:{seriesAnalysis.towers.opp}
              </div>

              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8 }}>
                아래는 세트별 개별 비교입니다 (시리즈 전체를 평균내면 세트마다 다른 흐름이 뭉개져서, 세트 단위로 따로 계산했어요). 왼쪽 = {teamName}, 오른쪽 = {game.opponent}.
              </div>

              {seriesAnalysis.perSet.map(p => (
                <div key={p.gameNumber} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--gold-border)' }}>
                  <div style={{ marginBottom: 4 }}>
                    <b>{p.gameNumber}세트</b> · ({p.winnerTeam === 'team1' ? teamName : game.opponent} 승)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>플레이 점수</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: p.perfection.team1 >= p.perfection.team2 ? 'var(--gold)' : 'var(--text-primary)' }}>{p.perfection.team1}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{teamName}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>:</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: p.perfection.team2 >= p.perfection.team1 ? 'var(--gold)' : 'var(--text-primary)' }}>{p.perfection.team2}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{game.opponent}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>(100점 만점)</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {([
                      ['라인전', 'laning', p.both.team1.laning, p.both.team2.laning],
                      ['오브젝트', 'objective', p.both.team1.objectiveControl, p.both.team2.objectiveControl],
                      ['교전', 'teamfight', p.both.team1.teamfight, p.both.team2.teamfight],
                      ['운영', 'macro', p.both.team1.macro, p.both.team2.macro],
                      ['마무리', 'closing', p.both.team1.closing, p.both.team2.closing],
                    ] as [string, string, number, number][]).map(([label, key, t1, t2]) => {
                      const total = t1 + t2 || 1
                      const tooltip = metricTooltip(key, p.stat, teamName, game.opponent, p.narrative.earlyLeader)
                      return (
                        <div key={label} title={tooltip} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'help' }}>
                          <span style={{ width: 52, flexShrink: 0, color: 'var(--text-secondary)', borderBottom: '1px dotted var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
                          <span style={{ width: 22, textAlign: 'right', fontWeight: 700, color: t1 >= t2 ? 'var(--text-primary)' : 'var(--text-muted)', flexShrink: 0 }}>{t1.toFixed(1)}</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
                            <div style={{ width: `${(t1 / total) * 100}%`, background: 'var(--gold)' }} />
                            <div style={{ width: `${(t2 / total) * 100}%`, background: 'var(--border)' }} />
                          </div>
                          <span style={{ width: 22, textAlign: 'left', fontWeight: 700, color: t2 >= t1 ? 'var(--text-primary)' : 'var(--text-muted)', flexShrink: 0 }}>{t2.toFixed(1)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showForm && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700 }}>{form.gameNumber}세트 기록 {sets?.some(s => s.game_number === form.gameNumber) ? '수정' : '입력'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 46 }}>게임시간</span>
                <input value={form.durationMin} onChange={e => setForm(f => ({ ...f, durationMin: e.target.value.replace(/[^0-9]/g, '') }))}
                  placeholder="분" inputMode="numeric" style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>분</span>
                <input value={form.durationSec} onChange={e => setForm(f => ({ ...f, durationSec: e.target.value.replace(/[^0-9]/g, '') }))}
                  placeholder="초" inputMode="numeric" style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>초</span>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {/* 좌측: 킬/내셔/드래곤/타워/억제기 숫자 입력 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 46, flexShrink: 0 }} />
                    <span style={{ width: 40, fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamLabel}</span>
                    <span style={{ width: 9 }} />
                    <span style={{ width: 40, fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oppLabel}</span>
                  </div>
                  <StatPairInput label="킬" valueA={form.team1Kills} valueB={form.team2Kills} onChangeA={v => setForm(f => ({ ...f, team1Kills: v }))} onChangeB={v => setForm(f => ({ ...f, team2Kills: v }))} />
                  <StatPairInput label="내셔" valueA={form.team1Barons} valueB={form.team2Barons} onChangeA={v => setForm(f => ({ ...f, team1Barons: v }))} onChangeB={v => setForm(f => ({ ...f, team2Barons: v }))} />
                  <StatPairInput label="드래곤" valueA={form.team1Dragons} valueB={form.team2Dragons} onChangeA={v => setForm(f => ({ ...f, team1Dragons: v }))} onChangeB={v => setForm(f => ({ ...f, team2Dragons: v }))} />
                  <StatPairInput label="타워" valueA={form.team1Towers} valueB={form.team2Towers} onChangeA={v => setForm(f => ({ ...f, team1Towers: v }))} onChangeB={v => setForm(f => ({ ...f, team2Towers: v }))} />
                  <StatPairInput label="억제기" valueA={form.team1Inhibitors} valueB={form.team2Inhibitors} onChangeA={v => setForm(f => ({ ...f, team1Inhibitors: v }))} onChangeB={v => setForm(f => ({ ...f, team2Inhibitors: v }))} />
                </div>
                {/* 우측: 첫킬/첫드래곤/첫타워/첫내셔/5킬선취/10킬선취 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <MilestoneSelect label="첫 킬" value={form.firstBloodTeam} onChange={v => setForm(f => ({ ...f, firstBloodTeam: v }))} teamName={teamLabel} opponentName={oppLabel} />
                  <MilestoneSelect label="첫 드래곤" value={form.firstDragonTeam} onChange={v => setForm(f => ({ ...f, firstDragonTeam: v }))} teamName={teamLabel} opponentName={oppLabel} />
                  <MilestoneSelect label="첫 타워" value={form.firstTowerTeam} onChange={v => setForm(f => ({ ...f, firstTowerTeam: v }))} teamName={teamLabel} opponentName={oppLabel} />
                  <MilestoneSelect label="첫 내셔" value={form.firstBaronTeam} onChange={v => setForm(f => ({ ...f, firstBaronTeam: v }))} teamName={teamLabel} opponentName={oppLabel} />
                  <MilestoneSelect label="5킬 선취" value={form.fifthKillTeam} onChange={v => setForm(f => ({ ...f, fifthKillTeam: v }))} teamName={teamLabel} opponentName={oppLabel} />
                  <MilestoneSelect label="10킬 선취" value={form.tenthKillTeam} onChange={v => setForm(f => ({ ...f, tenthKillTeam: v }))} teamName={teamLabel} opponentName={oppLabel} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>승리팀</span>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  <MilestoneButton selected={form.winnerTeam === 'team1'} onClick={() => setForm(f => ({ ...f, winnerTeam: 'team1' }))}>{teamLabel}</MilestoneButton>
                  <MilestoneButton selected={form.winnerTeam === 'team2'} onClick={() => setForm(f => ({ ...f, winnerTeam: 'team2' }))}>{oppLabel}</MilestoneButton>
                </div>
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

function LeagueView({ code, label }: { code: string; label: string }) {
  const [teams, setTeams] = useState<EsportsTeam[]>([])
  const [events, setEvents] = useState<RawScheduleEvent[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(false)
  const [powerScores, setPowerScores] = useState<Record<string, TeamPowerScore>>({})
  const [powerLoading, setPowerLoading] = useState(false)

  // 팀별 체급 점수 계산: 수동 입력된(source='manual') 세트 기록을 팀별로 묶어서 computeTeamPowerScore에 넣는다
  async function loadPowerScores(teamsList: EsportsTeam[]) {
    if (teamsList.length === 0) { setPowerScores({}); return }
    setPowerLoading(true)
    try {
      const { data } = await supabase.from('esports_game_stats').select('*')
        .in('team_id', teamsList.map(t => t.id))
        .eq('source', 'manual')
        .order('match_start_time', { ascending: false })
      const rows = (data as EsportsGameStat[]) ?? []
      const byTeam: Record<string, EsportsGameStat[]> = {}
      for (const r of rows) {
        if (!byTeam[r.team_id]) byTeam[r.team_id] = []
        byTeam[r.team_id].push(r)
      }

      // 세트를 시리즈(같은 상대+같은 날짜) 단위로 묶어서, 그 시리즈가 스윕(2-0/3-0)이었는지만 판별한다.
      // 체급 점수 자체는 세트 단위로 계산하되, "스윕승 세트"라는 태그만 시리즈에서 가져온다.
      const toSets = (statRows: EsportsGameStat[]) => {
        const groups: Record<string, EsportsGameStat[]> = {}
        for (const s of statRows) {
          const key = `${s.team2_name}|${s.match_start_time}`
          if (!groups[key]) groups[key] = []
          groups[key].push(s)
        }
        const result: (SetRecordForPower & { opponent: string })[] = []
        for (const sets of Object.values(groups)) {
          const team1Wins = sets.filter(s => s.winner_team === 'team1').length
          const team2Wins = sets.length - team1Wins
          const winnerTeam: NarrativeTeam = team1Wins >= team2Wins ? 'team1' : 'team2'
          const seriesSweep = (winnerTeam === 'team1' && team2Wins === 0) || (winnerTeam === 'team2' && team1Wins === 0)
          for (const s of sets) {
            const playScore = computePerfectionScore({
              team1Kills: s.team1_kills ?? 0, team2Kills: s.team2_kills ?? 0,
              team1Dragons: s.team1_dragons ?? 0, team2Dragons: s.team2_dragons ?? 0,
              team1Towers: s.team1_towers ?? 0, team2Towers: s.team2_towers ?? 0,
              team1Inhibitors: s.team1_inhibitors ?? 0, team2Inhibitors: s.team2_inhibitors ?? 0,
              team1Barons: s.team1_barons ?? 0, team2Barons: s.team2_barons ?? 0,
              winnerTeam: s.winner_team ?? 'team1' as NarrativeTeam,
              firstBloodTeam: s.first_blood_team, firstTowerTeam: s.first_tower_team,
              firstDragonTeam: s.first_dragon_team, firstBaronTeam: s.first_baron_team,
              fifthKillTeam: s.fifth_kill_team, tenthKillTeam: s.tenth_kill_team,
              durationSeconds: s.duration_seconds,
            })
            const daysAgo = s.match_start_time != null ? dayjs().diff(dayjs(s.match_start_time), 'day') : 0
            result.push({ won: s.winner_team === 'team1', playScore, seriesSweep, daysAgo, opponent: s.team2_name })
          }
        }
        return result
      }

      const setsByTeam: Record<string, ReturnType<typeof toSets>> = {}
      for (const t of teamsList) setsByTeam[t.id] = toSets(byTeam[t.id] ?? [])

      // 1단계: 상대 체급을 모른 채로, 순수 실적(플레이 점수+승률+스윕비율)만으로 사전 점수 계산
      const priors: Record<string, number> = {}
      for (const t of teamsList) priors[t.id] = computeTeamPriorScore(setsByTeam[t.id]).powerScore

      // 2단계: 각 세트의 상대팀 사전 점수를 붙여서, 이변 보정된 최종 체급 점수 계산
      const scores: Record<string, TeamPowerScore> = {}
      for (const t of teamsList) {
        const sets = setsByTeam[t.id].map(r => {
          const oppTeam = teamsList.find(tt => teamNameMatches(tt, r.opponent))
          return { ...r, opponentPriorScore: oppTeam ? priors[oppTeam.id] : undefined }
        })
        scores[t.id] = computeTeamPowerScore(sets, priors[t.id])
      }
      setPowerScores(scores)
    } finally {
      setPowerLoading(false)
    }
  }

  async function load() {
    const { data: teamData } = await supabase.from('esports_teams').select('*').eq('league', code).order('sort_order').order('created_at')
    const teamsList = (teamData as EsportsTeam[]) ?? []
    setTeams(teamsList)
    loadPowerScores(teamsList)
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

  const rankedTeams = useMemo(() =>
    [...teams].sort((a, b) => (powerScores[b.id]?.powerScore ?? 50) - (powerScores[a.id]?.powerScore ?? 50)),
  [teams, powerScores])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>{label}</h2>
        <button onClick={() => loadEvents(true)} disabled={eventsLoading} className="btn btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={12} style={{ animation: eventsLoading ? 'spin 1s linear infinite' : undefined }} /> 일정 새로고침
        </button>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <RecentMatchesPanel leagueCode={code} events={events} loading={eventsLoading} error={eventsError} teams={teams} />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <UpcomingPanel events={events} loading={eventsLoading} error={eventsError} teams={teams} powerScores={powerScores} />
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>
              팀 체급 점수 <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>· 수동 입력한 경기(최근일수록 가중치 ↑) 기반, 승부 예측에 사용됨</span>
            </div>
            {powerLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>계산 중...</div>}
            {!powerLoading && rankedTeams.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>등록된 팀이 없습니다.</div>}
            {!powerLoading && rankedTeams.map(t => {
              const ps = powerScores[t.id]
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6, marginBottom: 4 }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>{t.name}</span>
                  {ps && ps.gamesAnalyzed > 0 ? (
                    <>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{ps.gamesAnalyzed}경기 · 승률 {(ps.winRate * 100).toFixed(0)}%</span>
                      <span style={{ fontWeight: 800, color: 'var(--gold)', width: 40, textAlign: 'right' }}>{ps.powerScore.toFixed(1)}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>입력된 경기 없음 (기본값 50.0)</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
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

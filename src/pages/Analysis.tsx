import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, ExternalLink, RefreshCw, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  LEAGUES, fetchScheduleEvents, extractTeamData, computeForm, matchupProbability, filterRecentGames,
  seriesScoreProbabilities, seriesOutcomeSummary, teamNameMatches, findTeamCode,
  classifyGameNarrative, computeBothSidesScores, computeBothSidesPerfection, computePerfectionScore,
  simulateLeagueElo, powerScoreMatchupProbability, manualEventToRawEvent, computeMatchAdjustments,
  getLastLiveFetchAt,
  type RawScheduleEvent, type TeamGameRecord, type NarrativeTeam, type TeamPowerScore, type EloMatchRecord, type EloGameLog, type ManualEsportsEvent,
  type SeriesOutcomeSummary, type ScoreProb, type DetailedGameEntry, type MatchAdjustmentResult,
} from '../lib/lolEsports'

interface EsportsTeam {
  id: string; league: string; name: string; comment: string; sort_order: number
  namuwiki_url: string | null; namuwiki_last_checked: string | null; namuwiki_changed: boolean
  gpr_score: number | null
  code: string | null
}

// "마지막 API 호출" 신선도 표시용: 언제 호출했는지 + 얼마나 오래됐는지에 따른 색상
function formatFreshness(lastFetchAt: number | null, now: number): { text: string; color: string } {
  if (lastFetchAt == null) return { text: '호출 기록 없음', color: 'var(--text-muted)' }
  const ageMs = now - lastFetchAt
  const ageMin = Math.floor(ageMs / 60000)
  let text: string
  if (ageMin < 1) text = '방금 전'
  else if (ageMin < 60) text = `${ageMin}분 전`
  else {
    const ageHour = Math.floor(ageMin / 60)
    text = ageHour < 24 ? `${ageHour}시간 전` : `${Math.floor(ageHour / 24)}일 전`
  }
  const color =
    ageMs < 12 * 60 * 60 * 1000 ? 'var(--green, #4ade80)' :   // 12시간 이내: 신선
    ageMs < 24 * 60 * 60 * 1000 ? '#facc15' :                  // 24시간 이내: 보통
    'var(--red, #f87171)'                                       // 24시간 초과: 오래됨
  return { text: `마지막 호출: ${text}`, color }
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
  side_swapped: boolean
}

// 리그 목록 안에서 어느 팀이 우리가 추적 중인 팀(esports_teams)인지 찾아서
// {teamId, teamName, opponent} 형태로 반환. 세트 기록 입력/저장은 이 팀의 관점(team1)으로 저장된다.
function resolveMatchTeam(teams: EsportsTeam[], teamAName: string, teamBName: string, codeA?: string, codeB?: string): { teamId: string; teamName: string; opponent: string; isA: boolean } | null {
  // 코드(약자)가 있으면 최우선으로 신뢰한다. lolesports API가 name 필드는 부정확하게 내려주는 경우가
  // 있어서(예: 한 이벤트의 name이 다른 팀 이름과 우연히 같게 나옴), 코드로 먼저 찾아지면 그걸로 확정하고
  // 절대 name 기반 매칭으로 넘어가지 않는다 — name 매칭이 엉뚱한 팀을 잘못 집는 걸 원천 차단.
  const aByCode = codeA ? teams.find(t => teamNameMatches(t, codeA)) : undefined
  const a = aByCode ?? teams.find(t => teamNameMatches(t, teamAName))
  if (a) return { teamId: a.id, teamName: a.name, opponent: teamBName, isA: true }
  const bByCode = codeB ? teams.find(t => teamNameMatches(t, codeB)) : undefined
  const b = bByCode ?? teams.find(t => teamNameMatches(t, teamBName))
  if (b) return { teamId: b.id, teamName: b.name, opponent: teamAName, isA: false }
  return null
}

// ─── 중앙: 최근 경기 (클릭하면 바로 펼쳐져서 세트 기록 입력 + 분석 가능) ──
function RecentMatchesPanel({ leagueCode, events, loading, error, errorDetail, teams, onTeamCreated }: { leagueCode: string; events: RawScheduleEvent[] | null; loading: boolean; error: boolean; errorDetail?: string; teams: EsportsTeam[]; onTeamCreated: (team: EsportsTeam) => void }) {
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

  // 아직 추적 중이 아닌 팀(둘 다 미등록)이 나온 경기는, 어느 팀 관점으로 기록을 입력할지만 골라두고
  // (DB에 아무것도 안 씀) 실제 팀 등록은 첫 세트를 저장하는 순간에만 이뤄진다(RecentMatchRow.saveSet).
  const [trackingChoice, setTrackingChoice] = useState<Record<string, string>>({})

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
      {!loading && matches.length === 0 && error && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
          최근 경기 데이터를 가져올 수 없습니다 (외부 API 접속 제한일 수 있음). 아래 &quot;경기 수동 추가&quot;에서 직접 입력할 수 있어요.
          {errorDetail && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{errorDetail}</div>}
        </div>
      )}
      {!loading && matches.length === 0 && !error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>최근 완료된 경기가 없습니다</div>}
      {!loading && matches.length > 0 && (
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
              const chosenName = trackingChoice[m.id]
              if (!chosenName) {
                // 자동 매칭 실패 — 아직 추적 중인 팀이 하나도 없는 경기. 여기서는 절대 팀을 등록하지 않고,
                // 어느 팀 관점으로 기록을 입력할지만 고르게 한다. 실제 등록은 첫 세트를 저장할 때 일어난다.
                return (
                  <div key={m.id} style={{ padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 58 }}>{dayjs(m.startTime).format('MM/DD HH:mm')}</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>{m.codeA || m.teamA}</span>
                      <span style={{ fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{m.scoreA} : {m.scoreB}</span>
                      <span style={{ flex: 1 }}>{m.codeB || m.teamB}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button onClick={() => setTrackingChoice(prev => ({ ...prev, [m.id]: m.teamA }))} className="btn btn-ghost" style={{ flex: 1, fontSize: 9, padding: '4px 4px' }}>
                        {m.codeA || m.teamA} 관점으로 입력
                      </button>
                      <button onClick={() => setTrackingChoice(prev => ({ ...prev, [m.id]: m.teamB }))} className="btn btn-ghost" style={{ flex: 1, fontSize: 9, padding: '4px 4px' }}>
                        {m.codeB || m.teamB} 관점으로 입력
                      </button>
                    </div>
                    {teams.length > 0 && (
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
                        <option value="">또는 이미 등록된 팀에 매칭하기 (이름 표기가 다른 경우)</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </div>
                )
              }
              // 관점을 골랐으면(아직 DB엔 등록 안 됨) 바로 기록 입력 화면으로 — 첫 세트를 저장하는 순간에만 팀이 등록된다.
              const isA = chosenName === m.teamA
              const pendingTeamScore = isA ? m.scoreA : m.scoreB
              const pendingOppScore = isA ? m.scoreB : m.scoreA
              const codeA0 = m.codeA || m.teamA
              const codeB0 = m.codeB || m.teamB
              return (
                <RecentMatchRow key={m.id} teamId={null} pendingTeamName={chosenName} leagueCode={leagueCode} onTeamCreated={onTeamCreated}
                  teamName={chosenName}
                  game={{ opponent: isA ? m.teamB : m.teamA, teamScore: pendingTeamScore, oppScore: pendingOppScore, startTime: m.startTime, bestOf: m.bestOf }}
                  displayA={codeA0} displayB={codeB0} scoreA={m.scoreA} scoreB={m.scoreB} teams={teams}
                  recordCount={0}
                  teamCode={isA ? codeA0 : codeB0} opponentCode={isA ? codeB0 : codeA0} />
              )
            }
            const teamScore = resolved.isA ? m.scoreA : m.scoreB
            const oppScore = resolved.isA ? m.scoreB : m.scoreA
            const codeA = m.codeA || m.teamA
            const codeB = m.codeB || m.teamB
            // "입력됨 N" 배지: 상대팀 이름/코드로 다시 대조하지 않고 날짜(±1일)만으로 판단한다.
            // lolesports API가 이름/코드 필드를 이 경기에서만 다르게 내려주는 경우가 있어서, 그걸 기준으로
            // 재확인하려고 할 때마다 미묘하게 다른 이유로 계속 실패했다 (실제로는 기록이 있는데도 "미입력"으로
            // 잘못 표시됨). team_id + 날짜만으로도 이 팀이 그 날짜 즈음 치른 경기는 사실상 하나뿐이라 충분히
            // 안전하고, match_start_time은 이름/코드와 달리 항상 신뢰할 수 있다.
            const recordCount = (recordedByTeam[resolved.teamId] ?? []).filter(s => {
              const d = dayjs(s.match_start_time)
              return d.isAfter(dayjs(m.startTime).subtract(1, 'day')) && d.isBefore(dayjs(m.startTime).add(1, 'day'))
            }).length
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

// (구) 확률 → 눈대중 배당 변환 함수는 더 이상 화면에 배당을 노출하지 않기로 하면서 제거했다.
// 필요하면 git 이력에서 toBookOdds(prob, marginPct)로 복원 가능.

// "예상 스코어"를 순수하게 확률이 제일 높은 개별 스코어로 고르면, p>0.5인 이상 수학적으로
// 항상 강팀의 스윕 스코어(예: 2:0)가 근소하게 1위로 나온다 — 아무리 박빙이어도 그렇다.
// 그래서 그 대신 "강팀이 스윕할 확률(favSweepProb)"과 "약팀이 최소 한 세트는 따낼 확률
// (underAtLeastOneGameProb = 1 - favSweepProb)"을 직접 비교해서, 후자가 더 크면(=진짜 스윕이라고
// 보기 어려운 매치업이면) 스코어를 한 칸 좁혀(예: 2:1) 보여준다.
function predictedScoreLabel(bestOf: number, outcome: SeriesOutcomeSummary, scoreProbs: ScoreProb[], teamACode: string, teamBCode: string): { label: string; score: string; prob: number } {
  const bo = bestOf && bestOf > 1 ? bestOf : 1
  if (bo === 1) {
    const top = scoreProbs[0]
    return { label: top.winner === 'A' ? teamACode : teamBCode, score: top.score, prob: top.prob }
  }
  const favLabel = outcome.favIsA ? teamACode : teamBCode
  const favLetter: 'A' | 'B' = outcome.favIsA ? 'A' : 'B'
  if (outcome.favSweepProb >= outcome.underAtLeastOneGameProb) {
    return { label: favLabel, score: outcome.sweepScore, prob: outcome.favSweepProb }
  }
  const nextBest = scoreProbs
    .filter(sp => sp.winner === favLetter && sp.score !== outcome.sweepScore)
    .sort((a, b) => b.prob - a.prob)[0]
  return { label: favLabel, score: nextBest?.score ?? outcome.sweepScore, prob: nextBest?.prob ?? outcome.favSweepProb }
}

function UpcomingRow({ event, events, teams, powerScores, abilityProfiles, powerLog, detailedLog }: {
  event: RawScheduleEvent; events: RawScheduleEvent[]; teams: EsportsTeam[]; powerScores: Record<string, TeamPowerScore>
  abilityProfiles: Record<string, AbilityProfile>; powerLog: Record<string, EloGameLog[]>; detailedLog: DetailedGameEntry[]
}) {
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

  // 부가 신호(직접맞대결/모멘텀/세트순서/오브젝트/공통상대) 보정 — 체급 점수가 둘 다 있을 때만 의미가 있다
  const adjustment: MatchAdjustmentResult | null = useMemo(() => {
    if (!idA || !idB) return null
    const flatLog = [...(powerLog[idA] ?? []), ...(powerLog[idB] ?? [])]
    return computeMatchAdjustments(idA, idB, flatLog, detailedLog)
  }, [idA, idB, powerLog, detailedLog])

  const p = usePower && powerA && powerB
    ? powerScoreMatchupProbability(powerA.powerScore + (adjustment?.totalPoints ?? 0), powerB.powerScore)
    : matchupProbability(formA, formB)
  const scoreProbs = seriesScoreProbabilities(p, bestOf)

  // 강팀/약팀 시리즈 확률 비교 (BO1은 스윕 개념이 의미 없으므로 BO3 한정으로만 표시)
  const outcome = seriesOutcomeSummary(p, bestOf)
  const favLabel = outcome.favIsA ? (teamA?.code || teamA?.name) : (teamB?.code || teamB?.name)
  const underLabel = outcome.favIsA ? (teamB?.code || teamB?.name) : (teamA?.code || teamA?.name)

  const scorePred = predictedScoreLabel(bestOf, outcome, scoreProbs, teamA?.code || teamA?.name || '', teamB?.code || teamB?.name || '')

  // 세트당 예상 게임시간·총 킬수: 강팀 승리 시 스탯과 약팀 패배 시 스탯을 강팀 승률만큼,
  // 약팀 승리 시 스탯과 강팀 패배 시 스탯을 약팀 승률만큼 가중평균
  const favId = outcome.favIsA ? idA : idB
  const dogId = outcome.favIsA ? idB : idA
  const favAp = favId ? abilityProfiles[favId] : undefined
  const dogAp = dogId ? abilityProfiles[dogId] : undefined
  const setPrediction = predictSetStats(favAp, dogAp, outcome.favIsA ? p : 1 - p)

  const isToday = dayjs(event.startTime).isSame(dayjs(), 'day')
  const isTomorrow = dayjs(event.startTime).isSame(dayjs().add(1, 'day'), 'day')
  const dateBadge = isToday ? '오늘' : isTomorrow ? '내일' : null

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, border: dateBadge ? '1px solid var(--gold-border)' : '1px solid transparent', padding: '8px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>{dayjs(event.startTime).format('MM/DD HH:mm')}</span>
        {dateBadge && (
          <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--bg-card)', background: 'var(--gold)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>{dateBadge}</span>
        )}
        <span style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>{teamA?.code || teamA?.name}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>BO{bestOf}</span>
        <span style={{ flex: 1, fontWeight: 700 }}>{teamB?.code || teamB?.name}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
        예측 승률 <b style={{ color: 'var(--text-secondary)' }}>{(p * 100).toFixed(0)}%</b> : <b style={{ color: 'var(--text-secondary)' }}>{((1 - p) * 100).toFixed(0)}%</b>
        {' · '}예상 스코어 <b style={{ color: 'var(--gold)' }}>{scorePred.label} {scorePred.score}</b> ({(scorePred.prob * 100).toFixed(0)}%)
        {usePower && powerA && powerB
          ? <div style={{ marginTop: 2 }}>최근 폼 점수 기반 · {teamA?.code || teamA?.name} {powerA.powerScore.toFixed(1)} : {powerB.powerScore.toFixed(1)} {teamB?.code || teamB?.name}</div>
          : <div style={{ marginTop: 2 }}>최근 폼 점수 데이터 부족 · lolesports 전적 기반 폴백</div>}
        {usePower && adjustment && adjustment.items.length > 0 && (
          <div style={{ marginTop: 2, fontSize: 9 }} title={adjustment.items.map(i => `${i.label}: ${i.points >= 0 ? '+' : ''}${i.points.toFixed(1)}점 (${i.detail})`).join(' / ')}>
            부가 신호 보정 <span style={{ color: adjustment.totalPoints >= 0 ? 'var(--green, #4ade80)' : 'var(--red, #f87171)', fontWeight: 700 }}>
              {adjustment.totalPoints >= 0 ? '+' : ''}{adjustment.totalPoints.toFixed(1)}점 ({teamA?.code || teamA?.name} 기준)
            </span>
            <span style={{ color: 'var(--text-muted)' }}> — {adjustment.items.map(i => i.label).join(', ')}</span>
          </div>
        )}
        {(setPrediction.duration != null || setPrediction.totalKills != null) && (
          <div style={{ marginTop: 2 }}>
            세트당 예상 {setPrediction.duration != null ? `게임시간 ${setPrediction.duration.toFixed(1)}분` : ''}{setPrediction.duration != null && setPrediction.totalKills != null ? ' · ' : ''}{setPrediction.totalKills != null ? `총 킬수 ${setPrediction.totalKills.toFixed(1)}` : ''}
          </div>
        )}
        {bestOf === 3 && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 2, fontWeight: 700, color: 'var(--text-secondary)' }}>
            <div>{underLabel} 1.5 <span style={{ color: 'var(--gold)' }}>{(outcome.underAtLeastOneGameProb * 100).toFixed(0)}%</span> &nbsp; {favLabel} <span style={{ color: 'var(--gold)' }}>{(outcome.favWinProb * 100).toFixed(0)}%</span></div>
            <div>{favLabel} -1.5 <span style={{ color: 'var(--gold)' }}>{(outcome.favSweepProb * 100).toFixed(0)}%</span> &nbsp; {underLabel} <span style={{ color: 'var(--gold)' }}>{(outcome.underWinProb * 100).toFixed(0)}%</span></div>
          </div>
        )}
      </div>
    </div>
  )
}

function UpcomingPanel({ events, loading, error, errorDetail, teams, powerScores, abilityProfiles, powerLog, detailedLog }: {
  events: RawScheduleEvent[] | null; loading: boolean; error: boolean; errorDetail?: string; teams: EsportsTeam[]; powerScores: Record<string, TeamPowerScore>
  abilityProfiles: Record<string, AbilityProfile>; powerLog: Record<string, EloGameLog[]>; detailedLog: DetailedGameEntry[]
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
      {!loading && upcoming.length === 0 && error && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
          일정 데이터를 가져올 수 없습니다. 아래 &quot;경기 수동 추가&quot;에서 직접 입력할 수 있어요.
          {errorDetail && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{errorDetail}</div>}
        </div>
      )}
      {!loading && upcoming.length === 0 && !error && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>예정된 경기가 없습니다</div>}
      {!loading && upcoming.length > 0 && events && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {upcoming.map(e => <UpcomingRow key={e.match!.id ?? e.id} event={e} events={events} teams={teams} powerScores={powerScores} abilityProfiles={abilityProfiles} powerLog={powerLog} detailedLog={detailedLog} />)}
        </div>
      )}
    </div>
  )
}

// ─── 세트 기록 수동 입력 ────────────────────────────────────────
function milestoneLabel(m: NarrativeTeam | null, teamLabel: string, oppLabel: string): string {
  return m === 'team1' ? teamLabel : m === 'team2' ? oppLabel : '없음'
}

// 세부 지표 하나가 어떤 원본 수치로 계산됐는지 마우스 오버로 보여주기 위한 설명 텍스트
function metricTooltip(metricKey: string, s: EsportsGameStat, teamLabel: string, oppLabel: string, earlyLeader: NarrativeTeam | 'even' | null): string {
  const dur = s.duration_seconds != null ? `${Math.floor(s.duration_seconds / 60)}분 ${s.duration_seconds % 60}초` : '경기시간 미입력'
  switch (metricKey) {
    case 'laning':
      return `퍼스트 1킬: ${milestoneLabel(s.first_blood_team, teamLabel, oppLabel)} · 퍼스트 5킬: ${milestoneLabel(s.fifth_kill_team, teamLabel, oppLabel)} · 퍼스트 타워: ${milestoneLabel(s.first_tower_team, teamLabel, oppLabel)}`
    case 'objective':
      return `드래곤 ${s.team1_dragons ?? '-'}:${s.team2_dragons ?? '-'} · 내셔 ${s.team1_barons ?? '-'}:${s.team2_barons ?? '-'} · 퍼스트 드래곤: ${milestoneLabel(s.first_dragon_team, teamLabel, oppLabel)} · 퍼스트 내셔: ${milestoneLabel(s.first_baron_team, teamLabel, oppLabel)}`
    case 'teamfight':
      return `킬 ${s.team1_kills ?? '-'}:${s.team2_kills ?? '-'} (${dur} 기준 분당 킬 격차로 환산) · 퍼스트 10킬: ${milestoneLabel(s.tenth_kill_team, teamLabel, oppLabel)}`
    case 'macro':
      return `타워 ${s.team1_towers ?? '-'}:${s.team2_towers ?? '-'} · 억제기 ${s.team1_inhibitors ?? '-'}:${s.team2_inhibitors ?? '-'}`
    case 'closing':
      return `승자: ${s.winner_team === 'team1' ? teamLabel : oppLabel} · 초반 주도권: ${earlyLeader === 'team1' ? teamLabel : earlyLeader === 'team2' ? oppLabel : earlyLeader === 'even' ? '팽팽' : '없음'} (초반에 밀렸다가 뒤집었으면 높은 점수)`
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

function MilestoneButton({ selected, onClick, children, size }: { selected: boolean; onClick: () => void; children: string; size?: 'sm' | 'lg' }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, fontSize: size === 'lg' ? 11 : 9, padding: size === 'lg' ? '9px 6px' : '4px 4px', borderRadius: 4, cursor: 'pointer',
      border: `1px solid ${selected ? 'var(--gold-border)' : 'var(--border)'}`,
      background: selected ? 'var(--gold)' : 'var(--bg-card)',
      color: selected ? 'var(--bg-card)' : 'var(--text-secondary)',
      fontWeight: selected ? 800 : 500, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </button>
  )
}

function MilestoneSelect({ label, value, onChange, leftValue, leftLabel, rightValue, rightLabel }: {
  label: string; value: NarrativeTeam | ''; onChange: (v: NarrativeTeam | '') => void
  leftValue: NarrativeTeam; leftLabel: string; rightValue: NarrativeTeam; rightLabel: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        <MilestoneButton selected={value === ''} onClick={() => onChange('')}>없음</MilestoneButton>
        <MilestoneButton selected={value === leftValue} onClick={() => onChange(leftValue)}>{leftLabel}</MilestoneButton>
        <MilestoneButton selected={value === rightValue} onClick={() => onChange(rightValue)}>{rightLabel}</MilestoneButton>
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
  // 입력할 때 진영을 바꿔서(side_swapped) 저장한 세트면, 요약도 그때 보던 순서(왼쪽=진영변경 후 왼쪽 팀) 그대로 보여준다.
  const sw = stat.side_swapped
  const leftName = sw ? stat.team2_name : teamName
  const rightName = sw ? teamName : stat.team2_name
  const leftScore = sw ? winScore.team2 : winScore.team1
  const rightScore = sw ? winScore.team1 : winScore.team2
  const pair = (a: number | null, b: number | null) => sw ? `${b ?? '-'}:${a ?? '-'}` : `${a ?? '-'}:${b ?? '-'}`
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
        킬 {pair(stat.team1_kills, stat.team2_kills)} · 내셔 {pair(stat.team1_barons, stat.team2_barons)} · 드래곤 {pair(stat.team1_dragons, stat.team2_dragons)} · 타워 {pair(stat.team1_towers, stat.team2_towers)} · 억제기 {pair(stat.team1_inhibitors, stat.team2_inhibitors)}{stat.team1_gold != null ? ` · 골드 ${sw ? stat.team2_gold : stat.team1_gold}k:${sw ? stat.team1_gold : stat.team2_gold}k` : ''}
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 4, padding: '2px 6px', marginBottom: 4 }}>
        플레이 점수 {leftScore} : {rightScore} <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({leftName} : {rightName})</span>
      </div>
      <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{narrative.detail}</div>
    </div>
  )
}

function RecentMatchRow({ teamId, pendingTeamName, leagueCode, onTeamCreated, teamName, game, displayA, displayB, scoreA, scoreB, teams, recordCount, teamCode, opponentCode }: {
  teamId: string | null; pendingTeamName?: string; leagueCode?: string; onTeamCreated?: (team: EsportsTeam) => void
  teamName: string; game: TeamGameRecord
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
  // 입력 폼에서 좌(블루)/우(레드) 어느 쪽에 어느 팀을 표시할지. 데이터(team1=우리팀/team2=상대팀) 자체는
  // 안 건드리고 순수하게 렌더링 순서만 뒤집는다 — 중계 화면 진영 순서에 맞춰 입력하기 쉽도록.
  const [sideSwapped, setSideSwapped] = useState(false)
  const durationMinRef = useRef<HTMLInputElement>(null)
  const durationSecRef = useRef<HTMLInputElement>(null)

  // 세트 기록 입력 폼이 열리면(추가/수정 모두) 바로 게임시간(분) 칸에 커서가 가도록
  useEffect(() => {
    if (!showForm) return
    const t = setTimeout(() => durationMinRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [showForm])

  // 상대팀도 우리가 추적 중인 팀이면(예: DK도 esports_teams에 있으면) 그쪽 team_id도 찾아둔다.
  // 세트 저장 시 양쪽에 다 기록해야 상대팀 체급 점수에도 이 경기가 반영된다.
  // lolesports API가 간혹 이름(name) 필드를 신뢰할 수 없게 내려줄 때가 있어(예: 두 팀의 name이 같게 나옴),
  // 코드(약자)가 있으면 코드를 먼저 신뢰하고, 혹시라도 우리 팀 자신과 매칭되면(자기 자신과는 경기를 할 수 없으니)
  // 데이터 이상으로 보고 매칭을 버린다.
  const opponentTeamId = useMemo(() => {
    const byCode = opponentCode ? teams.find(t => teamNameMatches(t, opponentCode)) : undefined
    const found = byCode ?? teams.find(t => teamNameMatches(t, game.opponent))
    if (!found || found.id === teamId) return null
    return found.id
  }, [teams, game.opponent, opponentCode, teamId])
  // team2_name을 저장할 때 매번 다른 원문 표기(대소문자/띄어쓰기 차이)를 그대로 쓰면 같은 상대가
  // 다른 문자열로 여러 번 저장되어 중복 데이터가 생긴다. 추적 중인 팀이면 항상 정식명으로 통일해서 저장한다.
  const canonicalOpponentName = teams.find(t => t.id === opponentTeamId)?.name ?? game.opponent
  // 기록 입력 폼에서는 풀네임 대신 약자(코드)를 쓴다. 코드가 없으면 풀네임으로 폴백.
  const teamLabel = teamCode || teamName
  const oppLabel = opponentCode || game.opponent

  async function loadSets() {
    if (!teamId) { setSets([]); return } // 아직 팀이 등록 안 됐으면(신규) 기존 세트 기록이 있을 리 없다
    setLoadingSets(true)
    // gol.gg 자동수집 데이터는 상대팀 표기(예: "Gen.G")와 날짜만 있고 정확한 시각/lolesports 표기명("Gen.G Esports")과
    // 일치하지 않으므로, 날짜 ±1일 범위로 찾는다. 수동 입력 데이터(정확한 match_start_time)도 이 범위 안에
    // 포함되므로 함께 잡힌다.
    // 상대팀 이름/코드로 추가 대조는 하지 않는다: lolesports API가 이름/코드 필드를 경기마다 다르게, 때로는
    // 부정확하게 내려줄 수 있어서, 그걸 기준으로 다시 걸러내려고 하면 방금 정상 저장한 기록이 새로고침 후엔
    // 안 보이는 것처럼 사라지는 문제가 반복됐다. team_id + 날짜만으로도 이 팀이 그 날짜 즈음 치른 경기는
    // 사실상 하나뿐이라 충분히 안전하고, match_start_time은 항상 신뢰할 수 있다.
    const dayStart = dayjs(game.startTime).subtract(1, 'day').startOf('day').toISOString()
    const dayEnd = dayjs(game.startTime).add(1, 'day').endOf('day').toISOString()
    const { data } = await supabase.from('esports_game_stats').select('*')
      .eq('team_id', teamId)
      .gte('match_start_time', dayStart)
      .lte('match_start_time', dayEnd)
      .order('game_number')
    const filtered = (data as EsportsGameStat[]) ?? []
    setSets(filtered)
    setLoadingSets(false)
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next && sets === null) loadSets()
  }

  // 상단 탭(대시보드/통계 등)으로 갔다가 분석 탭으로 돌아오면 Analysis 컴포넌트 전체가 언마운트→재마운트되어
  // 저장 안 한 입력 중이던 폼이 그냥 사라지는 문제가 있었다. localStorage에 임시저장(초안)해뒀다가
  // 같은 세트의 입력 폼을 다시 열 때 자동으로 복원한다.
  function draftKey(gameNumber: number) {
    return `sb_set_draft:${teamId ?? `pending:${pendingTeamName}`}:${game.startTime}:${gameNumber}`
  }
  function loadDraft(gameNumber: number): { form: GameStatForm; sideSwapped: boolean } | null {
    try {
      const raw = localStorage.getItem(draftKey(gameNumber))
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  function clearDraft(gameNumber: number) {
    try { localStorage.removeItem(draftKey(gameNumber)) } catch { /* 무시 */ }
  }
  useEffect(() => {
    if (!showForm) return
    try { localStorage.setItem(draftKey(form.gameNumber), JSON.stringify({ form, sideSwapped })) } catch { /* 무시 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, sideSwapped, showForm])

  function openAddForm() {
    const base = emptyGameStatForm((sets?.length ?? 0) + 1)
    const draft = loadDraft(base.gameNumber)
    setForm(draft?.form ?? base)
    setSideSwapped(draft?.sideSwapped ?? false)
    setShowForm(true)
  }

  function openEditForm(stat: EsportsGameStat) {
    const toStr = (v: number | null) => v == null ? '' : String(v)
    const base: GameStatForm = {
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
    }
    const draft = loadDraft(base.gameNumber)
    setForm(draft?.form ?? base)
    setSideSwapped(draft?.sideSwapped ?? (stat.side_swapped ?? false))
    setShowForm(true)
  }

  // 세트 기록 입력 폼의 좌(블루)/우(레드) 표시 순서를 뒤집는다. team1(우리팀)/team2(상대팀) 데이터 매핑은
  // 그대로 두고, 어느 쪽 열에 누구 이름과 입력칸을 보여줄지만 바꾼다.
  function toggleSideSwap() {
    setSideSwapped(v => !v)
  }

  async function saveSet() {
    setSaving(true)
    // 아직 등록 안 된 팀(신규 발견 경기)이면, 세트를 실제로 저장하는 이 시점에만 팀을 등록한다 —
    // 목록을 보는 것만으로는 절대 등록되지 않고, 입력을 완료해서 저장을 눌러야만 등록된다.
    let actualTeamId = teamId
    if (!actualTeamId) {
      if (!pendingTeamName) { alert('팀 정보가 없어 저장할 수 없습니다.'); setSaving(false); return }
      const existing = teams.find(t => teamNameMatches(t, pendingTeamName)) // 그 사이 다른 경기에서 이미 등록됐을 수 있으니 한 번 더 확인
      if (existing) {
        actualTeamId = existing.id
      } else {
        const { data: newTeam, error: teamErr } = await supabase.from('esports_teams')
          .insert({ league: leagueCode ?? '', name: pendingTeamName, sort_order: 0 })
          .select().single()
        if (teamErr || !newTeam) { alert(`팀 등록 실패: ${teamErr?.message ?? ''}`); setSaving(false); return }
        actualTeamId = (newTeam as EsportsTeam).id
        onTeamCreated?.(newTeam as EsportsTeam)
      }
    }
    const toInt = (v: string) => v === '' ? null : parseInt(v, 10)
    const duration = (form.durationMin || form.durationSec)
      ? (parseInt(form.durationMin || '0', 10) * 60 + parseInt(form.durationSec || '0', 10))
      : null
    const payload = {
      team_id: actualTeamId, team2_name: canonicalOpponentName, match_start_time: game.startTime, game_number: form.gameNumber,
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
      side_swapped: sideSwapped,
    }
    let mainError: string | null = null
    try {
      const { data, error } = await supabase.from('esports_game_stats')
        .upsert(payload, { onConflict: 'team_id,team2_name,match_start_time,game_number' })
        .select().single()
      if (error) mainError = error.message
      if (data) {
        setSets(prev => {
          const others = (prev ?? []).filter(s => s.game_number !== (data as EsportsGameStat).game_number)
          return [...others, data as EsportsGameStat].sort((a, b) => a.game_number - b.game_number)
        })
        setShowForm(false)
        clearDraft(form.gameNumber)
      }
    } catch (e) {
      mainError = e instanceof Error ? e.message : String(e)
    }
    if (mainError) {
      alert(`저장에 실패했습니다: ${mainError}`)
      setSaving(false)
      return
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
        side_swapped: sideSwapped,
      }
      const { error: mirrorError } = await supabase.from('esports_game_stats')
        .upsert(mirrorPayload, { onConflict: 'team_id,team2_name,match_start_time,game_number' })
      if (mirrorError) {
        // 내 쪽 기록은 이미 저장됐으니 조용히 넘기지 않고, 상대팀 쪽만 실패했다는 걸 알려준다
        console.error('상대팀 미러 저장 실패:', mirrorError.message)
        alert(`내 쪽 기록은 저장됐지만, 상대팀(${oppLabel}) 쪽 기록 저장에는 실패했습니다: ${mirrorError.message}`)
      }
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

              {seriesAnalysis.perSet.map(p => {
                const sw = p.stat.side_swapped
                const leftLabel = sw ? game.opponent : teamName
                const rightLabel = sw ? teamName : game.opponent
                const leftPerfection = sw ? p.perfection.team2 : p.perfection.team1
                const rightPerfection = sw ? p.perfection.team1 : p.perfection.team2
                const leftScores = sw ? p.both.team2 : p.both.team1
                const rightScores = sw ? p.both.team1 : p.both.team2
                return (
                <div key={p.gameNumber} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--gold-border)' }}>
                  <div style={{ marginBottom: 4 }}>
                    <b>{p.gameNumber}세트</b> · ({p.winnerTeam === 'team1' ? teamName : game.opponent} 승)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>플레이 점수</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: leftPerfection >= rightPerfection ? 'var(--gold)' : 'var(--text-primary)' }}>{leftPerfection}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{leftLabel}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>:</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: rightPerfection >= leftPerfection ? 'var(--gold)' : 'var(--text-primary)' }}>{rightPerfection}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{rightLabel}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {([
                      ['라인전', 'laning', leftScores.laning, rightScores.laning],
                      ['오브젝트', 'objective', leftScores.objectiveControl, rightScores.objectiveControl],
                      ['교전', 'teamfight', leftScores.teamfight, rightScores.teamfight],
                      ['운영', 'macro', leftScores.macro, rightScores.macro],
                      ['마무리', 'closing', leftScores.closing, rightScores.closing],
                    ] as [string, string, number, number][]).map(([label, key, t1, t2]) => {
                      const total = t1 + t2 || 1
                      const tooltip = metricTooltip(key, p.stat, leftLabel, rightLabel, p.narrative.earlyLeader)
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
                )
              })}
            </div>
          )}
          {showForm && (() => {
            const leftIsTeam1 = !sideSwapped
            const leftLabel = leftIsTeam1 ? teamLabel : oppLabel
            const rightLabel = leftIsTeam1 ? oppLabel : teamLabel
            const leftValue: NarrativeTeam = leftIsTeam1 ? 'team1' : 'team2'
            const rightValue: NarrativeTeam = leftIsTeam1 ? 'team2' : 'team1'
            // team1/team2(우리팀/상대팀) 필드 쌍을 현재 좌/우 배치에 맞춰 매핑해주는 헬퍼
            function statProps(t1Key: 'team1Kills' | 'team1Barons' | 'team1Dragons' | 'team1Towers' | 'team1Inhibitors', t2Key: 'team2Kills' | 'team2Barons' | 'team2Dragons' | 'team2Towers' | 'team2Inhibitors') {
              const lKey = leftIsTeam1 ? t1Key : t2Key
              const rKey = leftIsTeam1 ? t2Key : t1Key
              return {
                valueA: form[lKey], valueB: form[rKey],
                onChangeA: (v: string) => setForm(f => ({ ...f, [lKey]: v })),
                onChangeB: (v: string) => setForm(f => ({ ...f, [rKey]: v })),
              }
            }
            return (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{form.gameNumber}세트 기록 {sets?.some(s => s.game_number === form.gameNumber) ? '수정' : '입력'}</div>
                  <button type="button" onClick={toggleSideSwap} className="btn btn-ghost" style={{ padding: '3px 7px', fontSize: 9, flexShrink: 0 }}>
                    🔄 진영 변경 (블루⇄레드)
                  </button>
                </div>

                {/* 게임시간 (가운데 정렬) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>게임시간</span>
                  <input ref={durationMinRef} value={form.durationMin}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                      setForm(f => ({ ...f, durationMin: v }))
                    }}
                    placeholder="분" inputMode="numeric" style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>분</span>
                  <input ref={durationSecRef} value={form.durationSec} onChange={e => setForm(f => ({ ...f, durationSec: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))}
                    placeholder="초" inputMode="numeric" style={{ width: 40, fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center' }} />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>초</span>
                </div>

                {/* 승리팀 (버튼 세로로 조금 더 크게) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>승리팀</span>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    <MilestoneButton size="lg" selected={form.winnerTeam === leftValue} onClick={() => setForm(f => ({ ...f, winnerTeam: leftValue }))}>{leftLabel}</MilestoneButton>
                    <MilestoneButton size="lg" selected={form.winnerTeam === rightValue} onClick={() => setForm(f => ({ ...f, winnerTeam: rightValue }))}>{rightLabel}</MilestoneButton>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  {/* 좌측: 킬/내셔/드래곤/타워/억제기 숫자 입력 */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 46, flexShrink: 0 }} />
                      <span style={{ width: 40, fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leftLabel}</span>
                      <span style={{ width: 9 }} />
                      <span style={{ width: 40, fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rightLabel}</span>
                    </div>
                    <StatPairInput label="킬" {...statProps('team1Kills', 'team2Kills')} />
                    <StatPairInput label="내셔" {...statProps('team1Barons', 'team2Barons')} />
                    <StatPairInput label="드래곤" {...statProps('team1Dragons', 'team2Dragons')} />
                    <StatPairInput label="타워" {...statProps('team1Towers', 'team2Towers')} />
                    <StatPairInput label="억제기" {...statProps('team1Inhibitors', 'team2Inhibitors')} />
                  </div>
                  {/* 우측: 퍼스트 1킬 → 5킬 → 10킬 → 드래곤 → 타워 → 내셔 */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <MilestoneSelect label="퍼스트 1킬" value={form.firstBloodTeam} onChange={v => setForm(f => ({ ...f, firstBloodTeam: v }))} leftValue={leftValue} leftLabel={leftLabel} rightValue={rightValue} rightLabel={rightLabel} />
                    <MilestoneSelect label="퍼스트 5킬" value={form.fifthKillTeam} onChange={v => setForm(f => ({ ...f, fifthKillTeam: v }))} leftValue={leftValue} leftLabel={leftLabel} rightValue={rightValue} rightLabel={rightLabel} />
                    <MilestoneSelect label="퍼스트 10킬" value={form.tenthKillTeam} onChange={v => setForm(f => ({ ...f, tenthKillTeam: v }))} leftValue={leftValue} leftLabel={leftLabel} rightValue={rightValue} rightLabel={rightLabel} />
                    <MilestoneSelect label="퍼스트 드래곤" value={form.firstDragonTeam} onChange={v => setForm(f => ({ ...f, firstDragonTeam: v }))} leftValue={leftValue} leftLabel={leftLabel} rightValue={rightValue} rightLabel={rightLabel} />
                    <MilestoneSelect label="퍼스트 타워" value={form.firstTowerTeam} onChange={v => setForm(f => ({ ...f, firstTowerTeam: v }))} leftValue={leftValue} leftLabel={leftLabel} rightValue={rightValue} rightLabel={rightLabel} />
                    <MilestoneSelect label="퍼스트 내셔" value={form.firstBaronTeam} onChange={v => setForm(f => ({ ...f, firstBaronTeam: v }))} leftValue={leftValue} leftLabel={leftLabel} rightValue={rightValue} rightLabel={rightLabel} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => { clearDraft(form.gameNumber); setShowForm(false) }} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }}>취소</button>
                  <button onClick={saveSet} disabled={saving} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 11 }}>{saving ? '저장 중...' : '저장'}</button>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── 경기 수동 추가 (자동 일정 조회가 안 되는 리그의 폴백) ───────────
function ManualEventPanel({ leagueCode, manualEvents, onChanged, autoOpenHint }: {
  leagueCode: string; manualEvents: ManualEsportsEvent[]; onChanged: () => void; autoOpenHint: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    state: 'unstarted' as 'completed' | 'unstarted',
    startTime: '', teamAName: '', teamACode: '', teamBName: '', teamBCode: '',
    bestOf: '3', scoreA: '', scoreB: '',
  })

  async function save() {
    if (!form.teamAName.trim() || !form.teamBName.trim() || !form.startTime) return
    setSaving(true)
    const payload = {
      league: leagueCode,
      start_time: new Date(form.startTime).toISOString(),
      state: form.state,
      team_a_name: form.teamAName.trim(), team_a_code: form.teamACode.trim() || null,
      team_b_name: form.teamBName.trim(), team_b_code: form.teamBCode.trim() || null,
      best_of: parseInt(form.bestOf, 10) || 3,
      score_a: form.state === 'completed' ? (parseInt(form.scoreA, 10) || 0) : null,
      score_b: form.state === 'completed' ? (parseInt(form.scoreB, 10) || 0) : null,
    }
    await supabase.from('esports_manual_events').insert(payload)
    setSaving(false)
    setShowForm(false)
    setForm(f => ({ ...f, teamAName: '', teamACode: '', teamBName: '', teamBCode: '', scoreA: '', scoreB: '' }))
    onChanged()
  }

  async function remove(id: string) {
    await supabase.from('esports_manual_events').delete().eq('id', id)
    onChanged()
  }

  const inputStyle = { fontSize: 11, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          경기 수동 추가 {manualEvents.length > 0 ? `· ${manualEvents.length}건 등록됨` : ''}
          {autoOpenHint && <span style={{ color: 'var(--gold)', fontWeight: 700, marginLeft: 6, fontSize: 10 }}>· 일정 자동 조회 실패 — 여기서 직접 추가해 주세요</span>}
        </div>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {manualEvents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {manualEvents.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, padding: '4px 6px', background: 'var(--bg-elevated)', borderRadius: 4 }}>
                  <span style={{ color: 'var(--text-muted)', width: 76, flexShrink: 0 }}>{dayjs(m.start_time).format('MM/DD HH:mm')}</span>
                  <span style={{ flex: 1 }}>
                    {m.team_a_code || m.team_a_name} vs {m.team_b_code || m.team_b_name}
                    {m.state === 'completed' ? ` (${m.score_a}:${m.score_b})` : ' (예정)'}
                  </span>
                  <button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 10, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={10} /> 경기 추가
            </button>
          )}
          {showForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-elevated)', padding: 8, borderRadius: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <MilestoneButton selected={form.state === 'unstarted'} onClick={() => setForm(f => ({ ...f, state: 'unstarted' }))}>예정된 경기</MilestoneButton>
                <MilestoneButton selected={form.state === 'completed'} onClick={() => setForm(f => ({ ...f, state: 'completed' }))}>완료된 경기</MilestoneButton>
              </div>
              <input type="datetime-local" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: 6 }}>
                <input placeholder="팀A 이름" value={form.teamAName} onChange={e => setForm(f => ({ ...f, teamAName: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="약자" value={form.teamACode} onChange={e => setForm(f => ({ ...f, teamACode: e.target.value }))} style={{ ...inputStyle, width: 56 }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input placeholder="팀B 이름" value={form.teamBName} onChange={e => setForm(f => ({ ...f, teamBName: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="약자" value={form.teamBCode} onChange={e => setForm(f => ({ ...f, teamBCode: e.target.value }))} style={{ ...inputStyle, width: 56 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>BO</span>
                <input value={form.bestOf} onChange={e => setForm(f => ({ ...f, bestOf: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric"
                  style={{ ...inputStyle, width: 36, textAlign: 'center' }} />
                {form.state === 'completed' && (
                  <>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 8 }}>스코어</span>
                    <input value={form.scoreA} onChange={e => setForm(f => ({ ...f, scoreA: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric"
                      style={{ ...inputStyle, width: 32, textAlign: 'center' }} />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>:</span>
                    <input value={form.scoreB} onChange={e => setForm(f => ({ ...f, scoreB: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric"
                      style={{ ...inputStyle, width: 32, textAlign: 'center' }} />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}>취소</button>
                <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 10 }}>{saving ? '저장 중...' : '저장'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 최근 폼 점수 히스토리를 한눈에 보여주는 소형 라인 차트 (팀 확장 시 상단에 표시)
function RatingHistoryChart({ teamLog }: { teamLog: EloGameLog[] }) {
  const data = teamLog.map((h, i) => ({
    idx: i + 1,
    date: h.matchStartTime ? dayjs(h.matchStartTime).format('MM/DD') : '',
    rating: Math.round(h.ratingAfter * 10) / 10,
  }))
  const values = data.map(d => d.rating)
  const min = Math.min(...values), max = Math.max(...values)
  const pad = Math.max(1, (max - min) * 0.15)
  return (
    <div style={{ height: 90, marginBottom: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[min - pad, max + pad]} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }}
            labelStyle={{ color: 'var(--text-muted)' }}
            formatter={(v: number) => [v.toFixed(1), '점수']}
          />
          <Line type="monotone" dataKey="rating" stroke="var(--gold, #d4af37)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface AbilityProfile {
  n: number
  fbRate: number; fifthKillRate: number; firstDragonRate: number; laningRate: number
  winTeamfightDiff: number | null; lossTeamfightDiff: number | null
  winMacroDiff: number | null; lossMacroDiff: number | null
  winObjRate: number | null; lossObjRate: number | null
  avgWinDurationMin: number | null; subThirtyWinRate: number | null
  avgLossDurationMin: number | null // 패배 시 버티는 능력: 질 때도 오래 끌수록(=쉽게 안 무너질수록) 높은 값
  avgTotalKillsWin: number | null; avgTotalKillsLoss: number | null // 호전성: 이길 때/질 때 양팀 합산 킬 수
  winCount: number; lossCount: number
  // 멘탈능력: 초반 주도권을 쥐고도 진 비율(초킹)과, 밀리고도 이긴 비율(역전승)
  earlyLeadCount: number; earlyBehindCount: number
  chokeCount: number; comebackCount: number
  chokeRate: number | null; comebackRate: number | null
  playstyle: 'teamfight' | 'macro' | 'balanced' | null // 교전형/운영형/밸런스형
  scores: {
    laning: number | null; teamfight: number | null; macro: number | null
    objective: number | null; closing: number | null; mental: number | null
  }
}

function clampScore(v: number): number { return Math.max(0, Math.min(100, Math.round(v))) }
// 표본이 충분할 때만(4개 이상) IQR(사분위 범위) 기준으로 극단값을 제거하고 평균을 낸다.
// 표본이 적으면(3개 이하) 극단값 제거가 오히려 정보 손실이 크므로 그냥 평균을 낸다.
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base]
}
function trimmedAvg(values: number[]): number | null {
  if (values.length === 0) return null
  if (values.length < 4) return values.reduce((a, b) => a + b, 0) / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  const filtered = sorted.filter(v => v >= lo && v <= hi)
  const use = filtered.length > 0 ? filtered : sorted // 전부 걸러지는 극단적인 경우 안전하게 원본으로 폴백
  return use.reduce((a, b) => a + b, 0) / use.length
}
// 순수 차이값(킬차/타워차 등)을 50 중립 기준 0~100 점수로 환산
function diffToScore(avgDiff: number | null, scale: number): number | null {
  return avgDiff == null ? null : clampScore(50 + avgDiff * scale)
}
// 0~1 비율값을 50 중립 기준 0~100 점수로 환산
function rateToScore(rate: number | null): number | null {
  return rate == null ? null : clampScore(50 + (rate - 0.5) * 100)
}

// 팀의 세트 기록들로부터 "능력치 프로필"을 계산한다. 승패를 나눠서 보는 이유:
// 이기면서 벌리는 능력과 지면서도 버티는 능력은 서로 다른 재능이라, 한 세트를 점수 하나로 뭉개면 안 보임.
function computeAbilityProfile(rows: EsportsGameStat[]): AbilityProfile {
  const n = rows.length
  const rate = (count: number) => n > 0 ? count / n : 0
  const fb = rows.filter(r => r.first_blood_team === 'team1').length
  const fifth = rows.filter(r => r.fifth_kill_team === 'team1').length
  const fdragon = rows.filter(r => r.first_dragon_team === 'team1').length

  const wins = rows.filter(r => r.winner_team === 'team1')
  const losses = rows.filter(r => r.winner_team === 'team2')

  function avg(arr: EsportsGameStat[], fn: (r: EsportsGameStat) => number | null): number | null {
    const vals = arr.map(fn).filter((v): v is number => v != null)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const killDiff = (r: EsportsGameStat) => (r.team1_kills != null && r.team2_kills != null) ? r.team1_kills - r.team2_kills : null
  const totalKills = (r: EsportsGameStat) => (r.team1_kills != null && r.team2_kills != null) ? r.team1_kills + r.team2_kills : null
  const towerDiff = (r: EsportsGameStat) => (r.team1_towers != null && r.team2_towers != null) ? r.team1_towers - r.team2_towers : null
  const objRate = (r: EsportsGameStat) => {
    const mine = (r.team1_dragons ?? 0) + (r.team1_barons ?? 0)
    const theirs = (r.team2_dragons ?? 0) + (r.team2_barons ?? 0)
    const total = mine + theirs
    return total > 0 ? mine / total : null
  }

  const winDurationsSec = wins.map(r => r.duration_seconds).filter((d): d is number => d != null)
  const avgWinDurationMin = winDurationsSec.length > 0 ? trimmedAvg(winDurationsSec.map(d => d / 60)) : null
  const subThirtyWinRate = winDurationsSec.length > 0 ? winDurationsSec.filter(d => d <= 1800).length / winDurationsSec.length : null
  const lossDurationsSec = losses.map(r => r.duration_seconds).filter((d): d is number => d != null)
  const avgLossDurationMin = lossDurationsSec.length > 0 ? trimmedAvg(lossDurationsSec.map(d => d / 60)) : null
  const avgTotalKillsWin = trimmedAvg(wins.map(totalKills).filter((v): v is number => v != null))
  const avgTotalKillsLoss = trimmedAvg(losses.map(totalKills).filter((v): v is number => v != null))

  // 멘탈능력: 초반 마일스톤(퍼스트 1킬/타워/드래곤/내셔/5킬/10킬)로 "누가 초반 주도권을 쥐었는지" 판정
  let earlyLeadCount = 0, earlyBehindCount = 0, chokeCount = 0, comebackCount = 0
  for (const r of rows) {
    const milestones = [r.first_blood_team, r.first_tower_team, r.first_dragon_team, r.first_baron_team, r.fifth_kill_team, r.tenth_kill_team]
    let mine = 0, theirs = 0
    for (const m of milestones) { if (m === 'team1') mine++; else if (m === 'team2') theirs++ }
    if (mine === 0 && theirs === 0) continue // 마일스톤 미입력 세트는 판정 불가라 제외
    const earlyLeader: NarrativeTeam | 'even' = mine > theirs ? 'team1' : theirs > mine ? 'team2' : 'even'
    if (earlyLeader === 'team1') {
      earlyLeadCount++
      if (r.winner_team === 'team2') chokeCount++
    } else if (earlyLeader === 'team2') {
      earlyBehindCount++
      if (r.winner_team === 'team1') comebackCount++
    }
  }
  const chokeRate = earlyLeadCount > 0 ? chokeCount / earlyLeadCount : null
  const comebackRate = earlyBehindCount > 0 ? comebackCount / earlyBehindCount : null

  const laningRate = n > 0 ? (fb + fifth + fdragon) / (3 * n) : 0
  const avgKillDiffAll = avg(rows, killDiff)
  const avgTowerDiffAll = avg(rows, towerDiff)
  const avgObjRateAll = avg(rows, objRate)

  const winCloseScore = avgWinDurationMin != null ? clampScore(50 + (30 - avgWinDurationMin) * 3) : null
  const lossCloseScore = avgLossDurationMin != null ? clampScore(50 + (avgLossDurationMin - 30) * 3) : null
  const closingScore = winCloseScore != null && lossCloseScore != null ? Math.round((winCloseScore + lossCloseScore) / 2)
    : winCloseScore ?? lossCloseScore

  const mentalScore = (earlyLeadCount > 0 || earlyBehindCount > 0)
    ? clampScore(50 + (comebackRate ?? 0) * 30 - (chokeRate ?? 0) * 30)
    : null

  const teamfightScore = diffToScore(avgKillDiffAll, 3)
  const macroScore = diffToScore(avgTowerDiffAll, 6)
  // 교전형/운영형: 이 팀의 전적을 "결정짓는" 축이 킬 격차 쪽인지 타워 격차 쪽인지로 판단.
  // (두 점수 다 50 중립 기준 같은 척도라, 50에서 얼마나 멀리 떨어져 있는지를 비교하면 됨)
  let playstyle: AbilityProfile['playstyle'] = null
  if (teamfightScore != null && macroScore != null) {
    const tfMag = Math.abs(teamfightScore - 50)
    const macroMag = Math.abs(macroScore - 50)
    if (tfMag > macroMag * 1.15) playstyle = 'teamfight'
    else if (macroMag > tfMag * 1.15) playstyle = 'macro'
    else playstyle = 'balanced'
  }

  return {
    n,
    fbRate: rate(fb), fifthKillRate: rate(fifth), firstDragonRate: rate(fdragon), laningRate,
    winTeamfightDiff: avg(wins, killDiff), lossTeamfightDiff: avg(losses, killDiff),
    winMacroDiff: avg(wins, towerDiff), lossMacroDiff: avg(losses, towerDiff),
    winObjRate: avg(wins, objRate), lossObjRate: avg(losses, objRate),
    avgWinDurationMin, subThirtyWinRate, avgLossDurationMin,
    avgTotalKillsWin, avgTotalKillsLoss,
    winCount: wins.length, lossCount: losses.length,
    earlyLeadCount, earlyBehindCount, chokeCount, comebackCount, chokeRate, comebackRate,
    playstyle,
    scores: {
      laning: n > 0 ? rateToScore(laningRate) : null,
      teamfight: teamfightScore,
      macro: macroScore,
      objective: rateToScore(avgObjRateAll),
      closing: closingScore,
      mental: mentalScore,
    },
  }
}

// 세트당 예상 게임시간·총 킬수를 강팀/약팀 능력치 프로필로 추정한다.
// 강팀이 이길 확률(pFav)만큼 "강팀 승리 시 스탯 + 약팀 패배 시 스탯"의 평균에 가중치를 주고,
// 약팀이 이길 확률(1-pFav)만큼 "약팀 승리 시 스탯 + 강팀 패배 시 스탯"의 평균에 가중치를 준다.
// (어느 한쪽 데이터가 없으면 있는 쪽만 쓰고, 둘 다 없으면 그 갈래는 제외)
function predictSetStats(favAp: AbilityProfile | undefined, dogAp: AbilityProfile | undefined, pFav: number): { duration: number | null; totalKills: number | null } {
  function branchAvg(a: number | null | undefined, b: number | null | undefined): number | null {
    const av = a ?? null, bv = b ?? null
    if (av != null && bv != null) return (av + bv) / 2
    return av ?? bv ?? null
  }
  function blend(favWin: number | null | undefined, dogLoss: number | null | undefined, dogWin: number | null | undefined, favLoss: number | null | undefined): number | null {
    const favWinBranch = branchAvg(favWin, dogLoss)
    const dogWinBranch = branchAvg(dogWin, favLoss)
    if (favWinBranch != null && dogWinBranch != null) return pFav * favWinBranch + (1 - pFav) * dogWinBranch
    return favWinBranch ?? dogWinBranch ?? null
  }
  return {
    duration: blend(favAp?.avgWinDurationMin, dogAp?.avgLossDurationMin, dogAp?.avgWinDurationMin, favAp?.avgLossDurationMin),
    totalKills: blend(favAp?.avgTotalKillsWin, dogAp?.avgTotalKillsLoss, dogAp?.avgTotalKillsWin, favAp?.avgTotalKillsLoss),
  }
}

function LeagueView({ code, label }: { code: string; label: string }) {
  // LCK CL은 기존 LCK/LPL 등과 달리 "글로벌 최근 폼 점수(GPR)" 기반 리그가 아니라서, 팀에 우연히 gpr_score가
  // 들어있더라도 무시하고 항상 중립값 50점에서 시작한다.
  // 글로벌 최근 폼 점수(GPR)이 실제 체감 실력차보다 너무 크게 벌어져 나온다는 피드백 반영:
  // 방향(누가 더 강한지)은 그대로 살리되, 50점 중립을 기준으로 격차 자체를 절반 정도로 압축해서 시작한다.
  // 이후 직접 입력한 경기 데이터가 쌓이면 순차 Elo가 그 위에서 실제 결과에 따라 다시 벌리거나 좁힌다.
  const GPR_COMPRESSION = 0.45
  function baselineGpr(t: EsportsTeam): number {
    if (code === 'LCKCL') return 50
    const raw = t.gpr_score ?? 50
    return 50 + (raw - 50) * GPR_COMPRESSION
  }
  const [teams, setTeams] = useState<EsportsTeam[]>([])
  const [events, setEvents] = useState<RawScheduleEvent[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState(false)
  const [eventsErrorDetail, setEventsErrorDetail] = useState('')
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now()) // 신선도 표시를 주기적으로 갱신하기 위한 시계
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const [manualEvents, setManualEvents] = useState<ManualEsportsEvent[]>([])
  const [powerScores, setPowerScores] = useState<Record<string, TeamPowerScore>>({})
  const [powerLog, setPowerLog] = useState<Record<string, EloGameLog[]>>({})
  const [detailedLog, setDetailedLog] = useState<DetailedGameEntry[]>([])
  const [expandedPowerTeam, setExpandedPowerTeam] = useState<string | null>(null)
  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState<number | null>(null)
  const [powerLoading, setPowerLoading] = useState(false)
  const [recentSetResults, setRecentSetResults] = useState<Record<string, boolean[]>>({})
  const [abilityProfiles, setAbilityProfiles] = useState<Record<string, AbilityProfile>>({})
  // 최근 폼 점수 전일 대비 증감/순위변동 표시용: 리그별로 날짜 스냅샷을 저장해두고 비교한다.
  const [prevSnapshot, setPrevSnapshot] = useState<Record<string, { powerScore: number; rank: number }>>({})

  // "어제 기준" 스냅샷 로드: 오늘보다 이전인 날짜 중 가장 최근 날짜의 값을 비교 기준으로 삼는다.
  async function loadPrevSnapshot() {
    const today = dayjs().format('YYYY-MM-DD')
    const { data } = await supabase.from('esports_power_snapshots')
      .select('team_id, snapshot_date, power_score, rank')
      .eq('league', code)
      .lt('snapshot_date', today)
      .order('snapshot_date', { ascending: false })
    const rows = (data as { team_id: string; snapshot_date: string; power_score: number; rank: number }[]) ?? []
    if (rows.length === 0) { setPrevSnapshot({}); return }
    const latestDate = rows[0].snapshot_date
    const map: Record<string, { powerScore: number; rank: number }> = {}
    for (const r of rows) {
      if (r.snapshot_date !== latestDate) continue
      map[r.team_id] = { powerScore: r.power_score, rank: r.rank }
    }
    setPrevSnapshot(map)
  }

  // 팀 체급 점수 계산: 라이엇 GPR 공식(순차 Elo)을 리그 전체 경기에 시간순으로 적용
  async function loadPowerScores(teamsList: EsportsTeam[]) {
    if (teamsList.length === 0) { setPowerScores({}); return }
    setPowerLoading(true)
    try {
      const { data } = await supabase.from('esports_game_stats').select('*')
        .in('team_id', teamsList.map(t => t.id))
        .eq('source', 'manual')
        .order('match_start_time', { ascending: true })
        .order('game_number', { ascending: true })
      const rows = (data as EsportsGameStat[]) ?? []

      // 미러링 때문에 실제 경기 하나가 두 행(양팀 관점)으로 존재한다. 한 방향만 남기고 중복 제거.
      // 이름만으로 못 찾으면, 등록된 코드가 그 텍스트 안에 단어 경계로 포함돼 있는지도 확인한다.
      // (예: 스폰서 개명으로 team2_name이 "RED Kalunga"처럼 바뀌어도, 코드 "RED"가 등록돼 있으면 여전히 연결됨)
      function findOpponentTeam(text: string): EsportsTeam | undefined {
        const direct = teamsList.find(t => teamNameMatches(t, text))
        if (direct) return direct
        const lower = text.toLowerCase()
        return teamsList.find(t => t.code && new RegExp(`(^|[^a-z0-9])${t.code.toLowerCase()}($|[^a-z0-9])`).test(lower))
      }
      const seenKeys = new Set<string>()
      const matches: EloMatchRecord[] = []
      const detailedEntries: DetailedGameEntry[] = []
      for (const s of rows) {
        const oppTeam = findOpponentTeam(s.team2_name)
        if (!oppTeam) continue // 추적 안 되는 상대는 시뮬레이션에서 제외 (레이팅 기준점이 없음)
        const key = [s.team_id, oppTeam.id].sort().join('|') + `|${s.match_start_time}|${s.game_number}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        const won = s.winner_team === 'team1'
        matches.push({
          teamAId: s.team_id, teamBId: oppTeam.id,
          winnerIsA: won,
          matchStartTime: s.match_start_time ?? '', gameNumber: s.game_number,
        })
        // 부가 예측 신호(모멘텀/세트순서/오브젝트/공통상대)용 상세 로그 — 양팀 관점으로 각각 남긴다
        detailedEntries.push({
          teamId: s.team_id, opponentId: oppTeam.id, matchStartTime: s.match_start_time ?? '', gameNumber: s.game_number,
          won,
          teamDragons: s.team1_dragons ?? 0, oppDragons: s.team2_dragons ?? 0,
          teamBarons: s.team1_barons ?? 0, oppBarons: s.team2_barons ?? 0,
          teamKills: s.team1_kills ?? 0, oppKills: s.team2_kills ?? 0,
        })
        detailedEntries.push({
          teamId: oppTeam.id, opponentId: s.team_id, matchStartTime: s.match_start_time ?? '', gameNumber: s.game_number,
          won: !won,
          teamDragons: s.team2_dragons ?? 0, oppDragons: s.team1_dragons ?? 0,
          teamBarons: s.team2_barons ?? 0, oppBarons: s.team1_barons ?? 0,
          teamKills: s.team2_kills ?? 0, oppKills: s.team1_kills ?? 0,
        })
      }
      setDetailedLog(detailedEntries)

      const initialRatings: Record<string, number> = {}
      for (const t of teamsList) initialRatings[t.id] = baselineGpr(t)

      const { finalRatings, log } = simulateLeagueElo(initialRatings, matches)

      const scores: Record<string, TeamPowerScore> = {}
      const logByTeam: Record<string, EloGameLog[]> = {}
      for (const t of teamsList) {
        const teamLog = log.filter(l => l.teamId === t.id)
        const wins = teamLog.filter(l => l.won).length
        scores[t.id] = {
          powerScore: finalRatings[t.id] ?? baselineGpr(t),
          winRate: teamLog.length > 0 ? wins / teamLog.length : 0.5,
          gamesAnalyzed: teamLog.length,
        }
        logByTeam[t.id] = teamLog
      }
      setPowerScores(scores)
      setPowerLog(logByTeam)

      // 최근 W/L 배지: 시리즈가 아니라 "세트" 단위로 최근 5개까지. rows가 이미 시간순(오래된 것→최신) 정렬돼 있으므로
      // 팀별로 걸러서 뒤에서 5개만 취한 뒤, 최신이 맨 왼쪽에 오도록 순서를 뒤집는다.
      const recentSets: Record<string, boolean[]> = {}
      for (const t of teamsList) {
        const teamRows = rows.filter(s => s.team_id === t.id && s.winner_team)
        recentSets[t.id] = teamRows.slice(-5).reverse().map(s => s.winner_team === 'team1')
      }
      setRecentSetResults(recentSets)

      // 능력치 프로필: 라인전/교전/운영/오브젝트/마무리 5개 축, 승패로 나눠서 계산
      const profiles: Record<string, AbilityProfile> = {}
      for (const t of teamsList) {
        profiles[t.id] = computeAbilityProfile(rows.filter(s => s.team_id === t.id))
      }
      setAbilityProfiles(profiles)
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
  // 리그에 아직 등록 안 된 팀을 즉시 추적 대상으로 등록한다 (LCK CL처럼 팀을 미리 하나도 안 넣어놨을 때,
  // "먼저 팀부터 등록하세요" 없이 경기 목록에서 바로 한 번에 등록 + 입력으로 넘어갈 수 있도록).
  // RecentMatchRow가 첫 세트를 저장하면서 새 팀을 만든 뒤 알려주면, 목록에 반영만 한다
  // (여기서는 절대 팀을 새로 만들지 않는다 — 만드는 주체는 항상 RecentMatchRow.saveSet뿐).
  function handleTeamCreated(newTeam: EsportsTeam) {
    setTeams(prev => prev.find(t => t.id === newTeam.id) ? prev : [...prev, newTeam])
    loadPowerScores([...teams, newTeam])
  }
  async function loadEvents(forceRefresh?: boolean) {
    setEventsLoading(true); setEventsError(false); setEventsErrorDetail('')
    try {
      setEvents(await fetchScheduleEvents(code, { forceRefresh }))
      setLastFetchAt(getLastLiveFetchAt(code))
    } catch (e) {
      setEventsError(true)
      setEventsErrorDetail(e instanceof Error ? e.message : String(e))
      console.error('[Analysis] fetchScheduleEvents 실패:', e)
    } finally {
      setEventsLoading(false)
    }
  }
  // 자동 일정 조회가 안 되는 리그(예: LCK CL)나 놓친 경기를 위한 수동 입력 폴백
  async function loadManualEvents() {
    const { data } = await supabase.from('esports_manual_events').select('*').eq('league', code).order('start_time', { ascending: false })
    setManualEvents((data as ManualEsportsEvent[]) ?? [])
  }
  useEffect(() => { load(); loadEvents(); loadManualEvents(); loadPrevSnapshot() }, [code])

  // 자동으로 가져온 일정 + 수동으로 추가한 경기를 합쳐서 각 패널에 넘긴다
  const combinedEvents = useMemo(() => {
    const manual = manualEvents.map(manualEventToRawEvent)
    if (!events) return manual.length > 0 ? manual : null
    return [...events, ...manual]
  }, [events, manualEvents])

  // 최근 폼 점수 목록에 팀 약자를 괄호로 같이 보여주기 위해 팀별 코드를 결정한다.
  // 사용자가 직접 지정한 코드(esports_teams.code)가 있으면 그걸 우선 쓰고, 없을 때만 일정 데이터에서 유추한다.
  // lolesports API가 새로 생긴 팀(예: LCK CL 소속팀)에 아직 정식 코드를 안 붙여놔서 "TBD"를 내려주는 경우가 있어,
  // 그런 값은 코드로 쓸모가 없으니 무시한다.
  const teamCodeMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of teams) {
      if (t.code && t.code.trim()) { map[t.id] = t.code.trim(); continue }
      const c = combinedEvents ? findTeamCode(combinedEvents, t.name) : null
      if (c && c.toUpperCase() !== 'TBD') map[t.id] = c
    }
    return map
  }, [combinedEvents, teams])

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editTeamName, setEditTeamName] = useState('')
  const [editTeamCode, setEditTeamCode] = useState('')
  function startEditTeam(t: EsportsTeam) {
    setEditingTeamId(t.id)
    setEditTeamName(t.name)
    setEditTeamCode(t.code ?? teamCodeMap[t.id] ?? '')
  }
  async function saveEditTeam() {
    if (!editingTeamId) return
    const name = editTeamName.trim()
    const code = editTeamCode.trim()
    if (!name) return
    const { data } = await supabase.from('esports_teams')
      .update({ name, code: code || null })
      .eq('id', editingTeamId).select().single()
    if (data) {
      const updated = data as EsportsTeam
      setTeams(prev => prev.map(t => t.id === updated.id ? updated : t))
    }
    setEditingTeamId(null)
  }

  const rankedTeams = useMemo(() =>
    [...teams].sort((a, b) => (powerScores[b.id]?.powerScore ?? 50) - (powerScores[a.id]?.powerScore ?? 50)),
  [teams, powerScores])

  // 경기 결과 입력 등으로 최근 폼 점수이 바뀔 때마다 "오늘" 스냅샷을 계속 최신화해둔다.
  // (비교 기준이 되는 "어제" 스냅샷은 loadPrevSnapshot에서 별도로 고정해서 갖고 있으므로 덮어써도 무방)
  useEffect(() => {
    if (powerLoading || rankedTeams.length === 0) return
    const today = dayjs().format('YYYY-MM-DD')
    const rows = rankedTeams.map((t, i) => ({
      league: code,
      team_id: t.id,
      snapshot_date: today,
      power_score: powerScores[t.id]?.powerScore ?? baselineGpr(t),
      rank: i + 1,
    }))
    supabase.from('esports_power_snapshots').upsert(rows, { onConflict: 'team_id,snapshot_date' })
  }, [powerLoading, rankedTeams, powerScores, code])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>{label}</h2>
        <button onClick={() => loadEvents(true)} disabled={eventsLoading} className="btn btn-ghost" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={12} style={{ animation: eventsLoading ? 'spin 1s linear infinite' : undefined }} /> API 호출
        </button>
        {(() => {
          const fresh = formatFreshness(lastFetchAt, nowTick)
          return (
            <span style={{ fontSize: 10, color: fresh.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: fresh.color, flexShrink: 0 }} />
              {fresh.text}
            </span>
          )
        })()}
      </div>

      <ManualEventPanel leagueCode={code} manualEvents={manualEvents} onChanged={loadManualEvents} autoOpenHint={eventsError} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <RecentMatchesPanel leagueCode={code} events={combinedEvents} loading={eventsLoading} error={eventsError} errorDetail={eventsErrorDetail} teams={teams} onTeamCreated={handleTeamCreated} />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <UpcomingPanel events={combinedEvents} loading={eventsLoading} error={eventsError} errorDetail={eventsErrorDetail} teams={teams} powerScores={powerScores} abilityProfiles={abilityProfiles} powerLog={powerLog} detailedLog={detailedLog} />
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>
              최근 폼 점수 <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>· 수동 입력한 경기(최근일수록 가중치 ↑) 기반, 승부 예측에 사용됨 · 클릭하면 히스토리 보기 · 순위 옆 ▲▼는 전일 대비 순위 변동, 점수 옆 숫자는 전일 대비 증감</span>
            </div>
            {powerLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>계산 중...</div>}
            {!powerLoading && rankedTeams.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>등록된 팀이 없습니다.</div>}
            {!powerLoading && rankedTeams.map((t, rankIdx) => {
              const ps = powerScores[t.id]
              const expanded = expandedPowerTeam === t.id
              const teamLog = powerLog[t.id] ?? []
              const code2 = teamCodeMap[t.id]
              const recentSets = recentSetResults[t.id] ?? []
              const isEditing = editingTeamId === t.id
              const currentRank = rankIdx + 1
              const prev = prevSnapshot[t.id]
              const scoreDelta = ps && prev ? ps.powerScore - prev.powerScore : null
              const rankDelta = prev ? prev.rank - currentRank : null // 양수면 순위 상승(숫자 감소)
              return (
                <div key={t.id} style={{ marginBottom: 4 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                      <input value={editTeamName} onChange={e => setEditTeamName(e.target.value)} placeholder="팀 이름"
                        style={{ flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', minWidth: 0 }} />
                      <input value={editTeamCode} onChange={e => setEditTeamCode(e.target.value)} placeholder="약자"
                        style={{ width: 56, fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                      <button onClick={() => setEditingTeamId(null)} className="btn btn-ghost" style={{ padding: '3px 6px', fontSize: 10, flexShrink: 0 }}>취소</button>
                      <button onClick={saveEditTeam} className="btn btn-primary" style={{ padding: '3px 6px', fontSize: 10, flexShrink: 0 }}>저장</button>
                    </div>
                  ) : (
                  <div onClick={() => { setExpandedPowerTeam(expanded ? null : t.id); setExpandedHistoryIdx(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: 6, cursor: 'pointer' }}>
                    {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      width: 16, height: 16, borderRadius: 4, fontSize: 9, fontWeight: 800,
                      background: 'var(--bg-card)', color: 'var(--text-muted)',
                    }} title="현재 순위">{currentRank}</span>
                    {rankDelta != null && rankDelta !== 0 && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: rankDelta > 0 ? 'var(--green, #4ade80)' : 'var(--red, #f87171)', flexShrink: 0 }}
                        title="어제 대비 순위 변동">
                        {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                      </span>
                    )}
                    {rankDelta === 0 && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }} title="어제 대비 순위 변동 없음">–</span>
                    )}
                    <span style={{ flex: 1, fontWeight: 700 }}>{code2 || t.name}</span>
                    <button onClick={e => { e.stopPropagation(); startEditTeam(t) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                      <Pencil size={10} />
                    </button>
                    {ps && ps.gamesAnalyzed > 0 ? (
                      <>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{ps.gamesAnalyzed}경기 · 승률 {(ps.winRate * 100).toFixed(0)}%</span>
                        <span style={{ fontWeight: 800, color: 'var(--gold)', width: 40, textAlign: 'right' }}>{ps.powerScore.toFixed(1)}</span>
                        {scoreDelta != null && Math.abs(scoreDelta) >= 0.05 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, width: 40, textAlign: 'right', flexShrink: 0,
                            color: scoreDelta > 0 ? 'var(--green, #4ade80)' : 'var(--red, #f87171)',
                          }} title="어제 대비 최근 폼 점수 증감">
                            {scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(1)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>입력된 경기 없음 (GPR 기본값 {(baselineGpr(t)).toFixed(1)})</span>
                    )}
                    {recentSets.length > 0 && (
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} title="최근 세트 결과 (최대 5개, 최신→오래된 순)">
                        {recentSets.map((win, i) => (
                          <span key={i} style={{
                            fontSize: 8, fontWeight: 800, width: 12, textAlign: 'center', borderRadius: 2, lineHeight: '13px',
                            color: '#fff',
                            background: win ? 'var(--green, #4ade80)' : 'var(--red, #f87171)',
                          }}>
                            {win ? 'W' : 'L'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  )}
                  {expanded && (
                    <div style={{ padding: '8px 8px', background: 'var(--bg-card)', borderRadius: 6, marginTop: 2, fontSize: 9 }}>
                      {teamLog.length > 1 && <RatingHistoryChart teamLog={teamLog} />}
                      {(() => {
                        const ap = abilityProfiles[t.id]
                        if (!ap || ap.n === 0) return null
                        const pct = (v: number | null) => v == null ? '-' : `${(v * 100).toFixed(0)}%`
                        const signed = (v: number | null, digits = 1) => v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`
                        const sc = (v: number | null) => v == null ? null : <b style={{ color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 3, padding: '0px 4px', marginLeft: 4 }}>{v}</b>
                        const styleLabel = ap.playstyle === 'teamfight' ? '⚔️ 교전형' : ap.playstyle === 'macro' ? '🛡️ 운영형' : ap.playstyle === 'balanced' ? '⚖️ 밸런스형' : null
                        return (
                          <div style={{ marginBottom: 8, padding: '6px 7px', background: 'var(--bg-elevated)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              능력치 프로필 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(n={ap.n}, 승 {ap.winCount}·패 {ap.lossCount})</span>
                              {styleLabel && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 4, padding: '1px 6px' }}>{styleLabel}</span>}
                            </div>
                            <div>평균 게임시간 <span style={{ color: 'var(--text-muted)' }}>승리 시</span> <b style={{ color: 'var(--gold)' }}>{ap.avgWinDurationMin != null ? `${ap.avgWinDurationMin.toFixed(1)}분` : '-'}</b> <span style={{ color: 'var(--text-muted)' }}>· 패배 시</span> <b style={{ color: 'var(--gold)' }}>{ap.avgLossDurationMin != null ? `${ap.avgLossDurationMin.toFixed(1)}분` : '-'}</b></div>
                            <div>호전성(양팀 합산 평균 킬) <span style={{ color: 'var(--text-muted)' }}>승리 시</span> <b style={{ color: 'var(--gold)' }}>{ap.avgTotalKillsWin != null ? ap.avgTotalKillsWin.toFixed(1) : '-'}</b> <span style={{ color: 'var(--text-muted)' }}>· 패배 시</span> <b style={{ color: 'var(--gold)' }}>{ap.avgTotalKillsLoss != null ? ap.avgTotalKillsLoss.toFixed(1) : '-'}</b></div>
                            <div>라인전{sc(ap.scores.laning)} <span style={{ color: 'var(--text-muted)' }}>· 퍼스트1킬 {pct(ap.fbRate)} · 5킬선취 {pct(ap.fifthKillRate)} · 퍼스트드래곤 {pct(ap.firstDragonRate)}</span></div>
                            <div>교전능력{sc(ap.scores.teamfight)} <span style={{ color: 'var(--text-muted)' }}>이길 때 킬차</span> <b style={{ color: 'var(--gold)' }}>{signed(ap.winTeamfightDiff)}</b> <span style={{ color: 'var(--text-muted)' }}>· 질 때 킬차</span> <b style={{ color: 'var(--gold)' }}>{signed(ap.lossTeamfightDiff)}</b></div>
                            <div>운영능력{sc(ap.scores.macro)} <span style={{ color: 'var(--text-muted)' }}>이길 때 타워차</span> <b style={{ color: 'var(--gold)' }}>{signed(ap.winMacroDiff)}</b> <span style={{ color: 'var(--text-muted)' }}>· 질 때 타워차</span> <b style={{ color: 'var(--gold)' }}>{signed(ap.lossMacroDiff)}</b></div>
                            <div>오브젝트 관리{sc(ap.scores.objective)} <span style={{ color: 'var(--text-muted)' }}>이길 때 장악률</span> <b style={{ color: 'var(--gold)' }}>{pct(ap.winObjRate)}</b> <span style={{ color: 'var(--text-muted)' }}>· 질 때 장악률</span> <b style={{ color: 'var(--gold)' }}>{pct(ap.lossObjRate)}</b></div>
                            <div>마무리능력{sc(ap.scores.closing)} <span style={{ color: 'var(--text-muted)' }}>30분내 승리</span> <b style={{ color: 'var(--gold)' }}>{pct(ap.subThirtyWinRate)}</b></div>
                            <div>멘탈능력{sc(ap.scores.mental)} <span style={{ color: 'var(--text-muted)' }}>초반 주도권 잡고 진 비율</span> <b style={{ color: 'var(--gold)' }}>{pct(ap.chokeRate)}</b> <span style={{ color: 'var(--text-muted)' }}>(n={ap.earlyLeadCount})</span> <span style={{ color: 'var(--text-muted)' }}>· 밀리다 이긴 비율(역전승)</span> <b style={{ color: 'var(--gold)' }}>{pct(ap.comebackRate)}</b> <span style={{ color: 'var(--text-muted)' }}>(n={ap.earlyBehindCount})</span></div>
                          </div>
                        )
                      })()}
                      <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
                        GPR 기본값 {(baselineGpr(t)).toFixed(1)}점에서 시작 → 아래 경기를 시간순으로 하나씩 반영(순차 Elo)하며 최종 {ps?.powerScore.toFixed(1)}점까지 도달. 이겼으면 상대가 아무리 약해도 항상 조금은 오르고, 졌으면 항상 조금은 내려갑니다. 항목을 누르면 자세한 사유가 나옵니다.
                      </div>
                      {teamLog.length === 0 && <div style={{ color: 'var(--text-muted)' }}>입력된 경기가 없습니다.</div>}
                      {teamLog.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {[...teamLog].reverse().map((h, revIdx) => {
                            const i = teamLog.length - 1 - revIdx
                            const rowOpen = expandedHistoryIdx === i
                            return (
                              <div key={i}>
                                <div onClick={() => setExpandedHistoryIdx(rowOpen ? null : i)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 5px', borderRadius: 4, background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                                  <span style={{ color: 'var(--text-muted)', width: 34, flexShrink: 0 }}>{h.matchStartTime ? dayjs(h.matchStartTime).format('MM/DD') : '-'}</span>
                                  <span style={{ fontWeight: 700, color: h.won ? 'var(--green, #4ade80)' : 'var(--red, #f87171)', width: 14, flexShrink: 0 }}>{h.won ? 'W' : 'L'}</span>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teams.find(x => x.id === h.opponentId)?.name ?? '?'}</span>
                                  <span style={{ fontWeight: 700, color: h.delta >= 0 ? 'var(--green, #4ade80)' : 'var(--red, #f87171)', width: 40, textAlign: 'right', flexShrink: 0 }}>{h.delta >= 0 ? '+' : ''}{h.delta.toFixed(2)}</span>
                                  <span style={{ fontWeight: 800, color: 'var(--gold)', width: 34, textAlign: 'right', flexShrink: 0 }}>{h.ratingAfter.toFixed(1)}</span>
                                </div>
                                {rowOpen && (
                                  <div style={{ padding: '4px 6px 6px 45px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                    {h.gameNumber}세트 · 경기 전 점수 {h.ratingBefore.toFixed(1)} vs 상대 {h.opponentRatingBefore.toFixed(1)} · 기대승률 {(h.expected * 100).toFixed(0)}% · 결과 {h.won ? '승' : '패'} · 변화량 {h.delta >= 0 ? '+' : ''}{h.delta.toFixed(2)} → 경기 후 {h.ratingAfter.toFixed(1)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
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
  const [activeLeague, setActiveLeague] = useState<string>('ALL')
  const menuItems = [{ code: 'ALL', label: '전체', icon: '🌐' }, ...LEAGUES.map(lg => ({ code: lg.code, label: lg.label, icon: '🎮' }))]

  const [allRefreshing, setAllRefreshing] = useState(false)
  const [allRefreshNotice, setAllRefreshNotice] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0) // 전체 호출 후 각 LeagueView를 강제로 다시 마운트시켜 새 캐시를 읽게 함

  // 전체 리그를 순서대로 forceRefresh.
  async function refreshAllLeagues() {
    setAllRefreshing(true)
    setAllRefreshNotice(null)
    let okCount = 0
    const errorLeagues: string[] = []
    for (const lg of LEAGUES) {
      try {
        await fetchScheduleEvents(lg.code, { forceRefresh: true })
        okCount++
      } catch {
        errorLeagues.push(lg.label)
      }
    }
    const parts: string[] = []
    if (okCount > 0) parts.push(`${okCount}개 리그 갱신 완료`)
    if (errorLeagues.length > 0) parts.push(`호출 실패: ${errorLeagues.join(', ')}`)
    setAllRefreshNotice(parts.join(' · ') || '완료')
    setRefreshKey(k => k + 1)
    setAllRefreshing(false)
  }
  useEffect(() => {
    if (!allRefreshNotice) return
    const id = setTimeout(() => setAllRefreshNotice(null), 8000)
    return () => clearTimeout(id)
  }, [allRefreshNotice])

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 16 }}>분석</h1>
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18,
        position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', paddingBottom: 8,
      }}>
        {menuItems.map(mi => {
          const active = mi.code === activeLeague
          return (
            <button key={mi.code} onClick={() => setActiveLeague(mi.code)}
              style={{
                textAlign: 'center', padding: '10px 16px', borderRadius: 10,
                border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
                background: active ? 'var(--gold-bg)' : 'var(--bg-card)',
                color: active ? 'var(--gold)' : 'var(--text-primary)',
                fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
              {mi.icon} {mi.label}
            </button>
          )
        })}
      </div>

      {activeLeague === 'ALL' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={refreshAllLeagues} disabled={allRefreshing} className="btn btn-ghost"
              style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={12} style={{ animation: allRefreshing ? 'spin 1s linear infinite' : undefined }} />
              {allRefreshing ? '전체 리그 호출 중...' : '전체 리그 API 호출'}
            </button>
            {allRefreshNotice && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{allRefreshNotice}</span>}
          </div>
          {LEAGUES.map((lg, i) => (
            <div key={lg.code} style={{ paddingTop: i === 0 ? 0 : 12, borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <LeagueView key={`${lg.code}-${refreshKey}`} code={lg.code} label={lg.label} />
            </div>
          ))}
        </div>
      ) : (
        <LeagueView key={activeLeague} code={activeLeague} label={LEAGUES.find(x => x.code === activeLeague)!.label} />
      )}
    </div>
  )
}

// ─── 완료된 LoL 경기 결과 + 세트별 상세 통계 (분석 탭 전용, CitoAPI 기반) ─────
// citoapi.com은 문서화된 정식 API라 필드 구조를 신뢰할 수 있지만(비공식 lolesports livestats와 다름),
// 실제 응답을 아직 라이브로 확인 못 한 엔드포인트(스케줄/포스트게임)는 방어적으로 파싱하고
// 항상 raw 원본을 같이 넘겨서, 화면에서 "원본 보기"로 바로 확인·디버깅할 수 있게 했다.
// API 키는 절대 여기 없다 — 전부 Supabase Edge Function(cito-proxy)을 거쳐서만 호출한다.

import { supabase } from './supabase'

export const SUPPORTED_LEAGUES: { code: string; label: string; slug: string }[] = [
  { code: 'LCK', label: 'LCK', slug: 'lck' },
  { code: 'LPL', label: 'LPL', slug: 'lpl' },
  { code: 'LEC', label: 'LEC', slug: 'lec' },
  { code: 'LCS', label: 'LCS', slug: 'lcs' },
]

async function citoFetch(path: string, query?: Record<string, string>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('cito-proxy', { body: { path, query } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

function unwrap(json: any): any {
  return json?.data ?? json
}

export interface CompletedMatch {
  id: string
  league: string
  leagueLabel: string
  startTime: string
  bestOf: number
  teamA: string; teamACode?: string; scoreA: number
  teamB: string; teamBCode?: string; scoreB: number
  raw?: unknown
}

export interface TeamGameStats {
  kills: number; towers: number; inhibitors: number; barons: number
  dragons: number; dragonTypes: string[]
  totalGold: number
}
export interface GameDetailStats {
  gameNumber: number
  durationSeconds: number | null
  teamA: TeamGameStats
  teamB: TeamGameStats
  raw?: unknown
}

// 지정한 리그의 최근 완료 경기(최대 days일 전까지)를 가져온다.
export async function fetchRecentCompletedMatches(leagueCode: string, days = 7): Promise<CompletedMatch[]> {
  const meta = SUPPORTED_LEAGUES.find(l => l.code === leagueCode)
  if (!meta) return []
  const to = new Date()
  const from = new Date(Date.now() - days * 86400000)
  const json = await citoFetch(`lol/leagues/${meta.slug}/schedule`, {
    state: 'completed',
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  })
  const payload = unwrap(json)
  const list: any[] = Array.isArray(payload) ? payload : (payload?.matches ?? payload?.schedule ?? payload?.events ?? [])
  const results = list.map((m: any): CompletedMatch => {
    const teams = m.teams ?? [m.blueTeam, m.redTeam].filter(Boolean)
    return {
      id: String(m.matchId ?? m.id ?? m.match_id ?? ''),
      league: leagueCode, leagueLabel: meta.label,
      startTime: m.startTime ?? m.scheduledAt ?? m.date ?? '',
      bestOf: m.bestOf ?? m.strategy?.count ?? 3,
      teamA: teams?.[0]?.name ?? teams?.[0]?.teamName ?? '?', teamACode: teams?.[0]?.code ?? teams?.[0]?.slug,
      scoreA: m.score?.blue ?? teams?.[0]?.score ?? teams?.[0]?.gameWins ?? 0,
      teamB: teams?.[1]?.name ?? teams?.[1]?.teamName ?? '?', teamBCode: teams?.[1]?.code ?? teams?.[1]?.slug,
      scoreB: m.score?.red ?? teams?.[1]?.score ?? teams?.[1]?.gameWins ?? 0,
      raw: m,
    }
  })
  results.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  return results
}

// 경기(시리즈) 하나에 속한 세트(게임)들의 ID 목록.
export async function fetchMatchGames(matchId: string): Promise<{ id: string; number: number }[]> {
  const json = await citoFetch(`lol/matches/${matchId}/games`)
  const payload = unwrap(json)
  const list: any[] = Array.isArray(payload) ? payload : (payload?.games ?? [])
  return list.map((g: any, i: number) => ({ id: String(g.gameId ?? g.id), number: g.number ?? g.gameNumber ?? i + 1 }))
}

function extractTeamStats(side: any): TeamGameStats {
  if (!side) return { kills: 0, towers: 0, inhibitors: 0, barons: 0, dragons: 0, dragonTypes: [], totalGold: 0 }
  const dragons = side.dragons ?? side.dragonTypes ?? []
  return {
    kills: side.totalKills ?? side.kills ?? 0,
    towers: side.towers ?? side.towerKills ?? 0,
    inhibitors: side.inhibitors ?? side.inhibitorKills ?? 0,
    barons: side.barons ?? side.baronKills ?? 0,
    dragons: Array.isArray(dragons) ? dragons.length : (side.dragonKills ?? 0),
    dragonTypes: Array.isArray(dragons) ? dragons : [],
    totalGold: side.totalGold ?? side.gold ?? 0,
  }
}

// 세트 하나(gameId)의 완료 후 상세 통계. citoapi의 /postgame(완료 경기 전용)을 우선 쓰고,
// 없으면 /stats로 폴백한다. 정확한 응답 형태를 아직 실측 못 해서 여러 필드명을 방어적으로 다 시도하고,
// raw를 항상 같이 넘겨서 화면에서 바로 확인할 수 있게 한다.
export async function fetchGameDetailStats(gameId: string): Promise<GameDetailStats | null> {
  for (const path of [`lol/games/${gameId}/postgame`, `lol/games/${gameId}/stats`]) {
    try {
      const json = await citoFetch(path)
      const payload = unwrap(json)
      if (!payload) continue
      const blue = payload.blueTeam ?? payload.teams?.blue ?? payload.teams?.[0] ?? payload.team1
      const red = payload.redTeam ?? payload.teams?.red ?? payload.teams?.[1] ?? payload.team2
      if (!blue && !red) { console.warn(`[lolResults] ${path}: 팀 데이터 위치를 못 찾음`, payload); continue }
      return {
        gameNumber: 0, // 호출 쪽에서 채움
        durationSeconds: payload.gameDuration ?? payload.duration ?? payload.durationSeconds ?? null,
        teamA: extractTeamStats(blue), teamB: extractTeamStats(red),
        raw: payload,
      }
    } catch (err) {
      console.warn(`[lolResults] ${path}: 호출 실패`, err)
    }
  }
  return null
}

// 지정한 리그의 지금 라이브로 진행 중인 경기(있으면). 라이브 보드는 문서에 응답 형태가 명시돼 있어
// 다른 것보다 신뢰도가 높다.
export async function fetchLiveMatch(leagueCode: string): Promise<CompletedMatch | null> {
  const meta = SUPPORTED_LEAGUES.find(l => l.code === leagueCode)
  if (!meta) return null
  const json = await citoFetch('lol/live')
  const payload = unwrap(json)
  const list: any[] = Array.isArray(payload) ? payload : (payload?.matches ?? [])
  const live = list.find((m: any) => (m.league ?? '').toString().toLowerCase().includes(meta.slug))
  if (!live) return null
  const teams = live.teams ?? []
  return {
    id: String(live.matchId ?? live.id ?? ''),
    league: leagueCode, leagueLabel: meta.label,
    startTime: live.startTime ?? '',
    bestOf: live.bestOf ?? 3,
    teamA: teams?.[0]?.name ?? '?', teamACode: teams?.[0]?.code, scoreA: live.score?.blue ?? 0,
    teamB: teams?.[1]?.name ?? '?', teamBCode: teams?.[1]?.code, scoreB: live.score?.red ?? 0,
    raw: live,
  }
}

// 라이브 매치의 현재(또는 마지막 완료) 게임 ID — 문서 예시에 나온 currentGameId를 우선 쓴다.
export async function fetchLiveCurrentGameId(matchId: string): Promise<string | null> {
  const json = await citoFetch(`lol/live/${matchId}/series`)
  const payload = unwrap(json)
  return payload?.currentGameId ? String(payload.currentGameId) : null
}

// 라이브 게임의 실시간 통계(문서에 응답 형태가 명시돼 있어 신뢰도 높음).
export async function fetchLiveGameStats(gameId: string): Promise<GameDetailStats | null> {
  try {
    const json = await citoFetch(`lol/live/${gameId}/stats`)
    const payload = unwrap(json)
    const blue = payload?.blueTeam
    const red = payload?.redTeam
    if (!blue || !red) return null
    return {
      gameNumber: 0,
      durationSeconds: null,
      teamA: extractTeamStats(blue), teamB: extractTeamStats(red),
      raw: payload,
    }
  } catch { return null }
}

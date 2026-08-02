// ─── gol.gg 자동 동기화 Edge Function ──────────────────────────────
// team-matchlist 페이지(서버렌더링, split-ALL/tournament-ALL)에서 팀이 치른
// 모든 게임의 링크(game id)를 뽑아내고, DB에 없는 새 게임만
// page-game 상세 페이지를 파싱해 esports_game_stats에 upsert한다.
//
// 트리거: pg_cron(자동, 매일 1회) 또는 songbet Analysis 탭의 "새로고침" 버튼(수동)
// 요청 바디: { league?: string; triggerType?: 'cron' | 'manual' }  (league 생략 시 전체 지원 리그)

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
}
const MAX_GAME_IDS_PER_TEAM = 12 // team-matchlist는 최신순으로 나오므로 상위 N개만 확인

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`)
  return await res.text()
}

// team-matchlist HTML에서 /game/stats/{id}/page-{game|summary|fullstats}/ 링크의 id만 추출 (등장 순서 = 최신순 유지, 중복 제거)
function extractGameIds(html: string): string[] {
  const re = /\/game\/stats\/(\d+)\/page-/g
  const ids: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]) }
  }
  return ids
}

interface ParsedGame {
  golggGameId: string
  opponent: string
  matchStartTime: string | null // ISO date (해당 gol.gg 페이지의 날짜, 예: 2026-08-01)
  durationSeconds: number | null
  gameNumber: number
  team1Kills: number | null; team2Kills: number | null
  team1Dragons: number | null; team2Dragons: number | null
  team1Towers: number | null; team2Towers: number | null
  team1Barons: number | null; team2Barons: number | null
  team1Gold: number | null; team2Gold: number | null
  winnerTeam: 'team1' | 'team2'
}

// page-game 상세 페이지 파싱. ourGolggTeamId로 어느 블록이 "우리 팀"인지 판별.
// 아이콘 파일명(ic_kills.png 등)을 앵커로 다음 숫자 토큰을 집계 방식 없이 순서대로 추출한다.
// 페이지 구조상 첫 번째 팀 블록 → 두 번째 팀 블록 순으로 각 스탯 아이콘이 한 번씩 나온다는 가정.
function parseGamePage(html: string, ourGolggTeamId: number, golggGameId: string): ParsedGame | null {
  try {
    // 어느 팀이 먼저 나오는지 + 팀 표시명: team-stats/{id}/ 링크(앵커 텍스트 포함) 등장 순서로 판별.
    // <title> 태그의 팀 순서는 본문 블록 순서와 다를 수 있어(관찰됨) 이름도 반드시 이 링크에서 뽑는다.
    const teamLinkRe = /teams\/team-stats\/(\d+)\/[^"'>]*["'][^>]*>([^<]+)<\/a>/g
    const teamOrder: string[] = []
    const teamNames: Record<string, string> = {}
    const seenTeam = new Set<string>()
    let tm: RegExpExecArray | null
    while ((tm = teamLinkRe.exec(html))) {
      if (!seenTeam.has(tm[1])) { seenTeam.add(tm[1]); teamOrder.push(tm[1]); teamNames[tm[1]] = tm[2].trim() }
    }
    const ourIdx = teamOrder.indexOf(String(ourGolggTeamId))
    if (ourIdx === -1) return null // 우리 팀을 못 찾음 (구조 변경 가능성) → 스킵하고 로그로 확인
    const oppGolggId = teamOrder[1 - ourIdx]

    // WIN/LOSS 텍스트가 각 팀 블록에 한 번씩, 등장 순서대로 나온다고 가정
    const resultMatches = [...html.matchAll(/-\s*(WIN|LOSS)\b/g)].map(m => m[1])
    const ourResult = resultMatches[ourIdx]
    const winnerTeam: 'team1' | 'team2' = ourResult === 'WIN' ? 'team1' : 'team2'

    // 숫자 아이콘 파싱 헬퍼: 아이콘 파일명 등장 순서대로 다음 숫자를 뽑음 (2개: [team0, team1])
    function pairAfterIcon(iconFile: string): [number | null, number | null] {
      const re = new RegExp(iconFile.replace('.', '\\.') + '"[^>]*>\\s*([\\d.]+)', 'g')
      const vals = [...html.matchAll(re)].map(m => parseFloat(m[1]))
      return [vals[0] ?? null, vals[1] ?? null]
    }
    const [kills0, kills1] = pairAfterIcon('ic_kills.png')
    const [towers0, towers1] = pairAfterIcon('ic_tours.png')
    const [dragons0, dragons1] = pairAfterIcon('ic_dragons.png')
    const [barons0, barons1] = pairAfterIcon('ic_barons.png')
    const [gold0, gold1] = pairAfterIcon('ic_golds.png')

    const orderedPick = (a: number | null, b: number | null) => ourIdx === 0 ? { our: a, opp: b } : { our: b, opp: a }
    const kills = orderedPick(kills0, kills1)
    const towers = orderedPick(towers0, towers1)
    const dragons = orderedPick(dragons0, dragons1)
    const barons = orderedPick(barons0, barons1)
    const gold = orderedPick(gold0, gold1)

    // 게임 시간: "Game Time" 라벨 뒤 mm:ss
    const durMatch = html.match(/Game Time[\s\S]{0,80}?(\d{1,2}):(\d{2})/)
    const durationSeconds = durMatch ? parseInt(durMatch[1], 10) * 60 + parseInt(durMatch[2], 10) : null

    // 날짜: YYYY-MM-DD 패턴 (해당 게임 헤더 근처)
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/)
    const matchStartTime = dateMatch ? dateMatch[1] : null

    // 상대팀 이름: 위에서 뽑은 team-stats 링크 텍스트 사용 (본문 순서 기준이라 title 태그보다 신뢰도 높음)
    const opponent = teamNames[oppGolggId] ?? `golgg-team-${oppGolggId}`

    // 게임 번호: <title>...game N - ...</title> 패턴에서만 추출 (팀 순서는 안 씀)
    let gameNumber = 1
    const gameNumMatch = html.match(/<title>[^<]*?\bgame\s*(\d+)\b[^<]*<\/title>/i)
    if (gameNumMatch) gameNumber = parseInt(gameNumMatch[1], 10)

    return {
      golggGameId, opponent, matchStartTime, durationSeconds, gameNumber,
      team1Kills: kills.our, team2Kills: kills.opp,
      team1Dragons: dragons.our, team2Dragons: dragons.opp,
      team1Towers: towers.our, team2Towers: towers.opp,
      team1Barons: barons.our, team2Barons: barons.opp,
      team1Gold: gold.our, team2Gold: gold.opp,
      winnerTeam,
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  let body: { league?: string; triggerType?: 'cron' | 'manual' } = {}
  try { body = await req.json() } catch { /* 빈 바디 허용 */ }
  const triggerType = body.triggerType ?? 'cron'
  const leagueFilter = body.league

  let query = supabase.from('esports_teams').select('id, league, name, golgg_team_id').not('golgg_team_id', 'is', null)
  if (leagueFilter) query = query.eq('league', leagueFilter)
  const { data: targetTeams, error: targetErr } = await query

  if (targetErr || !targetTeams) {
    return new Response(JSON.stringify({ error: targetErr?.message ?? 'no teams' }), { status: 500 })
  }

  let gamesAdded = 0, gamesUpdated = 0, teamsSynced = 0
  const errors: string[] = []
  const { data: logRow } = await supabase.from('esports_sync_log')
    .insert({ league: leagueFilter ?? 'ALL', trigger_type: triggerType }).select().single()

  for (const team of targetTeams) {
    try {
      const listHtml = await fetchText(`https://gol.gg/teams/team-matchlist/${team.golgg_team_id}/split-ALL/tournament-ALL/`)
      const gameIds = extractGameIds(listHtml).slice(0, MAX_GAME_IDS_PER_TEAM)
      if (gameIds.length === 0) {
        errors.push(`${team.name}: team-matchlist에서 game id를 못 찾음 (구조 변경 가능성)`)
        continue
      }

      const { data: existing } = await supabase
        .from('esports_game_stats')
        .select('golgg_game_id')
        .eq('team_id', team.id)
        .in('golgg_game_id', gameIds)
      const existingIds = new Set((existing ?? []).map(e => e.golgg_game_id))
      const newIds = gameIds.filter(id => !existingIds.has(id))

      for (const gid of newIds) {
        const gameHtml = await fetchText(`https://gol.gg/game/stats/${gid}/page-game/`)
        const parsed = parseGamePage(gameHtml, team.golgg_team_id, gid)
        if (!parsed) {
          errors.push(`${team.name} game ${gid}: 파싱 실패`)
          continue
        }
        const { error: upsertErr } = await supabase.from('esports_game_stats').upsert({
          team_id: team.id,
          golgg_game_id: parsed.golggGameId,
          team2_name: parsed.opponent,
          match_start_time: parsed.matchStartTime,
          game_number: parsed.gameNumber,
          duration_seconds: parsed.durationSeconds,
          team1_kills: parsed.team1Kills, team2_kills: parsed.team2Kills,
          team1_dragons: parsed.team1Dragons, team2_dragons: parsed.team2Dragons,
          team1_towers: parsed.team1Towers, team2_towers: parsed.team2Towers,
          team1_barons: parsed.team1Barons, team2_barons: parsed.team2Barons,
          team1_gold: parsed.team1Gold, team2_gold: parsed.team2Gold,
          winner_team: parsed.winnerTeam,
          source: 'golgg',
        }, { onConflict: 'team_id,golgg_game_id' })
        if (upsertErr) errors.push(`${team.name} game ${gid}: upsert 실패 - ${upsertErr.message}`)
        else gamesAdded++
      }
      teamsSynced++
    } catch (e) {
      errors.push(`${team.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (logRow) {
    await supabase.from('esports_sync_log').update({
      finished_at: new Date().toISOString(),
      games_added: gamesAdded, games_updated: gamesUpdated, teams_synced: teamsSynced,
      error: errors.length ? errors.slice(0, 20).join(' | ') : null,
    }).eq('id', logRow.id)
  }

  return new Response(JSON.stringify({ gamesAdded, gamesUpdated, teamsSynced, errors }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// 지난 시즌 선수 시즌 평균 → player_base (오버롤 기본 체급용, 시즌마다 한 번).
// body: { league: 'NBA', season?: 2026 (ESPN 시즌 = 끝나는 해) }
//  - NBA: ESPN 선수 시즌 기록(byathlete). KBL·WKBL은 collect-stats로 지난 시즌 경기를 받은 뒤 SQL로 모아 넣는다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const year = Number(body.season ?? new Date().getUTCFullYear() - (new Date().getUTCMonth() >= 7 ? 0 : 1))
  const seasonLabel = `${year - 1}-${String(year).slice(2)}`
  const rows: Record<string, unknown>[] = []
  let debug: unknown = null
  for (let page = 1; page <= 20; page++) {
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=${page}&limit=100&sort=general.avgMinutes:desc&season=${year}&seasontype=2`
    const res = await fetch(url, { headers: UA })
    if (!res.ok) { debug = { status: res.status, page }; break }
    const j = await res.json()
    const cats: any[] = j.categories ?? []
    const names: Record<string, string[]> = {}
    for (const c of cats) names[c.name] = c.names ?? []
    for (const a of j.athletes ?? []) {
      const v: Record<string, number> = {}
      for (const c of a.categories ?? []) {
        const ns = names[c.name] ?? c.names ?? []
        const vals: unknown[] = c.values ?? c.totals ?? []
        ns.forEach((n, i) => { const x = Number(vals[i]); if (Number.isFinite(x)) v[n] = x })
      }
      const g = (k: string) => v[k] ?? 0
      const gp = v.gamesPlayed ?? 0
      if (!gp) continue
      const gmsc = g('avgPoints') + 0.4 * g('avgFieldGoalsMade') - 0.7 * g('avgFieldGoalsAttempted') - 0.4 * (g('avgFreeThrowsAttempted') - g('avgFreeThrowsMade'))
        + 0.5 * g('avgRebounds') + 0.7 * g('avgAssists') + g('avgSteals') + 0.7 * g('avgBlocks') - g('avgTurnovers')
      rows.push({ league: 'NBA', season: seasonLabel, player_id: String(a.athlete?.id), player_name: a.athlete?.displayName, team: a.athlete?.teamName ?? a.athlete?.teamShortName ?? null,
        gp, min: v.avgMinutes ?? null, gmsc: Math.round(gmsc * 100) / 100, pts: v.avgPoints ?? null, reb: v.avgRebounds ?? null, ast: v.avgAssists ?? null, source: 'espn', updated_at: new Date().toISOString() })
    }
    if (page === 1) debug = { keys: Object.keys(names), sample: Object.keys(j.athletes?.[0] ?? {}), pages: j.pagination?.pages }
    if (!j.pagination || page >= (j.pagination.pages ?? 1)) break
  }
  if (rows.length) {
    const { error } = await db.from('player_base').upsert([...new Map(rows.map(r => [r.player_id, r])).values()])
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  return new Response(JSON.stringify({ season: seasonLabel, rows: rows.length, debug }), { headers: { 'Content-Type': 'application/json' } })
})

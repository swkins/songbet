// LoL 리그 전력 보정 (사용자 요청 — LCK 95와 LCS 95는 달라야 한다)
// 출처: Riot 글로벌 파워랭킹(GPR). Liquipedia가 그대로 옮겨 둔 페이지(Global_Power_Rankings/연도/시점)에서
//   팀 점수(PowerRankings/row: team·league·score·wl)와 '지역 대회 위력 점수'(RegionRankings/row: league·score)를 읽는다.
//   그 해 페이지 중 date가 가장 늦은 것 → lol_team_gpr(팀 점수), lol_league_strength(리그 보정).
//   이미 저장된 리그 보정이 더 새 날짜면(예: lolesports에서 손으로 옮긴 월즈 종료 값) 덮어쓰지 않는다 (body.force면 덮어씀).
// 보정점 = K × (리그 위력 점수 − 가장 높은 리그) × ln10/400 (Elo: 100점 차 ≈ 64%),
//   K = 리그 안 '팀 평균 체급 ~ 팀 승률 logit' 기울기 (점/logit, 리그별 평균 뺀 합동 기울기).
// body: { season?: '2026', force?: boolean }
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'songbet-lol-stats/0.1 (personal use)', 'Accept-Encoding': 'gzip' }
const API = 'https://liquipedia.net/leagueoflegends/api.php'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const LG: Record<string, string> = { lck: 'LCK', lpl: 'LPL', lec: 'LEC', lcs: 'LCS', lcp: 'LCP', cblol: 'CBLOL' }

Deno.serve(async (req) => {
  const body: any = await req.json().catch(() => ({}))
  const season: string = body.season ?? '2026'
  const out = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    // 1) 그 해 GPR 페이지 목록 → 페이지마다 date 읽어 가장 늦은 것 (Liquipedia 요청 간격 2초 이상)
    const lr = await fetch(`${API}?action=query&list=allpages&apprefix=${encodeURIComponent(`Global_Power_Rankings/${season}`)}&aplimit=50&format=json`, { headers: UA })
    const pages: string[] = ((await lr.json()).query?.allpages ?? []).map((p: any) => p.title)
    let best: { title: string; date: string; text: string } | null = null
    for (const title of pages) {
      await sleep(2500)
      const r = await fetch(`${API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`, { headers: UA })
      if (!r.ok) continue
      const text: string = (await r.json()).parse?.wikitext?.['*'] ?? ''
      const date = text.match(/\{\{PowerRankings\|[^\n]*date=(\d{4}-\d{2}-\d{2})/)?.[1] ?? ''
      if (date && (!best || date > best.date)) best = { title, date, text }
    }
    if (!best) return out({ error: 'GPR 페이지를 못 찾음', pages })
    const teams = [...best.text.matchAll(/PowerRankings\/row\|team=([^|]+)\|league=(\w+)\|score=(\d+)(?:\|wl=([\d-]+))?/g)]
      .map((m, i) => ({ season, snapshot: best!.date, team: m[1].trim(), region: m[2], points: Number(m[3]), rank: i + 1, updated_at: new Date().toISOString() }))
    const regions = [...best.text.matchAll(/RegionRankings\/row\|league=(\w+)\|score=(\d+)/g)].map(m => ({ league: LG[m[1]] ?? m[1].toUpperCase(), gpr: Number(m[2]) }))
    if (teams.length) { const { error } = await db.from('lol_team_gpr').upsert(teams); if (error) return out({ error: error.message }) }

    // 2) K (점/logit)
    const { data: ps } = await db.from('v_lol_player_rating').select('league, team, games, winrate, base, regular').eq('season', season).limit(5000)
    const tm = new Map<string, { league: string; g: number; w: number; b: number }>()
    for (const p of ps ?? []) {
      if (!p.team || !p.regular) continue
      const t = tm.get(p.team) ?? { league: p.league, g: 0, w: 0, b: 0 }
      t.g += p.games; t.w += Number(p.winrate) / 100 * p.games; t.b += Number(p.base) * p.games; tm.set(p.team, t)
    }
    const byLg = new Map<string, { x: number; y: number }[]>()
    for (const t of tm.values()) {
      if (t.g < 40) continue
      const wr = Math.min(0.85, Math.max(0.15, t.w / t.g))
      const a = byLg.get(t.league) ?? []; a.push({ x: Math.log(wr / (1 - wr)), y: t.b / t.g }); byLg.set(t.league, a)
    }
    let sxy = 0, sxx = 0
    for (const a of byLg.values()) {
      const mx = a.reduce((s, v) => s + v.x, 0) / a.length, my = a.reduce((s, v) => s + v.y, 0) / a.length
      for (const v of a) { sxy += (v.x - mx) * (v.y - my); sxx += (v.x - mx) ** 2 }
    }
    const K = sxx ? Math.round(sxy / sxx * 100) / 100 : 18

    // 3) 리그 보정 — 저장된 값이 더 새 날짜면 그대로 둔다
    const { data: cur } = await db.from('lol_league_strength').select('league, detail').eq('season', season)
    const curDate = (cur ?? []).reduce((m: string, r: any) => (r.detail?.date && r.detail.date > m ? r.detail.date : m), '')
    let leagueRows: any[] = []
    if (regions.length && (body.force || best.date >= curDate)) {
      const top = Math.max(...regions.map(r => r.gpr))
      leagueRows = regions.map(r => ({ season, league: r.league, offset_logit: Math.round((r.gpr - top) * Math.LN10 / 400 * 1000) / 1000,
        offset_points: Math.round(K * (r.gpr - top) * Math.LN10 / 400 * 10) / 10, k: K, source: `Riot GPR 지역 대회 위력 점수 (Liquipedia ${best!.title.split('/').pop()} · ${best!.date})`,
        detail: { gpr: r.gpr, date: best!.date, page: best!.title }, updated_at: new Date().toISOString() }))
      const { error } = await db.from('lol_league_strength').upsert(leagueRows); if (error) return out({ error: error.message })
    }
    return out({ page: best.title, date: best.date, teams: teams.length, regions, K, leagueUpdated: leagueRows.length > 0, keptNewer: leagueRows.length ? null : curDate })
  } catch (e) { return out({ error: String(e) }) }
})

// LoL 선수 체급 자료 수집 (사용자 요청) → lol_player_stats
// body: { league: 'LCK' | 'LCK CL' | 'LPL' | 'LEC' | 'LCS' | 'LCP' | 'CBLOL' | 'INTL', season?: 'S16' (2026) · 'S15' · 'S14' }  ·  { mode: 'tournaments' } = 대회 목록만
//  1) gol.gg 시즌 대회 목록(ajax.trlist.php)에서 그 리그 대회를 고르고, 대회마다 선수 목록 페이지(상세 통계 24칸)를 받아
//     경기 수로 가중 평균해서 합친다 (대회 사이 3~6초 쉼). 펜타·솔로킬은 합계.
//  2) 팀·포지션은 Leaguepedia(ScoreboardPlayers)에서 그 리그·그 해 경기 — 팀 = 그 선수가 그 해 마지막으로 뛴 팀,
//     포지션 = 가장 많이 뛴 포지션. 이름은 괄호(본명)를 뗀 소문자로 맞춘다.
//  체급 점수는 SQL 뷰 v_lol_player_rating (supabase/lol_player.sql).
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
// gol.gg 대회 이름 → 리그 (시즌마다 이름 꼴이 달라서 앞부분만: 'LCK Spring 2024' · 'LCK Cup 2025' · 'LCK 2026 Rounds 1-2'),
// Leaguepedia OverviewPage LIKE 꼴 ({Y} = 연도). INTL = 국제전 본선(퍼스트 스탠드·MSI·월즈 플레이인/본선·EWC 본선) — 강팀끼리라 체급에 더 무겁게 쓴다.
const LEAGUES: Record<string, { gol: RegExp; not?: RegExp; lp: string[] }> = {
  LCK: { gol: /^LCK (?!CL)/, lp: ['LCK/{Y}%'] },
  'LCK CL': { gol: /^LCK CL /, lp: ['LCK CL/{Y}%'] },
  LPL: { gol: /^LPL /, lp: ['LPL/{Y}%'] },
  LEC: { gol: /^LEC /, lp: ['LEC/{Y}%'] },
  LCS: { gol: /^(LCS |LTA North )/, lp: ['LCS/{Y}%', 'LTA North/{Y}%'] },   // 2025년엔 LTA 북부
  LCP: { gol: /^LCP /, lp: ['LCP/{Y}%'] },
  CBLOL: { gol: /^(CBLOL |LTA South )/, lp: ['CBLOL/{Y}%', 'LTA South/{Y}%'] },   // 2025년엔 LTA 남부
  INTL: { gol: /(First Stand|^MSI |^Worlds |^Esports World Cup)/, not: /Qualifier|Online|Kespa|KeSPA/i,
          lp: ['{Y} First Stand%', '{Y} Mid-Season Invitational%', '{Y} Season World Championship%', 'Esports World Cup {Y}'] },
}
const COLS = ['games', 'winrate', 'kda', 'kills', 'deaths', 'assists', 'csm', 'gpm', 'kp', 'dmg_pct', 'gold_pct', 'vs_pct', 'dpm', 'vspm', 'wpm', 'wcpm', 'vwpm', 'gd15', 'csd15', 'xpd15', 'fb', 'fb_victim', 'pentas', 'solo_kills'] as const
const SUMS = new Set(['games', 'pentas', 'solo_kills'])
const norm = (s: string) => s.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()
const num = (s: string) => { const t = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace('%', '').trim(); if (!t || t === '-') return null; const n = Number(t); return Number.isFinite(n) ? n : null }

async function tournaments(season: string) {
  const res = await fetch('https://gol.gg/tournament/ajax.trlist.php', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://gol.gg/tournament/list/' }, body: `season=${season}` })
  if (!res.ok) throw new Error(`gol.gg 대회 목록 ${res.status}`)
  return JSON.parse((await res.text()).trim()) as { trname: string; region: string; nbgames: string; firstgame: string; lastgame: string }[]
}

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* */ }
  const season: string = body.season ?? 'S16'
  const out = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })
  try {
    const list = await tournaments(season)
    if (body.mode === 'tournaments') return out(list)
    const lg = LEAGUES[body.league]; if (!lg) return out({ error: 'unknown league' })
    const trs = list.filter(t => lg.gol.test(t.trname) && !((lg.not ?? /Academy|Challengers|Qualifier/i).test(t.trname)))
    const year = '20' + (Number(season.slice(1)) + 10)   // S16 → 2026
    // 1) gol.gg 대회별 선수 표
    const acc = new Map<string, any>(); const failed: string[] = []
    for (const [i, t] of trs.entries()) {
      if (i) await sleep(3000 + Math.random() * 3000)
      // gol.gg가 가끔 연결을 끊는다 → 3번까지 다시 (5~10초 뒤), 그래도 안 되면 그 대회는 건너뛰고 결과에 남김
      let html = ''
      for (let k = 0; k < 3 && !html; k++) {
        try { const res = await fetch(`https://gol.gg/players/list/season-${season}/split-ALL/tournament-${encodeURIComponent(t.trname)}/`, { headers: UA }); if (res.ok) html = await res.text() } catch { /* 다시 */ }
        if (!html) await sleep(5000 + Math.random() * 5000)
      }
      if (!html) { failed.push(t.trname); continue }
      for (const m of html.matchAll(/<tr><td><a href='\.\/player-stats\/(\d+)\/[^']*' title='[^']*'>([^<]+)<\/a><\/td><td[^>]*><span class='d-none'>([^<]*)<\/span>[\s\S]*?<\/td>((?:<td class='text-center'>[\s\S]*?<\/td>){24})<\/tr>/g)) {
        const cells = [...m[4].matchAll(/<td class='text-center'>([\s\S]*?)<\/td>/g)].map(x => num(x[1]))
        const g = cells[0] ?? 0; if (!g) continue
        const name = m[2].trim()
        const a = acc.get(name) ?? { player: name, golgg_id: m[1], country: m[3] || null, tournaments: {}, w: {} as Record<string, number> }
        a.tournaments[t.trname] = g
        COLS.forEach((c, k) => {
          const v = cells[k]; if (v == null) return
          if (SUMS.has(c)) a[c] = (a[c] ?? 0) + v
          else { a[c] = (a[c] ?? 0) + v * g; a.w[c] = (a.w[c] ?? 0) + g }
        })
        acc.set(name, a)
      }
    }
    // 2) Leaguepedia 팀·포지션 (그 해 그 리그 경기)
    const where = lg.lp.map(p => `SP.OverviewPage LIKE '${p.replaceAll('{Y}', year)}'`).join(' OR ')
    const q = new URLSearchParams({ action: 'cargoquery', format: 'json', tables: 'ScoreboardPlayers=SP', fields: 'SP.Link,SP.Team,SP.Role,COUNT(*)=N,MAX(SP.DateTime_UTC)=L', where, group_by: 'SP.Link,SP.Team,SP.Role', limit: '500' })
    await sleep(2000)
    const lpRes = await fetch(`https://lol.fandom.com/api.php?${q}`, { headers: UA })
    const lpRows: any[] = lpRes.ok ? ((await lpRes.json()).cargoquery ?? []).map((x: any) => x.title) : []
    const info = new Map<string, { link: string; team: string; teamAt: string; roles: Record<string, number> }>()
    for (const r of lpRows) {
      const k = norm(r.Link); const i = info.get(k) ?? { link: r.Link, team: r.Team, teamAt: '', roles: {} }
      if ((r.L ?? '') > i.teamAt) { i.team = r.Team; i.teamAt = r.L ?? '' }
      i.roles[r.Role] = (i.roles[r.Role] ?? 0) + Number(r.N ?? 0)
      info.set(k, i)
    }
    const rows = [...acc.values()].map(a => {
      for (const c of COLS) if (!SUMS.has(c) && a[c] != null) a[c] = Math.round((a[c] / a.w[c]) * 100) / 100
      const i = info.get(norm(a.player))
      const role = i ? Object.entries(i.roles).sort((x, y) => y[1] - x[1])[0][0] : null
      const { w: _w, ...rest } = a
      return { season: year, league: body.league, ...rest, lp_link: i?.link ?? null, team: i?.team ?? null, role, updated_at: new Date().toISOString() }
    })
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    for (let k = 0; k < rows.length; k += 200) { const { error } = await db.from('lol_player_stats').upsert(rows.slice(k, k + 200)); if (error) throw new Error(error.message) }
    return out({ league: body.league, failed, tournaments: trs.map(t => `${t.trname} (${t.nbgames})`), players: rows.length, withTeam: rows.filter(r => r.team).length, lpRows: lpRows.length, unmatched: rows.filter(r => !r.team && r.games >= 5).map(r => r.player) })
  } catch (e) { return out({ error: String(e) }) }
})

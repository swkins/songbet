// 경기 전 예측 저장·채점 → predictions (분석 탭 '예측 보고서', Claude 매일 검토의 재료)
// 화면과 똑같은 계산(src/lib/playerOverall.ts·fatigue.ts)을 build.mjs로 묶어 쓴다 — 계산을 고치면 다시 묶어 배포.
// body.mode: 'nba' = 다음 NBA 경기 전부 (pg_cron 21:30 KST, 사용자 22시 베팅 직전)
//            'domestic' = KBL·WKBL·V리그 남녀 중 20~100분 뒤 시작 경기 (매시 05분) — 배구는 세트 스코어(volleyPredict.ts)
//            'grade' = 끝난 경기 채점 (매시 35분) · 'test' = 저장 없이 결과만
import { supabase } from './db'
import { loadGameOverall, simulate, simulateVolleyGame, getParams, staminaOf } from '../../../../src/lib/playerOverall'
import { gameState, type ScheduleGame } from '../../../../src/lib/gameSchedule'

const CODE: Record<string, string> = { NBA: 'NBA', KBL: 'KBL', WKBL: 'WKBL', 'V리그 남자': 'VLEAGUE_M', 'V리그 여자': 'VLEAGUE_W' }

async function snapshot(leagues: string[], from: number, to: number, save: boolean) {
  const days = [0, 1, 2].map(d => new Date(Date.now() + 9 * 3600000 + d * 86400000).toISOString().slice(0, 10))
  const { data: rows } = await supabase.from('game_schedules').select('league,game_date,games').in('league', leagues).in('game_date', days)
  const out: unknown[] = []
  for (const r of rows ?? []) for (const g of (r.games ?? []) as ScheduleGame[]) {
    const st = Date.parse(g.start)
    if (!(st >= Date.now() + from && st <= Date.now() + to)) continue
    try {
      const d = await loadGameOverall(r.league, r.game_date, g.home, g.away)
      if (!d) continue
      const { data: od } = await supabase.from('odds_snapshots').select('home_odds,away_odds').eq('game_id', g.id).order('fetched_at', { ascending: false }).limit(1)
      const odds = od?.[0]?.home_odds && od?.[0]?.away_odds ? { home: Number(od[0].home_odds), away: Number(od[0].away_odds) } : null
      const base = { league: CODE[r.league], game_id: g.id, game_date: r.game_date, start_at: g.start, home: g.home.name ?? '?', away: g.away.name ?? '?',
        params: getParams().leagues[d.code], odds_home: odds?.home ?? null, odds_away: odds?.away ?? null, created_at: new Date().toISOString() }
      let row: Record<string, unknown>
      if (d.code.startsWith('VLEAGUE')) {
        // 배구: 세트 스코어 — pred = 가장 나올 법한 세트 스코어, margin = 기대 세트차, total = 기대 세트 수
        const v = simulateVolleyGame(d.code, d.home, d.away, {}, odds)
        if (!v) { out.push({ game: g.id, skip: 'no volley' }); continue }
        const [ph, pa] = v.best.split('-').map(Number)
        row = { ...base, pred_home: ph, pred_away: pa, margin: v.expDiff, home_win: v.homeWin, total: v.expSets, p10: null, p90: null,
          parts: { dist: v.dist, over35: v.over35, full: v.full }, raw: { diff: v.diff, modelHome: v.modelHome, marketHome: v.marketHome }, cond: null }
        out.push({ game: `${base.away} @ ${base.home}`, pred: v.best, homeWin: v.homeWin })
      } else {
        const sim = simulate(d.code, d.home, d.away, {}, Number(d.news?.margin_adj ?? 0) || 0, d.cond)
        if (!sim) { out.push({ game: g.id, skip: 'no sim' }); continue }
        row = { ...base, pred_home: sim.home, pred_away: sim.away, margin: sim.margin, home_win: sim.homeWin, total: sim.total, p10: sim.p10, p90: sim.p90,
          parts: sim.parts, raw: sim.raw,
          cond: d.cond ? { home: { pct: d.cond.home.pct, items: d.cond.home.items }, away: { pct: d.cond.away.pct, items: d.cond.away.items } } : null }
        out.push({ game: `${base.away} @ ${base.home}`, pred: `${sim.home}-${sim.away}`, margin: sim.margin })
      }
      if (save) {
        const { error } = await supabase.from('predictions').upsert(row); if (error) throw new Error(error.message)
        // 선수 수치도 저장 — 다음 경기 화면에서 지난 경기 대비 ▲▼
        const ratings = ([['home', d.home], ['away', d.away]] as const).flatMap(([side, t]) => t.players.map(x => ({
          league: d.code, player_id: x.id, game_date: r.game_date, team: t.team, base: x.base, form: x.form, overall: x.overall,
          stamina: staminaOf(x, d.cond ? d.cond[side] : null), saved_at: new Date().toISOString() })))
        if (ratings.length) await supabase.from('player_ratings').upsert(ratings)
      }
    } catch (e) { out.push({ game: g.id, error: String(e) }) }
  }
  return out
}

async function grade() {
  const { data: preds } = await supabase.from('predictions').select('*').is('result_home', null).lt('start_at', new Date(Date.now() - 2.5 * 3600000).toISOString())
  let n = 0
  for (const p of preds ?? []) {
    const league = Object.keys(CODE).find(k => CODE[k] === p.league) ?? p.league   // 일정 표는 'V리그 남자' 같은 이름
    const { data: rows } = await supabase.from('game_schedules').select('games').eq('league', league).eq('game_date', p.game_date)
    const g = (rows ?? []).flatMap(r => (r.games ?? []) as ScheduleGame[]).find(x => x.id === p.game_id)
    if (!g || gameState(g) !== 'ended') continue
    const hs = Number(g.home.score), as = Number(g.away.score)
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs + as === 0) continue
    const actual = hs - as   // 적중 = 예상 승률 50% 넘은 쪽이 이겼나 (배구는 세트 스코어)
    const fav = p.odds_home != null && p.odds_away != null ? (Number(p.odds_home) < Number(p.odds_away) ? 1 : -1) : null
    await supabase.from('predictions').update({
      result_home: hs, result_away: as, graded_at: new Date().toISOString(),
      win_hit: (Number(p.home_win) > 50) === (actual > 0), market_hit: fav == null ? null : Math.sign(actual) === fav,
      margin_err: Math.round((actual - Number(p.margin)) * 10) / 10, total_err: Math.round((hs + as - Number(p.total)) * 10) / 10,
    }).eq('league', p.league).eq('game_id', p.game_id)
    n++
  }
  return { graded: n }
}

Deno.serve(async (req) => {
  let body: any = {}
  try { body = await req.json() } catch { /* 빈 body */ }
  const mode = body.mode ?? 'grade'
  let out: unknown
  if (mode === 'nba') out = await snapshot(['NBA'], 0, 20 * 3600000, true)
  else if (mode === 'domestic') out = await snapshot(['KBL', 'WKBL', 'V리그 남자', 'V리그 여자'], 20 * 60000, 100 * 60000, true)
  else if (mode === 'test') out = await snapshot(body.leagues ?? ['NBA'], 0, 48 * 3600000, false)
  else if (mode === 'backfill') out = await snapshot(body.leagues ?? ['NBA', 'KBL', 'WKBL', 'V리그 남자', 'V리그 여자'], 0, 48 * 3600000, true)
  else out = await grade()
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

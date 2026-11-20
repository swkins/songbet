// 경기 전 예측 저장·채점 → predictions (분석 탭 '예측 보고서', Claude 매일 검토의 재료)
// 화면과 똑같은 계산(src/lib/playerOverall.ts·fatigue.ts)을 build.mjs로 묶어 쓴다 — 계산을 고치면 다시 묶어 배포.
// body.mode: 'nba' = 다음 NBA 경기 전부 (pg_cron 21:30 KST, 사용자 22시 베팅 직전)
//            'domestic' = KBL·WKBL 중 20~100분 뒤 시작 경기 (매시 05분)
//            'grade' = 끝난 경기 채점 (매시 35분) · 'test' = 저장 없이 결과만
import { supabase } from './db'
import { loadGameOverall, simulate, getParams } from '../../../../src/lib/playerOverall'
import { gameState, type ScheduleGame } from '../../../../src/lib/gameSchedule'

const CODE: Record<string, string> = { NBA: 'NBA', KBL: 'KBL', WKBL: 'WKBL' }

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
      const sim = simulate(d.code, d.home, d.away, {}, Number(d.news?.margin_adj ?? 0) || 0, d.cond)
      if (!sim) { out.push({ game: g.id, skip: 'no sim' }); continue }
      const { data: od } = await supabase.from('odds_snapshots').select('home_odds,away_odds').eq('game_id', g.id).order('fetched_at', { ascending: false }).limit(1)
      const row = {
        league: CODE[r.league], game_id: g.id, game_date: r.game_date, start_at: g.start, home: g.home.name ?? '?', away: g.away.name ?? '?',
        pred_home: sim.home, pred_away: sim.away, margin: sim.margin, home_win: sim.homeWin, total: sim.total, p10: sim.p10, p90: sim.p90,
        parts: sim.parts, raw: sim.raw,
        cond: d.cond ? { home: { pct: d.cond.home.pct, items: d.cond.home.items }, away: { pct: d.cond.away.pct, items: d.cond.away.items } } : null,
        params: getParams().leagues[d.code], odds_home: od?.[0]?.home_odds ?? null, odds_away: od?.[0]?.away_odds ?? null, created_at: new Date().toISOString(),
      }
      if (save) { const { error } = await supabase.from('predictions').upsert(row); if (error) throw new Error(error.message) }
      out.push({ game: `${row.away} @ ${row.home}`, pred: `${sim.home}-${sim.away}`, margin: sim.margin })
    } catch (e) { out.push({ game: g.id, error: String(e) }) }
  }
  return out
}

async function grade() {
  const { data: preds } = await supabase.from('predictions').select('*').is('result_home', null).lt('start_at', new Date(Date.now() - 2.5 * 3600000).toISOString())
  let n = 0
  for (const p of preds ?? []) {
    const league = p.league
    const { data: rows } = await supabase.from('game_schedules').select('games').eq('league', league).eq('game_date', p.game_date)
    const g = (rows ?? []).flatMap(r => (r.games ?? []) as ScheduleGame[]).find(x => x.id === p.game_id)
    if (!g || gameState(g) !== 'ended') continue
    const hs = Number(g.home.score), as = Number(g.away.score)
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs + as === 0) continue
    const actual = hs - as
    const fav = p.odds_home != null && p.odds_away != null ? (Number(p.odds_home) < Number(p.odds_away) ? 1 : -1) : null
    await supabase.from('predictions').update({
      result_home: hs, result_away: as, graded_at: new Date().toISOString(),
      win_hit: Math.sign(Number(p.margin)) === Math.sign(actual), market_hit: fav == null ? null : Math.sign(actual) === fav,
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
  else if (mode === 'domestic') out = await snapshot(['KBL', 'WKBL'], 20 * 60000, 100 * 60000, true)
  else if (mode === 'test') out = await snapshot(body.leagues ?? ['NBA'], 0, 48 * 3600000, false)
  else if (mode === 'backfill') out = await snapshot(body.leagues ?? ['NBA', 'KBL', 'WKBL'], 0, 48 * 3600000, true)
  else out = await grade()
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

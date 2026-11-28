// 축구 결장 선수 · 예상 선발 · 선수 시즌 평점 — FotMob (2026-11-26 사용자 요청, SQL supabase/soccer_fotmob.sql)
// 공식 공개 API 아님 → 한 번 부를 때 요청 하나만, 시간대 안에 고르게 흩어서 (사용자 요청 '최대한 천천히').
// body.action:
//  'plan'  {window:'day'|'dawn'} — FotMob 날짜별 경기 목록 1번 → 우리 일정(game_schedules 축구)과 시각·팀 이름으로 짝짓고
//          경기 상세 1 + 양 팀 팀 페이지(오늘 안 받은 팀만)를 fm_queue에 시간대 끝까지 고르게 넣는다.
//          day  = 그날 09:00~23:59 KST 킥오프, 03:02에 시작해 08:45까지 (사용자 베팅 09시~)
//          dawn = 다음 날 00:00~08:59 KST 킥오프(새벽 경기), 15:02에 시작해 20:45까지 (베팅 전날 21시~)
//  'step'  — 시각이 된 대기 항목 하나만 처리 (pg_cron fm-step 1분마다 → 많아야 1분에 1번). 403·429면 1시간 멈춤.
//  'seed'  {leagues:[FotMob 리그 번호]} — 처음 채우기: 리그 페이지 → 그 리그 전 팀을 5~8분 간격으로 넣음.
//  'ratings' {leagues:[…]} — 리그 선수 평점 (2026-11-28: 분데스리가·리그1은 팀 페이지 squad의 rating이 전부 null로 옴 →
//          리그 페이지의 stats.players 'FotMob rating' 파일(data.fotmob.com/stats/<리그>/season/<id>/rating.json, gzip)을 받아 fm_league_ratings에).
//          항목 하나 = 요청 2번(리그 페이지 + 평점 파일), 리그끼리 3~5분 간격. pg_cron fm-ratings 하루 한 번.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const FM = 'https://www.fotmob.com/api/data'
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
const kstAt = (date: string, hm: string) => Date.parse(`${date}T${hm}:00+09:00`)
const TOP = ['프리미어리그', '라리가', '세리에A', '분데스리가', '리그1']
const UEFA = ['챔피언스리그', '유로파리그', '컨퍼런스리그']
const prioOf = (lg: string) => TOP.includes(lg) ? 1 : UEFA.includes(lg) ? 2 : /^[KJ]리그/.test(lg) ? 4 : 3
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'fk', 'sk', 'club', 'de', 'the', 'united', 'city', 'real', 'sporting', 'athletic', 'ssc', 'us', 'as', 'hd', 'utd'])
function sim(aliases: string[], fm: string): number {
  const f = norm(fm), ft = f.split(' ').filter(w => w.length >= 3 && !STOP.has(w))
  let best = 0
  for (const a0 of aliases) {
    const a = norm(a0); if (!a) continue
    if (a === f) return 3
    if (a.length >= 4 && (f.includes(a) || a.includes(f))) best = Math.max(best, 2)
    const at = a.split(' ').filter(w => w.length >= 3 && !STOP.has(w))
    if (at.some(w => ft.includes(w) || ft.some(x => x.startsWith(w) || w.startsWith(x)))) best = Math.max(best, 1)
  }
  return best
}
async function getJson(url: string): Promise<{ status: number; data: any }> {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) return { status: r.status, data: null }
  return { status: r.status, data: await r.json() }
}

Deno.serve(async req => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let body: any = {}; try { body = await req.json() } catch { /* 빈 몸 */ }
  const out: Record<string, unknown> = { action: body.action }
  const pause = async (why: string) => {
    await db.from('fm_state').upsert({ key: 'paused_until', value: { until: new Date(Date.now() + 3600000).toISOString(), why }, updated_at: new Date().toISOString() })
  }
  try {
    if (body.action === 'plan') {
      const now = Date.now(), today = kstDate(now), tomorrow = kstDate(now + 86400000)
      const dawn = body.window === 'dawn'
      const target = dawn ? tomorrow : today
      const from = kstAt(target, dawn ? '00:00' : '09:00'), to = kstAt(target, dawn ? '08:59' : '23:59') + 59000
      const end = kstAt(today, dawn ? '20:45' : '08:45')
      // 우리 일정
      const { data: rows } = await db.from('game_schedules').select('league,game_date,games').eq('sport', 'soccer').in('game_date', [today, tomorrow])
      const games: { id: string; league: string; start: number; home: any; away: any }[] = []
      for (const r of rows ?? []) for (const g of (r.games ?? []) as any[]) {
        const st = Date.parse(g.start)
        if (st < from || st > to || /취소|연기|종료/.test(g.status ?? '')) continue
        if (!games.some(x => x.id === g.id)) games.push({ id: g.id, league: r.league, start: st, home: g.home, away: g.away })
      }
      out.games = games.length
      if (!games.length) return Response.json(out)
      // 팀 이름 별칭 (리그 관리 이름 → 영어·약칭·이름표 src)
      const kos = [...new Set(games.flatMap(g => [g.home.name, g.away.name]).filter(Boolean))]
      const { data: tn } = await db.from('soccer_team_names').select('src,ko').in('ko', kos)
      const alias = (t: any) => [t.full, t.abbr, t.name, ...((tn ?? []) as any[]).filter(x => x.ko === t.name).map(x => String(x.src).replace(/^[a-z]{2}:/, ''))].filter(Boolean)
      // FotMob 경기 목록 (한국 날짜) — 요청 1번
      const list = await getJson(`${FM}/matches?date=${target.replace(/-/g, '')}&timezone=Asia%2FSeoul&ccode3=KOR`)
      if (!list.data) { if (list.status === 403 || list.status === 429) await pause(`list ${list.status}`); throw new Error(`list ${list.status}`) }
      const fms: { id: number; lid: number; t: number; h: { id: number; name: string }; a: { id: number; name: string } }[] = []
      for (const l of list.data.leagues ?? []) for (const m of l.matches ?? []) {
        const t = Date.parse(m.status?.utcTime ?? ''); if (!t) continue
        fms.push({ id: m.id, lid: l.primaryId ?? l.id, t, h: m.home, a: m.away })
      }
      // 짝짓기: 시각 3시간 안 + 양 팀 이름 점수 (둘 다 1점 이상)
      const matched: { g: typeof games[0]; m: typeof fms[0] }[] = [], unmatched: string[] = []
      for (const g of games) {
        let best: typeof fms[0] | null = null, bs = 0
        for (const m of fms) {
          if (Math.abs(m.t - g.start) > 3 * 3600000) continue
          const sh = sim(alias(g.home), m.h.name), sa = sim(alias(g.away), m.a.name)
          if (sh < 1 || sa < 1) continue
          const s = sh + sa - Math.abs(m.t - g.start) / 3600000 * 0.1
          if (s > bs) { bs = s; best = m }
        }
        if (best) matched.push({ g, m: best }); else unmatched.push(`${g.league} ${g.home.name}–${g.away.name}`)
      }
      out.matched = matched.length; out.unmatched = unmatched
      // 오늘 이미 받았거나 넣어 둔 팀은 빼기
      const since = new Date(now - 20 * 3600000).toISOString()
      const { data: fresh } = await db.from('fm_teams').select('team_id').gte('fetched_at', since)
      // 처음 채우기 등으로 이미 대기 중인 팀은 새로 넣지 않고 시각만 이 시간대 자리로 당긴다
      const { data: queued } = await db.from('fm_queue').select('id,ref').eq('kind', 'team').eq('status', 'pending')
      const queuedId = new Map((queued ?? []).map((x: any) => [x.ref, x.id]))
      const skip = new Set((fresh ?? []).map((x: any) => String(x.team_id)))
      const items: { kind: string; ref: string; game_id: string | null; league: string; prio: number; start: number }[] = []
      for (const { g, m } of matched.sort((x, y) => prioOf(x.g.league) - prioOf(y.g.league) || x.g.start - y.g.start)) {
        await db.from('fm_matches').upsert({ game_id: g.id, league: g.league, fm_match_id: m.id, start_at: new Date(g.start).toISOString(), home_team_id: m.h.id, away_team_id: m.a.id }, { onConflict: 'game_id', ignoreDuplicates: false })
        items.push({ kind: 'match', ref: String(m.id), game_id: g.id, league: g.league, prio: prioOf(g.league), start: g.start })
        for (const t of [m.h.id, m.a.id]) if (!skip.has(String(t))) { skip.add(String(t)); items.push({ kind: 'team', ref: String(t), game_id: g.id, league: g.league, prio: prioOf(g.league), start: g.start }) }
      }
      // 시간대 끝까지 고르게 (최소 60초 간격) + 흔들기
      const startAt = now + 2 * 60000, span = Math.max(0, end - startAt)
      const step = Math.max(60000, items.length ? span / items.length : 60000)
      const slots = items.map((x, i) => ({ kind: x.kind, ref: x.ref, game_id: x.game_id, league: x.league, prio: x.prio,
        due_at: new Date(startAt + i * step + Math.random() * step * 0.4).toISOString() }))
      const ins = slots.filter(x => !(x.kind === 'team' && queuedId.has(x.ref)))
      for (const x of slots) if (x.kind === 'team' && queuedId.has(x.ref))
        await db.from('fm_queue').update({ due_at: x.due_at, game_id: x.game_id, league: x.league, prio: x.prio }).eq('id', queuedId.get(x.ref)).gt('due_at', x.due_at)
      if (ins.length) { const { error } = await db.from('fm_queue').insert(ins); if (error) throw new Error(error.message) }
      out.queued = ins.length; out.spacingSec = Math.round(step / 1000)
      await db.from('fm_state').upsert({ key: `plan_${dawn ? 'dawn' : 'day'}`, value: out, updated_at: new Date().toISOString() })
    } else if (body.action === 'seed') {
      const now = Date.now(); const lids: number[] = body.leagues ?? [47, 87, 55, 54, 53]
      const ins = lids.map((l, i) => ({ kind: 'seed_league', ref: String(l), league: null, prio: 5, due_at: new Date(now + 60000 + i * 6 * 60000).toISOString() }))
      await db.from('fm_queue').insert(ins); out.queued = ins.length
    } else if (body.action === 'ratings') {
      const now = Date.now(); const lids: number[] = body.leagues ?? [47, 87, 55, 54, 53]
      const ins = lids.map((l, i) => ({ kind: 'league_ratings', ref: String(l), league: null, prio: 5, due_at: new Date(now + 60000 + i * (3 + Math.random() * 2) * 60000).toISOString() }))
      await db.from('fm_queue').insert(ins); out.queued = ins.length
    } else if (body.action === 'step') {
      const { data: it } = await db.from('fm_queue').select('*').eq('status', 'pending').lte('due_at', new Date().toISOString()).order('due_at').limit(1)
      const q = it?.[0]; if (!q) return Response.json({ ...out, idle: true })
      out.item = { kind: q.kind, ref: q.ref }
      const finish = (status: string, note?: unknown) => db.from('fm_queue').update({ status, note: note == null ? null : String(note).slice(0, 300), done_at: new Date().toISOString() }).eq('id', q.id)
      // 경기 상세: 이미 시작한 경기는 건너뜀
      if (q.kind === 'match' && q.game_id) {
        const { data: fm } = await db.from('fm_matches').select('start_at').eq('game_id', q.game_id).maybeSingle()
        if (fm?.start_at && Date.parse(fm.start_at) < Date.now()) { await finish('skipped', '이미 시작'); return Response.json(out) }
      }
      if (q.kind === 'league_ratings') {
        const lg = await getJson(`${FM}/leagues?id=${q.ref}&ccode3=KOR`)
        if (!lg.data) { if (lg.status === 403 || lg.status === 429) { await pause(`league ${lg.status}`); await finish('blocked', lg.status) } else await finish('failed', lg.status); out.status = lg.status; return Response.json(out) }
        const st = ((lg.data.stats?.players ?? []) as any[]).find(x => x.name === 'rating' || /rating\.json$/.test(x.fetchAllUrl ?? ''))
        if (!st?.fetchAllUrl) { await finish('failed', 'rating url 없음'); return Response.json(out) }
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
        const rr = await getJson(st.fetchAllUrl)
        if (!rr.data) { await finish('failed', `rating ${rr.status}`); out.status = rr.status; return Response.json(out) }
        const list: any[] = rr.data.TopLists?.[0]?.StatList ?? []
        const rows = list.map(x => ({ player_id: Number(x.ParticiantId ?? x.ParticipantId), league_id: Number(q.ref), team_id: Number(x.TeamId) || null,
          name: x.ParticipantName ?? null, rating: Number(x.StatValue), minutes: Number(x.MinutesPlayed) || null, matches: Number(x.MatchesPlayed) || null, fetched_at: new Date().toISOString() }))
          .filter(x => x.player_id && Number.isFinite(x.rating))
        if (rows.length) { const { error } = await db.from('fm_league_ratings').upsert(rows); if (error) { await finish('failed', error.message); return Response.json(out) } }
        out.ratings = rows.length; await finish('done', `${rows.length}명`); return Response.json(out)
      }
      const url = q.kind === 'match' ? `${FM}/matchDetails?matchId=${q.ref}` : q.kind === 'team' ? `${FM}/teams?id=${q.ref}&ccode3=KOR` : `${FM}/leagues?id=${q.ref}&ccode3=KOR`
      const r = await getJson(url)
      if (!r.data) {
        if (r.status === 403 || r.status === 429) { await pause(`${q.kind} ${r.status}`); await finish('blocked', r.status) } else await finish('failed', r.status)
        out.status = r.status; return Response.json(out)
      }
      const d = r.data
      if (q.kind === 'match') {
        const side = (t: any) => t ? {
          name: t.name, formation: t.formation ?? null,
          starters: (t.starters ?? []).map((p: any) => ({ id: p.id, name: p.name, pos: p.usualPlayingPositionId ?? p.positionId ?? null })),
          unavailable: (t.unavailable ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.unavailability?.type ?? null, ret: p.unavailability?.expectedReturn ?? null })),
        } : null
        const lu = d.content?.lineup ?? {}
        await db.from('fm_matches').update({ lineup_type: lu.lineupType ?? null, home: side(lu.homeTeam), away: side(lu.awayTeam), fetched_at: new Date().toISOString() }).eq('game_id', q.game_id)
        out.lineup = lu.lineupType ?? null
      } else if (q.kind === 'team') {
        const det = d.details ?? {}, tid = Number(q.ref)
        const players: any[] = []
        for (const g of d.squad?.squad ?? []) {
          if (g.title === 'coach') continue
          for (const m of g.members ?? []) players.push({ team_id: tid, player_id: m.id, name: m.name, pos: m.positionIdsDesc ?? g.title ?? null,
            rating: m.rating == null ? null : Number(m.rating), injury: m.injury ?? null, value: m.transferValue ?? null, age: m.age ?? null, fetched_at: new Date().toISOString() })
        }
        await db.from('fm_teams').upsert({ team_id: tid, name: det.name ?? null, league_id: det.primaryLeagueId ?? null, league_name: det.primaryLeagueName ?? null, fetched_at: new Date().toISOString() })
        if (players.length) {
          await db.from('fm_players').upsert(players)
          await db.from('fm_players').delete().eq('team_id', tid).not('player_id', 'in', `(${players.map(p => p.player_id).join(',')})`)   // 떠난 선수
        }
        const tb = d.table?.[0]?.data
        if (tb && det.primaryLeagueId && Number(tb.leagueId) === Number(det.primaryLeagueId) && tb.table?.all?.length)
          await db.from('fm_leagues').upsert({ league_id: det.primaryLeagueId, name: det.primaryLeagueName, team_count: tb.table.all.length, fetched_at: new Date().toISOString() })
        out.players = players.length
      } else if (q.kind === 'seed_league') {
        const all: any[] = d.table?.[0]?.data?.table?.all ?? []
        await db.from('fm_leagues').upsert({ league_id: Number(q.ref), name: d.details?.name ?? null, team_count: all.length, fetched_at: new Date().toISOString() })
        // 마지막 대기 시각 뒤로 5~8분 간격
        const { data: last } = await db.from('fm_queue').select('due_at').eq('status', 'pending').order('due_at', { ascending: false }).limit(1)
        let t = Math.max(Date.now(), last?.[0] ? Date.parse(last[0].due_at) : 0)
        const { data: have } = await db.from('fm_teams').select('team_id')
        const got = new Set((have ?? []).map((x: any) => x.team_id))
        const ins = all.filter(x => !got.has(x.id)).map(x => { t += (5 + Math.random() * 3) * 60000; return { kind: 'team', ref: String(x.id), league: null, prio: 5, due_at: new Date(t).toISOString() } })
        if (ins.length) await db.from('fm_queue').insert(ins)
        out.teams = ins.length
      }
      await finish('done')
    }
  } catch (e) { out.error = String(e) }
  return Response.json(out)
})

// NBA EPM (Estimated Plus-Minus, dunksandthrees.com) → nba_epm (받은 날짜 as_of별 한 벌, 같은 날은 덮어씀)
// 2026-11-26 사용자 요청: NBA 체급을 우리 게임스코어 체급 대신 EPM으로. 페이지 HTML 안 스크립트에 전 선수(약 540명) 값이 들어 있다
// (__data.json은 403). 한 번 요청 = 약 1.4MB. pg_cron collect-epm: 매일 19:1x · 21:0x KST (21:30 예측 저장 직전).
//  off = 공격 EPM, def = 수비 EPM, tot = EPM (100번 공격당 팀 득실 기여, 0 = 리그 평균), mp48 = 48분당 예상 출전 분.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const numOf = (s: string, key: string) => { const m = s.match(new RegExp(`(?:^|,)${key}:(-?[0-9.]+(?:e-?[0-9]+)?)`)); return m ? Number(m[1]) : null }

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const out: Record<string, unknown> = {}
  try {
    const res = await fetch('https://dunksandthrees.com/epm', { headers: UA })
    out.status = res.status
    if (!res.ok) throw new Error(`dunksandthrees ${res.status}`)
    const html = await res.text()
    const re = /\{season:(\d+),game_dt:"([0-9-]+)",player_id:(\d+),player_name:"((?:[^"\\]|\\.)*)",team_id:\d+,team_alias:"([A-Z]*)",([^{}]*)\}/g
    const rows = new Map<string, Record<string, unknown>>()
    const now = new Date().toISOString()
    for (const m of html.matchAll(re)) {
      const rest = m[6]
      const tot = numOf(rest, 'tot'); if (tot == null) continue
      let name = m[4]; try { name = JSON.parse(`"${name}"`) } catch { /* 그대로 */ }
      rows.set(m[3], { as_of: m[2], season: Number(m[1]), player_id: m[3], player_name: name, team: m[5] || null,
        off: numOf(rest, 'off'), def: numOf(rest, 'def'), tot, mp48: numOf(rest, 'p_mp_48'), fetched_at: now })
    }
    if (rows.size < 200) throw new Error(`parsed ${rows.size} rows (page format changed?)`)
    const list = [...rows.values()]
    const { error } = await db.from('nba_epm').upsert(list)
    if (error) throw new Error(error.message)
    out.rows = list.length; out.as_of = list[0].as_of
  } catch (e) { out.error = String(e) }
  // 기록: 성공은 nba_epm.fetched_at, 실패 내용은 net._http_response (cron이 부른 응답)
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

// NBA ESPN 부상자 명단 → nba_injuries (매번 통째로 바꿈, 누적 안 함) + 지난 출전 확률 정리.
// pg_cron collect-injuries: 매일 14:3x · 17:3x · 20:3x KST (Claude 뉴스 확인 예약 작업 15·18·21시 직전).
// Claude 작업이 이 명단과 뉴스 기사를 같이 읽고 player_status에 최종 출전 확률을 넣는다.
// 정리: player_status는 경기 날짜가 이틀 지나면, news_check_log는 14일 지나면 지운다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
const KST = 9 * 3600000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const out: Record<string, unknown> = {}
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries', { headers: UA })
    if (!res.ok) throw new Error(`espn ${res.status}`)
    const j = await res.json()
    const now = new Date().toISOString()
    const rows: Record<string, unknown>[] = []
    for (const t of j?.injuries ?? []) {
      for (const it of t?.injuries ?? []) {
        const a = it?.athlete ?? {}
        const href: string = (a.links ?? []).map((l: any) => l?.href).find((h: string) => /\/id\/\d+/.test(h ?? '')) ?? ''
        const id = String(a.id ?? href.match(/\/id\/(\d+)/)?.[1] ?? '')
        if (!id) continue
        rows.push({
          player_id: id, player_name: a.displayName ?? a.fullName ?? null, team: t.displayName ?? a.team?.displayName ?? null,
          status: it.status ?? it.type?.description ?? null, short_comment: it.shortComment ?? null, long_comment: it.longComment ?? null,
          return_date: it.details?.returnDate ?? null, reported_at: it.date ?? null, fetched_at: now,
        })
      }
    }
    if (!rows.length) throw new Error('empty list')
    const uniq = [...new Map(rows.map(r => [r.player_id, r])).values()]
    const { error } = await db.from('nba_injuries').upsert(uniq)
    if (error) throw new Error(error.message)
    await db.from('nba_injuries').delete().lt('fetched_at', now)   // 이번 명단에 없는 선수(복귀)는 빠진다
    out.nba_injuries = rows.length
  } catch (e) { out.error = String(e) }
  const today = kstDate(Date.now())
  const cut = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10)
  await db.from('player_status').delete().lt('game_date', cut)
  await db.from('news_check_log').delete().lt('ran_at', new Date(Date.now() - 14 * 86400000).toISOString())
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { tierOf } from '../lib/playerOverall'
import { koName } from '../lib/gameSchedule'

// 축구 결장 선수 · 예상 선발 · 선수 오버롤 (FotMob — collect-fotmob, SQL supabase/soccer_fotmob.sql, 2026-11-26 사용자 요청)
// 오버롤 = FotMob 이번 시즌 평균 평점을 같은 리그(FotMob 주 리그) 선수들 안 순위로 100점 (NBA·농구와 같은 눈금·색).
// 선수 이름 = soccer_player_names 한글(5대 리그, 2026-11-27 사용자 요청 — 없으면 FotMob 영어 그대로, 마우스 = 영어 이름)
// 수집: 그날 09~24시 킥오프 경기는 03~08:45, 다음 날 00~09시(새벽) 경기는 15~20:45에 하나씩 천천히.
interface Side { name: string; formation: string | null; starters: { id: number; name: string }[]; unavailable: { id: number; name: string; type: string | null; ret: string | null }[] }
interface FmMatch { game_id: string; lineup_type: string | null; home: Side | null; away: Side | null; home_team_id: number; away_team_id: number; fetched_at: string }
interface FmPlayer { team_id: number; player_id: number; name: string; pos: string | null; rating: number | null; injury: { expectedReturn?: string } | null; value: number | null }
interface Pool { ratings: number[]; teams: number; total: number | null; league: string | null }

function pctToScore(p: number): number {
  if (p <= 0.03) return 100 - (p / 0.03) * 10
  if (p <= 0.15) return 90 - ((p - 0.03) / 0.12) * 10
  if (p <= 0.40) return 80 - ((p - 0.15) / 0.25) * 10
  if (p <= 0.75) return 70 - ((p - 0.40) / 0.35) * 10
  return Math.max(40, 60 - ((p - 0.75) / 0.25) * 20)
}
const ovOf = (r: number | null, pool: number[]) => {
  if (r == null || !pool.length) return null
  let n = 0; for (const x of pool) if (x > r) n++
  return Math.round(pctToScore(n / pool.length))
}
const LINEUP: Record<string, string> = { predicted: '예상 선발', confirmed: '확정 선발', lastStarting11: '지난 경기 선발', unavailable: '선발 — 아직 안 나옴' }
const TYPE: Record<string, string> = { injury: '부상', suspension: '징계', international: '대표팀', other: '기타' }

export default function SoccerLineup({ gameId, home, away }: { gameId: string; home: { name?: string }; away: { name?: string } }) {
  const [m, setM] = useState<FmMatch | null | undefined>(undefined)
  const [players, setPlayers] = useState<FmPlayer[]>([])
  const [pools, setPools] = useState<Record<number, Pool>>({})
  const [ko, setKo] = useState<Record<number, string>>({})
  useEffect(() => {
    let off = false
    setM(undefined)
    ;(async () => {
      const { data } = await supabase.from('fm_matches').select('*').eq('game_id', gameId).maybeSingle()
      const fm = data as FmMatch | null
      if (off) return
      setM(fm)
      if (!fm) return
      const ids = [fm.home_team_id, fm.away_team_id]
      const [{ data: pl }, { data: tm }] = await Promise.all([
        supabase.from('fm_players').select('team_id,player_id,name,pos,rating,injury,value').in('team_id', ids).limit(200),
        supabase.from('fm_teams').select('team_id,league_id,league_name').in('team_id', ids),
      ])
      if (off) return
      setPlayers((pl ?? []) as FmPlayer[])
      const pids = [...new Set([...(pl ?? []).map((x: { player_id: number }) => x.player_id),
        ...[fm.home, fm.away].flatMap(sd => [...(sd?.starters ?? []), ...(sd?.unavailable ?? [])].map(x => x.id))])]
      if (pids.length) {
        const { data: kn } = await supabase.from('soccer_player_names').select('player_id,name_ko').in('player_id', pids)
        if (!off) setKo(Object.fromEntries((kn ?? []).map((x: { player_id: number; name_ko: string }) => [x.player_id, x.name_ko])))
      }
      // 리그 눈금: 두 팀 각자의 주 리그 선수 평점 전체
      const out: Record<number, Pool> = {}
      for (const t of (tm ?? []) as { team_id: number; league_id: number | null; league_name: string | null }[]) {
        if (!t.league_id) continue
        const { data: lt } = await supabase.from('fm_teams').select('team_id').eq('league_id', t.league_id)
        const tids = (lt ?? []).map((x: { team_id: number }) => x.team_id)
        const { data: lr } = await supabase.from('fm_players').select('rating').in('team_id', tids).not('rating', 'is', null).limit(3000)
        const { data: lg } = await supabase.from('fm_leagues').select('team_count').eq('league_id', t.league_id).maybeSingle()
        out[t.team_id] = { ratings: (lr ?? []).map((x: { rating: number }) => Number(x.rating)), teams: tids.length, total: lg?.team_count ?? null, league: t.league_name }
      }
      if (!off) setPools(out)
    })()
    return () => { off = true }
  }, [gameId])

  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)', flex: 1, minWidth: 280 }
  if (m === undefined) return null
  if (!m || (!m.home && !m.away)) return (
    <div style={{ ...box, marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
      결장 선수·예상 선발 — 아직 수집 전 (그날 09~24시 경기는 03~09시, 새벽 경기는 전날 15~21시에 받아요)
    </div>
  )
  const team = (side: Side | null, teamId: number, label: string, fallback?: string) => {
    const pool = pools[teamId]
    const byId = new Map(players.filter(p => p.team_id === teamId).map(p => [p.player_id, p]))
    const row = (id: number, name: string, extra?: React.ReactNode, out?: boolean) => {
      const p = byId.get(id), ov = ovOf(p?.rating ?? null, pool?.ratings ?? []), tier = tierOf(ov)
      return (
        <tr key={id} style={{ background: out ? 'rgba(255,59,59,0.08)' : undefined }}>
          <td style={{ padding: '3px 4px', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p?.pos?.split(',')[0] ?? ''}</td>
          <td style={{ padding: '3px 4px', fontSize: 12, fontWeight: 600 }} title={ko[id] ? name : undefined}>{ko[id] ?? name}{extra}</td>
          <td style={{ padding: '3px 4px', textAlign: 'right', whiteSpace: 'nowrap' }} title={p?.rating != null ? `FotMob 시즌 평점 ${p.rating}` : '평점 없음 (출전 적음)'}>
            <span style={{ fontWeight: 800, fontFamily: 'var(--font-num)', color: tier?.color ?? 'var(--text-muted)' }}>{ov ?? '–'}</span>
          </td>
        </tr>
      )
    }
    const startersOv = (side?.starters ?? []).map(s => ovOf(byId.get(s.id)?.rating ?? null, pool?.ratings ?? [])).filter((x): x is number => x != null)
    const avg = startersOv.length ? Math.round(startersOv.reduce((a, b) => a + b, 0) / startersOv.length) : null
    return (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{label} · {koName(fallback)}</span>
          {side?.formation && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{side.formation}</span>}
          {avg != null && <span style={{ marginLeft: 'auto', fontSize: 11 }}>선발 평균 <b style={{ color: tierOf(avg)?.color }}>{avg}</b></span>}
        </div>
        {pool && pool.total != null && pool.teams < pool.total && (
          <div style={{ fontSize: 10, color: 'var(--gold)', marginBottom: 4 }}>{pool.league} {pool.teams}/{pool.total}팀 수집 — 오버롤 눈금 참고용</div>
        )}
        {(side?.unavailable ?? []).length > 0 && <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', margin: '2px 0' }}>결장 {side!.unavailable.length}명</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}><tbody>
            {side!.unavailable.map(u => row(u.id, u.name, <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
              {TYPE[u.type ?? ''] ?? u.type ?? ''}{u.ret ? ` · ${u.ret === 'Doubtful' ? '불투명' : u.ret}` : ''}</span>, true))}
          </tbody></table>
        </>}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', margin: '2px 0' }}>{LINEUP[m.lineup_type ?? ''] ?? '선발'}</div>
        {(side?.starters ?? []).length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{side!.starters.map(s => row(s.id, s.name))}</tbody></table>
        ) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>선발 정보 없음</div>}
      </div>
    )
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
        결장·선발·오버롤 = FotMob ({dayjs(m.fetched_at).format('M/D HH:mm')} 기준) · 오버롤 = 시즌 평점의 같은 리그 순위를 100점으로
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {team(m.home, m.home_team_id, '홈', home.name)}
        {team(m.away, m.away_team_id, '원정', away.name)}
      </div>
    </div>
  )
}

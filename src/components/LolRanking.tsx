import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIERS } from '../lib/playerOverall'

// ─── LoL 선수 체급 · 라인별 순위 (사용자 요청) ─────
// 자료: v_lol_player_rating (Supabase 함수 collect-lol — gol.gg 2026 시즌 상세 통계 + Leaguepedia 팀·포지션, SQL supabase/lol_player.sql)
// 체급 = 같은 리그·같은 포지션 주전급 안에서 지표 백분위를 포지션별 가중치로 섞은 순위 → 100점 (경기 수 적으면 50점 쪽으로).
// 팀은 2026 시즌에 마지막으로 뛴 팀 — 이적해도 체급은 선수에 붙는다.

interface Row {
  league: string; player: string; team: string | null; role: string; country: string | null; games: number; regular: boolean
  winrate: number | null; kda: number | null; kills: number | null; deaths: number | null; assists: number | null; csm: number | null; gpm: number | null
  kp: number | null; dmg_pct: number | null; gold_pct: number | null; vs_pct: number | null; dpm: number | null; vspm: number | null; wcpm: number | null
  gd15: number | null; csd15: number | null; xpd15: number | null; fb: number | null; fb_victim: number | null; solo_kills: number | null; pentas: number | null
  composite: number; base: number; role_rank: number; tournaments: Record<string, number> | null; updated_at: string
}
const LEAGUE_ORDER = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'LCK CL', 'CBLOL']
const ROLES: [string, string][] = [['Top', '탑'], ['Jungle', '정글'], ['Mid', '미드'], ['Bot', '원딜'], ['Support', '서폿']]
const tier = (v: number) => TIERS.find(t => v >= t.min) ?? TIERS[TIERS.length - 1]
const n = (v: unknown) => (v == null ? null : Number(v))

export default function LolRanking() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [league, setLeague] = useState('LCK')
  const [role, setRole] = useState('Mid')
  const [onlyRegular, setOnlyRegular] = useState(true)
  const [sort, setSort] = useState<keyof Row>('role_rank')

  useEffect(() => {
    supabase.from('v_lol_player_rating').select('*').eq('season', '2026').limit(3000)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return }
        setRows((data ?? []).map((r: any) => {
          const o: any = { ...r }
          for (const k of Object.keys(o)) if (!['league', 'player', 'team', 'role', 'country', 'regular', 'tournaments', 'updated_at'].includes(k)) o[k] = n(o[k])
          return o as Row
        }))
      })
  }, [])

  const leagues = useMemo(() => [...new Set((rows ?? []).map(r => r.league))].sort((a, b) => { const i = (x: string) => { const k = LEAGUE_ORDER.indexOf(x); return k < 0 ? 99 : k }; return i(a) - i(b) }), [rows])
  const list = useMemo(() => {
    const l = (rows ?? []).filter(r => r.league === league && r.role === role && (!onlyRegular || r.regular))
    const dir = sort === 'role_rank' || sort === 'deaths' || sort === 'fb_victim' ? 1 : -1
    return l.sort((a, b) => ((Number(a[sort] ?? (dir > 0 ? 1e9 : -1e9)) - Number(b[sort] ?? (dir > 0 ? 1e9 : -1e9))) * dir) || a.role_rank - b.role_rank)
  }, [rows, league, role, onlyRegular, sort])
  const updated = (rows ?? []).filter(r => r.league === league).reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null)

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`, background: active ? 'var(--gold-bg)' : 'transparent', color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })
  const th = (label: string, key: keyof Row, tip?: string): React.ReactNode => (
    <th title={tip} onClick={() => setSort(key)} style={{ padding: '6px 6px', fontSize: 10, fontWeight: 700, color: sort === key ? 'var(--gold)' : 'var(--text-muted)', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{label}</th>
  )
  const td: React.CSSProperties = { padding: '6px 6px', textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const f = (v: number | null, d = 1, suf = '') => (v == null ? '–' : `${v.toFixed(d)}${suf}`)
  const sgn = (v: number | null) => (v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)}`)
  const diffColor = (v: number | null) => (v == null || Math.abs(v) < 1 ? undefined : v > 0 ? 'var(--green)' : 'var(--red)')

  if (err) return <div style={{ color: 'var(--red)', fontSize: 13 }}>LoL 선수 체급을 못 불러왔어요: {err}</div>
  if (!rows) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중…</div>
  if (!rows.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>아직 수집한 LoL 선수 기록이 없습니다.</div>
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>LoL 선수 체급 · 라인별 순위</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>2026 시즌 · gol.gg 상세 통계 + Leaguepedia 팀(2026 마지막 소속){updated ? ` · ${new Date(updated).toLocaleDateString('ko-KR')} 수집` : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        {leagues.map(l => <button key={l} style={btn(league === l)} onClick={() => setLeague(l)}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {ROLES.map(([k, label]) => <button key={k} style={btn(role === k)} onClick={() => { setRole(k); setSort('role_rank') }}>{label}</button>)}
        <label style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyRegular} onChange={e => setOnlyRegular(e.target.checked)} /> 주전급만 (리그 최다 경기의 25%↑)
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {th('#', 'role_rank')}
            <th style={{ padding: '6px 6px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>선수 · 팀</th>
            {th('체급', 'base', '같은 리그·포지션 주전급 안 순위를 100점으로 (경기 수 적으면 50점 쪽으로)')}
            {th('세트', 'games')}{th('승률', 'winrate')}{th('KDA', 'kda')}
            {th('K/D/A', 'kills')}{th('킬관여', 'kp')}{th('피해%', 'dmg_pct', '팀 내 챔피언 피해 비중')}{th('DPM', 'dpm', '분당 챔피언 피해')}
            {th('골드%', 'gold_pct')}{th('CSM', 'csm', '분당 CS')}
            {th('GD@15', 'gd15', '15분 골드 차 (맞라이너 대비)')}{th('CSD@15', 'csd15', '15분 CS 차')}{th('XPD@15', 'xpd15', '15분 경험치 차')}
            {th('시야/분', 'vspm')}{th('퍼블', 'fb', '퍼스트 블러드 관여 %')}{th('솔로킬', 'solo_kills')}
          </tr></thead>
          <tbody>
            {list.map(r => {
              const t = tier(r.base)
              const trs = r.tournaments ? Object.entries(r.tournaments).map(([k, v]) => `${k} ${v}세트`).join('\n') : ''
              return (
                <tr key={r.player} style={{ opacity: r.regular ? 1 : 0.6 }}>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{r.role_rank}</td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)' }} title={trs}>
                    <b style={{ fontSize: 13 }}>{r.player}</b>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>{r.country}</span>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.team ?? '—'}</div>
                  </td>
                  <td style={{ ...td }} title={`${t.name} · 합성 ${r.composite}`}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: t.color }}>{Math.round(r.base)}</span>
                  </td>
                  <td style={td}>{r.games}</td>
                  <td style={td}>{f(r.winrate, 0, '%')}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{f(r.kda, 2)}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{f(r.kills)}/{f(r.deaths)}/{f(r.assists)}</td>
                  <td style={td}>{f(r.kp, 0, '%')}</td>
                  <td style={td}>{f(r.dmg_pct, 1, '%')}</td>
                  <td style={td}>{f(r.dpm, 0)}</td>
                  <td style={td}>{f(r.gold_pct, 1, '%')}</td>
                  <td style={td}>{f(r.csm, 1)}</td>
                  <td style={{ ...td, color: diffColor(r.gd15), fontWeight: 700 }}>{sgn(r.gd15)}</td>
                  <td style={{ ...td, color: diffColor(r.csd15) }}>{sgn(r.csd15)}</td>
                  <td style={{ ...td, color: diffColor(r.xpd15) }}>{sgn(r.xpd15)}</td>
                  <td style={td}>{f(r.vspm, 2)}</td>
                  <td style={td}>{f(r.fb, 0, '%')}</td>
                  <td style={td}>{r.solo_kills ?? '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
        체급 가중치 — 탑·미드: 승률 20 · KDA 14 · GD@15 12 · DPM 12 · CSD@15 10 · XPD@15 10 · 피해% 10 · 킬관여 7 · 솔로킬 5 / 정글: 승률 25 · 킬관여 15 · KDA 15 · GD@15 10 · XPD@15 10 · 시야 8 · 퍼블 7 · 퍼블 당함 5 · 피해% 5 /
        원딜: 승률 25 · DPM 14 · KDA 14 · GD@15 12 · 피해% 12 · CSD@15 10 · XPD@15 8 · 킬관여 5 / 서폿: 승률 25 · 킬관여 18 · KDA 15 · 시야 15 · XPD@15 10 · 시야% 7 · GD@15 5 · 퍼블 당함 5.
        리그끼리는 비교하지 않음 (리그 안 순위). 선수 이름에 마우스 = 대회별 세트 수 · 열 이름을 누르면 정렬.
      </div>
    </div>
  )
}

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
  composite: number; base: number; role_rank: number; league_offset: number | null; league_gpr: number | null; global_base: number | null;
  lp_link: string | null; tier: number | null; tier_now: number | null; seasons: { season: string; league: string; games: number; g: number; team: string | null }[] | null; zs_now: Record<string, number> | null; tournaments: Record<string, number> | null; updated_at: string
}
const LEAGUE_ORDER = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'LCK CL', 'CBLOL']
const ROLES: [string, string][] = [['Top', '탑'], ['Jungle', '정글'], ['Mid', '미드'], ['Bot', '원딜'], ['Support', '서폿']]
const tier = (v: number) => TIERS.find(t => v >= t.min) ?? TIERS[TIERS.length - 1]
const n = (v: unknown) => (v == null ? null : Number(v))
const ZNAME: Record<string, string> = { gd15: 'GD@15', xpd15: 'XPD@15', csd15: 'CSD@15', csm: 'CSM', dpm: 'DPM', solo: '솔로킬', deaths: '데스(적을수록)', kda: 'KDA', assists: '어시', vspm: '시야/분', wcpm: '와드제거', winrate: '승률' }

export default function LolRanking() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [league, setLeague] = useState('LCK')
  const [role, setRole] = useState('Mid')
  const [onlyRegular, setOnlyRegular] = useState(true)
  const [sort, setSort] = useState<keyof Row>('role_rank')
  const [gprInfo, setGprInfo] = useState<{ league: string; gpr: number | null; offset: number; source: string | null }[]>([])
  useEffect(() => {
    supabase.from('lol_league_strength').select('league, offset_points, detail, source').eq('season', '2026')
      .then(({ data }) => setGprInfo((data ?? []).map((r: any) => ({ league: r.league, gpr: r.detail?.gpr ?? null, offset: Number(r.offset_points), source: r.source })).sort((a, b) => b.offset - a.offset)))
  }, [])
  const ALL = '전체'   // 🌐 전체 리그 (리그 보정 체급으로 한 줄 순위)
  const isAll = league === ALL

  useEffect(() => {
    // 2026 시즌 리그 기록은 원래 표(lol_player_stats)에서 바로 — 예전 뷰(v_lol_player_global)는 시즌이 늘면서 시간 초과
    supabase.from('lol_player_stats').select('*').eq('season', '2026').neq('league', 'INTL').not('role', 'is', null).limit(3000)
      .then(({ data: raw, error }) => {
        if (error) { setErr(error.message); return }
        // 주전급 = 그 리그 최다 경기의 25% 이상 (5세트 이상)
        const lgMax = new Map<string, number>()
        for (const r of raw ?? []) lgMax.set(r.league, Math.max(lgMax.get(r.league) ?? 0, r.games))
        const data = (raw ?? []).map((r: any) => ({ ...r, regular: r.games >= Math.max(5, (lgMax.get(r.league) ?? 0) * 0.25), composite: 0, base: 0, role_rank: 0 }))
        // 체급 v2 (여러 시즌 + 국제전 + 리그 보정 — v_lol_player_tier)를 선수 키(Leaguepedia 링크 또는 이름)로 붙인다
        supabase.from('v_lol_player_tier').select('pkey, tier, tier_now, seasons, zs_now').limit(5000).then(({ data: tiers }) => {
          const tm = new Map((tiers ?? []).map((t: any) => [t.pkey, t]))
          setRows((data ?? []).map((r: any) => {
            const o: any = { ...r }
            for (const k of Object.keys(o)) if (!['league', 'player', 'team', 'role', 'country', 'regular', 'tournaments', 'updated_at', 'lp_link'].includes(k)) o[k] = n(o[k])
            const t: any = tm.get(r.lp_link ?? r.player)
            o.tier = t ? n(t.tier) : null; o.tier_now = t ? n(t.tier_now) : null; o.seasons = t?.seasons ?? null; o.zs_now = t?.zs_now ?? null
            return o as Row
          }))
        })
      })
  }, [])

  const leagues = useMemo(() => [...new Set((rows ?? []).map(r => r.league))].sort((a, b) => { const i = (x: string) => { const k = LEAGUE_ORDER.indexOf(x); return k < 0 ? 99 : k }; return i(a) - i(b) }), [rows])
  const list = useMemo(() => {
    const l = (rows ?? []).filter(r => (isAll || r.league === league) && r.role === role && (!onlyRegular || r.regular) && (!isAll || r.tier != null))
    // 순위 = 체급(여러 시즌·국제전·리그 보정) 순, 주전급 먼저
    ;[...l].sort((a, b) => Number(b.regular) - Number(a.regular) || (b.tier ?? -99) - (a.tier ?? -99) || (b.tier_now ?? -99) - (a.tier_now ?? -99)).forEach((r, i) => { r.role_rank = i + 1 })
    const dir = sort === 'role_rank' || sort === 'deaths' || sort === 'fb_victim' ? 1 : -1
    return l.sort((a, b) => ((Number(a[sort] ?? (dir > 0 ? 1e9 : -1e9)) - Number(b[sort] ?? (dir > 0 ? 1e9 : -1e9))) * dir) || a.role_rank - b.role_rank)
  }, [rows, league, role, onlyRegular, sort, isAll])
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
        <button style={btn(isAll)} onClick={() => { setLeague(ALL); setSort('role_rank') }} title="모든 리그를 체급 한 줄로">🌐 전체</button>
        {leagues.map(l => <button key={l} style={btn(league === l)} onClick={() => { setLeague(l); setSort('role_rank') }}>{l}</button>)}
      </div>
      {/* 리그 전력 (Riot GPR 지역 대회 위력 점수) — 보정점 = 가장 센 리그 대비 */}
      {gprInfo.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, marginBottom: 6, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }} title={gprInfo[0].source ?? ''}>리그 전력 (Riot GPR):</span>
          {gprInfo.map(g => (
            <span key={g.league} style={{ padding: '1px 8px', borderRadius: 10, border: `1px solid ${league === g.league ? 'var(--gold-border)' : 'var(--border)'}`, fontFamily: 'var(--font-num)' }}>
              <b>{g.league}</b> {g.gpr ?? '–'} <span style={{ color: g.offset < 0 ? 'var(--red)' : 'var(--text-muted)' }}>{g.offset < 0 ? `${g.offset.toFixed(1)}점` : '기준'}</span>
            </span>
          ))}
          {!isAll && !gprInfo.some(g => g.league === league) && <span style={{ color: 'var(--orange)' }}>{league}은 GPR에 없음</span>}
        </div>
      )}
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
            {th('체급', 'tier', '2024~2026 시즌 + 국제전(×1.5) + 리그 전력 보정 — 리그끼리 비교 가능. 마우스 = 시즌별')}
            {th('올해', 'tier_now', '2026 시즌만 (같은 눈금, 리그 보정 포함)')}
            {th('세트', 'games')}{th('승률', 'winrate')}{th('KDA', 'kda')}
            {th('K/D/A', 'kills')}{th('킬관여', 'kp')}{th('피해%', 'dmg_pct', '팀 내 챔피언 피해 비중')}{th('DPM', 'dpm', '분당 챔피언 피해')}
            {th('골드%', 'gold_pct')}{th('CSM', 'csm', '분당 CS')}
            {th('GD@15', 'gd15', '15분 골드 차 (맞라이너 대비)')}{th('CSD@15', 'csd15', '15분 CS 차')}{th('XPD@15', 'xpd15', '15분 경험치 차')}
            {th('시야/분', 'vspm')}{th('퍼블', 'fb', '퍼스트 블러드 관여 %')}{th('솔로킬', 'solo_kills')}
          </tr></thead>
          <tbody>
            {list.map(r => {
              const t = tier(r.tier ?? 0)
              const trs = r.tournaments ? Object.entries(r.tournaments).map(([k, v]) => `${k} ${v}세트`).join('\n') : ''
              return (
                <tr key={r.player} style={{ opacity: r.regular ? 1 : 0.6 }}>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{r.role_rank}</td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)' }} title={trs}>
                    <b style={{ fontSize: 13 }}>{r.player}</b>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>{r.country}</span>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{isAll && <b style={{ color: 'var(--gold)', marginRight: 4 }}>{r.league}</b>}{r.team ?? '—'}</div>
                  </td>
                  <td style={{ ...td }} title={(r.seasons ?? []).map(x => `${x.season} ${x.league === 'INTL' ? '국제전' : x.league}${x.team ? ` ${x.team}` : ''} ${x.games}세트 → ${Math.round(60 + 13 * x.g)}`).join('\n') || '기록 없음'}>
                    {r.tier != null ? <span style={{ fontSize: 15, fontWeight: 800, color: t.color }}>{r.tier}</span> : <span style={{ color: 'var(--text-muted)' }}>–</span>}
                  </td>
                  <td style={td} title={r.zs_now ? Object.entries(r.zs_now).map(([k, v]) => `${ZNAME[k] ?? k} ${v > 0 ? '+' : ''}${v}σ`).join('\n') : ''}>
                    {r.tier_now != null ? <span style={{ fontWeight: 700, color: tier(r.tier_now).color }}>{r.tier_now}</span> : <span style={{ color: 'var(--text-muted)' }}>–</span>}
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
        체급 = 지표마다 같은 시즌·리그·포지션 주전급 대비 표준점수(σ)를 포지션별 가중치로 합침 (팀 승리보다 라인 지배력 — 킬관여·퍼블관여·피해%·골드%는 승리와 상관이 없어 뺌) →
        리그 전력 보정(Riot GPR) → 2026 ×1 · 2025 ×0.6 · 2024 ×0.35, 국제전 세트 ×1.5 → 세트 적으면 리그 평균 쪽으로 → 60 + 13σ.
        탑 GD@15 22 · XPD 16 · CSD 12 · 솔로킬 12 · DPM 12 · 데스 10 · KDA 10 / 정글 GD 18 · XPD 16 · CSD 12 · CSM 8 · 데스 12 · DPM 10 · KDA 10 · 솔로킬 4 · 시야 4 /
        미드 GD 20 · DPM 16 · CSD 12 · XPD 12 · KDA 12 · 솔로킬 10 · 데스 10 · 와드제거 2 / 원딜 GD 18 · DPM 18 · CSD 14 · 데스 12 · KDA 12 · XPD 8 · CSM 8 · 와드제거 4 /
        서폿 GD 18 · 데스 16 · XPD 14 · 어시 12 · KDA 10 · 시야 10 · DPM 8 · 와드제거 6 (모두 승률 6). LPL은 CSD·XPD·솔로킬이 없어 있는 지표로만.
        '올해' 칸에 마우스 = 지표별 σ, '체급'에 마우스 = 시즌별 점수.
      </div>
    </div>
  )
}

import dayjs from 'dayjs'
import { supabase } from './supabase'
import { koName, type ScheduleTeam, type ScheduleGame } from './gameSchedule'
import { NBA_NAMES_KO } from '../data/nbaNamesKo'
import { predictVolley, type VolleyResult } from './volleyPredict'
import { NBA_PRIOR, NBA_PRIOR_AVG_TOTAL } from '../data/nbaRatingPrior'
import { teamCondition, playerFatigue, COND_K, type Condition, type PastGame, type PlayerFatigue } from './fatigue'

// ─── 선수 오버롤 + 출전 확률 (분석 탭 오른쪽 칸) ─────
// 체급 = 이번 시즌 × w + 지난 시즌(player_base, 없으면 Claude 조사 manual_base) × (1 − w), w = 이번 시즌 경기 수 ÷ (경기 수 + 15)
// 최근폼 = 이번 시즌 최근 5경기 (5·4·3·2·1 가중) · 최종 오버롤 = 체급 × 0.7 + 폼 × 0.3
// 점수는 리그 안 순위(백분위)로 100점에 맞춘다: 상위 3% 90+ (전설) · 15% 80+ (영웅) · 40% 70+ (희귀) · 75% 60+ (일반) · 나머지 (하급)
// 출전 확률 = Claude 뉴스 판단(player_status) > ESPN 명단(nba_injuries) > 경기 기록(최근 결장·복귀)

export interface Avail {
  prob: number              // 0~100
  label: string             // 정상 · 결장 · 불투명 …
  origin: 'news' | 'espn' | 'box' | 'none'
  confirmed?: boolean
  reason?: string | null
  source?: { title?: string | null; url?: string | null } | null
  checkedAt?: string | null
  ret?: string | null       // 복귀 n경기째 …
  limited?: boolean         // 출전시간 제한 가능
}
export interface PlayerOv {
  id: string; name: string; nameEn: string; gp: number; min: number | null
  share: number             // 이번 시즌 팀 경기 중 뛴 비율 (팀 전력 가중 — 시즌 내내 빠진 선수는 팀 득실에 이미 반영돼 있어 0)
  base: number | null; form: number | null; overall: number | null
  baseNote: string          // 체급 근거 (이번 시즌 n경기 · 지난 시즌 …)
  fatigue: PlayerFatigue | null   // 개인 피로 (출전시간 부담)
  prev?: { date: string; base: number | null; form: number | null; overall: number | null; stamina: number | null } | null  // 지난 경기 때 수치 (player_ratings)
  avail: Avail
  pos?: string | null       // 배구 포지션 (KOVO 명단: S 세터 · OH 아웃사이드 히터 · OP 아포짓 · MB 미들 블로커 · L 리베로)
  kind?: string | null      // '외국인' · '아시아쿼터' (KBL·WKBL = player_kinds, 배구 = KOVO 명단) — 없으면 국내
  newcomer?: { kind: string | null; n: number; prior: number; w: number } | null   // 이 리그 지난 시즌 기록이 없는 선수: 출발점(같은 구분 평균)과 실제 기록 비중
}
export interface TeamOv { team: string | null; players: PlayerOv[]; full: number | null; exp: number | null; stats: TeamStats | null }
export interface TeamStats { n: number; pf: number; pa: number; sw?: number; sl?: number; rt?: TeamRating }
/** NBA 팀 레이팅 (nbaRatings) — r = 득실(상대 보정), o = 공격(+ = 많이 넣음), d = 수비(+ = 많이 내줌), avgT = 리그 평균 총점 */
export interface TeamRating { r: number; o: number; d: number; n: number; avgT: number }   // 농구 pf·pa = 경기당 득점·실점 / 배구 = 경기당 딴·잃은 세트, sw·sl = 시즌 세트 합
export interface GameNews { summary: string | null; items: { title: string; url?: string }[] | null; margin_adj: number | null; adj_note: string | null; checked_at: string }

export const OV_LEAGUE: Record<string, string> = { NBA: 'NBA', KBL: 'KBL', WKBL: 'WKBL', 'V리그 남자': 'VLEAGUE_M', 'V리그 여자': 'VLEAGUE_W' }

// WoW 아이템 등급
export const TIERS = [
  { min: 90, name: '전설', color: '#FF8000' },
  { min: 80, name: '영웅', color: '#A335EE' },
  { min: 70, name: '희귀', color: '#3D8BFF' },
  { min: 60, name: '일반', color: '#FFFFFF' },
  { min: -1, name: '하급', color: '#9D9D9D' },
]
export const tierOf = (ov: number | null | undefined) => (ov == null ? null : TIERS.find(t => ov >= t.min)!)

// 출전 확률 색 (초록 → 빨강)
export function availColor(p: number): string {
  return p >= 90 ? '#00E87A' : p >= 70 ? '#A3E635' : p >= 40 ? '#FACC15' : p > 0 ? '#FF4D6D' : '#FF3B3B'
}

export function seasonOf(d: string) { const y = +d.slice(0, 4), m = +d.slice(5, 7); const s = m >= 8 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}` }
const prevSeasonOf = (s: string) => `${+s.slice(0, 4) - 1}-${s.slice(2, 4)}`

function pctToScore(p: number): number {
  if (p <= 0.03) return 100 - (p / 0.03) * 10
  if (p <= 0.15) return 90 - ((p - 0.03) / 0.12) * 10
  if (p <= 0.40) return 80 - ((p - 0.15) / 0.25) * 10
  if (p <= 0.75) return 70 - ((p - 0.40) / 0.35) * 10
  return Math.max(40, 60 - ((p - 0.75) / 0.25) * 20)
}
/** pool = 내림차순 값. v보다 큰 값의 비율로 점수 */
function score(v: number, pool: number[]): number {
  if (!pool.length) return 60
  let lo = 0, hi = pool.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (pool[m] > v) lo = m + 1; else hi = m }
  return pctToScore(lo / pool.length)
}

interface SeasonRow { player_id: string; player_name: string; team: string | null; gp: number; min: number | null; gmsc: number | null }
interface BaseRow extends SeasonRow { manual_base: number | null; note: string | null }
interface RecentRow { player_id: string; n: number; gmsc5: number | null; min5: number | null }
interface StatusRow { team: string; player_name: string; player_id: string | null; play_prob: number | null; status: string | null; confirmed: boolean | null; reason: string | null; source_title: string | null; source_url: string | null; checked_at: string }
interface InjRow { player_id: string; player_name: string; team: string; status: string | null; short_comment: string | null; return_date: string | null; fetched_at: string }
interface LeagueData { cur: SeasonRow[]; prev: BaseRow[]; recent: Map<string, RecentRow>; poolCur: number[]; poolPrev: number[]; names: Record<string, string>; teams: Map<string, TeamStats>; pos: Map<string, { position: string | null; kind: string | null }>; kinds: Map<string, string>; prior: Map<string, number>; at: number }

const cache = new Map<string, LeagueData>()
const num = (v: unknown) => (v == null ? null : Number(v))

async function loadLeague(code: string): Promise<LeagueData> {
  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < 10 * 60000) return hit
  const cur = seasonOf(dayjs().format('YYYY-MM-DD'))
  const [a, b, c, nm, tg, kp, pk] = await Promise.all([
    supabase.from('v_player_season').select('player_id,player_name,team,gp,min,gmsc').eq('league', code).eq('season', cur).limit(2000),
    supabase.from('player_base').select('player_id,player_name,team,gp,min,gmsc,manual_base,note').eq('league', code).eq('season', prevSeasonOf(cur)).limit(2000),
    supabase.from('v_player_recent').select('player_id,n,gmsc5,min5').eq('league', code).limit(2000),
    supabase.from('player_names').select('name_en,name_ko').eq('league', code),
    // 배구: 경기 결과(세트 스코어) = vb_games (KOVO 시즌 일정, 매일 2번) → 팀별 세트 득실
    code.startsWith('VLEAGUE') ? supabase.from('vb_games').select('home,away,home_sets,away_sets').eq('league', code).eq('season', cur).limit(1000).then(r => ({ ...r, data: ((r.data ?? []) as { home: string; away: string; home_sets: number; away_sets: number }[]).flatMap(g => [{ team: g.home, team_score: g.home_sets, opp_score: g.away_sets }, { team: g.away, team_score: g.away_sets, opp_score: g.home_sets }]) }))
      : supabase.from('v_team_games').select('team,opp,game_date,is_home,team_score,opp_score').eq('league', code).eq('season', cur).limit(3000),
    // 배구 포지션 (kovo_players — 매일 04시 KOVO 명단으로 갱신)
    code.startsWith('VLEAGUE') ? supabase.from('kovo_players').select('player_code,position,kind').eq('gender', code === 'VLEAGUE_M' ? 'MALE' : 'FEMALE').limit(1000) : Promise.resolve({ data: [] }),
    // 외국인·아시아쿼터 (KBL = 공식 기록 playerFlag, WKBL = 아시아쿼터 명단) — 배구는 위 kovo_players.kind
    code === 'KBL' || code === 'WKBL' ? supabase.from('player_kinds').select('player_id,kind').eq('league', code).limit(1000) : Promise.resolve({ data: [] }),
  ])
  const pos = new Map(((kp.data ?? []) as { player_code: string; position: string | null; kind: string | null }[]).map(r => [r.player_code, { position: r.position, kind: r.kind }]))
  // 한국어 이름: 앱에 넣어 둔 표(NBA) + Supabase player_names(새 선수) — 표에 없으면 원래 이름
  const names: Record<string, string> = { ...(code === 'NBA' ? NBA_NAMES_KO : {}) }
  ;((nm.data ?? []) as { name_en: string; name_ko: string }[]).forEach(r => { names[r.name_en] = r.name_ko })
  const teams = new Map<string, TeamStats>()
  for (const r of (tg.data ?? []) as { team: string; team_score: number | null; opp_score: number | null }[]) {
    if (r.team_score == null || r.opp_score == null) continue
    const t = teams.get(r.team) ?? { n: 0, pf: 0, pa: 0 }
    t.n++; t.pf += r.team_score; t.pa += r.opp_score; teams.set(r.team, t)
  }
  teams.forEach(t => { t.sw = t.pf; t.sl = t.pa; t.pf /= t.n; t.pa /= t.n })
  if (PARAMS.leagues[code]?.rk != null) {   // NBA·KBL·WKBL 팀 레이팅
    const rt = nbaRatings((tg.data ?? []) as TeamGameRow[], PARAMS.leagues[code], code === 'NBA')
    rt.forEach((v, team) => { const t = teams.get(team); if (t) t.rt = v })
  }
  const fix = <T extends SeasonRow>(r: T): T => ({ ...r, min: num(r.min), gmsc: num(r.gmsc) })
  const curRows = ((a.data ?? []) as SeasonRow[]).map(fix)
  const prevRows = ((b.data ?? []) as BaseRow[]).map(fix)
  const vb = code.startsWith('VLEAGUE')
  const poolCur = curRows.filter(r => r.gmsc != null && r.gp >= 3 && (vb || (r.min ?? 0) >= 12)).map(r => r.gmsc!).sort((x, y) => y - x)
  const poolPrev = prevRows.filter(r => r.gmsc != null && r.gp >= (vb ? 5 : 15) && (vb || (r.min ?? 0) >= 12)).map(r => r.gmsc!).sort((x, y) => y - x)
  const recent = new Map(((c.data ?? []) as RecentRow[]).map(r => [r.player_id, { ...r, gmsc5: num(r.gmsc5), min5: num(r.min5) }]))
  const kinds = new Map<string, string>(vb ? [...pos.entries()].filter(([, v]) => v.kind).map(([id, v]) => [id, v.kind!])
    : ((pk.data ?? []) as { player_id: string; kind: string }[]).map(r => [r.player_id, r.kind]))
  // 새 선수 출발점 = 같은 구분(외국인·아시아쿼터·국내)의 이번 시즌 5경기+ 선수 체급 평균 (배구 외국인은 포지션별) — 없으면 지난 시즌 같은 구분, 그것도 없으면 기본값
  const prior = new Map<string, number>()
  const groups = new Map<string, number[]>()
  const keyOf = (id: string) => { const k = kinds.get(id) ?? '국내'; const ps = vb ? pos.get(id)?.position : null; return { k, kp: ps && k !== '국내' ? `${k}|${ps}` : null } }
  for (const r of curRows) if (r.gmsc != null && r.gp >= 5 && (vb || (r.min ?? 0) >= 12)) {
    const { k, kp } = keyOf(r.player_id); const sc = score(r.gmsc, poolCur)
    ;[k, kp].filter((x): x is string => !!x).forEach(x => groups.set(x, [...(groups.get(x) ?? []), sc]))
  }
  for (const r of prevRows) if (r.gmsc != null && r.gp >= 15 && (vb || (r.min ?? 0) >= 12)) {
    const { k } = keyOf(r.player_id); const x = `prev|${k}`; groups.set(x, [...(groups.get(x) ?? []), score(r.gmsc, poolPrev)])
  }
  groups.forEach((v, k) => { if (v.length >= 3) prior.set(k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)) })
  const d = { cur: curRows, prev: prevRows, recent, poolCur, poolPrev, names, teams, pos, kinds, prior, at: Date.now() }
  cache.set(code, d)
  return d
}

const norm = (s: string) => s.toLowerCase().replace(/[\s.]/g, '')
/** 일정 팀 → 선수 기록 팀 이름 */
function matchTeam(t: ScheduleTeam, teams: string[]): string | null {
  const cand = [t.name, t.full, koName(t.name)].filter((x): x is string => !!x).map(norm)
  const ts = teams.map(x => [x, norm(x)] as const)
  for (const c of cand) { const f = ts.find(([, n]) => n === c); if (f) return f[0] }
  for (const c of cand) { const f = ts.find(([, n]) => n.length >= 2 && (n.includes(c) || c.includes(n))); if (f) return f[0] }
  return null
}

const ESPN_PROB: [RegExp, number, string][] = [
  [/out|suspen|inactive/i, 0, '결장'], [/doubt/i, 15, '결장 유력'], [/question/i, 50, '불투명'],
  [/day-to-day|gtd/i, 60, '당일 결정'], [/probable/i, 90, '출전 유력'],
]
export const statusLabel = (p: number) => p >= 90 ? '출전' : p >= 70 ? '출전 유력' : p >= 40 ? '불투명' : p > 0 ? '결장 유력' : '결장'

export interface GameOverall { code: string; home: TeamOv; away: TeamOv; checkedAt: string | null; news: GameNews | null; cond: { home: Condition; away: Condition } | null }
export async function loadGameOverall(league: string, gameDate: string, home: ScheduleTeam, away: ScheduleTeam): Promise<GameOverall | null> {
  const code = OV_LEAGUE[league]; if (!code) return null
  await loadModelParams()
  const d = await loadLeague(code)
  const vb = code.startsWith('VLEAGUE')
  const teams = [...new Set(d.cur.map(r => r.team).filter((x): x is string => !!x))]
  const hName = matchTeam(home, teams), aName = matchTeam(away, teams)
  const names = [hName, aName].filter((x): x is string => !!x)
  const cur = seasonOf(gameDate)
  const [g, st, inj, nw, tg, sch, lo] = await Promise.all([
    names.length ? supabase.from('player_game_stats').select('game_id,game_date,team,player_id,minutes').eq('league', code).eq('season', cur).in('team', names).gte('game_date', dayjs(gameDate).subtract(45, 'day').format('YYYY-MM-DD')).limit(3000) : Promise.resolve({ data: [] }),
    supabase.from('player_status').select('*').eq('league', code).eq('game_date', gameDate),
    code === 'NBA' && names.length ? supabase.from('nba_injuries').select('*').in('team', names) : Promise.resolve({ data: [] }),
    supabase.from('game_news').select('*').eq('league', code).eq('game_date', gameDate),
    names.length && !vb ? supabase.from('v_team_games').select('team,game_id,game_date,is_home,opp,team_min,team_score,opp_score').eq('league', code).in('team', names)
      .gte('game_date', dayjs(gameDate).subtract(10, 'day').format('YYYY-MM-DD')).lt('game_date', gameDate) : Promise.resolve({ data: [] }),
    // 일정 (2026-11-21 — 선수 기록은 다음 날 새벽에 들어와서, 어제 한 경기가 v_team_games에 아직 없으면 백투백을 못 잡았다: KB스타즈 토·일)
    names.length && !vb ? supabase.from('game_schedules').select('game_date,games').eq('league', league)
      .gte('game_date', dayjs(gameDate).subtract(10, 'day').format('YYYY-MM-DD')).lt('game_date', gameDate) : Promise.resolve({ data: [] }),
    // 장기 결장 (2026-11-22 — 아라우조 무릎 수술·결별이 안 잡혔다: 날짜별 판단만 있어서 예약 작업이 안 돌면 비었다) — 기간 안이면 매 경기 적용
    supabase.from('player_long_out').select('*').eq('league', code).lte('from_date', gameDate).or(`until_date.is.null,until_date.gte.${gameDate}`),
  ])
  // 팀 컨디션 % (백투백·이동 거리·일정 밀도·원정 연전) — 경기 기록 + 기록이 아직 없는 날은 일정으로 채움 (연장은 기록이 있어야 앎)
  const pastRows = (tg.data ?? []) as (PastGame & { team: string })[]
  for (const r of (sch.data ?? []) as { game_date: string; games: ScheduleGame[] }[]) for (const x of r.games ?? []) {
    if (x.status && /취소|연기|postpon|cancel/i.test(x.status)) continue
    for (const [me, op, home] of [[x.home, x.away, true], [x.away, x.home, false]] as const) {
      const t = matchTeam(me, names); if (!t) continue
      if (pastRows.some(p => p.team === t && p.game_date === r.game_date)) continue
      const sc = (v: unknown) => v == null || v === '' || isNaN(Number(v)) ? null : Number(v)
      pastRows.push({ team: t, game_date: r.game_date, is_home: home, opp: matchTeam(op, teams) ?? op.name ?? null, game_id: x.id, team_min: null, team_score: sc(me.score), opp_score: sc(op.score) })
    }
  }
  const cond = hName && aName && !vb ? {
    home: teamCondition(code, hName, true, hName, gameDate, pastRows.filter(r => r.team === hName)),
    away: teamCondition(code, aName, false, hName, gameDate, pastRows.filter(r => r.team === aName)),
  } : null
  const newsRows = (nw.data ?? []) as (GameNews & { home: string; away: string })[]
  const same = (a: string, t: ScheduleTeam) => [t.name, t.full, koName(t.name)].filter((x): x is string => !!x).some(x => norm(x) === norm(a) || norm(x).includes(norm(a)) || norm(a).includes(norm(x)))
  const news = newsRows.find(n => same(n.home, home) && same(n.away, away)) ?? null
  const games = (g.data ?? []) as { game_id: string; game_date: string; team: string; player_id: string; minutes: number | null }[]
  const status = (st.data ?? []) as StatusRow[]
  // 그 경기 날짜 판단(player_status)이 있으면 그게 먼저, 없으면 장기 결장
  for (const r of (lo.data ?? []) as (StatusRow & { updated_at: string; play_prob: number })[]) {
    if (status.some(s => norm(s.team) === norm(r.team) && norm(s.player_name) === norm(r.player_name))) continue
    status.push({ team: r.team, player_name: r.player_name, player_id: r.player_id, play_prob: r.play_prob ?? 0, status: r.status ?? '결장', confirmed: r.confirmed ?? true,
      reason: r.reason, source_title: r.source_title, source_url: r.source_url, checked_at: r.updated_at })
  }
  const injuries = (inj.data ?? []) as InjRow[]
  const checkedAt = status.reduce<string | null>((m, s) => (!m || s.checked_at > m ? s.checked_at : m), null)

  const build = (sched: ScheduleTeam, team: string | null): TeamOv => {
    if (!team) return { team: null, players: [], full: null, exp: null, stats: null }
    const stats = d.teams.get(team) ?? null
    const tStatus = status.filter(s => norm(s.team) === norm(team) || norm(s.team) === norm(sched.name ?? '') || norm(s.team) === norm(koName(sched.name)))
    const tInj = injuries.filter(i => i.team === team)
    // 팀 경기 (최근순) · 선수별 출전 경기
    const tGames = [...new Map(games.filter(x => x.team === team).map(x => [x.game_id, x.game_date])).entries()].sort((x, y) => y[1].localeCompare(x[1])).map(x => x[0])
    const played = new Map<string, Map<string, number | null>>()
    games.filter(x => x.team === team).forEach(x => { if (!played.has(x.player_id)) played.set(x.player_id, new Map()); played.get(x.player_id)!.set(x.game_id, x.minutes == null ? null : Number(x.minutes)) })

    const roster = d.cur.filter(r => r.team === team)
    const rosterIds = new Set(roster.map(r => r.player_id))
    const prevById = new Map(d.prev.map(r => [r.player_id, r]))
    const prevByName = new Map(d.prev.map(r => [norm(r.player_name), r]))
    // 명단: 이번 시즌 출전시간(배구는 기여도) 상위 10명 + 출전 확률이 있는 선수
    const byUse = [...roster].sort((x, y) => vb ? (y.gmsc ?? 0) * y.gp - (x.gmsc ?? 0) * x.gp : (y.min ?? 0) * y.gp - (x.min ?? 0) * x.gp)
    // 배구: 포지션마다 주전·백업 후보가 빠지지 않게 (세터·리베로는 기여도 합이 작아 상위 10명에서 잘 빠진다) — 포지션별 몇 명씩 먼저, 나머지는 기여도 순으로 12명
    const top = vb ? (() => {
      const want: Record<string, number> = { S: 2, OP: 2, OH: 3, MB: 3, L: 2 }
      const pick: SeasonRow[] = []
      for (const [ps, k] of Object.entries(want)) pick.push(...byUse.filter(r => d.pos.get(r.player_id)?.position === ps).slice(0, k))
      for (const r of byUse) { if (pick.length >= 12) break; if (!pick.includes(r)) pick.push(r) }
      return pick
    })() : byUse.slice(0, 10)
    const extra: SeasonRow[] = []
    const stubIds = new Set<string>()
    const addExtra = (id: string | null, name: string) => {
      if ([...top, ...extra].some(p => p.player_id === id || norm(p.player_name) === norm(name))) return   // 부상 명단·출전 확률 양쪽에 있는 선수 두 번 넣지 않기
      const inRoster = roster.find(r => r.player_id === id || norm(r.player_name) === norm(name))
      if (inRoster) { extra.push(inRoster); return }
      const pb = (id && prevById.get(id)) || prevByName.get(norm(name))
      if (pb && (pb.manual_base != null || (pb.min ?? 0) >= 15 || vb)) { extra.push({ ...pb, gp: 0, min: pb.min, gmsc: null, team }); return }
      // 이번 시즌·지난 시즌 기록이 없어도 결장·출전 판단이 있는 선수는 목록에 보인다 (사용자 요청 2026-11-24 — 부키리치처럼 시즌 내내 못 뛴 선수가
      //  아예 안 보이면 있었는지도 모른다). 기록이 없으니 체급·오버롤은 비우고 팀 전력에는 안 넣는다 (팀 기록에 이미 그 선수 없는 경기력이 들어 있음).
      const sid = id ?? `name:${name}`
      stubIds.add(sid)
      extra.push({ player_id: sid, player_name: name, team, gp: 0, min: null, gmsc: null })
    }
    tStatus.forEach(s => addExtra(s.player_id, s.player_name))
    tInj.forEach(i => addExtra(i.player_id, i.player_name))

    const players: PlayerOv[] = [...top, ...extra].map(r => {
      const isCur = rosterIds.has(r.player_id)
      const c = isCur ? r : null
      const pb = prevById.get(r.player_id) ?? prevByName.get(norm(r.player_name)) ?? null
      const curScore = c?.gmsc != null && c.gp > 0 ? score(c.gmsc, d.poolCur) : null
      const lastScore = pb?.manual_base != null ? pb.manual_base : pb?.gmsc != null && pb.gp > 0 ? score(pb.gmsc, d.poolPrev) : null
      const n = c?.gp ?? 0
      const kind = d.kinds.get(r.player_id) ?? null
      // 이 리그 지난 시즌 기록이 없는 선수(새 용병·신인): 같은 구분 평균에서 출발해 경기마다 실제 쪽으로 (사용자 요청 2026-11-21)
      //  KBL 2025-26 측정: 새 용병은 평균 6경기분을 섞을 때(1경기 오차 4.7 → 3.0), 국내 신인은 3경기분일 때 가장 정확 — 배구도 일단 같은 값
      let newcomer: PlayerOv['newcomer'] = null
      if (lastScore == null && !stubIds.has(r.player_id)) {
        const ps = vb ? d.pos.get(r.player_id)?.position : null
        const k = kind ?? '국내'
        const pr = (ps && kind ? d.prior.get(`${k}|${ps}`) : undefined) ?? d.prior.get(k) ?? d.prior.get(`prev|${k}`) ?? (kind === '외국인' ? 80 : kind ? 68 : 55)
        const kk = kind ? 6 : 3, ne = curScore == null ? 0 : n
        newcomer = { kind, n: ne, prior: pr, w: Math.round(ne / (ne + kk) * 100) / 100 }
      }
      const w = lastScore == null ? 1 : curScore == null ? 0 : n / (n + 15)
      const base = newcomer ? (newcomer.n ? Math.round(((curScore ?? 0) * newcomer.n + newcomer.prior * (kind ? 6 : 3)) / (newcomer.n + (kind ? 6 : 3))) : newcomer.prior)
        : curScore == null && lastScore == null ? null : Math.round((curScore ?? 0) * w + (lastScore ?? 0) * (1 - w))
      const rc = d.recent.get(r.player_id)
      const form = rc && rc.n >= 2 && rc.gmsc5 != null ? Math.round(score(rc.gmsc5, d.poolCur)) : null
      const overall = base == null ? null : form == null ? base : Math.round(base * 0.7 + form * 0.3)
      const baseNote = stubIds.has(r.player_id) ? '이번 시즌 출전 기록 없음 — 팀 전력에는 안 넣음 (팀 기록에 이미 이 선수 없는 경기력이 반영)' : [n ? `이번 시즌 ${n}경기` : null, pb ? (pb.manual_base != null ? `조사 체급 ${pb.manual_base}${pb.note ? ` (${pb.note})` : ''}` : `지난 시즌 ${pb.gp}경기`) : null,
        lastScore != null && curScore != null ? `이번 시즌 비중 ${Math.round(w * 100)}%` : null,
        newcomer ? `${newcomer.kind ? `새 ${newcomer.kind}` : '이 리그 새 선수'} — ${newcomer.kind ? `${newcomer.kind} 평균` : '같은 리그 선수 평균'} ${newcomer.prior}에서 출발, 실제 기록 비중 ${Math.round(newcomer.w * 100)}%` : null].filter(Boolean).join(' · ')

      // 출전 확률
      let avail: Avail = { prob: 100, label: '출전', origin: 'none' }
      // 경기 기록: 최근 결장 · 복귀
      //  배구(사용자 요청 — 공식 부상 리포트가 없음): KOVO 누적 기록 차이로 만든 경기 기록에서, 팀이 뛴 경기에 그 선수 기록이 안 늘었으면 결장
      if (tGames.length) {
        const pm = played.get(r.player_id) ?? new Map()
        let k = 0; while (k < tGames.length && pm.has(tGames[k])) k++
        let m = 0; while (k + m < tGames.length && !pm.has(tGames[k + m])) m++
        const seasonMin = c?.min ?? pb?.min ?? null
        const regular = vb ? (c?.gp ?? 0) >= 3 : (seasonMin ?? 0) >= 15
        // 배구: 경기별 기록은 2026-11-18부터라 앞 경기 결장을 못 본다 → 팀 경기 수 − 선수 출전 수로 보충 (마지막 팀 경기도 빠졌을 때만)
        const short = vb && stats?.n && c ? stats.n - c.gp : 0
        if (vb && k === 0 && m < 2 && m >= 1 && short >= 2 && regular) {
          avail = { prob: 40, label: '불투명', origin: 'box', reason: `기록상 최근 경기 결장 · 시즌 ${stats!.n}경기 중 ${c!.gp}경기 출전 (뉴스 확인 전)` }
        } else if (k === 0 && m >= 2 && regular) {
          avail = { prob: 40, label: '불투명', origin: 'box', reason: `기록상 최근 ${m}경기 결장 (뉴스 확인 전)` }
        } else if (k > 0 && k <= 4 && m >= 2) {
          const recentMins = tGames.slice(0, k).map(id => pm.get(id)).filter((x): x is number => x != null)
          const avgRecent = recentMins.length ? recentMins.reduce((a, b) => a + b, 0) / recentMins.length : null
          const limited = avgRecent != null && seasonMin != null && avgRecent < seasonMin * 0.75
          avail = { prob: 85, label: '복귀', origin: 'box', ret: `${m}경기 결장 후 복귀 ${k}경기째${avgRecent != null ? ` · 최근 ${Math.round(avgRecent)}분 (시즌 ${Math.round(seasonMin ?? 0)}분)` : ''}`, limited }
        }
      }
      const ij = tInj.find(i => i.player_id === r.player_id)
      if (ij) {
        const m = ESPN_PROB.find(([re]) => re.test(ij.status ?? ''))
        avail = { ...avail, prob: m ? m[1] : 50, label: m ? m[2] : ij.status ?? '부상', origin: 'espn', reason: ij.short_comment, checkedAt: ij.fetched_at,
          source: { title: `ESPN 부상 명단${ij.return_date ? ` · 복귀 예상 ${dayjs(ij.return_date).format('M/D')}` : ''}` } }
      }
      const ns = tStatus.find(s => (s.player_id && s.player_id === r.player_id) || norm(s.player_name) === norm(r.player_name))
      if (ns && ns.play_prob != null) {
        avail = { ...avail, prob: ns.play_prob, label: ns.status || statusLabel(ns.play_prob), origin: 'news', confirmed: !!ns.confirmed, reason: ns.reason,
          source: ns.source_url || ns.source_title ? { title: ns.source_title, url: ns.source_url } : avail.source, checkedAt: ns.checked_at }
      }
      const share = stats?.n ? Math.min(1, n / stats.n) : vb ? 1 : 0
      // 개인 피로: 직전 경기·최근 7일 출전시간 (뛴 경기만 — 결장 선수는 계산 안 함)
      const pm = played.get(r.player_id)
      const fatigue = !vb && pm && pm.size ? playerFatigue(code, c?.min ?? null, gameDate, pastRows.filter(x => x.team === team), pm) : null
      const pp = vb ? d.pos.get(r.player_id) : undefined
      return { id: r.player_id, name: d.names[r.player_name] ?? r.player_name, nameEn: r.player_name, gp: n, share, min: c?.min ?? pb?.min ?? null, base, form, overall, baseNote, avail, fatigue, pos: pp?.position ?? null, kind, newcomer }
    }).sort((x, y) => (y.base ?? -1) - (x.base ?? -1) || (y.overall ?? -1) - (x.overall ?? -1))   // 체급 순 — 핵심 선수가 빠졌는지 바로 보이게

    const { full, exp } = teamStrength(players, {}, vb)
    return { team, players, full, exp, stats }
  }
  const H = build(home, hName), A = build(away, aName)
  // 지난 경기 때 수치 (예측 저장할 때 같이 저장된 player_ratings) — 화면에서 ▲▼ 변화 표시
  const ids = [...H.players, ...A.players].map(x => x.id)
  if (ids.length) {
    const { data: pr } = await supabase.from('player_ratings').select('player_id,game_date,base,form,overall,stamina').eq('league', code).in('player_id', ids).lt('game_date', gameDate).order('game_date', { ascending: false }).limit(1000)
    const last = new Map<string, { game_date: string; base: number | null; form: number | null; overall: number | null; stamina: number | null }>()
    for (const r of (pr ?? []) as { player_id: string; game_date: string; base: number | null; form: number | null; overall: number | null; stamina: number | null }[]) if (!last.has(r.player_id)) last.set(r.player_id, r)
    for (const x of [...H.players, ...A.players]) { const r = last.get(x.id); if (r) x.prev = { date: r.game_date, base: r.base, form: r.form, overall: r.overall, stamina: r.stamina } }
  }
  return { code, home: H, away: A, checkedAt, news, cond }
}

/** 팀 오버롤: 출전시간 × 이번 시즌 출전 비중 가중 평균 (full = 다 뛸 때, exp = 출전 확률·개인 피로 반영 — 빠지는 만큼 대체 선수 50점).
 *  overrides = 화면에서 바꾼 출전 확률 (선수 id → 0~100) */
export function teamStrength(players: PlayerOv[], overrides: Record<string, number>, vb = false): { full: number | null; exp: number | null } {
  if (vb) { const l = volleyLineup(players, overrides); if (l) return { full: l.full, exp: l.exp } }
  // 배구(포지션 모를 때): 체급 순 상위 7명(주전) 1, 나머지 0.3 / 농구: 출전시간 × 이번 시즌 출전 비중
  const vbW = new Map(players.filter(p => p.overall != null).map((p, i) => [p.id, i < 7 ? 1 : 0.3]))
  const wOf = (p: PlayerOv) => vb ? (vbW.get(p.id) ?? 0) : Math.max(5, p.min ?? 10) * p.share
  const rated = players.filter(p => p.overall != null && wOf(p) > 0)
  const sw = rated.reduce((a, p) => a + wOf(p), 0)
  if (!sw) return { full: null, exp: null }
  const prob = (p: PlayerOv) => (overrides[p.id] ?? p.avail.prob) / 100
  const full = rated.reduce((a, p) => a + wOf(p) * p.overall!, 0) / sw
  // 출전하면 개인 피로만큼 깎인 오버롤 (피로 감점 × 0.35), 빠지면 대체 선수 50
  const eff = (p: PlayerOv) => p.overall! - PARAMS.fatigueK * (p.fatigue?.pen ?? 0)
  const exp = rated.reduce((a, p) => a + wOf(p) * (eff(p) * prob(p) + 50 * (1 - prob(p))), 0) / sw
  return { full: Math.round(full * 10) / 10, exp: Math.round(exp * 10) / 10 }
}

// ─── 배구 팀 전력 = 포지션별 주전 슬롯 (사용자 요청 2026-11-21) ─────
// 같은 포지션에 잘하는 선수가 둘이어도 코트엔 정해진 수만 선다 → 포지션마다 주전 슬롯(세터 1·아포짓 1·아웃사이드 2·미들 2·리베로 1)을
// 그 포지션 오버롤 높은 순으로 채운다. 출전 확률이 있으면 '앞 선수가 빠지면 다음 선수' 순서로 기대값, 다 빠지면 대체 50.
// 팀 점수 = 슬롯 가중 평균(세터·아포짓 1.25, 아웃사이드 1, 미들 0.8, 리베로 0.6) − 균형 감점 0.5 × (평균보다 낮은 슬롯이 모자란 만큼의 가중 평균)
//  → 아포짓이 전설이어도 세터가 일반이면 감점. 가중치·감점은 처음 정한 값 (검증 전).
export const VB_SLOTS: { pos: string; label: string; n: number; w: number }[] = [
  { pos: 'S', label: '세터', n: 1, w: 1.25 }, { pos: 'OP', label: '아포짓', n: 1, w: 1.25 }, { pos: 'OH', label: '아웃사이드', n: 2, w: 1.0 },
  { pos: 'MB', label: '미들', n: 2, w: 0.8 }, { pos: 'L', label: '리베로', n: 1, w: 0.6 },
]
export const VB_POS_KO: Record<string, string> = { S: '세터', OP: '아포짓', OH: '아웃사이드', MB: '미들', L: '리베로' }
const VB_BALANCE = 0.5
export interface VolleySlot { pos: string; label: string; w: number; names: string[]; full: number; exp: number }
export function volleyLineup(players: PlayerOv[], overrides: Record<string, number>): { full: number; exp: number; slots: VolleySlot[]; penFull: number; penExp: number } | null {
  if (!players.some(p => p.pos)) return null
  const slots: VolleySlot[] = []
  for (const sl of VB_SLOTS) {
    const cand = players.filter(p => p.pos === sl.pos && p.overall != null).sort((a, b) => b.overall! - a.overall!)
    // 주전 n자리 기대값: 후보를 순서대로, 지금까지 채운 자리 수 분포를 따라가며 출전하면 다음 자리를 채운다
    const fill = (prob: (p: PlayerOv) => number) => {
      let dist: number[] = Array.from({ length: sl.n + 1 }, (_, i) => (i === 0 ? 1 : 0)); let sum = 0
      for (const p of cand) {
        const q = prob(p), nd = dist.slice()
        for (let k = 0; k < sl.n; k++) { const add = dist[k] * q; sum += add * p.overall!; nd[k] -= add; nd[k + 1] += add }
        dist = nd
      }
      const empty = dist.reduce((a, x, k) => a + x * (sl.n - k), 0)   // 못 채운 자리 = 대체 선수 50
      return (sum + empty * 50) / sl.n
    }
    const full = fill(() => 1), exp = fill(p => (overrides[p.id] ?? p.avail.prob) / 100)
    slots.push({ pos: sl.pos, label: sl.label, w: sl.w * sl.n, names: cand.slice(0, sl.n).map(p => p.name), full: Math.round(full * 10) / 10, exp: Math.round(exp * 10) / 10 })
  }
  const score = (key: 'full' | 'exp') => {
    const sw = slots.reduce((a, s) => a + s.w, 0)
    const mean = slots.reduce((a, s) => a + s.w * s[key], 0) / sw
    const pen = VB_BALANCE * slots.reduce((a, s) => a + s.w * Math.max(0, mean - s[key]), 0) / sw
    return { v: Math.round((mean - pen) * 10) / 10, pen: Math.round(pen * 10) / 10 }
  }
  const f = score('full'), e = score('exp')
  return { full: f.v, exp: e.v, slots, penFull: f.pen, penExp: e.pen }
}

// ─── 예상 스코어 시뮬레이션 (농구) ─────
// 마진 평균 = 득실 마진 50% + 오버롤 차 50% + 결장 반영(오버롤 손실 전부) + 홈 이점 + 뉴스 보정 + 컨디션 차(fatigue.ts)
//  득실 마진 = (홈 득점 + 원정 실점)/2 − (원정 득점 + 홈 실점)/2 (이번 시즌), 오버롤 1점 = k점
// 총점 = 두 팀 득실 평균 합. 마진·총점을 정규분포로 2만 번 뽑는다.
// 가중치는 Supabase model_params(key 'sim')에 두고 매일 검토 보고서에서 승인하면 바뀐다 — 없으면 아래 기본값.
export interface LeagueParams { sd: number; sdT: number; hca: number; k: number; avg: number; wScore: number; wOv: number; condK: number
  // NBA 팀 레이팅 모델 (2026-11-21, scripts/nba_score_model.py로 2011-16에서 고르고 2017-21·2025-26으로 확인):
  // rk·rkt = 경기마다 오차 반영 속도(득실·총점), carry = 지난 시즌 끝 값 이어받기, early = 시즌 초(팀 10경기 전) 반영 가속,
  // wMarket = 최종 마진·총점에서 시장 기준점 비중 (나머지 = 우리 모델) — 기준점이 없으면 모델만
  rk?: number; rkt?: number; carry?: number; early?: number; wMarket?: number }
interface TeamGameRow { team: string; opp: string; game_date: string; is_home: boolean; team_score: number | null; opp_score: number | null }
/** NBA 팀 레이팅: 지난 시즌 끝 값(NBA_PRIOR) × carry에서 시작해 이번 시즌 경기 순서대로 오차 × rk만큼 고친다 (최근 경기일수록 비중 큼) */
export function nbaRatings(rows: TeamGameRow[], c: LeagueParams, usePrior = true): Map<string, TeamRating> {
  const carry = c.carry ?? 0, k = c.rk ?? 0.05, kt = c.rkt ?? 0.05, early = c.early ?? 4, hca = c.hca
  const R = new Map<string, number>(), O = new Map<string, number>(), D = new Map<string, number>(), N = new Map<string, number>()
  if (usePrior) for (const [t, [r, o, d]] of Object.entries(NBA_PRIOR)) { R.set(t, r * carry); O.set(t, o * carry); D.set(t, d * carry) }
  const g = (m: Map<string, number>, t: string) => m.get(t) ?? 0
  const games = rows.filter(r => r.is_home && r.team_score != null && r.opp_score != null).sort((a, b) => a.game_date.localeCompare(b.game_date) || a.team.localeCompare(b.team))
  // 리그 평균 총점 출발값: NBA = 지난 시즌 값, KBL·WKBL = 이번 시즌 끝난 경기 평균 (없으면 avg × 2)
  let avg = usePrior ? NBA_PRIOR_AVG_TOTAL : games.length ? games.reduce((a, x) => a + Number(x.team_score) + Number(x.opp_score), 0) / games.length : c.avg * 2
  for (const x of games) {
    const h = x.team, a = x.opp, hs = Number(x.team_score), as = Number(x.opp_score)
    const nMin = Math.min(g(N, h), g(N, a))
    const kk = k * (1 + early * Math.max(0, 10 - nMin) / 10)
    const e = (hs - as) - (hca + g(R, h) - g(R, a))
    R.set(h, g(R, h) + kk * e / 2); R.set(a, g(R, a) - kk * e / 2)
    const eh = hs - (avg / 2 + g(O, h) + g(D, a) + hca / 2), ea = as - (avg / 2 + g(O, a) + g(D, h) - hca / 2)
    O.set(h, g(O, h) + kt * eh); D.set(a, g(D, a) + kt * eh); O.set(a, g(O, a) + kt * ea); D.set(h, g(D, h) + kt * ea)
    avg += 0.01 * (hs + as - avg)
    N.set(h, g(N, h) + 1); N.set(a, g(N, a) + 1)
  }
  const out = new Map<string, TeamRating>()
  for (const t of new Set([...R.keys(), ...N.keys()])) out.set(t, { r: g(R, t), o: g(O, t), d: g(D, t), n: g(N, t), avgT: avg })
  return out
}
export interface ModelParams { leagues: Record<string, LeagueParams>; fatigueK: number }
export const DEFAULT_PARAMS: ModelParams = {
  leagues: {
    NBA: { sd: 13.5, sdT: 18, hca: 2.5, k: 1.0, avg: 113, wScore: 0.5, wOv: 0, condK: COND_K.NBA, rk: 0.05, rkt: 0.05, carry: 0, early: 4, wMarket: 0 },   // wMarket 0 = 시장 기준점을 예상 스코어에 안 섞음 (사용자 요청 2026-11-23 — 우리 모델만)   // carry 0 = 지난 시즌 팀 레이팅 안 씀 (사용자 요청 2026-11-21 — 선수가 다 바뀜)
    // KBL·WKBL도 NBA처럼 팀 레이팅 + 결장·컨디션·뉴스 (사용자 요청 2026-11-24, 오버롤 차·시장 안 씀) — 2025-26 순차 백테스트 MAE KBL 9.43→9.30 · WKBL 9.46→9.41 (rk 0.05, early 0)
    KBL: { sd: 11, sdT: 14, hca: 2, k: 0.8, avg: 80, wScore: 0.5, wOv: 0, condK: COND_K.KBL, rk: 0.05, rkt: 0.05, carry: 0, early: 0, wMarket: 0 },
    WKBL: { sd: 10, sdT: 12, hca: 2, k: 0.7, avg: 65, wScore: 0.5, wOv: 0, condK: COND_K.WKBL, rk: 0.05, rkt: 0.05, carry: 0, early: 0, wMarket: 0 },
    // 배구: hca = 홈 이점(logit), k = 팀 오버롤 1점당 logit, wScore = 시장 배당 비중, wOv = 오버롤 모델 비중 (volleyPredict.ts)
    VLEAGUE_M: { sd: 0, sdT: 0, hca: 0.15, k: 0.08, avg: 0, wScore: 0.5, wOv: 0.5, condK: 0 },   // 배구 wScore = 팀 세트 득실 비중, wOv = 오버롤 비중
    VLEAGUE_W: { sd: 0, sdT: 0, hca: 0.15, k: 0.08, avg: 0, wScore: 0.5, wOv: 0.5, condK: 0 },
  },
  fatigueK: 0.35,
}
let PARAMS: ModelParams = DEFAULT_PARAMS
let paramsAt = 0
export const getParams = () => PARAMS
export async function loadModelParams(force = false): Promise<ModelParams> {
  if (!force && Date.now() - paramsAt < 10 * 60000) return PARAMS
  try {
    const { data } = await supabase.from('model_params').select('value').eq('key', 'sim').maybeSingle()
    const v = (data?.value ?? {}) as Partial<ModelParams>
    const leagues: Record<string, LeagueParams> = {}
    for (const [lg, d] of Object.entries(DEFAULT_PARAMS.leagues)) leagues[lg] = { ...d, ...(v.leagues?.[lg] ?? {}) }
    PARAMS = { leagues, fatigueK: v.fatigueK ?? DEFAULT_PARAMS.fatigueK }
    paramsAt = Date.now()
  } catch { /* 기본값 */ }
  return PARAMS
}
export interface SimResult { home: number; away: number; total: number; margin: number; homeWin: number; p10: number; p90: number
  parts: { scoreMargin: number; ovMargin: number; injury: number; hca: number; news: number; cond: number
    // NBA 레이팅 모델: rating = 팀 레이팅 차, model = 우리 모델 마진, market = 시장 마진(−홈 기준점), modelTotal·marketTotal
    rating?: number; model?: number; market?: number | null; modelTotal?: number; marketTotal?: number | null; wMarket?: number }
  // 가중치 빼기 전 값 — 예측 저장 후 검토에서 가중치를 바꿔 다시 계산해 보는 데 쓴다
  raw: { scoreMargin: number; ovDiff: number; injDiff: number; condDiff: number; hca: number; news: number; T: number; modelMargin?: number; modelTotal?: number; mktMargin?: number | null; mktTotal?: number | null } }
/** 시장 기준점 (NBA): spread = 홈 기준점(-5.5 = 홈 마핸 5.5), total = 총점 */
export interface MarketLines { spread?: number | null; total?: number | null }
function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
export function simulate(code: string, home: TeamOv, away: TeamOv, overrides: Record<string, number>, newsAdj = 0, cond: { home: Condition; away: Condition } | null = null, n = 20000, market: MarketLines | null = null): SimResult | null {
  const c = PARAMS.leagues[code]; if (!c) return null
  const H = teamStrength(home.players, overrides), A = teamStrength(away.players, overrides)
  if (H.full == null || A.full == null || H.exp == null || A.exp == null) return null
  const ok = (t: TeamStats | null) => t && t.n >= 3 ? t : { n: 0, pf: c.avg, pa: c.avg }
  const hs = ok(home.stats), as = ok(away.stats)
  const hPts = (hs.pf + as.pa) / 2, aPts = (as.pf + hs.pa) / 2
  const scoreMargin = hPts - aPts
  const ovDiff = H.full - A.full, injDiff = (H.exp - H.full) - (A.exp - A.full)
  const ovMargin = c.k * ovDiff
  const injury = c.k * injDiff
  // 컨디션: 1%p 차이 × condK (NBA 0.17점)
  const condDiff = cond ? cond.home.pct - cond.away.pct : 0
  const condAdj = c.condK * condDiff
  let mu = c.wScore * scoreMargin + c.wOv * ovMargin + injury + c.hca + newsAdj + condAdj
  let T = hPts + aPts
  // NBA (2026-11-21 사용자 요청 — 점수차가 너무 작아 플핸만 나왔다): 팀 레이팅 모델 + 시장 기준점 (wMarket 0.8) — scripts/nba_score_model.py
  const hr = home.stats?.rt, ar = away.stats?.rt
  let extra: Partial<SimResult['parts']> = {}, rawX: Partial<SimResult['raw']> = {}
  if (c.rk != null && hr && ar) {
    const rating = hr.r - ar.r
    const model = c.hca + rating + c.wOv * ovMargin + injury + condAdj + newsAdj
    const modelT = hr.avgT + hr.o + ar.d + ar.o + hr.d
    const w = c.wMarket ?? 0
    const mkt = market?.spread != null ? -Number(market.spread) : null, mktT = market?.total != null ? Number(market.total) : null
    mu = mkt != null ? mkt + (1 - w) * (model - mkt) : model
    T = mktT != null ? mktT + (1 - w) * (modelT - mktT) : modelT
    const r1 = (x: number) => Math.round(x * 10) / 10
    extra = { rating: r1(rating), model: r1(model), market: mkt, modelTotal: r1(modelT), marketTotal: mktT, wMarket: w }
    rawX = { modelMargin: r1(model), modelTotal: r1(modelT), mktMargin: mkt, mktTotal: mktT }
  }
  const ms: number[] = []; let win = 0, sumH = 0, sumA = 0
  for (let i = 0; i < n; i++) {
    const m = mu + c.sd * randn(), t = T + c.sdT * randn()
    ms.push(m); if (m > 0) win++
    sumH += (t + m) / 2; sumA += (t - m) / 2
  }
  ms.sort((x, y) => x - y)
  const r1 = (x: number) => Math.round(x * 10) / 10
  // 표시 스코어의 점수차 = 예상 마진을 반올림한 값 (홈·원정을 따로 반올림하면 마진 -3.4가 114-118 '4점차'로 보여 +3.5 픽과 어긋났다 — 2026-11-23 사용자 지적)
  const dR = Math.round(mu), hR = Math.round((sumH + sumA) / n / 2 + dR / 2)
  return { home: hR, away: hR - dR, total: Math.round(T), margin: r1(mu), homeWin: r1(win / n * 100),
    p10: r1(ms[Math.floor(n * 0.1)]), p90: r1(ms[Math.floor(n * 0.9)]),
    parts: { scoreMargin: r1(scoreMargin), ovMargin: r1(ovMargin), injury: r1(injury), hca: c.hca, news: newsAdj, cond: r1(condAdj), ...extra },
    raw: { scoreMargin: r1(scoreMargin), ovDiff: r1(ovDiff), injDiff: r1(injDiff), condDiff, hca: c.hca, news: newsAdj, T: r1(T), ...rawX } }
}

/** 배구 예측: 팀 오버롤(출전 확률 반영) 차 + 시장 배당 → 세트 스코어 분포 (volleyPredict.ts) */
export function simulateVolleyGame(code: string, home: TeamOv, away: TeamOv, overrides: Record<string, number>, odds: { home: number; away: number } | null): (VolleyResult & { diff: number }) | null {
  const p = PARAMS.leagues[code]; if (!p) return null
  const H = teamStrength(home.players, overrides, true), A = teamStrength(away.players, overrides, true)
  if (H.exp == null || A.exp == null) return null
  const diff = Math.round((H.exp - A.exp) * 10) / 10
  const r = predictVolley(code, diff, p, odds, { home: home.stats, away: away.stats })
  return r ? { ...r, diff } : null
}

/** 선수 체력 % = 팀 컨디션 − 개인 피로 (화면 '체력' 칸과 같은 값) */
export function staminaOf(p: PlayerOv, cond?: Condition | null): number | null {
  if (!cond && !p.fatigue) return null
  return Math.max(30, Math.round((cond?.pct ?? 100) - (p.fatigue?.pen ?? 0)))
}

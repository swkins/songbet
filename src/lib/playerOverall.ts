import dayjs from 'dayjs'
import { supabase } from './supabase'
import { koName, type ScheduleTeam } from './gameSchedule'

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
  id: string; name: string; gp: number; min: number | null
  base: number | null; form: number | null; overall: number | null
  baseNote: string          // 체급 근거 (이번 시즌 n경기 · 지난 시즌 …)
  avail: Avail
}
export interface TeamOv { team: string | null; players: PlayerOv[]; full: number | null; exp: number | null }

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
  return p >= 90 ? '#00E87A' : p >= 70 ? '#A3E635' : p >= 40 ? '#FACC15' : p > 0 ? '#FF4D6D' : '#B3001B'
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
interface LeagueData { cur: SeasonRow[]; prev: BaseRow[]; recent: Map<string, RecentRow>; poolCur: number[]; poolPrev: number[]; at: number }

const cache = new Map<string, LeagueData>()
const num = (v: unknown) => (v == null ? null : Number(v))

async function loadLeague(code: string): Promise<LeagueData> {
  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < 10 * 60000) return hit
  const cur = seasonOf(dayjs().format('YYYY-MM-DD'))
  const [a, b, c] = await Promise.all([
    supabase.from('v_player_season').select('player_id,player_name,team,gp,min,gmsc').eq('league', code).eq('season', cur).limit(2000),
    supabase.from('player_base').select('player_id,player_name,team,gp,min,gmsc,manual_base,note').eq('league', code).eq('season', prevSeasonOf(cur)).limit(2000),
    supabase.from('v_player_recent').select('player_id,n,gmsc5,min5').eq('league', code).limit(2000),
  ])
  const fix = <T extends SeasonRow>(r: T): T => ({ ...r, min: num(r.min), gmsc: num(r.gmsc) })
  const curRows = ((a.data ?? []) as SeasonRow[]).map(fix)
  const prevRows = ((b.data ?? []) as BaseRow[]).map(fix)
  const vb = code.startsWith('VLEAGUE')
  const poolCur = curRows.filter(r => r.gmsc != null && r.gp >= 3 && (vb || (r.min ?? 0) >= 12)).map(r => r.gmsc!).sort((x, y) => y - x)
  const poolPrev = prevRows.filter(r => r.gmsc != null && r.gp >= (vb ? 5 : 15) && (vb || (r.min ?? 0) >= 12)).map(r => r.gmsc!).sort((x, y) => y - x)
  const recent = new Map(((c.data ?? []) as RecentRow[]).map(r => [r.player_id, { ...r, gmsc5: num(r.gmsc5), min5: num(r.min5) }]))
  const d = { cur: curRows, prev: prevRows, recent, poolCur, poolPrev, at: Date.now() }
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

export async function loadGameOverall(league: string, gameDate: string, home: ScheduleTeam, away: ScheduleTeam): Promise<{ home: TeamOv; away: TeamOv; checkedAt: string | null } | null> {
  const code = OV_LEAGUE[league]; if (!code) return null
  const d = await loadLeague(code)
  const vb = code.startsWith('VLEAGUE')
  const teams = [...new Set(d.cur.map(r => r.team).filter((x): x is string => !!x))]
  const hName = matchTeam(home, teams), aName = matchTeam(away, teams)
  const names = [hName, aName].filter((x): x is string => !!x)
  const cur = seasonOf(gameDate)
  const [g, st, inj] = await Promise.all([
    names.length && !vb ? supabase.from('player_game_stats').select('game_id,game_date,team,player_id,minutes').eq('league', code).eq('season', cur).in('team', names).gte('game_date', dayjs(gameDate).subtract(45, 'day').format('YYYY-MM-DD')).limit(3000) : Promise.resolve({ data: [] }),
    supabase.from('player_status').select('*').eq('league', code).eq('game_date', gameDate),
    code === 'NBA' && names.length ? supabase.from('nba_injuries').select('*').in('team', names) : Promise.resolve({ data: [] }),
  ])
  const games = (g.data ?? []) as { game_id: string; game_date: string; team: string; player_id: string; minutes: number | null }[]
  const status = (st.data ?? []) as StatusRow[]
  const injuries = (inj.data ?? []) as InjRow[]
  const checkedAt = status.reduce<string | null>((m, s) => (!m || s.checked_at > m ? s.checked_at : m), null)

  const build = (sched: ScheduleTeam, team: string | null): TeamOv => {
    if (!team) return { team: null, players: [], full: null, exp: null }
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
    const top = [...roster].sort((x, y) => vb ? (y.gmsc ?? 0) * y.gp - (x.gmsc ?? 0) * x.gp : (y.min ?? 0) * y.gp - (x.min ?? 0) * x.gp).slice(0, 10)
    const extra: SeasonRow[] = []
    const addExtra = (id: string | null, name: string) => {
      if (top.some(p => p.player_id === id || norm(p.player_name) === norm(name))) return
      const inRoster = roster.find(r => r.player_id === id || norm(r.player_name) === norm(name))
      if (inRoster) { extra.push(inRoster); return }
      const pb = (id && prevById.get(id)) || prevByName.get(norm(name))
      if (pb && (pb.manual_base != null || (pb.min ?? 0) >= 15 || vb)) extra.push({ ...pb, gp: 0, min: pb.min, gmsc: null, team })
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
      const w = lastScore == null ? 1 : curScore == null ? 0 : n / (n + 15)
      const base = curScore == null && lastScore == null ? null : Math.round((curScore ?? 0) * w + (lastScore ?? 0) * (1 - w))
      const rc = d.recent.get(r.player_id)
      const form = rc && rc.n >= 2 && rc.gmsc5 != null ? Math.round(score(rc.gmsc5, d.poolCur)) : null
      const overall = base == null ? null : form == null ? base : Math.round(base * 0.7 + form * 0.3)
      const baseNote = [n ? `이번 시즌 ${n}경기` : null, pb ? (pb.manual_base != null ? `조사 체급 ${pb.manual_base}${pb.note ? ` (${pb.note})` : ''}` : `지난 시즌 ${pb.gp}경기`) : null,
        lastScore != null && curScore != null ? `이번 시즌 비중 ${Math.round(w * 100)}%` : null].filter(Boolean).join(' · ')

      // 출전 확률
      let avail: Avail = { prob: 100, label: '출전', origin: 'none' }
      // 경기 기록: 최근 결장 · 복귀
      if (!vb && tGames.length) {
        const pm = played.get(r.player_id) ?? new Map()
        let k = 0; while (k < tGames.length && pm.has(tGames[k])) k++
        let m = 0; while (k + m < tGames.length && !pm.has(tGames[k + m])) m++
        const seasonMin = c?.min ?? pb?.min ?? null
        if (k === 0 && m >= 2 && (seasonMin ?? 0) >= 15) {
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
      return { id: r.player_id, name: r.player_name, gp: n, min: c?.min ?? pb?.min ?? null, base, form, overall, baseNote, avail }
    })

    // 팀 전력: 출전시간 가중 평균 오버롤 (결장 확률만큼 대체 선수 50점)
    const wOf = (p: PlayerOv) => vb ? 1 : Math.max(5, p.min ?? 10)
    const rated = players.filter(p => p.overall != null)
    const sw = rated.reduce((a, p) => a + wOf(p), 0)
    const full = sw ? Math.round(rated.reduce((a, p) => a + wOf(p) * p.overall!, 0) / sw * 10) / 10 : null
    const exp = sw ? Math.round(rated.reduce((a, p) => a + wOf(p) * (p.overall! * p.avail.prob / 100 + 50 * (1 - p.avail.prob / 100)), 0) / sw * 10) / 10 : null
    return { team, players, full, exp }
  }
  return { home: build(home, hName), away: build(away, aName), checkedAt }
}

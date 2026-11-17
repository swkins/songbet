import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { koName, resolveTeamName, type ScheduleGame } from '../lib/gameSchedule'

// ─── 오버롤 분석 (선수 체급+최근폼 → 시뮬레이션) — 분석 탭 오른쪽 칸 ─────
// 데이터: Supabase overall_analyses (예약 작업/채팅에서 넣는다). 경기는 game_id(game_schedules 경기 id)로,
// 없으면 리그·날짜·팀 이름으로 찾는다.

export interface OaPlayer { name: string; role?: string | null; foreign?: string | null; base?: number | null; form?: number | null; overall?: number | null; status?: 'play' | 'out' | 'doubt'; play_prob?: number | null; note?: string | null }
export interface OverallAnalysis {
  id: number; updated_at: string; run_kind: string; league: string; game_date: string; kickoff_at: string; game_id: string | null
  home_team: string; away_team: string
  news: { time?: string; text: string; source?: string }[] | null
  home_players: OaPlayer[] | null; away_players: OaPlayer[] | null
  team_compare: Record<string, string | number | null> | null
  handicap_steps: { step: string; value: string | number; note?: string | null }[] | null
  exp_margin: number | string | null; exp_home_score: number | null; exp_away_score: number | null; home_win_pct: number | string | null
  margin_p10: number | null; margin_p90: number | null
  margin_bands: Record<string, number> | null; cover_probs: Record<string, number> | null
  market_line: { open?: string; current?: string; source?: string; as_of?: string } | null
  threshold_text: string | null
  picks: { pick: string; line?: string; odds_ref?: string | null; stars?: number; role?: string; reason?: string }[] | null
  recheck_note: string | null
  sources: { title: string; url: string }[] | null
  result_home: number | null; result_away: number | null
}

// 분석 탭 리그 이름 ↔ overall_analyses.league 코드
export const OA_LEAGUE: Record<string, string> = { NBA: 'NBA', KBL: 'KBL', WKBL: 'WKBL', 'V리그 남자': 'VLEAGUE_M', 'V리그 여자': 'VLEAGUE_W' }
const DOMESTIC = new Set(['KBL', 'WKBL', 'VLEAGUE_M', 'VLEAGUE_W'])

export async function loadOverallAnalyses(fromDate: string): Promise<OverallAnalysis[]> {
  const { data } = await supabase.from('overall_analyses').select('*').gte('game_date', fromDate).order('kickoff_at')
  return (data ?? []) as OverallAnalysis[]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
/** 분석 탭 경기 → 그 경기 오버롤 분석 (여러 번 돌렸으면 가장 최근 것) */
export function findAnalysis(list: OverallAnalysis[], g: ScheduleGame & { league: string; date: string }): OverallAnalysis | null {
  const code = OA_LEAGUE[g.league]
  const cand = list.filter(a => a.game_id === g.id || (a.league === code && a.game_date === g.date && teamMatch(a.home_team, g.home, g.league) && teamMatch(a.away_team, g.away, g.league)))
  return cand.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
}
function teamMatch(name: string, t: ScheduleGame['home'], league: string): boolean {
  const n = norm(name)
  const names = [t.name, t.full, koName(t.name), resolveTeamName(t, league, [])].filter((x): x is string => !!x).map(norm)
  return names.some(x => x.length >= 2 && (n.includes(x) || x.includes(n)))
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
const grade = (ov: number | null | undefined) => ov == null ? '' : ov >= 90 ? '🟣' : ov >= 80 ? '🔵' : ov >= 70 ? '🟢' : '⚪'
const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`

const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)' }
const h: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }
const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

export default function OverallAnalysisView({ a }: { a: OverallAnalysis }) {
  const margin = num(a.exp_margin) ?? 0
  const winPct = num(a.home_win_pct)
  const homeShort = a.home_team, awayShort = a.away_team
  const bands = Object.entries(a.margin_bands ?? {})
  const maxBand = Math.max(1, ...bands.map(([, v]) => v))
  const isDomestic = DOMESTIC.has(a.league)
  const graded = a.result_home != null && a.result_away != null

  const tile = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div style={{ ...box, flex: '1 1 120px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2, fontFamily: 'var(--font-num)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const players = (title: string, list: OaPlayer[] | null) => (
    <div style={{ ...box, flex: '1 1 260px', minWidth: 0 }}>
      <div style={h}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr><th style={th}>선수</th><th style={{ ...th, textAlign: 'right' }}>체급</th><th style={{ ...th, textAlign: 'right' }}>폼</th><th style={{ ...th, textAlign: 'right' }}>오버롤</th></tr></thead>
        <tbody>
          {(list ?? []).map((p, i) => {
            const out = p.status === 'out'
            return (
              <tr key={i} style={{ opacity: out ? 0.55 : 1 }}>
                <td style={td}>
                  <span style={{ fontWeight: p.foreign ? 800 : 600, textDecoration: out ? 'line-through' : undefined }}>{p.name}</span>
                  {p.foreign && <span style={{ marginLeft: 3, fontSize: 10 }}>{p.foreign}</span>}
                  {out && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--red)' }}>결장</span>}
                  {p.status === 'doubt' && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--orange)' }}>⚠️ {p.play_prob != null ? `${Math.round(p.play_prob * 100)}%` : '불투명'}</span>}
                  {p.note && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.note}</div>}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{p.base ?? '–'}</td>
                <td style={{ ...td, textAlign: 'right', color: p.form != null && p.base != null ? (p.form > p.base ? 'var(--green)' : p.form < p.base ? 'var(--red)' : 'var(--text-muted)') : 'var(--text-muted)' }}>{p.form ?? '–'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {p.overall == null ? <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>기록 미확보</span> : out ? `(${p.overall})` : <>{grade(p.overall)} {p.overall}</>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const tc = a.team_compare ?? {}
  const tcRows: [string, unknown, unknown][] = [
    ['팀 레이팅 (시뮬 평균)', tc.home_rating, tc.away_rating],
    ['득실 마진', tc.home_margin, tc.away_margin],
    ['🟣 선수 수', tc.home_stars, tc.away_stars],
    ['외국인 가용', tc.home_foreign, tc.away_foreign],
  ].filter(([, x, y]) => x != null || y != null) as [string, unknown, unknown][]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>오버롤 분석</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {awayShort} @ {homeShort} · 분석 {dayjs(a.updated_at).format('M/D HH:mm')}
          {a.market_line?.current ? ` · 기준점 ${a.market_line.current} (${[a.market_line.source, a.market_line.as_of].filter(Boolean).join(', ')})` : ' · 기준점 없음'}
        </span>
      </div>

      {/* 요약 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tile('예상 스코어 (홈-원정)', a.exp_home_score != null ? `${a.exp_home_score} - ${a.exp_away_score}` : '–', team_compareTotal(tc))}
        {tile('홈 승률', winPct != null ? `${winPct}%` : '–', '시뮬레이션 20,000회')}
        {tile('평균 마진 (홈)', signed(margin))}
        {tile('80% 구간', a.margin_p10 != null ? `${signed(a.margin_p10)} ~ ${signed(a.margin_p90 ?? 0)}` : '–', '홈 기준 점수차')}
        {graded && tile('실제 결과', `${a.result_home} - ${a.result_away}`)}
      </div>

      {/* 픽 */}
      {(a.picks?.length ?? 0) > 0 && (
        <div style={{ ...box, borderColor: 'var(--gold-border)', background: 'var(--gold-bg)' }}>
          {a.picks!.map((p, i) => (
            <div key={i} style={{ marginBottom: i < a.picks!.length - 1 ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)' }}>{p.pick}</span>
                {p.stars != null && <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>{'★'.repeat(p.stars)}<span style={{ opacity: 0.25 }}>{'★'.repeat(Math.max(0, 5 - p.stars))}</span></span>}
                {p.role && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, border: '1px solid var(--gold-border)', color: 'var(--gold)' }}>{p.role}</span>}
                {p.odds_ref && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.odds_ref}</span>}
              </div>
              {p.reason && <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 3 }}>{p.reason}</div>}
            </div>
          ))}
          {a.threshold_text && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--gold-border)' }}>기준선: {a.threshold_text}</div>}
        </div>
      )}

      {/* 재확인 */}
      {(a.recheck_note || isDomestic) && (
        <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--orange)', color: 'var(--orange)' }}>
          ⚠️ {isDomestic ? '베팅은 경기 30분 전 웜업터뷰 확인 후' : '경기 직전 확인'}{a.recheck_note ? ` — ${a.recheck_note}` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* 마진 분포 */}
        {bands.length > 0 && (
          <div style={{ ...box, flex: '1 1 260px' }}>
            <div style={h}>점수차 분포</div>
            {bands.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
                <span style={{ width: 62, flexShrink: 0, color: 'var(--text-secondary)' }}>{k}</span>
                <div style={{ flex: 1, height: 10, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(v / maxBand) * 100}%`, height: '100%', background: k.startsWith('홈') ? 'var(--gold)' : 'var(--blue)', opacity: 0.8 }} />
                </div>
                <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--font-num)' }}>{v}%</span>
              </div>
            ))}
          </div>
        )}
        {/* 핸디 커버 확률 */}
        {a.cover_probs && Object.keys(a.cover_probs).length > 0 && (
          <div style={{ ...box, flex: '1 1 200px' }}>
            <div style={h}>핸디별 커버 확률 (홈 기준)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr><th style={th}>홈 핸디</th><th style={{ ...th, textAlign: 'right' }}>홈</th><th style={{ ...th, textAlign: 'right' }}>원정</th></tr></thead>
              <tbody>
                {Object.entries(a.cover_probs).sort((x, y) => Number(x[0].replace('−', '-')) - Number(y[0].replace('−', '-'))).map(([line, p]) => (
                  <tr key={line}>
                    <td style={td}>{line}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: p >= 52.4 ? 800 : 400, color: p >= 52.4 ? 'var(--gold)' : undefined }}>{p}%</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 100 - p >= 52.4 ? 800 : 400, color: 100 - p >= 52.4 ? 'var(--blue)' : undefined }}>{Math.round((100 - p) * 10) / 10}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 선수 오버롤 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {players(`홈 · ${homeShort}`, a.home_players)}
        {players(`원정 · ${awayShort}`, a.away_players)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -4 }}>오버롤 = 체급 × 0.7 + 폼 × 0.3 · 🟣 90+ 🔵 80~89 🟢 70~79 ⚪ ~69 · 폼 초록 = 시즌보다 좋음</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 전력 비교 */}
        {(tcRows.length > 0 || tc.record || tc.note) && (
          <div style={{ ...box, flex: '1 1 260px' }}>
            <div style={h}>전력 비교</div>
            {tc.record && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{String(tc.record)}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr><th style={th}></th><th style={{ ...th, textAlign: 'right' }}>홈</th><th style={{ ...th, textAlign: 'right' }}>원정</th></tr></thead>
              <tbody>{tcRows.map(([k, x, y]) => (
                <tr key={k}><td style={td}>{k}</td><td style={{ ...td, textAlign: 'right' }}>{x == null ? '–' : String(x)}</td><td style={{ ...td, textAlign: 'right' }}>{y == null ? '–' : String(y)}</td></tr>
              ))}</tbody>
            </table>
            {tc.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{String(tc.note)}</div>}
          </div>
        )}
        {/* 예상 핸디 단계 */}
        {(a.handicap_steps?.length ?? 0) > 0 && (
          <div style={{ ...box, flex: '1 1 260px' }}>
            <div style={h}>예상 핸디 계산 (홈 기준)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>{a.handicap_steps!.map((s, i) => (
                <tr key={i}>
                  <td style={td}>{s.step}{s.note && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.note}</div>}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.value}</td>
                </tr>
              ))}</tbody>
            </table>
            {tc.overall_margin != null && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>최종 = 위 마진 50% + 오버롤 모델({signed(Number(tc.overall_margin))}) 50%</div>}
          </div>
        )}
      </div>

      {/* 뉴스 */}
      {(a.news?.length ?? 0) > 0 && (
        <div style={box}>
          <div style={h}>결장·뉴스</div>
          {a.news!.map((n, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>
              {n.time && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{n.time}</span>}{n.text}
              {n.source && <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 6 }}>{n.source}</span>}
            </div>
          ))}
        </div>
      )}

      {/* 출처 */}
      {(a.sources?.length ?? 0) > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          출처: {a.sources!.map((s, i) => <span key={i}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>{s.title}</a></span>)}
        </div>
      )}
    </div>
  )
}

function team_compareTotal(tc: Record<string, unknown>): string | undefined {
  return tc.exp_total != null ? `예상 총점 ${tc.exp_total}` : undefined
}

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { koName } from '../lib/gameSchedule'

// ─── 분석 탭 '예측 보고서' — 경기 전 예측(predictions) vs 결과, Claude 매일 검토(model_reviews), 가중치(model_params) ─────
// 예측은 Supabase 함수 snapshot-predictions가 NBA 21:30 KST·국내 시작 30~90분 전에 저장하고 끝나면 채점한다.
// 검토는 Claude(Opus) 예약 작업이 매일 09시 쯤 전날 경기를 보고 쓰고, 가중치는 [적용]을 눌러야 바뀐다.

export interface Prediction {
  league: string; game_id: string; game_date: string; start_at: string; home: string; away: string
  pred_home: number; pred_away: number; margin: number; home_win: number; total: number
  parts: Record<string, number> | null; cond: { home: { pct: number }; away: { pct: number } } | null
  odds_home: number | null; odds_away: number | null
  result_home: number | null; result_away: number | null; win_hit: boolean | null; market_hit: boolean | null
  margin_err: number | null; total_err: number | null
}
interface Proposal { league: string | null; param: string; from: number; to: number; reason?: string; evidence?: string }
interface Review { id: number; created_at: string; review_date: string; summary: string | null; stats: Record<string, unknown> | null; proposals: Proposal[] | null; status: string; decided_at: string | null }
interface History { id: number; changed_at: string; note: string | null; review_id: number | null }

const LG: Record<string, string> = { NBA: 'NBA', KBL: 'KBL', WKBL: 'WKBL' }
const PARAM: Record<string, string> = { wScore: '득실 비중', wOv: '오버롤 비중', k: '오버롤 1점당 점수', hca: '홈 이점', condK: '컨디션 1%p당 점수', sd: '점수차 퍼짐', sdT: '총점 퍼짐', avg: '리그 평균 득점', fatigueK: '개인 피로 → 오버롤' }

export async function loadPredictions(fromDate: string): Promise<Prediction[]> {
  const { data } = await supabase.from('predictions').select('*').gte('game_date', fromDate).order('start_at', { ascending: false }).limit(1000)
  return (data ?? []) as Prediction[]
}

/** 일정 카드용 작은 뱃지: 예측 스코어 + 적중/미적중 */
export function PredBadge({ p }: { p: Prediction }) {
  const done = p.result_home != null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--text-muted)' }}>예측 {p.pred_home}-{p.pred_away}</span>
      {done && <HitTag hit={p.win_hit} />}
    </span>
  )
}
function HitTag({ hit, small }: { hit: boolean | null; small?: boolean }) {
  if (hit == null) return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>–</span>
  const c = hit ? 'var(--green)' : 'var(--red)'
  return <span style={{ fontSize: small ? 9 : 10, fontWeight: 800, padding: '0 6px', borderRadius: 8, border: `1px solid ${c}`, color: c, whiteSpace: 'nowrap' }}>{hit ? '✓ 적중' : '✗ 미적중'}</span>
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '–')
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

export default function ModelReport({ onClose }: { onClose: () => void }) {
  const [preds, setPreds] = useState<Prediction[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [params, setParams] = useState<Record<string, unknown> | null>(null)
  const [hist, setHist] = useState<History[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [pick, setPick] = useState<Record<number, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      loadPredictions(dayjs().subtract(30, 'day').format('YYYY-MM-DD')),
      supabase.from('model_reviews').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('model_params').select('value').eq('key', 'sim').maybeSingle(),
      supabase.from('model_param_history').select('id,changed_at,note,review_id').order('changed_at', { ascending: false }).limit(10),
    ]).then(([p, r, mp, h]) => {
      setPreds(p); setReviews((r.data ?? []) as Review[]); setParams((mp.data?.value ?? null) as Record<string, unknown> | null); setHist((h.data ?? []) as History[])
      const latest = (r.data ?? [])[0] as Review | undefined
      setPick(Object.fromEntries((latest?.proposals ?? []).map((_, i) => [i, true])))
      setLoading(false)
    })
  }
  useEffect(load, [])

  const since = dayjs().subtract(days, 'day').format('YYYY-MM-DD')
  const graded = preds.filter(p => p.result_home != null && p.game_date >= since)
  const summary = useMemo(() => {
    const leagues = [...new Set(graded.map(p => p.league))]
    return ['전체', ...leagues].map(lg => {
      const xs = lg === '전체' ? graded : graded.filter(p => p.league === lg)
      const mk = xs.filter(p => p.market_hit != null)
      return {
        lg, n: xs.length, hit: xs.filter(p => p.win_hit).length,
        mHit: mk.filter(p => p.market_hit).length, mN: mk.length,
        mae: avg(xs.map(p => Math.abs(Number(p.margin_err)))), tae: avg(xs.map(p => Math.abs(Number(p.total_err)))),
        near: xs.filter(p => Math.abs(Number(p.margin_err)) <= 5).length,
      }
    })
  }, [graded])
  const byDate = useMemo(() => {
    const m = new Map<string, Prediction[]>()
    preds.filter(p => p.game_date >= since).forEach(p => { if (!m.has(p.game_date)) m.set(p.game_date, []); m.get(p.game_date)!.push(p) })
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [preds, since])

  const review = reviews[0]
  async function decide(apply: boolean) {
    if (!review) return
    const keys = apply ? Object.entries(pick).filter(([, v]) => v).map(([k]) => Number(k)) : []
    const { data, error } = await supabase.rpc('apply_model_review', { p_id: review.id, p_keys: keys })
    setMsg(error ? `실패: ${error.message}` : (data as { error?: string })?.error ? `실패: ${(data as { error: string }).error}` : apply ? `적용했어요 (${keys.length}개) — 다음 예측부터 반영` : '이번 제안은 넘겼어요')
    load()
  }
  async function revert(id: number) {
    if (!confirm('이 변경 전으로 가중치를 되돌릴까요?')) return
    const { error } = await supabase.rpc('revert_model_params', { p_history_id: id })
    setMsg(error ? `실패: ${error.message}` : '되돌렸어요'); load()
  }

  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: 'var(--bg-elevated)', marginBottom: 10 }
  const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 6px', borderBottom: '1px solid var(--border)', fontSize: 12, verticalAlign: 'top' }
  const h: React.CSSProperties = { fontSize: 14, fontWeight: 800, marginBottom: 8 }
  const signed = (v: number | null) => v == null ? '–' : `${v > 0 ? '+' : ''}${v}`
  const name = (lg: string, n: string) => lg === 'NBA' ? koName(n) : n

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 12px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 980, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>예측 보고서</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>경기 전 예상 스코어 vs 결과 · 적중 = 예상한 승리팀이 이김</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[3, 7, 30].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${days === d ? 'var(--gold-border)' : 'var(--border)'}`, background: days === d ? 'var(--gold-bg)' : 'none', color: days === d ? 'var(--gold)' : 'var(--text-secondary)' }}>{d}일</button>
            ))}
            <button onClick={load} title="새로고침" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
              <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
          </div>
        </div>
        {msg && <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 8 }}>{msg}</div>}
        {loading && !preds.length ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중…</div> : <>

          {/* 누적 성적 */}
          <div style={box}>
            <div style={h}>최근 {days}일 성적</div>
            {!graded.length ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>아직 채점된 경기가 없어요 (예측은 NBA 21:30 · 국내 경기 시작 전에 저장되고, 끝나면 채점)</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>리그</th><th style={th}>경기</th><th style={th}>승패 적중</th><th style={th}>시장 정배 적중</th><th style={th}>마진 오차 평균</th><th style={th}>5점 안</th><th style={th}>총점 오차 평균</th></tr></thead>
                <tbody>{summary.map(s => (
                  <tr key={s.lg}>
                    <td style={{ ...td, fontWeight: 700 }}>{LG[s.lg] ?? s.lg}</td><td style={td}>{s.n}</td>
                    <td style={{ ...td, fontWeight: 800, color: s.n && s.hit / s.n >= (s.mN ? s.mHit / s.mN : 0) ? 'var(--green)' : 'var(--text-primary)' }}>{s.hit}/{s.n} ({pct(s.hit, s.n)})</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{s.mN ? `${s.mHit}/${s.mN} (${pct(s.mHit, s.mN)})` : '–'}</td>
                    <td style={td}>{s.mae ?? '–'}점</td><td style={td}>{pct(s.near, s.n)}</td><td style={td}>{s.tae ?? '–'}점</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {/* Claude 검토 */}
          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Claude 검토</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>매일 09시 쯤 전날 경기 · Opus</span>
              {review && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{dayjs(review.review_date).format('M/D')} 경기 검토 · {dayjs(review.created_at).format('M/D HH:mm')}</span>}
              {review && <span style={{ fontSize: 10, fontWeight: 700, padding: '0 6px', borderRadius: 8, border: '1px solid var(--border)', color: review.status === 'pending' ? 'var(--gold)' : 'var(--text-muted)' }}>{review.status === 'pending' ? '결정 대기' : review.status === 'applied' ? '적용함' : '넘김'}</span>}
            </div>
            {!review ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>아직 검토 보고서가 없어요</div> : <>
              <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{review.summary}</div>
              {(review.proposals?.length ?? 0) > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>가중치 변경 제안</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}></th><th style={th}>리그</th><th style={th}>항목</th><th style={th}>지금 → 제안</th><th style={th}>이유 · 근거</th></tr></thead>
                    <tbody>{review.proposals!.map((p, i) => (
                      <tr key={i}>
                        <td style={td}>{review.status === 'pending' && <input type="checkbox" checked={!!pick[i]} onChange={e => setPick(s => ({ ...s, [i]: e.target.checked }))} />}</td>
                        <td style={td}>{p.league ?? '공통'}</td><td style={td}>{PARAM[p.param] ?? p.param}</td>
                        <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>{p.from} → <span style={{ color: 'var(--gold)' }}>{p.to}</span></td>
                        <td style={{ ...td, fontSize: 11 }}>{p.reason}{p.evidence && <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.evidence}</div>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {review.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="btn btn-primary" onClick={() => decide(true)} style={{ fontSize: 12, padding: '5px 12px' }}>고른 것 적용</button>
                      <button className="btn btn-ghost" onClick={() => decide(false)} style={{ fontSize: 12, padding: '5px 12px' }}>이번엔 넘기기</button>
                    </div>
                  )}
                </div>
              ) : <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>이번엔 가중치 변경 제안 없음</div>}
            </>}
          </div>

          {/* 경기별 */}
          <div style={box}>
            <div style={h}>경기별 예측 · 결과</div>
            {!byDate.length ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>저장된 예측이 없어요</div> : byDate.map(([date, list]) => {
              const g = list.filter(p => p.result_home != null)
              return (
                <div key={date} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', margin: '4px 0' }}>
                    {dayjs(date).format('M/D (dd)')} · {g.length ? `적중 ${g.filter(p => p.win_hit).length}/${g.length}` : '결과 전'}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>리그</th><th style={th}>경기 (홈 - 원정)</th><th style={th}>예상</th><th style={th}>실제</th><th style={th}>마진 예상 / 실제</th><th style={th}>오차</th><th style={th}>결과</th><th style={th}>시장 정배</th></tr></thead>
                    <tbody>{list.map(p => {
                      const actual = p.result_home != null ? p.result_home - (p.result_away ?? 0) : null
                      return (
                        <tr key={p.game_id}>
                          <td style={{ ...td, color: 'var(--text-muted)' }}>{p.league}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{name(p.league, p.home)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>-</span> {name(p.league, p.away)}</td>
                          <td style={{ ...td, fontFamily: 'var(--font-num)' }}>{p.pred_home}-{p.pred_away}<div style={{ fontSize: 10, color: 'var(--text-muted)' }}>홈 승 {p.home_win}%</div></td>
                          <td style={{ ...td, fontFamily: 'var(--font-num)', fontWeight: 700 }}>{p.result_home != null ? `${p.result_home}-${p.result_away}` : '–'}</td>
                          <td style={{ ...td, fontFamily: 'var(--font-num)' }}>{signed(p.margin)} / {signed(actual)}</td>
                          <td style={{ ...td, fontFamily: 'var(--font-num)', color: p.margin_err == null ? undefined : Math.abs(p.margin_err) <= 5 ? 'var(--green)' : Math.abs(p.margin_err) >= 15 ? 'var(--red)' : undefined }}>{p.margin_err == null ? '–' : `${Math.abs(p.margin_err)}점`}</td>
                          <td style={td}>{p.result_home != null ? <HitTag hit={p.win_hit} /> : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>대기</span>}</td>
                          <td style={td}>{p.market_hit == null ? <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>–</span> : <span style={{ fontSize: 10, color: p.market_hit ? 'var(--green)' : 'var(--red)' }}>{p.market_hit ? '✓' : '✗'} {Number(p.odds_home) < Number(p.odds_away) ? '홈' : '원정'} {Math.min(Number(p.odds_home), Number(p.odds_away)).toFixed(2)}</span>}</td>
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>
              )
            })}
          </div>

          {/* 가중치 */}
          <div style={box}>
            <div style={h}>지금 가중치</div>
            {params && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>리그</th>{['wScore', 'wOv', 'k', 'hca', 'condK', 'sd'].map(k => <th key={k} style={th}>{PARAM[k]}</th>)}</tr></thead>
                <tbody>{Object.entries((params.leagues ?? {}) as Record<string, Record<string, number>>).map(([lg, v]) => (
                  <tr key={lg}><td style={{ ...td, fontWeight: 700 }}>{lg}</td>{['wScore', 'wOv', 'k', 'hca', 'condK', 'sd'].map(k => <td key={k} style={{ ...td, fontFamily: 'var(--font-num)' }}>{v[k]}</td>)}</tr>
                ))}</tbody>
              </table>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>개인 피로 → 오버롤: {String(params?.fatigueK ?? '–')}</div>
            {hist.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>바뀐 기록</div>
                {hist.map(x => (
                  <div key={x.id} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{dayjs(x.changed_at).format('M/D HH:mm')}</span><span>{x.note}</span>
                    <button onClick={() => revert(x.id)} style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px 6px' }}>이 변경 전으로</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>}
      </div>
    </div>
  )
}

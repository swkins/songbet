import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── 분석 탭 '업데이트 현황' — Supabase가 자동으로 모으는 것들의 주기·마지막·다음 실행·결과 ─────
// 데이터: rpc analysis_update_status (supabase/cron_collect.sql). pg_cron 작업 일정은 UTC '분 시 * * *'.

interface Run { start: string; status: string }
interface Job { name: string; schedule: string; active: boolean; runs: Run[] }
interface Status {
  now: string
  jobs: Job[]
  schedule_last: { at: string; status: number; body: { league: string; counts?: Record<string, number>; error?: string }[] | null } | null
  schedules: { league: string; game_date: string; games: number; fetched_at: string }[]
  odds_jobs: { league: string; last_request_at: string | null; next_at: string | null; deferred: number; snapshots: number
    last: { at: string; status: string; note: Record<string, unknown> | null } | null }[]
  player_stats: { league: string; rows: number; games: number; last_game: string; last_insert: string }[]
  kovo_snapshots: { players: number; last: string | null } | null
  analyses: { league: string; count: number; last: string }[]
}

/** pg_cron 일정(UTC) → 다음 실행 시각 */
function nextRun(schedule: string, now = new Date()): Date | null {
  const [mi, hr] = schedule.split(' ')
  const m = Number(mi); if (!Number.isFinite(m)) return null
  const d = new Date(now); d.setUTCSeconds(0, 0); d.setUTCMinutes(m)
  if (hr === '*') { if (d <= now) d.setUTCHours(d.getUTCHours() + 1); return d }
  const h = Number(hr); if (!Number.isFinite(h)) return null
  d.setUTCHours(h); if (d <= now) d.setUTCDate(d.getUTCDate() + 1)
  return d
}
const t = (v?: string | Date | null) => (v ? dayjs(v).format('M/D HH:mm') : '–')
const ago = (v?: string | null) => {
  if (!v) return ''
  const m = Math.round((Date.now() - Date.parse(v)) / 60000)
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 ${m % 60}분 전` : `${Math.floor(m / 1440)}일 전`
}
const until = (d?: Date | string | null) => {
  if (!d) return ''
  const m = Math.round((new Date(d).getTime() - Date.now()) / 60000)
  return m <= 0 ? '곧' : m < 60 ? `${m}분 뒤` : `${Math.floor(m / 60)}시간 ${m % 60}분 뒤`
}
const LG: Record<string, string> = { VLEAGUE_M: 'V리그 남자', VLEAGUE_W: 'V리그 여자' }

export default function UpdateStatus({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Status | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    supabase.rpc('analysis_update_status').then(({ data, error }) => {
      if (error) setErr(error.message); else { setS(data as Status); setErr(null) }
      setLoading(false)
    })
  }
  useEffect(load, [])

  const job = (name: string) => s?.jobs.find(j => j.name === name)
  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: 'var(--bg-elevated)', marginBottom: 10 }
  const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid var(--border)', fontSize: 12, verticalAlign: 'top' }
  const badge = (ok: boolean | null, text: string) => (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap',
      color: ok == null ? 'var(--text-muted)' : ok ? 'var(--green)' : 'var(--red)', border: `1px solid ${ok == null ? 'var(--border)' : ok ? 'var(--green)' : 'var(--red)'}` }}>{text}</span>
  )
  const head = (title: string, cycle: string, saves: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700 }}>{cycle}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{saves}</div>
    </div>
  )
  const jobLine = (j: Job | undefined) => {
    if (!j) return <div style={{ fontSize: 12, color: 'var(--orange)' }}>자동 실행이 아직 설정되지 않았어요</div>
    const last = j.runs[0], nx = nextRun(j.schedule)
    return (
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginBottom: 6 }}>
        <span>마지막 실행 <b>{t(last?.start)}</b> <span style={{ color: 'var(--text-muted)' }}>{ago(last?.start)}</span> {last && badge(last.status === 'succeeded', last.status === 'succeeded' ? '성공' : last.status)}</span>
        <span>다음 예정 <b>{t(nx)}</b> <span style={{ color: 'var(--text-muted)' }}>{until(nx)}</span></span>
        {!j.active && badge(false, '꺼짐')}
      </div>
    )
  }

  const sched = job('update-schedule-random')
  const leagues = [...new Set((s?.schedules ?? []).map(r => r.league))]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 12px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 760, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>업데이트 현황</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Supabase가 자동으로 모으는 데이터 · 지금 {t(s?.now)}</span>
          <button onClick={load} title="새로고침" style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> 새로고침
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{/analysis_update_status|function/i.test(err) ? 'Supabase 쪽 자동 수집 설정이 아직 반영되지 않았어요 (supabase/cron_collect.sql).' : `현황을 못 불러왔어요: ${err}`}</div>}
        {!s && !err && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중…</div>}
        {s && <>
          {/* 경기 일정 */}
          <div style={box}>
            {head('경기 일정', '약 1시간마다 (40~80분 랜덤)', 'NBA·KBL·WKBL·V리그 남·여 오늘·내일 경기 → 분석 탭 일정, 베팅추가 경기 목록 · 일주일 지난 일정은 자동 삭제')}
            {jobLine(sched)}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>리그</th><th style={th}>날짜별 경기 수</th><th style={th}>마지막 결과</th><th style={th}>받은 시각</th></tr></thead>
              <tbody>{leagues.map(lg => {
                const rs = s.schedules.filter(r => r.league === lg)
                const res = s.schedule_last?.body?.find(b => b.league === lg)
                return (
                  <tr key={lg}>
                    <td style={td}><b>{lg}</b></td>
                    <td style={td}>{rs.map(r => `${dayjs(r.game_date).format('M/D')} ${r.games}경기`).join(' · ')}</td>
                    <td style={td}>{res ? (res.error ? badge(false, '실패') : badge(true, '성공')) : '–'}{res?.error && <div style={{ fontSize: 10, color: 'var(--red)' }}>{res.error.slice(0, 80)}</div>}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{t(rs[0]?.fetched_at)} <span style={{ color: 'var(--text-muted)' }}>{ago(rs[0]?.fetched_at)}</span></td>
                  </tr>
                )
              })}</tbody>
            </table>
            {sched && sched.runs.length > 1 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>최근 실행: {sched.runs.map(r => dayjs(r.start).format('HH:mm')).join(' · ')}</div>
            )}
          </div>

          {/* 승패 배당 */}
          <div style={box}>
            {head('승패 배당', '리그마다 따로 30분~2시간 랜덤', 'NBA = Action Network(9개 북 평균·오픈·티켓%), 국내 = BetExplorer 평균배당 · 오늘·내일 경기 없으면 건너뜀 · 국내 리그끼리 3분 이상 띄움 · 바뀌었을 때만 저장, 7일 지나면 삭제')}
            {!s.odds_jobs.length ? <div style={{ fontSize: 12, color: 'var(--orange)' }}>자동 실행이 아직 설정되지 않았어요</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>리그</th><th style={th}>마지막 수집</th><th style={th}>결과</th><th style={th}>다음 예정</th><th style={th}>오늘~ 기록</th></tr></thead>
                <tbody>{s.odds_jobs.map(o => {
                  const n = o.last?.note ?? {}
                  const st = o.last?.status
                  const um = (n.unmatched as string[] | undefined) ?? []
                  return (
                    <tr key={o.league}>
                      <td style={td}><b>{o.league}</b></td>
                      <td style={td}>{t(o.last?.at ?? o.last_request_at)} <span style={{ color: 'var(--text-muted)' }}>{ago(o.last?.at ?? o.last_request_at)}</span></td>
                      <td style={td}>
                        {!st ? '–' : st === 'ok' ? <>{badge(true, '성공')} <span style={{ fontSize: 11 }}>경기 {String(n.matched ?? 0)}/{String(n.games ?? 0)} · 변동 {String(n.changed ?? 0)}</span></>
                          : st === 'skipped' ? badge(null, '경기 없음') : st === 'blocked' ? badge(false, '차단(429)') : badge(false, '오류')}
                        {um.length > 0 && <div style={{ fontSize: 10, color: 'var(--orange)' }}>짝 못 지음: {um.join(', ')}</div>}
                        {o.deferred > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>다른 리그와 겹쳐서 {o.deferred}번 미룸</div>}
                      </td>
                      <td style={td}>{t(o.next_at)} <span style={{ color: 'var(--text-muted)' }}>{until(o.next_at)}</span></td>
                      <td style={td}>{o.snapshots}건</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </div>

          {/* 선수 기록 */}
          <div style={box}>
            {head('선수 경기 기록', 'NBA 매일 18~19시 · 국내 매일 03~04시 (분 랜덤)', '끝난 경기 박스스코어(V리그는 시즌 누적 하루 차이) → 오버롤 체급·최근폼 · 지난 시즌까지만 보관')}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ flex: '1 1 260px' }}><div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>NBA</div>{jobLine(job('collect-stats-nba'))}</div>
              <div style={{ flex: '1 1 260px' }}><div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>국내 (KBL·WKBL·V리그)</div>{jobLine(job('collect-stats-domestic'))}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>리그</th><th style={th}>쌓인 경기</th><th style={th}>선수 기록</th><th style={th}>마지막 경기</th><th style={th}>마지막 저장</th></tr></thead>
              <tbody>
                {s.player_stats.map(p => (
                  <tr key={p.league}><td style={td}><b>{LG[p.league] ?? p.league}</b></td><td style={td}>{p.games}경기</td><td style={td}>{p.rows.toLocaleString()}줄</td><td style={td}>{dayjs(p.last_game).format('M/D')}</td><td style={{ ...td, color: 'var(--text-secondary)' }}>{t(p.last_insert)}</td></tr>
                ))}
                {s.kovo_snapshots?.last && (
                  <tr><td style={td}><b>V리그 시즌 누적</b></td><td style={td} colSpan={2}>선수 {s.kovo_snapshots.players}명</td><td style={td}>{dayjs(s.kovo_snapshots.last).format('M/D')}</td><td style={td}></td></tr>
                )}
                {!s.player_stats.length && <tr><td style={td} colSpan={5}>아직 쌓인 기록이 없어요</td></tr>}
              </tbody>
            </table>
          </div>

          {/* 오버롤 분석 */}
          <div style={box}>
            {head('오버롤 분석', '자동 실행 없음 (채팅에서 요청할 때)', '선수 체급·최근폼 → 시뮬레이션 → 분석 탭 오른쪽 칸')}
            <div style={{ fontSize: 12 }}>{s.analyses.length ? s.analyses.map(a => `${LG[a.league] ?? a.league} ${a.count}건 (마지막 ${t(a.last)})`).join(' · ') : '아직 없음'}</div>
          </div>
        </>}
      </div>
    </div>
  )
}

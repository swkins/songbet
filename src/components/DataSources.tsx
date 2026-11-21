import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'

// ─── 업데이트 현황 맨 위 '데이터 출처 · 신뢰도' 그리드 (2026-11-22 사용자 요청) ─────
// 출처마다 한 줄: 종목 · 데이터 · 출처(주소) · 신뢰도 · 마지막 성공 · 최근 24시간 성공/차단/오류 · 확인할 것(⚠ 마우스 = 설명).
// 데이터: rpc data_sources_health (supabase/data_sources.sql). 신뢰도는 여기서 계산 (`reliability`).

interface Logs { ok24?: number; blocked24?: number; error24?: number; skipped24?: number; last_ok?: string | null; last_at?: string | null; last_status?: string | null; unmatched?: number }
interface Row { sport: string; kind: string; source: string; url: string; every_min: number; last_ok: string | null; logs: Logs | null; upcoming: number | null; note: string | null }
type Level = 'high' | 'mid' | 'low' | 'wait' | 'idle'

const LEVEL: Record<Level, { label: string; color: string; bg: string }> = {
  high: { label: '높음', color: 'var(--green)', bg: 'transparent' },
  mid: { label: '보통', color: 'var(--gold)', bg: 'transparent' },
  low: { label: '낮음', color: 'var(--red)', bg: 'rgba(248,113,113,0.07)' },
  wait: { label: '대기', color: 'var(--blue)', bg: 'transparent' },
  idle: { label: '경기 없음', color: 'var(--text-muted)', bg: 'transparent' },
}
const ago = (v?: string | null) => {
  if (!v) return '–'
  const m = Math.round((Date.now() - Date.parse(v)) / 60000)
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`
}
const dur = (min: number) => min < 60 ? `${min}분` : min < 1440 ? `${Math.round(min / 60)}시간` : min >= 100000 ? '수동' : `${Math.round(min / 1440)}일`

/** 신뢰도: 최근 24시간 성공률(건너뜀 제외) · 마지막 성공이 기대 주기보다 얼마나 오래됐나 · 직전 시도 결과 */
function reliability(r: Row): { level: Level; warns: string[] } {
  const L = r.logs ?? {}
  const ok = L.ok24 ?? 0, bad = (L.blocked24 ?? 0) + (L.error24 ?? 0)
  const rate = ok + bad > 0 ? ok / (ok + bad) : null
  const last = r.last_ok ?? L.last_ok ?? null
  const age = last ? (Date.now() - Date.parse(last)) / 60000 : Infinity
  const warns: string[] = []
  if (L.blocked24) warns.push(`최근 24시간 차단(429) ${L.blocked24}번`)
  if (L.error24) warns.push(`최근 24시간 오류 ${L.error24}번`)
  if (L.last_status === 'blocked' || L.last_status === 'error') warns.push(`직전 시도 ${L.last_status === 'blocked' ? '차단' : '오류'}`)
  if (L.unmatched && !/BetExplorer/.test(r.source)) warns.push(`팀 이름을 못 맞춘 것 ${L.unmatched}건 (일정에 영어 이름으로 나옴)`)
  if (r.every_min < 100000 && age > r.every_min * 1.5 && age !== Infinity) warns.push(`마지막 성공이 ${ago(last)} — 보통 ${dur(r.every_min)}마다 들어옴`)
  // 아직 데이터 없음: 요청은 성공하는데 저장된 값이 없음 (예: 배당이 아직 안 붙음)
  if (!last && ok > 0) return { level: 'wait', warns: [...warns, '요청은 성공했지만 아직 저장된 값이 없음 (배당이 아직 안 붙었을 수 있음)'] }
  if (!last) return { level: 'low', warns: [...warns, '받은 기록이 없음'] }
  const staleOnly = rate == null || rate >= 0.9
  if (r.upcoming === 0 && staleOnly && age > r.every_min * 1.5) return { level: 'idle', warns }
  if ((rate != null && rate < 0.6) || (r.every_min < 100000 && age > r.every_min * 3)) return { level: 'low', warns }
  if ((rate != null && rate < 0.9) || (r.every_min < 100000 && age > r.every_min * 1.5) || L.last_status === 'blocked' || L.last_status === 'error') return { level: 'mid', warns }
  return { level: 'high', warns }
}

export default function DataSources({ reloadKey }: { reloadKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('data_sources_health').then(({ data, error }) => {
      if (error) setErr(error.message); else { setRows(((data as { rows: Row[] })?.rows) ?? []); setErr(null) }
    })
  }, [reloadKey])

  const cols = '46px minmax(0, 1.1fr) minmax(0, 1.4fr) 64px 76px 92px 26px'
  const head: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 6px', borderBottom: '1px solid var(--border)' }
  const cell: React.CSSProperties = { fontSize: 12, padding: '5px 6px', borderBottom: '1px solid var(--border-light)', minWidth: 0, display: 'flex', alignItems: 'center' }
  const counts = rows ? rows.map(reliability).reduce((m, x) => ({ ...m, [x.level]: (m[x.level] ?? 0) + 1 }), {} as Record<string, number>) : {}

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: 'var(--bg-elevated)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>데이터 출처 · 신뢰도</span>
        {rows && (Object.keys(LEVEL) as Level[]).filter(k => counts[k]).map(k => (
          <span key={k} style={{ fontSize: 11, fontWeight: 700, color: LEVEL[k].color }}>{LEVEL[k].label} {counts[k]}</span>
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>신뢰도 = 최근 24시간 성공률 · 마지막 성공 시각 · 직전 결과 — ⚠ 마우스를 올리면 설명</span>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>출처 현황을 못 불러왔어요: {err}</div>}
      {!rows && !err && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>불러오는 중…</div>}
      {rows && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, overflowX: 'auto' }}>
          {['종목', '데이터', '출처', '신뢰도', '마지막 성공', '24시간 성공·차단·오류', ''].map((h, i) => <div key={i} style={head}>{h}</div>)}
          {rows.map((r, i) => {
            const { level, warns } = reliability(r)
            const lv = LEVEL[level]
            const L = r.logs
            const tip = [...warns.map(w => `⚠ ${w}`), r.note ? `ⓘ ${r.note}` : '', `주소: ${r.url}`, `보통 ${dur(r.every_min)}마다`].filter(Boolean).join('\n')
            const warn = warns.length > 0
            const bg = { background: lv.bg }
            return [
              <div key={`${i}a`} style={{ ...cell, ...bg, color: 'var(--text-secondary)', fontWeight: 700 }}>{r.sport}</div>,
              <div key={`${i}b`} style={{ ...cell, ...bg, fontWeight: 700 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.kind}</span></div>,
              <div key={`${i}c`} style={{ ...cell, ...bg, flexDirection: 'column', alignItems: 'flex-start', gap: 1 }} title={r.url}>
                <span style={{ fontWeight: 700 }}>{r.source}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{r.url}</span>
              </div>,
              <div key={`${i}d`} style={{ ...cell, ...bg }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 8, color: lv.color, border: `1px solid ${lv.color}`, whiteSpace: 'nowrap' }}>{lv.label}</span>
              </div>,
              <div key={`${i}e`} style={{ ...cell, ...bg, color: 'var(--text-secondary)' }} title={r.last_ok ? dayjs(r.last_ok).format('M/D HH:mm') : ''}>{ago(r.last_ok ?? L?.last_ok)}</div>,
              <div key={`${i}f`} style={{ ...cell, ...bg, fontFamily: 'var(--font-num)', gap: 4 }}>
                {L ? <>
                  <span style={{ color: 'var(--green)' }}>{L.ok24 ?? 0}</span>·
                  <span style={{ color: L.blocked24 ? 'var(--orange)' : 'var(--text-muted)' }}>{L.blocked24 ?? 0}</span>·
                  <span style={{ color: L.error24 ? 'var(--red)' : 'var(--text-muted)' }}>{L.error24 ?? 0}</span>
                  {!!L.skipped24 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title="건너뜀 (경기 없음·365Scores 배당 있음 등)">+{L.skipped24}</span>}
                </> : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>기록 없음</span>}
              </div>,
              <div key={`${i}g`} style={{ ...cell, ...bg, justifyContent: 'center' }} title={tip}>
                <span style={{ cursor: 'help', fontWeight: 900, fontSize: 13, color: warn ? (level === 'low' ? 'var(--red)' : 'var(--orange)') : 'var(--text-muted)' }}>{warn ? '⚠' : 'ⓘ'}</span>
              </div>,
            ]
          })}
        </div>
      )}
    </div>
  )
}

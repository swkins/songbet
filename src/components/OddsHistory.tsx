import dayjs from 'dayjs'
import { fmtLine, type OddsSnap, type OddsLine } from '../lib/odds'

// 오른쪽 분석 칸 — 승패 배당 시간대별 변동표 (바뀐 기록만 쌓임)
const SRC: Record<string, string> = { actionnetwork: 'Action Network 9개 북 평균', betexplorer: 'BetExplorer 평균배당', 'espn-draftkings': 'ESPN · DraftKings' }

export function Arrow({ d }: { d: number }) {
  if (!d) return null
  return <span style={{ fontSize: 9, marginLeft: 2, color: d < 0 ? 'var(--green)' : 'var(--red)' }}>{d < 0 ? '▼' : '▲'}</span>
}

export default function OddsHistory({ list, homeName, awayName, compact }: { list: OddsSnap[]; homeName: string; awayName: string; compact?: boolean }) {
  const last = list[list.length - 1]
  const hasOpen = last.open_home != null
  const hasDraw = list.some(r => r.draw_odds != null)   // 축구 승무패
  const rows = [...list].reverse()
  const th: React.CSSProperties = { textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)' }
  const cell = (v: number | null, prev: number | null | undefined) => (
    <td style={{ ...td, fontWeight: 700 }}>{v?.toFixed(2) ?? '–'}{v != null && prev != null && <Arrow d={+(v - prev).toFixed(2)} />}</td>
  )
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)', marginTop: compact ? 0 : 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{hasDraw ? '승무패' : '승패'} 배당 변동</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{SRC[last.source] ?? last.source}{last.books ? ` (${last.books}곳)` : ''}{compact ? '' : ' · 바뀐 때만 기록 · 해외 기준이라 사이트 배당과 다를 수 있음'}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>시각</th>
          <th style={th}>{compact ? homeName : `홈 · ${homeName}`}</th>{hasDraw && <th style={th}>무</th>}<th style={th}>{compact ? awayName : `원정 · ${awayName}`}</th>
          {last.home_tickets != null && <th style={th}>{compact ? '홈%' : '홈 티켓%'}</th>}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1]
            return (
              <tr key={r.id}>
                <td style={{ ...td, textAlign: 'left', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{dayjs(r.fetched_at).format('M/D HH:mm')}</td>
                {cell(r.home_odds, prev?.home_odds)}{hasDraw && cell(r.draw_odds ?? null, prev?.draw_odds)}{cell(r.away_odds, prev?.away_odds)}
                {last.home_tickets != null && <td style={td}>{r.home_tickets != null ? `${r.home_tickets}%` : '–'}</td>}
              </tr>
            )
          })}
          {hasOpen && (
            <tr>
              <td style={{ ...td, textAlign: 'left', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>오픈</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{last.open_home?.toFixed(2)}</td>
              {hasDraw && <td style={{ ...td, color: 'var(--text-muted)' }}>{last.open_draw?.toFixed(2)}</td>}
              <td style={{ ...td, color: 'var(--text-muted)' }}>{last.open_away?.toFixed(2)}</td>
              {last.home_tickets != null && <td style={td}></td>}
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>▼ 내려감(돈 몰림) · ▲ 올라감{compact ? ' · 바뀐 때만 기록, 해외 기준' : ''}</div>
    </div>
  )
}

// NBA 핸디·언오버 기준점 변경 히스토리 (odds_lines — 바뀐 때만 한 줄, 맨 위 = 현재) — 사용자 요청 2026-11-21
// 기준점 = 북마다 양쪽 배당이 거의 같은 주력 라인 중 가장 많은 것. 핸디는 홈 기준 (-12.5 = 홈 마핸 12.5)
export function LineHistory({ list, homeName, awayName }: { list: OddsLine[]; homeName: string; awayName: string }) {
  const th: React.CSSProperties = { textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)' }
  const part = (market: 'spread' | 'total') => {
    const rows = list.filter(l => l.market === market).reverse()
    if (!rows.length) return null
    const open = rows[0].open_line != null ? rows[0] : null
    const sp = market === 'spread'
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 6 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>{sp ? '핸디' : '언오버'} · 시각</th>
          <th style={th}>{sp ? `기준점 (홈 ${homeName})` : '기준점'}</th>
          <th style={th}>{sp ? homeName : '오버'}</th><th style={th}>{sp ? awayName : '언더'}</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1]
            const moved = prev && prev.line !== r.line
            return (
              <tr key={r.id}>
                <td style={{ ...td, textAlign: 'left', color: i === 0 ? 'var(--gold)' : 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: i === 0 ? 700 : 400 }}>{i === 0 ? '현재 · ' : ''}{dayjs(r.fetched_at).format('M/D HH:mm')}{r.source === 'actionnetwork-close' ? ' (마감)' : ''}</td>
                <td style={{ ...td, fontWeight: 800, color: moved ? 'var(--gold)' : undefined }}>{sp ? fmtLine(r.line) : r.line}{moved && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 3 }}>← {sp ? fmtLine(prev.line) : prev.line}</span>}</td>
                <td style={td}>{r.home_odds?.toFixed(2) ?? '–'}</td><td style={td}>{r.away_odds?.toFixed(2) ?? '–'}</td>
              </tr>
            )
          })}
          {open && (
            <tr>
              <td style={{ ...td, textAlign: 'left', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>오픈</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{sp ? fmtLine(open.open_line!) : open.open_line}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{open.open_home?.toFixed(2) ?? '–'}</td><td style={{ ...td, color: 'var(--text-muted)' }}>{open.open_away?.toFixed(2) ?? '–'}</td>
            </tr>
          )}
        </tbody>
      </table>
    )
  }
  if (!list.length) return null
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>기준점 변동</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Action Network 북 주력 라인 · 바뀐 때만 기록</span>
      </div>
      {part('spread')}{part('total')}
    </div>
  )
}

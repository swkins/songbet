import dayjs from 'dayjs'
import type { OddsSnap } from '../lib/odds'

// 오른쪽 분석 칸 — 승패 배당 시간대별 변동표 (바뀐 기록만 쌓임)
const SRC: Record<string, string> = { actionnetwork: 'Action Network 9개 북 평균', betexplorer: 'BetExplorer 평균배당' }

export function Arrow({ d }: { d: number }) {
  if (!d) return null
  return <span style={{ fontSize: 9, marginLeft: 2, color: d < 0 ? 'var(--green)' : 'var(--red)' }}>{d < 0 ? '▼' : '▲'}</span>
}

export default function OddsHistory({ list, homeName, awayName }: { list: OddsSnap[]; homeName: string; awayName: string }) {
  const last = list[list.length - 1]
  const hasOpen = last.open_home != null
  const rows = [...list].reverse()
  const th: React.CSSProperties = { textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 6px', fontSize: 10, borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)' }
  const cell = (v: number | null, prev: number | null | undefined) => (
    <td style={{ ...td, fontWeight: 700 }}>{v?.toFixed(2) ?? '–'}{v != null && prev != null && <Arrow d={+(v - prev).toFixed(2)} />}</td>
  )
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>승패 배당 변동</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{SRC[last.source] ?? last.source}{last.books ? ` (${last.books}곳)` : ''} · 바뀐 때만 기록 · 해외 기준이라 사이트 배당과 다를 수 있음</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>시각</th>
          <th style={th}>홈 · {homeName}</th><th style={th}>원정 · {awayName}</th>
          {last.home_tickets != null && <th style={th}>홈 티켓%</th>}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1]
            return (
              <tr key={r.id}>
                <td style={{ ...td, textAlign: 'left', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{dayjs(r.fetched_at).format('M/D HH:mm')}</td>
                {cell(r.home_odds, prev?.home_odds)}{cell(r.away_odds, prev?.away_odds)}
                {last.home_tickets != null && <td style={td}>{r.home_tickets != null ? `${r.home_tickets}%` : '–'}</td>}
              </tr>
            )
          })}
          {hasOpen && (
            <tr>
              <td style={{ ...td, textAlign: 'left', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>오픈</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{last.open_home?.toFixed(2)}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{last.open_away?.toFixed(2)}</td>
              {last.home_tickets != null && <td style={td}></td>}
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>▼ 배당 내려감(그쪽으로 돈이 몰림) · ▲ 올라감</div>
    </div>
  )
}

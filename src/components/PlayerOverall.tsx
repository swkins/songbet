import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { koName, type ScheduleTeam } from '../lib/gameSchedule'
import { loadGameOverall, tierOf, availColor, TIERS, type TeamOv, type PlayerOv } from '../lib/playerOverall'

// ─── 분석 탭 오른쪽 칸: 양 팀 핵심·주전 선수 오버롤 + 출전 확률 ─────
// 출전 색: 초록(90%↑) · 연두(70~89) · 노랑(40~69) · 빨강(1~39) · 진한 빨강+취소선(결장 확정)
// 오버롤 색: WoW 등급 — 전설 주황 · 영웅 보라 · 희귀 파랑 · 일반 흰색 · 하급 회색

const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)' }
const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 5px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '4px 5px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontSize: 12 }

function Ov({ v, size = 13 }: { v: number | null; size?: number }) {
  const t = tierOf(v)
  if (v == null || !t) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>–</span>
  return <span title={t.name} style={{ color: t.color, fontWeight: 800, fontSize: size, fontFamily: 'var(--font-num)' }}>{v}</span>
}

function AvailCell({ p }: { p: PlayerOv }) {
  const a = p.avail, c = availColor(a.prob)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0 }} />
      <span style={{ color: c, fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-num)' }}>{a.prob}%</span>
    </span>
  )
}

function TeamTable({ title, t }: { title: string; t: TeamOv }) {
  return (
    <div style={{ ...box, flex: '1 1 320px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{title}</span>
        {t.full != null && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            팀 오버롤 <Ov v={Math.round(t.full)} size={12} /> → 결장 반영 <Ov v={t.exp == null ? null : Math.round(t.exp)} size={12} />
          </span>
        )}
      </div>
      {!t.team ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>이 팀 선수 기록을 아직 못 찾았어요</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>출전</th><th style={th}>선수</th>
            <th style={{ ...th, textAlign: 'right' }}>체급</th><th style={{ ...th, textAlign: 'right' }}>폼</th><th style={{ ...th, textAlign: 'right' }}>오버롤</th>
          </tr></thead>
          <tbody>{t.players.map(p => {
            const a = p.avail, out = a.prob === 0
            const tier = tierOf(p.overall)
            return (
              <tr key={p.id} style={{ opacity: out ? 0.6 : 1 }}>
                <td style={td}><AvailCell p={p} /></td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span title={p.baseNote} style={{ fontWeight: 700, textDecoration: out ? 'line-through' : undefined, textDecorationColor: '#B3001B' }}>{p.name}</span>
                    {p.min != null && p.gp > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{Math.round(p.min)}분</span>}
                    {(a.origin !== 'none' || a.label !== '출전') && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 8, border: `1px solid ${availColor(a.prob)}`, color: availColor(a.prob) }}>
                        {a.label}{a.origin === 'news' ? (a.confirmed ? ' · 확정' : ' · 추정') : ''}
                      </span>
                    )}
                    {a.ret && <span style={{ fontSize: 10, color: '#A3E635' }}>↩ 복귀</span>}
                    {a.limited && <span style={{ fontSize: 10, fontWeight: 700, color: '#FACC15' }}>⏱ 출전 제한 가능</span>}
                  </div>
                  {a.ret && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.ret}</div>}
                  {a.reason && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{a.reason}</div>}
                  {a.source && (a.source.title || a.source.url) && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {a.source.url ? <a href={a.source.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>{a.source.title || '기사'}</a> : a.source.title}
                      {a.checkedAt && ` · ${dayjs(a.checkedAt).format('M/D HH:mm')}`}
                    </div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-num)' }} title={p.baseNote}>{p.base ?? '–'}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-num)', color: p.form == null || p.base == null ? 'var(--text-muted)' : p.form > p.base + 2 ? 'var(--green)' : p.form < p.base - 2 ? 'var(--red)' : 'var(--text-secondary)' }}>{p.form ?? '–'}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Ov v={p.overall} />
                  {tier && <div style={{ fontSize: 9, color: tier.color, opacity: 0.85 }}>{tier.name}</div>}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      )}
    </div>
  )
}

export default function PlayerOverall({ league, gameDate, home, away }: { league: string; gameDate: string; home: ScheduleTeam; away: ScheduleTeam }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadGameOverall>> | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setData(undefined); setErr(null)
    loadGameOverall(league, gameDate, home, away).then(setData).catch(e => setErr(String(e?.message ?? e)))
  }, [league, gameDate, home.name, away.name])

  if (err) return <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>선수 오버롤을 못 불러왔어요: {err}</div>
  if (data === undefined) return <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>선수 오버롤 계산 중…</div>
  if (!data) return null
  const diff = data.home.exp != null && data.away.exp != null ? Math.round((data.home.exp - data.away.exp) * 10) / 10 : null
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>선수 오버롤 · 출전 확률</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {data.checkedAt ? `뉴스 확인 ${dayjs(data.checkedAt).format('M/D HH:mm')}` : '뉴스 확인 전'}
          {diff != null && <> · 결장 반영 팀 오버롤 차이 <b style={{ color: diff >= 0 ? 'var(--gold)' : 'var(--blue)' }}>{diff >= 0 ? `홈 +${diff}` : `원정 +${-diff}`}</b></>}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TeamTable title={`홈 · ${koName(home.name)}`} t={data.home} />
        <TeamTable title={`원정 · ${koName(away.name)}`} t={data.away} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        오버롤 = 체급 × 0.7 + 최근 5경기 폼 × 0.3 (체급 = 이번 시즌 + 지난 시즌, 경기가 쌓일수록 이번 시즌 비중↑) ·{' '}
        {TIERS.map(t => <span key={t.name} style={{ color: t.color, marginRight: 6 }}>{t.name} {t.min >= 0 ? `${t.min}+` : '~59'}</span>)}
        <br />출전: <span style={{ color: availColor(95) }}>● 90%↑</span> <span style={{ color: availColor(80) }}>● 70~89</span> <span style={{ color: availColor(50) }}>● 40~69</span> <span style={{ color: availColor(20) }}>● 1~39</span> <span style={{ color: availColor(0) }}>● 결장</span>
        {' '}· 확정/추정 = Claude가 뉴스·ESPN 명단을 읽고 판단 · ↩ 복귀·⏱ 출전 제한 = 경기 기록 · 팀 오버롤 결장 반영 = 결장 확률만큼 대체 선수(50)로
      </div>
    </div>
  )
}

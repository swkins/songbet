import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { loadPinFair, minOddsFor, impliedScore, type PinFair, type PinPrice } from '../lib/fairOdds'
import { koName } from '../lib/gameSchedule'

// 축구 분석 칸: 피나클 공정 배당 (2026-11-28 사용자 요청 — 롤링 위주, 손실이 적은 베팅 고르기)
// 옵션마다 적중 확률(피나클 마진 뺀 값)·공정 배당·"손실 3% 이내" 최소 배당. 사이트 배당이 그 이상이면 롤링하기 괜찮은 가격.
const LOSS = 0.03

export default function PinFairBox({ gameId, home, away }: { gameId: string; home: { name?: string }; away: { name?: string } }) {
  const [f, setF] = useState<PinFair | null | undefined>(undefined)
  useEffect(() => {
    let off = false
    setF(undefined)
    loadPinFair([gameId]).then(m => { if (!off) setF(m[gameId] ?? null) }).catch(() => { if (!off) setF(null) })
    return () => { off = true }
  }, [gameId])
  if (f === undefined) return null
  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)', marginTop: 10 }
  if (!f) return <div style={{ ...box, fontSize: 12, color: 'var(--text-muted)' }}>피나클 공정 배당 — 아직 수집 전 (5대 리그만, 40~100분마다)</div>

  const H = koName(home.name), A = koName(away.name)
  const rows: { label: string; pr: PinPrice }[] = []
  if (f.ml) rows.push({ label: `${H} 승리`, pr: f.ml.home }, { label: '무승부', pr: f.ml.draw }, { label: `${A} 승리`, pr: f.ml.away })
  const sp = Object.entries(f.spread).map(([k, v]) => [Number(k), v] as const).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]) || a[0] - b[0])
  for (const [l, v] of sp) {
    const s = (x: number) => (x > 0 ? `+${x}` : String(x))
    rows.push({ label: `${H} ${s(l)}`, pr: v.home }, { label: `${A} ${s(-l)}`, pr: v.away })
  }
  for (const [l, v] of Object.entries(f.total).sort((a, b) => Number(a[0]) - Number(b[0])))
    rows.push({ label: `${l} 오버`, pr: v.over }, { label: `${l} 언더`, pr: v.under })

  const th: React.CSSProperties = { padding: '4px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '4px 6px', fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' }
  const move = (pr: PinPrice) => {
    if (!pr.open || !Number.isFinite(pr.odds) || pr.open === pr.odds) return null
    const down = pr.odds < pr.open
    return <span style={{ fontSize: 10, marginLeft: 4, color: down ? 'var(--red)' : 'var(--green)' }}>{down ? '▼' : '▲'}{pr.open.toFixed(2)}</span>
  }
  const sc = impliedScore(f)
  const tile: React.CSSProperties = { flex: '1 1 90px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', textAlign: 'center' }
  return (
    <div style={box}>
      {sc && <>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>예상 스코어</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>피나클 배당 기준 (승무패·2.5 오버에 맞춘 기대 득점) — 우리 모델 아님</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={tile}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>기대 득점</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)' }}>{sc.lh.toFixed(2)} : {sc.la.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{H} : {A}</div>
          </div>
          {sc.top.map((t, i) => (
            <div key={`${t.h}-${t.a}`} style={{ ...tile, borderColor: i === 0 ? 'var(--gold-border)' : 'var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{i === 0 ? '가장 유력' : `${i + 1}순위`}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)', color: i === 0 ? 'var(--gold)' : undefined }}>{t.h} : {t.a}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(t.p * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>피나클 공정 배당</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{dayjs(f.fetched_at).format('M/D HH:mm')} 기준 · 승무패 마진 {(f.margin * 100).toFixed(1)}%</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>옵션</th>
            <th style={th}>적중 확률</th>
            <th style={th} title="이 배당이면 기대 손익 0 (본전)">공정 배당</th>
            <th style={th} title={`사이트 배당이 이 이상이면 기대 손실 ${LOSS * 100}% 이내`}>손실 {LOSS * 100}% 이내</th>
            <th style={th} title="피나클 현재 배당 (▼▲ = 처음 받은 배당 대비)">피나클</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)' }}>{r.label}</td>
                <td style={td}>{(r.pr.p * 100).toFixed(1)}%</td>
                <td style={{ ...td, fontWeight: 700 }}>{r.pr.fair.toFixed(2)}</td>
                <td style={{ ...td, color: 'var(--gold)' }}>{minOddsFor(r.pr.p, LOSS).toFixed(2)}↑</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{Number.isFinite(r.pr.odds) ? r.pr.odds.toFixed(2) : '–'}{move(r.pr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        적중 확률 = 피나클 배당에서 마진을 뺀 값. 사이트 배당이 '손실 {LOSS * 100}% 이내' 이상이면 롤링하기 괜찮은 가격, 공정 배당 이상이면 기대수익 플러스.
      </div>
    </div>
  )
}

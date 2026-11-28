import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { loadPinFair, minOddsFor, impliedScore, loadModelScore, type PinFair, type PinPrice, type ModelScore } from '../lib/fairOdds'
import { koName } from '../lib/gameSchedule'

// 축구 분석 칸: 피나클 공정 배당 (2026-11-28 사용자 요청 — 롤링 위주, 손실이 적은 베팅 고르기)
// 옵션마다 적중 확률(피나클 마진 뺀 값)·공정 배당·"손실 3% 이내" 최소 배당. 사이트 배당이 그 이상이면 롤링하기 괜찮은 가격.
const LOSS = 0.03

export default function PinFairBox({ gameId, league, home, away }: { gameId: string; league?: string; home: { name?: string; full?: string | null }; away: { name?: string; full?: string | null } }) {
  const [f, setF] = useState<PinFair | null | undefined>(undefined)
  const [ms, setMs] = useState<ModelScore | null>(null)
  useEffect(() => {
    let off = false; setMs(null)
    if (league) loadModelScore(league, home.full, away.full).then(m => { if (!off) setMs(m) }).catch(() => {})
    return () => { off = true }
  }, [gameId, league, home.full, away.full])
  useEffect(() => {
    let off = false
    setF(undefined)
    loadPinFair([gameId]).then(m => { if (!off) setF(m[gameId] ?? null) }).catch(() => { if (!off) setF(null) })
    return () => { off = true }
  }, [gameId])
  if (f === undefined) return null
  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)', marginTop: 10 }
  if (!f) return <div style={box}>
    {ms && <ModelBlock ms={ms} H={koName(home.name)} A={koName(away.name)} />}
    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>피나클 공정 배당 — 아직 수집 전 (5대 리그만)</div>
  </div>

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
      {ms && <ModelBlock ms={ms} H={H} A={A} f={f} />}
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
      <OddsFlow f={f} H={H} A={A} />
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        적중 확률 = 피나클 배당에서 마진을 뺀 값. 사이트 배당이 '손실 {LOSS * 100}% 이내' 이상이면 롤링하기 괜찮은 가격, 공정 배당 이상이면 기대수익 플러스.
      </div>
    </div>
  )
}

// 배당 흐름 (2026-11-28 사용자 요청): 피나클 승무패가 바뀐 기록 — 맨 위 = 지금, 오픈 대비 확률 변화, 한 번에 2%p 이상 움직인 줄은 강조
const BIG = 0.02
function OddsFlow({ f, H, A }: { f: PinFair; H: string; A: string }) {
  const hs = f.history
  if (!hs.length) return null
  const o = hs[0], n = hs[hs.length - 1]
  const pp = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%p`
  const dh = n.ph - o.ph, da = n.pa - o.pa
  const fav = n.ph >= n.pa ? 'home' : 'away'
  const toward = Math.abs(dh) < 0.005 && Math.abs(da) < 0.005 ? null : (dh > da ? H : A)
  const col = (x: number) => (Math.abs(x) < 0.005 ? 'var(--text-muted)' : x > 0 ? 'var(--green)' : 'var(--red)')
  const td: React.CSSProperties = { padding: '3px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' }
  const rows = [...hs].reverse().slice(0, 12)
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>배당 흐름</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {dayjs(o.t).format('M/D HH:mm')} 처음 받음 · 바뀐 횟수 {hs.length - 1}번
        </span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 4 }}>
        오픈 → 지금: {H} <b style={{ color: col(dh) }}>{(o.ph * 100).toFixed(1)}% → {(n.ph * 100).toFixed(1)}% ({pp(dh)})</b>
        {' · '}{A} <b style={{ color: col(da) }}>{(o.pa * 100).toFixed(1)}% → {(n.pa * 100).toFixed(1)}% ({pp(da)})</b>
        {toward && <span style={{ color: 'var(--text-secondary)' }}> — 돈이 <b>{toward}</b> 쪽({(toward === H) === (fav === 'home') ? '정배' : '역배'})으로</span>}
      </div>
      {hs.length > 1 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...td, textAlign: 'left', fontSize: 10, color: 'var(--text-muted)' }}>시각</th>
              <th style={{ ...td, fontSize: 10, color: 'var(--text-muted)' }}>{H}</th>
              <th style={{ ...td, fontSize: 10, color: 'var(--text-muted)' }}>무</th>
              <th style={{ ...td, fontSize: 10, color: 'var(--text-muted)' }}>{A}</th>
              <th style={{ ...td, fontSize: 10, color: 'var(--text-muted)' }}>홈 확률 변화</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const prev = rows[i + 1]
                const ch = prev ? r.ph - prev.ph : 0
                const big = prev && (Math.abs(ch) >= BIG || Math.abs(r.pa - prev.pa) >= BIG)
                return (
                  <tr key={r.t} style={{ borderTop: '1px solid var(--border)', background: big ? 'var(--gold-bg)' : undefined }}>
                    <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)' }}>{i === 0 ? '지금 · ' : ''}{dayjs(r.t).format('M/D HH:mm')}</td>
                    <td style={td}>{r.h.toFixed(2)}</td>
                    <td style={td}>{r.d.toFixed(2)}</td>
                    <td style={td}>{r.a.toFixed(2)}</td>
                    <td style={{ ...td, color: col(ch) }}>{prev ? pp(ch) : '오픈'}{big ? ' ⚡' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 우리 모델 예상 (2026-11-28 사용자 요청): 기대 득점·유력 스코어·승무패 확률, 피나클 공정 확률과 차이 (배당은 모델에 안 들어감)
function ModelBlock({ ms, H, A, f }: { ms: ModelScore; H: string; A: string; f?: PinFair }) {
  const tile: React.CSSProperties = { flex: '1 1 90px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', textAlign: 'center' }
  const diff = (m: number, p?: number) => {
    if (p == null) return null
    const d = m - p
    return <div style={{ fontSize: 10, color: Math.abs(d) < 0.03 ? 'var(--text-muted)' : d > 0 ? 'var(--green)' : 'var(--red)' }}>피나클 {(p * 100).toFixed(1)}% ({d >= 0 ? '+' : ''}{(d * 100).toFixed(1)}%p)</div>
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>우리 모델</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>팀 공격·수비 레이팅(골·유효슈팅) + 홈 이점 — 배당 안 씀. 백테스트상 시장보다 덜 정확해 참고용</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <div style={tile}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>기대 득점</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)' }}>{ms.lh.toFixed(2)} : {ms.la.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>유력 {ms.top[0].h}:{ms.top[0].a} ({(ms.top[0].p * 100).toFixed(1)}%)</div>
        </div>
        {([[`${H} 승`, ms.ph, f?.ml?.home.p], ['무', ms.pd, f?.ml?.draw.p], [`${A} 승`, ms.pa, f?.ml?.away.p], ['2.5 오버', ms.o25, f?.total['2.5']?.over.p]] as [string, number, number | undefined][]).map(([l, m, p]) => (
          <div key={l} style={tile}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)' }}>{(m * 100).toFixed(1)}%</div>
            {diff(m, p)}
          </div>
        ))}
      </div>
    </div>
  )
}

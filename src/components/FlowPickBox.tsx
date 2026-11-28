import { useEffect, useState } from 'react'
import { nbaFlow, type Stars } from '../lib/flowPick'
import { loadPinFair, devig, type PinFair } from '../lib/fairOdds'
import { soccerSignal, LEAGUE_FLOW, type FlowPoint } from '../lib/flowSignal'
import { fmtLine, type OddsLine, type OddsSnap } from '../lib/odds'

// 배당 흐름 추천 칸 (2026-11-28 사용자 요청 — NBA·축구는 배당 흐름만으로 추천). 계산·근거는 src/lib/flowPick.ts
const box: React.CSSProperties = { border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)', marginTop: 10 }
const StarTag = ({ s }: { s: Stars }) => (
  <span style={{ fontSize: 12, fontWeight: 800, color: s >= 2 ? 'var(--green)' : s === 1 ? 'var(--gold)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
    {s ? '★'.repeat(s) : '롤링'}
  </span>
)
const Title = ({ sub }: { sub: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
    <span style={{ fontSize: 13, fontWeight: 800 }}>배당 흐름 추천</span>
    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>
  </div>
)

export function NbaFlowBox({ lines, hName, aName }: { lines?: OddsLine[]; hName: string; aName: string }) {
  const r = nbaFlow(lines)
  if (!r) return <div style={box}><Title sub="핸디 기준점 이동" /><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>기준점 기록이 아직 없습니다.</div></div>
  const nm = (s: 'home' | 'away') => (s === 'home' ? hName : aName)
  const sideTxt = r.side ? `${nm(r.side)} ${fmtLine(r.sideLineNow ?? 0)}` : ''
  return (
    <div style={box}>
      <Title sub={`핸디 기준점 이동만 봄 · 오픈 홈 ${fmtLine(r.open)} → 지금 홈 ${fmtLine(r.now)} (${r.changes}번 바뀜)`} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StarTag s={r.stars} />
        <span style={{ fontSize: 16, fontWeight: 800 }}>
          {r.stars > 0 && r.side ? <>{sideTxt} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{r.verdict}</span></> : r.verdict}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{r.why}</div>
      {r.stars > 0 && r.side && r.sideLineOpen != null && (
        <div style={{ fontSize: 11, marginTop: 4 }}>
          사이트가 아직 오픈 근처(<b>{nm(r.side)} {fmtLine(r.sideLineOpen)}</b>)를 주면 더 유리 — 과거 오픈 기준점으로 걸면 돈 쪽 55~70%.
          지금 기준점({fmtLine(r.sideLineNow ?? 0)})보다 나쁜 기준점이면 패스.
        </div>
      )}
      {r.stars === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          롤링만 할 거면 어느 쪽이든 기대 손실은 사이트 마진만큼 (1.91/1.91이면 약 −4.5%){r.side ? ` — 굳이 고르면 돈이 조금 몰린 ${nm(r.side)} 쪽` : ''}.
        </div>
      )}
    </div>
  )
}

// 축구: 배당이 떨어지는 쪽만 가리키고 세기를 판단 (2026-11-28 사용자 요청 — 베팅 옵션은 사용자가 고름). 계산·근거 src/lib/flowSignal.ts
export function SoccerFlowSignal({ gameId, league, odds, H, A }: { gameId: string; league: string; odds?: OddsSnap[]; H: string; A: string }) {
  const [pin, setPin] = useState<PinFair | null | undefined>(undefined)
  useEffect(() => {
    let off = false; setPin(undefined)
    loadPinFair([gameId]).then(m => { if (!off) setPin(m[gameId] ?? null) }).catch(() => { if (!off) setPin(null) })
    return () => { off = true }
  }, [gameId])
  if (pin === undefined) return null
  // 피나클 변동 기록이 먼저, 없으면 DraftKings(odds_snapshots)
  let src = '피나클'
  let hist: FlowPoint[] = (pin?.history ?? []).map(r => ({ t: r.t, ph: r.ph, pa: r.pa, h: r.h, a: r.a }))
  if (hist.length < 1 && odds?.length) {
    src = 'DraftKings'
    const pt = (t: string, h?: number | null, d?: number | null, a?: number | null): FlowPoint | null => {
      if (!h || !d || !a) return null
      const [ph, , pa] = devig([h, d, a]); return { t, ph, pa, h, a }
    }
    const f = odds[0]
    const open = pt(f.fetched_at, f.open_home, f.open_draw, f.open_away)
    hist = [open, ...odds.map(r => pt(r.fetched_at, r.home_odds, r.draw_odds, r.away_odds))].filter((x): x is FlowPoint => !!x)
  }
  const r = soccerSignal(hist)
  const lg = LEAGUE_FLOW[league]
  const color = !r ? 'var(--text-muted)' : r.level === 'strong' ? 'var(--green)' : r.level === 'signal' ? 'var(--gold)' : r.level === 'trap' ? 'var(--red)' : 'var(--text-muted)'
  const name = r?.side ? (r.side === 'home' ? H : A) : null
  return (
    <div style={{ ...box, marginTop: 10 }}>
      <Title sub={`${src} 승무패 · 오픈 → 지금 (마진 뺀 확률)${lg ? ` · 이 리그 흐름: ${lg.grade} (${lg.note})` : ' · 이 리그 흐름: 검증 전'}`} />
      {!r ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>배당 기록이 아직 없습니다.</div> : <>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color }}>{r.title}</span>
          {name && <span style={{ fontSize: 14, fontWeight: 700 }}>
            돈 쪽: {name} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({r.fav ? '정배' : '역배'})</span>
            {r.oddsOpen && r.oddsNow ? <span style={{ fontSize: 12, fontFamily: 'var(--font-num)', marginLeft: 6 }}>{r.oddsOpen.toFixed(2)} → <b>{r.oddsNow.toFixed(2)}</b></span> : null}
            <span style={{ fontSize: 12, fontFamily: 'var(--font-num)', color, marginLeft: 6 }}>+{(r.dp * 100).toFixed(1)}%p</span>
          </span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{r.why}</div>
        {r.side && <div style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>바뀐 횟수 {r.changes}번{r.streak >= 2 ? ` · 최근 ${r.streak}번 연속 같은 방향` : ''}</span>
          <span style={{ color: 'var(--text-muted)' }}>반대쪽 {(r.other * 100 >= 0 ? '+' : '') + (r.other * 100).toFixed(1)}%p</span>
          {r.retrace && <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ 정점에서 되돌아오는 중 — 흐름이 약해지고 있음</span>}
        </div>}
      </>}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        기준(2021-26 백테스트, 10시간 전 추정): 정배 2%p 미만 노이즈 · 2~5%p 신호(본전 근처) · 5%p+ 강한 신호(+5~16%) / 역배 3.5%p 미만 함정(−10~−12%) · 3.5%p+ 확실한 신호(+6~8%). 실제 사이트 배당이 낮으면 그만큼 빼고 보세요.
      </div>
    </div>
  )
}

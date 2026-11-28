import { nbaFlow, soccerFlow, type Stars } from '../lib/flowPick'
import { minOddsFor, type PinFair } from '../lib/fairOdds'
import { fmtLine, type OddsLine } from '../lib/odds'

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

export function SoccerFlowBox({ f, H, A }: { f: PinFair; H: string; A: string }) {
  const r = soccerFlow(f, H, A)
  if (!r) return null
  const td: React.CSSProperties = { padding: '4px 6px', fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' }
  const th: React.CSSProperties = { ...td, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
  return (
    <div style={{ ...box, marginTop: 0, marginBottom: 10 }}>
      <Title sub="피나클 배당 흐름만 봄 (모델·결장·뉴스 안 씀)" />
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        {r.moneyName
          ? <>돈이 <b>{r.moneyName}</b> 쪽으로 — 오픈 대비 <b style={{ color: 'var(--green)' }}>+{(r.dp * 100).toFixed(1)}%p</b>{r.streak >= 2 ? <> · 최근 <b>{r.streak}번 연속</b> 같은 방향</> : null}</>
          : <span style={{ color: 'var(--text-muted)' }}>뚜렷한 흐름 없음 (오픈 대비 1%p 미만{r.changes ? ` · ${r.changes}번 바뀜` : ''})</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}></th>
            <th style={{ ...th, textAlign: 'left' }}>옵션</th>
            <th style={th} title="피나클 오픈 → 지금 (마진 뺀 확률)">흐름</th>
            <th style={th} title="사이트 배당이 이 이상이면 기대수익 플러스">공정 배당</th>
            <th style={th} title="사이트 배당이 이 이상이면 기대 손실 3% 이내 (롤링용)">손실 3% 이내</th>
          </tr></thead>
          <tbody>
            {r.opts.map(o => (
              <tr key={o.label} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td, textAlign: 'left' }}><StarTag s={o.stars} /></td>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)', fontWeight: o.stars ? 700 : 400 }}>{o.label}</td>
                <td style={{ ...td, fontSize: 11, color: o.pOpen != null && o.p - o.pOpen >= 0.01 ? 'var(--green)' : o.pOpen != null && o.p - o.pOpen <= -0.01 ? 'var(--red)' : 'var(--text-muted)' }}>{o.flow}</td>
                <td style={{ ...td, fontWeight: 700 }}>{o.fair.toFixed(2)}</td>
                <td style={{ ...td, color: 'var(--gold)' }}>{minOddsFor(o.p, 0.03).toFixed(2)}↑</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        ★★ = 오픈보다 2%p+ 돈이 들어온 옵션, ★ = 1~2%p, 롤링 = 흐름 없음·반대. 피나클이 이미 움직였으니 우위는 <b>사이트 배당이 공정 배당 이상</b>일 때만 (백테스트: 마감 배당을 따라가면 ±0, 오픈 때 돈 쪽이면 +15.9%) — 사이트가 늦게 따라오는 돈 쪽을 먼저 확인. 1.30 미만·무승부·역배 승은 안 넣음.
      </div>
    </div>
  )
}

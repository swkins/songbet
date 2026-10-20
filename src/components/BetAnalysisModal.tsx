import { useRef, useState } from 'react'
import { X, TrendingUp, RotateCcw } from 'lucide-react'
import type { Odds, BetKey, BetResult, JudgeOutput } from '../lib/volleyJudge'
import { judgeKrWomen } from '../leagues/krWomen'
import { judgeItMen } from '../leagues/itMen'
import { judgeItWomen } from '../leagues/itWomen'
import { judgeTrMen } from '../leagues/trMen'
import { judgeTrWomen } from '../leagues/trWomen'

/* ── 베팅분석 — 종목 → 리그를 고르고 배당을 넣으면 과거 경기 데이터로 각 베팅의 가치(기대수익)를 판정 ──
   판정기는 종목·리그별로 등록한다(리그마다 과거 경기 데이터 + 최소 표본 수가 다름 — src/leagues).
   지금은 배구 5개 리그이고, 다른 종목/리그는 과거 데이터가 생기면 JUDGES에 추가하면 된다. */

interface OddsField { key: BetKey; label: string }
interface LeagueJudge {
  key: string; label: string; note: string
  fields: OddsField[]
  run: (odds: Odds) => JudgeOutput | null
}
interface SportJudges { key: string; label: string; emoji: string; leagues: LeagueJudge[] }

const VOLLEY_FIELDS: OddsField[] = [
  { key: 'home', label: '홈 승' }, { key: 'away', label: '원정 승' },
  { key: 'm15', label: '정배 -1.5 마핸' }, { key: 'p25', label: '역배 +2.5 플핸' },
  { key: 'o35', label: '3.5 오버' }, { key: 'u45', label: '4.5 언더' },
]

const JUDGES: SportJudges[] = [
  { key: 'soccer', label: '축구', emoji: '⚽', leagues: [] },
  { key: 'baseball', label: '야구', emoji: '⚾', leagues: [] },
  { key: 'basketball', label: '농구', emoji: '🏀', leagues: [] },
  {
    key: 'volleyball', label: '배구', emoji: '🏐', leagues: [
      { key: 'krWomen', label: '한국 여자', note: '2021-22 ~ 2025-26 정규시즌 615경기 (BetExplorer)', fields: VOLLEY_FIELDS, run: judgeKrWomen },
      { key: 'itMen', label: '이탈리아 남자', note: '2021-22 ~ 2025-26 정규시즌 683경기 (BetExplorer)', fields: VOLLEY_FIELDS, run: judgeItMen },
      { key: 'itWomen', label: '이탈리아 여자', note: '2021-22 ~ 2025-26 정규시즌 910경기 (BetExplorer)', fields: VOLLEY_FIELDS, run: judgeItWomen },
      { key: 'trMen', label: '터키 남자', note: '2021-22 ~ 2025-26 정규시즌 861경기 (BetExplorer)', fields: VOLLEY_FIELDS, run: judgeTrMen },
      { key: 'trWomen', label: '터키 여자', note: '2021-22 ~ 2025-26 정규시즌 910경기 (BetExplorer)', fields: VOLLEY_FIELDS, run: judgeTrWomen },
    ],
  },
  { key: 'esports', label: 'LOL', emoji: '🎮', leagues: [] },
]

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

export default function BetAnalysisModal({ onClose }: { onClose: () => void }) {
  const [sportKey, setSportKey] = useState('volleyball')
  const sport = JUDGES.find(s => s.key === sportKey)!
  const [leagueKey, setLeagueKey] = useState<string | null>(sport.leagues[0]?.key ?? null)
  const league = sport.leagues.find(l => l.key === leagueKey) ?? null
  const [raw, setRaw] = useState<Record<string, string>>({})
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function pickSport(key: string) {
    const s = JUDGES.find(x => x.key === key)!
    setSportKey(key); setLeagueKey(s.leagues[0]?.key ?? null); setRaw({})
  }
  // 숫자 3자리만 치면 배당으로 바꾸고(123 → 1.23) 다음 칸으로 이동
  function change(idx: number, key: string, v: string) {
    let clean = v.replace(/[^0-9.]/g, '')
    // 이미 배당(1.85)이 들어있는 칸에 숫자를 더 치면 덧붙이지 않고 새로 친 숫자부터 다시 받는다
    if (/^\d\.\d{2}$/.test(raw[key] ?? '') && /^\d\.\d{3,}$/.test(clean)) clean = clean.slice(4)
    const isTriple = /^\d{3}$/.test(clean)
    setRaw(p => ({ ...p, [key]: isTriple ? (Number(clean) / 100).toFixed(2) : clean }))
    // 바로 다음 칸으로 포커스 — 빠르게 이어 치거나 붙여넣어도 다음 숫자가 이 칸에 덧붙지 않게 즉시 옮긴다
    if (isTriple) { const el = inputRefs.current[idx + 1]; if (el) { el.focus(); el.select() } }
  }
  const num = (k: string) => { const n = parseFloat(raw[k] ?? ''); return n > 1 ? n : null }
  const odds: Odds = { home: num('home'), away: num('away'), m15: num('m15'), o35: num('o35'), u45: num('u45'), p25: num('p25') }
  const out = league ? league.run(odds) : null
  const recommendedKeys = new Set(out?.recommended.map(b => b.key) ?? [])

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)',
    color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })

  return (
    // 바깥을 눌러도 닫히지 않음 — 오른쪽 위 X로만 닫는다 (입력하다 실수로 날아가지 않게)
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={16} color="var(--gold)" /> 베팅분석 · 가치판단기
          <button onClick={() => setRaw({})} title="배당 초기화" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><RotateCcw size={14} /></button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* 종목 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {JUDGES.map(s => (
            <button key={s.key} onClick={() => pickSport(s.key)} style={{ ...chip(s.key === sportKey), opacity: s.leagues.length ? 1 : 0.55 }}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* 리그 */}
        {sport.leagues.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {sport.label}는 아직 판단기에 쓸 과거 경기 데이터가 없습니다.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {sport.leagues.map(l => (
                <button key={l.key} onClick={() => { setLeagueKey(l.key); setRaw({}) }} style={{ ...chip(l.key === leagueKey), fontSize: 11, padding: '4px 10px' }}>{l.label}</button>
              ))}
            </div>
            {league && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>기준 데이터: {league.note}</div>}
          </>
        )}

        {league && (
          <>
            {/* 배당 입력 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
              {league.fields.map((f, i) => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: i < 2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{f.label}{i < 2 && ' *'}</span>
                  <input ref={el => { inputRefs.current[i] = el }} className="form-input" inputMode="decimal" placeholder="배당 (185=1.85)"
                    value={raw[f.key] ?? ''} onChange={e => change(i, f.key, e.target.value)} onFocus={e => e.target.select()}
                    style={{ fontSize: 13, padding: '6px 8px', fontFamily: 'var(--font-mono)' }} />
                </label>
              ))}
            </div>

            {!out ? (
              <div style={{ padding: '14px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>홈 승 / 원정 승 배당을 넣으면 판정합니다 (나머지는 있는 것만 넣어도 됨)</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <span>정배 <b style={{ color: 'var(--text-primary)' }}>{out.favIsHome ? '홈' : '원정'} {out.fav.toFixed(2)}</b></span>
                  <span>마진 <b style={{ color: out.margin <= 0.05 ? 'var(--green)' : 'var(--orange)' }}>{pct(out.margin)}</b></span>
                  <span>비교 경기 <b style={{ color: 'var(--text-primary)' }}>{out.marketN}</b></span>
                </div>

                <div className="table-wrap">
                  <table style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>베팅</th><th className="td-right">배당</th><th className="td-right">과거 적중률</th>
                        <th className="td-right">손익분기</th><th className="td-right">기대수익</th><th>베팅 강도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...out.bets].sort((x, y) => league.fields.findIndex(f => f.key === x.key) - league.fields.findIndex(f => f.key === y.key)).map(b => <JudgeRow key={b.key} b={b} recommended={recommendedKeys.has(b.key)} />)}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12 }}>
                  {out.recommended.length > 0 ? (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--green)' }}>추천</span>{' '}
                      {out.recommended.map((b, i) => (
                        <span key={b.key}>{i > 0 && ' · '}<b>{b.name}</b> {b.site.toFixed(2)} ({signedPct(b.ev)}, {b.strength}점)</span>
                      ))}
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>추천 없음</span>
                      {out.leastLoss && <span style={{ color: 'var(--text-secondary)' }}> — 그나마 손해가 적은 건 <b>{out.leastLoss.name}</b> {out.leastLoss.site.toFixed(2)} ({signedPct(out.leastLoss.ev)})</span>}
                    </>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    추천 조건: 기대수익 플러스 + 배당 1.30 이상 2.00 미만 (원정 승은 추천 제외) · ±는 95% 오차<br />
                    베팅 강도: 0 패스(오차 감안해도 마이너스) · 1~3 약(마이너스지만 오차 범위 안) · 4~10 플러스(기대수익 크고 확실할수록 높음)
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// 베팅 강도 색: 0 회색(패스) · 1~3 주황(약) · 4~6 금색(중) · 7~10 초록(강/최강)
function strengthColor(v: number) {
  return v === 0 ? 'var(--text-muted)' : v <= 3 ? 'var(--orange)' : v <= 6 ? 'var(--gold)' : 'var(--green)'
}

function JudgeRow({ b, recommended }: { b: BetResult; recommended: boolean }) {
  const evColor = b.ev > 0 ? 'var(--green)' : 'var(--red)'
  return (
    <tr style={recommended ? { background: 'var(--green-bg)' } : !b.eligible ? { opacity: 0.55 } : undefined}>
      <td style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{b.name}</td>
      <td className="td-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.site.toFixed(2)}</td>
      <td className="td-right" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{pct(b.hit)} <span style={{ color: 'var(--text-muted)' }}>±{pct(b.se)} · {b.n}경기</span></td>
      <td className="td-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.be.toFixed(2)}</td>
      <td className="td-right" style={{ fontSize: 12, fontWeight: 700, color: evColor, whiteSpace: 'nowrap' }}>{signedPct(b.ev)} <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)' }}>±{pct(b.err)}</span></td>
      <td style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: strengthColor(b.strength) }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-num)', fontSize: 13, minWidth: 34 }}>{b.strength}<span style={{ fontSize: 9, opacity: 0.7 }}>/10</span></span>
          <span style={{ display: 'inline-block', width: 50, height: 5, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${b.strength * 10}%`, height: '100%', background: strengthColor(b.strength) }} />
          </span>
          {b.strengthLabel}
        </span>
        {!b.eligible && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (배당범위 밖)</span>}
      </td>
    </tr>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { atsPick, ouPick, fmtLine, recOf, REC_RULE, type OddsLine } from '../lib/odds'
import dayjs from 'dayjs'
import { koName, type ScheduleTeam } from '../lib/gameSchedule'
import { conditionColor, conditionLabel, type Condition } from '../lib/fatigue'
import { SET_SCORES, simulateVolley, type VolleyResult, type VolleySim } from '../lib/volleyPredict'
import { staminaOf, simulateVolleyGame, getParams, loadGameOverall, tierOf, availColor, TIERS, teamStrength, volleyLineup, VB_POS_KO, simulate, statusLabel, type TeamOv, type PlayerOv, type GameOverall } from '../lib/playerOverall'

// ─── 분석 탭 오른쪽 칸: 양 팀 핵심·주전 선수 오버롤 + 출전 확률 ─────
// 출전 색: 초록(90%↑) · 연두(70~89) · 노랑(40~69) · 빨강(1~39) · 결장 = 빨간 바탕 "0%" 칩 (이름은 취소선 없이 그대로)
// 오버롤 색: WoW 등급 — 전설 주황 · 영웅 보라 · 희귀 파랑 · 일반 흰색 · 하급 회색

const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)' }
const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 5px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '4px 5px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontSize: 12 }

function Ov({ v, size = 13 }: { v: number | null; size?: number }) {
  const t = tierOf(v)
  if (v == null || !t) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>–</span>
  return <span style={{ color: t.color, fontWeight: 800, fontSize: size, fontFamily: 'var(--font-num)' }}>{v}</span>
}

// 출전 칸을 누르면 '만약' 출전 확률을 바꿔 본다: 원래 → 결장(0) → 출전(100) → 원래 — 예상 스코어가 바로 다시 계산된다
function AvailCell({ p, ov, onCycle }: { p: PlayerOv; ov?: number; onCycle: () => void }) {
  const prob = ov ?? p.avail.prob, c = availColor(prob)
  if (prob === 0) return (
    // 결장은 눈에 띄게: 빨간 바탕 흰 글씨
    <button type="button" onClick={onCycle} title="눌러서 결장/출전으로 바꿔 보기 (예상 스코어 다시 계산)"
      style={{ background: '#FF3B3B', color: '#fff', border: ov != null ? '1px dashed #fff' : 'none', borderRadius: 6, padding: '1px 6px', cursor: 'pointer', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', fontFamily: 'var(--font-num)' }}>
      0%
    </button>
  )
  return (
    <button type="button" onClick={onCycle} title="눌러서 결장/출전으로 바꿔 보기 (예상 스코어 다시 계산)"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', background: 'none', border: ov != null ? '1px dashed var(--gold)' : '1px solid transparent', borderRadius: 6, padding: '0 3px', cursor: 'pointer' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0 }} />
      <span style={{ color: c, fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-num)' }}>{prob}%</span>
    </button>
  )
}

// 세트 수별 확률과 배당 기준 — 확률 p일 때 배당 o의 기대수익 = p·o − 1.
// 롤링 가능 = 기대수익 −5% 이상(o ≥ 0.95/p, 사용자 요청: 조금 손해여도 롤링 채울 만한 선), 손익분기 = 1/p, 가치 = +5%(1.05/p)
const ROLL_EV = -0.05, VALUE_EV = 0.05
function SetCountOdds({ v }: { v: VolleyResult }) {
  const d = v.dist
  const rows: [string, string, number][] = [
    ['3세트 (셧아웃)', '3.5 언더', d['3-0'] + d['0-3']],
    ['4세트', '정확히 4세트', d['3-1'] + d['1-3']],
    ['5세트 (풀세트)', '정확히 5세트', d['3-2'] + d['2-3']],
    ['4세트 이상', '3.5 오버', 1 - d['3-0'] - d['0-3']],
    ['4세트 이하', '4.5 언더', 1 - d['3-2'] - d['2-3']],
  ]
  const o = (p: number, ev: number) => ((1 + ev) / p).toFixed(2)
  const th: React.CSSProperties = { textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 5px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const tdr: React.CSSProperties = { textAlign: 'right', padding: '4px 5px', borderBottom: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-num)' }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>세트 수 확률 · 배당 기준</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>결과</th><th style={th}>확률</th>
          <th style={{ ...th, color: '#FACC15' }} title="기대수익 −5% 이상 — 조금 손해지만 롤링 채우기엔 갈 만함">롤링 가능</th>
          <th style={th} title="기대수익 0">손익분기</th>
          <th style={{ ...th, color: 'var(--green)' }} title="기대수익 +5% 이상">가치</th>
        </tr></thead>
        <tbody>{rows.map(([k, mk, p]) => (
          <tr key={k}>
            <td style={{ ...tdr, textAlign: 'left', fontFamily: 'var(--font-body)' }}>{k}<div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{mk}</div></td>
            <td style={{ ...tdr, fontWeight: 800 }}>{Math.round(p * 1000) / 10}%</td>
            <td style={{ ...tdr, color: '#FACC15', fontWeight: 700 }}>{o(p, ROLL_EV)}↑</td>
            <td style={tdr}>{o(p, 0)}↑</td>
            <td style={{ ...tdr, color: 'var(--green)', fontWeight: 700 }}>{o(p, VALUE_EV)}↑</td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.6 }}>
        사이트 배당이 <b style={{ color: '#FACC15' }}>롤링 가능</b> 이상이면 기대 손해 5% 이내(롤링용), <b>손익분기</b> 이상이면 본전, <b style={{ color: 'var(--green)' }}>가치</b> 이상이면 기대수익 +5%. 확률은 홈 승률 + 과거 V리그 5시즌 세트 결과 곡선 — 4·5세트는 한 경기 결과라 변동이 크니 금액은 작게.
      </div>
    </div>
  )
}

// 베팅 구간 (사용자 요청 2026-11-24 — 주력 3.5 오버·4.5 언더·포인트 오버·언더를 별 세 단계 + 패스로 바로)
//  세트: 확률 p → ★★★ 기대수익 +3%↑(1.03/p) · ★★ 본전↑(1/p) · ★ 기대 손해 5% 이내(0.95/p, 롤링용) · 그 아래 패스 — 1.30 미만 배당은 늘 패스
//  포인트(총득점): 배당 PTS_ODDS(보통 1.85) 가정, 같은 기준으로 필요한 확률 → 그 확률이 되는 기준점 (오버 = 이하일 때, 언더 = 이상일 때)
const STAR_EV: [string, number][] = [['★★★', 0.03], ['★★', 0], ['★', -0.05]]
const MIN_ODDS = 1.3, PTS_ODDS = 1.85
function BetZones({ v, sim }: { v: VolleyResult; sim: VolleySim }) {
  const d = v.dist
  const setRows: [string, number][] = [['3.5 오버', 1 - d['3-0'] - d['0-3']], ['4.5 언더', 1 - d['3-2'] - d['2-3']]]
  const oddsAt = (p: number, ev: number) => Math.max(MIN_ODDS, (1 + ev) / p)
  // 포인트: 오버 확률 p_over(line)는 기준점이 낮을수록 큼 → 오버는 "line 이하", 언더는 "line 이상"
  const need = (ev: number) => (1 + ev) / PTS_ODDS
  const overMax = (ev: number) => [...sim.overAll].reverse().find(o => o.over / 100 >= need(ev))?.line ?? null
  const underMin = (ev: number) => sim.overAll.find(o => 1 - o.over / 100 >= need(ev))?.line ?? null
  const th: React.CSSProperties = { textAlign: 'center', fontWeight: 700, padding: '3px 4px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'center', padding: '4px 4px', borderBottom: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--font-num)', fontWeight: 700, whiteSpace: 'nowrap' }
  const starColor = ['#FACC15', '#FDE68A', 'var(--text-secondary)']
  const ln = (x: number | null) => x == null ? '–' : x.toFixed(1)
  return (
    <div style={{ marginTop: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left', color: 'var(--text-muted)' }}>베팅 구간</th><th style={{ ...th, color: 'var(--text-muted)' }}>확률</th>
          {STAR_EV.map(([s], i) => <th key={s} style={{ ...th, color: starColor[i] }}>{s}</th>)}
          <th style={{ ...th, color: 'var(--red)' }}>패스</th>
        </tr></thead>
        <tbody>
          {setRows.map(([k, p]) => {
            const lv = STAR_EV.map(([, ev]) => oddsAt(p, ev))
            return (
              <tr key={k}>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)' }}>{k}<span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}> 배당</span></td>
                <td style={td}>{Math.round(p * 1000) / 10}%</td>
                {lv.map((o, i) => <td key={i} style={{ ...td, color: starColor[i] }}>{o.toFixed(2)}↑</td>)}
                <td style={{ ...td, color: 'var(--red)' }}>{lv[2].toFixed(2)} 미만</td>
              </tr>
            )
          })}
          {([['포인트 오버', 'over'], ['포인트 언더', 'under']] as const).map(([k, side]) => {
            const lv = STAR_EV.map(([, ev]) => side === 'over' ? overMax(ev) : underMin(ev))
            const mark = side === 'over' ? '↓' : '↑'
            return (
              <tr key={k}>
                <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)' }}>{k}<span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}> 기준점</span></td>
                <td style={{ ...td, fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>중앙 {sim.median}</td>
                {lv.map((x, i) => <td key={i} style={{ ...td, color: starColor[i] }}>{ln(x)}{x != null ? mark : ''}</td>)}
                <td style={{ ...td, color: 'var(--red)' }}>{lv[2] == null ? '전부' : side === 'over' ? `${ln(lv[2])} 초과` : `${ln(lv[2])} 미만`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
        세트: 사이트 배당이 ★★★ 이상 = 기대수익 +3%↑ · ★★ = 본전↑ · ★ = 기대 손해 5% 이내(롤링용) · 1.30 미만은 패스. 포인트: 배당 {PTS_ODDS} 가정 — 오버는 기준점이 그 값 <b>이하</b>(↓), 언더는 <b>이상</b>(↑)이면 그 별. 총득점은 랠리 시뮬레이션이라 실제 V리그 득점으로 검증 전 — 금액은 작게.
      </div>
    </div>
  )
}

// 배구 예상: 세트 스코어 분포 (volleyPredict.ts)
// 용병 표시 (사용자 요청 2026-11-24 — 외국인·아시아쿼터는 국내 선수와 한눈에 다르게): 칩 + 줄 왼쪽 색 막대 + 옅은 배경
const KIND_STYLE: Record<string, { color: string; row: string; label: string; title: string }> = {
  '외국인': { color: '#FF9F1C', row: 'rgba(255,159,28,0.07)', label: '외국인', title: '외국인 선수 (용병)' },
  '아시아쿼터': { color: '#2EC4B6', row: 'rgba(46,196,182,0.07)', label: '아쿼', title: '아시아쿼터 선수' },
}
function KindChip({ kind }: { kind: string }) {
  const k = KIND_STYLE[kind]; if (!k) return null
  return <span title={k.title} style={{ fontSize: 9, fontWeight: 800, padding: '0 5px', borderRadius: 3, background: k.color, color: '#111', lineHeight: '14px' }}>{k.label}</span>
}

function VolleyBox({ v, hName, aName, changed, onReset, odds }: { v: VolleyResult & { diff: number }; hName: string; aName: string; changed: number; onReset: () => void; odds?: { home: number; away: number } | null }) {
  // 간략 레이아웃 (사용자 요청 2026-11-24 — 상자가 너무 커서 아래 선수 오버롤을 보기 힘들었다): 한 줄 요약 칸 + 세트 스코어 막대 한 줄, 나머지는 '자세히'로 접음
  const max = Math.max(...SET_SCORES.map(k => v.dist[k]))
  const sim = useMemo(() => simulateVolley(v.dist), [v.dist])
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('songbet_volley_detail') === '1' } catch { return false } })
  const toggle = () => setOpen(o => { try { localStorage.setItem('songbet_volley_detail', o ? '0' : '1') } catch { /* 저장 안 돼도 됨 */ } return !o })
  const pct = (x: number) => Math.round(x * 1000) / 10
  const tile = (k: string, val: string, sub: React.ReactNode) => (
    <div style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 4px', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-num)', lineHeight: 1.3 }}>{val}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  )
  return (
    <div style={{ ...box, borderColor: 'var(--gold-border)', padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>예상 스코어</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>우리 모델만 (배당 안 씀){changed ? ` · 가정 ${changed}명` : ''}</span>
        {changed > 0 && <button type="button" onClick={onReset} style={{ fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px 6px' }}>가정 지우기</button>}
        <button type="button" onClick={toggle} style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px 8px' }}>{open ? '접기 ▲' : '자세히 ▼'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 5 }}>
        {/* 늘 하나로 정함 ('접전' 표시 안 함): 이길 쪽(홈 승률 50% 기준) + 세트 수 중앙값 — 3.5 오버·4.5 언더 칸과 늘 같은 방향.
            아래 = 이길 쪽 승률 · 그 세트 수로 끝날 확률(양쪽 합) */}
        {(() => {
          const sets = Number(v.best[0]) + Number(v.best[2])
          const pSets = sets === 3 ? v.dist['3-0'] + v.dist['0-3'] : sets === 4 ? v.dist['3-1'] + v.dist['1-3'] : v.dist['3-2'] + v.dist['2-3']
          const win = v.best.startsWith('3') ? v.homeWin : Math.round((100 - v.homeWin) * 10) / 10
          return tile('예상 세트 스코어', v.best.replace('-', ' : '), `${v.best.startsWith('3') ? hName : aName} 승 ${win}% · ${sets}세트 ${pct(pSets)}%`)
        })()}
        {tile('홈 승률', `${v.homeWin}%`, `원정 ${Math.round((100 - v.homeWin) * 10) / 10}%`)}
        {/* 주력 베팅 3.5 오버·4.5 언더 (사용자 요청 2026-11-24) — 배당 구간(별점)은 아래 '베팅 구간' 표 */}
        {tile('3.5 오버 (4세트↑)', `${v.over35}%`, `본전 배당 ${(100 / v.over35).toFixed(2)}`)}
        {tile('4.5 언더 (5세트 X)', `${pct(1 - v.dist['3-2'] - v.dist['2-3'])}%`, `본전 배당 ${(100 / (100 - v.full)).toFixed(2)}`)}
        {tile('예상 총득점', `${sim.median}`, `180.5 오버 ${sim.overs.find(o => o.line === 180.5)?.over ?? '-'}%`)}
      </div>
      {/* 세트 스코어 분포 — 한 줄 막대 (홈 승 금색 · 원정 승 파랑) */}
      <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
        {SET_SCORES.map(k => {
          const pv = v.dist[k], homeWin = k.startsWith('3')
          return (
            <div key={k} title={`${k} ${pct(pv)}%`} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <div style={{ height: 22, display: 'flex', alignItems: 'flex-end', background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '100%', height: `${(pv / max) * 100}%`, background: homeWin ? 'var(--gold)' : 'var(--blue)', opacity: k === v.best ? 1 : 0.55 }} />
              </div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-num)', color: k === v.best ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: k === v.best ? 800 : 400 }}>{k} {Math.round(pv * 100)}%</div>
            </div>
          )
        })}
      </div>
      <BetZones v={v} sim={sim} />
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3 }}>총득점 기준점별 오버 % <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)' }}>평균 {sim.total} · 80% 범위 {sim.lo}~{sim.hi} · 기대 세트차 {v.expDiff > 0 ? '+' : ''}{v.expDiff}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 3, marginBottom: 8 }}>
            {sim.overs.map(o => (
              <div key={o.line} title={`총득점 ${o.line} 오버 ${o.over}% · 언더 ${Math.round((100 - o.over) * 10) / 10}%`}
                style={{ fontSize: 10, fontFamily: 'var(--font-num)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', display: 'flex', justifyContent: 'space-between',
                  color: o.over >= 55 ? 'var(--green)' : o.over <= 45 ? 'var(--blue)' : 'var(--text-secondary)' }}>
                <span>{o.line}</span><b>{o.over}%</b>
              </div>
            ))}
          </div>
          {odds && <MoneylineBox p={v.homeWin / 100} odds={odds} market={v.marketHome} hName={hName} aName={aName} />}
          <SetCountOdds v={v} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
            홈 승률 {v.homeWin}% = 팀 레이팅(상대 보정){v.teamHome != null ? ` ${v.teamHome}%` : ' (기록 없음)'} · 포지션별 오버롤 {v.modelHome}% (팀 오버롤 차 {v.diff > 0 ? '+' : ''}{v.diff}){v.marketHome != null ? ` · 시장 ${v.marketHome}% (비교만)` : ''} → 세트 분포는 과거 V리그 5시즌 곡선 · 점수는 랠리 모델 2만 번(홈 랠리 {Math.round(sim.rally * 1000) / 10}%, 실제 득점으로 검증 전) · 선수 출전 칸을 누르면 다시 계산
          </div>
        </div>
      )}
    </div>
  )
}

// 지난 경기 대비 변화 ▲▼ (player_ratings — 예측 저장 때 같이 저장)
function Delta({ now, prev, date }: { now: number | null | undefined; prev: number | null | undefined; date?: string }) {
  if (now == null || prev == null) return null
  const d = Math.round(now - prev)
  if (!d) return null
  return <span title={`지난 경기(${date ? dayjs(date).format('M/D') : ''}) ${prev} → 지금 ${now}`} style={{ fontSize: 9, fontWeight: 700, marginLeft: 2, color: d > 0 ? 'var(--green)' : 'var(--red)', cursor: 'help' }}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>
}

// 선수 체력 % = 팀 컨디션 − 개인 피로(직전 경기·7일 출전시간). 75% 아래 '누적 경고'
function Stamina({ p, cond }: { p: PlayerOv; cond?: Condition }) {
  if (!cond && !p.fatigue) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>–</span>
  const pct = staminaOf(p, cond) ?? 100
  const col = conditionColor(pct), warn = pct < 75
  const why = [...(cond?.items ?? []).map(i => `팀: ${i.text} ${i.pts}`), ...(p.fatigue?.items ?? []).map(i => `개인: ${i.text} ${i.pts}`)]
  return (
    <span title={why.length ? why.join('\n') : '감점 없음'} style={{ cursor: 'help' }}>
      <span style={{ color: col, fontWeight: 800, fontSize: 11, fontFamily: 'var(--font-num)' }}>{pct}%</span><Delta now={pct} prev={p.prev?.stamina} date={p.prev?.date} />
      {warn && <div style={{ fontSize: 9, fontWeight: 800, color: '#FF4D6D' }}>⚠ 누적</div>}
      {!warn && (p.fatigue?.pen ?? 0) > 0 && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>개인 −{Math.round(p.fatigue!.pen)}</div>}
    </span>
  )
}

// 팀 이름 옆 컨디션 % (마우스 올리면 이유)
function CondBadge({ c }: { c: Condition }) {
  const col = conditionColor(c.pct)
  return (
    <span title={c.items.length ? c.items.map(i => `${i.text} ${i.pts}`).join('\n') : '2일 이상 휴식 · 감점 없음'}
      style={{ fontSize: 10, fontWeight: 800, padding: '0 6px', borderRadius: 8, border: `1px solid ${col}`, color: col, fontFamily: 'var(--font-num)', cursor: 'help' }}>
      {c.margin != null ? (c.margin ? `피로 ${c.margin}점` : '피로 없음') : `컨디션 ${c.pct}%`}
    </span>
  )
}

// 좌측 칸: 두 팀 컨디션 자세히 (백투백·이동·일정 밀도·원정 연전)
function ConditionBox({ home, away, hName, aName }: { home: Condition; away: Condition; hName: string; aName: string }) {
  const row = (name: string, c: Condition) => {
    const col = conditionColor(c.pct)
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: col, fontWeight: 700 }}>{conditionLabel(c.pct)}</span>
          <span style={{ fontWeight: 800, color: col, fontFamily: 'var(--font-num)', minWidth: 38, textAlign: 'right' }}>{c.margin != null ? `${c.margin}점` : `${c.pct}%`}</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden', margin: '3px 0' }}>
          <div style={{ width: `${c.pct}%`, height: '100%', background: col }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {c.items.length ? c.items.map((i, k) => <span key={k}>{k > 0 && ' · '}{i.text} <b style={{ color: 'var(--text-secondary)' }}>{i.pts}</b></span>)
            : `${c.restDays == null ? '이번 시즌 첫 경기' : `${c.restDays}일 휴식`} · 감점 없음`}
        </div>
      </div>
    )
  }
  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>팀 컨디션</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{home.margin != null ? '피로 점수 = 예상 마진에서 빼는 점수 · 백투백 −1.9 · 전날 연장 −1.5 · 백투백 이동 1,000km당 −0.5 · 일정 밀집 · 원정 연전 · 고지대' : '100% = 2일+ 휴식 · 백투백·연장·이동·일정 밀도·원정 연전 감점'}</span>
      </div>
      {row(`홈 · ${hName}`, home)}
      {row(`원정 · ${aName}`, away)}
    </div>
  )
}

// NBA 오버롤 옆 최근 7일 변화 (2026-11-26 사용자 요청 — 폼 칸 대신. 7일치가 아직 없으면 가장 오래된 날짜 대비)
function Trend7({ p }: { p: PlayerOv }) {
  const tr = p.trend; if (!tr || p.overall == null || !p.epm) return null
  const d = Math.round(p.overall - tr.overall)
  const sg = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`
  const title = `${dayjs(tr.from).format('M/D')} 대비 — 오버롤 ${tr.overall} → ${p.overall} · EPM ${sg(tr.epm)} → ${sg(p.epm.tot)}`
  if (!d) return <span title={title} style={{ fontSize: 9, marginLeft: 2, color: 'var(--text-muted)', cursor: 'help' }}>–</span>
  return <span title={title} style={{ fontSize: 9, fontWeight: 700, marginLeft: 2, color: d > 0 ? 'var(--green)' : 'var(--red)', cursor: 'help' }}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>
}

function TeamTable({ title, t, ovr, onCycle, cond, nba }: { title: string; t: TeamOv; ovr: Record<string, number>; onCycle: (p: PlayerOv) => void; cond?: Condition; nba?: boolean }) {
  const vb = t.players.some(p => p.pos)   // 배구: 포지션별 주전 슬롯으로 팀 전력
  const st = teamStrength(t.players, ovr, vb)
  const lu = vb ? volleyLineup(t.players, ovr) : null
  const weak = lu ? lu.slots.reduce((m, s) => (s.exp < m.exp ? s : m), lu.slots[0]) : null
  return (
    <div style={{ ...box, flex: '1 1 280px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{title}</span>
        {cond && <CondBadge c={cond} />}
        {st.full != null && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            팀 오버롤 <Ov v={Math.round(st.full)} size={12} /> → 결장 반영 <Ov v={st.exp == null ? null : Math.round(st.exp)} size={12} />
          </span>
        )}
      </div>
      {/* 배구 포지션별 주전 (사용자 요청 — 같은 포지션 몰림은 의미 없고 약한 포지션이 있으면 감점) */}
      {lu && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6, alignItems: 'stretch' }}>
          {lu.slots.map(sl => (
            <div key={sl.pos} title={sl.names.join(' · ') || '선수 없음'} style={{ flex: '1 1 0', minWidth: 58, textAlign: 'center', border: `1px solid ${sl === weak ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', padding: '3px 2px', background: 'var(--bg-card)' }}>
              <div style={{ fontSize: 9, color: sl === weak ? 'var(--red)' : 'var(--text-muted)' }}>{sl.label}{sl === weak ? ' · 약점' : ''}</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}><Ov v={Math.round(sl.exp)} size={13} /></div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sl.names.join('·') || '–'}</div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}>균형 감점 −{lu.penExp}</div>
        </div>
      )}
      {!t.team ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>이 팀 선수 기록을 아직 못 찾았어요</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>출전</th><th style={th}>선수</th>{!nba && <th style={{ ...th, textAlign: 'right' }} title="팀 컨디션 − 개인 출전시간 부담">체력</th>}
            {!nba && <><th style={{ ...th, textAlign: 'right' }}>체급</th><th style={{ ...th, textAlign: 'right' }}>폼</th></>}<th style={{ ...th, textAlign: 'right' }} title={nba ? 'EPM 리그 순위를 100점으로 · ▲▼ = 최근 7일 변화' : undefined}>오버롤</th>
          </tr></thead>
          <tbody>{t.players.map(p => {
            const ov = ovr[p.id]
            const a = ov != null ? { ...p.avail, prob: ov, label: `${statusLabel(ov)} (가정)`, origin: 'none' as const } : p.avail, out = a.prob === 0
            const tier = tierOf(p.overall)
            return (
              <tr key={p.id} style={{ background: out ? 'rgba(255,59,59,0.08)' : p.kind ? KIND_STYLE[p.kind]?.row : undefined }}>
                <td style={{ ...td, boxShadow: p.kind ? `inset 3px 0 0 ${KIND_STYLE[p.kind]?.color ?? 'var(--gold)'}` : undefined }}><AvailCell p={p} ov={ov} onCycle={() => onCycle(p)} /></td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {p.pos && <span title={VB_POS_KO[p.pos] ?? p.pos} style={{ fontSize: 9, fontWeight: 800, padding: '0 4px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-num)' }}>{p.pos}</span>}
                    <span title={`${p.nameEn !== p.name ? p.nameEn + ' · ' : ''}${p.pos ? (VB_POS_KO[p.pos] ?? p.pos) + ' · ' : ''}${p.baseNote}`} style={{ fontWeight: 700 }}>{p.name}</span>
                    {p.kind && <KindChip kind={p.kind} />}
                    {p.newcomer && p.newcomer.w < 0.67 && (
                      <span title={`이 리그 지난 시즌 기록 없음 — ${p.newcomer.kind ? `${p.newcomer.kind} 평균` : '같은 리그 선수 평균'} ${p.newcomer.prior}에서 출발, 실제 기록 비중 ${Math.round(p.newcomer.w * 100)}% (KBL 측정: 용병은 6경기·국내 신인은 3경기분 평균을 섞을 때 가장 정확)`}
                        style={{ fontSize: 9, fontWeight: 700, padding: '0 5px', borderRadius: 8, border: '1px solid var(--blue)', color: 'var(--blue)' }}>
                        {p.newcomer.kind ? '새 용병' : '새 선수'} {p.newcomer.n}경기째{p.newcomer.w < 0.5 ? ' · 판단 중' : ''}
                      </span>
                    )}
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
                  {!nba && p.fatigue?.note && <div style={{ fontSize: 10, color: 'var(--blue)' }}>🔄 {p.fatigue.note}</div>}
                  {a.reason && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{a.reason}</div>}
                  {a.source && (a.source.title || a.source.url) && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {a.source.url ? <a href={a.source.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>{a.source.title || '기사'}</a> : a.source.title}
                      {a.checkedAt && ` · ${dayjs(a.checkedAt).format('M/D HH:mm')}`}
                    </div>
                  )}
                </td>
                {!nba && <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><Stamina p={p} cond={cond} /></td>}
                {!nba && <>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-num)' }} title={p.baseNote}>{p.base ?? '–'}<Delta now={p.base} prev={p.prev?.base} date={p.prev?.date} /></td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-num)', color: p.form == null || p.base == null ? 'var(--text-muted)' : p.form > p.base + 2 ? 'var(--green)' : p.form < p.base - 2 ? 'var(--red)' : 'var(--text-secondary)' }}>{p.form ?? '–'}<Delta now={p.form} prev={p.prev?.form} date={p.prev?.date} /></td>
                </>}
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} title={nba ? p.baseNote : undefined}>
                  <Ov v={p.overall} />{nba ? <Trend7 p={p} /> : <Delta now={p.overall} prev={p.prev?.overall} date={p.prev?.date} />}
                  {nba && p.epm && <div style={{ fontSize: 9, color: p.epm.tot >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1.1 }}>EPM {p.epm.tot >= 0 ? '+' : ''}{p.epm.tot.toFixed(1)}</div>}
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      )}
      {t.gone && t.gone.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }} title="외국인 2명·아시아쿼터 1명 정원 — 가장 최근에 뛴 선수만 남기고, 교체로 빠진 선수는 팀 전력에서도 뺐다">
          교체로 빠짐: {t.gone.join(' · ')}
        </div>
      )}
    </div>
  )
}

// 배치 (사용자 요청 2026-11-21): 맨 위 뉴스 → 예상 스코어(가로로 길게) → 아래 좌(좁게) = left(배당 변동) + 팀 컨디션 · 우(넓게) = 선수 오버롤·출전 확률
export default function PlayerOverall({ league, gameDate, home, away, left, odds, lines, afterScore }: { league: string; gameDate: string; home: ScheduleTeam; away: ScheduleTeam; left?: React.ReactNode; afterScore?: React.ReactNode; odds?: { home: number; away: number } | null; lines?: { spread: OddsLine | null; total: OddsLine | null } | null }) {
  const [data, setData] = useState<GameOverall | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [ovr, setOvr] = useState<Record<string, number>>({})   // 화면에서 바꿔 본 출전 확률
  useEffect(() => {
    setData(undefined); setErr(null); setOvr({})
    loadGameOverall(league, gameDate, home, away).then(setData).catch(e => setErr(String(e?.message ?? e)))
  }, [league, gameDate, home.name, away.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const newsAdj = Number(data?.news?.margin_adj ?? 0) || 0
  // NBA: 시장 기준점을 같이 넣는다 (예상 = 시장 80% + 우리 모델 20%, 2026-11-21)
  const mSpread = lines?.spread?.line ?? null, mTotal = lines?.total?.line ?? null
  const sim = useMemo(() => data && !data.code.startsWith('VLEAGUE') ? simulate(data.code, data.home, data.away, ovr, newsAdj, data.cond, 20000, { spread: mSpread, total: mTotal }) : null, [data, ovr, newsAdj, mSpread, mTotal])
  const vsim = useMemo(() => data && data.code.startsWith('VLEAGUE') ? simulateVolleyGame(data.code, data.home, data.away, ovr, odds ?? null) : null, [data, ovr, odds?.home, odds?.away]) // eslint-disable-line react-hooks/exhaustive-deps
  const cycle = (p: PlayerOv) => setOvr(o => {
    const cur = o[p.id], n = { ...o }
    if (cur == null) n[p.id] = p.avail.prob === 0 ? 100 : 0
    else if (cur === 0 && p.avail.prob !== 100) n[p.id] = 100
    else delete n[p.id]
    return n
  })

  if (err || !data) return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
      {left}
      {err ? <div style={{ fontSize: 12, color: 'var(--red)' }}>선수 오버롤을 못 불러왔어요: {err}</div>
        : data === undefined ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>선수 오버롤 계산 중…</div> : null}
    </div>
  )
  const vbG = data.code.startsWith('VLEAGUE')
  const H = teamStrength(data.home.players, ovr, vbG), A = teamStrength(data.away.players, ovr, vbG)
  const diff = H.exp != null && A.exp != null ? Math.round((H.exp - A.exp) * 10) / 10 : null
  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`
  const hName = koName(home.name), aName = koName(away.name)
  const changed = Object.keys(ovr).length
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 뉴스 — 경기 관련 기사 요약 (맨 위, 사용자 요청) */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>뉴스</span>
          {data.news && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{dayjs(data.news.checked_at).format('M/D HH:mm')} 확인</span>}
        </div>
        {!data.news ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>이 경기 기사 요약이 아직 없어요</div> : <>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{data.news.summary}</div>
          {(data.news.items?.length ?? 0) > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.7 }}>
              {data.news.items!.map((it, i) => <span key={i}>{i > 0 && ' · '}{it.url ? <a href={it.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>{it.title}</a> : it.title}</span>)}
            </div>
          )}
        </>}
      </div>
      {/* 예상 스코어 — 가로로 길게 (사용자 요청) */}
      {/* 예상 스코어 — 선수 오버롤·출전 확률·뉴스 보정으로 2만 번 시뮬레이션. 출전 칸을 누르면 바로 다시 계산 */}
      {sim && (
        <div style={{ ...box, borderColor: 'var(--gold-border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>예상 스코어</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sim.parts.market != null && (sim.parts.wMarket ?? 0) > 0 ? `시장 기준점 ${Math.round((sim.parts.wMarket ?? 0.8) * 100)}% + 우리 모델 ${Math.round((1 - (sim.parts.wMarket ?? 0.8)) * 100)}% (기준점 근처에 나오는 게 정상 — 우리 모델 단독 마진 ${signed(sim.parts.model ?? 0)})` : (sim.parts.model != null ? `우리 모델만 (시장 기준점 안 섞음)${sim.parts.market != null ? ` · 참고: 기준점 마진 ${signed(sim.parts.market)}` : ''}` : '오버롤·출전 확률·이번 시즌 득실로 2만 번 시뮬레이션')}{changed ? ` · 가정 ${changed}명 적용 중` : ''}</span>
            {changed > 0 && <button type="button" onClick={() => setOvr({})} style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px 6px' }}>가정 지우기</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6 }}>
            {[
              ['스코어 (홈-원정)', `${sim.home} - ${sim.away}`, `${hName} - ${aName}`],
              ['홈 승률', `${sim.homeWin}%`, `원정 ${Math.round((100 - sim.homeWin) * 10) / 10}%`],
              ['예상 마진 (홈)', signed(sim.margin), `80% 구간 ${signed(sim.p10)} ~ ${signed(sim.p90)}`],
              ['예상 총점', String(sim.total), sim.parts.model != null ? (sim.parts.marketTotal != null && (sim.parts.wMarket ?? 0) > 0 ? `시장 ${sim.parts.marketTotal} · 모델 ${sim.parts.modelTotal}` : `우리 모델${sim.parts.marketTotal != null ? ` · 참고 기준점 ${sim.parts.marketTotal}` : ''}`) : '두 팀 이번 시즌 득실 기준'],
            ].map(([k, v, sub]) => (
              <div key={k} style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 4px', background: 'var(--bg-card)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)' }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            ))}
          </div>
          {/* 기준점 대비 마핸/플핸 · 오버/언더 (NBA, 사용자 요청 — 승패가 아니라 기준점을 맞혀야 한다) */}
          {lines && (lines.spread || lines.total) && <LinePickBox sim={sim} lines={lines} sd={getParams().leagues[data.code]?.sd ?? 13.5} sdT={getParams().leagues[data.code]?.sdT ?? 18} hName={hName} aName={aName} />}
          {sim.parts.model != null ? (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
            {sim.parts.market != null && (sim.parts.wMarket ?? 0) > 0
              ? <>마진 = 시장 {signed(sim.parts.market)} × {sim.parts.wMarket} + 우리 모델 {signed(sim.parts.model)} × {Math.round((1 - (sim.parts.wMarket ?? 0.8)) * 10) / 10}</>
              : <>마진 = 우리 모델 {signed(sim.parts.model)}</>}
            {' '}· 우리 모델 = 팀 레이팅 차 {signed(sim.parts.rating ?? 0)} + 홈 {signed(sim.parts.hca)} + {sim.parts.lineup != null ? '출전 선수 보정(오늘 뛸 선수 실력 − 지금까지 평균)' : '결장·개인 피로'} {signed(sim.parts.injury)}{sim.parts.cond ? <> + 컨디션 차 {signed(sim.parts.cond)}</> : null}
            {sim.parts.news ? <> + 뉴스 보정 {signed(sim.parts.news)}{data.news?.adj_note ? ` (${data.news.adj_note})` : ''}</> : null}
            {' '}· 팀 레이팅 = 이번 시즌 경기만으로 상대 보정해 고침 (지난 시즌 값 안 씀) · 선수 출전 칸을 누르면 결장/출전으로 바꿔 다시 계산
          </div>) : (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
            마진 = 득실 마진 {signed(sim.parts.scoreMargin)} × {getParams().leagues[data.code]?.wScore} + 오버롤 차 {signed(sim.parts.ovMargin)} × {getParams().leagues[data.code]?.wOv} + 결장·개인 피로 {signed(sim.parts.injury)} + 홈 {signed(sim.parts.hca)}{sim.parts.cond ? <> + 컨디션 차 {signed(sim.parts.cond)}</> : null}
            {sim.parts.news ? <> + 뉴스 보정 {signed(sim.parts.news)}{data.news?.adj_note ? ` (${data.news.adj_note})` : ''}</> : null}
            {' '}· 선수 출전 칸을 누르면 결장/출전으로 바꿔 다시 계산
          </div>)}
        </div>
      )}
      {vsim && <VolleyBox v={vsim} hName={hName} aName={aName} changed={changed} onReset={() => setOvr({})} odds={odds} />}
      {afterScore}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 좌: 배당 변동 · 팀 컨디션 */}
        <div style={{ flex: '1 1 300px', maxWidth: 420, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {left}
          {data.cond && <ConditionBox home={data.cond.home} away={data.cond.away} hName={hName} aName={aName} />}
        </div>
        {/* 우: 선수 오버롤 · 출전 확률 */}
        <div style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>선수 오버롤 · 출전 확률</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {data.code === 'NBA' ? '오버롤 순' : '체급 순'} · {data.checkedAt ? `뉴스 확인 ${dayjs(data.checkedAt).format('M/D HH:mm')}` : '뉴스 확인 전'}
              {diff != null && <> · 결장 반영 팀 오버롤 차이 <b style={{ color: diff >= 0 ? 'var(--gold)' : 'var(--blue)' }}>{diff >= 0 ? `홈 +${diff}` : `원정 +${-diff}`}</b></>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TeamTable title={`홈 · ${hName}`} t={data.home} ovr={ovr} onCycle={cycle} cond={data.cond?.home} nba={data.code === 'NBA'} />
            <TeamTable title={`원정 · ${aName}`} t={data.away} ovr={ovr} onCycle={cycle} cond={data.cond?.away} nba={data.code === 'NBA'} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            {data.code === 'NBA' ? <>오버롤 = EPM(dunksandthrees, 매일 갱신 — 100번 공격당 팀 득실 기여, 공격·수비 포함)의 리그 순위를 100점으로 · ▲▼ = 최근 7일 변화 · EPM에 없는 선수만 게임스코어 체급 · 결장 영향 = (EPM − 대체 −2) × 출전 분/48 ·{' '}</> : <>오버롤 = 체급 × 0.7 + 최근 5경기 폼 × 0.3 ({data.code.startsWith('VLEAGUE') ? '체급 = 이번 시즌 포지션별 능력 균형 점수' : '체급 = 이번 시즌 기록만, 경기 수가 적으면 같은 구분 평균 쪽으로'}) ·{' '}</>}
            {TIERS.map(t => <span key={t.name} style={{ color: t.color, marginRight: 6 }}>● {t.min >= 0 ? `${t.min}+` : '~59'}</span>)}
            <br />출전: <span style={{ color: availColor(95) }}>● 90%↑</span> <span style={{ color: availColor(80) }}>● 70~89</span> <span style={{ color: availColor(50) }}>● 40~69</span> <span style={{ color: availColor(20) }}>● 1~39</span> <span style={{ background: '#FF3B3B', color: '#fff', borderRadius: 4, padding: '0 4px', fontWeight: 700 }}>0%</span> 결장
            {' '}· 확정/추정 = Claude가 뉴스·ESPN 명단을 읽고 판단 · ↩ 복귀·⏱ 출전 제한 = 경기 기록 · {data.code === 'NBA' ? '피로 = 팀 컨디션만(백투백·이동·일정 밀도·연장, 팀 이름 옆) · ' : '체력 = 팀 컨디션 − 개인 출전시간 부담(직전 경기·7일 누적), 75% 미만 ⚠ 누적 경고 · 🔄 대승·대패 로테이션 · '}팀 오버롤 = 출전시간 × 이번 시즌 출전 비중 가중, 결장 반영 = 결장 확률만큼 대체 선수(50)로
          </div>
        </div>
      </div>

    </div>
  )
}

// 핸디 픽 손익분기 (배당 1.91 기준) — 예상 마진이 기준점과 거의 같으면 50%대 초반이라 픽이 아니라 패스로 보인다 (2026-11-23 사용자 지적)
const BREAKEVEN = 52.4
// 현재 기준점으로 마핸/플핸 · 오버/언더 (예상 마진·총점은 위 시뮬레이션 — 출전 가정을 바꾸면 같이 바뀐다)
function LinePickBox({ sim, lines, sd, sdT, hName, aName }: { sim: { margin: number; total: number }; lines: { spread: OddsLine | null; total: OddsLine | null }; sd: number; sdT: number; hName: string; aName: string }) {
  const sp = lines.spread, tt = lines.total
  const a = sp ? atsPick(sim.margin, sp.line, sd) : null
  const o = tt ? ouPick(sim.total, tt.line, sdT) : null
  const cell: React.CSSProperties = { flex: 1, minWidth: 0, border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', background: 'var(--bg-card)' }
  const strong = (p: number) => p >= 60 ? 'var(--green)' : p >= 55 ? 'var(--gold)' : 'var(--text-secondary)'
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      {sp && a && (
        <div style={cell}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>핸디 기준점 · 홈 {fmtLine(sp.line)} <span style={{ fontFamily: 'var(--font-num)' }}>({sp.home_odds?.toFixed(2)} / {sp.away_odds?.toFixed(2)})</span></div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>
            {a.prob < BREAKEVEN
              ? <span style={{ color: 'var(--text-muted)' }}>패스 <span style={{ fontSize: 11, fontWeight: 600 }}>· 기울기 {a.side === 'home' ? hName : aName} {a.kind}{a.kind !== '0' ? ` ${Math.abs(sp.line)}` : ''} {a.prob}% (손익분기 {BREAKEVEN}% 미만)</span></span>
              : <>{a.side === 'home' ? hName : aName} {a.kind}{a.kind !== '0' ? ` ${Math.abs(sp.line)}` : ''} <span style={{ color: strong(a.prob), fontFamily: 'var(--font-num)' }}>{a.prob}%</span></>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>예상 마진 {sim.margin > 0 ? '+' : ''}{sim.margin} vs 기준점 → 기준점보다 {Math.abs(a.edge)}점 {a.edge >= 0 ? '홈 쪽' : '원정 쪽'}</div>
          {(() => { const od = a.side === 'home' ? sp.home_odds : sp.away_odds, oo = a.side === 'home' ? sp.away_odds : sp.home_odds; const r = recOf(a.prob / 100, od, oo); if (!r || !od) return null
            return <div style={{ fontSize: 11, marginTop: 2 }} title={`추천 확률 = 시장 ${r.market}% + ${REC_RULE.shrink} × (모델 ${a.prob}% − 시장)`}>배당 {od.toFixed(2)} · 추천 확률 {r.prob}% · 기대수익 <b style={{ color: r.ev >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.ev > 0 ? '+' : ''}{r.ev}%</b> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· 모델 참고 (추천은 위 '배당 흐름 추천')</span></div> })()}
        </div>
      )}
      {tt && o && (
        <div style={cell}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>언오버 기준점 {tt.line} <span style={{ fontFamily: 'var(--font-num)' }}>({tt.home_odds?.toFixed(2)} / {tt.away_odds?.toFixed(2)})</span></div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{o.prob < BREAKEVEN ? <span style={{ color: 'var(--text-muted)' }}>패스 <span style={{ fontSize: 11, fontWeight: 600 }}>· 기울기 {o.side === 'over' ? '오버' : '언더'} {o.prob}%</span></span> : <>{o.side === 'over' ? '오버' : '언더'} <span style={{ color: strong(o.prob), fontFamily: 'var(--font-num)' }}>{o.prob}%</span></>}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>예상 총점 {sim.total} vs {tt.line} ({o.edge > 0 ? '+' : ''}{o.edge}) · 총점 모델은 아직 검증 전 — 추천 안 함</div>
        </div>
      )}
    </div>
  )
}

const RecTag = () => <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: '0 6px', borderRadius: 8, background: 'var(--green)', color: '#000' }}>추천</span>

// 배구 승패: 모델 확률 vs 지금 배당 — 추천 확률 = 시장 + 0.5 × (모델 − 시장), 기대수익 +3%↑ & 배당 1.30~3.00 = 추천
function MoneylineBox({ p, odds, hName, aName }: { p: number; odds: { home: number; away: number }; market: number | null; hName: string; aName: string }) {
  const rows: [string, number, number, number][] = [[hName, p, odds.home, odds.away], [aName, 1 - p, odds.away, odds.home]]
  const td: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-num)', textAlign: 'right' }
  return (
    <div style={{ marginTop: 8, border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>승패 배당 비교 <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>추천 확률 = 시장 + {REC_RULE.shrink} × (모델 − 시장) · 추천 = 기대수익 +3%↑ · 배당 1.30~3.00</span></div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr>{['', '모델', '시장', '추천 확률', '배당', '기대수익', ''].map((h, i) => <th key={i} style={{ ...td, fontFamily: 'var(--font-body)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 10, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(([n, q, od, oo]) => { const r = recOf(q, od, oo); if (!r) return null; return (
          <tr key={n}>
            <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)', fontWeight: 700 }}>{n}</td>
            <td style={td}>{Math.round(q * 1000) / 10}%</td><td style={{ ...td, color: 'var(--text-muted)' }}>{r.market}%</td><td style={td}>{r.prob}%</td>
            <td style={td}>{od.toFixed(2)}</td>
            <td style={{ ...td, fontWeight: 800, color: r.ev >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.ev > 0 ? '+' : ''}{r.ev}%</td>
            <td style={td}>{r.rec ? <RecTag /> : null}</td>
          </tr>) })}</tbody>
      </table>
    </div>
  )
}

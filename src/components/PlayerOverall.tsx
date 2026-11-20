import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { koName, type ScheduleTeam } from '../lib/gameSchedule'
import { conditionColor, conditionLabel, type Condition } from '../lib/fatigue'
import { SET_SCORES, simulateVolley, type VolleyResult } from '../lib/volleyPredict'
import { staminaOf, simulateVolleyGame, getParams, loadGameOverall, tierOf, availColor, TIERS, teamStrength, simulate, statusLabel, type TeamOv, type PlayerOv, type GameOverall } from '../lib/playerOverall'

// ─── 분석 탭 오른쪽 칸: 양 팀 핵심·주전 선수 오버롤 + 출전 확률 ─────
// 출전 색: 초록(90%↑) · 연두(70~89) · 노랑(40~69) · 빨강(1~39) · 결장 = 빨간 바탕 "0%" 칩 (이름은 취소선 없이 그대로)
// 오버롤 색: WoW 등급 — 전설 주황 · 영웅 보라 · 희귀 파랑 · 일반 흰색 · 하급 회색

const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elevated)' }
const th: React.CSSProperties = { textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', padding: '3px 5px', fontSize: 10, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '4px 5px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontSize: 12 }

function Ov({ v, size = 13 }: { v: number | null; size?: number }) {
  const t = tierOf(v)
  if (v == null || !t) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>–</span>
  return <span title={t.name} style={{ color: t.color, fontWeight: 800, fontSize: size, fontFamily: 'var(--font-num)' }}>{v}</span>
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

// 배구 예상: 세트 스코어 분포 (volleyPredict.ts)
function VolleyBox({ v, hName, aName, changed, onReset }: { v: VolleyResult & { diff: number }; hName: string; aName: string; changed: number; onReset: () => void }) {
  const max = Math.max(...SET_SCORES.map(k => v.dist[k]))
  // 2만 번 시뮬레이션 (사용자 요청): 예상 총득점·득점·기준점별 오버 % (최다 세트 스코어 칸은 아래 분포와 겹쳐서 뺐다 — 사용자 요청)
  const sim = useMemo(() => simulateVolley(v.dist), [v.dist])
  const tile = (k: string, val: string, sub: string) => (
    <div style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 4px', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)' }}>{val}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
  return (
    <div style={{ ...box, borderColor: 'var(--gold-border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>예상 스코어</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v.marketHome != null ? '배당 70% + 오버롤 30%' : '오버롤만 (배당 없음)'}{changed ? ` · 가정 ${changed}명` : ''}</span>
        {changed > 0 && <button type="button" onClick={onReset} style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px 6px' }}>가정 지우기</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
        {tile('예상 총득점', `${sim.median}`, `평균 ${sim.total} · 80% 범위 ${sim.lo}~${sim.hi}`)}
        {tile('예상 득점', `${Math.round(sim.homePts)} : ${Math.round(sim.awayPts)}`, `${hName} : ${aName}`)}
        {tile('총득점 오버 확률', `${sim.overs.find(o => o.line === 180.5)?.over ?? '-'}%`, '180.5 기준')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 3, marginBottom: 8 }}>
        {sim.overs.map(o => (
          <div key={o.line} title={`총득점 ${o.line} 오버 ${o.over}% · 언더 ${Math.round((100 - o.over) * 10) / 10}%`}
            style={{ fontSize: 10, fontFamily: 'var(--font-num)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', display: 'flex', justifyContent: 'space-between',
              color: o.over >= 55 ? 'var(--green)' : o.over <= 45 ? 'var(--blue)' : 'var(--text-secondary)' }}>
            <span>{o.line}</span><b>{o.over}%</b>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {tile('홈 승률', `${v.homeWin}%`, `${hName} · 원정 ${Math.round((100 - v.homeWin) * 10) / 10}%`)}
        {tile('기대 세트차 (홈)', `${v.expDiff > 0 ? '+' : ''}${v.expDiff}`, `기대 ${v.expSets}세트`)}
        {tile('4세트 이상', `${v.over35}%`, `풀세트 ${v.full}%`)}
        {tile('셧아웃 (3-0·0-3)', `${Math.round((v.dist['3-0'] + v.dist['0-3']) * 1000) / 10}%`, `홈 3-0 ${Math.round(v.dist['3-0'] * 100)}% · 원정 3-0 ${Math.round(v.dist['0-3'] * 100)}%`)}
      </div>
      <div style={{ marginTop: 8 }}>
        {SET_SCORES.map(k => {
          const pv = v.dist[k], homeWin = k.startsWith('3')
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
              <span style={{ width: 30, fontFamily: 'var(--font-num)' }}>{k}</span>
              <div style={{ flex: 1, height: 10, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(pv / max) * 100}%`, height: '100%', background: homeWin ? 'var(--gold)' : 'var(--blue)', opacity: 0.85 }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--font-num)' }}>{Math.round(pv * 1000) / 10}%</span>
            </div>
          )
        })}
      </div>
      {/* 세트 수 확률 → 배당 기준 (롤링용: 조금 손해여도 갈 만한 배당부터) */}
      <SetCountOdds v={v} />
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
        오버롤 모델 홈 {v.modelHome}% (팀 오버롤 차 {v.diff > 0 ? '+' : ''}{v.diff}){v.marketHome != null ? ` · 시장 홈 ${v.marketHome}%` : ''} → 세트 분포는 과거 V리그 5시즌 곡선 · 점수는 랠리 모델 2만 번(홈 랠리 {Math.round(sim.rally * 1000) / 10}%, 실제 득점으로 검증 전 — 칸 = 총득점 기준점별 오버 %) · 선수 출전 칸을 누르면 다시 계산
      </div>
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
      컨디션 {c.pct}%
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
          <span style={{ fontWeight: 800, color: col, fontFamily: 'var(--font-num)', minWidth: 38, textAlign: 'right' }}>{c.pct}%</span>
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
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>100% = 2일+ 휴식 · 백투백·연장·이동·일정 밀도·원정 연전 감점</span>
      </div>
      {row(`홈 · ${hName}`, home)}
      {row(`원정 · ${aName}`, away)}
    </div>
  )
}

function TeamTable({ title, t, ovr, onCycle, cond }: { title: string; t: TeamOv; ovr: Record<string, number>; onCycle: (p: PlayerOv) => void; cond?: Condition }) {
  const st = teamStrength(t.players, ovr)
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
      {!t.team ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>이 팀 선수 기록을 아직 못 찾았어요</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>출전</th><th style={th}>선수</th><th style={{ ...th, textAlign: 'right' }} title="팀 컨디션 − 개인 출전시간 부담">체력</th>
            <th style={{ ...th, textAlign: 'right' }}>체급</th><th style={{ ...th, textAlign: 'right' }}>폼</th><th style={{ ...th, textAlign: 'right' }}>오버롤</th>
          </tr></thead>
          <tbody>{t.players.map(p => {
            const ov = ovr[p.id]
            const a = ov != null ? { ...p.avail, prob: ov, label: `${statusLabel(ov)} (가정)`, origin: 'none' as const } : p.avail, out = a.prob === 0
            const tier = tierOf(p.overall)
            return (
              <tr key={p.id} style={{ background: out ? 'rgba(255,59,59,0.08)' : undefined }}>
                <td style={td}><AvailCell p={p} ov={ov} onCycle={() => onCycle(p)} /></td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span title={`${p.nameEn !== p.name ? p.nameEn + ' · ' : ''}${p.baseNote}`} style={{ fontWeight: 700 }}>{p.name}</span>
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
                  {p.fatigue?.note && <div style={{ fontSize: 10, color: 'var(--blue)' }}>🔄 {p.fatigue.note}</div>}
                  {a.reason && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{a.reason}</div>}
                  {a.source && (a.source.title || a.source.url) && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {a.source.url ? <a href={a.source.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>{a.source.title || '기사'}</a> : a.source.title}
                      {a.checkedAt && ` · ${dayjs(a.checkedAt).format('M/D HH:mm')}`}
                    </div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><Stamina p={p} cond={cond} /></td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-num)' }} title={p.baseNote}>{p.base ?? '–'}<Delta now={p.base} prev={p.prev?.base} date={p.prev?.date} /></td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-num)', color: p.form == null || p.base == null ? 'var(--text-muted)' : p.form > p.base + 2 ? 'var(--green)' : p.form < p.base - 2 ? 'var(--red)' : 'var(--text-secondary)' }}>{p.form ?? '–'}<Delta now={p.form} prev={p.prev?.form} date={p.prev?.date} /></td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Ov v={p.overall} /><Delta now={p.overall} prev={p.prev?.overall} date={p.prev?.date} />
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

// 배치: 좌(좁게) = left(배당 변동) + 예상 스코어 · 우(넓게) = 선수 오버롤·출전 확률 · 아래 = 뉴스
export default function PlayerOverall({ league, gameDate, home, away, left, odds }: { league: string; gameDate: string; home: ScheduleTeam; away: ScheduleTeam; left?: React.ReactNode; odds?: { home: number; away: number } | null }) {
  const [data, setData] = useState<GameOverall | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [ovr, setOvr] = useState<Record<string, number>>({})   // 화면에서 바꿔 본 출전 확률
  useEffect(() => {
    setData(undefined); setErr(null); setOvr({})
    loadGameOverall(league, gameDate, home, away).then(setData).catch(e => setErr(String(e?.message ?? e)))
  }, [league, gameDate, home.name, away.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const newsAdj = Number(data?.news?.margin_adj ?? 0) || 0
  const sim = useMemo(() => data ? simulate(data.code, data.home, data.away, ovr, newsAdj, data.cond) : null, [data, ovr, newsAdj])
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
  const H = teamStrength(data.home.players, ovr), A = teamStrength(data.away.players, ovr)
  const diff = H.exp != null && A.exp != null ? Math.round((H.exp - A.exp) * 10) / 10 : null
  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`
  const hName = koName(home.name), aName = koName(away.name)
  const changed = Object.keys(ovr).length
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* 좌: 배당 변동 + 예상 스코어 */}
        <div style={{ flex: '1 1 300px', maxWidth: 420, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {left}
          {/* 예상 스코어 — 선수 오버롤·출전 확률·뉴스 보정으로 2만 번 시뮬레이션. 출전 칸을 누르면 바로 다시 계산 */}
          {sim && (
            <div style={{ ...box, borderColor: 'var(--gold-border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>예상 스코어</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>오버롤·출전 확률·이번 시즌 득실로 2만 번 시뮬레이션{changed ? ` · 가정 ${changed}명 적용 중` : ''}</span>
                {changed > 0 && <button type="button" onClick={() => setOvr({})} style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '1px 6px' }}>가정 지우기</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['스코어 (홈-원정)', `${sim.home} - ${sim.away}`, `${hName} - ${aName}`],
                  ['홈 승률', `${sim.homeWin}%`, `원정 ${Math.round((100 - sim.homeWin) * 10) / 10}%`],
                  ['예상 마진 (홈)', signed(sim.margin), `80% 구간 ${signed(sim.p10)} ~ ${signed(sim.p90)}`],
                  ['예상 총점', String(sim.total), '두 팀 이번 시즌 득실 기준'],
                ].map(([k, v, sub]) => (
                  <div key={k} style={{ textAlign: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 4px', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)' }}>{v}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
                마진 = 득실 마진 {signed(sim.parts.scoreMargin)} × {getParams().leagues[data.code]?.wScore} + 오버롤 차 {signed(sim.parts.ovMargin)} × {getParams().leagues[data.code]?.wOv} + 결장·개인 피로 {signed(sim.parts.injury)} + 홈 {signed(sim.parts.hca)}{sim.parts.cond ? <> + 컨디션 차 {signed(sim.parts.cond)}</> : null}
                {sim.parts.news ? <> + 뉴스 보정 {signed(sim.parts.news)}{data.news?.adj_note ? ` (${data.news.adj_note})` : ''}</> : null}
                {' '}· 선수 출전 칸을 누르면 결장/출전으로 바꿔 다시 계산
              </div>
            </div>
          )}
          {data.cond && <ConditionBox home={data.cond.home} away={data.cond.away} hName={hName} aName={aName} />}
          {vsim && <VolleyBox v={vsim} hName={hName} aName={aName} changed={changed} onReset={() => setOvr({})} />}
        </div>
        {/* 우: 선수 오버롤 · 출전 확률 */}
        <div style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>선수 오버롤 · 출전 확률</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              체급 순 · {data.checkedAt ? `뉴스 확인 ${dayjs(data.checkedAt).format('M/D HH:mm')}` : '뉴스 확인 전'}
              {diff != null && <> · 결장 반영 팀 오버롤 차이 <b style={{ color: diff >= 0 ? 'var(--gold)' : 'var(--blue)' }}>{diff >= 0 ? `홈 +${diff}` : `원정 +${-diff}`}</b></>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TeamTable title={`홈 · ${hName}`} t={data.home} ovr={ovr} onCycle={cycle} cond={data.cond?.home} />
            <TeamTable title={`원정 · ${aName}`} t={data.away} ovr={ovr} onCycle={cycle} cond={data.cond?.away} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            오버롤 = 체급 × 0.7 + 최근 5경기 폼 × 0.3 (체급 = 이번 시즌 + 지난 시즌, 경기가 쌓일수록 이번 시즌 비중↑) ·{' '}
            {TIERS.map(t => <span key={t.name} style={{ color: t.color, marginRight: 6 }}>{t.name} {t.min >= 0 ? `${t.min}+` : '~59'}</span>)}
            <br />출전: <span style={{ color: availColor(95) }}>● 90%↑</span> <span style={{ color: availColor(80) }}>● 70~89</span> <span style={{ color: availColor(50) }}>● 40~69</span> <span style={{ color: availColor(20) }}>● 1~39</span> <span style={{ background: '#FF3B3B', color: '#fff', borderRadius: 4, padding: '0 4px', fontWeight: 700 }}>0%</span> 결장
            {' '}· 확정/추정 = Claude가 뉴스·ESPN 명단을 읽고 판단 · ↩ 복귀·⏱ 출전 제한 = 경기 기록 · 체력 = 팀 컨디션 − 개인 출전시간 부담(직전 경기·7일 누적), 75% 미만 ⚠ 누적 경고 · 🔄 대승·대패 로테이션 · 팀 오버롤 = 출전시간 × 이번 시즌 출전 비중 가중, 결장 반영 = 결장 확률만큼 대체 선수(50)로
          </div>
        </div>
      </div>

      {/* 뉴스 — 경기 관련 기사 요약 (맨 아래) */}
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
    </div>
  )
}

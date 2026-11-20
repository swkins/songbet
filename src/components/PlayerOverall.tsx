import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { koName, type ScheduleTeam } from '../lib/gameSchedule'
import { conditionColor, conditionLabel, type Condition } from '../lib/fatigue'
import { loadGameOverall, tierOf, availColor, TIERS, teamStrength, simulate, statusLabel, type TeamOv, type PlayerOv, type GameOverall } from '../lib/playerOverall'

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

// 출전 칸을 누르면 '만약' 출전 확률을 바꿔 본다: 원래 → 결장(0) → 출전(100) → 원래 — 예상 스코어가 바로 다시 계산된다
function AvailCell({ p, ov, onCycle }: { p: PlayerOv; ov?: number; onCycle: () => void }) {
  const prob = ov ?? p.avail.prob, c = availColor(prob)
  return (
    <button type="button" onClick={onCycle} title="눌러서 결장/출전으로 바꿔 보기 (예상 스코어 다시 계산)"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', background: 'none', border: ov != null ? '1px dashed var(--gold)' : '1px solid transparent', borderRadius: 6, padding: '0 3px', cursor: 'pointer' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0 }} />
      <span style={{ color: c, fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-num)' }}>{prob}%</span>
    </button>
  )
}

// 선수 체력 % = 팀 컨디션 − 개인 피로(직전 경기·7일 출전시간). 75% 아래 '누적 경고'
function Stamina({ p, cond }: { p: PlayerOv; cond?: Condition }) {
  if (!cond && !p.fatigue) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>–</span>
  const pct = Math.max(30, Math.round((cond?.pct ?? 100) - (p.fatigue?.pen ?? 0)))
  const col = conditionColor(pct), warn = pct < 75
  const why = [...(cond?.items ?? []).map(i => `팀: ${i.text} ${i.pts}`), ...(p.fatigue?.items ?? []).map(i => `개인: ${i.text} ${i.pts}`)]
  return (
    <span title={why.length ? why.join('\n') : '감점 없음'} style={{ cursor: 'help' }}>
      <span style={{ color: col, fontWeight: 800, fontSize: 11, fontFamily: 'var(--font-num)' }}>{pct}%</span>
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
              <tr key={p.id} style={{ opacity: out ? 0.6 : 1 }}>
                <td style={td}><AvailCell p={p} ov={ov} onCycle={() => onCycle(p)} /></td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span title={`${p.nameEn !== p.name ? p.nameEn + ' · ' : ''}${p.baseNote}`} style={{ fontWeight: 700, textDecoration: out ? 'line-through' : undefined, textDecorationColor: '#B3001B' }}>{p.name}</span>
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

// 배치: 좌(좁게) = left(배당 변동) + 예상 스코어 · 우(넓게) = 선수 오버롤·출전 확률 · 아래 = 뉴스
export default function PlayerOverall({ league, gameDate, home, away, left }: { league: string; gameDate: string; home: ScheduleTeam; away: ScheduleTeam; left?: React.ReactNode }) {
  const [data, setData] = useState<GameOverall | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [ovr, setOvr] = useState<Record<string, number>>({})   // 화면에서 바꿔 본 출전 확률
  useEffect(() => {
    setData(undefined); setErr(null); setOvr({})
    loadGameOverall(league, gameDate, home, away).then(setData).catch(e => setErr(String(e?.message ?? e)))
  }, [league, gameDate, home.name, away.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const newsAdj = Number(data?.news?.margin_adj ?? 0) || 0
  const sim = useMemo(() => data ? simulate(data.code, data.home, data.away, ovr, newsAdj, data.cond) : null, [data, ovr, newsAdj])
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
                마진 = 득실 마진 {signed(sim.parts.scoreMargin)} × 0.5 + 오버롤 차 {signed(sim.parts.ovMargin)} × 0.5 + 결장·개인 피로 {signed(sim.parts.injury)} + 홈 {signed(sim.parts.hca)}{sim.parts.cond ? <> + 컨디션 차 {signed(sim.parts.cond)}</> : null}
                {sim.parts.news ? <> + 뉴스 보정 {signed(sim.parts.news)}{data.news?.adj_note ? ` (${data.news.adj_note})` : ''}</> : null}
                {' '}· 선수 출전 칸을 누르면 결장/출전으로 바꿔 다시 계산
              </div>
            </div>
          )}
          {data.cond && <ConditionBox home={data.cond.home} away={data.cond.away} hName={hName} aName={aName} />}
          {!sim && data.code.startsWith('VLEAGUE') && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>배구는 예상 스코어 시뮬레이션 준비 중 — 선수 오버롤만 표시</div>}
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
            <br />출전: <span style={{ color: availColor(95) }}>● 90%↑</span> <span style={{ color: availColor(80) }}>● 70~89</span> <span style={{ color: availColor(50) }}>● 40~69</span> <span style={{ color: availColor(20) }}>● 1~39</span> <span style={{ color: availColor(0) }}>● 결장</span>
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

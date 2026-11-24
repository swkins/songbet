import { useEffect, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { Plus, Trash2, X, ClipboardPaste, DollarSign, Target, TrendingUp, Settings } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMiningData, fmtMining as fmt, type MiningEntry, type MiningCashout } from '../lib/useMining'

interface SelectableSite { id: string; name: string }

/** 2주(14일) 사이클 기준 페이스 계산: 사이클 시작(=목표일-기간)부터 오늘까지 경과일 비율만큼
 *  목표치를 채웠어야 한다고 보고, 실제 달성치를 그 "날짜대비 목표치"와 비교한 퍼센트를 반환한다.
 *  (하루 채굴량이 아니라 날짜 경과 대비 누적 달성도를 보는 것 — 오늘 하나도 안 채워도 이미 앞서 있으면 초록으로 나옴) */
function paceRatio(progress: number, target: number, elapsedDays: number, periodDays: number) {
  const paceTarget = periodDays > 0 ? target * Math.min(1, Math.max(0, elapsedDays / periodDays)) : target
  if (paceTarget <= 0) return progress > 0 ? 200 : 100
  return (progress / paceTarget) * 100
}
/** 날짜대비 목표치 달성률에 따른 색상 4단계: 120%+ 시안(청록) / 100%+ 초록 / 80%+(달성 직전) 주황 / 그 외 빨강 */
function paceColorForRatio(ratio: number) {
  if (ratio >= 120) return 'var(--cyan)'
  if (ratio >= 100) return 'var(--green)'
  if (ratio >= 80) return 'var(--orange)'
  return 'var(--red)'
}

const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px',
  textTransform: 'uppercase', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

/** 이번 주(월~일) 시작·끝 — 월요일이 되면 새 주 (사용자 요청 2026-11-24) */
function thisWeek() {
  const t = dayjs().startOf('day')
  const mon = t.subtract((t.day() + 6) % 7, 'day')
  return { mon, sun: mon.add(6, 'day'), elapsed: t.diff(mon, 'day') + 1 }
}
const numIn = (v: string) => (v ? Number(v.replace(/,/g, '')).toLocaleString('ko-KR') : '')
const onlyNum = (v: string, set: (x: string) => void) => { const raw = v.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) set(raw) }
const chipBtn = (on: boolean): React.CSSProperties => ({
  fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-body)',
  border: `1px solid ${on ? 'var(--gold-border)' : 'var(--border)'}`, background: on ? 'var(--gold-bg)' : 'var(--bg-card)', color: on ? 'var(--gold)' : 'var(--text-secondary)',
})
const secSt: React.CSSProperties = { marginBottom: 14, padding: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }
const secTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }

/** 사이트 설정 (⚙ 아이콘 — 사용자 요청 2026-11-24: '현금교환' 글자 버튼 대신 설정 아이콘)
 *  실적현황(베팅사이트·이번 주 목표·기간 목표)은 모든 사이트, 현금교환(채굴 포인트·목표 날짜·교환 실행)은 현금교환을 쓰는 사이트만 */
function SiteSettingsModal({ entry, cashout, onClose, onSetCashEnabled, onSetGoal, onSetAuto, onSetPerfGoal, onSetPerfWeek, onCashout, onUpdatePoint }: {
  entry: MiningEntry
  cashout: MiningCashout | undefined
  onClose: () => void
  onSetCashEnabled: (on: boolean) => Promise<void>
  onSetGoal: (goalDate: string) => Promise<void>
  onSetAuto: (enabled: boolean) => Promise<void>
  onSetPerfGoal: (siteIds: string[], period: '2w' | '1m' | null, amount: number) => Promise<void>
  onSetPerfWeek: (amount: number) => Promise<void>
  onCashout: (amount: number) => Promise<void>
  onUpdatePoint: (field: 'current_point' | 'target_point', value: number) => Promise<void>
}) {
  const cashOn = cashout?.cash_enabled ?? true
  const hasGoal = !!cashout?.goal_date
  const [goalDate, setGoalDate] = useState(cashout?.goal_date ?? dayjs().add(14, 'day').format('YYYY-MM-DD'))
  const [selectableSites, setSelectableSites] = useState<SelectableSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [perfSiteIds, setPerfSiteIds] = useState<string[]>(cashout?.perf_site_ids ?? [])
  const [perfPeriod, setPerfPeriod] = useState<'2w' | '1m'>(cashout?.perf_period ?? '2w')
  const [perfAmount, setPerfAmount] = useState(cashout?.perf_amount ? String(cashout.perf_amount) : '')
  const [weekAmount, setWeekAmount] = useState(cashout?.perf_week_amount ? String(cashout.perf_week_amount) : '')
  const [cur, setCur] = useState(String(entry.current_point))
  const [tgt, setTgt] = useState(String(entry.target_point))
  const [saving, setSaving] = useState(false)
  const [amount, setAmount] = useState(entry.target_point > 0 ? String(entry.target_point) : '')
  const [submitting, setSubmitting] = useState(false)
  const autoOn = cashout?.auto_set_2w ?? true

  useEffect(() => {
    (async () => {
      setSitesLoading(true)
      const { data } = await supabase.from('sites').select('id,name,settlement_only').order('sort_order')
      if (data) setSelectableSites((data as { id: string; name: string; settlement_only: boolean }[]).filter(s => !s.settlement_only).map(s => ({ id: s.id, name: s.name })))
      setSitesLoading(false)
    })()
  }, [])

  const now = dayjs(), today = now.startOf('day')
  const goalReached = entry.target_point > 0 && entry.current_point >= entry.target_point
  const cooldownUntil = cashout?.next_allowed_at ? dayjs(cashout.next_allowed_at) : null
  const goalDayReached = hasGoal && !today.isBefore(dayjs(cashout!.goal_date!).startOf('day'))
  const inCooldown = !!cooldownUntil && today.isBefore(cooldownUntil.startOf('day')) && !goalDayReached
  const canExchange = goalReached && !inCooldown
  const amountN = Number(amount.replace(/,/g, '')) || 0
  const amountValid = amountN > 0 && amountN <= entry.current_point

  async function saveAll() {
    if (saving) return
    setSaving(true)
    await onSetPerfGoal(perfSiteIds, cashOn ? perfPeriod : (cashout?.perf_period ?? null), cashOn ? (Number(perfAmount.replace(/,/g, '')) || 0) : (cashout?.perf_amount ?? 0))
    await onSetPerfWeek(Number(weekAmount.replace(/,/g, '')) || 0)
    if (cashOn) {
      if (goalDate && goalDate !== cashout?.goal_date) await onSetGoal(goalDate)
      const c = Number(cur.replace(/,/g, '')), t = Number(tgt.replace(/,/g, ''))
      if (Number.isFinite(c) && c !== entry.current_point) await onUpdatePoint('current_point', c)
      if (Number.isFinite(t) && t !== entry.target_point) await onUpdatePoint('target_point', t)
    }
    setSaving(false)
    onClose()
  }
  async function submitCashout() {
    if (!canExchange || !amountValid || submitting) return
    if (!confirm(`${fmt(amountN)} 만큼 현금교환하시겠습니까? 현재가에서 차감되어 시작가/현재가가 ${fmt(entry.current_point - amountN)}(으)로 재설정됩니다.${autoOn ? ` (목표 날짜는 자동으로 ${now.add(14, 'day').format('MM.DD')}로 설정됩니다)` : ''}`)) return
    setSubmitting(true)
    await onCashout(amountN)
    setSubmitting(false)
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={ev => ev.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: '88vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><Settings size={14} /> {entry.site_name} 설정</div>
          <button onClick={onClose} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
        </div>

        {/* 현금교환 사용 */}
        <label style={{ ...secSt, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={cashOn} onChange={ev => onSetCashEnabled(ev.target.checked)} />
          <span style={{ fontSize: 12, fontWeight: 700 }}>현금교환 사용</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>끄면 실적현황만 봅니다</span>
        </label>

        {/* 실적현황 — 모든 사이트 */}
        <div style={secSt}>
          <div style={secTitle}><TrendingUp size={12} /> 실적현황</div>
          {sitesLoading ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>사이트 불러오는 중...</div>
            : selectableSites.length === 0 ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>베팅현황에 등록된 사이트가 없습니다.</div>
            : (
              <>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5 }}>실적(베팅 입금)으로 셀 베팅사이트</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {selectableSites.map(s => (
                    <button key={s.id} type="button" onClick={() => setPerfSiteIds(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id])} style={chipBtn(perfSiteIds.includes(s.id))}>{s.name}</button>
                  ))}
                </div>
              </>
            )}
          {!cashOn && (<>
            <div style={labelSt}>이번 주 목표 (월~일, 없으면 비움)</div>
            <input style={{ ...inputSt, marginBottom: 8, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" placeholder="이번 주 목표 실적 (원)" value={numIn(weekAmount)} onChange={ev => onlyNum(ev.target.value, setWeekAmount)} />
          </>)}
          {cashOn && (
            <>
              <div style={labelSt}>현금교환 목표 날짜로부터 기간 목표</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <button type="button" onClick={() => setPerfPeriod('2w')} style={{ ...chipBtn(perfPeriod === '2w'), flex: 1, fontSize: 11, padding: '6px 0' }}>2주 전까지</button>
                <button type="button" onClick={() => setPerfPeriod('1m')} style={{ ...chipBtn(perfPeriod === '1m'), flex: 1, fontSize: 11, padding: '6px 0' }}>1개월 전까지</button>
              </div>
              <input style={{ ...inputSt, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" placeholder="기간 목표 실적 (원)" value={numIn(perfAmount)} onChange={ev => onlyNum(ev.target.value, setPerfAmount)} />
            </>
          )}
        </div>

        {/* 현금교환 — 쓰는 사이트만 */}
        {cashOn && (
          <div style={secSt}>
            <div style={secTitle}><DollarSign size={12} /> 현금교환</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={labelSt}>현재 포인트</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <input style={{ ...inputSt, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" value={numIn(cur)} onChange={ev => onlyNum(ev.target.value, setCur)} />
                  <button type="button" title="클립보드에서 붙여넣기" onClick={async () => { try { const d = (await navigator.clipboard.readText()).replace(/[^\d]/g, ''); if (d) setCur(d) } catch { /* 무시 */ } }}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--gold)', display: 'flex', alignItems: 'center', padding: '0 6px' }}><ClipboardPaste size={12} /></button>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelSt}>목표 포인트</div>
                <input style={{ ...inputSt, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" value={numIn(tgt)} onChange={ev => onlyNum(ev.target.value, setTgt)} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={labelSt}><Target size={10} /> 목표 날짜</div>
              <button type="button" onClick={() => onSetAuto(!autoOn)} title="현금교환 실행 시 목표 날짜를 2주 뒤로 자동 설정" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)', color: autoOn ? 'var(--gold)' : 'var(--text-muted)' }}>
                {autoOn ? '● ' : '○ '}2주 자동설정
              </button>
            </div>
            <input type="date" style={{ ...inputSt, fontSize: 12, padding: '7px 9px', marginBottom: 8 }} value={goalDate} onChange={ev => setGoalDate(ev.target.value)} />
            {inCooldown && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>다음 현금교환 가능일: {cooldownUntil!.format('YYYY.MM.DD')} (2주 쿨다운)</div>}
            {!inCooldown && !goalReached && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>목표 포인트({fmt(entry.target_point)})를 채워야 교환할 수 있어요 (현재 {fmt(entry.current_point)})</div>}
            <div style={{ display: 'flex', gap: 5 }}>
              <input style={{ ...inputSt, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" placeholder="교환할 금액" disabled={!canExchange} value={numIn(amount)} onChange={ev => onlyNum(ev.target.value, setAmount)} />
              <button onClick={submitCashout} disabled={!canExchange || !amountValid || submitting} style={{ flexShrink: 0, padding: '0 12px', borderRadius: 8, border: 'none', cursor: canExchange && amountValid ? 'pointer' : 'not-allowed', background: 'var(--purple)', color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-body)', opacity: canExchange && amountValid ? 1 : 0.5 }}>
                {submitting ? '처리중...' : '교환 실행'}
              </button>
            </div>
          </div>
        )}

        <button onClick={saveAll} disabled={saving} style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)' }}>
          {saving ? '저장중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

/** 14칸(또는 n칸) 눈금 게이지 + 오늘 위치 마커 — 실적현황 공용 */
function TickGauge({ pct, color, markerPct, ticks = 14, c }: { pct: number; color: string; markerPct: number; ticks?: number; c: boolean }) {
  const filled = (Math.min(100, pct) / 100) * ticks, full = Math.floor(filled), part = filled - full
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: ticks }, (_, i) => {
          const fillPct = i < full ? 100 : i === full ? part * 100 : 0
          return (
            <div key={i} style={{ flex: 1, height: c ? 8 : 13, background: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fillPct}%`, background: color, transition: 'width 0.3s' }} />
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', top: c ? -3 : -4, bottom: c ? -3 : -4, left: `${Math.min(100, Math.max(0, markerPct))}%`, width: 2, background: 'var(--text-primary)', transform: 'translateX(-1px)', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: c ? -4 : -5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '5px solid var(--text-primary)' }} />
      </div>
    </div>
  )
}

/** 실적 한 줄 (이번 주 / 기간) — 목표가 있으면 눈금 게이지, 없으면 금액만 */
function PerfBlock({ title, range, progress, target, elapsed, days, c, ticks = 14 }: { title: string; range: string; progress: number; target: number; elapsed: number; days: number; c: boolean; ticks?: number }) {
  const has = target > 0
  const pctD = has ? Math.max(0, progress / target * 100) : 0
  const done = has && progress >= target, excess = has && progress > target
  const remain = target - progress
  const color = paceColorForRatio(paceRatio(progress, target, elapsed, days))
  return (
    <div style={{ marginTop: c ? 3 : 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: c ? 2 : 4 }}>
        <span style={{ fontSize: c ? 11 : 13, fontWeight: 700, color: 'var(--text-muted)' }}>{title} <span style={{ fontWeight: 500, fontSize: c ? 10 : 11 }}>{range}</span></span>
        <span style={{ fontSize: c ? 11 : 12, color: 'var(--text-muted)' }}><b style={{ color: 'var(--gold)', fontFamily: 'var(--font-num)', fontSize: c ? 13 : 15 }}>{fmt(progress)}</b>{has ? ` / ${fmt(target)}` : ''}</span>
      </div>
      {has && (
        <>
          <TickGauge pct={pctD} color={color} markerPct={(elapsed / days) * 100} ticks={ticks} c={c} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: c ? 2 : 4 }}>
            <span style={{ fontSize: c ? 10 : 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {remain <= 0 ? (excess ? `목표 달성 (초과 ${fmt(-remain)})` : '목표 달성') : `남음 ${fmt(remain)}`}
            </span>
            <span style={{ fontSize: c ? 13 : 16, fontWeight: 800, fontFamily: 'var(--font-num)', color: done ? 'var(--green)' : 'var(--text-secondary)' }}>{pctD.toFixed(0)}%</span>
          </div>
        </>
      )}
    </div>
  )
}

/** 대시보드 '사이트 현황' — 사이트마다 실적현황만 (사용자 요청 2026-11-24: 채굴 현황은 빼고 실적현황만, 이번 주 실적 추가,
 *  현금교환은 사이트 추가 때 체크한 사이트만 · 우측 ⚙ 설정 아이콘). 채굴 포인트 입력은 설정 창의 현금교환 칸에서. */
// tabs: 넘기면 "사이트 현황" 제목 대신 사이트 현황 / 베팅분석 전환 버튼을 보여준다 (대시보드)
// compact: 대시보드 "상하"·"베팅" 모드 — 글씨·눈금·여백을 줄임
export default function MiningWidget({ tabs, compact = false }: { tabs?: ReactNode; compact?: boolean } = {}) {
  const c = compact
  const { today, entries, loading, knownSites, addEntry: addEntryToDb, updateField, deleteEntry: deleteEntryFromDb, cashouts, cashoutFor, setCashGoal, setAutoSet2w, setPerfGoal, doCashout, setCashEnabled, setPerfWeek } = useMiningData()

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCash, setNewCash] = useState(false)
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [settingsEntry, setSettingsEntry] = useState<MiningEntry | null>(null)
  const [perf, setPerf] = useState<Record<string, { week: number; period: number | null }>>({})
  const wk = thisWeek()

  // 실적(베팅 입금 합계): 이번 주(월~오늘) + 현금교환 사이트는 목표 날짜 기준 기간
  useEffect(() => {
    const targets = cashouts.filter(x => (x.perf_site_ids?.length ?? 0) > 0)
    if (targets.length === 0) { setPerf({}); return }
    (async () => {
      const sumOf = async (ids: string[], from: string, to: string) => {
        const { data } = await supabase.from('cashflows').select('amount_krw,amount').eq('category', '베팅입금').in('site_id', ids).gte('flow_date', from).lte('flow_date', to)
        return (data ?? []).reduce((a: number, cf: { amount_krw: number | null; amount: number }) => a + (cf.amount_krw ?? cf.amount), 0)
      }
      const out: Record<string, { week: number; period: number | null }> = {}
      for (const x of targets) {
        const week = await sumOf(x.perf_site_ids, wk.mon.format('YYYY-MM-DD'), wk.sun.format('YYYY-MM-DD'))
        let period: number | null = null
        if ((x.cash_enabled ?? true) && x.goal_date && x.perf_period) {
          const goal = dayjs(x.goal_date), end = dayjs().isBefore(goal) ? dayjs() : goal
          const start = x.perf_period === '2w' ? goal.subtract(14, 'day') : goal.subtract(1, 'month')
          period = await sumOf(x.perf_site_ids, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'))
        }
        out[x.site_name] = { week, period }
      }
      setPerf(out)
    })()
  }, [JSON.stringify(cashouts.map(x => [x.site_name, x.goal_date, x.perf_period, x.perf_site_ids, x.perf_amount, x.cash_enabled])), wk.mon.format('YYYY-MM-DD')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addEntry() {
    if (!newName.trim() || saving) return
    setSaving(true)
    const result = await addEntryToDb(newName.trim(), newCash ? Number(newStart.replace(/,/g, '')) || 0 : 0, newCash ? Number(newTarget.replace(/,/g, '')) || 0 : 0, newCash)
    if (result === 'ok') { setNewName(''); setNewStart(''); setNewTarget(''); setNewCash(false); setAddModalOpen(false) }
    else if (result === 'duplicate') alert('이미 등록된 사이트입니다.')
    setSaving(false)
  }
  async function deleteEntry(id: string) {
    if (!confirm('이 사이트를 삭제할까요? 과거 기록도 함께 삭제되며 되돌릴 수 없습니다.')) return
    await deleteEntryFromDb(id)
  }

  return (
    <div className="card" style={{ padding: c ? '6px 12px' : '10px 14px' }}>
      <div className="flex-between" style={{ marginBottom: c ? 5 : 10 }}>
        <span className="card-title" style={{ margin: 0 }}>{tabs ?? '사이트 현황'}</span>
        <button onClick={() => setAddModalOpen(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
          <Plus size={12} /> 추가
        </button>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '4px 0' }}>불러오는 중...</div>}
      {!loading && entries.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '14px 0' }}>사이트를 추가하면 실적현황이 여기 표시됩니다.</div>
      )}

      <div className="mining-cards" style={c ? { gap: 6 } : undefined}>
        {entries.map(e => {
          const co = cashoutFor(e.site_name)
          const cashOn = co?.cash_enabled ?? true
          const p = perf[e.site_name]
          const hasSites = (co?.perf_site_ids?.length ?? 0) > 0
          let periodBlock: ReactNode = null
          if (cashOn && co?.goal_date && co.perf_period && co.perf_amount > 0 && p?.period != null) {
            const goal = dayjs(co.goal_date)
            const start = co.perf_period === '2w' ? goal.subtract(14, 'day') : goal.subtract(1, 'month')
            const days = goal.diff(start, 'day')
            const el = Math.min(days, Math.max(0, dayjs().startOf('day').diff(start.startOf('day'), 'day')))
            periodBlock = <PerfBlock title="기간 실적" range={`${start.format('MM.DD')}~${goal.format('MM.DD')}`} progress={p.period} target={co.perf_amount} elapsed={el} days={days} c={c} />
          }
          const ptDone = cashOn && e.target_point > 0 && e.current_point >= e.target_point
          return (
            <div key={e.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: c ? '5px 9px' : '9px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: c ? 13 : 15, fontWeight: 700, color: 'var(--text-primary)' }}>{e.site_name}</span>
                  {cashOn && <span title={`현금교환 사이트 · 포인트 ${fmt(e.current_point)} / ${fmt(e.target_point)}`} style={{ fontSize: 9, fontWeight: 700, color: ptDone ? 'var(--green)' : 'var(--purple)', display: 'flex', alignItems: 'center' }}><DollarSign size={10} />{ptDone ? '교환 가능' : ''}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setSettingsEntry(e)} title={cashOn ? '설정 · 현금교환' : '설정'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0 }}><Settings size={c ? 13 : 15} /></button>
                  <button onClick={() => deleteEntry(e.id)} title="삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><Trash2 size={12} /></button>
                </div>
              </div>
              {!hasSites ? (
                <div style={{ fontSize: c ? 10 : 11, color: 'var(--text-muted)', marginTop: 4 }}>⚙ 설정에서 실적으로 셀 베팅사이트를 고르세요</div>
              ) : cashOn && !periodBlock ? (
                <div style={{ fontSize: c ? 10 : 11, color: 'var(--text-muted)', marginTop: 4 }}>⚙ 설정에서 목표 날짜·기간 목표를 정하면 기간 실적이 보여요</div>
              ) : (
                <>
                  {/* 현금교환 사이트는 이번 주 실적을 안 보인다 (사용자 요청 2026-11-24 — 기간 실적만) */}
                  {!cashOn && <PerfBlock title="이번 주" range={`${wk.mon.format('MM.DD')}(월)~${wk.sun.format('MM.DD')}(일)`} progress={p?.week ?? 0} target={co?.perf_week_amount ?? 0} elapsed={wk.elapsed} days={7} ticks={7} c={c} />}
                  {periodBlock}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* 사이트 추가 — 현금교환은 선택 (사용자 요청 2026-11-24) */}
      {addModalOpen && (
        <div onClick={() => setAddModalOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={ev => ev.stopPropagation()} style={{ width: '100%', maxWidth: 340, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dayjs(today).format('MM.DD')} 사이트 추가</div>
              <button onClick={() => setAddModalOpen(false)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={labelSt}>사이트명</div>
              <input autoFocus style={inputSt} placeholder="사이트 이름" list="mining-widget-known-sites" value={newName} onChange={ev => setNewName(ev.target.value)} onKeyDown={ev => ev.key === 'Enter' && addEntry()} />
              <datalist id="mining-widget-known-sites">{knownSites.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={newCash} onChange={ev => setNewCash(ev.target.checked)} /> 현금교환 사용
              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>체크 안 하면 실적현황만</span>
            </label>
            {newCash && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelSt}>시작 포인트</div>
                  <input style={inputSt} inputMode="numeric" placeholder="0" value={numIn(newStart)} onChange={ev => onlyNum(ev.target.value, setNewStart)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelSt}>목표 포인트</div>
                  <input style={inputSt} inputMode="numeric" placeholder="0" value={numIn(newTarget)} onChange={ev => onlyNum(ev.target.value, setNewTarget)} />
                </div>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>실적으로 셀 베팅사이트·이번 주 목표는 추가한 뒤 ⚙ 설정에서 정합니다.</div>
            <button onClick={addEntry} disabled={!newName.trim() || saving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 8, border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed', background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)', opacity: newName.trim() ? 1 : 0.5 }}>
              <Plus size={14} /> 추가
            </button>
          </div>
        </div>
      )}

      {settingsEntry && (
        <SiteSettingsModal
          entry={entries.find(x => x.id === settingsEntry.id) ?? settingsEntry}
          cashout={cashoutFor(settingsEntry.site_name)}
          onClose={() => setSettingsEntry(null)}
          onSetCashEnabled={on => setCashEnabled(settingsEntry.site_name, on)}
          onSetGoal={g => setCashGoal(settingsEntry.site_name, g)}
          onSetAuto={on => setAutoSet2w(settingsEntry.site_name, on)}
          onSetPerfGoal={(ids, period, amount) => setPerfGoal(settingsEntry.site_name, ids, period, amount)}
          onSetPerfWeek={amount => setPerfWeek(settingsEntry.site_name, amount)}
          onCashout={amount => doCashout(entries.find(x => x.id === settingsEntry.id) ?? settingsEntry, amount)}
          onUpdatePoint={(field, v) => updateField(entries.find(x => x.id === settingsEntry.id) ?? settingsEntry, field, v)}
        />
      )}
    </div>
  )
}

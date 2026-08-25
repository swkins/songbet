import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, Check, X, ClipboardPaste, DollarSign, Target, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMiningData, fmtMining as fmt, minedOf as mined, type MiningEntry, type MiningCashout } from '../lib/useMining'

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

/** 채굴 사이트별 현금교환 모달: 목표 날짜만 직접 설정한다 (2주 자동설정 토글로 실행 후 자동 갱신 가능).
 *  실제 채굴 진행 눈금 게이지는 사이트 카드 쪽에 표시되고, 여기서는 목표 달성 여부(채굴 목표량 도달) + 2주 쿨다운을
 *  만족하면 현금교환을 실행 — 현재가에서 교환액만큼 빼서 시작가/현재가를 새로 설정한다. */
function CashoutModal({ entry, cashout, onClose, onSetGoal, onSetAuto, onSetPerfGoal, onCashout }: {
  entry: MiningEntry
  cashout: MiningCashout | undefined
  onClose: () => void
  onSetGoal: (goalDate: string) => Promise<void>
  onSetAuto: (enabled: boolean) => Promise<void>
  onSetPerfGoal: (siteIds: string[], period: '2w' | '1m', amount: number) => Promise<void>
  onCashout: (amount: number) => Promise<void>
}) {
  const hasGoal = !!cashout?.goal_date
  const [editingGoal, setEditingGoal] = useState(!hasGoal)
  const [goalDate, setGoalDate] = useState(cashout?.goal_date ?? dayjs().add(14, 'day').format('YYYY-MM-DD'))
  const [savingGoal, setSavingGoal] = useState(false)

  const hasPerfGoal = !!cashout?.perf_period && (cashout?.perf_site_ids?.length ?? 0) > 0
  const [editingPerf, setEditingPerf] = useState(!hasPerfGoal)
  const [selectableSites, setSelectableSites] = useState<SelectableSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [perfSiteIds, setPerfSiteIds] = useState<string[]>(cashout?.perf_site_ids ?? [])
  const [perfPeriod, setPerfPeriod] = useState<'2w' | '1m'>(cashout?.perf_period ?? '2w')
  const [perfAmount, setPerfAmount] = useState(cashout?.perf_amount ? String(cashout.perf_amount) : '')
  const [savingPerf, setSavingPerf] = useState(false)

  // 베팅현황(대시보드)에 있는 사이트 전부 — 결산 전용(settlement_only)으로 넘긴 사이트만 제외, 비활성(마감) 사이트도 포함
  useEffect(() => {
    (async () => {
      setSitesLoading(true)
      const { data } = await supabase.from('sites').select('id,name,settlement_only').order('sort_order')
      if (data) setSelectableSites((data as { id: string; name: string; settlement_only: boolean }[]).filter(s => !s.settlement_only).map(s => ({ id: s.id, name: s.name })))
      setSitesLoading(false)
    })()
  }, [])

  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const autoOn = cashout?.auto_set_2w ?? true

  const now = dayjs()
  const remainingDays = hasGoal ? Math.max(0, dayjs(cashout!.goal_date!).startOf('day').diff(now.startOf('day'), 'day')) : 0
  // 목표 달성 여부는 "오늘 채굴한 증가분"이 아니라 누적 채굴 잔액(current_point) 기준으로 봐야 함.
  // 오늘 채굴한 증가분으로 체크하면 오늘 채굴을 안 한 날은 이미 목표를 훨씬 넘겼어도 교환이 막히는 버그가 있었음.
  const goalReached = entry.target_point > 0 && entry.current_point >= entry.target_point

  const cooldownUntil = cashout?.next_allowed_at ? dayjs(cashout.next_allowed_at) : null
  const inCooldown = !!cooldownUntil && now.isBefore(cooldownUntil)
  const canExchange = goalReached && !inCooldown

  const amountN = Number(amount.replace(/,/g, '')) || 0
  const amountValid = amountN > 0 && amountN <= entry.current_point
  const perfSiteNames = selectableSites.filter(s => perfSiteIds.includes(s.id)).map(s => s.name)

  function togglePerfSite(id: string) {
    setPerfSiteIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function saveGoal() {
    if (!goalDate || savingGoal) return
    setSavingGoal(true)
    await onSetGoal(goalDate)
    setSavingGoal(false)
    setEditingGoal(false)
  }

  async function savePerfGoal() {
    if (perfSiteIds.length === 0 || !perfAmount || savingPerf) return
    setSavingPerf(true)
    await onSetPerfGoal(perfSiteIds, perfPeriod, Number(perfAmount.replace(/,/g, '')) || 0)
    setSavingPerf(false)
    setEditingPerf(false)
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
      <div onClick={ev => ev.stopPropagation()} style={{ width: '100%', maxWidth: 380, maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{entry.site_name} 현금교환</div>
          <button onClick={onClose} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
        </div>

        {/* 목표 날짜 섹션 — 이 날짜가 사이트 카드의 채굴 눈금 게이지 마감일로 쓰인다 */}
        <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              <Target size={12} /> 현금교환 목표 날짜
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => onSetAuto(!autoOn)} title="현금교환 실행 시 목표 날짜를 2주 뒤로 자동 설정" style={{
                display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)', color: autoOn ? 'var(--gold)' : 'var(--text-muted)',
              }}>
                <span style={{
                  width: 26, height: 15, borderRadius: 999, position: 'relative', transition: 'background 0.15s',
                  background: autoOn ? 'var(--gold)' : 'var(--border)', flexShrink: 0,
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: autoOn ? 13 : 2, width: 11, height: 11, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.15s',
                  }} />
                </span>
                2주 자동설정
              </button>
              {hasGoal && !editingGoal && (
                <button onClick={() => setEditingGoal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Pencil size={10} /> 재설정
                </button>
              )}
            </div>
          </div>

          {!editingGoal && hasGoal ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-num)' }}>{dayjs(cashout!.goal_date!).format('YYYY.MM.DD')}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{remainingDays}일 남음</span>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input type="date" style={{ ...inputSt, fontSize: 12, padding: '7px 9px', flex: 1 }} value={goalDate}
                  onChange={ev => setGoalDate(ev.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={saveGoal} disabled={!goalDate || savingGoal} style={{
                  flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: goalDate ? 'pointer' : 'not-allowed',
                  background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-body)',
                  opacity: goalDate ? 1 : 0.5,
                }}>{savingGoal ? '저장중...' : '목표 날짜 저장'}</button>
                {hasGoal && (
                  <button onClick={() => setEditingGoal(false)} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>취소</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 실적현황 목표 섹션 — 선택한 베팅사이트들의 목표 날짜로부터 얼마나 이전까지의 입금 실적을 볼지 설정 */}
        <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              <TrendingUp size={12} /> 실적현황 목표
            </div>
            {hasPerfGoal && !editingPerf && (
              <button onClick={() => setEditingPerf(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Pencil size={10} /> 재설정
              </button>
            )}
          </div>

          {!editingPerf && hasPerfGoal ? (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {perfSiteNames.length > 0 ? perfSiteNames.join(', ') : '선택된 사이트'} · 목표 날짜로부터 {cashout!.perf_period === '2w' ? '2주' : '1개월'} 전까지 · 목표 {fmt(cashout!.perf_amount)}
            </div>
          ) : (
            <div>
              {sitesLoading ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>사이트 불러오는 중...</div>
              ) : selectableSites.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>베팅현황에 등록된 사이트가 없습니다.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {selectableSites.map(s => (
                    <button key={s.id} type="button" onClick={() => togglePerfSite(s.id)} style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-body)',
                      border: `1px solid ${perfSiteIds.includes(s.id) ? 'var(--gold-border)' : 'var(--border)'}`,
                      background: perfSiteIds.includes(s.id) ? 'var(--gold-bg)' : 'var(--bg-card)',
                      color: perfSiteIds.includes(s.id) ? 'var(--gold)' : 'var(--text-secondary)',
                    }}>{s.name}</button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>목표 날짜({hasGoal ? dayjs(goalDate).format('MM.DD') : '미설정'})로부터 얼마나 이전까지의 실적을 볼지</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <button type="button" onClick={() => setPerfPeriod('2w')} style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)',
                  border: `1px solid ${perfPeriod === '2w' ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: perfPeriod === '2w' ? 'var(--gold-bg)' : 'var(--bg-card)',
                  color: perfPeriod === '2w' ? 'var(--gold)' : 'var(--text-secondary)',
                }}>2주 전까지</button>
                <button type="button" onClick={() => setPerfPeriod('1m')} style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)',
                  border: `1px solid ${perfPeriod === '1m' ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: perfPeriod === '1m' ? 'var(--gold-bg)' : 'var(--bg-card)',
                  color: perfPeriod === '1m' ? 'var(--gold)' : 'var(--text-secondary)',
                }}>1개월 전까지</button>
              </div>
              <input style={{ ...inputSt, marginBottom: 8, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" placeholder="목표 실적 금액 (원)"
                value={perfAmount ? Number(perfAmount.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setPerfAmount(raw) }} />
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={savePerfGoal} disabled={perfSiteIds.length === 0 || !perfAmount || savingPerf} style={{
                  flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: perfSiteIds.length && perfAmount ? 'pointer' : 'not-allowed',
                  background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-body)',
                  opacity: perfSiteIds.length && perfAmount ? 1 : 0.5,
                }}>{savingPerf ? '저장중...' : '실적 목표 저장'}</button>
                {hasPerfGoal && (
                  <button onClick={() => setEditingPerf(false)} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>취소</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 쿨다운/목표 안내 */}
        {inCooldown && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 10, padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6 }}>
            다음 현금교환 가능일: {cooldownUntil!.format('YYYY.MM.DD')} (2주 쿨다운)
          </div>
        )}
        {!inCooldown && !goalReached && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6 }}>
            채굴 목표량({fmt(entry.target_point)})을 달성해야 현금교환이 가능합니다. (현재 {fmt(entry.current_point)})
          </div>
        )}

        {/* 교환 실행 */}
        <div style={labelSt}>교환할 금액 (현재가에서 차감)</div>
        <input style={{ ...inputSt, marginBottom: 4 }} inputMode="numeric" placeholder="0"
          disabled={!canExchange}
          value={amount ? Number(amount.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
          onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setAmount(raw) }} />
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 14 }}>현재가 {fmt(entry.current_point)} 중 최대 {fmt(entry.current_point)}까지</div>

        <button onClick={submitCashout} disabled={!canExchange || !amountValid || submitting} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '11px 0', borderRadius: 8, border: 'none', cursor: canExchange && amountValid ? 'pointer' : 'not-allowed',
          background: 'var(--purple)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)',
          opacity: canExchange && amountValid ? 1 : 0.5,
        }}>
          <DollarSign size={14} /> {submitting ? '처리중...' : '현금교환 실행'}
        </button>
      </div>
    </div>
  )
}

/** 대시보드 좌측에 얹는 채굴 현황 위젯. 전체 로직(오늘 데이터 로딩/자동 승계/추가/수정/삭제)은
 *  useMiningData 훅을 통해 Mining.tsx(채굴 탭)와 그대로 공유한다 — 달력/그래프는 여기선 생략. */
export default function MiningWidget() {
  const { today, entries, loading, knownSites, addEntry: addEntryToDb, updateField, deleteEntry: deleteEntryFromDb, cashouts, cashoutFor, setCashGoal, setAutoSet2w, setPerfGoal, doCashout } = useMiningData()

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [cashoutEntry, setCashoutEntry] = useState<MiningEntry | null>(null)
  const [perfProgress, setPerfProgress] = useState<Record<string, number>>({})

  // 실적현황: 목표(사이트/기간/금액)가 설정된 항목마다, 목표 날짜로부터 기간만큼 이전 ~ 오늘(또는 목표 날짜, 더 이른 쪽)까지의
  // 실제 입금(cashflows) 합계를 조회한다. cashouts가 바뀔 때마다 다시 계산한다.
  useEffect(() => {
    const targets = cashouts.filter(c => c.goal_date && c.perf_period && c.perf_site_ids?.length > 0)
    if (targets.length === 0) { setPerfProgress({}); return }
    (async () => {
      const results: Record<string, number> = {}
      for (const c of targets) {
        const goalDay = dayjs(c.goal_date!)
        const end = dayjs().isBefore(goalDay) ? dayjs() : goalDay
        const start = c.perf_period === '2w' ? goalDay.subtract(14, 'day') : goalDay.subtract(1, 'month')
        const { data } = await supabase.from('cashflows').select('amount_krw,amount')
          .eq('category', '베팅입금')
          .in('site_id', c.perf_site_ids)
          .gte('flow_date', start.format('YYYY-MM-DD'))
          .lte('flow_date', end.format('YYYY-MM-DD'))
        const sum = (data ?? []).reduce((a: number, cf: { amount_krw: number | null; amount: number }) => a + (cf.amount_krw ?? cf.amount), 0)
        results[c.site_name] = sum
      }
      setPerfProgress(results)
    })()
  }, [JSON.stringify(cashouts.map(c => ({ s: c.site_name, g: c.goal_date, p: c.perf_period, ids: c.perf_site_ids, a: c.perf_amount })))]) // eslint-disable-line react-hooks/exhaustive-deps

  type EditField = 'target' | 'current'
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null)
  const [editVal, setEditVal] = useState('')

  function startEdit(entry: MiningEntry, field: EditField) {
    setEditing({ id: entry.id, field })
    setEditVal(field === 'current' ? '' : String(entry.target_point))
  }
  function cancelEdit() { setEditing(null); setEditVal('') }

  async function pasteToEdit() {
    try {
      const text = await navigator.clipboard.readText()
      const digits = text.replace(/[^\d]/g, '')
      if (digits) setEditVal(digits)
    } catch { /* 클립보드 접근 실패 — 무시하고 직접 입력 */ }
  }

  async function addEntry() {
    if (!newName.trim() || saving) return
    setSaving(true)
    const startNum = Number(newStart.replace(/,/g, '')) || 0
    const targetNum = Number(newTarget.replace(/,/g, '')) || 0
    const result = await addEntryToDb(newName.trim(), startNum, targetNum)
    if (result === 'ok') {
      setNewName(''); setNewStart(''); setNewTarget('')
      setAddModalOpen(false)
    } else if (result === 'duplicate') {
      alert('오늘 이미 등록된 사이트입니다.')
    }
    setSaving(false)
  }

  async function saveEdit(entry: MiningEntry) {
    if (!editing || editing.id !== entry.id) return
    const num = Number(editVal.replace(/,/g, ''))
    if (Number.isNaN(num) || editVal === '') { cancelEdit(); return }
    const column = editing.field === 'target' ? 'target_point' : 'current_point'
    await updateField(entry, column, num)
    cancelEdit()
  }

  async function deleteEntry(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await deleteEntryFromDb(id)
  }

  const totals = entries.reduce((a, e) => a + Math.max(0, mined(e)), 0)
  const totalsTarget = entries.reduce((a, e) => a + e.target_point, 0)

  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div className="flex-between mb-10">
        <span className="card-title" style={{ margin: 0 }}>
          사이트 현황
          {entries.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
              <b style={{ color: 'var(--gold)', fontFamily: 'var(--font-num)' }}>{fmt(totals)}</b> / {fmt(totalsTarget)}
            </span>
          )}
        </span>
        <button onClick={() => setAddModalOpen(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
          <Plus size={11} /> 추가
        </button>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 0' }}>불러오는 중...</div>}
      {!loading && entries.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>
          사이트를 추가하면 오늘의 채굴 현황이 여기 표시됩니다.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        {entries.map(e => {
          const m = mined(e)
          // 목표량은 "현재 포인트 총량" 기준 — 오늘 오른 양(m)이 아니라 e.current_point를 target_point와 직접 비교한다
          const remaining = e.target_point - e.current_point
          const isExcess = e.target_point > 0 && remaining < 0
          const pct = e.target_point > 0 ? Math.min(100, Math.max(0, e.current_point / e.target_point * 100)) : 0
          const done = e.target_point > 0 && e.current_point >= e.target_point
          const isEditingCurrent = editing?.id === e.id && editing.field === 'current'
          const isEditingTarget = editing?.id === e.id && editing.field === 'target'

          // 채굴 눈금 게이지: 현금교환 목표 날짜가 설정돼 있으면 항상 14칸으로 나눠서 "목표 대비 현재 얼마나
          // 채웠는지"를 왼쪽부터 채운다 (하루 한 칸씩 순서대로 채우는 게 아니라 그냥 진행률 표시).
          // 색은 "2주 사이클 날짜대비 누적 달성률"로 정한다 (오늘 하루치 채굴량이 아니라 사이클 시작일부터
          // 오늘까지 경과한 날짜 비율만큼 목표를 채웠어야 한다고 보고 실제 달성치와 비교):
          // 150%+ 시안 · 120%+ 골드 · 100%+ 초록(날짜대비 목표 달성) · 80%+ 주황(달성 임박) · 그 외 빨강(많이 부족)
          const cashout = cashoutFor(e.site_name)
          const goalDate = cashout?.goal_date
          const remainingDays = goalDate ? Math.max(0, dayjs(goalDate).startOf('day').diff(dayjs().startOf('day'), 'day')) : 0
          // 눈금 개수는 남은 일수와 무관하게 항상 14(2주) 기준 고정 — 목표일이 며칠 남았든 같은 스케일로 보여줘야
          // 지금 얼마나 밀렸는지 한눈에 비교가 됨 (남은 일수로 눈금이 늘었다 줄었다 하면 기준이 흔들려서 비교가 안 됨)
          const TICK_COUNT = 14
          const tickCount = goalDate ? TICK_COUNT : 0
          const remainingAmount = Math.max(0, e.target_point - e.current_point)
          const requiredPerDay = remainingDays > 0 ? remainingAmount / remainingDays : remainingAmount
          // 색상은 "오늘 채굴량"이 아니라 2주 사이클 날짜대비 누적 달성률 기준 (사이클 시작 = 목표일 - 14일)
          const cycleStart = goalDate ? dayjs(goalDate).subtract(14, 'day') : null
          const elapsedDays = cycleStart ? Math.min(14, Math.max(0, dayjs().startOf('day').diff(cycleStart.startOf('day'), 'day'))) : 0
          const ratio = goalDate ? paceRatio(e.current_point, e.target_point, elapsedDays, 14) : 100
          const paceColor = paceColorForRatio(ratio)
          const filledCount = tickCount > 0 ? (pct / 100) * tickCount : 0
          const fullTicks = Math.floor(filledCount)
          const partialFill = filledCount - fullTicks

          return (
            <div key={e.id} style={{
              background: 'var(--bg-elevated)', border: `1px solid ${done ? 'var(--green-border)' : 'var(--border)'}`,
              borderRadius: 8, padding: '9px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{e.site_name}</span>
                  <button onClick={() => setCashoutEntry(e)} title="현금교환" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                    <DollarSign size={10} /> 현금교환
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {done && <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-border)', padding: '1px 5px', borderRadius: 4 }}>완료</span>}
                  <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                {isEditingCurrent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input autoFocus style={{ width: 120, background: 'var(--bg-card)', border: '1px solid var(--gold-border)', borderRadius: 5, padding: '3px 6px', fontSize: 16, fontWeight: 800, color: done ? 'var(--green)' : 'var(--gold)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                      inputMode="numeric" placeholder="붙여넣기/입력" value={editVal ? Number(editVal.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                      onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                      onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                    <button onClick={pasteToEdit} title="클립보드에서 붙여넣기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', display: 'flex' }}><ClipboardPaste size={13} /></button>
                    <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                  </div>
                ) : (
                  <span onClick={() => startEdit(e, 'current')} style={{ display: 'flex', alignItems: 'baseline', gap: 5, cursor: 'pointer' }}>
                    <span style={{ fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 800, color: done ? 'var(--green)' : 'var(--gold)' }}>{fmt(e.current_point)}</span>
                    {m !== 0 && (
                      <span style={{ fontFamily: 'var(--font-num)', fontSize: 11, fontWeight: 700, color: m > 0 ? 'var(--green)' : 'var(--red)' }}>
                        ({m > 0 ? '+' : ''}{fmt(m)})
                      </span>
                    )}
                    <Pencil size={9} style={{ color: 'var(--text-muted)' }} />
                  </span>
                )}
                {isEditingTarget ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input autoFocus style={{ width: 70, background: 'var(--bg-card)', border: '1px solid var(--gold-border)', borderRadius: 5, padding: '3px 5px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                      inputMode="numeric" value={editVal}
                      onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                      onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                    <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={12} /></button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={12} /></button>
                  </div>
                ) : (
                  <span onClick={() => startEdit(e, 'target')} style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-num)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                    / {fmt(e.target_point)} <Pencil size={9} />
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>채굴현황</span>
                {goalDate && (
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                    {remainingAmount <= 0 ? '목표 달성' : `하루 ${fmt(requiredPerDay)} 필요 · ${remainingDays}일 남음`}
                  </span>
                )}
              </div>
              {goalDate ? (
                <div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {Array.from({ length: tickCount }, (_, i) => {
                        const fillPct = i < fullTicks ? 100 : i === fullTicks ? partialFill * 100 : 0
                        return (
                          <div key={i} title={`목표까지 ${remainingDays}일`} style={{ flex: 1, height: 8, background: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fillPct}%`, background: paceColor, transition: 'width 0.3s' }} />
                          </div>
                        )
                      })}
                    </div>
                    {/* 오늘 위치 마커: 14일 사이클 중 경과일만큼 우측으로 이동. 14일 남음(경과 0일)=맨 왼쪽, 하루 지날 때마다 한 칸씩 우측 이동.
                        채워진 눈금(진행률)과 이 마커(경과 시간) 위치를 비교하면 지금 밀리고 있는지 바로 보인다 */}
                    <div title={`오늘 · 사이클 ${elapsedDays}/14일 경과`} style={{
                      position: 'absolute', top: -4, bottom: -4,
                      left: `${Math.min(100, Math.max(0, (elapsedDays / 14) * 100))}%`,
                      width: 2, background: 'var(--text-primary)', transform: 'translateX(-1px)',
                      transition: 'left 0.3s', pointerEvents: 'none',
                    }}>
                      <div style={{
                        position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)',
                        width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                        borderTop: '5px solid var(--text-primary)',
                      }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ height: 8, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, transition: 'width 0.4s ease',
                    background: done ? 'var(--green)' : 'linear-gradient(90deg, var(--orange), #FFAD42)' }} />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-num)', padding: '2px 7px', borderRadius: 999,
                  background: isExcess ? 'var(--green-bg)' : 'var(--bg-card)',
                  color: isExcess ? 'var(--green)' : 'var(--text-muted)',
                  border: `1px solid ${isExcess ? 'var(--green-border)' : 'var(--border)'}`,
                }}>
                  {isExcess ? `초과 ${fmt(-remaining)}` : `남음 ${fmt(Math.max(0, remaining))}`}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-num)', color: done ? 'var(--green)' : 'var(--text-secondary)' }}>{pct.toFixed(0)}%</span>
              </div>

              {/* 실적현황: 선택한 베팅사이트들의 (목표 날짜로부터 지정한 기간 이전까지) 입금 실적 진행률
                  채굴현황과 크기/간격/퍼센트 위치/눈금/색상 로직을 동일하게 맞춰서 최대한 붙여 보여준다 */}
              {(() => {
                const c = cashoutFor(e.site_name)
                if (!c?.perf_period || !(c.perf_site_ids?.length > 0) || !c.perf_amount) return null
                const progress = perfProgress[e.site_name] ?? 0
                const perfPct = c.perf_amount > 0 ? Math.min(100, Math.max(0, progress / c.perf_amount * 100)) : 0
                const perfDone = progress >= c.perf_amount
                const perfExcess = progress > c.perf_amount
                const perfRemaining = c.perf_amount - progress

                // 실적현황도 채굴현황과 동일하게 "기간 대비 경과일" 기준 페이스 색상 사용
                const periodDays = c.perf_period === '2w' ? 14 : dayjs(c.goal_date!).diff(dayjs(c.goal_date!).subtract(1, 'month'), 'day')
                const perfStart = c.perf_period === '2w' ? dayjs(c.goal_date!).subtract(14, 'day') : dayjs(c.goal_date!).subtract(1, 'month')
                const perfElapsedDays = Math.min(periodDays, Math.max(0, dayjs().startOf('day').diff(perfStart.startOf('day'), 'day')))
                const perfRatio = paceRatio(progress, c.perf_amount, perfElapsedDays, periodDays)
                const perfPaceColor = paceColorForRatio(perfRatio)

                const PERF_TICK_COUNT = 14 // 눈금 개수는 채굴현황과 동일하게 항상 14칸 고정 (보기 편하도록) — 다만 색상/페이스 계산은 아래 periodDays(1개월이면 실제 그 달 일수)를 그대로 써서 기간 자체는 정확하게 반영한다. 즉 눈금 칸 수와 "기간 계산"은 서로 다른 개념: 14칸은 그냥 표시용 스케일이고, 달성률 계산은 실제 2주/1개월 기준으로 정확히 이루어짐
                const perfFilledCount = (perfPct / 100) * PERF_TICK_COUNT
                const perfFullTicks = Math.floor(perfFilledCount)
                const perfPartialFill = perfFilledCount - perfFullTicks
                const perfDaysLeft = Math.max(0, periodDays - perfElapsedDays)
                const perfRequiredPerDay = perfDaysLeft > 0 ? Math.max(0, perfRemaining) / perfDaysLeft : Math.max(0, perfRemaining)
                // 체크 기준 종료일 — 목표일이 아직 안 지났으면 오늘까지, 지났으면 목표일까지 (효과 계산과 동일한 기준)
                const perfEnd = dayjs().isBefore(dayjs(c.goal_date!)) ? dayjs() : dayjs(c.goal_date!)

                return (
                  <div style={{ marginTop: 4, paddingTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)' }}>실적현황</span>
                      <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                        {perfRemaining <= 0 ? '목표 달성' : `하루 ${fmt(perfRequiredPerDay)} 필요 · ${perfDaysLeft}일 남음`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3, fontSize: 8, color: 'var(--text-muted)' }}>
                      <span>{perfStart.format('MM.DD')} ~ {perfEnd.format('MM.DD')} 기준</span>
                      <span><b style={{ color: 'var(--gold)', fontFamily: 'var(--font-num)' }}>{fmt(progress)}</b> / {fmt(c.perf_amount)}</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: PERF_TICK_COUNT }, (_, i) => {
                          const fillPct = i < perfFullTicks ? 100 : i === perfFullTicks ? perfPartialFill * 100 : 0
                          return (
                            <div key={i} style={{ flex: 1, height: 8, background: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fillPct}%`, background: perfPaceColor, transition: 'width 0.3s' }} />
                            </div>
                          )
                        })}
                      </div>
                      {/* 오늘 위치 마커 — 채굴현황과 동일하게 기간(2주/1개월) 대비 경과 비율만큼 우측 이동 */}
                      <div title={`오늘 · 기간 ${perfElapsedDays}/${periodDays}일 경과`} style={{
                        position: 'absolute', top: -4, bottom: -4,
                        left: `${Math.min(100, Math.max(0, (perfElapsedDays / periodDays) * 100))}%`,
                        width: 2, background: 'var(--text-primary)', transform: 'translateX(-1px)',
                        transition: 'left 0.3s', pointerEvents: 'none',
                      }}>
                        <div style={{
                          position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)',
                          width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                          borderTop: '5px solid var(--text-primary)',
                        }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-num)', padding: '2px 7px', borderRadius: 999,
                        background: perfExcess ? 'var(--green-bg)' : 'var(--bg-card)',
                        color: perfExcess ? 'var(--green)' : 'var(--text-muted)',
                        border: `1px solid ${perfExcess ? 'var(--green-border)' : 'var(--border)'}`,
                      }}>
                        {perfExcess ? `초과 ${fmt(-perfRemaining)}` : `남음 ${fmt(Math.max(0, perfRemaining))}`}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-num)', color: perfDone ? 'var(--green)' : 'var(--text-secondary)' }}>{perfPct.toFixed(0)}%</span>
                    </div>
                  </div>
                )
              })()}

            </div>
          )
        })}
      </div>

      {/* 사이트 추가 모달 */}
      {addModalOpen && (
        <div onClick={() => setAddModalOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={ev => ev.stopPropagation()} style={{
            width: '100%', maxWidth: 340, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {dayjs(today).format('MM.DD')} 채굴 사이트 추가
              </div>
              <button onClick={() => setAddModalOpen(false)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={labelSt}>사이트명</div>
              <input autoFocus style={inputSt} placeholder="사이트 이름"
                list="mining-widget-known-sites"
                value={newName} onChange={ev => setNewName(ev.target.value)}
                onKeyDown={ev => ev.key === 'Enter' && addEntry()} />
              <datalist id="mining-widget-known-sites">
                {knownSites.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={labelSt}>오늘 최초 시작 포인트</div>
              <input style={inputSt} inputMode="numeric" placeholder="0"
                value={newStart ? Number(newStart.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setNewStart(raw) }}
                onKeyDown={ev => ev.key === 'Enter' && addEntry()} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={labelSt}>목표량</div>
              <input style={inputSt} inputMode="numeric" placeholder="0"
                value={newTarget ? Number(newTarget.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setNewTarget(raw) }}
                onKeyDown={ev => ev.key === 'Enter' && addEntry()} />
            </div>

            <button onClick={addEntry} disabled={!newName.trim() || saving} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 0', borderRadius: 8, border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed',
              background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)',
              opacity: newName.trim() ? 1 : 0.5,
            }}>
              <Plus size={14} /> 채굴 시작
            </button>
          </div>
        </div>
      )}

      {/* 현금교환 모달 */}
      {cashoutEntry && (
        <CashoutModal
          entry={cashoutEntry}
          cashout={cashoutFor(cashoutEntry.site_name)}
          onClose={() => setCashoutEntry(null)}
          onSetGoal={goalDate => setCashGoal(cashoutEntry.site_name, goalDate)}
          onSetAuto={enabled => setAutoSet2w(cashoutEntry.site_name, enabled)}
          onSetPerfGoal={(siteIds, period, amount) => setPerfGoal(cashoutEntry.site_name, siteIds, period, amount)}
          onCashout={amount => doCashout(cashoutEntry, amount)}
        />
      )}
    </div>
  )
}

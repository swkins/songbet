import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, Check, X, ClipboardPaste, DollarSign, Target } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMiningData, fmtMining as fmt, minedOf as mined, periodLabel, periodStartFrom, type MiningEntry, type MiningCashout } from '../lib/useMining'

interface SelectableSite { id: string; name: string }

const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px',
  textTransform: 'uppercase', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

/** 채굴 사이트별 현금교환 모달: (1) 베팅현황에 있는 사이트(결산 전용 제외, 비활성 포함)를 골라
 *  실적(입금) 목표 설정, (2) 오늘 기준 과거 2주/1개월 동안의 실제 입금 합계로 달성 여부를 매번 새로 계산해서
 *  목표 달성 + 2주 쿨다운을 만족하면 현금교환 실행 — 현재가에서 교환액만큼 빼서 시작가/현재가를 새로 설정한다. */
function CashoutModal({ entry, cashout, onClose, onSetGoal, onCashout }: {
  entry: MiningEntry
  cashout: MiningCashout | undefined
  onClose: () => void
  onSetGoal: (siteIds: string[], amount: number, period: '2w' | '1m') => Promise<void>
  onCashout: (amount: number) => Promise<void>
}) {
  const [selectableSites, setSelectableSites] = useState<SelectableSite[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const hasGoal = !!cashout?.goal_period
  const [editingGoal, setEditingGoal] = useState(!hasGoal)
  const [selectedIds, setSelectedIds] = useState<string[]>(cashout?.goal_site_ids ?? [])
  const [goalAmount, setGoalAmount] = useState(cashout?.goal_amount ? String(cashout.goal_amount) : '')
  const [goalPeriod, setGoalPeriod] = useState<'2w' | '1m'>(cashout?.goal_period ?? '2w')
  const [savingGoal, setSavingGoal] = useState(false)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLoading, setProgressLoading] = useState(false)

  // 베팅현황(대시보드)에 있는 사이트 전부 — 결산 전용(settlement_only)으로 넘긴 사이트만 제외, 비활성(마감) 사이트는 포함
  useEffect(() => {
    (async () => {
      setSitesLoading(true)
      const { data } = await supabase.from('sites').select('id,name,active,settlement_only').order('sort_order')
      if (data) setSelectableSites((data as { id: string; name: string; active: boolean; settlement_only: boolean }[]).filter(s => !s.settlement_only).map(s => ({ id: s.id, name: s.name })))
      setSitesLoading(false)
    })()
  }, [])

  const now = dayjs()
  const goalSiteIds = cashout?.goal_site_ids ?? []
  const goalSiteNames = selectableSites.filter(s => goalSiteIds.includes(s.id)).map(s => s.name)
  const periodStart = hasGoal ? periodStartFrom(now, cashout!.goal_period!) : null

  // 실적 = 선택된 사이트들의 "오늘 기준 과거 기간(2주/1개월)" 실제 입금(cashflows) 합계 — 매번 다시 조회
  useEffect(() => {
    if (!hasGoal || goalSiteIds.length === 0) { setProgress(0); return }
    (async () => {
      setProgressLoading(true)
      const { data } = await supabase.from('cashflows').select('amount_krw,amount')
        .eq('category', '베팅입금')
        .in('site_id', goalSiteIds)
        .gte('flow_date', periodStart!.format('YYYY-MM-DD'))
        .lte('flow_date', now.format('YYYY-MM-DD'))
      const sum = (data ?? []).reduce((a: number, c: { amount_krw: number | null; amount: number }) => a + (c.amount_krw ?? c.amount), 0)
      setProgress(sum)
      setProgressLoading(false)
    })()
  }, [hasGoal, cashout?.goal_period, JSON.stringify(goalSiteIds)]) // eslint-disable-line react-hooks/exhaustive-deps

  const goalMet = hasGoal && progress >= (cashout?.goal_amount ?? 0)

  const cooldownUntil = cashout?.next_allowed_at ? dayjs(cashout.next_allowed_at) : null
  const inCooldown = !!cooldownUntil && now.isBefore(cooldownUntil)

  const canExchange = goalMet && !inCooldown
  const amountN = Number(amount.replace(/,/g, '')) || 0
  const amountValid = amountN > 0 && amountN <= entry.current_point

  function toggleSite(id: string) {
    setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function saveGoal() {
    if (selectedIds.length === 0 || !goalAmount || savingGoal) return
    setSavingGoal(true)
    await onSetGoal(selectedIds, Number(goalAmount.replace(/,/g, '')) || 0, goalPeriod)
    setSavingGoal(false)
    setEditingGoal(false)
  }

  async function submitCashout() {
    if (!canExchange || !amountValid || submitting) return
    if (!confirm(`${fmt(amountN)} 만큼 현금교환하시겠습니까? 현재가에서 차감되어 시작가/현재가가 ${fmt(entry.current_point - amountN)}(으)로 재설정됩니다.`)) return
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

        {/* 목표 섹션 */}
        <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
              <Target size={12} /> 현금교환 목표 (사이트 실적)
            </div>
            {hasGoal && !editingGoal && (
              <button onClick={() => setEditingGoal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Pencil size={10} /> 재설정
              </button>
            )}
          </div>

          {!editingGoal && hasGoal ? (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                {goalSiteNames.length > 0 ? goalSiteNames.join(', ') : '선택된 사이트'} · {periodLabel(cashout!.goal_period!)}
                {periodStart && <span style={{ color: 'var(--text-muted)' }}> ({periodStart.format('MM.DD')}~{now.format('MM.DD')})</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: goalMet ? 'var(--green)' : 'var(--text-primary)', fontFamily: 'var(--font-num)' }}>
                  {progressLoading ? '계산중...' : `${fmt(progress)} / ${fmt(cashout!.goal_amount)}`}
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, cashout!.goal_amount > 0 ? progress / cashout!.goal_amount * 100 : 0)}%`, background: goalMet ? 'var(--green)' : 'var(--gold)', borderRadius: 3 }} />
              </div>
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
                    <button key={s.id} type="button" onClick={() => toggleSite(s.id)} style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-body)',
                      border: `1px solid ${selectedIds.includes(s.id) ? 'var(--gold-border)' : 'var(--border)'}`,
                      background: selectedIds.includes(s.id) ? 'var(--gold-bg)' : 'var(--bg-card)',
                      color: selectedIds.includes(s.id) ? 'var(--gold)' : 'var(--text-secondary)',
                    }}>{s.name}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <button type="button" onClick={() => setGoalPeriod('2w')} style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)',
                  border: `1px solid ${goalPeriod === '2w' ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: goalPeriod === '2w' ? 'var(--gold-bg)' : 'var(--bg-card)',
                  color: goalPeriod === '2w' ? 'var(--gold)' : 'var(--text-secondary)',
                }}>2주</button>
                <button type="button" onClick={() => setGoalPeriod('1m')} style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)',
                  border: `1px solid ${goalPeriod === '1m' ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: goalPeriod === '1m' ? 'var(--gold-bg)' : 'var(--bg-card)',
                  color: goalPeriod === '1m' ? 'var(--gold)' : 'var(--text-secondary)',
                }}>1개월</button>
              </div>
              <input style={{ ...inputSt, marginBottom: 8, fontSize: 12, padding: '7px 9px' }} inputMode="numeric" placeholder="목표 실적 금액 (원)"
                value={goalAmount ? Number(goalAmount.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setGoalAmount(raw) }} />
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={saveGoal} disabled={selectedIds.length === 0 || !goalAmount || savingGoal} style={{
                  flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: selectedIds.length && goalAmount ? 'pointer' : 'not-allowed',
                  background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-body)',
                  opacity: selectedIds.length && goalAmount ? 1 : 0.5,
                }}>{savingGoal ? '저장중...' : '목표 저장'}</button>
                {hasGoal && (
                  <button onClick={() => setEditingGoal(false)} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>취소</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 쿨다운 안내 */}
        {inCooldown && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 10, padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6 }}>
            다음 현금교환 가능일: {cooldownUntil!.format('YYYY.MM.DD')} (2주 쿨다운)
          </div>
        )}
        {!inCooldown && hasGoal && !goalMet && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6 }}>
            목표 실적을 달성해야 현금교환이 가능합니다.
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
  const { today, entries, loading, knownSites, addEntry: addEntryToDb, updateField, deleteEntry: deleteEntryFromDb, cashoutFor, setCashoutGoal, doCashout } = useMiningData()

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [cashoutEntry, setCashoutEntry] = useState<MiningEntry | null>(null)

  type EditField = 'start' | 'target' | 'current'
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null)
  const [editVal, setEditVal] = useState('')

  function startEdit(entry: MiningEntry, field: EditField) {
    setEditing({ id: entry.id, field })
    setEditVal(field === 'current' ? '' : String(field === 'start' ? entry.start_point : entry.target_point))
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
    const column = editing.field === 'start' ? 'start_point' : editing.field === 'target' ? 'target_point' : 'current_point'
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
          채굴 현황
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
          const remaining = e.target_point - m
          const isExcess = e.target_point > 0 && remaining < 0
          const pct = e.target_point > 0 ? Math.min(100, Math.max(0, m / e.target_point * 100)) : 0
          const done = e.target_point > 0 && m >= e.target_point
          const isEditingCurrent = editing?.id === e.id && editing.field === 'current'
          const isEditingStart = editing?.id === e.id && editing.field === 'start'
          const isEditingTarget = editing?.id === e.id && editing.field === 'target'

          return (
            <div key={e.id} style={{
              background: 'var(--bg-elevated)', border: `1px solid ${done ? 'var(--green-border)' : 'var(--border)'}`,
              borderRadius: 8, padding: '9px 10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{e.site_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {done && <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-border)', padding: '1px 5px', borderRadius: 4 }}>완료</span>}
                  <button onClick={() => setCashoutEntry(e)} title="현금교환" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                    <DollarSign size={10} /> 현금교환
                  </button>
                  <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 800, color: done ? 'var(--green)' : 'var(--gold)' }}>{fmt(m)}</span>
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

              <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, transition: 'width 0.4s ease',
                  background: done ? 'var(--green)' : 'linear-gradient(90deg, var(--orange), #FFAD42)' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-num)', color: done ? 'var(--green)' : 'var(--text-secondary)' }}>{pct.toFixed(0)}%</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-num)', padding: '2px 7px', borderRadius: 999,
                  background: isExcess ? 'var(--green-bg)' : 'var(--bg-card)',
                  color: isExcess ? 'var(--green)' : 'var(--text-muted)',
                  border: `1px solid ${isExcess ? 'var(--green-border)' : 'var(--border)'}`,
                }}>
                  {isExcess ? `초과 ${fmt(-remaining)}` : `남음 ${fmt(Math.max(0, remaining))}`}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6, flexWrap: 'wrap' }}>
                {isEditingStart ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>시작</span>
                    <input autoFocus style={{ width: 110, background: 'var(--bg-card)', border: '1px solid var(--gold-border)', borderRadius: 5, padding: '4px 6px', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                      inputMode="numeric" value={editVal ? Number(editVal.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                      onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                      onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                    <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                  </div>
                ) : (
                  <span onClick={() => startEdit(e, 'start')} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>시작</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-num)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>{fmt(e.start_point)}</span>
                  </span>
                )}
                <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
                {isEditingCurrent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>현재</span>
                    <input autoFocus style={{ width: 120, background: 'var(--bg-card)', border: '1px solid var(--gold-border)', borderRadius: 5, padding: '4px 6px', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                      inputMode="numeric" placeholder="붙여넣기/입력" value={editVal ? Number(editVal.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
                      onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                      onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                    <button onClick={pasteToEdit} title="클립보드에서 붙여넣기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', display: 'flex' }}><ClipboardPaste size={13} /></button>
                    <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                  </div>
                ) : (
                  <span onClick={() => startEdit(e, 'current')} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>현재</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>{fmt(e.current_point)}</span>
                  </span>
                )}
              </div>
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
          onSetGoal={(siteIds, amount, period) => setCashoutGoal(cashoutEntry.site_name, siteIds, amount, period)}
          onCashout={amount => doCashout(cashoutEntry, amount)}
        />
      )}
    </div>
  )
}

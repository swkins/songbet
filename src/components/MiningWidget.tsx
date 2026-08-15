import { useState } from 'react'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, Check, X, ClipboardPaste, DollarSign, Target } from 'lucide-react'
import { useMiningData, fmtMining as fmt, minedOf as mined, type MiningEntry, type MiningCashout } from '../lib/useMining'

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
function CashoutModal({ entry, cashout, onClose, onSetGoal, onSetAuto, onCashout }: {
  entry: MiningEntry
  cashout: MiningCashout | undefined
  onClose: () => void
  onSetGoal: (goalDate: string) => Promise<void>
  onSetAuto: (enabled: boolean) => Promise<void>
  onCashout: (amount: number) => Promise<void>
}) {
  const hasGoal = !!cashout?.goal_date
  const [editingGoal, setEditingGoal] = useState(!hasGoal)
  const [goalDate, setGoalDate] = useState(cashout?.goal_date ?? dayjs().add(14, 'day').format('YYYY-MM-DD'))
  const [savingGoal, setSavingGoal] = useState(false)

  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const autoOn = cashout?.auto_set_2w ?? true

  const now = dayjs()
  const remainingDays = hasGoal ? Math.max(0, dayjs(cashout!.goal_date!).startOf('day').diff(now.startOf('day'), 'day')) : 0
  const m = mined(entry)
  const goalReached = entry.target_point > 0 && m >= entry.target_point

  const cooldownUntil = cashout?.next_allowed_at ? dayjs(cashout.next_allowed_at) : null
  const inCooldown = !!cooldownUntil && now.isBefore(cooldownUntil)
  const canExchange = goalReached && !inCooldown

  const amountN = Number(amount.replace(/,/g, '')) || 0
  const amountValid = amountN > 0 && amountN <= entry.current_point

  async function saveGoal() {
    if (!goalDate || savingGoal) return
    setSavingGoal(true)
    await onSetGoal(goalDate)
    setSavingGoal(false)
    setEditingGoal(false)
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

        {/* 쿨다운/목표 안내 */}
        {inCooldown && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 10, padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6 }}>
            다음 현금교환 가능일: {cooldownUntil!.format('YYYY.MM.DD')} (2주 쿨다운)
          </div>
        )}
        {!inCooldown && !goalReached && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6 }}>
            채굴 목표량({fmt(entry.target_point)})을 달성해야 현금교환이 가능합니다. (현재 {fmt(m)})
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
  const { today, entries, loading, knownSites, addEntry: addEntryToDb, updateField, deleteEntry: deleteEntryFromDb, cashoutFor, setCashGoal, setAutoSet2w, doCashout } = useMiningData()

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [cashoutEntry, setCashoutEntry] = useState<MiningEntry | null>(null)

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
          const isEditingTarget = editing?.id === e.id && editing.field === 'target'

          // 채굴 눈금 게이지: 현금교환 목표 날짜가 설정돼 있으면, 남은 일수만큼 눈금을 나누고
          // 눈금 하나(=하루)당 필요한 채굴량 = 목표량 ÷ 남은 일수. 현재 채굴량(m)만큼 눈금이 아래에서부터 채워진다.
          const cashout = cashoutFor(e.site_name)
          const goalDate = cashout?.goal_date
          const remainingDays = goalDate ? Math.max(0, dayjs(goalDate).startOf('day').diff(dayjs().startOf('day'), 'day')) : 0
          const tickCount = goalDate ? Math.max(1, remainingDays) : 0
          const perTick = goalDate && e.target_point > 0 ? e.target_point / tickCount : 0
          const filledTicks = perTick > 0 ? Math.min(tickCount, Math.floor(m / perTick)) : 0
          const partialFill = perTick > 0 ? Math.min(1, Math.max(0, (m - filledTicks * perTick) / perTick)) : 0

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

              {goalDate ? (
                <div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: tickCount }, (_, i) => {
                      const fillPct = i < filledTicks ? 100 : i === filledTicks ? partialFill * 100 : 0
                      return (
                        <div key={i} title={`${fmt(perTick)}/일`} style={{ flex: 1, height: 14, background: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${fillPct}%`, background: done ? 'var(--green)' : 'var(--gold)', transition: 'height 0.3s' }} />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>하루 {fmt(perTick)} · {tickCount}일 남음</div>
                </div>
              ) : (
                <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, transition: 'width 0.4s ease',
                    background: done ? 'var(--green)' : 'linear-gradient(90deg, var(--orange), #FFAD42)' }} />
                </div>
              )}

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
          onCashout={amount => doCashout(cashoutEntry, amount)}
        />
      )}
    </div>
  )
}

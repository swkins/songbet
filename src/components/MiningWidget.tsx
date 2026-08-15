import { useState } from 'react'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, Check, X, ClipboardPaste } from 'lucide-react'
import { useMiningData, fmtMining as fmt, minedOf as mined, type MiningEntry } from '../lib/useMining'

const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px',
  textTransform: 'uppercase', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

/** 대시보드 좌측에 얹는 채굴 현황 위젯. 전체 로직(오늘 데이터 로딩/자동 승계/추가/수정/삭제)은
 *  useMiningData 훅을 통해 Mining.tsx(채굴 탭)와 그대로 공유한다 — 달력/그래프는 여기선 생략. */
export default function MiningWidget() {
  const { today, entries, loading, knownSites, addEntry: addEntryToDb, updateField, deleteEntry: deleteEntryFromDb } = useMiningData()

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>시작</span>
                    <input autoFocus style={{ width: 70, background: 'var(--bg-card)', border: '1px solid var(--gold-border)', borderRadius: 5, padding: '3px 5px', fontSize: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                      inputMode="numeric" value={editVal}
                      onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                      onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                    <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={11} /></button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={11} /></button>
                  </div>
                ) : (
                  <span onClick={() => startEdit(e, 'start')} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>시작</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-num)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>{fmt(e.start_point)}</span>
                  </span>
                )}
                <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
                {isEditingCurrent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input autoFocus style={{ width: 90, background: 'var(--bg-card)', border: '1px solid var(--gold-border)', borderRadius: 5, padding: '4px 6px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                      inputMode="numeric" placeholder="붙여넣기/입력" value={editVal}
                      onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                      onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                    <button onClick={pasteToEdit} title="클립보드에서 붙여넣기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', display: 'flex' }}><ClipboardPaste size={12} /></button>
                    <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={12} /></button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={12} /></button>
                  </div>
                ) : (
                  <span onClick={() => startEdit(e, 'current')} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>현재</span>
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
    </div>
  )
}

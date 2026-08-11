import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import dayjs from 'dayjs'
import { Plus, Trash2, Pencil, Check, X, ClipboardPaste } from 'lucide-react'

interface MiningEntry {
  id: string
  created_at: string
  entry_date: string
  site_name: string
  start_point: number
  target_point: number
  current_point: number
  sort_order: number
}

const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px',
  textTransform: 'uppercase', marginBottom: 4,
}
const inputSt: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function Mining() {
  const today = dayjs().format('YYYY-MM-DD')

  const [entries, setEntries] = useState<MiningEntry[]>([])
  const [loading, setLoading] = useState(true)

  // 추가 폼
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)

  // 인라인 편집 (시작/목표/현재 포인트 공통)
  type EditField = 'start' | 'target' | 'current'
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null)
  const [editVal, setEditVal] = useState('')

  function startEdit(entry: MiningEntry, field: EditField) {
    setEditing({ id: entry.id, field })
    if (field === 'current') {
      setEditVal('') // 현재 포인트는 수정 시 빈칸으로 시작
    } else {
      setEditVal(String(field === 'start' ? entry.start_point : entry.target_point))
    }
  }
  function cancelEdit() { setEditing(null); setEditVal('') }

  async function pasteToEdit() {
    try {
      const text = await navigator.clipboard.readText()
      const digits = text.replace(/[^\d]/g, '')
      if (digits) setEditVal(digits)
    } catch {
      // 클립보드 접근 실패 (권한 거부 등) — 무시하고 직접 입력하도록 둔다
    }
  }

  useEffect(() => { loadEntries() }, [])

  async function loadEntries() {
    setLoading(true)
    const { data } = await supabase
      .from('mining_entries').select('*')
      .eq('entry_date', today)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (data) setEntries(data as MiningEntry[])
    setLoading(false)
  }

  // 사이트명 자동완성용 — 최근 30일 내 등장한 사이트명 목록
  const [knownSites, setKnownSites] = useState<string[]>([])
  useEffect(() => {
    (async () => {
      const from = dayjs().subtract(30, 'day').format('YYYY-MM-DD')
      const { data } = await supabase
        .from('mining_entries').select('site_name').gte('entry_date', from)
      if (data) {
        const names = Array.from(new Set(data.map((r: { site_name: string }) => r.site_name)))
        setKnownSites(names)
      }
    })()
  }, [])

  async function addEntry() {
    if (!newName.trim() || saving) return
    setSaving(true)
    const startNum = Number(newStart.replace(/,/g, '')) || 0
    const targetNum = Number(newTarget.replace(/,/g, '')) || 0
    const maxOrder = entries.reduce((a, e) => Math.max(a, e.sort_order), 0)
    const { data, error } = await supabase
      .from('mining_entries')
      .insert({
        entry_date: today,
        site_name: newName.trim(),
        start_point: startNum,
        target_point: targetNum,
        current_point: startNum,
        sort_order: maxOrder + 1,
      })
      .select().single()
    if (!error && data) {
      setEntries(prev => [...prev, data as MiningEntry])
      setNewName(''); setNewStart(''); setNewTarget('')
    } else if (error?.code === '23505') {
      alert('오늘 이미 등록된 사이트입니다.')
    }
    setSaving(false)
  }

  async function saveEdit(entry: MiningEntry) {
    if (!editing || editing.id !== entry.id) return
    const num = Number(editVal.replace(/,/g, ''))
    if (Number.isNaN(num) || editVal === '') { cancelEdit(); return }
    const column = editing.field === 'start' ? 'start_point' : editing.field === 'target' ? 'target_point' : 'current_point'
    const { data } = await supabase
      .from('mining_entries').update({ [column]: num }).eq('id', entry.id).select().single()
    if (data) setEntries(prev => prev.map(e => e.id === entry.id ? (data as MiningEntry) : e))
    cancelEdit()
  }

  async function deleteEntry(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('mining_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const totals = useMemo(() => {
    const mined = entries.reduce((a, e) => a + Math.max(0, e.current_point - e.start_point), 0)
    const target = entries.reduce((a, e) => a + e.target_point, 0)
    return { mined, target }
  }, [entries])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 58px)', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ═══ 좌: 추가 폼 ═══ */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '14px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
          {dayjs(today).format('MM.DD')} 채굴 추가
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={labelSt}>사이트명</div>
          <input style={inputSt} placeholder="사이트 이름"
            list="mining-known-sites"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEntry()} />
          <datalist id="mining-known-sites">
            {knownSites.map(n => <option key={n} value={n} />)}
          </datalist>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={labelSt}>오늘 최초 시작 포인트</div>
          <input style={inputSt} inputMode="numeric" placeholder="0"
            value={newStart ? Number(newStart.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
            onChange={e => { const raw = e.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setNewStart(raw) }}
            onKeyDown={e => e.key === 'Enter' && addEntry()} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={labelSt}>목표량</div>
          <input style={inputSt} inputMode="numeric" placeholder="0"
            value={newTarget ? Number(newTarget.replace(/,/g, '')).toLocaleString('ko-KR') : ''}
            onChange={e => { const raw = e.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setNewTarget(raw) }}
            onKeyDown={e => e.key === 'Enter' && addEntry()} />
        </div>

        <button onClick={addEntry} disabled={!newName.trim() || saving} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 0', borderRadius: 8, border: 'none', cursor: newName.trim() ? 'pointer' : 'not-allowed',
          background: 'var(--gold)', color: '#000', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)',
          opacity: newName.trim() ? 1 : 0.5,
        }}>
          <Plus size={14} /> 채굴 시작
        </button>

        {entries.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={labelSt}>오늘 합계</div>
            <div style={{ fontFamily: 'var(--font-num)', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>
              {fmt(totals.mined)} <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>/ {fmt(totals.target)}</span>
            </div>
            <div className="deposit-progress-bar" style={{ marginTop: 6 }}>
              <div className="deposit-progress-fill" style={{ width: `${totals.target > 0 ? Math.min(100, totals.mined / totals.target * 100) : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ 우: 사이트별 진행현황 ═══ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</div>}
        {!loading && entries.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
            왼쪽에서 사이트를 추가하면 오늘의 채굴 현황이 여기 표시됩니다.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map(e => {
            const mined = e.current_point - e.start_point
            const remaining = Math.max(0, e.target_point - mined)
            const pct = e.target_point > 0 ? Math.min(100, Math.max(0, mined / e.target_point * 100)) : 0
            const done = e.target_point > 0 && mined >= e.target_point
            const tickStep = 10000
            const tickCount = e.target_point > tickStep ? Math.floor(e.target_point / tickStep) : 0
            const isEditingTarget = editing?.id === e.id && editing.field === 'target'
            const isEditingStart = editing?.id === e.id && editing.field === 'start'
            const isEditingCurrent = editing?.id === e.id && editing.field === 'current'

            return (
              <div key={e.id} style={{
                background: 'var(--bg-card)', border: `1px solid ${done ? 'var(--green-border)' : 'var(--border)'}`,
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{e.site_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {done && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-border)', padding: '1px 6px', borderRadius: 4 }}>완료</span>}
                    <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 700, color: done ? 'var(--green)' : 'var(--gold)' }}>
                    {fmt(mined)}
                  </span>
                  {isEditingTarget ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/</span>
                      <input autoFocus style={{ width: 90, background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: '3px 6px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                        inputMode="numeric" value={editVal}
                        onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                        onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                      <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                      <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                    </div>
                  ) : (
                    <span onClick={() => startEdit(e, 'target')} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-num)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      / {fmt(e.target_point)} <Pencil size={10} />
                    </span>
                  )}
                </div>

                <div className="deposit-progress-bar" style={{ position: 'relative' }}>
                  <div className="deposit-progress-fill" style={{ width: `${pct}%`, background: done ? 'var(--green)' : undefined }} />
                  {Array.from({ length: tickCount }, (_, i) => i + 1).map(i => {
                    const tickPct = (tickStep * i / e.target_point) * 100
                    const passed = mined >= tickStep * i
                    return (
                      <div key={i} title={`${fmt(tickStep * i)}`} style={{
                        position: 'absolute', left: `${tickPct}%`, top: 0, bottom: 0, width: 1,
                        background: passed ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.35)',
                      }} />
                    )
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>
                    {pct.toFixed(0)}% · 남음 {fmt(remaining)}
                    {Math.floor(mined / tickStep) > 0 && (
                      <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 700 }}>· 1만 돌파 {Math.floor(mined / tickStep)}회</span>
                    )}
                  </span>
                  {isEditingStart ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>시작</span>
                      <input autoFocus style={{ width: 90, background: 'var(--bg-elevated)', border: '1px solid var(--gold-border)', borderRadius: 6, padding: '3px 6px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }}
                        inputMode="numeric" value={editVal}
                        onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                        onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                      <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                      <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                    </div>
                  ) : (
                    <span onClick={() => startEdit(e, 'start')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      시작 {fmt(e.start_point)} <Pencil size={9} />
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>현재 포인트</span>
                  {isEditingCurrent ? (
                    <>
                      <input autoFocus style={{ ...inputSt, padding: '5px 8px', fontSize: 12 }} inputMode="numeric"
                        placeholder="붙여넣기 또는 입력"
                        value={editVal}
                        onChange={ev => { const raw = ev.target.value.replace(/,/g, ''); if (raw === '' || /^\d+$/.test(raw)) setEditVal(raw) }}
                        onKeyDown={ev => ev.key === 'Enter' && saveEdit(e)} />
                      <button onClick={pasteToEdit} title="클립보드에서 붙여넣기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', display: 'flex' }}><ClipboardPaste size={14} /></button>
                      <button onClick={() => saveEdit(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={14} /></button>
                      <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(e.current_point)}</span>
                      <button onClick={() => startEdit(e, 'current')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><Pencil size={12} /></button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, BookOpen } from 'lucide-react'

/* ── 룰북 메모장 (대시보드 "룰북" 버튼 → 새창) ──
   종목별로 자유롭게 쓰는 메모장. 입력하면 잠시 뒤 자동 저장(rulebook_notes 테이블, sport가 키).
   기본 종목 탭 외에 직접 탭을 추가/삭제할 수도 있다. */

const FIXED_TABS: { key: string; label: string }[] = [
  { key: 'common', label: '공통' },
  { key: 'soccer', label: '⚽ 축구' },
  { key: 'baseball', label: '⚾ 야구' },
  { key: 'basketball', label: '🏀 농구' },
  { key: 'volleyball', label: '🏐 배구' },
  { key: 'esports', label: '🎮 LOL' },
  { key: 'hockey', label: '🏒 하키' },
  { key: 'casino', label: '🎰 카지노' },
  { key: 'other', label: '📋 기타' },
]
const FIXED_KEYS = new Set(FIXED_TABS.map(t => t.key))

export default function RulebookNotes() {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [customTabs, setCustomTabs] = useState<string[]>([])
  const [active, setActive] = useState('common')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ key: string; content: string } | null>(null)

  useEffect(() => {
    document.title = '룰북'
    ;(async () => {
      const { data } = await supabase.from('rulebook_notes').select('sport, content').order('sport')
      if (data) {
        const map: Record<string, string> = {}
        for (const r of data as { sport: string; content: string }[]) map[r.sport] = r.content
        setNotes(map)
        setCustomTabs(Object.keys(map).filter(k => !FIXED_KEYS.has(k)).sort((a, b) => a.localeCompare(b, 'ko')))
      }
      setLoading(false)
    })()
    // 창을 닫기 직전 아직 저장 안 된 내용이 있으면 바로 저장
    const flushOnLeave = () => { if (pending.current) void save(pending.current.key, pending.current.content) }
    window.addEventListener('beforeunload', flushOnLeave)
    return () => window.removeEventListener('beforeunload', flushOnLeave)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(key: string, content: string) {
    setStatus('saving')
    const { error } = await supabase.from('rulebook_notes').upsert({ sport: key, content, updated_at: new Date().toISOString() }, { onConflict: 'sport' })
    if (pending.current?.key === key && pending.current.content === content) pending.current = null
    setStatus(error ? 'error' : 'saved')
  }

  function change(content: string) {
    setNotes(p => ({ ...p, [active]: content }))
    pending.current = { key: active, content }
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    const key = active
    timer.current = setTimeout(() => save(key, content), 700)
  }

  function switchTab(key: string) {
    // 탭을 옮기기 전에 이전 탭의 저장 대기분을 바로 저장
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (pending.current) void save(pending.current.key, pending.current.content)
    setActive(key)
  }

  async function addTab() {
    const name = prompt('추가할 탭 이름')?.trim()
    if (!name) return
    if (FIXED_KEYS.has(name) || customTabs.includes(name)) { setActive(name); return }
    await supabase.from('rulebook_notes').upsert({ sport: name, content: '' }, { onConflict: 'sport' })
    setCustomTabs(p => [...p, name].sort((a, b) => a.localeCompare(b, 'ko')))
    setNotes(p => ({ ...p, [name]: '' }))
    switchTab(name)
  }

  async function deleteTab(name: string) {
    if (!confirm(`"${name}" 탭과 내용을 삭제할까요?`)) return
    if (pending.current?.key === name) { if (timer.current) clearTimeout(timer.current); pending.current = null }
    await supabase.from('rulebook_notes').delete().eq('sport', name)
    setCustomTabs(p => p.filter(t => t !== name))
    setNotes(p => { const n = { ...p }; delete n[name]; return n })
    if (active === name) setActive('common')
  }

  function clearActive() {
    if (!(notes[active] ?? '').trim()) return
    if (!confirm('이 탭의 내용을 모두 지울까요?')) return
    change('')
  }

  const tabs = [...FIXED_TABS, ...customTabs.map(t => ({ key: t, label: t }))]
  const activeLabel = tabs.find(t => t.key === active)?.label ?? active
  const tabBtn = (isActive: boolean): React.CSSProperties => ({
    padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
    border: isActive ? '1px solid var(--gold-border)' : '1px solid var(--border)',
    background: isActive ? 'var(--gold-bg)' : 'var(--bg-card)',
    color: isActive ? 'var(--gold)' : 'var(--text-secondary)',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BookOpen size={18} color="var(--gold)" />
        <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>룰북</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: status === 'error' ? 'var(--red)' : status === 'saving' ? 'var(--text-muted)' : 'var(--green)' }}>
          {status === 'saving' ? '저장중...' : status === 'saved' ? '저장됨' : status === 'error' ? '저장 실패' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tabs.map(t => (
          <div key={t.key} style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => switchTab(t.key)} style={tabBtn(active === t.key)}>{t.label}</button>
            {!FIXED_KEYS.has(t.key) && active === t.key && (
              <button onClick={() => deleteTab(t.key)} title="탭 삭제" style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex', padding: 4 }}><Trash2 size={13} /></button>
            )}
          </div>
        ))}
        <button onClick={addTab} title="탭 추가" style={{ ...tabBtn(false), display: 'flex', alignItems: 'center', gap: 4, borderStyle: 'dashed' }}><Plus size={13} /> 탭 추가</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{activeLabel}</span>
          <button onClick={clearActive} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--red-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontWeight: 700, padding: '3px 8px', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trash2 size={11} /> 내용 지우기
          </button>
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</div>
        ) : (
          <textarea
            value={notes[active] ?? ''}
            onChange={e => change(e.target.value)}
            placeholder={`${activeLabel} 룰을 자유롭게 적어두세요. 입력하면 자동 저장됩니다.`}
            spellCheck={false}
            style={{
              flex: 1, minHeight: 'calc(100vh - 190px)', width: '100%', boxSizing: 'border-box', resize: 'vertical',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 12,
              color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7, fontFamily: 'var(--font-body)', outline: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}

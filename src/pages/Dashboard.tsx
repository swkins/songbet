import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Todo, Cashflow, Site } from '../types'
import dayjs from 'dayjs'
import { Check, Plus, Trash2, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, RotateCcw, Calendar, X } from 'lucide-react'

function MiniCalendar({ checkedDates, onToggle }: { checkedDates: string[]; onToggle: (d: string) => void }) {
  const [viewMonth, setViewMonth] = useState(dayjs().startOf('month'))
  const today = dayjs().format('YYYY-MM-DD')
  const startDay = viewMonth.startOf('month').day()
  const cells: (string | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: viewMonth.daysInMonth() }, (_, i) => viewMonth.date(i + 1).format('YYYY-MM-DD')),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="mini-cal">
      <div className="mini-cal-header">
        <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex' }}
          onClick={() => setViewMonth(p => p.subtract(1, 'month'))}><ChevronLeft size={13}/></button>
        <span>{viewMonth.format('YYYY.MM')}</span>
        <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex' }}
          onClick={() => setViewMonth(p => p.add(1, 'month'))}><ChevronRight size={13}/></button>
      </div>
      <div className="mini-cal-grid">
        {['일','월','화','수','목','금','토'].map(d => <div key={d} className="mini-cal-dow">{d}</div>)}
        {cells.map((date, i) => date
          ? <div key={i} className={`mini-cal-day ${checkedDates.includes(date)?'checked':''} ${date===today?'today':''}`}
              onClick={() => onToggle(date)}>{dayjs(date).date()}</div>
          : <div key={i}/>
        )}
      </div>
    </div>
  )
}

const DEFAULT_CATEGORIES = ['베팅수익', '베팅손실', '급여', '식비', '교통', '쇼핑', '기타']

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')
  const [todos, setTodos] = useState<Todo[]>([])
  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [calOpenId, setCalOpenId] = useState<string | null>(null)

  // 카테고리 관리
  const [categories, setCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cashflow_categories') || 'null') || DEFAULT_CATEGORIES }
    catch { return DEFAULT_CATEGORIES }
  })
  const [newCategory, setNewCategory] = useState('')
  const [showCatManager, setShowCatManager] = useState(false)

  // 수입/지출 모달
  const [showCashModal, setShowCashModal] = useState(false)
  const [cashForm, setCashForm] = useState({
    flow_date: today, type: 'income' as 'income'|'expense',
    category: '', description: '', amount: '', site_id: '',
  })

  useEffect(() => { loadTodos(); loadCashflows(); loadSites() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }

  async function loadTodos() {
    const { data } = await supabase.from('todos').select('*').order('created_at')
    if (data) setTodos(data)
  }

  async function loadCashflows() {
    const { data } = await supabase.from('cashflows').select('*')
      .order('flow_date', { ascending: false }).limit(50)
    if (data) setCashflows(data)
  }

  function saveCategories(cats: string[]) {
    setCategories(cats)
    localStorage.setItem('cashflow_categories', JSON.stringify(cats))
  }

  function addCategory() {
    if (!newCategory.trim() || categories.includes(newCategory.trim())) return
    saveCategories([...categories, newCategory.trim()])
    setNewCategory('')
  }

  function removeCategory(cat: string) {
    saveCategories(categories.filter(c => c !== cat))
  }

  async function addTodo() {
    if (!newTodo.trim()) return
    const { data } = await supabase.from('todos')
      .insert({ todo_date: today, content: newTodo.trim(), done: false, check_count: 0, check_dates: [] })
      .select().single()
    if (data) { setTodos(p => [...p, data]); setNewTodo('') }
  }

  async function toggleTodo(todo: Todo) {
    const isChecked = todo.check_dates.includes(today)
    const newDates = isChecked ? todo.check_dates.filter(d => d !== today) : [...todo.check_dates, today]
    const { data } = await supabase.from('todos')
      .update({ done: !isChecked, check_dates: newDates, check_count: newDates.length })
      .eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }

  async function toggleCalDate(todo: Todo, date: string) {
    const has = todo.check_dates.includes(date)
    const newDates = has ? todo.check_dates.filter(d => d !== date) : [...todo.check_dates, date]
    const { data } = await supabase.from('todos')
      .update({ check_dates: newDates, check_count: newDates.length, done: newDates.includes(today) })
      .eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }

  async function resetTodo(todo: Todo) {
    if (!confirm(`"${todo.content}" 출석 기록을 초기화할까요?`)) return
    const { data } = await supabase.from('todos')
      .update({ check_dates: [], check_count: 0, done: false })
      .eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }

  async function deleteTodo(id: string) {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(p => p.filter(t => t.id !== id))
  }

  async function saveCashflow() {
    if (!cashForm.description || !cashForm.amount) return
    const { data } = await supabase.from('cashflows')
      .insert({
        flow_date: cashForm.flow_date, type: cashForm.type,
        category: cashForm.category, description: cashForm.description,
        amount: Number(cashForm.amount),
      }).select().single()
    if (data) {
      setCashflows(p => [data, ...p])
      setShowCashModal(false)
      setCashForm({ flow_date: today, type: 'income', category: '', description: '', amount: '', site_id: '' })
    }
  }

  async function deleteCashflow(id: string) {
    await supabase.from('cashflows').delete().eq('id', id)
    setCashflows(p => p.filter(c => c.id !== id))
  }

  const totalIncome  = cashflows.filter(c => c.type==='income').reduce((s,c) => s+c.amount, 0)
  const totalExpense = cashflows.filter(c => c.type==='expense').reduce((s,c) => s+c.amount, 0)
  const balance = totalIncome - totalExpense
  const todayChecked = todos.filter(t => t.check_dates.includes(today)).length
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="page">
      <div className="flex-between mb-24">
        <h1 className="page-title">대시보드</h1>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>{dayjs().format('YYYY.MM.DD')}</span>
      </div>

      {/* 요약 */}
      <div className="grid-3 mb-20">
        <div className="card stat-tile">
          <div className="stat-value profit-pos">{fmt(totalIncome)}</div>
          <div className="stat-label">총 수입</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-value profit-neg">{fmt(totalExpense)}</div>
          <div className="stat-label">총 지출</div>
        </div>
        <div className="card stat-tile">
          <div className={`stat-value ${balance>=0?'profit-pos':'profit-neg'}`}>
            {balance>=0?'+':''}{fmt(balance)}
          </div>
          <div className="stat-label">순 수지</div>
        </div>
      </div>

      {/* 할일 + 수입지출 */}
      <div style={{ display:'grid', gridTemplateColumns:'360px 1fr', gap:16 }}>

        {/* 오늘 할 일 */}
        <div className="card" style={{ alignSelf:'start' }}>
          <div className="flex-between mb-12">
            <span className="card-title" style={{ marginBottom:0 }}>오늘 할 일</span>
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{todayChecked}/{todos.length}</span>
          </div>

          {todos.length===0 && (
            <div className="empty" style={{ padding:'20px 0' }}>
              <div className="empty-icon">📋</div>할 일을 추가하세요
            </div>
          )}

          {todos.map(t => {
            const isChecked = t.check_dates.includes(today)
            return (
              <div key={t.id}>
                <div className="todo-item">
                  <div className={`todo-check ${isChecked?'done':''}`} onClick={() => toggleTodo(t)}>
                    {isChecked && <Check size={10} color="#000" strokeWidth={3}/>}
                  </div>
                  <span className={`todo-text ${isChecked?'done':''}`}>{t.content}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)', background:'var(--accent-light)', padding:'1px 6px', borderRadius:8, flexShrink:0 }}>
                    {t.check_count}회
                  </span>
                  <button className="btn btn-icon btn-ghost btn-sm"
                    style={calOpenId===t.id?{background:'var(--accent-light)',border:'none'}:{}}
                    onClick={() => setCalOpenId(calOpenId===t.id?null:t.id)}>
                    <Calendar size={12} color={calOpenId===t.id?'var(--accent)':'var(--text-muted)'}/>
                  </button>
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => resetTodo(t)}>
                    <RotateCcw size={12} color="var(--text-muted)"/>
                  </button>
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteTodo(t.id)}>
                    <Trash2 size={12} color="var(--text-muted)"/>
                  </button>
                </div>
                {calOpenId===t.id && (
                  <div style={{ paddingLeft:25, paddingTop:4, paddingBottom:10 }}>
                    <MiniCalendar checkedDates={t.check_dates} onToggle={d => toggleCalDate(t,d)}/>
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex-center gap-8 mt-12">
            <input className="form-input" placeholder="할 일 추가..."
              value={newTodo} onChange={e => setNewTodo(e.target.value)}
              onKeyDown={e => e.key==='Enter' && addTodo()}/>
            <button className="btn btn-primary btn-sm" onClick={addTodo} style={{ flexShrink:0 }}>
              <Plus size={13}/>
            </button>
          </div>
        </div>

        {/* 수입/지출 */}
        <div className="card">
          <div className="flex-between mb-16">
            <span className="card-title" style={{ marginBottom:0 }}>수입 / 지출</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCashModal(true)}>
              <Plus size={12}/> 추가
            </button>
          </div>

          {cashflows.length===0 && <div className="empty"><div className="empty-icon">💰</div>내역이 없습니다</div>}

          <div style={{ overflowY:'auto', maxHeight:500 }}>
            {cashflows.map(c => (
              <div key={c.id} className="flex-between" style={{ padding:'9px 0', borderBottom:'1px solid var(--border-light)' }}>
                <div className="flex-center gap-10">
                  <div style={{
                    width:28, height:28, borderRadius:7, flexShrink:0,
                    background: c.type==='income'?'var(--green-bg)':'var(--red-bg)',
                    border: `1px solid ${c.type==='income'?'#0D4028':'#4A1818'}`,
                    display:'flex', alignItems:'center', justifyContent:'center'
                  }}>
                    {c.type==='income'
                      ? <TrendingUp size={13} color="var(--green)"/>
                      : <TrendingDown size={13} color="var(--red)"/>}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>{c.description}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                      {c.flow_date}{c.category && ` · ${c.category}`}
                    </div>
                  </div>
                </div>
                <div className="flex-center gap-8">
                  <span className={c.type==='income'?'profit-pos':'profit-neg'}
                    style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>
                    {c.type==='income'?'+':'-'}{c.amount.toLocaleString()}
                  </span>
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteCashflow(c.id)}>
                    <Trash2 size={11} color="var(--text-muted)"/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 수입/지출 추가 모달 */}
      {showCashModal && (
        <div className="modal-overlay" onClick={() => setShowCashModal(false)}>
          <div className="modal" style={{ maxWidth:500 }} onClick={e => e.stopPropagation()}>
            <div className="flex-between mb-16">
              <div className="modal-title" style={{ marginBottom:0 }}>수입 / 지출 추가</div>
              {/* 카테고리 관리 토글 */}
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCatManager(p => !p)} style={{ fontSize:11 }}>
                카테고리 관리
              </button>
            </div>

            {/* 카테고리 관리 패널 */}
            {showCatManager && (
              <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:12, marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:8, letterSpacing:'0.5px' }}>카테고리 목록</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                  {categories.map(cat => (
                    <span key={cat} style={{
                      display:'inline-flex', alignItems:'center', gap:4,
                      padding:'3px 8px', borderRadius:4,
                      background:'var(--bg-card)', border:'1px solid var(--border)',
                      fontSize:12, color:'var(--text-primary)'
                    }}>
                      {cat}
                      <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex', padding:0 }}
                        onClick={() => removeCategory(cat)}>
                        <X size={11}/>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex-center gap-6">
                  <input className="form-input" placeholder="카테고리 추가..."
                    value={newCategory} onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && addCategory()}
                    style={{ fontSize:12, padding:'6px 10px' }}/>
                  <button className="btn btn-primary btn-sm" onClick={addCategory} style={{ flexShrink:0 }}>추가</button>
                </div>
              </div>
            )}

            {/* 수입/지출 선택 */}
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              {(['income','expense'] as const).map(t => (
                <button key={t} className={`btn ${cashForm.type===t?'btn-primary':'btn-ghost'}`}
                  onClick={() => setCashForm(p => ({ ...p, type:t }))} style={{ flex:1 }}>
                  {t==='income'?'💰 수입':'💸 지출'}
                </button>
              ))}
            </div>

            <div className="form-row form-row-2 mb-12">
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input type="date" className="form-input" value={cashForm.flow_date}
                  onChange={e => setCashForm(p => ({ ...p, flow_date:e.target.value }))}/>
              </div>
              <div className="form-group">
                <label className="form-label">카테고리</label>
                <select className="form-select" value={cashForm.category}
                  onChange={e => setCashForm(p => ({ ...p, category:e.target.value }))}>
                  <option value="">선택 안 함</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>

            {/* 사이트 선택 */}
            {sites.length > 0 && (
              <div className="form-group mb-12">
                <label className="form-label">관련 사이트 (선택)</label>
                <select className="form-select" value={cashForm.site_id}
                  onChange={e => setCashForm(p => ({ ...p, site_id:e.target.value }))}>
                  <option value="">없음</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group mb-12">
              <label className="form-label">내용</label>
              <input className="form-input" placeholder="내용을 입력하세요" value={cashForm.description}
                onChange={e => setCashForm(p => ({ ...p, description:e.target.value }))}/>
            </div>

            <div className="form-group">
              <label className="form-label">금액 (원)</label>
              <input type="number" className="form-input" placeholder="0" value={cashForm.amount}
                onChange={e => setCashForm(p => ({ ...p, amount:e.target.value }))}/>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCashModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveCashflow}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

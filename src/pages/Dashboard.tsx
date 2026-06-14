import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Todo, Cashflow } from '../types'
import dayjs from 'dayjs'
import { Check, Plus, Trash2, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, RotateCcw, Calendar } from 'lucide-react'

function MiniCalendar({
  checkedDates,
  onToggle,
}: {
  checkedDates: string[]
  onToggle: (date: string) => void
}) {
  const [viewMonth, setViewMonth] = useState(dayjs().startOf('month'))
  const today = dayjs().format('YYYY-MM-DD')

  const startDay = viewMonth.startOf('month').day() // 0=일
  const daysInMonth = viewMonth.daysInMonth()
  const cells: (string | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      viewMonth.date(i + 1).format('YYYY-MM-DD')
    ),
  ]
  // 6행 맞추기
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="mini-cal">
      <div className="mini-cal-header">
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          onClick={() => setViewMonth(p => p.subtract(1, 'month'))}
        >
          <ChevronLeft size={13} />
        </button>
        <span>{viewMonth.format('YYYY.MM')}</span>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          onClick={() => setViewMonth(p => p.add(1, 'month'))}
        >
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="mini-cal-grid">
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className="mini-cal-dow">{d}</div>
        ))}
        {cells.map((date, i) =>
          date ? (
            <div
              key={i}
              className={`mini-cal-day ${checkedDates.includes(date) ? 'checked' : ''} ${date === today ? 'today' : ''}`}
              onClick={() => onToggle(date)}
              title={date}
            >
              {dayjs(date).date()}
            </div>
          ) : (
            <div key={i} />
          )
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')

  const [todos, setTodos] = useState<Todo[]>([])
  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [showCashModal, setShowCashModal] = useState(false)
  const [calOpenId, setCalOpenId] = useState<string | null>(null)
  const [cashForm, setCashForm] = useState({
    flow_date: today,
    type: 'income' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
  })

  useEffect(() => { loadTodos(); loadCashflows() }, [])

  async function loadTodos() {
    const { data } = await supabase
      .from('todos')
      .select('*')
      .order('created_at')
    if (data) setTodos(data)
  }

  async function loadCashflows() {
    const { data } = await supabase
      .from('cashflows')
      .select('*')
      .order('flow_date', { ascending: false })
      .limit(30)
    if (data) setCashflows(data)
  }

  async function addTodo() {
    if (!newTodo.trim()) return
    const { data } = await supabase
      .from('todos')
      .insert({ todo_date: today, content: newTodo.trim(), done: false, check_count: 0, check_dates: [] })
      .select().single()
    if (data) { setTodos(p => [...p, data]); setNewTodo('') }
  }

  async function toggleTodo(todo: Todo) {
    const todayStr = today
    const alreadyCheckedToday = todo.check_dates.includes(todayStr)
    // done 토글 + 오늘 날짜 체크날짜에 추가(한번만)
    const newDone = !todo.done
    const newDates = alreadyCheckedToday
      ? todo.check_dates
      : newDone ? [...todo.check_dates, todayStr] : todo.check_dates
    const newCount = newDates.length

    const { data } = await supabase
      .from('todos')
      .update({ done: newDone, check_dates: newDates, check_count: newCount })
      .eq('id', todo.id)
      .select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }

  async function toggleCalDate(todo: Todo, date: string) {
    const has = todo.check_dates.includes(date)
    const newDates = has
      ? todo.check_dates.filter(d => d !== date)
      : [...todo.check_dates, date]
    const newCount = newDates.length
    // done: 오늘 날짜가 체크되어있으면 done=true
    const newDone = newDates.includes(today)

    const { data } = await supabase
      .from('todos')
      .update({ check_dates: newDates, check_count: newCount, done: newDone })
      .eq('id', todo.id)
      .select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }

  async function resetTodo(todo: Todo) {
    if (!confirm(`"${todo.content}" 출석 기록을 초기화할까요?`)) return
    const { data } = await supabase
      .from('todos')
      .update({ check_dates: [], check_count: 0, done: false })
      .eq('id', todo.id)
      .select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }

  async function deleteTodo(id: string) {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(p => p.filter(t => t.id !== id))
  }

  async function saveCashflow() {
    if (!cashForm.description || !cashForm.amount) return
    const { data } = await supabase
      .from('cashflows')
      .insert({
        flow_date: cashForm.flow_date,
        type: cashForm.type,
        category: cashForm.category,
        description: cashForm.description,
        amount: Number(cashForm.amount),
      })
      .select().single()
    if (data) {
      setCashflows(p => [data, ...p])
      setShowCashModal(false)
      setCashForm({ flow_date: today, type: 'income', category: '', description: '', amount: '' })
    }
  }

  async function deleteCashflow(id: string) {
    await supabase.from('cashflows').delete().eq('id', id)
    setCashflows(p => p.filter(c => c.id !== id))
  }

  const totalIncome = cashflows.filter(c => c.type === 'income').reduce((s, c) => s + c.amount, 0)
  const totalExpense = cashflows.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)
  const balance = totalIncome - totalExpense
  const todayTodos = todos.filter(t => t.check_dates.includes(today))
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="page">
      <div className="flex-between mb-24">
        <h1 className="page-title">대시보드</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {dayjs().format('YYYY년 MM월 DD일')}
        </span>
      </div>

      {/* 수입/지출 요약 */}
      <div className="grid-3 mb-16">
        <div className="card stat-tile">
          <div className="stat-value profit-pos">{fmt(totalIncome)}</div>
          <div className="stat-label">총 수입</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-value profit-neg">{fmt(totalExpense)}</div>
          <div className="stat-label">총 지출</div>
        </div>
        <div className="card stat-tile">
          <div className={`stat-value ${balance >= 0 ? 'profit-pos' : 'profit-neg'}`}>
            {balance >= 0 ? '+' : ''}{fmt(balance)}
          </div>
          <div className="stat-label">순 수지</div>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* 오늘 할 일 */}
        <div className="card">
          <div className="flex-between mb-12">
            <div className="card-title" style={{ marginBottom: 0 }}>오늘 할 일</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              오늘 완료 {todayTodos.length}/{todos.length}
            </span>
          </div>

          {todos.length === 0 && (
            <div className="empty">
              <div className="empty-icon">📋</div>
              할 일을 추가하세요
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {todos.map(t => (
              <div key={t.id}>
                <div className="todo-item">
                  {/* 체크박스 */}
                  <div
                    className={`todo-check ${t.check_dates.includes(today) ? 'done' : ''}`}
                    onClick={() => toggleTodo(t)}
                  >
                    {t.check_dates.includes(today) && <Check size={11} color="#fff" strokeWidth={3} />}
                  </div>

                  {/* 내용 */}
                  <span className={`todo-text ${t.check_dates.includes(today) ? 'done' : ''}`}>
                    {t.content}
                  </span>

                  {/* 누적 횟수 */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                    background: 'var(--accent-light)', padding: '2px 7px',
                    borderRadius: 10, flexShrink: 0
                  }}>
                    {t.check_count}회
                  </span>

                  {/* 달력 토글 */}
                  <button
                    className={`btn btn-icon btn-ghost btn-sm`}
                    style={calOpenId === t.id ? { background: 'var(--accent-light)', color: 'var(--accent)' } : {}}
                    onClick={() => setCalOpenId(calOpenId === t.id ? null : t.id)}
                    title="출석 달력"
                  >
                    <Calendar size={13} />
                  </button>

                  {/* 초기화 */}
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => resetTodo(t)} title="초기화">
                    <RotateCcw size={13} color="var(--text-muted)" />
                  </button>

                  {/* 삭제 */}
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteTodo(t.id)}>
                    <Trash2 size={13} color="var(--text-muted)" />
                  </button>
                </div>

                {/* 달력 펼치기 */}
                {calOpenId === t.id && (
                  <div style={{ paddingLeft: 28, paddingBottom: 12 }}>
                    <MiniCalendar
                      checkedDates={t.check_dates}
                      onToggle={(date) => toggleCalDate(t, date)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 할일 입력 */}
          <div className="flex-center gap-8 mt-16">
            <input
              className="form-input"
              placeholder="할 일 추가..."
              value={newTodo}
              onChange={e => setNewTodo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
            />
            <button className="btn btn-primary" onClick={addTodo} style={{ flexShrink: 0 }}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* 수입/지출 목록 */}
        <div className="card">
          <div className="flex-between mb-16">
            <div className="card-title" style={{ marginBottom: 0 }}>수입 / 지출</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCashModal(true)}>
              <Plus size={13} /> 추가
            </button>
          </div>

          {cashflows.length === 0 && (
            <div className="empty">
              <div className="empty-icon">💰</div>
              수입/지출 내역이 없습니다
            </div>
          )}

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {cashflows.map(c => (
              <div key={c.id} className="flex-between" style={{
                padding: '10px 0', borderBottom: '1px solid var(--border-light)'
              }}>
                <div className="flex-center gap-8">
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: c.type === 'income' ? 'var(--green-bg)' : 'var(--red-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {c.type === 'income'
                      ? <TrendingUp size={13} color="var(--green)" />
                      : <TrendingDown size={13} color="var(--red)" />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {c.flow_date}{c.category && ` · ${c.category}`}
                    </div>
                  </div>
                </div>
                <div className="flex-center gap-8">
                  <span className={c.type === 'income' ? 'profit-pos' : 'profit-neg'}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {c.type === 'income' ? '+' : '-'}{c.amount.toLocaleString()}
                  </span>
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteCashflow(c.id)}>
                    <Trash2 size={12} color="var(--text-muted)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 수입/지출 모달 */}
      {showCashModal && (
        <div className="modal-overlay" onClick={() => setShowCashModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">수입 / 지출 추가</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['income', 'expense'] as const).map(t => (
                <button key={t}
                  className={`btn ${cashForm.type === t ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setCashForm(p => ({ ...p, type: t }))}
                  style={{ flex: 1 }}>
                  {t === 'income' ? '수입' : '지출'}
                </button>
              ))}
            </div>
            <div className="form-row form-row-2 mb-12">
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input type="date" className="form-input"
                  value={cashForm.flow_date}
                  onChange={e => setCashForm(p => ({ ...p, flow_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">카테고리</label>
                <input className="form-input" placeholder="예: 베팅, 급여, 식비..."
                  value={cashForm.category}
                  onChange={e => setCashForm(p => ({ ...p, category: e.target.value }))} />
              </div>
            </div>
            <div className="form-group mb-12">
              <label className="form-label">내용</label>
              <input className="form-input" placeholder="내용을 입력하세요"
                value={cashForm.description}
                onChange={e => setCashForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">금액 (원)</label>
              <input type="number" className="form-input" placeholder="0"
                value={cashForm.amount}
                onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))} />
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

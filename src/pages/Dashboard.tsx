import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Todo, Cashflow } from '../types'
import dayjs from 'dayjs'
import { Check, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react'

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')

  const [todos, setTodos] = useState<Todo[]>([])
  const [cashflows, setCashflows] = useState<Cashflow[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [showCashModal, setShowCashModal] = useState(false)
  const [cashForm, setCashForm] = useState({
    flow_date: today,
    type: 'income' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
  })

  useEffect(() => {
    loadTodos()
    loadCashflows()
  }, [])

  async function loadTodos() {
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('todo_date', today)
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
      .insert({ todo_date: today, content: newTodo.trim(), done: false })
      .select()
      .single()
    if (data) { setTodos(p => [...p, data]); setNewTodo('') }
  }

  async function toggleTodo(id: string, done: boolean) {
    await supabase.from('todos').update({ done: !done }).eq('id', id)
    setTodos(p => p.map(t => t.id === id ? { ...t, done: !done } : t))
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
      .select()
      .single()
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
  const doneTodos = todos.filter(t => t.done).length

  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="page">
      <div className="flex-between mb-24">
        <h1 className="page-title">대시보드</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {dayjs().format('YYYY년 MM월 DD일 dddd')}
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
          <div className="flex-between mb-16">
            <div className="card-title" style={{ marginBottom: 0 }}>
              오늘 할 일
              {todos.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                  {doneTodos}/{todos.length}
                </span>
              )}
            </div>
          </div>

          {/* 진행바 */}
          {todos.length > 0 && (
            <div style={{
              height: 4, background: 'var(--border)', borderRadius: 2,
              marginBottom: 16, overflow: 'hidden'
            }}>
              <div style={{
                height: '100%', background: 'var(--green)',
                width: `${(doneTodos / todos.length) * 100}%`,
                borderRadius: 2, transition: 'width 0.3s'
              }} />
            </div>
          )}

          {todos.length === 0 && (
            <div className="empty">
              <div className="empty-icon">📋</div>
              오늘 할 일을 추가하세요
            </div>
          )}

          {todos.map(t => (
            <div key={t.id} className="todo-item">
              <div
                className={`todo-check ${t.done ? 'done' : ''}`}
                onClick={() => toggleTodo(t.id, t.done)}
              >
                {t.done && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>
              <span className={`todo-text ${t.done ? 'done' : ''}`}>{t.content}</span>
              <button
                className="btn btn-icon btn-ghost btn-sm"
                onClick={() => deleteTodo(t.id)}
              >
                <Trash2 size={13} color="var(--text-muted)" />
              </button>
            </div>
          ))}

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

          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {cashflows.map(c => (
              <div key={c.id} className="flex-between" style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--border-light)'
              }}>
                <div className="flex-center gap-8">
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: c.type === 'income' ? 'var(--green-bg)' : 'var(--red-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {c.type === 'income'
                      ? <TrendingUp size={13} color="var(--green)" />
                      : <TrendingDown size={13} color="var(--red)" />
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {c.flow_date} {c.category && `· ${c.category}`}
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
                <button
                  key={t}
                  className={`btn ${cashForm.type === t ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setCashForm(p => ({ ...p, type: t }))}
                  style={{ flex: 1 }}
                >
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

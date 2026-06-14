import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Todo, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, Check, X, ChevronLeft, ChevronRight, RotateCcw, Calendar, Settings, Banknote, CheckCircle, XCircle, MinusCircle } from 'lucide-react'

/* ── 마켓 정의 ── */
const SPORTS = [
  { value: 'soccer', label: '축구' }, { value: 'baseball', label: '야구' },
  { value: 'basketball', label: '농구' }, { value: 'volleyball', label: '배구' },
  { value: 'esports', label: 'e스포츠' }, { value: 'other', label: '기타' },
] as const

const MARKETS = [
  { value: 'moneyline',     label: '승',           pickType: 'none',   hint: '' },
  { value: 'handicap',      label: '핸디캡',        pickType: 'number', hint: '예: 2.5 또는 -1.5' },
  { value: 'over',          label: '오버',          pickType: 'number', hint: '예: 2.5' },
  { value: 'under',         label: '언더',          pickType: 'number', hint: '예: 2.5' },
  { value: 'correct_score', label: '정확한스코어',   pickType: 'text',   hint: '예: 2-1' },
  { value: 'other',         label: '기타',          pickType: 'text',   hint: '' },
] as const
type MarketValue = typeof MARKETS[number]['value']

function parseOdds(raw: string): number {
  const n = Number(raw.trim())
  if (isNaN(n) || n <= 0) return 0
  if (Number.isInteger(n) && n >= 100) return n / 100
  return n
}

function buildPickLabel(market: MarketValue, pick: string): string {
  if (!pick) return ''
  if (market === 'over') return `${pick} 오버`
  if (market === 'under') return `${pick} 언더`
  if (market === 'handicap') {
    const n = Number(pick)
    if (!isNaN(n)) return n < 0 ? `마이너스 핸디 ${Math.abs(n)}` : `핸디 ${n}`
  }
  return pick
}

interface SlipForm { sport: string; content: string; market: MarketValue; pick: string; odds: string }
const emptySlip = (): SlipForm => ({ sport: 'soccer', content: '', market: 'moneyline', pick: '', odds: '' })

/* ── 미니 달력 ── */
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
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }} onClick={() => setViewMonth(p => p.subtract(1, 'month'))}><ChevronLeft size={11} /></button>
        <span style={{ fontSize: 10 }}>{viewMonth.format('YYYY.MM')}</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }} onClick={() => setViewMonth(p => p.add(1, 'month'))}><ChevronRight size={11} /></button>
      </div>
      <div className="mini-cal-grid">
        {['일','월','화','수','목','금','토'].map(d => <div key={d} className="mini-cal-dow">{d}</div>)}
        {cells.map((date, i) => date
          ? <div key={i} className={`mini-cal-day ${checkedDates.includes(date) ? 'checked' : ''} ${date === today ? 'today' : ''}`} onClick={() => onToggle(date)}>{dayjs(date).date()}</div>
          : <div key={i} />
        )}
      </div>
    </div>
  )
}

/* ── 입금 모달 ── */
function DepositModal({
  site, onClose, onDone,
}: {
  site: Site
  onClose: () => void
  onDone: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')
  const num = Number(amount)
  /* 누적 입금액 = last_deposit(기존) + 새 입력액 미리보기 */
  const totalDeposit = site.last_deposit ?? 0
  const betDone = site.deposit_bet_done ?? 0
  const remaining = Math.max(0, totalDeposit - betDone)
  const pct = totalDeposit > 0 ? Math.min(100, Math.round(betDone / totalDeposit * 100)) : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Banknote size={16} color="var(--green)" />
          {site.name} 입금
        </div>

        {/* 현재 입금 현황 (입금 이력 있을 때만) */}
        {totalDeposit > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2 }}>현재까지 입금액</div>
                <div style={{ fontFamily: 'var(--font-num)', fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>
                  {totalDeposit.toLocaleString()}원
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2 }}>남은 롤링</div>
                <div style={{ fontFamily: 'var(--font-num)', fontSize: 15, fontWeight: 700, color: remaining > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                  {remaining.toLocaleString()}원
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <span>베팅 진행률</span>
              <span style={{ color: pct >= 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{pct}%</span>
            </div>
            <div className="deposit-progress-bar">
              <div className="deposit-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* 새 입금액 입력 */}
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {totalDeposit > 0 ? '추가 입금액 (원)' : '입금액 (원)'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <input
            className="form-input"
            type="number"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && num > 0 && onDone(num)}
            autoFocus
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            disabled={!num || num <= 0}
            onClick={() => num > 0 && onDone(num)}
            style={{ flexShrink: 0 }}
          >
            <Check size={12} /> 입금
          </button>
        </div>

        {/* 추가 입금시 예상 총합 미리보기 */}
        {num > 0 && totalDeposit > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            추가 후 총 입금액 → <span style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-num)' }}>{(totalDeposit + num).toLocaleString()}원</span>
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')

  const [sites, setSites] = useState<Site[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)
  const [slipForm, setSlipForm] = useState<SlipForm>(emptySlip())
  const [slipAmount, setSlipAmount] = useState('')

  const [showSiteMgr, setShowSiteMgr] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [depositSite, setDepositSite] = useState<Site | null>(null)

  /* 인라인 결과처리: 베팅 id → hover 상태 */
  const [hoverBetId, setHoverBetId] = useState<string | null>(null)

  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [calOpenId, setCalOpenId] = useState<string | null>(null)

  useEffect(() => { loadSites(); loadBets(); loadTodos() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) { setSites(data); if (data.length > 0 && !activeSiteId) setActiveSiteId(data[0].id) }
  }
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').order('bet_date', { ascending: false }).order('created_at', { ascending: false })
    if (data) setBets(data)
  }
  async function loadTodos() {
    const { data } = await supabase.from('todos').select('*').order('created_at')
    if (data) setTodos(data)
  }

  const activeSite = sites.find(s => s.id === activeSiteId) ?? null
  const currentMarket = MARKETS.find(m => m.value === slipForm.market)
  const oddsVal = parseOdds(slipForm.odds)

  function handleOddsChange(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setSlipForm(p => ({ ...p, odds: (Number(clean) / 100).toFixed(2) }))
    else setSlipForm(p => ({ ...p, odds: clean }))
  }

  /* 사이트 추가/삭제 */
  async function addSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase.from('sites').insert({
      name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
    }).select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'sites', record_id: data.id, after_data: data, description: `사이트 추가: ${data.name}` })
      setSites(p => [...p, data]); setActiveSiteId(data.id); setNewSiteName('')
    }
  }
  async function deleteSite(id: string) {
    const site = sites.find(s => s.id === id)
    if (!site || !confirm(`${site.name} 삭제?`)) return
    await logAction({ action_type: 'delete', table_name: 'sites', record_id: id, before_data: site as never, description: `사이트 삭제: ${site.name}` })
    await supabase.from('sites').delete().eq('id', id)
    setSites(p => p.filter(s => s.id !== id))
    if (activeSiteId === id) setActiveSiteId(sites.find(s => s.id !== id)?.id ?? null)
  }

  /* 입금: 누적 합산 방식 */
  async function doDeposit(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }
    const newTotal = (depositSite.last_deposit ?? 0) + amount
    const { data } = await supabase.from('sites').update({
      balance: depositSite.balance + amount,
      active: true,
      last_deposit: newTotal,
      /* deposit_bet_done은 유지 — 기존 베팅 진행분 그대로 */
    }).eq('id', depositSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 입금 +${amount.toLocaleString()}원 (누적 ${newTotal.toLocaleString()}원)` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      setActiveSiteId(depositSite.id)
    }
    setDepositSite(null)
  }

  /* 베팅 등록 */
  async function doBet() {
    if (!activeSite || !slipForm.content || !slipForm.odds || !slipAmount) return
    const stake = Number(slipAmount); if (!stake) return
    if (stake > activeSite.balance) { alert('잔액이 부족합니다'); return }
    const finalOdds = parseOdds(slipForm.odds); if (finalOdds <= 0) { alert('배당을 올바르게 입력하세요'); return }
    const pickLabel = buildPickLabel(slipForm.market, slipForm.pick)
    const { data: betData } = await supabase.from('bets').insert({
      bet_date: today, sport: slipForm.sport as Sport, league: '', match: slipForm.content,
      market: slipForm.market as Market, pick: pickLabel, odds: finalOdds, stake,
      result: 'pending' as BetResult, profit: 0, memo: '', site_id: activeSite.id,
    }).select().single()
    if (!betData) return
    const siteBefore = { ...activeSite }
    const newBetDone = (activeSite.deposit_bet_done ?? 0) + stake
    const { data: siteData } = await supabase.from('sites').update({
      balance: activeSite.balance - stake,
      rolling_done: activeSite.rolling_done + stake,
      deposit_bet_done: newBetDone,
    }).eq('id', activeSite.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${activeSite.name}] ${slipForm.content} / ${pickLabel} / ${stake.toLocaleString()}원` })
      await logAction({ action_type: 'update', table_name: 'sites', record_id: siteData.id, before_data: siteBefore as never, after_data: siteData as never, description: `[${activeSite.name}] 잔액 -${stake.toLocaleString()}원` })
      setBets(p => [betData, ...p]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      setSlipForm(emptySlip()); setSlipAmount('')
    }
  }

  /* 인라인 결과처리: 적중/실패/취소 */
  async function applyResult(bet: Bet, result: BetResult | 'cancel') {
    if (result === 'cancel') {
      /* 취소: 베팅 삭제 + 잔액/롤링 복원 */
      if (!confirm('베팅을 취소하고 롤링/잔액을 복원할까요?')) return
      const site = sites.find(s => s.id === bet.site_id)
      await logAction({ action_type: 'delete', table_name: 'bets', record_id: bet.id, before_data: bet as never, description: `베팅 취소: ${bet.match}` })
      await supabase.from('bets').delete().eq('id', bet.id)
      setBets(p => p.filter(b => b.id !== bet.id))
      if (site) {
        const siteBefore = { ...site }
        const restoredBetDone = Math.max(0, (site.deposit_bet_done ?? 0) - bet.stake)
        const restoredRolling = Math.max(0, site.rolling_done - bet.stake)
        const { data: sd } = await supabase.from('sites').update({
          balance: site.balance + bet.stake,
          rolling_done: restoredRolling,
          deposit_bet_done: restoredBetDone,
        }).eq('id', site.id).select().single()
        if (sd) {
          await logAction({ action_type: 'update', table_name: 'sites', record_id: sd.id, before_data: siteBefore as never, after_data: sd as never, description: `[${site.name}] 취소 복원 +${bet.stake.toLocaleString()}원` })
          setSites(p => p.map(s => s.id === sd.id ? sd : s))
        }
      }
      return
    }

    /* 적중/실패 결과 저장 */
    const profit = result === 'win' ? Math.round(bet.stake * (bet.odds - 1)) : result === 'loss' ? -bet.stake : 0
    const before = { ...bet }
    const { data } = await supabase.from('bets').update({ result, profit }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `결과: ${bet.match} → ${result === 'win' ? '적중' : '실패'}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
      const site = sites.find(s => s.id === bet.site_id)
      if (site && result === 'win') {
        const delta = bet.stake + profit
        const { data: sd } = await supabase.from('sites').update({ balance: site.balance + delta }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
    }
  }

  /* 할일 */
  async function addTodo() {
    if (!newTodo.trim()) return
    const { data } = await supabase.from('todos').insert({ todo_date: today, content: newTodo.trim(), done: false, check_count: 0, check_dates: [] }).select().single()
    if (data) { await logAction({ action_type: 'insert', table_name: 'todos', record_id: data.id, after_data: data, description: `할일 추가: ${data.content}` }); setTodos(p => [...p, data]); setNewTodo('') }
  }
  async function toggleTodo(todo: Todo) {
    const isChecked = todo.check_dates.includes(today)
    const newDates = isChecked ? todo.check_dates.filter(d => d !== today) : [...todo.check_dates, today]
    const { data } = await supabase.from('todos').update({ done: !isChecked, check_dates: newDates, check_count: newDates.length }).eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }
  async function toggleCalDate(todo: Todo, date: string) {
    const has = todo.check_dates.includes(date)
    const newDates = has ? todo.check_dates.filter(d => d !== date) : [...todo.check_dates, date]
    const { data } = await supabase.from('todos').update({ check_dates: newDates, check_count: newDates.length, done: newDates.includes(today) }).eq('id', todo.id).select().single()
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }
  async function resetTodo(todo: Todo) {
    if (!confirm(`"${todo.content}" 초기화?`)) return
    const { data } = await supabase.from('todos').update({ check_dates: [], check_count: 0, done: false }).eq('id', todo.id).select().single()
    if (data) { await logAction({ action_type: 'update', table_name: 'todos', record_id: data.id, before_data: todo as never, after_data: data as never, description: `할일 초기화: ${todo.content}` }); setTodos(p => p.map(t => t.id === todo.id ? data : t)) }
  }
  async function deleteTodo(todo: Todo) {
    await logAction({ action_type: 'delete', table_name: 'todos', record_id: todo.id, before_data: todo as never, description: `할일 삭제: ${todo.content}` })
    await supabase.from('todos').delete().eq('id', todo.id); setTodos(p => p.filter(t => t.id !== todo.id))
  }

  const rollingPct = (s: Site) => s.rolling_target > 0 ? Math.min(100, Math.round(s.rolling_done / s.rolling_target * 100)) : 0
  const depositPct = (s: Site) => {
    const dep = s.last_deposit ?? 0
    const done = s.deposit_bet_done ?? 0
    return dep > 0 ? Math.min(100, Math.round(done / dep * 100)) : 0
  }
  const depositRemaining = (s: Site) => Math.max(0, (s.last_deposit ?? 0) - (s.deposit_bet_done ?? 0))
  const betsBySite = (id: string) => bets.filter(b => b.site_id === id)
  /* 사이트 6개 기준으로 컬럼 수 고정 — 실제 사이트 수 사용, 최소 1 */
  const colCount = Math.max(1, sites.length)
  const todayChecked = todos.filter(t => t.check_dates.includes(today)).length

  return (
    <div className="page">
      <div className="dashboard-layout">

        {/* ── 좌: 베팅 슬립 + 오늘 할일 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 베팅 슬립 */}
          <div className="betslip-panel">
            <div className="betslip-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>BET SLIP</span>
              <button
                onClick={() => setShowSiteMgr(p => !p)}
                style={{
                  background: showSiteMgr ? 'var(--gold-bg)' : 'none',
                  border: `1px solid ${showSiteMgr ? 'var(--gold-border)' : 'transparent'}`,
                  borderRadius: 4, color: showSiteMgr ? 'var(--gold)' : 'var(--text-secondary)',
                  cursor: 'pointer', padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                }}
              >
                <Settings size={10} /> 사이트관리
              </button>
            </div>
            <div className="betslip-panel-body">

              {/* 사이트 관리 패널 */}
              {showSiteMgr && (
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 2 }}>사이트 목록</div>
                  {sites.map(s => (
                    <div key={s.id} className="site-mgr-row">
                      {/* 활성/비활성 닷 표시 */}
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: s.active ? 'var(--green)' : 'var(--border)',
                        boxShadow: s.active ? '0 0 4px var(--green)' : 'none',
                      }} />
                      <span className="site-mgr-name">{s.name}</span>
                      <button
                        onClick={() => deleteSite(s.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: 0.6, padding: 2, display: 'flex' }}
                      ><Trash2 size={11} /></button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                    <input
                      className="form-input"
                      style={{ fontSize: 11 }}
                      placeholder="사이트 이름"
                      value={newSiteName}
                      onChange={e => setNewSiteName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addSite()}
                    />
                    <button className="btn btn-primary btn-sm" onClick={addSite} style={{ flexShrink: 0 }}><Plus size={10} /></button>
                  </div>
                </div>
              )}

              {/* 사이트 선택 탭 — 활성/비활성 구분 */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {sites.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSiteId(s.id)}
                    style={{
                      padding: '3px 10px', borderRadius: 20, position: 'relative',
                      border: `1px solid ${activeSiteId === s.id ? 'var(--gold)' : s.active ? 'var(--green-border)' : 'var(--border)'}`,
                      background: activeSiteId === s.id ? 'var(--gold-bg)' : s.active ? 'rgba(0,232,122,0.06)' : 'transparent',
                      color: activeSiteId === s.id ? 'var(--gold)' : s.active ? 'var(--green)' : 'var(--text-muted)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                    }}
                  >
                    {s.active && activeSiteId !== s.id && (
                      <span style={{ position: 'absolute', top: -2, right: -2, width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 4px var(--green)' }} />
                    )}
                    {s.name}
                  </button>
                ))}
              </div>

              {/* 선택된 사이트 잔액/롤링 */}
              {activeSite && (
                <div style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: `1px solid ${activeSite.active ? 'var(--green-border)' : 'var(--border)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 1 }}>잔액</div>
                      <div className={activeSite.balance >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 15 }}>
                        {activeSite.balance.toLocaleString()}원
                      </div>
                    </div>
                    {activeSite.last_deposit > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 1 }}>남은 롤링</div>
                        <div style={{ fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 700, color: depositRemaining(activeSite) > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                          {depositRemaining(activeSite).toLocaleString()}원
                        </div>
                      </div>
                    )}
                  </div>
                  {activeSite.last_deposit > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 3 }}>
                        <span>베팅 진행률</span>
                        <span style={{ color: depositPct(activeSite) >= 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{depositPct(activeSite)}%</span>
                      </div>
                      <div className="deposit-progress-bar">
                        <div className="deposit-progress-fill" style={{ width: `${depositPct(activeSite)}%` }} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 폼: 종목 + 내용 */}
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 6 }}>
                <div className="form-group">
                  <label className="form-label">종목</label>
                  <select className="form-select" style={{ fontSize: 12 }} value={slipForm.sport} onChange={e => setSlipForm(p => ({ ...p, sport: e.target.value }))}>
                    {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">내용</label>
                  <input className="form-input" style={{ fontSize: 12 }} placeholder="맨시티 vs 아스날" value={slipForm.content} onChange={e => setSlipForm(p => ({ ...p, content: e.target.value }))} />
                </div>
              </div>

              {/* 폼: 마켓 + 픽 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div className="form-group">
                  <label className="form-label">마켓</label>
                  <select className="form-select" style={{ fontSize: 12 }} value={slipForm.market} onChange={e => setSlipForm(p => ({ ...p, market: e.target.value as MarketValue, pick: '' }))}>
                    {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">픽 <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--text-muted)' }}>{currentMarket?.pickType === 'none' ? '(없음)' : '(선택)'}</span></label>
                  {currentMarket?.pickType === 'none'
                    ? <input className="form-input" disabled style={{ opacity: 0.3, fontSize: 12 }} value="" readOnly />
                    : <input className="form-input" style={{ fontSize: 12 }} placeholder={currentMarket?.hint} type={currentMarket?.pickType === 'number' ? 'number' : 'text'} step="0.5" value={slipForm.pick} onChange={e => setSlipForm(p => ({ ...p, pick: e.target.value }))} />
                  }
                </div>
              </div>

              {slipForm.pick && currentMarket?.pickType !== 'none' && (
                <div style={{ fontSize: 10, color: 'var(--gold)', padding: '3px 7px', background: 'var(--gold-bg)', borderRadius: 4, border: '1px solid var(--gold-border)' }}>
                  ↳ {buildPickLabel(slipForm.market, slipForm.pick)}
                </div>
              )}

              {/* 폼: 배당 + 금액 + 베팅버튼 한 줄 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div className="form-group">
                  <label className="form-label">배당 {slipForm.odds && oddsVal > 0 && <span style={{ color: 'var(--gold)', fontWeight: 700 }}>→ {oddsVal.toFixed(2)}</span>}</label>
                  <input className="form-input" style={{ fontSize: 12 }} placeholder="125 = 1.25" value={slipForm.odds}
                    onChange={e => handleOddsChange(e.target.value)}
                    onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setSlipForm(p => ({ ...p, odds: n.toFixed(2) })) }} />
                </div>
                <div className="form-group">
                  <label className="form-label">금액 (원)</label>
                  {/* 금액 + 베팅버튼 나란히 */}
                  <div style={{ display: 'flex', gap: 5 }}>
                    <input
                      className="form-input"
                      style={{ fontSize: 12 }}
                      type="number"
                      placeholder="베팅액"
                      value={slipAmount}
                      onChange={e => setSlipAmount(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doBet()}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ flexShrink: 0, padding: '0 10px', fontSize: 11 }}
                      onClick={doBet}
                    >
                      <Check size={11} />
                    </button>
                  </div>
                </div>
              </div>

              {oddsVal > 0 && slipAmount && Number(slipAmount) > 0 && (
                <div style={{ padding: '6px 10px', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
                  수익 <strong className="profit-pos">+{Math.round(Number(slipAmount) * (oddsVal - 1)).toLocaleString()}</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>반환 {Math.round(Number(slipAmount) * oddsVal).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* 오늘 할 일 */}
          <div className="card">
            <div className="flex-between mb-10">
              <span className="card-title" style={{ margin: 0 }}>오늘 할 일</span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{todayChecked}/{todos.length}</span>
            </div>
            {todos.length === 0 && <div className="empty" style={{ padding: '14px 0' }}><div className="empty-icon">📋</div>추가하세요</div>}
            {todos.map(t => {
              const isChecked = t.check_dates.includes(today)
              return (
                <div key={t.id}>
                  <div className="todo-item">
                    <div className={`todo-check ${isChecked ? 'done' : ''}`} onClick={() => toggleTodo(t)}>
                      {isChecked && <Check size={8} color="#000" strokeWidth={3} />}
                    </div>
                    <span className={`todo-text ${isChecked ? 'done' : ''}`}>{t.content}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', padding: '0 5px', borderRadius: 6, flexShrink: 0 }}>{t.check_count}회</span>
                    <button className="btn btn-icon btn-ghost btn-sm" style={calOpenId === t.id ? { background: 'var(--gold-bg)', border: '1px solid var(--gold-border)' } : {}} onClick={() => setCalOpenId(calOpenId === t.id ? null : t.id)}>
                      <Calendar size={10} color={calOpenId === t.id ? 'var(--gold)' : 'var(--text-secondary)'} />
                    </button>
                    <button className="btn btn-icon btn-ghost btn-sm" onClick={() => resetTodo(t)}><RotateCcw size={10} color="var(--text-secondary)" /></button>
                    <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteTodo(t)}><Trash2 size={10} color="var(--text-secondary)" /></button>
                  </div>
                  {calOpenId === t.id && <div style={{ paddingLeft: 22, paddingBottom: 8, paddingTop: 4 }}><MiniCalendar checkedDates={t.check_dates} onToggle={d => toggleCalDate(t, d)} /></div>}
                </div>
              )
            })}
            <div className="flex-center gap-6 mt-10">
              <input className="form-input" style={{ fontSize: 12 }} placeholder="할 일 추가..." value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} />
              <button className="btn btn-primary btn-sm" onClick={addTodo} style={{ flexShrink: 0 }}><Plus size={11} /></button>
            </div>
          </div>
        </div>

        {/* ── 우: 베팅 현황 (6컬럼 고정 공간) ── */}
        <div style={{ minWidth: 0 }}>
          <div className="flex-between mb-10">
            <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
          </div>

          {sites.length === 0 ? (
            <div className="card"><div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하세요</div></div>
          ) : (
            /* 6컬럼 기준 고정 너비 격자 — 사이트 6개까지 균등 배분 */
            <div className="site-grid" style={{ gridTemplateColumns: `repeat(6, 1fr)` }}>
              {/* 사이트 헤더 6칸 (빈 칸 포함) */}
              {Array.from({ length: 6 }).map((_, i) => {
                const site = sites[i]
                if (!site) return (
                  <div key={`empty-head-${i}`} className="site-col-head site-col-empty">
                    <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>—</span>
                  </div>
                )
                const dep = site.last_deposit ?? 0
                const hasDeposit = dep > 0
                return (
                  <div key={site.id} className={`site-col-head ${site.active ? 'site-col-active' : ''}`}>
                    <button
                      className={`site-deposit-btn ${hasDeposit ? 'has-deposit' : ''}`}
                      title={hasDeposit ? `입금: ${dep.toLocaleString()}원` : '입금'}
                      onClick={() => setDepositSite(site)}
                    >
                      <Banknote size={10} />
                    </button>
                    <span style={{ display: 'block', paddingLeft: 20, paddingRight: 14, fontSize: 11 }}>{site.name}</span>
                    <button onClick={() => deleteSite(site.id)} style={{ position: 'absolute', top: 3, right: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.4, padding: 1, display: 'flex' }}><X size={9} /></button>
                  </div>
                )
              })}

              {/* 잔액 행 */}
              {Array.from({ length: 6 }).map((_, i) => {
                const site = sites[i]
                if (!site) return <div key={`empty-bal-${i}`} className="site-balance-cell site-col-empty" />
                const pct = depositPct(site)
                const rem = depositRemaining(site)
                return (
                  <div key={site.id} className={`site-balance-cell ${site.active ? 'site-bal-active' : ''}`}>
                    <div
                      className={`site-balance-num ${site.balance >= 0 ? 'profit-pos' : 'profit-neg'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setActiveSiteId(site.id)}
                    >
                      {site.balance.toLocaleString()}
                    </div>
                    {(site.last_deposit ?? 0) > 0 && (
                      <div style={{ width: '100%', marginTop: 3 }}>
                        <div className="deposit-progress-bar">
                          <div className="deposit-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginTop: 2 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{rem.toLocaleString()}</span>
                          <span style={{ color: pct >= 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{pct}%</span>
                        </div>
                      </div>
                    )}
                    {site.rolling_target > 0 && (
                      <div style={{ width: '100%', marginTop: 2 }}>
                        <div className="rolling-bar"><div className="rolling-fill" style={{ width: `${rollingPct(site)}%` }} /></div>
                        <div style={{ fontSize: 8, color: 'var(--gold)', textAlign: 'center', marginTop: 1 }}>롤링 {rollingPct(site)}%</div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 베팅 목록 행 */}
              {(() => {
                const maxRows = Math.max(...sites.map(s => betsBySite(s.id).length), 1)
                return Array.from({ length: maxRows }).map((_, rowIdx) =>
                  Array.from({ length: 6 }).map((__, colIdx) => {
                    const site = sites[colIdx]
                    if (!site) return <div key={`empty-bet-${colIdx}-${rowIdx}`} className="site-bets-col site-col-empty" />
                    const bet = betsBySite(site.id)[rowIdx]
                    const isHover = hoverBetId === bet?.id
                    return (
                      <div key={`${site.id}-${rowIdx}`} className="site-bets-col">
                        {bet ? (
                          <div
                            className={`site-bet-entry ${bet.result === 'win' ? 'win-entry' : bet.result === 'loss' ? 'loss-entry' : ''}`}
                            onMouseEnter={() => setHoverBetId(bet.id)}
                            onMouseLeave={() => setHoverBetId(null)}
                          >
                            <div className="site-bet-match">
                              {bet.match}
                              {bet.pick && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}> {bet.pick}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                {bet.result === 'pending' ? (
                                  /* 대기 중: hover 시 결과 아이콘, 평시엔 대기 배지 */
                                  isHover ? (
                                    <>
                                      <button
                                        title="적중"
                                        onClick={() => applyResult(bet, 'win')}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', color: 'var(--green)' }}
                                      ><CheckCircle size={13} /></button>
                                      <button
                                        title="실패"
                                        onClick={() => applyResult(bet, 'loss')}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', color: 'var(--red)' }}
                                      ><XCircle size={13} /></button>
                                      <button
                                        title="취소 (롤링 복원)"
                                        onClick={() => applyResult(bet, 'cancel')}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', color: 'var(--text-secondary)' }}
                                      ><MinusCircle size={13} /></button>
                                    </>
                                  ) : (
                                    <span className="badge badge-pending" style={{ fontSize: 9, padding: '1px 4px' }}>대기</span>
                                  )
                                ) : (
                                  /* 결과 확정 */
                                  <span className={`badge badge-${bet.result}`} style={{ fontSize: 9, padding: '1px 4px' }}>
                                    {bet.result === 'win' ? '적중' : bet.result === 'loss' ? '실패' : '적특'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {bet.result !== 'pending' && (
                              <div style={{ fontSize: 9, marginTop: 1, fontFamily: 'var(--font-num)', fontWeight: 700 }} className={bet.profit >= 0 ? 'profit-pos' : 'profit-neg'}>
                                {bet.profit >= 0 ? '+' : ''}{bet.profit.toLocaleString()}원
                              </div>
                            )}
                          </div>
                        ) : <div style={{ height: 16 }} />}
                      </div>
                    )
                  })
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 입금 모달 */}
      {depositSite && (
        <DepositModal
          site={depositSite}
          onClose={() => setDepositSite(null)}
          onDone={doDeposit}
        />
      )}
    </div>
  )
}

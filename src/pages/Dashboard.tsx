import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Todo, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import {
  Plus, Trash2, Check, X, ChevronLeft, ChevronRight,
  RotateCcw, Calendar, Settings, Banknote, LogOut,
  CheckCircle, XCircle, MinusCircle, Gift, GripVertical, DollarSign,
} from 'lucide-react'

const SPORTS = [
  { value: 'soccer',     label: '축구' },
  { value: 'baseball',   label: '야구' },
  { value: 'basketball', label: '농구' },
  { value: 'volleyball', label: '배구' },
  { value: 'esports',    label: 'e스포츠' },
  { value: 'other',      label: '기타' },
] as const

const MARKETS = [
  { value: 'moneyline',     label: '승',         pickType: 'none',   hint: '' },
  { value: 'handicap',      label: '핸디캡',      pickType: 'number', hint: '예: 2.5 또는 -1.5' },
  { value: 'over',          label: '오버',        pickType: 'number', hint: '예: 2.5' },
  { value: 'under',         label: '언더',        pickType: 'number', hint: '예: 2.5' },
  { value: 'correct_score', label: '정확한스코어', pickType: 'text',   hint: '예: 2-1' },
  { value: 'other',         label: '기타',        pickType: 'text',   hint: '' },
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

/* ── 인라인 빠른베팅 폼 상태 ── */
interface QuickBetState {
  siteId: string
  sport: string
  content: string
  odds: string
  amount: string
}

/* ── 환율 fetch (하루 1회 캐시) ── */
async function getUsdKrwRate(): Promise<number> {
  const today = dayjs().format('YYYY-MM-DD')
  const { data: cached } = await supabase.from('exchange_rates').select('usd_krw').eq('rate_date', today).single()
  if (cached) return cached.usd_krw
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const json = await res.json()
    const rate = json?.rates?.KRW
    if (rate) { await supabase.from('exchange_rates').upsert({ rate_date: today, usd_krw: rate }); return rate }
  } catch { /* fallback */ }
  const { data: latest } = await supabase.from('exchange_rates').select('usd_krw').order('rate_date', { ascending: false }).limit(1).single()
  return latest?.usd_krw ?? 1350
}

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
function DepositModal({ site, onClose, onDeposit, onPoint }: {
  site: Site; onClose: () => void
  onDeposit: (amount: number) => void
  onPoint: (amount: number) => void
}) {
  const [tab, setTab] = useState<'deposit' | 'point'>('deposit')
  const [amount, setAmount] = useState('')
  const num = Number(amount)
  const isusd = site.currency === 'usd'
  const totalDeposit = site.last_deposit ?? 0
  const totalPoint   = site.point_deposit ?? 0
  const totalRolling = totalDeposit + totalPoint
  const betDone      = site.deposit_bet_done ?? 0
  const remaining    = Math.max(0, totalRolling - betDone)
  const pct          = totalRolling > 0 ? Math.min(100, Math.round(betDone / totalRolling * 100)) : 0
  const unit         = isusd ? '$' : '원'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Banknote size={16} color="var(--orange)" />
          {site.name} 입금 / 포인트
          {isusd && <span style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>USD</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button onClick={() => setTab('deposit')} className={tab === 'deposit' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ flex: 1 }}><Banknote size={12} /> 입금</button>
          <button onClick={() => setTab('point')} className={tab === 'point' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ flex: 1 }}><Gift size={12} /> 포인트</button>
        </div>
        {(totalDeposit > 0 || totalPoint > 0) && (
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2 }}>입금 / 포인트</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 700, color: 'var(--orange)' }}>{isusd ? '$' : ''}{totalDeposit.toLocaleString()}{isusd ? '' : '원'}</span>
                  {totalPoint > 0 && <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>+{totalPoint.toLocaleString()}P</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2 }}>남은 롤링</div>
                <div style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 700, color: remaining > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                  {isusd ? '$' : ''}{remaining.toLocaleString()}{isusd ? '' : '원'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <span>롤링 진행률</span>
              <span style={{ color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700 }}>{pct}%</span>
            </div>
            <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {tab === 'deposit' ? `입금액 (${unit})` : '포인트 추가 (롤링 전용, 결산 미반영)'}
        </div>
        {tab === 'point' && (
          <div style={{ fontSize: 10, color: 'var(--purple)', marginBottom: 6, padding: '4px 8px', background: 'var(--purple-bg)', border: '1px solid var(--purple-border)', borderRadius: 'var(--radius-sm)' }}>
            포인트는 롤링 총액에만 합산됩니다 (결산 지출 미포함)
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input className="form-input" type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && num > 0) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} autoFocus />
          <button className="btn btn-primary" disabled={!num || num <= 0} onClick={() => { if (num > 0) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} style={{ flexShrink: 0 }}>
            <Check size={12} /> {tab === 'deposit' ? '입금' : '추가'}
          </button>
        </div>
        {num > 0 && tab === 'deposit' && totalDeposit > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '5px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 10 }}>
            추가 후 총 입금 → <span style={{ color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-num)' }}>{isusd ? '$' : ''}{(totalDeposit + num).toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 출금(마감) 모달 ── */
function WithdrawModal({ site, onClose, onWithdraw }: {
  site: Site; onClose: () => void; onWithdraw: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')
  const num = Number(amount)
  const isusd = site.currency === 'usd'
  const unit = isusd ? '$' : '원'
  const totalIn = (site.last_deposit ?? 0) + (site.point_deposit ?? 0)
  const netProfit = num > 0 ? num - totalIn : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LogOut size={16} color="var(--cyan)" />
          {site.name} 출금 / 마감
          {isusd && <span style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>USD</span>}
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>총 입금</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--orange)', fontWeight: 700 }}>{isusd ? '$' : ''}{(site.last_deposit ?? 0).toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>포인트</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--purple)', fontWeight: 700 }}>{(site.point_deposit ?? 0).toLocaleString()}P</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-light)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>롤링 기준 총액</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--text-primary)', fontWeight: 700 }}>{isusd ? '$' : ''}{totalIn.toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>출금액 ({unit})</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input className="form-input" type="number" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && num > 0 && onWithdraw(num)} autoFocus />
          <button className="btn btn-cyan" disabled={!num || num <= 0} onClick={() => num > 0 && onWithdraw(num)} style={{ flexShrink: 0 }}>
            <LogOut size={12} /> 출금
          </button>
        </div>
        {netProfit !== null && (
          <div style={{
            padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, marginBottom: 12,
            background: netProfit >= 0 ? 'var(--green-bg)' : 'var(--red-bg)',
            border: `1px solid ${netProfit >= 0 ? 'var(--green-border)' : 'var(--red-border)'}`,
          }}>
            수익: <span className={netProfit >= 0 ? 'profit-pos' : 'profit-neg'}>
              {netProfit >= 0 ? '+' : ''}{isusd ? '$' : ''}{netProfit.toLocaleString()}{isusd ? '' : '원'}
            </span>
            {isusd && <span style={{ color: 'var(--blue)', fontSize: 10, marginLeft: 8 }}>결산 시 당일 환율 자동 환산</span>}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 12 }}>
          출금 후 사이트는 <strong style={{ color: 'var(--red)' }}>비활성화</strong>됩니다
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

/* ── 사이트 관리 모달 ── */
function SiteMgrModal({ sites, onClose, onAdd, onDelete, onToggleCurrency, onReorder }: {
  sites: Site[]
  onClose: () => void
  onAdd: (name: string, currency: 'krw' | 'usd') => void
  onDelete: (id: string) => void
  onToggleCurrency: (site: Site) => void
  onReorder: (from: string, to: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState<'krw' | 'usd'>('krw')
  const dragId = useRef<string | null>(null)
  const overId = useRef<string | null>(null)

  function handleAdd() {
    if (!newName.trim()) return
    onAdd(newName.trim(), newCurrency)
    setNewName('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} color="var(--gold)" />
            사이트 관리
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
          사이트 목록 <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9 }}>(드래그로 순서 변경)</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {sites.map(s => (
            <div
              key={s.id}
              className="site-mgr-row"
              draggable
              onDragStart={() => { dragId.current = s.id }}
              onDragOver={e => { e.preventDefault(); overId.current = s.id }}
              onDrop={() => {
                if (dragId.current && overId.current && dragId.current !== overId.current)
                  onReorder(dragId.current, overId.current)
                dragId.current = null; overId.current = null
              }}
              style={{ cursor: 'grab' }}
            >
              <GripVertical size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: s.active ? 'var(--green)' : 'var(--border)',
                boxShadow: s.active ? '0 0 5px var(--green)' : 'none',
              }} />
              <span className="site-mgr-name">{s.name}</span>
              {/* KRW / USD 토글 */}
              <button
                onClick={() => onToggleCurrency(s)}
                title="클릭해서 KRW/USD 전환"
                style={{
                  background: s.currency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)',
                  border: `1px solid ${s.currency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`,
                  borderRadius: 4, color: s.currency === 'usd' ? 'var(--blue)' : 'var(--text-muted)',
                  cursor: 'pointer', padding: '2px 8px', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                {s.currency === 'usd' ? <><DollarSign size={10} /> USD</> : '₩ KRW'}
              </button>
              <button onClick={() => onDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: 0.6, padding: 3, display: 'flex', flexShrink: 0 }}><Trash2 size={12} /></button>
            </div>
          ))}
          {sites.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>사이트가 없습니다</div>
          )}
        </div>

        {/* 사이트 추가 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>새 사이트 추가</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              style={{ fontSize: 12 }}
              placeholder="사이트 이름"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            {/* 통화 토글 */}
            <button
              onClick={() => setNewCurrency(p => p === 'krw' ? 'usd' : 'krw')}
              style={{
                background: newCurrency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)',
                border: `1px solid ${newCurrency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`,
                borderRadius: 4, color: newCurrency === 'usd' ? 'var(--blue)' : 'var(--text-muted)',
                cursor: 'pointer', padding: '0 10px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {newCurrency === 'usd' ? '$' : '₩'}
            </button>
            <button className="btn btn-primary" onClick={handleAdd} style={{ flexShrink: 0 }}>
              <Plus size={12} /> 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 인라인 빠른베팅 팝업 ── */
function QuickBetPopup({ site, onClose, onBet }: {
  site: Site
  onClose: () => void
  onBet: (sport: string, content: string, odds: number, amount: number) => Promise<boolean>
}) {
  const [sport, setSport]     = useState('soccer')
  const [content, setContent] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  const oddsVal = parseOdds(oddsRaw)
  const stakeNum = Number(amount)
  const isusd = site.currency === 'usd'
  const unit  = isusd ? '$' : '원'

  function handleOddsChange(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }

  async function submit() {
    if (!content || oddsVal <= 0 || stakeNum <= 0) return
    setSubmitting(true)
    const ok = await onBet(sport, content, oddsVal, stakeNum)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)' }}>BET SLIP</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>— {site.name}</span>
            {isusd && <span style={{ fontSize: 9, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '0 5px', fontWeight: 700 }}>USD</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={14} /></button>
        </div>

        {/* 잔액 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: `1px solid ${site.active ? 'var(--orange-border)' : 'var(--border)'}`, marginBottom: 14 }}>
          <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>잔액</span>
          <span className="col-balance" style={{ fontSize: 14 }}>{isusd ? '$' : ''}{site.balance.toLocaleString()}{isusd ? '' : '원'}</span>
        </div>

        {/* 폼: 종목 + 내용 */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 7, marginBottom: 8 }}>
          <div className="form-group">
            <label className="form-label">종목</label>
            <select className="form-select" style={{ fontSize: 12 }} value={sport} onChange={e => setSport(e.target.value)}>
              {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">내용</label>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="맨시티 vs 아스날" value={content}
              onChange={e => setContent(e.target.value)} autoFocus />
          </div>
        </div>

        {/* 배당 */}
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">배당 {oddsVal > 0 && <span style={{ color: 'var(--gold)', fontWeight: 700 }}>→ {oddsVal.toFixed(2)}</span>}</label>
          <input className="form-input" style={{ fontSize: 12 }} placeholder="125 = 1.25" value={oddsRaw}
            onChange={e => handleOddsChange(e.target.value)}
            onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
        </div>

        {/* 금액 */}
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label">금액 ({unit})</label>
          <input className="form-input" style={{ fontSize: 12 }} type="number" placeholder="베팅액"
            value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {/* 예상 수익 */}
        {oddsVal > 0 && stakeNum > 0 && (
          <div style={{ padding: '5px 10px', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', fontSize: 11, marginBottom: 12 }}>
            수익 <strong className="profit-pos">+{isusd ? '$' : ''}{Math.round(stakeNum * (oddsVal - 1)).toLocaleString()}{isusd ? '' : '원'}</strong>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>반환 {isusd ? '$' : ''}{Math.round(stakeNum * oddsVal).toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>취소</button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!content || oddsVal <= 0 || stakeNum <= 0 || submitting}
          >
            <Check size={12} /> 베팅 등록
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')

  const [sites, setSites]               = useState<Site[]>([])
  const [bets, setBets]                 = useState<Bet[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)
  const [slipForm, setSlipForm]         = useState<SlipForm>(emptySlip())
  const [slipAmount, setSlipAmount]     = useState('')

  const [showSiteMgr, setShowSiteMgr]   = useState(false)
  const [depositSite, setDepositSite]   = useState<Site | null>(null)
  const [withdrawSite, setWithdrawSite] = useState<Site | null>(null)

  /* 빠른베팅: 더블클릭 시 열릴 사이트 */
  const [quickBetSite, setQuickBetSite] = useState<Site | null>(null)

  const [hoverBetId, setHoverBetId] = useState<string | null>(null)

  const [todos, setTodos]         = useState<Todo[]>([])
  const [newTodo, setNewTodo]     = useState('')
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

  const activeSite    = sites.find(s => s.id === activeSiteId) ?? null
  const currentMarket = MARKETS.find(m => m.value === slipForm.market)
  const oddsVal       = parseOdds(slipForm.odds)
  const isUsd         = activeSite?.currency === 'usd'

  function handleOddsChange(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setSlipForm(p => ({ ...p, odds: (Number(clean) / 100).toFixed(2) }))
    else setSlipForm(p => ({ ...p, odds: clean }))
  }

  /* ── 사이트 관리 ── */
  async function addSite(name: string, currency: 'krw' | 'usd') {
    const { data } = await supabase.from('sites').insert({
      name, balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
      point_deposit: 0, total_withdrawal: 0, currency,
    }).select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'sites', record_id: data.id, after_data: data, description: `사이트 추가: ${data.name} (${currency.toUpperCase()})` })
      setSites(p => [...p, data]); setActiveSiteId(data.id)
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
  async function toggleCurrency(site: Site) {
    const next = site.currency === 'krw' ? 'usd' : 'krw'
    const { data } = await supabase.from('sites').update({ currency: next }).eq('id', site.id).select().single()
    if (data) setSites(p => p.map(s => s.id === site.id ? data : s))
  }
  async function reorderSites(fromId: string, toId: string) {
    const reordered = [...sites]
    const fi = reordered.findIndex(s => s.id === fromId)
    const ti = reordered.findIndex(s => s.id === toId)
    const [moved] = reordered.splice(fi, 1)
    reordered.splice(ti, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i }))
    setSites(updated)
    for (const s of updated) await supabase.from('sites').update({ sort_order: s.sort_order }).eq('id', s.id)
  }

  /* ── 입금 ── */
  async function doDeposit(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }
    const newTotal = (depositSite.last_deposit ?? 0) + amount
    const isusd = depositSite.currency === 'usd'
    const { data } = await supabase.from('sites').update({
      balance: depositSite.balance + amount, active: true, last_deposit: newTotal,
    }).eq('id', depositSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 입금 +${amount.toLocaleString()}` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      setActiveSiteId(depositSite.id)
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(amount * usdKrwRate) }
      await supabase.from('cashflows').insert({
        flow_date: today, type: 'expense', category: '베팅입금',
        description: `${depositSite.name} 입금`, amount, site_id: depositSite.id,
        currency: depositSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : amount,
      })
    }
    setDepositSite(null)
  }

  /* ── 포인트 ── */
  async function doPoint(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }
    const newPoint = (depositSite.point_deposit ?? 0) + amount
    const { data } = await supabase.from('sites').update({
      balance: depositSite.balance + amount, point_deposit: newPoint,
    }).eq('id', depositSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 포인트 +${amount.toLocaleString()}P` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
    }
    setDepositSite(null)
  }

  /* ── 출금(마감) ── */
  async function doWithdraw(amount: number) {
    if (!withdrawSite) return
    const before = { ...withdrawSite }
    const isusd = withdrawSite.currency === 'usd'
    const totalIn = (withdrawSite.last_deposit ?? 0) + (withdrawSite.point_deposit ?? 0)
    const netProfit = amount - totalIn
    const newWithdrawal = (withdrawSite.total_withdrawal ?? 0) + amount
    const { data } = await supabase.from('sites').update({
      active: false, total_withdrawal: newWithdrawal,
      balance: 0, last_deposit: 0, deposit_bet_done: 0, point_deposit: 0,
    }).eq('id', withdrawSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${withdrawSite.name} 출금 ${amount.toLocaleString()}` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(Math.abs(netProfit) * usdKrwRate) }
      await supabase.from('cashflows').insert({
        flow_date: today, type: netProfit >= 0 ? 'income' : 'expense',
        category: netProfit >= 0 ? '베팅수익' : '베팅손실',
        description: `${withdrawSite.name} 마감 (출금 ${amount.toLocaleString()})`,
        amount: Math.abs(netProfit), site_id: withdrawSite.id,
        currency: withdrawSite.currency, usd_krw_rate: usdKrwRate,
        amount_krw: isusd ? amountKrw : Math.abs(netProfit),
      })
    }
    setWithdrawSite(null)
  }

  /* ── 베팅 등록 (우측 슬립) ── */
  async function doBet() {
    if (!activeSite || !slipForm.content || !slipForm.odds || !slipAmount) return
    const stake = Number(slipAmount); if (!stake) return
    if (stake > activeSite.balance) { alert('잔액이 부족합니다'); return }
    const finalOdds = parseOdds(slipForm.odds); if (finalOdds <= 0) { alert('배당을 올바르게 입력하세요'); return }
    const pickLabel = buildPickLabel(slipForm.market, slipForm.pick)
    await submitBet(activeSite, slipForm.sport, slipForm.content, finalOdds, stake, pickLabel, slipForm.market as Market)
    setSlipForm(emptySlip()); setSlipAmount('')
  }

  /* ── 베팅 등록 (빠른베팅 팝업) — 성공 시 true 반환 ── */
  async function doQuickBet(sport: string, content: string, odds: number, amount: number): Promise<boolean> {
    if (!quickBetSite) return false
    if (amount > quickBetSite.balance) { alert('잔액이 부족합니다'); return false }
    const ok = await submitBet(quickBetSite, sport, content, odds, amount, '', 'moneyline')
    return ok
  }

  /* ── 공통 베팅 제출 ── */
  async function submitBet(site: Site, sport: string, content: string, odds: number, stake: number, pick: string, market: Market): Promise<boolean> {
    const { data: betData } = await supabase.from('bets').insert({
      bet_date: today, sport: sport as Sport, league: '', match: content,
      market, pick, odds, stake,
      result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id,
    }).select().single()
    if (!betData) return false
    const siteBefore = { ...site }
    const newBetDone = (site.deposit_bet_done ?? 0) + stake
    const { data: siteData } = await supabase.from('sites').update({
      balance: site.balance - stake,
      rolling_done: site.rolling_done + stake,
      deposit_bet_done: newBetDone,
    }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${site.name}] ${content} / ${pick || '-'} / ${stake.toLocaleString()}` })
      await logAction({ action_type: 'update', table_name: 'sites', record_id: siteData.id, before_data: siteBefore as never, after_data: siteData as never, description: `[${site.name}] 잔액 -${stake.toLocaleString()}` })
      setBets(p => [betData, ...p])
      setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      return true
    }
    return false
  }

  /* ── 결과처리 ── */
  async function applyResult(bet: Bet, result: BetResult | 'cancel') {
    if (result === 'cancel') {
      if (!confirm('베팅을 취소하고 잔액/롤링을 복원할까요?')) return
      const site = sites.find(s => s.id === bet.site_id)
      await logAction({ action_type: 'delete', table_name: 'bets', record_id: bet.id, before_data: bet as never, description: `베팅 취소: ${bet.match}` })
      await supabase.from('bets').delete().eq('id', bet.id)
      setBets(p => p.filter(b => b.id !== bet.id))
      if (site) {
        const siteBefore = { ...site }
        const { data: sd } = await supabase.from('sites').update({
          balance: site.balance + bet.stake,
          rolling_done: Math.max(0, site.rolling_done - bet.stake),
          deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - bet.stake),
        }).eq('id', site.id).select().single()
        if (sd) {
          await logAction({ action_type: 'update', table_name: 'sites', record_id: sd.id, before_data: siteBefore as never, after_data: sd as never, description: `[${site.name}] 취소 복원 +${bet.stake.toLocaleString()}` })
          setSites(p => p.map(s => s.id === sd.id ? sd : s))
        }
      }
      return
    }
    const profit = result === 'win' ? Math.round(bet.stake * (bet.odds - 1)) : result === 'loss' ? -bet.stake : 0
    const before = { ...bet }
    const { data } = await supabase.from('bets').update({ result, profit }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `결과: ${bet.match} → ${result === 'win' ? '적중' : result === 'loss' ? '실패' : '적특'}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
      const site = sites.find(s => s.id === bet.site_id)
      if (site && result === 'win') {
        const delta = bet.stake + profit
        const { data: sd } = await supabase.from('sites').update({ balance: site.balance + delta }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
    }
  }

  /* ── 할일 ── */
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

  /* ── 계산 헬퍼 ── */
  const totalRolling     = (s: Site) => (s.last_deposit ?? 0) + (s.point_deposit ?? 0)
  const depositRemaining = (s: Site) => Math.max(0, totalRolling(s) - (s.deposit_bet_done ?? 0))
  const depositPct       = (s: Site) => totalRolling(s) > 0 ? Math.min(100, Math.round((s.deposit_bet_done ?? 0) / totalRolling(s) * 100)) : 0
  const betsBySite       = (id: string) => bets.filter(b => b.site_id === id)
  const colCount         = Math.max(1, sites.length)
  const todayChecked     = todos.filter(t => t.check_dates.includes(today)).length

  return (
    <div className="page">
      <div className="dashboard-layout">

        {/* ── 좌: 베팅 현황 ── */}
        <div style={{ minWidth: 0 }}>
          {/* 헤더 */}
          <div className="flex-between mb-10">
            <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
            <button
              onClick={() => setShowSiteMgr(true)}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--gold)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
            >
              <Settings size={11} /> 사이트관리
            </button>
          </div>

          {sites.length === 0 ? (
            <div className="card"><div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하세요</div></div>
          ) : (
            <div className="site-grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>

              {/* ── 헤더 행: 사이트명 + 잔액 + 입금/출금 버튼 우측끝 ── */}
              {sites.map(site => {
                const dep   = site.last_deposit ?? 0
                const isusd = site.currency === 'usd'
                return (
                  <div
                    key={site.id}
                    className={`site-col-head ${site.active ? 'site-col-active' : ''} ${activeSiteId === site.id ? 'site-col-selected' : ''}`}
                    onClick={() => setActiveSiteId(site.id)}
                    onDoubleClick={() => setQuickBetSite(site)}
                    style={{ cursor: 'pointer' }}
                    title="클릭: 슬립 선택 | 더블클릭: 빠른베팅"
                  >
                    {/* 사이트명 + USD 뱃지 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, paddingRight: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 'clamp(10px,1.1vw,13px)', flex: 1, textAlign: 'center' }}>{site.name}</span>
                      {isusd && <span style={{ fontSize: 8, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '0 3px', fontWeight: 700, flexShrink: 0 }}>$</span>}
                    </div>

                    {/* 잔액 + 입금/출금 버튼 한 줄 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        flex: 1, textAlign: 'center',
                        fontFamily: 'var(--font-num)', fontSize: 'clamp(11px,1.1vw,14px)', fontWeight: 800,
                        color: site.active ? 'var(--orange)' : 'var(--text-muted)',
                      }}>
                        {isusd ? '$' : ''}{site.balance.toLocaleString()}{isusd ? '' : '원'}
                      </span>
                      {/* 입금 */}
                      <button
                        className={`site-txn-btn site-txn-deposit ${dep > 0 ? 'has-deposit' : ''}`}
                        onClick={e => { e.stopPropagation(); setDepositSite(site) }}
                        title="입금"
                      >입금</button>
                      {/* 출금 */}
                      <button
                        className="site-txn-btn site-txn-withdraw"
                        onClick={e => { e.stopPropagation(); setWithdrawSite(site) }}
                        title="출금"
                      >출금</button>
                    </div>
                  </div>
                )
              })}

              {/* ── 롤링 진행 행 ── */}
              {sites.map(site => {
                const pct   = depositPct(site)
                const rem   = depositRemaining(site)
                const tot   = totalRolling(site)
                const isusd = site.currency === 'usd'
                return (
                  <div key={site.id} className={`site-balance-cell ${site.active ? 'site-bal-active' : ''}`}>
                    {tot > 0 ? (
                      <>
                        <div style={{ fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                          <span style={{ color: 'var(--orange)', fontFamily: 'var(--font-num)', fontWeight: 700 }}>{isusd ? '$' : ''}{rem.toLocaleString()}</span>
                          <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>
                          <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600 }}>{isusd ? '$' : ''}{tot.toLocaleString()}</span>
                        </div>
                        <div className="deposit-progress-bar" style={{ marginTop: 3 }}>
                          <div className="deposit-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div style={{ fontSize: 'clamp(8px,0.75vw,10px)', color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700, marginTop: 1 }}>{pct}%</div>
                      </>
                    ) : <div style={{ height: 20 }} />}
                  </div>
                )
              })}

              {/* ── 베팅 목록 ── */}
              {(() => {
                const maxRows = Math.max(...sites.map(s => betsBySite(s.id).length), 1)
                return Array.from({ length: maxRows }).map((_, rowIdx) =>
                  sites.map(site => {
                    const bet     = betsBySite(site.id)[rowIdx]
                    const isHover = hoverBetId === bet?.id
                    const isusd   = site.currency === 'usd'
                    return (
                      <div
                        key={`${site.id}-${rowIdx}`}
                        className="site-bets-col"
                        onDoubleClick={() => !bet && setQuickBetSite(site)}
                        title={!bet ? '더블클릭: 빠른베팅' : undefined}
                        style={{ cursor: !bet ? 'cell' : 'default' }}
                      >
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)}</span>
                              <div className="bet-result-icons">
                                {bet.result === 'pending' ? (
                                  isHover ? (
                                    <>
                                      <button className="bet-result-icon win"    title="적중"          onClick={() => applyResult(bet, 'win')}><CheckCircle  size={16} /></button>
                                      <button className="bet-result-icon loss"   title="실패"          onClick={() => applyResult(bet, 'loss')}><XCircle      size={16} /></button>
                                      <button className="bet-result-icon cancel" title="취소(롤링복원)" onClick={() => applyResult(bet, 'cancel')}><MinusCircle size={16} /></button>
                                    </>
                                  ) : (
                                    <span className="badge badge-pending" style={{ fontSize: 'clamp(8px,0.75vw,10px)', padding: '1px 4px' }}>대기</span>
                                  )
                                ) : (
                                  <span className={`badge badge-${bet.result}`} style={{ fontSize: 'clamp(8px,0.75vw,10px)', padding: '1px 4px' }}>
                                    {bet.result === 'win' ? '적중' : bet.result === 'loss' ? '실패' : '적특'}
                                  </span>
                                )}
                              </div>
                            </div>
                            {bet.result !== 'pending' && (
                              <div style={{ fontSize: 'clamp(9px,0.85vw,11px)', marginTop: 2, fontFamily: 'var(--font-num)', fontWeight: 700 }} className={bet.profit >= 0 ? 'profit-pos' : 'profit-neg'}>
                                {bet.profit >= 0 ? '+' : ''}{isusd ? '$' : ''}{bet.profit.toLocaleString()}{isusd ? '' : '원'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="site-bets-empty-cell" />
                        )}
                      </div>
                    )
                  })
                )
              })()}
            </div>
          )}
        </div>

        {/* ── 우: 베팅 슬립 + 할일 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 베팅 슬립 */}
          <div className="betslip-panel">
            <div className="betslip-panel-header">
              BET SLIP
              {activeSite && (
                <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 600, color: activeSite.currency === 'usd' ? 'var(--blue)' : 'var(--gold-dim)', textTransform: 'none', letterSpacing: 0 }}>
                  — {activeSite.name} {activeSite.currency === 'usd' ? '(USD)' : '(KRW)'}
                </span>
              )}
            </div>
            <div className="betslip-panel-body">

              {/* 잔액 표시 */}
              {activeSite ? (
                <div style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: `1px solid ${activeSite.active ? 'var(--orange-border)' : 'var(--border)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 1 }}>잔액</div>
                      <div className="col-balance" style={{ fontSize: 15 }}>{isUsd ? '$' : ''}{activeSite.balance.toLocaleString()}{isUsd ? '' : '원'}</div>
                    </div>
                    {totalRolling(activeSite) > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 1 }}>남은 롤링</div>
                        <div className="col-balance" style={{ fontSize: 13 }}>{isUsd ? '$' : ''}{depositRemaining(activeSite).toLocaleString()}{isUsd ? '' : '원'}</div>
                      </div>
                    )}
                  </div>
                  {totalRolling(activeSite) > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 3 }}>
                        <span>베팅 진행률</span>
                        <span style={{ color: depositPct(activeSite) >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700 }}>{depositPct(activeSite)}%</span>
                      </div>
                      <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${depositPct(activeSite)}%` }} /></div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  베팅현황에서 사이트를 선택하세요
                </div>
              )}

              {/* 종목 + 내용 */}
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

              {/* 마켓 + 픽 */}
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

              {/* 배당 */}
              <div className="form-group">
                <label className="form-label">배당 {slipForm.odds && oddsVal > 0 && <span style={{ color: 'var(--gold)', fontWeight: 700 }}>→ {oddsVal.toFixed(2)}</span>}</label>
                <input className="form-input" style={{ fontSize: 12 }} placeholder="125 = 1.25" value={slipForm.odds}
                  onChange={e => handleOddsChange(e.target.value)}
                  onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setSlipForm(p => ({ ...p, odds: n.toFixed(2) })) }} />
              </div>

              {/* 금액 + 베팅 */}
              <div className="form-group">
                <label className="form-label">금액 ({isUsd ? '$' : '원'})</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  <input className="form-input" style={{ fontSize: 12 }} type="number" placeholder="베팅액" value={slipAmount}
                    onChange={e => setSlipAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && doBet()} />
                  <button className="btn btn-primary" style={{ flexShrink: 0, padding: '0 10px' }} onClick={doBet} disabled={!activeSite}>
                    <Check size={12} />
                  </button>
                </div>
              </div>

              {oddsVal > 0 && slipAmount && Number(slipAmount) > 0 && (
                <div style={{ padding: '6px 10px', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
                  수익 <strong className="profit-pos">+{isUsd ? '$' : ''}{Math.round(Number(slipAmount) * (oddsVal - 1)).toLocaleString()}{isUsd ? '' : '원'}</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>반환 {isUsd ? '$' : ''}{Math.round(Number(slipAmount) * oddsVal).toLocaleString()}{isUsd ? '' : '원'}</span>
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
                    <div className={`todo-check ${isChecked ? 'done' : ''}`} onClick={() => toggleTodo(t)}>{isChecked && <Check size={8} color="#000" strokeWidth={3} />}</div>
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
      </div>

      {/* ── 모달들 ── */}
      {showSiteMgr && (
        <SiteMgrModal
          sites={sites}
          onClose={() => setShowSiteMgr(false)}
          onAdd={addSite}
          onDelete={deleteSite}
          onToggleCurrency={toggleCurrency}
          onReorder={reorderSites}
        />
      )}
      {depositSite && (
        <DepositModal site={depositSite} onClose={() => setDepositSite(null)} onDeposit={doDeposit} onPoint={doPoint} />
      )}
      {withdrawSite && (
        <WithdrawModal site={withdrawSite} onClose={() => setWithdrawSite(null)} onWithdraw={doWithdraw} />
      )}
      {quickBetSite && (
        <QuickBetPopup site={quickBetSite} onClose={() => setQuickBetSite(null)} onBet={doQuickBet} />
      )}
    </div>
  )
}

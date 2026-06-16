import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Todo, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import {
  Plus, Trash2, Check, X, ChevronLeft, ChevronRight,
  RotateCcw, Calendar, Settings,
  CheckCircle, XCircle, Gift, GripVertical, DollarSign,
  TrendingUp, TrendingDown, ArrowDownToLine, LogOut, Clock,
} from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer',     label: '축구'   },
  { value: 'baseball',   label: '야구'   },
  { value: 'basketball', label: '농구'   },
  { value: 'volleyball', label: '배구'   },
  { value: 'hockey',     label: '하키'   },
  { value: 'esports',    label: 'LOL'    },
  { value: 'other',      label: '기타'   },
]

const SPORT_SHORT: Record<string, string> = {
  soccer: '⚽', baseball: '⚾', basketball: '🏀',
  volleyball: '🏐', hockey: '🏒', esports: '🎮', other: '📋',
}

function parseOdds(raw: string): number {
  const n = Number(raw.trim())
  if (isNaN(n) || n <= 0) return 0
  if (Number.isInteger(n) && n >= 100) return n / 100
  return n
}

function autoMarket(content: string): { market: Market; pick: string } {
  const s = content.trim()
  if (/오버/i.test(s) || /over/i.test(s)) return { market: 'over', pick: s }
  if (/언더/i.test(s) || /under/i.test(s)) return { market: 'under', pick: s }
  if (/-\s*\d/.test(s)) return { market: 'handicap', pick: s }
  if (/\+\s*\d/.test(s) || /^\d+(\.\d+)?$/.test(s)) return { market: 'handicap', pick: s }
  return { market: 'moneyline', pick: s }
}

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
  onDeposit: (amount: number) => void; onPoint: (amount: number) => void
}) {
  const [tab, setTab] = useState<'deposit' | 'point'>('deposit')
  const [amount, setAmount] = useState('')
  const num = Number(amount)
  const isusd = site.currency === 'usd'
  const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
  const tot = dep + pt; const done = site.deposit_bet_done ?? 0
  const rem = Math.max(0, tot - done); const pct = tot > 0 ? Math.round(done / tot * 100) : 0
  const unit = isusd ? '$' : '원'

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <ArrowDownToLine size={16} color="var(--orange)" />
          {site.name} 입금 / 포인트
          {isusd && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>USD</span>}
          {/* 우상단 X 닫기 */}
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2, borderRadius: 4 }}><X size={15} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setTab('deposit')} className={tab === 'deposit' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ flex: 1, fontSize: 14, padding: '9px 0', justifyContent: 'center' }}>입금</button>
          <button onClick={() => setTab('point')} className={tab === 'point' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ flex: 1, fontSize: 14, padding: '9px 0', justifyContent: 'center' }}><Gift size={14} /> 포인트</button>
        </div>
        {(dep > 0 || pt > 0) && (
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>입금</span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{isusd ? '$' : ''}{dep.toLocaleString()}{isusd ? '' : '원'}</span>
              </div>
              {pt > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>포인트</span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--purple)', fontSize: 15 }}>+{pt.toLocaleString()}P</span>
              </div>}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>남은 롤링</span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--gold)', fontSize: 15 }}>{isusd ? '$' : ''}{rem.toLocaleString()}{isusd ? '' : '원'}</span>
              </div>
            </div>
            <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${Math.min(100,pct)}%` }} /></div>
            <div style={{ fontSize: 9, textAlign: 'right', marginTop: 2, color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700 }}>{pct}%</div>
          </div>
        )}

        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {tab === 'deposit' ? `입금액 (${unit})` : `포인트 추가`}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input className="form-input" type="number" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && num > 0) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} autoFocus />
          <button className="btn btn-primary" disabled={!num || num <= 0}
            onClick={() => { if (num > 0) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} style={{ flexShrink: 0 }}>
            <Check size={12} /> {tab === 'deposit' ? '입금' : '추가'}
          </button>
        </div>

      </div>
    </div>
  )
}

/* ── 출금 모달 (우상단 X, 바깥클릭 비활성화, 하단 취소버튼 제거) ── */
function WithdrawModal({ site, onClose, onWithdraw }: {
  site: Site; onClose: () => void; onWithdraw: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')
  const num = Number(amount); const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const totalIn = (site.last_deposit ?? 0) + (site.point_deposit ?? 0)
  const netProfit = num > 0 ? num - totalIn : null

  return (
    /* overlay onClick 없음 → 바깥 클릭해도 닫히지 않음 */
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LogOut size={16} color="var(--cyan)" />
          {site.name} 출금 / 마감
          {/* 우상단 X 닫기 */}
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2, borderRadius: 4 }}><X size={15} /></button>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>총 입금</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--orange)', fontWeight: 700 }}>{isusd ? '$' : ''}{(site.last_deposit ?? 0).toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-light)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>롤링 총액</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--text-primary)', fontWeight: 700 }}>{isusd ? '$' : ''}{totalIn.toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>출금액 ({unit})</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input className="form-input" type="number" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && num > 0 && onWithdraw(num)} autoFocus />
          <button className="btn btn-cyan" disabled={!num || num <= 0} onClick={() => num > 0 && onWithdraw(num)} style={{ flexShrink: 0 }}>
            출금
          </button>
        </div>
        {netProfit !== null && (
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, marginBottom: 4, background: netProfit >= 0 ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${netProfit >= 0 ? 'var(--green-border)' : 'var(--red-border)'}` }}>
            수익: <span className={netProfit >= 0 ? 'profit-pos' : 'profit-neg'}>{netProfit >= 0 ? '+' : ''}{isusd ? '$' : ''}{netProfit.toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        )}
        {/* 하단 취소버튼 제거됨 */}
      </div>
    </div>
  )
}

/* ── 사이트 관리 모달 ── */
function SiteMgrModal({ sites, onClose, onAdd, onDelete, onToggleCurrency, onToggleBetType, onReorder }: {
  sites: Site[]; onClose: () => void
  onAdd: (name: string, currency: 'krw' | 'usd', betType: 'single' | 'double') => void
  onDelete: (id: string) => void
  onToggleCurrency: (site: Site) => void
  onToggleBetType: (site: Site) => void
  onReorder: (from: string, to: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState<'krw' | 'usd'>('krw')
  const [newBetType, setNewBetType] = useState<'single' | 'double'>('single')
  const dragId = { current: '' }; const overId = { current: '' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={16} color="var(--gold)" /> 사이트 관리</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {sites.map(s => (
            <div key={s.id} className="site-mgr-row"
              draggable
              onDragStart={() => { dragId.current = s.id }}
              onDragOver={e => { e.preventDefault(); overId.current = s.id }}
              onDrop={() => {
                if (dragId.current && overId.current && dragId.current !== overId.current) onReorder(dragId.current, overId.current)
                dragId.current = ''; overId.current = ''
              }}
              style={{ cursor: 'grab' }}
            >
              <GripVertical size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: s.active ? 'var(--green)' : 'var(--border)', boxShadow: s.active ? '0 0 5px var(--green)' : 'none' }} />
              <span className="site-mgr-name">{s.name}</span>
              <button onClick={() => onToggleCurrency(s)} title="KRW/USD" style={{ background: s.currency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)', border: `1px solid ${s.currency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`, borderRadius: 4, color: s.currency === 'usd' ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                {s.currency === 'usd' ? <><DollarSign size={10} /> USD</> : '₩ KRW'}
              </button>
              <button onClick={() => onToggleBetType(s)} style={{ background: s.bet_type === 'double' ? 'var(--purple-bg)' : 'var(--bg-elevated)', border: `1px solid ${s.bet_type === 'double' ? 'var(--purple-border)' : 'var(--border)'}`, borderRadius: 4, color: s.bet_type === 'double' ? 'var(--purple)' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {s.bet_type === 'double' ? '두폴' : '단폴'}
              </button>
              <button onClick={() => onDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: 0.6, padding: 3, display: 'flex', flexShrink: 0 }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="사이트 이름" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newName.trim() && (onAdd(newName.trim(), newCurrency, newBetType), setNewName(''))} autoFocus />
            <button onClick={() => setNewCurrency(p => p === 'krw' ? 'usd' : 'krw')} style={{ background: newCurrency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)', border: `1px solid ${newCurrency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`, borderRadius: 4, color: newCurrency === 'usd' ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer', padding: '0 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {newCurrency === 'usd' ? '$' : '₩'}
            </button>
            <button onClick={() => setNewBetType(p => p === 'single' ? 'double' : 'single')} style={{ background: newBetType === 'double' ? 'var(--purple-bg)' : 'var(--bg-elevated)', border: `1px solid ${newBetType === 'double' ? 'var(--purple-border)' : 'var(--border)'}`, borderRadius: 4, color: newBetType === 'double' ? 'var(--purple)' : 'var(--text-muted)', cursor: 'pointer', padding: '0 8px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {newBetType === 'double' ? '두폴' : '단폴'}
            </button>
            <button className="btn btn-primary" onClick={() => { if (newName.trim()) { onAdd(newName.trim(), newCurrency, newBetType); setNewName('') }}} style={{ flexShrink: 0 }}><Plus size={12} /> 추가</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (단폴) ── */
function SingleBetForm({ site, onClose, onBet, defaultSport }: {
  site: Site; onClose: () => void; defaultSport: string
  onBet: (sport: string, content: string, odds: number, amount: number) => Promise<boolean>
}) {
  const [sport, setSport]     = useState(defaultSport || 'soccer')
  const [content, setContent] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const oddsV = parseOdds(oddsRaw); const stakeN = Number(amount)
  const hotkeys = isusd ? [5, 10] : [5000, 10000]

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  async function submit() {
    if (!content || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true)
    const ok = await onBet(sport, content, oddsV, stakeN)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div className="inline-bet-form">
      <select className="form-select inline-bet-input" value={sport} onChange={e => setSport(e.target.value)}>
        {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <input className="form-input inline-bet-input" placeholder="경기 내용" value={content} onChange={e => setContent(e.target.value)} autoFocus />
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>→ {oddsV.toFixed(2)}</div>}
      <input className="form-input inline-bet-input" type="number" placeholder={`금액 (${unit})`} value={amount}
        onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(p => String(Number(p || 0) + hk))}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!content || oddsV <= 0 || stakeN <= 0 || submitting}>
          등록
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (두폴) ── */
function DoubleBetForm({ site, lastLeg1, onClose, onBet }: {
  site: Site; lastLeg1: { content: string } | null; onClose: () => void
  onBet: (c1: string, c2: string, odds: number, amount: number) => Promise<boolean>
}) {
  const [c1, setC1] = useState(lastLeg1?.content ?? '')
  const [c2, setC2] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const oddsV = parseOdds(oddsRaw); const stakeN = Number(amount)
  const hotkeys = isusd ? [5, 10] : [5000, 10000]
  const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 2 }

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  async function submit() {
    if (!c1 || !c2 || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true)
    const ok = await onBet(c1, c2, oddsV, stakeN)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div className="inline-bet-form">
      <div style={labelStyle}>① 축 (자동채움)</div>
      <input className="form-input inline-bet-input" placeholder="경기 내용 ①" value={c1} onChange={e => setC1(e.target.value)} autoFocus={!lastLeg1} />
      <div style={{ ...labelStyle, marginTop: 4 }}>② 날개</div>
      <input className="form-input inline-bet-input" placeholder="경기 내용 ②" value={c2} onChange={e => setC2(e.target.value)} autoFocus={!!lastLeg1} />
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>배당 → {oddsV.toFixed(2)}</div>}
      <input className="form-input inline-bet-input" type="number" placeholder={`금액 (${unit})`} value={amount}
        onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(p => String(Number(p || 0) + hk))}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!c1 || !c2 || oddsV <= 0 || stakeN <= 0 || submitting}>
          등록
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ════════════════════════════════ DASHBOARD ════════════════════════════════ */

function WeekMonthDeposit({ sites, cashflows, weekStart, weekEnd }: {
  sites: { id: string; name: string; currency: string }[]
  cashflows: { flow_date: string; type: string; amount: number; site_id: string | null }[]
  weekStart: string; weekEnd: string
}) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const monthEnd   = dayjs().endOf('month').format('YYYY-MM-DD')
  const from = mode === 'week' ? weekStart : monthStart
  const to   = mode === 'week' ? weekEnd   : monthEnd

  const filtered = cashflows.filter(c => c.type === 'expense' && c.flow_date >= from && c.flow_date <= to)
  const total = filtered.reduce((a, c) => a + c.amount, 0)
  const krwSites = sites.filter(s => s.currency === 'krw')

  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          입금 현황
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setMode('week')} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: '1px solid', cursor: 'pointer', background: mode === 'week' ? 'var(--gold-bg)' : 'none', borderColor: mode === 'week' ? 'var(--gold-border)' : 'var(--border)', color: mode === 'week' ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>이번주</button>
          <button onClick={() => setMode('month')} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: '1px solid', cursor: 'pointer', background: mode === 'month' ? 'var(--gold-bg)' : 'none', borderColor: mode === 'month' ? 'var(--gold-border)' : 'var(--border)', color: mode === 'month' ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>한달</button>
        </div>
      </div>
      {krwSites.map(s => {
        const siteTotal = filtered.filter(c => c.site_id === s.id).reduce((a, c) => a + c.amount, 0)
        if (siteTotal === 0) return null
        return (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.name}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>{siteTotal.toLocaleString()}원</span>
          </div>
        )
      })}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>합계</span>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 800, color: 'var(--orange)' }}>{total.toLocaleString()}원</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')
  const weekStart = dayjs().startOf('isoWeek').format('YYYY-MM-DD')
  const weekEnd   = dayjs().endOf('isoWeek').format('YYYY-MM-DD')

  const [sites, setSites]     = useState<Site[]>([])
  const [bets, setBets]       = useState<Bet[]>([])
  const [cashflows, setCashflows] = useState<{ flow_date: string; type: string; amount: number; site_id: string | null }[]>([])

  const [showSiteMgr, setShowSiteMgr]   = useState(false)
  const [depositSite, setDepositSite]   = useState<Site | null>(null)
  const [withdrawSite, setWithdrawSite] = useState<Site | null>(null)
  const [openFormSiteId, setOpenFormSiteId] = useState<string | null>(null)
  const [hoverBetId, setHoverBetId]     = useState<string | null>(null)

  const [todos, setTodos]       = useState<Todo[]>([])
  const [newTodo, setNewTodo]   = useState('')
  const [calOpenId, setCalOpenId] = useState<string | null>(null)

  useEffect(() => { loadSites(); loadBets(); loadTodos(); loadCashflows() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').eq('active', true).order('sort_order')
    if (data) setSites(data)
  }
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').order('bet_date', { ascending: true }).order('created_at', { ascending: true })
    if (data) setBets(data)
  }
  async function loadTodos() {
    const { data } = await supabase.from('todos').select('*').order('created_at')
    if (data) setTodos(data)
  }
  async function loadCashflows() {
    const { data } = await supabase.from('cashflows').select('flow_date,type,amount,site_id').gte('flow_date', weekStart).lte('flow_date', weekEnd)
    if (data) setCashflows(data)
  }

  const totalRolling     = (s: Site) => (s.last_deposit ?? 0) + (s.point_deposit ?? 0)
  const depositRemaining = (s: Site) => Math.max(0, totalRolling(s) - (s.deposit_bet_done ?? 0))
  const depositPct       = (s: Site) => totalRolling(s) > 0 ? Math.round((s.deposit_bet_done ?? 0) / totalRolling(s) * 100) : 0
  const betsBySite       = (id: string) => bets.filter(b => b.site_id === id)
  const pendingBySite    = (id: string) => betsBySite(id).filter(b => b.result === 'pending')
  const settledBySite    = (id: string) => betsBySite(id).filter(b => b.result !== 'pending')
  const colCount         = Math.max(1, sites.length)
  const todayChecked     = todos.filter(t => t.check_dates.includes(today)).length

  function sitePnL(site: Site) {
    if (!site.active || (site.last_deposit ?? 0) === 0) return null
    const settled = settledBySite(site.id)
    return settled.reduce((acc, b) => acc + b.profit, 0)
  }

  function getLastLeg1(siteId: string): { content: string } | null {
    const sb = pendingBySite(siteId).filter(b => b.parlay_leg === 1)
    if (!sb.length) return null
    return { content: sb[sb.length - 1].match }
  }

  /* ── 사이트 관리 ── */
  async function addSite(name: string, currency: 'krw' | 'usd', betType: 'single' | 'double') {
    const { data } = await supabase.from('sites').insert({
      name, balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
      point_deposit: 0, total_withdrawal: 0, currency, bet_type: betType,
    }).select().single()
    if (data) { await logAction({ action_type: 'insert', table_name: 'sites', record_id: data.id, after_data: data, description: `사이트 추가: ${data.name}` }); setSites(p => [...p, data]) }
  }
  async function deleteSite(id: string) {
    const site = sites.find(s => s.id === id)
    if (!site || !confirm(`${site.name} 삭제?`)) return
    await logAction({ action_type: 'delete', table_name: 'sites', record_id: id, before_data: site as never, description: `사이트 삭제: ${site.name}` })
    await supabase.from('sites').delete().eq('id', id); setSites(p => p.filter(s => s.id !== id))
  }
  async function toggleCurrency(site: Site) {
    const { data } = await supabase.from('sites').update({ currency: site.currency === 'krw' ? 'usd' : 'krw' }).eq('id', site.id).select().single()
    if (data) setSites(p => p.map(s => s.id === site.id ? data : s))
  }
  async function toggleBetType(site: Site) {
    const { data } = await supabase.from('sites').update({ bet_type: site.bet_type === 'single' ? 'double' : 'single' }).eq('id', site.id).select().single()
    if (data) setSites(p => p.map(s => s.id === site.id ? data : s))
  }
  async function reorderSites(fromId: string, toId: string) {
    const reordered = [...sites]
    const fi = reordered.findIndex(s => s.id === fromId); const ti = reordered.findIndex(s => s.id === toId)
    const [moved] = reordered.splice(fi, 1); reordered.splice(ti, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i }))
    setSites(updated)
    for (const s of updated) await supabase.from('sites').update({ sort_order: s.sort_order }).eq('id', s.id)
  }

  /* ── 입금 ── */
  async function doDeposit(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }; const isusd = depositSite.currency === 'usd'
    const newTotalDeposit = (depositSite.last_deposit ?? 0) + amount
    const newTotalRolling = newTotalDeposit + (depositSite.point_deposit ?? 0)
    const currentDone = depositSite.deposit_bet_done ?? 0
    const newDone = currentDone > (newTotalRolling - amount) ? newTotalRolling - amount : currentDone
    const { data } = await supabase.from('sites').update({
      balance: depositSite.balance + amount, active: true,
      last_deposit: newTotalDeposit,
      deposit_bet_done: Math.max(0, newDone),
    }).eq('id', depositSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 입금 +${amount.toLocaleString()}` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(amount * usdKrwRate) }
      await supabase.from('cashflows').insert({ flow_date: today, type: 'expense', category: '베팅입금', description: `${depositSite.name} 입금`, amount, site_id: depositSite.id, currency: depositSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : amount })
      loadCashflows()
    }
    setDepositSite(null)
  }
  async function doPoint(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }
    const { data } = await supabase.from('sites').update({ balance: depositSite.balance + amount, point_deposit: (depositSite.point_deposit ?? 0) + amount }).eq('id', depositSite.id).select().single()
    if (data) { await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 포인트 +${amount.toLocaleString()}P` }); setSites(p => p.map(s => s.id === data.id ? data : s)) }
    setDepositSite(null)
  }
  async function doWithdraw(amount: number) {
    if (!withdrawSite) return
    const before = { ...withdrawSite }; const isusd = withdrawSite.currency === 'usd'
    const totalIn = (withdrawSite.last_deposit ?? 0) + (withdrawSite.point_deposit ?? 0)
    const netProfit = amount - totalIn
    const { data } = await supabase.from('sites').update({ active: false, total_withdrawal: (withdrawSite.total_withdrawal ?? 0) + amount, balance: 0, last_deposit: 0, deposit_bet_done: 0, point_deposit: 0 }).eq('id', withdrawSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${withdrawSite.name} 출금 ${amount.toLocaleString()}` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(Math.abs(netProfit) * usdKrwRate) }
      await supabase.from('cashflows').insert({ flow_date: today, type: netProfit >= 0 ? 'income' : 'expense', category: netProfit >= 0 ? '베팅수익' : '베팅손실', description: `${withdrawSite.name} 마감`, amount: Math.abs(netProfit), site_id: withdrawSite.id, currency: withdrawSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : Math.abs(netProfit) })
    }
    if (withdrawSite) {
      setBets(p => p.filter(b => !(b.site_id === withdrawSite.id && b.result !== 'pending')))
    }
    await loadSites()
    setWithdrawSite(null)
  }

  /* ── 베팅 제출 ── */
  async function submitBet(site: Site, sport: string, content: string, odds: number, stake: number): Promise<boolean> {
    const { market, pick } = autoMarket(content)
    const { data: betData } = await supabase.from('bets').insert({ bet_date: today, sport: sport as Sport, league: '', match: content, market, pick, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: null, parlay_leg: 1 }).select().single()
    if (!betData) return false
    const { data: siteData } = await supabase.from('sites').update({ balance: site.balance - stake, rolling_done: site.rolling_done + stake, deposit_bet_done: (site.deposit_bet_done ?? 0) + stake }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${site.name}] ${content} / ${stake.toLocaleString()}` })
      setBets(p => [...p, betData]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s)); return true
    }
    return false
  }
  async function submitDoubleBet(site: Site, c1: string, c2: string, odds: number, stake: number): Promise<boolean> {
    const groupId = crypto.randomUUID()
    const { market: m1, pick: p1 } = autoMarket(c1); const { market: m2, pick: p2 } = autoMarket(c2)
    const { data: betsData } = await supabase.from('bets').insert([
      { bet_date: today, sport: 'soccer' as Sport, league: '', match: c1, market: m1, pick: p1, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: groupId, parlay_leg: 1 },
      { bet_date: today, sport: 'soccer' as Sport, league: '', match: c2, market: m2, pick: p2, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: groupId, parlay_leg: 2 },
    ]).select()
    if (!betsData || betsData.length < 2) return false
    // 두폴은 한 건 베팅 - stake 한 번만 차감
    const { data: siteData } = await supabase.from('sites').update({ balance: site.balance - stake, rolling_done: site.rolling_done + stake, deposit_bet_done: (site.deposit_bet_done ?? 0) + stake }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betsData[0].id, after_data: betsData[0] as never, description: `[${site.name}] 두폴 ${c1}×${c2} / ${stake.toLocaleString()}` })
      setBets(p => [...p, ...betsData]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s)); return true
    }
    return false
  }

  /* ── 두폴 결과 처리 (두 leg 동시, stake 한 번만) ── */
  async function applyParlayResult(groupBets: Bet[], result: BetResult | 'cancel') {
    if (!groupBets.length) return
    const site = sites.find(s => s.id === groupBets[0].site_id)
    const stake = groupBets[0].stake  // 두폴 전체 금액 (leg마다 동일)

    if (result === 'cancel') {
      if (!confirm('두폴 베팅을 취소하고 잔액/롤링을 복원할까요?')) return
      for (const gb of groupBets) await supabase.from('bets').delete().eq('id', gb.id)
      setBets(p => p.filter(b => !groupBets.some(gb => gb.id === b.id)))
      if (site) {
        // stake 한 번만 복원 (두폴은 한 건 베팅)
        const { data: sd } = await supabase.from('sites').update({
          balance: site.balance + stake,
          rolling_done: Math.max(0, site.rolling_done - stake),
          deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - stake),
        }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
      return
    }

    // leg1에만 실제 profit 기록, leg2는 0 → sitePnL 중복 합산 방지
    const profit = result === 'win' ? Math.round(stake * (groupBets[0].odds - 1)) : result === 'loss' ? -stake : 0
    const updatedList: Bet[] = []
    for (let i = 0; i < groupBets.length; i++) {
      const legProfit = i === 0 ? profit : 0  // leg1만 profit, 나머지 0
      const { data } = await supabase.from('bets').update({ result, profit: legProfit }).eq('id', groupBets[i].id).select().single()
      if (data) updatedList.push(data)
    }
    if (!updatedList.length) return

    setBets(p => p.map(b => updatedList.find(u => u.id === b.id) ?? b))

    if (site && result === 'win') {
      // stake 한 번만 반환 + profit
      const { data: sd } = await supabase.from('sites').update({ balance: site.balance + stake + profit }).eq('id', site.id).select().single()
      if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
    }
  }

  /* ── 두폴 처리취소: 완료→pending 복원 ── */
  async function applyParlayRevert(groupBets: Bet[]) {
    if (!confirm('두폴 결과 처리를 취소하고 대기 목록으로 되돌릴까요?')) return
    const site = sites.find(s => s.id === groupBets[0].site_id)
    const wasWin = groupBets[0].result === 'win'
    const updatedList: Bet[] = []
    for (const gb of groupBets) {
      const { data } = await supabase.from('bets').update({ result: 'pending', profit: 0 }).eq('id', gb.id).select().single()
      if (data) updatedList.push(data)
    }
    if (!updatedList.length) return
    setBets(p => p.map(b => updatedList.find(u => u.id === b.id) ?? b))
    if (site && wasWin) {
      const stake = groupBets[0].stake
      const profit = groupBets[0].profit  // leg1에만 저장된 profit
      const { data: sd } = await supabase.from('sites').update({
        balance: Math.max(0, site.balance - stake - profit),
      }).eq('id', site.id).select().single()
      if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
    }
  }

  /* ── 결과 처리 (단폴, 완료→pending 복원 포함) ── */
  async function applyResult(bet: Bet, result: BetResult | 'cancel' | 'revert') {
    const site = sites.find(s => s.id === bet.site_id)

    // 처리 취소: 완료된 베팅을 다시 pending으로 복원
    if (result === 'revert') {
      if (!confirm('결과 처리를 취소하고 대기 목록으로 되돌릴까요?')) return
      const wasWin = bet.result === 'win'
      const { data } = await supabase.from('bets').update({ result: 'pending', profit: 0 }).eq('id', bet.id).select().single()
      if (data) {
        setBets(p => p.map(b => b.id === data.id ? data : b))
        if (site && wasWin) {
          // 적중 처리 시 받았던 금액 다시 회수
          const returnedProfit = bet.profit  // 양수
          const { data: sd } = await supabase.from('sites').update({
            balance: Math.max(0, site.balance - bet.stake - returnedProfit),
          }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
        }
      }
      return
    }

    if (result === 'cancel') {
      if (!confirm('베팅을 취소하고 잔액/롤링을 복원할까요?')) return
      const groupBets = bet.parlay_group ? bets.filter(b => b.parlay_group === bet.parlay_group) : [bet]
      for (const gb of groupBets) { await supabase.from('bets').delete().eq('id', gb.id) }
      setBets(p => p.filter(b => !groupBets.some(gb => gb.id === b.id)))
      if (site) {
        const { data: sd } = await supabase.from('sites').update({ balance: site.balance + bet.stake, rolling_done: Math.max(0, site.rolling_done - bet.stake), deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - bet.stake) }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
      return
    }

    const profit = result === 'win' ? Math.round(bet.stake * (bet.odds - 1)) : result === 'loss' ? -bet.stake : 0
    const { data } = await supabase.from('bets').update({ result, profit }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: bet as never, after_data: data as never, description: `결과: ${bet.match} → ${result}` })
      const updatedBets = bets.map(b => b.id === data.id ? data : b)
      setBets(updatedBets)
      if (site && result === 'win') {
        const { data: sd } = await supabase.from('sites').update({ balance: site.balance + bet.stake + profit }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
    }
  }

  /* ── 할일 ── */
  async function addTodo() {
    if (!newTodo.trim()) return
    const { data } = await supabase.from('todos').insert({ todo_date: today, content: newTodo.trim(), done: false, check_count: 0, check_dates: [] }).select().single()
    if (data) { setTodos(p => [...p, data]); setNewTodo('') }
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
    if (data) setTodos(p => p.map(t => t.id === todo.id ? data : t))
  }
  async function deleteTodo(todo: Todo) {
    await supabase.from('todos').delete().eq('id', todo.id); setTodos(p => p.filter(t => t.id !== todo.id))
  }

  /* ════════════ RENDER ════════════ */
  return (
    <div className="page">
      <div className="dashboard-layout-full">

        {/* ── 좌: 할일 + 주간 입금 (260px) ── */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* 오늘 할 일 — 타이틀을 card 안에 포함해 베팅현황 타이틀과 시각적 높이 맞춤 */}
          <div className="card" style={{ padding: '10px 12px' }}>
            <div className="flex-between mb-10">
              <span className="card-title" style={{ margin: 0 }}>오늘 할 일</span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{todayChecked}/{todos.length}</span>
            </div>
            {todos.length === 0 && <div className="empty" style={{ padding: '10px 0' }}><div className="empty-icon">📋</div>추가하세요</div>}
            {todos.map(t => {
              const isChecked = t.check_dates.includes(today)
              return (
                <div key={t.id}>
                  <div className="todo-item">
                    <div className={`todo-check ${isChecked ? 'done' : ''}`} onClick={() => toggleTodo(t)}>{isChecked && <Check size={8} color="#000" strokeWidth={3} />}</div>
                    <span className={`todo-text ${isChecked ? 'done' : ''}`}>{t.content}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', padding: '0 4px', borderRadius: 5, flexShrink: 0 }}>{t.check_count}회</span>
                    <button className="btn btn-icon btn-ghost btn-sm" style={calOpenId === t.id ? { background: 'var(--gold-bg)' } : {}} onClick={() => setCalOpenId(calOpenId === t.id ? null : t.id)}>
                      <Calendar size={10} color={calOpenId === t.id ? 'var(--gold)' : 'var(--text-secondary)'} />
                    </button>
                    <button className="btn btn-icon btn-ghost btn-sm" onClick={() => resetTodo(t)}><RotateCcw size={10} color="var(--text-secondary)" /></button>
                    <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteTodo(t)}><Trash2 size={10} color="var(--text-secondary)" /></button>
                  </div>
                  {calOpenId === t.id && <div style={{ paddingLeft: 20, paddingBottom: 6, paddingTop: 3 }}><MiniCalendar checkedDates={t.check_dates} onToggle={d => toggleCalDate(t, d)} /></div>}
                </div>
              )
            })}
            <div className="flex-center gap-6 mt-10">
              <input className="form-input" style={{ fontSize: 12 }} placeholder="할 일 추가..." value={newTodo} onChange={e => setNewTodo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} />
              <button className="btn btn-primary btn-sm" onClick={addTodo} style={{ flexShrink: 0 }}><Plus size={11} /></button>
            </div>
          </div>

          {/* 이번주/한달 입금 현황 */}
          <WeekMonthDeposit sites={sites} cashflows={cashflows} weekStart={weekStart} weekEnd={weekEnd} />
        </div>

        {/* ── 우: 베팅 현황 (flex-1) — site-grid 위에 타이틀 행 없이, site-grid border 위에 오버레이 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {sites.length === 0 ? (
            <>
              <div className="flex-between mb-10">
                <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
                <button onClick={() => setShowSiteMgr(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                  <Settings size={11} /> 사이트관리
                </button>
              </div>
              <div className="card"><div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하세요</div></div>
            </>
          ) : (
            <div className="site-grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>

              {/* ── 타이틀 행: "베팅 현황" + 사이트관리 버튼을 site-grid 첫 행으로 배치 ── */}
              <div style={{
                gridColumn: `1 / -1`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border)',
              }}>
                <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
                <button onClick={() => setShowSiteMgr(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                  <Settings size={11} /> 사이트관리
                </button>
              </div>

              {/* 헤더 행 */}
              {sites.map(site => {
                const dep = site.last_deposit ?? 0; const isusd = site.currency === 'usd'
                const pnl = sitePnL(site)
                return (
                  <div key={site.id} className={`site-col-head ${site.active ? 'site-col-active' : ''}`}>
                    <div style={{ width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 'clamp(10px,1.1vw,13px)' }}>{site.name}</span>
                      {isusd && <span style={{ fontSize: 8, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '0 3px', fontWeight: 700 }}>$</span>}
                      {site.bet_type === 'double' && <span style={{ fontSize: 8, background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid var(--purple-border)', borderRadius: 3, padding: '0 3px', fontWeight: 700 }}>2폴</span>}
                      {site.active && <span className="site-active-dot" />}
                    </div>
                    {pnl !== null && (
                      <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-num)', width: '100%', textAlign: 'center', marginBottom: 2 }} className={pnl >= 0 ? 'profit-pos' : 'profit-neg'}>
                        {pnl >= 0 ? <TrendingUp size={10} style={{ display: 'inline', marginRight: 2 }} /> : <TrendingDown size={10} style={{ display: 'inline', marginRight: 2 }} />}
                        {pnl >= 0 ? '+' : ''}{isusd ? '$' : ''}{pnl.toLocaleString()}{isusd ? '' : '원'}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'absolute', top: 8, right: 8 }}>
                      <button className={`site-icon-btn site-icon-deposit ${dep > 0 ? 'active' : ''}`}
                        onClick={e => { e.stopPropagation(); setDepositSite(site) }} title="입금">
                        <ArrowDownToLine size={13} />
                      </button>
                      <button className="site-icon-btn site-icon-withdraw"
                        onClick={e => { e.stopPropagation(); setWithdrawSite(site) }} title="출금">
                        <LogOut size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* 롤링 진행 행 — 진행률 바+%를 남은 롤링 아래로 이동 */}
              {sites.map(site => {
                const pct = depositPct(site); const rem = depositRemaining(site)
                const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
                const isusd = site.currency === 'usd'; const pfx = isusd ? '$' : ''; const sfx = isusd ? '' : '원'
                const fs = 'clamp(9px,0.9vw,11px)'
                return (
                  <div key={site.id} className={`site-balance-cell ${site.active ? 'site-bal-active' : ''}`} style={{ alignItems: 'stretch', padding: '7px 8px' }}>
                    {dep > 0 || pt > 0 ? (
                      <>
                        {/* 입금 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                          <span style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: 'var(--text-muted)' }}>입금</span>
                          <span style={{ fontFamily: 'var(--font-num)', fontSize: fs, fontWeight: 700, color: '#E2E8F0' }}>{pfx}{dep.toLocaleString()}{sfx}</span>
                        </div>
                        {/* 포인트 — 항상 표시 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                          <span style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: 'var(--text-muted)' }}>포인트</span>
                          <span style={{ fontFamily: 'var(--font-num)', fontSize: fs, fontWeight: 700, color: pt > 0 ? 'var(--purple)' : 'var(--text-muted)' }}>
                            {pt > 0 ? `+${pt.toLocaleString()}P` : '—'}
                          </span>
                        </div>
                        {/* 남은 롤링 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: 'var(--text-muted)' }}>남은 롤링</span>
                          <span style={{ fontFamily: 'var(--font-num)', fontSize: fs, fontWeight: 700, color: rem > 0 ? 'var(--gold)' : 'var(--green)' }}>{pfx}{rem.toLocaleString()}{sfx}</span>
                        </div>
                        {/* 진행률 바 + % — 남은 롤링 아래 */}
                        <div className="deposit-progress-bar" style={{ marginBottom: 2 }}><div className="deposit-progress-fill" style={{ width: `${Math.min(100,pct)}%` }} /></div>
                        <div style={{ fontSize: 'clamp(8px,0.75vw,10px)', color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700, textAlign: 'right' }}>{pct}%</div>
                      </>
                    ) : <div style={{ height: 16 }} />}
                  </div>
                )
              })}

              {/* ── 베팅 목록 ── */}
              {sites.map(site => {
                const pending = pendingBySite(site.id)
                const settled = settledBySite(site.id)
                const isusd   = site.currency === 'usd'
                return (
                  <div key={`col-${site.id}`} className="site-col-bets-wrapper">
                    {/* 대기 베팅 */}
                    {(() => {
                      const renderedGroups = new Set<string>()
                      return pending.map(bet => {
                        if (bet.parlay_group) {
                          if (renderedGroups.has(bet.parlay_group)) return null
                          renderedGroups.add(bet.parlay_group)
                          const groupBets = pending.filter(b => b.parlay_group === bet.parlay_group).sort((a,b) => a.parlay_leg - b.parlay_leg)
                          const isHover = groupBets.some(b => hoverBetId === b.id)
                          return (
                            <div key={bet.parlay_group} className="site-bet-entry parlay-entry"
                              style={{ position: 'relative' }}
                              onMouseEnter={() => setHoverBetId(groupBets[0].id)} onMouseLeave={() => setHoverBetId(null)}>
                              {/* 두폴 레이블 */}
                              <div style={{ fontSize: 8, color: 'var(--purple)', fontWeight: 700, marginBottom: 3, letterSpacing: '0.5px' }}>◈ 두폴</div>
                              {/* 우상단: X 취소버튼 */}
                              {isHover && (
                                <button className="bet-result-icon cancel" title="베팅취소"
                                  style={{ position: 'absolute', top: 4, right: 4 }}
                                  onClick={() => applyParlayResult(groupBets, 'cancel')}><X size={13} /></button>
                              )}
                              {/* leg1, leg2 내용 */}
                              {groupBets.map((gb, idx) => (
                                <div key={gb.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                  <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, width: 18, textAlign: 'center' }}>{idx===0 ? '①' : '②'}</span>
                                  <span className="site-bet-match" style={{ flex: 1, marginBottom: 0 }}>{gb.match}</span>
                                </div>
                              ))}
                              {/* 배당 | 우하단: 적중·실패 버튼 */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 23 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {isHover ? (
                                    <>
                                      <button className="bet-result-icon win"  onClick={() => applyParlayResult(groupBets, 'win')}><CheckCircle size={15} /></button>
                                      <button className="bet-result-icon loss" onClick={() => applyParlayResult(groupBets, 'loss')}><XCircle     size={15} /></button>
                                    </>
                                  ) : (
                                    <Clock size={8} color="var(--text-muted)" />
                                  )}
                                </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingLeft: 23, marginTop: 1 }}>
                                <span style={{ fontFamily: 'var(--font-num)', fontSize: 'clamp(9px,0.85vw,11px)', fontWeight: 700, color: isusd ? 'var(--blue)' : 'var(--text-secondary)' }}>
                                  {isusd ? '$' : ''}{bet.stake.toLocaleString()}{isusd ? '' : '원'}
                                </span>
                              </div>
                            </div>
                          )
                        }
                        // 단폴
                        const isHover = hoverBetId === bet.id
                        return (
                          <div key={bet.id} className="site-bet-entry"
                            style={{ position: 'relative' }}
                            onMouseEnter={() => setHoverBetId(bet.id)} onMouseLeave={() => setHoverBetId(null)}>
                            {/* 우상단: X 취소버튼 */}
                            {isHover && (
                              <button className="bet-result-icon cancel" title="베팅취소"
                                style={{ position: 'absolute', top: 4, right: 4 }}
                                onClick={() => applyResult(bet, 'cancel')}><X size={13} /></button>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                              <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, display: 'inline-block', width: 18, textAlign: 'center' }}>{SPORT_SHORT[bet.sport] ?? '📋'}</span>
                              <span className="site-bet-match" style={{ flex: 1, marginBottom: 0 }}>{bet.match}</span>
                            </div>
                            {/* 배당 | 우하단: 적중·실패 버튼 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 23 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {isHover ? (
                                  <>
                                    <button className="bet-result-icon win"  onClick={() => applyResult(bet, 'win')}><CheckCircle size={15} /></button>
                                    <button className="bet-result-icon loss" onClick={() => applyResult(bet, 'loss')}><XCircle     size={15} /></button>
                                  </>
                                ) : (
                                  <Clock size={8} color="var(--text-muted)" />
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingLeft: 23, marginTop: 1 }}>
                              <span style={{ fontFamily: 'var(--font-num)', fontSize: 'clamp(9px,0.85vw,11px)', fontWeight: 700, color: isusd ? 'var(--blue)' : 'var(--text-secondary)' }}>
                                {isusd ? '$' : ''}{bet.stake.toLocaleString()}{isusd ? '' : '원'}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    })()}

                    {/* + 버튼 / 인라인 폼 */}
                    <div className="site-add-col" style={{ borderRight: 'none' }}>
                      {openFormSiteId !== site.id ? (
                        <button className="site-add-btn" onClick={() => setOpenFormSiteId(site.id)}><Plus size={14} /></button>
                      ) : site.bet_type === 'double' ? (
                        <DoubleBetForm site={site} lastLeg1={getLastLeg1(site.id)} onClose={() => setOpenFormSiteId(null)} onBet={(c1, c2, odds, amt) => submitDoubleBet(site, c1, c2, odds, amt)} />
                      ) : (
                        <SingleBetForm site={site} defaultSport={pending.slice(-1)[0]?.sport ?? 'soccer'} onClose={() => setOpenFormSiteId(null)} onBet={(sp, ct, od, amt) => submitBet(site, sp, ct, od, amt)} />
                      )}
                    </div>

                    {/* 완료 베팅 — 두폴은 그룹으로 묶어 한 박스 렌더 */}
                    {settled.length > 0 && (
                      <div style={{ borderTop: '2px dashed var(--border)', marginTop: 4 }}>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', padding: '3px 8px', fontWeight: 600, letterSpacing: '0.5px' }}>완료</div>
                        {(() => {
                          const renderedGroups = new Set<string>()
                          return settled.map(bet => {
                            if (bet.parlay_group) {
                              if (renderedGroups.has(bet.parlay_group)) return null
                              renderedGroups.add(bet.parlay_group)
                              const groupBets = settled.filter(b => b.parlay_group === bet.parlay_group).sort((a,b) => a.parlay_leg - b.parlay_leg)
                              const rep = groupBets[0]  // leg1 기준으로 profit/result 표시
                              const isHover = groupBets.some(b => hoverBetId === b.id)
                              return (
                                <div key={bet.parlay_group}
                                  className={`site-bet-entry parlay-entry ${rep.result === 'win' ? 'win-entry' : 'loss-entry'}`}
                                  style={{ position: 'relative' }}
                                  onMouseEnter={() => setHoverBetId(rep.id)} onMouseLeave={() => setHoverBetId(null)}>
                                  {isHover && (
                                    <button className="bet-result-icon cancel" title="처리 취소"
                                      style={{ position: 'absolute', top: 4, right: 4 }}
                                      onClick={() => applyParlayRevert(groupBets)}><X size={13} /></button>
                                  )}
                                  <div style={{ fontSize: 8, color: 'var(--purple)', fontWeight: 700, marginBottom: 3, letterSpacing: '0.5px' }}>◈ 두폴</div>
                                  {groupBets.map((gb, idx) => (
                                    <div key={gb.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                      <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, width: 18, textAlign: 'center' }}>{idx===0 ? '①' : '②'}</span>
                                      <span className="site-bet-match" style={{ flex: 1, marginBottom: 0 }}>{gb.match}</span>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingLeft: 23 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-secondary)' }}>{rep.odds.toFixed(2)}</span>
                                    <span className={`badge badge-${rep.result}`} style={{ fontSize: 'clamp(8px,0.75vw,10px)', padding: '1px 4px', flexShrink: 0 }}>
                                      {rep.result === 'win' ? '적중' : rep.result === 'loss' ? '실패' : '적특'}
                                      {rep.profit !== 0 && <span style={{ marginLeft: 3 }}>{rep.profit > 0 ? '+' : ''}{rep.profit.toLocaleString()}</span>}
                                    </span>
                                  </div>
                                </div>
                              )
                            }
                            // 단폴
                            const isHover = hoverBetId === bet.id
                            return (
                              <div key={bet.id}
                                className={`site-bet-entry ${bet.result === 'win' ? 'win-entry' : 'loss-entry'}`}
                                style={{ position: 'relative' }}
                                onMouseEnter={() => setHoverBetId(bet.id)} onMouseLeave={() => setHoverBetId(null)}>
                                {isHover && (
                                  <button className="bet-result-icon cancel" title="처리 취소"
                                    style={{ position: 'absolute', top: 4, right: 4 }}
                                    onClick={() => applyResult(bet, 'revert')}><X size={13} /></button>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                  <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, display: 'inline-block', width: 18, textAlign: 'center' }}>{SPORT_SHORT[bet.sport] ?? '📋'}</span>
                                  <span className="site-bet-match" style={{ flex: 1, marginBottom: 0 }}>{bet.match}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingLeft: 23 }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)}</span>
                                  <span className={`badge badge-${bet.result}`} style={{ fontSize: 'clamp(8px,0.75vw,10px)', padding: '1px 4px', flexShrink: 0 }}>
                                    {bet.result === 'win' ? '적중' : bet.result === 'loss' ? '실패' : '적특'}
                                    {bet.profit !== 0 && <span style={{ marginLeft: 3 }}>{bet.profit > 0 ? '+' : ''}{bet.profit.toLocaleString()}</span>}
                                  </span>
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}

            </div>
          )}
        </div>
      </div>

      {/* 모달 */}
      {showSiteMgr && (
        <SiteMgrModal sites={sites} onClose={() => setShowSiteMgr(false)} onAdd={addSite} onDelete={deleteSite} onToggleCurrency={toggleCurrency} onToggleBetType={toggleBetType} onReorder={reorderSites} />
      )}
      {depositSite && <DepositModal site={depositSite} onClose={() => setDepositSite(null)} onDeposit={doDeposit} onPoint={doPoint} />}
      {withdrawSite && <WithdrawModal site={withdrawSite} onClose={() => setWithdrawSite(null)} onWithdraw={doWithdraw} />}
    </div>
  )
}

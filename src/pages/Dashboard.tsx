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
  volleyball: '🏐', hockey: '🏒', esports: '🎮', other: '•',
}

/* ── 배당 파싱 ── */
function parseOdds(raw: string): number {
  const n = Number(raw.trim())
  if (isNaN(n) || n <= 0) return 0
  if (Number.isInteger(n) && n >= 100) return n / 100
  return n
}

/* ── 내용 문자열에서 마켓 자동 분류 ──
   "팀A"               → moneyline, pick="팀A"
   "팀A -1.5"          → handicap,  pick="팀A -1.5"
   "팀A +2.5" / "3.5"  → handicap(+), pick=그대로
   "2.5 오버" "오버 2.5" "언더 3.5" → over/under
*/
function autoMarket(content: string): { market: Market; pick: string } {
  const s = content.trim()
  // 오버/언더
  if (/오버/i.test(s) || /over/i.test(s)) {
    return { market: 'over', pick: s }
  }
  if (/언더/i.test(s) || /under/i.test(s)) {
    return { market: 'under', pick: s }
  }
  // 마이너스 핸디캡: "팀A -1.5"
  if (/-\s*\d/.test(s)) {
    return { market: 'handicap', pick: s }
  }
  // 플러스 핸디캡: "팀A +2.5" 또는 숫자만 "3.5"
  if (/\+\s*\d/.test(s) || /^\d+(\.\d+)?$/.test(s)) {
    return { market: 'handicap', pick: s }
  }
  // 기본: 승패
  return { market: 'moneyline', pick: s }
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
  onDeposit: (amount: number) => void; onPoint: (amount: number) => void
}) {
  const [tab, setTab] = useState<'deposit' | 'point'>('deposit')
  const [amount, setAmount] = useState('')
  const num = Number(amount)
  const isusd = site.currency === 'usd'
  const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
  const tot = dep + pt; const done = site.deposit_bet_done ?? 0
  const rem = Math.max(0, tot - done); const pct = tot > 0 ? Math.min(100, Math.round(done / tot * 100)) : 0
  const unit = isusd ? '$' : '원'

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
        {(dep > 0 || pt > 0) && (
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2 }}>입금 / 포인트</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 700, color: 'var(--orange)' }}>{isusd ? '$' : ''}{dep.toLocaleString()}{isusd ? '' : '원'}</span>
                  {pt > 0 && <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>+{pt.toLocaleString()}P</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 2 }}>남은 롤링</div>
                <div style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 700, color: rem > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>{isusd ? '$' : ''}{rem.toLocaleString()}{isusd ? '' : '원'}</div>
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
            포인트는 롤링 총액에만 합산됩니다
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input className="form-input" type="number" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && num > 0) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} autoFocus />
          <button className="btn btn-primary" disabled={!num || num <= 0} onClick={() => { if (num > 0) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} style={{ flexShrink: 0 }}>
            <Check size={12} /> {tab === 'deposit' ? '입금' : '추가'}
          </button>
        </div>
        {num > 0 && tab === 'deposit' && dep > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '5px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 10 }}>
            추가 후 총 입금 → <span style={{ color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-num)' }}>{isusd ? '$' : ''}{(dep + num).toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 출금 모달 ── */
function WithdrawModal({ site, onClose, onWithdraw }: {
  site: Site; onClose: () => void; onWithdraw: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')
  const num = Number(amount); const isusd = site.currency === 'usd'
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
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, marginBottom: 12, background: netProfit >= 0 ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${netProfit >= 0 ? 'var(--green-border)' : 'var(--red-border)'}` }}>
            수익: <span className={netProfit >= 0 ? 'profit-pos' : 'profit-neg'}>
              {netProfit >= 0 ? '+' : ''}{isusd ? '$' : ''}{netProfit.toLocaleString()}{isusd ? '' : '원'}
            </span>
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 12 }}>출금 후 사이트는 <strong style={{ color: 'var(--red)' }}>비활성화</strong>됩니다</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
        </div>
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
  const dragId = useRef<string | null>(null); const overId = useRef<string | null>(null)

  function handleAdd() {
    if (!newName.trim()) return
    onAdd(newName.trim(), newCurrency, newBetType); setNewName('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={16} color="var(--gold)" /> 사이트 관리</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
          사이트 목록 <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9 }}>(드래그로 순서 변경)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {sites.map(s => (
            <div key={s.id} className="site-mgr-row"
              draggable
              onDragStart={() => { dragId.current = s.id }}
              onDragOver={e => { e.preventDefault(); overId.current = s.id }}
              onDrop={() => {
                if (dragId.current && overId.current && dragId.current !== overId.current) onReorder(dragId.current, overId.current)
                dragId.current = null; overId.current = null
              }}
              style={{ cursor: 'grab' }}
            >
              <GripVertical size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: s.active ? 'var(--green)' : 'var(--border)', boxShadow: s.active ? '0 0 5px var(--green)' : 'none' }} />
              <span className="site-mgr-name">{s.name}</span>
              {/* KRW / USD 토글 */}
              <button onClick={() => onToggleCurrency(s)} title="KRW/USD 전환" style={{ background: s.currency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)', border: `1px solid ${s.currency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`, borderRadius: 4, color: s.currency === 'usd' ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, transition: 'all 0.15s' }}>
                {s.currency === 'usd' ? <><DollarSign size={10} /> USD</> : '₩ KRW'}
              </button>
              {/* 단폴 / 두폴 토글 */}
              <button onClick={() => onToggleBetType(s)} title="단폴/두폴 전환" style={{ background: s.bet_type === 'double' ? 'var(--purple-bg)' : 'var(--bg-elevated)', border: `1px solid ${s.bet_type === 'double' ? 'var(--purple-border)' : 'var(--border)'}`, borderRadius: 4, color: s.bet_type === 'double' ? 'var(--purple)' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' }}>
                {s.bet_type === 'double' ? '두폴' : '단폴'}
              </button>
              <button onClick={() => onDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: 0.6, padding: 3, display: 'flex', flexShrink: 0 }}><Trash2 size={12} /></button>
            </div>
          ))}
          {sites.length === 0 && <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>사이트가 없습니다</div>}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>새 사이트 추가</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="사이트 이름" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus />
            <button onClick={() => setNewCurrency(p => p === 'krw' ? 'usd' : 'krw')} style={{ background: newCurrency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)', border: `1px solid ${newCurrency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`, borderRadius: 4, color: newCurrency === 'usd' ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer', padding: '0 10px', fontSize: 11, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' }}>
              {newCurrency === 'usd' ? '$' : '₩'}
            </button>
            <button onClick={() => setNewBetType(p => p === 'single' ? 'double' : 'single')} style={{ background: newBetType === 'double' ? 'var(--purple-bg)' : 'var(--bg-elevated)', border: `1px solid ${newBetType === 'double' ? 'var(--purple-border)' : 'var(--border)'}`, borderRadius: 4, color: newBetType === 'double' ? 'var(--purple)' : 'var(--text-muted)', cursor: 'pointer', padding: '0 8px', fontSize: 10, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' }}>
              {newBetType === 'double' ? '두폴' : '단폴'}
            </button>
            <button className="btn btn-primary" onClick={handleAdd} style={{ flexShrink: 0 }}><Plus size={12} /> 추가</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (단폴) ── */
function SingleBetForm({ site, onClose, onBet, defaultSport }: {
  site: Site; onClose: () => void
  defaultSport: string
  onBet: (sport: string, content: string, odds: number, amount: number) => Promise<boolean>
}) {
  const [sport, setSport]   = useState(defaultSport || 'soccer')
  const [content, setContent] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isusd = site.currency === 'usd'
  const unit  = isusd ? '$' : '원'
  const oddsV = parseOdds(oddsRaw)
  const stakeN = Number(amount)
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
      {/* 종목 */}
      <select className="form-select inline-bet-input" value={sport} onChange={e => setSport(e.target.value)}>
        {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {/* 내용 */}
      <input className="form-input inline-bet-input" placeholder="경기 내용" value={content} onChange={e => setContent(e.target.value)} autoFocus />
      {/* 배당 */}
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>→ {oddsV.toFixed(2)}</div>}
      {/* 금액 */}
      <input className="form-input inline-bet-input" type="number" placeholder={`금액 (${unit})`} value={amount}
        onChange={e => setAmount(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()} />
      {/* 핫키 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(p => String(Number(p || 0) + hk))}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      {/* 예상 수익 */}
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, textAlign: 'right' }}>
          +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0' }}
          onClick={submit} disabled={!content || oddsV <= 0 || stakeN <= 0 || submitting}>
          <Check size={12} /> 등록
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (두폴) ── */
/* 두폴: 내용①(축)+내용② → 공통 배당 하나 → 금액 */
function DoubleBetForm({ site, lastLeg1, onClose, onBet }: {
  site: Site
  lastLeg1: { content: string } | null
  onClose: () => void
  /* onBet: 내용1, 내용2, 공통배당, 금액 */
  onBet: (c1: string, c2: string, odds: number, amount: number) => Promise<boolean>
}) {
  const [c1, setC1] = useState(lastLeg1?.content ?? '')
  const [c2, setC2] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isusd  = site.currency === 'usd'
  const unit   = isusd ? '$' : '원'
  const oddsV  = parseOdds(oddsRaw)
  const stakeN = Number(amount)
  const hotkeys = isusd ? [5, 10] : [5000, 10000]

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

  const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 2 }

  return (
    <div className="inline-bet-form">
      {/* ① 축베팅 내용 */}
      <div style={labelStyle}>① 축 (자동채움)</div>
      <input className="form-input inline-bet-input" placeholder="경기 내용 ①" value={c1}
        onChange={e => setC1(e.target.value)} autoFocus={!lastLeg1} />

      {/* ② 날개 베팅 내용 */}
      <div style={{ ...labelStyle, marginTop: 4 }}>② 날개</div>
      <input className="form-input inline-bet-input" placeholder="경기 내용 ②" value={c2}
        onChange={e => setC2(e.target.value)} autoFocus={!!lastLeg1} />

      {/* 공통 배당 */}
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && (
        <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>배당 → {oddsV.toFixed(2)}</div>
      )}

      {/* 금액 */}
      <input className="form-input inline-bet-input" type="number" placeholder={`금액 (${unit})`} value={amount}
        onChange={e => setAmount(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()} />
      {/* 핫키 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(p => String(Number(p || 0) + hk))}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      {/* 예상 수익 */}
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, textAlign: 'right' }}>
          +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      {/* 등록/취소 버튼 */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0' }}
          onClick={submit} disabled={!c1 || !c2 || oddsV <= 0 || stakeN <= 0 || submitting}>
          <Check size={12} /> 등록
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ════════════════════════════════
   DASHBOARD
════════════════════════════════ */
export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')

  const [sites, setSites]               = useState<Site[]>([])
  const [bets, setBets]                 = useState<Bet[]>([])

  const [showSiteMgr, setShowSiteMgr]   = useState(false)
  const [depositSite, setDepositSite]   = useState<Site | null>(null)
  const [withdrawSite, setWithdrawSite] = useState<Site | null>(null)

  /* 인라인 폼: 열린 사이트 ID */
  const [openFormSiteId, setOpenFormSiteId] = useState<string | null>(null)

  const [hoverBetId, setHoverBetId]     = useState<string | null>(null)

  const [todos, setTodos]       = useState<Todo[]>([])
  const [newTodo, setNewTodo]   = useState('')
  const [calOpenId, setCalOpenId] = useState<string | null>(null)

  useEffect(() => { loadSites(); loadBets(); loadTodos() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }
  async function loadBets() {
    /* 오래된 것 먼저 = 위에, 최신 = 아래 */
    const { data } = await supabase.from('bets').select('*').order('bet_date', { ascending: true }).order('created_at', { ascending: true })
    if (data) setBets(data)
  }
  async function loadTodos() {
    const { data } = await supabase.from('todos').select('*').order('created_at')
    if (data) setTodos(data)
  }

  /* ── 계산 헬퍼 ── */
  const totalRolling     = (s: Site) => (s.last_deposit ?? 0) + (s.point_deposit ?? 0)
  const depositRemaining = (s: Site) => Math.max(0, totalRolling(s) - (s.deposit_bet_done ?? 0))
  const depositPct       = (s: Site) => totalRolling(s) > 0 ? Math.min(100, Math.round((s.deposit_bet_done ?? 0) / totalRolling(s) * 100)) : 0
  const betsBySite       = (id: string) => bets.filter(b => b.site_id === id)
  const colCount         = Math.max(1, sites.length)
  const todayChecked     = todos.filter(t => t.check_dates.includes(today)).length

  /* 두폴 사이트의 마지막 leg1 찾기 (축베팅 자동 채움) */
  function getLastLeg1(siteId: string): { content: string } | null {
    const siteBets = betsBySite(siteId).filter(b => b.parlay_leg === 1 && b.result === 'pending')
    if (!siteBets.length) return null
    const last = siteBets[siteBets.length - 1]
    return { content: last.match }
  }

  /* ── 사이트 관리 ── */
  async function addSite(name: string, currency: 'krw' | 'usd', betType: 'single' | 'double') {
    const { data } = await supabase.from('sites').insert({
      name, balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
      point_deposit: 0, total_withdrawal: 0, currency, bet_type: betType,
    }).select().single()
    if (data) {
      await logAction({ action_type: 'insert', table_name: 'sites', record_id: data.id, after_data: data, description: `사이트 추가: ${data.name}` })
      setSites(p => [...p, data])
    }
  }
  async function deleteSite(id: string) {
    const site = sites.find(s => s.id === id)
    if (!site || !confirm(`${site.name} 삭제?`)) return
    await logAction({ action_type: 'delete', table_name: 'sites', record_id: id, before_data: site as never, description: `사이트 삭제: ${site.name}` })
    await supabase.from('sites').delete().eq('id', id)
    setSites(p => p.filter(s => s.id !== id))
  }
  async function toggleCurrency(site: Site) {
    const next = site.currency === 'krw' ? 'usd' : 'krw'
    const { data } = await supabase.from('sites').update({ currency: next }).eq('id', site.id).select().single()
    if (data) setSites(p => p.map(s => s.id === site.id ? data : s))
  }
  async function toggleBetType(site: Site) {
    const next = site.bet_type === 'single' ? 'double' : 'single'
    const { data } = await supabase.from('sites').update({ bet_type: next }).eq('id', site.id).select().single()
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
    const newTotal = (depositSite.last_deposit ?? 0) + amount
    const { data } = await supabase.from('sites').update({ balance: depositSite.balance + amount, active: true, last_deposit: newTotal }).eq('id', depositSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 입금 +${amount.toLocaleString()}` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(amount * usdKrwRate) }
      await supabase.from('cashflows').insert({ flow_date: today, type: 'expense', category: '베팅입금', description: `${depositSite.name} 입금`, amount, site_id: depositSite.id, currency: depositSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : amount })
    }
    setDepositSite(null)
  }
  async function doPoint(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }; const newPoint = (depositSite.point_deposit ?? 0) + amount
    const { data } = await supabase.from('sites').update({ balance: depositSite.balance + amount, point_deposit: newPoint }).eq('id', depositSite.id).select().single()
    if (data) { await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 포인트 +${amount.toLocaleString()}P` }); setSites(p => p.map(s => s.id === data.id ? data : s)) }
    setDepositSite(null)
  }

  /* ── 출금 ── */
  async function doWithdraw(amount: number) {
    if (!withdrawSite) return
    const before = { ...withdrawSite }; const isusd = withdrawSite.currency === 'usd'
    const totalIn = (withdrawSite.last_deposit ?? 0) + (withdrawSite.point_deposit ?? 0)
    const netProfit = amount - totalIn
    const newWithdrawal = (withdrawSite.total_withdrawal ?? 0) + amount
    const { data } = await supabase.from('sites').update({ active: false, total_withdrawal: newWithdrawal, balance: 0, last_deposit: 0, deposit_bet_done: 0, point_deposit: 0 }).eq('id', withdrawSite.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${withdrawSite.name} 출금 ${amount.toLocaleString()}` })
      setSites(p => p.map(s => s.id === data.id ? data : s))
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(Math.abs(netProfit) * usdKrwRate) }
      await supabase.from('cashflows').insert({ flow_date: today, type: netProfit >= 0 ? 'income' : 'expense', category: netProfit >= 0 ? '베팅수익' : '베팅손실', description: `${withdrawSite.name} 마감 (출금 ${amount.toLocaleString()})`, amount: Math.abs(netProfit), site_id: withdrawSite.id, currency: withdrawSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : Math.abs(netProfit) })
    }
    setWithdrawSite(null)
  }

  /* ── 공통 베팅 제출 (단폴) ── */
  async function submitBet(site: Site, sport: string, content: string, odds: number, stake: number): Promise<boolean> {
    if (stake > site.balance) { alert('잔액이 부족합니다'); return false }
    const { market, pick } = autoMarket(content)
    const { data: betData } = await supabase.from('bets').insert({
      bet_date: today, sport: sport as Sport, league: '', match: content,
      market, pick, odds, stake,
      result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id,
      parlay_group: null, parlay_leg: 1,
    }).select().single()
    if (!betData) return false
    const siteBefore = { ...site }; const newBetDone = (site.deposit_bet_done ?? 0) + stake
    const { data: siteData } = await supabase.from('sites').update({ balance: site.balance - stake, rolling_done: site.rolling_done + stake, deposit_bet_done: newBetDone }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${site.name}] ${content} / ${pick} / ${stake.toLocaleString()}` })
      await logAction({ action_type: 'update', table_name: 'sites', record_id: siteData.id, before_data: siteBefore as never, after_data: siteData as never, description: `[${site.name}] 잔액 -${stake.toLocaleString()}` })
      setBets(p => [...p, betData]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      return true
    }
    return false
  }

  /* ── 두폴 베팅 제출 (내용①②, 공통배당, 금액) ── */
  async function submitDoubleBet(site: Site, c1: string, c2: string, odds: number, stake: number): Promise<boolean> {
    if (stake > site.balance) { alert('잔액이 부족합니다'); return false }
    const groupId = crypto.randomUUID()
    const { market: m1, pick: p1 } = autoMarket(c1)
    const { market: m2, pick: p2 } = autoMarket(c2)

    /* 두 leg 모두 같은 배당(콤보배당), 같은 stake */
    const inserts = [
      { bet_date: today, sport: 'soccer' as Sport, league: '', match: c1, market: m1, pick: p1, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: groupId, parlay_leg: 1 },
      { bet_date: today, sport: 'soccer' as Sport, league: '', match: c2, market: m2, pick: p2, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: groupId, parlay_leg: 2 },
    ]
    const { data: betsData } = await supabase.from('bets').insert(inserts).select()
    if (!betsData || betsData.length < 2) return false

    const siteBefore = { ...site }; const newBetDone = (site.deposit_bet_done ?? 0) + stake
    const { data: siteData } = await supabase.from('sites').update({ balance: site.balance - stake, rolling_done: site.rolling_done + stake, deposit_bet_done: newBetDone }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betsData[0].id, after_data: betsData[0] as never, description: `[${site.name}] 두폴 ${c1} × ${c2} / 배당${odds} / ${stake.toLocaleString()}` })
      await logAction({ action_type: 'update', table_name: 'sites', record_id: siteData.id, before_data: siteBefore as never, after_data: siteData as never, description: `[${site.name}] 잔액 -${stake.toLocaleString()}` })
      setBets(p => [...p, ...betsData]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      return true
    }
    return false
  }

  /* ── 결과처리 ── */
  async function applyResult(bet: Bet, result: BetResult | 'cancel') {
    const site = sites.find(s => s.id === bet.site_id)
    if (result === 'cancel') {
      if (!confirm('베팅을 취소하고 잔액/롤링을 복원할까요?')) return
      /* 두폴이면 같은 그룹 모두 취소 */
      const groupBets = bet.parlay_group ? bets.filter(b => b.parlay_group === bet.parlay_group) : [bet]
      for (const gb of groupBets) {
        await logAction({ action_type: 'delete', table_name: 'bets', record_id: gb.id, before_data: gb as never, description: `베팅 취소: ${gb.match}` })
        await supabase.from('bets').delete().eq('id', gb.id)
      }
      setBets(p => p.filter(b => !groupBets.some(gb => gb.id === b.id)))
      if (site) {
        const siteBefore = { ...site }
        const { data: sd } = await supabase.from('sites').update({
          balance: site.balance + bet.stake,
          rolling_done: Math.max(0, site.rolling_done - bet.stake),
          deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - bet.stake),
        }).eq('id', site.id).select().single()
        if (sd) { await logAction({ action_type: 'update', table_name: 'sites', record_id: sd.id, before_data: siteBefore as never, after_data: sd as never, description: `[${site.name}] 취소 복원 +${bet.stake.toLocaleString()}` }); setSites(p => p.map(s => s.id === sd.id ? sd : s)) }
      }
      return
    }

    /* 두폴: leg1과 leg2 결과가 모두 있어야 정산 */
    if (bet.parlay_group) {
      const profit = result === 'win' ? Math.round(bet.stake * (bet.odds - 1)) : result === 'loss' ? -bet.stake : 0
      const before = { ...bet }
      const { data } = await supabase.from('bets').update({ result, profit }).eq('id', bet.id).select().single()
      if (data) {
        await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `결과: ${bet.match} → ${result}` })
        setBets(p => p.map(b => b.id === data.id ? data : b))
        /* 두 leg 모두 결과가 있으면 잔액 반영 */
        const updatedBets = bets.map(b => b.id === data.id ? data : b)
        const groupBets = updatedBets.filter(b => b.parlay_group === bet.parlay_group)
        if (groupBets.every(b => b.result !== 'pending') && site) {
          const allWin = groupBets.every(b => b.result === 'win')
          if (allWin) {
            const comboOdds = groupBets.reduce((a, b) => a * b.odds, 1)
            const delta = bet.stake + Math.round(bet.stake * (comboOdds - 1))
            const { data: sd } = await supabase.from('sites').update({ balance: site.balance + delta }).eq('id', site.id).select().single()
            if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
          }
        }
      }
      return
    }

    /* 단폴 */
    const profit = result === 'win' ? Math.round(bet.stake * (bet.odds - 1)) : result === 'loss' ? -bet.stake : 0
    const before = { ...bet }
    const { data } = await supabase.from('bets').update({ result, profit }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `결과: ${bet.match} → ${result === 'win' ? '적중' : result === 'loss' ? '실패' : '적특'}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
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

  /* ════════════ RENDER ════════════ */
  return (
    <div className="page">
      {/* fullwidth 레이아웃: 베팅현황 + 할일 나란히 */}
      <div className="dashboard-layout-full">

        {/* ── 베팅 현황 (fullwidth) ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex-between mb-10">
            <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
            <button
              onClick={() => setShowSiteMgr(true)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
            >
              <Settings size={11} /> 사이트관리
            </button>
          </div>

          {sites.length === 0 ? (
            <div className="card"><div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하세요</div></div>
          ) : (
            <div className="site-grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>

              {/* 헤더 행 */}
              {sites.map(site => {
                const dep = site.last_deposit ?? 0; const isusd = site.currency === 'usd'
                return (
                  <div key={site.id} className={`site-col-head ${site.active ? 'site-col-active' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 'clamp(10px,1.1vw,13px)' }}>{site.name}</span>
                      {isusd && <span style={{ fontSize: 8, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '0 3px', fontWeight: 700 }}>$</span>}
                      {site.bet_type === 'double' && <span style={{ fontSize: 8, background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid var(--purple-border)', borderRadius: 3, padding: '0 3px', fontWeight: 700 }}>두폴</span>}
                      {site.active && <span className="site-active-dot" />}
                    </div>
                    {/* 입금(위) / 출금(아래) — 우측 끝 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'absolute', top: 6, right: 6 }}>
                      <button className={`site-txn-btn site-txn-deposit ${dep > 0 ? 'has-deposit' : ''}`}
                        onClick={e => { e.stopPropagation(); setDepositSite(site) }}>입금</button>
                      <button className="site-txn-btn site-txn-withdraw"
                        onClick={e => { e.stopPropagation(); setWithdrawSite(site) }}>출금</button>
                    </div>
                  </div>
                )
              })}

              {/* 롤링 진행 행 */}
              {sites.map(site => {
                const pct = depositPct(site); const rem = depositRemaining(site)
                const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
                const isusd = site.currency === 'usd'; const pfx = isusd ? '$' : ''; const sfx = isusd ? '' : '원'
                const fs = 'clamp(9px,0.9vw,11px)'
                return (
                  <div key={site.id} className={`site-balance-cell ${site.active ? 'site-bal-active' : ''}`} style={{ alignItems: 'stretch', padding: '7px 8px' }}>
                    {dep > 0 || pt > 0 ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: 'var(--text-muted)' }}>입금</span>
                          <span style={{ fontFamily: 'var(--font-num)', fontSize: fs, fontWeight: 700, color: 'var(--orange)' }}>{pfx}{dep.toLocaleString()}{sfx}</span>
                        </div>
                        {pt > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: 'var(--text-muted)' }}>포인트</span>
                            <span style={{ fontFamily: 'var(--font-num)', fontSize: fs, fontWeight: 700, color: 'var(--purple)' }}>+{pt.toLocaleString()}P</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 'clamp(8px,0.8vw,10px)', color: 'var(--text-muted)' }}>남은 롤링</span>
                          <span style={{ fontFamily: 'var(--font-num)', fontSize: fs, fontWeight: 700, color: rem > 0 ? 'var(--gold)' : 'var(--green)' }}>{pfx}{rem.toLocaleString()}{sfx}</span>
                        </div>
                        <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${pct}%` }} /></div>
                        <div style={{ fontSize: 'clamp(8px,0.75vw,10px)', color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700, marginTop: 2, textAlign: 'right' }}>{pct}%</div>
                      </>
                    ) : <div style={{ height: 16 }} />}
                  </div>
                )
              })}

              {/* 베팅 목록 (아래쪽에 최신 베팅 쌓임) */}
              {(() => {
                const maxRows = Math.max(...sites.map(s => betsBySite(s.id).length), 1)
                return Array.from({ length: maxRows }).map((_, rowIdx) =>
                  sites.map(site => {
                    const siteBets = betsBySite(site.id)
                    const bet = siteBets[rowIdx]
                    const isHover = hoverBetId === bet?.id
                    const isusd = site.currency === 'usd'
                    const isParlay = !!bet?.parlay_group
                    return (
                      <div key={`${site.id}-${rowIdx}`} className="site-bets-col">
                        {bet ? (
                          <div
                            className={`site-bet-entry ${bet.result === 'win' ? 'win-entry' : bet.result === 'loss' ? 'loss-entry' : ''} ${isParlay ? 'parlay-entry' : ''}`}
                            onMouseEnter={() => setHoverBetId(bet.id)}
                            onMouseLeave={() => setHoverBetId(null)}
                          >
                            {/* 종목 + 금액 헤더 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 9 }} title={bet.sport}>
                                {SPORT_SHORT[bet.sport] ?? '•'}
                                {isParlay && <span style={{ fontSize: 8, background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid var(--purple-border)', borderRadius: 3, padding: '0 3px', fontWeight: 700, marginLeft: 3 }}>LEG{bet.parlay_leg}</span>}
                              </span>
                              <span style={{ fontFamily: 'var(--font-num)', fontSize: 'clamp(9px,0.85vw,11px)', fontWeight: 700, color: isusd ? 'var(--blue)' : 'var(--text-secondary)' }}>
                                {isusd ? '$' : ''}{bet.stake.toLocaleString()}{isusd ? '' : '원'}
                              </span>
                            </div>
                            <div className="site-bet-match">{bet.match}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(9px,0.85vw,11px)', color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)}</span>
                              <div className="bet-result-icons">
                                {bet.result === 'pending' ? (
                                  isHover ? (
                                    <>
                                      <button className="bet-result-icon win"    title="적중"          onClick={() => applyResult(bet, 'win')}><CheckCircle  size={15} /></button>
                                      <button className="bet-result-icon loss"   title="실패"          onClick={() => applyResult(bet, 'loss')}><XCircle      size={15} /></button>
                                      <button className="bet-result-icon cancel" title="취소(롤링복원)" onClick={() => applyResult(bet, 'cancel')}><MinusCircle size={15} /></button>
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
                          </div>
                        ) : <div style={{ height: 8 }} />}
                      </div>
                    )
                  })
                )
              })()}

              {/* + 버튼 / 인라인 폼 행 */}
              {sites.map(site => {
                const isOpen = openFormSiteId === site.id
                return (
                  <div key={`add-${site.id}`} className="site-add-col">
                    {!isOpen ? (
                      <button className="site-add-btn" onClick={() => setOpenFormSiteId(site.id)} title="베팅 추가">
                        <Plus size={14} />
                      </button>
                    ) : site.bet_type === 'double' ? (
                      <DoubleBetForm
                        site={site}
                        lastLeg1={getLastLeg1(site.id)}
                        onClose={() => setOpenFormSiteId(null)}
                        onBet={(c1, c2, odds, amount) => submitDoubleBet(site, c1, c2, odds, amount)}
                      />
                    ) : (
                      <SingleBetForm
                        site={site}
                        defaultSport={betsBySite(site.id).filter(b => b.parlay_leg !== 2).slice(-1)[0]?.sport ?? 'soccer'}
                        onClose={() => setOpenFormSiteId(null)}
                        onBet={(sport, content, odds, amount) => submitBet(site, sport, content, odds, amount)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 우: 할일 (고정 240px) ── */}
        <div style={{ width: 230, flexShrink: 0 }}>
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

      {/* 모달들 */}
      {showSiteMgr && (
        <SiteMgrModal sites={sites} onClose={() => setShowSiteMgr(false)} onAdd={addSite} onDelete={deleteSite} onToggleCurrency={toggleCurrency} onToggleBetType={toggleBetType} onReorder={reorderSites} />
      )}
      {depositSite && <DepositModal site={depositSite} onClose={() => setDepositSite(null)} onDeposit={doDeposit} onPoint={doPoint} />}
      {withdrawSite && <WithdrawModal site={withdrawSite} onClose={() => setWithdrawSite(null)} onWithdraw={doWithdraw} />}
    </div>
  )
}

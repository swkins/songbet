import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import {
  Plus, Trash2, Check, X,
  RotateCcw, Settings,
  CheckCircle, XCircle, Ban, MinusCircle, Gift, GripVertical, DollarSign,
  TrendingUp, TrendingDown, ArrowDownToLine, LogOut, Pencil,
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


/* ── 입금 모달 ── */
function DepositModal({ site, onClose, onDeposit, onPoint }: {
  site: Site; onClose: () => void
  onDeposit: (amount: number) => void; onPoint: (amount: number) => void
}) {
  const [tab, setTab] = useState<'deposit' | 'point'>('deposit')
  const [amount, setAmount] = useState('')
  const num = Number(amount.replace(/,/g, ""))
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
          <input className="form-input" type="text" inputMode="numeric" placeholder="0" value={amount}
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
  const num = Number(amount.replace(/,/g, '')); const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
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
          <input className="form-input" type="text" inputMode="numeric" placeholder="0" value={amount}
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
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
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

/* ── 인라인 베팅 수정폼 ── */
/* ── 공통 인라인 수정폼 스타일 헬퍼 ── */
function EditFormAmountRow({ isusd, amount, setAmount }: { isusd: boolean; amount: string; setAmount: (v: string) => void }) {
  const unit = isusd ? '$' : '원'
  const stakeN = Number(amount.replace(/,/g, ''))
  const hotkeys = isusd ? [5, 10] : [5000, 10000]
  return (
    <>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input className="form-input inline-bet-input" type="text" inputMode="numeric" placeholder={`금액 (${unit})`}
          value={stakeN > 0 ? stakeN.toLocaleString() : amount}
          style={{ flex: 1, MozAppearance: 'textfield' } as React.CSSProperties}
          onChange={e => { const r = e.target.value.replace(/,/g, ''); if (r === '' || /^\d+$/.test(r)) setAmount(r) }} />
        <button onClick={() => setAmount('')} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>초기화</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(String(Number(amount.replace(/,/g,'') || 0) + hk))}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
    </>
  )
}

/* ── 인라인 단폴 수정폼 ── */
function InlineBetEditForm({ bet, site, onClose, onSave }: {
  bet: Bet; site: Site
  onClose: () => void
  onSave: (sport: string, content: string, odds: number, stake: number) => Promise<void>
}) {
  const isusd = site.currency === 'usd'
  const [sport, setSport]     = useState(bet.sport)
  const [content, setContent] = useState(bet.match)
  const [oddsRaw, setOddsRaw] = useState(bet.odds.toFixed(2))
  const [amount, setAmount]   = useState(String(bet.stake))
  const [submitting, setSubmitting] = useState(false)
  const oddsV = parseOdds(oddsRaw)
  const stakeN = Number(amount.replace(/,/g, ''))

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  async function submit() {
    if (!content || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true); await onSave(sport, content, oddsV, stakeN); setSubmitting(false)
  }
  return (
    <div className="inline-bet-form" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-bg)' }}>
      <select className="form-select inline-bet-input" value={sport} onChange={e => setSport(e.target.value as typeof bet.sport)}>
        {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <input className="form-input inline-bet-input" placeholder="경기 내용" value={content}
        onChange={e => setContent(e.target.value)} autoFocus />
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>→ {oddsV.toFixed(2)}</div>}
      <EditFormAmountRow isusd={isusd} amount={amount} setAmount={setAmount} />
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!content || oddsV <= 0 || stakeN <= 0 || submitting}>
          {submitting ? '저장중...' : '수정 저장'}
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 두폴 수정폼 ── */
function InlineParlayEditForm({ groupBets, site, onClose, onSave }: {
  groupBets: Bet[]; site: Site
  onClose: () => void
  onSave: (c1: string, c2: string, odds: number, stake: number) => Promise<void>
}) {
  const isusd = site.currency === 'usd'
  const leg1 = groupBets.find(b => b.parlay_leg === 1)
  const leg2 = groupBets.find(b => b.parlay_leg === 2)
  const [c1, setC1]           = useState(leg1?.match ?? '')
  const [c2, setC2]           = useState(leg2?.match ?? '')
  const [oddsRaw, setOddsRaw] = useState((leg1?.odds ?? 1).toFixed(2))
  const [amount, setAmount]   = useState(String(leg1?.stake ?? 0))
  const [submitting, setSubmitting] = useState(false)
  const oddsV  = parseOdds(oddsRaw)
  const stakeN = Number(amount.replace(/,/g, ''))
  const labelSt: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 2 }

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  async function submit() {
    if (!c1 || !c2 || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true); await onSave(c1, c2, oddsV, stakeN); setSubmitting(false)
  }
  return (
    <div className="inline-bet-form" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-bg)' }}>
      <div style={labelSt}>① 축</div>
      <input className="form-input inline-bet-input" placeholder="경기 내용 ①" value={c1}
        onChange={e => setC1(e.target.value)} autoFocus />
      <div style={{ ...labelSt, marginTop: 4 }}>② 날개</div>
      <input className="form-input inline-bet-input" placeholder="경기 내용 ②" value={c2}
        onChange={e => setC2(e.target.value)} />
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>배당 → {oddsV.toFixed(2)}</div>}
      <EditFormAmountRow isusd={isusd} amount={amount} setAmount={setAmount} />
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!c1 || !c2 || oddsV <= 0 || stakeN <= 0 || submitting}>
          {submitting ? '저장중...' : '수정 저장'}
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (단폴) ── */
function SingleBetForm({ site, onClose, onBet, defaultSport }: {
  site: Site; onClose: () => void; defaultSport: string
  onBet: (sport: string, content: string, odds: number, amount: number, isLive: boolean) => Promise<boolean>
}) {
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const defaultAmount = isusd ? '5' : '10000'
  const [sport, setSport]     = useState(defaultSport || 'soccer')
  const [content, setContent] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount]   = useState(defaultAmount)
  const [isLive, setIsLive]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const oddsV = parseOdds(oddsRaw); const stakeN = Number(amount.replace(/,/g, ""))
  const hotkeys = isusd ? [5, 10] : [5000, 10000]

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  async function submit() {
    if (!content || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true)
    const ok = await onBet(sport, content, oddsV, stakeN, isLive)
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
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>→ {oddsV.toFixed(2)}</div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input className="form-input inline-bet-input" type="text" inputMode="numeric" placeholder={`금액 (${unit})`}
          value={stakeN > 0 ? stakeN.toLocaleString() : amount}
          style={{ flex: 1, MozAppearance: 'textfield' } as React.CSSProperties}
          onChange={e => {
            const raw = e.target.value.replace(/,/g, '')
            if (raw === '' || /^\d+$/.test(raw)) setAmount(raw)
          }}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={() => setAmount('')} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>초기화</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(String(Number(amount.replace(/,/g,'') || 0) + hk))}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{Math.round(stakeN * (oddsV - 1)).toLocaleString()}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
          <div onClick={() => setIsLive(p => !p)} style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
            background: isLive ? '#f87171' : 'transparent',
            border: `2px solid ${isLive ? '#f87171' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isLive && <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: isLive ? '#f87171' : 'var(--text-secondary)' }}>라이브</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center', background: isLive ? 'rgba(248,113,113,0.15)' : undefined, borderColor: isLive ? '#f87171' : undefined, color: isLive ? '#f87171' : undefined }}
          onClick={submit} disabled={!content || oddsV <= 0 || stakeN <= 0 || submitting}>
          {isLive ? '🔴 라이브 등록' : '등록'}
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
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const defaultAmount = isusd ? '5' : '10000'
  const [c1, setC1] = useState(lastLeg1?.content ?? '')
  const [c2, setC2] = useState('')
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount] = useState(defaultAmount)
  const [submitting, setSubmitting] = useState(false)
  const oddsV = parseOdds(oddsRaw); const stakeN = Number(amount.replace(/,/g, ""))
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
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>배당 → {oddsV.toFixed(2)}</div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input className="form-input inline-bet-input" type="text" inputMode="numeric" placeholder={`금액 (${unit})`}
          value={stakeN > 0 ? stakeN.toLocaleString() : amount}
          style={{ flex: 1, MozAppearance: 'textfield' } as React.CSSProperties}
          onChange={e => {
            const raw = e.target.value.replace(/,/g, '')
            if (raw === '' || /^\d+$/.test(raw)) setAmount(raw)
          }}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={() => setAmount('')} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>초기화</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => setAmount(String(Number(amount.replace(/,/g,'') || 0) + hk))}>
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

  const [sites, setSites]     = useState<Site[]>([])
  const [bets, setBets]       = useState<Bet[]>([])

  const [showSiteMgr, setShowSiteMgr]   = useState(false)
  const [depositSite, setDepositSite]   = useState<Site | null>(null)
  const [withdrawSite, setWithdrawSite] = useState<Site | null>(null)
  const [openFormSiteId, setOpenFormSiteId] = useState<string | null>(null)
  const [hoverBetId, setHoverBetId]     = useState<string | null>(null)
  const [inlineEditBetId, setInlineEditBetId] = useState<string | null>(null)

  useEffect(() => { loadSites(); loadBets() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').eq('settlement_only', false).order('sort_order')
    if (data) setSites(data)
  }
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').eq('is_hidden', false).order('bet_date', { ascending: true }).order('created_at', { ascending: true })
    if (data) setBets(data)
  }
  const totalRolling     = (s: Site) => (s.last_deposit ?? 0) + (s.point_deposit ?? 0)
  const depositRemaining = (s: Site) => Math.max(0, totalRolling(s) - (s.deposit_bet_done ?? 0))
  const depositPct       = (s: Site) => totalRolling(s) > 0 ? Math.round((s.deposit_bet_done ?? 0) / totalRolling(s) * 100) : 0
  const betsBySite       = (id: string) => bets.filter(b => b.site_id === id)
  const pendingBySite    = (id: string) => betsBySite(id).filter(b => b.result === 'pending')
  const settledBySite    = (id: string) => betsBySite(id).filter(b => b.result !== 'pending')
  const colCount = Math.max(1, sites.length)

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
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(amount * usdKrwRate) }
      const { data: cf } = await supabase.from('cashflows').insert({ flow_date: today, type: 'expense', category: '베팅입금', description: `${depositSite.name} 입금`, amount, site_id: depositSite.id, currency: depositSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : amount }).select().single()
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 입금 +${amount.toLocaleString()}`, cashflow_id: cf?.id ?? null })
      setSites(p => p.map(s => s.id === data.id ? data : s))
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
      setSites(p => p.map(s => s.id === data.id ? data : s))
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(Math.abs(netProfit) * usdKrwRate) }
      const { data: cf } = await supabase.from('cashflows').insert({ flow_date: today, type: 'income', category: '베팅수익', description: `${withdrawSite.name} 마감`, amount: amount, site_id: withdrawSite.id, currency: withdrawSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : amount }).select().single()
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${withdrawSite.name} 출금 ${amount.toLocaleString()}`, cashflow_id: cf?.id ?? null })
    }
    if (withdrawSite) {
      await supabase.from('bets').update({ is_hidden: true }).eq('site_id', withdrawSite.id).neq('result', 'pending')
      setBets(p => p.filter(b => !(b.site_id === withdrawSite.id && b.result !== 'pending')))
    }
    await loadSites()
    setWithdrawSite(null)
  }

  /* ── 베팅 제출 ── */
  async function submitBet(site: Site, sport: string, content: string, odds: number, stake: number, isLive = false): Promise<boolean> {
    const { market, pick } = autoMarket(content)
    const { data: betData } = await supabase.from('bets').insert({ bet_date: today, sport: sport as Sport, league: '', match: content, market, pick, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: null, parlay_leg: 1, is_live: isLive }).select().single()
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

  /* ── 베팅 수정 (인라인) ── */
  async function saveInlineEdit(bet: Bet, sport: string, content: string, odds: number, stake: number) {
    if (!content || odds <= 0 || stake <= 0) return
    const before = { ...bet }
    const { market, pick } = autoMarket(content)
    const { data } = await supabase.from('bets').update({
      sport: sport as Sport, match: content, market, pick, odds, stake,
    }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `베팅 수정: ${data.match}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
    }
    setInlineEditBetId(null)
  }

  async function saveInlineParlay(groupBets: Bet[], c1: string, c2: string, odds: number, stake: number) {
    if (!c1 || !c2 || odds <= 0 || stake <= 0) return
    const leg1 = groupBets.find(b => b.parlay_leg === 1)
    const leg2 = groupBets.find(b => b.parlay_leg === 2)
    if (!leg1 || !leg2) return
    const { market: m1, pick: p1 } = autoMarket(c1)
    const { market: m2, pick: p2 } = autoMarket(c2)
    const [r1, r2] = await Promise.all([
      supabase.from('bets').update({ match: c1, market: m1, pick: p1, odds, stake }).eq('id', leg1.id).select().single(),
      supabase.from('bets').update({ match: c2, market: m2, pick: p2, odds, stake }).eq('id', leg2.id).select().single(),
    ])
    if (r1.data) setBets(p => p.map(b => b.id === r1.data!.id ? r1.data! : b))
    if (r2.data) setBets(p => p.map(b => b.id === r2.data!.id ? r2.data! : b))
    await logAction({ action_type: 'update', table_name: 'bets', record_id: leg1.id, before_data: leg1 as never, after_data: r1.data as never, description: `두폴 수정: ${c1}×${c2}` })
    setInlineEditBetId(null)
  }

  /* ════════════ RENDER ════════════ */
  return (
    <div className="page">
      <div className="dashboard-main">

        {/* ── 베팅 현황 (전체) */}
        <div className="dashboard-bets">
          {sites.length === 0 ? (
            <div className="card" style={{ padding: '10px 14px' }}>
              <div className="flex-between mb-10">
                <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
                <button onClick={() => setShowSiteMgr(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                  <Settings size={11} /> 사이트관리
                </button>
              </div>
              <div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하세요</div>
            </div>
          ) : (
            <div className="card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
                <button onClick={() => setShowSiteMgr(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                  <Settings size={12} /> 사이트관리
                </button>
              </div>
              <div className="site-cards-wrap" style={{ '--site-cols': colCount } as React.CSSProperties}>
              {sites.map(site => {
                const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
                const isusd = site.currency === 'usd'; const pfx = isusd ? '$' : ''; const sfx = isusd ? '' : '원'
                const pct = depositPct(site); const rem = depositRemaining(site)
                const pnl = sitePnL(site)
                const pending = pendingBySite(site.id)
                const settled = settledBySite(site.id)
                return (
                  <div key={site.id} className="card" style={{ padding: 0, overflow: 'hidden', border: site.active ? '1px solid var(--green-border)' : '1px solid var(--border)' }}>
                    {/* 사이트 헤더 */}
                    <div style={{ background: site.active ? 'var(--green-bg)' : 'var(--bg-elevated)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{site.name}</span>
                        {isusd && <span style={{ fontSize: 9, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>$</span>}
                        {site.bet_type === 'double' && <span style={{ fontSize: 9, background: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid var(--purple-border)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>2폴</span>}
                        {site.active && <span className="site-active-dot" />}
                        {pnl !== null && (
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)' }} className={pnl >= 0 ? 'profit-pos' : 'profit-neg'}>
                            {pnl >= 0 ? '+' : ''}{pfx}{pnl.toLocaleString()}{sfx}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className={`site-icon-btn site-icon-deposit ${dep > 0 ? 'active' : ''}`} onClick={e => { e.stopPropagation(); setDepositSite(site) }}><ArrowDownToLine size={15} /></button>
                        <button className="site-icon-btn site-icon-withdraw" onClick={e => { e.stopPropagation(); setWithdrawSite(site) }}><LogOut size={15} /></button>
                      </div>
                    </div>
                    {/* 롤링 정보 */}
                    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>입금</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: '#E2E8F0' }}>{pfx}{dep.toLocaleString()}{sfx}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>포인트</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: pt > 0 ? 'var(--purple)' : 'var(--text-muted)' }}>{pt > 0 ? `+${pt.toLocaleString()}P` : '–'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>남은 롤링</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: rem > 0 ? 'var(--gold)' : 'var(--green)' }}>{pfx}{rem.toLocaleString()}{sfx}</span>
                        </div>
                        <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${Math.min(100,pct)}%` }} /></div>
                        <div style={{ fontSize: 11, color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700, textAlign: 'right' }}>{pct}%</div>
                      </div>
                    {/* 베팅 목록 */}
                    <div style={{ padding: '6px 8px' }}>
                      {/* 베팅 추가 — 사이트 활성(입금) 상태일 때만, 항상 맨 위 */}
                      {site.active && (
                        <div style={{ marginBottom: pending.length > 0 ? 8 : 4 }}>
                          {openFormSiteId !== site.id ? (
                            <button className="site-add-btn" style={{ width: '100%', borderRadius: 8, padding: '12px 0', fontSize: 14 }} onClick={() => setOpenFormSiteId(site.id)}><Plus size={16} /> 베팅 추가</button>
                          ) : site.bet_type === 'double' ? (
                            <DoubleBetForm site={site} lastLeg1={getLastLeg1(site.id)} onClose={() => setOpenFormSiteId(null)} onBet={(c1,c2,odds,amt) => submitDoubleBet(site,c1,c2,odds,amt)} />
                          ) : (
                            <SingleBetForm site={site} defaultSport={pending.slice(-1)[0]?.sport ?? 'soccer'} onClose={() => setOpenFormSiteId(null)} onBet={(sp,ct,od,amt,lv) => submitBet(site,sp,ct,od,amt,lv)} />
                          )}
                        </div>
                      )}
                      {(() => {
                        const renderedGroups = new Set<string>()
                        return [...pending].reverse().map(bet => {
                          if (bet.parlay_group) {
                            if (renderedGroups.has(bet.parlay_group)) return null
                            renderedGroups.add(bet.parlay_group)
                            const groupBets = pending.filter(b => b.parlay_group === bet.parlay_group).sort((a,b) => a.parlay_leg - b.parlay_leg)
                            return (
                              <div key={bet.parlay_group} className="site-bet-entry parlay-entry" style={{ marginBottom: 6 }}
                                onMouseEnter={() => setHoverBetId(bet.parlay_group)} onMouseLeave={() => setHoverBetId(null)}>
                                {inlineEditBetId === bet.parlay_group ? (
                                  <InlineParlayEditForm
                                    groupBets={groupBets}
                                    site={site}
                                    onClose={() => setInlineEditBetId(null)}
                                    onSave={(c1, c2, odds, stake) => saveInlineParlay(groupBets, c1, c2, odds, stake)}
                                  />
                                ) : (
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                                    {/* 좌: 경기 내용 */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {groupBets.map((gb, idx) => (
                                        <div key={gb.id} style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 16, textAlign: 'center', flexShrink: 0 }}>{idx===0?'①':'②'}</span>
                                          <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 13 }}>{gb.match}</span>
                                        </div>
                                      ))}
                                      <div style={{ paddingLeft: 20, marginTop: 3 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}</span>
                                      </div>
                                    </div>
                                    {/* 우: 결과 버튼 */}
                                    {hoverBetId === bet.parlay_group && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignSelf: 'center' }}>
                                        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                                          <button className="bet-action-btn" title="수정" style={{ color: 'var(--gold)', padding: '2px 4px', minWidth: 0 }}
                                            onClick={() => { setInlineEditBetId(bet.parlay_group); setHoverBetId(null) }}>
                                            <Pencil size={10} />
                                          </button>
                                          <button className="bet-action-btn bet-action-cancel" title="베팅취소" style={{ padding: '2px 4px', minWidth: 0 }}
                                            onClick={() => applyParlayResult(groupBets, 'cancel')}>
                                            <Ban size={10} />
                                          </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: 3 }}>
                                          <button className="bet-action-btn bet-action-win" title="적중" style={{ padding: '5px 8px', minWidth: 0 }}
                                            onClick={() => applyParlayResult(groupBets, 'win')}>
                                            <CheckCircle size={16} />
                                          </button>
                                          <button className="bet-action-btn bet-action-loss" title="실패" style={{ padding: '5px 8px', minWidth: 0 }}
                                            onClick={() => applyParlayResult(groupBets, 'loss')}>
                                            <XCircle size={16} />
                                          </button>
                                          <button className="bet-action-btn" title="적특" style={{ padding: '5px 8px', minWidth: 0, color: 'var(--blue)', borderColor: 'var(--blue-border)' }}
                                            onClick={() => applyParlayResult(groupBets, 'push')}>
                                            <MinusCircle size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          return (
                            <div key={bet.id} className="site-bet-entry" style={{ marginBottom: 6, position: 'relative' }}
                              onMouseEnter={() => setHoverBetId(bet.id)} onMouseLeave={() => setHoverBetId(null)}>
                              {inlineEditBetId === bet.id ? (
                                <InlineBetEditForm
                                  bet={bet}
                                  site={site}
                                  onClose={() => setInlineEditBetId(null)}
                                  onSave={(sport, content, odds, stake) => saveInlineEdit(bet, sport, content, odds, stake)}
                                />
                              ) : (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                                  {/* 좌: 경기 내용 */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                                      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, width: 18, textAlign: 'center' }}>{SPORT_SHORT[bet.sport] ?? '📋'}</span>
                                      <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 13 }}>{bet.match}</span>
                                    </div>
                                    <div style={{ paddingLeft: 22 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}</span>
                                    </div>
                                  </div>
                                  {/* 우: 결과 버튼 (hover 시만) */}
                                  {hoverBetId === bet.id && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignSelf: 'center' }}>
                                      {/* 소형: 수정 / 베팅취소 */}
                                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                                        <button className="bet-action-btn" title="수정"
                                          onClick={() => { setInlineEditBetId(bet.id); setHoverBetId(null) }}
                                          style={{ color: 'var(--gold)', padding: '2px 4px', minWidth: 0 }}>
                                          <Pencil size={10} />
                                        </button>
                                        <button className="bet-action-btn bet-action-cancel" title="베팅취소"
                                          onClick={() => applyResult(bet, 'cancel')}
                                          style={{ padding: '2px 4px', minWidth: 0 }}>
                                          <Ban size={10} />
                                        </button>
                                      </div>
                                      {/* 대형: 적중 / 실패 / 적특 */}
                                      <div style={{ display: 'flex', gap: 3 }}>
                                        <button className="bet-action-btn bet-action-win" title="적중"
                                          onClick={() => applyResult(bet, 'win')}
                                          style={{ padding: '5px 8px', minWidth: 0 }}>
                                          <CheckCircle size={16} />
                                        </button>
                                        <button className="bet-action-btn bet-action-loss" title="실패"
                                          onClick={() => applyResult(bet, 'loss')}
                                          style={{ padding: '5px 8px', minWidth: 0 }}>
                                          <XCircle size={16} />
                                        </button>
                                        <button className="bet-action-btn" title="적특"
                                          onClick={() => applyResult(bet, 'push')}
                                          style={{ padding: '5px 8px', minWidth: 0, color: 'var(--blue)', borderColor: 'var(--blue-border)' }}>
                                          <MinusCircle size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })
                      })()}
                      {/* 완료된 목록 — 마감(비활성) 사이트에선 숨김 */}
                      {site.active && settled.length > 0 && (() => {
                        const renderedSettledGroups = new Set<string>()
                        return (
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border-light)', paddingTop: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '3px 2px', marginBottom: 4 }}>
                              완료된 목록 ({settled.length})
                            </div>
                            {settled.map(bet => {
                              if (bet.parlay_group) {
                                if (renderedSettledGroups.has(bet.parlay_group)) return null
                                renderedSettledGroups.add(bet.parlay_group)
                                const groupBets = settled.filter(b => b.parlay_group === bet.parlay_group).sort((a,b) => a.parlay_leg - b.parlay_leg)
                                const isWin = groupBets[0].result === 'win'
                                const isLoss = groupBets[0].result === 'loss'
                                return (
                                  <div key={bet.parlay_group} className="site-bet-entry parlay-entry" style={{ marginBottom: 5, opacity: 0.7 }}
                                    onMouseEnter={() => setHoverBetId('s_' + bet.parlay_group)} onMouseLeave={() => setHoverBetId(null)}>
                                    {groupBets.map((gb, idx) => (
                                      <div key={gb.id} style={{ display: 'flex', gap: 5, marginBottom: 2 }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 18, textAlign: 'center', flexShrink: 0 }}>{idx===0?'①':'②'}</span>
                                        <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 12, color: isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-secondary)' }}>{gb.match}</span>
                                      </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 23, marginTop: 4 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}</span>
                                      {hoverBetId === 's_' + bet.parlay_group ? (
                                        <button className="btn btn-ghost btn-xs" style={{ fontSize: 10 }} onClick={() => applyParlayRevert(groupBets)}><RotateCcw size={9} /> 되돌리기</button>
                                      ) : (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--blue)' }}>
                                          {isWin ? `+${pfx}${groupBets[0].profit.toLocaleString()}${sfx}` : isLoss ? `-${pfx}${bet.stake.toLocaleString()}${sfx}` : 'PUSH'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div key={bet.id} className="site-bet-entry" style={{ marginBottom: 5, opacity: 0.7 }}
                                  onMouseEnter={() => setHoverBetId('s_' + bet.id)} onMouseLeave={() => setHoverBetId(null)}>
                                  <div style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
                                    <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, width: 20, textAlign: 'center' }}>{SPORT_SHORT[bet.sport] ?? '📋'}</span>
                                    <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 12, color: bet.result === 'win' ? 'var(--green)' : bet.result === 'loss' ? 'var(--red)' : 'var(--text-secondary)' }}>{bet.match}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 25 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}</span>
                                    {hoverBetId === 's_' + bet.id ? (
                                      <button className="btn btn-ghost btn-xs" style={{ fontSize: 10 }} onClick={() => applyResult(bet, 'revert')}><RotateCcw size={9} /> 되돌리기</button>
                                    ) : (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: bet.result === 'win' ? 'var(--green)' : bet.result === 'loss' ? 'var(--red)' : 'var(--blue)' }}>
                                        {bet.result === 'win' ? `+${pfx}${bet.profit.toLocaleString()}${sfx}` : bet.result === 'loss' ? `-${pfx}${bet.stake.toLocaleString()}${sfx}` : 'PUSH'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
              </div>
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

import { useState, useRef, useEffect } from 'react'
import type React from 'react'
import { supabase } from '../lib/supabase'

// ─── 티어 계산 ────────────────────────────────────────────────────
function getBaseballTier(odds: number, isHome: boolean) {
  if (isHome) {
    if (odds >= 2.3 && odds <= 2.6)  return { tier:'S', roi:'+3.5~+5.5%', color:'#4ade80', bg:'rgba(74,222,128,0.12)', label:'핵심' }
    if (odds >= 2.2 && odds < 2.3)   return { tier:'A', roi:'+2.0~+3.5%', color:'#60a5fa', bg:'rgba(96,165,250,0.12)', label:'밸류' }
    if (odds > 2.6 && odds <= 3.1)   return { tier:'A', roi:'+1.0~+3.7%', color:'#60a5fa', bg:'rgba(96,165,250,0.12)', label:'밸류' }
    if (odds >= 2.0 && odds < 2.2)   return { tier:'B', roi:'-0.8~+0.5%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립' }
    if (odds > 3.1 && odds <= 3.2)   return { tier:'B', roi:'+0.3~+0.5%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립' }
    if (odds >= 1.7 && odds < 2.0)   return { tier:'C', roi:'-2.0~-4.0%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실' }
    if (odds > 3.2 && odds <= 3.85)  return { tier:'C', roi:'-0.3~-2.5%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실' }
    return { tier:'D', roi:'-5% 이하', color:'#f87171', bg:'rgba(248,113,113,0.12)', label:'손실' }
  } else {
    if (odds >= 2.4 && odds <= 2.6)  return { tier:'A', roi:'+1.5~+2.5%', color:'#60a5fa', bg:'rgba(96,165,250,0.12)', label:'밸류' }
    if (odds > 2.6 && odds <= 2.8)   return { tier:'A', roi:'+1.0~+2.0%', color:'#60a5fa', bg:'rgba(96,165,250,0.12)', label:'밸류' }
    if (odds >= 2.2 && odds < 2.4)   return { tier:'B', roi:'-0.5~+1.5%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립' }
    if (odds > 2.8 && odds <= 3.2)   return { tier:'B', roi:'-0.8~+1.0%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립' }
    if (odds > 3.2 && odds <= 3.5)   return { tier:'C', roi:'-0.3~-2.0%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실' }
    if (odds >= 2.0 && odds < 2.2)   return { tier:'C', roi:'-2.0~-3.2%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실' }
    return { tier:'D', roi:'-4% 이하', color:'#f87171', bg:'rgba(248,113,113,0.12)', label:'손실' }
  }
}

function getBaseballOUTier(line: number, overOdds: number, underOdds: number) {
  const overFavored = overOdds < underOdds, underFavored = underOdds < overOdds
  if (line >= 10.0) {
    if (!underFavored) return { pick:'under' as const, tier:'S', roi:'+3~+5%', color:'#4ade80', bg:'rgba(74,222,128,0.12)', label:'핵심', reason:'라인 높음+언더 배당 유리' }
    return { pick:'under' as const, tier:'A', roi:'+1~+3%', color:'#60a5fa', bg:'rgba(96,165,250,0.12)', label:'밸류', reason:'라인 높음, 구조적 언더 유리' }
  }
  if (line >= 9.0) {
    if (!underFavored) return { pick:'under' as const, tier:'A', roi:'+1~+3%', color:'#60a5fa', bg:'rgba(96,165,250,0.12)', label:'밸류', reason:'평균 이상+언더 배당 유리' }
    if (overFavored) return { pick:'over' as const, tier:'B', roi:'±1%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립', reason:'언더 쏠림, 오버 역발상' }
    return { pick:'under' as const, tier:'B', roi:'±1%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립', reason:'라인 평균 이상, 배당 대칭' }
  }
  if (line >= 8.0) {
    if (underFavored) return { pick:'over' as const, tier:'B', roi:'±1%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립', reason:'언더 쏠림→오버 밸류' }
    if (overFavored) return { pick:'under' as const, tier:'B', roi:'±1%', color:'#fbbf24', bg:'rgba(251,191,36,0.12)', label:'중립', reason:'오버 쏠림→언더 밸류' }
    return { pick:'under' as const, tier:'C', roi:'-2~-3%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실', reason:'평균 구간, 배당 대칭' }
  }
  if (underFavored) return { pick:'over' as const, tier:'C', roi:'-1~-3%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실', reason:'낮은 라인, 데이터 불확실' }
  return { pick:'over' as const, tier:'C', roi:'-2~-4%', color:'#fb923c', bg:'rgba(251,146,60,0.12)', label:'약손실', reason:'낮은 라인, 근거 부족' }
}

function getBasketballTier(homeLine: number, homeIsNegative: boolean, homeOdds: number, awayOdds: number, margin: number) {
  const spread = homeIsNegative ? -homeLine : homeLine
  const homeOddsLower = homeOdds < awayOdds
  let tier='C', roi='-2~-4%', pick:'home'|'away'='away', label='약손실', color='#fb923c', bg='rgba(251,146,60,0.12)', reason=''
  if (spread > 0) {
    const s = Math.abs(spread)
    if (s >= 6.5 && s <= 11.5) {
      if (!homeOddsLower){tier='S';roi='+3~+5%';color='#4ade80';bg='rgba(74,222,128,0.12)';label='핵심';reason='홈 플핸 핵심+홈 배당 유리'}
      else{tier='A';roi='+1~+3%';color='#60a5fa';bg='rgba(96,165,250,0.12)';label='밸류';reason='홈 플핸 핵심, 원정 쏠림'}
      pick='home'
    } else if (s >= 3.5 && s < 6.5){tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='홈 플핸 중간';pick=homeOddsLower?'away':'home'}
    else if (s > 11.5){tier='C';roi='-1~-3%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실';reason='플핸 과대';pick='away'}
    else{tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='소폭 플핸';pick=homeOddsLower?'away':'home'}
  } else {
    const s = Math.abs(spread)
    if (s >= 1.5 && s <= 5.5){tier='A';roi='+1~+3%';color='#60a5fa';bg='rgba(96,165,250,0.12)';label='밸류';reason='홈 어드밴티지 자연 구간';pick=homeOddsLower?'away':'home'}
    else if (s >= 6.5 && s <= 9.5){tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='홈 마핸 중간';pick='away'}
    else if (s >= 10.5 && s <= 13.5){tier='C';roi='-2~-4%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실';reason='홈 쏠림 구간';pick='away'}
    else if (s >= 14.5){tier='D';roi='-4% 이하';color='#f87171';bg='rgba(248,113,113,0.12)';label='손실';reason='압도적 홈 정배';pick='away'}
    else{tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='소폭 마핸';pick=homeOddsLower?'away':'home'}
  }
  if (margin > 7 && tier !== 'D') {
    const order=['S','A','B','C','D'],idx=order.indexOf(tier),nt=order[Math.min(idx+1,4)]
    if (nt!==tier){tier=nt;if(tier==='A'){roi='+1~+3%';color='#60a5fa';bg='rgba(96,165,250,0.12)';label='밸류'}else if(tier==='B'){roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립'}else if(tier==='C'){roi='-2~-4%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실'}else{roi='-4% 이하';color='#f87171';bg='rgba(248,113,113,0.12)';label='손실'};reason+=' (마진 높아 하락)'}
  }
  return { pick, tier, roi, color, bg, label, reason }
}

// ─── 배당 입력 훅 ─────────────────────────────────────────────────
function useOddsInput() {
  const [digits, setDigits] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const parsed = digits.length === 3 ? parseFloat(digits[0] + '.' + digits.slice(1)) : NaN
  const display = digits.length === 3 ? digits[0] + '.' + digits.slice(1) : digits
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 3)
    setDigits(raw)
  }
  function reset() { setDigits('') }
  return { display, parsed, onChange, reset, ref, digits }
}

// ─── 타입 ──────────────────────────────────────────────────────────
type SportTab = 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'hockey' | 'esports'
type BetResult = 'pending' | 'win' | 'loss'

interface SportMeta { id: SportTab; label: string; emoji: string }
interface NavCountry { id: string; sport_id: SportTab; name: string }
interface NavLeague  { id: string; country_id: string; sport_id: SportTab; name: string }
interface GameEntry  { id: string; league_id: string; home: string; away: string }
interface SimulBet   { id: string; mode: string; league: string; pick: string; odds: number; tier: string; tierColor: string; result: BetResult; createdAt: string; gameId?: string }

// ─── 상수 ──────────────────────────────────────────────────────────
const SPORT_TABS: SportMeta[] = [
  { id:'soccer',     label:'축구', emoji:'⚽' },
  { id:'baseball',   label:'야구', emoji:'⚾' },
  { id:'basketball', label:'농구', emoji:'🏀' },
  { id:'volleyball', label:'배구', emoji:'🏐' },
  { id:'hockey',     label:'하키', emoji:'🏒' },
  { id:'esports',    label:'LOL',  emoji:'🎮' },
]
const ACTIVE_SPORTS: SportTab[] = ['baseball', 'basketball']

const TIER_COLOR: Record<string,string> = { S:'#4ade80', A:'#60a5fa', B:'#fbbf24', C:'#fb923c', D:'#f87171' }
const TIER_BG:    Record<string,string> = { S:'rgba(74,222,128,0.12)', A:'rgba(96,165,250,0.12)', B:'rgba(251,191,36,0.12)', C:'rgba(251,146,60,0.12)', D:'rgba(248,113,113,0.12)' }

// ─── 스타일 ────────────────────────────────────────────────────────
const card: React.CSSProperties = { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'12px', marginBottom:8 }
const lbSt: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.5px', marginBottom:4, display:'block' }
const inSt: React.CSSProperties = { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:17, fontWeight:700, textAlign:'center', padding:'7px', width:'100%', boxSizing:'border-box', outline:'none' }
const secT: React.CSSProperties = { fontSize:9, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:8 }
const r2:   React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }

function mbStyle(m: number): React.CSSProperties {
  return { display:'inline-block', fontSize:11, fontWeight:700,
    color:m>7?'#f87171':m>5?'#fbbf24':'#4ade80',
    background:m>7?'rgba(248,113,113,0.1)':m>5?'rgba(251,191,36,0.1)':'rgba(74,222,128,0.1)',
    border:`1px solid ${m>7?'#f87171':m>5?'#fbbf24':'#4ade80'}`,
    borderRadius:4, padding:'1px 7px' }
}

function TierBadge({ tier, size=24 }: { tier:string; size?:number }) {
  return <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, borderRadius:6, fontWeight:700, fontSize:size*0.5, flexShrink:0, background:TIER_BG[tier]??'#333', color:TIER_COLOR[tier]??'#fff', border:`1px solid ${TIER_COLOR[tier]??'#fff'}` }}>{tier}</span>
}

// ─── 배당 입력 컴포넌트 (최상위) ─────────────────────────────────
function OddsInput({ label, hook }: { label:string; hook:ReturnType<typeof useOddsInput> }) {
  return (
    <div>
      <span style={lbSt}>{label}</span>
      <input ref={hook.ref}
        style={{ ...inSt, color:hook.digits.length===3?'var(--text-primary)':'var(--text-secondary)' }}
        inputMode="numeric" placeholder="245" value={hook.display}
        onChange={hook.onChange} onClick={hook.reset} />
      {hook.digits.length > 0 && hook.digits.length < 3 && (
        <div style={{ fontSize:10, color:'#fbbf24', textAlign:'center', marginTop:2 }}>{3-hook.digits.length}개 더</div>
      )}
    </div>
  )
}

// ─── 경기 추가 팝업 ───────────────────────────────────────────────
function AddGameModal({ leagueName, onClose, onSave }: {
  leagueName: string
  onClose: () => void
  onSave: (games: { home:string; away:string }[]) => void
}) {
  type Row = { home:string; away:string }
  const [rows, setRows] = useState<Row[]>([{ home:'', away:'' }])
  const rowRefs = useRef<Array<{ home:HTMLInputElement|null; away:HTMLInputElement|null }>>([])

  function ensureRef(i: number) {
    if (!rowRefs.current[i]) rowRefs.current[i] = { home:null, away:null }
    return rowRefs.current[i]
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, field: 'home'|'away') {
    if (e.key !== 'Tab') return
    e.preventDefault()
    if (field === 'home') {
      ensureRef(rowIdx).away?.focus()
    } else {
      if (rowIdx === rows.length - 1) {
        setRows(prev => [...prev, { home:'', away:'' }])
        setTimeout(() => ensureRef(rowIdx+1).home?.focus(), 50)
      } else {
        ensureRef(rowIdx+1).home?.focus()
      }
    }
  }

  function updateRow(i: number, field: keyof Row, val: string) {
    setRows(prev => prev.map((r,idx) => idx===i ? {...r,[field]:val} : r))
  }
  function removeRow(i: number) {
    setRows(prev => prev.length > 1 ? prev.filter((_,idx) => idx!==i) : prev)
  }
  function handleSave() {
    const valid = rows.filter(r => r.home.trim() && r.away.trim())
    if (!valid.length) return
    onSave(valid.map(r => ({ home:r.home.trim(), away:r.away.trim() })))
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:20, width:420, maxHeight:'80vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>경기 추가 — {leagueName}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:16 }}>✕</button>
        </div>
        {/* 헤더 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 28px', gap:6, marginBottom:4 }}>
          <span style={{ fontSize:10, color:'var(--text-secondary)', fontWeight:700 }}>홈팀</span>
          <span style={{ fontSize:10, color:'var(--text-secondary)', fontWeight:700 }}>원정팀</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 28px', gap:6, marginBottom:6 }}>
            <input ref={el => { ensureRef(i).home = el }}
              style={{ ...inSt, fontSize:13, padding:'7px 8px' }} placeholder="홈팀"
              value={row.home} onChange={e => updateRow(i,'home',e.target.value)}
              onKeyDown={e => handleKeyDown(e,i,'home')} />
            <input ref={el => { ensureRef(i).away = el }}
              style={{ ...inSt, fontSize:13, padding:'7px 8px' }} placeholder="원정팀"
              value={row.away} onChange={e => updateRow(i,'away',e.target.value)}
              onKeyDown={e => handleKeyDown(e,i,'away')} />
            <button onClick={() => removeRow(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:14 }}>✕</button>
          </div>
        ))}
        <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:12 }}>원정팀 입력 후 Tab → 다음 경기 자동 추가</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleSave} style={{ flex:1, padding:'9px 0', borderRadius:8, background:'var(--cyan-bg)', border:'1px solid var(--cyan-border)', color:'var(--cyan)', fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, cursor:'pointer' }}>저장</button>
          <button onClick={onClose} style={{ padding:'9px 16px', borderRadius:8, background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:13, cursor:'pointer' }}>취소</button>
        </div>
      </div>
    </div>
  )
}

// ─── 국가/리그 추가 팝업 ─────────────────────────────────────────
function AddNameModal({ title, placeholder, onClose, onSave }: {
  title: string; placeholder: string
  onClose: () => void; onSave: (name: string) => void
}) {
  const [val, setVal] = useState('')
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:20, width:320 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:12 }}>{title}</div>
        <input style={{ ...inSt, fontSize:14, marginBottom:12 }} placeholder={placeholder} value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key==='Enter' && val.trim() && (onSave(val.trim()), onClose())}
          autoFocus />
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => { if(val.trim()){onSave(val.trim());onClose()} }} style={{ flex:1, padding:'9px 0', borderRadius:8, background:'var(--cyan-bg)', border:'1px solid var(--cyan-border)', color:'var(--cyan)', fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, cursor:'pointer' }}>추가</button>
          <button onClick={onClose} style={{ padding:'9px 16px', borderRadius:8, background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:13, cursor:'pointer' }}>취소</button>
        </div>
      </div>
    </div>
  )
}

// ─── 야구 베팅 패널 ───────────────────────────────────────────────
function BaseballBetPanel({ game, leagueName, onBet }: {
  game: GameEntry; leagueName: string
  onBet: (pick:string, odds:number, tier:string, tierColor:string, league:string, mode:string, gameId:string) => void
}) {
  const homeOdds = useOddsInput(), awayOdds = useOddsInput()
  const overOdds = useOddsInput(), underOdds = useOddsInput()
  const [ouLine, setOuLine] = useState('')

  const ho = homeOdds.parsed, ao = awayOdds.parsed
  const mlValid = !isNaN(ho) && !isNaN(ao) && ho > 1 && ao > 1
  const mlMargin = mlValid ? (1/ho+1/ao-1)*100 : 0
  const homeTier = mlValid ? getBaseballTier(ho, true) : null
  const awayTier  = mlValid ? getBaseballTier(ao, false) : null
  const TO = ['S','A','B','C','D']
  const mlPick = mlValid && homeTier && awayTier
    ? TO.indexOf(homeTier.tier) < TO.indexOf(awayTier.tier) ? 'home'
      : TO.indexOf(homeTier.tier) > TO.indexOf(awayTier.tier) ? 'away'
      : ho >= ao ? 'home' : 'away'
    : null

  const ln = parseFloat(ouLine), ov = overOdds.parsed, un = underOdds.parsed
  const ouValid = !isNaN(ln) && !isNaN(ov) && !isNaN(un) && ln > 0 && ov > 1 && un > 1
  const ouMargin = ouValid ? (1/ov+1/un-1)*100 : 0
  const ouResult = ouValid ? getBaseballOUTier(ln, ov, un) : null

  return (
    <div>
      <div style={{ ...card, background:'var(--bg-elevated)', marginBottom:10 }}>
        <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:3 }}>{leagueName}</div>
        <div style={{ fontSize:15, fontWeight:700 }}>{game.home} <span style={{ color:'var(--text-secondary)', fontWeight:400 }}>vs</span> {game.away}</div>
      </div>
      {/* 승패 */}
      <div style={card}>
        <div style={secT}>야구 승패</div>
        <div style={r2}>
          <OddsInput label={`홈 (${game.home})`} hook={homeOdds} />
          <OddsInput label={`원정 (${game.away})`} hook={awayOdds} />
        </div>
        {mlValid && homeTier && awayTier && (
          <>
            <div style={{ marginTop:8, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, color:'var(--text-secondary)' }}>마진</span>
              <span style={mbStyle(mlMargin)}>{mlMargin.toFixed(1)}%</span>
            </div>
            <div style={{ ...r2, marginTop:8 }}>
              {([{label:`홈 ${game.home}`,odds:ho,tier:homeTier,side:'home'},{label:`원정 ${game.away}`,odds:ao,tier:awayTier,side:'away'}] as const).map(({label,odds,tier,side}) => (
                <div key={side} style={{ background:mlPick===side?tier.bg:'var(--bg-elevated)', border:`${mlPick===side?2:1}px solid ${mlPick===side?tier.color:'var(--border)'}`, borderRadius:8, padding:'9px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{odds.toFixed(2)}</div>
                  <TierBadge tier={tier.tier} size={22} />
                  <div style={{ fontSize:10, color:tier.color, margin:'3px 0 7px' }}>{tier.label} · {tier.roi}</div>
                  <button onClick={() => onBet(`${label} ${odds.toFixed(2)}`, odds, tier.tier, tier.color, leagueName, 'baseball_ml', game.id)}
                    style={{ width:'100%', padding:'5px 0', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer', background:tier.bg, border:`1px solid ${tier.color}`, color:tier.color, fontFamily:'var(--font-body)' }}>베팅</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {/* 언오버 */}
      <div style={card}>
        <div style={secT}>야구 언오버</div>
        <div style={{ marginBottom:8 }}>
          <span style={lbSt}>기준점</span>
          <input style={{ ...inSt, fontSize:14 }} type="number" step="0.5" placeholder="9.5" value={ouLine} onChange={e => setOuLine(e.target.value)} />
        </div>
        <div style={r2}>
          <OddsInput label="오버" hook={overOdds} />
          <OddsInput label="언더" hook={underOdds} />
        </div>
        {ouValid && ouResult && (
          <>
            <div style={{ marginTop:8, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, color:'var(--text-secondary)' }}>마진</span>
              <span style={mbStyle(ouMargin)}>{ouMargin.toFixed(1)}%</span>
            </div>
            <div style={{ marginTop:8, background:ouResult.bg, border:`2px solid ${ouResult.color}`, borderRadius:8, padding:'10px', textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
                <TierBadge tier={ouResult.tier} size={22} />
                <span style={{ fontSize:13, fontWeight:700, color:ouResult.color }}>{ouResult.pick==='over'?'오버':'언더'} {(ouResult.pick==='over'?ov:un).toFixed(2)}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:7 }}>{ouResult.reason}</div>
              <button onClick={() => onBet(`${ouResult.pick==='over'?'오버':'언더'} ${(ouResult.pick==='over'?ov:un).toFixed(2)}`, ouResult.pick==='over'?ov:un, ouResult.tier, ouResult.color, leagueName, 'baseball_ou', game.id)}
                style={{ width:'100%', padding:'6px 0', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer', background:ouResult.bg, border:`1px solid ${ouResult.color}`, color:ouResult.color, fontFamily:'var(--font-body)' }}>베팅</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── 농구 베팅 패널 ───────────────────────────────────────────────
function BasketballBetPanel({ game, leagueName, onBet }: {
  game: GameEntry; leagueName: string
  onBet: (pick:string, odds:number, tier:string, tierColor:string, league:string, mode:string, gameId:string) => void
}) {
  const [homeHandicap, setHomeHandicap] = useState<'마핸'|'플핸'>('마핸')
  const [handicapLine, setHandicapLine] = useState('')
  const bktHome = useOddsInput(), bktAway = useOddsInput()
  const hl = parseFloat(handicapLine), bho = bktHome.parsed, bao = bktAway.parsed
  const bktValid = !isNaN(hl) && !isNaN(bho) && !isNaN(bao) && hl > 0 && bho > 1 && bao > 1
  const bktMargin = bktValid ? (1/bho+1/bao-1)*100 : 0
  const bktResult = bktValid ? getBasketballTier(hl, homeHandicap==='마핸', bho, bao, bktMargin) : null

  return (
    <div>
      <div style={{ ...card, background:'var(--bg-elevated)', marginBottom:10 }}>
        <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:3 }}>{leagueName}</div>
        <div style={{ fontSize:15, fontWeight:700 }}>{game.home} <span style={{ color:'var(--text-secondary)', fontWeight:400 }}>vs</span> {game.away}</div>
      </div>
      <div style={card}>
        <div style={secT}>농구 핸디캡</div>
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          {(['마핸','플핸'] as const).map(h => (
            <button key={h} onClick={() => setHomeHandicap(h)} style={{ flex:1, padding:'7px', borderRadius:7, border:`1px solid ${homeHandicap===h?'var(--cyan-border)':'var(--border)'}`, background:homeHandicap===h?'var(--cyan-bg)':'var(--bg-elevated)', color:homeHandicap===h?'var(--cyan)':'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              홈({game.home}) {h==='마핸'?'마핸(-)':'플핸(+)'}
            </button>
          ))}
        </div>
        <div style={{ marginBottom:10 }}>
          <span style={lbSt}>기준점</span>
          <input style={{ ...inSt, fontSize:14 }} type="number" step="0.5" placeholder="7.5" value={handicapLine} onChange={e => setHandicapLine(e.target.value)} />
        </div>
        <div style={r2}>
          <OddsInput label={`홈 ${game.home}(${homeHandicap})`} hook={bktHome} />
          <OddsInput label={`원정 ${game.away}(${homeHandicap==='마핸'?'플핸':'마핸'})`} hook={bktAway} />
        </div>
        {bktValid && bktResult && (
          <>
            <div style={{ marginTop:8, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, color:'var(--text-secondary)' }}>마진</span>
              <span style={mbStyle(bktMargin)}>{bktMargin.toFixed(1)}%</span>
            </div>
            <div style={{ marginTop:8, background:bktResult.bg, border:`2px solid ${bktResult.color}`, borderRadius:8, padding:'10px', textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
                <TierBadge tier={bktResult.tier} size={22} />
                <span style={{ fontSize:12, fontWeight:700, color:bktResult.color }}>
                  {bktResult.pick==='home'?`홈 ${game.home} ${homeHandicap} ${homeHandicap==='마핸'?'-':'+'}${hl.toFixed(1)}`:`원정 ${game.away} ${homeHandicap==='마핸'?'플핸':'마핸'} ${homeHandicap==='마핸'?'+':'-'}${hl.toFixed(1)}`}
                </span>
              </div>
              <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:8 }}>{bktResult.reason}</div>
              <div style={{ display:'flex', gap:7 }}>
                <button onClick={() => onBet(`홈 ${game.home} ${homeHandicap} ${homeHandicap==='마핸'?'-':'+'}${hl.toFixed(1)}`, bho, bktResult.tier, bktResult.color, leagueName, 'basketball', game.id)}
                  style={{ flex:1, padding:'6px 0', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-body)' }}>홈 베팅</button>
                <button onClick={() => onBet(`원정 ${game.away} ${homeHandicap==='마핸'?'플핸':'마핸'} ${homeHandicap==='마핸'?'+':'-'}${hl.toFixed(1)}`, bao, bktResult.tier, bktResult.color, leagueName, 'basketball', game.id)}
                  style={{ flex:1, padding:'6px 0', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-body)' }}>원정 베팅</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── 준비중 ───────────────────────────────────────────────────────
function ComingSoon({ sport }: { sport: SportTab }) {
  const s = SPORT_TABS.find(t => t.id === sport)
  return <div style={{ ...card, textAlign:'center', padding:'32px 16px' }}><div style={{ fontSize:28, marginBottom:8 }}>{s?.emoji}</div><div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>{s?.label} 준비중</div><div style={{ fontSize:11, color:'var(--text-secondary)' }}>베팅 옵션을 준비하고 있어요</div></div>
}

// ═══════════════════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════════════════
export default function Simul() {
  const [sportTab,     setSportTab]     = useState<SportTab>('baseball')
  const [countries,    setCountries]    = useState<NavCountry[]>([])
  const [leagues,      setLeagues]      = useState<NavLeague[]>([])
  const [games,        setGames]        = useState<GameEntry[]>([])
  const [bets,         setBets]         = useState<SimulBet[]>([])
  const [selCountry,   setSelCountry]   = useState<NavCountry|null>(null)
  const [selLeague,    setSelLeague]    = useState<NavLeague|null>(null)
  const [selGame,      setSelGame]      = useState<GameEntry|null>(null)
  const [loading,      setLoading]      = useState(true)
  const [statLeague,   setStatLeague]   = useState<string>('전체')
  const [modal,        setModal]        = useState<'country'|'league'|'game'|null>(null)

  // ─── 로드 ────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data:cData },{ data:lData },{ data:gData },{ data:bData }] = await Promise.all([
      supabase.from('simul_countries').select('*').order('name'),
      supabase.from('simul_leagues').select('*').order('name'),
      supabase.from('simul_games').select('*').order('id'),
      supabase.from('simul_bets').select('*').order('created_at',{ascending:false}),
    ])
    if (cData) setCountries(cData as NavCountry[])
    if (lData) setLeagues(lData as NavLeague[])
    if (gData) setGames(gData as GameEntry[])
    if (bData) setBets(bData.map((b:Record<string,unknown>) => ({
      id:b.id as string, mode:b.mode as string, league:b.league as string,
      pick:b.pick as string, odds:Number(b.odds), tier:b.tier as string,
      tierColor:b.tier_color as string, result:b.result as BetResult,
      gameId:b.game_id as string|undefined,
      createdAt:new Date(b.created_at as string).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
    })))
    setLoading(false)
  }

  // ─── 국가 관리 ───────────────────────────────────────────────
  async function addCountry(name: string) {
    const id = Date.now().toString()
    const row: NavCountry = { id, sport_id:sportTab, name }
    const { data } = await supabase.from('simul_countries').insert(row).select().single()
    if (data) setCountries(prev => [...prev, data as NavCountry])
  }
  async function removeCountry(id: string) {
    await supabase.from('simul_countries').delete().eq('id', id)
    setCountries(prev => prev.filter(c => c.id !== id))
    if (selCountry?.id === id) { setSelCountry(null); setSelLeague(null); setSelGame(null) }
  }

  // ─── 리그 관리 ───────────────────────────────────────────────
  async function addLeague(name: string) {
    if (!selCountry) return
    const id = Date.now().toString()
    const row: NavLeague = { id, country_id:selCountry.id, sport_id:sportTab, name }
    const { data } = await supabase.from('simul_leagues').insert(row).select().single()
    if (data) setLeagues(prev => [...prev, data as NavLeague])
  }
  async function removeLeague(id: string) {
    await supabase.from('simul_leagues').delete().eq('id', id)
    setLeagues(prev => prev.filter(l => l.id !== id))
    if (selLeague?.id === id) { setSelLeague(null); setSelGame(null) }
  }

  // ─── 경기 관리 ───────────────────────────────────────────────
  async function addGames(list: { home:string; away:string }[]) {
    if (!selLeague) return
    const rows = list.map(g => ({ id:Date.now().toString()+Math.random().toString(36).slice(2), league_id:selLeague.id, home:g.home, away:g.away }))
    const { data } = await supabase.from('simul_games').insert(rows).select()
    if (data) setGames(prev => [...prev, ...data as GameEntry[]])
  }
  async function removeGame(id: string) {
    await supabase.from('simul_games').delete().eq('id', id)
    setGames(prev => prev.filter(g => g.id !== id))
    if (selGame?.id === id) setSelGame(null)
  }

  // ─── 베팅 관리 ───────────────────────────────────────────────
  async function addBet(pick:string, odds:number, tier:string, tierColor:string, league:string, mode:string, gameId:string) {
    const id = Date.now().toString()
    const createdAt = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
    setBets(prev => [{ id, mode, league, pick, odds, tier, tierColor, result:'pending', createdAt, gameId }, ...prev])
    await supabase.from('simul_bets').insert({ id, mode, league, pick, odds, tier, tier_color:tierColor, result:'pending', game_id:gameId })
  }
  async function setResult(id:string, result:BetResult) {
    setBets(prev => prev.map(b => b.id===id?{...b,result}:b))
    await supabase.from('simul_bets').update({ result }).eq('id', id)
  }
  async function removeBet(id:string) {
    setBets(prev => prev.filter(b => b.id!==id))
    await supabase.from('simul_bets').delete().eq('id', id)
  }
  async function clearAllBets() {
    setBets([])
    await supabase.from('simul_bets').delete().neq('id','')
  }

  // ─── 통계 ────────────────────────────────────────────────────
  const STAKE = 10000
  const settled = bets.filter(b => b.result !== 'pending')
  const fs = statLeague==='전체' ? settled : settled.filter(b=>b.league===statLeague)
  const fw = fs.filter(b=>b.result==='win'), fl = fs.filter(b=>b.result==='loss')
  const winRate = fs.length>0?fw.length/fs.length*100:0
  const avgOdds = fs.length>0?fs.reduce((s,b)=>s+b.odds,0)/fs.length:0
  const roi = fs.length>0?(fw.reduce((s,b)=>s+(b.odds-1),0)-fl.length)/fs.length*100:0
  const totalProfit = Math.round(fw.reduce((s,b)=>s+STAKE*(b.odds-1),0)-fl.length*STAKE)
  const tierStats = ['S','A','B','C','D'].map(t => {
    const tb=fs.filter(b=>b.tier===t),tw=tb.filter(b=>b.result==='win'),tl=tb.filter(b=>b.result==='loss')
    const tRoi=tb.length>0?(tw.reduce((s,b)=>s+(b.odds-1),0)-tl.length)/tb.length*100:0
    const tProfit=Math.round(tw.reduce((s,b)=>s+STAKE*(b.odds-1),0)-tl.length*STAKE)
    return { tier:t, total:tb.length, wins:tw.length, rate:tb.length>0?tw.length/tb.length*100:0, roi:tRoi, profit:tProfit }
  }).filter(t=>t.total>0)
  const availLeagues=['전체',...Array.from(new Set(settled.map(b=>b.league)))]

  // ─── 파생 ────────────────────────────────────────────────────
  const sportCountries = countries.filter(c => c.sport_id === sportTab)
  const countryLeagues = selCountry ? leagues.filter(l => l.country_id === selCountry.id) : []
  const leagueGames    = selLeague  ? games.filter(g => g.league_id === selLeague.id)     : []

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:'var(--text-secondary)', fontSize:13 }}>불러오는 중...</div>

  // ─── 네비 버튼 스타일 ─────────────────────────────────────────
  function navBtn(active: boolean, color='var(--cyan)'): React.CSSProperties {
    return { width:'100%', padding:'8px 10px', borderRadius:7, textAlign:'left', marginBottom:4,
      border:`1px solid ${active?'var(--cyan-border)':'var(--border)'}`,
      background:active?'var(--cyan-bg)':'var(--bg-elevated)',
      color:active?color:'var(--text-secondary)',
      fontFamily:'var(--font-body)', fontSize:12, fontWeight:700, cursor:'pointer' }
  }
  function addBtn(onClick: () => void, label: string) {
    return <button onClick={onClick} style={{ width:'100%', padding:'6px 0', borderRadius:6, border:'1px dashed var(--border)', background:'none', color:'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:11, cursor:'pointer', marginTop:4 }}>{label}</button>
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'200px 180px 360px 280px 1fr', gap:10, padding:'12px', minHeight:'100vh', background:'var(--bg)', alignItems:'start' }}>

      {/* ── 1열: 트리 네비 (종목→국가→리그) ── */}
      <div>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'12px', marginBottom:8 }}>
          <div style={secT}>리그 선택</div>
          {SPORT_TABS.map(s => {
            const isSportOpen = sportTab === s.id
            const sCountries  = countries.filter(c => c.sport_id === s.id)
            return (
              <div key={s.id}>
                {/* 종목 행 */}
                <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:3 }}>
                  <button onClick={() => { setSportTab(s.id); setSelCountry(null); setSelLeague(null); setSelGame(null) }}
                    style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 9px', borderRadius:7, border:`1px solid ${isSportOpen?'var(--cyan-border)':'var(--border)'}`, background:isSportOpen?'var(--cyan-bg)':'var(--bg-elevated)', color:isSportOpen?'var(--cyan)':'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    <span>{s.emoji} {s.label}</span>
                    <span style={{ fontSize:9 }}>{isSportOpen?'▲':'▼'}</span>
                  </button>
                </div>
                {/* 국가 목록 */}
                {isSportOpen && (
                  <div style={{ marginLeft:10, marginBottom:4 }}>
                    {sCountries.map(c => {
                      const isCountryOpen = selCountry?.id === c.id
                      const cLeagues = leagues.filter(l => l.country_id === c.id)
                      return (
                        <div key={c.id}>
                          {/* 국가 행 */}
                          <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:2 }}>
                            <button onClick={() => { setSelCountry(isCountryOpen?null:c); setSelLeague(null); setSelGame(null) }}
                              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 8px', borderRadius:6, border:`1px solid ${isCountryOpen?'var(--border)':'var(--border)'}`, background:isCountryOpen?'var(--bg-elevated)':'transparent', color:'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              <span>🌐 {c.name}</span>
                              <span style={{ fontSize:9 }}>{isCountryOpen?'▲':'▼'}</span>
                            </button>
                            <button onClick={() => removeCountry(c.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:10, flexShrink:0, padding:'2px 4px' }}>✕</button>
                          </div>
                          {/* 리그 목록 */}
                          {isCountryOpen && (
                            <div style={{ marginLeft:10, marginBottom:4 }}>
                              {cLeagues.map(l => (
                                <div key={l.id} style={{ display:'flex', alignItems:'center', gap:3, marginBottom:2 }}>
                                  <button onClick={() => { setSelLeague(selLeague?.id===l.id?null:l); setSelGame(null) }}
                                    style={{ flex:1, padding:'5px 8px', borderRadius:5, border:`1px solid ${selLeague?.id===l.id?'var(--cyan-border)':'var(--border)'}`, background:selLeague?.id===l.id?'var(--cyan-bg)':'transparent', color:selLeague?.id===l.id?'var(--cyan)':'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:11, fontWeight:600, cursor:'pointer', textAlign:'left' }}>
                                    {l.name}
                                  </button>
                                  <button onClick={() => removeLeague(l.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:10, flexShrink:0, padding:'2px 4px' }}>✕</button>
                                </div>
                              ))}
                              <button onClick={() => setModal('league')} style={{ width:'100%', padding:'4px 0', borderRadius:5, border:'1px dashed var(--border)', background:'none', color:'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:10, cursor:'pointer', marginTop:2 }}>+ 리그 추가</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <button onClick={() => setModal('country')} style={{ width:'100%', padding:'4px 0', borderRadius:5, border:'1px dashed var(--border)', background:'none', color:'var(--text-secondary)', fontFamily:'var(--font-body)', fontSize:10, cursor:'pointer', marginTop:2 }}>+ 국가 추가</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* 티어 기준 */}
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'12px' }}>
          <div style={secT}>티어</div>
          {[{tier:'S',desc:'+3~+5%'},{tier:'A',desc:'+1~+3%'},{tier:'B',desc:'±1%'},{tier:'C',desc:'-2~-4%'},{tier:'D',desc:'-4% 이하'}].map(({tier,desc}) => (
            <div key={tier} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <TierBadge tier={tier} size={20} />
              <span style={{ fontSize:10, color:'var(--text-secondary)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2열: 경기 목록 ── */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>
            {selLeague ? selLeague.name : '경기 목록'}
          </span>
          {selLeague && ACTIVE_SPORTS.includes(sportTab) && (
            <button onClick={() => setModal('game')} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--cyan-border)', background:'var(--cyan-bg)', color:'var(--cyan)', fontFamily:'var(--font-body)', fontSize:11, fontWeight:700, cursor:'pointer' }}>+ 추가</button>
          )}
        </div>
        {!selLeague ? (
          <div style={{ ...card, textAlign:'center', padding:'24px 8px', color:'var(--text-secondary)', fontSize:11 }}>리그를 선택하세요</div>
        ) : leagueGames.length === 0 ? (
          <div style={{ ...card, textAlign:'center', padding:'24px 8px', color:'var(--text-secondary)', fontSize:11 }}>경기를 추가해주세요</div>
        ) : leagueGames.map(g => (
          <div key={g.id} onClick={() => setSelGame(g)}
            style={{ ...card, cursor:'pointer', border:`1px solid ${selGame?.id===g.id?'var(--cyan-border)':'var(--border)'}`, background:selGame?.id===g.id?'var(--cyan-bg)':'var(--bg-card)', padding:'10px 10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{g.home}</div>
                <div style={{ fontSize:10, color:'var(--text-secondary)', margin:'2px 0' }}>vs</div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{g.away}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); removeGame(g.id) }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:12 }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3열: 베팅 옵션 ── */}
      <div>
        {!selGame ? (
          <div style={{ ...card, textAlign:'center', padding:'32px 16px', color:'var(--text-secondary)', fontSize:11 }}>경기를 선택하면 베팅 옵션이 표시됩니다</div>
        ) : !ACTIVE_SPORTS.includes(sportTab) ? (
          <ComingSoon sport={sportTab} />
        ) : sportTab === 'baseball' ? (
          <BaseballBetPanel game={selGame} leagueName={selLeague?.name??''} onBet={addBet} />
        ) : (
          <BasketballBetPanel game={selGame} leagueName={selLeague?.name??''} onBet={addBet} />
        )}
      </div>

      {/* ── 4열: 베팅 목록 ── */}
      <div>
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={secT}>베팅 목록 ({bets.length})</div>
            {bets.length>0 && <button onClick={clearAllBets} style={{ fontSize:10, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>전체삭제</button>}
          </div>
          {bets.length===0 && <div style={{ fontSize:11, color:'var(--text-secondary)', textAlign:'center', padding:'14px 0' }}>베팅 없음</div>}
          {bets.filter(b=>b.result==='pending').length>0 && (
            <>
              <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:5, fontWeight:700 }}>미결 ({bets.filter(b=>b.result==='pending').length})</div>
              {bets.filter(b=>b.result==='pending').map(b => (
                <div key={b.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8, padding:'9px', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <TierBadge tier={b.tier} size={20} />
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{b.pick}</div>
                        <div style={{ fontSize:9, color:'var(--text-secondary)' }}>{b.league} · {b.createdAt}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:b.tierColor }}>{b.odds.toFixed(2)}</span>
                      <button onClick={() => removeBet(b.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:10 }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={() => setResult(b.id,'win')} style={{ flex:1, padding:'5px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer', background:'rgba(74,222,128,0.1)', border:'1px solid #4ade80', color:'#4ade80', fontFamily:'var(--font-body)' }}>✓ 적중</button>
                    <button onClick={() => setResult(b.id,'loss')} style={{ flex:1, padding:'5px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer', background:'rgba(248,113,113,0.1)', border:'1px solid #f87171', color:'#f87171', fontFamily:'var(--font-body)' }}>✕ 실패</button>
                  </div>
                </div>
              ))}
            </>
          )}
          {bets.filter(b=>b.result!=='pending').length>0 && (
            <>
              <div style={{ fontSize:9, color:'var(--text-secondary)', marginTop:8, marginBottom:5, fontWeight:700 }}>결과 ({bets.filter(b=>b.result!=='pending').length})</div>
              {bets.filter(b=>b.result!=='pending').map(b => (
                <div key={b.id} style={{ background:b.result==='win'?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)', border:`1px solid ${b.result==='win'?'rgba(74,222,128,0.3)':'rgba(248,113,113,0.3)'}`, borderRadius:7, padding:'7px 9px', marginBottom:5 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <TierBadge tier={b.tier} size={18} />
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-primary)' }}>{b.pick}</div>
                        <div style={{ fontSize:9, color:'var(--text-secondary)' }}>{b.league} · {b.createdAt}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:b.result==='win'?'#4ade80':'#f87171' }}>{b.result==='win'?'✓':'✕'}</span>
                      <button onClick={() => setResult(b.id,'pending')} style={{ fontSize:8, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>되돌리기</button>
                      <button onClick={() => removeBet(b.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:10 }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── 5열: 통계 ── */}
      <div>
        <div style={card}>
          <div style={secT}>통계</div>
          {settled.length>0 && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:10 }}>
              {availLeagues.map(lg => (
                <button key={lg} onClick={() => setStatLeague(lg)} style={{ padding:'3px 7px', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer', border:`1px solid ${statLeague===lg?'var(--cyan-border)':'var(--border)'}`, background:statLeague===lg?'var(--cyan-bg)':'var(--bg-elevated)', color:statLeague===lg?'var(--cyan)':'var(--text-secondary)', fontFamily:'var(--font-body)' }}>{lg}</button>
              ))}
            </div>
          )}
          {settled.length===0
            ? <div style={{ fontSize:11, color:'var(--text-secondary)', textAlign:'center', padding:'16px 0' }}>결과 처리 후 표시</div>
            : fs.length===0
            ? <div style={{ fontSize:11, color:'var(--text-secondary)', textAlign:'center', padding:'12px 0' }}>{statLeague} 없음</div>
            : <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
                {[
                  { label:'총 베팅', val:fs.length+'건', color:'' },
                  { label:'적중률',  val:winRate.toFixed(1)+'%', color:winRate>=50?'#4ade80':'#f87171' },
                  { label:'평균 배당', val:avgOdds.toFixed(2), color:'' },
                  { label:'ROI', val:(roi>=0?'+':'')+roi.toFixed(1)+'%', color:roi>=0?'#4ade80':'#f87171' },
                ].map(({label,val,color}) => (
                  <div key={label} style={{ background:'var(--bg-elevated)', borderRadius:6, padding:'8px 10px' }}>
                    <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:15, fontWeight:700, color:color||'var(--text-primary)' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8 }}>
                <div style={{ background:'rgba(74,222,128,0.08)', borderRadius:6, padding:'6px', textAlign:'center', border:'1px solid rgba(74,222,128,0.2)' }}>
                  <div style={{ fontSize:9, color:'var(--text-secondary)' }}>적중</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#4ade80' }}>{fw.length}</div>
                </div>
                <div style={{ background:'rgba(248,113,113,0.08)', borderRadius:6, padding:'6px', textAlign:'center', border:'1px solid rgba(248,113,113,0.2)' }}>
                  <div style={{ fontSize:9, color:'var(--text-secondary)' }}>실패</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#f87171' }}>{fl.length}</div>
                </div>
                <div style={{ background:totalProfit>=0?'rgba(74,222,128,0.08)':'rgba(248,113,113,0.08)', borderRadius:6, padding:'6px', textAlign:'center', border:`1px solid ${totalProfit>=0?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'}` }}>
                  <div style={{ fontSize:9, color:'var(--text-secondary)' }}>손익</div>
                  <div style={{ fontSize:11, fontWeight:700, color:totalProfit>=0?'#4ade80':'#f87171' }}>{totalProfit>=0?'+':''}{totalProfit.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ height:5, background:'var(--bg-elevated)', borderRadius:3, overflow:'hidden', marginBottom:12 }}>
                <div style={{ height:'100%', width:`${winRate}%`, background:winRate>=50?'#4ade80':'#f87171', borderRadius:3 }} />
              </div>
              {tierStats.length>0 && (
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--text-secondary)', marginBottom:7 }}>티어별</div>
                  {tierStats.map(({tier,total,wins:tw,rate,roi:tRoi,profit:tProfit}) => (
                    <div key={tier} style={{ background:'var(--bg-elevated)', borderRadius:7, padding:'8px 9px', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                        <TierBadge tier={tier} size={20} />
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:11, fontWeight:700 }}>{tw}/{total}건</span>
                            <span style={{ fontSize:12, fontWeight:700, color:rate>=50?'#4ade80':'#f87171' }}>{rate.toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ height:3, background:'var(--bg)', borderRadius:2, overflow:'hidden', marginBottom:5 }}>
                        <div style={{ height:'100%', width:`${Math.min(rate,100)}%`, background:rate>=50?'#4ade80':'#f87171', borderRadius:2 }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontSize:9, color:'var(--text-secondary)' }}>ROI <span style={{ fontWeight:700, color:tRoi>=0?'#4ade80':'#f87171' }}>{tRoi>=0?'+':''}{tRoi.toFixed(1)}%</span></span>
                        <span style={{ fontSize:9, color:'var(--text-secondary)' }}>만원 <span style={{ fontWeight:700, color:tProfit>=0?'#4ade80':'#f87171' }}>{tProfit>=0?'+':''}{tProfit.toLocaleString()}원</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          }
        </div>
      </div>

      {/* ── 팝업 ── */}
      {modal==='country' && <AddNameModal title="국가 추가" placeholder="예: 미국, 한국, 일본" onClose={() => setModal(null)} onSave={addCountry} />}
      {modal==='league'  && selCountry && <AddNameModal title={`리그 추가 — ${selCountry.name}`} placeholder="예: MLB, KBO, NPB" onClose={() => setModal(null)} onSave={addLeague} />}
      {modal==='game'    && selLeague  && <AddGameModal leagueName={selLeague.name} onClose={() => setModal(null)} onSave={addGames} />}
    </div>
  )
}

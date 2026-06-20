import { useState, useRef } from 'react'
import type React from 'react'

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
    } else if (s >= 3.5 && s < 6.5) {
      tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='홈 플핸 중간'; pick=homeOddsLower?'away':'home'
    } else if (s > 11.5) {
      tier='C';roi='-1~-3%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실';reason='플핸 과대';pick='away'
    } else {
      tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='소폭 플핸'; pick=homeOddsLower?'away':'home'
    }
  } else {
    const s = Math.abs(spread)
    if (s >= 1.5 && s <= 5.5){tier='A';roi='+1~+3%';color='#60a5fa';bg='rgba(96,165,250,0.12)';label='밸류';reason='홈 어드밴티지 자연 구간';pick=homeOddsLower?'away':'home'}
    else if (s >= 6.5 && s <= 9.5){tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='홈 마핸 중간';pick='away'}
    else if (s >= 10.5 && s <= 13.5){tier='C';roi='-2~-4%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실';reason='홈 쏠림 구간';pick='away'}
    else if (s >= 14.5){tier='D';roi='-4% 이하';color='#f87171';bg='rgba(248,113,113,0.12)';label='손실';reason='압도적 홈 정배';pick='away'}
    else{tier='B';roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립';reason='소폭 마핸';pick=homeOddsLower?'away':'home'}
  }
  if (margin > 7 && tier !== 'D') {
    const order=['S','A','B','C','D'], idx=order.indexOf(tier), nt=order[Math.min(idx+1,4)]
    if (nt!==tier){
      tier=nt
      if(tier==='A'){roi='+1~+3%';color='#60a5fa';bg='rgba(96,165,250,0.12)';label='밸류'}
      else if(tier==='B'){roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립'}
      else if(tier==='C'){roi='-2~-4%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실'}
      else{roi='-4% 이하';color='#f87171';bg='rgba(248,113,113,0.12)';label='손실'}
      reason+=` (마진 ${margin.toFixed(1)}% 높아 하락)`
    }
  }
  return { pick, tier, roi, color, bg, label, reason }
}

// ─── 배당 입력 훅: 숫자 3개 입력 시 자동 소숫점 변환 ─────────────
// digits가 정확히 3자리일 때만 x.xx 형태로 변환해 input value에 표시
// 3자리 미만이면 그냥 digits 표시 (커서 유지)
function useOddsInput() {
  const [digits, setDigits] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  // 표시값: 3자리면 x.xx, 아니면 그대로
  const display = digits.length === 3 ? digits[0] + '.' + digits.slice(1) : digits

  // 실제 파싱값: 3자리일 때만 유효
  const parsed = digits.length === 3 ? parseFloat(digits[0] + '.' + digits.slice(1)) : NaN

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    // 소숫점 포함 입력을 처리하되, 숫자만 추출
    const raw = e.target.value.replace(/\D/g, '').slice(0, 3)
    setDigits(raw)
  }

  function reset() { setDigits('') }

  return { display, parsed, onChange, reset, ref, digits }
}

// ─── 타입 ──────────────────────────────────────────────────────────
type Mode = 'baseball_ml' | 'baseball_ou' | 'basketball'
type League = 'MLB' | 'KBO' | 'NPB' | 'NBA' | 'WNBA'
type BetResult = 'pending' | 'win' | 'loss'

interface SimulBet {
  id: string; mode: Mode; league: League; pick: string; odds: number
  tier: string; tierColor: string; result: BetResult; createdAt: string
}

const TIER_COLOR: Record<string,string> = { S:'#4ade80', A:'#60a5fa', B:'#fbbf24', C:'#fb923c', D:'#f87171' }
const TIER_BG: Record<string,string> = { S:'rgba(74,222,128,0.12)', A:'rgba(96,165,250,0.12)', B:'rgba(251,191,36,0.12)', C:'rgba(251,146,60,0.12)', D:'rgba(248,113,113,0.12)' }

function mbStyle(m: number): React.CSSProperties {
  return { display:'inline-block', fontSize:11, fontWeight:700,
    color:m>7?'#f87171':m>5?'#fbbf24':'#4ade80',
    background:m>7?'rgba(248,113,113,0.1)':m>5?'rgba(251,191,36,0.1)':'rgba(74,222,128,0.1)',
    border:`1px solid ${m>7?'#f87171':m>5?'#fbbf24':'#4ade80'}`,
    borderRadius:4, padding:'1px 7px' }
}

function TierBadge({ tier, size=28 }: { tier:string; size?:number }) {
  return <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, borderRadius:6, fontWeight:700, fontSize:size*0.5, flexShrink:0, background:TIER_BG[tier]??'#333', color:TIER_COLOR[tier]??'#fff', border:`1px solid ${TIER_COLOR[tier]??'#fff'}` }}>{tier}</span>
}

// ─── 배당 입력 컴포넌트 (최상위 - 리마운트 방지) ─────────────────
function OddsInput({ label, hook }: { label: string; hook: ReturnType<typeof useOddsInput> }) {
  return (
    <div>
      <span style={lbSt}>{label}</span>
      <input
        ref={hook.ref}
        style={{ ...inSt, color: hook.digits.length===3 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        inputMode="numeric"
        placeholder="예: 245"
        value={hook.display}
        onChange={hook.onChange}
      />
      {hook.digits.length > 0 && hook.digits.length < 3 && (
        <div style={{ fontSize:10, color:'#fbbf24', textAlign:'center', marginTop:3 }}>
          숫자 {3 - hook.digits.length}개 더 입력
        </div>
      )}
    </div>
  )
}

// ─── 베팅 버튼 (최상위) ───────────────────────────────────────────
function BetBtn({ label, odds, tier, color, bg, onBet }: { label:string; odds:number; tier:string; color:string; bg:string; onBet:(pick:string,odds:number,tier:string,color:string)=>void }) {
  return (
    <button onClick={() => onBet(label, odds, tier, color)} style={btnSt(color, bg)}>
      {label} 베팅
    </button>
  )
}

// ─── 스타일 ────────────────────────────────────────────────────────
const card: React.CSSProperties = { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'14px', marginBottom:10 }
const lbSt: React.CSSProperties = { fontSize:11, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.5px', marginBottom:5, display:'block' }
const inSt: React.CSSProperties = { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:20, fontWeight:700, textAlign:'center', padding:'10px 8px', width:'100%', boxSizing:'border-box', outline:'none' }
const selSt: React.CSSProperties = { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:13, fontWeight:600, padding:'7px 10px', width:'100%', boxSizing:'border-box', outline:'none', cursor:'pointer' }
const secT: React.CSSProperties = { fontSize:9, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:10 }
const r2: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }
const btnSt = (color: string, bg: string): React.CSSProperties => ({
  width:'100%', padding:'7px 0', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
  background:bg, border:`1px solid ${color}`, color, fontFamily:'var(--font-body)'
})

// ─── 메인 ─────────────────────────────────────────────────────────
export default function Simul() {
  const [mode, setMode] = useState<Mode>('baseball_ml')
  const [league, setLeague] = useState<League>('MLB')
  const [bets, setBets] = useState<SimulBet[]>([])

  // 배당 입력 훅들
  const homeOdds = useOddsInput()
  const awayOdds = useOddsInput()
  const overOdds = useOddsInput()
  const underOdds = useOddsInput()
  const bktHomeOdds = useOddsInput()
  const bktAwayOdds = useOddsInput()

  const [ouLine, setOuLine] = useState('')
  const [homeHandicap, setHomeHandicap] = useState<'마핸'|'플핸'>('마핸')
  const [handicapLine, setHandicapLine] = useState('')

  const BB: League[] = ['MLB','KBO','NPB']
  const BK: League[] = ['NBA','WNBA']

  function switchMode(m: Mode) {
    setMode(m); setLeague(m==='basketball'?'NBA':'MLB')
  }

  // ─── 계산 ────────────────────────────────────────────────────
  const ho = homeOdds.parsed, ao = awayOdds.parsed
  const mlValid = !isNaN(ho) && !isNaN(ao) && ho > 1 && ao > 1
  const mlMargin = mlValid ? (1/ho+1/ao-1)*100 : 0
  const homeTier = mlValid ? getBaseballTier(ho, true) : null
  const awayTier = mlValid ? getBaseballTier(ao, false) : null
  const TO = ['S','A','B','C','D']
  const mlPick = mlValid && homeTier && awayTier
    ? TO.indexOf(homeTier.tier)<TO.indexOf(awayTier.tier)?'home'
      : TO.indexOf(homeTier.tier)>TO.indexOf(awayTier.tier)?'away'
      : ho>=ao?'home':'away'
    : null

  const ln = parseFloat(ouLine), ov = overOdds.parsed, un = underOdds.parsed
  const ouValid = !isNaN(ln) && !isNaN(ov) && !isNaN(un) && ln>0 && ov>1 && un>1
  const ouMargin = ouValid ? (1/ov+1/un-1)*100 : 0
  const ouResult = ouValid ? getBaseballOUTier(ln, ov, un) : null

  const hl = parseFloat(handicapLine), bho = bktHomeOdds.parsed, bao = bktAwayOdds.parsed
  const bktValid = !isNaN(hl) && !isNaN(bho) && !isNaN(bao) && hl>0 && bho>1 && bao>1
  const bktMargin = bktValid ? (1/bho+1/bao-1)*100 : 0
  const bktResult = bktValid ? getBasketballTier(hl, homeHandicap==='마핸', bho, bao, bktMargin) : null

  // ─── 베팅 관리 ───────────────────────────────────────────────
  function addBet(pick: string, odds: number, tier: string, tierColor: string) {
    setBets(prev => [{ id:Date.now().toString(), mode, league, pick, odds, tier, tierColor, result:'pending', createdAt:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) }, ...prev])
  }
  function setResult(id: string, result: BetResult) { setBets(prev => prev.map(b => b.id===id?{...b,result}:b)) }
  function removeBet(id: string) { setBets(prev => prev.filter(b => b.id!==id)) }

  // ─── 통계 ────────────────────────────────────────────────────
  const settled = bets.filter(b => b.result!=='pending')
  const wins = settled.filter(b => b.result==='win')
  const losses = settled.filter(b => b.result==='loss')
  const winRate = settled.length>0 ? wins.length/settled.length*100 : 0
  const avgOdds = settled.length>0 ? settled.reduce((s,b)=>s+b.odds,0)/settled.length : 0
  const roi = settled.length>0 ? (wins.reduce((s,b)=>s+(b.odds-1),0)-losses.length)/settled.length*100 : 0
  const tierStats = ['S','A','B','C','D'].map(t => {
    const tb=settled.filter(b=>b.tier===t), tw=tb.filter(b=>b.result==='win')
    return { tier:t, total:tb.length, wins:tw.length, rate:tb.length>0?tw.length/tb.length*100:0 }
  }).filter(t=>t.total>0)

  // ══════════════════════════════════════════════════════════════
  // 렌더
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'grid', gridTemplateColumns:'320px 320px 1fr', gap:12, padding:'14px', minHeight:'100vh', background:'var(--bg)', alignItems:'start' }}>

      {/* ── 좌측: 입력 ── */}
      <div>
        {/* 종목 선택 */}
        <div style={card}>
          <div style={secT}>종목</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {([{id:'baseball_ml' as Mode, label:'⚾ 야구 승패'},{id:'baseball_ou' as Mode, label:'⚾ 야구 언오버'},{id:'basketball' as Mode, label:'🏀 농구 핸디캡'}]).map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)} style={{
                padding:'8px 12px', borderRadius:7, textAlign:'left',
                border:`1px solid ${mode===m.id?'var(--cyan-border)':'var(--border)'}`,
                background:mode===m.id?'var(--cyan-bg)':'var(--bg-elevated)',
                color:mode===m.id?'var(--cyan)':'var(--text-secondary)',
                fontFamily:'var(--font-body)', fontSize:13, fontWeight:700, cursor:'pointer',
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        {/* 리그 */}
        <div style={card}>
          <span style={lbSt}>리그</span>
          <select style={selSt} value={league} onChange={e => setLeague(e.target.value as League)}>
            {(mode==='basketball'?BK:BB).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* ── 야구 승패 ── */}
        {mode === 'baseball_ml' && (
          <div style={card}>
            <div style={secT}>배당 입력</div>
            <div style={r2}>
              <OddsInput label="홈 배당" hook={homeOdds} />
              <OddsInput label="원정 배당" hook={awayOdds} />
            </div>
            {mlValid && homeTier && awayTier && (
              <>
                <div style={{ marginTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--text-secondary)' }}>마진</span>
                  <span style={mbStyle(mlMargin)}>{mlMargin.toFixed(1)}%</span>
                </div>
                <div style={{ ...r2, marginTop:10 }}>
                  {([{label:'홈', odds:ho, tier:homeTier, side:'home'},{label:'원정', odds:ao, tier:awayTier, side:'away'}] as const).map(({label, odds, tier, side}) => (
                    <div key={side} style={{ background:mlPick===side?tier.bg:'var(--bg-elevated)', border:`${mlPick===side?2:1}px solid ${mlPick===side?tier.color:'var(--border)'}`, borderRadius:8, padding:'10px', textAlign:'center' }}>
                      <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:5 }}>{label} {odds.toFixed(2)}</div>
                      <TierBadge tier={tier.tier} size={28} />
                      <div style={{ fontSize:11, color:tier.color, marginTop:4, marginBottom:8 }}>{tier.label} · {tier.roi}</div>
                      <BetBtn label={label} odds={odds} tier={tier.tier} color={tier.color} bg={tier.bg} onBet={addBet} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 야구 언오버 ── */}
        {mode === 'baseball_ou' && (
          <div style={card}>
            <div style={secT}>기준점 / 배당</div>
            <div style={{ marginBottom:10 }}>
              <span style={lbSt}>기준점 (총점 라인)</span>
              <input style={inSt} type="number" step="0.5" placeholder="예: 9.5" value={ouLine} onChange={e => setOuLine(e.target.value)} />
            </div>
            <div style={r2}>
              <OddsInput label="오버 배당" hook={overOdds} />
              <OddsInput label="언더 배당" hook={underOdds} />
            </div>
            {ouValid && ouResult && (
              <>
                <div style={{ marginTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--text-secondary)' }}>마진</span>
                  <span style={mbStyle(ouMargin)}>{ouMargin.toFixed(1)}%</span>
                </div>
                <div style={{ marginTop:10, background:ouResult.bg, border:`2px solid ${ouResult.color}`, borderRadius:8, padding:'12px', textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:5 }}>
                    <TierBadge tier={ouResult.tier} size={28} />
                    <span style={{ fontSize:15, fontWeight:700, color:ouResult.color }}>{ouResult.pick==='over'?'오버':'언더'} {(ouResult.pick==='over'?ov:un).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:10 }}>{ouResult.reason}</div>
                  <BetBtn label={ouResult.pick==='over'?'오버':'언더'} odds={ouResult.pick==='over'?ov:un} tier={ouResult.tier} color={ouResult.color} bg={ouResult.bg} onBet={addBet} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 농구 핸디캡 ── */}
        {mode === 'basketball' && (
          <div style={card}>
            <div style={secT}>핸디캡 입력</div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              {(['마핸','플핸'] as const).map(h => (
                <button key={h} onClick={() => setHomeHandicap(h)} style={{
                  flex:1, padding:'8px', borderRadius:7,
                  border:`1px solid ${homeHandicap===h?'var(--cyan-border)':'var(--border)'}`,
                  background:homeHandicap===h?'var(--cyan-bg)':'var(--bg-elevated)',
                  color:homeHandicap===h?'var(--cyan)':'var(--text-secondary)',
                  fontFamily:'var(--font-body)', fontSize:12, fontWeight:700, cursor:'pointer',
                }}>{h==='마핸'?'홈 마핸(-)':'홈 플핸(+)'}</button>
              ))}
            </div>
            <div style={{ marginBottom:10 }}>
              <span style={lbSt}>기준점 (절대값)</span>
              <input style={inSt} type="number" step="0.5" placeholder="예: 7.5" value={handicapLine} onChange={e => setHandicapLine(e.target.value)} />
            </div>
            <div style={r2}>
              <OddsInput label={`홈(${homeHandicap})`} hook={bktHomeOdds} />
              <OddsInput label={`원정(${homeHandicap==='마핸'?'플핸':'마핸'})`} hook={bktAwayOdds} />
            </div>
            {bktValid && bktResult && (
              <>
                <div style={{ marginTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--text-secondary)' }}>마진</span>
                  <span style={mbStyle(bktMargin)}>{bktMargin.toFixed(1)}%</span>
                </div>
                <div style={{ marginTop:10, background:bktResult.bg, border:`2px solid ${bktResult.color}`, borderRadius:8, padding:'12px', textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:5 }}>
                    <TierBadge tier={bktResult.tier} size={28} />
                    <span style={{ fontSize:13, fontWeight:700, color:bktResult.color }}>
                      {bktResult.pick==='home'
                        ? `홈 ${homeHandicap} ${homeHandicap==='마핸'?'-':'+'}${hl.toFixed(1)} / ${bho.toFixed(2)}`
                        : `원정 ${homeHandicap==='마핸'?'플핸':'마핸'} ${homeHandicap==='마핸'?'+':'-'}${hl.toFixed(1)} / ${bao.toFixed(2)}`}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:10 }}>{bktResult.reason}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => addBet(`홈 ${homeHandicap} ${homeHandicap==='마핸'?'-':'+'}${hl.toFixed(1)}`, bho, bktResult.tier, bktResult.color)}
                      style={{ ...btnSt('var(--text-secondary)','var(--bg-elevated)'), border:'1px solid var(--border)' }}>홈 베팅</button>
                    <button onClick={() => addBet(`원정 ${homeHandicap==='마핸'?'플핸':'마핸'} ${homeHandicap==='마핸'?'+':'-'}${hl.toFixed(1)}`, bao, bktResult.tier, bktResult.color)}
                      style={{ ...btnSt('var(--text-secondary)','var(--bg-elevated)'), border:'1px solid var(--border)' }}>원정 베팅</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 티어 기준 */}
        <div style={card}>
          <div style={secT}>티어 기준</div>
          {[{tier:'S',desc:'핵심 · +3~+5%'},{tier:'A',desc:'밸류 · +1~+3%'},{tier:'B',desc:'중립 · ±1%'},{tier:'C',desc:'약손실 · -2~-4%'},{tier:'D',desc:'손실 · -4% 이하'}].map(({tier,desc}) => (
            <div key={tier} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <TierBadge tier={tier} size={22} />
              <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 중앙: 베팅 목록 ── */}
      <div>
        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={secT}>베팅 목록 ({bets.length})</div>
            {bets.length>0 && <button onClick={() => setBets([])} style={{ fontSize:10, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>전체삭제</button>}
          </div>

          {bets.length===0 && <div style={{ fontSize:12, color:'var(--text-secondary)', textAlign:'center', padding:'24px 0' }}>베팅 없음</div>}

          {/* 미결 */}
          {bets.filter(b=>b.result==='pending').length > 0 && (
            <>
              <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:7, fontWeight:700, letterSpacing:'0.5px' }}>
                미결 ({bets.filter(b=>b.result==='pending').length})
              </div>
              {bets.filter(b=>b.result==='pending').map(b => (
                <div key={b.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:9, padding:'11px 13px', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <TierBadge tier={b.tier} size={26} />
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{b.pick}</div>
                        <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:1 }}>{b.league} · {b.createdAt}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:15, fontWeight:700, color:b.tierColor }}>{b.odds.toFixed(2)}</span>
                      <button onClick={() => removeBet(b.id)} style={{ fontSize:11, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)', lineHeight:1 }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:7 }}>
                    <button onClick={() => setResult(b.id,'win')} style={{ flex:1, padding:'7px 0', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', background:'rgba(74,222,128,0.1)', border:'1px solid #4ade80', color:'#4ade80', fontFamily:'var(--font-body)' }}>✓ 적중</button>
                    <button onClick={() => setResult(b.id,'loss')} style={{ flex:1, padding:'7px 0', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', background:'rgba(248,113,113,0.1)', border:'1px solid #f87171', color:'#f87171', fontFamily:'var(--font-body)' }}>✕ 실패</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* 결과 완료 */}
          {bets.filter(b=>b.result!=='pending').length > 0 && (
            <>
              <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:12, marginBottom:7, fontWeight:700 }}>
                결과 ({bets.filter(b=>b.result!=='pending').length})
              </div>
              {bets.filter(b=>b.result!=='pending').map(b => (
                <div key={b.id} style={{ background:b.result==='win'?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)', border:`1px solid ${b.result==='win'?'rgba(74,222,128,0.3)':'rgba(248,113,113,0.3)'}`, borderRadius:9, padding:'10px 13px', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <TierBadge tier={b.tier} size={22} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{b.pick}</div>
                        <div style={{ fontSize:10, color:'var(--text-secondary)', marginTop:1 }}>{b.league} · {b.createdAt}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:b.result==='win'?'#4ade80':'#f87171' }}>{b.result==='win'?'✓ 적중':'✕ 실패'}</span>
                      <button onClick={() => setResult(b.id,'pending')} style={{ fontSize:9, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>되돌리기</button>
                      <button onClick={() => removeBet(b.id)} style={{ fontSize:11, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── 우측: 통계 ── */}
      <div>
        <div style={card}>
          <div style={secT}>모의 통계</div>
          {settled.length === 0
            ? <div style={{ fontSize:12, color:'var(--text-secondary)', textAlign:'center', padding:'24px 0' }}>결과 처리 후 통계 표시</div>
            : (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                  {[
                    { label:'총 베팅', val:settled.length+'건', color:'' },
                    { label:'적중률', val:winRate.toFixed(1)+'%', color:winRate>=50?'#4ade80':'#f87171' },
                    { label:'평균 배당', val:avgOdds.toFixed(2), color:'' },
                    { label:'모의 ROI', val:(roi>=0?'+':'')+roi.toFixed(1)+'%', color:roi>=0?'#4ade80':'#f87171' },
                  ].map(({label,val,color}) => (
                    <div key={label} style={{ background:'var(--bg-elevated)', borderRadius:7, padding:'10px 12px' }}>
                      <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:18, fontWeight:700, color:color||'var(--text-primary)' }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <div style={{ flex:1, background:'rgba(74,222,128,0.08)', borderRadius:7, padding:'8px 12px', textAlign:'center', border:'1px solid rgba(74,222,128,0.2)' }}>
                    <div style={{ fontSize:10, color:'var(--text-secondary)' }}>적중</div>
                    <div style={{ fontSize:20, fontWeight:700, color:'#4ade80' }}>{wins.length}</div>
                  </div>
                  <div style={{ flex:1, background:'rgba(248,113,113,0.08)', borderRadius:7, padding:'8px 12px', textAlign:'center', border:'1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ fontSize:10, color:'var(--text-secondary)' }}>실패</div>
                    <div style={{ fontSize:20, fontWeight:700, color:'#f87171' }}>{losses.length}</div>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:5 }}>적중률 바</div>
                  <div style={{ height:8, background:'var(--bg-elevated)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${winRate}%`, background:winRate>=50?'#4ade80':'#f87171', borderRadius:4, transition:'width 0.3s' }} />
                  </div>
                </div>
                {tierStats.length > 0 && (
                  <div>
                    <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:8, fontWeight:700 }}>티어별 적중률</div>
                    {tierStats.map(({tier,total,wins:tw,rate}) => (
                      <div key={tier} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                        <TierBadge tier={tier} size={22} />
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                            <span style={{ fontSize:10, color:'var(--text-secondary)' }}>{tw}/{total}건</span>
                            <span style={{ fontSize:10, fontWeight:700, color:rate>=50?'#4ade80':'#f87171' }}>{rate.toFixed(0)}%</span>
                          </div>
                          <div style={{ height:4, background:'var(--bg-elevated)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${rate}%`, background:rate>=50?'#4ade80':'#f87171', borderRadius:2 }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          }
        </div>
      </div>
    </div>
  )
}

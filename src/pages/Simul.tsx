import { useState } from 'react'
import type React from 'react'

// ─── 티어 계산 함수들 ──────────────────────────────────────────────
function getBaseballTier(odds: number, isHome: boolean) {
  if (isHome) {
    if (odds >= 2.3 && odds <= 2.6)  return { tier: 'S', roi: '+3.5~+5.5%', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: '핵심' }
    if (odds >= 2.2 && odds < 2.3)   return { tier: 'A', roi: '+2.0~+3.5%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds > 2.6 && odds <= 3.1)   return { tier: 'A', roi: '+1.0~+3.7%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds >= 2.0 && odds < 2.2)   return { tier: 'B', roi: '-0.8~+0.5%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds > 3.1 && odds <= 3.2)   return { tier: 'B', roi: '+0.3~+0.5%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds >= 1.7 && odds < 2.0)   return { tier: 'C', roi: '-2.0~-4.0%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    if (odds > 3.2 && odds <= 3.85)  return { tier: 'C', roi: '-0.3~-2.5%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    return { tier: 'D', roi: '-5% 이하', color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: '손실' }
  } else {
    if (odds >= 2.4 && odds <= 2.6)  return { tier: 'A', roi: '+1.5~+2.5%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds > 2.6 && odds <= 2.8)   return { tier: 'A', roi: '+1.0~+2.0%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds >= 2.2 && odds < 2.4)   return { tier: 'B', roi: '-0.5~+1.5%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds > 2.8 && odds <= 3.2)   return { tier: 'B', roi: '-0.8~+1.0%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds > 3.2 && odds <= 3.5)   return { tier: 'C', roi: '-0.3~-2.0%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    if (odds >= 2.0 && odds < 2.2)   return { tier: 'C', roi: '-2.0~-3.2%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    return { tier: 'D', roi: '-4% 이하', color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: '손실' }
  }
}

function getBaseballOUTier(line: number, overOdds: number, underOdds: number) {
  const overFavored = overOdds < underOdds
  const underFavored = underOdds < overOdds
  if (line >= 10.0) {
    if (!underFavored) return { pick: 'over' as const, tier: 'S', roi: '+3~+5%', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: '핵심', reason: '라인 높음+언더 배당 유리', betPick: 'under' as const }
    return { pick: 'under' as const, tier: 'A', roi: '+1~+3%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류', reason: '라인 높음, 구조적 언더 유리', betPick: 'under' as const }
  }
  if (line >= 9.0) {
    if (!underFavored) return { pick: 'under' as const, tier: 'A', roi: '+1~+3%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류', reason: '평균 이상+언더 배당 유리', betPick: 'under' as const }
    if (overFavored) return { pick: 'over' as const, tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '언더 쏠림, 오버 역발상', betPick: 'over' as const }
    return { pick: 'under' as const, tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '라인 평균 이상, 배당 대칭', betPick: 'under' as const }
  }
  if (line >= 8.0) {
    if (underFavored) return { pick: 'over' as const, tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '언더 쏠림→오버 밸류', betPick: 'over' as const }
    if (overFavored) return { pick: 'under' as const, tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '오버 쏠림→언더 밸류', betPick: 'under' as const }
    return { pick: 'under' as const, tier: 'C', roi: '-2~-3%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실', reason: '평균 구간, 배당 대칭', betPick: 'under' as const }
  }
  if (underFavored) return { pick: 'over' as const, tier: 'C', roi: '-1~-3%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실', reason: '낮은 라인, 데이터 불확실', betPick: 'over' as const }
  return { pick: 'over' as const, tier: 'C', roi: '-2~-4%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실', reason: '낮은 라인, 근거 부족', betPick: 'over' as const }
}

function getBasketballTier(homeLine: number, homeIsNegative: boolean, homeOdds: number, awayOdds: number, margin: number) {
  const spread = homeIsNegative ? -homeLine : homeLine
  const homeOddsLower = homeOdds < awayOdds
  let tier = 'C', roi = '-2~-4%', pick: 'home' | 'away' = 'away'
  let label = '약손실', color = '#fb923c', bg = 'rgba(251,146,60,0.12)', reason = ''
  if (spread > 0) {
    const s = Math.abs(spread)
    if (s >= 6.5 && s <= 11.5) {
      if (!homeOddsLower) { tier = 'S'; roi = '+3~+5%'; color = '#4ade80'; bg = 'rgba(74,222,128,0.12)'; label = '핵심'; reason = '홈 플핸 핵심+홈 배당 유리' }
      else { tier = 'A'; roi = '+1~+3%'; color = '#60a5fa'; bg = 'rgba(96,165,250,0.12)'; label = '밸류'; reason = '홈 플핸 핵심, 원정 쏠림' }
      pick = 'home'
    } else if (s >= 3.5 && s < 6.5) {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'; reason = '홈 플핸 중간'
      pick = homeOddsLower ? 'away' : 'home'
    } else if (s > 11.5) {
      tier = 'C'; roi = '-1~-3%'; color = '#fb923c'; bg = 'rgba(251,146,60,0.12)'; label = '약손실'; reason = '플핸 과대'; pick = 'away'
    } else {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'; reason = '소폭 플핸'
      pick = homeOddsLower ? 'away' : 'home'
    }
  } else {
    const s = Math.abs(spread)
    if (s >= 1.5 && s <= 5.5) {
      tier = 'A'; roi = '+1~+3%'; color = '#60a5fa'; bg = 'rgba(96,165,250,0.12)'; label = '밸류'; reason = '홈 어드밴티지 자연 구간'
      pick = homeOddsLower ? 'away' : 'home'
    } else if (s >= 6.5 && s <= 9.5) {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'; reason = '홈 마핸 중간'; pick = 'away'
    } else if (s >= 10.5 && s <= 13.5) {
      tier = 'C'; roi = '-2~-4%'; color = '#fb923c'; bg = 'rgba(251,146,60,0.12)'; label = '약손실'; reason = '홈 쏠림 구간'; pick = 'away'
    } else if (s >= 14.5) {
      tier = 'D'; roi = '-4% 이하'; color = '#f87171'; bg = 'rgba(248,113,113,0.12)'; label = '손실'; reason = '압도적 홈 정배'; pick = 'away'
    } else {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'; reason = '소폭 마핸'
      pick = homeOddsLower ? 'away' : 'home'
    }
  }
  if (margin > 7 && tier !== 'D') {
    const order = ['S','A','B','C','D']; const idx = order.indexOf(tier); const nt = order[Math.min(idx+1,4)]
    if (nt !== tier) {
      tier = nt
      if (tier==='A'){roi='+1~+3%';color='#60a5fa';bg='rgba(96,165,250,0.12)';label='밸류'}
      else if(tier==='B'){roi='±1%';color='#fbbf24';bg='rgba(251,191,36,0.12)';label='중립'}
      else if(tier==='C'){roi='-2~-4%';color='#fb923c';bg='rgba(251,146,60,0.12)';label='약손실'}
      else{roi='-4% 이하';color='#f87171';bg='rgba(248,113,113,0.12)';label='손실'}
      reason += ` (마진 ${margin.toFixed(1)}% 높아 하락)`
    }
  }
  return { pick, tier, roi, color, bg, label, reason }
}

// ─── 배당 입력 포맷 (343 → 3.43) ─────────────────────────────────
function formatOddsInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 3)
  if (digits.length === 0) return ''
  if (digits.length < 3) return digits   // 3자리 미만: 그냥 숫자 표시
  return digits[0] + '.' + digits.slice(1) // 정확히 3자리: x.xx
}

function parseOdds(raw: string): number {
  const fmt = formatOddsInput(raw)
  if (fmt.length < 3) return NaN
  return parseFloat(fmt)
}

// ─── 타입 ──────────────────────────────────────────────────────────
type Mode = 'baseball_ml' | 'baseball_ou' | 'basketball'
type League = 'MLB' | 'KBO' | 'NPB' | 'NBA' | 'WNBA'
type BetResult = 'pending' | 'win' | 'loss'

interface SimulBet {
  id: string
  mode: Mode
  league: League
  pick: string
  odds: number
  tier: string
  tierColor: string
  result: BetResult
  createdAt: string
}

// ─── 상수 ──────────────────────────────────────────────────────────
const TIER_COLOR: Record<string, string> = { S:'#4ade80', A:'#60a5fa', B:'#fbbf24', C:'#fb923c', D:'#f87171' }
const TIER_BG: Record<string, string> = { S:'rgba(74,222,128,0.12)', A:'rgba(96,165,250,0.12)', B:'rgba(251,191,36,0.12)', C:'rgba(251,146,60,0.12)', D:'rgba(248,113,113,0.12)' }

function mbStyle(m: number): React.CSSProperties {
  return { display:'inline-block', fontSize:11, fontWeight:700, color: m>7?'#f87171':m>5?'#fbbf24':'#4ade80', background: m>7?'rgba(248,113,113,0.1)':m>5?'rgba(251,191,36,0.1)':'rgba(74,222,128,0.1)', border:`1px solid ${m>7?'#f87171':m>5?'#fbbf24':'#4ade80'}`, borderRadius:4, padding:'1px 6px' }
}

function TierBadge({ tier, size=28 }: { tier: string; size?: number }) {
  return <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, borderRadius:6, fontWeight:700, fontSize:size*0.5, flexShrink:0, background:TIER_BG[tier]??'#333', color:TIER_COLOR[tier]??'#fff', border:`1px solid ${TIER_COLOR[tier]??'#fff'}` }}>{tier}</span>
}

// ─── 스타일 상수 ───────────────────────────────────────────────────
const card: React.CSSProperties = { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'12px', marginBottom:10 }
const lbSt: React.CSSProperties = { fontSize:10, fontWeight:700, color:'var(--text-secondary)', letterSpacing:'0.5px', marginBottom:4, display:'block' }
const inSt: React.CSSProperties = { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:16, fontWeight:700, textAlign:'center', padding:'6px 8px', width:'100%', boxSizing:'border-box', outline:'none' }
const selSt: React.CSSProperties = { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-primary)', fontFamily:'var(--font-body)', fontSize:12, fontWeight:600, padding:'5px 8px', width:'100%', boxSizing:'border-box', outline:'none', cursor:'pointer' }
const secT: React.CSSProperties = { fontSize:9, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:8 }
const r2: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────
export default function Simul() {
  const [mode, setMode] = useState<Mode>('baseball_ml')
  const [league, setLeague] = useState<League>('MLB')
  const [bets, setBets] = useState<SimulBet[]>([])

  // 야구 ML
  const [homeOddsRaw, setHomeOddsRaw] = useState('')
  const [awayOddsRaw, setAwayOddsRaw] = useState('')
  // 야구 OU
  const [ouLine, setOuLine] = useState('')
  const [overOddsRaw, setOverOddsRaw] = useState('')
  const [underOddsRaw, setUnderOddsRaw] = useState('')
  // 농구
  const [homeHandicap, setHomeHandicap] = useState<'마핸'|'플핸'>('마핸')
  const [handicapLine, setHandicapLine] = useState('')
  const [bktHomeRaw, setBktHomeRaw] = useState('')
  const [bktAwayRaw, setBktAwayRaw] = useState('')

  const BB = ['MLB','KBO','NPB'] as League[]
  const BK = ['NBA','WNBA'] as League[]

  function switchMode(m: Mode) {
    setMode(m)
    setLeague(m === 'basketball' ? 'NBA' : 'MLB')
  }

  // 파싱
  const ho = parseOdds(homeOddsRaw)
  const ao = parseOdds(awayOddsRaw)
  const mlValid = !isNaN(ho) && !isNaN(ao) && ho > 1 && ao > 1
  const mlMargin = mlValid ? (1/ho + 1/ao - 1)*100 : 0
  const homeTier = mlValid ? getBaseballTier(ho, true) : null
  const awayTier = mlValid ? getBaseballTier(ao, false) : null
  const TO = ['S','A','B','C','D']
  const mlPick = mlValid && homeTier && awayTier
    ? TO.indexOf(homeTier.tier) < TO.indexOf(awayTier.tier) ? 'home'
      : TO.indexOf(homeTier.tier) > TO.indexOf(awayTier.tier) ? 'away'
      : ho >= ao ? 'home' : 'away'
    : null

  const ln = parseFloat(ouLine), ov = parseOdds(overOddsRaw), un = parseOdds(underOddsRaw)
  const ouValid = !isNaN(ln) && !isNaN(ov) && !isNaN(un) && ln > 0 && ov > 1 && un > 1
  const ouMargin = ouValid ? (1/ov + 1/un - 1)*100 : 0
  const ouResult = ouValid ? getBaseballOUTier(ln, ov, un) : null

  const hl = parseFloat(handicapLine), bho = parseOdds(bktHomeRaw), bao = parseOdds(bktAwayRaw)
  const bktValid = !isNaN(hl) && !isNaN(bho) && !isNaN(bao) && hl > 0 && bho > 1 && bao > 1
  const bktMargin = bktValid ? (1/bho + 1/bao - 1)*100 : 0
  const bktResult = bktValid ? getBasketballTier(hl, homeHandicap==='마핸', bho, bao, bktMargin) : null

  // 베팅 추가
  function addBet(pick: string, odds: number, tier: string, tierColor: string) {
    setBets(prev => [{
      id: Date.now().toString(), mode, league, pick, odds, tier, tierColor, result: 'pending',
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
    }, ...prev])
  }

  function setResult(id: string, result: BetResult) {
    setBets(prev => prev.map(b => b.id === id ? { ...b, result } : b))
  }

  function removeBet(id: string) {
    setBets(prev => prev.filter(b => b.id !== id))
  }

  // 통계
  const settled = bets.filter(b => b.result !== 'pending')
  const wins = settled.filter(b => b.result === 'win')
  const losses = settled.filter(b => b.result === 'loss')
  const winRate = settled.length > 0 ? (wins.length / settled.length * 100) : 0
  const avgOdds = settled.length > 0 ? settled.reduce((s,b) => s+b.odds, 0)/settled.length : 0
  const roi = settled.length > 0
    ? ((wins.reduce((s,b) => s + (b.odds - 1), 0) - losses.length) / settled.length * 100)
    : 0
  const tierStats = ['S','A','B','C','D'].map(t => {
    const tb = settled.filter(b => b.tier === t)
    const tw = tb.filter(b => b.result === 'win')
    return { tier: t, total: tb.length, wins: tw.length, rate: tb.length > 0 ? (tw.length/tb.length*100) : 0 }
  }).filter(t => t.total > 0)

  // 배당 입력 핸들러
  function handleOddsInput(raw: string, setter: (v: string) => void) {
    const digits = raw.replace(/\D/g, '').slice(0, 5)
    setter(digits)
  }

  function displayOdds(raw: string): string {
    return formatOddsInput(raw) || ''
  }

  // ─── 좌측 패널 JSX ───────────────────────────────────────────
  const leftPanel = (
      <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
        {/* 모드 선택 */}
        <div style={card}>
          <div style={secT}>종목</div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {([
              { id:'baseball_ml' as Mode, label:'⚾ 야구 승패' },
              { id:'baseball_ou' as Mode, label:'⚾ 야구 언오버' },
              { id:'basketball' as Mode, label:'🏀 농구 핸디캡' },
            ]).map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)} style={{
                padding:'6px 10px', borderRadius:6, textAlign:'left',
                border:`1px solid ${mode===m.id ? 'var(--cyan-border)' : 'var(--border)'}`,
                background: mode===m.id ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
                color: mode===m.id ? 'var(--cyan)' : 'var(--text-secondary)',
                fontFamily:'var(--font-body)', fontSize:12, fontWeight:700, cursor:'pointer',
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        {/* 리그 */}
        <div style={card}>
          <span style={lbSt}>리그</span>
          <select style={selSt} value={league} onChange={e => setLeague(e.target.value as League)}>
            {(mode==='basketball' ? BK : BB).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* 야구 승패 입력 */}
        {mode === 'baseball_ml' && (
          <div style={card}>
            <div style={secT}>배당 입력</div>
            <div style={r2}>
              <div>
                <span style={lbSt}>홈</span>
                <input style={inSt} inputMode="numeric" placeholder="예: 245"
                  value={formatOddsInput(homeOddsRaw)}
                  onChange={e => handleOddsInput(e.target.value, setHomeOddsRaw)}
                  onClick={() => setHomeOddsRaw('')} />
                {homeOddsRaw.length > 0 && homeOddsRaw.length < 3 && <div style={{ fontSize:10, color:'#fbbf24', textAlign:'center', marginTop:2 }}>숫자 {3-homeOddsRaw.length}개 더</div>}
              </div>
              <div>
                <span style={lbSt}>원정</span>
                <input style={inSt} inputMode="numeric" placeholder="예: 196"
                  value={formatOddsInput(awayOddsRaw)}
                  onChange={e => handleOddsInput(e.target.value, setAwayOddsRaw)}
                  onClick={() => setAwayOddsRaw('')} />
                {awayOddsRaw.length > 0 && awayOddsRaw.length < 3 && <div style={{ fontSize:10, color:'#fbbf24', textAlign:'center', marginTop:2 }}>숫자 {3-awayOddsRaw.length}개 더</div>}
              </div>
            </div>
            {mlValid && homeTier && awayTier && (
              <>
                <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, color:'var(--text-secondary)' }}>마진</span>
                  <span style={mbStyle(mlMargin)}>{mlMargin.toFixed(1)}%</span>
                </div>
                <div style={{ ...r2, marginTop:8 }}>
                  {([{label:'홈', odds:ho, tier:homeTier, side:'home'},{label:'원정', odds:ao, tier:awayTier, side:'away'}] as const).map(({label, odds, tier, side}) => (
                    <div key={side} style={{ background: mlPick===side ? tier.bg : 'var(--bg-elevated)', border:`${mlPick===side?2:1}px solid ${mlPick===side?tier.color:'var(--border)'}`, borderRadius:8, padding:'8px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:4 }}>{label} {odds.toFixed(2)}</div>
                      <TierBadge tier={tier.tier} size={24} />
                      <div style={{ fontSize:10, color:tier.color, marginTop:3 }}>{tier.label}</div>
                      <button onClick={() => addBet(`${label} ${odds.toFixed(2)}`, odds, tier.tier, tier.color)} style={{
                        marginTop:6, width:'100%', padding:'4px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                        background: tier.bg, border:`1px solid ${tier.color}`, color:tier.color, fontFamily:'var(--font-body)'
                      }}>베팅</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 야구 언오버 입력 */}
        {mode === 'baseball_ou' && (
          <div style={card}>
            <div style={secT}>기준점 / 배당</div>
            <div style={{ marginBottom:8 }}>
              <span style={lbSt}>기준점</span>
              <input style={inSt} type="number" step="0.5" placeholder="9.5" value={ouLine} onChange={e => setOuLine(e.target.value)} />
            </div>
            <div style={r2}>
              <div>
                <span style={lbSt}>오버</span>
                <input style={inSt} inputMode="numeric" placeholder="195" value={overOddsRaw} onChange={e => handleOddsInput(e.target.value, setOverOddsRaw)} />
                {overOddsRaw && <div style={{ fontSize:10, color:'var(--text-secondary)', textAlign:'center', marginTop:2 }}>{displayOdds(overOddsRaw)}</div>}
              </div>
              <div>
                <span style={lbSt}>언더</span>
                <input style={inSt} inputMode="numeric" placeholder="188" value={underOddsRaw} onChange={e => handleOddsInput(e.target.value, setUnderOddsRaw)} />
                {underOddsRaw && <div style={{ fontSize:10, color:'var(--text-secondary)', textAlign:'center', marginTop:2 }}>{displayOdds(underOddsRaw)}</div>}
              </div>
            </div>
            {ouValid && ouResult && (
              <>
                <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, color:'var(--text-secondary)' }}>마진</span>
                  <span style={mbStyle(ouMargin)}>{ouMargin.toFixed(1)}%</span>
                </div>
                <div style={{ marginTop:8, background: ouResult.bg, border:`1px solid ${ouResult.color}`, borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
                    <TierBadge tier={ouResult.tier} size={24} />
                    <span style={{ fontSize:13, fontWeight:700, color:ouResult.color }}>{ouResult.pick==='over'?'오버':'언더'} {(ouResult.pick==='over'?ov:un).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:6 }}>{ouResult.reason}</div>
                  <button onClick={() => addBet(`${ouResult.pick==='over'?'오버':'언더'} ${(ouResult.pick==='over'?ov:un).toFixed(2)}`, ouResult.pick==='over'?ov:un, ouResult.tier, ouResult.color)} style={{
                    width:'100%', padding:'4px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                    background: ouResult.bg, border:`1px solid ${ouResult.color}`, color:ouResult.color, fontFamily:'var(--font-body)'
                  }}>베팅</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 농구 핸디캡 입력 */}
        {mode === 'basketball' && (
          <div style={card}>
            <div style={secT}>핸디캡 입력</div>
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              {(['마핸','플핸'] as const).map(h => (
                <button key={h} onClick={() => setHomeHandicap(h)} style={{
                  flex:1, padding:'5px', borderRadius:6,
                  border:`1px solid ${homeHandicap===h?'var(--cyan-border)':'var(--border)'}`,
                  background: homeHandicap===h ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
                  color: homeHandicap===h ? 'var(--cyan)' : 'var(--text-secondary)',
                  fontFamily:'var(--font-body)', fontSize:11, fontWeight:700, cursor:'pointer',
                }}>{h==='마핸'?'홈 마핸(-)':'홈 플핸(+)'}</button>
              ))}
            </div>
            <div style={{ marginBottom:8 }}>
              <span style={lbSt}>기준점</span>
              <input style={inSt} type="number" step="0.5" placeholder="7.5" value={handicapLine} onChange={e => setHandicapLine(e.target.value)} />
            </div>
            <div style={r2}>
              <div>
                <span style={lbSt}>홈({homeHandicap})</span>
                <input style={inSt} inputMode="numeric" placeholder="187" value={bktHomeRaw} onChange={e => handleOddsInput(e.target.value, setBktHomeRaw)} />
                {bktHomeRaw && <div style={{ fontSize:10, color:'var(--text-secondary)', textAlign:'center', marginTop:2 }}>{displayOdds(bktHomeRaw)}</div>}
              </div>
              <div>
                <span style={lbSt}>원정({homeHandicap==='마핸'?'플핸':'마핸'})</span>
                <input style={inSt} inputMode="numeric" placeholder="195" value={bktAwayRaw} onChange={e => handleOddsInput(e.target.value, setBktAwayRaw)} />
                {bktAwayRaw && <div style={{ fontSize:10, color:'var(--text-secondary)', textAlign:'center', marginTop:2 }}>{displayOdds(bktAwayRaw)}</div>}
              </div>
            </div>
            {bktValid && bktResult && (
              <>
                <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, color:'var(--text-secondary)' }}>마진</span>
                  <span style={mbStyle(bktMargin)}>{bktMargin.toFixed(1)}%</span>
                </div>
                <div style={{ marginTop:8, background:bktResult.bg, border:`1px solid ${bktResult.color}`, borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
                    <TierBadge tier={bktResult.tier} size={24} />
                    <span style={{ fontSize:12, fontWeight:700, color:bktResult.color }}>
                      {bktResult.pick==='home'
                        ? `홈 ${homeHandicap} ${homeHandicap==='마핸'?'-':'+'}${hl.toFixed(1)} / ${bho.toFixed(2)}`
                        : `원정 ${homeHandicap==='마핸'?'플핸':'마핸'} ${homeHandicap==='마핸'?'+':'-'}${hl.toFixed(1)} / ${bao.toFixed(2)}`}
                    </span>
                  </div>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:6 }}>{bktResult.reason}</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => addBet(`홈 ${homeHandicap} ${homeHandicap==='마핸'?'-':'+'}${hl.toFixed(1)}`, bho, bktResult.tier, bktResult.color)} style={{
                      flex:1, padding:'4px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                      background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-body)'
                    }}>홈 베팅</button>
                    <button onClick={() => addBet(`원정 ${homeHandicap==='마핸'?'플핸':'마핸'} ${homeHandicap==='마핸'?'+':'-'}${hl.toFixed(1)}`, bao, bktResult.tier, bktResult.color)} style={{
                      flex:1, padding:'4px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                      background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-secondary)', fontFamily:'var(--font-body)'
                    }}>원정 베팅</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 티어 기준 */}
        <div style={card}>
          <div style={secT}>티어 기준</div>
          {[
            { tier:'S', desc:'핵심 · +3~+5%' },
            { tier:'A', desc:'밸류 · +1~+3%' },
            { tier:'B', desc:'중립 · ±1%' },
            { tier:'C', desc:'약손실 · -2~-4%' },
            { tier:'D', desc:'손실 · -4% 이하' },
          ].map(({tier, desc}) => (
            <div key={tier} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <TierBadge tier={tier} size={20} />
              <span style={{ fontSize:10, color:'var(--text-secondary)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
  )

  // ─── 중앙 패널: 베팅 목록 ──────────────────────────────────────
  const pending = bets.filter(b => b.result === 'pending')
  const done = bets.filter(b => b.result !== 'pending')
  const midPanel = (
      <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
        <div style={{ ...card, marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={secT}>베팅 목록 ({bets.length})</div>
            {bets.length > 0 && <button onClick={() => setBets([])} style={{ fontSize:9, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>전체삭제</button>}
          </div>
          {bets.length === 0 && <div style={{ fontSize:11, color:'var(--text-secondary)', textAlign:'center', padding:'16px 0' }}>베팅 없음</div>}

          {pending.length > 0 && (
            <>
              <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:5, fontWeight:700 }}>미결 ({pending.length})</div>
              {pending.map(b => (
                <div key={b.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <TierBadge tier={b.tier} size={20} />
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{b.pick}</div>
                        <div style={{ fontSize:9, color:'var(--text-secondary)' }}>{b.league} · {b.createdAt}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:b.tierColor }}>{b.odds.toFixed(2)}</span>
                      <button onClick={() => removeBet(b.id)} style={{ fontSize:9, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)', padding:'0 2px' }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={() => setResult(b.id, 'win')} style={{
                      flex:1, padding:'4px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                      background:'rgba(74,222,128,0.1)', border:'1px solid #4ade80', color:'#4ade80', fontFamily:'var(--font-body)'
                    }}>✓ 적중</button>
                    <button onClick={() => setResult(b.id, 'loss')} style={{
                      flex:1, padding:'4px 0', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                      background:'rgba(248,113,113,0.1)', border:'1px solid #f87171', color:'#f87171', fontFamily:'var(--font-body)'
                    }}>✕ 실패</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {done.length > 0 && (
            <>
              <div style={{ fontSize:9, color:'var(--text-secondary)', marginTop:8, marginBottom:5, fontWeight:700 }}>결과 ({done.length})</div>
              {done.map(b => (
                <div key={b.id} style={{ background: b.result==='win' ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)', border:`1px solid ${b.result==='win'?'rgba(74,222,128,0.3)':'rgba(248,113,113,0.3)'}`, borderRadius:8, padding:'7px 10px', marginBottom:5 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <TierBadge tier={b.tier} size={18} />
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-primary)' }}>{b.pick}</div>
                        <div style={{ fontSize:9, color:'var(--text-secondary)' }}>{b.league} · {b.createdAt}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:b.result==='win'?'#4ade80':'#f87171' }}>{b.result==='win'?'✓ 적중':'✕ 실패'}</span>
                      <button onClick={() => setResult(b.id, 'pending')} style={{ fontSize:8, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>되돌리기</button>
                      <button onClick={() => removeBet(b.id)} style={{ fontSize:9, color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)' }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
  )

  // ─── 우측 패널: 룰북 ──────────────────────────────────────────
  const rulebook = (
    <div style={card}>
      <div style={secT}>전략 룰북 v2.0</div>

      {/* 야구 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>⚾ 야구 — 역배</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5 }}>진입 기준: 배당 2.10 이상 (2.09↓ 패스)</div>
        {[
          { league: 'MLB', s: '2.10~2.49', a: '2.50~2.79', pass: '2.80↑' },
          { league: 'NPB', s: '2.10~2.49', a: '2.50~2.59', pass: '2.60↑' },
          { league: 'KBO', s: '2.10~2.49', a: '2.50↑ 무제한', pass: '—' },
        ].map(r => (
          <div key={r.league} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', width: 32, flexShrink: 0 }}>{r.league}</span>
            <span style={{ fontSize: 9, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', borderRadius: 4, padding: '1px 5px' }}>S {r.s}</span>
            <span style={{ fontSize: 9, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', borderRadius: 4, padding: '1px 5px' }}>A {r.a}</span>
            {r.pass !== '—' && <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>✕{r.pass}</span>}
          </div>
        ))}

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginTop: 10, marginBottom: 5 }}>⚾ 야구 — 언더 (MLB·NPB·KBO 동일)</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5 }}>조건: 언더 배당 1.90 이상 (1.89↓ 패스)</div>
        {[
          { tier: 'S', label: '1순위', range: '1.90~2.09', desc: '메인', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' },
          { tier: 'A', label: '2순위', range: '2.10~2.29', desc: '여유 있을 때', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
          { tier: 'B', label: '3순위', range: '2.30~2.49', desc: '소액 테스트', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' },
        ].map(r => (
          <div key={r.tier} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, background: r.bg, border: `1px solid ${r.border}`, color: r.color, borderRadius: 4, padding: '1px 5px', width: 42, textAlign: 'center', flexShrink: 0 }}>{r.tier} {r.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600 }}>{r.range}</span>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{r.desc}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />

      {/* 축구 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>⚽ 축구 — 2.5 언더</div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6 }}>EPL · 라리가 · 분데스 · 세리에 · 리그앙 · UCL</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
          강팀 배당 <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>1.40~1.79</span> (홈/원정 무관)<br />
          언더 배당 <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>1.80 이상</span>
        </div>
        {[
          { tier: 'S', label: '1순위', range: '1.80~2.09', desc: '메인', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' },
          { tier: 'A', label: '2순위', range: '2.10~2.29', desc: '테스트', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
        ].map(r => (
          <div key={r.tier} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, background: r.bg, border: `1px solid ${r.border}`, color: r.color, borderRadius: 4, padding: '1px 5px', width: 42, textAlign: 'center', flexShrink: 0 }}>{r.tier} {r.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600 }}>{r.range}</span>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{r.desc}</span>
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>
          ✕ 강팀 1.39↓ · 1.80↑ / 언더 1.79↓ 패스
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />

      {/* 농구 */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🏀 농구 — 플핸(+스프레드)</div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6 }}>NBA · 유로리그 · KBL · B리그 · CBA / 배당 1.90 이상</div>
        {[
          { tier: 'S', label: '1순위', range: '+6.5~+9.5', desc: '메인', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' },
          { tier: 'A', label: '2순위', range: '+10.5~+12.5', desc: '2순위', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
          { tier: 'B', label: '3순위', range: '+5.5/+13.5~+14.5', desc: '소액', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' },
        ].map(r => (
          <div key={r.tier} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, background: r.bg, border: `1px solid ${r.border}`, color: r.color, borderRadius: 4, padding: '1px 5px', width: 42, textAlign: 'center', flexShrink: 0 }}>{r.tier} {r.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600 }}>{r.range}</span>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{r.desc}</span>
          </div>
        ))}

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginTop: 10, marginBottom: 4 }}>🏀 농구 — 언더</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5 }}>
          정배 배당 <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>1.20~1.59</span> (범위 밖 패스)
        </div>
        {[
          { label: '1순위', range: '언더 2.00↑', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' },
          { label: '2순위', range: '언더 1.90~1.99', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, background: r.bg, border: `1px solid ${r.border}`, color: r.color, borderRadius: 4, padding: '1px 5px', width: 42, textAlign: 'center', flexShrink: 0 }}>{r.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600 }}>{r.range}</span>
          </div>
        ))}
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>
          ✕ 언더 배당 1.89↓ 패스 / 마진 7% 이하
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />

      {/* 공통 원칙 */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>💡 공통 원칙</div>
        {[
          '배당만 본다 — 선발·날씨·라인업 무시',
          '구간 이탈 시 무조건 패스',
          '구간별 분리 기록 — 합산 금지',
          '최소 100건 이상 후 구간 판단',
        ].map((t, i) => (
          <div key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', gap: 4 }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ─── 우측 탭 상태 ──────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<'stats' | 'rulebook'>('stats')

  // ─── 우측 패널: 통계 탭 ────────────────────────────────────────
  const statsPanel = settled.length === 0 ? (
    <div style={card}>
      <div style={secT}>모의 통계</div>
      <div style={{ fontSize:11, color:'var(--text-secondary)', textAlign:'center', padding:'20px 0' }}>결과 처리 후 통계가 표시됩니다</div>
    </div>
  ) : (
    <div style={card}>
      <div style={secT}>모의 통계</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
        {[
          { label:'총 베팅', val: settled.length+'건' },
          { label:'적중률', val: winRate.toFixed(1)+'%', color: winRate>=50?'#4ade80':'#f87171' },
          { label:'평균 배당', val: avgOdds.toFixed(2) },
          { label:'모의 ROI', val: roi.toFixed(1)+'%', color: roi>=0?'#4ade80':'#f87171' },
        ].map(({label, val, color}) => (
          <div key={label} style={{ background:'var(--bg-elevated)', borderRadius:6, padding:'8px 10px' }}>
            <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:15, fontWeight:700, color: color ?? 'var(--text-primary)' }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <div style={{ flex:1, background:'rgba(74,222,128,0.08)', borderRadius:6, padding:'6px 10px', textAlign:'center', border:'1px solid rgba(74,222,128,0.2)' }}>
          <div style={{ fontSize:9, color:'var(--text-secondary)' }}>적중</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#4ade80' }}>{wins.length}</div>
        </div>
        <div style={{ flex:1, background:'rgba(248,113,113,0.08)', borderRadius:6, padding:'6px 10px', textAlign:'center', border:'1px solid rgba(248,113,113,0.2)' }}>
          <div style={{ fontSize:9, color:'var(--text-secondary)' }}>실패</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#f87171' }}>{losses.length}</div>
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:4 }}>적중률</div>
        <div style={{ height:6, background:'var(--bg-elevated)', borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${winRate}%`, background: winRate>=50?'#4ade80':'#f87171', borderRadius:3, transition:'width 0.3s' }} />
        </div>
      </div>
      {tierStats.length > 0 && (
        <div>
          <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:6, fontWeight:700 }}>티어별 적중률</div>
          {tierStats.map(({tier, total, wins: tw, rate}) => (
            <div key={tier} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <TierBadge tier={tier} size={18} />
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ fontSize:9, color:'var(--text-secondary)' }}>{tw}/{total}건</span>
                  <span style={{ fontSize:9, fontWeight:700, color: rate>=50?'#4ade80':'#f87171' }}>{rate.toFixed(0)}%</span>
                </div>
                <div style={{ height:3, background:'var(--bg-elevated)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${rate}%`, background: rate>=50?'#4ade80':'#f87171', borderRadius:2 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display:'grid', gridTemplateColumns:'220px 220px 1fr', gap:10, padding:'12px', minHeight:'100vh', background:'var(--bg)', alignItems:'start' }}>
      {leftPanel}
      {midPanel}
      <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
        {/* 우측 탭 */}
        <div style={{ display:'flex', gap:4, marginBottom:8 }}>
          {([
            { id: 'stats' as const, label: '📊 통계' },
            { id: 'rulebook' as const, label: '📖 룰북' },
          ]).map(t => (
            <button key={t.id} onClick={() => setRightTab(t.id)} style={{
              flex:1, padding:'6px 0', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
              border: `1px solid ${rightTab === t.id ? 'var(--cyan-border)' : 'var(--border)'}`,
              background: rightTab === t.id ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
              color: rightTab === t.id ? 'var(--cyan)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
            }}>{t.label}</button>
          ))}
        </div>
        {rightTab === 'stats' ? statsPanel : rulebook}
      </div>
    </div>
  )
}
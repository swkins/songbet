import { useState } from 'react'

// ─── 야구 머니라인 티어 ───────────────────────────────────────────
function getBaseballTier(odds: number, isHome: boolean): { tier: string; roi: string; color: string; bg: string; label: string } {
  if (isHome) {
    if (odds >= 2.3 && odds <= 2.6)  return { tier: 'S', roi: '+3.5~+5.5%', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: '핵심 구간' }
    if (odds >= 2.2 && odds < 2.3)   return { tier: 'A', roi: '+2.0~+3.5%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds > 2.6 && odds <= 3.1)   return { tier: 'A', roi: '+1.0~+3.7%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds >= 2.0 && odds < 2.2)   return { tier: 'B', roi: '-0.8~+0.5%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds > 3.1 && odds <= 3.2)   return { tier: 'B', roi: '+0.3~+0.5%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds >= 1.7 && odds < 2.0)   return { tier: 'C', roi: '-2.0~-4.0%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    if (odds > 3.2 && odds <= 3.85)  return { tier: 'C', roi: '-0.3~-2.5%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    return { tier: 'D', roi: '-5.0% 이하', color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: '손실' }
  } else {
    if (odds >= 2.4 && odds <= 2.6)  return { tier: 'A', roi: '+1.5~+2.5%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds > 2.6 && odds <= 2.8)   return { tier: 'A', roi: '+1.0~+2.0%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류' }
    if (odds >= 2.2 && odds < 2.4)   return { tier: 'B', roi: '-0.5~+1.5%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds > 2.8 && odds <= 3.2)   return { tier: 'B', roi: '-0.8~+1.0%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립' }
    if (odds > 3.2 && odds <= 3.5)   return { tier: 'C', roi: '-0.3~-2.0%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    if (odds >= 2.0 && odds < 2.2)   return { tier: 'C', roi: '-2.0~-3.2%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실' }
    return { tier: 'D', roi: '-4.0% 이하', color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: '손실' }
  }
}

// ─── 야구 언오버 티어 ─────────────────────────────────────────────
function getBaseballOUTier(line: number, overOdds: number, underOdds: number): {
  pick: 'over' | 'under'; tier: string; roi: string; color: string; bg: string; label: string; reason: string
} {
  const avgLine = 8.8
  const overFavored = overOdds < underOdds  // 오버에 대중 쏠림
  const underFavored = underOdds < overOdds // 언더에 대중 쏠림

  // 라인 높음 (10+)
  if (line >= 10.0) {
    if (!underFavored) {
      return { pick: 'under', tier: 'S', roi: '+3~+5%', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: '핵심', reason: '라인 높음+언더 배당 유리' }
    }
    return { pick: 'under', tier: 'A', roi: '+1~+3%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류', reason: '라인 높음, 구조적 언더 유리' }
  }
  // 라인 평균 이상 (9.0~9.9)
  if (line >= 9.0) {
    if (!underFavored) {
      return { pick: 'under', tier: 'A', roi: '+1~+3%', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: '밸류', reason: '평균 이상 라인+언더 배당 유리' }
    }
    if (overFavored) {
      return { pick: 'over', tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '언더 쏠림, 오버 역발상' }
    }
    return { pick: 'under', tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '라인 평균 이상, 배당 대칭' }
  }
  // 라인 평균 근처 (8.0~8.9)
  if (line >= 8.0) {
    if (underFavored) {
      return { pick: 'over', tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '언더 쏠림→오버 배당 비대칭 밸류' }
    }
    if (overFavored) {
      return { pick: 'under', tier: 'B', roi: '±1%', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: '중립', reason: '오버 쏠림→언더 배당 비대칭 밸류' }
    }
    return { pick: 'under', tier: 'C', roi: '-2~-3%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실', reason: '평균 구간, 배당 대칭 판단 어려움' }
  }
  // 라인 낮음 (8.0 미만) - 데이터 근거 약함
  if (underFavored) {
    return { pick: 'over', tier: 'C', roi: '-1~-3%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실', reason: '언더 쏠림→오버 배당, 낮은 라인 데이터 불확실' }
  }
  return { pick: line < avgLine ? 'over' : 'under', tier: 'C', roi: '-2~-4%', color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: '약손실', reason: '낮은 라인 구간, 데이터 근거 부족' }
}

// ─── 농구 핸디캡 티어 ─────────────────────────────────────────────
function getBasketballTier(
  homeLine: number, homeIsNegative: boolean, homeOdds: number, awayOdds: number, margin: number
): { pick: 'home' | 'away'; tier: string; roi: string; color: string; bg: string; label: string; reason: string } {
  // homeLine: 절대값, homeIsNegative: true면 홈 마핸(-), false면 홈 플핸(+)
  const spread = homeIsNegative ? -homeLine : homeLine
  // spread < 0 → 홈이 강팀(마핸), spread > 0 → 홈이 약팀(플핸)
  const homeOddsLower = homeOdds < awayOdds
  const marginPenalty = margin > 7 ? 1 : margin > 5 ? 0 : -1 // 마진 높을수록 티어 하락

  let tier = 'C', roi = '-2~-4%', pick: 'home' | 'away' = 'away'
  let label = '약손실', color = '#fb923c', bg = 'rgba(251,146,60,0.12)', reason = ''

  if (spread > 0) {
    // 홈 플핸 (홈이 약팀, 원정이 강팀)
    const s = Math.abs(spread)
    if (s >= 6.5 && s <= 11.5) {
      // S티어 구간: 대중이 원정 강팀에 몰림 → 홈 플핸 밸류
      if (!homeOddsLower) {
        tier = 'S'; roi = '+3~+5%'; color = '#4ade80'; bg = 'rgba(74,222,128,0.12)'; label = '핵심'
        reason = '홈 플핸 핵심구간 + 홈 배당 유리'
      } else {
        tier = 'A'; roi = '+1~+3%'; color = '#60a5fa'; bg = 'rgba(96,165,250,0.12)'; label = '밸류'
        reason = '홈 플핸 핵심구간, 대중 원정 쏠림'
      }
      pick = 'home'
    } else if (s >= 3.5 && s < 6.5) {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'
      reason = '홈 플핸 중간 구간'
      pick = homeOddsLower ? 'away' : 'home'
    } else if (s > 11.5) {
      tier = 'C'; roi = '-1~-3%'; color = '#fb923c'; bg = 'rgba(251,146,60,0.12)'; label = '약손실'
      reason = '홈 플핸 과대, 실력차 너무 큼'
      pick = 'away'
    } else {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'
      reason = '소폭 플핸, 배당으로 판단'
      pick = homeOddsLower ? 'away' : 'home'
    }
  } else {
    // 홈 마핸 (홈이 강팀)
    const s = Math.abs(spread)
    if (s >= 1.5 && s <= 5.5) {
      tier = 'A'; roi = '+1~+3%'; color = '#60a5fa'; bg = 'rgba(96,165,250,0.12)'; label = '밸류'
      reason = '자연스러운 홈 어드밴티지 구간'
      pick = homeOddsLower ? 'away' : 'home'
    } else if (s >= 6.5 && s <= 9.5) {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'
      reason = '홈 마핸 중간, 대중 쏠림 시작'
      pick = 'away'
    } else if (s >= 10.5 && s <= 13.5) {
      tier = 'C'; roi = '-2~-4%'; color = '#fb923c'; bg = 'rgba(251,146,60,0.12)'; label = '약손실'
      reason = '대중 홈 쏠림 구간'
      pick = 'away'
    } else if (s >= 14.5) {
      tier = 'D'; roi = '-4% 이하'; color = '#f87171'; bg = 'rgba(248,113,113,0.12)'; label = '손실'
      reason = '압도적 홈 정배, 이중 불리'
      pick = 'away'
    } else {
      tier = 'B'; roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립'
      reason = '소폭 마핸 구간'
      pick = homeOddsLower ? 'away' : 'home'
    }
  }

  // 마진 패널티
  if (marginPenalty > 0 && tier !== 'D') {
    const order = ['S', 'A', 'B', 'C', 'D']
    const idx = order.indexOf(tier)
    const newTier = order[Math.min(idx + 1, 4)]
    if (newTier !== tier) {
      tier = newTier
      if (tier === 'A') { roi = '+1~+3%'; color = '#60a5fa'; bg = 'rgba(96,165,250,0.12)'; label = '밸류' }
      if (tier === 'B') { roi = '±1%'; color = '#fbbf24'; bg = 'rgba(251,191,36,0.12)'; label = '중립' }
      if (tier === 'C') { roi = '-2~-4%'; color = '#fb923c'; bg = 'rgba(251,146,60,0.12)'; label = '약손실' }
      if (tier === 'D') { roi = '-4% 이하'; color = '#f87171'; bg = 'rgba(248,113,113,0.12)'; label = '손실' }
      reason += ` (마진 ${margin.toFixed(1)}% 높아 한 단계 하락)`
    }
  }

  return { pick, tier, roi, color, bg, label, reason }
}

const TIER_COLOR: Record<string, string> = {
  S: '#4ade80', A: '#60a5fa', B: '#fbbf24', C: '#fb923c', D: '#f87171'
}
const TIER_BG: Record<string, string> = {
  S: 'rgba(74,222,128,0.12)', A: 'rgba(96,165,250,0.12)', B: 'rgba(251,191,36,0.12)', C: 'rgba(251,146,60,0.12)', D: 'rgba(248,113,113,0.12)'
}

const s: Record<string, React.CSSProperties> = {
  wrap: { padding: '16px 12px', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.6px', marginBottom: 6, display: 'block' },
  input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 700, textAlign: 'center' as const, padding: '8px 10px', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  select: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, padding: '7px 10px', width: '100%', boxSizing: 'border-box' as const, outline: 'none', cursor: 'pointer' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  sectionTitle: { fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', marginBottom: 10 },
  marginBadge: (m: number) => ({
    display: 'inline-block', fontSize: 13, fontWeight: 700,
    color: m > 7 ? '#f87171' : m > 5 ? '#fbbf24' : '#4ade80',
    background: m > 7 ? 'rgba(248,113,113,0.1)' : m > 5 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)',
    border: `1px solid ${m > 7 ? '#f87171' : m > 5 ? '#fbbf24' : '#4ade80'}`,
    borderRadius: 6, padding: '2px 10px',
  }),
}

type Mode = 'baseball_ml' | 'baseball_ou' | 'basketball'
type League = 'MLB' | 'KBO' | 'NPB' | 'NBA' | 'WNBA'

export default function Simul() {
  const [mode, setMode] = useState<Mode>('baseball_ml')
  const [league, setLeague] = useState<League>('MLB')

  // 야구 ML
  const [homeOdds, setHomeOdds] = useState('')
  const [awayOdds, setAwayOdds] = useState('')

  // 야구 언오버
  const [ouLine, setOuLine] = useState('')
  const [overOdds, setOverOdds] = useState('')
  const [underOdds, setUnderOdds] = useState('')

  // 농구 핸디캡
  const [homeHandicap, setHomeHandicap] = useState<'마핸' | '플핸'>('마핸')
  const [handicapLine, setHandicapLine] = useState('')
  const [bktHomeOdds, setBktHomeOdds] = useState('')
  const [bktAwayOdds, setBktAwayOdds] = useState('')

  const BASEBALL_LEAGUES: League[] = ['MLB', 'KBO', 'NPB']
  const BASKETBALL_LEAGUES: League[] = ['NBA', 'WNBA']

  function handleModeChange(m: Mode) {
    setMode(m)
    if (m === 'basketball') setLeague('NBA')
    else setLeague('MLB')
  }

  // ─── 야구 ML 계산 ─────────────────────────────────────────────
  const ho = parseFloat(homeOdds), ao = parseFloat(awayOdds)
  const mlValid = !isNaN(ho) && !isNaN(ao) && ho > 1 && ao > 1
  const mlMargin = mlValid ? ((1 / ho + 1 / ao - 1) * 100) : 0
  const homeTier = mlValid ? getBaseballTier(ho, true) : null
  const awayTier = mlValid ? getBaseballTier(ao, false) : null
  const tierOrder = ['S', 'A', 'B', 'C', 'D']
  const mlPick = mlValid && homeTier && awayTier
    ? tierOrder.indexOf(homeTier.tier) < tierOrder.indexOf(awayTier.tier) ? 'home'
      : tierOrder.indexOf(homeTier.tier) > tierOrder.indexOf(awayTier.tier) ? 'away'
      : ho >= ao ? 'home' : 'away'
    : null

  // ─── 야구 언오버 계산 ─────────────────────────────────────────
  const line = parseFloat(ouLine), ov = parseFloat(overOdds), un = parseFloat(underOdds)
  const ouValid = !isNaN(line) && !isNaN(ov) && !isNaN(un) && line > 0 && ov > 1 && un > 1
  const ouMargin = ouValid ? ((1 / ov + 1 / un - 1) * 100) : 0
  const ouResult = ouValid ? getBaseballOUTier(line, ov, un) : null

  // ─── 농구 핸디캡 계산 ─────────────────────────────────────────
  const hl = parseFloat(handicapLine), bho = parseFloat(bktHomeOdds), bao = parseFloat(bktAwayOdds)
  const bktValid = !isNaN(hl) && !isNaN(bho) && !isNaN(bao) && hl > 0 && bho > 1 && bao > 1
  const bktMargin = bktValid ? ((1 / bho + 1 / bao - 1) * 100) : 0
  const bktResult = bktValid ? getBasketballTier(hl, homeHandicap === '마핸', bho, bao, bktMargin) : null

  function TierBadge({ tier }: { tier: string }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, fontWeight: 700, fontSize: 16, background: TIER_BG[tier], color: TIER_COLOR[tier], border: `1px solid ${TIER_COLOR[tier]}` }}>{tier}</span>
    )
  }

  return (
    <div style={s.wrap}>
      {/* 모드 선택 */}
      <div style={s.card}>
        <div style={s.sectionTitle}>종목 선택</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            { id: 'baseball_ml', label: '⚾ 야구 승패' },
            { id: 'baseball_ou', label: '⚾ 야구 언오버' },
            { id: 'basketball', label: '🏀 농구 핸디캡' },
          ] as { id: Mode; label: string }[]).map(m => (
            <button key={m.id} onClick={() => handleModeChange(m.id)} style={{
              padding: '7px 14px', borderRadius: 8, border: `1px solid ${mode === m.id ? 'var(--cyan-border)' : 'var(--border)'}`,
              background: mode === m.id ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
              color: mode === m.id ? 'var(--cyan)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>{m.label}</button>
          ))}
        </div>
      </div>

      {/* ─── 야구 승패 ─── */}
      {mode === 'baseball_ml' && (
        <>
          <div style={s.card}>
            <div style={s.sectionTitle}>리그 / 배당 입력</div>
            <div style={{ marginBottom: 10 }}>
              <span style={s.label}>리그</span>
              <select style={s.select} value={league} onChange={e => setLeague(e.target.value as League)}>
                {BASEBALL_LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={s.row2}>
              <div>
                <span style={s.label}>홈 배당</span>
                <input style={s.input} type="number" step="0.01" placeholder="예: 2.45" value={homeOdds} onChange={e => setHomeOdds(e.target.value)} />
              </div>
              <div>
                <span style={s.label}>원정 배당</span>
                <input style={s.input} type="number" step="0.01" placeholder="예: 1.72" value={awayOdds} onChange={e => setAwayOdds(e.target.value)} />
              </div>
            </div>
          </div>

          {mlValid && homeTier && awayTier && (
            <div style={s.card}>
              <div style={s.sectionTitle}>분석 결과</div>
              <div style={s.row2}>
                {[
                  { label: '홈', odds: ho, tier: homeTier, side: 'home' },
                  { label: '원정', odds: ao, tier: awayTier, side: 'away' },
                ].map(({ label, odds, tier, side }) => (
                  <div key={side} style={{ background: mlPick === side ? tier.bg : 'var(--bg-elevated)', border: `${mlPick === side ? 2 : 1}px solid ${mlPick === side ? tier.color : 'var(--border)'}`, borderRadius: 10, padding: '12px', position: 'relative' }}>
                    {mlPick === side && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: tier.color, color: '#000', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>✓ 선택</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{label} {odds.toFixed(2)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <TierBadge tier={tier.tier} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: tier.color }}>{tier.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ROI {tier.roi}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>내포확률 {(1 / odds * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>북메이커 마진</span>
                <span style={s.marginBadge(mlMargin)}>{mlMargin.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── 야구 언오버 ─── */}
      {mode === 'baseball_ou' && (
        <>
          <div style={s.card}>
            <div style={s.sectionTitle}>리그 / 기준점 / 배당 입력</div>
            <div style={{ marginBottom: 10 }}>
              <span style={s.label}>리그</span>
              <select style={s.select} value={league} onChange={e => setLeague(e.target.value as League)}>
                {BASEBALL_LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={s.label}>기준점 (총점 라인)</span>
              <input style={s.input} type="number" step="0.5" placeholder="예: 9.5" value={ouLine} onChange={e => setOuLine(e.target.value)} />
            </div>
            <div style={s.row2}>
              <div>
                <span style={s.label}>오버 배당</span>
                <input style={s.input} type="number" step="0.01" placeholder="예: 1.95" value={overOdds} onChange={e => setOverOdds(e.target.value)} />
              </div>
              <div>
                <span style={s.label}>언더 배당</span>
                <input style={s.input} type="number" step="0.01" placeholder="예: 1.88" value={underOdds} onChange={e => setUnderOdds(e.target.value)} />
              </div>
            </div>
          </div>

          {ouValid && ouResult && (
            <div style={s.card}>
              <div style={s.sectionTitle}>분석 결과</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <TierBadge tier={ouResult.tier} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: ouResult.color }}>
                    {ouResult.pick === 'over' ? '오버' : '언더'} {ouResult.pick === 'over' ? ov.toFixed(2) : un.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ouResult.label} · ROI {ouResult.roi}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                {ouResult.reason}
              </div>
              <div style={s.row2}>
                {[
                  { label: '오버', odds: ov },
                  { label: '언더', odds: un },
                ].map(({ label, odds }) => (
                  <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label} {odds.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>내포확률 {(1 / odds * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>북메이커 마진</span>
                <span style={s.marginBadge(ouMargin)}>{ouMargin.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── 농구 핸디캡 ─── */}
      {mode === 'basketball' && (
        <>
          <div style={s.card}>
            <div style={s.sectionTitle}>리그 / 핸디캡 입력</div>
            <div style={{ marginBottom: 10 }}>
              <span style={s.label}>리그</span>
              <select style={s.select} value={league} onChange={e => setLeague(e.target.value as League)}>
                {BASKETBALL_LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={s.label}>홈팀 핸디캡 유형</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['마핸', '플핸'] as const).map(h => (
                  <button key={h} onClick={() => setHomeHandicap(h)} style={{
                    flex: 1, padding: '8px', borderRadius: 8,
                    border: `1px solid ${homeHandicap === h ? 'var(--cyan-border)' : 'var(--border)'}`,
                    background: homeHandicap === h ? 'var(--cyan-bg)' : 'var(--bg-elevated)',
                    color: homeHandicap === h ? 'var(--cyan)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}>{h === '마핸' ? '홈 마핸 (-)' : '홈 플핸 (+)'}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                원정은 자동으로 {homeHandicap === '마핸' ? '플핸 (+)' : '마핸 (-)'}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={s.label}>핸디캡 기준점 (절대값)</span>
              <input style={s.input} type="number" step="0.5" placeholder="예: 7.5" value={handicapLine} onChange={e => setHandicapLine(e.target.value)} />
            </div>
            <div style={s.row2}>
              <div>
                <span style={s.label}>홈 배당 ({homeHandicap})</span>
                <input style={s.input} type="number" step="0.01" placeholder="예: 1.87" value={bktHomeOdds} onChange={e => setBktHomeOdds(e.target.value)} />
              </div>
              <div>
                <span style={s.label}>원정 배당 ({homeHandicap === '마핸' ? '플핸' : '마핸'})</span>
                <input style={s.input} type="number" step="0.01" placeholder="예: 1.95" value={bktAwayOdds} onChange={e => setBktAwayOdds(e.target.value)} />
              </div>
            </div>
          </div>

          {bktValid && bktResult && (
            <div style={s.card}>
              <div style={s.sectionTitle}>분석 결과</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <TierBadge tier={bktResult.tier} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: bktResult.color }}>
                    {bktResult.pick === 'home'
                      ? `홈 ${homeHandicap} ${homeHandicap === '마핸' ? '-' : '+'}${hl.toFixed(1)} / ${bho.toFixed(2)}`
                      : `원정 ${homeHandicap === '마핸' ? '플핸' : '마핸'} ${homeHandicap === '마핸' ? '+' : '-'}${hl.toFixed(1)} / ${bao.toFixed(2)}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{bktResult.label} · ROI {bktResult.roi}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                {bktResult.reason}
              </div>
              <div style={s.row2}>
                {[
                  { label: `홈 ${homeHandicap}`, odds: bho },
                  { label: `원정 ${homeHandicap === '마핸' ? '플핸' : '마핸'}`, odds: bao },
                ].map(({ label, odds }) => (
                  <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label} {odds.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>내포확률 {(1 / odds * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>북메이커 마진</span>
                <span style={s.marginBadge(bktMargin)}>{bktMargin.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* 티어 기준 설명 */}
      <div style={s.card}>
        <div style={s.sectionTitle}>티어 기준</div>
        {[
          { tier: 'S', desc: '최고 밸류 구간 · ROI +3~+5%' },
          { tier: 'A', desc: '밸류 구간 · ROI +1~+3%' },
          { tier: 'B', desc: '중립 구간 · ROI ±1%' },
          { tier: 'C', desc: '약손실 구간 · ROI -2~-4%' },
          { tier: 'D', desc: '손실 구간 · ROI -4% 이하' },
        ].map(({ tier, desc }) => (
          <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <TierBadge tier={tier} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

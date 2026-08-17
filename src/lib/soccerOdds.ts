// ─── 축구 배당 → 확률 분석 (분석 탭 · 축구 서브메뉴) ─────────────────────
// 승무패(1X2) / 2.5 오버언더 / 0.5·1.5 핸디캡 배당을 입력하면, 배당에 내재된
// 마진(북메이커 수수료)을 제거한 "노비그(no-vig) 확률"을 마켓별로 계산하고,
// 사용자가 실제로 베팅하는 3가지 유형(일반승 / 0.5 핸디캡 / 1.5 핸디캡) × (홈/원정)
// 총 6가지 후보 중 확률이 가장 높은 픽을 추천한다.
//
// 핵심 아이디어: 배당(odds)의 역수 = 시장이 매긴 "암시 확률(implied probability)".
// 여러 결과의 암시확률 합은 항상 1을 넘는데(마진 때문에), 그 초과분을 비례배분으로
// 제거하면 마진이 없는 순수 확률 추정치가 나온다. 이렇게 구한 확률들은 서로 다른
// 마켓(1X2 vs 핸디캡)이라도 "실제로 같은 사건"을 가리키는 경우가 있어서(예: 홈 일반승과
// 홈 -0.5 핸디캡은 둘 다 "홈팀이 그냥 이기면 적중" 이라는 동일 조건) 서로 비교/검증도 가능하다.

export interface OddsPair { home: number; away: number }
export interface Odds1X2 { home: number; draw: number; away: number }
export interface OddsOU { over: number; under: number }

export interface SoccerAnalysisInput {
  odds1x2?: Partial<Odds1X2>
  oddsOU25?: Partial<OddsOU>
  oddsAH05?: Partial<OddsPair>   // 홈 -0.5 / 원정 +0.5
  oddsAH15?: Partial<OddsPair>   // 홈 -1.5 / 원정 +1.5
  homeLabel?: string
  awayLabel?: string
}

export type PickKey = 'ml_home' | 'ml_away' | 'ah05_home' | 'ah05_away' | 'ah15_home' | 'ah15_away'

export interface SoccerCandidate {
  key: PickKey
  marketLabel: string   // '일반승' | '0.5 핸디캡' | '1.5 핸디캡'
  side: 'home' | 'away'
  sideLabel: string      // 팀 이름 or '홈'/'원정'
  odds: number
  rawProb: number         // 마진 제거 전 (1/odds)
  noVigProb: number       // 마진 제거 후 확률 (0~1)
}

export interface MarginInfo { marketLabel: string; pct: number }

export interface ConsistencyCheck {
  mlProb: number
  ahProb: number
  diffPct: number
  note: string
}

export interface SoccerAnalysisResult {
  candidates: SoccerCandidate[]                 // 입력된 마켓만, noVigProb 내림차순 정렬
  best: SoccerCandidate | null
  drawProb: number | null                       // 참고용 — 무 확률(노비그)
  ou25: { overProb: number; underProb: number; lean: 'over' | 'under' | 'even' } | null
  margins: MarginInfo[]
  consistency05: ConsistencyCheck | null         // 일반승-홈 vs 0.5핸디-홈 (같은 사건) 괴리 체크
}

function isValidOdds(v: number | undefined | null): v is number {
  return typeof v === 'number' && isFinite(v) && v > 1.0
}
function implied(odds: number): number { return 1 / odds }

function devig2(a: number, b: number): [number, number] {
  const pa = implied(a), pb = implied(b)
  const sum = pa + pb
  return sum > 0 ? [pa / sum, pb / sum] : [0, 0]
}
function devig3(a: number, b: number, c: number): [number, number, number] {
  const pa = implied(a), pb = implied(b), pc = implied(c)
  const sum = pa + pb + pc
  return sum > 0 ? [pa / sum, pb / sum, pc / sum] : [0, 0, 0]
}
function marginPct(...odds: number[]): number {
  return (odds.reduce((s, o) => s + implied(o), 0) - 1) * 100
}

export function analyzeSoccerOdds(input: SoccerAnalysisInput): SoccerAnalysisResult {
  const homeLabel = input.homeLabel?.trim() || '홈'
  const awayLabel = input.awayLabel?.trim() || '원정'
  const candidates: SoccerCandidate[] = []
  const margins: MarginInfo[] = []
  let drawProb: number | null = null
  let mlHomeProb: number | null = null
  let ah05HomeProb: number | null = null

  // ── 1X2 (승무패) ──
  const o1x2 = input.odds1x2
  if (o1x2 && isValidOdds(o1x2.home) && isValidOdds(o1x2.draw) && isValidOdds(o1x2.away)) {
    const [pHome, pDraw, pAway] = devig3(o1x2.home, o1x2.draw, o1x2.away)
    drawProb = pDraw
    mlHomeProb = pHome
    candidates.push({ key: 'ml_home', marketLabel: '일반승', side: 'home', sideLabel: homeLabel, odds: o1x2.home, rawProb: implied(o1x2.home), noVigProb: pHome })
    candidates.push({ key: 'ml_away', marketLabel: '일반승', side: 'away', sideLabel: awayLabel, odds: o1x2.away, rawProb: implied(o1x2.away), noVigProb: pAway })
    margins.push({ marketLabel: '승무패', pct: marginPct(o1x2.home, o1x2.draw, o1x2.away) })
  }

  // ── 2.5 오버/언더 (참고용 — 직접 베팅 후보는 아니지만 득점 성향 참고) ──
  let ou25: SoccerAnalysisResult['ou25'] = null
  const oOU = input.oddsOU25
  if (oOU && isValidOdds(oOU.over) && isValidOdds(oOU.under)) {
    const [pOver, pUnder] = devig2(oOU.over, oOU.under)
    const lean = pOver >= 0.53 ? 'over' : pUnder >= 0.53 ? 'under' : 'even'
    ou25 = { overProb: pOver, underProb: pUnder, lean }
    margins.push({ marketLabel: '2.5 오버언더', pct: marginPct(oOU.over, oOU.under) })
  }

  // ── 0.5 핸디캡 ──
  const oAH05 = input.oddsAH05
  if (oAH05 && isValidOdds(oAH05.home) && isValidOdds(oAH05.away)) {
    const [pHome, pAway] = devig2(oAH05.home, oAH05.away)
    ah05HomeProb = pHome
    candidates.push({ key: 'ah05_home', marketLabel: '0.5 핸디캡', side: 'home', sideLabel: homeLabel, odds: oAH05.home, rawProb: implied(oAH05.home), noVigProb: pHome })
    candidates.push({ key: 'ah05_away', marketLabel: '0.5 핸디캡', side: 'away', sideLabel: awayLabel, odds: oAH05.away, rawProb: implied(oAH05.away), noVigProb: pAway })
    margins.push({ marketLabel: '0.5 핸디캡', pct: marginPct(oAH05.home, oAH05.away) })
  }

  // ── 1.5 핸디캡 ──
  const oAH15 = input.oddsAH15
  if (oAH15 && isValidOdds(oAH15.home) && isValidOdds(oAH15.away)) {
    const [pHome, pAway] = devig2(oAH15.home, oAH15.away)
    candidates.push({ key: 'ah15_home', marketLabel: '1.5 핸디캡', side: 'home', sideLabel: homeLabel, odds: oAH15.home, rawProb: implied(oAH15.home), noVigProb: pHome })
    candidates.push({ key: 'ah15_away', marketLabel: '1.5 핸디캡', side: 'away', sideLabel: awayLabel, odds: oAH15.away, rawProb: implied(oAH15.away), noVigProb: pAway })
    margins.push({ marketLabel: '1.5 핸디캡', pct: marginPct(oAH15.home, oAH15.away) })
  }

  candidates.sort((a, b) => b.noVigProb - a.noVigProb)

  let consistency05: ConsistencyCheck | null = null
  if (mlHomeProb !== null && ah05HomeProb !== null) {
    const diffPct = Math.abs(mlHomeProb - ah05HomeProb) * 100
    consistency05 = {
      mlProb: mlHomeProb, ahProb: ah05HomeProb, diffPct,
      note: diffPct >= 4
        ? '두 마켓의 홈 승리 확률 추정치 차이가 큽니다 — 배당 입력을 다시 확인하거나, 마켓 간 가격 차이(가치 베팅) 가능성을 살펴보세요.'
        : '일반승-홈과 0.5핸디-홈은 원래 같은 조건(홈팀이 이기면 적중)이라 확률이 비슷하게 나오는 것이 정상입니다.',
    }
  }

  return {
    candidates,
    best: candidates[0] ?? null,
    drawProb,
    ou25,
    margins,
    consistency05,
  }
}

export const PICK_LABELS: Record<PickKey, string> = {
  ml_home: '일반승 · 홈', ml_away: '일반승 · 원정',
  ah05_home: '0.5 핸디캡 · 홈', ah05_away: '0.5 핸디캡 · 원정',
  ah15_home: '1.5 핸디캡 · 홈', ah15_away: '1.5 핸디캡 · 원정',
}

// ─── 결과 채점 ───────────────────────────────────────────────────
// 실제 스코어(홈/원정 득점)가 입력되면, 저장해둔 추천픽이 적중했는지 채점한다.
// 0.5 / 1.5 핸디캡은 반 골 라인이라 무승부(적중/비적중 외 "적특") 없이 항상 승/패로 갈린다.
export function evaluateSoccerPick(key: PickKey, homeScore: number, awayScore: number): 'win' | 'loss' {
  const diff = homeScore - awayScore
  switch (key) {
    case 'ml_home':   return diff > 0 ? 'win' : 'loss'
    case 'ml_away':   return diff < 0 ? 'win' : 'loss'
    case 'ah05_home': return diff > 0 ? 'win' : 'loss'          // 홈이 그냥 이기면 적중
    case 'ah05_away': return diff <= 0 ? 'win' : 'loss'          // 원정이 비기거나 이기면 적중
    case 'ah15_home': return diff >= 2 ? 'win' : 'loss'          // 홈이 2골차 이상 이기면 적중
    case 'ah15_away': return diff <= 1 ? 'win' : 'loss'          // 홈이 1골차 이하로 이기거나 비기거나 원정이 이기면 적중
  }
}

export function outcomeFromScore(homeScore: number, awayScore: number): 'home_win' | 'draw' | 'away_win' {
  if (homeScore > awayScore) return 'home_win'
  if (homeScore < awayScore) return 'away_win'
  return 'draw'
}

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
  noVigProb: number       // 마진 제거 후 시장 확률 (0~1) — 배당만 보고 계산한 값
  finalProb: number       // 실제로 추천/정렬에 쓰이는 최종 확률. 보정 데이터가 없으면 noVigProb와 동일
  calibration: PickCalibration | null   // 이 픽 유형의 축적된 실측 성적 (있으면)
}

// ─── 실측 기반 보정 ───────────────────────────────────────────────
// 저장된 기록에 결과(스코어)가 쌓이면, 같은 픽 유형(예: "0.5핸디-원정")이
// 실제로 시장 확률보다 더 자주/덜 자주 맞았는지 계산해서 다음 추천 확률에
// 조금씩 반영한다. 표본이 적을 때는 거의 반영하지 않고(shrink가 0에 가까움),
// 기록이 쌓일수록(shrink가 1에 가까워짐) 실측치 쪽으로 더 끌려간다 —
// 그래서 "몇 건 안 되는 우연"에 확률이 요동치지 않는다.
const PRIOR_STRENGTH = 12 // 이 정도 표본이 쌓여야 실측치 영향력이 절반(shrink=0.5)이 됨

export interface PickCalibration {
  n: number            // 이 픽 유형의 결과 입력된 기록 수
  avgPredicted: number  // 그 기록들 당시 시장(노비그) 확률의 평균
  hitRate: number        // 실제 적중 비율
  shrink: number          // 0~1, 표본이 많을수록 1에 가까움
}
export type CalibrationMap = Partial<Record<PickKey, PickCalibration>>

export interface HistoricalOddsRecord {
  odds_home: number | null; odds_draw: number | null; odds_away: number | null
  odds_ah05_home: number | null; odds_ah05_away: number | null
  odds_ah15_home: number | null; odds_ah15_away: number | null
  result_home_score: number | null; result_away_score: number | null
}

// 저장된 기록들(결과 입력된 것만)을 훑어서 픽 유형별 실측 성적표를 만든다.
// 한 경기에 승무패/0.5핸디/1.5핸디 배당이 모두 있었다면 최대 6개 픽 유형 각각에
// (그 경기 당시 시장확률, 적중 여부) 한 쌍씩 기여한다 — 저장된 추천픽 하나만이 아니라
// 입력해둔 배당 전체를 다 활용하는 것이라 같은 기록 수로도 더 빨리 쌓인다.
export function buildCalibration(logs: HistoricalOddsRecord[]): CalibrationMap {
  const acc: Partial<Record<PickKey, { sum: number; hits: number; n: number }>> = {}
  for (const log of logs) {
    if (log.result_home_score == null || log.result_away_score == null) continue
    const { candidates } = analyzeSoccerOdds({
      odds1x2: { home: log.odds_home ?? undefined, draw: log.odds_draw ?? undefined, away: log.odds_away ?? undefined },
      oddsAH05: { home: log.odds_ah05_home ?? undefined, away: log.odds_ah05_away ?? undefined },
      oddsAH15: { home: log.odds_ah15_home ?? undefined, away: log.odds_ah15_away ?? undefined },
    })
    for (const c of candidates) {
      const bucket = acc[c.key] ?? (acc[c.key] = { sum: 0, hits: 0, n: 0 })
      bucket.sum += c.noVigProb
      bucket.n += 1
      if (evaluateSoccerPick(c.key, log.result_home_score, log.result_away_score) === 'win') bucket.hits += 1
    }
  }
  const out: CalibrationMap = {}
  for (const key of Object.keys(acc) as PickKey[]) {
    const b = acc[key]!
    out[key] = { n: b.n, avgPredicted: b.sum / b.n, hitRate: b.hits / b.n, shrink: b.n / (b.n + PRIOR_STRENGTH) }
  }
  return out
}

function clamp01(n: number): number { return Math.min(0.99, Math.max(0.01, n)) }

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

export function analyzeSoccerOdds(input: SoccerAnalysisInput, calibration?: CalibrationMap): SoccerAnalysisResult {
  const homeLabel = input.homeLabel?.trim() || '홈'
  const awayLabel = input.awayLabel?.trim() || '원정'
  const candidates: SoccerCandidate[] = []
  const margins: MarginInfo[] = []
  let drawProb: number | null = null
  let mlHomeProb: number | null = null
  let ah05HomeProb: number | null = null

  // 시장 확률(noVigProb)에 실측 보정(있으면)을 얹어 finalProb을 만드는 공용 헬퍼.
  // finalProb = noVigProb + shrink * (실측 적중률 - 그 표본들 당시 평균 예측확률)
  // 표본이 적으면 shrink가 0에 가까워서 사실상 시장확률 그대로 쓰인다.
  function push(key: PickKey, marketLabel: string, side: 'home' | 'away', sideLabel: string, odds: number, noVigProb: number) {
    const cal = calibration?.[key] ?? null
    const finalProb = cal ? clamp01(noVigProb + cal.shrink * (cal.hitRate - cal.avgPredicted)) : noVigProb
    candidates.push({ key, marketLabel, side, sideLabel, odds, rawProb: implied(odds), noVigProb, finalProb, calibration: cal })
  }

  // ── 1X2 (승무패) ──
  const o1x2 = input.odds1x2
  if (o1x2 && isValidOdds(o1x2.home) && isValidOdds(o1x2.draw) && isValidOdds(o1x2.away)) {
    const [pHome, pDraw, pAway] = devig3(o1x2.home, o1x2.draw, o1x2.away)
    drawProb = pDraw
    mlHomeProb = pHome
    push('ml_home', '일반승', 'home', homeLabel, o1x2.home, pHome)
    push('ml_away', '일반승', 'away', awayLabel, o1x2.away, pAway)
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
    push('ah05_home', '0.5 핸디캡', 'home', homeLabel, oAH05.home, pHome)
    push('ah05_away', '0.5 핸디캡', 'away', awayLabel, oAH05.away, pAway)
    margins.push({ marketLabel: '0.5 핸디캡', pct: marginPct(oAH05.home, oAH05.away) })
  }

  // ── 1.5 핸디캡 ──
  const oAH15 = input.oddsAH15
  if (oAH15 && isValidOdds(oAH15.home) && isValidOdds(oAH15.away)) {
    const [pHome, pAway] = devig2(oAH15.home, oAH15.away)
    push('ah15_home', '1.5 핸디캡', 'home', homeLabel, oAH15.home, pHome)
    push('ah15_away', '1.5 핸디캡', 'away', awayLabel, oAH15.away, pAway)
    margins.push({ marketLabel: '1.5 핸디캡', pct: marginPct(oAH15.home, oAH15.away) })
  }

  // 실측 보정이 반영된 finalProb 기준으로 정렬 — 보정 데이터가 없으면 noVigProb와 같으므로
  // 기존 동작(시장확률 순)과 동일하게 작동한다.
  candidates.sort((a, b) => b.finalProb - a.finalProb)

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

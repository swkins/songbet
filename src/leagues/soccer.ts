import { createJudge, overRuleMin, over35RuleMin, type Game, type JudgeOptions, type Odds } from '../lib/soccerJudge';

// 축구 리그 판단기 — 그 리그 과거 경기로만 판정하고, 2.5·3.5 오버 룰 기준 배당도 그 리그 데이터로 정한다.
// sampleN(비교 경기 수)은 리그별로 시즌 하나씩 빼고 검증해서 정한다 (국내 리그 200, 챔스 80)
// over35Draw: 3.5 오버 룰 무배당 하한 (기본 7.5 — 분데스리가는 5.5부터 꾸준해서 5.5)
export function leagueJudge(games: Game[], base: Partial<JudgeOptions> = {}, { over35Draw = 7.5 }: { over35Draw?: number } = {}) {
  const judge = createJudge(games, base);
  const overMin = overRuleMin(games);
  const over35Min = over35RuleMin(games, over35Draw);
  return (odds: Odds) => judge(odds, { overMin, over35Draw, over35Min });
}

import { createJudge, overRuleMin, type Game, type Odds } from '../lib/soccerJudge';
import { EPL_GAMES } from '../data/eplGames';
import { LALIGA_GAMES } from '../data/laligaGames';
import { BUNDESLIGA_GAMES } from '../data/bundesligaGames';
import { UCL_GAMES } from '../data/uclGames';

// 축구 3개 리그 합친 판단기 — 비교 경기는 3개 리그를 섞어서 세 배당이 가장 비슷한 경기로 고른다 (soccerJudge.ts 설명 참고)
export const SOCCER_GAMES = [...EPL_GAMES, ...LALIGA_GAMES, ...BUNDESLIGA_GAMES];
export const judgeSoccer = createJudge(SOCCER_GAMES);

// 리그 판단기 = 합친 판단기 + 그 리그 2.5 오버 룰 기준 배당 (리그마다 강정배 2.5 오버 적중률 차이가 커서 기준만 리그별)
export function leagueJudge(games: Game[]) {
  const overMin = overRuleMin(games);
  return (odds: Odds) => judgeSoccer(odds, { overMin });
}

// 챔피언스리그 — 국내 3개 리그 + 챔스를 섞어서 비교 경기를 고르되 챔스 경기를 더 가깝게 친다 (soccerJudge.ts PREFER_FACTOR)
const judgeUclPool = createJudge([...SOCCER_GAMES, ...UCL_GAMES], {}, UCL_GAMES);
const uclOverMin = overRuleMin(UCL_GAMES);
export const judgeUcl = (odds: Odds) => judgeUclPool(odds, { overMin: uclOverMin });

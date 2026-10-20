import { createJudge } from '../lib/soccerJudge';
import { EPL_GAMES } from '../data/eplGames';
import { LALIGA_GAMES } from '../data/laligaGames';
import { BUNDESLIGA_GAMES } from '../data/bundesligaGames';

// 축구 3개 리그 합친 판단기 — 비교 경기는 3개 리그를 섞어서 세 배당이 가장 비슷한 경기로 고른다 (soccerJudge.ts 설명 참고)
export const SOCCER_GAMES = [...EPL_GAMES, ...LALIGA_GAMES, ...BUNDESLIGA_GAMES];
export const judgeSoccer = createJudge(SOCCER_GAMES);

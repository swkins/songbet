import { createJudge } from '../lib/volleyJudge';
import { TRMEN_GAMES } from '../data/trMenGames';

// 터키 남자 판단기. 사용: judgeTrMen({ home, away, m15, o35, u45, p25 })
export const judgeTrMen = createJudge(TRMEN_GAMES, { minMarketN: 172, minSideN: 134 });

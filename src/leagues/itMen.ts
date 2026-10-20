import { createJudge } from '../lib/volleyJudge';
import { ITMEN_GAMES } from '../data/itMenGames';

// 이탈리아 남자 판단기. 사용: judgeItMen({ home, away, m15, o35, u45, p25 })
export const judgeItMen = createJudge(ITMEN_GAMES, { minMarketN: 137, minSideN: 107 });

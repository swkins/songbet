import { createJudge } from '../lib/volleyJudge';
import { TRWOMEN_GAMES } from '../data/trWomenGames';

// 터키 여자 판단기. 사용: judgeTrWomen({ home, away, m15, o35, u45, p25 })
export const judgeTrWomen = createJudge(TRWOMEN_GAMES, { minMarketN: 182, minSideN: 142 });

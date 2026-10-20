import { createJudge } from '../lib/volleyJudge';
import { ITWOMEN_GAMES } from '../data/itWomenGames';

// 이탈리아 여자 판단기. 사용: judgeItWomen({ home, away, m15, o35, u45, p25 })
export const judgeItWomen = createJudge(ITWOMEN_GAMES, { minMarketN: 182, minSideN: 142 });

import { createJudge } from '../lib/volleyJudge';
import { PLWOMEN_GAMES } from '../data/plWomenGames';

// 폴란드 여자(TAURON Liga) 판단기. 사용: judgePlWomen({ home, away, m15, o35, u45, p25 })
export const judgePlWomen = createJudge(PLWOMEN_GAMES, { minMarketN: 103, minSideN: 100 });

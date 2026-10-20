import { createJudge } from '../lib/volleyJudge';
import { PLMEN_GAMES } from '../data/plMenGames';

// 폴란드 남자(PlusLiga) 판단기. 사용: judgePlMen({ home, away, m15, o35, u45, p25 })
export const judgePlMen = createJudge(PLMEN_GAMES, { minMarketN: 217, minSideN: 169 });

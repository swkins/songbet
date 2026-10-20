import { createJudge } from '../lib/volleyJudge';
import { KRMEN_GAMES } from '../data/krMenGames';

// 한국 남자 판단기. 사용: judgeKrMen({ home, away, m15, o35, u45, p25 })
export const judgeKrMen = createJudge(KRMEN_GAMES, { minMarketN: 126, minSideN: 100 });

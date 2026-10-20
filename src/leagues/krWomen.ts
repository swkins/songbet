import { createJudge } from '../lib/volleyJudge';
import { KRWOMEN_GAMES } from '../data/krWomenGames';

// 한국 여자 판단기. 사용: judgeKrWomen({ home, away, m15, o35, u45, p25 })
export const judgeKrWomen = createJudge(KRWOMEN_GAMES, { minMarketN: 123, minSideN: 100 });

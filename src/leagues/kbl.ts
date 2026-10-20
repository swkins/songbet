import { createJudge } from '../lib/basketJudge';
import { KBL_GAMES } from '../data/kblGames';

// KBL 2020-21~2025-26 판단기. 사용: judgeKbl({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당
export const judgeKbl = createJudge(KBL_GAMES);

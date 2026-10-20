import { createJudge } from '../lib/basketJudge';
import { CBA_GAMES } from '../data/cbaGames';

// CBA 2022-23~2025-26 판단기. 사용: judgeCba({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당
export const judgeCba = createJudge(CBA_GAMES);

import { createJudge } from '../lib/basketJudge';
import { EUROLEAGUE_GAMES } from '../data/euroleagueGames';

// 유로리그 2021-22~2025-26 판단기. 사용: judgeEuroleague({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
export const judgeEuroleague = createJudge(EUROLEAGUE_GAMES);

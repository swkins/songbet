import { createJudge } from '../lib/basketJudge';
import { BLEAGUE_GAMES } from '../data/bleagueGames';

// B.LEAGUE B1 2021-22~2025-26 판단기. 사용: judgeBleague({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
export const judgeBleague = createJudge(BLEAGUE_GAMES);

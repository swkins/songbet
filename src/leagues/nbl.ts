import { createJudge } from '../lib/basketJudge';
import { NBL_GAMES } from '../data/nblGames';

// 호주 NBL 2021-22~2025-26 판단기. 사용: judgeNbl({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
// 시즌당 140~165경기로 표본이 작아서(원정 정배 경기 255) 최소 표본 수를 낮춘다
export const judgeNbl = createJudge(NBL_GAMES, { minMarketN: 120 });

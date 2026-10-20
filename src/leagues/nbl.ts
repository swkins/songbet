import { createJudge } from '../lib/basketJudge';
import { NBL_GAMES } from '../data/nblGames';

// 호주 NBL 2021-22~2025-26 판단기. 사용: judgeNbl({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
// 시즌당 140~165경기로 표본이 작아서(원정 정배 경기 255) 최소 표본 수를 낮춘다
// 정배 1.45 미만은 마핸만, 1.45 이상은 플핸만 추천 — 2시즌 검증(이전 시즌으로만 기준점 계산):
// 1.45 미만 마핸 59%(홈정배)·69%(원정정배) / 플핸 52%·35%, 1.45 이상 플핸 61%·67% / 마핸 46%·44%
export const judgeNbl = createJudge(NBL_GAMES, { minMarketN: 120, hcapZone: { home: { mhBelow: 1.45, phFrom: 1.45 }, away: { mhBelow: 1.45, phFrom: 1.45 } } });

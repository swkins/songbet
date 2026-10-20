import { createJudge } from '../lib/basketJudge';
import { KBL_GAMES } from '../data/kblGames';

// KBL 2021-22~2025-26 판단기. 사용: judgeKbl({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
// 승 추천 안 함 — 3시즌 백테스트에서 어떤 방식으로도 승 추천이 마이너스
// 핸디: 가이드 적중률 58%로 엄격하게 + 구역 — 2022-23·23-24로 고르고 24-25·25-26으로 확인
//  홈정배: 마핸은 정배 1.45 미만, 플핸은 1.30 이상 / 원정정배: 마핸은 1.60 미만, 플핸은 1.45 이상
//  (4시즌 가이드 적중: 홈정배 마핸 52.3→64.0% · 플핸 57.2→63.2%, 원정정배 마핸 56.2→63.5% · 플핸 53.2→58.8%)
export const judgeKbl = createJudge(KBL_GAMES, {
  winOff: true, guideP: 0.58,
  hcapZone: { home: { mhBelow: 1.45, phFrom: 1.3 }, away: { mhBelow: 1.6, phFrom: 1.45 } },
});

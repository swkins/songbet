import { createJudge } from '../lib/basketJudge';
import { NBA_GAMES } from '../data/nbaGames';

// NBA 2021-22~2025-26 판단기. 사용: judgeNba({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
// 승 추천 안 함 — 3시즌 백테스트에서 어떤 방식으로도 승 추천이 마이너스
// 핸디: 가이드 기준점을 적중률 58%로 엄격하게, 원정정배 마핸은 정배 1.70 미만에서만 — 2022-23·23-24로 고르고 24-25·25-26으로 확인
//  (4시즌 가이드 적중: 홈정배 마핸 54.9→61.6% · 플핸 52.9→57.8%, 원정정배 마핸 54.7→59.9% · 플핸 54.2→59.5%, 시즌마다 56~67%)
export const judgeNba = createJudge(NBA_GAMES, { winOff: true, guideP: 0.58, hcapZone: { away: { mhBelow: 1.7 } } });

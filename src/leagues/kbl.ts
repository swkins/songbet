import { createJudge } from '../lib/basketJudge';
import { KBL_GAMES } from '../data/kblGames';

// KBL 2021-22~2025-26 판단기. 사용: judgeKbl({ home, away, line, mh, ph })
// home/away = 승패 배당, line = 정배 기준점(양수), mh = 정배 -line 배당, ph = 역배 +line 배당 (화면에서는 홈/원정 핸디캡으로 받아 정배 쪽을 mh로 넘김)
// 승 추천 안 함 — 3시즌 백테스트에서 어떤 방식으로도 승 추천이 마이너스
// 홈정배 경기 마핸 추천 안 함 — KBL 홈 강정배는 크게 못 이겨서 2시즌 검증에서 홈정배 마핸 가이드 적중 51.3% (원정정배 마핸 58.6%, 플핸 56.1%)
export const judgeKbl = createJudge(KBL_GAMES, { winOff: true, mhOff: 'home' });

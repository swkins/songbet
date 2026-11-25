import { leagueJudge } from './soccer';
import { K1_GAMES } from '../data/k1Games';

// K리그1 판단기 — K리그1 과거 경기로만 판정. 사용: judgeK1({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 시즌당 198경기로 다른 리그보다 적다 — 비교 경기 200은 그대로 (홈정배/원정정배 따로라 한쪽이 거의 다 들어간다)
export const judgeK1 = leagueJudge(K1_GAMES);

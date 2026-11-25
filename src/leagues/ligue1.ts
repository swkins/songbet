import { leagueJudge } from './soccer';
import { LIGUE1_GAMES } from '../data/ligue1Games';

// 리그1 판단기 — 리그1 과거 경기로만 판정. 사용: judgeLigue1({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 플핸의 무·역배 비슷한 경기 확인은 참고만 — 3시즌 검증(공정+5% 배당 가정)에서 걸러진 플핸이 +10.1%(좋은 걸 걸러냄), 통과는 -2.8%
export const judgeLigue1 = leagueJudge(LIGUE1_GAMES, { plusGate: false });

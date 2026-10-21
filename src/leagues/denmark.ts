import { leagueJudge } from './soccer';
import { DENMARK_GAMES } from '../data/denmarkGames';

// 덴마크 수페르리가 판단기 — 덴마크 과거 경기로만 판정. 사용: judgeDenmark({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 정규 22라운드만이라 660경기로 작다 — 비교 경기 수는 시즌 하나씩 빼고 검증해서 200 그대로 (60·80·120·200 Brier 0.2003~0.2004로 거의 같고 200이 가장 좋음)
export const judgeDenmark = leagueJudge(DENMARK_GAMES);

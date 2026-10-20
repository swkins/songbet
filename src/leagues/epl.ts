import { leagueJudge } from './soccer';
import { EPL_GAMES } from '../data/eplGames';

// EPL 판단기. 사용: judgeEpl({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25, o35, u35 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 비교 경기는 3개 리그 합쳐서 고르고(리그별로 나누면 표본이 줄어 오히려 덜 맞았다), 2.5 오버 룰 기준 배당만 이 리그 데이터로 정한다
export const judgeEpl = leagueJudge(EPL_GAMES);

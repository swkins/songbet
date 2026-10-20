import { leagueJudge } from './soccer';
import { EPL_GAMES } from '../data/eplGames';

// EPL 판단기 — EPL 과거 경기로만 판정. 사용: judgeEpl({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25, o35, u35 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
export const judgeEpl = leagueJudge(EPL_GAMES);

import { leagueJudge } from './soccer';
import { UCL_GAMES } from '../data/uclGames';

// 챔피언스리그 판단기 — 챔피언스리그 과거 경기로만 판정. 사용: judgeUcl({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25, o35, u35 })
// 챔스는 576경기라 비교 경기를 80경기로 (시즌 하나씩 빼고 검증해 가장 잘 맞음)
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
export const judgeUcl = leagueJudge(UCL_GAMES, { sampleN: 80 });

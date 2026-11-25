import { leagueJudge } from './soccer';
import { SERIEA_GAMES } from '../data/serieaGames';

// 세리에A 판단기 — 세리에A 과거 경기로만 판정. 사용: judgeSeriea({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 플핸 무·역배 비슷한 경기 확인 사용 — 3시즌 검증에서 통과 +1.4% · 걸러짐 -0.3% (차이는 작음)
export const judgeSeriea = leagueJudge(SERIEA_GAMES);

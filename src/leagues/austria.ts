import { leagueJudge } from './soccer';
import { AUSTRIA_GAMES } from '../data/austriaGames';

// 오스트리아 분데스리가 판단기 — 오스트리아 과거 경기로만 판정. 사용: judgeAustria({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 정규 22라운드만이라 660경기로 작다 — 비교 경기 수를 시즌 하나씩 빼고 검증해 정함: 60 Brier 0.1992 · 80 0.1992 · 120 0.1996 · 200 0.1993 → 60
export const judgeAustria = leagueJudge(AUSTRIA_GAMES, { sampleN: 60 });

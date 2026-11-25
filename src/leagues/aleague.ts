import { leagueJudge } from './soccer';
import { ALEAGUE_GAMES } from '../data/aleagueGames';

// 호주 A리그 판단기 — A리그 과거 경기로만 판정. 사용: judgeAleague({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 796경기로 작아서 비교 경기 수를 시즌 하나씩 빼고 검증해 정함: 60 Brier 0.2119 · 80 0.2123 · 120 0.2125 · 200 0.2126 → 60
export const judgeAleague = leagueJudge(ALEAGUE_GAMES, { sampleN: 60 });

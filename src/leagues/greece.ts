import { leagueJudge } from './soccer';
import { GREECE_GAMES } from '../data/greeceGames';

// 그리스 슈퍼리그 판단기 — 그리스 과거 경기로만 판정. 사용: judgeGreece({ home, draw, away, h05, a05, h15, a15, h25, a25, o25, u25 })
// h·a = 홈/원정 핸디캡 배당 (승무패 배당이 낮은 쪽이 정배 → 정배는 -기준점 마핸, 역배는 +기준점 플핸)
// 907경기로 작아서 비교 경기 수를 시즌 하나씩 빼고 검증해 정함: 60 Brier 0.1792 · 80 0.1790 · 120 0.1789 · 200 0.1790 → 120
export const judgeGreece = leagueJudge(GREECE_GAMES, { sampleN: 120 });

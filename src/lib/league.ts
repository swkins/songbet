// ─── 리그 추론 공통 유틸 (야구 / 축구) ──────────────────────────────
// Stats.tsx(통계 페이지)와 Dashboard.tsx(베팅현황 페이지)에서 함께 사용한다.

export interface LeagueOverride { keyword: string; league: string }

// ─── 야구 ───────────────────────────────────────────────────────
// 대부분 팀 이름이 리그 간 겹치지 않아 자동 판별 가능. 유일한 예외는 "롯데"
// (KBO 롯데 자이언츠 / NPB 치바롯데마린즈 중복) — 다른 팀과 함께 언급되면 그 팀 기준으로 판별되고,
// "롯데" 단독으로만 나오면 KBO로 추정한다.
export type BaseballLeague = 'KBO' | 'MLB' | 'NPB'

export const KBO_TEAMS = ['KT','LG','NC','삼성','SSG','기아','두산','키움','한화']
export const MLB_TEAMS = [
  '애리조나','애틀랜타','볼티모어','보스턴','시카고 컵스','화이트삭스','신시내티','클리블랜드','콜로라도',
  '디트로이트','휴스턴','캔자스시티','LA에인절스','LA다저스','마이애미','밀워키','미네소타',
  '뉴욕M','뉴욕메츠','뉴욕Y','뉴욕양키스','오클랜드','필라델피아','피츠버그','샌디에이고','샌프란시스코',
  '시애틀','세인트루이스','탬파베이','텍사스','토론토','워싱턴',
]
export const NPB_TEAMS = ['요미우리','한신','주니치','요코하마','히로시마','야쿠르트','소프트뱅크','니혼햄','오릭스','세이부','라쿠텐']

export function inferBaseballLeague(matchText: string, overrides?: LeagueOverride[]): BaseballLeague | null {
  if (!matchText) return null
  if (overrides) {
    const hit = overrides.find(o => o.keyword && matchText.includes(o.keyword))
    if (hit) return hit.league as BaseballLeague
  }
  const found = new Set<BaseballLeague>()
  if (KBO_TEAMS.some(t => matchText.includes(t))) found.add('KBO')
  if (MLB_TEAMS.some(t => matchText.includes(t))) found.add('MLB')
  if (NPB_TEAMS.some(t => matchText.includes(t))) found.add('NPB')
  if (found.size === 1) return [...found][0]
  if (found.size > 1) return null // 팀 이름이 뒤섞여 있어 판별 불가 (거의 발생하지 않음)
  if (matchText.includes('롯데')) return 'KBO' // 단독 "롯데"는 KBO로 추정
  return null
}

// ─── 축구 ───────────────────────────────────────────────────────
// 축구는 리그/팀 수가 훨씬 많고 고정 목록으로 커버가 불가능하므로,
// 사용자가 직접 등록한 "팀 키워드 → 리그" 매핑(soccer_league_overrides)만으로 판별한다.
export function inferSoccerLeague(matchText: string, overrides?: LeagueOverride[]): string | null {
  if (!matchText || !overrides) return null
  const hit = overrides.find(o => o.keyword && matchText.includes(o.keyword))
  return hit ? hit.league : null
}

// 가나다(한글) 순 정렬 비교자
export function koCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ko')
}

// ─── 리그 자동완성 ───────────────────────────────────────────────
// 경기 내용(TeamContentInput)의 팀 이름 자동완성과 동일한 방식으로,
// 과거에 저장된 리그명들 중 한 글자만 입력해도 포함하는 것을 추천한다.
export interface LeagueCandidate { name: string; lastDate: string }

// 과거 베팅 전체에서 고유한 리그명 후보를 뽑아 최근 사용순으로 정렬
export function buildLeagueCandidates(bets: { league?: string | null; bet_date: string }[]): LeagueCandidate[] {
  const map = new Map<string, string>()
  for (const b of bets) {
    const name = (b.league ?? '').trim()
    if (!name) continue
    const prev = map.get(name)
    if (!prev || b.bet_date > prev) map.set(name, b.bet_date)
  }
  return Array.from(map.entries())
    .map(([name, lastDate]) => ({ name, lastDate }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

// 입력값을 포함하는 리그명 후보를 최대 limit개 반환 (자동완성 드롭다운용)
export function suggestLeagueCandidates(query: string, candidates: LeagueCandidate[], limit = 8): string[] {
  const q = query.trim()
  if (!q) return []
  const out: string[] = []
  for (const c of candidates) {
    if (c.name.includes(q)) out.push(c.name)
    if (out.length >= limit) break
  }
  return out
}

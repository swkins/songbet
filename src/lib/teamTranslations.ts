// ─── 팀 이름 한글 번역 저장/조회 ──────────────────────────────────
// 일정 API가 영문 팀명을 주는데, 한 번 한글로 고쳐두면 다음에 같은 영문 이름으로
// 경기가 또 나올 때 자동으로 한글로 보여준다. sport 단위로 저장(축구/야구/농구 각각 별도).

import { supabase } from './supabase'

export async function fetchTeamTranslations(sport: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('team_name_translations').select('original_name, translated_name').eq('sport', sport)
  const map: Record<string, string> = {}
  data?.forEach(r => { map[r.original_name] = r.translated_name })
  return map
}

export async function saveTeamTranslation(sport: string, original: string, translated: string) {
  await supabase.from('team_name_translations')
    .upsert({ sport, original_name: original, translated_name: translated, updated_at: new Date().toISOString() }, { onConflict: 'sport,original_name' })
}

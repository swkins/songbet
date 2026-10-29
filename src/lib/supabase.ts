import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Supabase는 한 번에 최대 1000행만 돌려준다 — 베팅이 1000건을 넘으면 뒤(최신) 기록이 잘려
// 통계·최근 합류에 안 보이던 문제가 있어, 1000행씩 끝까지 나눠 받는다. (정렬에 id를 넣어 페이지 경계가 흔들리지 않게)
const PAGE = 1000
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error || !data) return from === 0 ? null : out
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

// 엣지 함수용 Supabase 클라이언트 — 화면 코드(src/lib)의 './supabase'를 이걸로 바꿔 묶는다 (build.mjs)
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
export const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

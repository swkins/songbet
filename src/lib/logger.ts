// 모든 중요 액션을 action_logs에 기록하고 되돌리기를 지원하는 유틸리티
import { supabase } from './supabase'

export async function logAction(params: {
  action_type: 'insert' | 'update' | 'delete'
  table_name: string
  record_id?: string
  before_data?: Record<string, unknown> | null
  after_data?: Record<string, unknown> | null
  description: string
}) {
  await supabase.from('action_logs').insert({
    action_type: params.action_type,
    table_name: params.table_name,
    record_id: params.record_id ?? null,
    before_data: params.before_data ?? null,
    after_data: params.after_data ?? null,
    description: params.description,
  })
}

// 3일 지난 로그 삭제
export async function purgeOldLogs() {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('action_logs').delete().lt('created_at', cutoff)
}

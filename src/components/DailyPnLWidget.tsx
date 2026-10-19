import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { settledDayOf, aggregatePnL } from '../lib/pnl'
import type { Bet } from '../types'

const DAYS = 7
const SPORT_LABELS: Record<string, string> = { soccer: '축구', baseball: '야구', basketball: '농구', volleyball: '배구', esports: 'LOL', hockey: '하키', other: '기타', casino: '카지노' }

function Num({ v, size = 12 }: { v: number; size?: number }) {
  if (v === 0) return <span style={{ color: 'var(--text-muted)', fontSize: size, fontFamily: 'var(--font-num)' }}>0</span>
  return <span style={{ color: v > 0 ? 'var(--green)' : 'var(--red)', fontSize: size, fontWeight: 800, fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' }}>{v > 0 ? '+' : ''}{Math.round(v).toLocaleString()}</span>
}

/** 대시보드 사이트 현황 아래 — 통계의 일별 손익을 최근 7일만 간략히 (결과처리 날짜 기준, 통계 제외 건 빠짐).
 *  대시보드는 숨김(마감) 베팅을 안 불러오므로 여기서 따로 조회한다. refreshKey가 바뀌면(결과처리 등) 다시 불러옴. */
// compact: 대시보드 "상하" 모드 — 사이트 현황 카드 높이에 맞추려고 7일치를 한 줄씩, 위아래 여백을 최소로 줄이고 남는 높이는 행 사이에 고르게 나눈다
export default function DailyPnLWidget({ refreshKey, usdKrwRate, compact = false }: { refreshKey: string; usdKrwRate: number; compact?: boolean }) {
  const dayCount = DAYS
  const [bets, setBets] = useState<Bet[]>([])

  useEffect(() => {
    (async () => {
      const from = dayjs().subtract(DAYS - 1, 'day').format('YYYY-MM-DD')
      // 결과처리 시각 또는 베팅일이 최근 7일 안인 결과처리된 베팅 (시간대 차이 감안해 하루 여유 두고 받은 뒤 아래에서 날짜로 거름)
      const [{ data: b }, { data: sites }] = await Promise.all([
        supabase.from('bets').select('*').neq('result', 'pending').eq('stats_excluded', false).eq('is_mock', false).neq('sport', 'casino')
          .or(`result_at.gte.${dayjs(from).subtract(1, 'day').format('YYYY-MM-DD')},bet_date.gte.${from}`),
        supabase.from('sites').select('id,currency'),
      ])
      if (!b) return
      const usdSites = new Set(((sites ?? []) as { id: string; currency: string }[]).filter(s => s.currency === 'usd').map(s => s.id))
      setBets((b as Bet[]).map(x => usdSites.has(x.site_id ?? '')
        ? { ...x, profit: Math.round(x.profit * (x.usd_krw_rate ?? usdKrwRate)) }
        : x))
    })()
  }, [refreshKey, usdKrwRate])

  const days = Array.from({ length: dayCount }, (_, i) => dayjs().subtract(i, 'day').format('YYYY-MM-DD'))
  const rows = days.map(d => ({ day: d, ...aggregatePnL(bets.filter(b => settledDayOf(b) === d)) }))
  const weekNet = rows.reduce((a, r) => a + r.net, 0)

  return (
    <div className="card" style={{ padding: compact ? '6px 12px' : '10px 14px' }}>
      <div className="flex-between" style={{ marginBottom: compact ? 2 : 10 }}>
        <span className="card-title" style={{ margin: 0 }}>일별 손익</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>최근 {dayCount}일 <Num v={weekNet} size={13} /></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 0 : 4, ...(compact ? { flex: 1, justifyContent: 'space-between' } : {}) }}>
        {rows.map((r, i) => {
          const sports = Object.entries(r.bySport).filter(([, c]) => c.net !== 0 || c.count > 0)
          return (
            <div key={r.day} style={{ padding: compact ? '1px 8px' : '6px 8px', borderRadius: 6, background: i === 0 ? 'var(--bg-elevated)' : 'transparent', border: i === 0 ? '1px solid var(--border)' : '1px solid transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 8 }}>
                <span style={{ fontSize: compact ? 13 : 12, lineHeight: compact ? 1.45 : undefined, fontWeight: 700, color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', width: compact ? 74 : 72, flexShrink: 0 }}>
                  {i === 0 ? '오늘' : dayjs(r.day).format('MM.DD')} <span style={{ fontSize: compact ? 11 : 10, color: 'var(--text-muted)' }}>({'일월화수목금토'[dayjs(r.day).day()]})</span>
                </span>
                <span style={{ fontSize: compact ? 11 : 10, color: 'var(--text-muted)', flexShrink: 0 }}>{r.count}건</span>
                {/* compact: 종목별 손익을 같은 줄에 붙여 한 날짜 = 한 줄 */}
                {compact && sports.length > 0 && (
                  <span style={{ display: 'flex', gap: 8, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {sports.map(([sp, c]) => (
                      <span key={sp} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{SPORT_LABELS[sp] ?? sp} <Num v={c.net} size={11} /></span>
                    ))}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', flexShrink: 0 }}><Num v={r.net} size={compact ? (i === 0 ? 15 : 14) : (i === 0 ? 15 : 13)} /></span>
              </div>
              {!compact && sports.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 2 }}>
                  {sports.map(([sp, c]) => (
                    <span key={sp} style={{ fontSize: 10, color: 'var(--text-muted)' }}>{SPORT_LABELS[sp] ?? sp} <Num v={c.net} size={10} /></span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { sortLeagues } from '../lib/gameSchedule'

// ─── 업데이트 현황 '경기 일정 · 배당' 리그 카드 (2026-11-22 사용자 요청 — 표 대신 리그마다 네모로 한눈에) ─────
// 데이터: rpc league_status_cards (supabase/data_sources.sql). 카드 = 리그 이름 · 일정(어제/오늘/내일 경기 수·받은 시각·출처) · 배당(출처·마지막 저장·24시간 저장 수·마지막 수집 결과·다음 예정).
// 테두리 색 = 마지막 수집 결과 (초록 성공 · 주황 차단 · 빨강 오류 · 회색 경기 없음·건너뜀), ⚠ 마우스 = 설명.

interface Log { at: string; status: string; note: Record<string, unknown> | null }
interface Card { league: string; sport: string | null; yday: number | null; today: number | null; tomorrow: number | null; sched_at: string | null
  odds_sources: string[] | null; odds_at: string | null; odds_n24: number; logs: Log[] | null; next_at: string | null }

const SPORT: Record<string, string> = { soccer: '⚽ 축구', basketball: '🏀 농구', volleyball: '🏐 배구', baseball: '⚾ 야구', esports: '🎮 LOL' }
const SRC: Record<string, string> = { 'espn-draftkings': 'DraftKings', pinnacle: '피나클', betexplorer: 'BetExplorer', actionnetwork: 'Action Network', '365-bet365': 'Bet365(365)' }
const schedSrc = (c: Card) => c.sport === 'soccer' ? (/^K리그/.test(c.league) ? 'K리그 공식' : c.league === 'J리그2' ? 'J리그 사이트' : 'ESPN')
  : c.sport === 'basketball' ? (c.league === 'NBA' ? 'ESPN' : c.league === 'KBL' ? 'KBL 공식' : c.league === 'WKBL' ? 'WKBL 홈페이지' : '?')
  : c.sport === 'volleyball' ? (/^V리그/.test(c.league) ? 'KOVO' : '365Scores') : '?'
const ago = (v?: string | null) => {
  if (!v) return '–'
  const m = Math.round((Date.now() - Date.parse(v)) / 60000)
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`
}
const until = (v?: string | null) => {
  if (!v) return ''
  const m = Math.round((Date.parse(v) - Date.now()) / 60000)
  return m <= 0 ? '곧' : m < 60 ? `${m}분 뒤` : `${Math.floor(m / 60)}시간 ${m % 60}분 뒤`
}
const STATUS: Record<string, { label: string; color: string }> = {
  ok: { label: '성공', color: 'var(--green)' }, blocked: { label: '차단', color: 'var(--orange)' },
  error: { label: '오류', color: 'var(--red)' }, skipped: { label: '건너뜀', color: 'var(--text-muted)' },
}

export default function LeagueCards({ reloadKey }: { reloadKey: number }) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('league_status_cards').then(({ data, error }) => { if (error) setErr(error.message); else { setCards((data as Card[]) ?? []); setErr(null) } })
  }, [reloadKey])

  const bySport = new Map<string, Card[]>()
  for (const c of cards ?? []) { const k = c.sport ?? 'etc'; bySport.set(k, [...(bySport.get(k) ?? []), c]) }
  const order = ['soccer', 'basketball', 'volleyball', 'baseball', 'esports', 'etc'].filter(k => bySport.has(k))

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', background: 'var(--bg-elevated)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>경기 일정 · 배당 (리그별)</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>색 = 마지막 수집 결과 (초록 성공 · 주황 차단 · 빨강 오류 · 회색 경기 없음) · 마우스를 올리면 일정·배당·수집 내용</span>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>리그 현황을 못 불러왔어요: {err}</div>}
      {!cards && !err && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>불러오는 중…</div>}
      {order.map(sp => {
        const list = sortLeagues(sp, (bySport.get(sp) ?? []).map(c => c.league)).map(l => bySport.get(sp)!.find(c => c.league === l)!)
        return (
          <div key={sp} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, margin: '4px 0 6px' }}>{SPORT[sp] ?? '기타'} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{list.length}개 리그</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 4 }}>
              {list.map(c => {
                const last = c.logs?.[0] ?? null
                const st = last ? STATUS[last.status] ?? { label: last.status, color: 'var(--text-muted)' } : null
                const n = last?.note ?? {}
                const noGames = !(c.today || c.tomorrow)
                const border = !st ? 'var(--border)' : last!.status === 'ok' ? (noGames ? 'var(--border)' : 'var(--green-border, var(--green))') : st.color
                const warns: string[] = []
                const um = Array.isArray(n.unmatched) ? (n.unmatched as string[]).filter(x => !/429/.test(x)) : []
                if (um.length && !(c.odds_sources ?? []).includes('betexplorer')) warns.push(`못 맞춘 팀 이름: ${um.slice(0, 6).join(', ')}${um.length > 6 ? ` 외 ${um.length - 6}` : ''}`)
                if (last?.status === 'blocked') warns.push(`마지막 수집 차단(${String(n.http ?? '429')})${n.retry ? ` → ${n.retry} 지역으로 다시 시도` : ''}`)
                if (last?.status === 'error') warns.push(`마지막 수집 오류: ${String(n.message ?? n.http ?? '')}`.slice(0, 120))
                if (!noGames && !c.odds_at) warns.push('경기는 있는데 저장된 배당이 없음')
                else if (!noGames && c.odds_at && Date.now() - Date.parse(c.odds_at) > 6 * 3600000) warns.push(`배당이 ${ago(c.odds_at)} 이후 안 바뀜 (그대로면 정상일 수도)`)
                if (n.message) warns.push(String(n.message))
                const tip = [`${c.league}`, `일정 출처: ${schedSrc(c)} · 받은 시각 ${c.sched_at ? dayjs(c.sched_at).format('M/D HH:mm') : '–'}`,
                  `배당 출처: ${(c.odds_sources ?? []).map(s => SRC[s] ?? s).join(', ') || '없음'}`,
                  ...(c.logs ?? []).map(l => `${dayjs(l.at).format('M/D HH:mm')} ${STATUS[l.status]?.label ?? l.status}`), ...warns.map(w => `⚠ ${w}`)].join('\n')
                // 작은 칸: 리그 이름 + 색만 (사용자 요청 2026-11-22) — 나머지는 마우스를 올리면
                const fill = !st ? 'transparent' : last!.status === 'ok' ? (noGames ? 'transparent' : 'rgba(74,222,128,0.10)') : last!.status === 'blocked' ? 'rgba(251,146,60,0.14)' : last!.status === 'error' ? 'rgba(248,113,113,0.16)' : 'transparent'
                const tipFull = [tip, `일정 오늘 ${c.today ?? 0} · 내일 ${c.tomorrow ?? 0}`, c.odds_at ? `배당 마지막 저장 ${ago(c.odds_at)} · 24시간 ${c.odds_n24}건` : '배당 저장 없음',
                  `마지막 수집 ${ago(last?.at)}${c.next_at ? ` · 다음 ${until(c.next_at)}` : ''}`].join('\n')
                return (
                  <div key={c.league} title={tipFull} style={{ border: `1px solid ${border}`, background: fill, borderRadius: 5, padding: '4px 6px', fontSize: 11, fontWeight: 700, cursor: 'help',
                    display: 'flex', alignItems: 'center', gap: 3, color: noGames && last?.status === 'ok' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{c.league}</span>
                    {warns.length > 0 && <b style={{ color: last?.status === 'error' ? 'var(--red)' : 'var(--orange)', fontSize: 10 }}>⚠</b>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

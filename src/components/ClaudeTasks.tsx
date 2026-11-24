import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'

// ─── 업데이트 현황 맨 위 'Claude 예약 작업' (사용자 요청 2026-11-24 — Supabase 작업 말고 Claude 작업이 제대로 도는지) ─────
// 예약 작업 자체는 claude.ai에 있어서 앱이 직접 못 본다 → 작업이 남기는 기록으로 판단:
//   출전확률 = news_check_log(task NBA/국내) · 뉴스 = game_news.checked_at · 예측검토 = model_reviews.created_at
// 일정은 예약 작업과 같게 (한국 시간). 바꾸면 여기도 같이.
interface TaskDef { name: string; desc: string; hh: number; mm: number; days: number[]; kind: 'news' | 'review'; task?: string }
const TASKS: TaskDef[] = [
  { name: '출전확률-NBA', desc: '매일 20:41 · 다음 날 NBA 출전 확률 + 뉴스', hh: 20, mm: 41, days: [0, 1, 2, 3, 4, 5, 6], kind: 'news', task: 'NBA' },
  { name: '출전확률-국내-평일', desc: '월~금 13:17 · 오늘·내일 KBL·WKBL·V리그', hh: 13, mm: 17, days: [1, 2, 3, 4, 5], kind: 'news', task: '국내' },
  { name: '출전확률-국내-주말', desc: '토·일 8:23 · 오늘·내일 KBL·WKBL·V리그', hh: 8, mm: 23, days: [0, 6], kind: 'news', task: '국내' },
  { name: '예측검토-매일', desc: '매일 08:52 · 전날 예측 채점·가중치 제안', hh: 8, mm: 52, days: [0, 1, 2, 3, 4, 5, 6], kind: 'review' },
]
const KST = 9 * 3600e3
/** 한국 시간으로 n일 전 그 작업 시각 (UTC Date) */
const slotOn = (d: TaskDef, daysAgo: number, now: Date) => {
  const k = new Date(now.getTime() + KST)
  const s = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - daysAgo, d.hh, d.mm) - KST)
  return { at: s, dow: new Date(s.getTime() + KST).getUTCDay() }
}
const lastSlot = (d: TaskDef, now: Date) => { for (let i = 0; i < 8; i++) { const s = slotOn(d, i, now); if (d.days.includes(s.dow) && s.at <= now) return s.at } return null }
const nextSlot = (d: TaskDef, now: Date) => { for (let i = 0; i > -8; i--) { const s = slotOn(d, i, now); if (d.days.includes(s.dow) && s.at > now) return s.at } return null }

interface Run { at: string; games?: number | null; players?: number | null; note?: string | null }

export default function ClaudeTasks({ reloadKey }: { reloadKey: number }) {
  const [logs, setLogs] = useState<{ ran_at: string; task: string; games: number | null; players: number | null; note: string | null }[]>([])
  const [reviews, setReviews] = useState<{ created_at: string; review_date: string; summary: string | null }[]>([])
  const [news, setNews] = useState<{ league: string; checked_at: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const since = dayjs().subtract(8, 'day').toISOString()
    Promise.all([
      supabase.from('news_check_log').select('ran_at,task,games,players,note').gte('ran_at', since).order('ran_at', { ascending: false }).limit(200),
      supabase.from('model_reviews').select('created_at,review_date,summary').gte('created_at', since).order('created_at', { ascending: false }).limit(20),
      supabase.from('game_news').select('league,checked_at').gte('checked_at', since).limit(1000),
    ]).then(([a, b, c]) => {
      if (a.error || b.error || c.error) setErr((a.error ?? b.error ?? c.error)!.message)
      setLogs(a.data ?? []); setReviews(b.data ?? []); setNews(c.data ?? [])
    })
  }, [reloadKey])

  const now = new Date()
  // 작업마다 실행 기록: 출전확률은 그 작업 요일·시간대(±3시간)에 남은 기록, 직접 돌린 테스트도 포함
  const runsOf = (d: TaskDef): Run[] => d.kind === 'review'
    ? reviews.map(r => ({ at: r.created_at, note: r.summary?.slice(0, 60) ?? null }))
    : logs.filter(l => l.task === d.task && (d.task === 'NBA' || d.days.includes(new Date(new Date(l.ran_at).getTime() + KST).getUTCDay())))
        .map(l => ({ at: l.ran_at, games: l.games, players: l.players, note: l.note }))
  const newsAfter = (at: string, d: TaskDef) => {
    const t0 = new Date(at).getTime() - 15 * 60e3, t1 = t0 + 45 * 60e3
    return news.filter(n => { const t = new Date(n.checked_at).getTime(); return t >= t0 && t <= t1 && (d.task === 'NBA' ? n.league === 'NBA' : n.league !== 'NBA') }).length
  }

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, padding: '3px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 11, padding: '4px 6px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
  return (
    <div style={{ border: '1px solid var(--gold-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Claude 예약 작업</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>작업이 남긴 기록으로 판단 (예약 작업 화면은 claude.ai) · 시각은 한국 시간</span>
      </div>
      {err && <div style={{ fontSize: 11, color: 'var(--red)' }}>기록을 못 읽었어요: {err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>상태</th><th style={th}>작업</th><th style={th}>마지막 실행</th><th style={th}>결과</th><th style={th}>최근 7일</th><th style={th}>다음 예정</th></tr></thead>
          <tbody>{TASKS.map(d => {
            const runs = runsOf(d), last = runs[0] ?? null, slot = lastSlot(d, now), next = nextSlot(d, now)
            const ranSince = slot && runs.some(r => new Date(r.at).getTime() >= slot.getTime() - 5 * 60e3)
            const waiting = slot && !ranSince && now.getTime() - slot.getTime() < 30 * 60e3
            const st = !slot ? { c: 'var(--text-muted)', t: '–' } : ranSince ? { c: 'var(--green)', t: '정상' } : waiting ? { c: 'var(--gold)', t: '실행 중' } : { c: 'var(--red)', t: '놓침' }
            // 최근 7일: 그 작업 요일마다 실행됐는지 (● 실행 · ○ 놓침 · 빈칸 = 쉬는 요일)
            const dots = Array.from({ length: 7 }, (_, i) => 6 - i).map(i => {
              const s = slotOn(d, i, now)
              if (!d.days.includes(s.dow) || s.at > now) return { k: i, v: null as boolean | null, s }
              const ok = runs.some(r => { const t = new Date(r.at).getTime(); return t >= s.at.getTime() - 5 * 60e3 && t < s.at.getTime() + 20 * 3600e3 })
              return { k: i, v: ok, s }
            })
            const nNews = last && d.kind === 'news' ? newsAfter(last.at, d) : null
            return (
              <tr key={d.name}>
                <td style={td}><span style={{ fontSize: 10, fontWeight: 800, color: '#111', background: st.c, borderRadius: 3, padding: '0 6px' }}>{st.t}</span></td>
                <td style={td}><div style={{ fontWeight: 700 }}>{d.name}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.desc}</div></td>
                <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'var(--font-num)' }}>{last ? dayjs(last.at).format('M/D HH:mm') : '기록 없음'}</td>
                <td style={td}>
                  {d.kind === 'news' && last ? <>경기 {last.games ?? 0} · 선수 {last.players ?? 0} · 뉴스 {nNews}{last.note ? <span style={{ color: 'var(--text-muted)' }}> · {last.note}</span> : null}</>
                    : last ? <span style={{ color: 'var(--text-muted)' }}>{last.note}</span> : '–'}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap', letterSpacing: 2 }}>
                  {dots.map(x => <span key={x.k} title={`${dayjs(x.s.at).format('M/D (dd)')} ${x.v == null ? '쉬는 날' : x.v ? '실행' : '놓침'}`}
                    style={{ color: x.v == null ? 'var(--border)' : x.v ? 'var(--green)' : 'var(--red)' }}>{x.v == null ? '·' : x.v ? '●' : '○'}</span>)}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'var(--font-num)' }}>{next ? dayjs(next).format('M/D HH:mm') : '–'}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
        정상 = 마지막 예정 시각 뒤에 기록이 있음 · 실행 중 = 예정 시각 30분 안 · 놓침 = 30분 지나도 기록 없음 (claude.ai 예약 작업 화면에서 실행 기록·Supabase 연결 확인) · 뉴스 = 그 실행 때 저장된 경기 뉴스 수
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { matchBets, pickToContent, SPORT_EMOJI, type Pick, type PickBetLite } from '../lib/picks'
import type { Site } from '../types'

// ─── 베팅추가 › 추천픽 (사용자 요청) ───────────────────────────────────────
// Supabase `picks`에서 아직 시작 전(시작 3시간 지난 것까지)인 픽을 불러와 나열하고, 새 픽은 실시간으로 더한다.
// 픽을 누르면 베팅 내용·배당·금액이 픽 값으로 채워지고 셋 다 고칠 수 있다.
// 진행중 베팅이 이미 있으면 "베팅완료" 표시 — 그래도 눌러서 추가로 걸 수 있다.

interface Props {
  site: Site
  bets: (PickBetLite & { site_id: string | null })[]
  sites: Site[]
  onBet: (sport: string, content: string, odds: number, stake: number, league: string) => Promise<boolean>
  onClose: () => void
}

function stars(g: number | null) {
  const n = Math.max(0, Math.min(5, g ?? 0))
  return <span style={{ color: '#fbbf24', letterSpacing: -1 }}>{'★'.repeat(n)}<span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - n)}</span></span>
}

export default function PickBetForm({ site, bets, sites, onBet, onClose }: Props) {
  const isusd = site.currency === 'usd'
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [odds, setOdds] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 베팅완료 픽은 아래에 접어 둔다 — 누르면 펼쳐서 보고 다시 걸 수 있다 (사용자 요청)
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    let alive = true
    const since = dayjs().subtract(3, 'hour').toISOString()
    supabase.from('picks').select('*').gte('kickoff_at', since).order('kickoff_at').order('sort_order').limit(200)
      .then(({ data }) => { if (alive) { setPicks((data ?? []) as Pick[]); setLoading(false) } })
    const ch = supabase.channel(`pickbet-${site.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, payload => {
        if (payload.eventType === 'DELETE') { const id = (payload.old as { id?: string }).id; setPicks(p => p.filter(x => x.id !== id)); return }
        const row = payload.new as Pick
        setPicks(p => [...p.filter(x => x.id !== row.id), row])
      })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [site.id])

  const pendingBets = useMemo(() => bets.filter(b => b.result === 'pending'), [bets])
  // 아직 안 건 픽이 위, 베팅완료(진행중 베팅 있음)는 아래 — 그 안에서는 경기 시간순, 같은 시간이면 별점 높은 순
  const sorted = useMemo(() => {
    const doneOf = (p: Pick) => matchBets(p, pendingBets).length > 0 ? 1 : 0
    return [...picks].sort((a, b) => doneOf(a) - doneOf(b) ||
      (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? '') || (b.grade ?? 0) - (a.grade ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [picks, pendingBets])
  const isDone = (p: Pick) => matchBets(p, pendingBets).length > 0
  const todo = sorted.filter(p => !isDone(p))
  const doneList = sorted.filter(isDone)
  const siteName = (id: string | null) => sites.find(s => s.id === id)?.name ?? ''

  function open(p: Pick) {
    if (openId === p.id) { setOpenId(null); return }
    setOpenId(p.id)
    setContent(pickToContent(p))
    setOdds(p.base_odds != null ? Number(p.base_odds).toFixed(2) : '')
    setAmount(isusd ? (site.default_stake > 0 ? String(site.default_stake) : '') : (p.stake != null ? String(Number(p.stake)) : ''))
  }
  async function submit(p: Pick) {
    const o = Number(odds), a = Number(amount.replace(/,/g, ''))
    if (!content.trim() || !(o > 1) || !(a > 0)) return
    setSubmitting(true)
    const ok = await onBet(p.sport, content.trim(), o, a, p.league)
    setSubmitting(false)
    if (ok) onClose()
  }

  function renderPick(p: Pick) {
    const done = matchBets(p, pendingBets)
    const isOpen = openId === p.id
    return (
      <div key={p.id} style={{ border: `1px solid ${isOpen ? 'var(--gold-border)' : 'var(--border)'}`, borderRadius: 6, background: isOpen ? 'var(--gold-bg)' : 'var(--bg-elevated)', opacity: done.length && !isOpen ? 0.7 : 1 }}>
        <button type="button" onClick={() => open(p)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', color: 'inherit', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 윗줄: 시간·리그·경기·별점·배당·금액 / 아랫줄: 픽만 크게 한 줄로 (오른쪽에 아무것도 두지 않음) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 0 }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}>{stars(p.grade)}</span>
            <span style={{ flexShrink: 0 }}>{p.kickoff_at ? dayjs(p.kickoff_at).format('M/D HH:mm') : ''}</span>
            <span style={{ flexShrink: 0 }}>{SPORT_EMOJI[p.sport] ?? ''} {p.league}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{p.home_team} vs {p.away_team}</span>
            <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-secondary)', fontWeight: 700 }}>@{p.base_odds != null ? Number(p.base_odds).toFixed(2) : '—'} · {p.stake != null ? Number(p.stake).toLocaleString() : '—'}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: done.length ? 'var(--text-secondary)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pick_label}</div>
          {done.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 800, color: '#4ade80' }}
              title={done.map(b => `${siteName(b.site_id)} ${b.match} ${Number(b.stake).toLocaleString()} @${Number(b.odds).toFixed(2)}`).join('\n')}>
              ✓ 베팅완료 {done.length}건 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({done.map(b => siteName(b.site_id) || '—').join(', ')}) · 눌러서 추가 베팅</span>
            </div>
          )}
        </button>
        {isOpen && (
          <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {p.rationale && <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.rationale}</div>}
            <input className="form-input" style={input} value={content} onChange={e => setContent(e.target.value)} placeholder="베팅 내용" />
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="form-input" style={{ ...input, flex: 1 }} value={odds} onChange={e => setOdds(e.target.value)} inputMode="decimal" placeholder="배당" />
              <input className="form-input" style={{ ...input, flex: 1.4 }} value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                onKeyDown={e => e.key === 'Enter' && submit(p)} inputMode="numeric" placeholder={isusd ? '금액($)' : '금액'} />
              <button type="button" className="btn" disabled={submitting} onClick={() => submit(p)}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 800, flexShrink: 0 }}>{submitting ? '...' : '베팅'}</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const input: React.CSSProperties = { fontSize: 12, padding: '6px 8px' }
  return (
    <div className="inline-bet-form" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {loading ? <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0', textAlign: 'center' }}>추천픽 불러오는 중…</div>
        : sorted.length === 0 ? <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '10px 0', textAlign: 'center' }}>지금 걸 수 있는 추천픽이 없습니다 — 직접 베팅을 이용하세요</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
            {todo.map(renderPick)}
            {todo.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0', textAlign: 'center' }}>남은 추천픽을 모두 걸었습니다</div>}
            {doneList.length > 0 && (
              <button type="button" onClick={() => setShowDone(v => !v)} style={{ marginTop: 2, padding: '6px 8px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 800, fontFamily: 'inherit', textAlign: 'left' }}>
                {showDone ? '▾' : '▸'} 베팅완료 {doneList.length}건 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{showDone ? '접기' : '— 눌러서 보기·추가 베팅'}</span>
              </button>
            )}
            {showDone && doneList.map(renderPick)}
          </div>
        )}
      <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} style={{ alignSelf: 'flex-end', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}><X size={11} /> 닫기</button>
    </div>
  )
}

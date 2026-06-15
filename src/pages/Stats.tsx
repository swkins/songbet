import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import dayjs from 'dayjs'
import { Trash2, X } from 'lucide-react'

const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: 'soccer',     label: '축구', emoji: '⚽' },
  { value: 'baseball',   label: '야구', emoji: '⚾' },
  { value: 'basketball', label: '농구', emoji: '🏀' },
  { value: 'volleyball', label: '배구', emoji: '🏐' },
  { value: 'hockey',     label: '하키', emoji: '🏒' },
  { value: 'esports',    label: 'LOL',  emoji: '🎮' },
  { value: 'other',      label: '기타', emoji: '📋' },
]
const MARKET_LABELS: Record<Market, string> = {
  moneyline:'승패', handicap:'핸디캡', over:'오버', under:'언더', correct_score:'정확한스코어', other:'기타',
}

const BASE_ODDS_STEPS = [1.7,1.8,1.9,2.0,2.1,2.2,2.3,2.4,2.5,2.6]

function getOddsBucket(odds: number): string {
  return (Math.floor(odds * 10) / 10).toFixed(1)
}

function calcStats(bets: Bet[]) {
  const settled = bets.filter(b => b.result !== 'pending')
  const wins = settled.filter(b => b.result === 'win')
  const losses = settled.filter(b => b.result === 'loss')
  const pushes = settled.filter(b => b.result === 'push')
  const total = settled.length
  const winRate = total > 0 ? wins.length / total * 100 : 0
  const stake = settled.reduce((s, b) => s + b.stake, 0)
  const profit = settled.reduce((s, b) => s + b.profit, 0)
  const roi = stake > 0 ? profit / stake * 100 : 0
  const avgOdds = total > 0 ? settled.reduce((s, b) => s + b.odds, 0) / total : 0
  return { settled, wins, losses, pushes, total, winRate, stake, profit, roi, avgOdds }
}

function OddsTableVertical({ title, bets }: { title: string; bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  const dataBuckets = Array.from(new Set(settled.map(b => getOddsBucket(b.odds))))
    .filter(b => !BASE_ODDS_STEPS.map(s => s.toFixed(1)).includes(b))
    .sort()
  const allBuckets = [...BASE_ODDS_STEPS.map(s => s.toFixed(1)), ...dataBuckets]
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  return (
    <div className="card" style={{ width: 200, flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
      <table style={{ width: '100%', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '2px 6px', fontSize: 9, color: 'var(--text-muted)' }}>배당</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--green)', padding: '2px 4px' }}>승률</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--blue)', padding: '2px 4px' }}>ROI</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', padding: '2px 4px' }}>건</th>
          </tr>
        </thead>
        <tbody>
          {allBuckets.map(bucket => {
            const lo = parseFloat(bucket)
            const bucketBets = settled.filter(b => getOddsBucket(b.odds) === bucket)
            if (!bucketBets.length) return (
              <tr key={bucket} style={{ opacity: 0.35 }}>
                <td style={{ padding: '2px 6px', fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11 }}>{lo.toFixed(1)}</td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>—</td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>—</td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>0</td>
              </tr>
            )
            const s = calcStats(bucketBets)
            return (
              <tr key={bucket}>
                <td style={{ padding: '2px 6px', fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11 }}>{lo.toFixed(1)}</td>
                <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }} className={s.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>{s.winRate.toFixed(0)}%</span>
                </td>
                <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                  <span style={{ fontSize: 10, fontWeight: 600 }} className={s.roi >= 0 ? 'profit-pos' : 'profit-neg'}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(0)}%</span>
                </td>
                <td style={{ textAlign: 'center', padding: '2px 4px', color: 'var(--text-muted)', fontSize: 10 }}>{s.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LineTableVertical({ title, rows }: {
  title: string
  rows: { label: string; bets: Bet[]; filterFn: (b: Bet) => boolean }[]
}) {
  return (
    <div className="card" style={{ width: 200, flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
      <table style={{ width: '100%', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '2px 6px', fontSize: 9, color: 'var(--text-muted)' }}>라인</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--green)', padding: '2px 4px' }}>승률</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--blue)', padding: '2px 4px' }}>ROI</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', padding: '2px 4px' }}>건</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const rb = r.bets.filter(b => b.result !== 'pending' && r.filterFn(b))
            if (!rb.length) return (
              <tr key={r.label} style={{ opacity: 0.4 }}>
                <td style={{ padding: '2px 6px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10 }}>{r.label}</td>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>—</td>
              </tr>
            )
            const s = calcStats(rb)
            return (
              <tr key={r.label}>
                <td style={{ padding: '2px 6px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10 }}>{r.label}</td>
                <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }} className={s.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>{s.winRate.toFixed(0)}%</span>
                </td>
                <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                  <span style={{ fontSize: 10, fontWeight: 600 }} className={s.roi >= 0 ? 'profit-pos' : 'profit-neg'}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(0)}%</span>
                </td>
                <td style={{ textAlign: 'center', padding: '2px 4px', color: 'var(--text-muted)', fontSize: 10 }}>{s.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function pickHasLine(pick: string, line: string): boolean { return pick?.includes(line) ?? false }

function SportDetailPanel({ sport, bets }: { sport: Sport; bets: Bet[] }) {
  const sb = bets.filter(b => b.sport === sport && b.result !== 'pending')
  const moneyline = sb.filter(b => b.market === 'moneyline')
  const handicap  = sb.filter(b => b.market === 'handicap')
  const over      = sb.filter(b => b.market === 'over')
  const under     = sb.filter(b => b.market === 'under')

  if (sport === 'soccer') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      <OddsTableVertical title="-1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-1.5'))} />
      <OddsTableVertical title="0.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '0.5'))} />
      <OddsTableVertical title="1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '1.5') && !pickHasLine(b.pick, '-1.5'))} />
      <OddsTableVertical title="2.5 오버 배당별" bets={over.filter(b => pickHasLine(b.pick, '2.5'))} />
      <OddsTableVertical title="2.5 언더 배당별" bets={under.filter(b => pickHasLine(b.pick, '2.5'))} />
    </div>
  )
  if (sport === 'baseball') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      <OddsTableVertical title="-1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-1.5'))} />
      <LineTableVertical title="오버 라인별" rows={['6.5','7.5','8.5','9.5'].map(l => ({ label: `${l} 오버`, bets: over, filterFn: (b: Bet) => pickHasLine(b.pick, l) }))} />
      <LineTableVertical title="언더 라인별" rows={['6.5','7.5','8.5','9.5'].map(l => ({ label: `${l} 언더`, bets: under, filterFn: (b: Bet) => pickHasLine(b.pick, l) }))} />
    </div>
  )
  if (sport === 'basketball') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      <LineTableVertical title="마핸 라인별" rows={['-1.5','-2.5','-3.5','-4.5','-5.5','-6.5'].map(l => ({ label: l, bets: handicap, filterFn: (b: Bet) => pickHasLine(b.pick, l) }))} />
      <LineTableVertical title="플핸 라인별" rows={['4.5','5.5','6.5','7.5','8.5','9.5','10.5'].map(l => ({ label: `+${l}`, bets: handicap, filterFn: (b: Bet) => pickHasLine(b.pick, l) && !pickHasLine(b.pick,'-') }))} />
      <OddsTableVertical title="오버 배당별" bets={over} />
      <OddsTableVertical title="언더 배당별" bets={under} />
    </div>
  )
  if (sport === 'esports') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      <OddsTableVertical title="-1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-1.5'))} />
      <OddsTableVertical title="-2.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-2.5'))} />
      <OddsTableVertical title="+1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '1.5') && !pickHasLine(b.pick, '-1.5'))} />
      <OddsTableVertical title="+2.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '2.5') && !pickHasLine(b.pick, '-2.5'))} />
    </div>
  )
  if (sport === 'volleyball') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      <OddsTableVertical title="핸디캡 배당별" bets={handicap} />
      <OddsTableVertical title="오버 배당별" bets={over} />
      <OddsTableVertical title="언더 배당별" bets={under} />
    </div>
  )
  if (sport === 'hockey') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      <OddsTableVertical title="핸디캡 배당별" bets={handicap} />
      <OddsTableVertical title="오버 배당별" bets={over} />
      <OddsTableVertical title="언더 배당별" bets={under} />
    </div>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTableVertical title="승패 배당별" bets={moneyline} />
      {handicap.length > 0 && <OddsTableVertical title="핸디캡 배당별" bets={handicap} />}
    </div>
  )
}

/* ── 종목별 데이터 삭제 모달 ── */
function DeleteBetsModal({ sport, bets, onClose, onDeleted }: {
  sport: typeof SPORTS[0]; bets: Bet[]; onClose: () => void; onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const sportBets = bets.filter(b => b.sport === sport.value)
  const CONFIRM_WORD = sport.label

  async function doDelete() {
    if (confirm !== CONFIRM_WORD) return
    setDeleting(true)
    const ids = sportBets.map(b => b.id)
    // 배치 삭제 (in 조건)
    const { error } = await supabase.from('bets').delete().in('id', ids)
    setDeleting(false)
    if (!error) { onDeleted(); onClose() }
    else alert('삭제 실패: ' + error.message)
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Trash2 size={16} color="var(--red)" />
          {sport.emoji} {sport.label} 데이터 삭제
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2 }}><X size={15} /></button>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
          ⚠️ <strong>{sport.label}</strong> 베팅 데이터 <strong>{sportBets.length}건</strong>이 영구 삭제됩니다.<br />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>이 작업은 되돌릴 수 없습니다.</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
          확인을 위해 <strong style={{ color: 'var(--text-primary)' }}>"{CONFIRM_WORD}"</strong> 를 입력하세요
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="form-input"
            placeholder={CONFIRM_WORD}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirm === CONFIRM_WORD && doDelete()}
            autoFocus
          />
          <button
            className="btn"
            style={{ background: 'var(--red)', color: '#fff', border: 'none', flexShrink: 0, opacity: confirm !== CONFIRM_WORD ? 0.4 : 1 }}
            disabled={confirm !== CONFIRM_WORD || deleting}
            onClick={doDelete}
          >
            {deleting ? '삭제중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SportPanel({ bets, sport, onDeleteRequest }: {
  bets: Bet[]; sport: typeof SPORTS[0]; onDeleteRequest: () => void
}) {
  const sb    = bets.filter(b => b.sport === sport.value)
  const stats = calcStats(sb)
  const byMarket = (['moneyline', 'handicap', 'over', 'under'] as Market[]).map(mkt => {
    const mb = sb.filter(b => b.market === mkt && b.result !== 'pending')
    if (!mb.length) return null
    const s = calcStats(mb)
    return { mkt, label: MARKET_LABELS[mkt], ...s }
  }).filter(Boolean) as ({ mkt: Market; label: string } & ReturnType<typeof calcStats>)[]

  if (stats.total === 0) return (
    <div>
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>결과 처리된 베팅이 없습니다</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>
    </div>
  )

  const profitCurve = (() => {
    let cum = 0
    return stats.settled.sort((a, b) => a.bet_date.localeCompare(b.bet_date)).map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        {[
          { label: '승률', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins.length}W ${stats.losses.length}L`, cls: stats.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
          { label: '총 손익', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit.toLocaleString()}`, sub: `${stats.total}건`, cls: stats.profit >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: `${stats.stake.toLocaleString()}`, cls: stats.roi >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: '평균 배당', value: stats.avgOdds.toFixed(2), sub: '', cls: '' },
        ].map(t => (
          <div key={t.label} className="card stat-tile" style={{ flex: '1 0 110px', maxWidth: 160, padding: '10px 12px' }}>
            <div className={`stat-value ${t.cls}`} style={{ fontSize: 16 }}>{t.value}</div>
            <div className="stat-label">{t.label}</div>
            {t.sub && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t.sub}</div>}
          </div>
        ))}
        {/* 삭제 버튼 */}
        <button onClick={onDeleteRequest} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-border)', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}>
          <Trash2 size={11} /> 데이터 삭제
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {byMarket.length > 0 && (
          <div className="card" style={{ width: 220, flexShrink: 0 }}>
            <div className="card-title">마켓별 성적</div>
            <table>
              <thead><tr><th>마켓</th><th className="td-right">건</th><th className="td-right">승률</th><th className="td-right">ROI</th></tr></thead>
              <tbody>
                {byMarket.map(r => (
                  <tr key={r.mkt}>
                    <td style={{ fontWeight: 700, fontSize: 11 }}>{r.label}</td>
                    <td className="td-right" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{r.total}</td>
                    <td className="td-right"><span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.winRate.toFixed(0)}%</span></td>
                    <td className="td-right"><span className={r.roi >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SportDetailPanel sport={sport.value as Sport} bets={bets} />
      </div>

      {profitCurve.length > 1 && (
        <div className="card">
          <div className="card-title">누적 손익 곡선</div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id={`pg-${sport.value}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={v => (v/1000).toFixed(0)+'K'} />
              <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                formatter={(v: number) => [`${v.toLocaleString()}`, '누적손익']} labelFormatter={l => dayjs(l).format('MM/DD')} />
              <Area type="monotone" dataKey="profit" stroke={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill={`url(#pg-${sport.value})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Stats() {
  const [bets, setBets]       = useState<Bet[]>([])
  const [period, setPeriod]   = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [activeSport, setActiveSport] = useState<Sport | 'all'>('all')
  const [deleteTarget, setDeleteTarget] = useState<typeof SPORTS[0] | null>(null)

  useEffect(() => { loadBets() }, [])
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').order('bet_date').order('created_at')
    if (data) setBets(data)
  }

  const periodFiltered = bets.filter(b => {
    if (period === 'all') return true
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return dayjs(b.bet_date).isAfter(dayjs().subtract(days, 'day'))
  })

  const stats   = calcStats(periodFiltered)
  const settled = periodFiltered.filter(b => b.result !== 'pending')
  const sportCounts = SPORTS.map(s => ({ ...s, count: settled.filter(b => b.sport === s.value).length }))

  const profitCurve = (() => {
    let cum = 0
    return settled.sort((a, b) => a.bet_date.localeCompare(b.bet_date)).map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  const bySport = sportCounts.filter(s => s.count > 0).map(s => {
    const sb = settled.filter(b => b.sport === s.value)
    return { label: s.label, winRate: Math.round(sb.filter(b => b.result === 'win').length / sb.length * 100), count: sb.length }
  })

  return (
    <div className="page">
      <div className="flex-between mb-16">
        <h1 className="page-title">통계</h1>
        <div className="filter-bar" style={{ margin: 0 }}>
          {(['all','7d','30d','90d'] as const).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'all' ? '전체' : p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
            </button>
          ))}
        </div>
      </div>

      {settled.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">📊</div>결과 처리된 베팅이 없습니다</div></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className={`filter-chip ${activeSport === 'all' ? 'active' : ''}`} onClick={() => setActiveSport('all')}>
              📊 전체 <span style={{ opacity: 0.7, fontSize: 10 }}>({settled.length})</span>
            </button>
            {sportCounts.filter(s => s.count > 0).map(s => (
              <button key={s.value} className={`filter-chip ${activeSport === s.value ? 'active' : ''}`} onClick={() => setActiveSport(s.value)}>
                {s.emoji} {s.label} <span style={{ opacity: 0.7, fontSize: 10 }}>({s.count})</span>
              </button>
            ))}
          </div>

          {activeSport === 'all' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: '승률', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins.length}W ${stats.losses.length}L ${stats.pushes.length}P`, cls: stats.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
                  { label: '총 손익', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit.toLocaleString()}`, sub: `${stats.total}건`, cls: stats.profit >= 0 ? 'profit-pos' : 'profit-neg' },
                  { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: `${stats.stake.toLocaleString()}`, cls: stats.roi >= 0 ? 'profit-pos' : 'profit-neg' },
                  { label: '평균 배당', value: stats.avgOdds.toFixed(2), sub: '', cls: '' },
                ].map(t => (
                  <div key={t.label} className="card stat-tile" style={{ flex: '1 0 120px', maxWidth: 180 }}>
                    <div className={`stat-value ${t.cls}`}>{t.value}</div>
                    <div className="stat-label">{t.label}</div>
                    {t.sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{t.sub}</div>}
                  </div>
                ))}
              </div>
              {profitCurve.length > 1 && (
                <div className="card">
                  <div className="card-title">누적 손익 곡선</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id="pg-all" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => (v/1000).toFixed(0)+'K'} />
                      <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                        formatter={(v: number) => [`${v.toLocaleString()}`, '누적손익']} labelFormatter={l => dayjs(l).format('MM/DD')} />
                      <Area type="monotone" dataKey="profit" stroke={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill="url(#pg-all)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {bySport.length > 0 && (
                <div className="card">
                  <div className="card-title">종목별 승률</div>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={bySport} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:6, fontSize:11 }}
                        formatter={(v: number, _: string, props: { payload?: { count?: number } }) => [`${v}% (${props.payload?.count ?? 0}건)`, '승률']} />
                      <Bar dataKey="winRate" radius={[4,4,0,0]}>
                        {bySport.map((e, i) => <Cell key={i} fill={e.winRate >= 50 ? '#00E87A' : '#FF4D6D'} fillOpacity={0.75} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
          {activeSport !== 'all' && (
            <SportPanel
              bets={periodFiltered}
              sport={SPORTS.find(s => s.value === activeSport)!}
              onDeleteRequest={() => setDeleteTarget(SPORTS.find(s => s.value === activeSport)!)}
            />
          )}
        </>
      )}

      {/* 종목 데이터 삭제 모달 */}
      {deleteTarget && (
        <DeleteBetsModal
          sport={deleteTarget}
          bets={bets}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { loadBets(); setActiveSport('all') }}
        />
      )}
    </div>
  )
}

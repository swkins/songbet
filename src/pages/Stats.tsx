import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import dayjs from 'dayjs'

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
const ODDS_BANDS = [
  { label:'~1.5',  min:0,   max:1.5  },
  { label:'1.5~2', min:1.5, max:2.0  },
  { label:'2~2.5', min:2.0, max:2.5  },
  { label:'2.5~3', min:2.5, max:3.0  },
  { label:'3~',    min:3.0, max:9999 },
]

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

/* ── 미니 스탯 셀: 적중률 + ROI ── */
function StatCell({ bets }: { bets: Bet[] }) {
  if (!bets.length) return <td style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>—</td>
  const s = calcStats(bets)
  return (
    <td style={{ padding: '3px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 700 }} className={s.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>{s.winRate.toFixed(0)}%</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>({s.total})</div>
      <div style={{ fontSize: 9, fontWeight: 600 }} className={s.roi >= 0 ? 'profit-pos' : 'profit-neg'}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(0)}%</div>
    </td>
  )
}

/* ── 배당별 행 ── */
function OddsRow({ label, bets }: { label: string; bets: Bet[] }) {
  return (
    <tr>
      <td style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', padding: '2px 8px' }}>{label}</td>
      {ODDS_BANDS.map(b => (
        <StatCell key={b.label} bets={bets.filter(x => x.odds >= b.min && x.odds < b.max)} />
      ))}
    </tr>
  )
}

/* ── 라인별 행: pick 문자열에서 라인 추출 ── */
function LineRow({ label, bets, filterFn }: { label: string; bets: Bet[]; filterFn: (b: Bet) => boolean }) {
  const filtered = bets.filter(filterFn)
  if (!filtered.length) return null
  const s = calcStats(filtered)
  return (
    <tr>
      <td style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', padding: '2px 8px' }}>{label}</td>
      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700 }} className={s.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>{s.winRate.toFixed(0)}%</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>({s.total}건)</div>
      </td>
      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700 }} className={s.roi >= 0 ? 'profit-pos' : 'profit-neg'}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</div>
      </td>
      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-num)' }} className={s.profit >= 0 ? 'profit-pos' : 'profit-neg'}>{s.profit >= 0 ? '+' : ''}{s.profit.toLocaleString()}</div>
      </td>
    </tr>
  )
}

/* ── 공통 테이블 헤더 ── */
function DetailTableHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

/* ── 배당별 테이블 (마켓 한 개) ── */
function OddsTable({ title, bets }: { title: string; bets: Bet[] }) {
  const settled = bets.filter(b => b.result !== 'pending')
  return (
    <div className="card" style={{ width: 220, flexShrink: 0 }}>
      <DetailTableHeader title={title} />
      <table style={{ width: '100%', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '2px 8px', fontSize: 9, color: 'var(--text-muted)' }}>배당</th>
            {ODDS_BANDS.map(b => <th key={b.label} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', padding: '2px 4px' }}>{b.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {settled.length > 0
            ? <OddsRow label="" bets={settled} />
            : <tr><td colSpan={6} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', padding: '8px 0' }}>데이터 없음</td></tr>
          }
        </tbody>
      </table>
    </div>
  )
}

/* ── 라인별 테이블 (마켓 한 개, 라인 고정) ── */
function LineTable({ title, rows }: { title: string; rows: { label: string; bets: Bet[]; filterFn: (b: Bet) => boolean }[] }) {
  return (
    <div className="card" style={{ width: 220, flexShrink: 0 }}>
      <DetailTableHeader title={title} />
      <table style={{ width: '100%', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '2px 8px', fontSize: 9, color: 'var(--text-muted)' }}>라인</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--green)', padding: '2px 4px' }}>승률</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--blue)', padding: '2px 4px' }}>ROI</th>
            <th style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', padding: '2px 4px' }}>손익</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const rb = r.bets.filter(b => b.result !== 'pending' && r.filterFn(b))
            if (!rb.length) return (
              <tr key={r.label}>
                <td style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', padding: '2px 8px' }}>{r.label}</td>
                <td colSpan={3} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>—</td>
              </tr>
            )
            return <LineRow key={r.label} label={r.label} bets={r.bets.filter(b => b.result !== 'pending')} filterFn={r.filterFn} />
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── pick 파싱 헬퍼 ── */
function pickHasLine(pick: string, line: string): boolean {
  return pick?.includes(line) ?? false
}
function pickHasOver(pick: string): boolean { return /오버|over/i.test(pick ?? '') }
function pickHasUnder(pick: string): boolean { return /언더|under/i.test(pick ?? '') }

/* ── 종목별 세부 패널 ── */
function SportDetailPanel({ sport, bets }: { sport: Sport; bets: Bet[] }) {
  const sb = bets.filter(b => b.sport === sport && b.result !== 'pending')
  const moneyline = sb.filter(b => b.market === 'moneyline')
  const handicap  = sb.filter(b => b.market === 'handicap')
  const over      = sb.filter(b => b.market === 'over')
  const under     = sb.filter(b => b.market === 'under')

  if (sport === 'soccer') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <OddsTable title="승패 배당별" bets={moneyline} />
        <OddsTable title="-1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-1.5'))} />
        <OddsTable title="0.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '0.5'))} />
        <OddsTable title="1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '1.5') && !pickHasLine(b.pick, '-1.5'))} />
        <OddsTable title="2.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '2.5') && !pickHasLine(b.pick, '-2.5'))} />
        <OddsTable title="2.5 오버 배당별" bets={over.filter(b => pickHasLine(b.pick, '2.5'))} />
        <OddsTable title="2.5 언더 배당별" bets={under.filter(b => pickHasLine(b.pick, '2.5'))} />
      </div>
    )
  }

  if (sport === 'baseball') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <OddsTable title="승패 배당별" bets={moneyline} />
        <OddsTable title="-1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-1.5'))} />
        <LineTable title="오버 라인별" rows={['6.5','7.5','8.5','9.5'].map(l => ({ label: `${l} 오버`, bets: over, filterFn: (b: Bet) => pickHasLine(b.pick, l) }))} />
        <LineTable title="언더 라인별" rows={['6.5','7.5','8.5','9.5'].map(l => ({ label: `${l} 언더`, bets: under, filterFn: (b: Bet) => pickHasLine(b.pick, l) }))} />
      </div>
    )
  }

  if (sport === 'basketball') {
    /* 마핸(-핸디) / 플핸(+핸디) */
    const mhanLines  = ['-1.5','-2.5','-3.5','-4.5','-5.5','-6.5'].map(l => ({ label: l, bets: handicap, filterFn: (b: Bet) => pickHasLine(b.pick, l) }))
    const phanLines  = ['4.5','5.5','6.5','7.5','8.5','9.5','10.5'].map(l => ({ label: `+${l}`, bets: handicap, filterFn: (b: Bet) => pickHasLine(b.pick, l) && !pickHasLine(b.pick,'-') }))
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <OddsTable title="승패 배당별" bets={moneyline} />
        <LineTable title="마핸 라인별" rows={mhanLines} />
        <LineTable title="플핸 라인별" rows={phanLines} />
        <OddsTable title="오버 배당별" bets={over} />
        <OddsTable title="언더 배당별" bets={under} />
      </div>
    )
  }

  if (sport === 'esports') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <OddsTable title="승패 배당별" bets={moneyline} />
        <OddsTable title="-1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-1.5'))} />
        <OddsTable title="-2.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '-2.5'))} />
        <OddsTable title="+1.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '1.5') && !pickHasLine(b.pick, '-1.5'))} />
        <OddsTable title="+2.5 핸디 배당별" bets={handicap.filter(b => pickHasLine(b.pick, '2.5') && !pickHasLine(b.pick, '-2.5'))} />
      </div>
    )
  }

  if (sport === 'volleyball') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <OddsTable title="승패 배당별" bets={moneyline} />
        <OddsTable title="핸디캡 배당별" bets={handicap} />
        <OddsTable title="오버 배당별" bets={over} />
        <OddsTable title="언더 배당별" bets={under} />
      </div>
    )
  }
  if (sport === 'hockey') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <OddsTable title="승패 배당별" bets={moneyline} />
        <OddsTable title="핸디캡 배당별" bets={handicap} />
        <OddsTable title="오버 배당별" bets={over} />
        <OddsTable title="언더 배당별" bets={under} />
      </div>
    )
  }

  /* 기타 */
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <OddsTable title="승패 배당별" bets={moneyline} />
      {handicap.length > 0 && <OddsTable title="핸디캡 배당별" bets={handicap} />}
      {over.length > 0 && <OddsTable title="오버 배당별" bets={over} />}
      {under.length > 0 && <OddsTable title="언더 배당별" bets={under} />}
    </div>
  )
}

/* ── 종목별 패널 ── */
function SportPanel({ bets, sport }: { bets: Bet[]; sport: typeof SPORTS[0] }) {
  const sb    = bets.filter(b => b.sport === sport.value)
  const stats = calcStats(sb)

  const byMarket = (['moneyline', 'handicap', 'over', 'under'] as Market[]).map(mkt => {
    const mb = sb.filter(b => b.market === mkt && b.result !== 'pending')
    if (!mb.length) return null
    const s = calcStats(mb)
    return { mkt, label: MARKET_LABELS[mkt], ...s }
  }).filter(Boolean) as ({ mkt: Market; label: string } & ReturnType<typeof calcStats>)[]

  if (stats.total === 0) return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>결과 처리된 베팅이 없습니다</div>
  )

  const profitCurve = (() => {
    let cum = 0
    return stats.settled.sort((a, b) => a.bet_date.localeCompare(b.bet_date)).map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 요약 타일 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
      </div>

      {/* 마켓별 성적 + 세부 배당/라인 분석을 가로 배치 */}
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
        {/* 종목별 세부 분석 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SportDetailPanel sport={sport.value as Sport} bets={bets} />
        </div>
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
          {/* 종목 탭 */}
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

          {/* 전체 탭 */}
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
            <SportPanel bets={periodFiltered} sport={SPORTS.find(s => s.value === activeSport)!} />
          )}
        </>
      )}
    </div>
  )
}

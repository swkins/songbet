import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market } from '../types'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer, Cell,
} from 'recharts'
import dayjs from 'dayjs'

/* ── 스포츠 정의 (하키 추가) ── */
const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: 'soccer',     label: '축구',    emoji: '⚽' },
  { value: 'baseball',   label: '야구',    emoji: '⚾' },
  { value: 'basketball', label: '농구',    emoji: '🏀' },
  { value: 'volleyball', label: '배구',    emoji: '🏐' },
  { value: 'hockey',     label: '하키',    emoji: '🏒' },
  { value: 'esports',    label: 'LOL',     emoji: '🎮' },
  { value: 'other',      label: '기타',    emoji: '📋' },
]

const MARKET_LABELS: Record<Market, string> = {
  moneyline: '승패', handicap: '핸디캡', over: '오버', under: '언더',
  correct_score: '정확한스코어', other: '기타',
}

/* 배당 구간 */
const ODDS_BANDS = [
  { label: '~1.5',  min: 0,   max: 1.5  },
  { label: '1.5~2', min: 1.5, max: 2.0  },
  { label: '2~2.5', min: 2.0, max: 2.5  },
  { label: '2.5~3', min: 2.5, max: 3.0  },
  { label: '3~',    min: 3.0, max: 9999 },
]

function oddsLabel(odds: number) {
  return ODDS_BANDS.find(b => odds >= b.min && odds < b.max)?.label ?? '기타'
}

/* ── 통계 계산 헬퍼 ── */
function calcStats(bets: Bet[]) {
  const settled = bets.filter(b => b.result !== 'pending')
  const wins    = settled.filter(b => b.result === 'win')
  const losses  = settled.filter(b => b.result === 'loss')
  const pushes  = settled.filter(b => b.result === 'push')
  const total   = settled.length
  const winRate = total > 0 ? wins.length / total * 100 : 0
  const stake   = settled.reduce((s, b) => s + b.stake, 0)
  const profit  = settled.reduce((s, b) => s + b.profit, 0)
  const roi     = stake > 0 ? profit / stake * 100 : 0
  const avgOdds = total > 0 ? settled.reduce((s, b) => s + b.odds, 0) / total : 0
  return { settled, wins, losses, pushes, total, winRate, stake, profit, roi, avgOdds }
}

/* ── 마켓 × 배당구간 테이블 ── */
function MarketOddsTable({ bets }: { bets: Bet[] }) {
  const markets: Market[] = ['moneyline', 'handicap', 'over', 'under']
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 70 }}>마켓</th>
            {ODDS_BANDS.map(b => (
              <th key={b.label} className="td-right" colSpan={2} style={{ background: 'var(--bg-elevated)', fontSize: 9, letterSpacing: 0 }}>
                {b.label}
              </th>
            ))}
          </tr>
          <tr>
            <th />
            {ODDS_BANDS.map(b => (
              <>
                <th key={b.label + 'w'} className="td-right" style={{ fontSize: 9, color: 'var(--green)', fontWeight: 600, paddingTop: 2 }}>승률</th>
                <th key={b.label + 'r'} className="td-right" style={{ fontSize: 9, color: 'var(--blue)', fontWeight: 600, paddingTop: 2 }}>ROI</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {markets.map(mkt => {
            const mBets = bets.filter(b => b.market === mkt && b.result !== 'pending')
            if (mBets.length === 0) return null
            return (
              <tr key={mkt}>
                <td style={{ fontWeight: 700, fontSize: 11 }}>{MARKET_LABELS[mkt]}</td>
                {ODDS_BANDS.map(band => {
                  const band_bets = mBets.filter(b => b.odds >= band.min && b.odds < band.max)
                  if (band_bets.length === 0) return (
                    <>
                      <td key={band.label + 'w'} className="td-right" style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</td>
                      <td key={band.label + 'r'} className="td-right" style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</td>
                    </>
                  )
                  const s = calcStats(band_bets)
                  return (
                    <>
                      <td key={band.label + 'w'} className="td-right">
                        <span style={{ fontSize: 10, fontWeight: 700 }} className={s.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>
                          {s.winRate.toFixed(0)}%
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>({s.total})</span>
                      </td>
                      <td key={band.label + 'r'} className="td-right">
                        <span style={{ fontSize: 10, fontWeight: 700 }} className={s.roi >= 0 ? 'profit-pos' : 'profit-neg'}>
                          {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%
                        </span>
                      </td>
                    </>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── 종목별 상세 패널 ── */
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
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      결과 처리된 베팅이 없습니다
    </div>
  )

  const profitCurve = (() => {
    let cum = 0
    return stats.settled
      .sort((a, b) => a.bet_date.localeCompare(b.bet_date))
      .map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 요약 타일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          { label: '승률', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins.length}W ${stats.losses.length}L ${stats.pushes.length}P`, cls: stats.winRate >= 50 ? 'profit-pos' : 'profit-neg' },
          { label: '총 손익', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit.toLocaleString()}`, sub: `베팅 ${stats.total}건`, cls: stats.profit >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: `총 ${stats.stake.toLocaleString()}`, cls: stats.roi >= 0 ? 'profit-pos' : 'profit-neg' },
          { label: '평균 배당', value: stats.avgOdds.toFixed(2), sub: '', cls: '' },
        ].map(t => (
          <div key={t.label} className="card stat-tile" style={{ padding: '10px 8px' }}>
            <div className={`stat-value ${t.cls}`} style={{ fontSize: 17 }}>{t.value}</div>
            <div className="stat-label">{t.label}</div>
            {t.sub && <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* 마켓별 요약 */}
      {byMarket.length > 0 && (
        <div className="card">
          <div className="card-title">마켓별 성적</div>
          <table>
            <thead><tr><th>마켓</th><th className="td-right">건수</th><th className="td-right">승률</th><th className="td-right">ROI</th><th className="td-right">손익</th></tr></thead>
            <tbody>
              {byMarket.map(r => (
                <tr key={r.mkt}>
                  <td style={{ fontWeight: 700 }}>{r.label}</td>
                  <td className="td-right" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{r.total}</td>
                  <td className="td-right"><span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.winRate.toFixed(0)}%</span></td>
                  <td className="td-right"><span className={r.roi >= 0 ? 'profit-pos' : 'profit-neg'} style={{ fontSize: 11, fontWeight: 700 }}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</span></td>
                  <td className={`td-right td-mono ${r.profit >= 0 ? 'profit-pos' : 'profit-neg'}`} style={{ fontSize: 11 }}>{r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 마켓 × 배당 구간 */}
      <div className="card">
        <div className="card-title">마켓 × 배당 구간별 적중률 / ROI</div>
        <MarketOddsTable bets={sb} />
      </div>

      {/* 손익 곡선 */}
      {profitCurve.length > 1 && (
        <div className="card">
          <div className="card-title">누적 손익 곡선</div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id={`pg-${sport.value}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                formatter={(v: number) => [`${v.toLocaleString()}`, '누적손익']}
                labelFormatter={l => dayjs(l).format('MM/DD')}
              />
              <Area type="monotone" dataKey="profit" stroke={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill={`url(#pg-${sport.value})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

/* ── 메인 통계 페이지 ── */
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

  const stats    = calcStats(periodFiltered)
  const settled  = periodFiltered.filter(b => b.result !== 'pending')

  /* 종목별 건수 (탭 표시용) */
  const sportCounts = SPORTS.map(s => ({
    ...s,
    count: settled.filter(b => b.sport === s.value).length,
  }))

  /* 전체 손익 곡선 */
  const profitCurve = (() => {
    let cum = 0
    return settled
      .sort((a, b) => a.bet_date.localeCompare(b.bet_date))
      .map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } })
  })()

  /* 전체 종목별 막대 */
  const bySport = sportCounts
    .filter(s => s.count > 0)
    .map(s => {
      const sb = settled.filter(b => b.sport === s.value)
      const wins = sb.filter(b => b.result === 'win').length
      return { label: s.label, winRate: Math.round(wins / sb.length * 100), count: sb.length }
    })

  return (
    <div className="page">
      {/* 헤더 */}
      <div className="flex-between mb-16">
        <h1 className="page-title">통계</h1>
        <div className="filter-bar" style={{ margin: 0 }}>
          {(['all', '7d', '30d', '90d'] as const).map(p => (
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
          {/* ── 종목 탭 ── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              className={`filter-chip ${activeSport === 'all' ? 'active' : ''}`}
              onClick={() => setActiveSport('all')}
            >
              📊 전체 <span style={{ opacity: 0.7, fontSize: 10 }}>({settled.length})</span>
            </button>
            {sportCounts.filter(s => s.count > 0).map(s => (
              <button
                key={s.value}
                className={`filter-chip ${activeSport === s.value ? 'active' : ''}`}
                onClick={() => setActiveSport(s.value)}
              >
                {s.emoji} {s.label} <span style={{ opacity: 0.7, fontSize: 10 }}>({s.count})</span>
              </button>
            ))}
          </div>

          {/* ── 전체 탭 ── */}
          {activeSport === 'all' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 요약 타일 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <div className="card stat-tile" style={{ flex: '1 0 140px', minWidth: 130, maxWidth: 200 }}>
                  <div className={`stat-value ${stats.winRate >= 50 ? 'profit-pos' : 'profit-neg'}`}>{stats.winRate.toFixed(1)}%</div>
                  <div className="stat-label">승률</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{stats.wins.length}W {stats.losses.length}L {stats.pushes.length}P</div>
                </div>
                <div className="card stat-tile" style={{ flex: '1 0 140px', minWidth: 130, maxWidth: 200 }}>
                  <div className={`stat-value ${stats.profit >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                    {stats.profit >= 0 ? '+' : ''}{stats.profit.toLocaleString()}
                  </div>
                  <div className="stat-label">총 손익</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>베팅 {stats.total}건</div>
                </div>
                <div className="card stat-tile" style={{ flex: '1 0 140px', minWidth: 130, maxWidth: 200 }}>
                  <div className={`stat-value ${stats.roi >= 0 ? 'profit-pos' : 'profit-neg'}`}>{stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%</div>
                  <div className="stat-label">ROI</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>총 {stats.stake.toLocaleString()}</div>
                </div>
                <div className="card stat-tile" style={{ flex: '1 0 140px', minWidth: 130, maxWidth: 200 }}>
                  <div className="stat-value" style={{ color: 'var(--gold)' }}>{stats.avgOdds.toFixed(2)}</div>
                  <div className="stat-label">평균 배당</div>
                </div>
              </div>

              {/* 손익 곡선 */}
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
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number) => [`${v.toLocaleString()}`, '누적손익']}
                        labelFormatter={l => dayjs(l).format('MM/DD')}
                      />
                      <Area type="monotone" dataKey="profit" stroke={stats.profit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill="url(#pg-all)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 종목별 승률 차트 */}
              {bySport.length > 0 && (
                <div className="card">
                  <div className="card-title">종목별 승률</div>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={bySport} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis hide domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number, _: string, props: { payload?: { count?: number } }) => [`${v}% (${props.payload?.count ?? 0}건)`, '승률']}
                      />
                      <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                        {bySport.map((entry, i) => <Cell key={i} fill={entry.winRate >= 50 ? '#00E87A' : '#FF4D6D'} fillOpacity={0.75} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 전체 마켓 × 배당 구간 */}
              <div className="card">
                <div className="card-title">마켓 × 배당 구간별 적중률 / ROI (전체)</div>
                <MarketOddsTable bets={settled} />
              </div>
            </div>
          )}

          {/* ── 종목별 탭 ── */}
          {activeSport !== 'all' && (
            <SportPanel
              bets={periodFiltered}
              sport={SPORTS.find(s => s.value === activeSport)!}
            />
          )}
        </>
      )}
    </div>
  )
}

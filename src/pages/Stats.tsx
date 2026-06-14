import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market } from '../types'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer, Cell
} from 'recharts'
import dayjs from 'dayjs'

const SPORT_LABELS: Record<Sport, string> = {
  soccer: '축구', baseball: '야구', basketball: '농구',
  volleyball: '배구', esports: 'e스포츠', other: '기타'
}
const MARKET_LABELS: Record<Market, string> = {
  handicap: '핸디캡', over_under: '오버/언더', moneyline: '승패',
  correct_score: '정확한스코어', other: '기타'
}

export default function Stats() {
  const [bets, setBets] = useState<Bet[]>([])
  const [period, setPeriod] = useState<'all' | '7d' | '30d' | '90d'>('all')

  useEffect(() => { loadBets() }, [])

  async function loadBets() {
    const { data } = await supabase
      .from('bets')
      .select('*')
      .neq('result', 'pending')
      .order('bet_date')
    if (data) setBets(data)
  }

  const filtered = bets.filter(b => {
    if (period === 'all') return true
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return dayjs(b.bet_date).isAfter(dayjs().subtract(days, 'day'))
  })

  const settled = filtered.filter(b => b.result !== 'pending')
  const wins = settled.filter(b => b.result === 'win')
  const losses = settled.filter(b => b.result === 'loss')
  const pushes = settled.filter(b => b.result === 'push')

  const winRate = settled.length > 0 ? (wins.length / settled.length * 100) : 0
  const totalStake = settled.reduce((s, b) => s + b.stake, 0)
  const totalProfit = settled.reduce((s, b) => s + b.profit, 0)
  const roi = totalStake > 0 ? (totalProfit / totalStake * 100) : 0
  const avgOdds = settled.length > 0
    ? (settled.reduce((s, b) => s + b.odds, 0) / settled.length)
    : 0

  // 누적 손익 곡선
  const profitCurve = (() => {
    let cum = 0
    return filtered.map(b => {
      cum += b.profit
      return { date: b.bet_date, profit: cum, single: b.profit }
    })
  })()

  // 종목별 통계
  const bySport = Object.entries(
    settled.reduce((acc, b) => {
      if (!acc[b.sport]) acc[b.sport] = { wins: 0, total: 0, profit: 0 }
      acc[b.sport].total++
      if (b.result === 'win') acc[b.sport].wins++
      acc[b.sport].profit += b.profit
      return acc
    }, {} as Record<string, { wins: number; total: number; profit: number }>)
  ).map(([sport, v]) => ({
    label: SPORT_LABELS[sport as Sport] ?? sport,
    winRate: Math.round(v.wins / v.total * 100),
    total: v.total,
    profit: v.profit,
  })).sort((a, b) => b.total - a.total)

  // 마켓별 통계
  const byMarket = Object.entries(
    settled.reduce((acc, b) => {
      if (!acc[b.market]) acc[b.market] = { wins: 0, total: 0, profit: 0 }
      acc[b.market].total++
      if (b.result === 'win') acc[b.market].wins++
      acc[b.market].profit += b.profit
      return acc
    }, {} as Record<string, { wins: number; total: number; profit: number }>)
  ).map(([market, v]) => ({
    label: MARKET_LABELS[market as Market] ?? market,
    winRate: Math.round(v.wins / v.total * 100),
    total: v.total,
    profit: v.profit,
  })).sort((a, b) => b.total - a.total)

  // 최근 연속 기록
  const streak = (() => {
    if (settled.length === 0) return { count: 0, type: '' }
    const sorted = [...settled].sort((a, b) => b.bet_date.localeCompare(a.bet_date))
    const first = sorted[0].result
    let count = 0
    for (const b of sorted) {
      if (b.result === first) count++
      else break
    }
    return { count, type: first }
  })()

  return (
    <div className="page">
      <div className="flex-between mb-24">
        <h1 className="page-title">통계</h1>
        <div className="flex-center gap-4">
          {(['all', '7d', '30d', '90d'] as const).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}>
              {p === 'all' ? '전체' : p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
            </button>
          ))}
        </div>
      </div>

      {settled.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📊</div>
            결과가 처리된 베팅이 없습니다
          </div>
        </div>
      ) : (
        <>
          {/* 핵심 지표 */}
          <div className="grid-4 mb-16">
            <div className="card stat-tile">
              <div className={`stat-value ${winRate >= 50 ? 'profit-pos' : 'profit-neg'}`}>
                {winRate.toFixed(1)}%
              </div>
              <div className="stat-label">승률</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {wins.length}W {losses.length}L {pushes.length}P
              </div>
            </div>
            <div className="card stat-tile">
              <div className={`stat-value ${totalProfit >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toLocaleString()}
              </div>
              <div className="stat-label">총 손익 (원)</div>
            </div>
            <div className="card stat-tile">
              <div className={`stat-value ${roi >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
              </div>
              <div className="stat-label">ROI</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                총 베팅 {totalStake.toLocaleString()}원
              </div>
            </div>
            <div className="card stat-tile">
              <div className="stat-value" style={{ color: 'var(--accent)' }}>
                {avgOdds.toFixed(2)}
              </div>
              <div className="stat-label">평균 배당</div>
              {streak.count > 1 && (
                <div style={{ fontSize: 11, marginTop: 4 }}
                  className={streak.type === 'win' ? 'profit-pos' : 'profit-neg'}>
                  {streak.type === 'win' ? '🔥' : '❄️'} {streak.count}연속 {streak.type === 'win' ? '적중' : '실패'}
                </div>
              )}
            </div>
          </div>

          {/* 누적 손익 곡선 */}
          <div className="card mb-16">
            <div className="card-title">누적 손익 곡선</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={totalProfit >= 0 ? '#2E7D52' : '#B94040'} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={totalProfit >= 0 ? '#2E7D52' : '#B94040'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickFormatter={d => dayjs(d).format('MM/DD')} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v.toLocaleString()}원`, '누적손익']}
                  labelFormatter={l => dayjs(l).format('YYYY-MM-DD')} />
                <Area type="monotone" dataKey="profit"
                  stroke={totalProfit >= 0 ? '#2E7D52' : '#B94040'}
                  strokeWidth={2} fill="url(#profitGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2 mb-16">
            {/* 종목별 */}
            <div className="card">
              <div className="card-title">종목별 통계</div>
              {bySport.length === 0
                ? <div className="empty">데이터 없음</div>
                : (
                  <div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>종목</th>
                            <th className="td-right">베팅</th>
                            <th className="td-right">승률</th>
                            <th className="td-right">손익</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bySport.map(r => (
                            <tr key={r.label}>
                              <td style={{ fontWeight: 500 }}>{r.label}</td>
                              <td className="td-right td-mono" style={{ color: 'var(--text-muted)' }}>{r.total}</td>
                              <td className="td-right">
                                <span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>
                                  {r.winRate}%
                                </span>
                              </td>
                              <td className={`td-right td-mono ${r.profit >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                                {r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={bySport} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => [`${v}%`, '승률']} />
                          <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                            {bySport.map((entry, i) => (
                              <Cell key={i} fill={entry.winRate >= 50 ? '#2E7D52' : '#B94040'} fillOpacity={0.7} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
            </div>

            {/* 마켓별 */}
            <div className="card">
              <div className="card-title">마켓별 통계</div>
              {byMarket.length === 0
                ? <div className="empty">데이터 없음</div>
                : (
                  <div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>마켓</th>
                            <th className="td-right">베팅</th>
                            <th className="td-right">승률</th>
                            <th className="td-right">손익</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byMarket.map(r => (
                            <tr key={r.label}>
                              <td style={{ fontWeight: 500 }}>{r.label}</td>
                              <td className="td-right td-mono" style={{ color: 'var(--text-muted)' }}>{r.total}</td>
                              <td className="td-right">
                                <span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>
                                  {r.winRate}%
                                </span>
                              </td>
                              <td className={`td-right td-mono ${r.profit >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                                {r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={byMarket} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => [`${v}%`, '승률']} />
                          <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                            {byMarket.map((entry, i) => (
                              <Cell key={i} fill={entry.winRate >= 50 ? '#3D6B8E' : '#B94040'} fillOpacity={0.7} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

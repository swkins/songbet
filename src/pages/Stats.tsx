import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import dayjs from 'dayjs'

const SPORT_LABELS: Record<Sport, string> = { soccer: '축구', baseball: '야구', basketball: '농구', volleyball: '배구', esports: 'e스포츠', other: '기타' }
const MARKET_LABELS: Record<Market, string> = { handicap: '핸디캡', over_under: '오버/언더', moneyline: '승패', correct_score: '정확한스코어', other: '기타' }

export default function Stats() {
  const [bets, setBets] = useState<Bet[]>([])
  const [period, setPeriod] = useState<'all' | '7d' | '30d' | '90d'>('all')

  useEffect(() => { loadBets() }, [])

  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').neq('result', 'pending').order('bet_date')
    if (data) setBets(data)
  }

  const filtered = bets.filter(b => {
    if (period === 'all') return true
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return dayjs(b.bet_date).isAfter(dayjs().subtract(days, 'day'))
  })

  const wins = filtered.filter(b => b.result === 'win')
  const losses = filtered.filter(b => b.result === 'loss')
  const pushes = filtered.filter(b => b.result === 'push')
  const winRate = filtered.length > 0 ? (wins.length / filtered.length * 100) : 0
  const totalStake = filtered.reduce((s, b) => s + b.stake, 0)
  const totalProfit = filtered.reduce((s, b) => s + b.profit, 0)
  const roi = totalStake > 0 ? (totalProfit / totalStake * 100) : 0
  const avgOdds = filtered.length > 0 ? (filtered.reduce((s, b) => s + b.odds, 0) / filtered.length) : 0

  const profitCurve = (() => { let cum = 0; return filtered.map(b => { cum += b.profit; return { date: b.bet_date, profit: cum } }) })()

  const bySport = Object.entries(filtered.reduce((acc, b) => {
    if (!acc[b.sport]) acc[b.sport] = { wins: 0, total: 0, profit: 0 }
    acc[b.sport].total++; if (b.result === 'win') acc[b.sport].wins++; acc[b.sport].profit += b.profit; return acc
  }, {} as Record<string, { wins: number; total: number; profit: number }>)).map(([sport, v]) => ({
    label: SPORT_LABELS[sport as Sport] ?? sport, winRate: Math.round(v.wins / v.total * 100), total: v.total, profit: v.profit
  })).sort((a, b) => b.total - a.total)

  const byMarket = Object.entries(filtered.reduce((acc, b) => {
    if (!acc[b.market]) acc[b.market] = { wins: 0, total: 0, profit: 0 }
    acc[b.market].total++; if (b.result === 'win') acc[b.market].wins++; acc[b.market].profit += b.profit; return acc
  }, {} as Record<string, { wins: number; total: number; profit: number }>)).map(([market, v]) => ({
    label: MARKET_LABELS[market as Market] ?? market, winRate: Math.round(v.wins / v.total * 100), total: v.total, profit: v.profit
  })).sort((a, b) => b.total - a.total)

  const streak = (() => {
    if (filtered.length === 0) return { count: 0, type: '' }
    const sorted = [...filtered].sort((a, b) => b.bet_date.localeCompare(a.bet_date))
    const first = sorted[0].result; let count = 0
    for (const b of sorted) { if (b.result === first) count++; else break }
    return { count, type: first }
  })()

  return (
    <div className="page">
      <div className="flex-between mb-20">
        <h1 className="page-title">통계</h1>
        <div className="filter-bar" style={{ margin: 0 }}>
          {(['all', '7d', '30d', '90d'] as const).map(p => (
            <button key={p} className={`filter-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'all' ? '전체' : p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">📊</div>결과 처리된 베팅이 없습니다</div></div>
      ) : (
        <>
          <div className="grid-4 mb-16">
            <div className="card stat-tile">
              <div className={`stat-value ${winRate >= 50 ? 'profit-pos' : 'profit-neg'}`}>{winRate.toFixed(1)}%</div>
              <div className="stat-label">승률</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{wins.length}W {losses.length}L {pushes.length}P</div>
            </div>
            <div className="card stat-tile">
              <div className={`stat-value ${totalProfit >= 0 ? 'profit-pos' : 'profit-neg'}`}>
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toLocaleString()}
              </div>
              <div className="stat-label">총 손익 (원)</div>
            </div>
            <div className="card stat-tile">
              <div className={`stat-value ${roi >= 0 ? 'profit-pos' : 'profit-neg'}`}>{roi >= 0 ? '+' : ''}{roi.toFixed(1)}%</div>
              <div className="stat-label">ROI</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>총 {totalStake.toLocaleString()}원</div>
            </div>
            <div className="card stat-tile">
              <div className="stat-value" style={{ color: 'var(--gold)' }}>{avgOdds.toFixed(2)}</div>
              <div className="stat-label">평균 배당</div>
              {streak.count > 1 && (
                <div style={{ fontSize: 10, marginTop: 4 }} className={streak.type === 'win' ? 'profit-pos' : 'profit-neg'}>
                  {streak.type === 'win' ? '🔥' : '❄️'} {streak.count}연속 {streak.type === 'win' ? '적중' : '실패'}
                </div>
              )}
            </div>
          </div>

          <div className="card mb-16">
            <div className="card-title">누적 손익 곡선</div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={profitCurve} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={totalProfit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={totalProfit >= 0 ? '#00E87A' : '#FF4D6D'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={d => dayjs(d).format('MM/DD')} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number) => [`${v.toLocaleString()}원`, '누적손익']}
                  labelFormatter={l => dayjs(l).format('YYYY-MM-DD')} />
                <Area type="monotone" dataKey="profit" stroke={totalProfit >= 0 ? '#00E87A' : '#FF4D6D'} strokeWidth={2} fill="url(#pg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2">
            {[{ title: '종목별', data: bySport }, { title: '마켓별', data: byMarket }].map(({ title, data }) => (
              <div key={title} className="card">
                <div className="card-title">{title}</div>
                <table style={{ marginBottom: 12 }}>
                  <thead><tr><th>항목</th><th className="td-right">건수</th><th className="td-right">승률</th><th className="td-right">손익</th></tr></thead>
                  <tbody>
                    {data.map(r => (
                      <tr key={r.label}>
                        <td style={{ fontWeight: 600 }}>{r.label}</td>
                        <td className="td-right" style={{ color: 'var(--text-secondary)' }}>{r.total}</td>
                        <td className="td-right"><span className={r.winRate >= 50 ? 'profit-pos' : 'profit-neg'}>{r.winRate}%</span></td>
                        <td className={`td-right td-mono ${r.profit >= 0 ? 'profit-pos' : 'profit-neg'}`}>{r.profit >= 0 ? '+' : ''}{r.profit.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ResponsiveContainer width="100%" height={90}>
                  <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: number) => [`${v}%`, '승률']} />
                    <Bar dataKey="winRate" radius={[3, 3, 0, 0]}>
                      {data.map((entry, i) => <Cell key={i} fill={entry.winRate >= 50 ? '#00E87A' : '#FF4D6D'} fillOpacity={0.7} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

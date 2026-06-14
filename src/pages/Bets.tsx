import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer', label: '축구' },
  { value: 'baseball', label: '야구' },
  { value: 'basketball', label: '농구' },
  { value: 'volleyball', label: '배구' },
  { value: 'esports', label: 'e스포츠' },
  { value: 'other', label: '기타' },
]

const MARKETS: { value: Market; label: string }[] = [
  { value: 'handicap', label: '핸디캡' },
  { value: 'over_under', label: '오버/언더' },
  { value: 'moneyline', label: '승패' },
  { value: 'correct_score', label: '정확한스코어' },
  { value: 'other', label: '기타' },
]

const RESULTS: { value: BetResult; label: string }[] = [
  { value: 'pending', label: '대기중' },
  { value: 'win', label: '적중' },
  { value: 'loss', label: '실패' },
  { value: 'push', label: '적특' },
]

const sportLabel = (s: Sport) => SPORTS.find(x => x.value === s)?.label ?? s
const marketLabel = (m: Market) => MARKETS.find(x => x.value === m)?.label ?? m

const emptyForm = () => ({
  bet_date: dayjs().format('YYYY-MM-DD'),
  sport: 'soccer' as Sport,
  league: '',
  match: '',
  market: 'handicap' as Market,
  pick: '',
  odds: '',
  stake: '',
  result: 'pending' as BetResult,
  memo: '',
})

export default function Bets() {
  const [bets, setBets] = useState<Bet[]>([])
  const [filter, setFilter] = useState<BetResult | 'all'>('all')
  const [sportFilter, setSportFilter] = useState<Sport | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [showResultModal, setShowResultModal] = useState(false)
  const [resultTarget, setResultTarget] = useState<Bet | null>(null)
  const [resultValue, setResultValue] = useState<BetResult>('win')

  useEffect(() => { loadBets() }, [])

  async function loadBets() {
    const { data } = await supabase
      .from('bets')
      .select('*')
      .order('bet_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setBets(data)
  }

  function openAdd() {
    setForm(emptyForm())
    setEditId(null)
    setShowModal(true)
  }

  function openEdit(b: Bet) {
    setForm({
      bet_date: b.bet_date,
      sport: b.sport,
      league: b.league,
      match: b.match,
      market: b.market,
      pick: b.pick,
      odds: String(b.odds),
      stake: String(b.stake),
      result: b.result,
      memo: b.memo,
    })
    setEditId(b.id)
    setShowModal(true)
  }

  async function saveBet() {
    if (!form.match || !form.odds || !form.stake) return

    const odds = Number(form.odds)
    const stake = Number(form.stake)
    const profit = form.result === 'win' ? Math.round(stake * (odds - 1))
      : form.result === 'loss' ? -stake
      : 0

    const payload = {
      bet_date: form.bet_date,
      sport: form.sport,
      league: form.league,
      match: form.match,
      market: form.market,
      pick: form.pick,
      odds,
      stake,
      result: form.result,
      profit,
      memo: form.memo,
    }

    if (editId) {
      const { data } = await supabase.from('bets').update(payload).eq('id', editId).select().single()
      if (data) setBets(p => p.map(b => b.id === editId ? data : b))
    } else {
      const { data } = await supabase.from('bets').insert(payload).select().single()
      if (data) setBets(p => [data, ...p])
    }
    setShowModal(false)
  }

  async function deleteBet(id: string) {
    if (!confirm('이 베팅을 삭제할까요?')) return
    await supabase.from('bets').delete().eq('id', id)
    setBets(p => p.filter(b => b.id !== id))
  }

  function openResult(b: Bet) {
    setResultTarget(b)
    setResultValue(b.result === 'pending' ? 'win' : b.result)
    setShowResultModal(true)
  }

  async function saveResult() {
    if (!resultTarget) return
    const odds = resultTarget.odds
    const stake = resultTarget.stake
    const profit = resultValue === 'win' ? Math.round(stake * (odds - 1))
      : resultValue === 'loss' ? -stake : 0
    const { data } = await supabase
      .from('bets')
      .update({ result: resultValue, profit })
      .eq('id', resultTarget.id)
      .select().single()
    if (data) setBets(p => p.map(b => b.id === resultTarget.id ? data : b))
    setShowResultModal(false)
  }

  const filtered = bets.filter(b => {
    if (filter !== 'all' && b.result !== filter) return false
    if (sportFilter !== 'all' && b.sport !== sportFilter) return false
    return true
  })

  const pending = bets.filter(b => b.result === 'pending')

  return (
    <div className="page">
      <div className="flex-between mb-24">
        <h1 className="page-title">베팅 목록</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={15} /> 베팅 추가
        </button>
      </div>

      {/* 대기 중 베팅 */}
      {pending.length > 0 && (
        <div className="card mb-16" style={{ borderLeft: '3px solid var(--yellow)' }}>
          <div className="card-title mb-12">결과 대기 중 ({pending.length}건)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(b => (
              <div key={b.id} className="flex-between" style={{
                background: 'var(--yellow-bg)', padding: '10px 14px',
                borderRadius: 'var(--radius-sm)'
              }}>
                <div>
                  <span style={{ fontWeight: 600, marginRight: 8 }}>{b.match}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {b.pick} · {b.odds} · {b.stake.toLocaleString()}원
                  </span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openResult(b)}>
                  결과 처리
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="filter-bar">
        {(['all', 'pending', 'win', 'loss', 'push'] as const).map(v => (
          <button key={v} className={`filter-chip ${filter === v ? 'active' : ''}`}
            onClick={() => setFilter(v)}>
            {v === 'all' ? '전체' : v === 'pending' ? '대기' : v === 'win' ? '적중' : v === 'loss' ? '실패' : '적특'}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {(['all', ...SPORTS.map(s => s.value)] as const).map(v => (
          <button key={v} className={`filter-chip ${sportFilter === v ? 'active' : ''}`}
            onClick={() => setSportFilter(v as Sport | 'all')}>
            {v === 'all' ? '전종목' : sportLabel(v as Sport)}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🎯</div>
            베팅 내역이 없습니다
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>종목</th>
                  <th>경기</th>
                  <th>리그</th>
                  <th>마켓</th>
                  <th>픽</th>
                  <th className="td-right">배당</th>
                  <th className="td-right">베팅액</th>
                  <th className="td-right">손익</th>
                  <th>결과</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.bet_date}</td>
                    <td><span className="badge badge-pending" style={{ fontSize: 11 }}>{sportLabel(b.sport)}</span></td>
                    <td style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.match}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{b.league || '-'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{marketLabel(b.market)}</td>
                    <td style={{ fontWeight: 500 }}>{b.pick}</td>
                    <td className="td-right td-mono">{b.odds.toFixed(2)}</td>
                    <td className="td-right td-mono">{b.stake.toLocaleString()}</td>
                    <td className={`td-right td-mono ${b.profit > 0 ? 'profit-pos' : b.profit < 0 ? 'profit-neg' : 'profit-zero'}`}>
                      {b.result === 'pending' ? '-' : `${b.profit >= 0 ? '+' : ''}${b.profit.toLocaleString()}`}
                    </td>
                    <td>
                      <span className={`badge badge-${b.result}`}>
                        {b.result === 'pending' ? '대기' : b.result === 'win' ? '적중' : b.result === 'loss' ? '실패' : '적특'}
                      </span>
                    </td>
                    <td>
                      <div className="flex-center gap-4">
                        {b.result === 'pending' && (
                          <button className="btn btn-icon btn-ghost btn-sm" onClick={() => openResult(b)} title="결과처리">
                            <Check size={13} color="var(--green)" />
                          </button>
                        )}
                        <button className="btn btn-icon btn-ghost btn-sm" onClick={() => openEdit(b)}>
                          <Pencil size={13} color="var(--text-muted)" />
                        </button>
                        <button className="btn btn-icon btn-danger btn-sm" onClick={() => deleteBet(b.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 베팅 추가/수정 모달 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editId ? '베팅 수정' : '베팅 추가'}</div>

            <div className="form-row form-row-3 mb-12">
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input type="date" className="form-input"
                  value={form.bet_date}
                  onChange={e => setForm(p => ({ ...p, bet_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">종목</label>
                <select className="form-select"
                  value={form.sport}
                  onChange={e => setForm(p => ({ ...p, sport: e.target.value as Sport }))}>
                  {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">리그</label>
                <input className="form-input" placeholder="EPL, KBO..."
                  value={form.league}
                  onChange={e => setForm(p => ({ ...p, league: e.target.value }))} />
              </div>
            </div>

            <div className="form-group mb-12">
              <label className="form-label">경기</label>
              <input className="form-input" placeholder="홈팀 vs 원정팀"
                value={form.match}
                onChange={e => setForm(p => ({ ...p, match: e.target.value }))} />
            </div>

            <div className="form-row form-row-2 mb-12">
              <div className="form-group">
                <label className="form-label">마켓</label>
                <select className="form-select"
                  value={form.market}
                  onChange={e => setForm(p => ({ ...p, market: e.target.value as Market }))}>
                  {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">픽 (선택 항목)</label>
                <input className="form-input" placeholder="예: 홈 -1.5, 언더 2.5"
                  value={form.pick}
                  onChange={e => setForm(p => ({ ...p, pick: e.target.value }))} />
              </div>
            </div>

            <div className="form-row form-row-3 mb-12">
              <div className="form-group">
                <label className="form-label">배당</label>
                <input type="number" step="0.01" className="form-input" placeholder="1.90"
                  value={form.odds}
                  onChange={e => setForm(p => ({ ...p, odds: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">베팅액 (원)</label>
                <input type="number" className="form-input" placeholder="10000"
                  value={form.stake}
                  onChange={e => setForm(p => ({ ...p, stake: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">결과</label>
                <select className="form-select"
                  value={form.result}
                  onChange={e => setForm(p => ({ ...p, result: e.target.value as BetResult }))}>
                  {RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">메모</label>
              <textarea className="form-textarea" placeholder="메모 (선택)"
                value={form.memo}
                onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                <X size={14} /> 취소
              </button>
              <button className="btn btn-primary" onClick={saveBet}>
                <Check size={14} /> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 처리 모달 */}
      {showResultModal && resultTarget && (
        <div className="modal-overlay" onClick={() => setShowResultModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">결과 처리</div>
            <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 14 }}>
              <strong>{resultTarget.match}</strong><br />
              픽: {resultTarget.pick} · 배당: {resultTarget.odds} · 베팅액: {resultTarget.stake.toLocaleString()}원
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {(['win', 'loss', 'push'] as const).map(r => (
                <button key={r}
                  className={`btn ${resultValue === r ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ flex: 1 }}
                  onClick={() => setResultValue(r)}>
                  {r === 'win' ? '✅ 적중' : r === 'loss' ? '❌ 실패' : '↩️ 적특'}
                </button>
              ))}
            </div>
            {resultValue === 'win' && (
              <div style={{ background: 'var(--green-bg)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
                예상 수익: <strong className="profit-pos">+{Math.round(resultTarget.stake * (resultTarget.odds - 1)).toLocaleString()}원</strong>
              </div>
            )}
            {resultValue === 'loss' && (
              <div style={{ background: 'var(--red-bg)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
                손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowResultModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

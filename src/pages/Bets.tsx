import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Bet, Site, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, Check, X, Pencil, Settings } from 'lucide-react'

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

const sportLabel = (s: Sport) => SPORTS.find(x => x.value === s)?.label ?? s
const marketLabel = (m: Market) => MARKETS.find(x => x.value === m)?.label ?? m

const emptyBetForm = (siteId: string) => ({
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
  site_id: siteId,
})

export default function Bets() {
  const [sites, setSites] = useState<Site[]>([])
  const [bets, setBets] = useState<Bet[]>([])

  // 사이트 관리 모달
  const [showSiteModal, setShowSiteModal] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')

  // 입금 모달
  const [depositSite, setDepositSite] = useState<Site | null>(null)
  const [depositAmount, setDepositAmount] = useState('')

  // 베팅 추가 모달
  const [betFormSite, setBetFormSite] = useState<Site | null>(null)
  const [betForm, setBetForm] = useState(emptyBetForm(''))
  const [editBetId, setEditBetId] = useState<string | null>(null)

  // 결과 처리 모달
  const [resultTarget, setResultTarget] = useState<Bet | null>(null)
  const [resultValue, setResultValue] = useState<BetResult>('win')

  useEffect(() => { loadSites(); loadBets() }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').order('sort_order')
    if (data) setSites(data)
  }

  async function loadBets() {
    const { data } = await supabase
      .from('bets').select('*')
      .order('bet_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setBets(data)
  }

  // 사이트 추가
  async function addSite() {
    if (!newSiteName.trim()) return
    const { data } = await supabase
      .from('sites')
      .insert({ name: newSiteName.trim(), balance: 0, active: false, sort_order: sites.length })
      .select().single()
    if (data) { setSites(p => [...p, data]); setNewSiteName('') }
  }

  // 사이트 삭제
  async function deleteSite(id: string) {
    if (!confirm('사이트를 삭제할까요? 관련 베팅 기록은 유지됩니다.')) return
    await supabase.from('sites').delete().eq('id', id)
    setSites(p => p.filter(s => s.id !== id))
  }

  // 입금 처리
  async function depositToSite() {
    if (!depositSite || !depositAmount) return
    const amount = Number(depositAmount)
    const newBalance = depositSite.balance + amount
    const { data } = await supabase
      .from('sites')
      .update({ balance: newBalance, active: true })
      .eq('id', depositSite.id).select().single()
    if (data) {
      setSites(p => p.map(s => s.id === depositSite.id ? data : s))
      setDepositSite(null)
      setDepositAmount('')
    }
  }

  // 베팅 저장
  async function saveBet() {
    if (!betForm.match || !betForm.odds || !betForm.stake) return
    const odds = Number(betForm.odds)
    const stake = Number(betForm.stake)
    const profit = betForm.result === 'win' ? Math.round(stake * (odds - 1))
      : betForm.result === 'loss' ? -stake : 0

    const payload = {
      bet_date: betForm.bet_date,
      sport: betForm.sport,
      league: betForm.league,
      match: betForm.match,
      market: betForm.market,
      pick: betForm.pick,
      odds, stake,
      result: betForm.result,
      profit,
      memo: betForm.memo,
      site_id: betForm.site_id || null,
    }

    // 사이트 잔액 차감 (베팅액)
    const site = sites.find(s => s.id === betForm.site_id)

    if (editBetId) {
      const { data } = await supabase.from('bets').update(payload).eq('id', editBetId).select().single()
      if (data) setBets(p => p.map(b => b.id === editBetId ? data : b))
    } else {
      const { data } = await supabase.from('bets').insert(payload).select().single()
      if (data) {
        setBets(p => [data, ...p])
        // 잔액에서 베팅액 차감
        if (site) {
          const newBal = site.balance - stake
          const { data: sd } = await supabase.from('sites').update({ balance: newBal }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === site.id ? sd : s))
        }
      }
    }
    setBetFormSite(null)
  }

  // 결과 처리
  async function saveResult() {
    if (!resultTarget) return
    const { stake, odds } = resultTarget
    const profit = resultValue === 'win' ? Math.round(stake * (odds - 1))
      : resultValue === 'loss' ? -stake : 0
    const { data } = await supabase
      .from('bets').update({ result: resultValue, profit })
      .eq('id', resultTarget.id).select().single()
    if (data) {
      setBets(p => p.map(b => b.id === resultTarget.id ? data : b))
      // 사이트 잔액에 수익 반영
      const site = sites.find(s => s.id === resultTarget.site_id)
      if (site) {
        // 적중: 베팅액+수익 복귀, 실패: 이미 차감됨, 적특: 베팅액 복귀
        const delta = resultValue === 'win' ? stake + profit
          : resultValue === 'push' ? stake : 0
        if (delta !== 0) {
          const { data: sd } = await supabase.from('sites')
            .update({ balance: site.balance + delta }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === site.id ? sd : s))
        }
      }
    }
    setResultTarget(null)
  }

  async function deleteBet(bet: Bet) {
    if (!confirm('삭제할까요?')) return
    await supabase.from('bets').delete().eq('id', bet.id)
    setBets(p => p.filter(b => b.id !== bet.id))
  }

  const activeSites = sites.filter(s => s.active)
  const betsBySite = (siteId: string) => bets.filter(b => b.site_id === siteId)

  return (
    <div className="page">
      {/* 상단: 사이트관리 버튼 */}
      <div className="flex-between mb-20">
        <h1 className="page-title" style={{ marginBottom: 0 }}>베팅</h1>
        <button className="btn btn-ghost" onClick={() => setShowSiteModal(true)}>
          <Settings size={14} /> 사이트 관리
        </button>
      </div>

      {/* 비활성 사이트 안내 */}
      {sites.length === 0 && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🎰</div>
            사이트 관리에서 베팅 사이트를 추가하세요
          </div>
        </div>
      )}

      {/* 비활성 사이트 목록 (입금 전) */}
      {sites.filter(s => !s.active).length > 0 && (
        <div className="mb-16">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
            입금 대기 중인 사이트
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sites.filter(s => !s.active).map(s => (
              <button key={s.id}
                className="btn btn-ghost"
                onClick={() => { setDepositSite(s); setDepositAmount('') }}
              >
                {s.name} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>입금</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 활성화된 사이트 컬럼들 (가로 스크롤) */}
      {activeSites.length > 0 && (
        <div className="site-columns">
          {activeSites.map(site => {
            const siteBets = betsBySite(site.id)
            const pending = siteBets.filter(b => b.result === 'pending')
            return (
              <div key={site.id} className="site-col">
                {/* 사이트 헤더 */}
                <div className="site-header active">
                  <div className="flex-between">
                    <div>
                      <div className="site-name">{site.name}</div>
                      <div className="site-balance" style={{
                        color: site.balance >= 0 ? 'var(--green)' : 'var(--red)'
                      }}>
                        {site.balance.toLocaleString()}원
                      </div>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => {
                        setBetForm(emptyBetForm(site.id))
                        setEditBetId(null)
                        setBetFormSite(site)
                      }}>
                      <Plus size={13} />
                    </button>
                  </div>
                  {/* 입금 버튼 */}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 8, width: '100%', fontSize: 11 }}
                    onClick={() => { setDepositSite(site); setDepositAmount('') }}
                  >
                    + 입금
                  </button>
                  {pending.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 6 }}>
                      대기 {pending.length}건
                    </div>
                  )}
                </div>

                {/* 해당 사이트 베팅 목록 */}
                {siteBets.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                    베팅 없음
                  </div>
                ) : (
                  siteBets.map(b => (
                    <div key={b.id} className="site-bet-card">
                      <div className="flex-between mb-4">
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{b.match}</span>
                        <span className={`badge badge-${b.result}`}>
                          {b.result === 'pending' ? '대기' : b.result === 'win' ? '적중' : b.result === 'loss' ? '실패' : '적특'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {sportLabel(b.sport)} · {marketLabel(b.market)} · {b.pick}
                      </div>
                      <div className="flex-between">
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {b.odds} · {b.stake.toLocaleString()}원
                        </span>
                        <span className={`${b.profit > 0 ? 'profit-pos' : b.profit < 0 ? 'profit-neg' : 'profit-zero'}`}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {b.result !== 'pending' ? `${b.profit >= 0 ? '+' : ''}${b.profit.toLocaleString()}` : '—'}
                        </span>
                      </div>
                      <div className="flex-center gap-4" style={{ marginTop: 8 }}>
                        {b.result === 'pending' && (
                          <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }}
                            onClick={() => { setResultTarget(b); setResultValue('win') }}>
                            결과 처리
                          </button>
                        )}
                        <button className="btn btn-icon btn-ghost btn-sm"
                          onClick={() => {
                            setBetForm({
                              bet_date: b.bet_date, sport: b.sport, league: b.league,
                              match: b.match, market: b.market, pick: b.pick,
                              odds: String(b.odds), stake: String(b.stake),
                              result: b.result, memo: b.memo, site_id: b.site_id ?? '',
                            })
                            setEditBetId(b.id)
                            setBetFormSite(site)
                          }}>
                          <Pencil size={11} />
                        </button>
                        <button className="btn btn-icon btn-danger btn-sm" onClick={() => deleteBet(b)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── 사이트 관리 모달 ── */}
      {showSiteModal && (
        <div className="modal-overlay" onClick={() => setShowSiteModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">사이트 관리</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {sites.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  등록된 사이트가 없습니다
                </div>
              )}
              {sites.map(s => (
                <div key={s.id} className="flex-between" style={{
                  padding: '10px 14px', background: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)'
                }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: s.active ? 'var(--green)' : 'var(--text-muted)', marginLeft: 8 }}>
                      {s.active ? '활성' : '대기중'}
                    </span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteSite(s.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex-center gap-8">
              <input className="form-input" placeholder="사이트 이름 (예: 1xBet, EZBET)"
                value={newSiteName}
                onChange={e => setNewSiteName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSite()} />
              <button className="btn btn-primary" onClick={addSite} style={{ flexShrink: 0 }}>
                <Plus size={14} /> 추가
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSiteModal(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 입금 모달 ── */}
      {depositSite && (
        <div className="modal-overlay" onClick={() => setDepositSite(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{depositSite.name} 입금</div>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
              현재 잔액: <strong>{depositSite.balance.toLocaleString()}원</strong>
            </div>
            <div className="form-group">
              <label className="form-label">입금액 (원)</label>
              <input type="number" className="form-input" placeholder="0"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && depositToSite()}
                autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDepositSite(null)}>취소</button>
              <button className="btn btn-primary" onClick={depositToSite}>입금 확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 베팅 추가/수정 모달 ── */}
      {betFormSite && (
        <div className="modal-overlay" onClick={() => setBetFormSite(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {editBetId ? '베팅 수정' : `${betFormSite.name} · 베팅 추가`}
            </div>
            <div className="form-row form-row-3 mb-12">
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input type="date" className="form-input"
                  value={betForm.bet_date}
                  onChange={e => setBetForm(p => ({ ...p, bet_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">종목</label>
                <select className="form-select"
                  value={betForm.sport}
                  onChange={e => setBetForm(p => ({ ...p, sport: e.target.value as Sport }))}>
                  {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">리그</label>
                <input className="form-input" placeholder="EPL, KBO..."
                  value={betForm.league}
                  onChange={e => setBetForm(p => ({ ...p, league: e.target.value }))} />
              </div>
            </div>
            <div className="form-group mb-12">
              <label className="form-label">경기</label>
              <input className="form-input" placeholder="홈팀 vs 원정팀"
                value={betForm.match}
                onChange={e => setBetForm(p => ({ ...p, match: e.target.value }))} />
            </div>
            <div className="form-row form-row-2 mb-12">
              <div className="form-group">
                <label className="form-label">마켓</label>
                <select className="form-select"
                  value={betForm.market}
                  onChange={e => setBetForm(p => ({ ...p, market: e.target.value as Market }))}>
                  {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">픽</label>
                <input className="form-input" placeholder="예: 홈 -1.5, 언더 2.5"
                  value={betForm.pick}
                  onChange={e => setBetForm(p => ({ ...p, pick: e.target.value }))} />
              </div>
            </div>
            <div className="form-row form-row-3 mb-12">
              <div className="form-group">
                <label className="form-label">배당</label>
                <input type="number" step="0.01" className="form-input" placeholder="1.90"
                  value={betForm.odds}
                  onChange={e => setBetForm(p => ({ ...p, odds: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">베팅액 (원)</label>
                <input type="number" className="form-input" placeholder="10000"
                  value={betForm.stake}
                  onChange={e => setBetForm(p => ({ ...p, stake: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">결과</label>
                <select className="form-select"
                  value={betForm.result}
                  onChange={e => setBetForm(p => ({ ...p, result: e.target.value as BetResult }))}>
                  <option value="pending">대기중</option>
                  <option value="win">적중</option>
                  <option value="loss">실패</option>
                  <option value="push">적특</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">메모</label>
              <textarea className="form-textarea" placeholder="메모 (선택)"
                value={betForm.memo}
                onChange={e => setBetForm(p => ({ ...p, memo: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setBetFormSite(null)}>
                <X size={14} /> 취소
              </button>
              <button className="btn btn-primary" onClick={saveBet}>
                <Check size={14} /> 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 결과 처리 모달 ── */}
      {resultTarget && (
        <div className="modal-overlay" onClick={() => setResultTarget(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">결과 처리</div>
            <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 14 }}>
              <strong>{resultTarget.match}</strong><br />
              픽: {resultTarget.pick} · 배당: {resultTarget.odds} · 베팅액: {resultTarget.stake.toLocaleString()}원
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
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
                수익: <strong className="profit-pos">+{Math.round(resultTarget.stake * (resultTarget.odds - 1)).toLocaleString()}원</strong>
              </div>
            )}
            {resultValue === 'loss' && (
              <div style={{ background: 'var(--red-bg)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
                손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResultTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

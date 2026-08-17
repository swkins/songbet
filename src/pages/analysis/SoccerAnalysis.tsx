import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Save, Trash2, ChevronDown, ChevronUp, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { SoccerOddsLog } from '../../types'
import {
  analyzeSoccerOdds, evaluateSoccerPick, outcomeFromScore, PICK_LABELS,
  type SoccerAnalysisInput, type SoccerCandidate, type PickKey,
} from '../../lib/soccerOdds'

// ─── 배당 입력칸 — 마진율 계산기와 동일하게, 숫자 3자리를 그대로 치면
// 자동으로 소숫점 배당(예: 185 → 1.85)으로 바꿔준다. 소숫점을 직접 입력해도 그대로 사용.
function formatOddsRaw(raw: string): string {
  const clean = raw.replace(/[^0-9.]/g, '')
  return /^\d{3}$/.test(clean) ? (Number(clean) / 100).toFixed(2) : clean
}

function OddsField({ label, value, onChange, accent }: { label: string; value: string; onChange: (v: string) => void; accent?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: accent ?? 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <input
        className="form-input"
        type="text"
        inputMode="decimal"
        placeholder="예: 185"
        value={value}
        onChange={e => onChange(formatOddsRaw(e.target.value))}
        style={{ fontFamily: 'var(--font-num)', textAlign: 'center', fontSize: 13, padding: '7px 6px' }}
      />
    </div>
  )
}

function num(v: string): number | undefined {
  const n = parseFloat(v)
  return isFinite(n) && n > 0 ? n : undefined
}

function pct(n: number): string { return (n * 100).toFixed(1) + '%' }

// ─── 후보 확률 막대 ──
function CandidateBar({ c, isBest, teamLabel }: { c: SoccerCandidate; isBest: boolean; teamLabel: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
      background: isBest ? 'var(--gold-bg)' : 'var(--bg-elevated)',
      border: `1px solid ${isBest ? 'var(--gold-border)' : 'var(--border)'}`,
    }}>
      <div style={{ width: 108, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: isBest ? 'var(--gold)' : 'var(--text-primary)' }}>{c.marketLabel}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{teamLabel}</div>
      </div>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, c.noVigProb * 100)}%`, height: '100%', background: isBest ? 'var(--gold)' : 'var(--cyan)', transition: 'width 0.2s' }} />
      </div>
      <div style={{ width: 54, textAlign: 'right', fontFamily: 'var(--font-num)', fontWeight: 800, fontSize: 13, color: isBest ? 'var(--gold)' : 'var(--text-primary)' }}>
        {pct(c.noVigProb)}
      </div>
      <div style={{ width: 44, textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-num)' }}>@{c.odds.toFixed(2)}</div>
      {isBest && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>추천</span>}
    </div>
  )
}

const MARKET_GROUP: Record<PickKey, string> = {
  ml_home: '일반승', ml_away: '일반승',
  ah05_home: '0.5 핸디캡', ah05_away: '0.5 핸디캡',
  ah15_home: '1.5 핸디캡', ah15_away: '1.5 핸디캡',
}

export default function SoccerAnalysis() {
  // ── 입력 폼 상태 ──
  const [league, setLeague] = useState('')
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [matchDate, setMatchDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [oddsHome, setOddsHome] = useState('')
  const [oddsDraw, setOddsDraw] = useState('')
  const [oddsAway, setOddsAway] = useState('')
  const [oddsOver, setOddsOver] = useState('')
  const [oddsUnder, setOddsUnder] = useState('')
  const [oddsAh05Home, setOddsAh05Home] = useState('')
  const [oddsAh05Away, setOddsAh05Away] = useState('')
  const [oddsAh15Home, setOddsAh15Home] = useState('')
  const [oddsAh15Away, setOddsAh15Away] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const [leagueOptions, setLeagueOptions] = useState<string[]>([])
  useEffect(() => {
    supabase.from('soccer_leagues').select('name').order('sort_order').then(({ data }) => {
      if (data) setLeagueOptions((data as { name: string }[]).map(d => d.name))
    })
  }, [])

  const analysisInput: SoccerAnalysisInput = useMemo(() => ({
    odds1x2: { home: num(oddsHome), draw: num(oddsDraw), away: num(oddsAway) },
    oddsOU25: { over: num(oddsOver), under: num(oddsUnder) },
    oddsAH05: { home: num(oddsAh05Home), away: num(oddsAh05Away) },
    oddsAH15: { home: num(oddsAh15Home), away: num(oddsAh15Away) },
    homeLabel: homeTeam, awayLabel: awayTeam,
  }), [oddsHome, oddsDraw, oddsAway, oddsOver, oddsUnder, oddsAh05Home, oddsAh05Away, oddsAh15Home, oddsAh15Away, homeTeam, awayTeam])

  const result = useMemo(() => analyzeSoccerOdds(analysisInput), [analysisInput])

  // ── 저장된 기록 목록 ──
  const [logs, setLogs] = useState<SoccerOddsLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [showList, setShowList] = useState(true)
  const [resultEditId, setResultEditId] = useState<string | null>(null)
  const [scoreHomeDraft, setScoreHomeDraft] = useState('')
  const [scoreAwayDraft, setScoreAwayDraft] = useState('')

  async function loadLogs() {
    setLoadingLogs(true)
    const { data } = await supabase.from('soccer_odds_logs').select('*').order('match_date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    if (data) setLogs(data as SoccerOddsLog[])
    setLoadingLogs(false)
  }
  useEffect(() => { loadLogs() }, [])

  function resetForm() {
    setOddsHome(''); setOddsDraw(''); setOddsAway('')
    setOddsOver(''); setOddsUnder('')
    setOddsAh05Home(''); setOddsAh05Away('')
    setOddsAh15Home(''); setOddsAh15Away('')
    setMemo('')
  }

  async function saveAnalysis() {
    if (result.candidates.length === 0) { alert('배당을 1개 이상의 마켓에 입력해 주세요 (승무패 / 0.5핸디 / 1.5핸디 중 하나 이상).'); return }
    setSaving(true)
    const best = result.best
    const payload = {
      match_date: matchDate || null,
      league: league.trim(), home_team: homeTeam.trim(), away_team: awayTeam.trim(),
      odds_home: num(oddsHome) ?? null, odds_draw: num(oddsDraw) ?? null, odds_away: num(oddsAway) ?? null,
      odds_over25: num(oddsOver) ?? null, odds_under25: num(oddsUnder) ?? null,
      odds_ah05_home: num(oddsAh05Home) ?? null, odds_ah05_away: num(oddsAh05Away) ?? null,
      odds_ah15_home: num(oddsAh15Home) ?? null, odds_ah15_away: num(oddsAh15Away) ?? null,
      recommended_key: best?.key ?? null,
      recommended_label: best ? `${best.marketLabel} · ${best.sideLabel}` : null,
      recommended_prob: best ? Math.round(best.noVigProb * 1000) / 10 : null,
      memo: memo.trim(),
    }
    const { data, error } = await supabase.from('soccer_odds_logs').insert(payload).select().single()
    if (data) {
      setLogs(p => [data as SoccerOddsLog, ...p])
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500)
      resetForm()
    } else if (error) {
      alert('저장 실패: ' + error.message)
    }
    setSaving(false)
  }

  async function deleteLog(id: string) {
    if (!confirm('이 기록을 삭제할까요?')) return
    await supabase.from('soccer_odds_logs').delete().eq('id', id)
    setLogs(p => p.filter(l => l.id !== id))
  }

  function openResultEdit(log: SoccerOddsLog) {
    setResultEditId(log.id)
    setScoreHomeDraft(log.result_home_score != null ? String(log.result_home_score) : '')
    setScoreAwayDraft(log.result_away_score != null ? String(log.result_away_score) : '')
  }

  async function saveResult(log: SoccerOddsLog) {
    const hs = parseInt(scoreHomeDraft, 10), as = parseInt(scoreAwayDraft, 10)
    if (!isFinite(hs) || !isFinite(as) || hs < 0 || as < 0) { alert('스코어를 정확히 입력해 주세요 (예: 2, 1)'); return }
    const outcome = outcomeFromScore(hs, as)
    const { data } = await supabase.from('soccer_odds_logs')
      .update({ result_home_score: hs, result_away_score: as, result_outcome: outcome, result_updated_at: new Date().toISOString() })
      .eq('id', log.id).select().single()
    if (data) setLogs(p => p.map(l => l.id === log.id ? data as SoccerOddsLog : l))
    setResultEditId(null)
  }

  async function clearResult(log: SoccerOddsLog) {
    const { data } = await supabase.from('soccer_odds_logs')
      .update({ result_home_score: null, result_away_score: null, result_outcome: null, result_updated_at: null })
      .eq('id', log.id).select().single()
    if (data) setLogs(p => p.map(l => l.id === log.id ? data as SoccerOddsLog : l))
  }

  // ── 적중률 통계 ──
  const stats = useMemo(() => {
    const decided = logs.filter(l => l.result_home_score != null && l.result_away_score != null && l.recommended_key)
    let hit = 0
    const byMarket: Record<string, { hit: number; total: number }> = {}
    for (const l of decided) {
      const key = l.recommended_key as PickKey
      const r = evaluateSoccerPick(key, l.result_home_score!, l.result_away_score!)
      const group = MARKET_GROUP[key] ?? key
      if (!byMarket[group]) byMarket[group] = { hit: 0, total: 0 }
      byMarket[group].total++
      if (r === 'win') { hit++; byMarket[group].hit++ }
    }
    return { total: logs.length, decided: decided.length, hit, byMarket }
  }, [logs])

  return (
    <div>
      {/* 상단: 입력 폼 + 실시간 추천 결과 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 440px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* 입력 폼 */}
        <div className="card">
          <div className="card-title">배당 입력</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>리그</div>
              <input className="form-input" list="soccer-league-options" value={league} onChange={e => setLeague(e.target.value)} placeholder="예: 프리미어리그" style={{ fontSize: 12, padding: '7px 8px' }} />
              <datalist id="soccer-league-options">{leagueOptions.map(l => <option key={l} value={l} />)}</datalist>
            </div>
            <div style={{ width: 118 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>날짜</div>
              <input className="form-input" type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)} style={{ fontSize: 12, padding: '7px 6px' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>홈팀</div>
              <input className="form-input" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} placeholder="홈" style={{ fontSize: 12, padding: '7px 8px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>원정팀</div>
              <input className="form-input" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} placeholder="원정" style={{ fontSize: 12, padding: '7px 8px' }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>승무패 (1X2)</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <OddsField label="홈" value={oddsHome} onChange={setOddsHome} />
              <OddsField label="무" value={oddsDraw} onChange={setOddsDraw} />
              <OddsField label="원정" value={oddsAway} onChange={setOddsAway} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>2.5 오버 / 언더 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(참고용)</span></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <OddsField label="오버" value={oddsOver} onChange={setOddsOver} />
              <OddsField label="언더" value={oddsUnder} onChange={setOddsUnder} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>0.5 핸디캡</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <OddsField label="홈 -0.5" value={oddsAh05Home} onChange={setOddsAh05Home} />
              <OddsField label="원정 +0.5" value={oddsAh05Away} onChange={setOddsAh05Away} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>1.5 핸디캡</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <OddsField label="홈 -1.5" value={oddsAh15Home} onChange={setOddsAh15Home} />
              <OddsField label="원정 +1.5" value={oddsAh15Away} onChange={setOddsAh15Away} />
            </div>
          </div>

          <textarea className="form-textarea" value={memo} onChange={e => setMemo(e.target.value)} placeholder="메모 (선택)" rows={2} style={{ resize: 'vertical', fontSize: 12, marginBottom: 10 }} />

          <button onClick={saveAnalysis} disabled={saving} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '9px 0' }}>
            {savedFlash ? <><Check size={13} />저장됨</> : saving ? '저장중...' : <><Save size={13} />기록 저장</>}
          </button>
        </div>

        {/* 실시간 추천 결과 */}
        <div className="card">
          <div className="card-title">확률 비교 · 추천</div>
          {result.candidates.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
              승무패 / 0.5핸디 / 1.5핸디 중 배당을 입력하면 자동으로 확률을 비교합니다.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {result.candidates.map(c => (
                  <CandidateBar key={c.key} c={c} isBest={result.best?.key === c.key} teamLabel={c.sideLabel} />
                ))}
              </div>

              {result.best && (
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--gold-bg)', border: '1px solid var(--gold-border)', marginBottom: 10, fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
                  ★ 추천: <b>{result.best.marketLabel} · {result.best.sideLabel}</b> — 확률 {pct(result.best.noVigProb)} (배당 @{result.best.odds.toFixed(2)})
                </div>
              )}

              {result.drawProb !== null && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>참고 · 무승부 확률: {pct(result.drawProb)}</div>
              )}

              {result.ou25 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {result.ou25.lean === 'over' && <TrendingUp size={12} color="var(--orange)" />}
                  {result.ou25.lean === 'under' && <TrendingDown size={12} color="var(--cyan)" />}
                  {result.ou25.lean === 'even' && <Minus size={12} color="var(--text-muted)" />}
                  득점 성향: 오버 {pct(result.ou25.overProb)} / 언더 {pct(result.ou25.underProb)}
                  {result.ou25.lean === 'over' && ' — 다득점 경기 예상 (1.5 핸디캡 홈 참고)'}
                  {result.ou25.lean === 'under' && ' — 저득점 경기 예상 (핸디캡보다 무승부 리스크 참고)'}
                </div>
              )}

              {result.consistency05 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: 8, marginTop: 4 }}>
                  일반승-홈 {pct(result.consistency05.mlProb)} vs 0.5핸디-홈 {pct(result.consistency05.ahProb)} (차이 {result.consistency05.diffPct.toFixed(1)}%p)<br />
                  {result.consistency05.note}
                </div>
              )}

              {result.margins.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {result.margins.map(m => (
                    <span key={m.marketLabel} style={{ fontSize: 9, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                      {m.marketLabel} 마진 {m.pct.toFixed(1)}%
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 적중률 요약 */}
      {stats.total > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">적중률 요약</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">전체 기록</div>
            </div>
            <div>
              <div className="stat-value">{stats.decided}</div>
              <div className="stat-label">결과 입력됨</div>
            </div>
            <div>
              <div className="stat-value" style={{ color: 'var(--gold)' }}>{stats.decided > 0 ? ((stats.hit / stats.decided) * 100).toFixed(1) + '%' : '-'}</div>
              <div className="stat-label">전체 적중률</div>
            </div>
            {Object.entries(stats.byMarket).map(([market, s]) => (
              <div key={market}>
                <div className="stat-value" style={{ fontSize: 15 }}>{((s.hit / s.total) * 100).toFixed(1)}%</div>
                <div className="stat-label">{market} ({s.hit}/{s.total})</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 저장된 기록 목록 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setShowList(p => !p)}>
          <div className="card-title" style={{ marginBottom: 0 }}>저장된 기록 ({logs.length})</div>
          {showList ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        </div>
        {showList && (
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            {loadingLogs ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>불러오는 중...</div>
            ) : logs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>저장된 기록이 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>날짜</th><th>리그</th><th>매치</th><th>추천</th><th>확률</th><th>결과</th><th>적중</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const hasResult = log.result_home_score != null && log.result_away_score != null
                    const pickResult = hasResult && log.recommended_key
                      ? evaluateSoccerPick(log.recommended_key as PickKey, log.result_home_score!, log.result_away_score!)
                      : null
                    return (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{log.match_date ? dayjs(log.match_date).format('MM/DD') : '-'}</td>
                        <td>{log.league || '-'}</td>
                        <td>{(log.home_team || '홈')} vs {(log.away_team || '원정')}</td>
                        <td style={{ color: 'var(--gold)', fontWeight: 600, whiteSpace: 'nowrap' }}>{log.recommended_label ?? '-'}</td>
                        <td style={{ fontFamily: 'var(--font-num)' }}>{log.recommended_prob != null ? log.recommended_prob.toFixed(1) + '%' : '-'}</td>
                        <td>
                          {resultEditId === log.id ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input className="form-input" style={{ width: 40, padding: '3px 4px', fontSize: 11, textAlign: 'center' }} value={scoreHomeDraft} onChange={e => setScoreHomeDraft(e.target.value.replace(/[^0-9]/g, ''))} placeholder="홈" />
                              <span style={{ color: 'var(--text-muted)' }}>:</span>
                              <input className="form-input" style={{ width: 40, padding: '3px 4px', fontSize: 11, textAlign: 'center' }} value={scoreAwayDraft} onChange={e => setScoreAwayDraft(e.target.value.replace(/[^0-9]/g, ''))} placeholder="원정" />
                              <button onClick={() => saveResult(log)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', display: 'flex' }}><Check size={13} /></button>
                              <button onClick={() => setResultEditId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={13} /></button>
                            </div>
                          ) : hasResult ? (
                            <span onClick={() => openResultEdit(log)} style={{ cursor: 'pointer', fontFamily: 'var(--font-num)' }} title="클릭해서 수정">
                              {log.result_home_score} : {log.result_away_score}
                            </span>
                          ) : (
                            <button onClick={() => openResultEdit(log)} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                              결과 입력
                            </button>
                          )}
                        </td>
                        <td>
                          {pickResult === 'win' && <span className="badge-win" style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>적중</span>}
                          {pickResult === 'loss' && <span className="badge-loss" style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>실패</span>}
                          {!pickResult && '-'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {hasResult && (
                              <button onClick={() => clearResult(log)} title="결과 지우기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={12} /></button>
                            )}
                            <button onClick={() => deleteLog(log.id)} title="삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

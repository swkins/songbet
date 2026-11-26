import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { loadSchedules, gameState } from '../lib/gameSchedule'
import { loadRules, saveRule, loadLines, judge, BET_LABEL, type SoccerRule, type Judged, type BetKind } from '../lib/soccerRules'

// ─── 축구 룰북 베팅 찾기 (사용자 요청 — 5대 리그, 룰북 조건에 맞는 경기만 쭉, 안 되는 건 패스) ─────
// 승무패 = ESPN·DraftKings 최신(odds_snapshots), 핸디 = Action Network 평균(soccer_lines) 또는 포아송 추정.
// 룰은 Supabase soccer_rules — 아래 '룰 고치기'에서 바꾼다.
const LEAGUES = ['프리미어리그', '라리가', '세리에A', '분데스리가', '리그1']
// 룰마다 '전 리그'(all_leagues)면 일정 받는 모든 축구 리그, 아니면 5대 리그만 (2026-11-26 사용자 요청 — R7 2.5 오버는 다른 리그도)
const rulesFor = (rs: SoccerRule[], league: string) => rs.filter(r => r.all_leagues || LEAGUES.includes(league))
export interface RulebookBet { sport: string; league: string; gameId: string; preset: { side: 'home' | 'away'; opt: string; odds: number | null } }

export default function SoccerRulebook({ onGoBet }: { onGoBet?: (t: RulebookBet) => void }) {
  const [rules, setRules] = useState<SoccerRule[]>([])
  const [list, setList] = useState<Judged[] | null>(null)
  const [noOdds, setNoOdds] = useState<{ league: string; start: string; home: string; away: string }[]>([])
  const [showPass, setShowPass] = useState(false)
  const [edit, setEdit] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    (async () => {
      const [rs, rows] = await Promise.all([loadRules(), loadSchedules('soccer')])
      setRules(rs)
      const now = Date.now()
      const anyAll = rs.some(r => r.enabled && r.all_leagues)
      const games = rows.filter(r => LEAGUES.includes(r.league) || anyAll).flatMap(r => r.games.map(g => ({ ...g, league: r.league })))
        .filter(g => gameState(g, now) === 'pre').sort((a, b) => a.start.localeCompare(b.start))
      const ids = games.map(g => g.id)
      const [{ data: snaps }, lines] = await Promise.all([
        ids.length ? supabase.from('odds_snapshots').select('game_id, home_odds, draw_odds, away_odds, fetched_at').in('game_id', ids).order('fetched_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
        loadLines(ids),
      ])
      const last = new Map<string, any>()
      for (const s of snaps ?? []) if (!last.has(s.game_id)) last.set(s.game_id, s)
      const out: Judged[] = [], none: typeof noOdds = []
      for (const g of games) {
        const s = last.get(g.id)
        if (!s?.home_odds || !s?.away_odds || !s?.draw_odds) { none.push({ league: g.league, start: g.start, home: g.home.name ?? '?', away: g.away.name ?? '?' }); continue }
        out.push(judge({ id: g.id, league: g.league, start: g.start, home: g.home.name ?? '?', away: g.away.name ?? '?', sport: 'soccer' },
          { h: Number(s.home_odds), d: Number(s.draw_odds), a: Number(s.away_odds) }, rulesFor(rs, g.league), lines))
      }
      setList(out); setNoOdds(none)
    })()
  }, [reload])

  const hits = useMemo(() => (list ?? []).filter(j => j.picks.some(p => p.okOdds) || j.edge.length), [list])
  const pass = useMemo(() => (list ?? []).filter(j => !j.picks.some(p => p.okOdds) && !j.edge.length), [list])
  const when = (iso: string) => { const d = dayjs(iso); return `${d.format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD') ? '오늘' : d.format('M/D')} ${d.format('HH:mm')}` }
  const cell: React.CSSProperties = { padding: '7px 6px', borderBottom: '1px solid var(--border)', fontSize: 12, verticalAlign: 'top' }
  const num: React.CSSProperties = { fontFamily: 'var(--font-num)' }

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>📋 룰북 베팅 찾기</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>5대 리그 (전 리그 룰은 모든 리그) · 오늘·내일 경기 전 · 승무패 ESPN(DraftKings) · 핸디 Action Network 평균 (없으면 추정)</span>
        <button type="button" className="btn" onClick={() => setReload(x => x + 1)} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px' }}>새로고침</button>
        <button type="button" className="btn" onClick={() => setEdit(e => !e)} style={{ fontSize: 11, padding: '3px 10px' }}>{edit ? '룰 닫기' : '⚙ 룰 고치기'}</button>
      </div>

      {edit && <RuleEditor rules={rules} onSaved={() => setReload(x => x + 1)} />}

      {!list ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>찾는 중…</div> : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
            경기 {list.length + noOdds.length} · <b style={{ color: 'var(--gold)' }}>해당 {hits.length}</b> · 패스 {pass.length}{noOdds.length ? ` · 배당 없음 ${noOdds.length}` : ''}
          </div>
          {!hits.length ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>룰북에 맞는 경기가 없습니다.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={cell}>시각</th><th style={cell}>경기 (★ = 정배)</th><th style={cell}>승 / 무 / 패</th><th style={cell}>룰</th><th style={cell}>베팅</th><th style={{ ...cell, textAlign: 'right' }}>배당</th><th style={{ ...cell, textAlign: 'right' }}>확률</th><th style={cell}></th>
                </tr></thead>
                <tbody>
                  {hits.map(j => (
                    <tr key={j.game.id}>
                      <td style={{ ...cell, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{when(j.game.start)}<div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{j.game.league}</div></td>
                      <td style={cell}>
                        <div style={{ fontWeight: j.fav === 'home' ? 800 : 500 }}>{j.fav === 'home' && '★ '}{j.game.home} <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>홈</span></div>
                        <div style={{ fontWeight: j.fav === 'away' ? 800 : 500 }}>{j.fav === 'away' && '★ '}{j.game.away}</div>
                      </td>
                      <td style={{ ...cell, ...num, whiteSpace: 'nowrap' }}>{j.h.toFixed(2)} / {j.d.toFixed(2)} / {j.a.toFixed(2)}</td>
                      <td style={cell} colSpan={5}>
                        {j.picks.map(p => (
                          <div key={p.rule.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', opacity: p.okOdds ? 1 : 0.5 }}>
                            <span style={{ width: 34, fontWeight: 800, color: 'var(--gold)' }}>{p.rule.name}</span>
                            <span style={{ flex: 1, fontWeight: 700 }}>{p.label}<span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{BET_LABEL[p.kind]}</span></span>
                            <span style={{ ...num, width: 92, textAlign: 'right' }} title={p.estimated ? `해외 ${p.kind === 'over25' ? '2.5 오버' : '핸디'} 배당이 없어 승무패로 추정 (마진 5%)` : `해외 북 ${p.books}곳 평균`}>
                              <b>{p.odds?.toFixed(2) ?? '–'}</b><span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 3 }}>{p.line == null ? '' : p.estimated ? '추정' : `${p.books}곳`}</span>
                            </span>
                            <span style={{ ...num, width: 44, textAlign: 'right', color: 'var(--text-secondary)' }}>{p.prob != null ? `${Math.round(p.prob * 100)}%` : ''}</span>
                            {p.okOdds ? (
                              onGoBet && <button type="button" className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}
                                onClick={() => onGoBet({ sport: 'soccer', league: j.game.league, gameId: j.game.id, preset: { side: p.side, opt: p.optLabel, odds: p.line == null ? p.odds : null } })}>베팅 →</button>
                            ) : <span style={{ fontSize: 10, color: 'var(--red)' }}>배당 {p.rule.min_odds} 미만</span>}
                          </div>
                        ))}
                        {j.edge.map((e, i) => <div key={i} style={{ fontSize: 10, color: 'var(--orange)' }}>⚠ {e}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={() => setShowPass(s => !s)} className="btn" style={{ marginTop: 10, fontSize: 11, padding: '4px 10px' }}>
            {showPass ? '▾' : '▸'} 패스 {pass.length}{noOdds.length ? ` · 배당 없음 ${noOdds.length}` : ''}
          </button>
          {showPass && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {pass.map(j => (
                <div key={j.game.id}><span style={{ color: 'var(--text-muted)' }}>{when(j.game.start)}</span> {j.game.home} vs {j.game.away} <span style={{ ...num }}>({j.h.toFixed(2)}/{j.d.toFixed(2)}/{j.a.toFixed(2)})</span> — {j.reasons.join(' · ') || (j.picks.length ? '배당 하한 미달' : '')}</div>
              ))}
              {noOdds.map((g, i) => <div key={i} style={{ color: 'var(--text-muted)' }}>{when(g.start)} {g.home} vs {g.away} — 배당 아직 없음</div>)}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
            해외 배당 기준이라 사이트 배당과 조금 다를 수 있음 — 조건 경계(정배 ±0.03, 역배·무 ±3%) 경기는 ⚠ 표시. '베팅 →'을 누르면 대시보드 베팅 모드에서 그 경기·그 베팅으로 슬립이 열린다 (사이트 배당은 직접 넣기, 승 베팅만 해외 배당을 미리 채움).
          </div>
        </>
      )}
    </div>
  )
}

const BETS: BetKind[] = ['fav_win', 'fav_minus15', 'fav_plus05', 'dog_plus15', 'dog_plus25', 'over25']
function RuleEditor({ rules, onSaved }: { rules: SoccerRule[]; onSaved: () => void }) {
  const [rows, setRows] = useState<SoccerRule[]>(rules)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => setRows(rules), [rules])
  const set = (i: number, k: keyof SoccerRule, v: unknown) => setRows(r => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const numIn = (i: number, k: keyof SoccerRule) => (
    <input className="form-input" value={(rows[i][k] as number | null) ?? ''} placeholder="–" inputMode="decimal"
      onChange={e => set(i, k, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 56, fontSize: 11, padding: '3px 4px', textAlign: 'center' }} />
  )
  async function saveAll() {
    for (const r of rows) {
      const { id, sort, name, enabled, fav_min, fav_max, dog_min, dog_max, draw_min, draw_max, bet, min_odds, all_leagues } = r
      await saveRule({ id: id > 0 ? id : undefined, sort, name, enabled, fav_min, fav_max, dog_min, dog_max, draw_min, draw_max, bet, min_odds, all_leagues: !!all_leagues })
    }
    setMsg('저장했어요'); onSaved()
  }
  const th: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', padding: '3px 4px', textAlign: 'center' }
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: 8, marginBottom: 10, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>사용</th><th style={th}>이름</th><th style={th}>정배 ≥</th><th style={th}>정배 ≤</th><th style={th}>역배 ≥</th><th style={th}>역배 ≤</th><th style={th}>무 ≥</th><th style={th}>무 ≤</th><th style={th}>베팅</th><th style={th}>그 배당 ≥</th><th style={th}>전 리그</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center' }}><input type="checkbox" checked={r.enabled} onChange={e => set(i, 'enabled', e.target.checked)} /></td>
            <td><input className="form-input" value={r.name} onChange={e => set(i, 'name', e.target.value)} style={{ width: 48, fontSize: 11, padding: '3px 4px' }} /></td>
            <td>{numIn(i, 'fav_min')}</td><td>{numIn(i, 'fav_max')}</td><td>{numIn(i, 'dog_min')}</td><td>{numIn(i, 'dog_max')}</td><td>{numIn(i, 'draw_min')}</td><td>{numIn(i, 'draw_max')}</td>
            <td><select className="form-input" value={r.bet} onChange={e => set(i, 'bet', e.target.value)} style={{ fontSize: 11, padding: '3px 4px' }}>{BETS.map(b => <option key={b} value={b}>{BET_LABEL[b]}</option>)}</select></td>
            <td>{numIn(i, 'min_odds')}</td>
            <td style={{ textAlign: 'center' }} title="체크 = 일정 받는 모든 축구 리그, 해제 = 5대 리그만"><input type="checkbox" checked={!!r.all_leagues} onChange={e => set(i, 'all_leagues', e.target.checked)} /></td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
        <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => setRows(r => [...r, { id: -Date.now(), sort: r.length + 1, name: `R${r.length + 1}`, enabled: true, fav_min: null, fav_max: null, dog_min: null, dog_max: null, draw_min: null, draw_max: null, bet: 'fav_win', min_odds: null, note: null }])}>＋ 룰 추가</button>
        <button type="button" className="btn btn-primary" style={{ fontSize: 11 }} onClick={saveAll}>저장</button>
        {msg && <span style={{ fontSize: 11, color: 'var(--green)' }}>{msg}</span>}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>빈 칸 = 그 조건 안 봄 · 끄려면 '사용' 체크 해제</span>
      </div>
    </div>
  )
}

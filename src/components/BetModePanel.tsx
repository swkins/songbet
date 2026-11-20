import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { loadSchedules, gameState, resolveTeamName, koName, type ScheduleRow, type ScheduleGame } from '../lib/gameSchedule'
import { applyNumericTemplate } from '../lib/betOptions'
import type { Site } from '../types'
import { supabase } from '../lib/supabase'

// ─── 대시보드 '베팅' 모드 (초안) ──────────────────────────────────
// 가져온 경기 일정(game_schedules)을 보고 바로 베팅한다.
// 종목 → (그 아래) 리그 → 경기 목록 → 베팅옵션(팀·옵션·사이트·배당·금액) 순으로 오른쪽으로 펼쳐진다.
// 등록하면 베팅추가와 똑같이 "팀 홈/원정 옵션" 문구로 저장 (onBet = Dashboard submitBet).

const SPORT_DEF: { id: string; label: string; icon: string }[] = [
  { id: 'basketball', label: '농구', icon: '🏀' },
  { id: 'volleyball', label: '배구', icon: '🏐' },
  { id: 'soccer', label: '축구', icon: '⚽' },
  { id: 'baseball', label: '야구', icon: '⚾' },
]
const KO_DAY = '일월화수목금토'
const when = (iso: string) => {
  const d = dayjs(iso), today = dayjs().format('YYYY-MM-DD')
  return `${d.format('YYYY-MM-DD') === today ? '오늘' : `${d.format('M/D')}(${KO_DAY[d.day()]})`} ${d.format('HH:mm')}`
}
function parseOdds(raw: string): number { const n = Number(raw); return Number.isFinite(n) && n > 1 ? n : 0 }

type Pick = 'home' | 'away' | 'game'
interface Game extends ScheduleGame { sport: string; league: string }

export default function BetModePanel({ sites, betOptionsBySport, numericBetOptionsBySport, teamsBySport, onBet, renderAddForm }: {
  sites: Site[]
  /** 종목·리그 맨 아래 '베팅추가' → 사이트를 고르면 오른쪽 베팅 칸에 기존 베팅추가 폼 (Dashboard SingleBetForm) */
  renderAddForm?: (site: Site, onClose: () => void) => React.ReactNode
  betOptionsBySport: Record<string, string[]>
  numericBetOptionsBySport: Record<string, string[]>
  teamsBySport: Record<string, { league: string; name: string }[]>
  onBet: (site: Site, sport: string, content: string, odds: number, stake: number, isLive: boolean, league: string) => Promise<boolean>
}) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sport, setSport] = useState<string | null>(null)
  const [league, setLeague] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)          // 베팅추가: 사이트 고르는 중
  const [addSiteId, setAddSiteId] = useState<string | null>(null)
  const addSite = sites.find(s => s.id === addSiteId) ?? null
  const orderedSites = [...sites].sort((a, b) => Number(b.active) - Number(a.active) || a.sort_order - b.sort_order)

  useEffect(() => { loadSchedules().then(r => { setRows(r); setLoading(false) }).catch(() => setLoading(false)) }, [])

  // 끝나지 않은 경기만
  const games: Game[] = useMemo(() => {
    const now = Date.now()
    return rows.flatMap(r => r.games.map(g => ({ ...g, sport: r.sport, league: r.league })))
      .filter(g => gameState(g, now) !== 'ended')
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [rows])
  const leaguesOf = (sp: string) => {
    const m = new Map<string, number>()
    games.filter(g => g.sport === sp).forEach(g => m.set(g.league, (m.get(g.league) ?? 0) + 1))
    return [...m.entries()]
  }
  // 리그를 안 고르면 그 종목 전체 (사용자 요청)
  const leagueGames = games.filter(g => g.sport === sport && (!league || g.league === league))
  const game = games.find(g => g.id === gameId) ?? null

  const col: React.CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 'calc(100vh - 170px)' }
  const head: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '0 2px 4px' }
  const item = (active: boolean, dim = false): React.CSSProperties => ({
    textAlign: 'left', padding: '7px 9px', borderRadius: 'var(--radius-sm)', cursor: dim ? 'default' : 'pointer', fontFamily: 'var(--font-body)', fontSize: 12,
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)',
    color: dim ? 'var(--text-muted)' : active ? 'var(--gold)' : 'var(--text-primary)', opacity: dim ? 0.6 : 1,
  })

  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span className="card-title" style={{ margin: 0 }}>베팅 모드</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>가져온 일정 중 끝나지 않은 경기 · 초안</span>
      </div>
      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(170px, 1fr) minmax(280px, 1.6fr)', gap: 10, alignItems: 'start' }}>
          {/* 1. 종목 → 리그 */}
          <div style={col}>
            <div style={head}>종목 · 리그</div>
            {SPORT_DEF.map(s => {
              const lgs = leaguesOf(s.id)
              const open = sport === s.id
              return (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <button type="button" disabled={!lgs.length} onClick={() => { setSport(open ? null : s.id); setLeague(null); setGameId(null); setAddSiteId(null) }}
                    style={{ ...item(open, !lgs.length), fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.icon} {s.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lgs.length ? lgs.reduce((a, [, n]) => a + n, 0) : '-'}</span>
                  </button>
                  {open && lgs.length > 1 && (
                    <button type="button" onClick={() => { setLeague(null); setGameId(null); setAddSiteId(null) }}
                      style={{ ...item(league === null), marginLeft: 10, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>전체</span><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lgs.reduce((a, [, n]) => a + n, 0)}</span>
                    </button>
                  )}
                  {open && lgs.map(([lg, n]) => (
                    <button key={lg} type="button" onClick={() => { setLeague(lg); setGameId(null); setAddSiteId(null) }}
                      style={{ ...item(league === lg), marginLeft: 10, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{lg}</span><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{n}</span>
                    </button>
                  ))}
                </div>
              )
            })}
            {/* 베팅추가 — 일정에 없는 경기도 기존 베팅추가 폼으로. 어느 사이트에 넣을지 고른다 */}
            {renderAddForm && (
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <button type="button" onClick={() => { setAddOpen(o => !o); setAddSiteId(null) }}
                  style={{ ...item(addOpen || !!addSiteId), fontWeight: 700, textAlign: 'center', borderStyle: 'dashed' }}>＋ 베팅추가</button>
                {addOpen && <>
                  <div style={{ ...head, paddingTop: 4 }}>어느 사이트에?</div>
                  {orderedSites.map(st => (
                    <button key={st.id} type="button" onClick={() => { setAddSiteId(st.id); setAddOpen(false); setGameId(null) }}
                      style={{ ...item(addSiteId === st.id), fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, opacity: st.active ? 1 : 0.6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--gold)' }}>{addSiteId === st.id ? '✓' : ''}</span>
                      {st.name}{st.currency === 'usd' ? ' $' : ''}{st.active && <span className="site-active-dot" style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </>}
              </div>
            )}
          </div>

          {/* 2. 경기 목록 */}
          <div style={col}>
            <div style={head}>{league ? `${league} 경기` : sport ? `${SPORT_DEF.find(s => s.id === sport)?.label ?? ''} 전체 경기` : '경기'}</div>
            {!sport ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>왼쪽에서 종목이나 리그를 고르세요</div>
              : (() => {
                // 오늘 · 내일 · 그 뒤를 날짜 머리글로 확실히 나눈다 (오늘 = 금색 머리글)
                const today = dayjs().format('YYYY-MM-DD'), tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
                let prev = ''
                return leagueGames.map(g => {
                  const live = gameState(g) === 'live'
                  const d = dayjs(g.start), ds = d.format('YYYY-MM-DD')
                  const tag = ds === today ? '오늘' : ds === tomorrow ? '내일' : ''
                  const header = ds !== prev ? (prev = ds, (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 2px', fontSize: 11, fontWeight: 800,
                      color: tag === '오늘' ? 'var(--gold)' : tag === '내일' ? 'var(--blue)' : 'var(--text-secondary)' }}>
                      <span style={{ padding: '1px 8px', borderRadius: 10, border: `1px solid ${tag === '오늘' ? 'var(--gold-border)' : tag === '내일' ? 'var(--blue-border)' : 'var(--border)'}`,
                        background: tag === '오늘' ? 'var(--gold-bg)' : tag === '내일' ? 'var(--blue-bg)' : 'transparent' }}>{tag || d.format('M/D')}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{d.format('M/D')}({KO_DAY[d.day()]})</span>
                      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>
                  )) : null
                  return (
                    <div key={g.id}>
                      {header}
                      <button type="button" onClick={() => { setGameId(g.id); setAddSiteId(null) }} style={{ ...item(gameId === g.id), width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: live ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-num)' }}>{live ? '● 경기중' : d.format('HH:mm')}{!league && <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)', marginLeft: 6 }}>{g.league}</span>}</span>
                        {/* 위 = 홈, 아래 = 원정 */}
                        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{koName(g.home.name)}</span>
                        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{koName(g.away.name)}</span>
                      </button>
                    </div>
                  )
                })
              })()}
          </div>

          {/* 3. 베팅옵션 */}
          <div style={{ minWidth: 0 }}>
            <div style={head}>{addSite ? `베팅추가 · ${addSite.name}` : '베팅슬립'}</div>
            {addSite && renderAddForm ? renderAddForm(addSite, () => setAddSiteId(null))
              : !game ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>경기를 고르면 여기서 베팅합니다</div>
              : game.sport === 'basketball' || game.sport === 'volleyball'
                ? <BasketSlip key={game.id} game={game} sites={sites} registered={teamsBySport[game.sport] ?? []} onBet={onBet} />
                : <BetSlip key={game.id} game={game} sites={sites}
                  options={betOptionsBySport[game.sport] ?? []} numeric={numericBetOptionsBySport[game.sport] ?? []}
                  registered={teamsBySport[game.sport] ?? []} onBet={onBet} />}
          </div>
        </div>
      )}
    </div>
  )
}

function BetSlip({ game, sites, options, numeric, registered, onBet }: {
  game: Game; sites: Site[]; options: string[]; numeric: string[]
  registered: { league: string; name: string }[]
  onBet: (site: Site, sport: string, content: string, odds: number, stake: number, isLive: boolean, league: string) => Promise<boolean>
}) {
  const home = resolveTeamName(game.home, game.league, registered)
  const away = resolveTeamName(game.away, game.league, registered)
  const live = gameState(game) === 'live'
  const orderedSites = [...sites].sort((a, b) => Number(b.active) - Number(a.active) || a.sort_order - b.sort_order)

  const [pick, setPick] = useState<Pick>('home')
  const [opt, setOpt] = useState<string>('승리')
  const [numVal, setNumVal] = useState('')
  const [siteId, setSiteId] = useState<string>(orderedSites[0]?.id ?? '')
  const site = sites.find(s => s.id === siteId) ?? null
  const isusd = site?.currency === 'usd'
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount] = useState('')
  const [isLive, setIsLive] = useState(live)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => { setAmount(site ? String(site.default_stake > 0 ? site.default_stake : site.currency === 'usd' ? 5 : 10000) : '') }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps
  // 금액 핫키: 누를 때마다 더한다 (원 5,000·10,000·20,000 / 달러 5·10·20)
  const HOT = isusd ? [5, 10, 20] : [5000, 10000, 20000]
  const addAmount = (v: number) => setAmount(a => String((Number(String(a).replace(/,/g, '')) || 0) + v))
  const fmt = (raw: string) => { const [i, d] = raw.split('.'); return (i ? Number(i).toLocaleString() : '') + (d != null ? `.${d}` : '') }

  const isNumeric = numeric.includes(opt)
  const optLabel = isNumeric ? (numVal.trim() ? applyNumericTemplate(opt, numVal.trim()) : '') : opt
  const team = pick === 'home' ? home : pick === 'away' ? away : `${home} vs ${away}`
  const side = pick === 'home' ? '홈' : pick === 'away' ? '원정' : ''
  const content = [team, side, optLabel].filter(Boolean).join(' ')
  const odds = parseOdds(oddsRaw)
  const stake = Number(amount.replace(/,/g, '')) || 0
  const ready = !!site && odds > 0 && stake > 0 && !!optLabel && !busy

  async function submit() {
    if (!ready || !site) return
    setBusy(true)
    const ok = await onBet(site, game.sport, content, odds, stake, isLive, game.league)
    setBusy(false)
    if (ok) { setDone(`${site.name} · ${content} @${odds.toFixed(2)} · ${stake.toLocaleString()}${isusd ? '$' : '원'} 등록`); setOddsRaw('') }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)', color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', margin: '10px 0 4px' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{game.league} · {when(game.start)}{game.venue ? ` · ${game.venue}` : ''}{live ? ' · ● 경기중' : ''}</div>
      <div style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 2px' }}>{home} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>vs</span> {away}</div>

      <div style={label}>대상</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" style={chip(pick === 'home')} onClick={() => { setPick('home'); if (!opt) setOpt('승리') }}>홈 · {home}</button>
        <button type="button" style={chip(pick === 'away')} onClick={() => { setPick('away'); if (!opt) setOpt('승리') }}>원정 · {away}</button>
        <button type="button" style={chip(pick === 'game')} onClick={() => { setPick('game'); if (opt === '승리') setOpt('') }}>경기 전체</button>
      </div>

      <div style={label}>베팅옵션 <span style={{ fontWeight: 400 }}>(베팅관리에 등록한 옵션)</span></div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 경기 전체(A vs B)는 승리가 없으니 오버·언더 같은 옵션만 */}
        {[...(pick === 'game' ? [] : ['승리']), ...options.filter(o => o !== '승리')].map(o => (
          <button key={o} type="button" style={chip(opt === o)} onClick={() => { setOpt(o); setNumVal('') }}>{o}</button>
        ))}
        {isNumeric && (
          <input className="form-input" autoFocus placeholder="숫자" value={numVal} onChange={e => setNumVal(e.target.value.replace(/[^0-9.+-]/g, ''))}
            style={{ width: 70, fontSize: 12, padding: '4px 6px' }} />
        )}
      </div>

      <div style={label}>사이트</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {orderedSites.map(s => (
          <button key={s.id} type="button" style={{ ...chip(siteId === s.id), opacity: s.active || siteId === s.id ? 1 : 0.6 }} onClick={() => setSiteId(s.id)}>
            {s.name}{s.currency === 'usd' ? ' $' : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...label, marginTop: 0 }}>배당</div>
          <input className="form-input" placeholder="배당 (185=1.85)" value={oddsRaw} inputMode="decimal"
            onChange={e => { const c = e.target.value.replace(/[^0-9.]/g, ''); setOddsRaw(/^\d{3}$/.test(c) ? (Number(c) / 100).toFixed(2) : c) }}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...label, marginTop: 0 }}>금액{isusd ? ' ($)' : ' (원)'}</div>
          <input className="form-input" value={fmt(amount)} inputMode="numeric" onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {HOT.map(v => (
              <button key={v} type="button" onClick={() => addAmount(v)} style={{ ...chip(false), flex: 1, padding: '4px 0', fontFamily: 'var(--font-num)' }}>+{v.toLocaleString()}</button>
            ))}
            <button type="button" onClick={() => setAmount('')} title="금액 지우기" style={{ ...chip(false), padding: '4px 8px' }}>C</button>
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={isLive} onChange={e => setIsLive(e.target.checked)} /> 라이브
      </label>

      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>저장될 내용</span>
        <b>{content || '—'}</b>{odds > 0 && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>@{odds.toFixed(2)}</span>}
      </div>

      <button type="button" className="btn btn-primary" disabled={!ready} onClick={submit}
        style={{ width: '100%', marginTop: 8, padding: '9px 0', fontWeight: 700, opacity: ready ? 1 : 0.5, display: 'flex', justifyContent: 'center' }}>
        {busy ? '등록 중…' : !site ? '사이트를 고르세요' : !optLabel ? '베팅옵션을 고르세요' : `${site.name}에 등록`}
      </button>
      {done && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>✓ {done}</div>}
    </div>
  )
}

// ─── 농구·배구 베팅슬립 (베팅 모드, 사용자 요청) ─────
// 승리팀: 홈/원정 중 하나 (최신 승패 배당 — 분석 탭과 같은 odds_snapshots)
// 핸디캡: 승패 배당으로 기준점을 대충 유추해 정배 마핸 / 역배 플핸 0.5 단위 다섯 개 (정수 기준점은 적특이 생겨서 안 씀).
//  기준점 ≈ σ × 정규분포 역함수(마진 뺀 정배 승률), σ = 리그 점수차 퍼짐 (NBA 13.5·KBL 11·WKBL 10) — 예: 1.47/2.45 → 약 4.3 → 2.5~6.5
//  배당이 없으면 저장된 예측 마진(predictions)으로, 그것도 없으면 2.5~6.5. 오버·언더는 넣지 않는다.
const SIGMA: Record<string, number> = { NBA: 13.5, KBL: 11, WKBL: 10 }
function invNorm(p: number): number {
  // Acklam 근사
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924]
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857]
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878]
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742]
  const q = Math.min(0.999, Math.max(0.001, p))
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1) }
  if (q > 1 - 0.02425) return -invNorm(1 - q)
  const r = q - 0.5, t = r * r
  return (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1)
}
// 예상 기준점 근처 .5 일곱 개 (사용자 요청)
function handicapLines(margin: number): number[] {
  const c = Math.floor(Math.abs(margin)) + 0.5
  const lo = Math.max(0.5, c - 3)
  return [0, 1, 2, 3, 4, 5, 6].map(i => lo + i)
}
// 배구 (사용자 요청): 핸디는 정배 -1.5·-2.5 / 역배 +1.5·+2.5만, 그 아래 3.5 세트 오버·4.5 세트 언더, 총득점 174.5~186.5 언오버
//  저장 문구는 예전 배구 베팅과 같게: "팀 홈 -1.5 H"·"팀 원정 2.5 H"·"A vs B 3.5 세트 오버"·"A vs B 180.5 오버"
const VOLLEY_LINES = [1.5, 2.5]
const VOLLEY_TOTALS = Array.from({ length: 13 }, (_, i) => 174.5 + i)

type BPick = { kind: 'win'; side: 'home' | 'away' } | { kind: 'hcap'; side: 'home' | 'away'; line: number }
  | { kind: 'sets'; ou: 'over' | 'under' } | { kind: 'total'; line: number; ou: 'over' | 'under' }

function BasketSlip({ game, sites, registered, onBet }: {
  game: Game; sites: Site[]; registered: { league: string; name: string }[]
  onBet: (site: Site, sport: string, content: string, odds: number, stake: number, isLive: boolean, league: string) => Promise<boolean>
}) {
  const home = resolveTeamName(game.home, game.league, registered)
  const away = resolveTeamName(game.away, game.league, registered)
  const live = gameState(game) === 'live'
  const volley = game.sport === 'volleyball'
  const orderedSites = [...sites].sort((a, b) => Number(b.active) - Number(a.active) || a.sort_order - b.sort_order)

  // 최신 승패 배당 + (없으면) 저장된 예측 마진
  const [ml, setMl] = useState<{ home: number; away: number } | null>(null)
  const [predMargin, setPredMargin] = useState<number | null>(null)
  useEffect(() => {
    supabase.from('odds_snapshots').select('home_odds,away_odds').eq('game_id', game.id).order('fetched_at', { ascending: false }).limit(1)
      .then(({ data }) => { const r = data?.[0]; if (r?.home_odds && r?.away_odds) setMl({ home: Number(r.home_odds), away: Number(r.away_odds) }) })
    supabase.from('predictions').select('margin').eq('game_id', game.id).limit(1)
      .then(({ data }) => { const m = data?.[0]?.margin; if (m != null) setPredMargin(Number(m)) })
  }, [game.id])

  // 정배 쪽과 기준점 유추
  const est = useMemo(() => {
    if (volley) {
      const favHome = ml ? ml.home <= ml.away : predMargin != null ? predMargin >= 0 : true
      return { favHome, margin: 0, src: ml ? '승패 배당' : predMargin != null ? '예상' : '' }
    }
    if (ml) {
      const ph = (1 / ml.home) / (1 / ml.home + 1 / ml.away)
      const favHome = ph >= 0.5
      const m = (SIGMA[game.league] ?? 12) * invNorm(favHome ? ph : 1 - ph)
      return { favHome, margin: Math.round(m * 10) / 10, src: '승패 배당' }
    }
    if (predMargin != null) return { favHome: predMargin >= 0, margin: Math.abs(predMargin), src: '예상 스코어' }
    return null
  }, [ml, predMargin, game.league, volley])
  const lines = volley ? VOLLEY_LINES : handicapLines(est?.margin ?? 4.5)
  const favSide: 'home' | 'away' = est ? (est.favHome ? 'home' : 'away') : 'home'
  const dogSide: 'home' | 'away' = favSide === 'home' ? 'away' : 'home'

  const [pick, setPick] = useState<BPick | null>(null)
  const [siteId, setSiteId] = useState<string>(orderedSites[0]?.id ?? '')
  const site = sites.find(s => s.id === siteId) ?? null
  const isusd = site?.currency === 'usd'
  const [oddsRaw, setOddsRaw] = useState('')
  const [amount, setAmount] = useState('')
  const [isLive, setIsLive] = useState(live)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => { setAmount(site ? String(site.default_stake > 0 ? site.default_stake : site.currency === 'usd' ? 5 : 10000) : '') }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps
  const HOT = isusd ? [5, 10, 20] : [5000, 10000, 20000]
  const addAmount = (v: number) => setAmount(a => String((Number(String(a).replace(/,/g, '')) || 0) + v))
  const fmt = (raw: string) => { const [i, d] = raw.split('.'); return (i ? Number(i).toLocaleString() : '') + (d != null ? `.${d}` : '') }

  const teamOf = (side: 'home' | 'away') => (side === 'home' ? home : away)
  const sideKo = (side: 'home' | 'away') => (side === 'home' ? '홈' : '원정')
  const vs = `${home} vs ${away}`
  const content = !pick ? '' : pick.kind === 'win'
    ? `${teamOf(pick.side)} ${sideKo(pick.side)} 승리`
    : pick.kind === 'hcap'
      ? volley
        ? `${teamOf(pick.side)} ${sideKo(pick.side)} ${pick.side === favSide ? '-' : ''}${pick.line} H`
        : `${teamOf(pick.side)} ${sideKo(pick.side)} ${pick.line} ${pick.side === favSide ? '마핸' : '플핸'}`
      : pick.kind === 'sets'
        ? `${vs} ${pick.ou === 'over' ? '3.5 세트 오버' : '4.5 세트 언더'}`
        : `${vs} ${pick.line} ${pick.ou === 'over' ? '오버' : '언더'}`
  const choose = (p: BPick) => {
    setPick(p); setDone(null)
    // 승리팀은 최신 배당을 넣어 두고, 핸디캡은 배당 정보가 없어 비운다
    setOddsRaw(p.kind === 'win' && ml ? (p.side === 'home' ? ml.home : ml.away).toFixed(2) : '')
  }
  const odds = parseOdds(oddsRaw)
  const stake = Number(amount.replace(/,/g, '')) || 0
  const ready = !!site && !!pick && odds > 0 && stake > 0 && !busy

  async function submit() {
    if (!ready || !site) return
    setBusy(true)
    const ok = await onBet(site, game.sport, content, odds, stake, isLive, game.league)
    setBusy(false)
    if (ok) { setDone(`${site.name} · ${content} @${odds.toFixed(2)} · ${stake.toLocaleString()}${isusd ? '$' : '원'} 등록`); setOddsRaw('') }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)', color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })
  const big = (active: boolean): React.CSSProperties => ({ ...chip(active), flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', fontSize: 13 })
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', margin: '10px 0 4px' }
  const isWin = (side: 'home' | 'away') => pick?.kind === 'win' && pick.side === side
  const isH = (side: 'home' | 'away', line: number) => pick?.kind === 'hcap' && pick.side === side && pick.line === line
  // 핸디캡은 세로로 (사용자 요청): 정배 마핸 칸 | 역배 플핸 칸
  const hCol = (side: 'home' | 'away', sign: '-' | '+') => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {teamOf(side)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{sideKo(side)} · {sign === '-' ? '마핸' : '플핸'}</span>
      </span>
      {lines.map(l => (
        <button key={l} type="button" style={{ ...chip(isH(side, l)), padding: '6px 0', fontFamily: 'var(--font-num)', textAlign: 'center' }} onClick={() => choose({ kind: 'hcap', side, line: l })}>{sign}{l}</button>
      ))}
    </div>
  )
  const isSets = (ou: 'over' | 'under') => pick?.kind === 'sets' && pick.ou === ou
  const isT = (line: number, ou: 'over' | 'under') => pick?.kind === 'total' && pick.line === line && pick.ou === ou

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--bg-elevated)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{game.league} · {when(game.start)}{game.venue ? ` · ${game.venue}` : ''}{live ? ' · ● 경기중' : ''}</div>
      <div style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 2px' }}>{home} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>vs</span> {away}</div>

      <div style={label}>승리팀 {ml ? <span style={{ fontWeight: 400 }}>(최신 배당)</span> : <span style={{ fontWeight: 400 }}>(배당 아직 없음)</span>}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['home', 'away'] as const).map(side => (
          <button key={side} type="button" style={big(isWin(side))} onClick={() => choose({ kind: 'win', side })}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamOf(side)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{sideKo(side)}</span></span>
            {ml && <span style={{ fontFamily: 'var(--font-num)', fontWeight: 800, color: isWin(side) ? 'var(--gold)' : 'var(--text-primary)', marginLeft: 8 }}>{(side === 'home' ? ml.home : ml.away).toFixed(2)}</span>}
          </button>
        ))}
      </div>

      <div style={label}>
        핸디캡 <span style={{ fontWeight: 400 }}>{volley ? (est?.src ? `(${est.src} 기준 정배 = ${teamOf(favSide)})` : '(배당 없음 — 홈을 정배로)')
          : est ? `(${est.src} 기준 기준점 약 ${est.margin}점 → ${lines[0]}~${lines[lines.length - 1]})` : '(배당 없음 — 기본 기준점)'}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {hCol(favSide, '-')}
        {hCol(dogSide, '+')}
      </div>

      {volley && <>
        <div style={label}>세트 수</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={{ ...chip(isSets('over')), flex: 1, padding: '7px 0' }} onClick={() => choose({ kind: 'sets', ou: 'over' })}>3.5 세트 오버</button>
          <button type="button" style={{ ...chip(isSets('under')), flex: 1, padding: '7px 0' }} onClick={() => choose({ kind: 'sets', ou: 'under' })}>4.5 세트 언더</button>
        </div>
        <div style={label}>총득점 언오버</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
          {VOLLEY_TOTALS.map(l => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 52, flexShrink: 0, fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', textAlign: 'center' }}>{l}</span>
              <button type="button" style={{ ...chip(isT(l, 'over')), flex: 1, padding: '5px 0' }} onClick={() => choose({ kind: 'total', line: l, ou: 'over' })}>오버</button>
              <button type="button" style={{ ...chip(isT(l, 'under')), flex: 1, padding: '5px 0' }} onClick={() => choose({ kind: 'total', line: l, ou: 'under' })}>언더</button>
            </div>
          ))}
        </div>
      </>}

      <div style={label}>사이트</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {orderedSites.map(s => (
          <button key={s.id} type="button" style={{ ...chip(siteId === s.id), opacity: s.active || siteId === s.id ? 1 : 0.6 }} onClick={() => setSiteId(s.id)}>
            {s.name}{s.currency === 'usd' ? ' $' : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...label, marginTop: 0 }}>배당{pick && pick.kind !== 'win' ? ' (사이트 배당 입력)' : ''}</div>
          <input className="form-input" placeholder="배당 (185=1.85)" value={oddsRaw} inputMode="decimal"
            onChange={e => { const c = e.target.value.replace(/[^0-9.]/g, ''); setOddsRaw(/^\d{3}$/.test(c) ? (Number(c) / 100).toFixed(2) : c) }}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...label, marginTop: 0 }}>금액{isusd ? ' ($)' : ' (원)'}</div>
          <input className="form-input" value={fmt(amount)} inputMode="numeric" onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {HOT.map(v => <button key={v} type="button" onClick={() => addAmount(v)} style={{ ...chip(false), flex: 1, padding: '4px 0', fontFamily: 'var(--font-num)' }}>+{v.toLocaleString()}</button>)}
            <button type="button" onClick={() => setAmount('')} title="금액 지우기" style={{ ...chip(false), padding: '4px 8px' }}>C</button>
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={isLive} onChange={e => setIsLive(e.target.checked)} /> 라이브
      </label>

      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>저장될 내용</span>
        <b>{content || '—'}</b>{odds > 0 && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>@{odds.toFixed(2)}</span>}
      </div>

      <button type="button" className="btn btn-primary" disabled={!ready} onClick={submit}
        style={{ width: '100%', marginTop: 8, padding: '9px 0', fontWeight: 700, opacity: ready ? 1 : 0.5, display: 'flex', justifyContent: 'center' }}>
        {busy ? '등록 중…' : !pick ? (volley ? '베팅옵션을 고르세요' : '승리팀이나 핸디캡을 고르세요') : !site ? '사이트를 고르세요' : !odds ? '배당을 넣으세요' : `${site.name}에 등록`}
      </button>
      {done && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>✓ {done}</div>}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import UpdateStatus from '../components/UpdateStatus'
import PlayerOverall from '../components/PlayerOverall'
import { Activity, ClipboardCheck } from 'lucide-react'
import ModelReport, { loadPredictions, PredBadge, type Prediction } from '../components/ModelReport'
import OddsHistory, { Arrow } from '../components/OddsHistory'
import { loadOdds, oddsTrend, type OddsSnap } from '../lib/odds'
import OverallAnalysisView, { loadOverallAnalyses, findAnalysis, type OverallAnalysis } from '../components/OverallAnalysisView'
import { loadSchedules, gameState, koName, type ScheduleGame, type ScheduleTeam, type ScheduleRow } from '../lib/gameSchedule'

// '분석' 탭 — 종목별 다음 경기 일정.
// 일정은 Supabase 함수 update-schedule이 ESPN·KBL·WKBL·KOVO에서 받아 game_schedules(sport, league, game_date=한국 날짜)에 넣는다.
// 화면은 읽기만 한다. 종목을 늘리려면 SPORTS에 추가하고 함수에도 리그를 넣는다.
// 레이아웃: 좌 일정(오늘·내일 한 목록 — 경기 전만, 시작·종료 경기는 맨 위 접힌 '지난 경기'(지난 하루)) 2 : 우 분석(누른 경기) 8. 좁은 화면은 위아래로.

const SPORTS: { id: string; label: string; leagues: string[] }[] = [
  { id: 'basketball', label: '🏀 농구', leagues: ['KBL', 'WKBL', 'NBA'] },
  { id: 'volleyball', label: '🏐 배구', leagues: ['V리그 남자', 'V리그 여자'] },
  { id: 'soccer', label: '⚽ 축구', leagues: [] },
  { id: 'baseball', label: '⚾ 야구', leagues: [] },
]

interface Item extends ScheduleGame { league: string; date: string; fetchedAt: string }
type Team = ScheduleTeam

const KO_DAY = '일월화수목금토'
const mdDay = (d: string) => `${dayjs(d).format('M/D')} (${KO_DAY[dayjs(d).day()]})`
const dateLabel = (d: string) => {
  const t = dayjs().format('YYYY-MM-DD'), tm = dayjs().add(1, 'day').format('YYYY-MM-DD')
  return `${mdDay(d)}${d === t ? ' · 오늘' : d === tm ? ' · 내일' : ''}`
}

export default function Schedule() {
  const [sport, setSport] = useState('basketball')
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyses, setAnalyses] = useState<OverallAnalysis[]>([])
  const [odds, setOdds] = useState<Record<string, OddsSnap[]>>({})
  const [showStatus, setShowStatus] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [preds, setPreds] = useState<Record<string, Prediction>>({})
  const [narrow, setNarrow] = useState(() => window.innerWidth < 800)
  const [showPast, setShowPast] = useState(false)       // 지난 경기(시작했거나 끝난 경기, 지난 하루) — 맨 위에 접어 둠
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])   // 시작한 경기가 1분 안에 지난 경기로 넘어가게

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 800)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelId(null)
    const since = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
    Promise.all([loadSchedules(sport, since), loadOverallAnalyses(since).catch(() => []), loadOdds(since).catch(() => ({})), loadPredictions(since).catch(() => [])])
      .then(([r, oa, od, pr]) => { setRows(r); setAnalyses(oa); setOdds(od); setPreds(Object.fromEntries(pr.map(p => [p.game_id, p]))); setLoading(false) })
  }, [sport])

  const sportDef = SPORTS.find(s => s.id === sport)!
  // 오늘·내일 전부 한 목록: 날짜 → 시작 시각 → 리그 순
  const items: Item[] = useMemo(() => rows
    .filter(r => sportDef.leagues.includes(r.league))
    .flatMap(r => r.games.map(g => ({ ...g, league: r.league, date: r.game_date, fetchedAt: r.fetched_at })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
      || sportDef.leagues.indexOf(a.league) - sportDef.leagues.indexOf(b.league)), [rows, sportDef])
  const sel = items.find(i => i.id === selId) ?? null
  const lastFetch = rows.reduce<string | null>((m, r) => (!m || r.fetched_at > m ? r.fetched_at : m), null)

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)',
    fontSize: 12, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })
  const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 13 }

  // 경기 전만 목록에, 시작했거나 끝난 경기는 '지난 경기'로 (사용자 요청) — 지난 하루치만
  const upcoming = items.filter(g => gameState(g, now) === 'pre')
  const past = items.filter(g => gameState(g, now) !== 'pre' && Date.parse(g.start) >= now - 24 * 3600000)
  let prevDate = ''
  const card = (g: Item) => {
      const st = gameState(g, now)
      const showScore = st !== 'pre' && g.home.score != null && g.away.score != null
      const hs = Number(g.home.score), as = Number(g.away.score)
      const header = g.date !== prevDate ? (prevDate = g.date, (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', padding: '10px 2px 6px' }}>{dateLabel(g.date)}</div>
      )) : null
      const active = g.id === selId
      const tr = oddsTrend(odds[g.id])
      const teamLine = (t: Team, score: number, win: boolean, home: boolean) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: st === 'ended' && !win ? 400 : 700 }}>{koName(t.name)}</span>
          {home && <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>홈</span>}
          {/* 승패 배당 (오픈·첫 기록 대비 ▲▼) — 점수가 있으면 점수 앞에 */}
          {tr && (home ? tr.last.home_odds : tr.last.away_odds) != null && (
            <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, fontFamily: 'var(--font-num)', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {(home ? tr.last.home_odds : tr.last.away_odds)!.toFixed(2)}<Arrow d={home ? tr.dH : tr.dA} />
            </span>
          )}
          {showScore && <span style={{ marginLeft: tr ? 8 : 'auto', fontWeight: win ? 700 : 400, flexShrink: 0, minWidth: 22, textAlign: 'right' }}>{score}</span>}
        </div>
      )
      return (
        <div key={g.id}>
          {header}
          <div onClick={() => setSelId(g.id)} style={{
            cursor: 'pointer', padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--radius-sm)', fontSize: 12,
            border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
            background: active ? 'var(--gold-bg)' : st === 'ended' ? 'transparent' : 'var(--bg-card)',
            opacity: st === 'ended' && !active ? 0.55 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10 }}>
              <span style={{ fontWeight: 700, color: st === 'ended' ? 'var(--text-muted)' : 'var(--gold)' }}>{dayjs(g.start).format('HH:mm')}</span>
              <span style={{ color: 'var(--text-muted)' }}>{g.league}</span>
              {st === 'ended' && <span style={{ marginLeft: 'auto', padding: '0 6px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>종료</span>}
              {st === 'live' && <span style={{ marginLeft: 'auto', padding: '0 6px', borderRadius: 8, background: 'var(--gold-bg)', color: 'var(--gold)', fontWeight: 700 }}>● {g.status}</span>}
            </div>
            {teamLine(g.home, hs, st === 'ended' && hs > as, true)}
            {teamLine(g.away, as, st === 'ended' && as > hs, false)}
            {/* 경기 전 예측 (snapshot-predictions) + 끝나면 적중/미적중 */}
            {preds[g.id] && (
              <div style={{ marginTop: 5, paddingTop: 4, borderTop: '1px dashed var(--border)', fontSize: 10 }}><PredBadge p={preds[g.id]} /></div>
            )}
            {(() => {
              const oa = findAnalysis(analyses, g)
              if (!oa) return null
              const pk = oa.picks?.[0]
              return (
                <div style={{ marginTop: 5, paddingTop: 4, borderTop: '1px dashed var(--border)', fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>예상 <b>{oa.exp_home_score}-{oa.exp_away_score}</b></span>
                  {pk && <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{pk.pick} {'★'.repeat(pk.stars ?? 0)}</span>}
                </div>
              )
            })()}
          </div>
        </div>
      )
    }
  const pastBox = past.length > 0 && (
    <div style={{ marginBottom: 6 }}>
      <button type="button" onClick={() => setShowPast(o => !o)} style={{ ...btn(showPast), width: '100%', display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 11 }}>
        <span>{showPast ? '▾' : '▸'} 지난 경기 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(시작·종료, 지난 하루)</span></span>
        <span>{past.length}{past.some(g => gameState(g, now) === 'live') ? ` · 경기중 ${past.filter(g => gameState(g, now) === 'live').length}` : ''}</span>
      </button>
      {showPast && <div style={{ marginTop: 4 }}>{(prevDate = '', past.map(card))}</div>}
    </div>
  )
  const list = loading ? <div style={muted}>불러오는 중…</div>
    : sportDef.leagues.length === 0 ? <div style={muted}>아직 일정 연결 전입니다.</div>
    : items.length === 0 ? <div style={muted}>받아온 일정이 없습니다.</div>
    : <>
      {pastBox}
      {(prevDate = '', upcoming.length ? upcoming.map(card) : <div style={{ ...muted, padding: 6 }}>남은 경기가 없습니다.</div>)}
    </>

  return (
    <div className="page">
      <div className="page-title" style={{ marginBottom: 12 }}>분석</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {SPORTS.map(s => <button key={s.id} style={btn(sport === s.id)} onClick={() => setSport(s.id)}>{s.label}</button>)}
        {lastFetch && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>일정 업데이트 {dayjs(lastFetch).format('M/D HH:mm')}</span>}
        <button onClick={() => setShowReport(true)} style={{ ...btn(false), marginLeft: lastFetch ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <ClipboardCheck size={13} /> 예측 보고서
        </button>
        <button onClick={() => setShowStatus(true)} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }}>
          <Activity size={13} /> 업데이트 현황
        </button>
      </div>

      {showStatus && <UpdateStatus onClose={() => setShowStatus(false)} />}
      {showReport && <ModelReport onClose={() => setShowReport(false)} />}
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: narrow ? 'none' : 2, width: narrow ? '100%' : undefined, minWidth: 0, maxHeight: narrow ? 360 : 'calc(100vh - 180px)', overflowY: 'auto' }}>
          {list}
        </div>
        <div className="card" style={{ flex: narrow ? 'none' : 8, width: narrow ? '100%' : undefined, minWidth: 0, minHeight: 320 }}>
          {sel ? <GameAnalysis g={sel} analysis={findAnalysis(analyses, sel)} odds={odds[sel.id]} /> : <div style={{ ...muted, padding: 24, textAlign: 'center' }}>왼쪽에서 경기를 누르면 여기에 분석이 나옵니다.</div>}
        </div>
      </div>
    </div>
  )
}

// 오른쪽 분석 칸 — 경기 정보 · 승패 배당 변동 · 선수 오버롤·출전 확률(PlayerOverall) · 오버롤 분석(있으면)
function GameAnalysis({ g, analysis, odds }: { g: Item; analysis: OverallAnalysis | null; odds?: OddsSnap[] }) {
  const st = gameState(g)
  const showScore = st !== 'pre' && g.home.score != null && g.away.score != null
  const side = (t: Team, label: string) => (
    <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{koName(t.name)}</div>
      {t.record && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.record}</div>}
    </div>
  )
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {g.league} · {mdDay(g.start)} {dayjs(g.start).format('HH:mm')}{g.venue ? ` · ${g.venue}` : ''}{g.note ? ` · ${g.note}` : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        {side(g.home, '홈')}
        <div style={{ textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: showScore ? 24 : 14, fontWeight: 700, color: showScore ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {showScore ? `${g.home.score} : ${g.away.score}` : 'vs'}
          </div>
          <div style={{ fontSize: 11, color: st === 'live' ? 'var(--gold)' : 'var(--text-muted)', marginTop: 2 }}>
            {st === 'ended' ? '경기 종료' : st === 'live' ? g.status : '경기 전'}
          </div>
        </div>
        {side(g.away, '원정')}
      </div>
      {/* 좌: 배당 변동 + 예상 스코어 / 우: 선수 오버롤·출전 확률 / 아래: 뉴스 */}
      <PlayerOverall league={g.league} gameDate={g.date} home={g.home} away={g.away}
        left={odds?.length ? <OddsHistory compact list={odds} homeName={koName(g.home.name)} awayName={koName(g.away.name)} /> : null}
        odds={(() => { const l = odds?.[odds.length - 1]; return l?.home_odds && l?.away_odds ? { home: Number(l.home_odds), away: Number(l.away_odds) } : null })()} />
      {analysis ? <OverallAnalysisView a={analysis} />
        : null}
    </div>
  )
}

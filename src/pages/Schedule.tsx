import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'

// '분석' 탭 — 종목별 다음 경기 일정.
// 일정은 Supabase 함수 update-schedule이 ESPN·KBL·WKBL·KOVO에서 받아 game_schedules(sport, league, game_date=한국 날짜)에 넣는다.
// 화면은 읽기만 한다. 종목을 늘리려면 SPORTS에 추가하고 함수에도 리그를 넣는다.
// 레이아웃: 좌 일정(오늘·내일 한 목록, 종료 경기는 흐리게) 2 : 우 분석(누른 경기) 8. 좁은 화면은 위아래로.

const SPORTS: { id: string; label: string; leagues: string[] }[] = [
  { id: 'basketball', label: '🏀 농구', leagues: ['KBL', 'WKBL', 'NBA'] },
  { id: 'volleyball', label: '🏐 배구', leagues: ['V리그 남자', 'V리그 여자'] },
  { id: 'soccer', label: '⚽ 축구', leagues: [] },
  { id: 'baseball', label: '⚾ 야구', leagues: [] },
]

const NBA_KO: Record<string, string> = {
  'Atlanta Hawks': '애틀랜타', 'Boston Celtics': '보스턴', 'Brooklyn Nets': '브루클린', 'Charlotte Hornets': '샬럿',
  'Chicago Bulls': '시카고', 'Cleveland Cavaliers': '클리블랜드', 'Dallas Mavericks': '댈러스', 'Denver Nuggets': '덴버',
  'Detroit Pistons': '디트로이트', 'Golden State Warriors': '골든스테이트', 'Houston Rockets': '휴스턴', 'Indiana Pacers': '인디애나',
  'LA Clippers': 'LA 클리퍼스', 'Los Angeles Clippers': 'LA 클리퍼스', 'Los Angeles Lakers': 'LA 레이커스', 'Memphis Grizzlies': '멤피스',
  'Miami Heat': '마이애미', 'Milwaukee Bucks': '밀워키', 'Minnesota Timberwolves': '미네소타', 'New Orleans Pelicans': '뉴올리언스',
  'New York Knicks': '뉴욕', 'Oklahoma City Thunder': '오클라호마시티', 'Orlando Magic': '올랜도', 'Philadelphia 76ers': '필라델피아',
  'Phoenix Suns': '피닉스', 'Portland Trail Blazers': '포틀랜드', 'Sacramento Kings': '새크라멘토', 'San Antonio Spurs': '샌안토니오',
  'Toronto Raptors': '토론토', 'Utah Jazz': '유타', 'Washington Wizards': '워싱턴',
}
const koName = (n?: string) => (n && NBA_KO[n]) || n || '?'

interface Team { name?: string; abbr?: string; record?: string | null; score?: string | number | null }
interface Game { id: string; start: string; home: Team; away: Team; venue?: string | null; status?: string | null; note?: string | null }
interface Row { league: string; game_date: string; games: Game[]; fetched_at: string }
interface Item extends Game { league: string; date: string; fetchedAt: string }

type State = 'pre' | 'live' | 'ended'
function gameState(g: Game): State {
  if (g.status === '종료' || /final/i.test(g.status ?? '')) return 'ended'
  // ESPN은 경기 전에도 status("11/17 - 7:30 PM EST")·점수 0이 와서, 시작 시각이 지났을 때만 진행 중으로 본다
  if (g.status && Date.now() >= Date.parse(g.start)) return 'live'
  return 'pre'
}

const KO_DAY = '일월화수목금토'
const mdDay = (d: string) => `${dayjs(d).format('M/D')} (${KO_DAY[dayjs(d).day()]})`
const dateLabel = (d: string) => {
  const t = dayjs().format('YYYY-MM-DD'), tm = dayjs().add(1, 'day').format('YYYY-MM-DD')
  return `${mdDay(d)}${d === t ? ' · 오늘' : d === tm ? ' · 내일' : ''}`
}

export default function Schedule() {
  const [sport, setSport] = useState('basketball')
  const [rows, setRows] = useState<Row[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 800)

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 800)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelId(null)
    const from = dayjs().format('YYYY-MM-DD')
    supabase.from('game_schedules').select('league, game_date, games, fetched_at')
      .eq('sport', sport).gte('game_date', from).order('game_date')
      .then(({ data }) => { setRows((data ?? []) as Row[]); setLoading(false) })
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

  let prevDate = ''
  const list = loading ? <div style={muted}>불러오는 중…</div>
    : sportDef.leagues.length === 0 ? <div style={muted}>아직 일정 연결 전입니다.</div>
    : items.length === 0 ? <div style={muted}>받아온 일정이 없습니다.</div>
    : items.map(g => {
      const st = gameState(g)
      const showScore = st !== 'pre' && g.home.score != null && g.away.score != null
      const hs = Number(g.home.score), as = Number(g.away.score)
      const header = g.date !== prevDate ? (prevDate = g.date, (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', padding: '10px 2px 6px' }}>{dateLabel(g.date)}</div>
      )) : null
      const active = g.id === selId
      const teamLine = (t: Team, score: number, win: boolean, home: boolean) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: st === 'ended' && !win ? 400 : 700 }}>{koName(t.name)}</span>
          {home && <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>홈</span>}
          {showScore && <span style={{ marginLeft: 'auto', fontWeight: win ? 700 : 400, flexShrink: 0 }}>{score}</span>}
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
          </div>
        </div>
      )
    })

  return (
    <div className="page">
      <div className="page-title" style={{ marginBottom: 12 }}>분석</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {SPORTS.map(s => <button key={s.id} style={btn(sport === s.id)} onClick={() => setSport(s.id)}>{s.label}</button>)}
        {lastFetch && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>일정 업데이트 {dayjs(lastFetch).format('M/D HH:mm')}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: narrow ? 'none' : 2, width: narrow ? '100%' : undefined, minWidth: 0, maxHeight: narrow ? 360 : 'calc(100vh - 180px)', overflowY: 'auto' }}>
          {list}
        </div>
        <div className="card" style={{ flex: narrow ? 'none' : 8, width: narrow ? '100%' : undefined, minWidth: 0, minHeight: 320 }}>
          {sel ? <GameAnalysis g={sel} /> : <div style={{ ...muted, padding: 24, textAlign: 'center' }}>왼쪽에서 경기를 누르면 여기에 분석이 나옵니다.</div>}
        </div>
      </div>
    </div>
  )
}

// 오른쪽 분석 칸 — 지금은 경기 정보만. 분석 내용은 여기 채운다.
function GameAnalysis({ g }: { g: Item }) {
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
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>분석 내용 준비 중</div>
    </div>
  )
}

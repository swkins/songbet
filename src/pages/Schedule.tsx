import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'

// '분석' 탭 — 종목별 다음 경기 일정.
// 일정은 Supabase 함수 update-schedule이 ESPN에서 받아 game_schedules(sport, league, game_date=한국 날짜)에 넣는다.
// 화면은 읽기만 한다. 종목을 늘리려면 SPORTS에 추가하고 함수에도 리그를 넣는다.

const SPORTS: { id: string; label: string; leagues: string[] }[] = [
  { id: 'basketball', label: '🏀 농구', leagues: ['NBA'] },
  { id: 'soccer', label: '⚽ 축구', leagues: [] },
  { id: 'baseball', label: '⚾ 야구', leagues: [] },
  { id: 'volleyball', label: '🏐 배구', leagues: [] },
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

interface Team { name?: string; abbr?: string; record?: string | null; score?: string | null }
interface Game { id: string; start: string; home: Team; away: Team; venue?: string | null; status?: string | null }
interface Row { league: string; game_date: string; games: Game[]; fetched_at: string }

export default function Schedule() {
  const [sport, setSport] = useState('basketball')
  const [rows, setRows] = useState<Row[]>([])
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const from = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
    supabase.from('game_schedules').select('league, game_date, games, fetched_at')
      .eq('sport', sport).gte('game_date', from).order('game_date')
      .then(({ data }) => {
        const r = (data ?? []) as Row[]
        setRows(r)
        const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
        const dates = [...new Set(r.map(x => x.game_date))]
        setDate(dates.includes(tomorrow) ? tomorrow : dates[0] ?? null)
        setLoading(false)
      })
  }, [sport])

  const dates = [...new Set(rows.map(r => r.game_date))]
  const shown = rows.filter(r => r.game_date === date)
  const sportDef = SPORTS.find(s => s.id === sport)!

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)',
    fontSize: 12, fontWeight: 700,
    border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
    background: active ? 'var(--gold-bg)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-secondary)',
  })

  return (
    <div className="page">
      <div className="page-title" style={{ marginBottom: 12 }}>분석</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {SPORTS.map(s => <button key={s.id} style={btn(sport === s.id)} onClick={() => setSport(s.id)}>{s.label}</button>)}
      </div>

      {dates.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {dates.map(d => (
            <button key={d} style={btn(date === d)} onClick={() => setDate(d)}>
              {dayjs(d).format('M/D (dd)')}{d === dayjs().format('YYYY-MM-DD') ? ' 오늘' : d === dayjs().add(1, 'day').format('YYYY-MM-DD') ? ' 내일' : ''}
            </button>
          ))}
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중…</div>
        : sportDef.leagues.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>아직 일정 연결 전입니다.</div>
        : shown.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>받아온 일정이 없습니다.</div>
        : shown.map(r => (
          <div key={r.league} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.league}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.games.length}경기</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>업데이트 {dayjs(r.fetched_at).format('M/D HH:mm')}</span>
            </div>
            {r.games.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>경기 없음</div>}
            {r.games.map(g => (
              <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto 1fr', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{dayjs(g.start).format('HH:mm')}</span>
                <span style={{ textAlign: 'right' }}>
                  <b>{koName(g.home.name)}</b> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.home.record ?? ''}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>홈</span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>vs</span>
                <span>
                  <b>{koName(g.away.name)}</b> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.away.record ?? ''}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

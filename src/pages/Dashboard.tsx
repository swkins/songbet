import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Sport, Market, BetResult, GameRolling } from '../types'
import { inferBaseballLeague, inferSoccerLeague, inferLeagueByKeyword, buildLeagueCandidates, suggestLeagueCandidates, type LeagueOverride, type LeagueCandidate } from '../lib/league'
import { buildTeamCandidates, suggestTeamCandidates, getTeamInsight, getEsportsLeague, type TeamCandidate, type BetLite } from '../lib/teamInsight'
import { fetchTodayTomorrowLolMatches, LEAGUES as LOL_LEAGUES, type UpcomingLolMatch } from '../lib/lolSchedule'
import { sportGlyph } from '../components/SportIcons'
import MiningWidget from '../components/MiningWidget'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import {
  Plus, Trash2, Check, X,
  RotateCcw, Settings, Flame,
  CheckCircle, XCircle, Ban, MinusCircle, Gift, GripVertical, DollarSign,
  TrendingUp, TrendingDown, ArrowDownToLine, LogOut, Pencil,
  ClipboardPaste, ChevronUp, ChevronDown,
} from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'esports',    label: 'LOL'    },
  { value: 'soccer',     label: '축구'   },
  { value: 'baseball',   label: '야구'   },
  { value: 'basketball', label: '농구'   },
  { value: 'volleyball', label: '배구'   },
  { value: 'other',      label: '기타'   },
]

const SPORT_SHORT: Record<string, string> = {
  soccer: '⚽', baseball: '⚾', basketball: '🏀',
  volleyball: '🏐', hockey: '🏒', esports: '🎮', other: '📋',
}

/* ── 종목 선택 버튼 그룹 (드롭다운 대신 항상 노출되는 버튼) ── */
function SportButtonGroup({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {SPORTS.filter(s => s.value !== 'other').map(s => {
        const active = value === s.value
        return (
          <button key={s.value} type="button" onClick={() => onChange(s.value)}
            style={{
              padding: '6px 9px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 700,
              fontFamily: 'var(--font-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
              background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)',
              color: active ? 'var(--gold)' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>
            <span style={{ fontSize: 17, lineHeight: 1 }}>{sportGlyph(s.value) ?? SPORT_SHORT[s.value]}</span>{s.label}
          </button>
        )
      })}
    </div>
  )
}

const HANDICAP_LINES_BY_BESTOF: Record<number, number[]> = {
  3: [1.5],
  5: [1.5, 2.5],
}

/* ── LOL 경기 선택 + 마켓(승패/핸디캡/세트별 승) 선택 UI ──
   기존 "리그 입력 + 경기 내용 자유입력"을 대체한다. 여기서 content/league를 확정하면
   그 아래(배당/금액 입력·등록 버튼)는 손대지 않고 그대로 이어서 쓴다. */
function LolMatchPicker({ match, onSelectMatch, onChangeMatch, pickLabel, onPick }: {
  match: UpcomingLolMatch | null
  onSelectMatch: (m: UpcomingLolMatch) => void
  onChangeMatch: () => void
  pickLabel: string | null
  onPick: (label: string) => void
}) {
  const [matches, setMatches] = useState<UpcomingLolMatch[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'all' | number>('all')
  const [leagueFilter, setLeagueFilter] = useState<string>('LCK')
  const [killLine, setKillLine] = useState('')
  const [dragonLine, setDragonLine] = useState('')
  const [timeLine, setTimeLine] = useState('')

  useEffect(() => {
    if (match || matches !== null) return
    setLoading(true); setError(false)
    fetchTodayTomorrowLolMatches()
      .then(m => { setMatches(m); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [match, matches])

  useEffect(() => { setTab('all') }, [match])

  if (!match) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 8, background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>오늘·내일 LOL 경기</span>
          <button type="button" onClick={() => { setLoading(true); setError(false); fetchTodayTomorrowLolMatches({ forceRefresh: true }).then(m => { setMatches(m); setLoading(false) }).catch(() => { setError(true); setLoading(false) }) }}
            style={{ fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>새로고침</button>
        </div>
        {loading && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>일정 불러오는 중...</div>}
        {error && (
          <div style={{ fontSize: 11, color: 'var(--red)', padding: '8px 0', textAlign: 'center' }}>
            일정을 불러오지 못했습니다
            <button type="button" onClick={() => setMatches(null)} style={{ marginLeft: 6, fontSize: 10, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>재시도</button>
          </div>
        )}
        {!loading && !error && matches && matches.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>오늘·내일 예정된 경기가 없습니다</div>
        )}
        {!loading && matches && matches.length > 0 && (() => {
          // 실제로 오늘·내일 경기가 있는 리그만으로 버튼을 만들면, 경기 없는 날엔 그 리그 버튼 자체가
          // 안 보여서(예: LCK CL 경기 없는 날) 순서도 매번 들쭉날쭉했다. 고정된 리그 목록(LEAGUES) 순서로
          // 항상 다 보여주고, 경기 없는 리그를 누르면 그냥 "경기 없습니다"로 안내한다.
          const leagues = LOL_LEAGUES.map(l => l.code)
          const shown = leagueFilter === 'all' ? matches : matches.filter(m => m.league === leagueFilter)
          return (
            <>
              {leagues.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {[...leagues, 'all'].map(l => {
                    const cnt = l === 'all' ? matches.length : matches.filter(m => m.league === l).length
                    return (
                      <button key={l} type="button" onClick={() => setLeagueFilter(l)}
                        style={{
                          fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-body)',
                          border: `1px solid ${leagueFilter === l ? 'var(--gold-border)' : 'var(--border)'}`,
                          background: leagueFilter === l ? 'var(--gold-bg)' : 'var(--bg-card)',
                          color: leagueFilter === l ? 'var(--gold)' : 'var(--text-muted)',
                        }}>{l === 'all' ? '전체' : l} ({cnt})</button>
                    )
                  })}
                </div>
              )}
              {shown.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>오늘·내일 {leagueFilter} 경기가 없습니다</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                  {shown.map(m => {
                    const d = new Date(m.startTime)
                    const isToday = d.toDateString() === new Date().toDateString()
                    const timeLabel = `${isToday ? '오늘' : '내일'} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                    return (
                      <button key={m.id} type="button" onClick={() => onSelectMatch(m)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', flexShrink: 0, width: 44 }}>{m.leagueLabel}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>BO{m.bestOf}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.teamACode || m.teamA} vs {m.teamBCode || m.teamB}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{timeLabel}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}
      </div>
    )
  }

  const nameA = match.teamACode || match.teamA
  const nameB = match.teamBCode || match.teamB
  const lines = HANDICAP_LINES_BY_BESTOF[match.bestOf] ?? [1.5]
  const setTabs = Array.from({ length: match.bestOf === 5 ? 5 : 3 }, (_, i) => i + 1)

  function btnStyle(selected: boolean): React.CSSProperties {
    return {
      padding: '7px 4px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
      border: `1px solid ${selected ? 'var(--gold-border)' : 'var(--border)'}`,
      background: selected ? 'var(--gold-bg)' : 'var(--bg-card)',
      color: selected ? 'var(--gold)' : 'var(--text-secondary)',
    }
  }

  // 킬/타워/드래곤/억제기(+세트별 게임시간) 오버언더 — 라인은 직접 입력.
  // 경기내용에 "어떤 경기"인지 바로 보이도록 팀명을 항상 앞에 붙인다.
  function statRow(label: string, line: string, setLine: (v: string) => void, prefix: string) {
    const overLabel = `${nameA} vs ${nameB} ${prefix}${label} 오버 ${line}`
    const underLabel = `${nameA} vs ${nameB} ${prefix}${label} 언더 ${line}`
    return (
      <div key={label} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', width: 44, flexShrink: 0 }}>{label}</span>
        <input type="text" inputMode="decimal" placeholder="라인" value={line}
          onChange={ev => setLine(ev.target.value.replace(/[^0-9.]/g, ''))}
          style={{ width: 54, flexShrink: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 6px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-num)', outline: 'none', boxSizing: 'border-box' }} />
        <button type="button" disabled={!line} onClick={() => onPick(overLabel)}
          style={{ ...btnStyle(pickLabel === overLabel), flex: 1, opacity: line ? 1 : 0.4, cursor: line ? 'pointer' : 'not-allowed' }}>오버</button>
        <button type="button" disabled={!line} onClick={() => onPick(underLabel)}
          style={{ ...btnStyle(pickLabel === underLabel), flex: 1, opacity: line ? 1 : 0.4, cursor: line ? 'pointer' : 'not-allowed' }}>언더</button>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 8, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)' }}>{match.leagueLabel}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>{nameA} vs {nameB} <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 9 }}>BO{match.bestOf}</span></span>
        <button type="button" onClick={onChangeMatch} style={{ fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>경기 변경</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('all')} style={btnStyle(tab === 'all')}>전체</button>
        {setTabs.map(n => (
          <button key={n} type="button" onClick={() => setTab(n)} style={btnStyle(tab === n)}>{n}세트</button>
        ))}
      </div>

      {tab === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <button type="button" onClick={() => onPick(`${nameA} 승`)} style={btnStyle(pickLabel === `${nameA} 승`)}>{nameA} 승</button>
            <button type="button" onClick={() => onPick(`${nameB} 승`)} style={btnStyle(pickLabel === `${nameB} 승`)}>{nameB} 승</button>
          </div>
          {lines.map(line => (
            <div key={line} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
              <button type="button" onClick={() => onPick(`${nameA} -${line}`)} style={btnStyle(pickLabel === `${nameA} -${line}`)}>{nameA} -{line}</button>
              <button type="button" onClick={() => onPick(`${nameA} +${line}`)} style={btnStyle(pickLabel === `${nameA} +${line}`)}>{nameA} +{line}</button>
              <button type="button" onClick={() => onPick(`${nameB} -${line}`)} style={btnStyle(pickLabel === `${nameB} -${line}`)}>{nameB} -{line}</button>
              <button type="button" onClick={() => onPick(`${nameB} +${line}`)} style={btnStyle(pickLabel === `${nameB} +${line}`)}>{nameB} +{line}</button>
            </div>
          ))}
        </div>
      )}
      {typeof tab === 'number' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <button type="button" onClick={() => onPick(`${nameA} ${tab}세트 승`)} style={btnStyle(pickLabel === `${nameA} ${tab}세트 승`)}>{nameA} {tab}세트 승</button>
            <button type="button" onClick={() => onPick(`${nameB} ${tab}세트 승`)} style={btnStyle(pickLabel === `${nameB} ${tab}세트 승`)}>{nameB} {tab}세트 승</button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {statRow('킬', killLine, setKillLine, `${tab}세트 `)}
            {statRow('드래곤', dragonLine, setDragonLine, `${tab}세트 `)}
            {statRow('시간', timeLine, setTimeLine, `${tab}세트 `)}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 축구 경기 선택 + 마켓(승/무/승, 핸디캡, 오버언더) 선택 UI ── */

function parseOdds(raw: string): number {
  const n = Number(raw.trim())
  if (isNaN(n) || n <= 0) return 0
  if (Number.isInteger(n) && n >= 100) return n / 100
  return n
}

// 경기 내용(팀 이름)으로부터 리그를 유추 — 통계 페이지에서 쌓인 팀→리그 매핑을 그대로 사용
function suggestLeague(sport: string, content: string, baseballOverrides: LeagueOverride[], soccerOverrides: LeagueOverride[], allBetsHistory: BetLite[] = [], basketballOverrides: LeagueOverride[] = [], volleyballOverrides: LeagueOverride[] = []): string {
  if (!content.trim()) return ''
  if (sport === 'baseball') return inferBaseballLeague(content, baseballOverrides) ?? ''
  if (sport === 'soccer') return inferSoccerLeague(content, soccerOverrides) ?? ''
  if (sport === 'basketball') return inferLeagueByKeyword(content, basketballOverrides) ?? ''
  if (sport === 'volleyball') return inferLeagueByKeyword(content, volleyballOverrides) ?? ''
  if (sport === 'esports') return getEsportsLeague(content, allBetsHistory)
  return ''
}

/* ── 경기 내용 입력창: 팀 이름 자동완성 + 최근 성적/연승연패 표시 ── */
function TeamContentInput({ value, onChange, candidates, allBets, placeholder, inputRef, autoFocus, onEnter, showInsight = true }: {
  value: string; onChange: (v: string) => void
  candidates: TeamCandidate[]; allBets: BetLite[]
  placeholder: string
  inputRef?: React.RefObject<HTMLInputElement>
  autoFocus?: boolean
  onEnter?: () => void
  showInsight?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? localRef
  const suggestions = suggestTeamCandidates(value, candidates)
  const insight = showInsight ? getTeamInsight(value, allBets) : null

  function pick(name: string) {
    onChange(name)
    setOpen(false); setHi(-1)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input ref={ref} className="form-input inline-bet-input" placeholder={placeholder} value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (open && suggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi(p => Math.min(p + 1, suggestions.length - 1)); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi(p => Math.max(p - 1, 0)); return }
            if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(suggestions[hi]); return }
            if (e.key === 'Escape') { setOpen(false); setHi(-1); return }
          }
          if (e.key === 'Enter') onEnter?.()
        }} />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 2, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 170, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {suggestions.map((s, i) => (
            <div key={s} onMouseDown={() => pick(s)}
              style={{ padding: '6px 9px', fontSize: 11, cursor: 'pointer', fontWeight: i === hi ? 700 : 500,
                background: i === hi ? 'var(--gold-bg)' : 'transparent', color: i === hi ? 'var(--gold)' : 'var(--text-primary)' }}>
              {s}
            </div>
          ))}
        </div>
      )}
      {insight && insight.totalSettled > 0 && (
        <div style={{ marginTop: 3, fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>최근 {insight.recentN}전 {insight.wins}승{insight.losses}패{insight.pushes ? `${insight.pushes}무` : ''}</span>
          <span style={{ fontWeight: 700, color: insight.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {insight.profit >= 0 ? '+' : ''}{insight.profit.toLocaleString()}원
          </span>
          {insight.streakType && insight.streakCount >= 2 && (
            <span style={{ fontWeight: 700, color: insight.streakType === 'win' ? 'var(--green)' : 'var(--red)' }}>
              {insight.streakType === 'win' ? '🔥' : '❄️'} {insight.streakCount}연{insight.streakType === 'win' ? '승' : '패'}
              {insight.streakCount >= 3 ? (insight.streakType === 'win' ? ' · 추천' : ' · 리스크 주의') : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ── 리그 입력창: 한 글자만 입력해도 과거 저장된 리그명 자동완성 ── */
function LeagueInput({ value, onChange, candidates, placeholder, style }: {
  value: string; onChange: (v: string) => void
  candidates: LeagueCandidate[]
  placeholder: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const suggestions = suggestLeagueCandidates(value, candidates)

  function pick(name: string) {
    onChange(name)
    setOpen(false); setHi(-1)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input inline-bet-input" placeholder={placeholder} value={value}
        style={style}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (open && suggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi(p => Math.min(p + 1, suggestions.length - 1)); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi(p => Math.max(p - 1, 0)); return }
            if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(suggestions[hi]); return }
            if (e.key === 'Escape') { setOpen(false); setHi(-1); return }
          }
        }} />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 2, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 170, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {suggestions.map((s, i) => (
            <div key={s} onMouseDown={() => pick(s)}
              style={{ padding: '6px 9px', fontSize: 11, cursor: 'pointer', fontWeight: i === hi ? 700 : 500,
                background: i === hi ? 'var(--gold-bg)' : 'transparent', color: i === hi ? 'var(--gold)' : 'var(--text-primary)' }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 큰 금액 베팅 기준: 원화 3만원 이상, 달러 20달러 이상
function isBigStake(stake: number, isusd: boolean): boolean {
  return isusd ? stake >= 20 : stake >= 30000
}

function autoMarket(content: string): { market: Market; pick: string } {
  const s = content.trim()
  if (/오버/i.test(s) || /over/i.test(s)) return { market: 'over', pick: s }
  if (/언더/i.test(s) || /under/i.test(s)) return { market: 'under', pick: s }
  // 팀 이름 등 뒤에 라인 숫자가 붙어 있으면 핸디캡 (부호 +/- 유무는 무관, 예: "수원삼성 1.5", "수원삼성 -1.5")
  // 팀 이름만 단독으로 있으면(숫자 없음) 일반승(moneyline)
  if (/[+-]?\d+(\.\d+)?\s*$/.test(s)) return { market: 'handicap', pick: s }
  return { market: 'moneyline', pick: s }
}

// 어떤 형태로 복사되어 오든(쉼표/공백/문자 혼합 포함) 숫자만 뽑아내는 헬퍼
// - KRW: 숫자만 남김 ("12,345원" → "12345", "1 234 567" → "1234567")
// - USD: 숫자 + 소수점 1개(최대 소수 2자리)만 남김
function extractAmount(raw: string, isusd: boolean): string {
  if (!isusd) return raw.replace(/[^\d]/g, '')
  let seenDot = false
  let out = ''
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (ch === '.' && !seenDot) { out += ch; seenDot = true }
  }
  const dotIdx = out.indexOf('.')
  if (dotIdx !== -1 && out.length - dotIdx - 1 > 2) out = out.slice(0, dotIdx + 3)
  return out
}

async function getUsdKrwRate(): Promise<number> {
  const today = dayjs().format('YYYY-MM-DD')
  const { data: cached } = await supabase.from('exchange_rates').select('usd_krw').eq('rate_date', today).single()
  if (cached) return cached.usd_krw
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const json = await res.json()
    const rate = json?.rates?.KRW
    if (rate) { await supabase.from('exchange_rates').upsert({ rate_date: today, usd_krw: rate }); return rate }
  } catch { /* fallback */ }
  const { data: latest } = await supabase.from('exchange_rates').select('usd_krw').order('rate_date', { ascending: false }).limit(1).single()
  return latest?.usd_krw ?? 1350
}


/* ── 입금 모달 ── */
function DepositModal({ site, onClose, onDeposit, onPoint }: {
  site: Site; onClose: () => void
  onDeposit: (amount: number) => void; onPoint: (amount: number) => void
}) {
  const [tab, setTab] = useState<'deposit' | 'point'>('deposit')
  const [amount, setAmount] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isusd = site.currency === 'usd'
  const num = isusd ? parseFloat(amount) : Number(amount.replace(/,/g, ""))
  const isValid = !isNaN(num) && num > 0
  const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
  const tot = dep + pt; const done = site.deposit_bet_done ?? 0
  const rem = Math.max(0, tot - done); const pct = tot > 0 ? Math.round(done / tot * 100) : 0
  const unit = isusd ? '$' : '원'

  // 탭 변경 시 입력 필드에 자동 포커스 + 기존 값 초기화
  useEffect(() => {
    setAmount('')
    inputRef.current?.focus()
  }, [tab])

  // ESC 키로 모달 닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleChange(val: string) {
    // 타이핑/붙여넣기 모두 이 경로를 지나감 — 쉼표·공백·문자가 섞여 들어와도
    // 숫자(및 USD는 소수점)만 자동으로 추출해서 반영 (기존엔 정규식 불일치 시 통째로 무시되어
    // "복사했는데 붙여넣기가 안 되는" 문제가 있었음)
    setAmount(extractAmount(val, isusd))
  }

  async function handlePasteClick() {
    try {
      const text = await navigator.clipboard.readText()
      const extracted = extractAmount(text, isusd)
      if (extracted) setAmount(extracted)
      inputRef.current?.focus()
    } catch {
      alert('클립보드 접근 권한이 없습니다. 브라우저에서 클립보드 읽기 권한을 허용해주세요.')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <ArrowDownToLine size={16} color="var(--orange)" />
          {site.name} 입금 / 포인트
          {isusd && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>USD</span>}
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2, borderRadius: 4 }}><X size={15} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setTab('deposit')} className={tab === 'deposit' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ flex: 1, fontSize: 14, padding: '9px 0', justifyContent: 'center' }}>입금</button>
          <button onClick={() => setTab('point')} className={tab === 'point' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ flex: 1, fontSize: 14, padding: '9px 0', justifyContent: 'center' }}><Gift size={14} /> 포인트</button>
        </div>
        {(dep > 0 || pt > 0) && (
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>입금</span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{isusd ? '$' : ''}{dep.toLocaleString()}{isusd ? '' : '원'}</span>
              </div>
              {pt > 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>포인트</span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--purple)', fontSize: 15 }}>+{pt.toLocaleString()}P</span>
              </div>}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>남은 롤링</span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--gold)', fontSize: 15 }}>{isusd ? '$' : ''}{rem.toLocaleString()}{isusd ? '' : '원'}</span>
              </div>
            </div>
            <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${Math.min(100,pct)}%` }} /></div>
            <div style={{ fontSize: 9, textAlign: 'right', marginTop: 2, color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700 }}>{pct}%</div>
          </div>
        )}

        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {tab === 'deposit' ? `입금액 (${unit})` : `포인트 추가`}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input ref={inputRef} className="form-input" type="text" inputMode="decimal" placeholder={isusd ? '0.00' : '0'} value={amount}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && isValid) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} autoFocus />
          <button type="button" className="btn btn-ghost" title="클립보드에서 숫자 붙여넣기" onClick={handlePasteClick} style={{ flexShrink: 0, padding: '0 10px' }}>
            <ClipboardPaste size={14} />
          </button>
          <button className="btn btn-primary" disabled={!isValid}
            onClick={() => { if (isValid) { tab === 'deposit' ? onDeposit(num) : onPoint(num) }}} style={{ flexShrink: 0 }}>
            <Check size={12} /> {tab === 'deposit' ? '입금' : '추가'}
          </button>
        </div>
        {!isusd && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: -6 }}>
            {[10000, 50000, 100000].map(hk => (
              <button key={hk} type="button" className="hotkey-btn" onClick={() => {
                const cur = Number(amount.replace(/,/g, '')) || 0
                setAmount(String(cur + hk))
              }}>
                +{hk.toLocaleString()}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

/* ── 출금 모달 (우상단 X, 바깥클릭 비활성화, 하단 취소버튼 제거) ── */
function WithdrawModal({ site, onClose, onWithdraw }: {
  site: Site; onClose: () => void; onWithdraw: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  // USD: 소수점 둘째자리까지, KRW: 정수
  const num = isusd ? parseFloat(amount) : Number(amount.replace(/,/g, ''))
  // 0은 허용 — 실제 출금은 아니지만(돈을 다 잃은 경우) 입금/롤링 등을 초기화하는 용도로 사용
  const isValid = !isNaN(num) && num >= 0
  const isZero = isValid && num === 0
  const totalIn = (site.last_deposit ?? 0) + (site.point_deposit ?? 0)
  const netProfit = isValid ? num - totalIn : null

  // ESC 키로 모달 닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleSubmit() {
    if (!isValid) return
    if (isZero && !confirm('출금 없이 초기화만 진행할까요? (진행중인 베팅은 유지되고 입금/롤링만 초기화됩니다)')) return
    onWithdraw(num)
  }

  function handleChange(val: string) {
    setAmount(extractAmount(val, isusd))
  }

  async function handlePasteClick() {
    try {
      const text = await navigator.clipboard.readText()
      const extracted = extractAmount(text, isusd)
      if (extracted) setAmount(extracted)
      inputRef.current?.focus()
    } catch {
      alert('클립보드 접근 권한이 없습니다. 브라우저에서 클립보드 읽기 권한을 허용해주세요.')
    }
  }

  return (
    /* overlay onClick 없음 → 바깥 클릭해도 닫히지 않음 */
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LogOut size={16} color="var(--cyan)" />
          {site.name} 출금 / 마감
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 2, borderRadius: 4 }}><X size={15} /></button>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>총 입금</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--orange)', fontWeight: 700 }}>{isusd ? '$' : ''}{(site.last_deposit ?? 0).toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-light)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>롤링 총액</span>
            <span style={{ fontFamily: 'var(--font-num)', color: 'var(--text-primary)', fontWeight: 700 }}>{isusd ? '$' : ''}{totalIn.toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>출금액 ({unit})</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input ref={inputRef} className="form-input" type="text" inputMode="decimal" placeholder={isusd ? '0.00' : '0'}
            value={amount}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus />
          <button type="button" className="btn btn-ghost" title="클립보드에서 숫자 붙여넣기" onClick={handlePasteClick} style={{ flexShrink: 0, padding: '0 10px' }}>
            <ClipboardPaste size={14} />
          </button>
          <button className="btn btn-cyan" disabled={!isValid} onClick={handleSubmit} style={{ flexShrink: 0 }}>
            {isZero ? '초기화' : '출금'}
          </button>
        </div>
        {isZero && (
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 11, marginBottom: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            출금액 0원 — 실제 출금 없이 입금/롤링만 초기화됩니다. (진행중 베팅은 유지)
          </div>
        )}
        {netProfit !== null && !isZero && (
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, marginBottom: 4, background: netProfit >= 0 ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${netProfit >= 0 ? 'var(--green-border)' : 'var(--red-border)'}` }}>
            수익: <span className={netProfit >= 0 ? 'profit-pos' : 'profit-neg'}>{netProfit >= 0 ? '+' : ''}{isusd ? '$' : ''}{netProfit.toLocaleString()}{isusd ? '' : '원'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 사이트 관리 모달 ── */
function DefaultStakeInput({ site, onCommit }: { site: Site; onCommit: (site: Site, val: number) => void }) {
  const isusd = site.currency === 'usd'
  const [val, setVal] = useState(String(site.default_stake ?? 0))
  useEffect(() => { setVal(String(site.default_stake ?? 0)) }, [site.default_stake])

  function commit() {
    const n = isusd ? (Number(val) || 0) : (Number(val.replace(/,/g,'')) || 0)
    if (n !== (site.default_stake ?? 0)) onCommit(site, n)
  }
  return (
    <input
      type="text"
      inputMode={isusd ? 'decimal' : 'numeric'}
      title="기본 베팅 금액 (베팅추가 시 초기값)"
      placeholder={isusd ? '$0' : '0'}
      value={val}
      onChange={e => {
        const v = e.target.value
        if (isusd) {
          if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setVal(v)
        } else {
          const raw = v.replace(/,/g, '')
          if (raw === '' || /^\d+$/.test(raw)) setVal(raw)
        }
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{ width: 70, padding: '2px 5px', fontSize: 10, fontFamily: 'var(--font-mono)', textAlign: 'right', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', flexShrink: 0 }}
    />
  )
}

function SiteMgrModal({ sites, onClose, onAdd, onDelete, onToggleCurrency, onReorder, onUpdateDefaultStake }: {
  sites: Site[]; onClose: () => void
  onAdd: (name: string, currency: 'krw' | 'usd') => void
  onDelete: (id: string) => void
  onToggleCurrency: (site: Site) => void
  onReorder: (from: string, to: string) => void
  onUpdateDefaultStake: (site: Site, val: number) => void
}) {
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState<'krw' | 'usd'>('krw')
  const dragId = { current: '' }; const overId = { current: '' }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={16} color="var(--gold)" /> 사이트 관리</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            <span style={{ flex: 1 }}>사이트</span>
            <span title="베팅추가 시 초기 베팅 금액 (0 = 기본값)" style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>기본금액</span>
            <span style={{ width: 56, textAlign: 'center', flexShrink: 0 }}>통화</span>
            <span style={{ width: 18, flexShrink: 0 }}></span>
          </div>
          {sites.map(s => (
            <div key={s.id} className="site-mgr-row"
              draggable
              onDragStart={() => { dragId.current = s.id }}
              onDragOver={e => { e.preventDefault(); overId.current = s.id }}
              onDrop={() => {
                if (dragId.current && overId.current && dragId.current !== overId.current) onReorder(dragId.current, overId.current)
                dragId.current = ''; overId.current = ''
              }}
              style={{ cursor: 'grab' }}
            >
              <GripVertical size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: s.active ? 'var(--green)' : 'var(--border)', boxShadow: s.active ? '0 0 5px var(--green)' : 'none' }} />
              <span className="site-mgr-name">{s.name}</span>
              <DefaultStakeInput site={s} onCommit={onUpdateDefaultStake} />
              <button onClick={() => onToggleCurrency(s)} title="KRW/USD" style={{ background: s.currency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)', border: `1px solid ${s.currency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`, borderRadius: 4, color: s.currency === 'usd' ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 7px', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                {s.currency === 'usd' ? <><DollarSign size={10} /> USD</> : '₩ KRW'}
              </button>
              <button onClick={() => onDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', opacity: 0.6, padding: 3, display: 'flex', flexShrink: 0 }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="사이트 이름" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newName.trim() && (onAdd(newName.trim(), newCurrency), setNewName(''))} autoFocus />
            <button onClick={() => setNewCurrency(p => p === 'krw' ? 'usd' : 'krw')} style={{ background: newCurrency === 'usd' ? 'var(--blue-bg)' : 'var(--bg-elevated)', border: `1px solid ${newCurrency === 'usd' ? 'var(--blue-border)' : 'var(--border)'}`, borderRadius: 4, color: newCurrency === 'usd' ? 'var(--blue)' : 'var(--text-muted)', cursor: 'pointer', padding: '0 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {newCurrency === 'usd' ? '$' : '₩'}
            </button>
            <button className="btn btn-primary" onClick={() => { if (newName.trim()) { onAdd(newName.trim(), newCurrency); setNewName('') }}} style={{ flexShrink: 0 }}><Plus size={12} /> 추가</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 인라인 베팅 수정폼 ── */
/* ── 공통 인라인 수정폼 스타일 헬퍼 ── */
function EditFormAmountRow({ isusd, amount, setAmount }: { isusd: boolean; amount: string; setAmount: (v: string) => void }) {
  const unit = isusd ? '$' : '원'
  const stakeN = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g, '')) || 0)
  const hotkeys = isusd ? [5, 10] : [5000, 10000, 20000]
  return (
    <>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input className="form-input inline-bet-input" type="text" inputMode={isusd ? 'decimal' : 'numeric'} placeholder={`금액 (${unit})`}
          value={isusd ? amount : (stakeN > 0 ? stakeN.toLocaleString() : amount)}
          style={{ flex: 1, MozAppearance: 'textfield' } as React.CSSProperties}
          onChange={e => {
            if (isusd) {
              const v = e.target.value
              if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v)
            } else {
              const r = e.target.value.replace(/,/g, '')
              if (r === '' || /^\d+$/.test(r)) setAmount(r)
            }
          }} />
        <button onClick={() => setAmount('')} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>초기화</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => {
            const cur = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g,'')) || 0)
            setAmount(String(cur + hk))
          }}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
    </>
  )
}

/* ── 인라인 단폴 수정폼 ── */
function InlineBetEditForm({ bet, site, onClose, onSave, baseballOverrides, soccerOverrides, basketballOverrides, volleyballOverrides, teamCandidates, allBetsHistory, leagueCandidates }: {
  bet: Bet; site: Site
  onClose: () => void
  onSave: (sport: string, content: string, odds: number, stake: number, isLive: boolean, league: string) => Promise<void>
  baseballOverrides: LeagueOverride[]; soccerOverrides: LeagueOverride[]
  basketballOverrides: LeagueOverride[]; volleyballOverrides: LeagueOverride[]
  teamCandidates: TeamCandidate[]; allBetsHistory: BetLite[]; leagueCandidates: LeagueCandidate[]
}) {
  const isusd = site.currency === 'usd'
  const [sport, setSport]     = useState(bet.sport)
  const [content, setContent] = useState(bet.match)
  const [league, setLeague]   = useState(bet.league ?? '')
  // 기존에 리그가 이미 저장돼 있으면 자동 추론으로 덮어쓰지 않음 (빈 값일 때만 자동채움 대상)
  const [leagueTouched, setLeagueTouched] = useState(!!bet.league)
  const [oddsRaw, setOddsRaw] = useState(bet.odds.toFixed(2))
  const [amount, setAmount]   = useState(String(bet.stake))
  const [isLive, setIsLive]   = useState(!!bet.is_live)
  const [submitting, setSubmitting] = useState(false)
  const contentRef = useRef<HTMLInputElement>(null)
  const oddsV = parseOdds(oddsRaw)
  const stakeN = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g, '')) || 0)

  useEffect(() => {
    if (leagueTouched) return
    const s = suggestLeague(sport, content, baseballOverrides, soccerOverrides, allBetsHistory, basketballOverrides, volleyballOverrides)
    if (s) setLeague(s)
  }, [content, sport, leagueTouched, baseballOverrides, soccerOverrides, allBetsHistory, basketballOverrides, volleyballOverrides])

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  async function submit() {
    if (!content || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true); await onSave(sport, content, oddsV, stakeN, isLive, league); setSubmitting(false)
  }
  return (
    <div className="inline-bet-form" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-bg)' }}>
      <SportButtonGroup value={sport} onChange={v => { setSport(v as typeof bet.sport); contentRef.current?.focus() }} />
      <LeagueInput placeholder="리그 (자동 추론, 직접 입력 가능)" value={league}
        onChange={v => { setLeague(v); setLeagueTouched(true) }}
        candidates={leagueCandidates}
        style={{ fontSize: 11 }} />
      <TeamContentInput inputRef={contentRef} placeholder="경기 내용" value={content} onChange={setContent}
        candidates={teamCandidates} allBets={allBetsHistory} autoFocus onEnter={submit} />
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>→ {oddsV.toFixed(2)}</div>}
      <EditFormAmountRow isusd={isusd} amount={amount} setAmount={setAmount} />
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{(isusd ? (stakeN * (oddsV - 1)).toFixed(2) : Math.round(stakeN * (oddsV - 1)).toLocaleString())}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!content || oddsV <= 0 || stakeN <= 0 || submitting}>
          {submitting ? '저장중...' : '수정 저장'}
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 다폴 수정폼 (2~4다리) ── */
function InlineParlayEditForm({ groupBets, site, onClose, onSave, teamCandidates, allBetsHistory }: {
  groupBets: Bet[]; site: Site
  onClose: () => void
  onSave: (contents: string[], odds: number, stake: number, leagues: string[]) => Promise<void>
  teamCandidates: TeamCandidate[]; allBetsHistory: BetLite[]
}) {
  const isusd = site.currency === 'usd'
  const sortedLegs = [...groupBets].sort((a, b) => a.parlay_leg - b.parlay_leg)
  const leg1 = sortedLegs[0]
  const [contents, setContents] = useState<string[]>(sortedLegs.map(b => b.match))
  const [oddsRaw, setOddsRaw] = useState((leg1?.odds ?? 1).toFixed(2))
  const [amount, setAmount]   = useState(String(leg1?.stake ?? 0))
  const [submitting, setSubmitting] = useState(false)
  const oddsV  = parseOdds(oddsRaw)
  const stakeN = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g, '')) || 0)
  const allFilled = contents.every(c => !!c)
  const labelSt: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 2 }

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  function addLeg() {
    setContents(p => p.length >= MULTI_MAX_LEGS ? p : [...p, ''])
  }
  function removeLeg(idx: number) {
    setContents(p => p.length <= 2 ? p : p.filter((_, i) => i !== idx))
  }
  async function submit() {
    if (!allFilled || oddsV <= 0 || stakeN <= 0) return
    setSubmitting(true); await onSave(contents, oddsV, stakeN, contents.map(() => '')); setSubmitting(false)
  }
  return (
    <div className="inline-bet-form" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-bg)' }}>
      {contents.map((c, i) => (
        <div key={i}>
          <div style={{ ...labelSt, marginTop: i === 0 ? 0 : 4 }}>{LEG_MARKS[i] ?? i + 1}</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TeamContentInput placeholder={`경기 내용 ${LEG_MARKS[i] ?? i + 1}`} value={c}
                onChange={v => setContents(p => p.map((pc, pi) => pi === i ? v : pc))}
                candidates={teamCandidates} allBets={allBetsHistory} autoFocus={i === 0} onEnter={submit} />
            </div>
            {i === contents.length - 1 && contents.length < MULTI_MAX_LEGS ? (
              <button type="button" onClick={addLeg} title="다리 추가" style={{
                width: 34, height: 34, flexShrink: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Plus size={14} /></button>
            ) : contents.length > 2 ? (
              <button type="button" onClick={() => removeLeg(i)} title="다리 삭제" style={{
                width: 34, height: 34, flexShrink: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><X size={14} /></button>
            ) : <div style={{ width: 34, flexShrink: 0 }} />}
          </div>
        </div>
      ))}
      <input className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>배당 → {oddsV.toFixed(2)}</div>}
      <EditFormAmountRow isusd={isusd} amount={amount} setAmount={setAmount} />
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{(isusd ? (stakeN * (oddsV - 1)).toFixed(2) : Math.round(stakeN * (oddsV - 1)).toLocaleString())}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!allFilled || oddsV <= 0 || stakeN <= 0 || submitting}>
          {submitting ? '저장중...' : '수정 저장'}
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (단폴 / + 버튼으로 다폴 전환) ── */
// 다폴 최대 다리 수 (경기 내용 ① + 추가 다리 최대 3개 = 최대 4폴)
const MULTI_MAX_LEGS = 4
const LEG_MARKS = ['①', '②', '③', '④']

function SingleBetForm({ site, onClose, onBet, onMultiBet, defaultSport, baseballOverrides, soccerOverrides, basketballOverrides, volleyballOverrides, teamCandidates, allBetsHistory, leagueCandidates }: {
  site: Site; onClose: () => void; defaultSport: string
  onBet: (sport: string, content: string, odds: number, amount: number, isLive: boolean, league: string) => Promise<boolean>
  onMultiBet: (sport: string, contents: string[], odds: number, amount: number, leagues: string[]) => Promise<boolean>
  baseballOverrides: LeagueOverride[]; soccerOverrides: LeagueOverride[]
  basketballOverrides: LeagueOverride[]; volleyballOverrides: LeagueOverride[]
  teamCandidates: TeamCandidate[]; allBetsHistory: BetLite[]; leagueCandidates: LeagueCandidate[]
}) {
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const defaultAmount = site.default_stake > 0 ? String(site.default_stake) : (isusd ? '5' : '10000')
  const [sport, setSport]       = useState<string>(defaultSport || 'esports')
  const [sportTouched, setSportTouched] = useState(false)
  const [content, setContent]   = useState('')
  const [league, setLeague]     = useState('')
  const [leagueTouched, setLeagueTouched] = useState(false)
  // LOL 전용: 경기 선택 + 마켓(승패/핸디캡/세트별 승) 선택. 여기서 확정되면 content/league에 반영된다.
  const [lolMatch, setLolMatch] = useState<UpcomingLolMatch | null>(null)
  const [lolPick, setLolPick]   = useState<string | null>(null)
  // 베팅 모드: 단폴 / 다폴. 다폴은 리그 없이 경기 내용 여러 개(최대 4개) + 배당/금액 공유.
  const [mode, setMode] = useState<'single' | 'multi'>('single')
  // 경기 내용 ①은 content, 나머지(②③④)는 extraContents에 담는다
  const [extraContents, setExtraContents] = useState<string[]>([''])
  const [oddsRaw, setOddsRaw]   = useState('')
  const [amount, setAmount]     = useState(defaultAmount)
  const [isLive, setIsLive]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const contentRef = useRef<HTMLInputElement>(null)
  const oddsRef = useRef<HTMLInputElement>(null)
  const oddsV = parseOdds(oddsRaw)
  const stakeN = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g, "")) || 0)
  const hotkeys = isusd ? [5, 10] : [5000, 10000, 20000]

  // 경기 내용(팀 이름)만으로 최근에 이 팀을 어느 종목으로 베팅했는지 찾아 종목을 자동 선택
  // (예: "휴스턴"만 써도 최근 베팅 기록이 야구였다면 야구로 전환. 직접 종목을 고른 뒤에는 덮어쓰지 않음)
  useEffect(() => {
    if (sportTouched) return
    const insight = getTeamInsight(content, allBetsHistory, 1)
    if (insight && insight.sport && insight.sport !== sport) setSport(insight.sport)
  }, [content, sportTouched, allBetsHistory, sport])

  // 경기 내용/종목이 바뀔 때마다 리그를 자동 추론 (사용자가 직접 리그를 수정한 뒤에는 덮어쓰지 않음)
  useEffect(() => {
    if (leagueTouched) return
    const s = suggestLeague(sport, content, baseballOverrides, soccerOverrides, allBetsHistory, basketballOverrides, volleyballOverrides)
    if (s) setLeague(s)
  }, [content, sport, leagueTouched, baseballOverrides, soccerOverrides, allBetsHistory, basketballOverrides, volleyballOverrides])

  // LOL: 경기 고르면 리그가 바로 정해지고, 마켓(승패/핸디캡/세트승)을 고르면 content가 확정된다.
  useEffect(() => {
    if (!lolMatch) return
    setLeague(lolMatch.league); setLeagueTouched(true)
  }, [lolMatch])
  useEffect(() => {
    if (lolPick != null) {
      setContent(lolPick)
      // 마켓(승패/핸디캡/세트승)을 고르면 바로 배당을 입력할 수 있게 커서를 옮겨준다
      requestAnimationFrame(() => oddsRef.current?.focus())
    }
  }, [lolPick])
  // 종목을 LOL이 아닌 걸로 바꾸면 선택 상태 초기화 (다시 LOL로 돌아왔을 때 깨끗하게 새로 고르도록)
  useEffect(() => {
    if (sport !== 'esports' && (lolMatch || lolPick)) { setLolMatch(null); setLolPick(null); setContent(''); setLeagueTouched(false) }
  }, [sport, lolMatch, lolPick])

  function handleOdds(raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    if (/^\d{3}$/.test(clean)) setOddsRaw((Number(clean) / 100).toFixed(2))
    else setOddsRaw(clean)
  }
  const multiContents = [content, ...extraContents]
  const multiFilled = multiContents.every(c => !!c)

  function addLeg() {
    setExtraContents(p => p.length + 1 >= MULTI_MAX_LEGS ? p : [...p, ''])
  }
  function removeLeg(idx: number) {
    setExtraContents(p => p.filter((_, i) => i !== idx))
  }

  async function submit() {
    if (!content || oddsV <= 0 || stakeN <= 0) return
    if (mode === 'multi' && !multiFilled) return
    setSubmitting(true)
    const ok = mode === 'multi'
      ? await onMultiBet(sport, multiContents, oddsV, stakeN, multiContents.map(() => ''))
      : await onBet(sport, content, oddsV, stakeN, isLive, league)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div className="inline-bet-form">
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button type="button" onClick={() => setMode('single')} style={{
          flex: 1, padding: '6px 0', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)',
          border: `1px solid ${mode === 'single' ? 'var(--gold-border)' : 'var(--border)'}`,
          background: mode === 'single' ? 'var(--gold-bg)' : 'var(--bg-elevated)',
          color: mode === 'single' ? 'var(--gold)' : 'var(--text-secondary)',
        }}>단폴</button>
        <button type="button" onClick={() => { setMode('multi'); setSport('other') }} style={{
          flex: 1, padding: '6px 0', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)',
          border: `1px solid ${mode === 'multi' ? 'var(--purple-border)' : 'var(--border)'}`,
          background: mode === 'multi' ? 'var(--purple-bg)' : 'var(--bg-elevated)',
          color: mode === 'multi' ? 'var(--purple)' : 'var(--text-secondary)',
        }}>다폴</button>
      </div>
      {mode === 'single' && (
        <SportButtonGroup value={sport} onChange={v => { setSport(v); setSportTouched(true); setLeagueTouched(false); contentRef.current?.focus() }} />
      )}
      {sport === 'esports' && mode === 'single' && (
        <LolMatchPicker
          match={lolMatch}
          onSelectMatch={m => { setLolMatch(m); setLolPick(null); setContent('') }}
          onChangeMatch={() => { setLolMatch(null); setLolPick(null); setContent(''); setLeagueTouched(false) }}
          pickLabel={lolPick}
          onPick={label => setLolPick(label)}
        />
      )}
      {mode === 'single' && (
        <LeagueInput placeholder={sport === 'esports' ? '리그 (자동 추론, LCK CL 외 다른 리그 등은 여기 직접 입력)' : '리그 (자동 추론, 직접 입력 가능, KBO/NPB/KBL 등은 여기 직접 입력)'} value={league}
          onChange={v => { setLeague(v); setLeagueTouched(true) }}
          candidates={leagueCandidates}
          style={{ fontSize: 11 }} />
      )}
      <TeamContentInput inputRef={contentRef} placeholder={mode === 'multi' ? `경기 내용 ${LEG_MARKS[0]}` : '경기 내용'} value={content} onChange={setContent}
        candidates={teamCandidates} allBets={allBetsHistory} autoFocus onEnter={submit} />
      {mode === 'multi' && extraContents.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TeamContentInput placeholder={`경기 내용 ${LEG_MARKS[i + 1] ?? i + 2}`} value={c}
              onChange={v => setExtraContents(p => p.map((pc, pi) => pi === i ? v : pc))}
              candidates={teamCandidates} allBets={allBetsHistory} onEnter={submit} />
          </div>
          {i === extraContents.length - 1 && extraContents.length + 1 < MULTI_MAX_LEGS ? (
            <button type="button" onClick={addLeg} title="다리 추가" style={{
              width: 34, height: 34, flexShrink: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Plus size={14} /></button>
          ) : extraContents.length > 1 ? (
            <button type="button" onClick={() => removeLeg(i)} title="다리 삭제" style={{
              width: 34, height: 34, flexShrink: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><X size={14} /></button>
          ) : <div style={{ width: 34, flexShrink: 0 }} />}
        </div>
      ))}
      <input ref={oddsRef} className="form-input inline-bet-input" placeholder="배당 (125=1.25)" value={oddsRaw}
        onChange={e => handleOdds(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        onBlur={e => { const n = parseOdds(e.target.value); if (n > 0) setOddsRaw(n.toFixed(2)) }} />
      {oddsV > 0 && <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, textAlign: 'right' }}>→ {oddsV.toFixed(2)}</div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input className="form-input inline-bet-input" type="text" inputMode={isusd ? 'decimal' : 'numeric'} placeholder={`금액 (${unit})`}
          value={isusd ? amount : (stakeN > 0 ? stakeN.toLocaleString() : amount)}
          style={{ flex: 1, MozAppearance: 'textfield' } as React.CSSProperties}
          onChange={e => {
            if (isusd) {
              const v = e.target.value
              if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v)
            } else {
              const raw = e.target.value.replace(/,/g, '')
              if (raw === '' || /^\d+$/.test(raw)) setAmount(raw)
            }
          }}
          onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={() => setAmount('')} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>초기화</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => {
            const cur = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g,'')) || 0)
            setAmount(String(cur + hk))
          }}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      {oddsV > 0 && stakeN > 0 && (
        <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, textAlign: 'right' }}>
          예상 +{isusd ? '$' : ''}{(isusd ? (stakeN * (oddsV - 1)).toFixed(2) : Math.round(stakeN * (oddsV - 1)).toLocaleString())}{isusd ? '' : '원'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!content || (mode === 'multi' && !multiFilled) || oddsV <= 0 || stakeN <= 0 || submitting}>
          등록
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ── 인라인 베팅폼 (게임 롤링 — 금액만 입력, 그만큼 남은 롤링 차감) ── */
function GameRollingForm({ site, onClose, onSubmit }: {
  site: Site; onClose: () => void
  onSubmit: (amount: number) => Promise<boolean>
}) {
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const stakeN = isusd ? (parseFloat(amount) || 0) : (Number(amount.replace(/,/g, '')) || 0)
  const isValid = stakeN > 0
  const hotkeys = isusd ? [5, 10] : [5000, 10000]

  function handleChange(val: string) { setAmount(extractAmount(val, isusd)) }
  async function handlePasteClick() {
    try {
      const text = await navigator.clipboard.readText()
      const extracted = extractAmount(text, isusd)
      if (extracted) setAmount(extracted)
      inputRef.current?.focus()
    } catch {
      alert('클립보드 접근 권한이 없습니다. 브라우저에서 클립보드 읽기 권한을 허용해주세요.')
    }
  }
  async function submit() {
    if (!isValid) return
    setSubmitting(true)
    const ok = await onSubmit(stakeN)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div className="inline-bet-form">
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 2 }}>
        게임 롤링 금액 ({unit}) — 남은 롤링에서 차감됩니다
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input ref={inputRef} className="form-input inline-bet-input" type="text" inputMode={isusd ? 'decimal' : 'numeric'} placeholder={`롤링 금액 (${unit})`}
          value={isusd ? amount : (stakeN > 0 ? stakeN.toLocaleString() : amount)}
          style={{ flex: 1 }}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
        <button type="button" title="클립보드에서 숫자 붙여넣기" onClick={handlePasteClick} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <ClipboardPaste size={14} />
        </button>
        <button onClick={() => setAmount('')} style={{ padding: '0 8px', height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>초기화</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {hotkeys.map(hk => (
          <button key={hk} className="hotkey-btn" onClick={() => {
            const cur = isusd ? (Number(amount) || 0) : (Number(amount.replace(/,/g, '')) || 0)
            setAmount(String(cur + hk))
          }}>
            +{isusd ? `$${hk}` : `${hk.toLocaleString()}`}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '7px 0', justifyContent: 'center' }}
          onClick={submit} disabled={!isValid || submitting}>
          {submitting ? '저장중...' : '게임 롤링 추가'}
        </button>
        <button className="btn btn-ghost" style={{ padding: '7px 10px' }} onClick={onClose}><X size={12} /></button>
      </div>
    </div>
  )
}

/* ════════════════════════════════ DASHBOARD ════════════════════════════════ */

function WeekMonthDeposit({ sites, cashflows, weekStart, weekEnd }: {
  sites: { id: string; name: string; currency: string }[]
  cashflows: { flow_date: string; type: string; amount: number; site_id: string | null }[]
  weekStart: string; weekEnd: string
}) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const monthEnd   = dayjs().endOf('month').format('YYYY-MM-DD')
  const from = mode === 'week' ? weekStart : monthStart
  const to   = mode === 'week' ? weekEnd   : monthEnd

  const filtered = cashflows.filter(c => c.type === 'expense' && c.flow_date >= from && c.flow_date <= to)
  const total = filtered.reduce((a, c) => a + c.amount, 0)
  const krwSites = sites.filter(s => s.currency === 'krw')

  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          입금 현황
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setMode('week')} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: '1px solid', cursor: 'pointer', background: mode === 'week' ? 'var(--gold-bg)' : 'none', borderColor: mode === 'week' ? 'var(--gold-border)' : 'var(--border)', color: mode === 'week' ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>이번주</button>
          <button onClick={() => setMode('month')} style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: '1px solid', cursor: 'pointer', background: mode === 'month' ? 'var(--gold-bg)' : 'none', borderColor: mode === 'month' ? 'var(--gold-border)' : 'var(--border)', color: mode === 'month' ? 'var(--gold)' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>한달</button>
        </div>
      </div>
      {krwSites.map(s => {
        const siteTotal = filtered.filter(c => c.site_id === s.id).reduce((a, c) => a + c.amount, 0)
        if (siteTotal === 0) return null
        return (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.name}</span>
            <span style={{ fontFamily: 'var(--font-num)', fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>{siteTotal.toLocaleString()}원</span>
          </div>
        )
      })}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>합계</span>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 800, color: 'var(--orange)' }}>{total.toLocaleString()}원</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const today = dayjs().format('YYYY-MM-DD')

  const [sites, setSites]     = useState<Site[]>([])
  const [bets, setBets]       = useState<Bet[]>([])
  const [gameRollings, setGameRollings] = useState<GameRolling[]>([])

  const [showSiteMgr, setShowSiteMgr]   = useState(false)
  const [depositSite, setDepositSite]   = useState<Site | null>(null)
  const [withdrawSite, setWithdrawSite] = useState<Site | null>(null)
  const [openFormSiteId, setOpenFormSiteId] = useState<string | null>(null)
  const [openFormType, setOpenFormType] = useState<'sports' | 'game'>('sports')
  const [hoverBetId, setHoverBetId]     = useState<string | null>(null)
  const [expandedSettled, setExpandedSettled] = useState<Record<string, boolean>>({})
  const [inlineEditBetId, setInlineEditBetId] = useState<string | null>(null)
  // 다폴 진행중 개별 leg 적중 체크 상태 (leg bet id → checked). 하나라도 실패면 즉시 전체 실패 처리하므로 여기엔 "적중" 체크만 임시 보관한다.
  const [parlayLegWinChecks, setParlayLegWinChecks] = useState<Record<string, boolean>>({})
  const [baseballOverrides, setBaseballOverrides] = useState<LeagueOverride[]>([])
  const [soccerOverrides, setSoccerOverrides]     = useState<LeagueOverride[]>([])
  const [basketballOverrides, setBasketballOverrides] = useState<LeagueOverride[]>([])
  const [volleyballOverrides, setVolleyballOverrides] = useState<LeagueOverride[]>([])
  // 팀 이름 자동완성 / 최근 성적·연승연패 조회용 — 사이트/숨김 여부와 무관하게 전체 베팅 이력을 별도로 보관
  const [allBetsHistory, setAllBetsHistory] = useState<BetLite[]>([])
  const teamCandidates = useMemo(() => buildTeamCandidates(allBetsHistory), [allBetsHistory])
  const leagueCandidates = useMemo(() => buildLeagueCandidates(allBetsHistory), [allBetsHistory])
  // 전체 사이트 입금/롤링 합산 요약(원화 환산)용 환율
  const [usdKrwRate, setUsdKrwRate] = useState<number>(1350)

  useEffect(() => { loadSites(); loadBets(); loadGameRollings(); loadLeagueOverrides(); loadAllBetsHistory(); getUsdKrwRate().then(setUsdKrwRate) }, [])

  async function loadSites() {
    const { data } = await supabase.from('sites').select('*').eq('settlement_only', false).order('sort_order')
    if (data) setSites(data)
  }
  async function loadBets() {
    const { data } = await supabase.from('bets').select('*').eq('is_hidden', false).order('bet_date', { ascending: true }).order('created_at', { ascending: true })
    if (data) setBets(data)
  }
  async function loadGameRollings() {
    const { data } = await supabase.from('game_rollings').select('*').order('created_at', { ascending: true })
    if (data) setGameRollings(data)
  }
  async function loadLeagueOverrides() {
    const [{ data: bb }, { data: sc }, { data: bk }, { data: vb }] = await Promise.all([
      supabase.from('league_overrides').select('keyword, league'),
      supabase.from('soccer_league_overrides').select('keyword, league'),
      supabase.from('basketball_league_overrides').select('keyword, league'),
      supabase.from('volleyball_league_overrides').select('keyword, league'),
    ])
    if (bb) setBaseballOverrides(bb as LeagueOverride[])
    if (sc) setSoccerOverrides(sc as LeagueOverride[])
    if (bk) setBasketballOverrides(bk as LeagueOverride[])
    if (vb) setVolleyballOverrides(vb as LeagueOverride[])
  }
  async function loadAllBetsHistory() {
    const { data } = await supabase.from('bets').select('sport, match, result, profit, bet_date, created_at, league').order('bet_date', { ascending: false }).limit(5000)
    if (data) setAllBetsHistory(data as BetLite[])
  }
  const totalRolling     = (s: Site) => (s.last_deposit ?? 0) + (s.point_deposit ?? 0)
  const depositRemaining = (s: Site) => Math.max(0, totalRolling(s) - (s.deposit_bet_done ?? 0))
  const depositPct       = (s: Site) => totalRolling(s) > 0 ? Math.round((s.deposit_bet_done ?? 0) / totalRolling(s) * 100) : 0
  const toKrw = (amount: number, currency: 'krw' | 'usd') => currency === 'usd' ? amount * usdKrwRate : amount
  // 전체 사이트 합산 (달러는 원화로 환산) — 지금 롤링이 얼마나 필요한지 한눈에 보기 위함 (개별 사이트 카드와 동일한 구성: 입금/포인트/남은롤링/진행률)
  const aggDep = sites.reduce((sum, s) => sum + toKrw(s.last_deposit ?? 0, s.currency), 0)
  const aggPt  = sites.reduce((sum, s) => sum + toKrw(s.point_deposit ?? 0, s.currency), 0)
  const aggRollingTarget = aggDep + aggPt
  const aggRollingDone   = sites.reduce((sum, s) => sum + toKrw(s.deposit_bet_done ?? 0, s.currency), 0)
  const aggRem = Math.max(0, aggRollingTarget - aggRollingDone)
  const aggPct = aggRollingTarget > 0 ? Math.round(aggRollingDone / aggRollingTarget * 100) : 0
  const betsBySite       = (id: string) => bets.filter(b => b.site_id === id)
  const pendingBySite    = (id: string) => betsBySite(id).filter(b => b.result === 'pending')
  const settledBySite    = (id: string) => betsBySite(id).filter(b => b.result !== 'pending')
  const gameRollingsBySite = (id: string) => gameRollings.filter(g => g.site_id === id)
  const colCount = Math.max(1, sites.length)

  function sitePnL(site: Site) {
    // 마감된(비활성) 사이트는 사이트명 옆 진행중 수익/손실 표시를 하지 않음
    if (!site.active) return null
    const hasPending = pendingBySite(site.id).length > 0
    const visibleSum = settledBySite(site.id).reduce((acc, b) => acc + b.profit, 0)
    const carry = site.carry_pnl ?? 0
    const total = carry + visibleSum
    // 아직 아무 이력도 없는 새 사이트 → 표시 안 함
    if ((site.last_deposit ?? 0) === 0 && !hasPending && total === 0) return null
    return total
  }

  /* ── 사이트 관리 ── */
  async function addSite(name: string, currency: 'krw' | 'usd') {
    const { data } = await supabase.from('sites').insert({
      name, balance: 0, active: false, sort_order: sites.length,
      rolling_target: 0, rolling_done: 0, last_deposit: 0, deposit_bet_done: 0,
      point_deposit: 0, total_withdrawal: 0, currency, bet_type: 'single',
    }).select().single()
    if (data) { await logAction({ action_type: 'insert', table_name: 'sites', record_id: data.id, after_data: data, description: `사이트 추가: ${data.name}` }); setSites(p => [...p, data]) }
  }
  async function deleteSite(id: string) {
    const site = sites.find(s => s.id === id)
    if (!site || !confirm(`${site.name} 삭제?`)) return
    await logAction({ action_type: 'delete', table_name: 'sites', record_id: id, before_data: site as never, description: `사이트 삭제: ${site.name}` })
    await supabase.from('sites').delete().eq('id', id); setSites(p => p.filter(s => s.id !== id))
  }
  async function toggleCurrency(site: Site) {
    const { data } = await supabase.from('sites').update({ currency: site.currency === 'krw' ? 'usd' : 'krw' }).eq('id', site.id).select().single()
    if (data) setSites(p => p.map(s => s.id === site.id ? data : s))
  }
  async function updateDefaultStake(site: Site, val: number) {
    const { data } = await supabase.from('sites').update({ default_stake: val }).eq('id', site.id).select().single()
    if (data) setSites(p => p.map(s => s.id === site.id ? data : s))
  }
  async function reorderSites(fromId: string, toId: string) {
    const reordered = [...sites]
    const fi = reordered.findIndex(s => s.id === fromId); const ti = reordered.findIndex(s => s.id === toId)
    const [moved] = reordered.splice(fi, 1); reordered.splice(ti, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i }))
    setSites(updated)
    for (const s of updated) await supabase.from('sites').update({ sort_order: s.sort_order }).eq('id', s.id)
  }

  /* ── 입금 ── */
  async function doDeposit(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }; const isusd = depositSite.currency === 'usd'
    const newTotalDeposit = (depositSite.last_deposit ?? 0) + amount
    const newTotalRolling = newTotalDeposit + (depositSite.point_deposit ?? 0)
    const currentDone = depositSite.deposit_bet_done ?? 0
    const newDone = currentDone > (newTotalRolling - amount) ? newTotalRolling - amount : currentDone
    const { data } = await supabase.from('sites').update({
      balance: depositSite.balance + amount, active: true,
      last_deposit: newTotalDeposit,
      deposit_bet_done: Math.max(0, newDone),
    }).eq('id', depositSite.id).select().single()
    if (data) {
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(amount * usdKrwRate) }
      const { data: cf } = await supabase.from('cashflows').insert({ flow_date: today, type: 'expense', category: '베팅입금', description: `${depositSite.name} 입금`, amount, site_id: depositSite.id, currency: depositSite.currency, usd_krw_rate: usdKrwRate, amount_krw: isusd ? amountKrw : amount }).select().single()
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 입금 +${amount.toLocaleString()}`, cashflow_id: cf?.id ?? null })
      setSites(p => p.map(s => s.id === data.id ? data : s))
    }
    setDepositSite(null)
  }
  async function doPoint(amount: number) {
    if (!depositSite) return
    const before = { ...depositSite }
    // 입금과 동일한 로직: 포인트가 추가되면 그만큼 남은 롤링이 다시 생겨야 함 (롤링완료 상태였어도 추가된 포인트만큼은 롤링 필요)
    const newTotalPoint = (depositSite.point_deposit ?? 0) + amount
    const newTotalRolling = (depositSite.last_deposit ?? 0) + newTotalPoint
    const currentDone = depositSite.deposit_bet_done ?? 0
    const newDone = currentDone > (newTotalRolling - amount) ? newTotalRolling - amount : currentDone
    const { data } = await supabase.from('sites').update({
      balance: depositSite.balance + amount, active: true,
      point_deposit: newTotalPoint,
      deposit_bet_done: Math.max(0, newDone),
    }).eq('id', depositSite.id).select().single()
    if (data) { await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${depositSite.name} 포인트 +${amount.toLocaleString()}P` }); setSites(p => p.map(s => s.id === data.id ? data : s)) }
    setDepositSite(null)
  }
  async function doWithdraw(amount: number) {
    if (!withdrawSite) return
    const before = { ...withdrawSite }; const isusd = withdrawSite.currency === 'usd'

    // 완료된 목록(이미 결과 처리된 베팅)은 마감 시점에 숨김 처리 — 다음 마감 때 완료 목록이 비워지는 효과
    // 진행중(pending) 베팅은 절대 건드리지 않음 — 결과 처리 전까지 계속 남아있어야 함
    const siteSettled = settledBySite(withdrawSite.id)
    const settledProfitSum = siteSettled.reduce((acc, b) => acc + b.profit, 0)
    const stillPending = pendingBySite(withdrawSite.id).length > 0
    // 진행중 베팅이 남아있으면 수익률을 이월(초기화하지 않음), 없으면 완전히 초기화
    const newCarryPnl = stillPending ? (withdrawSite.carry_pnl ?? 0) + settledProfitSum : 0

    if (siteSettled.length > 0) {
      await supabase.from('bets').update({ is_hidden: true }).in('id', siteSettled.map(b => b.id))
      setBets(p => p.filter(b => !siteSettled.some(sb => sb.id === b.id)))
    }

    // 게임 롤링 기록도 마감 시 초기화 (deposit_bet_done이 0으로 리셋되므로 함께 정리)
    const siteGameRollings = gameRollingsBySite(withdrawSite.id)
    if (siteGameRollings.length > 0) {
      await supabase.from('game_rollings').delete().in('id', siteGameRollings.map(g => g.id))
      setGameRollings(p => p.filter(g => !siteGameRollings.some(sg => sg.id === g.id)))
    }

    // 출금액 0원 = 실제 출금이 아니라 초기화(전액 손실 등). total_withdrawal에도 반영하지 않음
    const isZeroWithdraw = amount === 0

    // 마감: 사이트 비활성 + 잔액/입금/롤링 초기화. 베팅 중인 목록은 절대 건드리지 않음
    // (결과 처리를 하지 않는 한 진행중인 베팅은 계속 남아있어야 함)
    const { data: updatedSite } = await supabase.from('sites').update({
      active: false,
      total_withdrawal: isZeroWithdraw ? (withdrawSite.total_withdrawal ?? 0) : (withdrawSite.total_withdrawal ?? 0) + amount,
      balance: 0, last_deposit: 0, deposit_bet_done: 0, point_deposit: 0,
      carry_pnl: newCarryPnl,
    }).eq('id', withdrawSite.id).select().single()

    if (updatedSite) setSites(p => p.map(s => s.id === updatedSite.id ? updatedSite : s))

    // cashflow/log는 sites update 성공 여부와 무관하게 항상 기록 (단, 0원은 실제 자금 이동이 없으므로 cashflow 미생성)
    const siteIdForLog = withdrawSite.id
    const siteNameForLog = withdrawSite.name
    let cf: { id: string } | null = null
    if (!isZeroWithdraw) {
      let usdKrwRate: number | null = null; let amountKrw: number | null = null
      if (isusd) { usdKrwRate = await getUsdKrwRate(); amountKrw = Math.round(amount * usdKrwRate) }
      const { data: cfData, error: cfError } = await supabase.from('cashflows').insert({
        flow_date: today, type: 'income', category: '베팅수익',
        description: `${siteNameForLog} 마감`, amount, site_id: siteIdForLog,
        currency: withdrawSite.currency, usd_krw_rate: usdKrwRate,
        amount_krw: isusd ? amountKrw : amount,
      }).select().single()
      if (cfError) console.error('cashflow insert error:', cfError)
      cf = cfData
    }
    await logAction({ action_type: 'update', table_name: 'sites', record_id: siteIdForLog, before_data: before as never, after_data: (updatedSite ?? before) as never, description: isZeroWithdraw ? `${siteNameForLog} 마감 (초기화, 출금 없음)` : `${siteNameForLog} 출금 ${amount.toLocaleString()}`, cashflow_id: cf?.id ?? null })

    await loadSites()
    setWithdrawSite(null)
  }

  /* ── 베팅 제출 ── */
  async function submitBet(site: Site, sport: string, content: string, odds: number, stake: number, isLive = false, league = ''): Promise<boolean> {
    const { market, pick } = autoMarket(content)
    const { data: betData } = await supabase.from('bets').insert({ bet_date: today, sport: sport as Sport, league, match: content, market, pick, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: null, parlay_leg: 1, is_live: isLive }).select().single()
    if (!betData) return false
    const { data: siteData } = await supabase.from('sites').update({ balance: site.balance - stake, rolling_done: site.rolling_done + stake, deposit_bet_done: (site.deposit_bet_done ?? 0) + stake }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betData.id, after_data: betData as never, description: `[${site.name}] ${content} / ${stake.toLocaleString()}` })
      setBets(p => [...p, betData]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      setAllBetsHistory(p => [{ sport: betData.sport, match: betData.match, result: betData.result, profit: betData.profit, bet_date: betData.bet_date, created_at: betData.created_at }, ...p])
      return true
    }
    return false
  }
  /* ── 다폴 제출 (2~4다리, 리그 없이 경기 내용 여러 개 + 배당/금액 공유) ── */
  async function submitMultiBet(site: Site, sport: string, contents: string[], odds: number, stake: number, leagues: string[] = []): Promise<boolean> {
    if (contents.length < 2) return false
    const groupId = crypto.randomUUID()
    const rows = contents.map((c, i) => {
      const { market, pick } = autoMarket(c)
      return { bet_date: today, sport: sport as Sport, league: leagues[i] ?? '', match: c, market, pick, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: site.id, parlay_group: groupId, parlay_leg: i + 1 }
    })
    const { data: betsData } = await supabase.from('bets').insert(rows).select()
    if (!betsData || betsData.length < contents.length) return false
    // 다폴은 한 건 베팅 - stake 한 번만 차감
    const { data: siteData } = await supabase.from('sites').update({ balance: site.balance - stake, rolling_done: site.rolling_done + stake, deposit_bet_done: (site.deposit_bet_done ?? 0) + stake }).eq('id', site.id).select().single()
    if (siteData) {
      await logAction({ action_type: 'insert', table_name: 'bets', record_id: betsData[0].id, after_data: betsData[0] as never, description: `[${site.name}] 다폴 ${contents.join('×')} / ${stake.toLocaleString()}` })
      setBets(p => [...p, ...betsData]); setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      setAllBetsHistory(p => [...betsData.map(b => ({ sport: b.sport, match: b.match, result: b.result, profit: b.profit, bet_date: b.bet_date, created_at: b.created_at })), ...p])
      return true
    }
    return false
  }

  /* ── 게임 롤링 추가 (베팅 없이 롤링 금액만 차감 + 목록에 기록) ── */
  async function submitGameRolling(site: Site, amount: number): Promise<boolean> {
    const before = { ...site }
    const { data: grData } = await supabase.from('game_rollings').insert({ site_id: site.id, amount }).select().single()
    if (!grData) return false
    const newDone = (site.deposit_bet_done ?? 0) + amount
    const { data } = await supabase.from('sites').update({ deposit_bet_done: newDone }).eq('id', site.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'sites', record_id: data.id, before_data: before as never, after_data: data as never, description: `${site.name} 게임 롤링 +${amount.toLocaleString()}` })
      setGameRollings(p => [...p, grData])
      setSites(p => p.map(s => s.id === data.id ? data : s))
      return true
    }
    return false
  }
  async function deleteGameRolling(gr: GameRolling) {
    const site = sites.find(s => s.id === gr.site_id)
    if (!confirm('게임 롤링 기록을 삭제하고 롤링을 복원할까요?')) return
    await supabase.from('game_rollings').delete().eq('id', gr.id)
    setGameRollings(p => p.filter(g => g.id !== gr.id))
    if (site) {
      const { data } = await supabase.from('sites').update({ deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - gr.amount) }).eq('id', site.id).select().single()
      if (data) setSites(p => p.map(s => s.id === data.id ? data : s))
    }
  }

  /* ── 다폴 결과 처리 (두 leg 동시, stake 한 번만) ── */
  async function applyParlayResult(groupBets: Bet[], result: BetResult | 'cancel') {
    if (!groupBets.length) return
    const site = sites.find(s => s.id === groupBets[0].site_id)
    const stake = groupBets[0].stake  // 다폴 전체 금액 (leg마다 동일)

    if (result === 'cancel') {
      if (!confirm('다폴 베팅을 취소하고 잔액/롤링을 복원할까요?')) return
      for (const gb of groupBets) await supabase.from('bets').delete().eq('id', gb.id)
      setBets(p => p.filter(b => !groupBets.some(gb => gb.id === b.id)))
      if (site) {
        // stake 한 번만 복원 (다폴은 한 건 베팅)
        const { data: sd } = await supabase.from('sites').update({
          balance: site.balance + stake,
          rolling_done: Math.max(0, site.rolling_done - stake),
          deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - stake),
        }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
      return
    }

    // leg1에만 실제 profit 기록, leg2는 0 → sitePnL 중복 합산 방지
    const isusd = site?.currency === 'usd'
    const rawProfit = stake * (groupBets[0].odds - 1)
    const profit = result === 'win'
      ? (isusd ? Math.round(rawProfit * 100) / 100 : Math.round(rawProfit))
      : result === 'loss' ? -stake : 0
    const rateAtSettlement = isusd ? await getUsdKrwRate() : null
    const updatedList: Bet[] = []
    for (let i = 0; i < groupBets.length; i++) {
      const legProfit = i === 0 ? profit : 0  // leg1만 profit, 나머지 0
      const { data } = await supabase.from('bets').update({ result, profit: legProfit, usd_krw_rate: rateAtSettlement, cashout_amount: null }).eq('id', groupBets[i].id).select().single()
      if (data) updatedList.push(data)
    }
    if (!updatedList.length) return

    setBets(p => p.map(b => updatedList.find(u => u.id === b.id) ?? b))

    if (site && result === 'win') {
      // stake 한 번만 반환 + profit
      const { data: sd } = await supabase.from('sites').update({ balance: site.balance + stake + profit }).eq('id', site.id).select().single()
      if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
    }

    // 처리 끝났으니 해당 그룹의 개별 leg 체크 상태는 정리
    setParlayLegWinChecks(p => {
      const next = { ...p }
      for (const gb of groupBets) delete next[gb.id]
      return next
    })
  }

  /* ── 다폴 개별 leg 체크: 실패는 즉시 전체 실패 처리, 적중은 전체가 다 체크됐을 때만 전체 적중 처리 ── */
  function toggleParlayLegWin(groupBets: Bet[], legId: string) {
    const next = { ...parlayLegWinChecks, [legId]: true }
    const allChecked = groupBets.every(gb => next[gb.id])
    if (allChecked) {
      applyParlayResult(groupBets, 'win')
    } else {
      setParlayLegWinChecks(next)
    }
  }
  function applyParlayLegLoss(groupBets: Bet[]) {
    applyParlayResult(groupBets, 'loss')
  }

  /* ── 다폴 처리취소: 완료→pending 복원 ── */
  async function applyParlayRevert(groupBets: Bet[]) {
    if (!confirm('다폴 결과 처리를 취소하고 대기 목록으로 되돌릴까요?')) return
    const site = sites.find(s => s.id === groupBets[0].site_id)
    const wasWin = groupBets[0].result === 'win'
    const wasCashout = groupBets[0].cashout_amount != null
    const updatedList: Bet[] = []
    for (const gb of groupBets) {
      const { data } = await supabase.from('bets').update({ result: 'pending', profit: 0, cashout_amount: null }).eq('id', gb.id).select().single()
      if (data) updatedList.push(data)
    }
    if (!updatedList.length) return
    setBets(p => p.map(b => updatedList.find(u => u.id === b.id) ?? b))
    if (site && wasWin) {
      const stake = groupBets[0].stake
      const profit = groupBets[0].profit  // leg1에만 저장된 profit
      const { data: sd } = await supabase.from('sites').update({
        balance: Math.max(0, site.balance - stake - profit),
      }).eq('id', site.id).select().single()
      if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
    } else if (site && wasCashout) {
      const co = groupBets[0].cashout_amount!
      const { data: sd } = await supabase.from('sites').update({
        balance: Math.max(0, site.balance - co),
        rolling_done: site.rolling_done + co,
        deposit_bet_done: (site.deposit_bet_done ?? 0) + co,
      }).eq('id', site.id).select().single()
      if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
    }
  }

  /* ── 결과 처리 (단폴, 완료→pending 복원 포함) ── */
  async function applyResult(bet: Bet, result: BetResult | 'cancel' | 'revert') {
    const site = sites.find(s => s.id === bet.site_id)

    // 처리 취소: 완료된 베팅을 다시 pending으로 복원
    if (result === 'revert') {
      if (!confirm('결과 처리를 취소하고 대기 목록으로 되돌릴까요?')) return
      const wasWin = bet.result === 'win'
      const wasCashout = bet.cashout_amount != null
      const { data } = await supabase.from('bets').update({ result: 'pending', profit: 0, cashout_amount: null }).eq('id', bet.id).select().single()
      if (data) {
        setBets(p => p.map(b => b.id === data.id ? data : b))
        if (site && wasWin) {
          // 적중 처리 시 받았던 금액 다시 회수
          const returnedProfit = bet.profit  // 양수
          const { data: sd } = await supabase.from('sites').update({
            balance: Math.max(0, site.balance - bet.stake - returnedProfit),
          }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
        } else if (site && wasCashout) {
          // 캐시아웃 처리 시 받았던 캐시아웃 금액을 회수하고, 그만큼 남은 롤링을 다시 원복
          const co = bet.cashout_amount!
          const { data: sd } = await supabase.from('sites').update({
            balance: Math.max(0, site.balance - co),
            rolling_done: site.rolling_done + co,
            deposit_bet_done: (site.deposit_bet_done ?? 0) + co,
          }).eq('id', site.id).select().single()
          if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
        }
      }
      return
    }

    if (result === 'cancel') {
      if (!confirm('베팅을 취소하고 잔액/롤링을 복원할까요?')) return
      const groupBets = bet.parlay_group ? bets.filter(b => b.parlay_group === bet.parlay_group) : [bet]
      for (const gb of groupBets) { await supabase.from('bets').delete().eq('id', gb.id) }
      setBets(p => p.filter(b => !groupBets.some(gb => gb.id === b.id)))
      if (site) {
        const { data: sd } = await supabase.from('sites').update({ balance: site.balance + bet.stake, rolling_done: Math.max(0, site.rolling_done - bet.stake), deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - bet.stake) }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
      return
    }

    const isusd = site?.currency === 'usd'
    const rawProfit = bet.stake * (bet.odds - 1)
    const profit = result === 'win'
      ? (isusd ? Math.round(rawProfit * 100) / 100 : Math.round(rawProfit))
      : result === 'loss' ? -bet.stake : 0
    const rateAtSettlement = isusd ? await getUsdKrwRate() : null
    const { data } = await supabase.from('bets').update({ result, profit, usd_krw_rate: rateAtSettlement, cashout_amount: null }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: bet as never, after_data: data as never, description: `결과: ${bet.match} → ${result}` })
      const updatedBets = bets.map(b => b.id === data.id ? data : b)
      setBets(updatedBets)
      if (site && result === 'win') {
        const { data: sd } = await supabase.from('sites').update({ balance: site.balance + bet.stake + profit }).eq('id', site.id).select().single()
        if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
      }
    }
  }

  /* ── 캐시아웃 (단폴): 베팅금액 중 일부만 회수 — 나머지는 손실로 처리하고,
     회수한 금액만큼은 롤링을 채우지 못한 것으로 보고 남은 롤링에 다시 되돌려준다 ── */
  async function applyCashout(bet: Bet) {
    const site = sites.find(s => s.id === bet.site_id)
    if (!site) return
    const unit = site.currency === 'usd' ? '$' : '원'
    const raw = prompt(`캐시아웃 금액을 입력하세요 (베팅금액: ${bet.stake.toLocaleString()}${unit})`)
    if (raw == null) return
    const cashoutAmount = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(cashoutAmount) || cashoutAmount < 0 || cashoutAmount > bet.stake) {
      alert('캐시아웃 금액이 올바르지 않습니다 (0 ~ 베팅금액 사이여야 합니다).')
      return
    }
    const profit = -(bet.stake - cashoutAmount)
    const isusd = site.currency === 'usd'
    const rateAtSettlement = isusd ? await getUsdKrwRate() : null
    const memo = bet.memo ? `${bet.memo} · 캐시아웃 ${cashoutAmount.toLocaleString()}` : `캐시아웃 ${cashoutAmount.toLocaleString()}`
    const { data } = await supabase.from('bets').update({ result: 'loss', profit, usd_krw_rate: rateAtSettlement, memo, cashout_amount: cashoutAmount }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: bet as never, after_data: data as never, description: `캐시아웃: ${bet.match} → ${cashoutAmount.toLocaleString()}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
      const { data: sd } = await supabase.from('sites').update({
        balance: site.balance + cashoutAmount,
        rolling_done: Math.max(0, site.rolling_done - cashoutAmount),
        deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - cashoutAmount),
      }).eq('id', site.id).select().single()
      if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
    }
  }

  /* ── 캐시아웃 (다폴): 전체 stake 기준으로 부분 회수, leg1에만 profit 기록 ── */
  async function applyParlayCashout(groupBets: Bet[]) {
    if (!groupBets.length) return
    const site = sites.find(s => s.id === groupBets[0].site_id)
    if (!site) return
    const stake = groupBets[0].stake
    const unit = site.currency === 'usd' ? '$' : '원'
    const raw = prompt(`캐시아웃 금액을 입력하세요 (베팅금액: ${stake.toLocaleString()}${unit})`)
    if (raw == null) return
    const cashoutAmount = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(cashoutAmount) || cashoutAmount < 0 || cashoutAmount > stake) {
      alert('캐시아웃 금액이 올바르지 않습니다 (0 ~ 베팅금액 사이여야 합니다).')
      return
    }
    const profit = -(stake - cashoutAmount)
    const isusd = site.currency === 'usd'
    const rateAtSettlement = isusd ? await getUsdKrwRate() : null
    const updatedList: Bet[] = []
    for (let i = 0; i < groupBets.length; i++) {
      const legProfit = i === 0 ? profit : 0
      const legMemo = i === 0
        ? (groupBets[i].memo ? `${groupBets[i].memo} · 캐시아웃 ${cashoutAmount.toLocaleString()}` : `캐시아웃 ${cashoutAmount.toLocaleString()}`)
        : groupBets[i].memo
      const { data } = await supabase.from('bets').update({ result: 'loss', profit: legProfit, usd_krw_rate: rateAtSettlement, memo: legMemo, cashout_amount: i === 0 ? cashoutAmount : null }).eq('id', groupBets[i].id).select().single()
      if (data) updatedList.push(data)
    }
    if (!updatedList.length) return
    setBets(p => p.map(b => updatedList.find(u => u.id === b.id) ?? b))
    const { data: sd } = await supabase.from('sites').update({
      balance: site.balance + cashoutAmount,
      rolling_done: Math.max(0, site.rolling_done - cashoutAmount),
      deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) - cashoutAmount),
    }).eq('id', site.id).select().single()
    if (sd) setSites(p => p.map(s => s.id === sd.id ? sd : s))
  }

  /* ── 베팅 수정 (인라인) ── */
  async function saveInlineEdit(bet: Bet, sport: string, content: string, odds: number, stake: number, isLive: boolean, league: string) {
    if (!content || odds <= 0 || stake <= 0) return
    const before = { ...bet }
    const { market, pick } = autoMarket(content)
    const { data } = await supabase.from('bets').update({
      sport: sport as Sport, match: content, market, pick, odds, stake, is_live: isLive, league,
    }).eq('id', bet.id).select().single()
    if (data) {
      await logAction({ action_type: 'update', table_name: 'bets', record_id: data.id, before_data: before as never, after_data: data as never, description: `베팅 수정: ${data.match}` })
      setBets(p => p.map(b => b.id === data.id ? data : b))
      // 금액(stake)이 변경된 만큼 사이트의 잔액/롤링에도 차액을 반영 (남은 롤링이 즉시 갱신되도록)
      const delta = stake - bet.stake
      if (delta !== 0) {
        const site = sites.find(s => s.id === bet.site_id)
        if (site) {
          const { data: siteData } = await supabase.from('sites').update({
            balance: site.balance - delta,
            rolling_done: Math.max(0, site.rolling_done + delta),
            deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) + delta),
          }).eq('id', site.id).select().single()
          if (siteData) setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
        }
      }
    }
    setInlineEditBetId(null)
  }

  /* ── 다폴 수정 (2~4다리, 다리 수가 늘거나 줄어도 처리) ── */
  async function saveInlineParlay(groupBets: Bet[], contents: string[], odds: number, stake: number, leagues: string[]) {
    if (contents.length < 2 || contents.some(c => !c) || odds <= 0 || stake <= 0) return
    const sortedLegs = [...groupBets].sort((a, b) => a.parlay_leg - b.parlay_leg)
    const leg1 = sortedLegs[0]
    if (!leg1) return
    const groupId = leg1.parlay_group!
    const updatedList: Bet[] = []

    // 기존 다리(최소 개수만큼)는 update, 새로 늘어난 다리는 insert, 줄어든 다리는 delete
    for (let i = 0; i < Math.min(sortedLegs.length, contents.length); i++) {
      const { market, pick } = autoMarket(contents[i])
      const { data } = await supabase.from('bets').update({ match: contents[i], market, pick, odds, stake, league: leagues[i] ?? '' }).eq('id', sortedLegs[i].id).select().single()
      if (data) updatedList.push(data)
    }
    let removedIds: string[] = []
    if (contents.length > sortedLegs.length) {
      const rows = contents.slice(sortedLegs.length).map((c, j) => {
        const { market, pick } = autoMarket(c)
        const i = sortedLegs.length + j
        return { bet_date: leg1.bet_date, sport: leg1.sport, league: leagues[i] ?? '', match: c, market, pick, odds, stake, result: 'pending' as BetResult, profit: 0, memo: '', site_id: leg1.site_id, parlay_group: groupId, parlay_leg: i + 1 }
      })
      const { data } = await supabase.from('bets').insert(rows).select()
      if (data) updatedList.push(...data)
    } else if (contents.length < sortedLegs.length) {
      const toRemove = sortedLegs.slice(contents.length)
      removedIds = toRemove.map(gb => gb.id)
      for (const gb of toRemove) await supabase.from('bets').delete().eq('id', gb.id)
    }

    setBets(p => {
      const filtered = p.filter(b => !removedIds.includes(b.id))
      const withUpdates = filtered.map(b => updatedList.find(u => u.id === b.id) ?? b)
      const existingIds = new Set(withUpdates.map(b => b.id))
      const newOnes = updatedList.filter(u => !existingIds.has(u.id))
      return [...withUpdates, ...newOnes]
    })
    await logAction({ action_type: 'update', table_name: 'bets', record_id: leg1.id, before_data: leg1 as never, after_data: (updatedList[0] ?? leg1) as never, description: `다폴 수정: ${contents.join('×')}` })
    // 다폴은 stake가 한 번만 차감되므로, 변경분도 한 번만 사이트에 반영 (남은 롤링 즉시 갱신)
    const parlayDelta = stake - leg1.stake
    if (parlayDelta !== 0) {
      const site = sites.find(s => s.id === leg1.site_id)
      if (site) {
        const { data: siteData } = await supabase.from('sites').update({
          balance: site.balance - parlayDelta,
          rolling_done: Math.max(0, site.rolling_done + parlayDelta),
          deposit_bet_done: Math.max(0, (site.deposit_bet_done ?? 0) + parlayDelta),
        }).eq('id', site.id).select().single()
        if (siteData) setSites(p => p.map(s => s.id === siteData.id ? siteData : s))
      }
    }
    setInlineEditBetId(null)
  }

  return (
    <div className="page">
      <div className="dashboard-main">

        {/* ── 채굴 현황 (좌측) */}
        <div className="dashboard-side">
          <MiningWidget />
        </div>

        {/* ── 베팅 현황 (전체) */}
        <div className="dashboard-bets">
          {sites.length === 0 ? (
            <div className="card" style={{ padding: '10px 14px' }}>
              <div className="flex-between mb-10">
                <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
                <button onClick={() => setShowSiteMgr(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                  <Settings size={11} /> 사이트관리
                </button>
              </div>
              <div className="empty"><div className="empty-icon">🎯</div>사이트를 추가하세요</div>
            </div>
          ) : (
            <div className="card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
                <span className="card-title" style={{ margin: 0 }}>베팅 현황</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {aggRollingTarget > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-num)', color: aggRem > 0 ? 'var(--gold)' : 'var(--green)' }}>{Math.round(aggRem).toLocaleString()}원</span>
                      <div className="deposit-progress-bar" style={{ width: 150, margin: 0 }}><div className="deposit-progress-fill" style={{ width: `${Math.min(100, aggPct)}%` }} /></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: aggPct >= 100 ? 'var(--green)' : 'var(--orange)' }}>{aggPct}%</span>
                    </div>
                  )}
                  <button onClick={() => setShowSiteMgr(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
                    <Settings size={12} /> 사이트관리
                  </button>
                </div>
              </div>
              <div className="site-cards-wrap" style={{ '--site-cols': colCount } as React.CSSProperties}>
              {sites.map(site => {
                const dep = site.last_deposit ?? 0; const pt = site.point_deposit ?? 0
                const isusd = site.currency === 'usd'; const pfx = isusd ? '$' : ''; const sfx = isusd ? '' : '원'
                const pct = depositPct(site); const rem = depositRemaining(site)
                const pnl = sitePnL(site)
                const pending = pendingBySite(site.id)
                const settled = settledBySite(site.id)
                return (
                  <div key={site.id} className="card" style={{ padding: 0, overflow: 'hidden', border: site.active ? '1px solid var(--green-border)' : '1px solid var(--border)' }}>
                    {/* 사이트 헤더 */}
                    <div style={{ background: site.active ? 'var(--green-bg)' : 'var(--bg-elevated)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{site.name}</span>
                        {isusd && <span style={{ fontSize: 9, background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>$</span>}
                        {site.active && <span className="site-active-dot" />}
                        {pnl !== null && (
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', display: 'flex', alignItems: 'baseline', gap: 4 }} className={pnl >= 0 ? 'profit-pos' : 'profit-neg'}>
                            {/* 사이트별 현재 수익은 통화와 무관하게 항상 원화로만 표시 (달러 금액은 숨김) */}
                            {pnl >= 0 ? '+' : ''}{Math.round(isusd ? pnl * usdKrwRate : pnl).toLocaleString()}원
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className={`site-icon-btn site-icon-deposit ${dep > 0 ? 'active' : ''}`} onClick={e => { e.stopPropagation(); setDepositSite(site) }}><ArrowDownToLine size={15} /></button>
                        <button className="site-icon-btn site-icon-withdraw" onClick={e => { e.stopPropagation(); setWithdrawSite(site) }}><LogOut size={15} /></button>
                      </div>
                    </div>
                    {/* 롤링 정보 */}
                    <div style={{ position: 'relative', padding: '8px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>입금</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: '#E2E8F0' }}>{pfx}{dep.toLocaleString()}{sfx}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>포인트</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: pt > 0 ? 'var(--purple)' : 'var(--text-muted)' }}>{pt > 0 ? `+${pt.toLocaleString()}P` : '–'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>남은 롤링</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-num)', color: rem > 0 ? 'var(--gold)' : 'var(--green)' }}>{pfx}{rem.toLocaleString()}{sfx}</span>
                        </div>
                        <div className="deposit-progress-bar"><div className="deposit-progress-fill" style={{ width: `${Math.min(100,pct)}%` }} /></div>
                        <div style={{ fontSize: 11, color: pct >= 100 ? 'var(--green)' : 'var(--orange)', fontWeight: 700, textAlign: 'right' }}>{pct}%</div>
                        {/* 롤링 100% 완료 도장 — 입금/포인트/남은롤링 표시 영역 가운데에 반투명 오버레이 */}
                        {pct >= 100 && (
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                          }}>
                            <div style={{
                              opacity: 0.4,
                              transform: 'rotate(-14deg)',
                              border: '3px solid var(--green)',
                              color: 'var(--green)',
                              borderRadius: 8,
                              padding: '2px 14px',
                              fontSize: 15,
                              fontWeight: 900,
                              letterSpacing: '2px',
                              fontFamily: 'var(--font-num)',
                              textShadow: '0 0 4px var(--green)',
                              background: 'rgba(0,0,0,0.05)',
                            }}>
                              롤링완료
                            </div>
                          </div>
                        )}
                      </div>
                    {/* 베팅 목록 */}
                    <div style={{ padding: '6px 8px' }}>
                      {/* 베팅 추가 — 사이트 활성(입금) 상태일 때만, 항상 맨 위 */}
                      {site.active && (
                        <div style={{ marginBottom: pending.length > 0 ? 8 : 4 }}>
                          {openFormSiteId !== site.id ? (
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <button className="site-add-btn" style={{ width: '100%', height: 48, borderRadius: 8, padding: 0, gap: 6, fontSize: 14, fontWeight: 700, border: '1.5px dashed var(--border)' }} onClick={() => { setOpenFormSiteId(site.id); setOpenFormType('sports') }}><Plus size={18} /> 베팅추가</button>
                            </div>
                          ) : openFormType === 'game' ? (
                            <GameRollingForm site={site} onClose={() => setOpenFormSiteId(null)} onSubmit={amt => submitGameRolling(site, amt)} />
                          ) : (
                            <SingleBetForm site={site} defaultSport={pending.slice(-1)[0]?.sport ?? 'esports'} onClose={() => setOpenFormSiteId(null)} onBet={(sp,ct,od,amt,lv,lg) => submitBet(site,sp,ct,od,amt,lv,lg)} onMultiBet={(sp,cs,od,amt,lgs) => submitMultiBet(site,sp,cs,od,amt,lgs)} baseballOverrides={baseballOverrides} soccerOverrides={soccerOverrides} basketballOverrides={basketballOverrides} volleyballOverrides={volleyballOverrides} teamCandidates={teamCandidates} allBetsHistory={allBetsHistory} leagueCandidates={leagueCandidates} />
                          )}
                        </div>
                      )}
                      {/* 게임 롤링 기록 — 배당/경기내용 없이 롤링 금액만 표시 */}
                      {gameRollingsBySite(site.id).length > 0 && (
                        <div style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {gameRollingsBySite(site.id).map(gr => (
                            <div key={gr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>게임 롤링</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 700, color: 'var(--gold)' }}>
                                  +{isusd ? '$' : ''}{gr.amount.toLocaleString()}{isusd ? '' : '원'}
                                </span>
                                <button onClick={() => deleteGameRolling(gr)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><Trash2 size={12} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 결과 처리 전까지는 사이트 활성/비활성과 무관하게 베팅 중인 목록을 항상 표시 */}
                      {pending.length > 0 && (() => {
                        const renderedGroups = new Set<string>()
                        const displayPending = pending
                        return [...displayPending].reverse().map(bet => {
                          if (bet.parlay_group) {
                            if (renderedGroups.has(bet.parlay_group)) return null
                            renderedGroups.add(bet.parlay_group)
                            const groupBets = pending.filter(b => b.parlay_group === bet.parlay_group).sort((a,b) => a.parlay_leg - b.parlay_leg)
                            return (
                              <div key={bet.parlay_group} className={`site-bet-entry parlay-entry${isBigStake(bet.stake, isusd) ? ' big-bet-entry' : ''}`} style={{ marginBottom: 6 }}
                                onMouseEnter={() => setHoverBetId(bet.parlay_group)} onMouseLeave={() => setHoverBetId(null)}>
                                {inlineEditBetId === bet.parlay_group ? (
                                  <InlineParlayEditForm
                                    groupBets={groupBets}
                                    site={site}
                                    onClose={() => setInlineEditBetId(null)}
                                    onSave={(contents, odds, stake, leagues) => saveInlineParlay(groupBets, contents, odds, stake, leagues)}
                                    teamCandidates={teamCandidates}
                                    allBetsHistory={allBetsHistory}
                                  />
                                ) : (
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                                    {/* 좌: 경기 내용 */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {groupBets.map((gb, idx) => {
                                        const legChecked = !!parlayLegWinChecks[gb.id]
                                        return (
                                          <div key={gb.id} style={{ marginBottom: 2 }}>
                                            {gb.league && <div style={{ paddingLeft: 20, fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{gb.league}</div>}
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                              <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 16, textAlign: 'center', flexShrink: 0 }}>{LEG_MARKS[idx] ?? idx+1}</span>
                                              <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 13, color: legChecked ? 'var(--green)' : undefined }}>{gb.match}</span>
                                              {hoverBetId === bet.parlay_group && (
                                                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                                  <button className="bet-action-btn bet-action-win" title="적중" style={{ width: 22, height: 22, opacity: legChecked ? 0.5 : 1 }}
                                                    disabled={legChecked}
                                                    onClick={() => toggleParlayLegWin(groupBets, gb.id)}>
                                                    <CheckCircle size={14} />
                                                  </button>
                                                  <button className="bet-action-btn bet-action-loss" title="실패" style={{ width: 22, height: 22 }}
                                                    onClick={() => applyParlayLegLoss(groupBets)}>
                                                    <XCircle size={14} />
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                      <div style={{ paddingLeft: 20, marginTop: 3 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}</span>
                                      {isBigStake(bet.stake, isusd) && <Flame size={13} style={{ marginLeft: 5, color: 'var(--gold)', fill: 'var(--gold)', filter: 'drop-shadow(0 0 3px var(--gold))' }} />}
                                      </div>
                                    </div>
                                    {/* 우: 결과 버튼 (경기별 적중/실패는 좌측 각 경기 행에 개별 표시) */}
                                    {hoverBetId === bet.parlay_group && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignSelf: 'center' }}>
                                        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                                          <button className="bet-action-btn" title="캐시아웃" style={{ color: 'var(--purple)', width: 20, height: 20 }}
                                            onClick={() => applyParlayCashout(groupBets)}>
                                            <DollarSign size={12} />
                                          </button>
                                          <button className="bet-action-btn" title="수정" style={{ color: 'var(--gold)', width: 20, height: 20 }}
                                            onClick={() => { setInlineEditBetId(bet.parlay_group); setHoverBetId(null) }}>
                                            <Pencil size={11} />
                                          </button>
                                          <button className="bet-action-btn bet-action-cancel" title="베팅취소" style={{ width: 20, height: 20 }}
                                            onClick={() => applyParlayResult(groupBets, 'cancel')}>
                                            <Ban size={11} />
                                          </button>
                                          <button className="bet-action-btn" title="적특" style={{ width: 20, height: 20, color: 'var(--blue)', borderColor: 'var(--blue-border)' }}
                                            onClick={() => { if (confirm('적특으로 처리하시겠습니까?')) applyParlayResult(groupBets, 'push') }}>
                                            <MinusCircle size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          return (
                            <div key={bet.id} className={`site-bet-entry${isBigStake(bet.stake, isusd) ? ' big-bet-entry' : ''}`} style={{ marginBottom: 6, position: 'relative' }}
                              onMouseEnter={() => setHoverBetId(bet.id)} onMouseLeave={() => setHoverBetId(null)}>
                              {inlineEditBetId === bet.id ? (
                                <InlineBetEditForm
                                  bet={bet}
                                  site={site}
                                  onClose={() => setInlineEditBetId(null)}
                                  onSave={(sport, content, odds, stake, isLive, league) => saveInlineEdit(bet, sport, content, odds, stake, isLive, league)}
                                  baseballOverrides={baseballOverrides}
                                  soccerOverrides={soccerOverrides}
                                  basketballOverrides={basketballOverrides}
                                  volleyballOverrides={volleyballOverrides}
                                  teamCandidates={teamCandidates}
                                  allBetsHistory={allBetsHistory}
                                  leagueCandidates={leagueCandidates}
                                />
                              ) : (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                                  {/* 좌: 경기 내용 */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {bet.league && <div style={{ paddingLeft: 26, fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{bet.league}</div>}
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 22, textAlign: 'center' }}>{sportGlyph(bet.sport) ?? SPORT_SHORT[bet.sport] ?? '📋'}</span>
                                      <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 13 }}>{bet.match}</span>
                                      {bet.is_live && <span style={{ fontSize: 9, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>🔴 LIVE</span>}
                                    </div>
                                    <div style={{ paddingLeft: 26 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}</span>
                                      {isBigStake(bet.stake, isusd) && <Flame size={13} style={{ marginLeft: 5, color: 'var(--gold)', fill: 'var(--gold)', filter: 'drop-shadow(0 0 3px var(--gold))' }} />}
                                    </div>
                                  </div>
                                  {/* 우: 결과 버튼 (hover 시만) */}
                                  {hoverBetId === bet.id && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignSelf: 'center' }}>
                                      {/* 소형: 캐시아웃 / 수정 / 베팅취소 */}
                                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                                        <button className="bet-action-btn" title="캐시아웃"
                                          onClick={() => applyCashout(bet)}
                                          style={{ color: 'var(--purple)', width: 20, height: 20 }}>
                                          <DollarSign size={12} />
                                        </button>
                                        <button className="bet-action-btn" title="수정"
                                          onClick={() => { setInlineEditBetId(bet.id); setHoverBetId(null) }}
                                          style={{ color: 'var(--gold)', width: 20, height: 20 }}>
                                          <Pencil size={11} />
                                        </button>
                                        <button className="bet-action-btn bet-action-cancel" title="베팅취소"
                                          onClick={() => applyResult(bet, 'cancel')}
                                          style={{ width: 20, height: 20 }}>
                                          <Ban size={11} />
                                        </button>
                                      </div>
                                      {/* 대형: 적중 / 실패 / 적특 */}
                                      <div style={{ display: 'flex', gap: 3 }}>
                                        <button className="bet-action-btn bet-action-win" title="적중"
                                          onClick={() => applyResult(bet, 'win')}
                                          style={{ width: 34, height: 34 }}>
                                          <CheckCircle size={22} />
                                        </button>
                                        <button className="bet-action-btn bet-action-loss" title="실패"
                                          onClick={() => applyResult(bet, 'loss')}
                                          style={{ width: 34, height: 34 }}>
                                          <XCircle size={22} />
                                        </button>
                                        <button className="bet-action-btn" title="적특"
                                          onClick={() => { if (confirm('적특으로 처리하시겠습니까?')) applyResult(bet, 'push') }}
                                          style={{ width: 34, height: 34, color: 'var(--blue)', borderColor: 'var(--blue-border)' }}>
                                          <MinusCircle size={22} />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })
                      })()}
                      {/* 완료된 목록 — 다음 마감 처리 때 함께 사라짐 (비활성 사이트에서도 표시) */}
                      {settled.length > 0 && (() => {
                        const renderedSettledGroups = new Set<string>()
                        const isExpanded = !!expandedSettled[site.id]
                        return (
                          <div style={{ marginTop: 8, borderTop: '1px solid var(--border-light)', paddingTop: 6 }}>
                            <div
                              onClick={() => setExpandedSettled(p => ({ ...p, [site.id]: !p[site.id] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '3px 2px', marginBottom: isExpanded ? 4 : 0, userSelect: 'none' }}>
                              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              완료된 목록 ({settled.length})
                            </div>
                            {isExpanded && settled.map(bet => {
                              if (bet.parlay_group) {
                                if (renderedSettledGroups.has(bet.parlay_group)) return null
                                renderedSettledGroups.add(bet.parlay_group)
                                const groupBets = settled.filter(b => b.parlay_group === bet.parlay_group).sort((a,b) => a.parlay_leg - b.parlay_leg)
                                const isWin = groupBets[0].result === 'win'
                                const isLoss = groupBets[0].result === 'loss'
                                return (
                                  <div key={bet.parlay_group} className={`site-bet-entry parlay-entry${isBigStake(bet.stake, isusd) ? ' big-bet-entry' : ''}`} style={{ marginBottom: 5, opacity: 0.7 }}
                                    onMouseEnter={() => setHoverBetId('s_' + bet.parlay_group)} onMouseLeave={() => setHoverBetId(null)}>
                                    {groupBets.map((gb, idx) => (
                                      <div key={gb.id} style={{ marginBottom: 2 }}>
                                        {gb.league && <div style={{ paddingLeft: 23, fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{gb.league}</div>}
                                        <div style={{ display: 'flex', gap: 5 }}>
                                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 18, textAlign: 'center', flexShrink: 0 }}>{LEG_MARKS[idx] ?? idx+1}</span>
                                          <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 12, color: isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-secondary)' }}>{gb.match}</span>
                                        </div>
                                      </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 23, marginTop: 4 }}>
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}{isBigStake(bet.stake, isusd) && <Flame size={11} style={{ marginLeft: 4, verticalAlign: 'text-bottom', color: 'var(--gold)', fill: 'var(--gold)', filter: 'drop-shadow(0 0 2px var(--gold))' }} />}</span>
                                      {hoverBetId === 's_' + bet.parlay_group ? (
                                        <button className="btn btn-ghost btn-xs" style={{ fontSize: 10 }} onClick={() => applyParlayRevert(groupBets)}><RotateCcw size={9} /> 되돌리기</button>
                                      ) : (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--blue)' }}>
                                          {isWin ? `+${pfx}${groupBets[0].profit.toLocaleString()}${sfx}` : isLoss ? `-${pfx}${bet.stake.toLocaleString()}${sfx}` : 'PUSH'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div key={bet.id} className={`site-bet-entry${isBigStake(bet.stake, isusd) ? ' big-bet-entry' : ''}`} style={{ marginBottom: 5, opacity: 0.7 }}
                                  onMouseEnter={() => setHoverBetId('s_' + bet.id)} onMouseLeave={() => setHoverBetId(null)}>
                                  {bet.league && <div style={{ paddingLeft: 29, fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{bet.league}</div>}
                                  <div style={{ display: 'flex', gap: 5, marginBottom: 3 }}>
                                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 24, textAlign: 'center' }}>{sportGlyph(bet.sport) ?? SPORT_SHORT[bet.sport] ?? '📋'}</span>
                                    <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize: 12, color: bet.result === 'win' ? 'var(--green)' : bet.result === 'loss' ? 'var(--red)' : 'var(--text-secondary)' }}>{bet.match}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 29 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{bet.odds.toFixed(2)} / {pfx}{bet.stake.toLocaleString()}{sfx}{isBigStake(bet.stake, isusd) && <Flame size={11} style={{ marginLeft: 4, verticalAlign: 'text-bottom', color: 'var(--gold)', fill: 'var(--gold)', filter: 'drop-shadow(0 0 2px var(--gold))' }} />}</span>
                                    {hoverBetId === 's_' + bet.id ? (
                                      <button className="btn btn-ghost btn-xs" style={{ fontSize: 10 }} onClick={() => applyResult(bet, 'revert')}><RotateCcw size={9} /> 되돌리기</button>
                                    ) : (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: bet.result === 'win' ? 'var(--green)' : bet.result === 'loss' ? 'var(--red)' : 'var(--blue)' }}>
                                        {bet.result === 'win' ? `+${pfx}${bet.profit.toLocaleString()}${sfx}` : bet.result === 'loss' ? `-${pfx}${bet.stake.toLocaleString()}${sfx}` : 'PUSH'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 모달 */}
      {showSiteMgr && (
        <SiteMgrModal sites={sites} onClose={() => setShowSiteMgr(false)} onAdd={addSite} onDelete={deleteSite} onToggleCurrency={toggleCurrency} onReorder={reorderSites} onUpdateDefaultStake={updateDefaultStake} />
      )}
      {depositSite && <DepositModal site={depositSite} onClose={() => setDepositSite(null)} onDeposit={doDeposit} onPoint={doPoint} />}
      {withdrawSite && <WithdrawModal site={withdrawSite} onClose={() => setWithdrawSite(null)} onWithdraw={doWithdraw} />}


    </div>
  )
}

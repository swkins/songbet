import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Sport, Market, BetResult, GameRolling } from '../types'
import { inferBaseballLeague, inferSoccerLeague, inferLeagueByKeyword, buildLeagueCandidates, suggestLeagueCandidates, koCompare, type LeagueOverride, type LeagueCandidate } from '../lib/league'
import { buildTeamCandidates, suggestTeamCandidates, getTeamInsight, getEsportsLeague, type TeamCandidate, type BetLite } from '../lib/teamInsight'
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
  ClipboardPaste, ChevronUp, ChevronDown, Star,
} from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer',     label: '축구'   },
  { value: 'baseball',   label: '야구'   },
  { value: 'basketball', label: '농구'   },
  { value: 'volleyball', label: '배구'   },
  { value: 'esports',    label: 'LOL'    },
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

// 경기 내용(match)에서 팀 이름 / 홈·원정 / 베팅옵션을 분리해 색으로 구분해 보여주기 위한 파서.
// 구조화된 형식(축구/야구/농구/LOL)에서만 동작하고, 자유입력(배구/기타 등)이거나 패턴이 안 맞으면 null → 그냥 원문 그대로 표시.
interface BetMatchParts { team: string; side?: '홈' | '원정'; boTag?: string; optionLabel: string; accent: string }
function parseBetMatch(sport: string, match: string): BetMatchParts | null {
  const s = (match ?? '').trim()
  if (sport === 'soccer') {
    const m = s.match(/^(.+?)\s(홈|원정)\s(-?\d+(?:\.\d+)?)$/)
    if (!m) return null
    const [, team, side, num] = m
    if (num.startsWith('-')) return { team, side: side as '홈' | '원정', optionLabel: `${num} 핸디캡`, accent: 'var(--red)' }
    if (num === '0.5') return { team, side: side as '홈' | '원정', optionLabel: `${num} 핸디캡`, accent: 'var(--green)' }
    return { team, side: side as '홈' | '원정', optionLabel: `${num} 핸디캡`, accent: 'var(--purple)' }
  }
  if (sport === 'baseball') {
    const m = s.match(/^(.+?)\s(홈|원정)\s(\d+(?:\.\d+)?)(오버)?$/)
    if (!m) return null
    const [, team, side, num, over] = m
    if (over) return { team, side: side as '홈' | '원정', optionLabel: `${num}오버`, accent: 'var(--orange)' }
    return { team, side: side as '홈' | '원정', optionLabel: `${num} 핸디캡`, accent: num === '1.5' ? 'var(--green)' : 'var(--purple)' }
  }
  if (sport === 'basketball') {
    const m = s.match(/^(.+?)\s(-?\d+(?:\.\d+)?)$/)
    if (!m) return null
    const [, team, num] = m
    return { team, optionLabel: `${num} 핸디캡`, accent: 'var(--blue)' }
  }
  if (sport === 'esports') {
    const m = s.match(/^(.+?)(?:\s(-?\d+(?:\.\d+)?)(세트오버)?)?\s\((BO\d)\)$/)
    if (!m) return null
    const [, team, num, setOver, bo] = m
    if (!num) return { team, boTag: bo, optionLabel: '일반승', accent: 'var(--gold)' }
    if (setOver) return { team, boTag: bo, optionLabel: `${num}세트오버`, accent: 'var(--orange)' }
    return { team, boTag: bo, optionLabel: `${num} 핸디`, accent: num.startsWith('-') ? 'var(--red)' : 'var(--purple)' }
  }
  return null
}

// 컴팩트한 베팅 내용 표시 — 파싱 성공 시 팀/홈·원정/옵션을 색으로 구분, 실패 시 원문 그대로.
function BetMatchDisplay({ sport, match, fontSize = 13, teamColor }: { sport: string; match: string; fontSize?: number; teamColor?: string }) {
  const parts = parseBetMatch(sport, match)
  if (!parts) return <span className="site-bet-match" style={{ flex: 1, marginBottom: 0, fontSize, color: teamColor }}>{match}</span>
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, borderLeft: `2px solid ${parts.accent}`, paddingLeft: 6 }}>
      <span style={{ fontSize, fontWeight: 600, color: teamColor ?? 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parts.team}</span>
      {parts.side && <span style={{ fontSize: 9, fontWeight: 700, flexShrink: 0, color: parts.side === '홈' ? 'var(--blue)' : 'var(--orange)' }}>{parts.side}</span>}
      {parts.boTag && <span style={{ fontSize: 9, fontWeight: 700, flexShrink: 0, color: 'var(--text-muted)' }}>{parts.boTag}</span>}
      <span style={{ fontSize: 10, fontWeight: 600, flexShrink: 0, color: parts.accent }}>{parts.optionLabel}</span>
    </span>
  )
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
function InlineBetEditForm({ bet, site, onClose, onSave, baseballOverrides, soccerOverrides, basketballOverrides, volleyballOverrides, teamCandidates, allBetsHistory, leagueCandidates, soccerLeagues, baseballLeagues, basketballLeagues, esportsLeagues, soccerFavoriteLeagues, baseballFavoriteLeagues, basketballFavoriteLeagues, esportsFavoriteLeagues, onToggleSoccerLeagueFavorite, onToggleBaseballLeagueFavorite, onToggleBasketballLeagueFavorite, onToggleEsportsLeagueFavorite, soccerTeams, baseballTeams, basketballTeams, esportsTeams, onAddSoccerLeague, onAddBaseballLeague, onAddBasketballLeague, onAddEsportsLeague, onRenameSoccerLeague, onDeleteSoccerLeague, onRenameBaseballLeague, onDeleteBaseballLeague, onRenameBasketballLeague, onDeleteBasketballLeague, onRenameEsportsLeague, onDeleteEsportsLeague, onAddSoccerTeam, onAddBaseballTeam, onAddBasketballTeam, onAddEsportsTeam, onRenameSoccerTeam, onDeleteSoccerTeam, onRenameBaseballTeam, onDeleteBaseballTeam, onRenameBasketballTeam, onDeleteBasketballTeam, onRenameEsportsTeam, onDeleteEsportsTeam }: {
  bet: Bet; site: Site
  onClose: () => void
  onSave: (sport: string, content: string, odds: number, stake: number, isLive: boolean, league: string) => Promise<void>
  baseballOverrides: LeagueOverride[]; soccerOverrides: LeagueOverride[]
  basketballOverrides: LeagueOverride[]; volleyballOverrides: LeagueOverride[]
  teamCandidates: TeamCandidate[]; allBetsHistory: BetLite[]; leagueCandidates: LeagueCandidate[]
  soccerLeagues: string[]; baseballLeagues: string[]; basketballLeagues: string[]; esportsLeagues: string[]
  soccerFavoriteLeagues: string[]; baseballFavoriteLeagues: string[]; basketballFavoriteLeagues: string[]; esportsFavoriteLeagues: string[]
  onToggleSoccerLeagueFavorite: (name: string) => Promise<void>; onToggleBaseballLeagueFavorite: (name: string) => Promise<void>
  onToggleBasketballLeagueFavorite: (name: string) => Promise<void>; onToggleEsportsLeagueFavorite: (name: string) => Promise<void>
  soccerTeams: { league: string; name: string }[]; baseballTeams: { league: string; name: string }[]; basketballTeams: { league: string; name: string }[]; esportsTeams: { league: string; name: string }[]
  onAddSoccerLeague: (name: string) => Promise<void>; onAddBaseballLeague: (name: string) => Promise<void>; onAddBasketballLeague: (name: string) => Promise<void>; onAddEsportsLeague: (name: string) => Promise<void>
  onRenameSoccerLeague: (oldName: string, newName: string) => Promise<void>; onDeleteSoccerLeague: (name: string) => Promise<void>
  onRenameBaseballLeague: (oldName: string, newName: string) => Promise<void>; onDeleteBaseballLeague: (name: string) => Promise<void>
  onRenameBasketballLeague: (oldName: string, newName: string) => Promise<void>; onDeleteBasketballLeague: (name: string) => Promise<void>
  onRenameEsportsLeague: (oldName: string, newName: string) => Promise<void>; onDeleteEsportsLeague: (name: string) => Promise<void>
  onAddSoccerTeam: (league: string, name: string) => Promise<void>; onAddBaseballTeam: (league: string, name: string) => Promise<void>; onAddBasketballTeam: (league: string, name: string) => Promise<void>; onAddEsportsTeam: (league: string, name: string) => Promise<void>
  onRenameSoccerTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteSoccerTeam: (league: string, name: string) => Promise<void>
  onRenameBaseballTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteBaseballTeam: (league: string, name: string) => Promise<void>
  onRenameBasketballTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteBasketballTeam: (league: string, name: string) => Promise<void>
  onRenameEsportsTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteEsportsTeam: (league: string, name: string) => Promise<void>
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
    if (STRUCTURED_SPORTS.includes(sport as StructuredSport)) return // 구조화 종목은 드롭다운으로 직접 고르므로 자동 추론 안 함
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
      {STRUCTURED_SPORTS.includes(sport as StructuredSport) ? (
        <SportMatchPicker
          key={sport}
          sport={sport as StructuredSport}
          leagues={sport === 'soccer' ? soccerLeagues : sport === 'baseball' ? baseballLeagues : sport === 'basketball' ? basketballLeagues : esportsLeagues}
          favoriteLeagues={sport === 'soccer' ? soccerFavoriteLeagues : sport === 'baseball' ? baseballFavoriteLeagues : sport === 'basketball' ? basketballFavoriteLeagues : esportsFavoriteLeagues}
          onToggleFavoriteLeague={sport === 'soccer' ? onToggleSoccerLeagueFavorite : sport === 'baseball' ? onToggleBaseballLeagueFavorite : sport === 'basketball' ? onToggleBasketballLeagueFavorite : onToggleEsportsLeagueFavorite}
          teams={sport === 'soccer' ? soccerTeams : sport === 'baseball' ? baseballTeams : sport === 'basketball' ? basketballTeams : esportsTeams}
          onAddLeague={sport === 'soccer' ? onAddSoccerLeague : sport === 'baseball' ? onAddBaseballLeague : sport === 'basketball' ? onAddBasketballLeague : onAddEsportsLeague}
          onRenameLeague={sport === 'soccer' ? onRenameSoccerLeague : sport === 'baseball' ? onRenameBaseballLeague : sport === 'basketball' ? onRenameBasketballLeague : onRenameEsportsLeague}
          onDeleteLeague={sport === 'soccer' ? onDeleteSoccerLeague : sport === 'baseball' ? onDeleteBaseballLeague : sport === 'basketball' ? onDeleteBasketballLeague : onDeleteEsportsLeague}
          onAddTeam={sport === 'soccer' ? onAddSoccerTeam : sport === 'baseball' ? onAddBaseballTeam : sport === 'basketball' ? onAddBasketballTeam : onAddEsportsTeam}
          onRenameTeam={sport === 'soccer' ? onRenameSoccerTeam : sport === 'baseball' ? onRenameBaseballTeam : sport === 'basketball' ? onRenameBasketballTeam : onRenameEsportsTeam}
          onDeleteTeam={sport === 'soccer' ? onDeleteSoccerTeam : sport === 'baseball' ? onDeleteBaseballTeam : sport === 'basketball' ? onDeleteBasketballTeam : onDeleteEsportsTeam}
          onResult={(m, l) => { setContent(m); setLeague(l); setLeagueTouched(true) }}
        />
      ) : (
        <>
          <LeagueInput placeholder="리그 (자동 추론, 직접 입력 가능)" value={league}
            onChange={v => { setLeague(v); setLeagueTouched(true) }}
            candidates={leagueCandidates}
            style={{ fontSize: 11 }} />
          <TeamContentInput inputRef={contentRef} placeholder="경기 내용" value={content} onChange={setContent}
            candidates={teamCandidates} allBets={allBetsHistory} autoFocus onEnter={submit} />
        </>
      )}
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
        <button type="button" onClick={() => setIsLive(v => !v)} title={isLive ? '라이브 켜짐 (누르면 끄기)' : '라이브 꺼짐 (누르면 켜기)'} style={{
          width: 30, height: 30, borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${isLive ? 'var(--red)' : 'var(--border)'}`,
          background: isLive ? 'var(--red)' : 'var(--bg-elevated)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: isLive ? '#fff' : 'var(--text-muted)' }} />
        </button>
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

// 축구/야구/농구/LOL — 자유입력 대신 등록된 리그/팀을 선택하는 방식의 마켓 옵션 정의
type StructuredSport = 'soccer' | 'baseball' | 'basketball' | 'esports'
const STRUCTURED_SPORTS: StructuredSport[] = ['soccer', 'baseball', 'basketball', 'esports']
const SOCCER_BET_OPTIONS = [
  { key: 'hm15', label: '-1.5 핸디캡' },
  { key: 'h05', label: '0.5 플핸' },
  { key: 'h15', label: '1.5 플핸' },
]
// 야구는 핸디캡 / 팀오버를 화면에서 좌우로 분리해서 보여준다 (BASEBALL_HCAP_OPTIONS = 좌측, BASEBALL_OVER_OPTIONS = 우측)
const BASEBALL_HCAP_OPTIONS = [
  { key: 'h15', label: '핸디캡 1.5' },
  { key: 'h25', label: '핸디캡 2.5' },
]
const BASEBALL_OVER_OPTIONS = [
  { key: 'o15', label: '팀오버 1.5' },
  { key: 'o25', label: '팀오버 2.5' },
  { key: 'o35', label: '팀오버 3.5' },
  { key: 'o45', label: '팀오버 4.5' },
  { key: 'o55', label: '팀오버 5.5' },
]
const BASKETBALL_HCAP_LINES = [4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
// LOL — BO1은 별도 마켓 없이 팀만 고르면 바로 확정, BO3/BO5는 세트 수에 따라 고를 수 있는 마켓이 다르다
type EsportsBo = 'bo1' | 'bo3' | 'bo5'
const ESPORTS_BO3_OPTIONS = [
  { key: 'h15', label: '1.5 플핸' },
  { key: 'hm15', label: '-1.5 핸디캡' },
  { key: 'ml', label: '일반승' },
]
const ESPORTS_BO5_OPTIONS = [
  { key: 'hm15', label: '-1.5 핸디캡' },
  { key: 'h15', label: '1.5 플핸' },
  { key: 'so35', label: '3.5 세트오버' },
  { key: 'ml', label: '일반승' },
]

function StructuredPickButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: 10, fontWeight: 700, padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
      border: `1px solid ${active ? 'var(--gold-border)' : 'var(--border)'}`,
      background: active ? 'var(--gold-bg)' : 'var(--bg-elevated)',
      color: active ? 'var(--gold)' : 'var(--text-secondary)',
    }}>{label}</button>
  )
}

/* ── 드롭다운 선택 컴포넌트 (리그/팀 공용) ──
   가나다순 정렬 + 열었을 때 맨 위에 "새 항목 추가" 버튼 고정.
   onRename/onDelete를 넘기면 각 항목에 수정/삭제 아이콘이 추가로 표시된다 (팀 전용, 리그는 추가만 가능). */
function ManagedSelect({ label, value, onSelect, items, onAdd, onRename, onDelete, addLabel, emptyText, favorites, onToggleFavorite }: {
  label?: string
  value: string
  onSelect: (name: string) => void
  items: string[]
  onAdd: (name: string) => Promise<void>
  onRename?: (oldName: string, newName: string) => Promise<void>
  onDelete?: (name: string) => Promise<void>
  addLabel: string
  emptyText?: string
  favorites?: string[]
  onToggleFavorite?: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setAdding(false); setEditing(null) }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // 즐겨찾기한 항목을 맨 위 우선순위로, 그 안에서도 가나다순 — 나머지도 가나다순
  const favSet = new Set(favorites ?? [])
  const sorted = [...items].sort((a, b) => {
    const af = favSet.has(a), bf = favSet.has(b)
    if (af !== bf) return af ? -1 : 1
    return koCompare(a, b)
  })

  async function submitAdd() {
    const name = addValue.trim(); if (!name || busy) return
    setBusy(true)
    await onAdd(name)
    setBusy(false); setAddValue(''); setAdding(false); setOpen(false)
    onSelect(name)
  }
  async function submitEdit(oldName: string) {
    const name = editValue.trim(); if (!name || busy || !onRename) return
    setBusy(true)
    await onRename(oldName, name)
    setBusy(false); setEditing(null)
    if (value === oldName) onSelect(name)
  }
  async function submitDelete(name: string) {
    if (busy || !onDelete) return
    if (!confirm(`"${name}" 항목을 삭제할까요?\n(기존에 이미 저장된 베팅 기록에는 영향 없음)`)) return
    setBusy(true)
    await onDelete(name)
    setBusy(false)
    if (value === name) onSelect('')
  }
  async function toggleFavorite(name: string) {
    if (busy || !onToggleFavorite) return
    await onToggleFavorite(name)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {label && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700 }}>{label}</div>}
      <button type="button" onClick={() => setOpen(o => !o)} className="form-input" style={{
        fontSize: 11, padding: '5px 8px', width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)',
      }}>
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>{value || '선택'}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)', maxHeight: 240, overflowY: 'auto',
        }}>
          {adding ? (
            <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border-light)' }}>
              <input autoFocus className="form-input" value={addValue} onChange={e => setAddValue(e.target.value)}
                placeholder={addLabel} onKeyDown={e => e.key === 'Enter' && submitAdd()}
                style={{ fontSize: 10, padding: '4px 6px', flex: 1 }} />
              <button type="button" onClick={submitAdd} disabled={!addValue.trim() || busy}
                style={{ border: '1px solid var(--gold-border)', background: 'var(--gold-bg)', color: 'var(--gold)', borderRadius: 5, cursor: 'pointer', flexShrink: 0, display: 'flex', padding: '4px 6px' }}><Check size={11} /></button>
              <button type="button" onClick={() => { setAdding(false); setAddValue('') }}
                style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderRadius: 5, cursor: 'pointer', flexShrink: 0, display: 'flex', padding: '4px 6px' }}><X size={11} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} style={{
              width: '100%', textAlign: 'left', padding: '7px 8px', fontSize: 10, fontWeight: 700, color: 'var(--gold)',
              background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}><Plus size={11} /> {addLabel}</button>
          )}

          {sorted.length === 0 && !adding && (
            <div style={{ padding: '10px 8px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{emptyText ?? '등록된 항목 없음'}</div>
          )}

          {sorted.map(name => editing === name ? (
            <div key={name} style={{ display: 'flex', gap: 4, padding: '5px 6px', alignItems: 'center' }}>
              <input autoFocus className="form-input" value={editValue} onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitEdit(name)} style={{ fontSize: 10, padding: '4px 6px', flex: 1 }} />
              <button type="button" onClick={() => submitEdit(name)} disabled={busy} style={{ border: 'none', background: 'none', color: 'var(--green)', cursor: 'pointer', display: 'flex', padding: 2 }}><Check size={12} /></button>
              <button type="button" onClick={() => setEditing(null)} style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} /></button>
            </div>
          ) : (
            <div key={name} onClick={() => { onSelect(name); setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', cursor: 'pointer', fontSize: 11,
              background: value === name ? 'var(--gold-bg)' : 'transparent', color: value === name ? 'var(--gold)' : 'var(--text-primary)',
            }}>
              <span style={{ flex: 1 }}>{name}</span>
              {onToggleFavorite && (
                <button type="button" onClick={e => { e.stopPropagation(); toggleFavorite(name) }}
                  style={{ border: 'none', background: 'none', color: favSet.has(name) ? 'var(--gold)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                  <Star size={11} fill={favSet.has(name) ? 'currentColor' : 'none'} />
                </button>
              )}
              {onRename && (
                <button type="button" onClick={e => { e.stopPropagation(); setEditing(name); setEditValue(name) }}
                  style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}><Pencil size={11} /></button>
              )}
              {onDelete && (
                <button type="button" onClick={e => { e.stopPropagation(); submitDelete(name) }}
                  style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', display: 'flex', padding: 2 }}><Trash2 size={11} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 리그를 등록 → 그 리그에 팀을 등록 → 팀을 선택해서 그 팀을 대상으로 베팅.
// 경기 내용을 직접 타이핑하지 않고 전부 선택으로만 구성해 market 오분류(예: "원정"/"홈" 접미사로 인한 오분류)를 원천 차단한다.
function SportMatchPicker({ sport, leagues, teams, favoriteLeagues, onToggleFavoriteLeague, onAddLeague, onRenameLeague, onDeleteLeague, onAddTeam, onRenameTeam, onDeleteTeam, onResult }: {
  sport: StructuredSport
  leagues: string[]; teams: { league: string; name: string }[]
  favoriteLeagues: string[]
  onToggleFavoriteLeague: (name: string) => Promise<void>
  onAddLeague: (name: string) => Promise<void>
  onRenameLeague: (oldName: string, newName: string) => Promise<void>
  onDeleteLeague: (name: string) => Promise<void>
  onAddTeam: (league: string, name: string) => Promise<void>
  onRenameTeam: (league: string, oldName: string, newName: string) => Promise<void>
  onDeleteTeam: (league: string, name: string) => Promise<void>
  onResult: (match: string, league: string) => void
}) {
  const [league, setLeague] = useState('')
  const [team, setTeam] = useState('')
  const [side, setSide] = useState<'홈' | '원정'>('홈')
  const [option, setOption] = useState('')
  const [bo, setBo] = useState<EsportsBo | ''>('bo3')

  useEffect(() => { setTeam(''); setOption(''); setBo('bo3') }, [league])

  const teamOptions = teams.filter(t => t.league === league).map(t => t.name)

  useEffect(() => {
    if (!team) return
    // LOL BO1은 별도 마켓이 없어서 팀만 고르면 바로 확정
    if (sport === 'esports' && bo === 'bo1') { onResult(`${team} (BO1)`, league); return }
    if (!option) return
    let match = ''
    if (sport === 'soccer') {
      if (option === 'hm15') match = `${team} ${side} -1.5`
      else if (option === 'h05') match = `${team} ${side} 0.5`
      else if (option === 'h15') match = `${team} ${side} 1.5`
    } else if (sport === 'baseball') {
      const hcapLine: Record<string, string> = { h15: '1.5', h25: '2.5' }
      const overLine: Record<string, string> = { o15: '1.5', o25: '2.5', o35: '3.5', o45: '4.5', o55: '5.5' }
      if (hcapLine[option]) match = `${team} ${side} ${hcapLine[option]}`
      else if (overLine[option]) match = `${team} ${side} ${overLine[option]}오버`
    } else if (sport === 'basketball') {
      match = `${team} ${option}`
    } else if (sport === 'esports') {
      const boLabel = bo === 'bo3' ? 'BO3' : bo === 'bo5' ? 'BO5' : ''
      if (!boLabel) return
      // 세트 방식(BO3/BO5)은 문구 우측 괄호로 표시: "팀 마켓 (BO3)"
      if (option === 'ml') match = `${team} (${boLabel})`
      else if (option === 'h15') match = `${team} 1.5 (${boLabel})`
      else if (option === 'hm15') match = `${team} -1.5 (${boLabel})`
      else if (option === 'so35') match = `${team} 3.5세트오버 (${boLabel})`
    }
    if (match) onResult(match, league)
  }, [team, option, side, bo, sport, league])

  const options = sport === 'soccer' ? SOCCER_BET_OPTIONS
    : sport === 'basketball' ? BASKETBALL_HCAP_LINES.map(l => ({ key: String(l), label: `핸디캡 ${l}` }))
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
      <ManagedSelect
        label="리그" value={league} onSelect={setLeague} items={leagues}
        onAdd={onAddLeague} onRename={onRenameLeague} onDelete={onDeleteLeague}
        favorites={favoriteLeagues} onToggleFavorite={onToggleFavoriteLeague}
        addLabel="새 리그 추가" emptyText="등록된 리그 없음"
      />

      {league && (
        <ManagedSelect
          label="팀" value={team} onSelect={setTeam} items={teamOptions}
          onAdd={name => onAddTeam(league, name)}
          onRename={(oldName, newName) => onRenameTeam(league, oldName, newName)}
          onDelete={name => onDeleteTeam(league, name)}
          addLabel="새 팀 추가" emptyText="등록된 팀 없음"
        />
      )}

      {(sport === 'soccer' || sport === 'baseball') && team && (
        <div style={{ display: 'flex', gap: 4 }}>
          {(['홈', '원정'] as const).map(s => (
            <button key={s} type="button" onClick={() => setSide(s)} style={{
              flex: 1, fontSize: 11, fontWeight: 700, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
              border: `1px solid ${side === s ? 'var(--blue-border)' : 'var(--border)'}`,
              background: side === s ? 'var(--blue-bg)' : 'var(--bg-elevated)',
              color: side === s ? 'var(--blue)' : 'var(--text-secondary)' }}>{s}</button>
          ))}
        </div>
      )}

      {sport === 'esports' && team && (
        <div style={{ display: 'flex', gap: 4 }}>
          {(['bo1', 'bo3', 'bo5'] as const).map(b => (
            <button key={b} type="button" onClick={() => { setBo(b); setOption('') }} style={{
              flex: 1, fontSize: 11, fontWeight: 700, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
              border: `1px solid ${bo === b ? 'var(--blue-border)' : 'var(--border)'}`,
              background: bo === b ? 'var(--blue-bg)' : 'var(--bg-elevated)',
              color: bo === b ? 'var(--blue)' : 'var(--text-secondary)' }}>{b.toUpperCase()}</button>
          ))}
        </div>
      )}

      {team && sport === 'baseball' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700 }}>핸디캡</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BASEBALL_HCAP_OPTIONS.map(o => <StructuredPickButton key={o.key} label={o.label} active={option === o.key} onClick={() => setOption(o.key)} />)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700 }}>팀오버</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BASEBALL_OVER_OPTIONS.map(o => <StructuredPickButton key={o.key} label={o.label} active={option === o.key} onClick={() => setOption(o.key)} />)}
            </div>
          </div>
        </div>
      )}

      {team && sport === 'esports' && (bo === 'bo3' || bo === 'bo5') && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(bo === 'bo3' ? ESPORTS_BO3_OPTIONS : ESPORTS_BO5_OPTIONS).map(o => <StructuredPickButton key={o.key} label={o.label} active={option === o.key} onClick={() => setOption(o.key)} />)}
        </div>
      )}

      {team && sport !== 'baseball' && sport !== 'esports' && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {options.map(o => <StructuredPickButton key={o.key} label={o.label} active={option === o.key} onClick={() => setOption(o.key)} />)}
        </div>
      )}
    </div>
  )
}

function SingleBetForm({ site, onClose, onBet, onMultiBet, defaultSport, baseballOverrides, soccerOverrides, basketballOverrides, volleyballOverrides, teamCandidates, allBetsHistory, leagueCandidates, soccerLeagues, baseballLeagues, basketballLeagues, esportsLeagues, soccerFavoriteLeagues, baseballFavoriteLeagues, basketballFavoriteLeagues, esportsFavoriteLeagues, onToggleSoccerLeagueFavorite, onToggleBaseballLeagueFavorite, onToggleBasketballLeagueFavorite, onToggleEsportsLeagueFavorite, soccerTeams, baseballTeams, basketballTeams, esportsTeams, onAddSoccerLeague, onAddBaseballLeague, onAddBasketballLeague, onAddEsportsLeague, onRenameSoccerLeague, onDeleteSoccerLeague, onRenameBaseballLeague, onDeleteBaseballLeague, onRenameBasketballLeague, onDeleteBasketballLeague, onRenameEsportsLeague, onDeleteEsportsLeague, onAddSoccerTeam, onAddBaseballTeam, onAddBasketballTeam, onAddEsportsTeam, onRenameSoccerTeam, onDeleteSoccerTeam, onRenameBaseballTeam, onDeleteBaseballTeam, onRenameBasketballTeam, onDeleteBasketballTeam, onRenameEsportsTeam, onDeleteEsportsTeam }: {
  site: Site; onClose: () => void; defaultSport: string
  onBet: (sport: string, content: string, odds: number, amount: number, isLive: boolean, league: string) => Promise<boolean>
  onMultiBet: (sport: string, contents: string[], odds: number, amount: number, leagues: string[]) => Promise<boolean>
  baseballOverrides: LeagueOverride[]; soccerOverrides: LeagueOverride[]
  basketballOverrides: LeagueOverride[]; volleyballOverrides: LeagueOverride[]
  teamCandidates: TeamCandidate[]; allBetsHistory: BetLite[]; leagueCandidates: LeagueCandidate[]
  soccerLeagues: string[]; baseballLeagues: string[]; basketballLeagues: string[]; esportsLeagues: string[]
  soccerFavoriteLeagues: string[]; baseballFavoriteLeagues: string[]; basketballFavoriteLeagues: string[]; esportsFavoriteLeagues: string[]
  onToggleSoccerLeagueFavorite: (name: string) => Promise<void>; onToggleBaseballLeagueFavorite: (name: string) => Promise<void>
  onToggleBasketballLeagueFavorite: (name: string) => Promise<void>; onToggleEsportsLeagueFavorite: (name: string) => Promise<void>
  soccerTeams: { league: string; name: string }[]; baseballTeams: { league: string; name: string }[]; basketballTeams: { league: string; name: string }[]; esportsTeams: { league: string; name: string }[]
  onAddSoccerLeague: (name: string) => Promise<void>; onAddBaseballLeague: (name: string) => Promise<void>; onAddBasketballLeague: (name: string) => Promise<void>; onAddEsportsLeague: (name: string) => Promise<void>
  onRenameSoccerLeague: (oldName: string, newName: string) => Promise<void>; onDeleteSoccerLeague: (name: string) => Promise<void>
  onRenameBaseballLeague: (oldName: string, newName: string) => Promise<void>; onDeleteBaseballLeague: (name: string) => Promise<void>
  onRenameBasketballLeague: (oldName: string, newName: string) => Promise<void>; onDeleteBasketballLeague: (name: string) => Promise<void>
  onRenameEsportsLeague: (oldName: string, newName: string) => Promise<void>; onDeleteEsportsLeague: (name: string) => Promise<void>
  onAddSoccerTeam: (league: string, name: string) => Promise<void>; onAddBaseballTeam: (league: string, name: string) => Promise<void>; onAddBasketballTeam: (league: string, name: string) => Promise<void>; onAddEsportsTeam: (league: string, name: string) => Promise<void>
  onRenameSoccerTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteSoccerTeam: (league: string, name: string) => Promise<void>
  onRenameBaseballTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteBaseballTeam: (league: string, name: string) => Promise<void>
  onRenameBasketballTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteBasketballTeam: (league: string, name: string) => Promise<void>
  onRenameEsportsTeam: (league: string, oldName: string, newName: string) => Promise<void>; onDeleteEsportsTeam: (league: string, name: string) => Promise<void>
}) {
  const isusd = site.currency === 'usd'; const unit = isusd ? '$' : '원'
  const defaultAmount = site.default_stake > 0 ? String(site.default_stake) : (isusd ? '5' : '10000')
  const [sport, setSport]       = useState<string>(defaultSport || 'soccer')
  const [sportTouched, setSportTouched] = useState(false)
  const [content, setContent]   = useState('')
  const [league, setLeague]     = useState('')
  const [leagueTouched, setLeagueTouched] = useState(false)
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
      {mode === 'single' && STRUCTURED_SPORTS.includes(sport as StructuredSport) ? (
        <SportMatchPicker
          key={sport}
          sport={sport as StructuredSport}
          leagues={sport === 'soccer' ? soccerLeagues : sport === 'baseball' ? baseballLeagues : sport === 'basketball' ? basketballLeagues : esportsLeagues}
          favoriteLeagues={sport === 'soccer' ? soccerFavoriteLeagues : sport === 'baseball' ? baseballFavoriteLeagues : sport === 'basketball' ? basketballFavoriteLeagues : esportsFavoriteLeagues}
          onToggleFavoriteLeague={sport === 'soccer' ? onToggleSoccerLeagueFavorite : sport === 'baseball' ? onToggleBaseballLeagueFavorite : sport === 'basketball' ? onToggleBasketballLeagueFavorite : onToggleEsportsLeagueFavorite}
          teams={sport === 'soccer' ? soccerTeams : sport === 'baseball' ? baseballTeams : sport === 'basketball' ? basketballTeams : esportsTeams}
          onAddLeague={sport === 'soccer' ? onAddSoccerLeague : sport === 'baseball' ? onAddBaseballLeague : sport === 'basketball' ? onAddBasketballLeague : onAddEsportsLeague}
          onRenameLeague={sport === 'soccer' ? onRenameSoccerLeague : sport === 'baseball' ? onRenameBaseballLeague : sport === 'basketball' ? onRenameBasketballLeague : onRenameEsportsLeague}
          onDeleteLeague={sport === 'soccer' ? onDeleteSoccerLeague : sport === 'baseball' ? onDeleteBaseballLeague : sport === 'basketball' ? onDeleteBasketballLeague : onDeleteEsportsLeague}
          onAddTeam={sport === 'soccer' ? onAddSoccerTeam : sport === 'baseball' ? onAddBaseballTeam : sport === 'basketball' ? onAddBasketballTeam : onAddEsportsTeam}
          onRenameTeam={sport === 'soccer' ? onRenameSoccerTeam : sport === 'baseball' ? onRenameBaseballTeam : sport === 'basketball' ? onRenameBasketballTeam : onRenameEsportsTeam}
          onDeleteTeam={sport === 'soccer' ? onDeleteSoccerTeam : sport === 'baseball' ? onDeleteBaseballTeam : sport === 'basketball' ? onDeleteBasketballTeam : onDeleteEsportsTeam}
          onResult={(m, l) => { setContent(m); setLeague(l); setLeagueTouched(true) }}
        />
      ) : (
        <>
          {mode === 'single' && (
            <LeagueInput placeholder={sport === 'esports' ? '리그 (자동 추론, LCK CL 외 다른 리그 등은 여기 직접 입력)' : '리그 (자동 추론, 직접 입력 가능, KBO/NPB/KBL 등은 여기 직접 입력)'} value={league}
              onChange={v => { setLeague(v); setLeagueTouched(true) }}
              candidates={leagueCandidates}
              style={{ fontSize: 11 }} />
          )}
          <TeamContentInput inputRef={contentRef} placeholder={mode === 'multi' ? `경기 내용 ${LEG_MARKS[0]}` : '경기 내용'} value={content} onChange={setContent}
            candidates={teamCandidates} allBets={allBetsHistory} autoFocus onEnter={submit} />
        </>
      )}
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
        {mode === 'single' && (
          <button type="button" onClick={() => setIsLive(v => !v)} title={isLive ? '라이브 켜짐 (누르면 끄기)' : '라이브 꺼짐 (누르면 켜기)'} style={{
            width: 30, height: 30, borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${isLive ? 'var(--red)' : 'var(--border)'}`,
            background: isLive ? 'var(--red)' : 'var(--bg-elevated)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: isLive ? '#fff' : 'var(--text-muted)' }} />
          </button>
        )}
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
  // 축구/야구/농구/LOL — 리그/팀 직접 등록 후 드롭다운으로 선택하는 방식 (자유입력 대신)
  const [soccerLeagues, setSoccerLeagues] = useState<string[]>([])
  const [baseballLeagues, setBaseballLeagues] = useState<string[]>([])
  const [basketballLeagues, setBasketballLeagues] = useState<string[]>([])
  const [esportsLeagues, setEsportsLeagues] = useState<string[]>([])
  const [soccerFavoriteLeagues, setSoccerFavoriteLeagues] = useState<string[]>([])
  const [baseballFavoriteLeagues, setBaseballFavoriteLeagues] = useState<string[]>([])
  const [basketballFavoriteLeagues, setBasketballFavoriteLeagues] = useState<string[]>([])
  const [esportsFavoriteLeagues, setEsportsFavoriteLeagues] = useState<string[]>([])
  const [soccerTeams, setSoccerTeams] = useState<{ league: string; name: string }[]>([])
  const [baseballTeams, setBaseballTeams] = useState<{ league: string; name: string }[]>([])
  const [basketballTeams, setBasketballTeams] = useState<{ league: string; name: string }[]>([])
  const [esportsTeams, setEsportsTeams] = useState<{ league: string; name: string }[]>([])
  // 전체 사이트 입금/롤링 합산 요약(원화 환산)용 환율
  const [usdKrwRate, setUsdKrwRate] = useState<number>(1350)

  useEffect(() => { loadSites(); loadBets(); loadGameRollings(); loadLeagueOverrides(); loadAllBetsHistory(); loadSportTeamData(); getUsdKrwRate().then(setUsdKrwRate) }, [])

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
  // 축구/야구/농구/LOL — 등록된 리그/팀 목록 로드 (베팅추가에서 자유입력 대신 드롭다운으로 선택)
  async function loadSportTeamData() {
    const [{ data: sl }, { data: bl }, { data: kl }, { data: el }, { data: st }, { data: bt }, { data: kt }, { data: et }] = await Promise.all([
      supabase.from('soccer_leagues').select('name, is_favorite').order('sort_order').order('name'),
      supabase.from('baseball_leagues').select('name, is_favorite').order('sort_order').order('name'),
      supabase.from('basketball_leagues').select('name, is_favorite').order('sort_order').order('name'),
      supabase.from('esports_leagues').select('name, is_favorite').order('sort_order').order('name'),
      supabase.from('soccer_teams').select('league, name').order('sort_order').order('name'),
      supabase.from('baseball_teams').select('league, name').order('sort_order').order('name'),
      supabase.from('basketball_teams').select('league, name').order('sort_order').order('name'),
      supabase.from('esports_teams').select('league, name').order('sort_order').order('name'),
    ])
    if (sl) { setSoccerLeagues(sl.map(r => r.name)); setSoccerFavoriteLeagues(sl.filter(r => r.is_favorite).map(r => r.name)) }
    if (bl) { setBaseballLeagues(bl.map(r => r.name)); setBaseballFavoriteLeagues(bl.filter(r => r.is_favorite).map(r => r.name)) }
    if (kl) { setBasketballLeagues(kl.map(r => r.name)); setBasketballFavoriteLeagues(kl.filter(r => r.is_favorite).map(r => r.name)) }
    if (el) { setEsportsLeagues(el.map(r => r.name)); setEsportsFavoriteLeagues(el.filter(r => r.is_favorite).map(r => r.name)) }
    if (st) setSoccerTeams(st)
    if (bt) setBaseballTeams(bt)
    if (kt) setBasketballTeams(kt)
    if (et) setEsportsTeams(et)
  }
  // 리그 즐겨찾기 토글 — 드롭다운 열었을 때 맨 위 우선순위로 노출하기 위한 용도
  async function toggleSoccerLeagueFavorite(name: string) {
    const next = !soccerFavoriteLeagues.includes(name)
    const { error } = await supabase.from('soccer_leagues').update({ is_favorite: next }).eq('name', name)
    if (error) { alert('즐겨찾기 저장 실패: ' + error.message); return }
    setSoccerFavoriteLeagues(p => next ? [...p, name] : p.filter(l => l !== name))
  }
  async function toggleBaseballLeagueFavorite(name: string) {
    const next = !baseballFavoriteLeagues.includes(name)
    const { error } = await supabase.from('baseball_leagues').update({ is_favorite: next }).eq('name', name)
    if (error) { alert('즐겨찾기 저장 실패: ' + error.message); return }
    setBaseballFavoriteLeagues(p => next ? [...p, name] : p.filter(l => l !== name))
  }
  async function toggleBasketballLeagueFavorite(name: string) {
    const next = !basketballFavoriteLeagues.includes(name)
    const { error } = await supabase.from('basketball_leagues').update({ is_favorite: next }).eq('name', name)
    if (error) { alert('즐겨찾기 저장 실패: ' + error.message); return }
    setBasketballFavoriteLeagues(p => next ? [...p, name] : p.filter(l => l !== name))
  }
  async function toggleEsportsLeagueFavorite(name: string) {
    const next = !esportsFavoriteLeagues.includes(name)
    const { error } = await supabase.from('esports_leagues').update({ is_favorite: next }).eq('name', name)
    if (error) { alert('즐겨찾기 저장 실패: ' + error.message); return }
    setEsportsFavoriteLeagues(p => next ? [...p, name] : p.filter(l => l !== name))
  }
  async function addSoccerLeague(name: string) {
    const { error } = await supabase.from('soccer_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    if (error) { alert('리그 저장 실패: ' + error.message); return }
    setSoccerLeagues(p => p.includes(name) ? p : [...p, name])
  }
  async function addBaseballLeague(name: string) {
    const { error } = await supabase.from('baseball_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    if (error) { alert('리그 저장 실패: ' + error.message); return }
    setBaseballLeagues(p => p.includes(name) ? p : [...p, name])
  }
  async function addBasketballLeague(name: string) {
    const { error } = await supabase.from('basketball_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    if (error) { alert('리그 저장 실패: ' + error.message); return }
    setBasketballLeagues(p => p.includes(name) ? p : [...p, name])
  }
  async function addEsportsLeague(name: string) {
    const { error } = await supabase.from('esports_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    if (error) { alert('리그 저장 실패: ' + error.message); return }
    setEsportsLeagues(p => p.includes(name) ? p : [...p, name])
  }
  // 리그 이름 변경 — 리그 테이블 갱신 + 그 리그에 속한 팀들을 새 이름으로 이동 + 이미 저장된 베팅의 league 컬럼도 함께 갱신.
  // (league 컬럼은 팀 테이블의 외래키라, 새 이름 행을 먼저 만들고 자식(팀)을 옮긴 뒤 옛 이름 행을 지우는 순서로 처리)
  async function renameSoccerLeague(oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('soccer_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    await supabase.from('soccer_teams').update({ league: name }).eq('league', oldName)
    await supabase.from('bets').update({ league: name }).eq('league', oldName).eq('sport', 'soccer')
    await supabase.from('soccer_leagues').delete().eq('name', oldName)
    setSoccerLeagues(p => Array.from(new Set(p.map(l => l === oldName ? name : l))))
    setSoccerTeams(p => p.map(t => t.league === oldName ? { ...t, league: name } : t))
  }
  async function deleteSoccerLeague(name: string) {
    await supabase.from('soccer_leagues').delete().eq('name', name) // 팀도 cascade로 함께 삭제됨
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'soccer')
    setSoccerLeagues(p => p.filter(l => l !== name))
    setSoccerTeams(p => p.filter(t => t.league !== name))
  }
  async function renameBaseballLeague(oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('baseball_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    await supabase.from('baseball_teams').update({ league: name }).eq('league', oldName)
    await supabase.from('bets').update({ league: name }).eq('league', oldName).eq('sport', 'baseball')
    await supabase.from('baseball_leagues').delete().eq('name', oldName)
    setBaseballLeagues(p => Array.from(new Set(p.map(l => l === oldName ? name : l))))
    setBaseballTeams(p => p.map(t => t.league === oldName ? { ...t, league: name } : t))
  }
  async function deleteBaseballLeague(name: string) {
    await supabase.from('baseball_leagues').delete().eq('name', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'baseball')
    setBaseballLeagues(p => p.filter(l => l !== name))
    setBaseballTeams(p => p.filter(t => t.league !== name))
  }
  async function renameBasketballLeague(oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('basketball_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    await supabase.from('basketball_teams').update({ league: name }).eq('league', oldName)
    await supabase.from('bets').update({ league: name }).eq('league', oldName).eq('sport', 'basketball')
    await supabase.from('basketball_leagues').delete().eq('name', oldName)
    setBasketballLeagues(p => Array.from(new Set(p.map(l => l === oldName ? name : l))))
    setBasketballTeams(p => p.map(t => t.league === oldName ? { ...t, league: name } : t))
  }
  async function deleteBasketballLeague(name: string) {
    await supabase.from('basketball_leagues').delete().eq('name', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'basketball')
    setBasketballLeagues(p => p.filter(l => l !== name))
    setBasketballTeams(p => p.filter(t => t.league !== name))
  }
  async function renameEsportsLeague(oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('esports_leagues').upsert({ name }, { onConflict: 'name', ignoreDuplicates: true })
    await supabase.from('esports_teams').update({ league: name }).eq('league', oldName)
    await supabase.from('bets').update({ league: name }).eq('league', oldName).eq('sport', 'esports')
    await supabase.from('esports_leagues').delete().eq('name', oldName)
    setEsportsLeagues(p => Array.from(new Set(p.map(l => l === oldName ? name : l))))
    setEsportsTeams(p => p.map(t => t.league === oldName ? { ...t, league: name } : t))
  }
  async function deleteEsportsLeague(name: string) {
    await supabase.from('esports_leagues').delete().eq('name', name)
    await supabase.from('bets').update({ league: '' }).eq('league', name).eq('sport', 'esports')
    setEsportsLeagues(p => p.filter(l => l !== name))
    setEsportsTeams(p => p.filter(t => t.league !== name))
  }
  async function addSoccerTeam(league: string, name: string) {
    const { error } = await supabase.from('soccer_teams').upsert({ league, name }, { onConflict: 'league,name', ignoreDuplicates: true })
    if (error) { alert('팀 저장 실패: ' + error.message); return }
    setSoccerTeams(p => p.some(t => t.league === league && t.name === name) ? p : [...p, { league, name }])
  }
  async function addBaseballTeam(league: string, name: string) {
    const { error } = await supabase.from('baseball_teams').upsert({ league, name }, { onConflict: 'league,name', ignoreDuplicates: true })
    if (error) { alert('팀 저장 실패: ' + error.message); return }
    setBaseballTeams(p => p.some(t => t.league === league && t.name === name) ? p : [...p, { league, name }])
  }
  async function addBasketballTeam(league: string, name: string) {
    const { error } = await supabase.from('basketball_teams').upsert({ league, name }, { onConflict: 'league,name', ignoreDuplicates: true })
    if (error) { alert('팀 저장 실패: ' + error.message); return }
    setBasketballTeams(p => p.some(t => t.league === league && t.name === name) ? p : [...p, { league, name }])
  }
  async function addEsportsTeam(league: string, name: string) {
    const { error } = await supabase.from('esports_teams').upsert({ league, name }, { onConflict: 'league,name', ignoreDuplicates: true })
    if (error) { alert('팀 저장 실패: ' + error.message); return }
    setEsportsTeams(p => p.some(t => t.league === league && t.name === name) ? p : [...p, { league, name }])
  }
  // 팀 이름 수정/삭제 — 등록 목록(soccer_teams 등)만 갱신. 이미 저장된 베팅의 match 문자열은 자유 입력 텍스트라 소급 반영하지 않음.
  async function renameSoccerTeam(league: string, oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('soccer_teams').update({ name }).eq('league', league).eq('name', oldName)
    setSoccerTeams(p => p.map(t => (t.league === league && t.name === oldName) ? { league, name } : t))
  }
  async function deleteSoccerTeam(league: string, name: string) {
    await supabase.from('soccer_teams').delete().eq('league', league).eq('name', name)
    setSoccerTeams(p => p.filter(t => !(t.league === league && t.name === name)))
  }
  async function renameBaseballTeam(league: string, oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('baseball_teams').update({ name }).eq('league', league).eq('name', oldName)
    setBaseballTeams(p => p.map(t => (t.league === league && t.name === oldName) ? { league, name } : t))
  }
  async function deleteBaseballTeam(league: string, name: string) {
    await supabase.from('baseball_teams').delete().eq('league', league).eq('name', name)
    setBaseballTeams(p => p.filter(t => !(t.league === league && t.name === name)))
  }
  async function renameBasketballTeam(league: string, oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('basketball_teams').update({ name }).eq('league', league).eq('name', oldName)
    setBasketballTeams(p => p.map(t => (t.league === league && t.name === oldName) ? { league, name } : t))
  }
  async function deleteBasketballTeam(league: string, name: string) {
    await supabase.from('basketball_teams').delete().eq('league', league).eq('name', name)
    setBasketballTeams(p => p.filter(t => !(t.league === league && t.name === name)))
  }
  async function renameEsportsTeam(league: string, oldName: string, newName: string) {
    const name = newName.trim(); if (!name || name === oldName) return
    await supabase.from('esports_teams').update({ name }).eq('league', league).eq('name', oldName)
    setEsportsTeams(p => p.map(t => (t.league === league && t.name === oldName) ? { league, name } : t))
  }
  async function deleteEsportsTeam(league: string, name: string) {
    await supabase.from('esports_teams').delete().eq('league', league).eq('name', name)
    setEsportsTeams(p => p.filter(t => !(t.league === league && t.name === name)))
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
                            <SingleBetForm site={site} defaultSport={betsBySite(site.id).slice(-1)[0]?.sport ?? 'soccer'} onClose={() => setOpenFormSiteId(null)} onBet={(sp,ct,od,amt,lv,lg) => submitBet(site,sp,ct,od,amt,lv,lg)} onMultiBet={(sp,cs,od,amt,lgs) => submitMultiBet(site,sp,cs,od,amt,lgs)} baseballOverrides={baseballOverrides} soccerOverrides={soccerOverrides} basketballOverrides={basketballOverrides} volleyballOverrides={volleyballOverrides} teamCandidates={teamCandidates} allBetsHistory={allBetsHistory} leagueCandidates={leagueCandidates} soccerLeagues={soccerLeagues} baseballLeagues={baseballLeagues} basketballLeagues={basketballLeagues} esportsLeagues={esportsLeagues} soccerFavoriteLeagues={soccerFavoriteLeagues} baseballFavoriteLeagues={baseballFavoriteLeagues} basketballFavoriteLeagues={basketballFavoriteLeagues} esportsFavoriteLeagues={esportsFavoriteLeagues} onToggleSoccerLeagueFavorite={toggleSoccerLeagueFavorite} onToggleBaseballLeagueFavorite={toggleBaseballLeagueFavorite} onToggleBasketballLeagueFavorite={toggleBasketballLeagueFavorite} onToggleEsportsLeagueFavorite={toggleEsportsLeagueFavorite} soccerTeams={soccerTeams} baseballTeams={baseballTeams} basketballTeams={basketballTeams} esportsTeams={esportsTeams} onAddSoccerLeague={addSoccerLeague} onAddBaseballLeague={addBaseballLeague} onAddBasketballLeague={addBasketballLeague} onAddEsportsLeague={addEsportsLeague} onRenameSoccerLeague={renameSoccerLeague} onDeleteSoccerLeague={deleteSoccerLeague} onRenameBaseballLeague={renameBaseballLeague} onDeleteBaseballLeague={deleteBaseballLeague} onRenameBasketballLeague={renameBasketballLeague} onDeleteBasketballLeague={deleteBasketballLeague} onRenameEsportsLeague={renameEsportsLeague} onDeleteEsportsLeague={deleteEsportsLeague} onAddSoccerTeam={addSoccerTeam} onAddBaseballTeam={addBaseballTeam} onAddBasketballTeam={addBasketballTeam} onAddEsportsTeam={addEsportsTeam} onRenameSoccerTeam={renameSoccerTeam} onDeleteSoccerTeam={deleteSoccerTeam} onRenameBaseballTeam={renameBaseballTeam} onDeleteBaseballTeam={deleteBaseballTeam} onRenameBasketballTeam={renameBasketballTeam} onDeleteBasketballTeam={deleteBasketballTeam} onRenameEsportsTeam={renameEsportsTeam} onDeleteEsportsTeam={deleteEsportsTeam} />
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
                                              <BetMatchDisplay sport={gb.sport} match={gb.match} fontSize={13} teamColor={legChecked ? 'var(--green)' : undefined} />
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
                                  soccerLeagues={soccerLeagues} baseballLeagues={baseballLeagues} basketballLeagues={basketballLeagues} esportsLeagues={esportsLeagues}
                                  soccerFavoriteLeagues={soccerFavoriteLeagues} baseballFavoriteLeagues={baseballFavoriteLeagues} basketballFavoriteLeagues={basketballFavoriteLeagues} esportsFavoriteLeagues={esportsFavoriteLeagues}
                                  onToggleSoccerLeagueFavorite={toggleSoccerLeagueFavorite} onToggleBaseballLeagueFavorite={toggleBaseballLeagueFavorite} onToggleBasketballLeagueFavorite={toggleBasketballLeagueFavorite} onToggleEsportsLeagueFavorite={toggleEsportsLeagueFavorite}
                                  soccerTeams={soccerTeams} baseballTeams={baseballTeams} basketballTeams={basketballTeams} esportsTeams={esportsTeams}
                                  onAddSoccerLeague={addSoccerLeague} onAddBaseballLeague={addBaseballLeague} onAddBasketballLeague={addBasketballLeague} onAddEsportsLeague={addEsportsLeague}
                                  onRenameSoccerLeague={renameSoccerLeague} onDeleteSoccerLeague={deleteSoccerLeague}
                                  onRenameBaseballLeague={renameBaseballLeague} onDeleteBaseballLeague={deleteBaseballLeague}
                                  onRenameBasketballLeague={renameBasketballLeague} onDeleteBasketballLeague={deleteBasketballLeague}
                                  onRenameEsportsLeague={renameEsportsLeague} onDeleteEsportsLeague={deleteEsportsLeague}
                                  onAddSoccerTeam={addSoccerTeam} onAddBaseballTeam={addBaseballTeam} onAddBasketballTeam={addBasketballTeam} onAddEsportsTeam={addEsportsTeam}
                                  onRenameSoccerTeam={renameSoccerTeam} onDeleteSoccerTeam={deleteSoccerTeam}
                                  onRenameBaseballTeam={renameBaseballTeam} onDeleteBaseballTeam={deleteBaseballTeam}
                                  onRenameBasketballTeam={renameBasketballTeam} onDeleteBasketballTeam={deleteBasketballTeam}
                                  onRenameEsportsTeam={renameEsportsTeam} onDeleteEsportsTeam={deleteEsportsTeam}
                                />
                              ) : (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                                  {/* 좌: 경기 내용 */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {bet.league && <div style={{ paddingLeft: 26, fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{bet.league}</div>}
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 22, textAlign: 'center' }}>{sportGlyph(bet.sport) ?? SPORT_SHORT[bet.sport] ?? '📋'}</span>
                                      <BetMatchDisplay sport={bet.sport} match={bet.match} fontSize={13} />
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
                                          <BetMatchDisplay sport={gb.sport} match={gb.match} fontSize={12} teamColor={isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-secondary)'} />
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
                                    <BetMatchDisplay sport={bet.sport} match={bet.match} fontSize={12} teamColor={bet.result === 'win' ? 'var(--green)' : bet.result === 'loss' ? 'var(--red)' : 'var(--text-secondary)'} />
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

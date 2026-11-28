import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { OV_LEAGUE } from '../lib/playerOverall'
import { koName } from '../lib/gameSchedule'
import { loadGameLines, type OddsSnap, type OddsLine } from '../lib/odds'
import { findAnalysis, type OverallAnalysis } from './OverallAnalysisView'
import GameAnalysis, { type AnalysisGame } from './GameAnalysis'

// 대시보드 베팅슬립 '분석 보기' → 분석 탭과 같은 분석 자료를 화면 가운데 큰 창으로 (사용자 요청 — 입금 추가처럼 가운데 모달).
// 분석 자료 = 선수 오버롤·예상 스코어(NBA·KBL·WKBL·V리그) · 승패 배당 변동 · 오버롤 분석. 하나도 없으면 "분석 자료가 없습니다".
const num = (v: unknown) => (v == null ? null : Number(v))

export default function GameAnalysisModal({ g, onClose }: { g: AnalysisGame; onClose: () => void }) {
  const [odds, setOdds] = useState<OddsSnap[] | null>(null)
  const [analysis, setAnalysis] = useState<OverallAnalysis | null>(null)
  const [lines, setLines] = useState<OddsLine[]>([])
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  useEffect(() => {
    loadGameLines(g.id).then(setLines).catch(() => {})
    Promise.all([
      supabase.from('odds_snapshots').select('*').eq('game_id', g.id).order('fetched_at'),
      supabase.from('overall_analyses').select('*').eq('game_date', g.date),
    ]).then(([o, a]) => {
      setOdds(((o.data ?? []) as OddsSnap[]).map(r => ({ ...r, home_odds: num(r.home_odds), away_odds: num(r.away_odds), open_home: num(r.open_home), open_away: num(r.open_away), draw_odds: num(r.draw_odds), open_draw: num(r.open_draw), home_tickets: num(r.home_tickets) })))
      setAnalysis(findAnalysis((a.data ?? []) as OverallAnalysis[], g))
    }).catch(() => setOdds([]))
  }, [g.id, g.date]) // eslint-disable-line react-hooks/exhaustive-deps

  // 축구는 DraftKings 배당이 없어도 FotMob 결장·선발·피나클 공정 배당이 있어 늘 연다 (2026-11-28 — 함부르크–바이에른이 '분석 자료가 없습니다'로 나왔다)
  const none = odds != null && g.sport !== 'soccer' && !OV_LEAGUE[g.league] && !odds.length && !lines.length && !analysis
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 1280, width: '96vw', maxHeight: '94vh' }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>경기 분석 · {koName(g.home.name)} vs {koName(g.away.name)}</span>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
        {odds == null ? <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>불러오는 중…</div>
          : none ? <div style={{ fontSize: 14, color: 'var(--text-muted)', padding: '48px 24px', textAlign: 'center' }}>분석 자료가 없습니다.</div>
          : <GameAnalysis g={g} analysis={analysis} odds={odds} lines={lines} />}
      </div>
    </div>
  )
}

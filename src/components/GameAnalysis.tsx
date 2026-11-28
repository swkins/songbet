import dayjs from 'dayjs'
import PlayerOverall from './PlayerOverall'
import PinFairBox from './PinFairBox'
import { NbaFlowBox } from './FlowPickBox'
import { MockBetsForGame } from './MockBetStats'
import OddsHistory, { LineHistory } from './OddsHistory'
import OverallAnalysisView, { type OverallAnalysis } from './OverallAnalysisView'
import { gameState, koName, type ScheduleGame, type ScheduleTeam } from '../lib/gameSchedule'
import { lastLine, type OddsSnap, type OddsLine } from '../lib/odds'

// 경기 분석 화면 — 분석 탭 오른쪽 칸과 대시보드 베팅슬립 '분석 보기' 창(GameAnalysisModal)이 같이 쓴다.
export interface AnalysisGame extends ScheduleGame { sport: string; league: string; date: string }
type Team = ScheduleTeam
const KO_DAY = '일월화수목금토'
const mdDay = (d: string) => `${dayjs(d).format('M/D')} (${KO_DAY[dayjs(d).day()]})`

// 오른쪽 분석 칸 — 경기 정보 · 승패 배당 변동 · 선수 오버롤·출전 확률(PlayerOverall) · 오버롤 분석(있으면)
export default function GameAnalysis({ g, analysis, odds, lines, onGoBet }: { g: AnalysisGame; analysis: OverallAnalysis | null; odds?: OddsSnap[]; lines?: OddsLine[]; onGoBet?: (t: { sport: string; league: string; gameId: string }) => void }) {
  const st = gameState(g)
  const flowOnly = g.league === 'NBA' || g.sport === 'soccer'
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
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{g.league} · {mdDay(g.start)} {dayjs(g.start).format('HH:mm')}{g.venue ? ` · ${g.venue}` : ''}{g.note ? ` · ${g.note}` : ''}</span>
        {/* 베팅하기 → 대시보드 베팅 모드의 이 경기 베팅슬립 (사용자 요청). 끝난 경기는 없음 */}
        {onGoBet && st !== 'ended' && (
          <button type="button" className="btn btn-primary" onClick={() => onGoBet({ sport: g.sport, league: g.league, gameId: g.id })}
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 12, fontWeight: 700 }}>베팅하기 →</button>
        )}
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
      {/* NBA·축구 = 배당 흐름만 (2026-11-28 사용자 요청 — 뉴스·예상 스코어·선수 오버롤은 지움). 국내 리그는 PlayerOverall 그대로 */}
      {flowOnly ? <>
        {g.league === 'NBA' && <NbaFlowBox lines={lines} hName={koName(g.home.name)} aName={koName(g.away.name)} />}
        {g.sport === 'soccer' && <PinFairBox gameId={g.id} home={g.home} away={g.away} />}
        {odds?.length || lines?.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'flex-start' }}>
            {odds?.length ? <div style={{ flex: '1 1 320px', minWidth: 0 }}><OddsHistory compact list={odds} homeName={koName(g.home.name)} awayName={koName(g.away.name)} /></div> : null}
            {lines?.length ? <div style={{ flex: '1 1 320px', minWidth: 0 }}><LineHistory list={lines} homeName={koName(g.home.name)} awayName={koName(g.away.name)} /></div> : null}
          </div>
        ) : null}
        {g.league === 'NBA' && <MockBetsForGame gameId={g.id} />}
      </> : <>
        {/* 좌: 배당 변동 + 예상 스코어 / 우: 선수 오버롤·출전 확률 / 아래: 뉴스 */}
        <PlayerOverall league={g.league} gameDate={g.date} home={g.home} away={g.away}
          left={odds?.length || lines?.length ? <>
            {odds?.length ? <OddsHistory compact list={odds} homeName={koName(g.home.name)} awayName={koName(g.away.name)} /> : null}
            {lines?.length ? <LineHistory list={lines} homeName={koName(g.home.name)} awayName={koName(g.away.name)} /> : null}
          </> : null}
          lines={lines?.length ? { spread: lastLine(lines, 'spread'), total: lastLine(lines, 'total') } : null}
          odds={(() => { const l = odds?.[odds.length - 1]; return l?.home_odds && l?.away_odds ? { home: Number(l.home_odds), away: Number(l.away_odds) } : null })()} />
      </>}
      {analysis && !flowOnly ? <OverallAnalysisView a={analysis} /> : null}
    </div>
  )
}

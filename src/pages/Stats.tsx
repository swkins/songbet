import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { purgeOldLogs } from '../lib/logger'
import type { Bet, Sport, Market, ActionLog } from '../types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import dayjs from 'dayjs'
import { RotateCcw } from 'lucide-react'

const SPORT_LABELS: Record<Sport,string> = {soccer:'축구',baseball:'야구',basketball:'농구',volleyball:'배구',esports:'e스포츠',other:'기타'}
const MARKET_LABELS: Record<Market,string> = {handicap:'핸디캡',over_under:'오버/언더',moneyline:'승패',correct_score:'정확한스코어',other:'기타'}

export default function Stats(){
  const[bets,setBets]=useState<Bet[]>([])
  const[logs,setLogs]=useState<ActionLog[]>([])
  const[period,setPeriod]=useState<'all'|'7d'|'30d'|'90d'>('all')
  const[view,setView]=useState<'stats'|'logs'>('stats')
  const[undoing,setUndoing]=useState<string|null>(null)

  useEffect(()=>{loadBets();loadLogs();purgeOldLogs()},[])

  async function loadBets(){
    const{data}=await supabase.from('bets').select('*').neq('result','pending').order('bet_date')
    if(data)setBets(data)
  }
  async function loadLogs(){
    const{data}=await supabase.from('action_logs').select('*').order('created_at',{ascending:false}).limit(100)
    if(data)setLogs(data as ActionLog[])
  }

  // 되돌리기
  async function undoAction(log: ActionLog){
    setUndoing(log.id)
    try{
      if(log.action_type==='insert'&&log.record_id){
        // 삽입 취소 → 삭제
        await supabase.from(log.table_name).delete().eq('id',log.record_id)
      } else if(log.action_type==='delete'&&log.before_data){
        // 삭제 취소 → 재삽입
        await supabase.from(log.table_name).insert(log.before_data)
      } else if(log.action_type==='update'&&log.before_data&&log.record_id){
        // 업데이트 취소 → 이전 상태로 복원
        await supabase.from(log.table_name).update(log.before_data).eq('id',log.record_id)
      }
      // 로그 삭제
      await supabase.from('action_logs').delete().eq('id',log.id)
      setLogs(p=>p.filter(l=>l.id!==log.id))
      alert('되돌리기 완료. 페이지를 새로고침하세요.')
    }catch(e){
      alert('되돌리기 실패: '+String(e))
    }
    setUndoing(null)
  }

  const filtered=bets.filter(b=>{
    if(period==='all')return true
    const days=period==='7d'?7:period==='30d'?30:90
    return dayjs(b.bet_date).isAfter(dayjs().subtract(days,'day'))
  })
  const settled=filtered
  const wins=settled.filter(b=>b.result==='win')
  const losses=settled.filter(b=>b.result==='loss')
  const pushes=settled.filter(b=>b.result==='push')
  const winRate=settled.length>0?(wins.length/settled.length*100):0
  const totalStake=settled.reduce((s,b)=>s+b.stake,0)
  const totalProfit=settled.reduce((s,b)=>s+b.profit,0)
  const roi=totalStake>0?(totalProfit/totalStake*100):0
  const avgOdds=settled.length>0?(settled.reduce((s,b)=>s+b.odds,0)/settled.length):0

  const profitCurve=(()=>{let cum=0;return filtered.map(b=>{cum+=b.profit;return{date:b.bet_date,profit:cum}})})()

  const bySport=Object.entries(settled.reduce((acc,b)=>{
    if(!acc[b.sport])acc[b.sport]={wins:0,total:0,profit:0}
    acc[b.sport].total++;if(b.result==='win')acc[b.sport].wins++;acc[b.sport].profit+=b.profit;return acc
  },{} as Record<string,{wins:number;total:number;profit:number}>)).map(([sport,v])=>({
    label:SPORT_LABELS[sport as Sport]??sport,winRate:Math.round(v.wins/v.total*100),total:v.total,profit:v.profit
  })).sort((a,b)=>b.total-a.total)

  const byMarket=Object.entries(settled.reduce((acc,b)=>{
    if(!acc[b.market])acc[b.market]={wins:0,total:0,profit:0}
    acc[b.market].total++;if(b.result==='win')acc[b.market].wins++;acc[b.market].profit+=b.profit;return acc
  },{} as Record<string,{wins:number;total:number;profit:number}>)).map(([market,v])=>({
    label:MARKET_LABELS[market as Market]??market,winRate:Math.round(v.wins/v.total*100),total:v.total,profit:v.profit
  })).sort((a,b)=>b.total-a.total)

  const streak=(()=>{
    if(settled.length===0)return{count:0,type:''}
    const sorted=[...settled].sort((a,b)=>b.bet_date.localeCompare(a.bet_date))
    const first=sorted[0].result;let count=0
    for(const b of sorted){if(b.result===first)count++;else break}
    return{count,type:first}
  })()

  return(
    <div className="page">
      {/* 탭 헤더 */}
      <div className="flex-between mb-20">
        <h1 className="page-title">분석</h1>
        <div style={{display:'flex',gap:4}}>
          <button className={`btn btn-sm ${view==='stats'?'btn-primary':'btn-ghost'}`} onClick={()=>setView('stats')}>통계</button>
          <button className={`btn btn-sm ${view==='logs'?'btn-primary':'btn-ghost'}`} onClick={()=>setView('logs')}>
            로그 {logs.length>0&&<span style={{background:'rgba(255,255,255,0.2)',borderRadius:10,padding:'0 5px',fontSize:10}}>{logs.length}</span>}
          </button>
        </div>
      </div>

      {/* ── 통계 뷰 ── */}
      {view==='stats'&&(
        <>
          <div className="filter-bar mb-16">
            {(['all','7d','30d','90d'] as const).map(p=>(
              <button key={p} className={`filter-chip ${period===p?'active':''}`} onClick={()=>setPeriod(p)}>
                {p==='all'?'전체':p==='7d'?'7일':p==='30d'?'30일':'90일'}
              </button>
            ))}
          </div>

          {settled.length===0?(
            <div className="card"><div className="empty"><div className="empty-icon">📊</div>결과가 처리된 베팅이 없습니다</div></div>
          ):(
            <>
              <div className="grid-4 mb-16">
                <div className="card stat-tile">
                  <div className={`stat-value ${winRate>=50?'profit-pos':'profit-neg'}`}>{winRate.toFixed(1)}%</div>
                  <div className="stat-label">승률</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>{wins.length}W {losses.length}L {pushes.length}P</div>
                </div>
                <div className="card stat-tile">
                  <div className={`stat-value ${totalProfit>=0?'profit-pos':'profit-neg'}`}>
                    {totalProfit>=0?'+':''}{totalProfit.toLocaleString()}
                  </div>
                  <div className="stat-label">총 손익 (원)</div>
                </div>
                <div className="card stat-tile">
                  <div className={`stat-value ${roi>=0?'profit-pos':'profit-neg'}`}>{roi>=0?'+':''}{roi.toFixed(1)}%</div>
                  <div className="stat-label">ROI</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>총 {totalStake.toLocaleString()}원</div>
                </div>
                <div className="card stat-tile">
                  <div className="stat-value" style={{color:'var(--gold)'}}>{avgOdds.toFixed(2)}</div>
                  <div className="stat-label">평균 배당</div>
                  {streak.count>1&&(
                    <div style={{fontSize:10,marginTop:4}} className={streak.type==='win'?'profit-pos':'profit-neg'}>
                      {streak.type==='win'?'🔥':'❄️'} {streak.count}연속 {streak.type==='win'?'적중':'실패'}
                    </div>
                  )}
                </div>
              </div>

              <div className="card mb-16">
                <div className="card-title">누적 손익 곡선</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={profitCurve} margin={{top:4,right:4,left:4,bottom:4}}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={totalProfit>=0?'#00E87A':'#FF4D6D'} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={totalProfit>=0?'#00E87A':'#FF4D6D'} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--text-muted)'}} tickFormatter={d=>dayjs(d).format('MM/DD')}/>
                    <YAxis tick={{fontSize:10,fill:'var(--text-muted)'}} tickFormatter={v=>(v/1000).toFixed(0)+'K'}/>
                    <Tooltip contentStyle={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:6,fontSize:11}}
                      formatter={(v:number)=>[`${v.toLocaleString()}원`,'누적손익']}
                      labelFormatter={l=>dayjs(l).format('YYYY-MM-DD')}/>
                    <Area type="monotone" dataKey="profit"
                      stroke={totalProfit>=0?'#00E87A':'#FF4D6D'} strokeWidth={2} fill="url(#pg)"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid-2">
                {[{title:'종목별',data:bySport},{title:'마켓별',data:byMarket}].map(({title,data})=>(
                  <div key={title} className="card">
                    <div className="card-title">{title}</div>
                    <table style={{marginBottom:12}}>
                      <thead><tr><th>항목</th><th className="td-right">건수</th><th className="td-right">승률</th><th className="td-right">손익</th></tr></thead>
                      <tbody>
                        {data.map(r=>(
                          <tr key={r.label}>
                            <td style={{fontWeight:600}}>{r.label}</td>
                            <td className="td-right" style={{color:'var(--text-muted)'}}>{r.total}</td>
                            <td className="td-right"><span className={r.winRate>=50?'profit-pos':'profit-neg'}>{r.winRate}%</span></td>
                            <td className={`td-right td-mono ${r.profit>=0?'profit-pos':'profit-neg'}`}>
                              {r.profit>=0?'+':''}{r.profit.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={data} margin={{top:4,right:4,left:-20,bottom:4}}>
                        <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text-muted)'}}/>
                        <YAxis hide/>
                        <Tooltip contentStyle={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:6,fontSize:11}}
                          formatter={(v:number)=>[`${v}%`,'승률']}/>
                        <Bar dataKey="winRate" radius={[3,3,0,0]}>
                          {data.map((entry,i)=>(
                            <Cell key={i} fill={entry.winRate>=50?'#00E87A':'#FF4D6D'} fillOpacity={0.7}/>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── 로그 뷰 ── */}
      {view==='logs'&&(
        <div className="card">
          <div className="flex-between mb-12">
            <span className="card-title" style={{marginBottom:0}}>액션 로그 (최근 3일)</span>
            <span style={{fontSize:11,color:'var(--text-muted)'}}>되돌리기 가능</span>
          </div>
          {logs.length===0&&(
            <div className="empty"><div className="empty-icon">📋</div>로그가 없습니다</div>
          )}
          {logs.map(log=>(
            <div key={log.id} className="log-item">
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                <div>
                  <div className="log-desc">{log.description}</div>
                  <div className="log-time">{dayjs(log.created_at).format('MM/DD HH:mm:ss')} · {log.table_name} · {log.action_type}</div>
                </div>
                <button
                  className="btn btn-xs btn-ghost"
                  style={{flexShrink:0,color:'var(--gold)',borderColor:'var(--gold-border)',marginTop:2}}
                  disabled={undoing===log.id}
                  onClick={()=>undoAction(log)}>
                  <RotateCcw size={10}/>
                  {undoing===log.id?'처리중...':'되돌리기'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

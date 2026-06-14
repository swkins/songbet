import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/logger'
import type { Bet, Site, Sport, Market, BetResult } from '../types'
import dayjs from 'dayjs'
import { Plus, Trash2, Check, X } from 'lucide-react'

const SPORTS: { value: Sport; label: string }[] = [
  { value: 'soccer', label: '축구' },{ value: 'baseball', label: '야구' },
  { value: 'basketball', label: '농구' },{ value: 'volleyball', label: '배구' },
  { value: 'esports', label: 'e스포츠' },{ value: 'other', label: '기타' },
]
const MARKETS: { value: Market; label: string }[] = [
  { value: 'handicap', label: '핸디캡' },{ value: 'over_under', label: '오버/언더' },
  { value: 'moneyline', label: '승패' },{ value: 'correct_score', label: '정확한스코어' },
  { value: 'other', label: '기타' },
]
const sLabel=(s:Sport)=>SPORTS.find(x=>x.value===s)?.label??s
const mLabel=(m:Market)=>MARKETS.find(x=>x.value===m)?.label??m

interface SlipForm{match:string;sport:Sport;market:Market;pick:string;odds:string;stake:string}
const emptySlip=():SlipForm=>({match:'',sport:'soccer',market:'handicap',pick:'',odds:'',stake:''})

export default function Bets(){
  const[sites,setSites]=useState<Site[]>([])
  const[bets,setBets]=useState<Bet[]>([])
  const[activeSiteId,setActiveSiteId]=useState<string|null>(null)
  const[slipForm,setSlipForm]=useState<SlipForm>(emptySlip())
  const[showAddSite,setShowAddSite]=useState(false)
  const[newSiteName,setNewSiteName]=useState('')
  const[slipAmount,setSlipAmount]=useState('')
  const[resultTarget,setResultTarget]=useState<Bet|null>(null)
  const[resultValue,setResultValue]=useState<BetResult>('win')

  useEffect(()=>{loadSites();loadBets()},[])

  async function loadSites(){
    const{data}=await supabase.from('sites').select('*').order('sort_order')
    if(data){setSites(data);if(data.length>0&&!activeSiteId)setActiveSiteId(data[0].id)}
  }
  async function loadBets(){
    const{data}=await supabase.from('bets').select('*')
      .order('bet_date',{ascending:false}).order('created_at',{ascending:false})
    if(data)setBets(data)
  }

  const activeSite=sites.find(s=>s.id===activeSiteId)??null

  async function addSite(){
    if(!newSiteName.trim())return
    const{data}=await supabase.from('sites')
      .insert({name:newSiteName.trim(),balance:0,active:false,sort_order:sites.length,rolling_target:0,rolling_done:0})
      .select().single()
    if(data){
      await logAction({action_type:'insert',table_name:'sites',record_id:data.id,after_data:data,description:`사이트 추가: ${data.name}`})
      setSites(p=>[...p,data]);setActiveSiteId(data.id);setNewSiteName('');setShowAddSite(false)
    }
  }

  async function deleteSite(id:string){
    const site=sites.find(s=>s.id===id)
    if(!site||!confirm(`${site.name}를 삭제할까요?`))return
    await logAction({action_type:'delete',table_name:'sites',record_id:id,before_data:site as never,description:`사이트 삭제: ${site.name}`})
    await supabase.from('sites').delete().eq('id',id)
    setSites(p=>p.filter(s=>s.id!==id))
    if(activeSiteId===id)setActiveSiteId(sites.find(s=>s.id!==id)?.id??null)
  }

  async function doDeposit(){
    if(!activeSite||!slipAmount)return
    const amount=Number(slipAmount)
    const before={...activeSite}
    const{data}=await supabase.from('sites')
      .update({balance:activeSite.balance+amount,active:true}).eq('id',activeSite.id).select().single()
    if(data){
      await logAction({action_type:'update',table_name:'sites',record_id:data.id,before_data:before as never,after_data:data as never,description:`${activeSite.name} 입금 +${amount.toLocaleString()}원`})
      setSites(p=>p.map(s=>s.id===data.id?data:s));setSlipAmount('')
    }
  }

  async function doBet(){
    if(!activeSite||!slipForm.match||!slipForm.odds||!slipForm.stake)return
    const odds=Number(slipForm.odds);const stake=Number(slipForm.stake)
    if(stake>activeSite.balance){alert('잔액이 부족합니다');return}
    const{data:betData}=await supabase.from('bets').insert({
      bet_date:dayjs().format('YYYY-MM-DD'),
      sport:slipForm.sport,league:'',match:slipForm.match,
      market:slipForm.market,pick:slipForm.pick,
      odds,stake,result:'pending' as BetResult,profit:0,memo:'',site_id:activeSite.id,
    }).select().single()
    if(!betData)return
    const siteBefore={...activeSite}
    const newBal=activeSite.balance-stake
    const newRoll=activeSite.rolling_done+stake
    const{data:siteData}=await supabase.from('sites')
      .update({balance:newBal,rolling_done:newRoll}).eq('id',activeSite.id).select().single()
    if(siteData){
      await logAction({action_type:'insert',table_name:'bets',record_id:betData.id,after_data:betData as never,description:`[${activeSite.name}] 베팅: ${slipForm.match} / ${slipForm.pick} / ${stake.toLocaleString()}원`})
      await logAction({action_type:'update',table_name:'sites',record_id:siteData.id,before_data:siteBefore as never,after_data:siteData as never,description:`[${activeSite.name}] 잔액 -${stake.toLocaleString()}원`})
      setBets(p=>[betData,...p]);setSites(p=>p.map(s=>s.id===siteData.id?siteData:s))
      setSlipForm(emptySlip());setSlipAmount('')
    }
  }

  async function saveResult(){
    if(!resultTarget)return
    const{stake,odds,site_id}=resultTarget
    const profit=resultValue==='win'?Math.round(stake*(odds-1)):resultValue==='loss'?-stake:0
    const before={...resultTarget}
    const{data}=await supabase.from('bets').update({result:resultValue,profit}).eq('id',resultTarget.id).select().single()
    if(data){
      await logAction({action_type:'update',table_name:'bets',record_id:data.id,before_data:before as never,after_data:data as never,description:`결과처리: ${resultTarget.match} → ${resultValue==='win'?'적중':resultValue==='loss'?'실패':'적특'}`})
      setBets(p=>p.map(b=>b.id===resultTarget.id?data:b))
      const site=sites.find(s=>s.id===site_id)
      if(site){
        const delta=resultValue==='win'?stake+profit:resultValue==='push'?stake:0
        if(delta){
          const{data:sd}=await supabase.from('sites').update({balance:site.balance+delta}).eq('id',site.id).select().single()
          if(sd)setSites(p=>p.map(s=>s.id===site.id?sd:s))
        }
      }
    }
    setResultTarget(null)
  }

  async function deleteBet(bet:Bet){
    if(!confirm('삭제할까요?'))return
    await logAction({action_type:'delete',table_name:'bets',record_id:bet.id,before_data:bet as never,description:`베팅 삭제: ${bet.match}`})
    await supabase.from('bets').delete().eq('id',bet.id)
    setBets(p=>p.filter(b=>b.id!==bet.id))
  }

  const siteBets=(id:string)=>bets.filter(b=>b.site_id===id)
  const rollingPct=(s:Site)=>s.rolling_target>0?Math.min(100,Math.round(s.rolling_done/s.rolling_target*100)):0

  return(
    <div className="page">
      {/* ── 베팅 슬립 ── */}
      <div className="betslip mb-20">
        <div className="betslip-header">
          <div className="betslip-title">BET SLIP</div>
          <div className="betslip-sites">
            {sites.map(s=>(
              <button key={s.id}
                className={`betslip-site-tab ${activeSiteId===s.id?'active':''}`}
                onClick={()=>setActiveSiteId(s.id)}>
                {s.name}<span className="site-bal">{s.balance.toLocaleString()}원</span>
              </button>
            ))}
            <button className="betslip-add-site" onClick={()=>setShowAddSite(true)}>
              <Plus size={11}/>사이트
            </button>
          </div>
          {activeSite&&(
            <button className="btn btn-icon btn-danger btn-sm" style={{margin:'0 8px',flexShrink:0}}
              onClick={()=>deleteSite(activeSite.id)}>
              <X size={11}/>
            </button>
          )}
        </div>

        {activeSite?(
          <div className="betslip-body">
            {/* 베팅 폼 */}
            <div className="betslip-form">
              <div className="form-group">
                <label className="form-label">경기</label>
                <input className="form-input" placeholder="홈팀 vs 원정팀"
                  value={slipForm.match} onChange={e=>setSlipForm(p=>({...p,match:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">종목</label>
                <select className="form-select" value={slipForm.sport}
                  onChange={e=>setSlipForm(p=>({...p,sport:e.target.value as Sport}))}>
                  {SPORTS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">마켓</label>
                <select className="form-select" value={slipForm.market}
                  onChange={e=>setSlipForm(p=>({...p,market:e.target.value as Market}))}>
                  {MARKETS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">배당</label>
                <input className="form-input" type="number" step="0.01" placeholder="1.90"
                  value={slipForm.odds} onChange={e=>setSlipForm(p=>({...p,odds:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">베팅액</label>
                <input className="form-input" type="number" placeholder="10000"
                  value={slipForm.stake} onChange={e=>setSlipForm(p=>({...p,stake:e.target.value}))}/>
              </div>
            </div>

            {/* 액션 패널 */}
            <div className="betslip-actions">
              <div style={{padding:'0 0 10px',borderBottom:'1px solid var(--border-light)'}}>
                <div className="betslip-site-info">
                  <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:700,letterSpacing:'0.5px'}}>잔액</span>
                  <span className={`fw-7 ${activeSite.balance>=0?'profit-pos':'profit-neg'}`}
                    style={{fontFamily:'var(--font-mono)',fontSize:15}}>
                    {activeSite.balance.toLocaleString()}원
                  </span>
                </div>
                {activeSite.rolling_target>0&&(
                  <>
                    <div className="betslip-site-info mt-8">
                      <span style={{fontSize:10,color:'var(--text-muted)'}}>롤링</span>
                      <span style={{fontSize:11,color:'var(--gold)',fontFamily:'var(--font-mono)',fontWeight:600}}>
                        {rollingPct(activeSite)}%
                      </span>
                    </div>
                    <div className="rolling-bar">
                      <div className="rolling-fill" style={{width:`${rollingPct(activeSite)}%`}}/>
                    </div>
                  </>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">픽</label>
                <input className="form-input" placeholder="홈 -1.5, 언더 2.5..."
                  style={{fontSize:12}}
                  value={slipForm.pick} onChange={e=>setSlipForm(p=>({...p,pick:e.target.value}))}/>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <input className="form-input" type="number" placeholder="금액"
                  style={{fontSize:12}}
                  value={slipAmount} onChange={e=>setSlipAmount(e.target.value)}/>
                <button className="btn btn-green btn-sm" style={{flexShrink:0}} onClick={doDeposit}>입금</button>
                <button className="btn btn-primary btn-sm" style={{flexShrink:0}} onClick={doBet}>베팅</button>
              </div>
              <div style={{fontSize:10,color:'var(--text-muted)',lineHeight:1.4}}>
                입금: 잔액 충전 · 베팅: 위 슬립 내용으로 베팅 등록
              </div>
            </div>
          </div>
        ):(
          <div className="empty" style={{padding:'16px'}}>
            <span style={{fontSize:12,color:'var(--text-muted)'}}>+ 사이트를 추가하세요</span>
          </div>
        )}
      </div>

      {/* ── 사이트별 베팅 목록 ── */}
      {sites.map(site=>{
        const sb=siteBets(site.id)
        if(sb.length===0)return null
        return(
          <div key={site.id} className="site-section">
            <div className="site-section-header">
              <span className="site-section-name">{site.name}</span>
              <span style={{fontSize:11,color:'var(--text-muted)'}}>{sb.length}건</span>
              <span className={`${site.balance>=0?'profit-pos':'profit-neg'} fw-7`}
                style={{fontFamily:'var(--font-mono)',fontSize:13,marginLeft:'auto'}}>
                {site.balance.toLocaleString()}원
              </span>
            </div>
            <div className="site-section-table">
              <table>
                <thead><tr>
                  <th>날짜</th><th>경기</th><th>종목</th><th>마켓</th><th>픽</th>
                  <th className="td-right">배당</th><th className="td-right">베팅액</th>
                  <th className="td-right">손익</th><th>결과</th><th></th>
                </tr></thead>
                <tbody>
                  {sb.map(b=>(
                    <tr key={b.id}>
                      <td style={{color:'var(--text-muted)',whiteSpace:'nowrap',fontSize:11}}>{b.bet_date}</td>
                      <td style={{fontWeight:600}}>{b.match}</td>
                      <td style={{color:'var(--text-muted)'}}>{sLabel(b.sport)}</td>
                      <td style={{color:'var(--text-muted)'}}>{mLabel(b.market)}</td>
                      <td>{b.pick}</td>
                      <td className="td-right td-mono">{b.odds.toFixed(2)}</td>
                      <td className="td-right td-mono">{b.stake.toLocaleString()}</td>
                      <td className={`td-right td-mono ${b.profit>0?'profit-pos':b.profit<0?'profit-neg':'profit-zero'}`}>
                        {b.result==='pending'?'—':`${b.profit>=0?'+':''}${b.profit.toLocaleString()}`}
                      </td>
                      <td><span className={`badge badge-${b.result}`}>
                        {b.result==='pending'?'대기':b.result==='win'?'적중':b.result==='loss'?'실패':'적특'}
                      </span></td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          {b.result==='pending'&&(
                            <button className="btn btn-xs btn-ghost"
                              onClick={()=>{setResultTarget(b);setResultValue('win')}}>결과</button>
                          )}
                          <button className="btn btn-icon btn-danger btn-sm" onClick={()=>deleteBet(b)}>
                            <Trash2 size={10}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* 사이트 추가 모달 */}
      {showAddSite&&(
        <div className="modal-overlay" onClick={()=>setShowAddSite(false)}>
          <div className="modal" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">사이트 추가</div>
            <div className="form-group mb-16">
              <label className="form-label">사이트 이름</label>
              <input className="form-input" placeholder="예: 1xBet, EZBET"
                value={newSiteName} onChange={e=>setNewSiteName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addSite()} autoFocus/>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>setShowAddSite(false)}>취소</button>
              <button className="btn btn-primary" onClick={addSite}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 결과 처리 모달 */}
      {resultTarget&&(
        <div className="modal-overlay" onClick={()=>setResultTarget(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">결과 처리</div>
            <div style={{padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',marginBottom:16}}>
              <div style={{fontWeight:700,marginBottom:4}}>{resultTarget.match}</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-secondary)'}}>
                {resultTarget.pick} · {resultTarget.odds} · {resultTarget.stake.toLocaleString()}원
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {(['win','loss','push'] as const).map(r=>(
                <button key={r} className={`btn ${resultValue===r?'btn-primary':'btn-ghost'}`}
                  style={{flex:1}} onClick={()=>setResultValue(r)}>
                  {r==='win'?'✅ 적중':r==='loss'?'❌ 실패':'↩️ 적특'}
                </button>
              ))}
            </div>
            {resultValue==='win'&&<div style={{background:'var(--green-bg)',border:'1px solid var(--green-border)',padding:'10px 14px',borderRadius:'var(--radius-sm)',fontSize:13,marginBottom:14}}>수익: <strong className="profit-pos">+{Math.round(resultTarget.stake*(resultTarget.odds-1)).toLocaleString()}원</strong></div>}
            {resultValue==='loss'&&<div style={{background:'var(--red-bg)',border:'1px solid var(--red-border)',padding:'10px 14px',borderRadius:'var(--radius-sm)',fontSize:13,marginBottom:14}}>손실: <strong className="profit-neg">-{resultTarget.stake.toLocaleString()}원</strong></div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={()=>setResultTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={saveResult}><Check size={13}/> 확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

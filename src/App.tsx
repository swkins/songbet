import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from "recharts";
import * as db from "./lib/db";
import type { Bet, Deposit, Withdrawal, SiteState, Log, EsportsRecord, ProfitExtra, OddsGame, OddsSnapshot, OddsAlert } from "./types";

// ── 테마 컬러 (연한 오렌지 + 녹색) ─────────────────────────────
const C = {
  bg:      "#111614",   // 메인 배경 (짙은 그린-다크)
  bg2:     "#182018",   // 패널 배경
  bg3:     "#1e261e",   // 카드 배경
  border:  "#2a3a2a",   // 기본 보더
  border2: "#344534",   // 강조 보더
  text:    "#dde8dd",   // 기본 텍스트
  muted:   "#7a9a7a",   // 뮤트 텍스트
  dim:     "#3a5a3a",   // 어두운 텍스트
  green:   "#5ddb8a",   // 메인 그린
  orange:  "#f0944a",   // 메인 오렌지
  amber:   "#f5c842",   // 앰버 (강조)
  red:     "#e05a5a",   // 레드 (경고)
  purple:  "#b07af5",   // 퍼플 (보조)
  teal:    "#4ad4c8",   // 틸 (포인트)
};

// ── The Odds API ─────────────────────────────────────────────
const ODDS_API_KEY = (import.meta.env.VITE_ODDS_API_KEY as string) ?? "";
const ODDS_BASE    = "https://api.the-odds-api.com/v4";
const SPORT_KEY_MAP: Record<string, string> = {
  "프리미어리그": "soccer_epl",
  "라리가":       "soccer_spain_la_liga",
  "분데스리가":   "soccer_germany_bundesliga",
  "세리에A":      "soccer_italy_serie_a",
  "리그1":        "soccer_france_ligue_one",
  "챔피언스리그": "soccer_uefa_champs_league",
  "유로파리그":   "soccer_uefa_europa_league",
  "K리그":        "soccer_korea_kleague1",
  "NBA":          "basketball_nba",
  "MLB":          "baseball_mlb",
  "KBO":          "baseball_korea",
  "NPB":          "baseball_npb",
};


const oddsCache: Record<string,{data:OddsGame[];fetchedAt:number}> = {};
const oddsHistory: Record<string,OddsSnapshot[]> = {};
const CACHE_TTL = 10*60*1000;

async function fetchOddsForSport(sportKey:string, leagueName:string): Promise<OddsGame[]> {
  const now = Date.now();
  const cached = oddsCache[sportKey];
  if (cached && now - cached.fetchedAt < CACHE_TTL) return cached.data;
  try {
    const url = `${ODDS_BASE}/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw:any[] = await res.json();
    const games:OddsGame[] = raw.map((ev:any) => {
      const books = (ev.bookmakers||[]).map((b:any)=>{
        const h2h = b.markets?.find((m:any)=>m.key==="h2h");
        const homeOut = h2h?.outcomes?.find((o:any)=>o.name===ev.home_team);
        const awayOut = h2h?.outcomes?.find((o:any)=>o.name===ev.away_team);
        const drawOut = h2h?.outcomes?.find((o:any)=>o.name==="Draw");
        return {key:b.key,title:b.title,homeOdds:homeOut?.price??0,awayOdds:awayOut?.price??0,drawOdds:drawOut?.price};
      }).filter((b:any)=>b.homeOdds>0);
      const bestHome = books.length?Math.max(...books.map((b:any)=>b.homeOdds)):0;
      const bestAway = books.length?Math.max(...books.map((b:any)=>b.awayOdds)):0;
      const dv = books.filter((b:any)=>b.drawOdds).map((b:any)=>b.drawOdds!);
      const bestDraw = dv.length?Math.max(...dv):undefined;
      return {id:ev.id,sport:sportKey,leagueName,commence:ev.commence_time,home:ev.home_team,away:ev.away_team,bookmakers:books,bestHome,bestAway,bestDraw};
    });
    games.forEach(g=>{
      if (!oddsHistory[g.id]) oddsHistory[g.id]=[];
      const arr=oddsHistory[g.id];const last=arr[arr.length-1];
      if (!last||last.home!==g.bestHome||last.away!==g.bestAway) {
        oddsHistory[g.id].push({ts:now,home:g.bestHome,away:g.bestAway,draw:g.bestDraw});
        if (oddsHistory[g.id].length>20) oddsHistory[g.id].shift();
      }
    });
    oddsCache[sportKey]={data:games,fetchedAt:now};
    return games;
  } catch(e) { return cached?.data??[]; }
}
function classifyAlert(hist:OddsSnapshot[],side:"home"|"away"):OddsAlert {
  if (hist.length<2) return null;
  const vals = hist.map(h=>h[side]);
  const last=vals[vals.length-1], prev=vals[vals.length-2], diff=last-prev;
  if (diff>=0) return null;
  if (Math.abs(diff)/prev>=0.05) return "급락";
  if (vals.length>=3&&vals[vals.length-2]<vals[vals.length-3]) return "연속하락";
  return "하락";
}

// ── 날짜 유틸 ──────────────────────────────────────────────────
const useTodayStr = () => {
  const [today, setToday] = useState(()=>new Date().toISOString().slice(0,10));
  useEffect(()=>{const id=setInterval(()=>{const n=new Date().toISOString().slice(0,10);setToday(p=>p!==n?n:p);},60000);return()=>clearInterval(id);},[]);
  return today;
};
const weekMonday = () => { const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day; d.setDate(d.getDate()+diff); return d.toISOString().slice(0,10); };

// ── 사이트 상수 ────────────────────────────────────────────────
const KRW_SITES = ["이지벳","조인벳","벨라벳"];
const USD_SITES = ["벳38","케이탑","벳16","고트벳","벳위즈"];
const ALL_SITES = [...KRW_SITES,...USD_SITES];
const isUSD = (s:string) => USD_SITES.includes(s);

const fmtDisp = (n:number,dollar:boolean) => dollar?`$${n%1===0?n:n.toFixed(2)}`:n.toLocaleString();
const fmtProfit = (n:number,dollar:boolean) => { const abs=Math.abs(n); const str=dollar?`$${abs%1===0?abs:abs.toFixed(2)}`:abs.toLocaleString(); return n>=0?`+${str}`:`-${str}`; };

const MAJOR:Record<string,string[]> = {
  축구:["프리미어리그","라리가","분데스리가","세리에A","리그1","챔피언스리그"],
  농구:["NBA","KBL"], 야구:["MLB","KBO","NPB"], 배구:["V리그 남자","V리그 여자"], E스포츠:["LCK","LPL","LEC","LCS","LCP","CBLOL"],
};
const EXTRA:Record<string,string[]> = {
  축구:["K리그","유로파리그","유로파컨퍼런스리그","UEFA 네이션스리그"].sort(),
  농구:["NCAA","유로리그"].sort(), 야구:[], 배구:["이탈리아 세리에A","일본 V리그"].sort(),
  E스포츠:["MSI","롤드컵","발로란트 챔피언스","오버워치 리그"].sort(),
};

const getOptGroups = (cat:string) => {
  if(cat==="축구") return [{g:"홈",opts:["홈 0.5","홈 1.5","홈 2.5"]},{g:"원정",opts:["원정 0.5","원정 1.5","원정 2.5"]}];
  if(cat==="야구") return [{g:"승패",opts:["정배","역배"]},{g:"오버",opts:Array.from({length:9},(_,i)=>`${4.5+i} 오버`)},{g:"언더",opts:Array.from({length:9},(_,i)=>`${4.5+i} 언더`)}];
  if(cat==="농구") return [{g:"플핸",opts:Array.from({length:25},(_,i)=>`${5.5+i} 플핸`)},{g:"마핸",opts:Array.from({length:54},(_,i)=>`${(2.5+i).toFixed(1)} 마핸`)}];
  if(cat==="배구") return [{g:"승패",opts:["홈 승","원정 승"]},{g:"오버/언더",opts:["오버","언더"]}];
  return [];
};
const getDefaultGroup = (cat:string) => cat==="축구"?"홈":cat==="농구"?"플핸":cat==="야구"?"승패":"";
const getDefaultOpt = (cat:string,g:string,league="") => {
  if(cat==="축구"&&g==="홈") return "홈 0.5";
  if(cat==="축구"&&g==="원정") return "원정 0.5";
  if(cat==="야구"&&g==="승패") return "역배";
  if(cat==="야구"&&g==="오버") return ({MLB:"8.5 오버",KBO:"9.5 오버",NPB:"5.5 오버"} as any)[league]||"8.5 오버";
  if(cat==="야구"&&g==="언더") return ({MLB:"8.5 언더",KBO:"9.5 언더",NPB:"5.5 언더"} as any)[league]||"8.5 언더";
  return "";
};

const TEAM_DB = ["뉴욕 양키스","LA 다저스","보스턴 레드삭스","시카고 컵스","샌프란시스코 자이언츠","휴스턴 애스트로스","애틀란타 브레이브스","뉴욕 메츠","필라델피아 필리스","샌디에이고 파드리스","시애틀 매리너스","토론토 블루제이스","미네소타 트윈스","클리블랜드 가디언스","텍사스 레인저스","탬파베이 레이스","볼티모어 오리올스","밀워키 브루어스","애리조나 다이아몬드백스","LA 에인절스","오클랜드 애슬레틱스","콜로라도 로키스","캔자스시티 로열스","피츠버그 파이리츠","신시내티 레즈","마이애미 말린스","워싱턴 내셔널스","디트로이트 타이거스","시카고 화이트삭스","세인트루이스 카디널스","LA 레이커스","골든스테이트 워리어스","보스턴 셀틱스","마이애미 히트","시카고 불스","브루클린 네츠","밀워키 벅스","피닉스 선즈","댈러스 매버릭스","덴버 너기츠","멤피스 그리즐리스","필라델피아 세븐티식서스","애틀란타 호크스","클리블랜드 캐벌리어스","뉴욕 닉스","토론토 랩터스","새크라멘토 킹스","뉴올리언스 펠리컨스","인디애나 페이서스","미네소타 팀버울브스","오클라호마시티 선더","포틀랜드 트레일블레이저스","유타 재즈","샌안토니오 스퍼스","샬럿 호네츠","워싱턴 위저즈","올랜도 매직","디트로이트 피스톤스","휴스턴 로케츠","LA 클리퍼스","맨체스터 시티","아스날","리버풀","첼시","맨체스터 유나이티드","토트넘","레알 마드리드","바르셀로나","아틀레티코 마드리드","바이에른 뮌헨","도르트문트","인테르 밀란","AC 밀란","유벤투스","파리 생제르맹","T1","Gen.G","DK","KT","BRO","NS","DRX","HLE","FNC","G2","C9","TL","NRG","100T","EG","FLY","BLG","JDG","EDG","WBG"];

const CATS = ["축구","농구","야구","배구","E스포츠"];
const USD_TO_KRW = 1380; // fallback

const noSpin:React.CSSProperties = {MozAppearance:"textfield"} as any;
const S:React.CSSProperties = {width:"100%",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 9px",borderRadius:7,fontSize:13,...noSpin};
const L:React.CSSProperties = {fontSize:11,color:C.muted,marginBottom:3};

// ── 공통 컴포넌트 ──────────────────────────────────────────────
function EditableCell({value,dollar,onSave,color}:{value:number,dollar:boolean,onSave:(v:number)=>void,color?:string}) {
  const [editing,setEditing]=useState(false); const [tmp,setTmp]=useState("");
  if(!editing) return <div onClick={()=>{setTmp(String(value));setEditing(true);}} style={{color:color??C.text,fontWeight:700,cursor:"pointer",textDecoration:"underline dotted",textDecorationColor:C.dim}}>{fmtDisp(value,dollar)}</div>;
  return <input autoFocus type="number" value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={()=>{const v=parseFloat(tmp);if(!isNaN(v)&&v>=0)onSave(v);setEditing(false);}} onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(tmp);if(!isNaN(v)&&v>=0)onSave(v);setEditing(false);}if(e.key==="Escape")setEditing(false);}} style={{width:"80px",background:C.bg,border:`1px solid ${C.teal}`,color:C.teal,padding:"2px 4px",borderRadius:4,fontSize:12,fontWeight:700,...noSpin}} onClick={e=>e.stopPropagation()} />;
}

function TeamInput({value,onChange,placeholder}:{value:string,onChange:(v:string)=>void,placeholder?:string}) {
  const [show,setShow]=useState(false);
  const sug = value.length>=1?TEAM_DB.filter(t=>t.includes(value)&&t!==value).slice(0,6):[];
  return (
    <div style={{position:"relative"}}>
      <input value={value} onChange={e=>{onChange(e.target.value);setShow(true);}} onBlur={()=>setTimeout(()=>setShow(false),150)} onFocus={()=>setShow(true)} placeholder={placeholder} style={{...S,boxSizing:"border-box"}}/>
      {show&&sug.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.bg3,border:`1px solid ${C.purple}44`,borderRadius:7,zIndex:99,overflow:"hidden"}}>
          {sug.map(t=><div key={t} onMouseDown={()=>{onChange(t);setShow(false);}} style={{padding:"6px 10px",fontSize:12,color:C.text,cursor:"pointer",borderBottom:`1px solid ${C.border}`}} onMouseEnter={e=>e.currentTarget.style.background=`${C.purple}22`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{t}</div>)}
        </div>
      )}
    </div>
  );
}

// ── 인터페이스 ──────────────────────────────────────────────────










// ── 실시간 환율 fetch ──────────────────────────────────────────
async function fetchUsdKrw():Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    return Math.round(d?.rates?.KRW??1380);
  } catch { return 1380; }
}

export default function App() {
  const today = useTodayStr();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab,setTab]=useState<"betting"|"stats"|"roi"|"odds"|"strategy"|"log">("betting");
  const [statTab,setStatTab]=useState<"overview"|"daily"|"baseball"|"adv">("overview");
  const [bbSub,setBbSub]=useState<"league"|"option">("league");
  const [advCat,setAdvCat]=useState("축구");
  const [advMode,setAdvMode]=useState<"league"|"option">("league");
  const [showOldDone,setShowOldDone]=useState(false);
  const [stratCat,setStratCat]=useState("축구");
  const [esportsStratLeague,setEsportsStratLeague]=useState("LCK");

  // 배당 탭
  const [oddsGames,setOddsGames]=useState<OddsGame[]>([]);
  const [oddsLoading,setOddsLoading]=useState(false);
  const [oddsError,setOddsError]=useState("");
  const [oddsFilter,setOddsFilter]=useState<"전체"|"하락"|"연속하락"|"급락">("전체");
  const [oddsCatFilter,setOddsCatFilter]=useState("전체");
  const [oddsLastFetch,setOddsLastFetch]=useState(0);
  const [oddsRemaining,setOddsRemaining]=useState<number|null>(null);
  const [activeOddsLeagues,setActiveOddsLeagues]=useState<string[]>(()=>{try{const v=localStorage.getItem("btv12_oddsLeagues");return v?JSON.parse(v):Object.keys(SPORT_KEY_MAP).slice(0,5);}catch{return Object.keys(SPORT_KEY_MAP).slice(0,5);}});
  const [,setOddsTick]=useState(0);

  // 실시간 환율
  const [usdKrw,setUsdKrw]=useState(USD_TO_KRW);
  useEffect(()=>{fetchUsdKrw().then(setUsdKrw);},[]);

  // ── Supabase 데이터 상태 ─────────────────────────────────────
  const [dbReady, setDbReady] = useState(false);
  const [bets,setBetsRaw]=useState<Bet[]>([]);
  const [deposits,setDepositsRaw]=useState<Deposit[]>([]);
  const [withdrawals,setWithdrawalsRaw]=useState<Withdrawal[]>([]);
  const [siteStates,setSiteStatesRaw]=useState<Record<string,SiteState>>(
    Object.fromEntries(ALL_SITES.map(s=>[s,{deposited:0,betTotal:0,active:false,isDollar:isUSD(s)}]))
  );
  const [customLeagues,setCustomLeaguesRaw]=useState<Record<string,string[]>>({});
  const [esportsRecords,setEsportsRecordsRaw]=useState<EsportsRecord[]>([]);
  const [profitExtras,setProfitExtrasRaw]=useState<ProfitExtra[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);

  // ── 앱 시작 시 Supabase에서 전체 데이터 로드 ─────────────────
  useEffect(()=>{
    (async()=>{
      const [b,dep,wth,ss,cl,er,pe] = await Promise.all([
        db.loadBets(),
        db.loadDeposits(),
        db.loadWithdrawals(),
        db.loadSiteStates(ALL_SITES, isUSD),
        db.loadCustomLeagues(),
        db.loadEsportsRecords(),
        db.loadProfitExtras(),
      ]);
      setBetsRaw(b);
      setDepositsRaw(dep);
      setWithdrawalsRaw(wth);
      setSiteStatesRaw(ss);
      setCustomLeaguesRaw(cl);
      setEsportsRecordsRaw(er);
      setProfitExtrasRaw(pe);
      setDbReady(true);
    })();
  },[]);

  const addLog=(type:string,desc:string)=>setLogs(p=>[{id:String(Date.now()),ts:new Date().toLocaleString("ko-KR"),type,desc},...p].slice(0,200));

  // ── JSON 백업 / 복구 (Supabase가 있어도 비상용으로 유지) ──────
  const exportData = () => {
    const data={exportedAt:new Date().toISOString(),bets,deposits,withdrawals,siteStates,customLeagues,esportsRecords,profitExtras};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`bettracker_${today}.json`;a.click();URL.revokeObjectURL(url);
    addLog("📤 백업",today);
  };
  const importData=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const data=JSON.parse(ev.target?.result as string);
        if(data.bets){
          for(const b of data.bets) await db.upsertBet(b);
          setBetsRaw(data.bets);
        }
        if(data.deposits){
          for(const d of data.deposits) await db.insertDeposit(d).catch(()=>{});
          setDepositsRaw(data.deposits);
        }
        if(data.withdrawals){
          for(const w of data.withdrawals) await db.insertWithdrawal(w).catch(()=>{});
          setWithdrawalsRaw(data.withdrawals);
        }
        if(data.siteStates){
          for(const [site,st] of Object.entries(data.siteStates as Record<string,SiteState>))
            await db.upsertSiteState(site,st);
          setSiteStatesRaw(data.siteStates);
        }
        if(data.customLeagues) setCustomLeaguesRaw(data.customLeagues);
        if(data.esportsRecords){
          for(const r of data.esportsRecords) await db.insertEsportsRecord(r).catch(()=>{});
          setEsportsRecordsRaw(data.esportsRecords);
        }
        if(data.profitExtras){
          for(const p of data.profitExtras) await db.insertProfitExtra(p).catch(()=>{});
          setProfitExtrasRaw(data.profitExtras);
        }
        alert("불러오기 완료 (Supabase에 저장됨)!");addLog("📥 복구","완료");
      }catch{alert("파일 오류");}
    };
    reader.readAsText(file);e.target.value="";
  };

  // ── 배당 fetch ────────────────────────────────────────────────
  const fetchAllOdds=useCallback(async(leagues?:string[])=>{
    const targets=leagues??activeOddsLeagues;
    if(!targets.length)return;
    setOddsLoading(true);setOddsError("");
    try{
      const results:OddsGame[]=[];
      for(const league of targets){const key=SPORT_KEY_MAP[league];if(!key)continue;results.push(...await fetchOddsForSport(key,league));}
      results.sort((a,b)=>new Date(a.commence).getTime()-new Date(b.commence).getTime());
      setOddsGames(results);setOddsLastFetch(Date.now());setOddsTick(t=>t+1);
      try{const r=await fetch(`${ODDS_BASE}/sports/?apiKey=${ODDS_API_KEY}`);const rem=r.headers.get("x-requests-remaining");if(rem)setOddsRemaining(parseInt(rem));}catch{}
    }catch(e:any){setOddsError(String(e?.message??e));}finally{setOddsLoading(false);}
  },[activeOddsLeagues]);

  useEffect(()=>{
    if(tab!=="odds")return;
    if(Date.now()-oddsLastFetch>CACHE_TTL)fetchAllOdds();
    const id=setInterval(()=>fetchAllOdds(),CACHE_TTL);
    return()=>clearInterval(id);
  },[tab,fetchAllOdds]);

  // ── 리그 ──────────────────────────────────────────────────────
  const getLeagues=(cat:string)=>{
    const major=MAJOR[cat]||[],extra=EXTRA[cat]||[];
    const custom=(customLeagues[cat]||[]).filter(l=>![...major,...extra].includes(l)).sort((a,b)=>a.localeCompare(b,"ko"));
    return{major,others:[...extra,...custom].sort((a,b)=>a.localeCompare(b,"ko"))};
  };
  const allLeagues=(cat:string)=>{const{major,others}=getLeagues(cat);return[...major,...others];};

  // ── 모달 상태 ─────────────────────────────────────────────────
  const [addLeagueModal,setAddLeagueModal]=useState<{cat:string}|null>(null);
  const [editLeagueModal,setEditLeagueModal]=useState<{cat:string;old:string;idx:number}|null>(null);
  const [newLeagueName,setNewLeagueName]=useState("");
  const [editLeagueName,setEditLeagueName]=useState("");
  const [closeModal,setCloseModal]=useState<{site:string}|null>(null);
  const [closeWithdrawAmt,setCloseWithdrawAmt]=useState(0);
  const [deleteModal,setDeleteModal]=useState<{betId:string}|null>(null);
  const leagueInputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(addLeagueModal&&leagueInputRef.current)setTimeout(()=>leagueInputRef.current?.focus(),50);},[addLeagueModal]);

  // ── 입금 폼 ──────────────────────────────────────────────────
  const [depSite,setDepSite]=useState("");
  const depIsDollar=depSite?isUSD(depSite):false;
  const [depAmt,setDepAmt]=useState(0);

  // ── 베팅 폼 ──────────────────────────────────────────────────
  const [esportsCustomOpt,setEsportsCustomOpt]=useState("");
  const [esportsCustomLeagueInForm,setEsportsCustomLeagueInForm]=useState("");
  const activeSiteNames=ALL_SITES.filter(s=>siteStates[s]?.active);
  const makeForm=()=>({date:today,category:"야구",league:"MLB",site:"",homeTeam:"",awayTeam:"",teamName:"",amount:10000,oddsRaw:"",optGroup:"승패",betOption:"역배",includeStats:true});
  const [form,setForm]=useState(makeForm);
  const formIsDollar=isUSD(form.site);
  const isOverUnder=(opt:string)=>opt.includes("오버")||opt.includes("언더");
  const {major:fMajor,others:fOthers}=getLeagues(form.category);

  // ── E스포츠 기록 ──────────────────────────────────────────────
  const [esRec,setEsRec]=useState({league:"LCK",date:today,teamA:"",teamB:"",scoreA:0,scoreB:0});

  // ── 수익률 기타 ───────────────────────────────────────────────
  const [pextForm,setPextForm]=useState({category:"",subCategory:"",amount:0,note:"",isIncome:true});

  // ── 리그 핸들러 ───────────────────────────────────────────────
  const handleAddLeague=()=>{
    const name=newLeagueName.trim();if(!name||!addLeagueModal)return;
    setCustomLeaguesRaw(p=>({...p,[addLeagueModal.cat]:[...(p[addLeagueModal.cat]||[]),name]}));
    db.insertCustomLeague(addLeagueModal.cat,name);
    if(addLeagueModal.cat===form.category){const dg=getDefaultGroup(form.category);setForm(f=>({...f,league:name,optGroup:dg,betOption:getDefaultOpt(form.category,dg,name)}));}
    setNewLeagueName("");setAddLeagueModal(null);addLog("➕ 리그 추가",`${addLeagueModal.cat}/${name}`);
  };
  const handleEditLeague=()=>{
    const name=editLeagueName.trim();if(!name||!editLeagueModal)return;
    setCustomLeaguesRaw(p=>{const arr=[...(p[editLeagueModal.cat]||[])];arr[editLeagueModal.idx]=name;return{...p,[editLeagueModal.cat]:arr};});
    db.updateCustomLeague(editLeagueModal.cat,editLeagueModal.old,name);
    if(form.league===editLeagueModal.old)setForm(f=>({...f,league:name}));
    setEditLeagueModal(null);setEditLeagueName("");
  };
  const handleCatChange=(cat:string)=>{const lg=allLeagues(cat)[0]||"";const dg=getDefaultGroup(cat);setForm(f=>({...f,category:cat,league:lg,optGroup:dg,betOption:getDefaultOpt(cat,dg,lg)}));};
  const handleGroupChange=(g:string)=>{setForm(f=>({...f,optGroup:g,betOption:getDefaultOpt(f.category,g,f.league)}));};
  const handleLeagueChange=(lg:string)=>{setForm(f=>({...f,league:lg,betOption:getDefaultOpt(f.category,f.optGroup,lg)}));};
  const handleSiteChange=(s:string)=>{setForm(f=>({...f,site:s,amount:isUSD(s)?7:10000}));};
  const getOdds=()=>{const s=form.oddsRaw;if(!s||s.length<3)return null;return parseFloat((parseInt(s)/100).toFixed(2));};

  // ── 베팅 추가 ─────────────────────────────────────────────────
  const handleAdd=()=>{
    const o=getOdds();if(!o)return alert("배당률을 3자리 입력해주세요.");
    if(!form.site)return alert("베팅사이트를 선택해주세요.");
    let finalOpt=form.betOption;
    if(form.category==="E스포츠"&&form.betOption==="직접입력"){if(!esportsCustomOpt.trim())return alert("옵션을 입력해주세요.");finalOpt=esportsCustomOpt.trim();}
    if(!finalOpt)return alert("베팅 옵션을 선택해주세요.");
    const dollar=isUSD(form.site);
    let homeTeam="",awayTeam="",teamName="";
    if(isOverUnder(form.betOption)){homeTeam=form.homeTeam||"";awayTeam=form.awayTeam||"";}
    else{teamName=form.teamName||"";}
    const titleParts=isOverUnder(form.betOption)?[homeTeam,awayTeam].filter(Boolean).join(" vs "):teamName;
    if(!titleParts)return alert("팀 이름을 입력해주세요.");
    const bet:Bet={id:String(Date.now()),date:form.date,category:form.category,league:form.league,site:form.site,betOption:finalOpt,homeTeam,awayTeam,teamName,amount:form.amount,odds:o,profit:null,result:"진행중",includeStats:true,isDollar:dollar};
    setBetsRaw(b=>{const n=[...b,bet];return n;});
    db.upsertBet(bet);
    const newSS={...siteStates,[form.site]:{...siteStates[form.site],betTotal:parseFloat((siteStates[form.site].betTotal+form.amount).toFixed(2))}};
    setSiteStatesRaw(newSS);
    db.upsertSiteState(form.site,newSS[form.site]);
    addLog("➕ 베팅",`${titleParts}/${finalOpt}/${fmtDisp(form.amount,dollar)}/배당${o}`);
    const dg=getDefaultGroup(form.category);
    setForm(f=>({...f,site:"",homeTeam:"",awayTeam:"",teamName:"",oddsRaw:"",optGroup:dg,betOption:getDefaultOpt(f.category,dg,f.league),amount:10000,includeStats:true}));
    setEsportsCustomOpt("");
  };

  const cancelBet=(id:string)=>{
    if(!window.confirm("베팅을 취소하시겠습니까?"))return;
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    setBetsRaw(b=>b.filter(x=>x.id!==id));
    db.deleteBet(id);
    const newSS2={...siteStates,[bet.site]:{...siteStates[bet.site],betTotal:parseFloat(Math.max(0,siteStates[bet.site].betTotal-bet.amount).toFixed(2))}};
    setSiteStatesRaw(newSS2);
    db.upsertSiteState(bet.site,newSS2[bet.site]);
    addLog("🚫 취소",bet.homeTeam||bet.teamName||id);
  };

  const handleDeposit=()=>{
    if(!depSite)return alert("사이트를 선택해주세요.");
    if(depAmt<=0)return;
    const newDep={id:String(Date.now()),site:depSite,amount:depAmt,date:today,isDollar:depIsDollar};
    setDepositsRaw(d=>[...d,newDep]);
    db.insertDeposit(newDep);
    const newSS3={...siteStates,[depSite]:{...siteStates[depSite],deposited:parseFloat((siteStates[depSite].deposited+depAmt).toFixed(2)),active:true,isDollar:depIsDollar}};
    setSiteStatesRaw(newSS3);
    db.upsertSiteState(depSite,newSS3[depSite]);
    addLog("💵 입금",`${depSite}/${fmtDisp(depAmt,depIsDollar)}`);
    setDepSite("");setDepAmt(0);
  };

  const handleClose=(site:string)=>{setCloseWithdrawAmt(0);setCloseModal({site});};
  const confirmClose=()=>{
    if(!closeModal)return;const site=closeModal.site;
    if(closeWithdrawAmt>0){
      const dollar=isUSD(site);
      const newWth={id:String(Date.now()),site,amount:closeWithdrawAmt,date:today,isDollar:dollar};
      setWithdrawalsRaw(w=>[...w,newWth]);
      db.insertWithdrawal(newWth);
    }
    const closedSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false}};
    setSiteStatesRaw(closedSS);
    db.upsertSiteState(site,closedSS[site]);
    addLog("🔒 마감",`${site}/출금${fmtDisp(closeWithdrawAmt,isUSD(site))}`);
    setCloseModal(null);
  };
  const cancelSite=(site:string)=>{
    if(!window.confirm(`${site} 취소? 입금 금액도 삭제됩니다.`))return;
    const cancelledSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false}};
    setSiteStatesRaw(cancelledSS);
    db.upsertSiteState(site,cancelledSS[site]);
    setDepositsRaw(d=>d.filter(dep=>dep.site!==site));
    db.deleteDepositsBySite(site);
    addLog("❌ 사이트 취소",site);
  };
  const updateResult=(id:string,result:string)=>{
    setBetsRaw(b=>b.map(bet=>{
      if(bet.id!==id)return bet;
      const profit=result==="승"?parseFloat((bet.amount*bet.odds-bet.amount).toFixed(2)):result==="패"?-bet.amount:0;
      const updated={...bet,result,profit};
      db.upsertBet(updated);
      addLog(result==="승"?"✅ 적중":"❌ 실패",bet.homeTeam||bet.teamName||"");
      return updated;
    }));
  };
  const revertToPending=(id:string)=>{
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    const reverted={...bet,result:"진행중",profit:null};
    setBetsRaw(b=>b.map(x=>x.id===id?reverted:x));
    db.upsertBet(reverted);
    const revertSS={...siteStates,[bet.site]:{...siteStates[bet.site],betTotal:parseFloat((siteStates[bet.site].betTotal+bet.amount).toFixed(2))}};
    setSiteStatesRaw(revertSS);
    db.upsertSiteState(bet.site,revertSS[bet.site]);
    addLog("🔄 복귀",bet.homeTeam||bet.teamName||id);
  };
  const deleteFromStats=(id:string)=>{
    setBetsRaw(b=>b.map(bet=>{if(bet.id!==id)return bet;const u={...bet,includeStats:false};db.upsertBet(u);return u;}));
    addLog("🗑 통계삭제","");
  };
  const deleteForever=(id:string)=>{
    setBetsRaw(b=>b.filter(x=>x.id!==id));
    db.deleteBet(id);
    addLog("💥 영구삭제","");
  };
  const handleDeleteChoice=(choice:"stats"|"forever")=>{if(!deleteModal)return;choice==="stats"?deleteFromStats(deleteModal.betId):deleteForever(deleteModal.betId);setDeleteModal(null);};

  // ── 통계 계산 ─────────────────────────────────────────────────
  const weekDeposits=useMemo(()=>{
    const wm=weekMonday(),m:Record<string,number>=Object.fromEntries(ALL_SITES.map(s=>[s,0]));
    deposits.filter(d=>d.date>=wm).forEach(d=>{m[d.site]+=d.amount;});return m;
  },[deposits]);

  // 이번주 입금 원화환산 차트 데이터
  const weekDepChartData=useMemo(()=>{
    return ALL_SITES.map(site=>{
      const amt=weekDeposits[site]||0;
      if(amt===0)return null;
      const krwAmt=isUSD(site)?amt*usdKrw:amt;
      return{site,amt,krwAmt,isDollar:isUSD(site)};
    }).filter(Boolean) as {site:string,amt:number,krwAmt:number,isDollar:boolean}[];
  },[weekDeposits,usdKrw]);

  const pending=bets.filter(b=>b.result==="진행중");
  const done=bets.filter(b=>b.result!=="진행중"&&b.includeStats!==false);
  const doneFull=bets.filter(b=>b.result!=="진행중");
  const doneTodayFull=doneFull.filter(b=>b.date===today);
  const doneOldFull=doneFull.filter(b=>b.date!==today);
  const krwProfit=done.filter(b=>!b.isDollar).reduce((s,b)=>s+(b.profit??0),0);
  const usdProfit=done.filter(b=>b.isDollar).reduce((s,b)=>s+(b.profit??0),0);
  const wins=done.filter(b=>b.result==="승").length;
  const winRate=done.length>0?Math.round(wins/done.length*100):0;
  const avgOdds=done.length>0?(done.reduce((s,b)=>s+b.odds,0)/done.length).toFixed(2):"0";

  const dailyStats=useMemo(()=>{
    const m:Record<string,{profit:number,count:number,wins:number,bet:number}>={};
    done.filter(b=>!b.isDollar).forEach(b=>{if(!m[b.date])m[b.date]={profit:0,count:0,wins:0,bet:0};m[b.date].profit+=b.profit??0;m[b.date].count++;m[b.date].bet+=b.amount;if(b.result==="승")m[b.date].wins++;});
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date:date.slice(5),fullDate:date,...v,winRate:Math.round(v.wins/v.count*100),roi:v.bet>0?((v.profit/v.bet)*100).toFixed(1):"0"}));
  },[done]);
  const cumCurve=useMemo(()=>{let c=0;return dailyStats.map(d=>{c+=d.profit;return{date:d.date,cumProfit:c};});},[dailyStats]);
  const {maxW,maxL,curS}=useMemo(()=>{
    const sorted=[...done].sort((a,b)=>a.date.localeCompare(b.date));
    let mW=0,mL=0,cW=0,cL=0;
    sorted.forEach(b=>{if(b.result==="승"){cW++;cL=0;mW=Math.max(mW,cW);}else if(b.result==="패"){cL++;cW=0;mL=Math.max(mL,cL);}});
    const lr=sorted.length?sorted[sorted.length-1].result:"";
    return{maxW:mW,maxL:mL,curS:lr==="승"?`${cW}연승`:lr==="패"?`${cL}연패`:"—"};
  },[done]);
  const baseballDone=done.filter(b=>b.category==="야구");
  const bbLeagueStats=useMemo(()=>[...new Set(baseballDone.map(b=>b.league))].map(league=>({league,data:["역배","오버","언더"].map(opt=>{const bs=baseballDone.filter(b=>b.league===league&&(opt==="역배"?b.betOption==="역배":opt==="오버"?b.betOption.includes("오버"):b.betOption.includes("언더")));const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{opt,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})})),[baseballDone]);
  const bbOptStats=useMemo(()=>["역배","오버","언더"].map(opt=>({opt,data:[...new Set(baseballDone.filter(b=>opt==="역배"?b.betOption==="역배":opt==="오버"?b.betOption.includes("오버"):b.betOption.includes("언더")).map(b=>b.league))].map(league=>{const bs=baseballDone.filter(b=>b.league===league&&(opt==="역배"?b.betOption==="역배":opt==="오버"?b.betOption.includes("오버"):b.betOption.includes("언더")));const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{league,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})})),[baseballDone]);
  const advStats=useMemo(()=>{
    const catDone=done.filter(b=>b.category===advCat);
    if(advMode==="league")return[...new Set(catDone.map(b=>b.league))].map(league=>({key:league,subs:[...new Set(catDone.filter(b=>b.league===league).map(b=>b.betOption))].map(opt=>{const bs=catDone.filter(b=>b.league===league&&b.betOption===opt);const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{name:opt,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})}));
    return[...new Set(catDone.map(b=>b.betOption))].map(opt=>({key:opt,subs:[...new Set(catDone.filter(b=>b.betOption===opt).map(b=>b.league))].map(league=>{const bs=catDone.filter(b=>b.betOption===opt&&b.league===league);const wins=bs.filter(b=>b.result==="승").length;const profit=bs.reduce((s,b)=>s+(b.profit??0),0);const bet=bs.reduce((s,b)=>s+b.amount,0);return{name:league,count:bs.length,wins,profit,roi:bet>0?((profit/bet)*100).toFixed(1):"0",winRate:bs.length>0?Math.round(wins/bs.length*100):0};})}));
  },[done,advCat,advMode]);

  // 수익률: 마감(출금) 이력이 있는 사이트만, 마감 세션별 계산
  const roiStats=useMemo(()=>{
    return ALL_SITES.map(site=>{
      const dollar=isUSD(site);
      const siteWths=withdrawals.filter(w=>w.site===site).sort((a,b)=>a.date.localeCompare(b.date));
      if(siteWths.length===0) return null;
      const siteDepsAll=deposits.filter(d=>d.site===site).sort((a,b)=>a.date.localeCompare(b.date));
      const sessions=siteWths.map((wth,idx)=>{
        const prevWthDate=idx>0?siteWths[idx-1].date:"0000-00-00";
        const sessionDeps=siteDepsAll.filter(d=>d.date>prevWthDate&&d.date<=wth.date);
        const totalDep=sessionDeps.reduce((s,d)=>s+d.amount,0);
        const netKRW=dollar?(wth.amount-totalDep)*usdKrw:(wth.amount-totalDep);
        return{sessionIdx:idx+1,wthDate:wth.date,wthAmt:wth.amount,totalDep,netKRW,deps:sessionDeps};
      });
      const totalDep=sessions.reduce((s,ss)=>s+ss.totalDep,0);
      const totalWth=siteWths.reduce((s,w)=>s+w.amount,0);
      const netKRW=sessions.reduce((s,ss)=>s+ss.netKRW,0);
      return{site,dollar,totalDep,totalWth,netKRW,sessions,hasData:true};
    }).filter(Boolean) as {site:string,dollar:boolean,totalDep:number,totalWth:number,netKRW:number,sessions:any[],hasData:boolean}[];
  },[deposits,withdrawals,usdKrw]);

  // 현재 활성 입금/베팅 합계
  const activeTotalKrwDep=ALL_SITES.filter(s=>!isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].deposited:0),0);
  const activeTotalUsdDep=ALL_SITES.filter(s=>isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].deposited:0),0);
  const activeTotalKrwBet=ALL_SITES.filter(s=>!isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].betTotal:0),0);
  const activeTotalUsdBet=ALL_SITES.filter(s=>isUSD(s)).reduce((s,site)=>s+(siteStates[site]?.active?siteStates[site].betTotal:0),0);

  const extraRoiStats=useMemo(()=>{
    const cats:Record<string,{income:number,expense:number,items:ProfitExtra[]}>={};
    profitExtras.forEach(e=>{if(!cats[e.category])cats[e.category]={income:0,expense:0,items:[]};if(e.isIncome)cats[e.category].income+=e.amount;else cats[e.category].expense+=e.amount;cats[e.category].items.push(e);});
    return cats;
  },[profitExtras]);

  const totalRoiKRW=useMemo(()=>roiStats.reduce((s,r)=>s+r.netKRW,0)+profitExtras.reduce((s,e)=>s+(e.isIncome?e.amount:-e.amount),0),[roiStats,profitExtras]);

  const esportsPrediction=useMemo(()=>{
    const teams:Record<string,{wins:number,losses:number,scored:number,conceded:number}>={};
    esportsRecords.filter(r=>r.league===esportsStratLeague).forEach(r=>{
      if(!teams[r.teamA])teams[r.teamA]={wins:0,losses:0,scored:0,conceded:0};
      if(!teams[r.teamB])teams[r.teamB]={wins:0,losses:0,scored:0,conceded:0};
      if(r.scoreA>r.scoreB){teams[r.teamA].wins++;teams[r.teamB].losses++;}else{teams[r.teamB].wins++;teams[r.teamA].losses++;}
      teams[r.teamA].scored+=r.scoreA;teams[r.teamA].conceded+=r.scoreB;
      teams[r.teamB].scored+=r.scoreB;teams[r.teamB].conceded+=r.scoreA;
    });return teams;
  },[esportsRecords,esportsStratLeague]);

  const allEsportsLeagues=[...MAJOR["E스포츠"],...(customLeagues["E스포츠"]||[])];

  // 잔여금/진행률
  const krwRemaining=activeSiteNames.filter(s=>!isUSD(s)).reduce((sum,site)=>{const st=siteStates[site]||{deposited:0,betTotal:0};return sum+Math.max(0,st.deposited-st.betTotal);},0);
  const usdRemaining=activeSiteNames.filter(s=>isUSD(s)).reduce((sum,site)=>{const st=siteStates[site]||{deposited:0,betTotal:0};return sum+Math.max(0,st.deposited-st.betTotal);},0);
  const optGroups=getOptGroups(form.category);
  const curOpts=optGroups.find(g=>g.g===form.optGroup)?.opts||[];

  // ── 서브 컴포넌트 ─────────────────────────────────────────────
  const StatCard=({label,value,color,sub}:{label:string,value:string|number,color?:string,sub?:string})=>(
    <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color:color??C.text}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.dim,marginTop:3}}>{sub}</div>}
    </div>
  );
  const SubRow=({s}:{s:any})=>(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
      <div style={{flex:1,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
      <div style={{color:s.profit>=0?C.green:C.red,fontWeight:700,minWidth:70,textAlign:"right"}}>{fmtProfit(s.profit,false)}</div>
      <div style={{color:Number(s.roi)>=0?C.green:C.red,minWidth:55,textAlign:"right",fontSize:11}}>ROI {s.roi}%</div>
      <div style={{color:C.teal,minWidth:40,textAlign:"right",fontSize:11}}>{s.winRate}%</div>
      <div style={{color:C.dim,minWidth:30,textAlign:"right",fontSize:11}}>{s.count}건</div>
    </div>
  );

  const KRW_HK=[10000,20000,30000,40000,50000];
  const USD_HK=[10,20,30,40,50];

  const PendingCard=({b}:{b:Bet})=>{
    const title=isOverUnder(b.betOption)?[b.homeTeam,b.awayTeam].filter(Boolean).join(" vs "):b.teamName||"";
    return(
      <div style={{background:C.bg2,border:`1px solid ${C.amber}22`,borderRadius:6,padding:"7px 10px",marginBottom:5}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,flex:1,minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
          <span style={{fontSize:10,color:C.muted}}>[{b.league}]</span>
          <span style={{fontSize:10,color:C.purple,fontWeight:600}}>{b.betOption}</span>
          <span style={{fontSize:10,color:C.muted}}>배당 <span style={{color:C.teal,fontWeight:700}}>{b.odds}</span></span>
          <span style={{fontSize:10,color:C.amber,fontWeight:700}}>{fmtDisp(b.amount,b.isDollar)}</span>
          <div style={{display:"flex",gap:2,flexShrink:0}}>
            <button onClick={()=>updateResult(b.id,"승")} style={{background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:10}}>✅</button>
            <button onClick={()=>updateResult(b.id,"패")} style={{background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:10}}>❌</button>
            <button onClick={()=>cancelBet(b.id)} style={{background:C.bg,border:`1px solid ${C.border2}`,color:C.muted,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontSize:10}}>취소</button>
          </div>
        </div>
      </div>
    );
  };

  const DoneCard=({b}:{b:Bet})=>{
    const rc=b.result==="승"?C.green:b.result==="패"?C.red:C.amber;
    const title=isOverUnder(b.betOption)?[b.homeTeam,b.awayTeam].filter(Boolean).join(" vs "):b.teamName||"";
    return(
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:7,padding:9,opacity:b.includeStats===false?0.5:0.9}}>
        {!b.includeStats&&<div style={{fontSize:8,color:C.dim,marginBottom:2}}>통계제외</div>}
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div><div style={{fontSize:9,color:C.muted}}>{b.date}·{b.betOption}</div></div>
          <div style={{textAlign:"right",flexShrink:0,marginLeft:3}}>
            <div style={{fontSize:9,color:rc,border:`1px solid ${rc}44`,borderRadius:3,padding:"1px 4px",marginBottom:2}}>{b.result}</div>
            {b.profit!==null&&<div style={{fontSize:10,fontWeight:800,color:b.profit>=0?C.green:C.red}}>{fmtProfit(b.profit,b.isDollar)}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:3}}>
          {["승","패"].map(r=>(<button key={r} onClick={()=>updateResult(b.id,r)} style={{flex:1,background:b.result===r?C.border2:"transparent",border:`1px solid ${b.result===r?C.border2:C.border}`,color:b.result===r?C.text:C.dim,padding:"3px",borderRadius:3,cursor:"pointer",fontSize:10}}>{r==="승"?"✅":"❌"}</button>))}
          <button onClick={()=>revertToPending(b.id)} title="진행중으로" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.dim,padding:"3px 5px",borderRadius:3,cursor:"pointer",fontSize:10}}>🔄</button>
          <button onClick={()=>setDeleteModal({betId:b.id})} title="삭제" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.dim,padding:"3px 5px",borderRadius:3,cursor:"pointer",fontSize:10}}>🗑</button>
        </div>
      </div>
    );
  };

  // 버튼 스타일 헬퍼
  const tabBtn=(active:boolean,ac:string)=>({padding:"7px 18px",borderRadius:7,border:active?`1px solid ${ac}`:`1px solid ${C.border}`,background:active?`${ac}22`:"transparent",color:active?ac:C.muted,cursor:"pointer",fontWeight:700,fontSize:12} as React.CSSProperties);
  const siteBtn=(active:boolean,dollar:boolean)=>({padding:"4px 10px",borderRadius:5,border:active?`1px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?`${dollar?C.amber:C.green}22`:C.bg2,color:active?dollar?C.amber:C.green:C.muted,cursor:"pointer",fontSize:11,fontWeight:active?700:400} as React.CSSProperties);

  if(!dbReady) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32}}>⚡</div>
      <div style={{color:C.orange,fontSize:18,fontWeight:800,letterSpacing:2}}>BET TRACKER</div>
      <div style={{color:C.muted,fontSize:13}}>Supabase에서 데이터 불러오는 중...</div>
      <div style={{width:200,height:3,background:C.border,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:"60%",height:"100%",background:C.green,borderRadius:3,animation:"none"}}/>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>

      {/* ── 모달들 ── */}
      {addLeagueModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.purple}`,borderRadius:12,padding:24,width:300}}>
            <div style={{fontSize:14,fontWeight:700,color:C.purple,marginBottom:12}}>리그 추가 ({addLeagueModal.cat})</div>
            <input ref={leagueInputRef} value={newLeagueName} onChange={e=>setNewLeagueName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddLeague()} placeholder="리그 이름" style={{...S,boxSizing:"border-box",marginBottom:12}}/>
            <div style={{display:"flex",gap:8}}><button onClick={handleAddLeague} style={{flex:1,background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"8px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button><button onClick={()=>{setAddLeagueModal(null);setNewLeagueName("");}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button></div>
          </div>
        </div>
      )}
      {editLeagueModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.amber}`,borderRadius:12,padding:24,width:300}}>
            <div style={{fontSize:14,fontWeight:700,color:C.amber,marginBottom:12}}>리그 이름 수정</div>
            <input autoFocus value={editLeagueName} onChange={e=>setEditLeagueName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleEditLeague()} style={{...S,boxSizing:"border-box",marginBottom:12}}/>
            <div style={{display:"flex",gap:8}}><button onClick={handleEditLeague} style={{flex:1,background:`${C.amber}22`,border:`1px solid ${C.amber}`,color:C.amber,padding:"8px",borderRadius:6,cursor:"pointer",fontWeight:700}}>수정</button><button onClick={()=>setEditLeagueModal(null)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button></div>
          </div>
        </div>
      )}
      {closeModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.red}`,borderRadius:12,padding:24,width:320}}>
            <div style={{fontSize:14,fontWeight:700,color:C.red,marginBottom:8}}>🔒 {closeModal.site} 마감</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12}}>출금 금액 입력 (없으면 0)</div>
            <input autoFocus type="number" value={closeWithdrawAmt||""} onChange={e=>setCloseWithdrawAmt(parseFloat(e.target.value)||0)} placeholder="출금 금액" style={{...S,boxSizing:"border-box",marginBottom:12,...noSpin}}/>
            <div style={{display:"flex",gap:8}}><button onClick={confirmClose} style={{flex:1,background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"8px",borderRadius:6,cursor:"pointer",fontWeight:700}}>마감 확정</button><button onClick={()=>setCloseModal(null)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button></div>
          </div>
        </div>
      )}
      {deleteModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:12,padding:24,width:300}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:16}}>삭제 방법 선택</div>
            <button onClick={()=>handleDeleteChoice("stats")} style={{width:"100%",background:C.bg2,border:`1px solid ${C.amber}44`,color:C.amber,padding:"10px",borderRadius:6,cursor:"pointer",marginBottom:8,fontSize:12}}>📊 통계에서만 삭제 (데이터 유지)</button>
            <button onClick={()=>handleDeleteChoice("forever")} style={{width:"100%",background:`${C.red}11`,border:`1px solid ${C.red}44`,color:C.red,padding:"10px",borderRadius:6,cursor:"pointer",marginBottom:12,fontSize:12}}>💥 영구 삭제</button>
            <button onClick={()=>setDeleteModal(null)} style={{width:"100%",background:"transparent",border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button>
          </div>
        </div>
      )}

      {/* ── 헤더 ── */}
      <div style={{background:`linear-gradient(135deg,${C.bg2},${C.bg3})`,borderBottom:`1px solid ${C.border2}`,padding:"10px 20px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div>
            <div style={{fontSize:19,fontWeight:900,letterSpacing:2,color:C.orange,textShadow:`0 0 18px ${C.orange}66`}}>⚡ BET TRACKER</div>
            <div style={{fontSize:10,color:C.muted}}>{today} · $1 = ₩{usdKrw.toLocaleString()}</div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>원화 수익</div><div style={{color:krwProfit>=0?C.green:C.red,fontWeight:800,fontSize:13}}>{fmtProfit(krwProfit,false)}</div></div>
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>달러 수익</div><div style={{color:usdProfit>=0?C.green:C.red,fontWeight:800,fontSize:13}}>{fmtProfit(usdProfit,true)}</div></div>
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>승률</div><div style={{color:C.teal,fontWeight:800,fontSize:13}}>{winRate}%</div></div>
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>진행중</div><div style={{color:C.amber,fontWeight:800,fontSize:13}}>{pending.length}건</div></div>
            {/* 백업/복구 버튼 */}
            <div style={{display:"flex",gap:4}}>
              <button onClick={exportData} style={{fontSize:11,padding:"5px 11px",borderRadius:5,border:`1px solid ${C.green}44`,background:`${C.green}11`,color:C.green,cursor:"pointer",fontWeight:700}} title="데이터 백업">📤</button>
              <button onClick={()=>fileRef.current?.click()} style={{fontSize:11,padding:"5px 11px",borderRadius:5,border:`1px solid ${C.amber}44`,background:`${C.amber}11`,color:C.amber,cursor:"pointer",fontWeight:700}} title="데이터 불러오기">📥</button>
              <input ref={fileRef} type="file" accept=".json" onChange={importData} style={{display:"none"}}/>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {([["betting","🎯 베팅"],["stats","📊 통계"],["roi","💹 수익률"],["odds","📡 배당"],["strategy","📋 전략"],["log","🗒 로그"]] as [string,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k as any)} style={tabBtn(tab===k,C.orange)}>{l}</button>
          ))}
        </div>
      </div>

      {/* ══ 베팅 탭 ══ */}
      {tab==="betting"&&(
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* 왼쪽 패널 */}
          <div style={{width:360,flexShrink:0,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{flex:1,overflowY:"auto"}}>

              {/* 입금 */}
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:16,fontWeight:800,color:C.green,marginBottom:10}}>💵 입금</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                  {KRW_SITES.map(s=><button key={s} onClick={()=>setDepSite(s)} style={siteBtn(depSite===s,false)}>₩ {s}</button>)}
                  {USD_SITES.map(s=><button key={s} onClick={()=>setDepSite(s)} style={siteBtn(depSite===s,true)}>$ {s}</button>)}
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:8}}>
                  <button onClick={()=>setDepAmt(a=>Math.max(0,a-(depIsDollar?1:10000)))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.red,width:30,height:32,borderRadius:6,cursor:"pointer",fontSize:16,fontWeight:700}}>−</button>
                  <div style={{position:"relative",flex:1}}>
                    <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:depIsDollar?C.amber:C.green,fontWeight:700,fontSize:13,pointerEvents:"none"}}>{depSite?(depIsDollar?"$":"₩"):""}</span>
                    <input type="number" value={depAmt||""} onChange={e=>setDepAmt(parseFloat(e.target.value)||0)} placeholder="금액 입력" style={{...S,textAlign:"right",fontWeight:800,color:depIsDollar?C.amber:C.green,fontSize:14,paddingLeft:26,boxSizing:"border-box",...noSpin}}/>
                  </div>
                  <button onClick={()=>setDepAmt(a=>a+(depIsDollar?1:10000))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.green,width:30,height:32,borderRadius:6,cursor:"pointer",fontSize:16,fontWeight:700}}>+</button>
                </div>
                <button onClick={handleDeposit} style={{width:"100%",background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"8px",borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:13,marginBottom:10}}>💰 입금 추가</button>
                <div style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:4}}>이번주 입금 (월~일)</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {ALL_SITES.filter(s=>weekDeposits[s]>0).map(s=><div key={s} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 8px",fontSize:11}}><span style={{color:C.muted}}>{s} </span><span style={{color:isUSD(s)?C.amber:C.green,fontWeight:700}}>{isUSD(s)?`$${weekDeposits[s]}`:weekDeposits[s].toLocaleString()}</span></div>)}
                    {ALL_SITES.every(s=>weekDeposits[s]===0)&&<div style={{fontSize:10,color:C.dim}}>이번주 입금 없음</div>}
                  </div>
                </div>
              </div>

              {/* 베팅 */}
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:16,fontWeight:800,color:C.orange,marginBottom:10}}>🎯 베팅</div>
                {/* 사이트 */}
                <div style={{marginBottom:8}}>
                  <div style={L}>베팅사이트</div>
                  {activeSiteNames.length===0?<div style={{fontSize:11,color:C.dim}}>활성 사이트 없음</div>:
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {activeSiteNames.filter(s=>KRW_SITES.includes(s)).map(s=><button key={s} onClick={()=>handleSiteChange(s)} style={siteBtn(form.site===s,false)}>₩ {s}</button>)}
                    {activeSiteNames.filter(s=>USD_SITES.includes(s)).map(s=><button key={s} onClick={()=>handleSiteChange(s)} style={siteBtn(form.site===s,true)}>$ {s}</button>)}
                  </div>}
                </div>
                {/* 날짜/종목 */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                  <div><div style={L}>날짜</div><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
                  <div><div style={L}>종목</div><select value={form.category} onChange={e=>handleCatChange(e.target.value)} style={S}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                </div>
                {/* 리그 */}
                <div style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                    <div style={L}>리그</div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>{const cl=customLeagues[form.category]||[];const idx=cl.indexOf(form.league);if(idx>=0){setEditLeagueModal({cat:form.category,old:form.league,idx});setEditLeagueName(form.league);}else alert("기본 리그는 수정 불가");}} style={{fontSize:10,padding:"2px 7px",borderRadius:4,border:`1px solid ${C.amber}44`,background:`${C.amber}11`,color:C.amber,cursor:"pointer"}}>✏️</button>
                      <button onClick={()=>setAddLeagueModal({cat:form.category})} style={{fontSize:10,padding:"2px 7px",borderRadius:4,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer"}}>+ 추가</button>
                    </div>
                  </div>
                  <select value={form.league} onChange={e=>handleLeagueChange(e.target.value)} style={S}>
                    <optgroup label="★ 주요 리그">{fMajor.map(l=><option key={l}>{l}</option>)}</optgroup>
                    {fOthers.length>0&&<optgroup label="─────────">{fOthers.map(l=><option key={l}>{l}</option>)}</optgroup>}
                  </select>
                </div>
                {/* 베팅 옵션 */}
                <div style={{marginBottom:6}}>
                  <div style={L}>베팅 옵션</div>
                  {form.category==="E스포츠"?(
                    <div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:5}}>{["일반승","1.5","−1.5","직접입력"].map(o=><button key={o} onClick={()=>setForm(f=>({...f,betOption:o}))} style={{padding:"5px 10px",borderRadius:5,border:form.betOption===o?`1px solid ${C.purple}`:`1px solid ${C.border}`,background:form.betOption===o?`${C.purple}22`:C.bg2,color:form.betOption===o?C.purple:C.muted,cursor:"pointer",fontSize:11,fontWeight:form.betOption===o?700:400}}>{o}</button>)}</div>
                    {form.betOption==="직접입력"&&<input value={esportsCustomOpt} onChange={e=>setEsportsCustomOpt(e.target.value)} placeholder="옵션 입력" style={{...S,boxSizing:"border-box"}}/>}</div>
                  ):(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      <select value={form.optGroup} onChange={e=>handleGroupChange(e.target.value)} style={S}><option value="">그룹</option>{optGroups.map(g=><option key={g.g} value={g.g}>{g.g}</option>)}</select>
                      <select value={form.betOption} onChange={e=>setForm(f=>({...f,betOption:e.target.value}))} style={{...S,opacity:form.optGroup?1:0.4}} disabled={!form.optGroup}><option value="">옵션</option>{curOpts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                    </div>
                  )}
                  {form.betOption&&form.betOption!=="직접입력"&&<div style={{fontSize:11,color:C.purple,marginTop:4,fontWeight:700}}>✓ {form.betOption}</div>}
                </div>
                {/* 팀 이름 */}
                <div style={{marginBottom:6}}>
                  {isOverUnder(form.betOption)?(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      <div><div style={L}>홈팀</div><TeamInput value={form.homeTeam||""} onChange={v=>setForm(f=>({...f,homeTeam:v}))} placeholder="홈팀"/></div>
                      <div><div style={L}>원정팀</div><TeamInput value={form.awayTeam||""} onChange={v=>setForm(f=>({...f,awayTeam:v}))} placeholder="원정팀"/></div>
                    </div>
                  ):(
                    <div><div style={L}>팀 이름</div><TeamInput value={form.teamName||""} onChange={v=>setForm(f=>({...f,teamName:v}))} placeholder="팀 이름"/></div>
                  )}
                </div>
                {/* 배당률 + 금액 */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  <div>
                    <div style={L}>배당률</div>
                    <input type="text" inputMode="numeric" value={form.oddsRaw} onChange={e=>setForm(f=>({...f,oddsRaw:e.target.value.replace(/[^0-9]/g,"")}))} placeholder="예) 185" style={{...S,fontSize:15,padding:"9px 8px",boxSizing:"border-box"}}/>
                    {form.oddsRaw.length>=3&&<div style={{fontSize:11,color:C.teal,marginTop:2,fontWeight:700}}>{(parseInt(form.oddsRaw)/100).toFixed(2)}</div>}
                  </div>
                  <div>
                    <div style={L}>베팅금액</div>
                    <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:4}}>
                      <button onClick={()=>setForm(f=>({...f,amount:Math.max(formIsDollar?1:1000,f.amount-(formIsDollar?1:10000))}))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.red,width:26,height:32,borderRadius:5,cursor:"pointer",fontSize:14,fontWeight:700}}>−</button>
                      <div style={{position:"relative",flex:1}}>
                        <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",color:formIsDollar?C.amber:C.green,fontWeight:700,fontSize:12,pointerEvents:"none"}}>{formIsDollar?"$":"₩"}</span>
                        <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,textAlign:"right",fontWeight:800,color:formIsDollar?C.amber:C.green,fontSize:13,padding:"5px 5px 5px 20px",boxSizing:"border-box",...noSpin}}/>
                      </div>
                      <button onClick={()=>setForm(f=>({...f,amount:f.amount+(formIsDollar?1:10000)}))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.green,width:26,height:32,borderRadius:5,cursor:"pointer",fontSize:14,fontWeight:700}}>+</button>
                    </div>
                    <div style={{display:"flex",gap:3}}>
                      {(formIsDollar?USD_HK:KRW_HK).map(v=><button key={v} onClick={()=>setForm(f=>({...f,amount:v}))} style={{flex:1,padding:"3px 0",borderRadius:4,border:`1px solid ${formIsDollar?C.amber+"55":C.green+"55"}`,background:C.bg2,color:formIsDollar?C.amber:C.green,cursor:"pointer",fontSize:10,fontWeight:600}}>{formIsDollar?`$${v}`:`${v/10000}만`}</button>)}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <input type="checkbox" id="inclStats" checked={form.includeStats} onChange={e=>setForm(f=>({...f,includeStats:e.target.checked}))} style={{width:12,height:12,accentColor:C.purple}}/>
                  <label htmlFor="inclStats" style={{fontSize:10,color:C.muted,cursor:"pointer"}}>통계 자료에 포함</label>
                </div>
                <button onClick={handleAdd} style={{width:"100%",background:`linear-gradient(135deg,${C.orange}33,${C.green}22)`,border:`1px solid ${C.orange}`,color:C.orange,padding:"11px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:15}}>베팅 추가</button>
              </div>

              {/* 이번주 입금 비교 그래프 */}
              {weekDepChartData.length>0&&(
                <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>📊 이번주 사이트별 입금 비교 (원화환산)</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={weekDepChartData} margin={{top:4,right:4,left:0,bottom:0}}>
                      <XAxis dataKey="site" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} width={50} tickFormatter={v=>`${(v/10000).toFixed(0)}만`}/>
                      <Tooltip contentStyle={{background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:8,fontSize:11}} formatter={(value:any,name:any,props:any)=>[`₩${Number(value).toLocaleString()}`,props.payload.isDollar?`$${props.payload.amt} → ₩환산`:props.payload.site]}/>
                      <Bar dataKey="krwAmt" radius={[4,4,0,0]}>
                        {weekDepChartData.map((d,i)=><Cell key={i} fill={d.isDollar?C.amber:C.green}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",gap:8,fontSize:10,color:C.muted,marginTop:4}}>
                    <span style={{color:C.green}}>■ 원화</span><span style={{color:C.amber}}>■ 달러(환산)</span>
                    <span style={{marginLeft:"auto"}}>환율 $1=₩{usdKrw.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽 패널 */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border2}`,flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:17,fontWeight:800,color:C.amber}}>💰 베팅 진행률</div>
                <div style={{display:"flex",gap:14,fontSize:11}}>
                  <span style={{color:C.muted}}>잔여 <span style={{color:C.green,fontWeight:800}}>₩{krwRemaining.toLocaleString()}</span></span>
                  <span style={{color:C.muted}}>잔여 <span style={{color:C.amber,fontWeight:800}}>${usdRemaining.toFixed(2)}</span></span>
                </div>
              </div>
              <div style={{fontSize:10,color:C.muted,marginBottom:6}}>클릭으로 활성화 · 금액은 클릭하여 수정</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {ALL_SITES.map(s=>{const active=siteStates[s]?.active;const dollar=isUSD(s);return<button key={s} onClick={()=>{const u={...siteStates[s],active:!siteStates[s].active,isDollar:dollar};setSiteStatesRaw(p=>({...p,[s]:u}));db.upsertSiteState(s,u);}} style={{padding:"3px 11px",borderRadius:5,border:active?`1px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?(dollar?`${C.amber}22`:`${C.green}22`):C.bg2,color:active?(dollar?C.amber:C.green):C.dim,cursor:"pointer",fontSize:11,fontWeight:700}}>{dollar?"$":"₩"} {s}</button>;})}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:16}}>
              {activeSiteNames.length===0?<div style={{textAlign:"center",color:C.dim,padding:"50px 0"}}><div style={{fontSize:24,marginBottom:8}}>💳</div><div>사이트를 활성화하면 표시됩니다</div></div>:
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
                {activeSiteNames.map(site=>{
                  const st=siteStates[site]||{deposited:0,betTotal:0,active:false,isDollar:false};
                  const dollar=isUSD(site);
                  const remaining=Math.max(0,parseFloat((st.deposited-st.betTotal).toFixed(2)));
                  const pct=st.deposited>0?Math.min(100,Math.round(st.betTotal/st.deposited*100)):0;
                  const barColor=pct>=90?C.red:pct>=70?C.amber:C.green;
                  const sitePending=pending.filter(b=>b.site===site);
                  const is100=pct>=100;
                  return(
                    <div key={site} style={{background:C.bg3,border:`1px solid ${barColor}33`,borderRadius:12,padding:13}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13,fontWeight:800,color:C.text}}>{dollar?"$":"₩"} {site}</span>
                          {/* 진행완료 도장 — 헤더 줄에 표시 */}
                          {is100&&<span style={{fontSize:11,fontWeight:900,color:C.red,border:`2px solid ${C.red}`,borderRadius:5,padding:"1px 6px",opacity:0.7,transform:"rotate(-8deg)",display:"inline-block",letterSpacing:0.5}}>완료</span>}
                        </div>
                        <div style={{display:"flex",gap:3}}>
                          <button onClick={()=>cancelSite(site)} title="사이트 취소" style={{fontSize:9,padding:"2px 6px",borderRadius:3,border:`1px solid ${C.border2}`,background:C.bg2,color:C.muted,cursor:"pointer"}}>✕</button>
                          <button onClick={()=>handleClose(site)} style={{fontSize:9,padding:"2px 6px",borderRadius:3,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>마감</button>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4,alignItems:"flex-end",marginBottom:6}}>
                        <div style={{flex:1,textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.muted,marginBottom:2}}>입금</div>
                          <EditableCell value={st.deposited} dollar={dollar} color={C.muted} onSave={v=>{const u={...siteStates[site],deposited:v};setSiteStatesRaw(p=>({...p,[site]:u}));db.upsertSiteState(site,u);addLog("✏️ 입금수정",`${site}:${fmtDisp(v,dollar)}`);}}/>
                        </div>
                        <div style={{width:1,height:22,background:C.border}}/>
                        <div style={{flex:1,textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.muted,marginBottom:2}}>베팅</div>
                          <EditableCell value={st.betTotal} dollar={dollar} color={barColor} onSave={v=>{const u={...siteStates[site],betTotal:v};setSiteStatesRaw(p=>({...p,[site]:u}));db.upsertSiteState(site,u);}}/>
                        </div>
                        <div style={{width:1,height:22,background:C.border}}/>
                        <div style={{flex:1.3,textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.muted,marginBottom:2}}>잔여</div>
                          <div style={{fontSize:14,fontWeight:800,color:C.teal}}>{fmtDisp(remaining,dollar)}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}><span style={{color:C.muted}}>진행률</span><span style={{color:barColor,fontWeight:700}}>{pct}%</span></div>
                      <div style={{height:5,background:C.bg,borderRadius:3,overflow:"hidden",marginBottom:8}}><div style={{width:`${pct}%`,height:"100%",background:barColor,borderRadius:3,transition:"width 0.3s"}}/></div>
                      {sitePending.length>0&&(
                        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:7}}>
                          <div style={{fontSize:10,color:C.amber,fontWeight:700,marginBottom:5}}>⏳ {sitePending.length}건</div>
                          {sitePending.map(b=><PendingCard key={b.id} b={b}/>)}
                        </div>
                      )}
                      {sitePending.length===0&&<div style={{textAlign:"center",fontSize:10,color:C.dim,padding:"4px 0"}}>진행중 없음</div>}
                    </div>
                  );
                })}
              </div>}

              {/* 완료 경기 */}
              {doneFull.length>0&&(
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>오늘 완료 ({doneTodayFull.length}건)</span>
                    {doneOldFull.length>0&&<button onClick={()=>setShowOldDone(p=>!p)} style={{fontSize:10,color:C.muted,background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 7px",cursor:"pointer"}}>{showOldDone?"이전 숨기기":`이전 ${doneOldFull.length}건`}</button>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:8}}>
                    {[...doneTodayFull].reverse().map(b=><DoneCard key={b.id} b={b}/>)}
                  </div>
                  {showOldDone&&doneOldFull.length>0&&(
                    <div>
                      <div style={{fontSize:10,color:C.dim,marginBottom:6}}>이전 완료 ({doneOldFull.length}건)</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7}}>
                        {[...doneOldFull].reverse().map(b=><DoneCard key={b.id} b={b}/>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ 통계 탭 ══ */}
      {tab==="stats"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {([["overview","📈 총괄"],["daily","📅 날짜별"],["baseball","⚾ 야구"],["adv","🔬 심화"]] as [string,string][]).map(([k,l])=><button key={k} onClick={()=>setStatTab(k as any)} style={tabBtn(statTab===k,C.purple)}>{l}</button>)}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={async()=>{if(!window.confirm("통계 초기화?"))return;
              const cleared=bets.map(x=>({...x,includeStats:false}));
              setBetsRaw(cleared);
              for(const b of cleared) await db.upsertBet(b);}} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:`1px solid ${C.amber}44`,background:`${C.amber}11`,color:C.amber,cursor:"pointer"}}>통계 초기화</button>
              <button onClick={async()=>{if(!window.confirm("전체 영구 삭제?"))return;
              for(const b of bets) await db.deleteBet(b.id);
              setBetsRaw([]);}} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>전체 삭제</button>
            </div>
          </div>
          {done.length===0&&<div style={{textAlign:"center",color:C.dim,padding:"60px 0",fontSize:14}}>완료된 베팅이 없습니다</div>}
          {done.length>0&&statTab==="overview"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
                <StatCard label="원화 수익" value={fmtProfit(krwProfit,false)} color={krwProfit>=0?C.green:C.red}/>
                <StatCard label="달러 수익" value={fmtProfit(usdProfit,true)} color={usdProfit>=0?C.green:C.red}/>
                <StatCard label="승률" value={`${winRate}%`} color={C.teal} sub={`${wins}승 ${done.filter(b=>b.result==="패").length}패`}/>
                <StatCard label="평균 배당" value={avgOdds} color={C.amber}/>
                <StatCard label="총 베팅" value={`${done.length}건`} color={C.purple}/>
                <StatCard label="현재 연속" value={curS} color={curS.includes("승")?C.green:curS.includes("패")?C.red:C.muted}/>
                <StatCard label="최대 연승" value={`${maxW}연승`} color={C.green}/>
                <StatCard label="최대 연패" value={`${maxL}연패`} color={C.red}/>
              </div>
              {cumCurve.length>1&&<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:14}}><div style={{fontSize:11,color:C.muted,marginBottom:8}}>누적 수익 (원화)</div><ResponsiveContainer width="100%" height={180}><LineChart data={cumCurve}><CartesianGrid strokeDasharray="3 3" stroke={C.border}/><XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:8,fontSize:11}}/><Line type="monotone" dataKey="cumProfit" stroke={C.green} strokeWidth={2} dot={{fill:C.green,r:3}}/></LineChart></ResponsiveContainer></div>}
            </div>
          )}
          {done.length>0&&statTab==="daily"&&(
            <div>
              <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:14}}><ResponsiveContainer width="100%" height={180}><BarChart data={dailyStats}><XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:8,fontSize:11}}/><Bar dataKey="profit" radius={[4,4,0,0]}>{dailyStats.map((_,i)=><Cell key={i} fill={dailyStats[i].profit>=0?C.green:C.red}/>)}</Bar></BarChart></ResponsiveContainer></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>{[...dailyStats].reverse().map((d,i)=><div key={i} style={{background:C.bg3,border:`1px solid ${d.profit>=0?C.green+"33":C.red+"33"}`,borderRadius:9,padding:11}}><div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:2}}>{d.fullDate}</div><div style={{fontSize:14,fontWeight:800,color:d.profit>=0?C.green:C.red,marginBottom:2}}>{fmtProfit(d.profit,false)}</div><div style={{fontSize:10,color:C.muted}}>ROI <span style={{color:Number(d.roi)>=0?C.green:C.red}}>{d.roi}%</span> · 승률 <span style={{color:C.teal}}>{d.winRate}%</span></div></div>)}</div>
            </div>
          )}
          {done.length>0&&statTab==="baseball"&&(
            <div>
              <div style={{display:"flex",gap:4,marginBottom:12}}>{([["league","리그별"],["option","옵션별"]] as [string,string][]).map(([k,l])=><button key={k} onClick={()=>setBbSub(k as any)} style={tabBtn(bbSub===k,C.teal)}>{l}</button>)}</div>
              {baseballDone.length===0&&<div style={{textAlign:"center",color:C.dim,padding:"40px"}}>야구 기록 없음</div>}
              {bbSub==="league"&&bbLeagueStats.map(({league,data})=><div key={league} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:11,padding:14,marginBottom:12}}><div style={{fontSize:13,fontWeight:800,color:C.teal,marginBottom:10}}>⚾ {league}</div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>{data.filter(d=>d.count>0).map(d=><div key={d.opt} style={{background:C.bg2,border:`1px solid ${d.profit>=0?C.green+"33":C.red+"33"}`,borderRadius:8,padding:10}}><div style={{fontSize:12,fontWeight:800,color:C.amber,marginBottom:4}}>{d.opt}</div><div style={{fontSize:14,fontWeight:800,color:d.profit>=0?C.green:C.red,marginBottom:2}}>{fmtProfit(d.profit,false)}</div><div style={{fontSize:10,color:C.muted}}>ROI <span style={{color:Number(d.roi)>=0?C.green:C.red}}>{d.roi}%</span>·승률<span style={{color:C.teal}}>{d.winRate}%</span>·{d.count}건</div></div>)}</div></div>)}
              {bbSub==="option"&&bbOptStats.map(({opt,data})=>data.length===0?null:<div key={opt} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:11,padding:14,marginBottom:12}}><div style={{fontSize:13,fontWeight:800,color:C.amber,marginBottom:10}}>{opt}</div><div style={{background:C.bg,borderRadius:7,overflow:"hidden"}}><div style={{display:"flex",gap:8,padding:"5px 10px",borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.muted}}><div style={{flex:1}}>리그</div><div style={{minWidth:65,textAlign:"right"}}>수익</div><div style={{minWidth:50,textAlign:"right"}}>ROI</div><div style={{minWidth:38,textAlign:"right"}}>승률</div><div style={{minWidth:28,textAlign:"right"}}>건</div></div>{data.map(d=><SubRow key={d.league} s={{...d,name:d.league}}/>)}</div></div>)}
            </div>
          )}
          {done.length>0&&statTab==="adv"&&(
            <div>
              <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:11,color:C.muted}}>종목:</span>{CATS.map(c=><button key={c} onClick={()=>setAdvCat(c)} style={tabBtn(advCat===c,C.teal)}>{c}</button>)}
                <span style={{marginLeft:8,fontSize:11,color:C.muted}}>기준:</span>{([["league","리그별"],["option","옵션별"]] as [string,string][]).map(([k,l])=><button key={k} onClick={()=>setAdvMode(k as any)} style={tabBtn(advMode===k,C.purple)}>{l}</button>)}
              </div>
              {advStats.length===0?<div style={{textAlign:"center",color:C.dim,padding:"40px"}}>기록 없음</div>:advStats.map(({key,subs})=>subs.length===0?null:<div key={key} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:11,padding:14,marginBottom:12}}><div style={{fontSize:13,fontWeight:800,color:advMode==="league"?C.teal:C.amber,marginBottom:10}}>{advMode==="league"?"🌍":"🎯"} {key}</div><div style={{background:C.bg,borderRadius:7,overflow:"hidden"}}><div style={{display:"flex",gap:8,padding:"5px 10px",borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.muted}}><div style={{flex:1}}>{advMode==="league"?"옵션":"리그"}</div><div style={{minWidth:65,textAlign:"right"}}>수익</div><div style={{minWidth:50,textAlign:"right"}}>ROI</div><div style={{minWidth:38,textAlign:"right"}}>승률</div><div style={{minWidth:28,textAlign:"right"}}>건</div></div>{subs.map((s,i)=><SubRow key={i} s={s}/>)}</div></div>)}
            </div>
          )}
        </div>
      )}

      {/* ══ 수익률 탭 ══ */}
      {tab==="roi"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{fontSize:16,fontWeight:800,color:C.green,marginBottom:16}}>💹 수익률 분석</div>

          {/* 전체 마감 기준 순손익 */}
          <div style={{background:C.bg3,border:`1px solid ${totalRoiKRW>=0?C.green:C.red}44`,borderRadius:12,padding:16,marginBottom:12,textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>전체 순손익 (마감 완료 세션 합산 · 원화 환산)</div>
            <div style={{fontSize:28,fontWeight:900,color:totalRoiKRW>=0?C.green:C.red}}>{fmtProfit(totalRoiKRW,false)}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>실시간 환율 $1 = ₩{usdKrw.toLocaleString()}</div>
          </div>

          {/* 현재 입금/베팅 중 현황 */}
          <div style={{background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:10,padding:14,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.amber,marginBottom:10}}>📊 현재 진행 중 (마감 전)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>원화 입금중</div>
                <div style={{fontSize:16,fontWeight:800,color:C.green}}>₩{activeTotalKrwDep.toLocaleString()}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>원화 베팅중</div>
                <div style={{fontSize:16,fontWeight:800,color:C.amber}}>₩{activeTotalKrwBet.toLocaleString()}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>달러 입금중</div>
                <div style={{fontSize:16,fontWeight:800,color:C.green}}>${activeTotalUsdDep.toFixed(2)}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>달러 베팅중</div>
                <div style={{fontSize:16,fontWeight:800,color:C.amber}}>${activeTotalUsdBet.toFixed(2)}</div>
              </div>
            </div>
            <div style={{fontSize:10,color:C.dim,marginTop:8,textAlign:"center"}}>※ 마감 전 입금은 수익률에 포함되지 않습니다</div>
          </div>

          {/* 사이트별 마감 세션 수익 */}
          <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:10}}>사이트별 마감 세션 수익</div>
          {roiStats.length===0&&<div style={{color:C.muted,fontSize:12,marginBottom:16,padding:"20px",textAlign:"center",background:C.bg3,borderRadius:10}}>마감 이력이 없습니다. 사이트를 마감하면 수익률이 계산됩니다.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {roiStats.map(r=>(
              <div key={r.site} style={{background:C.bg3,border:`1px solid ${r.netKRW>=0?C.green+"44":C.red+"44"}`,borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.text}}>{r.dollar?"$ ":"₩ "}{r.site}</div>
                  <div style={{fontSize:15,fontWeight:900,color:r.netKRW>=0?C.green:C.red}}>{fmtProfit(r.netKRW,false)}</div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:C.muted}}>총 입금(마감분)</span><span style={{color:C.teal}}>{r.dollar?`$${r.totalDep}`:r.totalDep.toLocaleString()}</span></div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:8}}><span style={{color:C.muted}}>총 출금</span><span style={{color:C.amber}}>{r.dollar?`$${r.totalWth}`:r.totalWth.toLocaleString()}</span></div>
                {/* 세션별 내역 */}
                {r.sessions.map((ss:any)=>(
                  <div key={ss.sessionIdx} style={{background:C.bg2,borderRadius:7,padding:"8px 10px",marginBottom:5,border:`1px solid ${ss.netKRW>=0?C.green+"22":C.red+"22"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:C.muted}}>세션 {ss.sessionIdx} · 마감 {ss.wthDate}</span>
                      <span style={{fontSize:11,fontWeight:800,color:ss.netKRW>=0?C.green:C.red}}>{fmtProfit(ss.netKRW,r.dollar)}</span>
                    </div>
                    {ss.deps.map((d:any)=><div key={d.id} style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.dim,marginBottom:1}}><span>{d.date} 입금</span><span style={{color:C.teal}}>+{r.dollar?`$${d.amount}`:d.amount.toLocaleString()}</span></div>)}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.dim,marginTop:2,paddingTop:2,borderTop:`1px solid ${C.border}`}}><span>{ss.wthDate} 출금</span><span style={{color:C.amber}}>-{r.dollar?`$${ss.wthAmt}`:ss.wthAmt.toLocaleString()}</span></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{fontSize:13,fontWeight:700,color:C.purple,marginBottom:10}}>기타 수익 / 지출</div>
          <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:6,alignItems:"end"}}>
              <div><div style={L}>상위 카테고리</div><input value={pextForm.category} onChange={e=>setPextForm(f=>({...f,category:e.target.value}))} placeholder="예) 알바" style={{...S,boxSizing:"border-box"}}/></div>
              <div><div style={L}>하위 카테고리</div><input value={pextForm.subCategory} onChange={e=>setPextForm(f=>({...f,subCategory:e.target.value}))} placeholder="예) 편의점" style={{...S,boxSizing:"border-box"}}/></div>
              <div><div style={L}>금액 (원화)</div><input type="number" value={pextForm.amount||""} onChange={e=>setPextForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/></div>
              <div><div style={L}>메모</div><input value={pextForm.note} onChange={e=>setPextForm(f=>({...f,note:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <button onClick={()=>setPextForm(f=>({...f,isIncome:true}))} style={{padding:"5px 10px",borderRadius:4,border:pextForm.isIncome?`1px solid ${C.green}`:`1px solid ${C.border}`,background:pextForm.isIncome?`${C.green}22`:C.bg2,color:pextForm.isIncome?C.green:C.muted,cursor:"pointer",fontSize:11}}>수입</button>
                <button onClick={()=>setPextForm(f=>({...f,isIncome:false}))} style={{padding:"5px 10px",borderRadius:4,border:!pextForm.isIncome?`1px solid ${C.red}`:`1px solid ${C.border}`,background:!pextForm.isIncome?`${C.red}22`:C.bg2,color:!pextForm.isIncome?C.red:C.muted,cursor:"pointer",fontSize:11}}>지출</button>
              </div>
            </div>
            <button onClick={()=>{if(!pextForm.category||pextForm.amount<=0)return;const newPe={id:String(Date.now()),...pextForm,date:today};setProfitExtrasRaw(p=>[...p,newPe]);db.insertProfitExtra(newPe);setPextForm({category:"",subCategory:"",amount:0,note:"",isIncome:true});}} style={{marginTop:10,width:"100%",background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"7px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button>
          </div>
          {Object.entries(extraRoiStats).map(([cat,{income,expense,items}])=>(
            <div key={cat} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:800,color:C.purple}}>{cat}</div>
                <div style={{fontSize:13,fontWeight:800,color:(income-expense)>=0?C.green:C.red}}>{fmtProfit(income-expense,false)}</div>
              </div>
              {items.map(item=>(
                <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted}}>{item.date}·{item.subCategory||"-"}·{item.note}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{color:item.isIncome?C.green:C.red,fontWeight:700}}>{item.isIncome?"+":"-"}{item.amount.toLocaleString()}</span>
                    <button onClick={()=>{setProfitExtrasRaw(p=>p.filter(x=>x.id!==item.id));db.deleteProfitExtra(item.id);}} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11}}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ══ 배당 탭 ══ */}
      {tab==="odds"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:260}}>
              <div style={{fontSize:16,fontWeight:800,color:C.teal,marginBottom:8}}>
                📡 실시간 배당
                {oddsLastFetch>0&&<span style={{fontSize:10,color:C.muted,marginLeft:10,fontWeight:400}}>업데이트 {new Date(oddsLastFetch).toLocaleTimeString("ko-KR")}</span>}
                {oddsRemaining!==null&&<span style={{fontSize:10,color:C.amber,marginLeft:8,fontWeight:400}}>잔여 {oddsRemaining}회</span>}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                {Object.keys(SPORT_KEY_MAP).map(lg=>{const on=activeOddsLeagues.includes(lg);return<button key={lg} onClick={()=>{const next=on?activeOddsLeagues.filter(x=>x!==lg):[...activeOddsLeagues,lg];setActiveOddsLeagues(next);try{localStorage.setItem("btv12_oddsLeagues",JSON.stringify(next));}catch{}}} style={{padding:"3px 10px",borderRadius:5,border:on?`1px solid ${C.teal}55`:`1px solid ${C.border}`,background:on?`${C.teal}11`:C.bg2,color:on?C.teal:C.muted,cursor:"pointer",fontSize:11,fontWeight:on?700:400}}>{lg}</button>;})}
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {(["전체","하락","연속하락","급락"] as const).map(f=>{const colors={전체:C.teal,하락:C.amber,연속하락:C.orange,급락:C.red};const c=colors[f];return<button key={f} onClick={()=>setOddsFilter(f)} style={{padding:"4px 12px",borderRadius:5,border:oddsFilter===f?`1px solid ${c}`:`1px solid ${C.border}`,background:oddsFilter===f?`${c}22`:C.bg2,color:oddsFilter===f?c:C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>{f==="급락"?"🔴 급락":f==="연속하락"?"🟠 연속하락":f==="하락"?"🟡 하락":"전체"}</button>;})}
                <div style={{height:28,width:1,background:C.border}}/>
                {["전체","축구","농구","야구"].map(c=><button key={c} onClick={()=>setOddsCatFilter(c)} style={{padding:"4px 12px",borderRadius:5,border:oddsCatFilter===c?`1px solid ${C.purple}`:`1px solid ${C.border}`,background:oddsCatFilter===c?`${C.purple}22`:C.bg2,color:oddsCatFilter===c?C.purple:C.muted,cursor:"pointer",fontSize:11}}>{c==="전체"?"전체종목":c}</button>)}
              </div>
            </div>
            <button onClick={()=>fetchAllOdds()} disabled={oddsLoading} style={{padding:"10px 20px",borderRadius:8,border:`1px solid ${C.teal}`,background:oddsLoading?C.bg2:`${C.teal}22`,color:oddsLoading?C.muted:C.teal,cursor:oddsLoading?"default":"pointer",fontWeight:700,fontSize:13,flexShrink:0}}>{oddsLoading?"⏳ 불러오는 중...":"🔄 새로고침"}</button>
          </div>
          {oddsError&&<div style={{background:`${C.red}11`,border:`1px solid ${C.red}44`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.red,marginBottom:12}}>⚠️ {oddsError}</div>}
          {oddsGames.length===0&&!oddsLoading&&<div style={{textAlign:"center",color:C.dim,padding:"60px 0"}}><div style={{fontSize:30,marginBottom:10}}>📡</div><div>리그를 선택하고 새로고침을 눌러주세요</div></div>}
          {(()=>{
            const catOf=(g:OddsGame)=>g.sport.startsWith("soccer")?"축구":g.sport.startsWith("basketball")?"농구":g.sport.startsWith("baseball")?"야구":"기타";
            const now=new Date();
            const filtered=oddsGames.filter(g=>{
              if(new Date(g.commence)<=now)return false; // 예정 경기만 표시
              if(oddsCatFilter!=="전체"&&catOf(g)!==oddsCatFilter)return false;
              if(oddsFilter==="전체")return true;
              const hist=oddsHistory[g.id]??[];const hA=classifyAlert(hist,"home");const aA=classifyAlert(hist,"away");
              if(oddsFilter==="급락")return hA==="급락"||aA==="급락";
              if(oddsFilter==="연속하락")return hA==="연속하락"||aA==="연속하락"||hA==="급락"||aA==="급락";
              return hA!==null||aA!==null;
            });
            if(filtered.length===0&&!oddsLoading)return<div style={{textAlign:"center",color:C.muted,padding:"40px 0",fontSize:13}}>조건에 맞는 경기가 없습니다</div>;
            const groups:Record<string,OddsGame[]>={};
            filtered.forEach(g=>{if(!groups[g.leagueName])groups[g.leagueName]=[];groups[g.leagueName].push(g);});
            return Object.entries(groups).map(([league,games])=>(
              <div key={league} style={{marginBottom:24}}>
                <div style={{fontSize:13,fontWeight:800,color:C.purple,marginBottom:8}}>{league} <span style={{fontSize:11,color:C.muted,fontWeight:400}}>{games.length}경기</span></div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {games.map(g=>{
                    const hist=oddsHistory[g.id]??[];
                    const hA=classifyAlert(hist,"home");const aA=classifyAlert(hist,"away");
                    const ac=(a:OddsAlert)=>a==="급락"?C.red:a==="연속하락"?C.orange:a==="하락"?C.amber:"transparent";
                    const al=(a:OddsAlert)=>a==="급락"?"🔴급락":a==="연속하락"?"🟠연속↓":a==="하락"?"🟡↓":"";
                    const commence=new Date(g.commence);
                    const timeStr=commence.toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"});
                    const isPast=commence<new Date();
                    const hH=hist.slice(-5).map(h=>h.home);const aH=hist.slice(-5).map(h=>h.away);
                    return(
                      <div key={g.id} style={{background:C.bg3,border:`1px solid ${(hA||aA)?ac(hA??aA)+"55":C.border}`,borderRadius:10,padding:"12px 14px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:800,color:isPast?C.muted:C.text}}>{g.away} <span style={{color:C.dim,fontWeight:400}}>vs</span> {g.home}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:2}}>⏰ {timeStr}{isPast?" · 종료/진행중":""}</div>
                          </div>
                          {g.bookmakers.length>0&&<div style={{fontSize:10,color:C.dim}}>{g.bookmakers.length}북메이커</div>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:g.bestDraw?"1fr 1fr 1fr":"1fr 1fr",gap:8}}>
                          {[{label:`홈 (${g.home.split(" ").pop()})`,val:g.bestHome,alert:hA,hist:hH},{label:"무",val:g.bestDraw,alert:null,hist:[]},...(g.bestDraw?[{label:`원정 (${g.away.split(" ").pop()})`,val:g.bestAway,alert:aA,hist:aH}]:[{label:`원정 (${g.away.split(" ").pop()})`,val:g.bestAway,alert:aA,hist:aH}])].filter(d=>d.val).map((d,i)=>(
                            <div key={i} style={{background:C.bg2,border:`1px solid ${d.alert?ac(d.alert)+"66":C.border}`,borderRadius:7,padding:"8px 10px",textAlign:"center"}}>
                              <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{d.label}</div>
                              <div style={{fontSize:20,fontWeight:900,color:d.alert?ac(d.alert):i===0?C.green:i===1&&g.bestDraw?C.muted:C.teal}}>{d.val!.toFixed(2)}</div>
                              {d.alert&&<div style={{fontSize:10,fontWeight:700,color:ac(d.alert),marginTop:2}}>{al(d.alert)}</div>}
                              {d.hist.length>=2&&<div style={{display:"flex",alignItems:"flex-end",gap:1,justifyContent:"center",height:18,marginTop:4}}>{d.hist.map((v,j)=>{const mn=Math.min(...d.hist),mx=Math.max(...d.hist),ht=mx===mn?8:Math.round(((v-mn)/(mx-mn))*14)+4,isLast=j===d.hist.length-1;return<div key={j} style={{width:5,height:ht,borderRadius:2,background:isLast?(d.alert?ac(d.alert):C.green):C.border2}}/>;})}</div>}
                            </div>
                          ))}
                        </div>
                        {g.bookmakers.length>1&&<details style={{marginTop:8}}><summary style={{fontSize:10,color:C.muted,cursor:"pointer",userSelect:"none"}}>북메이커별 배당 보기</summary><div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>{g.bookmakers.map(b=><div key={b.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,padding:"3px 6px",background:C.bg,borderRadius:4}}><span style={{color:C.muted,minWidth:100}}>{b.title}</span><span style={{color:C.green,fontWeight:700}}>{b.homeOdds.toFixed(2)}</span>{b.drawOdds&&<span style={{color:C.muted,fontWeight:700}}>{b.drawOdds.toFixed(2)}</span>}<span style={{color:C.teal,fontWeight:700}}>{b.awayOdds.toFixed(2)}</span></div>)}</div></details>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* ══ 전략 탭 ══ */}
      {tab==="strategy"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{fontSize:16,fontWeight:800,color:C.amber,marginBottom:14}}>📋 베팅 전략</div>
          <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
            {["축구","농구","야구","E스포츠"].map(c=><button key={c} onClick={()=>setStratCat(c)} style={tabBtn(stratCat===c,C.orange)}>{c}</button>)}
          </div>
          {stratCat==="축구"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[{title:"⚽ 0.5 플핸 조건",color:C.teal,content:["배당 1.6 이상","정배 배당: 1.60 ~ 2.19","무배당: 3.6 이하"]},{title:"⚽ 1.5 플핸 조건",color:C.green,content:["배당 1.40 이상","정배 배당: 1.30 ~ 1.59","무배당: 4.3 이하"]},{title:"⚽ 2.5 플핸 조건",color:C.amber,content:["배당 1.40 이상","정배 배당: 1.10 ~ 1.29","무배당: 6.6 이하"]}].map(s=>(
                <div key={s.title} style={{background:C.bg3,border:`1px solid ${s.color}33`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:14,fontWeight:800,color:s.color,marginBottom:10}}>{s.title}</div>
                  {s.content.map((line,i)=><div key={i} style={{fontSize:12,color:C.text,padding:"4px 0",borderBottom:i<s.content.length-1?`1px solid ${C.border}`:"none"}}>• {line}</div>)}
                </div>
              ))}
            </div>
          )}
          {stratCat==="농구"&&(
            <div style={{background:C.bg3,border:`1px solid ${C.purple}33`,borderRadius:10,padding:16}}>
              <div style={{fontSize:14,fontWeight:800,color:C.purple,marginBottom:10}}>🏀 농구 전략</div>
              <div style={{fontSize:12,color:C.text,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>• 5.5 ~ 29.5 플핸 → 플핸 베팅</div>
              <div style={{fontSize:12,color:C.text,padding:"5px 0"}}>• 30.5 이상 → 마핸 베팅</div>
            </div>
          )}
          {stratCat==="야구"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{background:C.bg3,border:`1px solid ${C.red}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.red,marginBottom:8}}>⚾ 역배 전략</div><div style={{fontSize:12,color:C.text}}>• 무지성 역배 전략 테스트 중</div></div>
              <div style={{background:C.bg3,border:`1px solid ${C.amber}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.amber,marginBottom:8}}>⚾ 언오버 전략</div><div style={{fontSize:12,color:C.text}}>• 야구 언오버는 베팅 분석 사이트(아톰) 픽으로 베팅 테스트</div></div>
            </div>
          )}
          {stratCat==="E스포츠"&&(
            <div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
                {[...MAJOR["E스포츠"],...(customLeagues["E스포츠"]||[])].map(l=><button key={l} onClick={()=>setEsportsStratLeague(l)} style={{padding:"5px 12px",borderRadius:6,border:esportsStratLeague===l?`1px solid ${C.teal}`:`1px solid ${C.border}`,background:esportsStratLeague===l?`${C.teal}22`:C.bg2,color:esportsStratLeague===l?C.teal:C.muted,cursor:"pointer",fontSize:11,fontWeight:600}}>{l}</button>)}
                <button onClick={()=>setAddLeagueModal({cat:"E스포츠"})} style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:11}}>+ 리그 추가</button>
              </div>
              <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:700,color:C.teal,marginBottom:8}}>경기 결과 기록</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:6,alignItems:"end"}}>
                  <div><div style={L}>날짜</div><input type="date" value={esRec.date} onChange={e=>setEsRec(r=>({...r,date:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
                  <div><div style={L}>팀A</div><input value={esRec.teamA} onChange={e=>setEsRec(r=>({...r,teamA:e.target.value}))} placeholder="예) DK" style={{...S,boxSizing:"border-box"}}/></div>
                  <div><div style={L}>팀B</div><input value={esRec.teamB} onChange={e=>setEsRec(r=>({...r,teamB:e.target.value}))} placeholder="예) T1" style={{...S,boxSizing:"border-box"}}/></div>
                  <div><div style={L}>점수A</div><input type="number" value={esRec.scoreA} onChange={e=>setEsRec(r=>({...r,scoreA:parseInt(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/></div>
                  <div><div style={L}>점수B</div><input type="number" value={esRec.scoreB} onChange={e=>setEsRec(r=>({...r,scoreB:parseInt(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/></div>
                  <button onClick={()=>{if(!esRec.teamA||!esRec.teamB)return;const newRec={id:String(Date.now()),league:esportsStratLeague,...esRec};setEsportsRecordsRaw(p=>[...p,newRec]);db.insertEsportsRecord(newRec);setEsRec(r=>({...r,teamA:"",teamB:"",scoreA:0,scoreB:0}));}} style={{padding:"6px 12px",background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:12}}>추가</button>
                </div>
              </div>
              {esportsRecords.filter(r=>r.league===esportsStratLeague).length>0&&(
                <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>📜 {esportsStratLeague} 경기 기록</div>
                  {esportsRecords.filter(r=>r.league===esportsStratLeague).map(r=>(
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,fontSize:12,padding:"5px 8px",background:C.bg2,borderRadius:5,marginBottom:3}}>
                      <span style={{color:C.dim,minWidth:80}}>{r.date}</span>
                      <span style={{color:r.scoreA>r.scoreB?C.green:C.text,fontWeight:700}}>{r.teamA}</span>
                      <span style={{color:C.teal,fontWeight:800}}>{r.scoreA} : {r.scoreB}</span>
                      <span style={{color:r.scoreB>r.scoreA?C.green:C.text,fontWeight:700}}>{r.teamB}</span>
                      <button onClick={()=>{setEsportsRecordsRaw(p=>p.filter(x=>x.id!==r.id));db.deleteEsportsRecord(r.id);}} style={{marginLeft:"auto",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(esportsPrediction).length>=2&&(
                <div style={{background:C.bg3,border:`1px solid ${C.purple}33`,borderRadius:10,padding:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.purple,marginBottom:10}}>🔮 팀별 승률 예측</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {Object.entries(esportsPrediction).map(([team,s])=>{
                      const total=s.wins+s.losses;const wr=total>0?Math.round(s.wins/total*100):0;
                      return(
                        <div key={team} style={{background:C.bg2,borderRadius:8,padding:10}}>
                          <div style={{fontSize:12,fontWeight:800,color:C.teal,marginBottom:4}}>{team}</div>
                          <div style={{fontSize:18,fontWeight:900,color:wr>=60?C.green:wr>=40?C.amber:C.red}}>{wr}%</div>
                          <div style={{fontSize:10,color:C.muted}}>{s.wins}승 {s.losses}패</div>
                          <div style={{height:4,background:C.bg,borderRadius:2,marginTop:6}}><div style={{width:`${wr}%`,height:"100%",background:wr>=60?C.green:wr>=40?C.amber:C.red,borderRadius:2}}/></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ 로그 탭 ══ */}
      {tab==="log"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:800,color:C.purple}}>🗒 활동 로그 <span style={{fontSize:11,color:C.dim,fontWeight:400}}>(세션 내 기록 · 저장 안됨)</span></div>
            <button onClick={()=>setLogs([])} style={{fontSize:11,padding:"5px 12px",borderRadius:5,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>전체 삭제</button>
          </div>
          {logs.length===0?<div style={{textAlign:"center",color:C.dim,padding:"60px 0",fontSize:14}}>활동 기록이 없습니다</div>:
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {logs.map(l=>(
                <div key={l.id} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",display:"flex",gap:12,alignItems:"center"}}>
                  <div style={{fontSize:13,minWidth:28,textAlign:"center"}}>{l.type.split(" ")[0]}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>{l.type.replace(/^.\s/,"")}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:1}}>{l.desc}</div>
                  </div>
                  <div style={{fontSize:10,color:C.dim,flexShrink:0}}>{l.ts}</div>
                </div>
              ))}
            </div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BET TRACKER · App.tsx (rev.3 - 2026-04-22)
// 변경사항:
//  - 베팅 탭: API-Sports 직접 호출 + localStorage 15분 캐시로 전환
//  - 6종목 지원 (축구/야구/농구/배구/하키/E스포츠)
//  - 종목 메뉴 크게 · 국가 메뉴 크게 · 3컬럼 독립 스크롤
//  - Supabase events 테이블 의존 제거 (베팅 탭 한정)
// ─────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from "recharts";
import * as db from "./lib/db";
import type { Bet, Deposit, Withdrawal, SiteState as SiteStateBase, Log, EsportsRecord, ProfitExtra } from "./types";

type SiteState = SiteStateBase & { pointTotal?: number };

// ── 테마 컬러 ─────────────────────────────────────────────────
const C = {
  bg:      "#111614",
  bg2:     "#182018",
  bg3:     "#1e261e",
  border:  "#2a3a2a",
  border2: "#344534",
  text:    "#dde8dd",
  muted:   "#7a9a7a",
  dim:     "#3a5a3a",
  green:   "#5ddb8a",
  orange:  "#f0944a",
  amber:   "#f5c842",
  red:     "#e05a5a",
  purple:  "#b07af5",
  teal:    "#4ad4c8",
};

// ══════════════════════════════════════════════════════════════
// API-Sports 직접 호출 + localStorage 15분 캐시
// ══════════════════════════════════════════════════════════════
type Sport = "football" | "baseball" | "basketball" | "volleyball" | "hockey";

interface LiveFixture {
  id: number;
  sport: Sport;
  league_id: number;
  league_name: string;
  country: string;
  home_team: string;
  away_team: string;
  start_time: string;
  status_short: string;
  status_long: string;
  elapsed: number | null;
  home_score: number | null;
  away_score: number | null;
}

const API_SPORTS_KEY: string = (() => {
  try { return (import.meta as any)?.env?.VITE_API_SPORTS_KEY || ""; }
  catch { return ""; }
})();
const API_CACHE_TTL = 15 * 60 * 1000;
const API_CACHE_PREFIX = "bt_apisports_";

const API_HOST: Record<Sport, string> = {
  football:   "v3.football.api-sports.io",
  baseball:   "v1.baseball.api-sports.io",
  basketball: "v1.basketball.api-sports.io",
  volleyball: "v1.volleyball.api-sports.io",
  hockey:     "v1.hockey.api-sports.io",
};

function kstDateStr(offsetDays = 0): string {
  return new Date(Date.now() + (9 + offsetDays * 24) * 3600_000).toISOString().slice(0, 10);
}
function apiCacheKey(sport: Sport) { return `${API_CACHE_PREFIX}${sport}_${kstDateStr()}`; }

function getApiCacheInfo(sport: Sport): { fetchedAt: number | null; expiresAt: number | null } {
  try {
    const raw = localStorage.getItem(apiCacheKey(sport));
    if (!raw) return { fetchedAt: null, expiresAt: null };
    const c = JSON.parse(raw);
    return { fetchedAt: c.fetchedAt, expiresAt: c.fetchedAt + API_CACHE_TTL };
  } catch { return { fetchedAt: null, expiresAt: null }; }
}

function readApiCache(sport: Sport): LiveFixture[] | null {
  try {
    const raw = localStorage.getItem(apiCacheKey(sport));
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - c.fetchedAt > API_CACHE_TTL) return null;
    return c.data;
  } catch { return null; }
}

function writeApiCache(sport: Sport, data: LiveFixture[]) {
  try {
    localStorage.setItem(apiCacheKey(sport), JSON.stringify({ fetchedAt: Date.now(), data }));
    localStorage.removeItem(`${API_CACHE_PREFIX}${sport}_${kstDateStr(-1)}`);
  } catch {}
}

async function fetchFixturesFromApi(sport: Sport): Promise<LiveFixture[]> {
  if (!API_SPORTS_KEY) throw new Error("VITE_API_SPORTS_KEY 환경변수가 없습니다.");
  const today = kstDateStr(0), tomorrow = kstDateStr(1);
  const all: LiveFixture[] = [];

  for (const date of [today, tomorrow]) {
    const path = sport === "football" ? "fixtures" : "games";
    const url = `https://${API_HOST[sport]}/${path}?date=${date}`;
    try {
      const r = await fetch(url, {
        headers: { "x-rapidapi-key": API_SPORTS_KEY, "x-rapidapi-host": API_HOST[sport] },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const arr: any[] = j?.response ?? [];
      for (const item of arr) {
        try {
          if (sport === "football") {
            const f = item.fixture, l = item.league, t = item.teams, g = item.goals;
            all.push({
              id: f.id, sport, league_id: l.id, league_name: l.name,
              country: l.country || "",
              home_team: t.home?.name || "", away_team: t.away?.name || "",
              start_time: f.date,
              status_short: f.status?.short || "NS",
              status_long: f.status?.long || "",
              elapsed: f.status?.elapsed ?? null,
              home_score: g?.home ?? null, away_score: g?.away ?? null,
            });
          } else {
            const l = item.league, t = item.teams, s = item.scores;
            all.push({
              id: item.id, sport,
              league_id: l?.id ?? 0, league_name: l?.name ?? "",
              country: l?.country?.name || "",
              home_team: t?.home?.name || "", away_team: t?.away?.name || "",
              start_time: item.date,
              status_short: item.status?.short || "NS",
              status_long: item.status?.long || "",
              elapsed: item.status?.timer ?? null,
              home_score: s?.home?.total ?? s?.home ?? null,
              away_score: s?.away?.total ?? s?.away ?? null,
            });
          }
        } catch {}
      }
    } catch (e) { console.error(`[API-Sports ${sport} ${date}]`, e); }
  }

  const now = Date.now();
  return all
    .filter(f => {
      const t = new Date(f.start_time).getTime();
      return t >= now - 3 * 3600_000 && t <= now + 24 * 3600_000;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

async function fetchFixtures(sport: Sport, force = false): Promise<LiveFixture[]> {
  if (!force) {
    const cached = readApiCache(sport);
    if (cached) return cached;
  }
  const data = await fetchFixturesFromApi(sport);
  writeApiCache(sport, data);
  return data;
}

// ── 종목 메타 ────────────────────────────────────────────────
const SPORT_META: Record<Sport|"esports", {icon:string; label:string; color:string; kr:string}> = {
  football:   {icon:"⚽", label:"축구",    color:C.green,    kr:"축구"},
  baseball:   {icon:"⚾", label:"야구",    color:C.amber,    kr:"야구"},
  basketball: {icon:"🏀", label:"농구",    color:C.orange,   kr:"농구"},
  volleyball: {icon:"🏐", label:"배구",    color:C.teal,     kr:"배구"},
  hockey:     {icon:"🏒", label:"하키",    color:"#7ac4ff",  kr:"하키"},
  esports:    {icon:"🎮", label:"E스포츠", color:C.purple,   kr:"E스포츠"},
};
const SPORT_ORDER: (Sport|"esports")[] = ["football","baseball","basketball","volleyball","hockey","esports"];

// ── 국가 한글 매핑 ──────────────────────────────────────────
const COUNTRY_KR: Record<string,string> = {
  "England":"잉글랜드","Spain":"스페인","Germany":"독일","Italy":"이탈리아","France":"프랑스",
  "Netherlands":"네덜란드","Portugal":"포르투갈","Belgium":"벨기에","Turkey":"터키","Scotland":"스코틀랜드",
  "USA":"미국","Brazil":"브라질","Argentina":"아르헨티나","Mexico":"멕시코","Colombia":"콜롬비아",
  "Chile":"칠레","Peru":"페루","Bolivia":"볼리비아","Ecuador":"에콰도르","Uruguay":"우루과이",
  "Paraguay":"파라과이","Venezuela":"베네수엘라","Costa Rica":"코스타리카","Guatemala":"과테말라",
  "Japan":"일본","South Korea":"한국","South-Korea":"한국","Korea":"한국","China":"중국","Australia":"호주","India":"인도",
  "Saudi Arabia":"사우디","Saudi-Arabia":"사우디","UAE":"아랍에미리트","Qatar":"카타르","Iran":"이란","Iraq":"이라크",
  "Greece":"그리스","Croatia":"크로아티아","Serbia":"세르비아","Poland":"폴란드","Russia":"러시아",
  "Ukraine":"우크라이나","Czech Republic":"체코","Czech-Republic":"체코","Slovakia":"슬로바키아",
  "Hungary":"헝가리","Romania":"루마니아","Bulgaria":"불가리아","Austria":"오스트리아","Switzerland":"스위스",
  "Denmark":"덴마크","Sweden":"스웨덴","Norway":"노르웨이","Finland":"핀란드",
  "Nigeria":"나이지리아","Ghana":"가나","Egypt":"이집트","Morocco":"모로코","South Africa":"남아프리카",
  "Cameroon":"카메룬","Senegal":"세네갈","Algeria":"알제리","Tunisia":"튀니지",
  "World":"국제","Europe":"유럽","South America":"남미","Africa":"아프리카","Asia":"아시아",
  "Canada":"캐나다","Israel":"이스라엘","Cyprus":"키프로스","Albania":"알바니아",
  "North Korea":"북한","Indonesia":"인도네시아","Thailand":"태국","Vietnam":"베트남",
  "Malaysia":"말레이시아","Philippines":"필리핀","Singapore":"싱가포르",
  "International":"국제","United States":"미국","Republic of Ireland":"아일랜드",
  "Wales":"웨일즈","Northern Ireland":"북아일랜드","Taiwan":"대만","Chinese Taipei":"대만",
};
const ktr = (c:string) => COUNTRY_KR[c] || c || "기타";

// MLB 팀명
const MLB_TEAMS: Record<string,string> = {
  "Arizona Diamondbacks":"애리조나 다이아몬드백스","Atlanta Braves":"애틀랜타 브레이브스",
  "Baltimore Orioles":"볼티모어 오리올스","Boston Red Sox":"보스턴 레드삭스",
  "Chicago Cubs":"시카고 컵스","Chicago White Sox":"시카고 화이트삭스",
  "Cincinnati Reds":"신시내티 레즈","Cleveland Guardians":"클리블랜드 가디언스",
  "Colorado Rockies":"콜로라도 로키스","Detroit Tigers":"디트로이트 타이거스",
  "Houston Astros":"휴스턴 애스트로스","Kansas City Royals":"캔자스시티 로열스",
  "Los Angeles Angels":"LA 에인절스","Los Angeles Dodgers":"LA 다저스",
  "Miami Marlins":"마이애미 말린스","Milwaukee Brewers":"밀워키 브루어스",
  "Minnesota Twins":"미네소타 트윈스","New York Mets":"뉴욕 메츠",
  "New York Yankees":"뉴욕 양키스","Oakland Athletics":"오클랜드 애슬레틱스",
  "Athletics":"오클랜드 애슬레틱스","Philadelphia Phillies":"필라델피아 필리스",
  "Pittsburgh Pirates":"피츠버그 파이리츠","San Diego Padres":"샌디에이고 파드리스",
  "San Francisco Giants":"샌프란시스코 자이언츠","Seattle Mariners":"시애틀 매리너스",
  "St. Louis Cardinals":"세인트루이스 카디널스","Tampa Bay Rays":"탬파베이 레이스",
  "Texas Rangers":"텍사스 레인저스","Toronto Blue Jays":"토론토 블루제이스",
  "Washington Nationals":"워싱턴 내셔널스",
};
const NBA_TEAMS: Record<string,string> = {
  "Atlanta Hawks":"애틀랜타 호크스","Boston Celtics":"보스턴 셀틱스","Brooklyn Nets":"브루클린 네츠",
  "Charlotte Hornets":"샬럿 호네츠","Chicago Bulls":"시카고 불스","Cleveland Cavaliers":"클리블랜드 캐벌리어스",
  "Dallas Mavericks":"댈러스 매버릭스","Denver Nuggets":"덴버 너기츠","Detroit Pistons":"디트로이트 피스톤스",
  "Golden State Warriors":"골든스테이트 워리어스","Houston Rockets":"휴스턴 로케츠",
  "Indiana Pacers":"인디애나 페이서스","LA Clippers":"LA 클리퍼스","Los Angeles Clippers":"LA 클리퍼스",
  "Los Angeles Lakers":"LA 레이커스","Memphis Grizzlies":"멤피스 그리즐리스","Miami Heat":"마이애미 히트",
  "Milwaukee Bucks":"밀워키 벅스","Minnesota Timberwolves":"미네소타 팀버울브스",
  "New Orleans Pelicans":"뉴올리언스 펠리컨스","New York Knicks":"뉴욕 닉스",
  "Oklahoma City Thunder":"오클라호마시티 선더","Orlando Magic":"올랜도 매직",
  "Philadelphia 76ers":"필라델피아 세븐티식서스","Phoenix Suns":"피닉스 선즈",
  "Portland Trail Blazers":"포틀랜드 트레일블레이저스","Sacramento Kings":"새크라멘토 킹스",
  "San Antonio Spurs":"샌안토니오 스퍼스","Toronto Raptors":"토론토 랩터스",
  "Utah Jazz":"유타 재즈","Washington Wizards":"워싱턴 위저즈",
};
function translateTeamName(name: string, userMap: Record<string,string>): string {
  return userMap[name] || MLB_TEAMS[name] || NBA_TEAMS[name] || name;
}

type TeamNameMap = Record<string,string>;
const loadTeamNames = (): TeamNameMap => { try { const v=localStorage.getItem("bt_team_names"); return v?JSON.parse(v):{}; } catch { return {}; } };
const saveTeamNames = (m:TeamNameMap) => { try { localStorage.setItem("bt_team_names",JSON.stringify(m)); } catch {} };

function isLive(s:string){ return !["NS","FT","AET","FT_PEN","CANC","PST","ABD","AWD","WO","TBD","AOT","AP"].includes(s); }
function isFinished(s:string){ return ["FT","AET","FT_PEN","AOT","AP"].includes(s); }
function fmtKstTime(iso:string){ try{return new Date(iso).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false});}catch{return "";} }
function fmtKstDate(iso:string){ try{return new Date(iso).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul",month:"2-digit",day:"2-digit"});}catch{return "";} }

// ── 날짜 유틸 ──────────────────────────────────────────────────
const useTodayStr = () => {
  const [today, setToday] = useState(()=>new Date().toISOString().slice(0,10));
  useEffect(()=>{const id=setInterval(()=>{const n=new Date().toISOString().slice(0,10);setToday(p=>p!==n?n:p);},60000);return()=>clearInterval(id);},[]);
  return today;
};
const weekMonday = () => { const d=new Date(),day=d.getDay(),diff=day===0?-6:1-day; d.setDate(d.getDate()+diff); return d.toISOString().slice(0,10); };

// ── 기본 사이트 상수 ───────────────────────────────────────────
const DEFAULT_KRW_SITES = ["이지벳","조인벳","벨라벳"];
const DEFAULT_USD_SITES = ["벳38","케이탑","벳16","고트벳","벳위즈"];

// ── 포인트 사이트 타입 ────────────────────────────────────────
interface PointSite {
  id: string;
  name: string;
  exchangeName: string;
  exchangeDate: string;
  targetAmount: number;
  sessions: PointSession[];
}
interface PointSession {
  id: string;
  completedAt: string;
  nextTargetDate: string;
}

const fmtDisp = (n:number,dollar:boolean) => dollar?`$${n%1===0?n:n.toFixed(2)}`:n.toLocaleString();
const fmtProfit = (n:number,dollar:boolean) => { const abs=Math.abs(n); const str=dollar?`$${abs%1===0?abs:abs.toFixed(2)}`:abs.toLocaleString(); return n>=0?`+${str}`:`-${str}`; };

const MAJOR:Record<string,string[]> = {
  축구:["프리미어리그","라리가","분데스리가","세리에A","리그1","챔피언스리그"],
  농구:["NBA","NCAA","유로리그"],
  야구:["MLB","KBO","NPB"],
  배구:["V리그 남자","V리그 여자"],
  E스포츠:["LCK","LPL","LEC","LCS","LCP","CBLOL"],
};
const EXTRA:Record<string,string[]> = {
  축구:["K리그","유로파리그","유로파컨퍼런스리그","UEFA 네이션스리그","에레디비시","포르투갈리그","터키 쉬퍼리그","벨기에 퍼스트A","MLS","브라질 세리에A","아르헨티나 프리메라","일본 J리그","호주 A리그"].sort(),
  농구:["NHL","NFL","UFC"].sort(),
  야구:[],
  배구:["이탈리아 세리에A","일본 V리그"].sort(),
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
const getDefaultOpt = (_cat:string,_g:string,_league="") => "";

const TEAM_DB = ["뉴욕 양키스","LA 다저스","보스턴 레드삭스","시카고 컵스","샌프란시스코 자이언츠","휴스턴 애스트로스","애틀란타 브레이브스","뉴욕 메츠","필라델피아 필리스","샌디에이고 파드리스","시애틀 매리너스","토론토 블루제이스","미네소타 트윈스","클리블랜드 가디언스","텍사스 레인저스","탬파베이 레이스","볼티모어 오리올스","밀워키 브루어스","애리조나 다이아몬드백스","LA 에인절스","오클랜드 애슬레틱스","콜로라도 로키스","캔자스시티 로열스","피츠버그 파이리츠","신시내티 레즈","마이애미 말린스","워싱턴 내셔널스","디트로이트 타이거스","시카고 화이트삭스","세인트루이스 카디널스","LA 레이커스","골든스테이트 워리어스","보스턴 셀틱스","마이애미 히트","시카고 불스","브루클린 네츠","밀워키 벅스","피닉스 선즈","댈러스 매버릭스","덴버 너기츠","멤피스 그리즐리스","필라델피아 세븐티식서스","애틀란타 호크스","클리블랜드 캐벌리어스","뉴욕 닉스","토론토 랩터스","새크라멘토 킹스","뉴올리언스 펠리컨스","인디애나 페이서스","미네소타 팀버울브스","오클라호마시티 선더","포틀랜드 트레일블레이저스","유타 재즈","샌안토니오 스퍼스","샬럿 호네츠","워싱턴 위저즈","올랜도 매직","디트로이트 피스톤스","휴스턴 로케츠","LA 클리퍼스","맨체스터 시티","아스날","리버풀","첼시","맨체스터 유나이티드","토트넘","레알 마드리드","바르셀로나","아틀레티코 마드리드","바이에른 뮌헨","도르트문트","인테르 밀란","AC 밀란","유벤투스","파리 생제르맹","T1","Gen.G","DK","KT","BRO","NS","DRX","HLE","FNC","G2","C9","TL","NRG","100T","EG","FLY","BLG","JDG","EDG","WBG"];

const CATS = ["축구","농구","야구","배구","E스포츠"];
const SPORT_ICON:Record<string,string> = {"축구":"⚽","농구":"🏀","야구":"⚾","배구":"🏐","E스포츠":"🎮","하키":"🏒","모의":"🎯"};
const USD_TO_KRW = 1380;

const noSpin:React.CSSProperties = {MozAppearance:"textfield"} as any;
const S:React.CSSProperties = {width:"100%",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 9px",borderRadius:7,fontSize:13,...noSpin};
const L:React.CSSProperties = {fontSize:11,color:C.muted,marginBottom:3};

const KRW_HK=[10000,20000,30000,40000,50000];
const USD_HK=[10,20,30,40,50];

// ── 비밀번호 화면 ─────────────────────────────────────────────
function PasswordScreen({onAuth}:{onAuth:()=>void}) {
  const [pw,setPw]=useState("");
  const [err,setErr]=useState(false);
  const [shake,setShake]=useState(false);
  const handleSubmit=()=>{
    if(pw==="03144"){onAuth();}
    else{setErr(true);setShake(true);setPw("");setTimeout(()=>setShake(false),500);}
  };
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:20}}>
      <div style={{fontSize:36,marginBottom:4}}>⚡</div>
      <div style={{fontSize:22,fontWeight:900,letterSpacing:3,color:C.orange}}>BET TRACKER</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>관리자 인증이 필요합니다</div>
      <div style={{
        background:C.bg3,border:`1px solid ${err?C.red:C.border2}`,borderRadius:14,padding:"28px 32px",width:300,
        animation:shake?"shake 0.4s ease":"none",
      }}>
        <div style={{fontSize:12,color:C.muted,marginBottom:10,textAlign:"center"}}>🔒 비밀번호 입력</div>
        <input
          autoFocus type="password" value={pw}
          onChange={e=>{setPw(e.target.value);setErr(false);}}
          onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
          placeholder="비밀번호"
          style={{...S,boxSizing:"border-box",textAlign:"center",fontSize:18,letterSpacing:6,marginBottom:12}}
        />
        {err&&<div style={{fontSize:11,color:C.red,textAlign:"center",marginBottom:8}}>비밀번호가 틀렸습니다</div>}
        <button onClick={handleSubmit} style={{width:"100%",background:`${C.orange}22`,border:`1px solid ${C.orange}`,color:C.orange,padding:"10px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:14}}>
          입장
        </button>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ── 공통 컴포넌트 ──────────────────────────────────────────────
function EditableCell({value,dollar,onSave,color}:{value:number,dollar:boolean,onSave:(v:number)=>void,color?:string}) {
  const [editing,setEditing]=useState(false); const [tmp,setTmp]=useState("");
  if(!editing) return <div onClick={()=>{setTmp(String(value));setEditing(true);}} style={{color:color??C.text,fontWeight:700,cursor:"pointer",textDecoration:"underline dotted",textDecorationColor:C.dim}}>{fmtDisp(value,dollar)}</div>;
  return <input autoFocus type="number" value={tmp} onChange={e=>setTmp(e.target.value)} onBlur={()=>{const v=parseFloat(tmp);if(!isNaN(v)&&v>=0)onSave(v);setEditing(false);}} onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(tmp);if(!isNaN(v)&&v>=0)onSave(v);setEditing(false);}if(e.key==="Escape")setEditing(false);}} style={{width:"80px",background:C.bg,border:`1px solid ${C.teal}`,color:C.teal,padding:"2px 4px",borderRadius:4,fontSize:12,fontWeight:700,...noSpin}} onClick={e=>e.stopPropagation()} />;
}

// ── 실시간 환율 ──────────────────────────────────────────
async function fetchUsdKrw():Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    return Math.round(d?.rates?.KRW??1380);
  } catch { return 1380; }
}

// ═════════════════════════════════════════════════════════════
// ErrorBoundary - 어떤 에러가 나도 흰 화면 안 나오게 방어
// ═════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component<{children:React.ReactNode},{err:Error|null}> {
  constructor(p:any){super(p);this.state={err:null};}
  static getDerivedStateFromError(err:Error){return {err};}
  componentDidCatch(err:Error,info:any){console.error("[BetTracker Crash]",err,info);}
  render(){
    if(this.state.err){
      return (
        <div style={{minHeight:"100vh",background:"#111614",color:"#dde8dd",padding:24,fontFamily:"system-ui"}}>
          <div style={{fontSize:20,color:"#e05a5a",fontWeight:900,marginBottom:12}}>⚠ 앱에 에러가 발생했습니다</div>
          <div style={{fontSize:12,color:"#7a9a7a",marginBottom:8}}>에러 메시지:</div>
          <pre style={{background:"#1e261e",border:"1px solid #2a3a2a",borderRadius:8,padding:12,fontSize:11,overflow:"auto",color:"#f0944a",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
{String(this.state.err?.message || this.state.err)}
{"\n\n"}
{String(this.state.err?.stack || "")}
          </pre>
          <button onClick={()=>{try{sessionStorage.clear();localStorage.clear();}catch{};location.reload();}}
            style={{marginTop:16,padding:"10px 20px",background:"#5ddb8a22",border:"1px solid #5ddb8a",color:"#5ddb8a",borderRadius:8,cursor:"pointer",fontWeight:700}}>
            🔄 세션 초기화 후 다시 시작
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═════════════════════════════════════════════════════════════
export default function AppWrapper() {
  return <ErrorBoundary><AppMain/></ErrorBoundary>;
}

function AppMain() {
  // ── 비밀번호 / 세션 ───────────────────────────────────────
  const [authed,setAuthed]=useState(()=>{
    try{const v=sessionStorage.getItem("bt_auth");const t=sessionStorage.getItem("bt_auth_ts");
    if(v==="1"&&t&&Date.now()-parseInt(t)<2*60*60*1000)return true;}catch{}return false;
  });
  const lastActivity=useRef(Date.now());
  const handleAuth=()=>{setAuthed(true);try{sessionStorage.setItem("bt_auth","1");sessionStorage.setItem("bt_auth_ts",String(Date.now()));}catch{}};
  const logout=useCallback(()=>{setAuthed(false);try{sessionStorage.removeItem("bt_auth");sessionStorage.removeItem("bt_auth_ts");}catch{};},[]);

  useEffect(()=>{
    if(!authed)return;
    const reset=()=>{lastActivity.current=Date.now();try{sessionStorage.setItem("bt_auth_ts",String(Date.now()));}catch{}};
    window.addEventListener("mousemove",reset);window.addEventListener("keydown",reset);window.addEventListener("click",reset);window.addEventListener("touchstart",reset);
    const id=setInterval(()=>{if(Date.now()-lastActivity.current>2*60*60*1000)logout();},60000);
    return()=>{window.removeEventListener("mousemove",reset);window.removeEventListener("keydown",reset);window.removeEventListener("click",reset);window.removeEventListener("touchstart",reset);clearInterval(id);};
  },[authed,logout]);

  const today = useTodayStr();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab,setTab]=useState<"home"|"betting"|"bettingManual"|"bettingCombo"|"stats"|"roi"|"strategy"|"log"|"points"|"pending">("home");
  const [statTab,setStatTab]=useState<"overview"|"daily"|"baseball"|"adv">("overview");
  const [bbSub,setBbSub]=useState<"league"|"option">("league");
  const [advCat,setAdvCat]=useState("축구");
  const [advMode,setAdvMode]=useState<"league"|"option">("league");
  const [showOldDone,setShowOldDone]=useState(false);
  const [stratCat,setStratCat]=useState("축구");
  const [esportsStratLeague,setEsportsStratLeague]=useState("LCK");

  // ── 사이트 목록 ────────────────────────────────────────────
  const [krwSites,setKrwSites]=useState<string[]>(()=>{try{const v=localStorage.getItem("bt_krw_sites");return v?JSON.parse(v):DEFAULT_KRW_SITES;}catch{return DEFAULT_KRW_SITES;}});
  const [usdSites,setUsdSites]=useState<string[]>(()=>{try{const v=localStorage.getItem("bt_usd_sites");return v?JSON.parse(v):DEFAULT_USD_SITES;}catch{return DEFAULT_USD_SITES;}});
  const ALL_SITES = useMemo(()=>[...krwSites,...usdSites],[krwSites,usdSites]);
  const isUSD = useCallback((s:string)=>usdSites.includes(s),[usdSites]);

  const saveKrwSites=(sites:string[])=>{setKrwSites(sites);try{localStorage.setItem("bt_krw_sites",JSON.stringify(sites));}catch{}};
  const saveUsdSites=(sites:string[])=>{setUsdSites(sites);try{localStorage.setItem("bt_usd_sites",JSON.stringify(sites));}catch{}};

  const [siteManageModal,setSiteManageModal]=useState(false);
  const [newSiteName,setNewSiteName]=useState("");
  const [newSiteType,setNewSiteType]=useState<"krw"|"usd">("krw");

  const handleAddSite=()=>{
    const name=newSiteName.trim();if(!name)return;
    if(ALL_SITES.includes(name))return alert("이미 존재하는 사이트입니다.");
    if(newSiteType==="krw")saveKrwSites([...krwSites,name]);
    else saveUsdSites([...usdSites,name]);
    setNewSiteName("");
  };
  const handleDeleteSite=(site:string)=>{
    if(!window.confirm(`"${site}" 사이트를 삭제하시겠습니까?`))return;
    if(krwSites.includes(site))saveKrwSites(krwSites.filter(s=>s!==site));
    else saveUsdSites(usdSites.filter(s=>s!==site));
  };

  // ── 팀명 한글 매핑 ───────────────────────────────────────────
  const [teamNameMap,setTeamNameMap] = useState<Record<string,string>>(loadTeamNames);
  const [teamNameModal,setTeamNameModal] = useState(false);
  const [tnSearch,setTnSearch] = useState("");
  const [tnNewEng,setTnNewEng] = useState("");
  const [tnNewKor,setTnNewKor] = useState("");
  const saveTeamNameEntry = (eng:string,kor:string) => {
    const m = {...teamNameMap,[eng.trim()]:kor.trim()};
    setTeamNameMap(m); saveTeamNames(m);
  };
  const deleteTeamNameEntry = (eng:string) => {
    const m = {...teamNameMap}; delete m[eng];
    setTeamNameMap(m); saveTeamNames(m);
  };
  const t = (name:string) => translateTeamName(name, teamNameMap);

  // ══════════════════════════════════════════════════════════
  // 베팅 탭 상태 (API-Sports 직접 호출 + 15분 캐시)
  // ══════════════════════════════════════════════════════════
  const [bettingSport,setBettingSport]=useState<Sport|"esports">("football");
  const [bettingFixtures,setBettingFixtures]=useState<LiveFixture[]>([]);
  const [bettingLoading,setBettingLoading]=useState(false);
  const [bettingError,setBettingError]=useState("");
  const [bettingCacheInfo,setBettingCacheInfo]=useState<{fetchedAt:number|null; expiresAt:number|null}>({fetchedAt:null,expiresAt:null});
  const [nowTick,setNowTick]=useState(Date.now());

  const [bettingCountry,setBettingCountry]=useState<string>("");
  const [bettingLeague,setBettingLeague]=useState<string>("");
  const [bettingExpandedGameId,setBettingExpandedGameId]=useState<number|null>(null);

  const loadBettingData = useCallback(async(force = false)=>{
    if (bettingSport === "esports") { setBettingFixtures([]); return; }
    setBettingLoading(true); setBettingError("");
    try {
      const data = await fetchFixtures(bettingSport, force);
      setBettingFixtures(data);
      setBettingCacheInfo(getApiCacheInfo(bettingSport));
      if (data.length === 0) setBettingError("경기 데이터가 없습니다");
    } catch(e:any) {
      setBettingError(e?.message || "불러오기 실패");
    } finally { setBettingLoading(false); }
  },[bettingSport]);

  // 매 30초마다 캐시 남은 시간 UI 갱신
  useEffect(()=>{
    const id = setInterval(()=>setNowTick(Date.now()), 30_000);
    return ()=>clearInterval(id);
  },[]);

  // 종목 바뀌면 자동 로드 (캐시 우선)
  useEffect(()=>{
    setBettingCountry(""); setBettingLeague(""); setBettingExpandedGameId(null);
    if (tab==="betting") loadBettingData(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bettingSport,tab]);

  // 15분마다 자동 갱신 시도 (캐시 만료 시에만 실제 API 호출)
  useEffect(()=>{
    if (tab!=="betting" || bettingSport==="esports") return;
    const id = setInterval(()=>loadBettingData(false), 15*60_000);
    return ()=>clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab,bettingSport]);

  // ── 베팅 슬립 ──────────────────────────────────────────────
  interface SlipItem {
    id: string;
    game: LiveFixture;
    optLabel: string;
    odds: number;
  }
  const [slip,setSlip]=useState<SlipItem[]>([]);
  const [slipSite,setSlipSite]=useState<string>("");
  const [slipAmount,setSlipAmount]=useState<number>(10000);
  const [slipInclude,setSlipInclude]=useState<boolean>(true);

  const slipGameIds = useMemo(()=>new Set(slip.map(s=>s.id)), [slip]);

  const handleSlipPick = useCallback((game: LiveFixture, optLabel: string) => {
    const id = `${game.id}_${optLabel}`;
    setSlip(prev => {
      // 이미 같은 조합이면 제거 (토글)
      if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
      // 같은 경기의 다른 옵션이 있으면 제거하고 새것 추가
      const filtered = prev.filter(s => s.game.id !== game.id);
      return [...filtered, { id, game, optLabel, odds: 0 }];
    });
  },[]);

  const handleSlipAdd=()=>{
    if(slip.length===0) return alert("경기를 선택하세요.");
    if(!slipSite) return alert("베팅사이트를 선택해주세요.");
    const missingOdds = slip.find(s => !s.odds || s.odds < 1);
    if(missingOdds) return alert(`${missingOdds.game.home_team} vs ${missingOdds.game.away_team} 의 배당률을 입력해주세요.`);

    const dollar=isUSD(slipSite);
    slip.forEach(item=>{
      const homeKr=translateTeamName(item.game.home_team, teamNameMap);
      const awayKr=translateTeamName(item.game.away_team, teamNameMap);
      const teamName =
        item.optLabel === "홈승" ? homeKr :
        item.optLabel === "원정승" ? awayKr :
        item.optLabel === "무승부" ? "무승부" : "";
      const bet:Bet={
        id:String(Date.now()+Math.random()),date:today,
        category:SPORT_META[item.game.sport]?.kr || item.game.sport,
        league:item.game.league_name,site:slipSite,
        betOption:item.optLabel,homeTeam:homeKr,awayTeam:awayKr,teamName,
        amount:slipAmount,odds:item.odds,profit:null,result:"진행중",
        includeStats:slipInclude,isDollar:dollar,
      };
      setBetsRaw(b=>[...b,bet]);db.upsertBet(bet);
      const newSS={...siteStates,[slipSite]:{...siteStates[slipSite],betTotal:parseFloat((siteStates[slipSite].betTotal+slipAmount).toFixed(2))}};
      setSiteStatesRaw(newSS);db.upsertSiteState(slipSite,newSS[slipSite]);
      addLog("➕ 베팅",`${homeKr} vs ${awayKr}/${item.optLabel}/${fmtDisp(slipAmount,dollar)}`);
    });
    setSlip([]);
  };

  // 모의 베팅 (사용 안 하지만 타입 호환)
  const [mockBets,setMockBets]=useState<Bet[]>([]);
  const removeMockBet=(id:string)=>setMockBets(p=>p.filter(b=>b.id!==id));

  // ══════════════════════════════════════════════════════════
  // 수동 경기 시스템 (bettingManual 탭 - 기본 베팅)
  // ══════════════════════════════════════════════════════════
  interface ManualGame {
    id: string;
    country: string;
    league: string;
    homeTeam: string;
    awayTeam: string;
    sportCat: string;    // 축구/야구/농구/배구/E스포츠/하키/기타
    createdAt: number;
  }
  const [manualGames,setManualGames]=useState<ManualGame[]>(()=>{
    try{const v=localStorage.getItem("bt_manual_games");return v?JSON.parse(v):[];}catch{return [];}
  });
  const saveManualGames=(gs:ManualGame[])=>{
    setManualGames(gs);
    try{localStorage.setItem("bt_manual_games",JSON.stringify(gs));}catch{}
  };

  // 커스텀 종목/국가/리그 목록 (경기 없어도 유지)
  const DEFAULT_SPORTS = ["축구","야구","농구","배구","하키","E스포츠"];
  const [customSports,setCustomSports]=useState<string[]>(()=>{
    try{const v=localStorage.getItem("bt_m_sports");return v?JSON.parse(v):[];}catch{return [];}
  });
  const saveCustomSports=(l:string[])=>{setCustomSports(l);try{localStorage.setItem("bt_m_sports",JSON.stringify(l));}catch{}};
  const allSportsList = useMemo(()=>{
    const base=[...DEFAULT_SPORTS];
    for(const c of customSports) if(!base.includes(c)) base.push(c);
    return base;
  },[customSports]);

  // { sport: { country: [leagues...] } }
  const [mCountries,setMCountries]=useState<Record<string,string[]>>(()=>{
    try{const v=localStorage.getItem("bt_m_countries");return v?JSON.parse(v):{};}catch{return {};}
  });
  const saveMCountries=(m:Record<string,string[]>)=>{setMCountries(m);try{localStorage.setItem("bt_m_countries",JSON.stringify(m));}catch{}};

  const [mLeagues,setMLeagues]=useState<Record<string,string[]>>(()=>{
    // key: `${sport}__${country}`, value: leagues
    try{const v=localStorage.getItem("bt_m_leagues");return v?JSON.parse(v):{};}catch{return {};}
  });
  const saveMLeaguesStore=(m:Record<string,string[]>)=>{setMLeagues(m);try{localStorage.setItem("bt_m_leagues",JSON.stringify(m));}catch{}};

  // 경기에서 자동 추론한 것 + 수동 추가한 것을 합친 뷰
  const allCountriesForSport = useCallback((sport:string):string[]=>{
    const set = new Set<string>();
    manualGames.forEach(g=>{if(g.sportCat===sport)set.add(g.country);});
    (mCountries[sport]||[]).forEach(c=>set.add(c));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,"ko"));
  },[manualGames,mCountries]);

  const allLeaguesForCountry = useCallback((sport:string,country:string):string[]=>{
    const set = new Set<string>();
    manualGames.forEach(g=>{if(g.sportCat===sport&&g.country===country)set.add(g.league);});
    (mLeagues[`${sport}__${country}`]||[]).forEach(l=>set.add(l));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,"ko"));
  },[manualGames,mLeagues]);

  // 선택 상태
  const [mSport,setMSport]=useState<string>("축구");
  const [mCountry,setMCountry]=useState<string>("");
  const [mLeague,setMLeague]=useState<string>("");
  // 트리 확장 상태 (종목별 접기/펼치기)
  const [mExpandedSports,setMExpandedSports]=useState<Record<string,boolean>>({"축구":true});
  const [mExpandedCountries,setMExpandedCountries]=useState<Record<string,boolean>>({});
  const [mExpandedLeagues,setMExpandedLeagues]=useState<Record<string,boolean>>({});

  // 모달 상태
  const [addGameModal,setAddGameModal]=useState(false);
  const [newGame,setNewGame]=useState({homeTeam:"",awayTeam:""});
  const [addSportModal,setAddSportModal]=useState(false);
  const [newSportName,setNewSportName]=useState("");
  const [addCountryModal,setAddCountryModal]=useState<{sport:string}|null>(null);
  const [newCountryName,setNewCountryName]=useState("");
  const [addLeagueModalM,setAddLeagueModalM]=useState<{sport:string;country:string}|null>(null);
  const [newLeagueNameM,setNewLeagueNameM]=useState("");

  const handleAddManualGame=()=>{
    const {homeTeam,awayTeam}=newGame;
    if(!mSport||!mCountry||!mLeague)return alert("먼저 좌측에서 종목/국가/리그를 선택해주세요.");
    if(!homeTeam.trim()||!awayTeam.trim())return alert("홈팀과 원정팀을 입력해주세요.");
    const g:ManualGame={
      id:String(Date.now()),
      country:mCountry,league:mLeague,
      homeTeam:homeTeam.trim(),awayTeam:awayTeam.trim(),
      sportCat:mSport,createdAt:Date.now(),
    };
    saveManualGames([g,...manualGames]);
    setAddGameModal(false);
    setNewGame({homeTeam:"",awayTeam:""});
    addLog("➕ 경기 추가",`${mCountry}/${mLeague}/${homeTeam} vs ${awayTeam}`);
  };

  const handleAddSport=()=>{
    const n=newSportName.trim();if(!n)return;
    if(allSportsList.includes(n))return alert("이미 존재합니다.");
    saveCustomSports([...customSports,n]);
    setAddSportModal(false);setNewSportName("");
    setMExpandedSports(p=>({...p,[n]:true}));
  };

  const handleAddCountry=()=>{
    if(!addCountryModal)return;
    const n=newCountryName.trim();if(!n)return;
    const sport=addCountryModal.sport;
    const list=mCountries[sport]||[];
    if(list.includes(n)||allCountriesForSport(sport).includes(n))return alert("이미 존재합니다.");
    saveMCountries({...mCountries,[sport]:[...list,n]});
    setAddCountryModal(null);setNewCountryName("");
    setMExpandedCountries(p=>({...p,[`${sport}__${n}`]:true}));
  };

  const handleAddLeagueM=()=>{
    if(!addLeagueModalM)return;
    const n=newLeagueNameM.trim();if(!n)return;
    const {sport,country}=addLeagueModalM;
    const key=`${sport}__${country}`;
    const list=mLeagues[key]||[];
    if(list.includes(n)||allLeaguesForCountry(sport,country).includes(n))return alert("이미 존재합니다.");
    saveMLeaguesStore({...mLeagues,[key]:[...list,n]});
    setAddLeagueModalM(null);setNewLeagueNameM("");
  };

  // ── 이름 수정 모달 상태 ──
  const [editMetaModal,setEditMetaModal]=useState<{type:"sport"|"country"|"league";sport?:string;country?:string;league?:string;oldName:string}|null>(null);
  const [editMetaNewName,setEditMetaNewName]=useState("");

  const handleEditMeta=()=>{
    if(!editMetaModal)return;
    const newName=editMetaNewName.trim();if(!newName)return;
    if(newName===editMetaModal.oldName){setEditMetaModal(null);return;}

    if(editMetaModal.type==="sport"){
      const oldName=editMetaModal.oldName;
      // 기본 종목도 수정 허용: customSports 업데이트 + 경기 데이터 sportCat 변경
      const idx=customSports.indexOf(oldName);
      if(idx>=0){
        const newList=[...customSports]; newList[idx]=newName;
        saveCustomSports(newList);
      } else {
        // 기본 종목을 수정할 때는 customSports에 새 이름 추가 (원본 숨김)
        // 그런데 DEFAULT_SPORTS는 하드코딩이라 무시되므로 customSports에 추가
        if(!allSportsList.includes(newName)) saveCustomSports([...customSports,newName]);
      }
      // 관련 데이터 마이그레이션
      saveManualGames(manualGames.map(g=>g.sportCat===oldName?{...g,sportCat:newName}:g));
      const newCountries={...mCountries};
      if(newCountries[oldName]){newCountries[newName]=newCountries[oldName];delete newCountries[oldName];saveMCountries(newCountries);}
      const newLeagues={...mLeagues};
      Object.keys(newLeagues).forEach(k=>{
        if(k.startsWith(oldName+"__")){const newKey=newName+k.substring(oldName.length);newLeagues[newKey]=newLeagues[k];delete newLeagues[k];}
      });
      saveMLeaguesStore(newLeagues);
      if(mSport===oldName)setMSport(newName);
      addLog("✏️ 종목 수정",`${oldName} → ${newName}`);
    }
    else if(editMetaModal.type==="country"){
      const {sport,oldName}=editMetaModal;
      if(!sport)return;
      // mCountries 업데이트
      const list=mCountries[sport]||[];
      const idx=list.indexOf(oldName);
      if(idx>=0){
        const newList=[...list];newList[idx]=newName;
        saveMCountries({...mCountries,[sport]:newList});
      } else {
        saveMCountries({...mCountries,[sport]:[...list,newName]});
      }
      // 경기 데이터 업데이트
      saveManualGames(manualGames.map(g=>g.sportCat===sport&&g.country===oldName?{...g,country:newName}:g));
      // mLeagues 키 변경
      const oldKey=`${sport}__${oldName}`;const newKey=`${sport}__${newName}`;
      if(mLeagues[oldKey]){
        const newMap={...mLeagues};newMap[newKey]=newMap[oldKey];delete newMap[oldKey];
        saveMLeaguesStore(newMap);
      }
      if(mCountry===oldName)setMCountry(newName);
      addLog("✏️ 국가 수정",`${sport}/${oldName} → ${newName}`);
    }
    else if(editMetaModal.type==="league"){
      const {sport,country,oldName}=editMetaModal;
      if(!sport||!country)return;
      const key=`${sport}__${country}`;
      const list=mLeagues[key]||[];
      const idx=list.indexOf(oldName);
      if(idx>=0){
        const newList=[...list];newList[idx]=newName;
        saveMLeaguesStore({...mLeagues,[key]:newList});
      } else {
        saveMLeaguesStore({...mLeagues,[key]:[...list,newName]});
      }
      saveManualGames(manualGames.map(g=>g.sportCat===sport&&g.country===country&&g.league===oldName?{...g,league:newName}:g));
      if(mLeague===oldName)setMLeague(newName);
      addLog("✏️ 리그 수정",`${sport}/${country}/${oldName} → ${newName}`);
    }
    setEditMetaModal(null);setEditMetaNewName("");
  };

  const handleDeleteManualGame=(id:string)=>{
    if(!window.confirm("이 경기를 삭제하시겠습니까?"))return;
    saveManualGames(manualGames.filter(g=>g.id!==id));
    setManualSlip(p=>p.filter(s=>s.game.id!==id));
  };

  // 수동 경기 슬립
  interface ManualSlipItem {
    id: string;
    game: ManualGame;
    optLabel: string;
    odds: number;
  }
  const [manualSlip,setManualSlip]=useState<ManualSlipItem[]>([]);
  const [manualSlipSite,setManualSlipSite]=useState<string>("");
  const [manualSlipAmount,setManualSlipAmount]=useState<number>(10000);
  const [manualSlipInclude,setManualSlipInclude]=useState<boolean>(true);
  const [manualExpandedId,setManualExpandedId]=useState<string|null>(null);

  const manualSlipKeys = useMemo(()=>new Set(manualSlip.map(s=>s.id)),[manualSlip]);

  const handleManualSlipPick = (game: ManualGame, optLabel: string) => {
    const id = `${game.id}_${optLabel}`;
    setManualSlip(prev => {
      // 같은 옵션을 다시 누르면 제거 (토글)
      if (prev.some(s=>s.id===id)) return prev.filter(s=>s.id!==id);
      // 폴더베팅 없이 단일베팅만: 완전히 덮어씌움
      return [{id, game, optLabel, odds:0}];
    });
  };

  const handleManualSlipAdd=()=>{
    if(manualSlip.length===0)return alert("경기를 선택하세요.");
    if(!manualSlipSite)return alert("베팅사이트를 선택해주세요.");
    const missing = manualSlip.find(s => !s.odds || s.odds < 1);
    if(missing)return alert(`${missing.game.homeTeam} vs ${missing.game.awayTeam} 의 배당률을 입력해주세요.`);

    const dollar=isUSD(manualSlipSite);
    manualSlip.forEach(item=>{
      const opt=item.optLabel;
      // ★ "홈승" → "한화 승", "원정승" → "LG 승" 형식으로 변환해서 저장
      const displayOpt =
        opt==="홈승" ? `${item.game.homeTeam} 승` :
        opt==="원정승" ? `${item.game.awayTeam} 승` :
        opt;
      // 선택한 옵션
      const teamName =
        opt==="홈승" ? item.game.homeTeam :
        opt==="원정승" ? item.game.awayTeam :
        opt==="무승부" ? "무승부" : "";
      const bet:Bet={
        id:String(Date.now()+Math.random()),
        date:today,
        category:item.game.sportCat,
        league:item.game.league,
        site:manualSlipSite,
        betOption:displayOpt,
        // ★ 모든 경우에 홈/원정 둘 다 저장 (표시는 PendingCard에서 결정)
        homeTeam:item.game.homeTeam,
        awayTeam:item.game.awayTeam,
        teamName,
        amount:manualSlipAmount,
        odds:item.odds,
        profit:null,
        result:"진행중",
        includeStats:manualSlipInclude,
        isDollar:dollar,
      };
      setBetsRaw(b=>[...b,bet]);
      db.upsertBet(bet);
      const newSS={...siteStates,[manualSlipSite]:{...siteStates[manualSlipSite],betTotal:parseFloat((siteStates[manualSlipSite].betTotal+manualSlipAmount).toFixed(2))}};
      setSiteStatesRaw(newSS);
      db.upsertSiteState(manualSlipSite,newSS[manualSlipSite]);
      addLog("➕ 베팅",`${item.game.homeTeam} vs ${item.game.awayTeam}/${displayOpt}/${fmtDisp(manualSlipAmount,dollar)}`);
    });
    setManualSlip([]);
  };

  // ── 포인트 탭 ─────────────────────────────────────────────
  const [pointSites,setPointSites]=useState<PointSite[]>(()=>{
    try{const v=localStorage.getItem("bt_point_sites");return v?JSON.parse(v):[];}catch{return [];}
  });
  const savePointSites=(sites:PointSite[])=>{setPointSites(sites);try{localStorage.setItem("bt_point_sites",JSON.stringify(sites));}catch{}};

  const [addPointSiteModal,setAddPointSiteModal]=useState(false);
  const [newPointSite,setNewPointSite]=useState({name:"올인구조대",exchangeName:"포인트교환",exchangeDate:"2025-05-04",targetAmount:2000000});

  const handleAddPointSite=()=>{
    const site:PointSite={id:String(Date.now()),name:newPointSite.name,exchangeName:newPointSite.exchangeName,exchangeDate:newPointSite.exchangeDate,targetAmount:newPointSite.targetAmount,sessions:[]};
    const updated=[...pointSites,site];
    savePointSites(updated);
    setAddPointSiteModal(false);
    setNewPointSite({name:"올인구조대",exchangeName:"포인트교환",exchangeDate:"2025-05-04",targetAmount:2000000});
  };

  const getNextTargetDate=(fromDate:string)=>{
    const d=new Date(fromDate);
    d.setDate(d.getDate()+14);
    return d.toISOString().slice(0,10);
  };

  const handlePointExchangeComplete=(siteId:string)=>{
    const now=new Date().toISOString().slice(0,10);
    const nextTarget=getNextTargetDate(now);
    const session:PointSession={id:String(Date.now()),completedAt:now,nextTargetDate:nextTarget};
    const updated=pointSites.map(s=>{
      if(s.id!==siteId)return s;
      return{...s,sessions:[...s.sessions,session]};
    });
    savePointSites(updated);
  };

  // 실시간 환율
  const [usdKrw,setUsdKrw]=useState(USD_TO_KRW);
  useEffect(()=>{fetchUsdKrw().then(setUsdKrw);},[]);

  // ── Supabase 데이터 ────────────────────────────────────────
  const [dbReady, setDbReady] = useState(false);
  const [bets,setBetsRaw]=useState<Bet[]>([]);
  const [deposits,setDepositsRaw]=useState<Deposit[]>([]);
  const [withdrawals,setWithdrawalsRaw]=useState<Withdrawal[]>([]);
  const [siteStates,setSiteStatesRaw]=useState<Record<string,SiteState>>(
    ()=>Object.fromEntries(ALL_SITES.map(s=>[s,{deposited:0,betTotal:0,active:false,isDollar:isUSD(s),pointTotal:0}]))
  );
  const [customLeagues,setCustomLeaguesRaw]=useState<Record<string,string[]>>({});
  const [esportsRecords,setEsportsRecordsRaw]=useState<EsportsRecord[]>([]);
  const [profitExtras,setProfitExtrasRaw]=useState<ProfitExtra[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);

  const [pextSiteList,setPextSiteList]=useState<string[]>(()=>{try{const v=localStorage.getItem("bt_pext_sites");return v?JSON.parse(v):[];}catch{return [];}});
  const [pextCatList,setPextCatList]=useState<string[]>(()=>{try{const v=localStorage.getItem("bt_pext_cats");return v?JSON.parse(v):[];}catch{return [];}});

  const savePextSiteList=(list:string[])=>{setPextSiteList(list);try{localStorage.setItem("bt_pext_sites",JSON.stringify(list));}catch{}};
  const savePextCatList=(list:string[])=>{setPextCatList(list);try{localStorage.setItem("bt_pext_cats",JSON.stringify(list));}catch{}};

  useEffect(()=>{
    (async()=>{
      const [b,dep,wth,ss,cl,er,pe] = await Promise.all([
        db.loadBets(),db.loadDeposits(),db.loadWithdrawals(),
        db.loadSiteStates(ALL_SITES, isUSD),
        db.loadCustomLeagues(),db.loadEsportsRecords(),db.loadProfitExtras(),
      ]);
      setBetsRaw(b);setDepositsRaw(dep);setWithdrawalsRaw(wth);
      setSiteStatesRaw(ss);setCustomLeaguesRaw(cl);setEsportsRecordsRaw(er);setProfitExtrasRaw(pe);
      const sites=new Set(pe.map((x:ProfitExtra)=>x.category));
      const cats=new Set(pe.map((x:ProfitExtra)=>x.subCategory).filter(Boolean));
      if(sites.size>0)savePextSiteList([...new Set([...pextSiteList,...Array.from(sites)])]);
      if(cats.size>0)savePextCatList([...new Set([...pextCatList,...Array.from(cats)])]);
      setDbReady(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const addLog=(type:string,desc:string)=>setLogs(p=>[{id:String(Date.now()),ts:new Date().toLocaleString("ko-KR"),type,desc},...p].slice(0,200));

  const exportData = () => {
    const data={exportedAt:new Date().toISOString(),bets,deposits,withdrawals,siteStates,customLeagues,esportsRecords,profitExtras};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`bettracker_${today}.json`;a.click();URL.revokeObjectURL(url);
    addLog("📤 백업",today);
  };
  const importData=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const data=JSON.parse(ev.target?.result as string);
        if(data.bets){for(const b of data.bets)await db.upsertBet(b);setBetsRaw(data.bets);}
        if(data.deposits){for(const d of data.deposits)await db.insertDeposit(d).catch(()=>{});setDepositsRaw(data.deposits);}
        if(data.withdrawals){for(const w of data.withdrawals)await db.insertWithdrawal(w).catch(()=>{});setWithdrawalsRaw(data.withdrawals);}
        if(data.siteStates){for(const [site,st] of Object.entries(data.siteStates as Record<string,SiteState>))await db.upsertSiteState(site,st);setSiteStatesRaw(data.siteStates);}
        if(data.customLeagues)setCustomLeaguesRaw(data.customLeagues);
        if(data.esportsRecords){for(const r of data.esportsRecords)await db.insertEsportsRecord(r).catch(()=>{});setEsportsRecordsRaw(data.esportsRecords);}
        if(data.profitExtras){for(const p of data.profitExtras)await db.insertProfitExtra(p).catch(()=>{});setProfitExtrasRaw(data.profitExtras);}
        alert("불러오기 완료!");addLog("📥 복구","완료");
      }catch{alert("파일 오류");}
    };
    reader.readAsText(file);e.target.value="";
  };

  // ── 리그 ─────────────────────────────────────────────────
  const getLeagues=(cat:string)=>{
    const major=MAJOR[cat]||[],extra=EXTRA[cat]||[];
    const custom=(customLeagues[cat]||[]).filter(l=>![...major,...extra].includes(l)).sort((a,b)=>a.localeCompare(b,"ko"));
    return{major,others:[...extra,...custom].sort((a,b)=>a.localeCompare(b,"ko"))};
  };
  const allLeagues=(cat:string)=>{const{major,others}=getLeagues(cat);return[...major,...others];};

  // ── 모달 상태 ─────────────────────────────────────────────
  const [addLeagueModal,setAddLeagueModal]=useState<{cat:string}|null>(null);
  const [editLeagueModal,setEditLeagueModal]=useState<{cat:string;old:string;idx:number}|null>(null);
  const [newLeagueName,setNewLeagueName]=useState("");
  const [editLeagueName,setEditLeagueName]=useState("");
  const [closeModal,setCloseModal]=useState<{site:string}|null>(null);
  const [closeWithdrawAmt,setCloseWithdrawAmt]=useState(0);
  const [deleteModal,setDeleteModal]=useState<{betId:string}|null>(null);
  const leagueInputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(addLeagueModal&&leagueInputRef.current)setTimeout(()=>leagueInputRef.current?.focus(),50);},[addLeagueModal]);

  // ── 입금 폼 ──────────────────────────────────────────────
  const [depSite,setDepSite]=useState("");
  const depIsDollar=depSite?isUSD(depSite):false;
  const [depAmt,setDepAmt]=useState(0);
  const [depPoint,setDepPoint]=useState(0);

  const activeSiteNames=ALL_SITES.filter(s=>siteStates[s]?.active);

  // ── E스포츠 기록 ─────────────────────────────────────────
  const [esRec,setEsRec]=useState({league:"LCK",date:today,teamA:"",teamB:"",scoreA:0,scoreB:0});

  // ── 수익률 기타 ──────────────────────────────────────────
  const [pextForm,setPextForm]=useState({category:"",subCategory:"",amount:0,note:"",isIncome:true});
  const [newPextSite,setNewPextSite]=useState("");
  const [newPextCat,setNewPextCat]=useState("");

  // ── 리그 핸들러 ──────────────────────────────────────────
  const handleAddLeague=()=>{
    const name=newLeagueName.trim();if(!name||!addLeagueModal)return;
    setCustomLeaguesRaw(p=>({...p,[addLeagueModal.cat]:[...(p[addLeagueModal.cat]||[]),name]}));
    db.insertCustomLeague(addLeagueModal.cat,name);
    setNewLeagueName("");setAddLeagueModal(null);addLog("➕ 리그 추가",`${addLeagueModal.cat}/${name}`);
  };
  const handleEditLeague=()=>{
    const name=editLeagueName.trim();if(!name||!editLeagueModal)return;
    setCustomLeaguesRaw(p=>{const arr=[...(p[editLeagueModal.cat]||[])];arr[editLeagueModal.idx]=name;return{...p,[editLeagueModal.cat]:arr};});
    db.updateCustomLeague(editLeagueModal.cat,editLeagueModal.old,name);
    setEditLeagueModal(null);setEditLeagueName("");
  };

  const cancelBet=(id:string)=>{
    if(!window.confirm("베팅을 취소하시겠습니까?"))return;
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    setBetsRaw(b=>b.filter(x=>x.id!==id));db.deleteBet(id);
    const newSS2={...siteStates,[bet.site]:{...siteStates[bet.site],betTotal:parseFloat(Math.max(0,siteStates[bet.site].betTotal-bet.amount).toFixed(2))}};
    setSiteStatesRaw(newSS2);db.upsertSiteState(bet.site,newSS2[bet.site]);
    addLog("🚫 취소",bet.homeTeam||bet.teamName||id);
  };

  const handleDeposit=()=>{
    if(!depSite)return alert("사이트를 선택해주세요.");
    if(depAmt<=0&&depPoint<=0)return;
    if(depAmt>0){
      const newDep={id:String(Date.now()),site:depSite,amount:depAmt,date:today,isDollar:depIsDollar};
      setDepositsRaw(d=>[...d,newDep]);db.insertDeposit(newDep);
      const newSS3={...siteStates,[depSite]:{...siteStates[depSite],deposited:parseFloat((siteStates[depSite].deposited+depAmt).toFixed(2)),active:true,isDollar:depIsDollar}};
      setSiteStatesRaw(newSS3);db.upsertSiteState(depSite,newSS3[depSite]);
      addLog("💵 입금",`${depSite}/${fmtDisp(depAmt,depIsDollar)}`);
    }
    if(depPoint>0){
      const curSS=siteStates[depSite];
      const prevPoint=parseFloat(String(curSS.pointTotal||0));
      const updatedSiteP={...curSS,active:true,isDollar:depIsDollar,betTotal:parseFloat((curSS.betTotal+depPoint).toFixed(2)),pointTotal:parseFloat((prevPoint+depPoint).toFixed(2))};
      const newSS4={...siteStates,[depSite]:updatedSiteP};
      setSiteStatesRaw(newSS4);
      db.upsertSiteState(depSite,updatedSiteP);
      addLog("🎁 포인트",`${depSite}/${fmtDisp(depPoint,depIsDollar)}`);
    }
    setDepSite("");setDepAmt(0);setDepPoint(0);
  };

  const handleClose=(site:string)=>{setCloseWithdrawAmt(0);setCloseModal({site});};
  const confirmClose=()=>{
    if(!closeModal)return;const site=closeModal.site;
    if(closeWithdrawAmt>0){
      const dollar=isUSD(site);
      const newWth={id:String(Date.now()),site,amount:closeWithdrawAmt,date:today,isDollar:dollar};
      setWithdrawalsRaw(w=>[...w,newWth]);db.insertWithdrawal(newWth);
    }
    const closedSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false,pointTotal:0}};
    setSiteStatesRaw(closedSS);db.upsertSiteState(site,closedSS[site]);
    addLog("🔒 마감",`${site}/출금${fmtDisp(closeWithdrawAmt,isUSD(site))}`);
    setCloseModal(null);
  };
  const cancelSite=(site:string)=>{
    if(!window.confirm(`${site} 취소? 입금 금액도 삭제됩니다.`))return;
    const cancelledSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false,pointTotal:0}};
    setSiteStatesRaw(cancelledSS);db.upsertSiteState(site,cancelledSS[site]);
    setDepositsRaw(d=>d.filter(dep=>dep.site!==site));db.deleteDepositsBySite(site);
    addLog("❌ 사이트 취소",site);
  };
  const updateResult=(id:string,result:string)=>{
    setBetsRaw(b=>{
      const next=b.map(bet=>{
        if(bet.id!==id)return bet;
        const profit=result==="승"?parseFloat((bet.amount*bet.odds-bet.amount).toFixed(2)):result==="패"?-bet.amount:0;
        const updated={...bet,result,profit};db.upsertBet(updated);
        addLog(result==="승"?"✅ 적중":"❌ 실패",bet.homeTeam||bet.teamName||"");
        return updated;
      });
      // ★ 방금 결과 입력한 베팅이 속한 사이트 확인
      const target=b.find(x=>x.id===id);
      if(target){
        const site=target.site;
        // 해당 사이트의 남은 진행중 베팅이 있는지
        const stillPending=next.some(x=>x.site===site&&x.result==="진행중");
        if(!stillPending && siteStates[site]){
          // 남은 진행중 베팅 없으면 사이트 초기화
          const resetSS={...siteStates,[site]:{...siteStates[site],deposited:0,betTotal:0,active:false,pointTotal:0}};
          setSiteStatesRaw(resetSS);
          db.upsertSiteState(site,resetSS[site]);
          addLog("🔄 사이트 초기화",`${site} (베팅 완료)`);
        }
      }
      return next;
    });
  };
  const revertToPending=(id:string)=>{
    const bet=bets.find(b=>b.id===id);if(!bet)return;
    const reverted={...bet,result:"진행중",profit:null};
    setBetsRaw(b=>b.map(x=>x.id===id?reverted:x));db.upsertBet(reverted);
    const revertSS={...siteStates,[bet.site]:{...siteStates[bet.site],betTotal:parseFloat((siteStates[bet.site].betTotal+bet.amount).toFixed(2))}};
    setSiteStatesRaw(revertSS);db.upsertSiteState(bet.site,revertSS[bet.site]);
    addLog("🔄 복귀",bet.homeTeam||bet.teamName||id);
  };
  const deleteFromStats=(id:string)=>{
    setBetsRaw(b=>b.map(bet=>{if(bet.id!==id)return bet;const u={...bet,includeStats:false};db.upsertBet(u);return u;}));
    addLog("🗑 통계삭제","");
  };
  const deleteForever=(id:string)=>{
    setBetsRaw(b=>b.filter(x=>x.id!==id));db.deleteBet(id);addLog("💥 영구삭제","");
  };
  const handleDeleteChoice=(choice:"stats"|"forever")=>{if(!deleteModal)return;choice==="stats"?deleteFromStats(deleteModal.betId):deleteForever(deleteModal.betId);setDeleteModal(null);};

  const isOverUnder=(opt:string)=>opt.includes("오버")||opt.includes("언더");

  // ── 통계 계산 ─────────────────────────────────────────────
  const weekDeposits=useMemo(()=>{
    const wm=weekMonday(),m:Record<string,number>=Object.fromEntries(ALL_SITES.map(s=>[s,0]));
    deposits.filter(d=>d.date>=wm).forEach(d=>{m[d.site]+=d.amount;});return m;
  },[deposits,ALL_SITES]);

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

  const roiStats=useMemo(()=>{
    return ALL_SITES.map(site=>{
      const dollar=isUSD(site);
      const siteWths=withdrawals.filter(w=>w.site===site).sort((a,b)=>a.date.localeCompare(b.date));
      if(siteWths.length===0)return null;
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
  },[deposits,withdrawals,usdKrw,ALL_SITES,isUSD]);

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

  const krwRemaining=activeSiteNames.filter(s=>!isUSD(s)).reduce((sum,site)=>{const st=siteStates[site]||{deposited:0,betTotal:0};return sum+Math.max(0,st.deposited-st.betTotal);},0);
  const usdRemaining=activeSiteNames.filter(s=>isUSD(s)).reduce((sum,site)=>{const st=siteStates[site]||{deposited:0,betTotal:0};return sum+Math.max(0,st.deposited-st.betTotal);},0);

  // ── 서브 컴포넌트 ─────────────────────────────────────────
  const StatCard=({label,value,color,sub}:{label:string,value:string|number,color?:string,sub?:string})=>(
    <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color:color??C.text}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.dim,marginTop:3}}>{sub}</div>}
    </div>
  );
  const SubRow=({s}:{s:any,key?:any})=>(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
      <div style={{flex:1,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
      <div style={{color:s.profit>=0?C.green:C.red,fontWeight:700,minWidth:70,textAlign:"right"}}>{fmtProfit(s.profit,false)}</div>
      <div style={{color:Number(s.roi)>=0?C.green:C.red,minWidth:55,textAlign:"right",fontSize:11}}>ROI {s.roi}%</div>
      <div style={{color:C.teal,minWidth:40,textAlign:"right",fontSize:11}}>{s.winRate}%</div>
      <div style={{color:C.dim,minWidth:30,textAlign:"right",fontSize:11}}>{s.count}건</div>
    </div>
  );

  const [editingBetId,setEditingBetId]=useState<string|null>(null);
  const [editBetForm,setEditBetForm]=useState<Partial<Bet>>({});
  const [editBetOddsRaw,setEditBetOddsRaw]=useState<string>("");

  const PendingCard=({b}:{b:Bet,key?:any})=>{
    // 홈 vs 원정이 있으면 무조건 그 형식으로, 없으면 teamName 폴백 (구 데이터 호환)
    const matchTitle = (b.homeTeam && b.awayTeam)
      ? `${b.homeTeam} vs ${b.awayTeam}`
      : (b.teamName || "-");
    // 호환용 (아래 코드에서 title 사용)
    const title = matchTitle;
    // ★ 구 데이터 "홈승"/"원정승" → "팀명 승"으로 표시용 변환
    const displayBetOption =
      b.betOption==="홈승" && b.homeTeam ? `${b.homeTeam} 승` :
      b.betOption==="원정승" && b.awayTeam ? `${b.awayTeam} 승` :
      b.betOption;
    const isEditing=editingBetId===b.id;
    if(isEditing){
      return(
        <div style={{background:C.bg2,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"9px 10px",marginBottom:5}}>
          <div style={{fontSize:11,color:C.teal,fontWeight:700,marginBottom:6}}>✏️ 수정</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:5}}>
            <div><div style={L}>팀/홈팀</div><input value={editBetForm.homeTeam??editBetForm.teamName??""} onChange={e=>{if(isOverUnder(b.betOption))setEditBetForm(f=>({...f,homeTeam:e.target.value}));else setEditBetForm(f=>({...f,teamName:e.target.value}));}} style={{...S,boxSizing:"border-box",fontSize:11}}/></div>
            {isOverUnder(b.betOption)&&<div><div style={L}>원정팀</div><input value={editBetForm.awayTeam??""} onChange={e=>setEditBetForm(f=>({...f,awayTeam:e.target.value}))} style={{...S,boxSizing:"border-box",fontSize:11}}/></div>}
            <div><div style={L}>배당(3자리)</div><input value={editBetOddsRaw} onChange={e=>setEditBetOddsRaw(e.target.value.replace(/[^0-9]/g,""))} style={{...S,boxSizing:"border-box",fontSize:11}}/></div>
            <div><div style={L}>금액</div><input type="number" value={editBetForm.amount??b.amount} onChange={e=>setEditBetForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,boxSizing:"border-box",fontSize:11,...noSpin}}/></div>
          </div>
          <div style={{marginBottom:5}}><div style={L}>베팅 옵션</div><input value={editBetForm.betOption??b.betOption} onChange={e=>setEditBetForm(f=>({...f,betOption:e.target.value}))} style={{...S,boxSizing:"border-box",fontSize:11}}/></div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>{
              const newOdds=editBetOddsRaw.length>=3?parseFloat((parseInt(editBetOddsRaw)/100).toFixed(2)):b.odds;
              const updated:Bet={...b,...editBetForm,odds:newOdds};
              setBetsRaw(prev=>prev.map(x=>x.id===b.id?updated:x));db.upsertBet(updated);
              setEditingBetId(null);setEditBetForm({});setEditBetOddsRaw("");
            }} style={{flex:1,background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,padding:"5px",borderRadius:4,cursor:"pointer",fontWeight:700,fontSize:11}}>저장</button>
            <button onClick={()=>{setEditingBetId(null);setEditBetForm({});setEditBetOddsRaw("");}} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,color:C.muted,padding:"5px",borderRadius:4,cursor:"pointer",fontSize:11}}>취소</button>
          </div>
        </div>
      );
    }
    return(
      <div style={{background:C.bg2,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"10px 12px",marginBottom:7}}>
        {/* 상단: 카테고리/리그 + 옵션 */}
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
          <span style={{fontSize:14,flexShrink:0}}>{SPORT_ICON[b.category]||"🎯"}</span>
          <span style={{fontSize:10,color:C.muted,background:C.bg,padding:"2px 6px",borderRadius:3}}>{b.league}</span>
          <span style={{fontSize:13,color:C.purple,fontWeight:800,marginLeft:"auto"}}>{displayBetOption}</span>
        </div>
        {/* 중단: 팀 이름 크게 */}
        <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:7,lineHeight:1.3,wordBreak:"break-word"}}>
          {title || "-"}
        </div>
        {/* 하단: 배당 + 금액 + 버튼들 */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:10,flex:1,minWidth:120}}>
            <span style={{fontSize:11,color:C.muted}}>배당 <span style={{color:C.teal,fontWeight:800,fontSize:13}}>{b.odds}</span></span>
            <span style={{fontSize:13,color:C.amber,fontWeight:800}}>{fmtDisp(b.amount,b.isDollar)}</span>
          </div>
          <div style={{display:"flex",gap:3,flexShrink:0}}>
            <button onClick={()=>{setEditingBetId(b.id);setEditBetForm({homeTeam:b.homeTeam,awayTeam:b.awayTeam,teamName:b.teamName,betOption:b.betOption,amount:b.amount});setEditBetOddsRaw(String(Math.round((b.odds||0)*100)));}} style={{background:`${C.teal}11`,border:`1px solid ${C.teal}44`,color:C.teal,padding:"4px 9px",borderRadius:4,cursor:"pointer",fontSize:12}}>✏️</button>
            <button onClick={()=>updateResult(b.id,"승")} style={{background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"4px 9px",borderRadius:4,cursor:"pointer",fontWeight:700,fontSize:12}}>✅</button>
            <button onClick={()=>updateResult(b.id,"패")} style={{background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"4px 9px",borderRadius:4,cursor:"pointer",fontWeight:700,fontSize:12}}>❌</button>
            <button onClick={()=>cancelBet(b.id)} style={{background:C.bg,border:`1px solid ${C.border2}`,color:C.muted,padding:"4px 9px",borderRadius:4,cursor:"pointer",fontSize:11}}>취소</button>
          </div>
        </div>
      </div>
    );
  };

  const DoneCard=({b}:{b:Bet,key?:any})=>{
    const rc=b.result==="승"?C.green:b.result==="패"?C.red:C.amber;
    const title = (b.homeTeam && b.awayTeam) ? `${b.homeTeam} vs ${b.awayTeam}` : (b.teamName || "-");
    // ★ 구 데이터 "홈승"/"원정승" → "팀명 승"
    const displayBetOption =
      b.betOption==="홈승" && b.homeTeam ? `${b.homeTeam} 승` :
      b.betOption==="원정승" && b.awayTeam ? `${b.awayTeam} 승` :
      b.betOption;
    return(
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:7,padding:9,opacity:b.includeStats===false?0.5:0.9}}>
        {!b.includeStats&&<div style={{fontSize:8,color:C.dim,marginBottom:2}}>통계제외</div>}
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div><div style={{fontSize:9,color:C.muted}}>{b.date}·{displayBetOption}</div></div>
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

  const tabBtn=(active:boolean,ac:string)=>({padding:"7px 18px",borderRadius:7,border:active?`1px solid ${ac}`:`1px solid ${C.border}`,background:active?`${ac}22`:"transparent",color:active?ac:C.muted,cursor:"pointer",fontWeight:700,fontSize:12} as React.CSSProperties);
  const siteBtn=(active:boolean,dollar:boolean)=>({padding:"4px 10px",borderRadius:5,border:active?`1px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?`${dollar?C.amber:C.green}22`:C.bg2,color:active?dollar?C.amber:C.green:C.muted,cursor:"pointer",fontSize:11,fontWeight:active?700:400} as React.CSSProperties);

  // ── 베팅 탭 트리 & 리그 게임 계산 (반드시 early return 전에 호출) ──
  const bettingTree = useMemo(()=>{
    const tree:Record<string,Record<string,LiveFixture[]>> = {};
    for (const f of bettingFixtures) {
      const c = ktr(f.country); const l = f.league_name;
      if (!tree[c]) tree[c] = {};
      if (!tree[c][l]) tree[c][l] = [];
      tree[c][l].push(f);
    }
    return tree;
  },[bettingFixtures]);

  const bettingCountries = useMemo(()=>{
    const ord = ["한국","미국","일본","잉글랜드","스페인","독일","이탈리아","프랑스","유럽","국제"];
    return Object.keys(bettingTree).sort((a,b)=>{
      const ai=ord.indexOf(a), bi=ord.indexOf(b);
      if (ai>=0 && bi>=0) return ai-bi;
      if (ai>=0) return -1;
      if (bi>=0) return 1;
      return a.localeCompare(b,"ko");
    });
  },[bettingTree]);

  const bettingLeagueGames = useMemo(()=>{
    if (!bettingCountry || !bettingLeague) return [];
    return (bettingTree[bettingCountry]?.[bettingLeague] || [])
      .sort((a,b)=>new Date(a.start_time).getTime()-new Date(b.start_time).getTime());
  },[bettingTree, bettingCountry, bettingLeague]);

  if(!authed) return <PasswordScreen onAuth={handleAuth}/>;
  if(!dbReady) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32}}>⚡</div>
      <div style={{color:C.orange,fontSize:18,fontWeight:800,letterSpacing:2}}>BET TRACKER</div>
      <div style={{color:C.muted,fontSize:13}}>Supabase에서 데이터 불러오는 중...</div>
    </div>
  );

  // ── 포인트 탭 렌더 ──
  const renderPointsTab=()=>{
    const oneMonthAgo=(baseDate:string)=>{
      const d=new Date(baseDate);d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,10);
    };
    return(
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:800,color:C.teal}}>🎁 포인트 관리</div>
          <button onClick={()=>setAddPointSiteModal(true)} style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.teal}`,background:`${C.teal}22`,color:C.teal,cursor:"pointer",fontWeight:700,fontSize:12}}>+ 포인트 사이트 추가</button>
        </div>
        {pointSites.length===0&&(
          <div style={{textAlign:"center",color:C.dim,padding:"60px 0"}}>
            <div style={{fontSize:24,marginBottom:8}}>🎁</div>
            <div>포인트 사이트를 추가해주세요</div>
          </div>
        )}
        {pointSites.map(ps=>{
          const lastSession=ps.sessions[ps.sessions.length-1];
          const isCompleted=!!lastSession;
          const baseDate=isCompleted?lastSession.nextTargetDate:ps.exchangeDate;
          const startDate=new Date(baseDate);startDate.setDate(startDate.getDate()-1);
          const startStr=startDate.toISOString().slice(0,10);
          const fromStr=oneMonthAgo(startStr);
          const periodDeps=deposits.filter(d=>d.date>=fromStr&&d.date<=startStr);
          const totalKrw=periodDeps.reduce((s,d)=>s+(isUSD(d.site)?d.amount*usdKrw:d.amount),0);
          const achieved=totalKrw>=ps.targetAmount;
          const bysite:Record<string,number>={};
          periodDeps.forEach(d=>{
            const amt=isUSD(d.site)?d.amount*usdKrw:d.amount;
            bysite[d.site]=(bysite[d.site]||0)+amt;
          });
          return(
            <div key={ps.id} style={{background:C.bg3,border:`1px solid ${achieved?C.green+"66":C.border2}`,borderRadius:14,padding:18,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:16,fontWeight:900,color:C.text}}>{ps.name}</span>
                    <span style={{fontSize:13,color:C.teal,fontWeight:700}}>{ps.exchangeName}</span>
                    <span style={{fontSize:12,color:C.amber,fontWeight:600}}>{baseDate.slice(5).replace("-","월 ")}일</span>
                    {achieved&&(
                      <span style={{fontSize:13,fontWeight:900,color:C.green,border:`2px solid ${C.green}`,borderRadius:6,padding:"2px 8px",transform:"rotate(-5deg)",display:"inline-block",background:`${C.green}11`,letterSpacing:1}}>✅ 포인트전환 가능</span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                    기준기간: {fromStr} ~ {startStr} (최근 1개월)
                  </div>
                </div>
                <button onClick={()=>{if(!window.confirm("현금교환 완료 처리?"))return;handlePointExchangeComplete(ps.id);}} style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.orange}`,background:`${C.orange}22`,color:C.orange,cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0}}>현금교환 완료</button>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                  <span style={{color:C.muted}}>누적 입금</span>
                  <span style={{color:achieved?C.green:C.amber,fontWeight:800}}>{totalKrw.toLocaleString()}원 / {ps.targetAmount.toLocaleString()}원</span>
                </div>
                <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(100,Math.round(totalKrw/ps.targetAmount*100))}%`,height:"100%",background:achieved?C.green:C.amber,borderRadius:4}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6}}>
                {Object.entries(bysite).filter(([,v])=>v>0).map(([site,amt])=>(
                  <div key={site} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{site}</div>
                    <div style={{fontSize:13,fontWeight:800,color:C.green}}>₩{Math.round(amt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>{if(!window.confirm(`"${ps.name}" 삭제?`))return;savePointSites(pointSites.filter(x=>x.id!==ps.id));}} style={{marginTop:10,fontSize:10,padding:"3px 10px",borderRadius:4,border:`1px solid ${C.red}44`,background:C.bg2,color:C.red,cursor:"pointer"}}>삭제</button>
            </div>
          );
        })}
      </div>
    );
  };

  const bettingCacheMsg = (()=>{
    if (!bettingCacheInfo.fetchedAt || !bettingCacheInfo.expiresAt) return "캐시 없음";
    const remain = bettingCacheInfo.expiresAt - nowTick;
    if (remain <= 0) return "캐시 만료 · 새로고침 시 재호출";
    const m = Math.ceil(remain/60_000);
    return `다음 갱신까지 ${m}분`;
  })();

  const spColor = SPORT_META[bettingSport].color;

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>

      {/* ── 모달들 ── */}
      {siteManageModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.teal}`,borderRadius:14,padding:24,width:380,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.teal,marginBottom:16}}>🏢 사이트 관리</div>
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              <input value={newSiteName} onChange={e=>setNewSiteName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddSite()} placeholder="사이트 이름" style={{...S,flex:1,boxSizing:"border-box"}}/>
              <select value={newSiteType} onChange={e=>setNewSiteType(e.target.value as "krw"|"usd")} style={{...S,width:"auto"}}>
                <option value="krw">₩ 원화</option>
                <option value="usd">$ 달러</option>
              </select>
              <button onClick={handleAddSite} style={{padding:"7px 14px",background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,borderRadius:6,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>추가</button>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>원화 사이트</div>
            {krwSites.map(s=>(
              <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.bg2,borderRadius:6,marginBottom:4}}>
                <span style={{fontSize:12,color:C.green}}>₩ {s}</span>
                <button onClick={()=>handleDeleteSite(s)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,padding:"2px 8px",borderRadius:4,cursor:"pointer",fontSize:11}}>삭제</button>
              </div>
            ))}
            <div style={{fontSize:12,color:C.muted,margin:"12px 0 8px"}}>달러 사이트</div>
            {usdSites.map(s=>(
              <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.bg2,borderRadius:6,marginBottom:4}}>
                <span style={{fontSize:12,color:C.amber}}>$ {s}</span>
                <button onClick={()=>handleDeleteSite(s)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,padding:"2px 8px",borderRadius:4,cursor:"pointer",fontSize:11}}>삭제</button>
              </div>
            ))}
            <button onClick={()=>setSiteManageModal(false)} style={{width:"100%",marginTop:16,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>닫기</button>
          </div>
        </div>
      )}

      {addPointSiteModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.teal}`,borderRadius:14,padding:24,width:340}}>
            <div style={{fontSize:14,fontWeight:700,color:C.teal,marginBottom:16}}>🎁 포인트 사이트 추가</div>
            <div style={{marginBottom:8}}><div style={L}>사이트명</div><input value={newPointSite.name} onChange={e=>setNewPointSite(p=>({...p,name:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:8}}><div style={L}>교환 이름</div><input value={newPointSite.exchangeName} onChange={e=>setNewPointSite(p=>({...p,exchangeName:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:8}}><div style={L}>교환 목표 날짜</div><input type="date" value={newPointSite.exchangeDate} onChange={e=>setNewPointSite(p=>({...p,exchangeDate:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
            <div style={{marginBottom:16}}><div style={L}>목표 금액 (원화)</div><input type="number" value={newPointSite.targetAmount} onChange={e=>setNewPointSite(p=>({...p,targetAmount:parseInt(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/></div>
            <div style={{display:"flex",gap:8}}><button onClick={handleAddPointSite} style={{flex:1,background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,padding:"8px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button><button onClick={()=>setAddPointSiteModal(false)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button></div>
          </div>
        </div>
      )}

      {addGameModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.green}`,borderRadius:14,padding:24,width:400}}>
            <div style={{fontSize:15,fontWeight:800,color:C.green,marginBottom:8}}>⚽ 경기 추가</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14,background:C.bg2,padding:"8px 12px",borderRadius:6}}>
              {SPORT_ICON[mSport]||"🏅"} <b style={{color:C.orange}}>{mSport}</b> · <b style={{color:C.teal}}>{mCountry}</b> · <b style={{color:C.amber}}>{mLeague}</b>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <div>
                <div style={L}>홈팀 <span style={{color:C.red}}>*</span></div>
                <input value={newGame.homeTeam} onChange={e=>setNewGame(p=>({...p,homeTeam:e.target.value}))}
                  placeholder="홈팀 이름" list="team-list-add" autoFocus
                  style={{...S,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={L}>원정팀 <span style={{color:C.red}}>*</span></div>
                <input value={newGame.awayTeam} onChange={e=>setNewGame(p=>({...p,awayTeam:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&handleAddManualGame()}
                  placeholder="원정팀 이름" list="team-list-add"
                  style={{...S,boxSizing:"border-box"}}/>
              </div>
              <datalist id="team-list-add">
                {TEAM_DB.map(t=><option key={t} value={t}/>)}
              </datalist>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddManualGame} style={{flex:1,background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"10px",borderRadius:7,cursor:"pointer",fontWeight:800}}>추가</button>
              <button onClick={()=>{setAddGameModal(false);setNewGame({homeTeam:"",awayTeam:""});}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"10px",borderRadius:7,cursor:"pointer"}}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 종목 추가 모달 */}
      {addSportModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.purple}`,borderRadius:14,padding:24,width:320}}>
            <div style={{fontSize:15,fontWeight:800,color:C.purple,marginBottom:14}}>➕ 종목 추가</div>
            <input autoFocus value={newSportName} onChange={e=>setNewSportName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleAddSport()}
              placeholder="예: 미식축구, 크리켓, 골프"
              style={{...S,boxSizing:"border-box",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddSport} style={{flex:1,background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"9px",borderRadius:7,cursor:"pointer",fontWeight:700}}>추가</button>
              <button onClick={()=>{setAddSportModal(false);setNewSportName("");}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"9px",borderRadius:7,cursor:"pointer"}}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 국가 추가 모달 */}
      {addCountryModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.teal}`,borderRadius:14,padding:24,width:340}}>
            <div style={{fontSize:15,fontWeight:800,color:C.teal,marginBottom:6}}>➕ 국가 추가</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14}}>종목: <b style={{color:C.orange}}>{SPORT_ICON[addCountryModal.sport]||"🏅"} {addCountryModal.sport}</b></div>
            <input autoFocus value={newCountryName} onChange={e=>setNewCountryName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleAddCountry()}
              placeholder="예: 잉글랜드, 한국, 미국"
              list="country-list-add"
              style={{...S,boxSizing:"border-box",marginBottom:14}}/>
            <datalist id="country-list-add">
              {["잉글랜드","스페인","독일","이탈리아","프랑스","한국","일본","미국","브라질","네덜란드","포르투갈","국제","유럽","남미","아시아","중국","멕시코","터키","러시아","아르헨티나"].map(c=><option key={c} value={c}/>)}
            </datalist>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddCountry} style={{flex:1,background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,padding:"9px",borderRadius:7,cursor:"pointer",fontWeight:700}}>추가</button>
              <button onClick={()=>{setAddCountryModal(null);setNewCountryName("");}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"9px",borderRadius:7,cursor:"pointer"}}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 리그 추가 모달 (수동 경기용) */}
      {addLeagueModalM&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.amber}`,borderRadius:14,padding:24,width:340}}>
            <div style={{fontSize:15,fontWeight:800,color:C.amber,marginBottom:6}}>➕ 리그 추가</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
              <b style={{color:C.orange}}>{SPORT_ICON[addLeagueModalM.sport]||"🏅"} {addLeagueModalM.sport}</b>
              <span style={{color:C.dim}}> · </span>
              <b style={{color:C.teal}}>{addLeagueModalM.country}</b>
            </div>
            <input autoFocus value={newLeagueNameM} onChange={e=>setNewLeagueNameM(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleAddLeagueM()}
              placeholder="예: 프리미어리그, MLB, LCK"
              style={{...S,boxSizing:"border-box",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddLeagueM} style={{flex:1,background:`${C.amber}22`,border:`1px solid ${C.amber}`,color:C.amber,padding:"9px",borderRadius:7,cursor:"pointer",fontWeight:700}}>추가</button>
              <button onClick={()=>{setAddLeagueModalM(null);setNewLeagueNameM("");}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"9px",borderRadius:7,cursor:"pointer"}}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 종목/국가/리그 이름 수정 모달 */}
      {editMetaModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.purple}`,borderRadius:14,padding:24,width:340}}>
            <div style={{fontSize:15,fontWeight:800,color:C.purple,marginBottom:6}}>
              ✏️ {editMetaModal.type==="sport"?"종목":editMetaModal.type==="country"?"국가":"리그"} 이름 수정
            </div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
              {editMetaModal.type==="country" && <>종목: <b style={{color:C.orange}}>{editMetaModal.sport}</b> · </>}
              {editMetaModal.type==="league" && <>
                <b style={{color:C.orange}}>{editMetaModal.sport}</b> · <b style={{color:C.teal}}>{editMetaModal.country}</b> ·
              </>}
              기존: <b style={{color:C.text}}>{editMetaModal.oldName}</b>
            </div>
            <input autoFocus value={editMetaNewName} onChange={e=>setEditMetaNewName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleEditMeta()}
              placeholder="새 이름"
              style={{...S,boxSizing:"border-box",marginBottom:14}}/>
            <div style={{fontSize:10,color:C.dim,marginBottom:10}}>※ 기존 경기 데이터의 이름도 함께 변경됩니다.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleEditMeta} style={{flex:1,background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"9px",borderRadius:7,cursor:"pointer",fontWeight:700}}>수정</button>
              <button onClick={()=>{setEditMetaModal(null);setEditMetaNewName("");}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"9px",borderRadius:7,cursor:"pointer"}}>취소</button>
            </div>
          </div>
        </div>
      )}


      {addLeagueModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.purple}`,borderRadius:12,padding:24,width:300}}>
            <div style={{fontSize:14,fontWeight:700,color:C.purple,marginBottom:12}}>리그 추가 ({addLeagueModal.cat})</div>
            <input ref={leagueInputRef} value={newLeagueName} onChange={e=>setNewLeagueName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddLeague()} placeholder="리그 이름" style={{...S,boxSizing:"border-box",marginBottom:12}}/>
            <div style={{display:"flex",gap:8}}><button onClick={handleAddLeague} style={{flex:1,background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"8px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button><button onClick={()=>{setAddLeagueModal(null);setNewLeagueName("");}} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>취소</button></div>
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
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>승률</div><div style={{color:C.teal,fontWeight:800,fontSize:13}}>{winRate}%</div></div>
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>진행중</div><div style={{color:C.amber,fontWeight:800,fontSize:13}}>{pending.length}건</div></div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={exportData} style={{fontSize:11,padding:"5px 11px",borderRadius:5,border:`1px solid ${C.teal}44`,background:`${C.teal}11`,color:C.teal,cursor:"pointer"}} title="백업">📤</button>
              <button onClick={()=>fileRef.current?.click()} style={{fontSize:11,padding:"5px 11px",borderRadius:5,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer"}} title="복구">📥</button>
              <input ref={fileRef} type="file" accept=".json" onChange={importData} style={{display:"none"}}/>
              <button onClick={logout} style={{fontSize:11,padding:"5px 11px",borderRadius:5,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer",fontWeight:700}} title="로그아웃">🔒</button>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {([
            ["home","🏠 홈"],["bettingCombo","🎯 베팅"],["pending","⏳ 진행중"],["stats","📊 통계"],["roi","💹 수익률"],["strategy","📋 전략"],["log","🗒 로그"],["points","🎁 포인트"],["betting","🔬 베팅(환경변수)"],["bettingManual","🧪 베팅(테스트)"],
          ] as [string,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k as any)} style={tabBtn(tab===k,k==="pending"?C.amber:k==="points"?C.teal:k==="home"?C.green:C.orange)}>{l}</button>
          ))}
        </div>
      </div>

      {/* ══ 베팅 탭 (5컬럼: 카테고리/경기/옵션/슬립/진행중+진행률) ══ */}
      {tab==="bettingCombo" && (()=>{
        const selGame = manualExpandedId ? manualGames.find(g=>g.id===manualExpandedId) : null;
        const selectedGames = (mSport && mCountry && mLeague)
          ? manualGames.filter(g=>g.sportCat===mSport && g.country===mCountry && g.league===mLeague)
              .sort((a,b)=>b.createdAt-a.createdAt)
          : [];
        // 진행중 정렬: 최신순
        const pendingSorted = [...pending].sort((a,b)=>{
          const ta=parseFloat(a.id)||0;
          const tb=parseFloat(b.id)||0;
          return tb-ta;
        });

        return (
        <div style={{display:"flex",flex:1,overflow:"hidden",minWidth:0,minHeight:0}}>

          {/* ─── 1. 카테고리 (종목/국가/리그) ─── */}
          <div style={{width:220,flexShrink:0,background:C.bg2,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:C.text}}>📂 카테고리</div>
                <div style={{fontSize:9,color:C.dim}}>종목 {allSportsList.length}</div>
              </div>
              <button onClick={()=>setAddSportModal(true)}
                style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.purple}`,background:`${C.purple}22`,color:C.purple,cursor:"pointer",fontWeight:700,fontSize:10}}>+ 종목</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"6px",minHeight:0}}>
              {allSportsList.map(sport=>{
                const sportOpen = mExpandedSports[sport];
                const cntrs = allCountriesForSport(sport);
                const sportGameCount = manualGames.filter(g=>g.sportCat===sport).length;
                const isSportSel = mSport===sport;
                return (
                  <div key={sport} style={{marginBottom:3}}>
                    <div style={{display:"flex",gap:2,alignItems:"stretch",marginBottom:1}}>
                      <button onClick={()=>{setMExpandedSports(p=>({...p,[sport]:!p[sport]}));setMSport(sport);}}
                        style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 9px",textAlign:"left",borderRadius:5,cursor:"pointer",border:isSportSel?`1px solid ${C.orange}`:`1px solid ${C.border}`,background:isSportSel?`${C.orange}22`:C.bg3,color:isSportSel?C.orange:C.text,fontSize:11,fontWeight:800}}>
                        <span>{SPORT_ICON[sport]||"🏅"} {sport} <span style={{fontSize:9,color:C.dim,fontWeight:400}}>({sportGameCount})</span></span>
                        <span style={{fontSize:9,color:C.dim}}>{sportOpen?"▼":"▶"}</span>
                      </button>
                      <button onClick={()=>setAddCountryModal({sport})} title="국가 추가" style={{padding:"0 6px",borderRadius:4,border:`1px solid ${C.teal}44`,background:`${C.teal}11`,color:C.teal,cursor:"pointer",fontSize:10,fontWeight:700}}>+</button>
                      <button onClick={()=>{setEditMetaModal({type:"sport",oldName:sport});setEditMetaNewName(sport);}} title="이름 수정" style={{padding:"0 4px",borderRadius:4,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:9}}>✏️</button>
                    </div>
                    {sportOpen && (
                      <div style={{marginLeft:6,paddingLeft:6,borderLeft:`1px solid ${C.border}`}}>
                        {cntrs.length===0 ? (
                          <div style={{fontSize:9,color:C.dim,padding:"4px 6px"}}>국가 없음 · <span style={{color:C.teal,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setAddCountryModal({sport})}>추가</span></div>
                        ) : cntrs.map(country=>{
                          const key=`${sport}__${country}`;
                          const cOpen = mExpandedCountries[key];
                          const lgs = allLeaguesForCountry(sport,country);
                          const countryGameCount = manualGames.filter(g=>g.sportCat===sport&&g.country===country).length;
                          const isCountrySel = mSport===sport && mCountry===country;
                          return (
                            <div key={country} style={{marginBottom:2}}>
                              <div style={{display:"flex",gap:2,alignItems:"stretch"}}>
                                <button onClick={()=>{setMExpandedCountries(p=>({...p,[key]:!p[key]}));setMSport(sport);setMCountry(country);}}
                                  style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",textAlign:"left",borderRadius:4,cursor:"pointer",border:isCountrySel?`1px solid ${C.teal}`:"1px solid transparent",background:isCountrySel?`${C.teal}22`:"transparent",color:isCountrySel?C.teal:C.muted,fontSize:10,fontWeight:isCountrySel?700:500}}>
                                  <span>{cOpen?"▼":"▶"} {country} <span style={{fontSize:8,color:C.dim,fontWeight:400}}>({countryGameCount})</span></span>
                                </button>
                                <button onClick={()=>setAddLeagueModalM({sport,country})} title="리그 추가" style={{padding:"0 5px",borderRadius:3,border:`1px solid ${C.amber}44`,background:`${C.amber}11`,color:C.amber,cursor:"pointer",fontSize:9,fontWeight:700}}>+</button>
                                <button onClick={()=>{setEditMetaModal({type:"country",sport,oldName:country});setEditMetaNewName(country);}} title="이름 수정" style={{padding:"0 4px",borderRadius:3,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:8}}>✏️</button>
                              </div>
                              {cOpen && (
                                <div style={{marginLeft:6,paddingLeft:5,marginTop:1,borderLeft:`1px solid ${C.border}`}}>
                                  {lgs.length===0 ? (
                                    <div style={{fontSize:9,color:C.dim,padding:"3px 6px"}}>리그 없음 · <span style={{color:C.amber,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setAddLeagueModalM({sport,country})}>추가</span></div>
                                  ) : lgs.map(lg=>{
                                    const lgGameCount = manualGames.filter(g=>g.sportCat===sport&&g.country===country&&g.league===lg).length;
                                    const isLgSel = mSport===sport && mCountry===country && mLeague===lg;
                                    return (
                                      <div key={lg} style={{display:"flex",gap:1,alignItems:"stretch",marginBottom:1}}>
                                        <button onClick={()=>{setMSport(sport);setMCountry(country);setMLeague(lg);setManualExpandedId(null);}}
                                          style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",textAlign:"left",borderRadius:3,cursor:"pointer",border:isLgSel?`1px solid ${C.amber}`:"1px solid transparent",background:isLgSel?`${C.amber}22`:"transparent",color:isLgSel?C.amber:C.muted,fontSize:10,fontWeight:isLgSel?700:400}}>
                                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>⚡ {lg}</span>
                                          <span style={{fontSize:8,color:C.dim,marginLeft:3,flexShrink:0}}>({lgGameCount})</span>
                                        </button>
                                        <button onClick={()=>{setEditMetaModal({type:"league",sport,country,oldName:lg});setEditMetaNewName(lg);}} title="이름 수정" style={{padding:"0 4px",borderRadius:3,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:8}}>✏️</button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 2. 경기 리스트 ─── */}
          <div style={{width:230,flexShrink:0,background:C.bg2,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
              <div style={{fontSize:12,fontWeight:800,color:C.orange,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                {mSport&&mCountry&&mLeague ? `${SPORT_ICON[mSport]||"🏅"} ${mLeague}` : "← 리그 선택"}
              </div>
              <button onClick={()=>{if(!mSport||!mCountry||!mLeague)return alert("먼저 좌측에서 리그 선택");setAddGameModal(true);}}
                style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.green}`,background:`${C.green}22`,color:C.green,cursor:"pointer",fontWeight:800,fontSize:10,flexShrink:0,opacity:mSport&&mCountry&&mLeague?1:0.5}}>+ 경기</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px 8px 20px",minHeight:0}}>
              {!mSport||!mCountry||!mLeague ? (
                <div style={{textAlign:"center",color:C.dim,padding:"40px 10px"}}>
                  <div style={{fontSize:28,marginBottom:8}}>🎯</div>
                  <div style={{fontSize:11,color:C.muted}}>리그 선택</div>
                </div>
              ) : selectedGames.length===0 ? (
                <div style={{textAlign:"center",color:C.dim,padding:"40px 10px"}}>
                  <div style={{fontSize:24,marginBottom:6}}>📋</div>
                  <div style={{fontSize:11}}>경기 없음</div>
                </div>
              ) : selectedGames.map(g=>{
                const selected = manualExpandedId===g.id;
                const pickedCount = [...manualSlipKeys].filter(k=>k.startsWith(g.id+"_")).length;
                return (
                  <div key={g.id} onClick={()=>setManualExpandedId(g.id)}
                    style={{background:selected?`${C.orange}22`:C.bg3,border:`1px solid ${selected?C.orange:C.border}`,borderRadius:6,padding:"9px 10px",marginBottom:6,cursor:"pointer",position:"relative"}}>
                    {pickedCount>0 && <span style={{position:"absolute",top:4,right:4,fontSize:8,background:C.orange,color:C.bg,borderRadius:8,padding:"1px 5px",fontWeight:800}}>{pickedCount}</span>}
                    <div style={{fontSize:11,fontWeight:700,color:C.text,lineHeight:1.3}}>{g.homeTeam}</div>
                    <div style={{fontSize:9,color:C.dim,margin:"2px 0"}}>vs</div>
                    <div style={{fontSize:11,fontWeight:700,color:C.text,lineHeight:1.3}}>{g.awayTeam}</div>
                    <button onClick={e=>{e.stopPropagation();handleDeleteManualGame(g.id);}}
                      style={{position:"absolute",bottom:3,right:3,background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:9,padding:"1px 4px"}}>🗑</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 3. 베팅 옵션 ─── */}
          <div style={{flex:1,minWidth:0,background:C.bg,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            {selGame ? (()=>{
              const g = selGame;
              const gameKey = (opt:string)=>`${g.id}_${opt}`;
              const inSlip = (opt:string)=>manualSlipKeys.has(gameKey(opt));
              const showDraw = g.sportCat==="축구";
              const showOU = g.sportCat!=="E스포츠";
              const isBaseball = g.sportCat==="야구";
              const ouLines = isBaseball ? [4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5] : [null];
              return (
                <>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border2}`,flexShrink:0,background:`linear-gradient(135deg,${C.bg2},${C.bg3})`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:C.dim,marginBottom:5,letterSpacing:1}}>{g.country} · {g.league}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 40px 1fr",alignItems:"center",gap:8}}>
                        <div style={{fontSize:15,fontWeight:800,color:C.text,textAlign:"right"}}>{g.homeTeam}</div>
                        <div style={{textAlign:"center",fontSize:12,color:C.orange,fontWeight:800}}>VS</div>
                        <div style={{fontSize:15,fontWeight:800,color:C.text,textAlign:"left"}}>{g.awayTeam}</div>
                      </div>
                    </div>
                    <button onClick={()=>setManualExpandedId(null)} title="닫기" style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,padding:"5px 10px",borderRadius:5,cursor:"pointer",fontSize:12,marginLeft:10,flexShrink:0}}>✕</button>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:"16px 18px 22px",minHeight:0}}>
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:11,fontWeight:800,color:C.green,marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${C.border}`,letterSpacing:1}}>{showDraw?"승무패":"승패"}</div>
                      <div style={{display:"grid",gridTemplateColumns:showDraw?"1fr 1fr 1fr":"1fr 1fr",gap:7}}>
                        {[
                          {opt:"홈승",label:g.homeTeam,color:C.green,sub:"홈"},
                          ...(showDraw?[{opt:"무승부",label:"무승부",color:C.amber,sub:""}]:[]),
                          {opt:"원정승",label:g.awayTeam,color:C.teal,sub:"원정"},
                        ].map(b=>{
                          const added=inSlip(b.opt);
                          return <button key={b.opt} onClick={()=>handleManualSlipPick(g,b.opt)}
                            style={{padding:"16px 8px",borderRadius:8,cursor:"pointer",border:added?`2px solid ${b.color}`:`1px solid ${C.border}`,background:added?`${b.color}33`:C.bg2,color:added?b.color:C.text,fontWeight:added?800:600,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                            {b.sub && <span style={{fontSize:10,color:added?b.color:C.muted}}>{b.sub}</span>}
                            <span style={{fontSize:13}}>{b.label}</span>
                            {added && <span style={{fontSize:10,color:b.color,fontWeight:800}}>✓ 슬립</span>}
                          </button>;
                        })}
                      </div>
                    </div>
                    {showOU && isBaseball && (
                      <div>
                        <div style={{fontSize:11,fontWeight:800,color:"#e05a9a",marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${C.border}`,letterSpacing:1}}>오버/언더 (기준점수)</div>
                        <div style={{fontSize:10,color:C.muted,marginBottom:4,fontWeight:700}}>오버</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:3,marginBottom:8}}>
                          {ouLines.map(ln=>{const opt=`오버 ${ln}`;const added=inSlip(opt);return <button key={opt} onClick={()=>handleManualSlipPick(g,opt)} style={{padding:"11px 2px",borderRadius:5,cursor:"pointer",border:added?`2px solid #e05a9a`:`1px solid ${C.border}`,background:added?`#e05a9a33`:C.bg2,color:added?"#e05a9a":C.text,fontWeight:added?800:600,fontSize:11}}>{ln}</button>;})}
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginBottom:4,fontWeight:700}}>언더</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:3}}>
                          {ouLines.map(ln=>{const opt=`언더 ${ln}`;const added=inSlip(opt);return <button key={opt} onClick={()=>handleManualSlipPick(g,opt)} style={{padding:"11px 2px",borderRadius:5,cursor:"pointer",border:added?`2px solid #7ac4ff`:`1px solid ${C.border}`,background:added?`#7ac4ff33`:C.bg2,color:added?"#7ac4ff":C.text,fontWeight:added?800:600,fontSize:11}}>{ln}</button>;})}
                        </div>
                      </div>
                    )}
                    {showOU && !isBaseball && (
                      <div>
                        <div style={{fontSize:11,fontWeight:800,color:"#e05a9a",marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${C.border}`,letterSpacing:1}}>오버/언더</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                          {[{opt:"오버",color:"#e05a9a"},{opt:"언더",color:"#7ac4ff"}].map(b=>{const added=inSlip(b.opt);return <button key={b.opt} onClick={()=>handleManualSlipPick(g,b.opt)} style={{padding:"16px 8px",borderRadius:8,cursor:"pointer",border:added?`2px solid ${b.color}`:`1px solid ${C.border}`,background:added?`${b.color}33`:C.bg2,color:added?b.color:C.text,fontWeight:added?800:600,fontSize:13}}>{b.opt}{added&&<span style={{display:"block",fontSize:10,color:b.color,marginTop:3}}>✓ 슬립</span>}</button>;})}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })() : (
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,padding:"30px"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:42,marginBottom:12}}>🎯</div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:5}}>경기를 선택하세요</div>
                  <div style={{fontSize:11}}>카테고리 → 리그 → 경기</div>
                </div>
              </div>
            )}
          </div>

          {/* ─── 4. 베팅 슬립 ─── */}
          <div style={{width:310,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",background:C.bg2,borderLeft:`1px solid ${C.border2}`,minHeight:0}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:800,color:C.orange}}>
                📋 베팅 슬립
                {manualSlip.length>0 && <span style={{marginLeft:6,fontSize:11,background:C.orange,color:C.bg,borderRadius:10,padding:"1px 7px"}}>{manualSlip.length}</span>}
              </div>
              {manualSlip.length>0 && <button onClick={()=>setManualSlip([])} style={{fontSize:9,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>삭제</button>}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"10px 11px 14px",minHeight:0}}>
              {manualSlip.length===0 ? (
                <div style={{textAlign:"center",color:C.dim,padding:"25px 10px",fontSize:11}}>
                  경기 옵션을 클릭하면<br/>여기에 추가됩니다<br/>
                  <span style={{fontSize:9,color:C.muted,marginTop:6,display:"block"}}>※ 단일 베팅만 가능</span>
                </div>
              ) : manualSlip.map(item=>{
                const optColor = item.optLabel==="홈승"?C.green:item.optLabel==="원정승"?C.teal:item.optLabel==="무승부"?C.amber:item.optLabel.startsWith("오버")?"#e05a9a":"#7ac4ff";
                const oddsRaw = item.odds>0 ? String(item.odds) : "";
                const displayOpt = item.optLabel==="홈승" ? `${item.game.homeTeam} 승` : item.optLabel==="원정승" ? `${item.game.awayTeam} 승` : item.optLabel;
                return (
                  <div key={item.id} style={{background:C.bg3,border:`1px solid ${optColor}66`,borderRadius:8,padding:"10px 11px",marginBottom:8,position:"relative"}}>
                    <button onClick={()=>setManualSlip(p=>p.filter(s=>s.id!==item.id))} style={{position:"absolute",top:5,right:5,background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:12,padding:"2px 5px"}}>✕</button>
                    <div style={{fontSize:9,color:C.muted,marginBottom:4,paddingRight:18}}>{item.game.country} · {item.game.league}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:5,marginBottom:6}}>
                      <div style={{fontSize:11,fontWeight:800,color:C.text,textAlign:"right",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.game.homeTeam}</div>
                      <div style={{fontSize:9,color:C.dim}}>vs</div>
                      <div style={{fontSize:11,fontWeight:800,color:C.text,textAlign:"left",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.game.awayTeam}</div>
                    </div>
                    <div style={{background:`${optColor}22`,border:`1px solid ${optColor}66`,borderRadius:5,padding:"4px 8px",marginBottom:6,textAlign:"center"}}>
                      <span style={{fontSize:12,color:optColor,fontWeight:800}}>→ {displayOpt}</span>
                    </div>
                    <input type="text" inputMode="decimal" placeholder="배당 (321→3.21)" value={oddsRaw}
                      onChange={e=>{let raw=e.target.value.replace(/[^0-9.]/g,"");let v=0;if(/^\d{3,}$/.test(raw)){v=parseFloat((parseInt(raw,10)/100).toFixed(2));}else{v=parseFloat(raw)||0;}setManualSlip(prev=>prev.map(s=>s.id===item.id?{...s,odds:v}:s));}}
                      style={{...S,boxSizing:"border-box",fontSize:12,padding:"6px 9px"}}/>
                  </div>
                );
              })}

              {manualSlip.length>0 && (
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
                  <div style={{marginBottom:8}}>
                    <div style={L}>사이트</div>
                    {activeSiteNames.length===0 ? <div style={{fontSize:10,color:C.dim}}>활성 사이트 없음</div> :
                      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                        {activeSiteNames.filter(s=>krwSites.includes(s)).map(s=><button key={s} onClick={()=>setManualSlipSite(s)} style={siteBtn(manualSlipSite===s,false)}>₩ {s}</button>)}
                        {activeSiteNames.filter(s=>usdSites.includes(s)).map(s=><button key={s} onClick={()=>setManualSlipSite(s)} style={siteBtn(manualSlipSite===s,true)}>$ {s}</button>)}
                      </div>}
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={L}>금액</div>
                    <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:4}}>
                      <button onClick={()=>setManualSlipAmount(a=>Math.max(isUSD(manualSlipSite)?1:1000,a-(isUSD(manualSlipSite)?1:10000)))} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.red,width:26,height:30,borderRadius:4,cursor:"pointer",fontSize:13,fontWeight:700}}>−</button>
                      <input type="number" value={manualSlipAmount} onChange={e=>setManualSlipAmount(parseFloat(e.target.value)||0)} style={{...S,textAlign:"center" as const,fontWeight:800,color:isUSD(manualSlipSite)?C.amber:C.green,fontSize:12,padding:"5px",boxSizing:"border-box" as const,...noSpin}}/>
                      <button onClick={()=>setManualSlipAmount(a=>a+(isUSD(manualSlipSite)?1:10000))} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.green,width:26,height:30,borderRadius:4,cursor:"pointer",fontSize:13,fontWeight:700}}>+</button>
                    </div>
                    <div style={{display:"flex",gap:2}}>
                      {(isUSD(manualSlipSite)?USD_HK:KRW_HK).map(v=><button key={v} onClick={()=>setManualSlipAmount(v)} style={{flex:1,padding:"3px 0",borderRadius:3,border:`1px solid ${isUSD(manualSlipSite)?C.amber+"44":C.green+"44"}`,background:manualSlipAmount===v?`${isUSD(manualSlipSite)?C.amber:C.green}22`:C.bg,color:isUSD(manualSlipSite)?C.amber:C.green,cursor:"pointer",fontSize:9}}>{isUSD(manualSlipSite)?`$${v}`:`${v/10000}만`}</button>)}
                    </div>
                  </div>
                  {(()=>{
                    const item = manualSlip[0];
                    if(!item||item.odds<=1||manualSlipAmount<=0)return null;
                    const profit = parseFloat((manualSlipAmount*item.odds-manualSlipAmount).toFixed(2));
                    return (
                      <div style={{background:C.bg3,borderRadius:6,padding:"7px 10px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:10,color:C.muted}}>배당 <b style={{color:C.teal}}>{item.odds.toFixed(2)}</b></span>
                        <span style={{fontSize:10,color:C.muted}}>예상</span>
                        <span style={{fontSize:13,fontWeight:800,color:C.green}}>+{isUSD(manualSlipSite)?`$${profit.toFixed(2)}`:profit.toLocaleString()}</span>
                      </div>
                    );
                  })()}
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                    <input type="checkbox" id="cbStatInc2" checked={manualSlipInclude} onChange={e=>setManualSlipInclude(e.target.checked)} style={{width:13,height:13,accentColor:C.purple}}/>
                    <label htmlFor="cbStatInc2" style={{fontSize:11,color:C.muted,cursor:"pointer"}}>통계 포함</label>
                  </div>
                  <button onClick={handleManualSlipAdd} disabled={manualSlip.length===0||!manualSlipSite}
                    style={{width:"100%",background:manualSlip.length>0&&manualSlipSite?`linear-gradient(135deg,${C.orange}55,${C.green}33)`:C.border,border:`2px solid ${manualSlip.length>0&&manualSlipSite?C.orange:C.border}`,color:manualSlip.length>0&&manualSlipSite?C.orange:C.dim,padding:"11px",borderRadius:8,cursor:manualSlip.length>0&&manualSlipSite?"pointer":"default",fontWeight:900,fontSize:13}}>
                    ✅ 베팅
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ─── 5. 진행중 + 사이트 진행률 (우측 끝) ─── */}
          <div style={{width:460,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",background:C.bg2,borderLeft:`1px solid ${C.border2}`,minHeight:0}}>

            {/* 상: 사이트 진행률 */}
            <div style={{flexShrink:0,padding:"10px 12px",borderBottom:`1px solid ${C.border2}`,background:C.bg3}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:7}}>
                <div style={{fontSize:12,fontWeight:800,color:C.teal}}>💳 사이트 진행률</div>
                <div style={{display:"flex",gap:8,fontSize:9}}>
                  <span style={{color:C.muted}}>₩<b style={{color:C.green}}>{krwRemaining.toLocaleString()}</b></span>
                  <span style={{color:C.muted}}>$<b style={{color:C.amber}}>{usdRemaining.toFixed(2)}</b></span>
                </div>
              </div>
              {/* 활성 사이트 토글 (작게) */}
              <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:8}}>
                {ALL_SITES.map(s=>{const active=siteStates[s]?.active;const dollar=isUSD(s);return<button key={s} onClick={()=>{const u={...siteStates[s],active:!siteStates[s].active,isDollar:dollar};setSiteStatesRaw(p=>({...p,[s]:u}));db.upsertSiteState(s,u);}} style={{padding:"2px 6px",borderRadius:3,border:active?`1px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?(dollar?`${C.amber}22`:`${C.green}22`):C.bg2,color:active?(dollar?C.amber:C.green):C.dim,cursor:"pointer",fontSize:9,fontWeight:700}}>{dollar?"$":"₩"}{s}</button>;})}
              </div>
              {/* 진행률 카드 그리드 (2열) */}
              {activeSiteNames.length===0 ? (
                <div style={{textAlign:"center",color:C.dim,padding:"15px 0",fontSize:10}}>사이트를 활성화하세요</div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {activeSiteNames.map(site=>{
                    const st=siteStates[site]||{deposited:0,betTotal:0,active:false,isDollar:false};
                    const dollar=isUSD(site);
                    const remaining=Math.max(0,parseFloat((st.deposited-st.betTotal).toFixed(2)));
                    const totalBase=parseFloat((st.deposited+(st.pointTotal||0)).toFixed(2));
                    const pct=totalBase>0?Math.min(100,Math.round(st.betTotal/totalBase*100)):0;
                    const barColor=pct>=90?C.red:pct>=70?C.amber:C.green;
                    const sitePendingCount=pending.filter(b=>b.site===site).length;
                    return(
                      <div key={site} style={{background:C.bg,border:`1px solid ${barColor}33`,borderRadius:6,padding:"7px 9px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <span style={{fontSize:10,fontWeight:800,color:C.text}}>{dollar?"$":"₩"} {site}</span>
                          <span style={{fontSize:9,color:barColor,fontWeight:700}}>{pct}%</span>
                        </div>
                        <div style={{fontSize:9,color:C.muted,marginBottom:4}}>
                          잔 <span style={{color:C.teal,fontWeight:700}}>{fmtDisp(remaining,dollar)}</span>
                          {sitePendingCount>0 && <span style={{color:C.amber,marginLeft:5,fontWeight:700}}>· {sitePendingCount}건</span>}
                        </div>
                        <div style={{height:4,background:C.bg2,borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:barColor,transition:"width 0.3s"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 하: 진행중 베팅 (최신순) */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
              <div style={{padding:"9px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:12,fontWeight:800,color:C.amber}}>⏳ 진행중 ({pending.length}건)</div>
                <div style={{fontSize:9,color:C.dim}}>최신순</div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"8px 10px 14px",minHeight:0}}>
                {pendingSorted.length===0 ? (
                  <div style={{textAlign:"center",color:C.dim,padding:"25px 10px"}}>
                    <div style={{fontSize:22,marginBottom:6}}>💤</div>
                    <div style={{fontSize:10,color:C.muted}}>진행 중 베팅 없음</div>
                  </div>
                ) : pendingSorted.map(b=>{
                  const title = (b.homeTeam && b.awayTeam) ? `${b.homeTeam} vs ${b.awayTeam}` : (b.teamName || "-");
                  const displayBetOption =
                    b.betOption==="홈승" && b.homeTeam ? `${b.homeTeam} 승` :
                    b.betOption==="원정승" && b.awayTeam ? `${b.awayTeam} 승` :
                    b.betOption;
                  const dollar = b.isDollar;
                  return (
                    <div key={b.id} style={{background:C.bg3,border:`1px solid ${C.amber}44`,borderRadius:7,padding:"9px 11px",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,flexShrink:0}}>{SPORT_ICON[b.category]||"🎯"}</span>
                        <span style={{fontSize:9,color:dollar?C.amber:C.green,background:`${dollar?C.amber:C.green}22`,border:`1px solid ${dollar?C.amber:C.green}44`,padding:"1px 5px",borderRadius:3,fontWeight:700}}>
                          {dollar?"$":"₩"} {b.site}
                        </span>
                        {b.league && <span style={{fontSize:9,color:C.muted,background:C.bg,padding:"1px 5px",borderRadius:3}}>{b.league}</span>}
                        <span style={{fontSize:11,color:C.purple,fontWeight:800,marginLeft:"auto"}}>{displayBetOption}</span>
                      </div>
                      <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:6,lineHeight:1.3,wordBreak:"break-word"}}>{title}</div>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                        <div style={{display:"flex",gap:8,flex:1,minWidth:100}}>
                          <span style={{fontSize:10,color:C.muted}}>배당 <span style={{color:C.teal,fontWeight:800,fontSize:11}}>{b.odds}</span></span>
                          <span style={{fontSize:11,color:C.amber,fontWeight:800}}>{fmtDisp(b.amount,b.isDollar)}</span>
                        </div>
                        <div style={{display:"flex",gap:2,flexShrink:0}}>
                          <button onClick={()=>{setEditingBetId(b.id);setEditBetForm({homeTeam:b.homeTeam,awayTeam:b.awayTeam,teamName:b.teamName,betOption:b.betOption,amount:b.amount});setEditBetOddsRaw(String(Math.round((b.odds||0)*100)));}} style={{background:`${C.teal}11`,border:`1px solid ${C.teal}44`,color:C.teal,padding:"3px 7px",borderRadius:3,cursor:"pointer",fontSize:10}}>✏️</button>
                          <button onClick={()=>updateResult(b.id,"승")} style={{background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"3px 7px",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:10}}>✅</button>
                          <button onClick={()=>updateResult(b.id,"패")} style={{background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"3px 7px",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:10}}>❌</button>
                          <button onClick={()=>cancelBet(b.id)} style={{background:C.bg,border:`1px solid ${C.border2}`,color:C.muted,padding:"3px 7px",borderRadius:3,cursor:"pointer",fontSize:10}}>취소</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
        );
      })()}


      {/* ══ 베팅 탭 (수동 경기 · 종목/국가/리그 계층) ══ */}
      {tab==="bettingManual" && (()=>{

        // 현재 선택된 리그의 경기들
        const selectedGames = (mSport && mCountry && mLeague)
          ? manualGames.filter(g=>g.sportCat===mSport&&g.country===mCountry&&g.league===mLeague)
              .sort((a,b)=>b.createdAt-a.createdAt)
          : [];

        return (
        <div style={{display:"flex",flex:1,overflow:"hidden",minWidth:0,minHeight:0}}>

          {/* ─── 좌: 종목 → 국가 → 리그 (계층 아코디언) ─── */}
          <div style={{width:450,flexShrink:0,background:C.bg2,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>

            {/* 헤더 */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:C.text}}>📂 종목 · 국가 · 리그</div>
                <div style={{fontSize:10,color:C.dim,marginTop:2}}>총 {manualGames.length}경기</div>
              </div>
              <button onClick={()=>setAddSportModal(true)}
                style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.purple}`,background:`${C.purple}22`,color:C.purple,cursor:"pointer",fontWeight:700,fontSize:10}}
                title="종목 추가">
                + 종목
              </button>
            </div>

            {/* 계층 트리 */}
            <div style={{flex:1,overflowY:"auto",padding:"8px",minHeight:0}}>
              {allSportsList.map(sport=>{
                const sportOpen = mExpandedSports[sport];
                const cntrs = allCountriesForSport(sport);
                const sportGameCount = manualGames.filter(g=>g.sportCat===sport).length;
                const isSelected = mSport===sport;

                return (
                  <div key={sport} style={{marginBottom:4}}>
                    {/* 종목 버튼 */}
                    <div style={{display:"flex",gap:3,alignItems:"stretch",marginBottom:2}}>
                      <button onClick={()=>{
                        setMExpandedSports(p=>({...p,[sport]:!p[sport]}));
                        setMSport(sport);
                      }}
                        style={{
                          flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",
                          padding:"11px 12px",textAlign:"left",borderRadius:7,cursor:"pointer",
                          border:isSelected?`1px solid ${C.orange}`:`1px solid ${C.border}`,
                          background:isSelected?`${C.orange}22`:C.bg3,
                          color:isSelected?C.orange:C.text,
                          fontSize:13,fontWeight:800,
                        }}>
                        <span>{SPORT_ICON[sport]||"🏅"} {sport} <span style={{fontSize:10,color:C.dim,fontWeight:400}}>({sportGameCount})</span></span>
                        <span style={{fontSize:10,color:C.dim}}>{sportOpen?"▼":"▶"}</span>
                      </button>
                      <button onClick={()=>setAddCountryModal({sport})} title="국가 추가"
                        style={{padding:"0 8px",borderRadius:6,border:`1px solid ${C.teal}44`,background:`${C.teal}11`,color:C.teal,cursor:"pointer",fontSize:11,fontWeight:700}}>+</button>
                      <button onClick={()=>{setEditMetaModal({type:"sport",oldName:sport});setEditMetaNewName(sport);}} title="종목 이름 수정"
                        style={{padding:"0 6px",borderRadius:6,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:10}}>✏️</button>
                    </div>

                    {/* 국가 목록 */}
                    {sportOpen && (
                      <div style={{marginLeft:10,paddingLeft:8,borderLeft:`1px solid ${C.border}`}}>
                        {cntrs.length===0 ? (
                          <div style={{fontSize:10,color:C.dim,padding:"6px 8px"}}>국가가 없습니다 · <span style={{color:C.teal,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setAddCountryModal({sport})}>추가하기</span></div>
                        ) : cntrs.map(country=>{
                          const key=`${sport}__${country}`;
                          const cOpen = mExpandedCountries[key];
                          const lgs = allLeaguesForCountry(sport,country);
                          const countryGameCount = manualGames.filter(g=>g.sportCat===sport&&g.country===country).length;
                          const isCountrySel = mSport===sport && mCountry===country;

                          return (
                            <div key={country} style={{marginBottom:3}}>
                              <div style={{display:"flex",gap:3,alignItems:"stretch"}}>
                                <button onClick={()=>{
                                  setMExpandedCountries(p=>({...p,[key]:!p[key]}));
                                  setMSport(sport);setMCountry(country);
                                }}
                                  style={{
                                    flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",
                                    padding:"8px 10px",textAlign:"left",borderRadius:5,cursor:"pointer",
                                    border:isCountrySel?`1px solid ${C.teal}`:"1px solid transparent",
                                    background:isCountrySel?`${C.teal}22`:"transparent",
                                    color:isCountrySel?C.teal:C.muted,
                                    fontSize:12,fontWeight:isCountrySel?700:500,
                                  }}>
                                  <span>{cOpen?"▼":"▶"} {country} <span style={{fontSize:9,color:C.dim,fontWeight:400}}>({countryGameCount})</span></span>
                                </button>
                                <button onClick={()=>setAddLeagueModalM({sport,country})} title="리그 추가"
                                  style={{padding:"0 6px",borderRadius:4,border:`1px solid ${C.amber}44`,background:`${C.amber}11`,color:C.amber,cursor:"pointer",fontSize:10,fontWeight:700}}>+</button>
                                <button onClick={()=>{setEditMetaModal({type:"country",sport,oldName:country});setEditMetaNewName(country);}} title="국가 이름 수정"
                                  style={{padding:"0 5px",borderRadius:4,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:9}}>✏️</button>
                              </div>

                              {/* 리그 목록 */}
                              {cOpen && (
                                <div style={{marginLeft:10,paddingLeft:6,marginTop:2,borderLeft:`1px solid ${C.border}`}}>
                                  {lgs.length===0 ? (
                                    <div style={{fontSize:10,color:C.dim,padding:"4px 8px"}}>리그 없음 · <span style={{color:C.amber,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setAddLeagueModalM({sport,country})}>추가</span></div>
                                  ) : lgs.map(lg=>{
                                    const lgGameCount = manualGames.filter(g=>g.sportCat===sport&&g.country===country&&g.league===lg).length;
                                    const isLgSel = mSport===sport && mCountry===country && mLeague===lg;
                                    return (
                                      <div key={lg} style={{display:"flex",gap:2,alignItems:"stretch",marginBottom:1}}>
                                        <button onClick={()=>{setMSport(sport);setMCountry(country);setMLeague(lg);}}
                                          style={{
                                            flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",
                                            padding:"6px 10px",textAlign:"left",
                                            borderRadius:4,cursor:"pointer",
                                            border:isLgSel?`1px solid ${C.amber}`:"1px solid transparent",
                                            background:isLgSel?`${C.amber}22`:"transparent",
                                            color:isLgSel?C.amber:C.muted,
                                            fontSize:11,fontWeight:isLgSel?700:400,
                                          }}>
                                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>⚡ {lg}</span>
                                          <span style={{fontSize:9,color:C.dim,marginLeft:4,flexShrink:0}}>({lgGameCount})</span>
                                        </button>
                                        <button onClick={()=>{setEditMetaModal({type:"league",sport,country,oldName:lg});setEditMetaNewName(lg);}} title="리그 이름 수정"
                                          style={{padding:"0 5px",borderRadius:4,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer",fontSize:9}}>✏️</button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 중: 30/70 분할 (경기 리스트 + 베팅 옵션) ─── */}
          <div style={{flex:1,minWidth:0,background:C.bg,display:"flex",overflow:"hidden",minHeight:0}}>

            {/* 중-좌: 경기 리스트 (30%) */}
            <div style={{flex:"0 0 30%",minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden",borderRight:`1px solid ${C.border2}`}}>
              <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div style={{fontSize:13,fontWeight:800,color:C.orange,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                  {mSport&&mCountry&&mLeague
                    ? `${SPORT_ICON[mSport]||"🏅"} ${mLeague}`
                    : "← 종목/국가/리그 선택"}
                </div>
                <button onClick={()=>{
                  if(!mSport||!mCountry||!mLeague)return alert("먼저 좌측에서 종목/국가/리그를 선택해주세요.");
                  setAddGameModal(true);
                }}
                  style={{padding:"6px 10px",borderRadius:6,border:`1px solid ${C.green}`,background:`${C.green}22`,color:C.green,cursor:"pointer",fontWeight:800,fontSize:11,flexShrink:0,opacity:mSport&&mCountry&&mLeague?1:0.5}}>
                  ➕ 경기
                </button>
              </div>

              <div style={{flex:1,overflowY:"auto",padding:"10px 10px 20px",minHeight:0}}>
                {!mSport||!mCountry||!mLeague ? (
                  <div style={{textAlign:"center",color:C.dim,padding:"50px 15px"}}>
                    <div style={{fontSize:32,marginBottom:10}}>🎯</div>
                    <div style={{fontSize:12,color:C.muted}}>종목→국가→리그<br/>선택하세요</div>
                  </div>
                ) : selectedGames.length===0 ? (
                  <div style={{textAlign:"center",color:C.dim,padding:"50px 15px"}}>
                    <div style={{fontSize:28,marginBottom:8}}>📋</div>
                    <div style={{fontSize:12,marginBottom:6}}>경기 없음</div>
                    <div style={{fontSize:10}}>➕ 경기 버튼으로 추가</div>
                  </div>
                ) : selectedGames.map(g=>{
                  const selected = manualExpandedId===g.id;
                  // 이 경기에 슬립에 담긴 옵션 개수
                  const pickedCount = [...manualSlipKeys].filter(k=>k.startsWith(g.id+"_")).length;
                  return (
                    <div key={g.id} onClick={()=>setManualExpandedId(g.id)}
                      style={{
                        background:selected?`${C.orange}22`:C.bg3,
                        border:`1px solid ${selected?C.orange:C.border}`,
                        borderRadius:8,padding:"12px 12px",marginBottom:7,
                        cursor:"pointer",position:"relative",
                        transition:"all 0.15s",
                      }}>
                      {pickedCount>0 && (
                        <span style={{position:"absolute",top:6,right:6,fontSize:9,background:C.orange,color:C.bg,borderRadius:10,padding:"1px 6px",fontWeight:800}}>
                          {pickedCount}
                        </span>
                      )}
                      <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:3,lineHeight:1.3}}>{g.homeTeam}</div>
                      <div style={{fontSize:10,color:C.dim,marginBottom:3}}>vs</div>
                      <div style={{fontSize:12,fontWeight:700,color:C.text,lineHeight:1.3}}>{g.awayTeam}</div>
                      <button onClick={e=>{e.stopPropagation();handleDeleteManualGame(g.id);}}
                        style={{position:"absolute",bottom:4,right:4,background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:10,padding:"2px 5px"}}>🗑</button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 중-우: 선택된 경기의 베팅 옵션 (70%) */}
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden",background:C.bg}}>
              {(()=>{
                const g = manualExpandedId ? selectedGames.find(x=>x.id===manualExpandedId) : null;
                if (!g) {
                  return (
                    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,textAlign:"center",padding:"30px"}}>
                      <div>
                        <div style={{fontSize:42,marginBottom:12}}>👈</div>
                        <div style={{fontSize:14,marginBottom:6,color:C.muted}}>좌측에서 경기를 선택하세요</div>
                        <div style={{fontSize:11}}>경기를 클릭하면 상세 베팅 옵션이 표시됩니다</div>
                      </div>
                    </div>
                  );
                }
                const gameKey = (opt:string)=>`${g.id}_${opt}`;
                const inSlip = (opt:string)=>manualSlipKeys.has(gameKey(opt));
                const showDraw = g.sportCat==="축구";
                const showOU = g.sportCat!=="E스포츠";
                const isBaseball = g.sportCat==="야구";
                const ouLines = isBaseball ? [4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5] : [null];

                return (
                  <>
                    {/* 헤더: 팀 vs 팀 */}
                    <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border2}`,flexShrink:0,background:`linear-gradient(135deg,${C.bg2},${C.bg3})`}}>
                      <div style={{fontSize:10,color:C.dim,marginBottom:8,letterSpacing:1}}>{g.country} · {g.league}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 60px 1fr",alignItems:"center",gap:10}}>
                        <div style={{fontSize:18,fontWeight:800,color:C.text,textAlign:"right"}}>{g.homeTeam}</div>
                        <div style={{textAlign:"center",fontSize:14,color:C.orange,fontWeight:800}}>VS</div>
                        <div style={{fontSize:18,fontWeight:800,color:C.text,textAlign:"left"}}>{g.awayTeam}</div>
                      </div>
                    </div>

                    {/* 본문: 베팅 옵션들 */}
                    <div style={{flex:1,overflowY:"auto",padding:"18px 24px 30px",minHeight:0}}>

                      {/* 승·패 */}
                      <div style={{marginBottom:20}}>
                        <div style={{fontSize:12,fontWeight:800,color:C.green,marginBottom:10,letterSpacing:1,paddingBottom:5,borderBottom:`1px solid ${C.border}`}}>
                          {showDraw?"승무패":"승패"}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:showDraw?"1fr 1fr 1fr":"1fr 1fr",gap:8}}>
                          {[
                            {opt:"홈승",label:g.homeTeam,color:C.green,sub:"홈"},
                            ...(showDraw?[{opt:"무승부",label:"무승부",color:C.amber,sub:""}]:[]),
                            {opt:"원정승",label:g.awayTeam,color:C.teal,sub:"원정"},
                          ].map(b=>{
                            const added=inSlip(b.opt);
                            return (
                              <button key={b.opt} onClick={()=>handleManualSlipPick(g,b.opt)}
                                style={{padding:"18px 10px",borderRadius:9,cursor:"pointer",border:added?`2px solid ${b.color}`:`1px solid ${C.border}`,background:added?`${b.color}33`:C.bg2,color:added?b.color:C.text,fontWeight:added?800:600,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                                {b.sub && <span style={{fontSize:10,color:added?b.color:C.muted,letterSpacing:1}}>{b.sub}</span>}
                                <span style={{fontSize:14}}>{b.label}</span>
                                {added && <span style={{fontSize:10,color:b.color,marginTop:3,fontWeight:800}}>✓ 슬립</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 야구 오버/언더 */}
                      {showOU && isBaseball && (
                        <div style={{marginBottom:20}}>
                          <div style={{fontSize:12,fontWeight:800,color:"#e05a9a",marginBottom:10,letterSpacing:1,paddingBottom:5,borderBottom:`1px solid ${C.border}`}}>
                            오버 / 언더 (기준점수)
                          </div>
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:10,color:C.muted,marginBottom:5,fontWeight:700}}>오버</div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:4}}>
                              {ouLines.map(ln=>{
                                const opt=`오버 ${ln}`;
                                const added=inSlip(opt);
                                return (
                                  <button key={opt} onClick={()=>handleManualSlipPick(g,opt)}
                                    style={{padding:"12px 2px",borderRadius:6,cursor:"pointer",border:added?`2px solid #e05a9a`:`1px solid ${C.border}`,background:added?`#e05a9a33`:C.bg2,color:added?"#e05a9a":C.text,fontWeight:added?800:600,fontSize:12,lineHeight:1.2}}>
                                    {ln}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:C.muted,marginBottom:5,fontWeight:700}}>언더</div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(9,1fr)",gap:4}}>
                              {ouLines.map(ln=>{
                                const opt=`언더 ${ln}`;
                                const added=inSlip(opt);
                                return (
                                  <button key={opt} onClick={()=>handleManualSlipPick(g,opt)}
                                    style={{padding:"12px 2px",borderRadius:6,cursor:"pointer",border:added?`2px solid #7ac4ff`:`1px solid ${C.border}`,background:added?`#7ac4ff33`:C.bg2,color:added?"#7ac4ff":C.text,fontWeight:added?800:600,fontSize:12,lineHeight:1.2}}>
                                    {ln}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 야구 아닌 종목 오버/언더 */}
                      {showOU && !isBaseball && (
                        <div style={{marginBottom:20}}>
                          <div style={{fontSize:12,fontWeight:800,color:"#e05a9a",marginBottom:10,letterSpacing:1,paddingBottom:5,borderBottom:`1px solid ${C.border}`}}>
                            오버 / 언더
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                            {[{opt:"오버",color:"#e05a9a"},{opt:"언더",color:"#7ac4ff"}].map(b=>{
                              const added=inSlip(b.opt);
                              return (
                                <button key={b.opt} onClick={()=>handleManualSlipPick(g,b.opt)}
                                  style={{padding:"18px 10px",borderRadius:9,cursor:"pointer",border:added?`2px solid ${b.color}`:`1px solid ${C.border}`,background:added?`${b.color}33`:C.bg2,color:added?b.color:C.text,fontWeight:added?800:600,fontSize:14}}>
                                  {b.opt}
                                  {added && <span style={{display:"block",fontSize:10,color:b.color,marginTop:3}}>✓ 슬립</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

          </div>

          {/* ─── 우: 베팅 슬립 ─── */}
          <div style={{width:510,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",background:C.bg2,borderLeft:`1px solid ${C.border2}`,minHeight:0}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:14,fontWeight:800,color:C.orange}}>
                📋 베팅 슬립
                {manualSlip.length>0 && <span style={{marginLeft:7,fontSize:12,background:C.orange,color:C.bg,borderRadius:10,padding:"2px 8px"}}>{manualSlip.length}</span>}
              </div>
              {manualSlip.length>0 && (
                <button onClick={()=>setManualSlip([])} style={{fontSize:10,padding:"3px 9px",borderRadius:4,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>전체삭제</button>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"10px 12px",minHeight:0}}>
              {manualSlip.length===0 ? (
                <div style={{textAlign:"center",color:C.dim,padding:"40px 10px",fontSize:12}}>
                  경기 옵션을 클릭하면<br/>여기에 추가됩니다
                </div>
              ) : manualSlip.map(item=>{
                const optColor = item.optLabel==="홈승"?C.green:item.optLabel==="원정승"?C.teal:item.optLabel==="무승부"?C.amber:item.optLabel.startsWith("오버")?"#e05a9a":"#7ac4ff";
                const oddsRaw = item.odds>0 ? String(item.odds) : "";
                return (
                  <div key={item.id} style={{background:C.bg3,border:`1px solid ${optColor}66`,borderRadius:10,padding:"14px 16px",marginBottom:10,position:"relative"}}>
                    <button onClick={()=>setManualSlip(p=>p.filter(s=>s.id!==item.id))}
                      style={{position:"absolute",top:8,right:8,background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:14,padding:"2px 6px"}}>✕</button>

                    {/* 국가 · 리그 */}
                    <div style={{fontSize:10,color:C.muted,marginBottom:6,letterSpacing:0.5}}>
                      {item.game.country} · {item.game.league}
                    </div>

                    {/* 팀 vs 팀 (크게) */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:8,marginBottom:9,paddingRight:20}}>
                      <div style={{fontSize:14,fontWeight:800,color:C.text,textAlign:"right",lineHeight:1.3,wordBreak:"break-word"}}>{item.game.homeTeam}</div>
                      <div style={{fontSize:11,color:C.dim,fontWeight:700}}>vs</div>
                      <div style={{fontSize:14,fontWeight:800,color:C.text,textAlign:"left",lineHeight:1.3,wordBreak:"break-word"}}>{item.game.awayTeam}</div>
                    </div>

                    {/* 선택 옵션 */}
                    <div style={{background:`${optColor}22`,border:`1px solid ${optColor}66`,borderRadius:6,padding:"6px 10px",marginBottom:9,textAlign:"center"}}>
                      <span style={{fontSize:13,color:optColor,fontWeight:800}}>→ {item.optLabel==="홈승"?`${item.game.homeTeam} 승`:item.optLabel==="원정승"?`${item.game.awayTeam} 승`:item.optLabel}</span>
                    </div>

                    {/* 배당 입력 */}
                    <input type="text" inputMode="decimal" placeholder="배당 입력 (321 → 3.21)"
                      value={oddsRaw}
                      onChange={e=>{
                        let raw = e.target.value.replace(/[^0-9.]/g, "");
                        let v = 0;
                        if (/^\d{3,}$/.test(raw)) {
                          const n = parseInt(raw, 10);
                          v = parseFloat((n/100).toFixed(2));
                        } else {
                          v = parseFloat(raw) || 0;
                        }
                        setManualSlip(prev=>prev.map(s=>s.id===item.id?{...s,odds:v}:s));
                      }}
                      style={{...S,boxSizing:"border-box",fontSize:13,padding:"8px 10px",fontWeight:600}}/>
                  </div>
                );
              })}

              {manualSlip.length>0 && (
                <>
                  <div style={{borderTop:`1px solid ${C.border}`,margin:"12px 0 10px"}}/>

                  <div style={{marginBottom:10}}>
                    <div style={L}>베팅사이트</div>
                    {activeSiteNames.length===0
                      ? <div style={{fontSize:11,color:C.dim}}>활성 사이트 없음</div>
                      : <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {activeSiteNames.filter(s=>krwSites.includes(s)).map(s=><button key={s} onClick={()=>setManualSlipSite(s)} style={siteBtn(manualSlipSite===s,false)}>₩ {s}</button>)}
                          {activeSiteNames.filter(s=>usdSites.includes(s)).map(s=><button key={s} onClick={()=>setManualSlipSite(s)} style={siteBtn(manualSlipSite===s,true)}>$ {s}</button>)}
                        </div>
                    }
                  </div>

                  <div style={{marginBottom:10}}>
                    <div style={L}>베팅금액</div>
                    <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:5}}>
                      <button onClick={()=>setManualSlipAmount(a=>Math.max(isUSD(manualSlipSite)?1:1000,a-(isUSD(manualSlipSite)?1:10000)))}
                        style={{background:C.bg,border:`1px solid ${C.border}`,color:C.red,width:32,height:36,borderRadius:5,cursor:"pointer",fontSize:15,fontWeight:700}}>−</button>
                      <input type="number" value={manualSlipAmount} onChange={e=>setManualSlipAmount(parseFloat(e.target.value)||0)}
                        style={{...S,textAlign:"center" as const,fontWeight:800,color:isUSD(manualSlipSite)?C.amber:C.green,fontSize:14,padding:"6px",boxSizing:"border-box" as const,...noSpin}}/>
                      <button onClick={()=>setManualSlipAmount(a=>a+(isUSD(manualSlipSite)?1:10000))}
                        style={{background:C.bg,border:`1px solid ${C.border}`,color:C.green,width:32,height:36,borderRadius:5,cursor:"pointer",fontSize:15,fontWeight:700}}>+</button>
                    </div>
                    <div style={{display:"flex",gap:3}}>
                      {(isUSD(manualSlipSite)?USD_HK:KRW_HK).map(v=>(
                        <button key={v} onClick={()=>setManualSlipAmount(v)}
                          style={{flex:1,padding:"4px 0",borderRadius:4,border:`1px solid ${isUSD(manualSlipSite)?C.amber+"44":C.green+"44"}`,background:manualSlipAmount===v?`${isUSD(manualSlipSite)?C.amber:C.green}22`:C.bg,color:isUSD(manualSlipSite)?C.amber:C.green,cursor:"pointer",fontSize:10}}>
                          {isUSD(manualSlipSite)?`$${v}`:`${v/10000}만`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(()=>{
                    const totalOdds = manualSlip.reduce((acc,s)=>acc*(s.odds>1?s.odds:1),1);
                    const allHaveOdds = manualSlip.every(s=>s.odds>1);
                    if(!allHaveOdds||manualSlipAmount<=0)return null;
                    const profit = parseFloat((manualSlipAmount*totalOdds-manualSlipAmount).toFixed(2));
                    return (
                      <div style={{background:C.bg3,borderRadius:7,padding:"10px 12px",marginBottom:10}}>
                        {manualSlip.length>1 && <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:C.muted}}>합산 배당</span><span style={{color:C.teal,fontWeight:700}}>{totalOdds.toFixed(2)}</span></div>}
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <span style={{fontSize:12,color:C.muted}}>예상 수익</span>
                          <span style={{fontSize:14,fontWeight:800,color:C.green}}>+{isUSD(manualSlipSite)?`$${profit.toFixed(2)}`:profit.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
                    <input type="checkbox" id="mSlipStats" checked={manualSlipInclude} onChange={e=>setManualSlipInclude(e.target.checked)} style={{width:14,height:14,accentColor:C.purple}}/>
                    <label htmlFor="mSlipStats" style={{fontSize:12,color:C.muted,cursor:"pointer"}}>통계에 포함</label>
                  </div>

                  <button onClick={handleManualSlipAdd} disabled={manualSlip.length===0||!manualSlipSite}
                    style={{
                      width:"100%",
                      background:manualSlip.length>0&&manualSlipSite?`linear-gradient(135deg,${C.orange}55,${C.green}33)`:C.border,
                      border:`2px solid ${manualSlip.length>0&&manualSlipSite?C.orange:C.border}`,
                      color:manualSlip.length>0&&manualSlipSite?C.orange:C.dim,
                      padding:"15px",borderRadius:10,cursor:manualSlip.length>0&&manualSlipSite?"pointer":"default",
                      fontWeight:900,fontSize:15,
                    }}>
                    ✅ 베팅 ({manualSlip.length}건)
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
        );
      })()}

      {/* ══ 베팅 탭 (신규 설계) ══ */}
      {tab==="betting" && (
        <div style={{display:"flex",flex:1,overflow:"hidden",minWidth:0,minHeight:0}}>

          {/* 좌+중: 종목탭 / 국가(좌) + 경기목록(중) */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0,minWidth:0}}>

            {/* ═══ 상단: 종목 탭 (크게) + 캐시 상태 ═══ */}
            <div style={{flexShrink:0,padding:"14px 20px 10px",borderBottom:`1px solid ${C.border2}`,background:C.bg2}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:18,fontWeight:900,color:C.orange,letterSpacing:1}}>🧪 베팅(환경변수)</div>
                <div style={{display:"flex",gap:10,alignItems:"center",fontSize:12}}>
                  <span style={{color:bettingCacheInfo.expiresAt&&bettingCacheInfo.expiresAt>nowTick?C.teal:C.amber}}>⏱ {bettingCacheMsg}</span>
                  <button onClick={()=>loadBettingData(true)} disabled={bettingLoading||bettingSport==="esports"}
                    style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.orange}44`,
                      background:bettingLoading?C.bg3:`${C.orange}11`,color:bettingLoading?C.muted:C.orange,
                      cursor:bettingLoading||bettingSport==="esports"?"default":"pointer",fontWeight:700,fontSize:12}}>
                    {bettingLoading?"⌛ 불러오는 중...":"🔄 강제 새로고침"}
                  </button>
                </div>
              </div>

              {/* 종목 탭 (크게) */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
                {SPORT_ORDER.map(sp=>{
                  const m = SPORT_META[sp];
                  const active = bettingSport===sp;
                  return (
                    <button key={sp} onClick={()=>setBettingSport(sp)}
                      style={{
                        padding:"14px 8px",borderRadius:10,cursor:"pointer",
                        border:active?`2px solid ${m.color}`:`1px solid ${C.border}`,
                        background:active?`${m.color}22`:C.bg3,
                        color:active?m.color:C.muted,
                        display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                        transition:"all 0.15s",fontWeight:active?800:500,
                      }}
                      onMouseEnter={e=>{if(!active)e.currentTarget.style.borderColor=m.color+"66";}}
                      onMouseLeave={e=>{if(!active)e.currentTarget.style.borderColor=C.border;}}>
                      <span style={{fontSize:24}}>{m.icon}</span>
                      <span style={{fontSize:13,letterSpacing:1}}>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {bettingError && <div style={{marginTop:8,fontSize:11,color:C.red,padding:"6px 10px",background:`${C.red}11`,border:`1px solid ${C.red}44`,borderRadius:6}}>⚠ {bettingError}</div>}
            </div>

            {/* ═══ 본문: 국가(좌) + 경기(중) 독립 스크롤 ═══ */}
            <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0,minWidth:0}}>

              {/* ── 좌: 국가 / 리그 (독립 스크롤, 크게) ── */}
              <div style={{
                width:240,flexShrink:0,background:C.bg2,
                borderRight:`1px solid ${C.border2}`,
                display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0,
              }}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.text}}>🌍 국가 / 리그</div>
                  <div style={{fontSize:10,color:C.dim,marginTop:2}}>{bettingCountries.length}개 국가 · {bettingFixtures.length}경기</div>
                </div>

                {/* ↓ 이 영역만 스크롤 ↓ */}
                <div style={{flex:1,overflowY:"auto",padding:"8px 8px 20px",minHeight:0}}>
                  {bettingSport==="esports" ? (
                    <div style={{padding:"30px 10px",textAlign:"center",color:C.dim}}>
                      <div style={{fontSize:28,marginBottom:8}}>🎮</div>
                      <div style={{fontSize:12}}>E스포츠 API 연동 준비중</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:6}}>별도 API 필요</div>
                    </div>
                  ) : bettingLoading && bettingCountries.length===0 ? (
                    <div style={{padding:"30px 10px",textAlign:"center",color:C.dim,fontSize:12}}>⌛ 불러오는 중...</div>
                  ) : bettingCountries.length===0 ? (
                    <div style={{padding:"30px 10px",textAlign:"center",color:C.dim,fontSize:12}}>경기 없음</div>
                  ) : bettingCountries.map(c=>{
                    const isOpen = bettingCountry===c;
                    const leagues = Object.keys(bettingTree[c]).sort();
                    const totalGames = Object.values(bettingTree[c]).reduce((s,arr)=>s+arr.length,0);
                    const liveGames = Object.values(bettingTree[c]).flat().filter(f=>isLive(f.status_short)).length;
                    return (
                      <div key={c} style={{marginBottom:3}}>
                        {/* 국가 버튼 (크게) */}
                        <button onClick={()=>{
                          setBettingCountry(isOpen?"":c);
                          if (isOpen) { setBettingLeague(""); setBettingExpandedGameId(null); }
                        }}
                          style={{
                            display:"flex",justifyContent:"space-between",alignItems:"center",
                            width:"100%",padding:"11px 14px",textAlign:"left",
                            borderRadius:8,cursor:"pointer",
                            border:isOpen?`1px solid ${spColor}`:`1px solid ${C.border}`,
                            background:isOpen?`${spColor}22`:C.bg3,
                            color:isOpen?spColor:C.text,
                            fontSize:14,fontWeight:isOpen?800:600,
                          }}>
                          <span>{isOpen?"▼":"▶"} {c}</span>
                          <span style={{fontSize:10,color:C.dim,fontWeight:400}}>
                            {liveGames>0&&<span style={{color:C.red,fontWeight:800,marginRight:4}}>●{liveGames}</span>}
                            {totalGames}
                          </span>
                        </button>
                        {isOpen && (
                          <div style={{marginTop:3,marginLeft:8}}>
                            {leagues.map(lg=>{
                              const sel = bettingLeague===lg;
                              const count = bettingTree[c][lg].length;
                              return (
                                <button key={lg} onClick={()=>{setBettingLeague(lg);setBettingExpandedGameId(null);}}
                                  style={{
                                    display:"flex",justifyContent:"space-between",alignItems:"center",
                                    width:"100%",padding:"8px 12px",marginBottom:2,textAlign:"left",
                                    borderRadius:6,cursor:"pointer",
                                    border:sel?`1px solid ${C.teal}`:"1px solid transparent",
                                    background:sel?`${C.teal}22`:"transparent",
                                    color:sel?C.teal:C.muted,
                                    fontSize:12,fontWeight:sel?700:400,
                                  }}>
                                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{lg}</span>
                                  <span style={{fontSize:10,color:C.dim,marginLeft:6,flexShrink:0}}>{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 중: 경기 + 베팅 옵션 (독립 스크롤) ── */}
              <div style={{
                flex:1,minWidth:0,background:C.bg,
                display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0,
              }}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.amber,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {bettingLeague ? `${bettingCountry} · ${bettingLeague}` : "리그를 선택하세요"}
                  </div>
                </div>
                {/* ↓ 이 영역만 스크롤 ↓ */}
                <div style={{flex:1,overflowY:"auto",padding:"10px 14px 20px",minHeight:0}}>
                  {!bettingLeague ? (
                    <div style={{textAlign:"center",color:C.dim,padding:"60px 10px",fontSize:13}}>
                      ← 좌측에서 국가와 리그를 선택하세요
                    </div>
                  ) : bettingLeagueGames.length===0 ? (
                    <div style={{textAlign:"center",color:C.dim,padding:"60px 10px",fontSize:13}}>예정 경기 없음</div>
                  ) : bettingLeagueGames.map(g=>{
                    const expanded = bettingExpandedGameId===g.id;
                    const live = isLive(g.status_short);
                    const fin = isFinished(g.status_short);
                    const gameKey = (opt:string)=>`${g.id}_${opt}`;
                    const inSlip = (opt:string)=>slipGameIds.has(gameKey(opt));

                    const optBtns = [
                      {opt:"홈승", label:t(g.home_team), color:C.green, sub:"홈"},
                      ...(g.sport==="football" ? [{opt:"무승부",label:"무승부",color:C.amber,sub:""}] : []),
                      {opt:"원정승", label:t(g.away_team), color:C.teal, sub:"원정"},
                    ];

                    return (
                      <div key={g.id}
                        style={{
                          background:expanded?C.bg2:C.bg3,
                          border:`1px solid ${expanded?spColor:live?C.red+"55":C.border}`,
                          borderRadius:8,marginBottom:6,overflow:"hidden",
                        }}>
                        {/* 경기 헤더 */}
                        <div onClick={()=>setBettingExpandedGameId(expanded?null:g.id)}
                          style={{padding:"10px 12px",cursor:"pointer"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                            {live&&<span style={{background:C.red,color:"#fff",fontSize:9,padding:"1px 6px",borderRadius:3,fontWeight:800}}>LIVE</span>}
                            {live&&g.elapsed!==null&&<span style={{fontSize:11,color:C.red,fontWeight:700}}>{g.elapsed}{g.sport==="baseball"?"이닝":"'"}</span>}
                            {!live&&!fin&&<span style={{fontSize:11,color:C.muted}}>{fmtKstDate(g.start_time)} {fmtKstTime(g.start_time)}</span>}
                            {fin&&<span style={{fontSize:10,color:C.dim}}>종료 · {g.status_short}</span>}
                            <span style={{marginLeft:"auto",fontSize:10,color:C.dim}}>{expanded?"▲":"▼"}</span>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 60px 1fr",alignItems:"center",gap:8}}>
                            <div style={{fontSize:13,fontWeight:700,color:C.text,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t(g.home_team)}</div>
                            <div style={{textAlign:"center",fontSize:14,fontWeight:900,color:live?C.amber:fin?C.muted:C.dim}}>
                              {g.home_score!==null&&g.away_score!==null ? `${g.home_score} : ${g.away_score}` : "vs"}
                            </div>
                            <div style={{fontSize:13,fontWeight:700,color:C.text,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t(g.away_team)}</div>
                          </div>
                        </div>

                        {/* 베팅 옵션 */}
                        {expanded && !fin && (
                          <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 12px",background:C.bg3}}>
                            <div style={{fontSize:10,fontWeight:700,color:C.muted,marginBottom:6,letterSpacing:1}}>베팅 옵션 · 클릭하면 슬립에 추가</div>
                            <div style={{display:"grid",gridTemplateColumns:optBtns.length===3?"1fr 1fr 1fr":"1fr 1fr",gap:6}}>
                              {optBtns.map(b=>{
                                const added = inSlip(b.opt);
                                return (
                                  <button key={b.opt} onClick={()=>handleSlipPick(g, b.opt)}
                                    style={{
                                      padding:"12px 8px",borderRadius:7,cursor:"pointer",
                                      border:added?`2px solid ${b.color}`:`1px solid ${C.border}`,
                                      background:added?`${b.color}33`:C.bg2,
                                      color:added?b.color:C.text,fontWeight:added?800:600,
                                      display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                                      transition:"all 0.15s",
                                    }}
                                    onMouseEnter={e=>{if(!added)e.currentTarget.style.borderColor=b.color;}}
                                    onMouseLeave={e=>{if(!added)e.currentTarget.style.borderColor=C.border;}}>
                                    {b.sub && <span style={{fontSize:9,color:added?b.color:C.muted}}>{b.sub}</span>}
                                    <span style={{fontSize:12}}>{b.label}</span>
                                    {added && <span style={{fontSize:9,color:b.color,marginTop:2}}>✓ 슬립 담김</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {expanded && fin && (
                          <div style={{borderTop:`1px solid ${C.border}`,padding:"14px",textAlign:"center",color:C.muted,fontSize:11,background:C.bg3}}>
                            종료된 경기입니다
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── 우: 베팅 슬립 (독립 스크롤) ── */}
          <div style={{width:280,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",background:C.bg2,borderLeft:`1px solid ${C.border2}`,minHeight:0}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:800,color:C.orange}}>
                📋 베팅 슬립
                {slip.length>0 && <span style={{marginLeft:6,fontSize:11,background:C.orange,color:C.bg,borderRadius:10,padding:"1px 7px"}}>{slip.length}</span>}
              </div>
              {slip.length>0 && (
                <button onClick={()=>setSlip([])} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>전체삭제</button>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"8px 10px",minHeight:0}}>
              {slip.length===0 ? (
                <div style={{textAlign:"center",color:C.dim,padding:"30px 10px",fontSize:11}}>
                  경기 옵션을 클릭하면<br/>여기에 추가됩니다
                </div>
              ) : slip.map(item=>{
                const optColor = item.optLabel==="홈승"?C.green:item.optLabel==="원정승"?C.teal:C.amber;
                return (
                  <div key={item.id} style={{background:C.bg3,border:`1px solid ${optColor}44`,borderRadius:8,padding:"10px 12px",marginBottom:8,position:"relative"}}>
                    <button onClick={()=>setSlip(p=>p.filter(s=>s.id!==item.id))}
                      style={{position:"absolute",top:6,right:6,background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:12}}>✕</button>
                    <div style={{fontSize:9,color:C.muted,marginBottom:3}}>{item.game.league_name}</div>
                    <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4,paddingRight:16}}>
                      {t(item.game.home_team)} vs {t(item.game.away_team)}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontSize:12,color:optColor,fontWeight:700}}>{item.optLabel}</span>
                    </div>
                    <input type="text" inputMode="decimal" placeholder="배당 (예: 1.85)"
                      value={item.odds || ""}
                      onChange={e=>{
                        const v = parseFloat(e.target.value) || 0;
                        setSlip(prev=>prev.map(s=>s.id===item.id?{...s,odds:v}:s));
                      }}
                      style={{...S,boxSizing:"border-box",fontSize:12,padding:"5px 8px"}}/>
                  </div>
                );
              })}

              {slip.length>0 && (
                <>
                  <div style={{borderTop:`1px solid ${C.border}`,margin:"10px 0 8px"}}/>

                  <div style={{marginBottom:8}}>
                    <div style={L}>베팅사이트</div>
                    {activeSiteNames.length===0
                      ? <div style={{fontSize:11,color:C.dim}}>활성 사이트 없음</div>
                      : <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                          {activeSiteNames.filter(s=>krwSites.includes(s)).map(s=>(
                            <button key={s} onClick={()=>setSlipSite(s)} style={siteBtn(slipSite===s,false)}>₩ {s}</button>
                          ))}
                          {activeSiteNames.filter(s=>usdSites.includes(s)).map(s=>(
                            <button key={s} onClick={()=>setSlipSite(s)} style={siteBtn(slipSite===s,true)}>$ {s}</button>
                          ))}
                        </div>
                    }
                  </div>

                  <div style={{marginBottom:8}}>
                    <div style={L}>베팅금액</div>
                    <div style={{display:"flex",gap:2,alignItems:"center",marginBottom:4}}>
                      <button onClick={()=>setSlipAmount(a=>Math.max(isUSD(slipSite)?1:1000,a-(isUSD(slipSite)?1:10000)))}
                        style={{background:C.bg,border:`1px solid ${C.border}`,color:C.red,width:28,height:32,borderRadius:4,cursor:"pointer",fontSize:14,fontWeight:700}}>−</button>
                      <input type="number" value={slipAmount} onChange={e=>setSlipAmount(parseFloat(e.target.value)||0)}
                        style={{...S,textAlign:"center" as const,fontWeight:800,color:isUSD(slipSite)?C.amber:C.green,fontSize:13,padding:"4px",boxSizing:"border-box" as const,...noSpin}}/>
                      <button onClick={()=>setSlipAmount(a=>a+(isUSD(slipSite)?1:10000))}
                        style={{background:C.bg,border:`1px solid ${C.border}`,color:C.green,width:28,height:32,borderRadius:4,cursor:"pointer",fontSize:14,fontWeight:700}}>+</button>
                    </div>
                    <div style={{display:"flex",gap:2}}>
                      {(isUSD(slipSite)?USD_HK:KRW_HK).map(v=>(
                        <button key={v} onClick={()=>setSlipAmount(v)}
                          style={{flex:1,padding:"3px 0",borderRadius:3,border:`1px solid ${isUSD(slipSite)?C.amber+"44":C.green+"44"}`,background:slipAmount===v?`${isUSD(slipSite)?C.amber:C.green}22`:C.bg,color:isUSD(slipSite)?C.amber:C.green,cursor:"pointer",fontSize:9}}>
                          {isUSD(slipSite)?`$${v}`:`${v/10000}만`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(()=>{
                    const totalOdds = slip.reduce((acc,s)=> acc * (s.odds>1?s.odds:1), 1);
                    const allHaveOdds = slip.every(s=>s.odds>1);
                    if (!allHaveOdds || slipAmount<=0) return null;
                    const profit = parseFloat((slipAmount*totalOdds-slipAmount).toFixed(2));
                    return (
                      <div style={{background:C.bg3,borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                        {slip.length>1 && <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}><span style={{color:C.muted}}>합산 배당</span><span style={{color:C.teal,fontWeight:700}}>{totalOdds.toFixed(2)}</span></div>}
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <span style={{fontSize:11,color:C.muted}}>예상 수익</span>
                          <span style={{fontSize:13,fontWeight:700,color:C.green}}>+{isUSD(slipSite)?`$${profit.toFixed(2)}`:profit.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                    <input type="checkbox" id="slipStats" checked={slipInclude} onChange={e=>setSlipInclude(e.target.checked)} style={{width:13,height:13,accentColor:C.purple}}/>
                    <label htmlFor="slipStats" style={{fontSize:11,color:C.muted,cursor:"pointer"}}>통계에 포함</label>
                  </div>

                  <button onClick={handleSlipAdd} disabled={slip.length===0||!slipSite}
                    style={{
                      width:"100%",
                      background:slip.length>0&&slipSite?`linear-gradient(135deg,${C.orange}55,${C.green}33)`:C.border,
                      border:`2px solid ${slip.length>0&&slipSite?C.orange:C.border}`,
                      color:slip.length>0&&slipSite?C.orange:C.dim,
                      padding:"14px",borderRadius:10,cursor:slip.length>0&&slipSite?"pointer":"default",
                      fontWeight:900,fontSize:14,
                    }}>
                    ✅ 베팅 추가 ({slip.length}건)
                  </button>
                </>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ══ 진행중 탭 ══ */}
      {tab==="pending"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border2}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:17,fontWeight:800,color:C.amber}}>⏳ 베팅 진행률</div>
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
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
              {activeSiteNames.map(site=>{
                const st=siteStates[site]||{deposited:0,betTotal:0,active:false,isDollar:false};
                const dollar=isUSD(site);
                const remaining=Math.max(0,parseFloat((st.deposited-st.betTotal).toFixed(2)));
                const totalBase=parseFloat((st.deposited+(st.pointTotal||0)).toFixed(2));
                const pct=totalBase>0?Math.min(100,Math.round(st.betTotal/totalBase*100)):0;
                const barColor=pct>=90?C.red:pct>=70?C.amber:C.green;
                const sitePending=pending.filter(b=>b.site===site);
                const is100=pct>=100;
                const pointAmt=st.pointTotal||0;
                return(
                  <div key={site} style={{background:C.bg3,border:`1px solid ${barColor}33`,borderRadius:12,padding:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:15,fontWeight:800,color:C.text}}>{dollar?"$":"₩"} {site}</span>
                        {is100&&<span style={{fontSize:11,fontWeight:900,color:C.red,border:`2px solid ${C.red}`,borderRadius:5,padding:"1px 6px",opacity:0.7,transform:"rotate(-8deg)",display:"inline-block"}}>완료</span>}
                      </div>
                      <div style={{display:"flex",gap:3}}>
                        <button onClick={()=>cancelSite(site)} title="사이트 취소" style={{fontSize:9,padding:"2px 6px",borderRadius:3,border:`1px solid ${C.border2}`,background:C.bg2,color:C.muted,cursor:"pointer"}}>✕</button>
                        <button onClick={()=>handleClose(site)} style={{fontSize:9,padding:"2px 6px",borderRadius:3,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>마감</button>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"flex-end",marginBottom:6}}>
                      <div style={{flex:1,textAlign:"center"}}>
                        <div style={{fontSize:9,color:C.muted,marginBottom:2}}>입금</div>
                        <EditableCell value={st.deposited} dollar={dollar} color={C.muted} onSave={v=>{const u={...siteStates[site],deposited:v};setSiteStatesRaw(p=>({...p,[site]:u}));db.upsertSiteState(site,u);}}/>
                      </div>
                      {pointAmt>0&&<>
                        <div style={{width:1,height:22,background:C.border}}/>
                        <div style={{flex:1,textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.purple,marginBottom:2}}>포인트</div>
                          <div style={{fontSize:12,fontWeight:700,color:C.purple}}>{fmtDisp(pointAmt,dollar)}</div>
                        </div>
                      </>}
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
                    <div style={{height:5,background:C.bg,borderRadius:3,overflow:"hidden",marginBottom:8}}><div style={{width:`${pct}%`,height:"100%",background:barColor,borderRadius:3}}/></div>
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
      )}

      {/* ══ 통계 탭 ══ */}
      {tab==="stats"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {([["overview","📈 총괄"],["daily","📅 날짜별"],["baseball","⚾ 야구"],["adv","🔬 심화"]] as [string,string][]).map(([k,l])=><button key={k} onClick={()=>setStatTab(k as any)} style={tabBtn(statTab===k,C.purple)}>{l}</button>)}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={async()=>{if(!window.confirm("통계 초기화?"))return;const cleared=bets.map(x=>({...x,includeStats:false}));setBetsRaw(cleared);for(const b of cleared) await db.upsertBet(b);}} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:`1px solid ${C.amber}44`,background:`${C.amber}11`,color:C.amber,cursor:"pointer"}}>통계 초기화</button>
              <button onClick={async()=>{if(!window.confirm("전체 영구 삭제?"))return;for(const b of bets) await db.deleteBet(b.id);setBetsRaw([]);}} style={{fontSize:10,padding:"4px 10px",borderRadius:5,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>전체 삭제</button>
            </div>
          </div>
          {done.length===0&&<div style={{textAlign:"center",color:C.dim,padding:"60px 0",fontSize:14}}>완료된 베팅이 없습니다</div>}
          {done.length>0&&statTab==="overview"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,180px))",gap:10,marginBottom:18}}>
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
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:800,color:C.green}}>💹 수익률 분석</div>
            <div style={{background:C.bg3,border:`1px solid ${totalRoiKRW>=0?C.green:C.red}44`,borderRadius:10,padding:"8px 18px",textAlign:"center"}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:2}}>전체 순손익</div>
              <div style={{fontSize:22,fontWeight:900,color:totalRoiKRW>=0?C.green:C.red}}>{fmtProfit(totalRoiKRW,false)}</div>
            </div>
          </div>
          <div style={{background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:10,padding:14,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.amber,marginBottom:10}}>📊 현재 진행 중 (마감 전)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>원화 입금중</div><div style={{fontSize:16,fontWeight:800,color:C.green}}>₩{activeTotalKrwDep.toLocaleString()}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>원화 베팅중</div><div style={{fontSize:16,fontWeight:800,color:C.amber}}>₩{activeTotalKrwBet.toLocaleString()}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>달러 입금중</div><div style={{fontSize:16,fontWeight:800,color:C.green}}>${activeTotalUsdDep.toFixed(2)}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>달러 베팅중</div><div style={{fontSize:16,fontWeight:800,color:C.amber}}>${activeTotalUsdBet.toFixed(2)}</div></div>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:10}}>사이트별 마감 세션 수익</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {roiStats.map(r=>(
              <div key={r.site} style={{background:C.bg3,border:`1px solid ${r.netKRW>=0?C.green+"44":C.red+"44"}`,borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.text}}>{r.dollar?"$ ":"₩ "}{r.site}</div>
                  <div style={{fontSize:15,fontWeight:900,color:r.netKRW>=0?C.green:C.red}}>{fmtProfit(r.netKRW,false)}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{fontSize:13,fontWeight:700,color:C.purple,marginBottom:10}}>기타 수익 / 지출</div>
          <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,alignItems:"end",marginBottom:8}}>
              <div>
                <div style={L}>사이트</div>
                <select value={pextForm.category} onChange={e=>setPextForm(f=>({...f,category:e.target.value}))} style={{...S,boxSizing:"border-box"}}>
                  <option value="">선택...</option>
                  {pextSiteList.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={L}>분류</div>
                <select value={pextForm.subCategory} onChange={e=>setPextForm(f=>({...f,subCategory:e.target.value}))} style={{...S,boxSizing:"border-box"}}>
                  <option value="">선택...</option>
                  {pextCatList.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><div style={L}>금액</div><input type="number" value={pextForm.amount||""} onChange={e=>setPextForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:6,alignItems:"end",marginBottom:8}}>
              <div><div style={L}>메모</div><input value={pextForm.note} onChange={e=>setPextForm(f=>({...f,note:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
              <button onClick={()=>setPextForm(f=>({...f,isIncome:true}))} style={{padding:"7px 14px",borderRadius:5,border:pextForm.isIncome?`1px solid ${C.green}`:`1px solid ${C.border}`,background:pextForm.isIncome?`${C.green}22`:C.bg2,color:pextForm.isIncome?C.green:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>수입</button>
              <button onClick={()=>setPextForm(f=>({...f,isIncome:false}))} style={{padding:"7px 14px",borderRadius:5,border:!pextForm.isIncome?`1px solid ${C.red}`:`1px solid ${C.border}`,background:!pextForm.isIncome?`${C.red}22`:C.bg2,color:!pextForm.isIncome?C.red:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>지출</button>
            </div>
            <button onClick={()=>{
              if(!pextForm.category)return alert("사이트 선택");
              if(pextForm.amount<=0)return;
              const newPe={id:String(Date.now()),...pextForm,date:today};
              setProfitExtrasRaw(p=>[...p,newPe]);db.insertProfitExtra(newPe);
              setPextForm({category:"",subCategory:"",amount:0,note:"",isIncome:true});
            }} style={{width:"100%",background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"7px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button>
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

      {/* ══ 전략 탭 ══ */}
      {tab==="strategy"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{fontSize:16,fontWeight:800,color:C.amber,marginBottom:14}}>📋 베팅 전략</div>
          <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>
            {["축구","농구","야구","E스포츠"].map(c=><button key={c} onClick={()=>setStratCat(c)} style={tabBtn(stratCat===c,C.orange)}>{c}</button>)}
          </div>
          {stratCat==="축구"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[{title:"⚽ 0.5 플핸",color:C.teal,content:["배당 1.6 이상","정배 배당: 1.60 ~ 2.19","무배당: 3.6 이하"]},{title:"⚽ 1.5 플핸",color:C.green,content:["배당 1.40 이상","정배 배당: 1.30 ~ 1.59","무배당: 4.3 이하"]},{title:"⚽ 2.5 플핸",color:C.amber,content:["배당 1.40 이상","정배 배당: 1.10 ~ 1.29","무배당: 6.6 이하"]}].map(s=>(
                <div key={s.title} style={{background:C.bg3,border:`1px solid ${s.color}33`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:14,fontWeight:800,color:s.color,marginBottom:10}}>{s.title}</div>
                  {s.content.map((line,i)=><div key={i} style={{fontSize:12,color:C.text,padding:"4px 0",borderBottom:i<s.content.length-1?`1px solid ${C.border}`:"none"}}>• {line}</div>)}
                </div>
              ))}
            </div>
          )}
          {stratCat==="농구"&&(<div style={{background:C.bg3,border:`1px solid ${C.purple}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.purple,marginBottom:10}}>🏀 농구 전략</div><div style={{fontSize:12,color:C.text}}>• 5.5 ~ 29.5 플핸 → 플핸 베팅</div><div style={{fontSize:12,color:C.text}}>• 30.5 이상 → 마핸 베팅</div></div>)}
          {stratCat==="야구"&&(<div style={{background:C.bg3,border:`1px solid ${C.red}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.red,marginBottom:8}}>⚾ 야구 전략</div><div style={{fontSize:12,color:C.text}}>• 무지성 역배 / 언오버 테스트 중</div></div>)}
          {stratCat==="E스포츠"&&(
            <div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
                {MAJOR["E스포츠"].map(l=><button key={l} onClick={()=>setEsportsStratLeague(l)} style={{padding:"5px 12px",borderRadius:6,border:esportsStratLeague===l?`1px solid ${C.teal}`:`1px solid ${C.border}`,background:esportsStratLeague===l?`${C.teal}22`:C.bg2,color:esportsStratLeague===l?C.teal:C.muted,cursor:"pointer",fontSize:11}}>{l}</button>)}
              </div>
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
            <div style={{fontSize:16,fontWeight:800,color:C.purple}}>🗒 활동 로그</div>
            <button onClick={()=>setLogs([])} style={{fontSize:11,padding:"5px 12px",borderRadius:5,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer"}}>전체 삭제</button>
          </div>
          {logs.length===0?<div style={{textAlign:"center",color:C.dim,padding:"60px 0",fontSize:14}}>활동 기록이 없습니다</div>:
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {logs.map(l=>(
                <div key={l.id} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",display:"flex",gap:12,alignItems:"center"}}>
                  <div style={{fontSize:13,minWidth:28,textAlign:"center"}}>{l.type.split(" ")[0]}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:C.text}}>{l.type.replace(/^.\s/,"")}</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>{l.desc}</div></div>
                  <div style={{fontSize:10,color:C.dim,flexShrink:0}}>{l.ts}</div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {/* ══ 홈 탭 ══ */}
      {tab==="home"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{fontSize:18,fontWeight:900,color:C.orange,marginBottom:20}}>🏠 홈</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:20}}>
            <div style={{background:C.bg3,border:`1px solid ${totalRoiKRW>=0?C.green:C.red}44`,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>전체 순손익</div>
              <div style={{fontSize:26,fontWeight:900,color:totalRoiKRW>=0?C.green:C.red}}>{fmtProfit(totalRoiKRW,false)}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>$1 = ₩{usdKrw.toLocaleString()}</div>
            </div>
            <div style={{background:C.bg3,border:`1px solid ${C.teal}44`,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>승률</div>
              <div style={{fontSize:26,fontWeight:900,color:C.teal}}>{winRate}%</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>{wins}승 {done.filter(b=>b.result==="패").length}패</div>
            </div>
            <div style={{background:C.bg3,border:`1px solid ${C.amber}44`,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>진행중 베팅</div>
              <div style={{fontSize:26,fontWeight:900,color:C.amber}}>{pending.length}건</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>잔여 ₩{krwRemaining.toLocaleString()}</div>
            </div>
          </div>

          <div style={{background:C.bg3,border:`1px solid ${C.green}33`,borderRadius:14,padding:16,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,color:C.green}}>💵 입금 추가</div>
              <button onClick={()=>setSiteManageModal(true)} style={{fontSize:10,padding:"3px 10px",borderRadius:5,border:`1px solid ${C.teal}44`,background:`${C.teal}11`,color:C.teal,cursor:"pointer"}}>🏢 사이트 관리</button>
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
              {krwSites.map(s=><button key={s} onClick={()=>setDepSite(s)} style={siteBtn(depSite===s,false)}>₩ {s}</button>)}
              {usdSites.map(s=><button key={s} onClick={()=>setDepSite(s)} style={siteBtn(depSite===s,true)}>$ {s}</button>)}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
                <div style={L}>입금 금액</div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <button onClick={()=>setDepAmt(a=>Math.max(0,a-(depIsDollar?1:10000)))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.red,width:30,height:32,borderRadius:6,cursor:"pointer",fontSize:16,fontWeight:700}}>−</button>
                  <div style={{position:"relative",flex:1}}>
                    <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:depIsDollar?C.amber:C.green,fontWeight:700,fontSize:13,pointerEvents:"none"}}>{depSite?(depIsDollar?"$":"₩"):""}</span>
                    <input type="number" value={depAmt||""} onChange={e=>setDepAmt(parseFloat(e.target.value)||0)} placeholder="금액 입력" style={{...S,textAlign:"right",fontWeight:800,color:depIsDollar?C.amber:C.green,fontSize:14,paddingLeft:26,boxSizing:"border-box",...noSpin}}/>
                  </div>
                  <button onClick={()=>setDepAmt(a=>a+(depIsDollar?1:10000))} style={{background:C.bg2,border:`1px solid ${C.border}`,color:C.green,width:30,height:32,borderRadius:6,cursor:"pointer",fontSize:16,fontWeight:700}}>+</button>
                </div>
              </div>
              <button onClick={handleDeposit} style={{background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"8px 20px",borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:13,flexShrink:0}}>💰 입금 추가</button>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {tab:"betting",icon:"🎯",label:"베팅",color:C.orange},
              {tab:"pending",icon:"⏳",label:"진행중",color:C.amber},
              {tab:"stats",icon:"📊",label:"통계",color:C.purple},
              {tab:"roi",icon:"💹",label:"수익률",color:C.green},
            ].map(item=>(
              <button key={item.tab} onClick={()=>setTab(item.tab as any)}
                style={{background:C.bg3,border:`1px solid ${item.color}33`,borderRadius:12,padding:"16px 10px",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:24,marginBottom:6}}>{item.icon}</div>
                <div style={{fontSize:12,fontWeight:700,color:item.color}}>{item.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ 포인트 탭 ══ */}
      {tab==="points"&&renderPointsTab()}

    </div>
  );
}

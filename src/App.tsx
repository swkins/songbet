import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from "recharts";
import * as db from "./lib/db";
import type { Bet, Deposit, Withdrawal, SiteState as SiteStateBase, Log, EsportsRecord, ProfitExtra, OddsGame, OddsSnapshot, OddsAlert } from "./types";

// SiteState에 pointTotal 필드 확장
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

// ── The Odds API ──────────────────────────────────────────────
const ODDS_API_KEY = (import.meta.env.VITE_ODDS_API_KEY as string) ?? "";
const ODDS_BASE    = "https://api.the-odds-api.com/v4";
const SPORT_KEY_MAP: Record<string, string> = {
  // ── 축구 ──
  "프리미어리그":       "soccer_epl",
  "라리가":             "soccer_spain_la_liga",
  "분데스리가":         "soccer_germany_bundesliga",
  "세리에A":            "soccer_italy_serie_a",
  "리그1":              "soccer_france_ligue_one",
  "챔피언스리그":       "soccer_uefa_champs_league",
  "유로파리그":         "soccer_uefa_europa_league",
  "유로파컨퍼런스리그": "soccer_uefa_europa_conference_league",
  "UEFA 네이션스리그":  "soccer_uefa_nations_league",
  "K리그":              "soccer_korea_kleague1",
  "에레디비시":         "soccer_netherlands_eredivisie",
  "포르투갈리그":       "soccer_portugal_primeira_liga",
  "터키 쉬퍼리그":      "soccer_turkey_super_league",
  "벨기에 퍼스트A":     "soccer_belgium_first_div",
  "MLS":                "soccer_usa_mls",
  "브라질 세리에A":     "soccer_brazil_campeonato",
  "아르헨티나 프리메라":"soccer_argentina_primera_division",
  "일본 J리그":         "soccer_japan_j_league",
  "호주 A리그":         "soccer_australia_aleague",
  // ── 농구 ──
  "NBA":                "basketball_nba",
  "NCAA":               "basketball_ncaab",
  "유로리그":           "basketball_euroleague",
  // ── 야구 ──
  "MLB":                "baseball_mlb",
  "KBO":                "baseball_korea",
  "NPB":                "baseball_npb",
  // ── 아이스하키 ──
  "NHL":                "icehockey_nhl",
  // ── 미식축구 ──
  "NFL":                "americanfootball_nfl",
  // ── 종합격투기 ──
  "UFC":                "mma_mixed_martial_arts",
};

// ── odds-api.io ──────────────────────────────────────────────
const OAIO_KEY = (import.meta.env.VITE_ODDSAPI_IO_KEY as string) ?? "";
const OAIO_BASE = "https://api.odds-api.io/v3";
const OAIO_CACHE_TTL = 10 * 60 * 1000; // 10분

// 종목별 sport 파라미터
const OAIO_SPORT: Record<string,string> = {
  "축구":    "football",
  "농구":    "basketball",
  "야구":    "baseball",
  "배구":    "volleyball",
  "E스포츠": "esports",
};

interface OAIOEvent {
  id: string;
  sport: string;
  league: string;
  leagueId?: string;
  country?: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string; // ISO
  status: string; // "upcoming" | "live" | "finished"
  homeOdds?: number;
  awayOdds?: number;
  drawOdds?: number;
}

const oaioCache: Record<string,{data:OAIOEvent[];fetchedAt:number}> = {};

async function fetchOAIOEvents(sport:string, limit=200): Promise<OAIOEvent[]> {
  const cacheKey = `${sport}`;
  const now = Date.now();
  const cached = oaioCache[cacheKey];
  if(cached && now - cached.fetchedAt < OAIO_CACHE_TTL) return cached.data;
  const sportKey = OAIO_SPORT[sport] || "football";
  try {
    const url = `${OAIO_BASE}/events?apiKey=${OAIO_KEY}&sport=${sportKey}&limit=${limit}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const raw: any[] = json.data || json.events || json || [];
    const events: OAIOEvent[] = raw.map((item:any) => ({
      id: String(item.id||item.event_id||""),
      sport: sportKey,
      league: item.league?.name || item.league || item.competition?.name || "",
      leagueId: String(item.league?.id || item.league_id || ""),
      country: item.league?.country || item.country || "",
      homeTeam: item.home?.name || item.home_team || item.participants?.[0]?.name || "",
      awayTeam: item.away?.name || item.away_team || item.participants?.[1]?.name || "",
      startTime: item.start_time || item.commence_time || item.date || "",
      status: item.status || "upcoming",
      homeOdds: item.odds?.home || item.home_odds,
      awayOdds: item.odds?.away || item.away_odds,
      drawOdds: item.odds?.draw || item.draw_odds,
    })).filter(e=>e.homeTeam && e.awayTeam);
    oaioCache[cacheKey] = {data:events, fetchedAt:now};
    return events;
  } catch(e) { return cached?.data??[]; }
}

async function fetchOAIOLeagues(sport:string): Promise<{id:string,name:string,country:string}[]> {
  const sportKey = OAIO_SPORT[sport] || "football";
  try {
    const url = `${OAIO_BASE}/leagues?apiKey=${OAIO_KEY}&sport=${sportKey}`;
    const res = await fetch(url);
    if(!res.ok) return [];
    const json = await res.json();
    const raw: any[] = json.data || json.leagues || json || [];
    return raw.map((item:any) => ({
      id: String(item.id || ""),
      name: item.name || "",
      country: item.country || "",
    })).filter(l=>l.name);
  } catch { return []; }
}

// ── API-Sports (Football/Basketball/Baseball/Volleyball) ─────
const AF_KEY = (import.meta.env.VITE_APIFOOTBALL_KEY as string) ?? "";
const AF_CACHE_TTL = 15 * 60 * 1000; // 15분

const AF_BASES: Record<string,string> = {
  "축구":    "https://v3.football.api-sports.io",
  "농구":    "https://v1.basketball.api-sports.io",
  "NBA":     "https://v2.nba.api-sports.io",
  "야구":    "https://v1.baseball.api-sports.io",
  "배구":    "https://v1.volleyball.api-sports.io",
  "하키":    "https://v1.hockey.api-sports.io",
};
// 야구는 시즌이 연도 기준 다름 (MLB는 현재연도)
// 한국시간(KST) 기준 날짜 반환
const getKSTDateStr = (offsetDays: number = 0): string => {
  const d = new Date(Date.now() + 9*60*60*1000 + offsetDays*24*60*60*1000);
  return d.toISOString().slice(0,10);
};

const getSeasonForSport = (sport: string): number => {
  const now = new Date();
  if(sport==="야구") return now.getFullYear(); // MLB 시즌 = 현재연도
  return now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
};

// 동적으로 불러온 리그 캐시 (종목별)
interface AFLeagueInfo {
  id: number;
  name: string;
  country: string;
  season: number;
}
const afLeagueCache: Record<string, AFLeagueInfo[]> = {};
const afLeagueListFetched: Record<string, boolean> = {};

async function fetchAllLeagues(sport: string): Promise<AFLeagueInfo[]> {
  if (afLeagueListFetched[sport]) return afLeagueCache[sport] || [];
  const base = AF_BASES[sport];
  if (!base || !AF_KEY) return [];
  try {
    const res = await fetch(`${base}/leagues`, { headers: { "x-apisports-key": AF_KEY } });
    if (!res.ok) return [];
    const json = await res.json();
    const yr = getSeasonForSport(sport);
    const list: AFLeagueInfo[] = (json.response || []).map((item: any) => {
      const seasons: any[] = item.seasons || [];
      const curSeason = seasons.find((s: any) => s.year === yr) || seasons.find((s:any)=>s.current) || seasons[seasons.length - 1];
      return {
        id: item.league?.id ?? item.id,
        name: item.league?.name ?? item.name,
        country: item.country?.name ?? item.country ?? "",
        season: curSeason?.year ?? yr,
      };
    }).filter((l: AFLeagueInfo) => l.id && l.name);
    afLeagueCache[sport] = list;
    afLeagueListFetched[sport] = true;
    // 폴백: 야구/농구 리그 목록이 비어있으면 하드코딩 사용
    const curYr = new Date().getFullYear();
    if(list.length===0 && sport==="야구") { afLeagueCache[sport]=BASEBALL_FALLBACK.map(l=>({...l,season:curYr})); }
    if(list.length===0 && sport==="농구") { afLeagueCache[sport]=BASKETBALL_FALLBACK.map(l=>({...l,season:curYr-1})); }
    return afLeagueCache[sport];
  } catch { return []; }
}

// 주요리그 ID (고정, 상단 표시용)
const AF_MAJOR_IDS: Record<string, number[]> = {
  "축구":  [39,140,78,135,61,2,3,848,292,253,71,128,98,88,94,203,144,188,179],
  "농구":  [12,116,117,118,119],
  "야구":  [1,2,3],
  "배구":  [1,2,3,4,5],
};

// 야구 하드코딩 폴백 (API 리그목록 실패시)
const BASEBALL_FALLBACK: AFLeagueInfo[] = [
  {id:1, name:"MLB", country:"USA", season:2026},
  {id:2, name:"KBO", country:"South Korea", season:2026},
  {id:3, name:"NPB", country:"Japan", season:2026},
];
const BASKETBALL_FALLBACK: AFLeagueInfo[] = [
  {id:12, name:"NBA", country:"USA", season:2025},
];

// 한글 팀명 매핑 (사용자가 추가/수정 가능)
type TeamNameMap = Record<string,string>;
const loadTeamNames = (): TeamNameMap => { try { const v=localStorage.getItem("bt_team_names"); return v?JSON.parse(v):{}; } catch { return {}; } };
const saveTeamNames = (m:TeamNameMap) => { try { localStorage.setItem("bt_team_names",JSON.stringify(m)); } catch {} };
const translateTeam = (name:string, map:TeamNameMap): string => map[name]||name;

// 국가명 한글 매핑
const COUNTRY_KR: Record<string,string> = {
  "England":"잉글랜드","Spain":"스페인","Germany":"독일","Italy":"이탈리아","France":"프랑스",
  "Netherlands":"네덜란드","Portugal":"포르투갈","Belgium":"벨기에","Turkey":"터키","Scotland":"스코틀랜드",
  "USA":"미국","Brazil":"브라질","Argentina":"아르헨티나","Mexico":"멕시코","Colombia":"콜롬비아",
  "Chile":"칠레","Peru":"페루","Bolivia":"볼리비아","Ecuador":"에콰도르","Uruguay":"우루과이",
  "Paraguay":"파라과이","Venezuela":"베네수엘라","Costa Rica":"코스타리카","Guatemala":"과테말라",
  "Japan":"일본","South Korea":"한국","China":"중국","Australia":"호주","India":"인도",
  "Saudi Arabia":"사우디아라비아","UAE":"아랍에미리트","Qatar":"카타르","Iran":"이란","Iraq":"이라크",
  "Greece":"그리스","Croatia":"크로아티아","Serbia":"세르비아","Poland":"폴란드","Russia":"러시아",
  "Ukraine":"우크라이나","Czech Republic":"체코","Slovakia":"슬로바키아","Hungary":"헝가리",
  "Romania":"루마니아","Bulgaria":"불가리아","Austria":"오스트리아","Switzerland":"스위스",
  "Denmark":"덴마크","Sweden":"스웨덴","Norway":"노르웨이","Finland":"핀란드",
  "Nigeria":"나이지리아","Ghana":"가나","Egypt":"이집트","Morocco":"모로코","South Africa":"남아프리카",
  "Cameroon":"카메룬","Senegal":"세네갈","Algeria":"알제리","Tunisia":"튀니지",
  "World":"국제","Europe":"유럽","South America":"남미","Africa":"아프리카","Asia":"아시아",
  "Canada":"캐나다","Israel":"이스라엘","Cyprus":"키프로스","Albania":"알바니아",
  "North Korea":"북한","Indonesia":"인도네시아","Thailand":"태국","Vietnam":"베트남",
  "Malaysia":"말레이시아","Philippines":"필리핀","Singapore":"싱가포르",
};

// 리그명 한글 매핑
const LEAGUE_KR: Record<string,string> = {
  "Premier League":"프리미어리그","La Liga":"라리가","Bundesliga":"분데스리가",
  "Serie A":"세리에A","Ligue 1":"리그1","UEFA Champions League":"챔피언스리그",
  "UEFA Europa League":"유로파리그","UEFA Europa Conference League":"유로파컨퍼런스리그",
  "UEFA Nations League":"UEFA 네이션스리그","K League 1":"K리그1","K League 2":"K리그2",
  "Eredivisie":"에레디비시","Primeira Liga":"포르투갈리그","Super Lig":"터키 쉬퍼리그",
  "First Division A":"벨기에 퍼스트A","MLS":"MLS","Série A":"브라질 세리에A",
  "Primera Division":"아르헨티나 프리메라","J1 League":"J1리그","J2 League":"J2리그",
  "A-League Men":"호주 A리그","Scottish Premiership":"스코틀랜드 프리미어십",
  "2. Bundesliga":"분데스리가2","Championship":"챔피언십","League One":"리그1(잉글랜드)",
  "Serie B":"세리에B","Liga MX":"리가MX","Copa Libertadores":"코파리베르타도레스",
  "Copa Sudamericana":"코파수다메리카나","AFC Champions League":"AFC 챔피언스리그",
  "NBA":"NBA","NCAA":"NCAA","EuroLeague":"유로리그","KBL":"KBL",
  "MLB":"MLB","KBO":"KBO","NPB":"NPB","KBO League":"KBO","MLB Season":"MLB",
  "Volleyball Nations League":"배구 네이션스리그",
};

// localStorage에서 커스텀 한글 매핑 로드
type NameOverrideMap = Record<string,string>;
const loadCountryOverrides = (): NameOverrideMap => { try{const v=localStorage.getItem("bt_country_kr");return v?JSON.parse(v):{};}catch{return{};} };
const saveCountryOverrides = (m:NameOverrideMap) => { try{localStorage.setItem("bt_country_kr",JSON.stringify(m));}catch{} };
const loadLeagueOverrides = (): NameOverrideMap => { try{const v=localStorage.getItem("bt_league_kr");return v?JSON.parse(v):{};}catch{return{};} };
const saveLeagueOverrides = (m:NameOverrideMap) => { try{localStorage.setItem("bt_league_kr",JSON.stringify(m));}catch{} };

// API-Football 경기 타입
interface AFFixture {
  id: number;
  league: { id:number; name:string; country:string; logo:string };
  teams: { home:{id:number;name:string;logo:string}; away:{id:number;name:string;logo:string} };
  fixture: { id:number; date:string; status:{short:string;elapsed:number|null} };
  goals: { home:number|null; away:number|null };
  score: { fulltime:{home:number|null;away:number|null} };
}

const afFixtureCache: Record<string,{data:AFFixture[];fetchedAt:number}> = {};
const afResultCache: {data:AFFixture[];fetchedAt:number}|null = null;
let afResultCacheStore: {data:AFFixture[];fetchedAt:number}|null = null;

async function fetchAFFixtures(sport:string, leagueId:number, leagueName:string, season:number, targetDate:string=""): Promise<AFFixture[]> {
  const dateKey = targetDate || getKSTDateStr(0);
  const cacheKey = `${sport}_${leagueId}_${season}_${dateKey}`;
  const now = Date.now();
  const cached = afFixtureCache[cacheKey];
  if (cached && now - cached.fetchedAt < AF_CACHE_TTL) return cached.data;
  const base = AF_BASES[sport] || AF_BASES["축구"];
  const endpoint = sport==="축구" ? "fixtures" : "games";

  const toFixture = (item:any): AFFixture => {
    if(item.fixture) return item as AFFixture;
    const homeScore = item.scores?.home?.total ?? item.scores?.home?.points ?? null;
    const awayScore = item.scores?.away?.total ?? item.scores?.away?.points ?? null;
    return {
      id: item.id,
      fixture: { id:item.id, date:item.date||item.time||"", status:{short:item.status?.short||"NS",elapsed:item.status?.timer??null} },
      league: item.league||{id:leagueId,name:leagueName,country:"",logo:""},
      teams: { home:item.teams?.home||{id:0,name:"홈팀",logo:""}, away:item.teams?.away||{id:0,name:"원정팀",logo:""} },
      goals: {home:homeScore,away:awayScore},
      score: {fulltime:{home:homeScore,away:awayScore}},
    } as AFFixture;
  };

  try {
    const fetchDate = async(d:string) => {
      const r = await fetch(`${base}/${endpoint}?league=${leagueId}&season=${season}&date=${d}`, {headers:{"x-apisports-key":AF_KEY}});
      if(!r.ok) return [];
      const j = await r.json();
      return (j.response||[]).map(toFixture);
    };

    let data: AFFixture[] = await fetchDate(dateKey);

    // 결과 없으면 전날/다음날도 시도 (시간대 차이 보정)
    if(data.length===0) {
      const prev = new Date(new Date(dateKey).getTime()-24*60*60*1000).toISOString().slice(0,10);
      const next = new Date(new Date(dateKey).getTime()+24*60*60*1000).toISOString().slice(0,10);
      const [d1,d2] = await Promise.all([fetchDate(prev), fetchDate(next)]);
      data = [...d1,...d2];
    }

    afFixtureCache[cacheKey] = {data, fetchedAt:now};
    return data;
  } catch(e) { return cached?.data??[]; }
}


async function fetchAFTodayResults(): Promise<AFFixture[]> {
  const now = Date.now();
  if (afResultCacheStore && now - afResultCacheStore.fetchedAt < AF_CACHE_TTL) return afResultCacheStore.data;
  try {
    const today = getKSTDateStr(0);
    const url = `${AF_BASES["축구"]}/fixtures?date=${today}&status=FT-AET-PEN`;
    const res = await fetch(url, { headers:{"x-apisports-key":AF_KEY} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data: AFFixture[] = json.response || [];
    afResultCacheStore = {data, fetchedAt:now};
    return data;
  } catch(e) { return afResultCacheStore?.data??[]; }
}

const SCHEDULE_CACHE_TTL = 90 * 60 * 1000; // 90분
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

// ── 기본 사이트 상수 ───────────────────────────────────────────
const DEFAULT_KRW_SITES = ["이지벳","조인벳","벨라벳"];
const DEFAULT_USD_SITES = ["벳38","케이탑","벳16","고트벳","벳위즈"];

// ── 포인트 사이트 타입 ────────────────────────────────────────
interface PointSite {
  id: string;
  name: string;
  exchangeName: string;
  exchangeDate: string;      // "YYYY-MM-DD"
  targetAmount: number;      // 목표 금액 (원화)
  sessions: PointSession[];
}
interface PointSession {
  id: string;
  completedAt: string;       // ISO string
  nextTargetDate: string;    // "YYYY-MM-DD"
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

// API 지원 여부 확인 (배당 없는 리그)
const NO_API_LEAGUES = new Set(["KBL","V리그 남자","V리그 여자","이탈리아 세리에A","일본 V리그","LCK","LPL","LEC","LCS","LCP","CBLOL","MSI","롤드컵","발로란트 챔피언스","오버워치 리그"]);

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
const SPORT_ICON:Record<string,string> = {"축구":"⚽","농구":"🏀","야구":"⚾","배구":"🏐","E스포츠":"🎮","모의":"🎯"};
const USD_TO_KRW = 1380;

const noSpin:React.CSSProperties = {MozAppearance:"textfield"} as any;
const S:React.CSSProperties = {width:"100%",background:C.bg2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 9px",borderRadius:7,fontSize:13,...noSpin};
const L:React.CSSProperties = {fontSize:11,color:C.muted,marginBottom:3};

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

// ── 실시간 환율 fetch ──────────────────────────────────────────
async function fetchUsdKrw():Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    return Math.round(d?.rates?.KRW??1380);
  } catch { return 1380; }
}

// ─────────────────────────────────────────────────────────────
export default function App() {
  // ── 비밀번호 / 세션 ───────────────────────────────────────
  const [authed,setAuthed]=useState(()=>{
    try{const v=sessionStorage.getItem("bt_auth");const t=sessionStorage.getItem("bt_auth_ts");
    if(v==="1"&&t&&Date.now()-parseInt(t)<2*60*60*1000)return true;}catch{}return false;
  });
  const lastActivity=useRef(Date.now());
  const handleAuth=()=>{setAuthed(true);try{sessionStorage.setItem("bt_auth","1");sessionStorage.setItem("bt_auth_ts",String(Date.now()));}catch{}};
  const logout=useCallback(()=>{setAuthed(false);try{sessionStorage.removeItem("bt_auth");sessionStorage.removeItem("bt_auth_ts");}catch{};},[]);

  // 활동 감지 + 2시간 자동 로그아웃
  useEffect(()=>{
    if(!authed)return;
    const reset=()=>{lastActivity.current=Date.now();try{sessionStorage.setItem("bt_auth_ts",String(Date.now()));}catch{}};
    window.addEventListener("mousemove",reset);window.addEventListener("keydown",reset);window.addEventListener("click",reset);window.addEventListener("touchstart",reset);
    const id=setInterval(()=>{if(Date.now()-lastActivity.current>2*60*60*1000)logout();},60000);
    return()=>{window.removeEventListener("mousemove",reset);window.removeEventListener("keydown",reset);window.removeEventListener("click",reset);window.removeEventListener("touchstart",reset);clearInterval(id);};
  },[authed,logout]);

  const today = useTodayStr();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab,setTab]=useState<"home"|"betting"|"stats"|"roi"|"strategy"|"log"|"points"|"pending">("home");
  const [statTab,setStatTab]=useState<"overview"|"daily"|"baseball"|"adv">("overview");
  const [bbSub,setBbSub]=useState<"league"|"option">("league");
  const [advCat,setAdvCat]=useState("축구");
  const [advMode,setAdvMode]=useState<"league"|"option">("league");
  const [showOldDone,setShowOldDone]=useState(false);
  const [stratCat,setStratCat]=useState("축구");
  const [esportsStratLeague,setEsportsStratLeague]=useState("LCK");

  // ── 사이트 목록 (동적) ────────────────────────────────────
  const [krwSites,setKrwSites]=useState<string[]>(()=>{try{const v=localStorage.getItem("bt_krw_sites");return v?JSON.parse(v):DEFAULT_KRW_SITES;}catch{return DEFAULT_KRW_SITES;}});
  const [usdSites,setUsdSites]=useState<string[]>(()=>{try{const v=localStorage.getItem("bt_usd_sites");return v?JSON.parse(v):DEFAULT_USD_SITES;}catch{return DEFAULT_USD_SITES;}});
  const ALL_SITES = useMemo(()=>[...krwSites,...usdSites],[krwSites,usdSites]);
  const isUSD = useCallback((s:string)=>usdSites.includes(s),[usdSites]);

  const saveKrwSites=(sites:string[])=>{setKrwSites(sites);try{localStorage.setItem("bt_krw_sites",JSON.stringify(sites));}catch{}};
  const saveUsdSites=(sites:string[])=>{setUsdSites(sites);try{localStorage.setItem("bt_usd_sites",JSON.stringify(sites));}catch{}};

  // 사이트 추가/삭제 모달
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
  const [countryOverrides,setCountryOverrides] = useState<NameOverrideMap>(loadCountryOverrides);
  const [leagueOverrides,setLeagueOverrides] = useState<NameOverrideMap>(loadLeagueOverrides);
  const saveTeamNameEntry = (eng:string,kor:string) => {
    const m = {...teamNameMap,[eng.trim()]:kor.trim()};
    setTeamNameMap(m); saveTeamNames(m);
  };
  const deleteTeamNameEntry = (eng:string) => {
    const m = {...teamNameMap}; delete m[eng];
    setTeamNameMap(m); saveTeamNames(m);
  };
  const t = (name:string) => teamNameMap[name]||name;

  // ── odds-api.io 상태 ─────────────────────────────────────────
  const [oaioEvents,setOaioEvents] = useState<OAIOEvent[]>([]);
  const [oaioLeagues,setOaioLeagues] = useState<{id:string,name:string,country:string}[]>([]);
  const [oaioLoading,setOaioLoading] = useState(false);

  const loadOAIOEvents = async(sport:string) => {
    setOaioLoading(true);
    try {
      const [events, leagues] = await Promise.all([
        fetchOAIOEvents(sport),
        fetchOAIOLeagues(sport),
      ]);
      setOaioEvents(events);
      setOaioLeagues(leagues);
    } finally { setOaioLoading(false); }
  };

  // ── API-Sports 동적 리그 목록 ──────────────────────────────
  const [afGames,setAfGames] = useState<AFFixture[]>([]);
  const [afLoading,setAfLoading] = useState(false);
  const [afLeagues,setAfLeagues] = useState<Record<string,AFLeagueInfo[]>>({});
  const [afLeagueLoading,setAfLeagueLoading] = useState(false);
  const [afDateOffset,setAfDateOffset] = useState(0); // 0=오늘, 1=내일, -1=어제 등
  // 숨긴 리그 관리
  const [showHiddenPanel,setShowHiddenPanel] = useState(false);
  const [leagueEditMode,setLeagueEditMode] = useState(false);
  const [hiddenLeagues,setHiddenLeagues] = useState<Record<string,number[]>>(()=>{
    try{const v=localStorage.getItem("bt_hidden_leagues");return v?JSON.parse(v):{};}catch{return {};}
  });
  const saveHiddenLeagues=(m:Record<string,number[]>)=>{setHiddenLeagues(m);try{localStorage.setItem("bt_hidden_leagues",JSON.stringify(m));}catch{}};
  const hideLeague=(sport:string,id:number)=>{const m={...hiddenLeagues,[sport]:[...(hiddenLeagues[sport]||[]),id]};saveHiddenLeagues(m);};
  const restoreLeague=(sport:string,id:number)=>{const m={...hiddenLeagues,[sport]:(hiddenLeagues[sport]||[]).filter(x=>x!==id)};saveHiddenLeagues(m);};

  const loadAfLeagues = async(sport: string) => {
    if (afLeagueListFetched[sport]) { setAfLeagues(p=>({...p,[sport]:afLeagueCache[sport]||[]})); return; }
    setAfLeagueLoading(true);
    try {
      const list = await fetchAllLeagues(sport);
      const yr = getSeasonForSport(sport);
      let fixed = list.map(l=>({...l, season: l.season||yr}));
      // 폴백 - 동적 시즌 적용
      if(fixed.length===0 && sport==="야구") fixed=BASEBALL_FALLBACK.map(l=>({...l,season:new Date().getFullYear()}));
      if(fixed.length===0 && sport==="농구") fixed=BASKETBALL_FALLBACK.map(l=>({...l,season:new Date().getFullYear()-1}));
      setAfLeagues(p=>({...p,[sport]:fixed}));
    } finally { setAfLeagueLoading(false); }
  };

  // 리그 선택 없이 오늘 전체 경기 가져오기
  const fetchAfAllToday = async(sport: string, dayOffset:number=0) => {
    setAfLoading(true);
    try {
      const dateKey = getKSTDateStr(dayOffset);
      const base = AF_BASES[sport] || AF_BASES["축구"];
      const endpoint = sport==="축구" ? "fixtures" : "games";
      const url = sport==="축구"
        ? `${base}/${endpoint}?date=${dateKey}`
        : `${base}/${endpoint}?date=${dateKey}&season=${getSeasonForSport(sport)}`;
      const res = await fetch(url, {headers:{"x-apisports-key":AF_KEY}});
      if(!res.ok) return;
      const json = await res.json();
      const raw: any[] = json.response||[];
      const toFix = (item:any) => {
        if(item.fixture) return item as AFFixture;
        const hs=item.scores?.home?.total??item.scores?.home?.points??null;
        const as_=item.scores?.away?.total??item.scores?.away?.points??null;
        return {id:item.id,fixture:{id:item.id,date:item.date||item.time||"",status:{short:item.status?.short||"NS",elapsed:null}},league:item.league||{id:0,name:"",country:"",logo:""},teams:{home:item.teams?.home||{id:0,name:"홈팀",logo:""},away:item.teams?.away||{id:0,name:"원정팀",logo:""}},goals:{home:hs,away:as_},score:{fulltime:{home:hs,away:as_}}} as AFFixture;
      };
      const games = raw.map(toFix);
      setAfGames(prev=>{
        const others = prev.filter(g=>g.fixture.date.slice(0,10)!==dateKey);
        return [...others,...games];
      });
    } finally { setAfLoading(false); }
  };

  const fetchAfLeague = async(sport: string, leagueName: string, leagueId: number, season: number, dayOffset:number=0) => {
    setAfLoading(true);
    try {
      const dateKey = getKSTDateStr(dayOffset);
      const games = await fetchAFFixtures(sport, leagueId, leagueName, season, dateKey);
      setAfGames(prev=>{
        const others = prev.filter(g=>!(g.league.id===leagueId && g.fixture.date.slice(0,10)===dateKey));
        return [...others,...games];
      });
    } finally { setAfLoading(false); }
  };

  // 15분마다 오늘 종료경기 자동체크 → 베팅 결과 자동표시
  useEffect(()=>{
    const checkResults = async () => {
      const results = await fetchAFTodayResults();
      if(!results.length) return;
      setBetsRaw(prev => prev.map(bet => {
        if(bet.result!=="진행중"||bet.category!=="축구") return bet;
        const match = results.find(r => {
          const home = t(r.teams.home.name);
          const away = t(r.teams.away.name);
          return (bet.homeTeam&&bet.awayTeam&&
            ((home===bet.homeTeam&&away===bet.awayTeam)||(home===bet.awayTeam&&away===bet.homeTeam)));
        });
        if(!match) return bet;
        const homeGoals = match.score.fulltime.home??0;
        const awayGoals = match.score.fulltime.away??0;
        // 홈승/원정승/무승부 자동판별
        let autoResult: string|null = null;
        if(bet.betOption==="홈승") autoResult = homeGoals>awayGoals?"auto_win":"auto_lose";
        else if(bet.betOption==="원정승") autoResult = awayGoals>homeGoals?"auto_win":"auto_lose";
        else if(bet.betOption==="무승부") autoResult = homeGoals===awayGoals?"auto_win":"auto_lose";
        if(!autoResult) return bet;
        const updated = {...bet, autoResult};
        return updated;
      }));
    };
    const id = setInterval(checkResults, 15*60*1000);
    checkResults();
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── 베팅 페이지 상태 ──────────────────────────────────────
  const [bettingSportCat,setBettingSportCat]=useState<string>("축구");
  const [bettingLeague,setBettingLeague]=useState<string>("");
  const [bettingGames,setBettingGames]=useState<OddsGame[]>([]);
  const [bettingLoading,setBettingLoading]=useState(false);
  const [bettingSelectedGame,setBettingSelectedGame]=useState<OddsGame|null>(null);
  const [bettingSlipOpt,setBettingSlipOpt]=useState<string>("");

  const fetchBettingSchedule=useCallback(async(league:string)=>{
    if(!league)return;
    const key=SPORT_KEY_MAP[league];if(!key)return;
    setBettingLoading(true);
    try{
      const games=await fetchOddsForSport(key,league);
      const now=new Date();
      const in24h=new Date(now.getTime()+24*60*60*1000);
      const filtered=games.filter(g=>{const t=new Date(g.commence);return t>now&&t<=in24h;});
      filtered.sort((a,b)=>new Date(a.commence).getTime()-new Date(b.commence).getTime());
      setBettingGames(prev=>{const others=prev.filter(g=>g.leagueName!==league);return[...others,...filtered];});
    }finally{setBettingLoading(false);}
  },[]);

  // 모의 베팅 모달
  const [mockBetGame,setMockBetGame]=useState<OddsGame|null>(null);
  const [mockBets,setMockBets]=useState<Bet[]>([]);
  const [mockForm,setMockForm]=useState({site:"",betSide:"home" as "home"|"away"|"draw",amount:10000,oddsRaw:""});
  const [lastClickTime,setLastClickTime]=useState<Record<string,number>>({});

  const handleGameDoubleClick=(game:OddsGame)=>{
    setMockBetGame(game);
    setMockForm({site:"",betSide:"home",amount:10000,oddsRaw:String(Math.round(game.bestHome*100))});
  };
  const handleGameClick=(game:OddsGame)=>{
    const now=Date.now();
    const last=lastClickTime[game.id]||0;
    if(now-last<400){handleGameDoubleClick(game);}
    setLastClickTime(p=>({...p,[game.id]:now}));
  };

  const handleAddMockBet=()=>{
    if(!mockBetGame||!mockForm.site)return alert("사이트를 선택해주세요.");
    const odds=parseFloat((parseInt(mockForm.oddsRaw)/100).toFixed(2));
    if(isNaN(odds)||odds<=0)return alert("배당률을 확인해주세요.");
    const dollar=isUSD(mockForm.site);
    const teamName=mockForm.betSide==="home"?mockBetGame.home:mockForm.betSide==="away"?mockBetGame.away:"무";
    const bet:Bet={
      id:"mock_"+String(Date.now()),
      date:today,
      category:"모의",
      league:mockBetGame.leagueName,
      site:mockForm.site,
      betOption:mockForm.betSide==="home"?"홈승":mockForm.betSide==="away"?"원정승":"무승부",
      homeTeam:mockBetGame.home,awayTeam:mockBetGame.away,teamName,
      amount:mockForm.amount,odds,profit:null,result:"진행중",
      includeStats:false,isDollar:dollar
    };
    setMockBets(p=>[...p,bet]);
    setMockBetGame(null);
  };
  const removeMockBet=(id:string)=>setMockBets(p=>p.filter(b=>b.id!==id));

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

  // 현금교환 완료 → 2주 뒤 같은 요일
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

  // ── 수익률 카테고리 목록 (저장) ──────────────────────────
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
      // 기존 수익률 카테고리 목록 자동 수집
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

  useEffect(()=>{
    if(tab!=="betting"||!bettingLeague)return;
    fetchBettingSchedule(bettingLeague);
  },[bettingLeague,tab,fetchBettingSchedule]);

  // 종목 변경 시 리그목록 로드 + 초기화
  useEffect(()=>{
    setBettingLeague("");
    setBettingSelectedGame(null);
    setBettingSlipOpt("");
    loadAfLeagues(bettingSportCat);
    loadOAIOEvents(bettingSportCat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bettingSportCat]);

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

  // ── 베팅 폼 ──────────────────────────────────────────────
  const [esportsCustomOpt,setEsportsCustomOpt]=useState("");
  const activeSiteNames=ALL_SITES.filter(s=>siteStates[s]?.active);
  const makeForm=()=>({date:today,category:"야구",league:"MLB",site:"",homeTeam:"",awayTeam:"",teamName:"",amount:10000,oddsRaw:"",optGroup:"승패",betOption:"역배",includeStats:true});
  const [form,setForm]=useState(makeForm);

  // 날짜 실시간 동기화 (베팅 폼)
  useEffect(()=>{setForm(f=>({...f,date:today}));},[today]);

  const formIsDollar=isUSD(form.site);
  const isOverUnder=(opt:string)=>opt.includes("오버")||opt.includes("언더");
  const {major:fMajor,others:fOthers}=getLeagues(form.category);

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

  // ── 베팅 추가 ────────────────────────────────────────────
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
    setBetsRaw(b=>[...b,bet]);db.upsertBet(bet);
    const newSS={...siteStates,[form.site]:{...siteStates[form.site],betTotal:parseFloat((siteStates[form.site].betTotal+form.amount).toFixed(2))}};
    setSiteStatesRaw(newSS);db.upsertSiteState(form.site,newSS[form.site]);
    addLog("➕ 베팅",`${titleParts}/${finalOpt}/${fmtDisp(form.amount,dollar)}/배당${o}`);
    const dg=getDefaultGroup(form.category);
    setForm(f=>({...f,site:"",homeTeam:"",awayTeam:"",teamName:"",oddsRaw:"",optGroup:dg,betOption:getDefaultOpt(f.category,dg,f.league),amount:10000,includeStats:true}));
    setEsportsCustomOpt("");
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
    // 실제 입금 추가 (포인트 제외)
    if(depAmt>0){
      const newDep={id:String(Date.now()),site:depSite,amount:depAmt,date:today,isDollar:depIsDollar};
      setDepositsRaw(d=>[...d,newDep]);db.insertDeposit(newDep);
      const newSS3={...siteStates,[depSite]:{...siteStates[depSite],deposited:parseFloat((siteStates[depSite].deposited+depAmt).toFixed(2)),active:true,isDollar:depIsDollar}};
      setSiteStatesRaw(newSS3);db.upsertSiteState(depSite,newSS3[depSite]);
      addLog("💵 입금",`${depSite}/${fmtDisp(depAmt,depIsDollar)}`);
    }
    // 포인트는 betTotal에만 추가 (입금액에는 미포함, 진행률에는 포함)
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
    setBetsRaw(b=>b.map(bet=>{
      if(bet.id!==id)return bet;
      const profit=result==="승"?parseFloat((bet.amount*bet.odds-bet.amount).toFixed(2)):result==="패"?-bet.amount:0;
      const updated={...bet,result,profit};db.upsertBet(updated);
      addLog(result==="승"?"✅ 적중":"❌ 실패",bet.homeTeam||bet.teamName||"");
      return updated;
    }));
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

  // ── 통계 계산 ─────────────────────────────────────────────
  const weekDeposits=useMemo(()=>{
    const wm=weekMonday(),m:Record<string,number>=Object.fromEntries(ALL_SITES.map(s=>[s,0]));
    deposits.filter(d=>d.date>=wm).forEach(d=>{m[d.site]+=d.amount;});return m;
  },[deposits,ALL_SITES]);

  const weekDepChartData=useMemo(()=>{
    return ALL_SITES.map(site=>{
      const amt=weekDeposits[site]||0;if(amt===0)return null;
      const krwAmt=isUSD(site)?amt*usdKrw:amt;
      return{site,amt,krwAmt,isDollar:isUSD(site)};
    }).filter(Boolean) as {site:string,amt:number,krwAmt:number,isDollar:boolean}[];
  },[weekDeposits,usdKrw,ALL_SITES,isUSD]);

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
  const optGroups=getOptGroups(form.category);
  const curOpts=optGroups.find(g=>g.g===form.optGroup)?.opts||[];

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

  const KRW_HK=[10000,20000,30000,40000,50000];
  const USD_HK=[10,20,30,40,50];

  const [editingBetId,setEditingBetId]=useState<string|null>(null);
  const [editBetForm,setEditBetForm]=useState<Partial<Bet>>({});
  const [editBetOddsRaw,setEditBetOddsRaw]=useState<string>("");

  const PendingCard=({b}:{b:Bet,key?:any})=>{
    const title=isOverUnder(b.betOption)?[b.homeTeam,b.awayTeam].filter(Boolean).join(" vs "):b.teamName||"";
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
    const autoRes = (b as any).autoResult as string|undefined;
    return(
      <div style={{background:autoRes==="auto_win"?`${C.green}11`:autoRes==="auto_lose"?`${C.red}11`:C.bg2,border:`1px solid ${autoRes==="auto_win"?C.green+"44":autoRes==="auto_lose"?C.red+"44":C.amber+"22"}`,borderRadius:6,padding:"7px 10px",marginBottom:5}}>
        {autoRes&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
          <span style={{fontSize:10,fontWeight:900,color:autoRes==="auto_win"?C.green:C.red,border:`1px solid ${autoRes==="auto_win"?C.green:C.red}`,borderRadius:4,padding:"1px 6px"}}>{autoRes==="auto_win"?"✅ 적중예상":"❌ 실패예상"}</span>
          <span style={{fontSize:9,color:C.muted}}>자동감지 · 수동확인 후 완료처리</span>
        </div>}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:14,flexShrink:0}}>{SPORT_ICON[b.category]||"🎯"}</span>
          <div style={{fontSize:12,fontWeight:700,color:C.text,flex:1,minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
          <span style={{fontSize:10,color:C.muted}}>[{b.league}]</span>
          <span style={{fontSize:12,color:C.purple,fontWeight:700}}>{b.betOption}</span>
          <span style={{fontSize:10,color:C.muted}}>배당 <span style={{color:C.teal,fontWeight:700}}>{b.odds}</span></span>
          <span style={{fontSize:10,color:C.amber,fontWeight:700}}>{fmtDisp(b.amount,b.isDollar)}</span>
          <div style={{display:"flex",gap:2,flexShrink:0}}>
            <button onClick={()=>{setEditingBetId(b.id);setEditBetForm({homeTeam:b.homeTeam,awayTeam:b.awayTeam,teamName:b.teamName,betOption:b.betOption,amount:b.amount});setEditBetOddsRaw(String(Math.round((b.odds||0)*100)));}} style={{background:`${C.teal}11`,border:`1px solid ${C.teal}44`,color:C.teal,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontSize:10}}>✏️</button>
            <button onClick={()=>updateResult(b.id,"승")} style={{background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:10}}>✅</button>
            <button onClick={()=>updateResult(b.id,"패")} style={{background:`${C.red}22`,border:`1px solid ${C.red}`,color:C.red,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontWeight:700,fontSize:10}}>❌</button>
            <button onClick={()=>cancelBet(b.id)} style={{background:C.bg,border:`1px solid ${C.border2}`,color:C.muted,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontSize:10}}>취소</button>
          </div>
        </div>
      </div>
    );
  };

  const DoneCard=({b}:{b:Bet,key?:any})=>{
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

  const tabBtn=(active:boolean,ac:string)=>({padding:"7px 18px",borderRadius:7,border:active?`1px solid ${ac}`:`1px solid ${C.border}`,background:active?`${ac}22`:"transparent",color:active?ac:C.muted,cursor:"pointer",fontWeight:700,fontSize:12} as React.CSSProperties);
  const siteBtn=(active:boolean,dollar:boolean)=>({padding:"4px 10px",borderRadius:5,border:active?`1px solid ${dollar?C.amber:C.green}`:`1px solid ${C.border}`,background:active?`${dollar?C.amber:C.green}22`:C.bg2,color:active?dollar?C.amber:C.green:C.muted,cursor:"pointer",fontSize:11,fontWeight:active?700:400} as React.CSSProperties);

  if(!authed) return <PasswordScreen onAuth={handleAuth}/>;
  if(!dbReady) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:32}}>⚡</div>
      <div style={{color:C.orange,fontSize:18,fontWeight:800,letterSpacing:2}}>BET TRACKER</div>
      <div style={{color:C.muted,fontSize:13}}>Supabase에서 데이터 불러오는 중...</div>
    </div>
  );

  // ══ 포인트 탭 렌더 ══
  const renderPointsTab=()=>{
    // 최근 한달 입금 합산 계산
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
            <div style={{fontSize:11,color:C.muted,marginTop:8}}>예) 올인구조대 포인트교환 목표</div>
          </div>
        )}
        {pointSites.map(ps=>{
          // 현재 활성 세션의 기준 날짜 결정
          const lastSession=ps.sessions[ps.sessions.length-1];
          const isCompleted=!!lastSession;
          const baseDate=isCompleted?lastSession.nextTargetDate:ps.exchangeDate;
          // 기준일 하루 전부터 계산 시작
          const startDate=new Date(baseDate);startDate.setDate(startDate.getDate()-1);
          const startStr=startDate.toISOString().slice(0,10);
          const fromStr=oneMonthAgo(startStr);
          // 해당 기간의 입금 합산 (전체 사이트 원화 환산)
          const periodDeps=deposits.filter(d=>d.date>=fromStr&&d.date<=startStr);
          const totalKrw=periodDeps.reduce((s,d)=>s+(isUSD(d.site)?d.amount*usdKrw:d.amount),0);
          const achieved=totalKrw>=ps.targetAmount;
          // 사이트별 분류
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
                      <span style={{
                        fontSize:13,fontWeight:900,color:C.green,
                        border:`2px solid ${C.green}`,borderRadius:6,
                        padding:"2px 8px",transform:"rotate(-5deg)",display:"inline-block",
                        background:`${C.green}11`,letterSpacing:1
                      }}>✅ 포인트전환 가능</span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                    기준기간: {fromStr} ~ {startStr} (최근 1개월)
                  </div>
                </div>
                <button
                  onClick={()=>{if(!window.confirm("현금교환 완료 처리하시겠습니까?"))return;handlePointExchangeComplete(ps.id);}}
                  style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.orange}`,background:`${C.orange}22`,color:C.orange,cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0}}
                >현금교환 완료</button>
              </div>
              {/* 진행률 */}
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                  <span style={{color:C.muted}}>누적 입금</span>
                  <span style={{color:achieved?C.green:C.amber,fontWeight:800}}>{totalKrw.toLocaleString()}원 / {ps.targetAmount.toLocaleString()}원</span>
                </div>
                <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(100,Math.round(totalKrw/ps.targetAmount*100))}%`,height:"100%",background:achieved?C.green:C.amber,borderRadius:4,transition:"width 0.3s"}}/>
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:3,textAlign:"right"}}>{Math.min(100,Math.round(totalKrw/ps.targetAmount*100))}%</div>
              </div>
              {/* 사이트별 입금 */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:6}}>
                {Object.entries(bysite).filter(([,v])=>v>0).map(([site,amt])=>(
                  <div key={site} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{site}</div>
                    <div style={{fontSize:13,fontWeight:800,color:C.green}}>₩{Math.round(amt).toLocaleString()}</div>
                  </div>
                ))}
                {Object.keys(bysite).length===0&&<div style={{fontSize:11,color:C.dim,gridColumn:"1/-1"}}>해당 기간 입금 없음</div>}
              </div>
              {/* 이전 세션 */}
              {ps.sessions.length>0&&(
                <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6}}>교환 이력</div>
                  {ps.sessions.map((s,i)=>(
                    <div key={s.id} style={{fontSize:11,color:C.dim,marginBottom:3}}>
                      {i+1}회 · 완료 {s.completedAt} → 다음 목표 {s.nextTargetDate}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={()=>{if(!window.confirm(`"${ps.name}" 삭제?`))return;savePointSites(pointSites.filter(x=>x.id!==ps.id));}} style={{marginTop:10,fontSize:10,padding:"3px 10px",borderRadius:4,border:`1px solid ${C.red}44`,background:C.bg2,color:C.red,cursor:"pointer"}}>삭제</button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>

      {/* ── 모달들 ── */}
      {/* 사이트 관리 모달 */}
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

      {/* 포인트 사이트 추가 모달 */}
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

      {/* 모의 베팅 모달 */}
      {mockBetGame&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.amber}`,borderRadius:14,padding:24,width:380}}>
            <div style={{fontSize:14,fontWeight:700,color:C.amber,marginBottom:4}}>🎯 모의 베팅</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16}}>{mockBetGame.home} vs {mockBetGame.away} · {mockBetGame.leagueName}</div>
            {/* 베팅 방향 */}
            <div style={{marginBottom:10}}>
              <div style={L}>베팅 방향</div>
              <div style={{display:"grid",gridTemplateColumns:mockBetGame.bestDraw?"1fr 1fr 1fr":"1fr 1fr",gap:6}}>
                {[
                  {side:"home" as const,label:`홈 ${mockBetGame.home}`,odds:mockBetGame.bestHome,color:C.green},
                  ...(mockBetGame.bestDraw?[{side:"draw" as const,label:"무",odds:mockBetGame.bestDraw,color:C.muted}]:[]),
                  {side:"away" as const,label:`원정 ${mockBetGame.away}`,odds:mockBetGame.bestAway,color:C.teal},
                ].map(d=>(
                  <button key={d.side} onClick={()=>{setMockForm(f=>({...f,betSide:d.side,oddsRaw:String(Math.round((d.odds||0)*100))}));}}
                    style={{padding:"10px 8px",borderRadius:7,border:mockForm.betSide===d.side?`2px solid ${d.color}`:`1px solid ${C.border}`,background:mockForm.betSide===d.side?`${d.color}22`:C.bg2,color:mockForm.betSide===d.side?d.color:C.muted,cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:10,marginBottom:3}}>{d.label}</div>
                    <div style={{fontSize:18,fontWeight:900}}>{(d.odds||0).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* 사이트 */}
            <div style={{marginBottom:10}}>
              <div style={L}>베팅 사이트</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {ALL_SITES.map(s=><button key={s} onClick={()=>setMockForm(f=>({...f,site:s}))} style={{...siteBtn(mockForm.site===s,isUSD(s)),fontSize:11}}>{isUSD(s)?"$":"₩"} {s}</button>)}
              </div>
            </div>
            {/* 금액 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div><div style={L}>베팅금액</div>
                <input type="number" value={mockForm.amount} onChange={e=>setMockForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/>
              </div>
              <div><div style={L}>배당 (3자리)</div>
                <input type="text" value={mockForm.oddsRaw} onChange={e=>setMockForm(f=>({...f,oddsRaw:e.target.value.replace(/[^0-9]/g,"")}))} style={{...S,boxSizing:"border-box"}}/>
                {mockForm.oddsRaw.length>=3&&<div style={{fontSize:11,color:C.teal,marginTop:2}}>{(parseInt(mockForm.oddsRaw)/100).toFixed(2)}</div>}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAddMockBet} style={{flex:1,background:`${C.amber}22`,border:`1px solid ${C.amber}`,color:C.amber,padding:"10px",borderRadius:7,cursor:"pointer",fontWeight:700}}>모의 베팅 추가</button>
              <button onClick={()=>setMockBetGame(null)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"10px",borderRadius:7,cursor:"pointer"}}>취소</button>
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
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>승률</div><div style={{color:C.teal,fontWeight:800,fontSize:13}}>{winRate}%</div></div>
            <div style={{textAlign:"center"}}><div style={{color:C.muted,fontSize:9}}>진행중</div><div style={{color:C.amber,fontWeight:800,fontSize:13}}>{pending.length}건</div></div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={logout} style={{fontSize:11,padding:"5px 11px",borderRadius:5,border:`1px solid ${C.red}44`,background:`${C.red}11`,color:C.red,cursor:"pointer",fontWeight:700}} title="로그아웃">🔒</button>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {([
            ["home","🏠 홈"],["betting","🎯 베팅"],["pending","⏳ 진행중"],["stats","📊 통계"],["roi","💹 수익률"],["strategy","📋 전략"],["log","🗒 로그"],["points","🎁 포인트"],
          ] as [string,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k as any)} style={tabBtn(tab===k,k==="pending"?C.amber:k==="points"?C.teal:k==="home"?C.green:C.orange)}>{l}</button>
          ))}
        </div>
      </div>

      {/* ══ 베팅 탭 ══ */}
      {tab==="betting"&&(
        <div style={{display:"flex",flex:1,overflow:"hidden",minWidth:0}}>

          {/* 열1 - 종목+리그 */}
          <div style={{width:220,flexShrink:0,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"8px 8px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {(["축구","야구","농구","배구","E스포츠"] as const).map(cat=>(
                  <button key={cat} onClick={()=>setBettingSportCat(cat)}
                    style={{padding:"4px 7px",borderRadius:5,border:bettingSportCat===cat?`1px solid ${C.orange}`:`1px solid ${C.border}`,background:bettingSportCat===cat?`${C.orange}22`:C.bg2,color:bettingSportCat===cat?C.orange:C.muted,cursor:"pointer",fontSize:10,fontWeight:bettingSportCat===cat?800:400}}>
                    {SPORT_ICON[cat]} {cat}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:3,marginTop:4}}>
                <button onClick={()=>{setLeagueEditMode(p=>!p);setShowHiddenPanel(false);}}
                  style={{flex:1,padding:"3px 0",fontSize:9,borderRadius:4,border:`1px solid ${leagueEditMode?C.red:C.border}`,background:leagueEditMode?`${C.red}22`:C.bg2,color:leagueEditMode?C.red:C.muted,cursor:"pointer",fontWeight:leagueEditMode?700:400}}>
                  {leagueEditMode?"✓ 완료":"✏️ 편집"}
                </button>
                <button onClick={()=>{setShowHiddenPanel(p=>!p);setLeagueEditMode(false);}}
                  style={{flex:1,padding:"3px 0",fontSize:9,borderRadius:4,border:`1px solid ${showHiddenPanel?C.amber:C.border}`,background:showHiddenPanel?`${C.amber}22`:C.bg2,color:showHiddenPanel?C.amber:C.muted,cursor:"pointer"}}>
                  🗑 숨긴리그 ({Object.values(hiddenLeagues).flat().length})
                </button>
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
              {/* 숨긴 리그 패널 */}
              {showHiddenPanel&&(
                <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`,background:C.bg}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.purple,marginBottom:6}}>🗄 숨긴 리그 (클릭으로 복원)</div>
                  {(hiddenLeagues[bettingSportCat]||[]).length===0&&<div style={{fontSize:10,color:C.dim}}>숨긴 리그 없음</div>}
                  {(hiddenLeagues[bettingSportCat]||[]).map(hid=>{
                    const info=(afLeagues[bettingSportCat]||[]).find(l=>l.id===hid);
                    if(!info)return null;
                    const nameKr=leagueOverrides[info.name]||LEAGUE_KR[info.name]||info.name;
                    return(
                      <div key={hid} style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                        <span style={{flex:1,fontSize:10,color:C.muted}}>{nameKr}</span>
                        <button onClick={()=>restoreLeague(bettingSportCat,hid)}
                          style={{fontSize:9,padding:"1px 6px",borderRadius:3,border:`1px solid ${C.green}44`,background:`${C.green}11`,color:C.green,cursor:"pointer"}}>복원</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {afLeagueLoading&&<div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:11}}>⏳ 리그 목록 로드중...</div>}
              {!afLeagueLoading&&(()=>{
                const allLeagueList = (afLeagues[bettingSportCat]||[]).filter(l=>!(hiddenLeagues[bettingSportCat]||[]).includes(l.id));
                const majorIds = AF_MAJOR_IDS[bettingSportCat]||[];
                const major = allLeagueList.filter(l=>majorIds.includes(l.id));
                // 국가별 그룹
                const countryGroups: Record<string,AFLeagueInfo[]> = {};
                allLeagueList.filter(l=>!majorIds.includes(l.id)).forEach(l=>{
                  const c = countryOverrides[l.country]||COUNTRY_KR[l.country]||l.country||"기타";
                  if(!countryGroups[c]) countryGroups[c]=[];
                  countryGroups[c].push(l);
                });
                const sortedCountries = Object.keys(countryGroups).sort((a,b)=>a.localeCompare(b,"ko"));
                // 숨긴 리그 패널 - 복원 목록
                if(showHiddenPanel) {
                  const hiddenIds = hiddenLeagues[bettingSportCat]||[];
                  const hiddenList = allLeagueList.filter(l=>hiddenIds.includes(l.id));
                  return(<>
                    <div style={{padding:"4px 10px",fontSize:9,color:C.amber,fontWeight:700}}>🗑 숨긴 리그 ({hiddenList.length})</div>
                    {hiddenList.length===0&&<div style={{textAlign:"center",color:C.dim,padding:"20px 0",fontSize:10}}>숨긴 리그 없음</div>}
                    {hiddenList.map(l=>{
                      const nameKr=leagueOverrides[l.name]||LEAGUE_KR[l.name]||l.name;
                      return(
                        <div key={l.id} style={{display:"flex",alignItems:"center",gap:2,padding:"4px 6px"}}>
                          <span style={{flex:1,fontSize:11,color:C.muted}}>{nameKr}</span>
                          <button onClick={()=>restoreLeague(bettingSportCat,l.id)}
                            style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:`1px solid ${C.green}44`,background:`${C.green}11`,color:C.green,cursor:"pointer"}}>복원</button>
                        </div>
                      );
                    })}
                  </>);
                }
                const hiddenIds = hiddenLeagues[bettingSportCat]||[];
                // oaioLeagues 기반으로 리그 목록 표시
                const oaioLgList = oaioLeagues.length>0 ? oaioLeagues : allLeagueList.map(l=>({id:`${l.id}`,name:l.name,country:l.country}));
                const oaioCountryGroups: Record<string,typeof oaioLgList> = {};
                oaioLgList.forEach(l=>{
                  const c = countryOverrides[l.country]||COUNTRY_KR[l.country]||l.country||"기타";
                  if(!oaioCountryGroups[c]) oaioCountryGroups[c]=[];
                  oaioCountryGroups[c].push(l);
                });
                const oaioSortedCountries = Object.keys(oaioCountryGroups).sort((a,b)=>a.localeCompare(b,"ko"));

                const renderBtn = (l:{id:string,name:string,country:string}, isMajor=false) => {
                  const numId = parseInt(l.id)||0;
                  if(hiddenIds.includes(numId)) return null;
                  const sel = bettingLeague===l.id;
                  const nameKr = leagueOverrides[l.name]||LEAGUE_KR[l.name]||l.name;
                  return(
                    <div key={l.id} style={{display:"flex",alignItems:"center",gap:1}}>
                      {leagueEditMode&&<button onClick={()=>hideLeague(bettingSportCat,numId)}
                        style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:12,padding:"2px 4px",flexShrink:0}}>✕</button>}
                      <button onClick={()=>{
                        if(leagueEditMode)return;
                        setBettingLeague(l.id);
                        setBettingSelectedGame(null);
                      }}
                        style={{flex:1,textAlign:"left",padding:isMajor?"7px 10px":"6px 10px",background:sel?`${C.teal}22`:"transparent",border:"none",borderLeft:sel?`3px solid ${C.teal}`:"3px solid transparent",color:sel?C.teal:isMajor?C.text:C.muted,cursor:leagueEditMode?"default":"pointer",fontSize:isMajor?12:10,fontWeight:sel?700:isMajor?600:400,lineHeight:1.3}}>
                        {nameKr}
                      </button>
                      {leagueEditMode&&<button onClick={()=>{const k=prompt(`한글 이름:`,nameKr);if(k){const m={...leagueOverrides,[l.name]:k};setLeagueOverrides(m);saveLeagueOverrides(m);}}}
                        style={{background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:9,padding:"2px 3px",flexShrink:0}}>✏️</button>}
                    </div>
                  );
                };

                // 주요리그 (majorIds 기반)
                const majorIds = AF_MAJOR_IDS[bettingSportCat]||[];
                const majorLeagues = oaioLgList.filter(l=>majorIds.includes(parseInt(l.id)||0));

                return(<>
                  {majorLeagues.length>0&&(
                    <>
                      <div style={{padding:"5px 10px",fontSize:11,color:C.amber,fontWeight:800}}>★ 주요 리그</div>
                      {majorLeagues.map(l=>renderBtn(l,true))}
                    </>
                  )}
                  {oaioSortedCountries.map(country=>(
                    <div key={country}>
                      <div style={{padding:"5px 10px 3px",fontSize:9,color:C.dim,fontWeight:700,borderTop:`1px solid ${C.border}`,marginTop:2,display:"flex",alignItems:"center",gap:3}}>
                        <span>{country}</span>
                        <button onClick={()=>{
                          const orig=Object.keys(COUNTRY_KR).find(k=>(countryOverrides[k]||COUNTRY_KR[k])===country)||oaioCountryGroups[country]?.[0]?.country||country;
                          const k=prompt(`"${orig}" 한글 이름:`,country);
                          if(k){const m={...countryOverrides,[orig]:k};setCountryOverrides(m);saveCountryOverrides(m);}
                        }} style={{background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:8,padding:"1px 3px"}}>✏️</button>
                      </div>
                      {oaioCountryGroups[country].map(l=>renderBtn(l))}
                    </div>
                  ))}
                  {oaioLgList.length===0&&<div style={{textAlign:"center",color:C.dim,padding:"20px 0",fontSize:10}}>리그 목록 없음<br/>🔄 새로고침</div>}
                </>);
              })()}
            </div>
          </div>

          {/* 열2 - 경기 목록 (odds-api.io) */}
          <div style={{width:290,flexShrink:0,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,fontWeight:800,color:C.amber}}>
                {bettingLeague
                  ? (oaioLeagues.find(l=>l.id===bettingLeague)?.name || leagueOverrides[bettingLeague] || bettingLeague)
                  : "전체 경기"}
                <span style={{fontSize:9,color:C.dim,marginLeft:6}}>{getKSTDateStr(afDateOffset)}</span>
              </div>
              <button onClick={()=>loadOAIOEvents(bettingSportCat)} disabled={oaioLoading}
                style={{fontSize:10,padding:"2px 7px",borderRadius:4,border:`1px solid ${C.teal}44`,background:`${C.teal}11`,color:oaioLoading?C.muted:C.teal,cursor:"pointer",flexShrink:0}}>
                {oaioLoading?"⏳":"🔄"}
              </button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:8}}>
              {oaioLoading&&<div style={{textAlign:"center",color:C.teal,padding:"30px 0",fontSize:11}}>⏳ 불러오는 중...</div>}
              {!oaioLoading&&(()=>{
                const now = Date.now();
                const targetDate = getKSTDateStr(afDateOffset);
                const events = oaioEvents.filter(e=>{
                  if(!e.startTime) return false;
                  const eDate = new Date(e.startTime);
                  const eDateStr = new Date(eDate.getTime()+9*60*60*1000).toISOString().slice(0,10);
                  const leagueMatch = !bettingLeague || e.leagueId===bettingLeague || e.league===bettingLeague;
                  return leagueMatch && eDateStr===targetDate;
                }).sort((a,b)=>new Date(a.startTime).getTime()-new Date(b.startTime).getTime());

                if(events.length===0) return(
                  <div style={{textAlign:"center",color:C.dim,padding:"30px 10px"}}>
                    <div style={{fontSize:11,marginBottom:8}}>{targetDate} 경기 없음</div>
                    <div style={{fontSize:9,color:C.dim}}>🔄 새로고침 또는 다른 날짜 선택</div>
                  </div>
                );

                return events.map(e=>{
                  const sel = bettingSelectedGame?.id===e.id;
                  const dt = new Date(e.startTime);
                  const timeStr = dt.toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"});
                  const homeKr = t(e.homeTeam);
                  const awayKr = t(e.awayTeam);
                  const isLive = e.status==="live" || e.status==="inprogress";
                  const isFinished = e.status==="finished" || e.status==="completed";
                  const leagueName = leagueOverrides[e.league]||LEAGUE_KR[e.league]||e.league;
                  return(
                    <div key={e.id}
                      onClick={()=>setBettingSelectedGame(sel?null:{
                        id:e.id, sport:OAIO_SPORT[bettingSportCat]||"football",
                        leagueName:leagueName, commence:e.startTime,
                        home:homeKr, away:awayKr,
                        bookmakers:[], bestHome:e.homeOdds||0, bestAway:e.awayOdds||0, bestDraw:e.drawOdds
                      })}
                      style={{background:sel?`${C.teal}11`:C.bg3,border:`1px solid ${sel?C.teal:C.border}`,borderRadius:8,padding:"9px 10px",marginBottom:6,cursor:"pointer"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                        <div style={{fontSize:9,color:isLive?C.green:C.muted}}>
                          {isLive?"🟢 LIVE":isFinished?"종료":timeStr}
                        </div>
                        {(e.homeOdds||e.awayOdds)&&<div style={{fontSize:8,color:C.teal}}>{e.homeOdds?.toFixed(2)} / {e.awayOdds?.toFixed(2)}</div>}
                      </div>
                      {!bettingLeague&&<div style={{fontSize:8,color:C.purple,marginBottom:2}}>{leagueName}</div>}
                      <div style={{fontSize:11,fontWeight:700,color:C.text}}>{homeKr}</div>
                      <div style={{fontSize:9,color:C.dim,margin:"2px 0"}}>vs</div>
                      <div style={{fontSize:11,fontWeight:700,color:C.text}}>{awayKr}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* 열3 - 배당 옵션 */}
          <div style={{width:260,flexShrink:0,borderRight:`1px solid ${C.border2}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:11,fontWeight:800,color:C.purple}}>배당 옵션</div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:8}}>
              {!bettingSelectedGame&&<div style={{textAlign:"center",color:C.dim,padding:"30px 0",fontSize:11}}>경기를 선택하세요</div>}
              {bettingSelectedGame&&(
                <>
                  <div style={{background:C.bg2,borderRadius:6,padding:"7px 9px",marginBottom:10,fontSize:10}}>
                    <div style={{fontWeight:700,color:C.text,marginBottom:1}}>{bettingSelectedGame.home}</div>
                    <div style={{color:C.dim,fontSize:9}}>vs {bettingSelectedGame.away}</div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.purple,marginBottom:8}}>⚽ 승무패</div>
                    {[{opt:"홈승",label:`홈승 (${bettingSelectedGame.home})`},{opt:"무승부",label:"무승부"},{opt:"원정승",label:`원정승 (${bettingSelectedGame.away})`}].map(({opt,label})=>(
                      <button key={opt} onClick={()=>setBettingSlipOpt(bettingSlipOpt===opt?"":opt)}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:4,borderRadius:6,border:bettingSlipOpt===opt?`1px solid ${C.green}`:`1px solid ${C.border}`,background:bettingSlipOpt===opt?`${C.green}22`:C.bg2,color:bettingSlipOpt===opt?C.green:C.text,cursor:"pointer",fontSize:12,fontWeight:bettingSlipOpt===opt?700:400}}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.amber,marginBottom:8}}>📊 언오버</div>
                    {["오버 1.5","언더 1.5","오버 2.5","언더 2.5","오버 3.5","언더 3.5","오버 4.5","언더 4.5"].map(opt=>(
                      <button key={opt} onClick={()=>setBettingSlipOpt(bettingSlipOpt===opt?"":opt)}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:4,borderRadius:6,border:bettingSlipOpt===opt?`1px solid ${C.amber}`:`1px solid ${C.border}`,background:bettingSlipOpt===opt?`${C.amber}22`:C.bg2,color:bettingSlipOpt===opt?C.amber:C.text,cursor:"pointer",fontSize:12,fontWeight:bettingSlipOpt===opt?700:400}}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {bettingSportCat==="축구"&&<div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.teal,marginBottom:8}}>🎯 핸디캡</div>
                    {["-2.5 마핸","-1.5 마핸","-0.5 마핸","+0.5 플핸","+1.5 플핸","+2.5 플핸"].map(opt=>(
                      <button key={opt} onClick={()=>setBettingSlipOpt(bettingSlipOpt===opt?"":opt)}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:4,borderRadius:6,border:bettingSlipOpt===opt?`1px solid ${C.teal}`:`1px solid ${C.border}`,background:bettingSlipOpt===opt?`${C.teal}22`:C.bg2,color:bettingSlipOpt===opt?C.teal:C.text,cursor:"pointer",fontSize:12,fontWeight:bettingSlipOpt===opt?700:400}}>
                        {opt}
                      </button>
                    ))}
                  </div>}
                </>
              )}
            </div>
          </div>

          {/* 열4 - 베팅슬립+폼 (항상 표시) */}
          <div style={{width:270,flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",background:C.bg2,borderLeft:`1px solid ${C.border2}`}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,fontWeight:800,color:C.orange}}>🎯 베팅 추가</div>
              <button onClick={()=>setTeamNameModal(true)} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer"}}>🌐 팀명관리</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
              {bettingSelectedGame&&(
                <div style={{background:`${C.teal}11`,border:`1px solid ${C.teal}33`,borderRadius:7,padding:"8px 10px",marginBottom:8}}>
                  <div style={{fontSize:9,color:C.muted,marginBottom:2}}>선택 경기</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:1}}>{bettingSelectedGame.home} vs {bettingSelectedGame.away}</div>
                  {bettingSlipOpt&&<div style={{fontSize:11,color:C.amber,fontWeight:700}}>✓ {bettingSlipOpt}</div>}
                </div>
              )}
              {bettingSelectedGame&&bettingSlipOpt&&(
                <button onClick={()=>{
                  const isOu=bettingSlipOpt.includes("오버")||bettingSlipOpt.includes("언더");
                  handleCatChange("축구");
                  setForm(f=>({...f,
                    league:bettingSelectedGame.leagueName,
                    homeTeam:isOu?bettingSelectedGame.home:"",
                    awayTeam:isOu?bettingSelectedGame.away:"",
                    teamName:!isOu?(bettingSlipOpt==="홈승"?bettingSelectedGame.home:bettingSlipOpt==="원정승"?bettingSelectedGame.away:""):"",
                    betOption:bettingSlipOpt,
                  }));
                }} style={{width:"100%",background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,padding:"6px",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11,marginBottom:10}}>← 아래 폼에 적용</button>
              )}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginBottom:6}}>
                <div style={{fontSize:9,fontWeight:700,color:C.muted,marginBottom:5,textAlign:"center",letterSpacing:1}}>— 베팅 폼 —</div>
              </div>
              <div style={{marginBottom:6}}>
                <div style={L}>베팅사이트</div>
                {activeSiteNames.length===0?<div style={{fontSize:11,color:C.dim}}>활성 사이트 없음</div>:
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {activeSiteNames.filter(s=>krwSites.includes(s)).map(s=><button key={s} onClick={()=>handleSiteChange(s)} style={siteBtn(form.site===s,false)}>₩ {s}</button>)}
                  {activeSiteNames.filter(s=>usdSites.includes(s)).map(s=><button key={s} onClick={()=>handleSiteChange(s)} style={siteBtn(form.site===s,true)}>$ {s}</button>)}
                </div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:5}}>
                <div><div style={L}>날짜</div><div style={{...S,boxSizing:"border-box",color:C.teal,fontWeight:700,fontSize:11,display:"flex",alignItems:"center"}}>{form.date}</div></div>
                <div><div style={L}>종목</div><select value={form.category} onChange={e=>handleCatChange(e.target.value)} style={S}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <div style={{marginBottom:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                  <div style={L}>리그</div>
                  <button onClick={()=>setAddLeagueModal({cat:form.category})} style={{fontSize:9,padding:"1px 6px",borderRadius:3,border:`1px solid ${C.purple}44`,background:`${C.purple}11`,color:C.purple,cursor:"pointer"}}>+ 추가</button>
                </div>
                <select value={form.league} onChange={e=>handleLeagueChange(e.target.value)} style={S}>
                  <optgroup label="★ 주요 리그">{fMajor.map(l=><option key={l}>{l}</option>)}</optgroup>
                  {fOthers.length>0&&<optgroup label="─────────">{fOthers.map(l=><option key={l}>{l}</option>)}</optgroup>}
                </select>
              </div>
              <div style={{marginBottom:5}}>
                <div style={L}>베팅 옵션</div>
                {form.category==="E스포츠"?(
                  <div><div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:4}}>{["일반승","1.5","−1.5","직접입력"].map(o=><button key={o} onClick={()=>setForm(f=>({...f,betOption:o}))} style={{padding:"3px 7px",borderRadius:4,border:form.betOption===o?`1px solid ${C.purple}`:`1px solid ${C.border}`,background:form.betOption===o?`${C.purple}22`:C.bg2,color:form.betOption===o?C.purple:C.muted,cursor:"pointer",fontSize:10}}>{o}</button>)}</div>
                  {form.betOption==="직접입력"&&<input value={esportsCustomOpt} onChange={e=>setEsportsCustomOpt(e.target.value)} placeholder="옵션 입력" style={{...S,boxSizing:"border-box"}}/>}</div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                    <select value={form.optGroup} onChange={e=>handleGroupChange(e.target.value)} style={S}><option value="">그룹</option>{optGroups.map(g=><option key={g.g} value={g.g}>{g.g}</option>)}</select>
                    <select value={form.betOption} onChange={e=>setForm(f=>({...f,betOption:e.target.value}))} style={{...S,opacity:form.optGroup?1:0.4}} disabled={!form.optGroup}><option value="">옵션</option>{curOpts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                  </div>
                )}
                {form.betOption&&form.betOption!=="직접입력"&&<div style={{fontSize:10,color:C.purple,marginTop:2,fontWeight:700}}>✓ {form.betOption}</div>}
              </div>
              <div style={{marginBottom:5}}>
                {isOverUnder(form.betOption)?(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                    <div><div style={L}>홈팀</div><TeamInput value={form.homeTeam||""} onChange={v=>setForm(f=>({...f,homeTeam:v}))} placeholder="홈팀"/></div>
                    <div><div style={L}>원정팀</div><TeamInput value={form.awayTeam||""} onChange={v=>setForm(f=>({...f,awayTeam:v}))} placeholder="원정팀"/></div>
                  </div>
                ):(
                  <div><div style={L}>팀 이름</div><TeamInput value={form.teamName||""} onChange={v=>setForm(f=>({...f,teamName:v}))} placeholder="팀 이름"/></div>
                )}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:5}}>
                <div>
                  <div style={L}>배당률</div>
                  <input type="text" inputMode="numeric" value={form.oddsRaw} onChange={e=>setForm(f=>({...f,oddsRaw:e.target.value.replace(/[^0-9]/g,"")}))} placeholder="예) 185" style={{...S,fontSize:14,padding:"7px",boxSizing:"border-box"}}/>
                  {form.oddsRaw.length>=3&&<div style={{fontSize:10,color:C.teal,marginTop:2,fontWeight:700}}>{(parseInt(form.oddsRaw)/100).toFixed(2)}</div>}
                </div>
                <div>
                  <div style={L}>베팅금액</div>
                  <div style={{display:"flex",gap:2,alignItems:"center",marginBottom:3}}>
                    <button onClick={()=>setForm(f=>({...f,amount:Math.max(formIsDollar?1:1000,f.amount-(formIsDollar?1:10000))}))} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.red,width:20,height:28,borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:700}}>−</button>
                    <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,textAlign:"center",fontWeight:800,color:formIsDollar?C.amber:C.green,fontSize:11,padding:"4px 2px",boxSizing:"border-box",...noSpin}}/>
                    <button onClick={()=>setForm(f=>({...f,amount:f.amount+(formIsDollar?1:10000)}))} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.green,width:20,height:28,borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:700}}>+</button>
                  </div>
                  <div style={{display:"flex",gap:2}}>
                    {(formIsDollar?USD_HK:KRW_HK).map(v=><button key={v} onClick={()=>setForm(f=>({...f,amount:v}))} style={{flex:1,padding:"2px 0",borderRadius:3,border:`1px solid ${formIsDollar?C.amber+"44":C.green+"44"}`,background:C.bg,color:formIsDollar?C.amber:C.green,cursor:"pointer",fontSize:9}}>{formIsDollar?`$${v}`:`${v/10000}만`}</button>)}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
                <input type="checkbox" id="inclStats2" checked={form.includeStats} onChange={e=>setForm(f=>({...f,includeStats:e.target.checked}))} style={{width:11,height:11,accentColor:C.purple}}/>
                <label htmlFor="inclStats2" style={{fontSize:10,color:C.muted,cursor:"pointer"}}>통계 자료에 포함</label>
              </div>
              <button onClick={handleAdd} style={{width:"100%",background:`linear-gradient(135deg,${C.orange}44,${C.green}22)`,border:`2px solid ${C.orange}`,color:C.orange,padding:"14px",borderRadius:10,cursor:"pointer",fontWeight:900,fontSize:16,marginTop:4}}>✅ 베팅 추가</button>
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
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:18}}>
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
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}><span style={{color:C.muted}}>진행률{pointAmt>0?" (입금+포인트)":""}</span><span style={{color:barColor,fontWeight:700}}>{pct}%</span></div>
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
            {/* 모의 베팅 */}
            {mockBets.length>0&&(
              <div style={{marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:700,color:C.amber,marginBottom:8}}>🎯 모의 베팅 ({mockBets.length}건)</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {mockBets.map(b=>{
                    const title=b.homeTeam?`${b.homeTeam} vs ${b.awayTeam}`:b.teamName||"";
                    return(
                      <div key={b.id} style={{background:C.bg3,border:`1px solid ${C.amber}44`,borderRadius:10,padding:10}}>
                        <div style={{fontSize:10,color:C.text,fontWeight:700,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
                        <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{b.league}</div>
                        <div style={{fontSize:11,color:C.amber,fontWeight:700,marginBottom:4}}>배당 {b.odds} · {fmtDisp(b.amount,b.isDollar)}</div>
                        <div style={{fontSize:10,color:C.purple,fontWeight:700}}>{b.betOption}</div>
                        <button onClick={()=>removeMockBet(b.id)} style={{marginTop:6,width:"100%",background:"transparent",border:`1px solid ${C.border}`,color:C.muted,padding:"3px",borderRadius:4,cursor:"pointer",fontSize:10}}>제거</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
          <div style={{background:C.bg3,border:`1px solid ${totalRoiKRW>=0?C.green:C.red}44`,borderRadius:12,padding:16,marginBottom:12,textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>전체 순손익 (마감 완료 세션 합산 · 원화 환산)</div>
            <div style={{fontSize:28,fontWeight:900,color:totalRoiKRW>=0?C.green:C.red}}>{fmtProfit(totalRoiKRW,false)}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>실시간 환율 $1 = ₩{usdKrw.toLocaleString()}</div>
          </div>
          <div style={{background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:10,padding:14,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.amber,marginBottom:10}}>📊 현재 진행 중 (마감 전)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>원화 입금중</div><div style={{fontSize:16,fontWeight:800,color:C.green}}>₩{activeTotalKrwDep.toLocaleString()}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>원화 베팅중</div><div style={{fontSize:16,fontWeight:800,color:C.amber}}>₩{activeTotalKrwBet.toLocaleString()}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>달러 입금중</div><div style={{fontSize:16,fontWeight:800,color:C.green}}>${activeTotalUsdDep.toFixed(2)}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:C.muted,marginBottom:3}}>달러 베팅중</div><div style={{fontSize:16,fontWeight:800,color:C.amber}}>${activeTotalUsdBet.toFixed(2)}</div></div>
            </div>
            <div style={{fontSize:10,color:C.dim,marginTop:8,textAlign:"center"}}>※ 마감 전 입금은 수익률에 포함되지 않습니다</div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:10}}>사이트별 마감 세션 수익</div>
          {roiStats.length===0&&<div style={{color:C.muted,fontSize:12,marginBottom:16,padding:"20px",textAlign:"center",background:C.bg3,borderRadius:10}}>마감 이력이 없습니다.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {roiStats.map(r=>(
              <div key={r.site} style={{background:C.bg3,border:`1px solid ${r.netKRW>=0?C.green+"44":C.red+"44"}`,borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.text}}>{r.dollar?"$ ":"₩ "}{r.site}</div>
                  <div style={{fontSize:15,fontWeight:900,color:r.netKRW>=0?C.green:C.red}}>{fmtProfit(r.netKRW,false)}</div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:C.muted}}>총 입금(마감분)</span><span style={{color:C.teal}}>{r.dollar?`$${r.totalDep}`:r.totalDep.toLocaleString()}</span></div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:8}}><span style={{color:C.muted}}>총 출금</span><span style={{color:C.amber}}>{r.dollar?`$${r.totalWth}`:r.totalWth.toLocaleString()}</span></div>
                {r.sessions.map((ss:any)=>(
                  <div key={ss.sessionIdx} style={{background:C.bg2,borderRadius:7,padding:"8px 10px",marginBottom:5,border:`1px solid ${ss.netKRW>=0?C.green+"22":C.red+"22"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:C.muted}}>세션 {ss.sessionIdx} · {ss.wthDate}</span>
                      <span style={{fontSize:11,fontWeight:800,color:ss.netKRW>=0?C.green:C.red}}>{fmtProfit(ss.netKRW,r.dollar)}</span>
                    </div>
                    {ss.deps.map((d:any)=><div key={d.id} style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.dim,marginBottom:1}}><span>{d.date} 입금</span><span style={{color:C.teal}}>+{r.dollar?`$${d.amount}`:d.amount.toLocaleString()}</span></div>)}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.dim,marginTop:2,paddingTop:2,borderTop:`1px solid ${C.border}`}}><span>{ss.wthDate} 출금</span><span style={{color:C.amber}}>-{r.dollar?`$${ss.wthAmt}`:ss.wthAmt.toLocaleString()}</span></div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 기타 수익/지출 */}
          <div style={{fontSize:13,fontWeight:700,color:C.purple,marginBottom:10}}>기타 수익 / 지출</div>
          <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,alignItems:"end",marginBottom:8}}>
              <div>
                <div style={L}>사이트</div>
                <select value={pextForm.category} onChange={e=>setPextForm(f=>({...f,category:e.target.value}))} style={{...S,boxSizing:"border-box"}}>
                  <option value="">선택...</option>
                  {pextSiteList.map(s=><option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">직접 입력</option>
                </select>
                {(pextForm.category==="__custom__")&&(
                  <input value="" onChange={e=>setPextForm(f=>({...f,category:e.target.value}))} placeholder="직접 입력" style={{...S,boxSizing:"border-box",marginTop:4}}/>
                )}
              </div>
              <div>
                <div style={L}>분류</div>
                <select value={pextForm.subCategory} onChange={e=>setPextForm(f=>({...f,subCategory:e.target.value}))} style={{...S,boxSizing:"border-box"}}>
                  <option value="">선택...</option>
                  {pextCatList.map(s=><option key={s} value={s}>{s}</option>)}
                  <option value="__custom__">직접 입력</option>
                </select>
                {(pextForm.subCategory==="__custom__")&&(
                  <input value="" onChange={e=>setPextForm(f=>({...f,subCategory:e.target.value}))} placeholder="직접 입력" style={{...S,boxSizing:"border-box",marginTop:4}}/>
                )}
              </div>
              <div><div style={L}>금액 (원화)</div><input type="number" value={pextForm.amount||""} onChange={e=>setPextForm(f=>({...f,amount:parseFloat(e.target.value)||0}))} style={{...S,boxSizing:"border-box",...noSpin}}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:6,alignItems:"end",marginBottom:8}}>
              <div><div style={L}>메모</div><input value={pextForm.note} onChange={e=>setPextForm(f=>({...f,note:e.target.value}))} style={{...S,boxSizing:"border-box"}}/></div>
              <button onClick={()=>setPextForm(f=>({...f,isIncome:true}))} style={{padding:"7px 14px",borderRadius:5,border:pextForm.isIncome?`1px solid ${C.green}`:`1px solid ${C.border}`,background:pextForm.isIncome?`${C.green}22`:C.bg2,color:pextForm.isIncome?C.green:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>수입</button>
              <button onClick={()=>setPextForm(f=>({...f,isIncome:false}))} style={{padding:"7px 14px",borderRadius:5,border:!pextForm.isIncome?`1px solid ${C.red}`:`1px solid ${C.border}`,background:!pextForm.isIncome?`${C.red}22`:C.bg2,color:!pextForm.isIncome?C.red:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>지출</button>
            </div>
            {/* 목록 관리 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:6}}>
              <div style={{background:C.bg2,borderRadius:6,padding:"6px 8px"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>사이트 목록</div>
                <div style={{display:"flex",gap:4,marginBottom:4}}>
                  <input value={newPextSite} onChange={e=>setNewPextSite(e.target.value)} placeholder="추가" style={{...S,flex:1,boxSizing:"border-box",fontSize:11,padding:"3px 6px"}}/>
                  <button onClick={()=>{const v=newPextSite.trim();if(!v)return;savePextSiteList([...new Set([...pextSiteList,v])]);setNewPextSite("");}} style={{padding:"3px 8px",background:`${C.green}22`,border:`1px solid ${C.green}`,color:C.green,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700}}>+</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {pextSiteList.map(s=><div key={s} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",fontSize:10,color:C.text,display:"flex",gap:3,alignItems:"center"}}>{s}<button onClick={()=>savePextSiteList(pextSiteList.filter(x=>x!==s))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:9,padding:0}}>✕</button></div>)}
                </div>
              </div>
              <div style={{background:C.bg2,borderRadius:6,padding:"6px 8px"}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>분류 목록</div>
                <div style={{display:"flex",gap:4,marginBottom:4}}>
                  <input value={newPextCat} onChange={e=>setNewPextCat(e.target.value)} placeholder="추가" style={{...S,flex:1,boxSizing:"border-box",fontSize:11,padding:"3px 6px"}}/>
                  <button onClick={()=>{const v=newPextCat.trim();if(!v)return;savePextCatList([...new Set([...pextCatList,v])]);setNewPextCat("");}} style={{padding:"3px 8px",background:`${C.teal}22`,border:`1px solid ${C.teal}`,color:C.teal,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700}}>+</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {pextCatList.map(s=><div key={s} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",fontSize:10,color:C.text,display:"flex",gap:3,alignItems:"center"}}>{s}<button onClick={()=>savePextCatList(pextCatList.filter(x=>x!==s))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:9,padding:0}}>✕</button></div>)}
                </div>
              </div>
            </div>
            <button onClick={()=>{
              if(!pextForm.category||pextForm.category==="__custom__")return alert("사이트를 선택/입력해주세요.");
              if(pextForm.amount<=0)return;
              const newPe={id:String(Date.now()),...pextForm,subCategory:pextForm.subCategory==="__custom__"?"":pextForm.subCategory,date:today};
              setProfitExtrasRaw(p=>[...p,newPe]);db.insertProfitExtra(newPe);
              if(!pextSiteList.includes(pextForm.category))savePextSiteList([...pextSiteList,pextForm.category]);
              if(pextForm.subCategory&&pextForm.subCategory!=="__custom__"&&!pextCatList.includes(pextForm.subCategory))savePextCatList([...pextCatList,pextForm.subCategory]);
              setPextForm({category:"",subCategory:"",amount:0,note:"",isIncome:true});
            }} style={{marginTop:8,width:"100%",background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,padding:"7px",borderRadius:6,cursor:"pointer",fontWeight:700}}>추가</button>
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
              {[{title:"⚽ 0.5 플핸 조건",color:C.teal,content:["배당 1.6 이상","정배 배당: 1.60 ~ 2.19","무배당: 3.6 이하"]},{title:"⚽ 1.5 플핸 조건",color:C.green,content:["배당 1.40 이상","정배 배당: 1.30 ~ 1.59","무배당: 4.3 이하"]},{title:"⚽ 2.5 플핸 조건",color:C.amber,content:["배당 1.40 이상","정배 배당: 1.10 ~ 1.29","무배당: 6.6 이하"]}].map(s=>(
                <div key={s.title} style={{background:C.bg3,border:`1px solid ${s.color}33`,borderRadius:10,padding:16}}>
                  <div style={{fontSize:14,fontWeight:800,color:s.color,marginBottom:10}}>{s.title}</div>
                  {s.content.map((line,i)=><div key={i} style={{fontSize:12,color:C.text,padding:"4px 0",borderBottom:i<s.content.length-1?`1px solid ${C.border}`:"none"}}>• {line}</div>)}
                </div>
              ))}
            </div>
          )}
          {stratCat==="농구"&&(<div style={{background:C.bg3,border:`1px solid ${C.purple}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.purple,marginBottom:10}}>🏀 농구 전략</div><div style={{fontSize:12,color:C.text,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>• 5.5 ~ 29.5 플핸 → 플핸 베팅</div><div style={{fontSize:12,color:C.text,padding:"5px 0"}}>• 30.5 이상 → 마핸 베팅</div></div>)}
          {stratCat==="야구"&&(<div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{background:C.bg3,border:`1px solid ${C.red}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.red,marginBottom:8}}>⚾ 역배 전략</div><div style={{fontSize:12,color:C.text}}>• 무지성 역배 전략 테스트 중</div></div><div style={{background:C.bg3,border:`1px solid ${C.amber}33`,borderRadius:10,padding:16}}><div style={{fontSize:14,fontWeight:800,color:C.amber,marginBottom:8}}>⚾ 언오버 전략</div><div style={{fontSize:12,color:C.text}}>• 야구 언오버는 베팅 분석 사이트(아톰) 픽으로 베팅 테스트</div></div></div>)}
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
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:C.text}}>{l.type.replace(/^.\s/,"")}</div><div style={{fontSize:11,color:C.muted,marginTop:1}}>{l.desc}</div></div>
                  <div style={{fontSize:10,color:C.dim,flexShrink:0}}>{l.ts}</div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {/* ══ 팀명 관리 모달 ══ */}
      {teamNameModal&&(
        <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:C.bg3,border:`1px solid ${C.purple}`,borderRadius:14,padding:24,width:420,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.purple,marginBottom:14}}>🌐 팀명 한글 관리</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>영어 팀명 → 한글로 표시됩니다. 경기목록에서 자동 적용됩니다.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:6,marginBottom:12}}>
              <input value={tnNewEng} onChange={e=>setTnNewEng(e.target.value)} placeholder="영어 팀명 (예: Manchester City)" style={{...S,boxSizing:"border-box"}}/>
              <input value={tnNewKor} onChange={e=>setTnNewKor(e.target.value)} placeholder="한글 (예: 맨체스터시티)" style={{...S,boxSizing:"border-box"}}/>
              <button onClick={()=>{if(!tnNewEng.trim()||!tnNewKor.trim())return;saveTeamNameEntry(tnNewEng,tnNewKor);setTnNewEng("");setTnNewKor("");}} style={{padding:"7px 14px",background:`${C.purple}22`,border:`1px solid ${C.purple}`,color:C.purple,borderRadius:6,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>추가</button>
            </div>
            <input value={tnSearch} onChange={e=>setTnSearch(e.target.value)} placeholder="검색..." style={{...S,boxSizing:"border-box",marginBottom:10}}/>
            <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:300,overflowY:"auto"}}>
              {Object.entries(teamNameMap).filter(([eng,kor])=>!tnSearch||eng.toLowerCase().includes(tnSearch.toLowerCase())||kor.includes(tnSearch)).map(([eng,kor])=>(
                <div key={eng} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.bg2,borderRadius:6}}>
                  <div style={{flex:1}}><span style={{fontSize:11,color:C.muted}}>{eng}</span><span style={{fontSize:11,color:C.text,marginLeft:8}}>→ {kor}</span></div>
                  <button onClick={()=>deleteTeamNameEntry(eng)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontSize:10}}>삭제</button>
                </div>
              ))}
              {Object.keys(teamNameMap).length===0&&<div style={{textAlign:"center",color:C.dim,padding:"20px",fontSize:12}}>등록된 팀명 없음</div>}
            </div>
            <button onClick={()=>setTeamNameModal(false)} style={{width:"100%",marginTop:14,background:C.bg2,border:`1px solid ${C.border}`,color:C.muted,padding:"8px",borderRadius:6,cursor:"pointer"}}>닫기</button>
          </div>
        </div>
      )}

      {/* ══ 홈 탭 ══ */}
      {tab==="home"&&(
        <div style={{flex:1,overflowY:"auto",padding:20}}>
          <div style={{fontSize:18,fontWeight:900,color:C.orange,marginBottom:20}}>🏠 홈</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:20}}>
            {/* 수익 요약 */}
            <div style={{background:C.bg3,border:`1px solid ${totalRoiKRW>=0?C.green:C.red}44`,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>전체 순손익</div>
              <div style={{fontSize:26,fontWeight:900,color:totalRoiKRW>=0?C.green:C.red}}>{fmtProfit(totalRoiKRW,false)}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>$1 = ₩{usdKrw.toLocaleString()}</div>
            </div>
            {/* 승률 */}
            <div style={{background:C.bg3,border:`1px solid ${C.teal}44`,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>승률</div>
              <div style={{fontSize:26,fontWeight:900,color:C.teal}}>{winRate}%</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>{wins}승 {done.filter(b=>b.result==="패").length}패</div>
            </div>
            {/* 진행중 */}
            <div style={{background:C.bg3,border:`1px solid ${C.amber}44`,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4}}>진행중 베팅</div>
              <div style={{fontSize:26,fontWeight:900,color:C.amber}}>{pending.length}건</div>
              <div style={{fontSize:10,color:C.muted,marginTop:4}}>잔여 ₩{krwRemaining.toLocaleString()}</div>
            </div>
          </div>

          {/* 입금 섹션 */}
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

          {/* 바로가기 */}
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

      {/* ══ 경기 일정 탭 ══ */}

      {/* ══ 포인트 탭 ══ */}
      {tab==="points"&&renderPointsTab()}

    </div>
  );
}

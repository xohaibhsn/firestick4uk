"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AppState = "login" | "hub" | "live" | "vod" | "series";

interface Channel    { id:string; name:string; logo:string; url:string; group:string; }
interface VodItem    { id:string; name:string; logo:string; url:string; group:string; rating:string; year:string; }
interface SeriesItem { id:string; name:string; cover:string; group:string; rating:string; genre:string; }
interface EpgProg    { title:string; desc:string; start_ts:number; stop_ts:number; }
interface EpgEntry   { current:EpgProg|null; next:EpgProg|null; }
interface LoginXtream{ server:string; username:string; password:string; name:string; }

// ─── Utilities ────────────────────────────────────────────────────────────────
const b64       = (s:string) => { try { return atob(s); } catch { return s; } };
const fmtTime   = (ts:number) => new Date(ts*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const epgPct    = (p:EpgProg) => Math.min(100,Math.max(0,((Date.now()/1000-p.start_ts)/(p.stop_ts-p.start_ts))*100));
const proxied   = (url:string) => `/api/erp/iptv/proxy?url=${encodeURIComponent(url)}`;
const xtreamQ   = (sv:LoginXtream, action:string, extra='') =>
  `/api/erp/iptv/xtream?server=${encodeURIComponent(sv.server)}&username=${encodeURIComponent(sv.username)}&password=${encodeURIComponent(sv.password)}&action=${action}${extra}`;

function groupByF<T extends {group:string}>(items:T[]):Record<string,T[]>{
  return items.reduce((a,i)=>{ (a[i.group]=a[i.group]||[]).push(i); return a; },{} as Record<string,T[]>);
}

// ─── M3U Parser ───────────────────────────────────────────────────────────────
function parseM3U(text:string):Channel[]{
  const lines=text.split(/\r?\n/); const out:Channel[]=[]; let meta:Partial<Channel>={};
  for(let i=0;i<lines.length;i++){
    const l=lines[i].trim();
    if(l.startsWith('#EXTINF')){
      meta={ name:l.match(/,(.+)$/)?.[1]?.trim()||'Unknown', logo:l.match(/tvg-logo="([^"]+)"/)?.[1]||'',
             group:l.match(/group-title="([^"]+)"/)?.[1]||'Uncategorized', id:l.match(/tvg-id="([^"]+)"/)?.[1]||String(i) };
    } else if(l&&!l.startsWith('#')&&meta.name){
      out.push({ id:meta.id!, name:meta.name!, logo:meta.logo!, group:meta.group!, url:l }); meta={};
    }
  }
  return out;
}

const VOD_KW=['movie','vod','film','cinema','bollywood','4k'];
const SER_KW=['series','season','episode','tvshow','tv show'];
function classifyM3U(chs:Channel[]){ const l:Channel[]=[],v:Channel[]=[],s:Channel[]=[];
  for(const c of chs){ const g=c.group.toLowerCase(); if(SER_KW.some(k=>g.includes(k)))s.push(c); else if(VOD_KW.some(k=>g.includes(k)))v.push(c); else l.push(c); }
  return { live:l, vod:v, series:s };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  // ── App state machine ────────────────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("login");
  const [isXtream, setIsXtream] = useState(false);
  const [profileName, setProfileName] = useState("IPTV");

  // ── Login form ───────────────────────────────────────────────────────────
  const [loginTab, setLoginTab] = useState<"xtream"|"m3u">("xtream");
  const [xtream, setXtream]     = useState<LoginXtream>({server:"",username:"",password:"",name:""});
  const [m3uUrl, setM3uUrl]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  // ── Live TV ──────────────────────────────────────────────────────────────
  const [liveMap, setLiveMap]       = useState<Record<string,Channel[]>>({});
  const [liveCats, setLiveCats]     = useState<string[]>([]);
  const [activeLiveCat, setActiveLiveCat] = useState<string|null>(null);
  const [liveSideView, setLiveSideView]   = useState<"cat"|"ch">("cat");
  const [sideOpen, setSideOpen]           = useState(true);

  // ── VOD ──────────────────────────────────────────────────────────────────
  const [vodMap, setVodMap]         = useState<Record<string,VodItem[]>>({});
  const [vodCats, setVodCats]       = useState<string[]>([]);
  const [vodLoaded, setVodLoaded]   = useState(false);
  const [vodLoading, setVodLoading] = useState(false);
  const [vodSearch, setVodSearch]   = useState("");
  const [activeVodCat, setActiveVodCat] = useState<string|null>(null);

  // ── Series ───────────────────────────────────────────────────────────────
  const [seriesMap, setSeriesMap]         = useState<Record<string,SeriesItem[]>>({});
  const [seriesCats, setSeriesCats]       = useState<string[]>([]);
  const [seriesLoaded, setSeriesLoaded]   = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [activeSeriesCat, setActiveSeriesCat] = useState<string|null>(null);
  const [selectedSeries, setSelectedSeries]   = useState<SeriesItem|null>(null);
  const [seriesDetail, setSeriesDetail]       = useState<any>(null);
  const [seriesDetailLoading, setSeriesDetailLoading] = useState(false);

  // ── Player ───────────────────────────────────────────────────────────────
  const [activeCh, setActiveCh]     = useState<Channel|null>(null);
  const [buffering, setBuffering]   = useState(false);
  const [playerModal, setPlayerModal] = useState(false); // fullscreen overlay for VOD/Series

  // ── EPG ──────────────────────────────────────────────────────────────────
  const [epgMap, setEpgMap] = useState<Record<string,EpgEntry>>({});
  const epgFetched = useRef<Set<string>>(new Set());
  const svRef = useRef<LoginXtream|null>(null); // stable server credentials ref

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef   = useRef<any>(null);

  // ── Playback engine ─────────────────────────────────────────────────────
  const playChannel = useCallback(async (ch:Channel, modal=false) => {
    setActiveCh(ch);
    setBuffering(true);
    setPlayerModal(modal);
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current=null; }
    const src = proxied(ch.url);
    const isHLS = ch.url.includes('.m3u8')||ch.url.includes('/hls/')||ch.url.includes('/live/');
    if (isHLS) {
      const { default:Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        const hls = new Hls({enableWorker:false,lowLatencyMode:true,maxBufferLength:30});
        hlsRef.current=hls; hls.loadSource(src); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED,()=>{ video.play().catch(()=>{}); setBuffering(false); });
        hls.on(Hls.Events.ERROR,(_:any,d:any)=>{ if(d.fatal) setBuffering(false); });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src=src; video.play().catch(()=>{}); setBuffering(false);
      }
    } else {
      video.src=src; video.play().catch(()=>{}); video.oncanplay=()=>setBuffering(false);
    }
  }, []);

  useEffect(() => () => { if(hlsRef.current) hlsRef.current.destroy(); }, []);

  // ── EPG fetcher ──────────────────────────────────────────────────────────
  const fetchEpg = useCallback(async (ids:string[]) => {
    const sv = svRef.current;
    if (!sv) return;
    const pending = ids.filter(id => !epgFetched.current.has(id));
    if (!pending.length) return;
    pending.forEach(id => epgFetched.current.add(id));

    for (let i=0; i<pending.length; i+=8) {
      await Promise.all(pending.slice(i,i+8).map(async id => {
        try {
          const r = await fetch(xtreamQ(sv,'get_short_epg',`&stream_id=${id}`));
          const data = await r.json();
          const listings:any[] = Array.isArray(data?.epg_listings) ? data.epg_listings : [];
          const now = Date.now()/1000;
          const curr = listings.find(p => Number(p.start_timestamp)<=now && Number(p.stop_timestamp)>=now);
          const nxt  = curr ? listings.find(p => Number(p.start_timestamp) >= Number(curr.stop_timestamp)) : null;
          const mk = (p:any): EpgProg|null => p ? {
            title: b64(p.title||''), desc: b64(p.description||''),
            start_ts: Number(p.start_timestamp), stop_ts: Number(p.stop_timestamp),
          } : null;
          setEpgMap(m => ({...m, [id]:{current:mk(curr),next:mk(nxt)}}));
        } catch {}
      }));
    }
  }, []);

  useEffect(() => {
    if (appState!=='live'||!isXtream||!activeLiveCat) return;
    const ids = (liveMap[activeLiveCat]||[]).slice(0,30).map(c=>c.id);
    fetchEpg(ids);
  }, [activeLiveCat, appState, isXtream]);

  useEffect(() => {
    if (activeCh && isXtream) fetchEpg([activeCh.id]);
  }, [activeCh, isXtream]);

  // ── Xtream login ─────────────────────────────────────────────────────────
  const loginXtream = async () => {
    setErr(""); setLoading(true);
    try {
      const q = (a:string) => xtreamQ(xtream,a);
      const [cats, streams] = await Promise.all([
        fetch(q('get_live_categories')).then(r=>r.json()),
        fetch(q('get_live_streams')).then(r=>r.json()),
      ]);
      if (!Array.isArray(cats)) throw new Error(cats?.error||'Invalid response from server');
      const chs:Channel[] = (Array.isArray(streams)?streams:[]).map((s:any) => ({
        id:   String(s.stream_id), name:s.name, logo:s.stream_icon||'',
        group:(cats.find((c:any)=>String(c.category_id)===String(s.category_id))?.category_name)||'Uncategorized',
        url:  `${xtream.server.replace(/\/$/,'')}/live/${xtream.username}/${xtream.password}/${s.stream_id}.m3u8`,
      }));
      const map = groupByF(chs); const catList = Object.keys(map).sort();
      setLiveMap(map); setLiveCats(catList);
      setProfileName(xtream.name||xtream.server);
      svRef.current = xtream; setIsXtream(true);
      setActiveLiveCat(catList[0]||null); setLiveSideView('cat');
      setAppState('hub');
    } catch(e:any) { setErr(e.message||'Connection failed'); }
    setLoading(false);
  };

  // ── Lazy VOD load ────────────────────────────────────────────────────────
  const loadVod = useCallback(async () => {
    const sv = svRef.current;
    if (!sv||vodLoaded||vodLoading) return;
    setVodLoading(true);
    try {
      const [cats,streams] = await Promise.all([
        fetch(xtreamQ(sv,'get_vod_categories')).then(r=>r.json()).catch(()=>[]),
        fetch(xtreamQ(sv,'get_vod_streams')).then(r=>r.json()).catch(()=>[]),
      ]);
      const items:VodItem[] = (Array.isArray(streams)?streams:[]).map((s:any) => ({
        id:   String(s.stream_id), name:s.name||'', logo:s.stream_icon||'', rating:s.rating||'', year:s.year||'',
        group:(Array.isArray(cats)?cats:[]).find((c:any)=>String(c.category_id)===String(s.category_id))?.category_name||'Movies',
        url:  `${sv.server.replace(/\/$/,'')}/movie/${sv.username}/${sv.password}/${s.stream_id}.${s.container_extension||'mp4'}`,
      }));
      const map = groupByF(items);
      setVodMap(map); setVodCats(Object.keys(map).sort()); setVodLoaded(true);
    } catch {}
    setVodLoading(false);
  }, [vodLoaded, vodLoading]);

  // ── Lazy Series load ─────────────────────────────────────────────────────
  const loadSeries = useCallback(async () => {
    const sv = svRef.current;
    if (!sv||seriesLoaded||seriesLoading) return;
    setSeriesLoading(true);
    try {
      const [cats,list] = await Promise.all([
        fetch(xtreamQ(sv,'get_series_categories')).then(r=>r.json()).catch(()=>[]),
        fetch(xtreamQ(sv,'get_series')).then(r=>r.json()).catch(()=>[]),
      ]);
      const items:SeriesItem[] = (Array.isArray(list)?list:[]).map((s:any) => ({
        id:    String(s.series_id), name:s.name||'', cover:s.cover||'', rating:s.rating||'', genre:s.genre||'',
        group: (Array.isArray(cats)?cats:[]).find((c:any)=>String(c.category_id)===String(s.category_id))?.category_name||'Series',
      }));
      const map = groupByF(items);
      setSeriesMap(map); setSeriesCats(Object.keys(map).sort()); setSeriesLoaded(true);
    } catch {}
    setSeriesLoading(false);
  }, [seriesLoaded, seriesLoading]);

  // ── Series detail ────────────────────────────────────────────────────────
  const loadSeriesDetail = useCallback(async (s:SeriesItem) => {
    setSelectedSeries(s); setSeriesDetail(null); setSeriesDetailLoading(true);
    const sv = svRef.current;
    if (!sv) { setSeriesDetailLoading(false); return; }
    try {
      const data = await fetch(xtreamQ(sv,'get_series_info',`&stream_id=${s.id}`)).then(r=>r.json());
      setSeriesDetail(data);
    } catch {}
    setSeriesDetailLoading(false);
  }, []);

  // ── M3U login ────────────────────────────────────────────────────────────
  const loginM3U = async () => {
    setErr(""); setLoading(true);
    try {
      const text = await fetch(proxied(m3uUrl)).then(r=>r.text());
      const allChs = parseM3U(text);
      if (!allChs.length) throw new Error('No channels found in playlist');
      const { live, vod, series } = classifyM3U(allChs);
      const lm=groupByF(live), vm=groupByF(vod.map(c=>({...c,rating:'',year:''}))), sm=groupByF(series.map(c=>({id:c.id,name:c.name,cover:c.logo,group:c.group,rating:'',genre:''})));
      setLiveMap(lm); setLiveCats(Object.keys(lm).sort());
      setVodMap(vm as any); setVodCats(Object.keys(vm).sort()); setVodLoaded(true);
      setSeriesMap(sm as any); setSeriesCats(Object.keys(sm).sort()); setSeriesLoaded(true);
      setProfileName(m3uUrl.split('/').pop()||'Playlist'); setIsXtream(false);
      setActiveLiveCat(Object.keys(lm).sort()[0]||null); setLiveSideView('cat');
      setAppState('hub');
    } catch(e:any) { setErr(e.message||'Failed to load'); }
    setLoading(false);
  };

  const onFileDrop = (e:React.DragEvent) => {
    e.preventDefault();
    const file=e.dataTransfer.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target?.result as string; const allChs=parseM3U(text);
      if(!allChs.length){setErr('No channels found');return;}
      const {live,vod,series}=classifyM3U(allChs);
      const lm=groupByF(live),vm=groupByF(vod.map(c=>({...c,rating:'',year:''}))),sm=groupByF(series.map(c=>({id:c.id,name:c.name,cover:c.logo,group:c.group,rating:'',genre:''})));
      setLiveMap(lm);setLiveCats(Object.keys(lm).sort());
      setVodMap(vm as any);setVodCats(Object.keys(vm).sort());setVodLoaded(true);
      setSeriesMap(sm as any);setSeriesCats(Object.keys(sm).sort());setSeriesLoaded(true);
      setProfileName(file.name);setIsXtream(false);
      setActiveLiveCat(Object.keys(lm).sort()[0]||null);setLiveSideView('cat');
      setAppState('hub');
    };
    reader.readAsText(file);
  };

  const disconnect = () => {
    setAppState('login'); setActiveCh(null); setPlayerModal(false);
    setLiveMap({}); setLiveCats([]); setVodMap({}); setVodCats([]); setVodLoaded(false);
    setSeriesMap({}); setSeriesCats([]); setSeriesLoaded(false); setSelectedSeries(null);
    setEpgMap({}); epgFetched.current.clear(); svRef.current=null;
    if(hlsRef.current) hlsRef.current.destroy();
  };

  const navTo = (s:AppState) => {
    if(s==='vod'&&!vodLoaded&&isXtream) loadVod();
    if(s==='series'&&!seriesLoaded&&isXtream) loadSeries();
    setAppState(s); setSelectedSeries(null);
  };

  const liveChannels = activeLiveCat ? (liveMap[activeLiveCat]||[]) : [];

  // ── VOD filtered ─────────────────────────────────────────────────────────
  const vodItems = (() => {
    const base = activeVodCat ? (vodMap[activeVodCat]||[]) : Object.values(vodMap).flat();
    if (!vodSearch) return base;
    const q = vodSearch.toLowerCase();
    return base.filter(v => v.name.toLowerCase().includes(q));
  })();

  // ── Series filtered ──────────────────────────────────────────────────────
  const seriesItems = activeSeriesCat ? (seriesMap[activeSeriesCat]||[]) : Object.values(seriesMap).flat();

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#000;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
        @keyframes glow{0%,100%{box-shadow:0 0 6px #00e676;}50%{box-shadow:0 0 18px #00e676,0 0 30px #00e67666;}}
        ::-webkit-scrollbar{width:5px;height:4px;}
        ::-webkit-scrollbar-track{background:#0a0a0a;}
        ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:3px;}
        .hub-card:hover{transform:translateY(-8px)!important;border-color:#2a2a2a!important;box-shadow:0 16px 48px rgba(255,255,255,0.07)!important;}
        .nav-btn{background:none;border:none;cursor:pointer;padding:6px 13px;border-radius:7px;font-size:13px;font-weight:600;color:#555;transition:all 0.15s;font-family:inherit;}
        .nav-btn:hover{color:#ccc;background:#151515;}
        .nav-btn.active{color:#fff;background:#1e1e1e;}
        .cat-item:hover{background:#151515!important;color:#ddd!important;}
        .ch-item:hover{background:#161616!important;}
        .vod-card{transition:transform 0.18s,box-shadow 0.18s;}
        .vod-card:hover{transform:translateY(-5px)!important;box-shadow:0 10px 30px rgba(0,0,0,0.7)!important;}
        .ser-card{transition:transform 0.18s,box-shadow 0.18s;}
        .ser-card:hover{transform:translateY(-5px)!important;box-shadow:0 10px 30px rgba(0,0,0,0.7)!important;}
        .ep-row:hover{background:#1a1a1a!important;}
        @media(max-width:700px){
          .sidebar{position:fixed!important;left:0;top:0;bottom:0;z-index:100;transform:translateX(-100%);transition:transform 0.25s;width:280px!important;}
          .sidebar.open{transform:translateX(0);}
          .burger{display:block!important;}
          .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99;}
          .sidebar-overlay.open{display:block;}
          .hub-cards{flex-direction:column!important;align-items:center!important;}
          .hub-card{max-width:320px!important;width:100%!important;}
          .nav-labels{display:none!important;}
        }
      `}</style>

      <div style={{minHeight:'100vh',background:'#000',color:'#e0e0e0',fontFamily:"'Inter',system-ui,sans-serif",display:'flex',flexDirection:'column'}}>

        {/* ──────────────────── TOP NAV BAR ─────────────────────────────── */}
        <div style={{height:50,background:'#080808',borderBottom:'1px solid #161616',display:'flex',alignItems:'center',padding:'0 14px',gap:8,flexShrink:0}}>
          {appState==='live' && (
            <button className="burger" style={{background:'none',border:'none',color:'#aaa',fontSize:22,cursor:'pointer',padding:'4px 6px',display:'none'}} onClick={()=>setSideOpen(o=>!o)}>☰</button>
          )}
          <div style={{fontSize:15,fontWeight:800,color:'#fff',letterSpacing:'-0.5px',display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:'#e53e3e',display:'inline-block'}}/>
            IPTV
          </div>

          {appState !== 'login' && (
            <>
              <span style={{fontSize:11,color:'#2a2a2a',marginLeft:4,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0}}>{profileName}</span>

              {/* Navigation tabs */}
              <div style={{display:'flex',gap:1,marginLeft:8}}>
                {([['hub','🏠','Home'],['live','📺','Live TV'],['vod','🎬','Movies'],['series','🍿','Series']] as const).map(([key,ico,lbl]) => (
                  <button key={key} className={`nav-btn${appState===key?' active':''}`} onClick={()=>navTo(key as AppState)}>
                    {ico} <span className="nav-labels">{lbl}</span>
                  </button>
                ))}
              </div>

              <div style={{flex:1}}/>
              <button onClick={disconnect} style={{background:'none',border:'1px solid #222',color:'#444',borderRadius:7,padding:'4px 11px',fontSize:11,cursor:'pointer',flexShrink:0}}>
                ✕ Disconnect
              </button>
            </>
          )}
        </div>

        {/* ──────────────────── LOGIN ─────────────────────────────────────── */}
        {appState==='login' && (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'radial-gradient(ellipse at 50% 0%,#0d0d0d 0%,#000 70%)'}}>
            <div style={{background:'#0f0f0f',border:'1px solid #1e1e1e',borderRadius:18,padding:'36px 32px',width:'100%',maxWidth:440,boxShadow:'0 24px 64px rgba(0,0,0,0.8)'}}>
              <div style={{fontSize:24,fontWeight:900,color:'#fff',marginBottom:6,textAlign:'center'}}>Connect Your Playlist</div>
              <div style={{fontSize:13,color:'#555',textAlign:'center',marginBottom:28}}>Xtream Codes API or M3U format</div>

              <div style={{display:'flex',gap:3,background:'#1a1a1a',padding:3,borderRadius:10,marginBottom:24}}>
                {(['xtream','m3u'] as const).map(t=>(
                  <button key={t} style={{flex:1,padding:'9px 0',textAlign:'center',borderRadius:8,border:'none',fontSize:13,fontWeight:600,cursor:'pointer',transition:'all 0.15s',
                    background:loginTab===t?'#fff':'transparent',color:loginTab===t?'#000':'#666',fontFamily:'inherit'}}
                    onClick={()=>{setLoginTab(t);setErr('');}}>
                    {t==='xtream'?'🔑 Xtream Codes API':'📋 M3U Playlist'}
                  </button>
                ))}
              </div>

              {loginTab==='xtream' ? (
                <>
                  {([{k:'server',l:'Host URL',p:'http://provider.com:8080'},{k:'username',l:'Username',p:'your_username'},{k:'password',l:'Password',p:'your_password'},{k:'name',l:'Profile Name (optional)',p:'My IPTV'}] as const).map(f=>(
                    <div key={f.k} style={{marginBottom:14}}>
                      <label style={{display:'block',fontSize:10,fontWeight:600,color:'#444',letterSpacing:'1.2px',textTransform:'uppercase',marginBottom:5}}>{f.l}</label>
                      <input style={{width:'100%',background:'#0a0a0a',border:'1px solid #252525',borderRadius:8,padding:'11px 13px',color:'#e0e0e0',fontSize:14,outline:'none'}}
                        placeholder={f.p} type={f.k==='password'?'password':'text'} value={(xtream as any)[f.k]}
                        onChange={e=>setXtream(x=>({...x,[f.k]:e.target.value}))}
                        onKeyDown={e=>e.key==='Enter'&&xtream.server&&xtream.username&&loginXtream()}/>
                    </div>
                  ))}
                  {err&&<div style={{color:'#e53e3e',fontSize:13,marginTop:4,textAlign:'center',marginBottom:8}}>{err}</div>}
                  <button style={{width:'100%',background:'#e53e3e',color:'#fff',border:'none',borderRadius:10,padding:'13px',fontSize:14,fontWeight:700,cursor:'pointer',marginTop:4,
                    opacity:(!xtream.server||!xtream.username||loading)?0.45:1,fontFamily:'inherit'}}
                    disabled={!xtream.server||!xtream.username||loading} onClick={loginXtream}>
                    {loading?'Connecting…':'▶ Connect & Load Channels'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{marginBottom:14}}>
                    <label style={{display:'block',fontSize:10,fontWeight:600,color:'#444',letterSpacing:'1.2px',textTransform:'uppercase',marginBottom:5}}>M3U URL</label>
                    <input style={{width:'100%',background:'#0a0a0a',border:'1px solid #252525',borderRadius:8,padding:'11px 13px',color:'#e0e0e0',fontSize:14,outline:'none'}}
                      placeholder="http://provider.com/playlist.m3u" value={m3uUrl}
                      onChange={e=>setM3uUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&m3uUrl&&loginM3U()}/>
                  </div>
                  <div style={{border:'2px dashed #222',borderRadius:10,padding:'28px 20px',textAlign:'center',color:'#444',cursor:'pointer',marginBottom:14,fontSize:13}}
                    onDragOver={e=>e.preventDefault()} onDrop={onFileDrop}
                    onClick={()=>{const i=document.createElement('input');i.type='file';i.accept='.m3u,.m3u8';i.onchange=(ev:any)=>{const f=ev.target.files[0];if(f){const r=new FileReader();r.onload=e2=>{const t=e2.target?.result as string;const a=parseM3U(t);if(!a.length){setErr('No channels found');return;}const{live:l,vod:v,series:s}=classifyM3U(a);const lm=groupByF(l),vm=groupByF(v.map(c=>({...c,rating:'',year:''}))),sm=groupByF(s.map(c=>({id:c.id,name:c.name,cover:c.logo,group:c.group,rating:'',genre:''})));setLiveMap(lm);setLiveCats(Object.keys(lm).sort());setVodMap(vm as any);setVodCats(Object.keys(vm).sort());setVodLoaded(true);setSeriesMap(sm as any);setSeriesCats(Object.keys(sm).sort());setSeriesLoaded(true);setProfileName(f.name);setIsXtream(false);setActiveLiveCat(Object.keys(lm).sort()[0]||null);setLiveSideView('cat');setAppState('hub');};r.readAsText(f);}};i.click();}}>
                    📂 Drop .m3u / .m3u8 file here or click to browse
                  </div>
                  {err&&<div style={{color:'#e53e3e',fontSize:13,marginTop:4,textAlign:'center',marginBottom:8}}>{err}</div>}
                  <button style={{width:'100%',background:'#e53e3e',color:'#fff',border:'none',borderRadius:10,padding:'13px',fontSize:14,fontWeight:700,cursor:'pointer',
                    opacity:(!m3uUrl||loading)?0.45:1,fontFamily:'inherit'}}
                    disabled={!m3uUrl||loading} onClick={loginM3U}>
                    {loading?'Loading…':'▶ Load Playlist'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────── HUB ───────────────────────────────────────── */}
        {appState==='hub' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',background:'radial-gradient(ellipse at 50% 30%,#0d0d0d 0%,#000 80%)'}}>
            <div style={{fontSize:11,letterSpacing:'3px',textTransform:'uppercase',color:'#333',marginBottom:14,fontWeight:600}}>WHAT WOULD YOU LIKE TO WATCH?</div>
            <div className="hub-cards" style={{display:'flex',gap:20,flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:980}}>

              {/* ── LIVE TV ── */}
              <div className="hub-card" onClick={()=>navTo('live')} style={{flex:'1 1 260px',maxWidth:300,background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:20,padding:'36px 28px',cursor:'pointer',textAlign:'center',transition:'all 0.22s'}}>
                <div style={{fontSize:56,marginBottom:16}}>📺</div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:10}}>
                  <span style={{width:9,height:9,borderRadius:'50%',background:'#00e676',display:'inline-block',animation:'glow 2s ease-in-out infinite'}}/>
                  <span style={{fontSize:18,fontWeight:900,color:'#fff',letterSpacing:'1px'}}>LIVE TV</span>
                </div>
                <div style={{fontSize:12,color:'#3a3a3a',marginBottom:4}}>
                  {Object.values(liveMap).flat().length.toLocaleString()} channels
                </div>
                <div style={{fontSize:11,color:'#2a2a2a'}}>{liveCats.length} categories</div>
                <div style={{marginTop:16,padding:'7px 16px',background:'rgba(0,230,118,0.08)',border:'1px solid rgba(0,230,118,0.15)',borderRadius:20,display:'inline-block',fontSize:11,color:'#00e676',fontWeight:600}}>● LIVE NOW</div>
              </div>

              {/* ── MOVIES ── */}
              <div className="hub-card" onClick={()=>navTo('vod')} style={{flex:'1 1 260px',maxWidth:300,background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:20,padding:'36px 28px',cursor:'pointer',textAlign:'center',transition:'all 0.22s'}}>
                <div style={{fontSize:56,marginBottom:16}}>🎬</div>
                <div style={{fontSize:18,fontWeight:900,color:'#fff',letterSpacing:'1px',marginBottom:10}}>MOVIES</div>
                <div style={{fontSize:12,color:'#3a3a3a',marginBottom:4}}>
                  {vodLoaded ? `${Object.values(vodMap).flat().length.toLocaleString()} titles` : isXtream ? 'Loads on first click' : 'No VOD detected'}
                </div>
                <div style={{fontSize:11,color:'#2a2a2a'}}>{vodLoaded?`${vodCats.length} genres`:'Video on Demand'}</div>
                <div style={{marginTop:16,padding:'7px 16px',background:'rgba(229,62,62,0.08)',border:'1px solid rgba(229,62,62,0.15)',borderRadius:20,display:'inline-block',fontSize:11,color:'#e53e3e',fontWeight:600}}>VOD</div>
              </div>

              {/* ── SERIES ── */}
              <div className="hub-card" onClick={()=>navTo('series')} style={{flex:'1 1 260px',maxWidth:300,background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:20,padding:'36px 28px',cursor:'pointer',textAlign:'center',transition:'all 0.22s'}}>
                <div style={{fontSize:56,marginBottom:16}}>🍿</div>
                <div style={{fontSize:18,fontWeight:900,color:'#fff',letterSpacing:'1px',marginBottom:10}}>SERIES</div>
                <div style={{fontSize:12,color:'#3a3a3a',marginBottom:4}}>
                  {seriesLoaded ? `${Object.values(seriesMap).flat().length.toLocaleString()} shows` : isXtream ? 'Loads on first click' : 'No series detected'}
                </div>
                <div style={{fontSize:11,color:'#2a2a2a'}}>{seriesLoaded?`${seriesCats.length} genres`:'TV Shows & Seasons'}</div>
                <div style={{marginTop:16,padding:'7px 16px',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:20,display:'inline-block',fontSize:11,color:'#f59e0b',fontWeight:600}}>BINGE WATCH</div>
              </div>
            </div>
          </div>
        )}

        {/* ──────────────────── LIVE TV ───────────────────────────────────── */}
        {appState==='live' && (
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            <div className={`sidebar-overlay${sideOpen?' open':''}`} onClick={()=>setSideOpen(false)}/>

            {/* Sidebar */}
            <div className={`sidebar${sideOpen?' open':''}`} style={{width:300,background:'#070707',borderRight:'1px solid #141414',display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
              <div style={{padding:'12px 14px',borderBottom:'1px solid #141414',display:'flex',alignItems:'center',gap:8}}>
                {liveSideView==='ch'&&activeLiveCat ? (
                  <>
                    <button onClick={()=>setLiveSideView('cat')} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:18,padding:0,lineHeight:1}}>‹</button>
                    <span style={{fontSize:12,fontWeight:700,color:'#ddd',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeLiveCat}</span>
                    <span style={{fontSize:10,color:'#333'}}>{liveChannels.length}</span>
                  </>
                ) : (
                  <>
                    <span style={{fontSize:12,fontWeight:700,color:'#ddd',flex:1}}>📺 LIVE TV</span>
                    <span style={{fontSize:10,color:'#333'}}>{liveCats.length} cats</span>
                  </>
                )}
              </div>

              {/* Category list */}
              {liveSideView==='cat' && (
                <div style={{overflowY:'auto',flex:1,padding:'4px 0'}}>
                  {liveCats.map(cat=>(
                    <div key={cat} className="cat-item" onClick={()=>{setActiveLiveCat(cat);setLiveSideView('ch');}}
                      style={{padding:'9px 14px',cursor:'pointer',fontSize:12,color:activeLiveCat===cat?'#fff':'#666',background:activeLiveCat===cat?'#181818':'transparent',display:'flex',alignItems:'center',gap:8,transition:'all 0.12s'}}>
                      <span style={{fontSize:13}}>📺</span>
                      <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat}</span>
                      <span style={{fontSize:10,color:'#2a2a2a'}}>{liveMap[cat]?.length||0}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Channel list with EPG */}
              {liveSideView==='ch' && (
                <div style={{overflowY:'auto',flex:1,padding:'4px 0'}}>
                  {liveChannels.map(ch=>{
                    const epg = epgMap[ch.id];
                    const curr = epg?.current;
                    const pct = curr ? epgPct(curr) : 0;
                    const isActive = activeCh?.id===ch.id;
                    return (
                      <div key={ch.id} className="ch-item" onClick={()=>{playChannel(ch,false);setSideOpen(false);}}
                        style={{padding:'9px 12px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:9,background:isActive?'#1a1a1a':'transparent',transition:'background 0.1s'}}>
                        {ch.logo
                          ? <img src={ch.logo} alt="" style={{width:32,height:32,borderRadius:6,objectFit:'contain',background:'#141414',flexShrink:0}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                          : <div style={{width:32,height:32,borderRadius:6,background:'#141414',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#333'}}>📺</div>
                        }
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,color:isActive?'#fff':'#aaa',fontWeight:isActive?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:curr?4:0}}>
                            {ch.name}
                          </div>
                          {curr && (
                            <>
                              <div style={{fontSize:10,color:'#444',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:4}}>
                                ▸ {curr.title}
                              </div>
                              {/* Progress bar */}
                              <div style={{height:2,background:'#1e1e1e',borderRadius:1,overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${pct}%`,background:'#e53e3e',borderRadius:1,transition:'width 0.5s'}}/>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Main player */}
            <div style={{flex:1,display:'flex',flexDirection:'column',background:'#000',overflow:'hidden'}}>
              {/* Title bar */}
              <div style={{padding:'9px 16px',background:'#070707',borderBottom:'1px solid #141414',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                {activeCh?.logo && <img src={activeCh.logo} alt="" style={{width:22,height:22,borderRadius:4,objectFit:'contain'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>}
                <span style={{fontSize:13,color:'#888',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {activeCh ? activeCh.name : 'Select a channel'}
                  {activeCh && epgMap[activeCh.id]?.current && (
                    <span style={{color:'#444',marginLeft:8}}>· {epgMap[activeCh.id].current!.title}</span>
                  )}
                </span>
                {activeCh && (
                  <button onClick={()=>videoRef.current?.requestFullscreen()} style={{background:'none',border:'1px solid #1e1e1e',color:'#555',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer'}}>⛶ Fullscreen</button>
                )}
              </div>

              {/* Video canvas */}
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',background:'#000'}}>
                {!activeCh && (
                  <div style={{textAlign:'center',color:'#1e1e1e',padding:60}}>
                    <div style={{fontSize:52,marginBottom:14}}>📺</div>
                    <div style={{fontSize:15,fontWeight:600,color:'#2a2a2a'}}>Select a channel to begin</div>
                    <div style={{fontSize:12,color:'#1a1a1a',marginTop:6}}>Browse categories in the sidebar</div>
                  </div>
                )}
                {buffering&&activeCh && (
                  <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.75)',zIndex:5,gap:14}}>
                    <div style={{width:44,height:44,border:'3px solid #1e1e1e',borderTop:'3px solid #e53e3e',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                    <div style={{fontSize:12,color:'#444'}}>Buffering…</div>
                  </div>
                )}
                <video ref={videoRef} style={{width:'100%',height:'100%',objectFit:'contain',background:'#000',display:activeCh?'block':'none'}}
                  controls autoPlay playsInline
                  onWaiting={()=>setBuffering(true)} onCanPlay={()=>setBuffering(false)}
                  onPlaying={()=>setBuffering(false)} onError={()=>setBuffering(false)}/>
              </div>

              {/* EPG meta-bar */}
              {activeCh && (epgMap[activeCh.id]?.current||epgMap[activeCh.id]?.next) && (
                <div style={{background:'#070707',borderTop:'1px solid #141414',padding:'10px 18px',flexShrink:0}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
                    {epgMap[activeCh.id]?.current && (
                      <div style={{flex:'2 1 240px',minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                          <span style={{background:'#e53e3e',color:'#fff',fontSize:9,fontWeight:800,padding:'2px 7px',borderRadius:4,letterSpacing:'1px'}}>NOW</span>
                          <span style={{fontSize:13,fontWeight:700,color:'#ddd',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{epgMap[activeCh.id].current!.title}</span>
                          <span style={{fontSize:11,color:'#333',whiteSpace:'nowrap',marginLeft:'auto'}}>
                            {fmtTime(epgMap[activeCh.id].current!.start_ts)} – {fmtTime(epgMap[activeCh.id].current!.stop_ts)}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div style={{height:3,background:'#1a1a1a',borderRadius:2,marginBottom:5}}>
                          <div style={{height:'100%',width:`${epgPct(epgMap[activeCh.id].current!)}%`,background:'linear-gradient(90deg,#e53e3e,#ff6b6b)',borderRadius:2}}/>
                        </div>
                        {epgMap[activeCh.id].current!.desc && (
                          <div style={{fontSize:11,color:'#3a3a3a',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as any}}>
                            {epgMap[activeCh.id].current!.desc}
                          </div>
                        )}
                      </div>
                    )}
                    {epgMap[activeCh.id]?.next && (
                      <div style={{flex:'1 1 180px',minWidth:0,borderLeft:'1px solid #1a1a1a',paddingLeft:16}}>
                        <div style={{fontSize:9,fontWeight:700,color:'#333',letterSpacing:'1.2px',textTransform:'uppercase',marginBottom:4}}>NEXT UP</div>
                        <div style={{fontSize:12,color:'#555',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {epgMap[activeCh.id].next!.title}
                        </div>
                        <div style={{fontSize:10,color:'#2a2a2a',marginTop:3}}>
                          {fmtTime(epgMap[activeCh.id].next!.start_ts)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────── VOD ───────────────────────────────────────── */}
        {appState==='vod' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* VOD top controls */}
            <div style={{padding:'12px 18px',background:'#070707',borderBottom:'1px solid #141414',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
              <input style={{background:'#0d0d0d',border:'1px solid #1e1e1e',borderRadius:8,padding:'8px 13px',color:'#e0e0e0',fontSize:13,outline:'none',flex:'1 1 180px',maxWidth:280}}
                placeholder="🔍 Search movies…" value={vodSearch} onChange={e=>setVodSearch(e.target.value)}/>
              <select style={{background:'#0d0d0d',border:'1px solid #1e1e1e',borderRadius:8,padding:'8px 13px',color:'#aaa',fontSize:12,outline:'none',maxWidth:200}}
                value={activeVodCat||''} onChange={e=>setActiveVodCat(e.target.value||null)}>
                <option value="">All Genres ({Object.values(vodMap).flat().length})</option>
                {vodCats.map(c=><option key={c} value={c}>{c} ({vodMap[c]?.length||0})</option>)}
              </select>
            </div>
            {/* VOD grid */}
            <div style={{flex:1,overflowY:'auto',padding:'16px 18px'}}>
              {vodLoading && (
                <div style={{textAlign:'center',padding:80,color:'#333'}}>
                  <div style={{width:40,height:40,border:'3px solid #1e1e1e',borderTop:'3px solid #e53e3e',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
                  <div>Loading movies…</div>
                </div>
              )}
              {!vodLoaded&&!vodLoading&&!isXtream && (
                <div style={{textAlign:'center',padding:80,color:'#2a2a2a'}}>
                  <div style={{fontSize:48,marginBottom:12}}>🎬</div>
                  <div style={{fontSize:14,color:'#333'}}>No VOD content detected in this playlist</div>
                </div>
              )}
              {vodLoaded && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12}}>
                  {vodItems.slice(0,200).map(v=>(
                    <div key={v.id} className="vod-card" onClick={()=>playChannel({id:v.id,name:v.name,logo:v.logo,url:v.url,group:v.group},true)}
                      style={{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:10,overflow:'hidden',cursor:'pointer'}}>
                      <div style={{aspectRatio:'2/3',background:'#111',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                        {v.logo
                          ? <img src={v.logo} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{(e.target as HTMLImageElement).src='';(e.target as HTMLImageElement).style.display='none';}}/>
                          : <span style={{fontSize:36}}>🎬</span>
                        }
                      </div>
                      <div style={{padding:'8px 10px'}}>
                        <div style={{fontSize:11,fontWeight:600,color:'#ccc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3}}>{v.name}</div>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          {v.year&&<span style={{fontSize:9,color:'#444'}}>{v.year}</span>}
                          {v.rating&&<span style={{fontSize:9,color:'#f59e0b'}}>★ {v.rating}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {vodItems.length>200&&<div style={{gridColumn:'1/-1',textAlign:'center',color:'#333',fontSize:12,padding:12}}>Showing 200 of {vodItems.length} results — use search to filter</div>}
                  {vodLoaded&&vodItems.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',color:'#2a2a2a',padding:60,fontSize:14}}>No results found</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────── SERIES ────────────────────────────────────── */}
        {appState==='series' && (
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Series top controls */}
            <div style={{padding:'12px 18px',background:'#070707',borderBottom:'1px solid #141414',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
              {selectedSeries && (
                <button onClick={()=>{setSelectedSeries(null);setSeriesDetail(null);}} style={{background:'none',border:'1px solid #1e1e1e',color:'#666',borderRadius:7,padding:'6px 12px',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>‹ Back</button>
              )}
              {!selectedSeries && (
                <select style={{background:'#0d0d0d',border:'1px solid #1e1e1e',borderRadius:8,padding:'8px 13px',color:'#aaa',fontSize:12,outline:'none',maxWidth:220}}
                  value={activeSeriesCat||''} onChange={e=>setActiveSeriesCat(e.target.value||null)}>
                  <option value="">All Genres ({Object.values(seriesMap).flat().length})</option>
                  {seriesCats.map(c=><option key={c} value={c}>{c} ({seriesMap[c]?.length||0})</option>)}
                </select>
              )}
              {selectedSeries && (
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#ddd'}}>{selectedSeries.name}</span>
                  {selectedSeries.rating&&<span style={{fontSize:11,color:'#f59e0b'}}>★ {selectedSeries.rating}</span>}
                </div>
              )}
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'16px 18px'}}>
              {seriesLoading && (
                <div style={{textAlign:'center',padding:80,color:'#333'}}>
                  <div style={{width:40,height:40,border:'3px solid #1e1e1e',borderTop:'3px solid #e53e3e',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
                  <div>Loading series…</div>
                </div>
              )}
              {!seriesLoaded&&!seriesLoading&&!isXtream && (
                <div style={{textAlign:'center',padding:80,color:'#2a2a2a'}}>
                  <div style={{fontSize:48,marginBottom:12}}>🍿</div>
                  <div style={{fontSize:14,color:'#333'}}>No series content detected in this playlist</div>
                </div>
              )}

              {/* Series grid */}
              {seriesLoaded&&!selectedSeries && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:14}}>
                  {seriesItems.slice(0,150).map(s=>(
                    <div key={s.id} className="ser-card" onClick={()=>loadSeriesDetail(s)}
                      style={{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:10,overflow:'hidden',cursor:'pointer'}}>
                      <div style={{aspectRatio:'2/3',background:'#111',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                        {s.cover
                          ? <img src={s.cover} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                          : <span style={{fontSize:40}}>🍿</span>
                        }
                      </div>
                      <div style={{padding:'8px 10px'}}>
                        <div style={{fontSize:11,fontWeight:600,color:'#ccc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2}}>{s.name}</div>
                        {s.genre&&<div style={{fontSize:9,color:'#444',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.genre}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Series detail — seasons + episodes */}
              {selectedSeries && (
                <>
                  {seriesDetailLoading && (
                    <div style={{textAlign:'center',padding:60,color:'#333'}}>
                      <div style={{width:36,height:36,border:'3px solid #1e1e1e',borderTop:'3px solid #f59e0b',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
                      <div style={{fontSize:12}}>Loading episodes…</div>
                    </div>
                  )}
                  {seriesDetail && (() => {
                    const sv = svRef.current;
                    const episodes: Record<string,any[]> = seriesDetail.episodes || {};
                    const seasons = Object.keys(episodes).sort((a,b)=>Number(a)-Number(b));
                    return (
                      <div>
                        {selectedSeries.genre&&<div style={{fontSize:11,color:'#444',marginBottom:14}}>{selectedSeries.genre}{selectedSeries.rating?` · ★ ${selectedSeries.rating}`:''}</div>}
                        {seasons.map(season=>(
                          <div key={season} style={{marginBottom:24}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#888',letterSpacing:'1px',textTransform:'uppercase',marginBottom:10,paddingBottom:8,borderBottom:'1px solid #1a1a1a'}}>
                              Season {season}
                            </div>
                            <div style={{display:'flex',flexDirection:'column',gap:2}}>
                              {(episodes[season]||[]).map((ep:any)=>{
                                const epUrl = sv ? `${sv.server.replace(/\/$/,'')}/series/${sv.username}/${sv.password}/${ep.id}.${ep.container_extension||'mp4'}` : '';
                                return (
                                  <div key={ep.id} className="ep-row" onClick={()=>epUrl&&playChannel({id:String(ep.id),name:`${selectedSeries.name} S${season}E${ep.episode_num} - ${ep.title||''}`,logo:selectedSeries.cover,url:epUrl,group:'series'},true)}
                                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',cursor:'pointer',borderRadius:8,transition:'background 0.1s'}}>
                                    <span style={{fontSize:11,color:'#333',width:24,textAlign:'center',flexShrink:0}}>E{ep.episode_num}</span>
                                    <div style={{flex:1,minWidth:0}}>
                                      <div style={{fontSize:12,fontWeight:600,color:'#ccc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ep.title||`Episode ${ep.episode_num}`}</div>
                                      {ep.info?.duration&&<div style={{fontSize:10,color:'#333',marginTop:2}}>{ep.info.duration}</div>}
                                    </div>
                                    <span style={{fontSize:18,opacity:0.4}}>▶</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {seasons.length===0&&<div style={{textAlign:'center',color:'#2a2a2a',padding:40}}>No episodes available</div>}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────── MODAL PLAYER (VOD / Series) ───────────────── */}
        {playerModal && activeCh && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.97)',zIndex:500,display:'flex',flexDirection:'column'}}>
            {/* Modal top bar */}
            <div style={{height:50,background:'#070707',borderBottom:'1px solid #141414',display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0}}>
              {activeCh.logo&&<img src={activeCh.logo} alt="" style={{width:28,height:28,borderRadius:5,objectFit:'contain'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>}
              <span style={{fontSize:13,fontWeight:600,color:'#ddd',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeCh.name}</span>
              <button onClick={()=>videoRef.current?.requestFullscreen()} style={{background:'none',border:'1px solid #1e1e1e',color:'#555',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer'}}>⛶ Fullscreen</button>
              <button onClick={()=>{setPlayerModal(false);setActiveCh(null);if(hlsRef.current){hlsRef.current.destroy();hlsRef.current=null;}}} style={{background:'none',border:'1px solid #1e1e1e',color:'#555',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer'}}>✕ Close</button>
            </div>
            {/* Video */}
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',background:'#000'}}>
              {buffering && (
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',zIndex:5,gap:14}}>
                  <div style={{width:44,height:44,border:'3px solid #1e1e1e',borderTop:'3px solid #e53e3e',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  <div style={{fontSize:12,color:'#444'}}>Loading…</div>
                </div>
              )}
              <video ref={videoRef} style={{width:'100%',height:'100%',objectFit:'contain',background:'#000'}}
                controls autoPlay playsInline
                onWaiting={()=>setBuffering(true)} onCanPlay={()=>setBuffering(false)}
                onPlaying={()=>setBuffering(false)} onError={()=>setBuffering(false)}/>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

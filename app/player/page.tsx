"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Channel {
  id: string;
  name: string;
  logo: string;
  url: string;
  group: string;
}

interface LoginXtream { server: string; username: string; password: string; name: string }

// ─── M3U Parser ───────────────────────────────────────────────────────────────
function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  let meta: Partial<Channel> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const name  = line.match(/,(.+)$/)?.[1]?.trim()          || 'Unknown';
      const logo  = line.match(/tvg-logo="([^"]+)"/)?.[1]      || '';
      const group = line.match(/group-title="([^"]+)"/)?.[1]   || 'Uncategorized';
      const id    = line.match(/tvg-id="([^"]+)"/)?.[1]        || String(i);
      meta = { id, name, logo, group };
    } else if (line && !line.startsWith('#') && meta.name) {
      channels.push({ id: meta.id!, name: meta.name!, logo: meta.logo!, group: meta.group!, url: line });
      meta = {};
    }
  }
  return channels;
}

function groupByCategory(channels: Channel[]): Record<string, Channel[]> {
  return channels.reduce((acc: Record<string, Channel[]>, ch) => {
    (acc[ch.group] = acc[ch.group] || []).push(ch);
    return acc;
  }, {});
}

// ─── Proxy URL ────────────────────────────────────────────────────────────────
function proxied(url: string) {
  return `/api/erp/iptv/proxy?url=${encodeURIComponent(url)}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root:    { minHeight:"100vh", background:"#000", color:"#e0e0e0", fontFamily:"'Inter',system-ui,sans-serif", display:"flex", flexDirection:"column" },
  topbar:  { height:50, background:"#0a0a0a", borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0 },
  logo:    { fontSize:17, fontWeight:800, color:"#fff", letterSpacing:"-0.5px" },
  dot:     { width:8, height:8, borderRadius:"50%", background:"#e53e3e", display:"inline-block", marginRight:4 },

  loginWrap:  { flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  loginBox:   { background:"#111", border:"1px solid #222", borderRadius:16, padding:"36px 32px", width:"100%", maxWidth:440 },
  loginTitle: { fontSize:22, fontWeight:800, color:"#fff", marginBottom:6, textAlign:"center" as const },
  loginSub:   { fontSize:13, color:"#666", textAlign:"center" as const, marginBottom:28 },

  tabRow:   { display:"flex", gap:3, background:"#1a1a1a", padding:3, borderRadius:9, marginBottom:24 },
  tab:      { flex:1, padding:"9px 0", textAlign:"center" as const, borderRadius:7, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", transition:"all 0.15s" },
  tabA:     { background:"#fff", color:"#000" },
  tabI:     { background:"transparent", color:"#777" },

  field:    { marginBottom:14 },
  label:    { display:"block" as const, fontSize:11, fontWeight:600, color:"#555", letterSpacing:"1px", textTransform:"uppercase" as const, marginBottom:5 },
  input:    { width:"100%", background:"#0d0d0d", border:"1px solid #2a2a2a", borderRadius:8, padding:"11px 13px", color:"#e0e0e0", fontSize:14, outline:"none", boxSizing:"border-box" as const },
  btn:      { width:"100%", background:"#e53e3e", color:"#fff", border:"none", borderRadius:9, padding:"13px", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:6, transition:"opacity 0.15s" },
  btnDis:   { opacity:0.5, cursor:"not-allowed" },

  dropzone: { border:"2px dashed #2a2a2a", borderRadius:10, padding:"32px 20px", textAlign:"center" as const, color:"#555", cursor:"pointer", marginBottom:14, transition:"border-color 0.15s" },

  workspace: { flex:1, display:"flex", overflow:"hidden" },

  sidebar:   { width:300, background:"#0a0a0a", borderRight:"1px solid #1a1a1a", display:"flex", flexDirection:"column" as const, overflow:"hidden", flexShrink:0 },
  sideHead:  { padding:"14px 16px", borderBottom:"1px solid #1a1a1a", display:"flex", justifyContent:"space-between", alignItems:"center" },
  sideTitle: { fontSize:13, fontWeight:700, color:"#fff" },

  catList:   { overflowY:"auto" as const, flex:1, padding:"6px 0" },
  catItem:   { padding:"10px 16px", cursor:"pointer", fontSize:13, color:"#888", display:"flex", alignItems:"center", gap:8, transition:"all 0.12s" },
  catItemA:  { background:"#1a1a1a", color:"#fff" },

  chList:    { overflowY:"auto" as const, flex:1, padding:"6px 0" },
  chItem:    { padding:"9px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"background 0.1s" },
  chItemA:   { background:"#1e1e1e" },
  chLogo:    { width:32, height:32, borderRadius:6, objectFit:"contain" as const, background:"#1a1a1a", flexShrink:0 },
  chName:    { fontSize:13, color:"#ccc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const },
  chNameA:   { color:"#fff", fontWeight:600 },

  main:    { flex:1, display:"flex", flexDirection:"column" as const, background:"#000", overflow:"hidden" },
  titleBar:{ padding:"10px 18px", background:"#0a0a0a", borderBottom:"1px solid #151515", display:"flex", alignItems:"center", gap:10, flexShrink:0 },
  nowPlaying:{ fontSize:13, color:"#aaa", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const },
  canvas:  { flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" as const, background:"#000" },
  video:   { width:"100%", height:"100%", objectFit:"contain" as const, background:"#000" },

  spinner: { width:48, height:48, border:"4px solid #222", borderTop:"4px solid #e53e3e", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  empty:   { textAlign:"center" as const, color:"#333", padding:60 },
  err:     { color:"#e53e3e", fontSize:13, marginTop:10, textAlign:"center" as const },

  burgerBtn: { background:"none", border:"none", color:"#aaa", fontSize:22, cursor:"pointer", padding:"4px 8px", display:"none" },
  closeBtn:  { background:"none", border:"none", color:"#666", fontSize:18, cursor:"pointer", padding:"4px" },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  const [loginTab, setLoginTab] = useState<"xtream"|"m3u">("xtream");
  const [xtream, setXtream]     = useState<LoginXtream>({ server:"", username:"", password:"", name:"" });
  const [m3uUrl, setM3uUrl]     = useState("");
  const [loaded, setLoaded]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  const [profileName, setProfileName] = useState("IPTV");
  const [categories, setCategories]   = useState<string[]>([]);
  const [channelMap, setChannelMap]   = useState<Record<string, Channel[]>>({});
  const [activeServer, setActiveServer] = useState<LoginXtream | null>(null);

  const [activeCat, setActiveCat]   = useState<string | null>(null);
  const [activeCh, setActiveCh]     = useState<Channel | null>(null);
  const [sideView, setSideView]     = useState<"cat"|"ch">("cat");
  const [sideOpen, setSideOpen]     = useState(true);
  const [buffering, setBuffering]   = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef   = useRef<any>(null);

  // ── HLS / native playback ────────────────────────────────────────────────
  const playChannel = useCallback(async (ch: Channel) => {
    setActiveCh(ch);
    setBuffering(true);
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const src = proxied(ch.url);
    const isHLS = ch.url.includes('.m3u8') || ch.url.includes('/hls/') || ch.url.includes('type=m3u_plus');

    if (isHLS) {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false, lowLatencyMode: true, maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          setBuffering(false);
        });
        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data.fatal) setBuffering(false);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.play().catch(() => {});
        setBuffering(false);
      }
    } else {
      video.src = src;
      video.play().catch(() => {});
      video.oncanplay = () => setBuffering(false);
    }
  }, []);

  useEffect(() => {
    return () => { if (hlsRef.current) hlsRef.current.destroy(); };
  }, []);

  // ── Xtream login ─────────────────────────────────────────────────────────
  const loginXtream = async () => {
    setErr(""); setLoading(true);
    try {
      const q = (a: string) =>
        `/api/erp/iptv/xtream?server=${encodeURIComponent(xtream.server)}&username=${encodeURIComponent(xtream.username)}&password=${encodeURIComponent(xtream.password)}&action=${a}`;

      const [cats, streams] = await Promise.all([
        fetch(q('get_live_categories')).then(r => r.json()),
        fetch(q('get_live_streams')).then(r => r.json()),
      ]);

      if (!Array.isArray(cats)) throw new Error(cats?.error || 'Invalid response');

      const chs: Channel[] = (Array.isArray(streams) ? streams : []).map((s: any) => ({
        id:    String(s.stream_id),
        name:  s.name,
        logo:  s.stream_icon || '',
        group: (cats.find((c: any) => String(c.category_id) === String(s.category_id))?.category_name) || 'Uncategorized',
        url:   `${xtream.server.replace(/\/$/, '')}/live/${xtream.username}/${xtream.password}/${s.stream_id}.m3u8`,
      }));

      const map = groupByCategory(chs);
      const catList = Object.keys(map).sort();
      setChannelMap(map);
      setCategories(catList);
      setProfileName(xtream.name || xtream.server);
      setActiveServer(xtream);
      setLoaded(true);
      if (catList.length) { setActiveCat(catList[0]); setSideView("ch"); }
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    }
    setLoading(false);
  };

  // ── M3U login ────────────────────────────────────────────────────────────
  const loginM3U = async () => {
    setErr(""); setLoading(true);
    try {
      let text: string;
      if (m3uUrl.startsWith('http')) {
        const r = await fetch(`/api/erp/iptv/proxy?url=${encodeURIComponent(m3uUrl)}`);
        text = await r.text();
      } else {
        throw new Error('Please enter a valid M3U URL');
      }
      const chs = parseM3U(text);
      if (!chs.length) throw new Error('No channels found in playlist');
      const map = groupByCategory(chs);
      const catList = Object.keys(map).sort();
      setChannelMap(map);
      setCategories(catList);
      setProfileName(m3uUrl.split('/').pop() || 'Playlist');
      setLoaded(true);
      if (catList.length) { setActiveCat(catList[0]); setSideView("ch"); }
    } catch (e: any) {
      setErr(e.message || 'Failed to load playlist');
    }
    setLoading(false);
  };

  // ── M3U file drop ────────────────────────────────────────────────────────
  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const chs = parseM3U(text);
      if (!chs.length) { setErr('No channels found'); return; }
      const map = groupByCategory(chs);
      setChannelMap(map);
      setCategories(Object.keys(map).sort());
      setProfileName(file.name);
      setLoaded(true);
      const cats = Object.keys(map).sort();
      if (cats.length) { setActiveCat(cats[0]); setSideView("ch"); }
    };
    reader.readAsText(file);
  };

  // ── Category select ──────────────────────────────────────────────────────
  const selectCat = (cat: string) => {
    setActiveCat(cat);
    setSideView("ch");
  };

  const channels = activeCat ? (channelMap[activeCat] || []) : [];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
        .cat-item:hover { background: #151515 !important; color: #ddd !important; }
        .ch-item:hover  { background: #161616 !important; }
        .tab-btn:hover  { color: #ccc !important; }
        @media (max-width: 700px) {
          .sidebar { position: fixed !important; left: 0; top: 0; bottom: 0; z-index: 100; transform: translateX(-100%); transition: transform 0.25s; width: 280px !important; }
          .sidebar.open { transform: translateX(0); }
          .burger { display: block !important; }
          .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 99; }
          .sidebar-overlay.open { display: block; }
        }
      `}</style>

      <div style={S.root}>

        {/* Top Bar */}
        <div style={S.topbar}>
          {loaded && (
            <button className="burger" style={S.burgerBtn} onClick={() => setSideOpen(o => !o)}>☰</button>
          )}
          <div style={S.logo}><span style={S.dot} />IPTV Player</div>
          {loaded && (
            <>
              <span style={{ fontSize:12, color:"#444", marginLeft:4 }}>{profileName}</span>
              <div style={{ flex:1 }} />
              <button
                onClick={() => { setLoaded(false); setActiveCh(null); setCategories([]); setChannelMap({}); if(hlsRef.current) hlsRef.current.destroy(); }}
                style={{ background:"none", border:"1px solid #2a2a2a", color:"#666", borderRadius:7, padding:"4px 12px", fontSize:12, cursor:"pointer" }}
              >✕ Disconnect</button>
            </>
          )}
        </div>

        {/* LOGIN STATE */}
        {!loaded && (
          <div style={S.loginWrap}>
            <div style={S.loginBox}>
              <div style={S.loginTitle}>Connect Your Playlist</div>
              <div style={S.loginSub}>Xtream Codes or M3U format supported</div>

              {/* Tab row */}
              <div style={S.tabRow}>
                {(['xtream','m3u'] as const).map(t => (
                  <button
                    key={t}
                    className="tab-btn"
                    style={{ ...S.tab, ...(loginTab === t ? S.tabA : S.tabI) }}
                    onClick={() => { setLoginTab(t); setErr(''); }}
                  >
                    {t === 'xtream' ? '🔑 Xtream Codes API' : '📋 M3U Playlist'}
                  </button>
                ))}
              </div>

              {loginTab === 'xtream' ? (
                <>
                  {[
                    { key:'server',   label:'Host URL',  ph:'http://provider.com:8080' },
                    { key:'username', label:'Username',  ph:'your_username' },
                    { key:'password', label:'Password',  ph:'your_password' },
                    { key:'name',     label:'Profile Name (optional)', ph:'My IPTV' },
                  ].map(f => (
                    <div key={f.key} style={S.field}>
                      <label style={S.label}>{f.label}</label>
                      <input
                        style={S.input}
                        placeholder={f.ph}
                        type={f.key === 'password' ? 'password' : 'text'}
                        value={(xtream as any)[f.key]}
                        onChange={e => setXtream(x => ({ ...x, [f.key]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && xtream.server && xtream.username && loginXtream()}
                      />
                    </div>
                  ))}
                  {err && <div style={S.err}>{err}</div>}
                  <button
                    style={{ ...S.btn, ...((!xtream.server || !xtream.username || loading) ? S.btnDis : {}) }}
                    disabled={!xtream.server || !xtream.username || loading}
                    onClick={loginXtream}
                  >
                    {loading ? 'Connecting…' : '▶ Connect & Load'}
                  </button>
                </>
              ) : (
                <>
                  <div style={S.field}>
                    <label style={S.label}>M3U URL</label>
                    <input
                      style={S.input}
                      placeholder="http://provider.com/playlist.m3u"
                      value={m3uUrl}
                      onChange={e => setM3uUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && m3uUrl && loginM3U()}
                    />
                  </div>
                  <div
                    style={S.dropzone}
                    onDragOver={e => e.preventDefault()}
                    onDrop={onFileDrop}
                    onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='.m3u,.m3u8'; i.onchange=(e:any)=>{ const f=e.target.files[0]; if(f){ const r=new FileReader(); r.onload=ev=>{ const chs=parseM3U(ev.target?.result as string); if(chs.length){ const map=groupByCategory(chs); setChannelMap(map); setCategories(Object.keys(map).sort()); setProfileName(f.name); setLoaded(true); setActiveCat(Object.keys(map).sort()[0]); setSideView('ch'); } else setErr('No channels found'); }; r.readAsText(f); } }; i.click(); }}
                  >
                    📂 Drop .m3u file here or click to browse
                  </div>
                  {err && <div style={S.err}>{err}</div>}
                  <button
                    style={{ ...S.btn, ...(!m3uUrl || loading ? S.btnDis : {}) }}
                    disabled={!m3uUrl || loading}
                    onClick={loginM3U}
                  >
                    {loading ? 'Loading…' : '▶ Load Playlist'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* LOADED STATE */}
        {loaded && (
          <div style={S.workspace}>

            {/* Sidebar overlay (mobile) */}
            <div className={`sidebar-overlay${sideOpen ? ' open' : ''}`} onClick={() => setSideOpen(false)} />

            {/* Sidebar */}
            <div className={`sidebar${sideOpen ? ' open' : ''}`} style={S.sidebar}>
              <div style={S.sideHead}>
                {sideView === 'ch' && activeCat ? (
                  <>
                    <button onClick={() => setSideView('cat')} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:16, padding:0, marginRight:8 }}>‹</button>
                    <span style={{ ...S.sideTitle, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeCat}</span>
                    <span style={{ fontSize:11, color:'#444' }}>{channels.length}</span>
                  </>
                ) : (
                  <>
                    <span style={S.sideTitle}>Categories</span>
                    <span style={{ fontSize:11, color:'#444' }}>{categories.length}</span>
                  </>
                )}
              </div>

              {/* Category list */}
              {sideView === 'cat' && (
                <div style={S.catList}>
                  {categories.map(cat => (
                    <div
                      key={cat}
                      className="cat-item"
                      style={{ ...S.catItem, ...(activeCat === cat ? S.catItemA : {}) }}
                      onClick={() => selectCat(cat)}
                    >
                      <span style={{ fontSize:15 }}>📺</span>
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat}</span>
                      <span style={{ fontSize:11, color:'#444' }}>{channelMap[cat]?.length || 0}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Channel list */}
              {sideView === 'ch' && (
                <div style={S.chList}>
                  {channels.map(ch => (
                    <div
                      key={ch.id}
                      className="ch-item"
                      style={{ ...S.chItem, ...(activeCh?.id === ch.id ? S.chItemA : {}) }}
                      onClick={() => { playChannel(ch); setSideOpen(false); }}
                    >
                      {ch.logo
                        ? <img src={ch.logo} alt="" style={S.chLogo} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        : <div style={{ ...S.chLogo, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#333' }}>📺</div>
                      }
                      <span style={{ ...S.chName, ...(activeCh?.id === ch.id ? S.chNameA : {}) }}>{ch.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Main player */}
            <div style={S.main}>
              {/* Title bar */}
              <div style={S.titleBar}>
                {activeCh?.logo && (
                  <img src={activeCh.logo} alt="" style={{ width:24, height:24, borderRadius:4, objectFit:'contain' }} onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />
                )}
                <span style={S.nowPlaying}>{activeCh ? activeCh.name : 'Select a channel to start watching'}</span>
                {activeCh && (
                  <button
                    onClick={() => videoRef.current?.requestFullscreen()}
                    style={{ background:'none', border:'1px solid #2a2a2a', color:'#666', borderRadius:6, padding:'4px 10px', fontSize:12, cursor:'pointer' }}
                  >⛶ Fullscreen</button>
                )}
              </div>

              {/* Video canvas */}
              <div style={S.canvas}>
                {!activeCh && (
                  <div style={S.empty}>
                    <div style={{ fontSize:56, marginBottom:16 }}>📺</div>
                    <div style={{ fontSize:15, color:'#333', fontWeight:600 }}>Select a channel</div>
                    <div style={{ fontSize:13, color:'#2a2a2a', marginTop:6 }}>Choose a category and channel from the sidebar</div>
                  </div>
                )}
                {buffering && activeCh && (
                  <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)', zIndex:5, gap:14 }}>
                    <div style={S.spinner} />
                    <div style={{ fontSize:13, color:'#666' }}>Buffering {activeCh.name}…</div>
                  </div>
                )}
                <video
                  ref={videoRef}
                  style={{ ...S.video, display: activeCh ? 'block' : 'none' }}
                  controls
                  autoPlay
                  playsInline
                  onWaiting={() => setBuffering(true)}
                  onCanPlay={() => setBuffering(false)}
                  onPlaying={() => setBuffering(false)}
                  onError={() => setBuffering(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback } from "react";
import { useCart } from "../lib/cartContext";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  badge: string | null;
  image: string | null;
  category: string;
}

const STARS = Array.from({length:50}).map((_,i) => ({
  left: `${((i * 137.5) % 100).toFixed(2)}%`,
  top: `${((i * 97.3) % 100).toFixed(2)}%`,
  dur: `${2 + (i % 4)}s`,
  op: `${(0.2 + (i % 8) * 0.08).toFixed(2)}`,
  delay: `${(i % 5)}s`
}));

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("featured");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  // Live search
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { addToCart, cart } = useCart();

  const fetchProducts = useCallback((cat = filter, s = sort, mn = minPrice, mx = maxPrice) => {
    setLoading(true);
    let url = `/api/products?sort=${s}`;
    if (cat !== "All") url += `&category=${encodeURIComponent(cat)}`;
    if (mn) url += `&minPrice=${mn}`;
    if (mx) url += `&maxPrice=${mx}`;
    fetch(url)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) { setProducts(data); setLoadError(false); } else { setLoadError(true); } setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, [filter, sort, minPrice, maxPrice]);

  useEffect(() => { fetchProducts(); }, []);

  // Debounced live search
  useEffect(() => {
    if (!searchQ || searchQ.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(searchQ)}`).then(r=>r.json()).then(d=>{ setSearchResults(Array.isArray(d)?d:[]); setSearchOpen(true); }).catch(()=>{});
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const handleAddToCart = (p: Product) => {
    addToCart({ id: p.id, name: p.name, price: Number(p.price), qty: 1 });
    setAdded(p.id);
    setTimeout(() => setAdded(null), 1500);
  };

  const applyFilter = (cat: string) => { setFilter(cat); fetchProducts(cat, sort, minPrice, maxPrice); };
  const applySort = (s: string) => { setSort(s); fetchProducts(filter, s, minPrice, maxPrice); };
  const applyPrice = () => fetchProducts(filter, sort, minPrice, maxPrice);

  const categories = ["All", ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filtered = products;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        :root { --purple-deep: #0d0010; --purple-mid: #4a0080; --purple-bright: #8b00ff; --purple-glow: #bf5fff; --purple-light: #e0b3ff; --gold: #ffd700; }
        body { background: var(--purple-deep); color: #fff; font-family: 'Raleway', sans-serif; overflow-x: hidden; }
        .bg-animated { position: fixed; inset: 0; z-index: 0; background: radial-gradient(ellipse at 20% 20%, #2d0050 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #1a0035 0%, transparent 50%), #0a0010; overflow: hidden; }
        .star { position:absolute; width:2px; height:2px; background:white; border-radius:50%; animation:twinkle var(--dur) ease-in-out infinite; opacity:0; }
        @keyframes twinkle { 0%,100%{opacity:0} 50%{opacity:var(--op)} }
        nav { position: fixed; top:0; left:0; right:0; z-index:100; padding: 18px 60px; display: flex; align-items: center; justify-content: space-between; background:rgba(13,0,16,0.96); backdrop-filter:blur(20px); border-bottom:1px solid rgba(139,0,255,0.2); }
        .nav-logo { font-family: 'Cinzel', serif; font-size: 20px; font-weight: 900; background: linear-gradient(135deg, var(--purple-glow), var(--gold)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-decoration: none; letter-spacing: 2px; }
        .nav-links { display:flex; gap:36px; list-style:none; }
        .nav-links a { color:rgba(255,255,255,0.8); text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; }
        .nav-links a:hover { color:var(--purple-glow); }
        .nav-cta { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)) !important; color:white !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
        .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
        .hamburger span { display:block; width:25px; height:2px; background:var(--purple-glow); }
        .page-wrapper { position:relative; z-index:1; padding-top:100px; }
        .page-header { max-width:1300px; margin:0 auto; padding:60px 60px 30px; }
        .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
        .page-title { font-family:'Cinzel',serif; font-size:clamp(26px,3.5vw,44px); font-weight:700; color:white; }
        .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .filters { max-width:1300px; margin:0 auto; padding:0 60px 30px; display:flex; gap:12px; flex-wrap:wrap; }
        .filter-btn { padding:8px 20px; border-radius:30px; border:1px solid rgba(139,0,255,0.3); background:rgba(139,0,255,0.08); color:rgba(255,255,255,0.7); font-size:13px; cursor:pointer; transition:all 0.3s; }
        .filter-btn:hover, .filter-btn.active { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); color:white; border-color:transparent; }
        .products-grid { max-width:1300px; margin:0 auto; padding:0 60px 80px; display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:22px; }
        .product-card { background:linear-gradient(135deg,rgba(74,0,128,0.25),rgba(26,0,37,0.85)); border:1px solid rgba(139,0,255,0.2); border-radius:20px; overflow:hidden; transition:all 0.4s; position:relative; animation:fadeInUp 0.6s ease forwards; opacity:0; }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .product-card:hover { transform:translateY(-8px); border-color:rgba(139,0,255,0.6); box-shadow:0 20px 60px rgba(139,0,255,0.25); }
        .product-image { width:100%; aspect-ratio:1/1; background:linear-gradient(135deg,rgba(74,0,128,0.4),rgba(139,0,255,0.15)); border-bottom:1px solid rgba(139,0,255,0.2); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
        .product-image img { width:100%; height:100%; object-fit:cover; }
        .image-placeholder { display:flex; flex-direction:column; align-items:center; gap:10px; color:rgba(191,95,255,0.4); }
        .image-placeholder svg { width:48px; height:48px; opacity:0.5; }
        .image-placeholder span { font-size:11px; letter-spacing:2px; text-transform:uppercase; }
        .badge { position:absolute; top:12px; right:12px; z-index:2; background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); color:white; font-size:10px; font-weight:700; padding:4px 12px; border-radius:20px; }
        .badge.gold { background:linear-gradient(135deg,#b8860b,var(--gold)); color:#000; }
        .badge.new { background:linear-gradient(135deg,#006400,#00c800); }
        .badge.bundle { background:linear-gradient(135deg,#8b4500,#ff8c00); }
        .product-info { padding:22px; }
        .product-name { font-family:'Cinzel',serif; font-size:17px; font-weight:700; color:white; margin-bottom:8px; }
        .product-desc { font-size:13px; color:rgba(255,255,255,0.5); line-height:1.7; margin-bottom:18px; }
        .product-footer { display:flex; align-items:center; justify-content:space-between; }
        .product-price { font-size:22px; font-weight:700; color:var(--purple-glow); font-family:'Cinzel',serif; }
        .add-btn { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); color:white; border:none; padding:10px 20px; border-radius:30px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.3s; }
        .add-btn:hover { box-shadow:0 0 25px rgba(139,0,255,0.6); transform:scale(1.05); }
        .add-btn.added { background:linear-gradient(135deg,#006400,#00c800); }
        .loading { text-align:center; padding:60px; color:var(--purple-glow); font-size:18px; }
        footer { position:relative; z-index:1; padding:50px 60px; border-top:1px solid rgba(139,0,255,0.15); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
        .footer-logo { font-family:'Cinzel',serif; font-size:17px; font-weight:900; background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; }
        .footer-links a { color:rgba(255,255,255,0.4); text-decoration:none; font-size:13px; transition:color 0.3s; }
        .footer-links a:hover { color:var(--purple-glow); }
        .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }
        .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
        .whatsapp-btn:hover { transform:scale(1.15); }
        @media(max-width:768px){
          nav{padding:16px 24px;}
          .nav-links{display:none;}
          .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(13,0,16,0.98);align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
          .hamburger{display:flex;}
          .page-header{padding:40px 24px 24px;}
          .filters{padding:0 24px 24px;}
          .products-grid{padding:0 24px 60px;}
          footer{padding:36px 24px;flex-direction:column;text-align:center;}
        }
      `}</style>

      <div className="bg-animated">
        {STARS.map((s,i)=>(
          <div key={i} className="star" style={{left:s.left,top:s.top,"--dur":s.dur,"--op":s.op,animationDelay:s.delay} as React.CSSProperties}/>
        ))}
      </div>

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className={`nav-links ${menuOpen?"open":""}`}>
          <li><a href="/" onClick={()=>setMenuOpen(false)}>Home</a></li>
          <li><a href="/products" onClick={()=>setMenuOpen(false)}>Products</a></li>
          <li><a href="/order-tracking" onClick={()=>setMenuOpen(false)}>Track Order</a></li>
          <li><a href="/blog" onClick={()=>setMenuOpen(false)}>Blog</a></li>
          <li><a href="/contact" onClick={()=>setMenuOpen(false)}>Contact</a></li>
          <li><a href="/cart" className="nav-cta" onClick={()=>setMenuOpen(false)}>🛒 Cart {cart.length > 0 && `(${cart.length})`}</a></li>
        </ul>
        {/* Live Search */}
        <div ref={searchRef} style={{position:"relative",display:"flex",alignItems:"center",gap:8}}>
          {searchActive
            ? <input autoFocus style={{background:"rgba(139,0,255,0.1)",border:"1px solid rgba(139,0,255,0.4)",borderRadius:20,padding:"7px 16px",color:"white",fontSize:13,outline:"none",width:220}} placeholder="Search products..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Escape"&&(setSearchActive(false),setSearchQ(""),setSearchOpen(false))} />
            : <button style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.6)",fontSize:20,padding:"4px 8px"}} onClick={()=>setSearchActive(true)} title="Search">🔍</button>
          }
          {searchOpen && searchResults.length > 0 && (
            <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,width:320,background:"linear-gradient(135deg,rgba(26,0,40,0.98),rgba(13,0,20,0.99))",border:"1px solid rgba(139,0,255,0.3)",borderRadius:14,overflow:"hidden",zIndex:200,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",animation:"fadeIn 0.15s ease"}}>
              {searchResults.map((r:any)=>(
                <a key={r.id} href={`/products/${r.slug}`} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",textDecoration:"none",borderBottom:"1px solid rgba(139,0,255,0.07)",transition:"background 0.15s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(139,0,255,0.08)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                  {r.image ? <img src={r.image} alt={r.name} style={{width:40,height:40,borderRadius:6,objectFit:"cover",border:"1px solid rgba(139,0,255,0.2)"}} loading="lazy" /> : <div style={{width:40,height:40,borderRadius:6,background:"rgba(139,0,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📦</div>}
                  <div style={{flex:1,overflow:"hidden"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"white",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{r.category} · £{Number(r.price).toFixed(2)}</div>
                  </div>
                </a>
              ))}
              <a href={`/products?q=${encodeURIComponent(searchQ)}`} style={{display:"block",padding:"10px 16px",fontSize:12,color:"var(--purple-glow)",textDecoration:"none",textAlign:"center",background:"rgba(139,0,255,0.05)"}}>View all results for &quot;{searchQ}&quot; →</a>
            </div>
          )}
          {searchOpen && searchQ.length >= 2 && searchResults.length === 0 && (
            <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,width:240,background:"rgba(13,0,20,0.98)",border:"1px solid rgba(139,0,255,0.2)",borderRadius:10,padding:"14px 16px",zIndex:200,fontSize:13,color:"rgba(255,255,255,0.4)"}}>No products found for &quot;{searchQ}&quot;</div>
          )}
        </div>
        <button className="hamburger" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Menu">
          <span/><span/><span/>
        </button>
      </nav>

      <div className="page-wrapper">
        <div className="page-header">
          <div className="section-tag">✦ Our Store</div>
          <h1 className="page-title">All <span>Products</span></h1>
        </div>

        {/* Filters + Sort */}
        <div style={{maxWidth:1300,margin:"0 auto",padding:"0 60px 20px",display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}>
          <div className="filters" style={{margin:0,padding:0,flex:1,minWidth:200}}>
            {["All","Subscription","Device","Bundle"].map(cat => (
              <button key={cat} className={`filter-btn ${filter===cat?"active":""}`} onClick={()=>applyFilter(cat)}>{cat}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input type="number" style={{width:70,background:"rgba(139,0,255,0.08)",border:"1px solid rgba(139,0,255,0.25)",borderRadius:8,padding:"6px 10px",color:"white",fontSize:13,outline:"none"}} placeholder="Min £" value={minPrice} onChange={e=>setMinPrice(e.target.value)} />
            <span style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>—</span>
            <input type="number" style={{width:70,background:"rgba(139,0,255,0.08)",border:"1px solid rgba(139,0,255,0.25)",borderRadius:8,padding:"6px 10px",color:"white",fontSize:13,outline:"none"}} placeholder="Max £" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} />
            <button style={{background:"rgba(139,0,255,0.15)",border:"1px solid rgba(139,0,255,0.3)",color:"var(--purple-glow)",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600}} onClick={applyPrice}>Apply</button>
            <select style={{background:"rgba(13,0,20,0.9)",border:"1px solid rgba(139,0,255,0.25)",borderRadius:8,padding:"6px 10px",color:"white",fontSize:13,outline:"none",cursor:"pointer"}} value={sort} onChange={e=>applySort(e.target.value)}>
              <option value="featured">Featured</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        <div className="products-grid">
          {loading ? (
            <div className="loading">Loading products...</div>
          ) : loadError ? (
            <div className="loading" style={{textAlign:"center",padding:"40px 0"}}>
              <div style={{fontSize:"32px",marginBottom:"12px"}}>⚠️</div>
              <div style={{color:"rgba(255,255,255,0.7)",marginBottom:"8px"}}>Could not load products right now.</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:"13px",marginBottom:"20px"}}>Please try again in a moment or contact us via WhatsApp.</div>
              <button onClick={() => window.location.reload()} style={{background:"linear-gradient(135deg,#4a0080,#8b00ff)",color:"white",border:"none",padding:"10px 24px",borderRadius:"30px",cursor:"pointer",fontSize:"14px"}}>Try Again</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="loading">No products found.</div>
          ) : (
            filtered.map((p) => (
              <div className="product-card" key={p.id} onClick={() => window.location.href=`/products/${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`} style={{cursor:"pointer"}}>
                <div className="product-image">
                  {p.badge && (
                    <span className={`badge ${p.badge==="BEST VALUE"?"gold":p.badge==="NEW"?"new":p.badge==="BUNDLE"?"bundle":""}`}>
                      {p.badge}
                    </span>
                  )}
                  {p.image ? (
                    <img src={p.image} alt={p.name} loading="lazy" />
                  ) : (
                    <div className="image-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Product Image</span>
                    </div>
                  )}
                </div>
                <div className="product-info">
                  <div className="product-name">{p.name}</div>
                  <div className="product-desc">{p.description}</div>
                  <div className="product-footer">
                    <div className="product-price">£{Number(p.price).toFixed(2)}</div>
                    <button
                      className={`add-btn ${added===p.id?"added":""}`}
                      onClick={e=>{e.stopPropagation();handleAddToCart(p);}}
                    >
                      {added===p.id?"✓ Added!":"Add to Cart"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <footer>
          <div className="footer-logo">FIRESTICK4UK</div>
          <ul className="footer-links">
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms">Terms & Conditions</a></li>
            <li><a href="/refund-policy">Refund Policy</a></li>
            <li><a href="/faq">FAQ</a></li>
          </ul>
          <div className="footer-copy">© 2026 Firestick4UK. All rights reserved.</div>
        </footer>
      </div>

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
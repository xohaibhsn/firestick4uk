"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState } from "react";
import { useCart } from "./lib/cartContext";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  badge: string | null;
  image: string | null;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { addToCart, cart } = useCart();

  const handleSearch = () => {
    const q = searchTerm.trim();
    if (q) window.location.href = `/products?q=${encodeURIComponent(q)}`;
  };

  // Section data from DB
  const [sec, setSec] = useState<Record<string,any>>({
    home_hero: { title:"Best Firestick Service in UK", subtitle:"Premium IPTV & Streaming Solutions", button_text:"Shop Now", button_link:"/products", secondary_button_text:"Learn More", secondary_button_link:"/about" },
    home_features: { title:"Why Choose Us", items:[{icon:"⚡",title:"Fast Setup",description:"Ready in minutes"},{icon:"🔒",title:"Secure",description:"Safe & reliable"},{icon:"💬",title:"24/7 Support",description:"Always here for you"},{icon:"🚀",title:"Fast Delivery",description:"Quick & efficient"}] },
    home_testimonials: { title:"What Our Customers Say", items:[{name:"John Smith",rating:5,text:"Amazing service!"},{name:"Sarah Jones",rating:5,text:"Best firestick service in UK!"}] },
    home_newsletter: { title:"Stay in the Loop", subtitle:"Get the latest guides, tips and offers", button_text:"Subscribe" },
  });

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => { setProducts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
    fetch('/api/sections?page=home')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<string,any> = {};
          data.forEach(s => { map[s.key] = s.data; });
          setSec(prev => ({ ...prev, ...map }));
        }
      })
      .catch(() => {});
    return () => {};
  }, []);

  const handleAddToCart = (p: Product) => {
    addToCart({ id: p.id, name: p.name, price: Number(p.price), qty: 1 });
    setAdded(p.id);
    setTimeout(() => setAdded(null), 1500);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        :root { --purple:#5B21B6; --purple-dark:#4C1D95; --black:#1A1A1A; --text:#111111; --border:#E5E5E5; --gray:#F5F5F5; --gray-text:#666666; }
        body { background:#FFFFFF; color:#111111; font-family:'Raleway',sans-serif; overflow-x:hidden; }
        nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px; display:flex; align-items:center; justify-content:space-between; background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); transition:all 0.3s; }
        .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900; color:#111111; text-decoration:none; letter-spacing:2px; }
        .nav-links { display:flex; gap:36px; list-style:none; }
        .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.2s; }
        .nav-links a:hover { color:#5B21B6; }
        .nav-cta { background:#5B21B6 !important; color:#FFFFFF !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
        .nav-cta:hover { background:#1A1A1A !important; }
        .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
        .hamburger span { display:block; width:25px; height:2px; background:#111111; border-radius:2px; }
        .page-wrapper { position:relative; z-index:1; padding-top:80px; background:#FFFFFF; }
        /* HERO */
        .products-header { max-width:1300px; margin:0 auto; padding:50px 60px 28px; display:flex; justify-content:space-between; align-items:flex-end; }
        .products-header-left {}
        .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:10px; display:block; font-weight:600; }
        .section-title { font-family:'Cinzel',serif; font-size:clamp(22px,3vw,36px); font-weight:700; color:#111111; }
        .section-title span { color:#5B21B6; }
        .view-all-link { font-size:13px; font-weight:600; color:#5B21B6; text-decoration:none; border:1px solid #5B21B6; padding:8px 20px; border-radius:8px; transition:all 0.2s; white-space:nowrap; }
        .view-all-link:hover { background:#5B21B6; color:#FFFFFF; }
        .search-wrap { max-width:1300px; margin:0 auto; padding:0 60px 28px; }
        .search-bar { display:flex; align-items:center; gap:10px; background:#FFFFFF; border:2px solid #E5E5E5; border-radius:50px; padding:6px 6px 6px 24px; transition:border-color 0.2s; }
        .search-bar:focus-within { border-color:#5B21B6; }
        .search-input { flex:1; border:none; outline:none; font-size:16px; color:#111111; background:transparent; font-family:'Raleway',sans-serif; padding:8px 0; }
        .search-input::placeholder { color:#AAAAAA; }
        .search-btn { background:#5B21B6; color:#FFFFFF; border:none; border-radius:50px; padding:12px 28px; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; font-family:'Raleway',sans-serif; }
        .search-btn:hover { background:#1A1A1A; }
        .products-grid { max-width:1300px; margin:0 auto; padding:0 60px 20px; display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:22px; }
        .products-grid > * { min-width:0; }
        .view-all-wrap { max-width:1300px; margin:0 auto; padding:20px 60px 50px; text-align:center; }
        .view-all-btn { display:inline-block; background:#111111; color:#FFFFFF; padding:14px 40px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none; transition:all 0.2s; }
        .view-all-btn:hover { background:#5B21B6; transform:translateY(-1px); }
        /* HERO — DARK SECTION */
        .hero-outer { background:#111111; }
        .hero { background:transparent; padding:70px 60px 80px; max-width:1300px; margin:0 auto; display:grid; grid-template-columns:1fr 1fr; gap:60px; align-items:center; }
        .hero-content {}
        .hero-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#BF7FFF; margin-bottom:16px; display:block; font-weight:600; }
        .hero-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,52px); font-weight:900; color:#FFFFFF; line-height:1.15; margin-bottom:20px; }
        .hero-title span { color:#BF7FFF; }
        .hero-subtitle { font-size:17px; color:rgba(255,255,255,0.62); line-height:1.8; margin-bottom:36px; max-width:480px; }
        .hero-btns { display:flex; gap:14px; flex-wrap:wrap; }
        .hero-btn-primary { background:#5B21B6; color:#FFFFFF; padding:16px 36px; border-radius:8px; font-size:15px; font-weight:700; text-decoration:none; transition:all 0.2s; display:inline-block; letter-spacing:0.5px; }
        .hero-btn-primary:hover { background:#7C3AED; transform:translateY(-2px); box-shadow:0 6px 20px rgba(91,33,182,0.5); }
        .hero-btn-secondary { background:transparent; color:#FFFFFF; padding:16px 36px; border-radius:8px; font-size:15px; font-weight:600; text-decoration:none; transition:all 0.2s; display:inline-block; border:2px solid rgba(255,255,255,0.35); }
        .hero-btn-secondary:hover { background:rgba(255,255,255,0.08); border-color:#FFFFFF; transform:translateY(-2px); }
        .hero-visual { background:linear-gradient(135deg,#2D1B69,#1A0A3E); border-radius:24px; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center; font-size:80px; border:1px solid rgba(139,0,255,0.3); }
        .hero-stats { display:flex; gap:32px; margin-top:40px; padding-top:32px; border-top:1px solid rgba(255,255,255,0.1); }
        .stat-item {}
        .stat-num { font-family:'Cinzel',serif; font-size:28px; font-weight:900; color:#FFFFFF; display:block; }
        .stat-label { font-size:12px; color:rgba(255,255,255,0.45); letter-spacing:1px; text-transform:uppercase; }
        /* FEATURES — LIGHT SECTION */
        .features-outer { background:#F5F5F5; }
        .product-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; transition:all 0.3s; cursor:pointer; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.06); min-width:0; }
        .product-card:hover { transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,0.12); border-color:#5B21B6; }
        .product-image { width:100%; aspect-ratio:1/1; background:#F5F5F5; border-bottom:1px solid #E5E5E5; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
        .product-image img { width:100%; height:100%; object-fit:cover; }
        .image-placeholder { display:flex; flex-direction:column; align-items:center; gap:10px; color:#CCCCCC; }
        .image-placeholder svg { width:48px; height:48px; opacity:0.4; }
        .image-placeholder span { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#AAAAAA; }
        .badge { position:absolute; top:10px; right:10px; z-index:2; background:#5B21B6; color:#FFFFFF; font-size:10px; font-weight:700; padding:4px 10px; border-radius:20px; }
        .badge.gold { background:#1A1A1A; color:#FFFFFF; }
        .badge.new { background:#16A34A; color:#FFFFFF; }
        .badge.bundle { background:#EA580C; color:#FFFFFF; }
        .product-info { padding:16px 18px; }
        .product-name { font-family:'Cinzel',serif; font-size:15px; font-weight:700; color:#111111; margin-bottom:6px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word; }
        .product-desc { font-size:13px; color:#666666; line-height:1.6; margin-bottom:14px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .product-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .product-price { font-size:18px; font-weight:700; color:#111111; font-family:'Cinzel',serif; white-space:nowrap; }
        .add-btn { background:#5B21B6; color:#FFFFFF; border:none; padding:9px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
        .add-btn:hover { background:#1A1A1A; transform:translateY(-1px); }
        .add-btn.added { background:#16A34A; }
        .loading { text-align:center; padding:60px; color:#666666; font-size:18px; }
        .features-section { max-width:1300px; margin:0 auto; padding:60px 60px 70px; background:transparent; }
        .features-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-top:40px; }
        .feature-item { padding:28px 24px; border-radius:12px; background:#FFFFFF; border:1px solid #E5E5E5; transition:all 0.3s; }
        .feature-item:hover { box-shadow:0 4px 16px rgba(0,0,0,0.08); transform:translateY(-2px); border-color:#5B21B6; }
        .feature-icon { font-size:28px; margin-bottom:14px; display:block; }
        .feature-title { font-weight:700; font-size:15px; color:#111111; margin-bottom:7px; }
        .feature-desc { font-size:13px; color:#666666; line-height:1.6; }
        .cta-section { margin:0 60px 80px; padding:70px 60px; border-radius:16px; background:#111111; text-align:center; }
        .cta-title { font-family:'Cinzel',serif; font-size:clamp(22px,3vw,38px); font-weight:700; color:#FFFFFF; margin-bottom:14px; }
        .cta-sub { color:rgba(255,255,255,0.7); font-size:15px; margin-bottom:36px; }
        .cta-btns { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
        .btn-primary { background:#5B21B6; color:#FFFFFF; padding:14px 36px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none; transition:all 0.2s; display:inline-block; }
        .btn-primary:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 12px rgba(91,33,182,0.4); }
        .btn-secondary { background:transparent; color:#FFFFFF; padding:14px 36px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none; border:2px solid rgba(255,255,255,0.5); transition:all 0.2s; }
        .btn-secondary:hover { background:rgba(255,255,255,0.1); border-color:#FFFFFF; }
        footer { background:#111111; padding:50px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
        .footer-logo { font-family:'Cinzel',serif; font-size:17px; font-weight:900; color:#FFFFFF; }
        .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; }
        .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.2s; }
        .footer-links a:hover { color:#FFFFFF; }
        .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }
        .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
        .whatsapp-btn:hover { transform:scale(1.1); }
        @media(max-width:768px){
          nav{padding:16px 24px;}
          .nav-links{display:none;}
          .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
          .nav-links.open a{font-size:18px;color:#111111;}
          .hamburger{display:flex;}
          .products-header{padding:28px 16px 16px;flex-direction:column;align-items:flex-start;gap:12px;}
          .search-wrap{padding:0 16px 16px;}
          .search-bar{padding:5px 5px 5px 16px;}
          .search-input{font-size:14px;}
          .search-btn{padding:10px 16px;font-size:13px;}
          .products-grid{grid-template-columns:repeat(2,1fr);gap:12px;padding:0 12px 16px;}
          .product-info{padding:10px 12px;}
          .product-name{font-size:12px;}
          .product-desc{font-size:11px;margin-bottom:8px;}
          .product-price{font-size:14px;}
          .add-btn{padding:7px 10px;font-size:11px;}
          .badge{font-size:9px;padding:3px 7px;top:6px;right:6px;}
          .view-all-wrap{padding:14px 16px 36px;}
          .hero{grid-template-columns:1fr;padding:48px 24px 52px;gap:32px;}
          .hero-visual{display:none;}
          .hero-stats{gap:20px;}
          .features-section{padding:40px 24px 50px;}
          .features-section{padding:40px 24px 50px;}
          .cta-section{margin:0 24px 60px;padding:50px 24px;}
          footer{padding:36px 24px;flex-direction:column;text-align:center;}
        }
      `}</style>

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
        <button className="hamburger" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Menu">
          <span/><span/><span/>
        </button>
      </nav>

      <div className="page-wrapper">
        {/* PRODUCTS GRID — first thing after navbar */}
        <div className="products-header">
          <div className="products-header-left">
            <span className="section-tag">✦ Our Store</span>
            <h2 className="section-title">Featured <span>Products</span></h2>
          </div>
          <a href="/products" className="view-all-link">View All Products →</a>
        </div>

        <div className="search-wrap">
          <div className="search-bar">
            <input
              className="search-input"
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
            <button className="search-btn" onClick={handleSearch}>🔍 Search</button>
          </div>
        </div>

        <div className="products-grid">
          {loading ? (
            <div className="loading">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="loading">No products found.</div>
          ) : (
            products.slice(0, 8).map((p) => (
              <div className="product-card" key={p.id}>
                <div className="product-image">
                  {p.badge && (
                    <span className={`badge ${p.badge==="BEST VALUE"?"gold":p.badge==="NEW"?"new":p.badge==="BUNDLE"?"bundle":""}`}>
                      {p.badge}
                    </span>
                  )}
                  {p.image ? (
                    <img src={p.image} alt={p.name} />
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
                      className={`add-btn ${added === p.id ? "added" : ""}`}
                      onClick={() => handleAddToCart(p)}
                    >
                      {added === p.id ? "✓ Added!" : "Add to Cart"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="view-all-wrap">
          <a href="/products" className="view-all-btn">View All Products →</a>
        </div>

        {/* HERO — DARK section */}
        {/* HERO — DARK section */}
        <div className="hero-outer">
          <div className="hero">
            <div className="hero-content">
              <span className="hero-tag">✦ UK&apos;s #1 Firestick Service</span>
              <h1 className="hero-title">
                {sec.home_hero?.title?.split(' ').slice(0,-2).join(' ') || "Best Firestick"}<br/>
                <span>{sec.home_hero?.title?.split(' ').slice(-2).join(' ') || "Service in UK"}</span>
              </h1>
              <p className="hero-subtitle">{sec.home_hero?.subtitle || "Premium IPTV & Streaming Solutions for the whole UK. Fast delivery, easy setup, real support."}</p>
              <div className="hero-btns">
                <a href={sec.home_hero?.button_link||"/products"} className="hero-btn-primary">{sec.home_hero?.button_text||"Shop Now"} →</a>
                <a href={sec.home_hero?.secondary_button_link||"/about"} className="hero-btn-secondary">{sec.home_hero?.secondary_button_text||"Learn More"}</a>
              </div>
              <div className="hero-stats">
                <div className="stat-item"><span className="stat-num">500+</span><span className="stat-label">Happy Customers</span></div>
                <div className="stat-item"><span className="stat-num">4.9★</span><span className="stat-label">Average Rating</span></div>
                <div className="stat-item"><span className="stat-num">24/7</span><span className="stat-label">Support</span></div>
              </div>
            </div>
            <div className="hero-visual">
            {sec.home_hero?.hero_image
              ? <img src={sec.home_hero.hero_image} alt="Hero" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:24}} />
              : <span style={{fontSize:80}}>📺</span>
            }
          </div>
          </div>
        </div>

        {/* Features + Testimonials — LIGHT section */}
        <div className="features-outer">
          <div className="features-section">
            <div className="section-tag">✦ Why Choose Us</div>
            <h2 className="section-title">{sec.home_features?.title || "Why Choose Us"}</h2>
            <div className="features-grid">
              {(sec.home_features?.items || []).map((f:any,i:number)=>(
                <div className="feature-item" key={i}>
                  <span className="feature-icon">{f.icon}</span>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.description}</div>
                </div>
              ))}
            </div>
          </div>
          {sec.home_testimonials?.items?.length > 0 && (
            <div className="features-section" style={{paddingTop:0}}>
              <h2 className="section-title" style={{marginBottom:32}}>{sec.home_testimonials.title || "What Our Customers Say"}</h2>
              <div className="features-grid">
                {sec.home_testimonials.items.map((t:any,i:number)=>(
                  <div className="feature-item" key={i}>
                    <div style={{fontSize:20,marginBottom:8}}>{"⭐".repeat(t.rating||5)}</div>
                    <div className="feature-desc" style={{marginBottom:10}}>"{t.text}"</div>
                    <div className="feature-title" style={{fontSize:14}}>— {t.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CTA — from DB */}
        <div className="cta-section">
          <h2 className="cta-title">{sec.home_hero?.title || "Best Firestick Service in UK"}</h2>
          <p className="cta-sub">{sec.home_hero?.subtitle || "Premium IPTV & Streaming Solutions"}</p>
          <div className="cta-btns">
            <a href={sec.home_hero?.button_link||"/products"} className="btn-primary">{sec.home_hero?.button_text||"Shop Now"}</a>
            <a href={sec.home_hero?.secondary_button_link||"/about"} className="btn-secondary">{sec.home_hero?.secondary_button_text||"Learn More"}</a>
          </div>
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

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer" title="WhatsApp">
        💬
      </a>
    </>
  );
}
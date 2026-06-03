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

const STARS = Array.from({length:70}).map((_,i) => ({
  left: `${((i * 137.5) % 100).toFixed(2)}%`,
  top: `${((i * 97.3) % 100).toFixed(2)}%`,
  dur: `${2 + (i % 4)}s`,
  op: `${(0.2 + (i % 8) * 0.08).toFixed(2)}`,
  delay: `${(i % 5)}s`
}));

export default function Home() {
  const [scrollY, setScrollY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<number | null>(null);
  const { addToCart, cart } = useCart();

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    fetch('/api/products')
      .then(res => res.json())
      .then(data => { setProducts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
    return () => window.removeEventListener("scroll", handleScroll);
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
        .products-header { max-width:1300px; margin:0 auto; padding:60px 60px 40px; }
        .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; }
        .section-title { font-family:'Cinzel',serif; font-size:clamp(26px,3.5vw,44px); font-weight:700; color:#111111; }
        .section-title span { color:#5B21B6; }
        .products-grid { max-width:1300px; margin:0 auto; padding:0 60px 80px; display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:22px; }
        .product-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; transition:all 0.3s; cursor:pointer; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
        .product-card:hover { transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,0.12); border-color:#5B21B6; }
        .product-image { width:100%; aspect-ratio:1/1; background:#F5F5F5; border-bottom:1px solid #E5E5E5; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
        .product-image img { width:100%; height:100%; object-fit:cover; }
        .image-placeholder { display:flex; flex-direction:column; align-items:center; gap:10px; color:#CCCCCC; }
        .image-placeholder svg { width:48px; height:48px; opacity:0.4; }
        .image-placeholder span { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#AAAAAA; }
        .badge { position:absolute; top:12px; right:12px; z-index:2; background:#5B21B6; color:#FFFFFF; font-size:10px; font-weight:700; padding:4px 12px; border-radius:20px; letter-spacing:1px; }
        .badge.gold { background:#1A1A1A; color:#FFFFFF; }
        .badge.new { background:#16A34A; color:#FFFFFF; }
        .badge.bundle { background:#EA580C; color:#FFFFFF; }
        .product-info { padding:20px; }
        .product-name { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:#111111; margin-bottom:8px; }
        .product-desc { font-size:13px; color:#666666; line-height:1.7; margin-bottom:16px; }
        .product-footer { display:flex; align-items:center; justify-content:space-between; }
        .product-price { font-size:20px; font-weight:700; color:#111111; font-family:'Cinzel',serif; }
        .add-btn { background:#5B21B6; color:#FFFFFF; border:none; padding:10px 20px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .add-btn:hover { background:#1A1A1A; transform:translateY(-1px); }
        .add-btn.added { background:#16A34A; }
        .loading { text-align:center; padding:60px; color:#666666; font-size:18px; }
        .features-section { max-width:1300px; margin:0 auto; padding:70px 60px 80px; border-top:1px solid #E5E5E5; background:#F5F5F5; }
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
          .products-header{padding:40px 24px 24px;}
          .products-grid{padding:0 24px 60px;}
          .features-section{padding:40px 24px 50px;}
          .cta-section{margin:0 24px 60px;padding:50px 24px;}
          footer{padding:36px 24px;flex-direction:column;text-align:center;}
        }
      `}</style>

      <div className="bg-animated">
        {STARS.map((s,i)=>(
          <div key={i} className="star" style={{
            left: s.left, top: s.top,
            "--dur": s.dur, "--op": s.op,
            animationDelay: s.delay
          } as React.CSSProperties}/>
        ))}
      </div>

      <nav className={scrollY > 40 ? "scrolled" : ""}>
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
        <div className="products-header">
          <div className="section-tag">✦ Our Store</div>
          <h2 className="section-title">Browse Our <span>Products</span></h2>
        </div>

        <div className="products-grid">
          {loading ? (
            <div className="loading">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="loading">No products found.</div>
          ) : (
            products.map((p) => (
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

        <div className="features-section">
          <div className="section-tag">✦ Why Choose Us</div>
          <h2 className="section-title">Built For <span>You</span></h2>
          <div className="features-grid">
            {[
              {icon:"⚡",title:"Fast Activation",desc:"Subscriptions activated within hours of payment confirmation."},
              {icon:"🔒",title:"Secure Payment",desc:"Pay via UK bank transfer. Upload receipt and we verify manually."},
              {icon:"🚚",title:"Fast Delivery",desc:"Devices delivered across the UK within 2-3 working days."},
              {icon:"📞",title:"WhatsApp Support",desc:"Real human support via WhatsApp. No bots, no delays."},
              {icon:"📱",title:"Works Everywhere",desc:"Compatible with Smart TVs, phones, tablets and more."},
              {icon:"🎯",title:"Order Tracking",desc:"Track your order status in real time from our website."},
            ].map((f,i)=>(
              <div className="feature-item" key={i}>
                <span className="feature-icon">{f.icon}</span>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="cta-section">
          <h2 className="cta-title">Ready to Order?</h2>
          <p className="cta-sub">Fast delivery. Easy setup. Real support.</p>
          <div className="cta-btns">
            <a href="/cart" className="btn-primary">View Cart</a>
            <a href="/contact" className="btn-secondary">Contact Us</a>
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
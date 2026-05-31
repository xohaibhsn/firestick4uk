"use client";
import { useEffect, useState } from "react";

const products = [
  { id: 1, name: "B1G 1 Month Plan", desc: "Perfect for trying out our premium subscription service. Instant activation.", price: "£9.99", badge: null },
  { id: 2, name: "B1G 6 Month Plan", desc: "Great value 6-month subscription plan. Save more, enjoy more.", price: "£49.99", badge: "POPULAR" },
  { id: 3, name: "B1G 1 Year Plan", desc: "Best value annual subscription plan. Maximum savings guaranteed.", price: "£79.99", badge: "BEST VALUE" },
  { id: 4, name: "Firestick 4K", desc: "Amazon Firestick 4K — pre-configured and ready to use out of the box.", price: "£39.99", badge: null },
  { id: 5, name: "Firestick 4K Max", desc: "The most powerful Firestick available. Ultra-fast Wi-Fi 6 support.", price: "£54.99", badge: "NEW" },
  { id: 6, name: "Android Box Pro", desc: "High-performance Android TV box for the ultimate 4K home experience.", price: "£49.99", badge: null },
  { id: 7, name: "Android Box Ultra", desc: "Top-of-the-line Android box with 4GB RAM and 32GB storage.", price: "£69.99", badge: null },
  { id: 8, name: "Starter Bundle", desc: "Firestick 4K + 1 Month Plan — everything you need to get started today.", price: "£44.99", badge: "BUNDLE" },
];

export default function Home() {
  const [scrollY, setScrollY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --purple-deep: #0d0010;
          --purple-mid: #4a0080;
          --purple-bright: #8b00ff;
          --purple-glow: #bf5fff;
          --purple-light: #e0b3ff;
          --gold: #ffd700;
        }
        body { background: var(--purple-deep); color: #fff; font-family: 'Raleway', sans-serif; overflow-x: hidden; }
        .bg-animated {
          position: fixed; inset: 0; z-index: 0;
          background: radial-gradient(ellipse at 20% 20%, #2d0050 0%, transparent 50%),
                      radial-gradient(ellipse at 80% 80%, #1a0035 0%, transparent 50%), #0a0010;
          overflow: hidden;
        }
        .bg-animated::before {
          content: ''; position: absolute; width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(139,0,255,0.12) 0%, transparent 70%);
          top: -100px; left: -100px; animation: float1 8s ease-in-out infinite;
        }
        .bg-animated::after {
          content: ''; position: absolute; width: 400px; height: 400px; border-radius: 50%;
          background: radial-gradient(circle, rgba(191,95,255,0.08) 0%, transparent 70%);
          bottom: -50px; right: -50px; animation: float2 10s ease-in-out infinite;
        }
        @keyframes float1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(80px,60px) scale(1.2)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-60px,-40px) scale(1.15)} }
        .star { position:absolute; width:2px; height:2px; background:white; border-radius:50%; animation:twinkle var(--dur) ease-in-out infinite; opacity:0; }
        @keyframes twinkle { 0%,100%{opacity:0} 50%{opacity:var(--op)} }

        nav {
          position: fixed; top:0; left:0; right:0; z-index:100;
          padding: 18px 60px; display: flex; align-items: center; justify-content: space-between; transition: all 0.3s;
        }
        nav.scrolled { background: rgba(13,0,16,0.96); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(139,0,255,0.2); }
        .nav-logo {
          font-family: 'Cinzel', serif; font-size: 20px; font-weight: 900;
          background: linear-gradient(135deg, var(--purple-glow), var(--gold));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          text-decoration: none; letter-spacing: 2px;
        }
        .nav-links { display:flex; gap:36px; list-style:none; }
        .nav-links a { color:rgba(255,255,255,0.8); text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; position:relative; }
        .nav-links a::after { content:''; position:absolute; bottom:-4px; left:0; right:0; height:1px; background:var(--purple-glow); transform:scaleX(0); transition:transform 0.3s; }
        .nav-links a:hover { color:var(--purple-glow); }
        .nav-links a:hover::after { transform:scaleX(1); }
        .nav-cta { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)) !important; color:white !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; box-shadow:0 0 20px rgba(139,0,255,0.4); }
        .nav-cta::after { display:none !important; }
        .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
        .hamburger span { display:block; width:25px; height:2px; background:var(--purple-glow); }

        .page-wrapper { position:relative; z-index:1; padding-top:100px; }

        .products-header { max-width:1300px; margin:0 auto; padding:60px 60px 40px; }
        .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
        .section-title { font-family:'Cinzel',serif; font-size:clamp(26px,3.5vw,44px); font-weight:700; color:white; }
        .section-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }

        .products-grid {
          max-width:1300px; margin:0 auto; padding:0 60px 80px;
          display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:22px;
        }

        .product-card {
          background:linear-gradient(135deg,rgba(74,0,128,0.25),rgba(26,0,37,0.85));
          border:1px solid rgba(139,0,255,0.2); border-radius:20px;
          overflow:hidden; transition:all 0.4s; cursor:pointer; position:relative;
          animation:fadeInUp 0.6s ease forwards; opacity:0;
        }
        .product-card:nth-child(1){animation-delay:0.05s} .product-card:nth-child(2){animation-delay:0.1s}
        .product-card:nth-child(3){animation-delay:0.15s} .product-card:nth-child(4){animation-delay:0.2s}
        .product-card:nth-child(5){animation-delay:0.25s} .product-card:nth-child(6){animation-delay:0.3s}
        .product-card:nth-child(7){animation-delay:0.35s} .product-card:nth-child(8){animation-delay:0.4s}
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .product-card:hover { transform:translateY(-8px); border-color:rgba(139,0,255,0.6); box-shadow:0 20px 60px rgba(139,0,255,0.25); }

        /* SQUARE IMAGE PLACEHOLDER */
        .product-image {
          width:100%; aspect-ratio:1/1;
          background:linear-gradient(135deg,rgba(74,0,128,0.4),rgba(139,0,255,0.15));
          border-bottom:1px solid rgba(139,0,255,0.2);
          display:flex; align-items:center; justify-content:center;
          position:relative; overflow:hidden;
        }
        .product-image::before {
          content:''; position:absolute; inset:0;
          background:repeating-linear-gradient(45deg, rgba(139,0,255,0.03) 0px, rgba(139,0,255,0.03) 1px, transparent 1px, transparent 20px);
        }
        .product-image img {
          width:100%; height:100%; object-fit:cover; display:block;
        }
        .image-placeholder {
          display:flex; flex-direction:column; align-items:center; gap:10px;
          color:rgba(191,95,255,0.4); position:relative; z-index:1;
        }
        .image-placeholder svg { width:48px; height:48px; opacity:0.5; }
        .image-placeholder span { font-size:11px; letter-spacing:2px; text-transform:uppercase; }

        .badge { position:absolute; top:12px; right:12px; z-index:2;
          background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
          color:white; font-size:10px; font-weight:700; padding:4px 12px; border-radius:20px; letter-spacing:1px; }
        .badge.gold { background:linear-gradient(135deg,#b8860b,var(--gold)); color:#000; }
        .badge.new { background:linear-gradient(135deg,#006400,#00c800); }
        .badge.bundle { background:linear-gradient(135deg,#8b4500,#ff8c00); }

        .product-info { padding:22px; }
        .product-name { font-family:'Cinzel',serif; font-size:17px; font-weight:700; color:white; margin-bottom:8px; }
        .product-desc { font-size:13px; color:rgba(255,255,255,0.5); line-height:1.7; margin-bottom:18px; }
        .product-footer { display:flex; align-items:center; justify-content:space-between; }
        .product-price { font-size:22px; font-weight:700; color:var(--purple-glow); font-family:'Cinzel',serif; }
        .add-btn {
          background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
          color:white; border:none; padding:10px 20px; border-radius:30px;
          font-size:13px; font-weight:600; cursor:pointer; transition:all 0.3s;
        }
        .add-btn:hover { box-shadow:0 0 25px rgba(139,0,255,0.6); transform:scale(1.05); }

        .features-section { max-width:1300px; margin:0 auto; padding:70px 60px 80px; border-top:1px solid rgba(139,0,255,0.1); }
        .features-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:18px; margin-top:40px; }
        .feature-item { padding:28px 24px; border-radius:16px; background:rgba(139,0,255,0.06); border:1px solid rgba(139,0,255,0.12); transition:all 0.3s; }
        .feature-item:hover { background:rgba(139,0,255,0.12); border-color:rgba(139,0,255,0.3); transform:translateY(-4px); }
        .feature-icon { font-size:28px; margin-bottom:14px; display:block; }
        .feature-title { font-weight:600; font-size:15px; color:white; margin-bottom:7px; }
        .feature-desc { font-size:13px; color:rgba(255,255,255,0.45); line-height:1.6; }

        .cta-section {
          margin:0 60px 80px; padding:70px 60px; border-radius:28px;
          background:linear-gradient(135deg,rgba(74,0,128,0.5),rgba(139,0,255,0.2));
          border:1px solid rgba(139,0,255,0.3); text-align:center; position:relative; overflow:hidden;
        }
        .cta-section::before { content:''; position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:radial-gradient(ellipse at center,rgba(139,0,255,0.08) 0%,transparent 60%); animation:rotate 15s linear infinite; }
        @keyframes rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .cta-title { font-family:'Cinzel',serif; font-size:clamp(22px,3vw,38px); font-weight:700; color:white; margin-bottom:14px; position:relative; z-index:1; }
        .cta-sub { color:rgba(255,255,255,0.6); font-size:15px; margin-bottom:36px; position:relative; z-index:1; }
        .cta-btns { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; position:relative; z-index:1; }
        .btn-primary { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); color:white; padding:15px 40px; border-radius:50px; font-size:14px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; text-decoration:none; box-shadow:0 0 25px rgba(139,0,255,0.4); transition:all 0.3s; }
        .btn-primary:hover { box-shadow:0 0 45px rgba(139,0,255,0.7); transform:translateY(-3px); }
        .btn-secondary { background:transparent; color:var(--purple-light); padding:15px 40px; border-radius:50px; font-size:14px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; text-decoration:none; border:1px solid rgba(139,0,255,0.5); transition:all 0.3s; }
        .btn-secondary:hover { background:rgba(139,0,255,0.15); transform:translateY(-3px); }

        footer { position:relative; z-index:1; padding:50px 60px; border-top:1px solid rgba(139,0,255,0.15); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
        .footer-logo { font-family:'Cinzel',serif; font-size:17px; font-weight:900; background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; }
        .footer-links a { color:rgba(255,255,255,0.4); text-decoration:none; font-size:13px; transition:color 0.3s; }
        .footer-links a:hover { color:var(--purple-glow); }
        .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }

        .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; animation:waPulse 3s ease-in-out infinite; }
        .whatsapp-btn:hover { transform:scale(1.15); }
        @keyframes waPulse { 0%,100%{box-shadow:0 4px 25px rgba(37,211,102,0.5)} 50%{box-shadow:0 4px 40px rgba(37,211,102,0.8),0 0 0 10px rgba(37,211,102,0.1)} }

        @media(max-width:768px){
          nav{padding:16px 24px;}
          .nav-links{display:none;}
          .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(13,0,16,0.98);align-items:center;justify-content:center;gap:28px;z-index:99;}
          .nav-links.open a{font-size:18px;}
          .hamburger{display:flex;}
          .products-header{padding:40px 24px 24px;}
          .products-grid{padding:0 24px 60px;}
          .features-section{padding:50px 24px 60px;}
          .cta-section{margin:0 24px 60px;padding:50px 24px;}
          footer{padding:36px 24px;flex-direction:column;text-align:center;}
        }
      `}</style>

      <div className="bg-animated">
        {Array.from({length:70}).map((_,i)=>(
          <div key={i} className="star" style={{
            left:`${Math.random()*100}%`, top:`${Math.random()*100}%`,
            "--dur":`${2+Math.random()*4}s`, "--op":`${0.2+Math.random()*0.6}`,
            animationDelay:`${Math.random()*5}s`
          } as React.CSSProperties}/>
        ))}
      </div>

      <nav className={scrollY > 40 ? "scrolled" : ""}>
        <a href="/" className="nav-logo">FIRESTICK44UK</a>
        <ul className={`nav-links ${menuOpen?"open":""}`}>
          <li><a href="/" onClick={()=>setMenuOpen(false)}>Home</a></li>
          <li><a href="/products" onClick={()=>setMenuOpen(false)}>Products</a></li>
          <li><a href="/order-tracking" onClick={()=>setMenuOpen(false)}>Track Order</a></li>
          <li><a href="/blog" onClick={()=>setMenuOpen(false)}>Blog</a></li>
          <li><a href="/contact" onClick={()=>setMenuOpen(false)}>Contact</a></li>
          <li><a href="/products" className="nav-cta" onClick={()=>setMenuOpen(false)}>Shop Now</a></li>
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
          {products.map((p)=>(
            <div className="product-card" key={p.id}>
              {/* SQUARE IMAGE */}
              <div className="product-image">
                {p.badge && (
                  <span className={`badge ${p.badge==="BEST VALUE"?"gold":p.badge==="NEW"?"new":p.badge==="BUNDLE"?"bundle":""}`}>
                    {p.badge}
                  </span>
                )}
                <div className="image-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>Product Image</span>
                </div>
              </div>
              {/* INFO */}
              <div className="product-info">
                <div className="product-name">{p.name}</div>
                <div className="product-desc">{p.desc}</div>
                <div className="product-footer">
                  <div className="product-price">{p.price}</div>
                  <button className="add-btn">Add to Cart</button>
                </div>
              </div>
            </div>
          ))}
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
            <a href="/products" className="btn-primary">View All Products</a>
            <a href="/contact" className="btn-secondary">Contact Us</a>
          </div>
        </div>

        <footer>
          <div className="footer-logo">FIRESTICK44UK</div>
          <ul className="footer-links">
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms">Terms & Conditions</a></li>
            <li><a href="/refund-policy">Refund Policy</a></li>
            <li><a href="/faq">FAQ</a></li>
          </ul>
          <div className="footer-copy">© 2026 Firestick44UK. All rights reserved.</div>
        </footer>
      </div>

      <a href="https://wa.me/447000000000" className="whatsapp-btn" target="_blank" rel="noopener noreferrer" title="WhatsApp">
        💬
      </a>
    </>
  );
}
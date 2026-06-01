"use client";
import { useState } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --purple-deep:#0d0010; --purple-mid:#4a0080; --purple-bright:#8b00ff; --purple-glow:#bf5fff; --purple-light:#e0b3ff; --gold:#ffd700; }
  body { background:var(--purple-deep); color:#fff; font-family:'Raleway',sans-serif; overflow-x:hidden; }
  .bg-fixed { position:fixed; inset:0; z-index:0;
    background:radial-gradient(ellipse at 20% 20%,#2d0050 0%,transparent 50%),
               radial-gradient(ellipse at 80% 80%,#1a0035 0%,transparent 50%),#0a0010; }

  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:rgba(13,0,16,0.96); backdrop-filter:blur(20px);
    border-bottom:1px solid rgba(139,0,255,0.2); }
  .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:rgba(255,255,255,0.8); text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; }
  .nav-links a:hover { color:var(--purple-glow); }
  .nav-cta { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)) !important; color:white !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:var(--purple-glow); }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(13,0,16,0.98);align-items:center;justify-content:center;gap:28px;z-index:99;}
    .hamburger{display:flex;}
  }

  .page-wrapper { position:relative; z-index:1; padding-top:100px; min-height:100vh; }

  /* HERO */
  .about-hero { max-width:900px; margin:0 auto; padding:60px 24px 50px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(30px,5vw,56px); font-weight:900; color:white; margin-bottom:20px; line-height:1.1; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .hero-text { font-size:clamp(15px,2vw,18px); color:rgba(255,255,255,0.6); line-height:1.8; max-width:700px; margin:0 auto 40px; }

  /* STATS */
  .stats-bar { max-width:900px; margin:0 auto; padding:0 24px 70px;
    display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:20px; }
  .stat-card { background:linear-gradient(135deg,rgba(74,0,128,0.25),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:18px; padding:28px 20px; text-align:center;
    transition:all 0.3s; }
  .stat-card:hover { transform:translateY(-5px); border-color:rgba(139,0,255,0.5); box-shadow:0 15px 40px rgba(139,0,255,0.2); }
  .stat-number { font-family:'Cinzel',serif; font-size:36px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .stat-label { font-size:12px; color:rgba(255,255,255,0.45); letter-spacing:2px; text-transform:uppercase; margin-top:6px; }

  /* STORY */
  .story-section { max-width:1100px; margin:0 auto; padding:0 24px 80px;
    display:grid; grid-template-columns:1fr 1fr; gap:50px; align-items:center; }
  .story-text .section-tag { text-align:left; }
  .story-title { font-family:'Cinzel',serif; font-size:clamp(24px,3vw,38px); font-weight:700; color:white; margin-bottom:20px; }
  .story-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .story-para { font-size:15px; color:rgba(255,255,255,0.55); line-height:1.9; margin-bottom:16px; }
  .story-visual { background:linear-gradient(135deg,rgba(74,0,128,0.3),rgba(139,0,255,0.15));
    border:1px solid rgba(139,0,255,0.25); border-radius:24px; padding:40px;
    display:flex; flex-direction:column; gap:16px; }
  .story-point { display:flex; gap:14px; align-items:flex-start; }
  .point-icon { font-size:24px; flex-shrink:0; margin-top:2px; }
  .point-text h4 { font-size:15px; font-weight:600; color:white; margin-bottom:4px; }
  .point-text p { font-size:13px; color:rgba(255,255,255,0.45); line-height:1.6; }

  /* VALUES */
  .values-section { max-width:1100px; margin:0 auto; padding:0 24px 80px; }
  .section-header { margin-bottom:40px; }
  .section-title { font-family:'Cinzel',serif; font-size:clamp(24px,3vw,38px); font-weight:700; color:white; }
  .section-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .values-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:20px; }
  .value-card { background:linear-gradient(135deg,rgba(74,0,128,0.15),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.15); border-radius:20px; padding:32px 26px; transition:all 0.3s; }
  .value-card:hover { transform:translateY(-6px); border-color:rgba(139,0,255,0.45); box-shadow:0 16px 40px rgba(139,0,255,0.2); }
  .value-icon { font-size:36px; margin-bottom:16px; display:block; }
  .value-title { font-family:'Cinzel',serif; font-size:17px; font-weight:700; color:white; margin-bottom:10px; }
  .value-desc { font-size:14px; color:rgba(255,255,255,0.45); line-height:1.7; }

  /* TIMELINE */
  .timeline-section { max-width:800px; margin:0 auto; padding:0 24px 80px; }
  .timeline { display:flex; flex-direction:column; gap:0; margin-top:40px; }
  .timeline-item { display:flex; gap:20px; }
  .tl-left { display:flex; flex-direction:column; align-items:center; width:40px; flex-shrink:0; }
  .tl-dot { width:40px; height:40px; border-radius:50%; flex-shrink:0;
    background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    display:flex; align-items:center; justify-content:center; font-size:16px;
    box-shadow:0 0 15px rgba(139,0,255,0.4); }
  .tl-line { width:2px; flex:1; min-height:20px; background:rgba(139,0,255,0.2); margin:4px 0; }
  .tl-content { padding:4px 0 32px; flex:1; }
  .tl-year { font-size:11px; letter-spacing:3px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:6px; }
  .tl-title { font-family:'Cinzel',serif; font-size:17px; font-weight:700; color:white; margin-bottom:6px; }
  .tl-desc { font-size:14px; color:rgba(255,255,255,0.45); line-height:1.6; }

  /* CTA */
  .cta-section { max-width:1100px; margin:0 auto 80px; padding:0 24px; }
  .cta-box { background:linear-gradient(135deg,rgba(74,0,128,0.4),rgba(139,0,255,0.2));
    border:1px solid rgba(139,0,255,0.3); border-radius:28px; padding:70px 60px;
    text-align:center; position:relative; overflow:hidden; }
  .cta-box::before { content:''; position:absolute; top:-50%; left:-50%; width:200%; height:200%;
    background:radial-gradient(ellipse at center,rgba(139,0,255,0.08) 0%,transparent 60%);
    animation:rotate 15s linear infinite; }
  @keyframes rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .cta-title { font-family:'Cinzel',serif; font-size:clamp(22px,3vw,36px); font-weight:700; color:white; margin-bottom:14px; position:relative; z-index:1; }
  .cta-sub { color:rgba(255,255,255,0.55); font-size:15px; margin-bottom:36px; position:relative; z-index:1; }
  .cta-btns { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; position:relative; z-index:1; }
  .btn-primary { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; padding:15px 40px; border-radius:50px; font-size:14px; font-weight:600;
    letter-spacing:1.5px; text-transform:uppercase; text-decoration:none;
    box-shadow:0 0 25px rgba(139,0,255,0.4); transition:all 0.3s; }
  .btn-primary:hover { box-shadow:0 0 45px rgba(139,0,255,0.7); transform:translateY(-3px); }
  .btn-secondary { background:transparent; color:var(--purple-light); padding:15px 40px;
    border-radius:50px; font-size:14px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase;
    text-decoration:none; border:1px solid rgba(139,0,255,0.5); transition:all 0.3s; }
  .btn-secondary:hover { background:rgba(139,0,255,0.15); transform:translateY(-3px); }

  footer { position:relative; z-index:1; padding:40px 60px;
    border-top:1px solid rgba(139,0,255,0.15);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .footer-links { display:flex; gap:20px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.4); text-decoration:none; font-size:13px; transition:color 0.3s; }
  .footer-links a:hover { color:var(--purple-glow); }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s;
    animation:waPulse 3s ease-in-out infinite; }
  .whatsapp-btn:hover { transform:scale(1.15); }
  @keyframes waPulse { 0%,100%{box-shadow:0 4px 25px rgba(37,211,102,0.5)} 50%{box-shadow:0 4px 40px rgba(37,211,102,0.8),0 0 0 10px rgba(37,211,102,0.1)} }

  @media(max-width:768px){
    .story-section{grid-template-columns:1fr; gap:30px;}
    .cta-box{padding:50px 24px;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
  }
`;

export default function AboutPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <style>{styles}</style>
      <div className="bg-fixed" />

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className={`nav-links ${menuOpen ? "open" : ""}`}>
          <li><a href="/" onClick={() => setMenuOpen(false)}>Home</a></li>
          <li><a href="/products" onClick={() => setMenuOpen(false)}>Products</a></li>
          <li><a href="/order-tracking" onClick={() => setMenuOpen(false)}>Track Order</a></li>
          <li><a href="/blog" onClick={() => setMenuOpen(false)}>Blog</a></li>
          <li><a href="/contact" onClick={() => setMenuOpen(false)}>Contact</a></li>
          <li><a href="/" className="nav-cta" onClick={() => setMenuOpen(false)}>Shop Now</a></li>
        </ul>
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </nav>

      <div className="page-wrapper">

        {/* HERO */}
        <div className="about-hero">
          <div className="section-tag">✦ Our Story</div>
          <h1 className="page-title">The UK&apos;s Most Trusted<br /><span>Tech Store</span></h1>
          <p className="hero-text">
            We started Firestick44UK with one goal — to make premium streaming devices and subscription plans accessible, affordable, and hassle-free for everyone in the UK.
          </p>
        </div>

        {/* STATS */}
        <div className="stats-bar">
          {[
            { number: "500+", label: "Happy Customers" },
            { number: "99%", label: "Satisfaction Rate" },
            { number: "24/7", label: "Support Available" },
            { number: "2+", label: "Years in Business" },
            { number: "1000+", label: "Orders Fulfilled" },
          ].map((s, i) => (
            <div className="stat-card" key={i}>
              <div className="stat-number">{s.number}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* STORY */}
        <div className="story-section">
          <div className="story-text">
            <div className="section-tag">✦ Who We Are</div>
            <h2 className="story-title">Built on <span>Trust</span></h2>
            <p className="story-para">
              Firestick44UK was founded by a team of tech enthusiasts who were frustrated with overpriced, complicated streaming setups. We wanted something simple — great devices, fair prices, and real human support.
            </p>
            <p className="story-para">
              Today, we serve hundreds of customers across the United Kingdom, offering carefully selected Firestick devices, powerful Android boxes, and flexible subscription plans — all backed by our dedicated WhatsApp support team.
            </p>
            <p className="story-para">
              Every order is personally handled. No bots. No long waits. Just real people who care about getting you set up quickly and correctly.
            </p>
          </div>
          <div className="story-visual">
            {[
              { icon: "🇬🇧", title: "UK Based", desc: "We operate fully within the United Kingdom, serving customers nationwide." },
              { icon: "🤝", title: "Personal Service", desc: "Every customer gets direct WhatsApp support from our team." },
              { icon: "⚡", title: "Fast & Reliable", desc: "Orders processed and dispatched within 24 hours of confirmation." },
              { icon: "💰", title: "Fair Pricing", desc: "No hidden fees. What you see is what you pay." },
            ].map((p, i) => (
              <div className="story-point" key={i}>
                <span className="point-icon">{p.icon}</span>
                <div className="point-text">
                  <h4>{p.title}</h4>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VALUES */}
        <div className="values-section">
          <div className="section-header">
            <div className="section-tag">✦ What We Stand For</div>
            <h2 className="section-title">Our <span>Values</span></h2>
          </div>
          <div className="values-grid">
            {[
              { icon: "🔒", title: "Transparency", desc: "No hidden charges, no confusing terms. We tell you exactly what you're getting before you buy." },
              { icon: "⚡", title: "Speed", desc: "Fast order processing, quick delivery, and instant support responses — we value your time." },
              { icon: "💬", title: "Real Support", desc: "Our WhatsApp team is staffed by real humans who know our products inside out." },
              { icon: "✅", title: "Quality", desc: "We only sell devices and plans we trust and have tested ourselves." },
              { icon: "🤝", title: "Reliability", desc: "We follow through on every promise — from delivery times to after-sales support." },
              { icon: "💰", title: "Value", desc: "Premium products at fair prices. We believe quality shouldn't cost a fortune." },
            ].map((v, i) => (
              <div className="value-card" key={i}>
                <span className="value-icon">{v.icon}</span>
                <div className="value-title">{v.title}</div>
                <div className="value-desc">{v.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TIMELINE */}
        <div className="timeline-section">
          <div className="section-tag">✦ Our Journey</div>
          <h2 className="section-title">How We <span>Grew</span></h2>
          <div className="timeline">
            {[
              { year: "2022", icon: "🚀", title: "Founded", desc: "Firestick44UK launched with a small range of Firestick devices and a big ambition to serve UK customers better." },
              { year: "2023", icon: "📦", title: "Expanded Products", desc: "Added Android boxes and flexible subscription plans to our catalogue based on customer demand." },
              { year: "2024", icon: "💬", title: "WhatsApp Support Launched", desc: "Introduced dedicated WhatsApp support, making us one of the most responsive tech stores in the UK." },
              { year: "2025", icon: "🌟", title: "500+ Happy Customers", desc: "Reached a major milestone of 500 satisfied customers with a 99% satisfaction rate." },
              { year: "2026", icon: "🔥", title: "New Website Launch", desc: "Launched our brand new custom-built website with full order tracking and easy payment options." },
            ].map((t, i) => (
              <div className="timeline-item" key={i}>
                <div className="tl-left">
                  <div className="tl-dot">{t.icon}</div>
                  {i < 4 && <div className="tl-line" />}
                </div>
                <div className="tl-content">
                  <div className="tl-year">{t.year}</div>
                  <div className="tl-title">{t.title}</div>
                  <div className="tl-desc">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="cta-section">
          <div className="cta-box">
            <h2 className="cta-title">Ready to Shop With Us?</h2>
            <p className="cta-sub">Join hundreds of happy UK customers. Fast delivery. Real support.</p>
            <div className="cta-btns">
              <a href="/" className="btn-primary">Browse Products</a>
              <a href="/contact" className="btn-secondary">Get In Touch</a>
            </div>
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
          <div className="footer-copy">© 2026 Firestick44UK. All rights reserved.</div>
        </footer>
      </div>

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
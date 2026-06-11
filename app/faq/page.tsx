"use client";
import { useState, useEffect } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --purple-deep:#0d0010; --purple-mid:#4a0080; --purple-bright:#8b00ff; --purple-glow:#bf5fff; --purple-light:#e0b3ff; --gold:#ffd700; }
  body { background:#FFFFFF; color:#111111; font-family:'Raleway',sans-serif; overflow-x:hidden; }
  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px; display:flex; align-items:center; justify-content:space-between; background:#FFFFFF; border-bottom:1px solid #E5E5E5; }
  .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900; color:#111111; text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; }
  .nav-links a:hover { color:#5B21B6; }
  .nav-cta { background:#5B21B6 !important; color:#FFFFFF !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:#111111; border-radius:2px; }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
    .hamburger{display:flex;}
  }
  .page-wrapper { position:relative; z-index:1; padding-top:100px; min-height:100vh; background:#FFFFFF; }
  .page-header { max-width:800px; margin:0 auto; padding:50px 24px 40px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:#111111; margin-bottom:14px; }
  .page-title span { color:#5B21B6; }
  .page-sub { color:#555555; font-size:15px; line-height:1.7; }
  .faq-categories { max-width:900px; margin:0 auto; padding:0 24px 40px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  .cat-btn { padding:8px 22px; border-radius:30px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; border:1px solid #E5E5E5; background:#F5F5F5; color:#111111; }
  .cat-btn:hover { border-color:#5B21B6; color:#5B21B6; }
  .cat-btn.active { background:#5B21B6; color:#FFFFFF !important; border-color:transparent; }
  .faq-section { max-width:800px; margin:0 auto; padding:0 24px; }
  .faq-group { margin-bottom:40px; }
  .faq-group-title { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:#111111; margin-bottom:16px; padding-bottom:10px; border-bottom:2px solid #E5E5E5; }
  .faq-list { display:flex; flex-direction:column; gap:8px; }
  .faq-item { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; transition:all 0.2s; }
  .faq-item:hover { border-color:#5B21B6; }
  .faq-item.open { border-color:#5B21B6; box-shadow:0 2px 8px rgba(91,33,182,0.1); }
  .faq-question { padding:18px 22px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:16px; background:#FFFFFF; }
  .faq-item.open .faq-question { background:#F9F7FF; }
  .faq-question-text { font-size:15px; font-weight:600; color:#111111; }
  .faq-arrow { color:#5B21B6; font-size:18px; transition:transform 0.25s; flex-shrink:0; }
  .faq-arrow.open { transform:rotate(180deg); }
  .faq-answer { max-height:0; overflow:hidden; transition:max-height 0.3s ease, padding 0.3s; }
  .faq-item.open .faq-answer { max-height:400px; padding:0 22px 18px; }
  .faq-answer-text { font-size:14px; color:#444444; line-height:1.8; padding-top:12px; border-top:1px solid #E5E5E5; }
  .help-section { max-width:800px; margin:50px auto 80px; padding:0 24px; }
  .help-box { background:#111111; border-radius:16px; padding:50px 40px; text-align:center; }
  .help-title { font-family:'Cinzel',serif; font-size:clamp(20px,3vw,28px); font-weight:700; color:#FFFFFF; margin-bottom:12px; }
  .help-sub { color:rgba(255,255,255,0.7); font-size:15px; margin-bottom:30px; }
  .help-btns { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
  .btn-whatsapp { background:linear-gradient(135deg,#25d366,#128c7e); color:#FFFFFF; padding:14px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:600; transition:all 0.2s; }
  .btn-telegram { background:#229ED9; color:#FFFFFF; padding:14px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:600; transition:all 0.2s; }
  .btn-contact { background:transparent; color:#FFFFFF; padding:14px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:600; border:2px solid rgba(255,255,255,0.4); transition:all 0.2s; }
  .btn-contact:hover { border-color:#FFFFFF; }
  footer { background:#111111; padding:40px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900; color:#FFFFFF; }
  .footer-links { display:flex; gap:20px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.2s; }
  .footer-links a:hover { color:#FFFFFF; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }
  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .loading-state { text-align:center; padding:60px 24px; color:#666666; }
  @media(max-width:768px){ .help-box{padding:36px 24px;} footer{padding:30px 24px;flex-direction:column;text-align:center;} }
`;

interface FaqItem { id:number; question:string; answer:string; category:string; sort_order:number; }

export default function FAQPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [faqData, setFaqData] = useState<FaqItem[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(true);

  useEffect(() => {
    fetch("/api/faqs")
      .then(r => r.json())
      .then(d => { setFaqData(Array.isArray(d) ? d : []); setLoadingFaqs(false); })
      .catch(() => setLoadingFaqs(false));
  }, []);

  const toggle = (id: number) => setOpenItem(openItem === id ? null : id);
  const categories = ["All", ...Array.from(new Set(faqData.map(f => f.category)))];
  const filteredFaqs = activeCategory === "All" ? faqData : faqData.filter(f => f.category === activeCategory);
  const groupedFaqs: Record<string, FaqItem[]> = {};
  filteredFaqs.forEach(f => { if (!groupedFaqs[f.category]) groupedFaqs[f.category] = []; groupedFaqs[f.category].push(f); });

  // JSON-LD from DB data
  const faqLd = faqData.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqData.map(f => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  } : null;

  return (
    <>
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
      <style>{styles}</style>

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
        <div className="page-header">
          <div className="section-tag">✦ Help Centre</div>
          <h1 className="page-title">Frequently Asked <span>Questions</span></h1>
          <p className="page-sub">Find answers to the most common questions about our products and services.</p>
        </div>

        {/* Category filters */}
        <div className="faq-categories">
          {categories.map(cat => (
            <button key={cat} className={`cat-btn ${activeCategory === cat ? "active" : ""}`} onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>

        <div className="faq-section">
          {loadingFaqs ? (
            <div className="loading-state">Loading FAQs...</div>
          ) : faqData.length === 0 ? (
            <div className="loading-state">No FAQs available yet.</div>
          ) : (
            Object.entries(groupedFaqs).map(([category, items]) => (
              <div className="faq-group" key={category}>
                {activeCategory === "All" && <div className="faq-group-title">{category}</div>}
                <div className="faq-list">
                  {items.map(faq => (
                    <div key={faq.id} className={`faq-item ${openItem === faq.id ? "open" : ""}`}>
                      <div className="faq-question" onClick={() => toggle(faq.id)}>
                        <span className="faq-question-text">{faq.question}</span>
                        <span className={`faq-arrow ${openItem === faq.id ? "open" : ""}`}>▼</span>
                      </div>
                      <div className="faq-answer">
                        <div className="faq-answer-text">{faq.answer}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="help-section">
          <div className="help-box">
            <h2 className="help-title">Still Need Help?</h2>
            <p className="help-sub">Can&apos;t find the answer you&apos;re looking for? Our team is happy to help.</p>
            <div className="help-btns">
              <a href="https://wa.me/447934519060" className="btn-whatsapp" target="_blank" rel="noopener noreferrer">
                💬 WhatsApp Us
              </a>
              <a href="https://t.me/firestick44" className="btn-telegram" target="_blank" rel="noopener noreferrer">
                ✈️ Telegram @firestick44
              </a>
              <a href="/contact" className="btn-contact">📧 Contact Form</a>
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
          <div className="footer-copy">© 2026 Firestick4UK. All rights reserved.</div>
        </footer>
      </div>

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}

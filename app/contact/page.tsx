"use client";
import { useState, useEffect } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  body { background:#FFFFFF; color:#111111; font-family:'Raleway',sans-serif; overflow-x:hidden; }

  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900; color:#111111; text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:#111111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.2s; }
  .nav-links a:hover { color:#5B21B6; }
  .nav-cta { background:#5B21B6 !important; color:#FFFFFF !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .nav-cta:hover { background:#4C1D95 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:6px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:#111111; border-radius:2px; }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
    .nav-links.open a{color:#111111;font-size:18px;}
    .hamburger{display:flex;}
  }

  .page-wrapper { padding-top:100px; min-height:100vh; background:#FFFFFF; }

  .page-header { max-width:800px; margin:0 auto; padding:50px 24px 10px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; display:block; font-weight:600; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:#111111; margin-bottom:14px; }
  .page-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }
  .page-sub { color:#555555; font-size:15px; line-height:1.7; }

  /* CONTACT CARDS */
  .contact-cards { max-width:900px; margin:50px auto 0; padding:0 24px;
    display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:18px; }
  .contact-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:28px 22px;
    text-align:center; transition:all 0.2s; text-decoration:none; display:block;
    box-shadow:0 2px 8px rgba(0,0,0,0.05); }
  .contact-card:hover { transform:translateY(-4px); border-color:#5B21B6; box-shadow:0 8px 24px rgba(91,33,182,0.12); }
  /* Featured WhatsApp card */
  .contact-card-featured { background:#F5F3FF; border:2px solid #5B21B6; border-radius:16px; padding:28px 22px;
    text-align:center; transition:all 0.2s; text-decoration:none; display:block;
    box-shadow:0 4px 16px rgba(91,33,182,0.15); }
  .contact-card-featured:hover { transform:translateY(-4px); box-shadow:0 10px 28px rgba(91,33,182,0.25); }
  .contact-card-featured .contact-card-title { color:#5B21B6; }
  .contact-card-featured .contact-card-value { color:#111111; font-size:17px; font-weight:800; letter-spacing:0.5px; }
  .contact-card-featured .contact-card-sub { color:#5B21B6; font-weight:600; }
  .contact-card-icon { font-size:38px; margin-bottom:12px; display:block; }
  .contact-card-title { font-family:'Cinzel',serif; font-size:15px; font-weight:700; color:#5B21B6; margin-bottom:7px; }
  .contact-card-value { font-size:14px; color:#5B21B6; font-weight:600; }
  .contact-card-sub { font-size:12px; color:#888888; margin-top:4px; }

  /* MAIN LAYOUT */
  .contact-layout { max-width:1000px; margin:50px auto 80px; padding:0 24px;
    display:grid; grid-template-columns:1fr 1fr; gap:28px; }

  /* FORM */
  .contact-form-box { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:18px; padding:34px;
    box-shadow:0 2px 10px rgba(0,0,0,0.06); }
  .form-title { font-family:'Cinzel',serif; font-size:19px; font-weight:700; color:#111111;
    margin-bottom:22px; padding-bottom:14px; border-bottom:1px solid #F0F0F0; }
  .form-group { margin-bottom:16px; }
  .form-group label { display:block; font-size:11px; letter-spacing:2px; text-transform:uppercase;
    color:#666666; margin-bottom:7px; font-weight:600; }
  .form-group input, .form-group select, .form-group textarea {
    width:100%; background:#FFFFFF; border:1px solid #E5E5E5;
    border-radius:9px; padding:12px 14px; color:#111111; font-family:'Raleway',sans-serif;
    font-size:14px; transition:all 0.2s; outline:none; }
  .form-group input::placeholder, .form-group textarea::placeholder { color:#AAAAAA; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color:#5B21B6; box-shadow:0 0 0 3px rgba(91,33,182,0.1); }
  .form-group select option { background:#FFFFFF; color:#111111; }
  .form-group textarea { resize:vertical; min-height:120px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .submit-btn { width:100%; background:#5B21B6; color:#FFFFFF; border:none; padding:15px;
    border-radius:9px; font-size:15px; font-weight:600; cursor:pointer; transition:all 0.2s; margin-top:6px; }
  .submit-btn:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 14px rgba(91,33,182,0.35); }
  .submit-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

  /* SUCCESS */
  .form-success { text-align:center; padding:40px 20px; }
  .success-icon { font-size:60px; display:block; margin-bottom:16px; animation:popIn 0.5s ease; }
  @keyframes popIn { from{transform:scale(0)} to{transform:scale(1)} }
  .success-title { font-family:'Cinzel',serif; font-size:22px; font-weight:700; color:#111111; margin-bottom:10px; }
  .success-sub { color:#555555; font-size:14px; line-height:1.7; }

  /* RIGHT SIDE INFO */
  .contact-info-box { display:flex; flex-direction:column; gap:18px; }
  .info-card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:14px; padding:26px;
    box-shadow:0 1px 4px rgba(0,0,0,0.04); transition:all 0.2s; }
  .info-card:hover { border-color:#5B21B6; box-shadow:0 4px 14px rgba(91,33,182,0.08); }
  .info-card-header { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
  .info-card-icon { font-size:26px; }
  .info-card-title { font-family:'Cinzel',serif; font-size:15px; font-weight:700; color:#5B21B6; }
  .info-card-body { font-size:14px; color:#555555; line-height:1.7; }
  .info-card-body strong { color:#111111; display:block; margin-bottom:4px; font-weight:700; }
  .info-card-link { display:inline-block; margin-top:12px; color:#5B21B6;
    text-decoration:none; font-size:14px; font-weight:600; transition:color 0.2s; }
  .info-card-link:hover { color:#4C1D95; }

  .hours-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
  .hours-row { font-size:13px; }
  .hours-row span:first-child { color:#888888; display:block; margin-bottom:2px; }
  .hours-row span:last-child { color:#111111; font-weight:600; }

  /* FAQ */
  .faq-preview { max-width:1000px; margin:0 auto 80px; padding:0 24px; }
  .faq-title { font-family:'Cinzel',serif; font-size:clamp(20px,3vw,32px); font-weight:700; color:#111111; margin-bottom:24px; }
  .faq-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }
  .faq-list { display:flex; flex-direction:column; gap:10px; }
  .faq-item { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:12px; overflow:hidden; transition:border-color 0.2s; }
  .faq-item:hover { border-color:#5B21B6; }
  .faq-question { padding:17px 20px; cursor:pointer; display:flex; justify-content:space-between;
    align-items:center; font-size:15px; font-weight:600; color:#111111; background:#FAFAFA; }
  .faq-question:hover { background:#F5F3FF; }
  .faq-arrow { color:#5B21B6; font-size:14px; transition:transform 0.25s; }
  .faq-arrow.open { transform:rotate(180deg); }
  .faq-answer { padding:14px 20px 18px; font-size:14px; color:#555555; line-height:1.7;
    border-top:1px solid #F0F0F0; }

  footer { background:#111111; padding:50px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:17px; font-weight:900; color:#FFFFFF; }
  .footer-links { display:flex; gap:24px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.2s; }
  .footer-links a:hover { color:#FFFFFF; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.1); }

  @media(max-width:768px){
    .contact-layout{grid-template-columns:1fr;padding:0 16px;}
    .form-row{grid-template-columns:1fr;}
    .contact-cards{padding:0 16px;}
    footer{padding:36px 24px;flex-direction:column;text-align:center;}
  }
`;

const faqs = [
  { q: "How do I place an order?", a: "Browse our products, add items to your cart, fill in your details, and complete payment via bank transfer or cash on delivery. You'll receive an Order ID to track your order." },
  { q: "How long does delivery take?", a: "Physical items (Firestick, Android Boxes) are delivered within 2-3 working days across the UK. Subscription plans are active within 1 hour of payment confirmation." },
  { q: "How do I pay via bank transfer?", a: "During checkout, our UK bank account details will be shown. Transfer the exact amount, take a screenshot of your receipt, and upload it during checkout." },
  { q: "How can I track my order?", a: "Use your Order ID (e.g. FK44-12345) on our Order Tracking page to check your order status in real time." },
];

export default function ContactPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sc, setSc] = useState<Record<string,string>>({});

  useEffect(() => {
    fetch("/api/site-content?page=contact").then(r=>r.json()).then(d=>{ if(d&&typeof d==="object") setSc(d); }).catch(()=>{});
  }, []);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success || res.ok) setSubmitted(true);
      else alert('Failed to send message. Please try WhatsApp or Telegram instead.');
    } catch {
      alert('Failed to send message. Please try WhatsApp or Telegram instead.');
    }
    setSubmitting(false);
  };

  return (
    <>
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
          <div className="section-tag">✦ Get In Touch</div>
          <h1 className="page-title">Contact <span>Us</span></h1>
          <p className="page-sub">Have a question or need help? We&apos;re here for you — reach out anytime.</p>
        </div>

        {/* CONTACT CARDS */}
        <div className="contact-cards">
          <a href={`https://wa.me/${sc.contact_whatsapp||"447934519060"}`} className="contact-card-featured" target="_blank" rel="noopener noreferrer">
            <span className="contact-card-icon">💬</span>
            <div className="contact-card-title">WhatsApp</div>
            <div className="contact-card-value">{sc.contact_phone||"+44 7934 519060"}</div>
            <div className="contact-card-sub">✦ Fastest response</div>
          </a>
          <a href="https://t.me/firestick44" className="contact-card" target="_blank" rel="noopener noreferrer">
            <span className="contact-card-icon">✈️</span>
            <div className="contact-card-title">Telegram</div>
            <div className="contact-card-value">@firestick44</div>
            <div className="contact-card-sub">Message us anytime</div>
          </a>
          <a href={`mailto:${sc.contact_email||"firestick4uk@gmail.com"}`} className="contact-card">
            <span className="contact-card-icon">📧</span>
            <div className="contact-card-title">Email</div>
            <div className="contact-card-value">{sc.contact_email||"firestick4uk@gmail.com"}</div>
            <div className="contact-card-sub">Reply within 24 hours</div>
          </a>
          <div className="contact-card">
            <span className="contact-card-icon">🕐</span>
            <div className="contact-card-title">Support Hours</div>
            <div className="contact-card-value">{sc.contact_hours||"9AM – 10PM"}</div>
            <div className="contact-card-sub">7 days a week</div>
          </div>
          <div className="contact-card">
            <span className="contact-card-icon">📍</span>
            <div className="contact-card-title">Based In</div>
            <div className="contact-card-value">{sc.contact_address||"United Kingdom"}</div>
            <div className="contact-card-sub">UK based support</div>
          </div>
        </div>

        {/* FORM + INFO */}
        <div className="contact-layout">
          {/* FORM */}
          <div className="contact-form-box">
            {submitted ? (
              <div className="form-success">
                <span className="success-icon">✅</span>
                <div className="success-title">Message Sent!</div>
                <p className="success-sub">Thank you for reaching out. We&apos;ll get back to you within 24 hours. For urgent queries, please WhatsApp us or message us on Telegram directly.</p>
              </div>
            ) : (
              <>
                <div className="form-title">Send Us a Message</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Your Name *</label>
                    <input type="text" placeholder="John Smith" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone / WhatsApp</label>
                    <input type="tel" placeholder="+447934519060" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Subject</label>
                    <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
                      <option value="">Select a topic</option>
                      <option>Order Query</option>
                      <option>Payment Issue</option>
                      <option>Product Question</option>
                      <option>Technical Support</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Message *</label>
                  <textarea placeholder="How can we help you?" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                </div>
                <button className="submit-btn" onClick={handleSubmit}
                  disabled={submitting || !form.name || !form.email || !form.message}>
                  {submitting ? 'Sending...' : 'Send Message →'}
                </button>
              </>
            )}
          </div>

          {/* INFO */}
          <div className="contact-info-box">
            <div className="info-card">
              <div className="info-card-header">
                <span className="info-card-icon">💬</span>
                <div className="info-card-title">WhatsApp Support</div>
              </div>
              <div className="info-card-body">
                <strong>Fastest way to reach us</strong>
                Send us a message on WhatsApp or Telegram for instant support. We typically reply within minutes during business hours.
              </div>
              <a href={`https://wa.me/${sc.contact_whatsapp||"447934519060"}`} className="info-card-link" target="_blank" rel="noopener noreferrer">
                Chat Now on WhatsApp →
              </a>
              <br />
              <a href="https://t.me/firestick44" className="info-card-link" target="_blank" rel="noopener noreferrer">
                Message @firestick44 on Telegram →
              </a>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <span className="info-card-icon">🕐</span>
                <div className="info-card-title">Support Hours</div>
              </div>
              <div className="info-card-body">
                <div className="hours-grid">
                  <div className="hours-row"><span>Monday – Friday</span><span>9AM – 10PM</span></div>
                  <div className="hours-row"><span>Saturday</span><span>10AM – 8PM</span></div>
                  <div className="hours-row"><span>Sunday</span><span>11AM – 6PM</span></div>
                  <div className="hours-row"><span>Bank Holidays</span><span>Limited hours</span></div>
                </div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <span className="info-card-icon">📦</span>
                <div className="info-card-title">Track Your Order</div>
              </div>
              <div className="info-card-body">
                Already placed an order? Use your Order ID to check your delivery status in real time.
              </div>
              <a href="/order-tracking" className="info-card-link">Track Order →</a>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="faq-preview">
          <div className="section-tag">✦ Quick Answers</div>
          <h2 className="faq-title">Frequently Asked <span>Questions</span></h2>
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <div className="faq-item" key={i}>
                <div className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  <span className={`faq-arrow ${openFaq === i ? "open" : ""}`}>▼</span>
                </div>
                {openFaq === i && <div className="faq-answer">{faq.a}</div>}
              </div>
            ))}
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

    </>
  );
}
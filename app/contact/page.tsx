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
  .star { position:absolute; width:2px; height:2px; background:white; border-radius:50%; animation:twinkle var(--dur) ease-in-out infinite; opacity:0; }
  @keyframes twinkle { 0%,100%{opacity:0} 50%{opacity:var(--op)} }

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

  .page-header { max-width:800px; margin:0 auto; padding:50px 24px 10px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:white; margin-bottom:14px; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .page-sub { color:rgba(255,255,255,0.5); font-size:15px; line-height:1.7; }

  /* CONTACT CARDS */
  .contact-cards { max-width:900px; margin:50px auto 0; padding:0 24px;
    display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:20px; }
  .contact-card { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:20px; padding:30px 24px;
    text-align:center; transition:all 0.3s; text-decoration:none; display:block; }
  .contact-card:hover { transform:translateY(-6px); border-color:rgba(139,0,255,0.5); box-shadow:0 16px 40px rgba(139,0,255,0.2); }
  .contact-card-icon { font-size:40px; margin-bottom:14px; display:block; }
  .contact-card-title { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:white; margin-bottom:8px; }
  .contact-card-value { font-size:14px; color:var(--purple-glow); font-weight:500; }
  .contact-card-sub { font-size:12px; color:rgba(255,255,255,0.4); margin-top:4px; }

  /* MAIN LAYOUT */
  .contact-layout { max-width:1000px; margin:50px auto 80px; padding:0 24px;
    display:grid; grid-template-columns:1fr 1fr; gap:30px; }

  /* FORM */
  .contact-form-box { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.85));
    border:1px solid rgba(139,0,255,0.2); border-radius:24px; padding:36px; }
  .form-title { font-family:'Cinzel',serif; font-size:20px; font-weight:700; color:white;
    margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid rgba(139,0,255,0.15); }
  .form-group { margin-bottom:18px; }
  .form-group label { display:block; font-size:11px; letter-spacing:2.5px; text-transform:uppercase;
    color:rgba(255,255,255,0.45); margin-bottom:8px; }
  .form-group input, .form-group select, .form-group textarea {
    width:100%; background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.25);
    border-radius:12px; padding:13px 16px; color:white; font-family:'Raleway',sans-serif;
    font-size:14px; transition:all 0.3s; outline:none; }
  .form-group input::placeholder, .form-group textarea::placeholder { color:rgba(255,255,255,0.25); }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color:var(--purple-glow); background:rgba(139,0,255,0.15); box-shadow:0 0 15px rgba(139,0,255,0.2); }
  .form-group select option { background:#1a0025; }
  .form-group textarea { resize:vertical; min-height:120px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .submit-btn { width:100%; background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:16px; border-radius:50px; font-size:15px;
    font-weight:600; letter-spacing:1px; cursor:pointer; box-shadow:0 0 25px rgba(139,0,255,0.4);
    transition:all 0.3s; margin-top:8px; }
  .submit-btn:hover { box-shadow:0 0 45px rgba(139,0,255,0.7); transform:translateY(-2px); }

  /* SUCCESS */
  .form-success { text-align:center; padding:40px 20px; }
  .success-icon { font-size:60px; display:block; margin-bottom:16px; animation:popIn 0.5s ease; }
  @keyframes popIn { from{transform:scale(0)} to{transform:scale(1)} }
  .success-title { font-family:'Cinzel',serif; font-size:22px; font-weight:700; margin-bottom:10px;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .success-sub { color:rgba(255,255,255,0.5); font-size:14px; line-height:1.7; }

  /* RIGHT SIDE INFO */
  .contact-info-box { display:flex; flex-direction:column; gap:20px; }

  .info-card { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.85));
    border:1px solid rgba(139,0,255,0.2); border-radius:20px; padding:28px; transition:all 0.3s; }
  .info-card:hover { border-color:rgba(139,0,255,0.4); }
  .info-card-header { display:flex; align-items:center; gap:14px; margin-bottom:16px; }
  .info-card-icon { font-size:28px; }
  .info-card-title { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:white; }
  .info-card-body { font-size:14px; color:rgba(255,255,255,0.5); line-height:1.7; }
  .info-card-body strong { color:white; display:block; margin-bottom:4px; }
  .info-card-link { display:inline-block; margin-top:14px; color:var(--purple-glow);
    text-decoration:none; font-size:14px; font-weight:600; transition:all 0.3s; }
  .info-card-link:hover { color:var(--gold); }

  .hours-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
  .hours-row { font-size:13px; }
  .hours-row span:first-child { color:rgba(255,255,255,0.4); display:block; }
  .hours-row span:last-child { color:white; font-weight:500; }

  /* FAQ PREVIEW */
  .faq-preview { max-width:1000px; margin:0 auto 80px; padding:0 24px; }
  .faq-title { font-family:'Cinzel',serif; font-size:clamp(20px,3vw,32px); font-weight:700; color:white; margin-bottom:24px; }
  .faq-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .faq-list { display:flex; flex-direction:column; gap:12px; }
  .faq-item { background:rgba(139,0,255,0.06); border:1px solid rgba(139,0,255,0.15);
    border-radius:14px; overflow:hidden; transition:all 0.3s; }
  .faq-item:hover { border-color:rgba(139,0,255,0.35); }
  .faq-question { padding:18px 22px; cursor:pointer; display:flex; justify-content:space-between;
    align-items:center; font-size:15px; font-weight:500; color:white; }
  .faq-arrow { color:var(--purple-glow); font-size:18px; transition:transform 0.3s; }
  .faq-arrow.open { transform:rotate(180deg); }
  .faq-answer { padding:0 22px 18px; font-size:14px; color:rgba(255,255,255,0.5); line-height:1.7; }

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
    .contact-layout{grid-template-columns:1fr; padding:0 24px;}
    .form-row{grid-template-columns:1fr;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
  }
`;

const faqs = [
  { q: "How do I place an order?", a: "Browse our products, add items to your cart, fill in your details, and complete payment via bank transfer or cash on delivery. You'll receive an Order ID to track your order." },
  { q: "How long does delivery take?", a: "Physical items (Firestick, Android Boxes) are delivered within 2-3 working days across the UK. Subscription plans are activated within a few hours of payment verification." },
  { q: "How do I pay via bank transfer?", a: "During checkout, our UK bank account details will be shown. Transfer the exact amount, take a screenshot of your receipt, and upload it during checkout." },
  { q: "How can I track my order?", a: "Use your Order ID (e.g. FK44-12345) on our Order Tracking page to check your order status in real time." },
];

export default function ContactPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });

  const [submitting, setSubmitting] = useState(false);

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
      else alert('Failed to send message. Please try WhatsApp instead.');
    } catch {
      alert('Failed to send message. Please try WhatsApp instead.');
    }
    setSubmitting(false);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="bg-fixed">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="star" style={{
            left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            "--dur": `${2 + Math.random() * 4}s`, "--op": `${0.2 + Math.random() * 0.5}`,
            animationDelay: `${Math.random() * 5}s`
          } as React.CSSProperties} />
        ))}
      </div>

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
          <a href="https://wa.me/447934519060" className="contact-card" target="_blank" rel="noopener noreferrer">
            <span className="contact-card-icon">💬</span>
            <div className="contact-card-title">WhatsApp</div>
            <div className="contact-card-value">+44 7934 519060</div>
            <div className="contact-card-sub">Fastest response</div>
          </a>
          <a href="mailto:support@firestick44uk.com" className="contact-card">
            <span className="contact-card-icon">📧</span>
            <div className="contact-card-title">Email</div>
            <div className="contact-card-value">support@firestick44uk.com</div>
            <div className="contact-card-sub">Reply within 24 hours</div>
          </a>
          <div className="contact-card">
            <span className="contact-card-icon">🕐</span>
            <div className="contact-card-title">Support Hours</div>
            <div className="contact-card-value">9AM – 10PM</div>
            <div className="contact-card-sub">7 days a week</div>
          </div>
          <div className="contact-card">
            <span className="contact-card-icon">📍</span>
            <div className="contact-card-title">Based In</div>
            <div className="contact-card-value">United Kingdom</div>
            <div className="contact-card-sub">UK orders only</div>
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
                <p className="success-sub">Thank you for reaching out. We&apos;ll get back to you within 24 hours. For urgent queries, please WhatsApp us directly.</p>
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
                    <input type="tel" placeholder="+44 7000 000000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
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
                Send us a message on WhatsApp for instant support. We typically reply within minutes during business hours.
              </div>
              <a href="https://wa.me/447934519060" className="info-card-link" target="_blank" rel="noopener noreferrer">
                Chat Now on WhatsApp →
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

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
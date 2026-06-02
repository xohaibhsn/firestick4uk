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
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(13,0,16,0.98);align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
    .hamburger{display:flex;}
  }
  .page-wrapper { position:relative; z-index:1; padding-top:100px; min-height:100vh; }
  .page-header { max-width:800px; margin:0 auto; padding:50px 24px 40px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:white; margin-bottom:14px; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .last-updated { color:rgba(255,255,255,0.35); font-size:13px; }
  .content-layout { max-width:900px; margin:0 auto; padding:0 24px 80px; display:grid; grid-template-columns:220px 1fr; gap:40px; align-items:start; }
  .toc { position:sticky; top:110px; background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8)); border:1px solid rgba(139,0,255,0.2); border-radius:16px; padding:24px; }
  .toc-title { font-family:'Cinzel',serif; font-size:13px; font-weight:700; color:var(--purple-glow); letter-spacing:2px; text-transform:uppercase; margin-bottom:16px; }
  .toc-list { list-style:none; display:flex; flex-direction:column; gap:8px; }
  .toc-list a { color:rgba(255,255,255,0.5); text-decoration:none; font-size:13px; line-height:1.5; display:block; padding:4px 0 4px 10px; border-left:2px solid transparent; transition:all 0.2s; }
  .toc-list a:hover { color:var(--purple-glow); border-left-color:var(--purple-glow); }
  .policy-section { margin-bottom:40px; scroll-margin-top:120px; }
  .policy-section h2 { font-family:'Cinzel',serif; font-size:20px; font-weight:700; color:white; margin-bottom:16px; padding-bottom:10px; border-bottom:1px solid rgba(139,0,255,0.15); }
  .policy-section p { font-size:14px; color:rgba(255,255,255,0.55); line-height:1.9; margin-bottom:14px; }
  .policy-section ul { padding-left:20px; margin-bottom:14px; }
  .policy-section ul li { font-size:14px; color:rgba(255,255,255,0.55); line-height:1.9; margin-bottom:6px; }
  .policy-section ul li::marker { color:var(--purple-glow); }
  .highlight-box { background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.2); border-radius:12px; padding:18px 20px; margin-bottom:16px; }
  .highlight-box p { margin-bottom:0; color:rgba(255,255,255,0.65); }
  footer { position:relative; z-index:1; padding:40px 60px; border-top:1px solid rgba(139,0,255,0.15); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900; background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .footer-links { display:flex; gap:20px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.4); text-decoration:none; font-size:13px; transition:color 0.3s; }
  .footer-links a:hover { color:var(--purple-glow); }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }
  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.15); }
  @media(max-width:768px){ .content-layout{grid-template-columns:1fr;} .toc{display:none;} footer{padding:30px 24px;flex-direction:column;text-align:center;} }
`;

export default function TermsPage() {
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
        <div className="page-header">
          <div className="section-tag">✦ Legal</div>
          <h1 className="page-title">Terms & <span>Conditions</span></h1>
          <p className="last-updated">Last updated: 30 May 2026</p>
        </div>

        <div className="content-layout">
          <aside className="toc">
            <div className="toc-title">Contents</div>
            <ul className="toc-list">
              <li><a href="#agreement">1. Agreement</a></li>
              <li><a href="#products">2. Products</a></li>
              <li><a href="#orders">3. Orders</a></li>
              <li><a href="#payment">4. Payment</a></li>
              <li><a href="#delivery">5. Delivery</a></li>
              <li><a href="#returns">6. Returns</a></li>
              <li><a href="#intellectual">7. Intellectual Property</a></li>
              <li><a href="#liability">8. Liability</a></li>
              <li><a href="#governing">9. Governing Law</a></li>
              <li><a href="#contact">10. Contact</a></li>
            </ul>
          </aside>

          <div className="policy-content">
            <div className="policy-section" id="agreement">
              <h2>1. Agreement to Terms</h2>
              <div className="highlight-box">
                <p>By accessing or placing an order on firestick44uk.com, you agree to be bound by these Terms & Conditions. Please read them carefully before making a purchase.</p>
              </div>
              <p>These terms apply to all visitors, users, and customers of Firestick44UK. We reserve the right to update these terms at any time. Continued use of our website after changes constitutes acceptance of the new terms.</p>
            </div>

            <div className="policy-section" id="products">
              <h2>2. Products & Services</h2>
              <p>Firestick44UK sells physical streaming devices (Firestick, Android Boxes) and digital subscription plans. All products are subject to availability.</p>
              <ul>
                <li>Product descriptions and images are for illustrative purposes. Actual products may vary slightly.</li>
                <li>We reserve the right to modify or discontinue any product or service without prior notice.</li>
                <li>Subscription plans are for personal, non-commercial use only.</li>
                <li>Reselling or redistributing our subscription plans is strictly prohibited.</li>
              </ul>
            </div>

            <div className="policy-section" id="orders">
              <h2>3. Orders</h2>
              <p>When you place an order, you are making an offer to purchase. We reserve the right to accept or decline any order at our discretion.</p>
              <ul>
                <li>You must provide accurate and complete information when placing an order.</li>
                <li>An order is confirmed only after payment has been verified by our team.</li>
                <li>We will notify you of order confirmation via email or WhatsApp.</li>
                <li>Orders cannot be modified once payment has been verified and fulfilment has begun.</li>
              </ul>
            </div>

            <div className="policy-section" id="payment">
              <h2>4. Payment</h2>
              <p>We accept UK bank transfer and cash on delivery as payment methods.</p>
              <ul>
                <li><strong>Bank Transfer:</strong> Payment must be made to the account details shown at checkout. Include your Order ID as the payment reference. Upload your receipt to complete the order.</li>
                <li><strong>Cash on Delivery:</strong> Payment is due upon delivery of physical goods. Available for UK mainland addresses only.</li>
                <li>We verify all bank transfer receipts manually. This may take up to a few hours during business hours.</li>
                <li>Orders will not be fulfilled until payment is verified.</li>
              </ul>
            </div>

            <div className="policy-section" id="delivery">
              <h2>5. Delivery</h2>
              <ul>
                <li>Physical products are delivered within 2-3 working days to UK mainland addresses.</li>
                <li>Subscription plans are activated digitally within a few hours of payment verification.</li>
                <li>Delivery times are estimates and not guaranteed. We are not liable for delays caused by couriers or circumstances beyond our control.</li>
                <li>Risk of loss passes to you upon delivery.</li>
                <li>We deliver to UK addresses only.</li>
              </ul>
            </div>

            <div className="policy-section" id="returns">
              <h2>6. Returns & Refunds</h2>
              <p>Please refer to our <a href="/refund-policy" style={{color:"var(--purple-glow)"}}>Refund Policy</a> for full details on returns and refunds.</p>
              <ul>
                <li>Physical products may be returned within 14 days of delivery if unused and in original packaging.</li>
                <li>Digital subscription plans are non-refundable once activated.</li>
                <li>Faulty items will be replaced or refunded at no additional cost.</li>
              </ul>
            </div>

            <div className="policy-section" id="intellectual">
              <h2>7. Intellectual Property</h2>
              <p>All content on firestick44uk.com — including text, images, logos, and design — is the property of Firestick44UK and is protected by UK copyright law.</p>
              <ul>
                <li>You may not reproduce, distribute, or use our content without prior written permission.</li>
                <li>Our brand name and logo may not be used without explicit consent.</li>
              </ul>
            </div>

            <div className="policy-section" id="liability">
              <h2>8. Limitation of Liability</h2>
              <p>To the fullest extent permitted by law, Firestick44UK shall not be liable for:</p>
              <ul>
                <li>Any indirect, incidental, or consequential damages arising from use of our products or website.</li>
                <li>Loss of data, revenue, or profits.</li>
                <li>Delays or failures caused by circumstances beyond our reasonable control (including courier delays, technical outages, or force majeure events).</li>
              </ul>
              <p>Our total liability shall not exceed the value of the order in question.</p>
            </div>

            <div className="policy-section" id="governing">
              <h2>9. Governing Law</h2>
              <p>These Terms & Conditions are governed by and construed in accordance with the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
            </div>

            <div className="policy-section" id="contact">
              <h2>10. Contact Us</h2>
              <p>If you have any questions about these Terms & Conditions, please contact us:</p>
              <div className="highlight-box">
                <p>📧 Email: support@firestick44uk.com<br />
                💬 WhatsApp: +44 7000 000000<br />
                🌐 Website: firestick44uk.com</p>
              </div>
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
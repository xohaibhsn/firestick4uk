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
  .nav-links a:hover { color:#5B21B6; }
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
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:#111111; margin-bottom:14px; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .last-updated { color:rgba(255,255,255,0.35); font-size:13px; }

  /* LAYOUT */
  .content-layout { max-width:900px; margin:0 auto; padding:0 24px 80px;
    display:grid; grid-template-columns:220px 1fr; gap:40px; align-items:start; }

  /* SIDEBAR */
  .toc { position:sticky; top:110px; background:#FFFFFF;
    border:1px solid rgba(139,0,255,0.2); border-radius:16px; padding:24px; }
  .toc-title { font-family:'Cinzel',serif; font-size:13px; font-weight:700; color:#5B21B6;
    letter-spacing:2px; text-transform:uppercase; margin-bottom:16px; }
  .toc-list { list-style:none; display:flex; flex-direction:column; gap:8px; }
  .toc-list a { color:#555555; text-decoration:none; font-size:13px; transition:color 0.3s;
    line-height:1.5; display:block; padding:4px 0; border-left:2px solid transparent;
    padding-left:10px; transition:all 0.2s; }
  .toc-list a:hover { color:#5B21B6; border-left-color:#5B21B6; }

  /* CONTENT */
  .policy-content { }
  .policy-section { margin-bottom:40px; scroll-margin-top:120px; }
  .policy-section h2 { font-family:'Cinzel',serif; font-size:20px; font-weight:700; color:#111111;
    margin-bottom:16px; padding-bottom:10px; border-bottom:1px solid #E5E5E5; }
  .policy-section p { font-size:14px; color:#333333; line-height:1.9; margin-bottom:14px; }
  .policy-section ul { padding-left:20px; margin-bottom:14px; }
  .policy-section ul li { font-size:14px; color:#333333; line-height:1.9; margin-bottom:6px; }
  .policy-section ul li::marker { color:#5B21B6; }
  .highlight-box { background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.2);
    border-radius:12px; padding:18px 20px; margin-bottom:16px; }
  .highlight-box p { margin-bottom:0; color:#444444; }

  footer { position:relative; z-index:1; padding:40px 60px;
    border-top:1px solid rgba(139,0,255,0.15);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .footer-links { display:flex; gap:20px; list-style:none; flex-wrap:wrap; }
  .footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; font-size:13px; transition:color 0.3s; }
  .footer-links a:hover { color:#5B21B6; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.15); }

  @media(max-width:768px){
    .content-layout{grid-template-columns:1fr;}
    .toc{display:none;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
  }
`;

export default function PrivacyPolicyPage() {
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
          <h1 className="page-title">Privacy <span>Policy</span></h1>
          <p className="last-updated">Last updated: 30 May 2026</p>
        </div>

        <div className="content-layout">
          {/* SIDEBAR */}
          <aside className="toc">
            <div className="toc-title">Contents</div>
            <ul className="toc-list">
              <li><a href="#overview">1. Overview</a></li>
              <li><a href="#data-collect">2. Data We Collect</a></li>
              <li><a href="#how-use">3. How We Use Your Data</a></li>
              <li><a href="#sharing">4. Data Sharing</a></li>
              <li><a href="#cookies">5. Cookies</a></li>
              <li><a href="#security">6. Data Security</a></li>
              <li><a href="#rights">7. Your Rights</a></li>
              <li><a href="#retention">8. Data Retention</a></li>
              <li><a href="#contact">9. Contact Us</a></li>
            </ul>
          </aside>

          {/* CONTENT */}
          <div className="policy-content">
            <div className="policy-section" id="overview">
              <h2>1. Overview</h2>
              <div className="highlight-box">
                <p>Firestick4UK (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard information when you use our website firestick4uk.com.</p>
              </div>
              <p>By placing an order or using our website, you agree to the collection and use of information as described in this policy. We comply with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>
            </div>

            <div className="policy-section" id="data-collect">
              <h2>2. Data We Collect</h2>
              <p>When you place an order or contact us, we may collect the following information:</p>
              <ul>
                <li>Full name</li>
                <li>Email address</li>
                <li>Phone number / WhatsApp number / Telegram username if provided</li>
                <li>Delivery address (street, city, postcode)</li>
                <li>Order details and payment receipts</li>
                <li>IP address and browser information (via cookies)</li>
                <li>Any messages or communications you send us</li>
              </ul>
              <p>We do not collect or store credit/debit card details. Payments are made via bank transfer, and we only receive a receipt image uploaded by the customer.</p>
            </div>

            <div className="policy-section" id="how-use">
              <h2>3. How We Use Your Data</h2>
              <p>We use your personal data for the following purposes:</p>
              <ul>
                <li>Processing and fulfilling your orders</li>
                <li>Verifying bank transfer payments</li>
                <li>Sending order confirmations and status updates</li>
                <li>Providing customer support via WhatsApp, Telegram or email</li>
                <li>Improving our website and services</li>
                <li>Complying with legal obligations</li>
              </ul>
              <p>We will not use your data for unsolicited marketing without your consent.</p>
            </div>

            <div className="policy-section" id="sharing">
              <h2>4. Data Sharing</h2>
              <p>We do not sell, trade, or rent your personal data to third parties. We may share your information only in the following circumstances:</p>
              <ul>
                <li><strong>Delivery partners</strong> — your name and address may be shared with our courier service to fulfil your order.</li>
                <li><strong>Legal requirements</strong> — we may disclose your data if required by law or in response to a valid legal request.</li>
                <li><strong>Business transfers</strong> — in the event of a merger or acquisition, your data may be transferred to the new owner.</li>
              </ul>
            </div>

            <div className="policy-section" id="cookies">
              <h2>5. Cookies</h2>
              <p>Our website uses cookies to improve your browsing experience. Cookies are small text files stored on your device. We use:</p>
              <ul>
                <li><strong>Essential cookies</strong> — required for the website to function (e.g. shopping cart).</li>
                <li><strong>Analytics cookies</strong> — to understand how visitors use our site (e.g. Google Analytics).</li>
              </ul>
              <p>You can disable cookies in your browser settings, although this may affect website functionality.</p>
            </div>

            <div className="policy-section" id="security">
              <h2>6. Data Security</h2>
              <p>We take reasonable technical and organisational measures to protect your personal data from unauthorised access, loss, or misuse. Our website uses HTTPS encryption to secure data in transit.</p>
              <p>However, no method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.</p>
            </div>

            <div className="policy-section" id="rights">
              <h2>7. Your Rights</h2>
              <p>Under UK GDPR, you have the following rights regarding your personal data:</p>
              <ul>
                <li><strong>Right to access</strong> — request a copy of the data we hold about you.</li>
                <li><strong>Right to rectification</strong> — request correction of inaccurate data.</li>
                <li><strong>Right to erasure</strong> — request deletion of your data (&quot;right to be forgotten&quot;).</li>
                <li><strong>Right to restrict processing</strong> — request we limit how we use your data.</li>
                <li><strong>Right to data portability</strong> — request your data in a machine-readable format.</li>
                <li><strong>Right to object</strong> — object to processing of your data in certain circumstances.</li>
              </ul>
              <p>To exercise any of these rights, please contact us at firestick4uk@gmail.com.</p>
            </div>

            <div className="policy-section" id="retention">
              <h2>8. Data Retention</h2>
              <p>We retain your personal data for as long as necessary to fulfil the purposes outlined in this policy. Order data is typically retained for 6 years in accordance with UK tax and accounting requirements. You may request deletion of your data at any time, subject to legal obligations.</p>
            </div>

            <div className="policy-section" id="contact">
              <h2>9. Contact Us</h2>
              <p>If you have any questions about this Privacy Policy or how we handle your data, please contact us:</p>
              <div className="highlight-box">
                <p>📧 Email: firestick4uk@gmail.com<br />
                💬 WhatsApp: +447934519060<br />
                ✈️ Telegram: @firestick44<br />
                🌐 Website: firestick4uk.com</p>
              </div>
              <p>You also have the right to lodge a complaint with the Information Commissioner&apos;s Office (ICO) at ico.org.uk if you believe your data has been mishandled.</p>
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
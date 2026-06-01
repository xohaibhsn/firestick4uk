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

  .page-header { max-width:800px; margin:0 auto; padding:50px 24px 40px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:white; margin-bottom:14px; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .page-sub { color:rgba(255,255,255,0.5); font-size:15px; line-height:1.7; }

  /* CATEGORIES */
  .faq-categories { max-width:900px; margin:0 auto; padding:0 24px 40px;
    display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  .cat-btn { padding:8px 22px; border-radius:30px; font-size:13px; font-weight:500;
    cursor:pointer; transition:all 0.3s; border:1px solid rgba(139,0,255,0.3);
    background:rgba(139,0,255,0.06); color:rgba(255,255,255,0.6); }
  .cat-btn:hover { border-color:rgba(139,0,255,0.6); color:var(--purple-glow); }
  .cat-btn.active { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border-color:transparent; box-shadow:0 0 15px rgba(139,0,255,0.4); }

  /* FAQ LIST */
  .faq-section { max-width:800px; margin:0 auto; padding:0 24px; }
  .faq-group { margin-bottom:40px; }
  .faq-group-title { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:var(--purple-glow);
    margin-bottom:16px; padding-bottom:10px; border-bottom:1px solid rgba(139,0,255,0.15);
    letter-spacing:1px; }
  .faq-list { display:flex; flex-direction:column; gap:10px; }
  .faq-item { background:rgba(139,0,255,0.06); border:1px solid rgba(139,0,255,0.15);
    border-radius:14px; overflow:hidden; transition:all 0.3s; }
  .faq-item:hover { border-color:rgba(139,0,255,0.35); }
  .faq-item.open { border-color:rgba(139,0,255,0.45); background:rgba(139,0,255,0.1); }
  .faq-question { padding:18px 22px; cursor:pointer; display:flex; justify-content:space-between;
    align-items:center; gap:16px; }
  .faq-question-text { font-size:15px; font-weight:500; color:white; }
  .faq-arrow { color:var(--purple-glow); font-size:18px; transition:transform 0.3s; flex-shrink:0; }
  .faq-arrow.open { transform:rotate(180deg); }
  .faq-answer { padding:0 22px 18px; font-size:14px; color:rgba(255,255,255,0.55); line-height:1.8;
    border-top:1px solid rgba(139,0,255,0.1); padding-top:14px; }

  /* STILL NEED HELP */
  .help-section { max-width:800px; margin:50px auto 80px; padding:0 24px; }
  .help-box { background:linear-gradient(135deg,rgba(74,0,128,0.3),rgba(139,0,255,0.15));
    border:1px solid rgba(139,0,255,0.3); border-radius:24px; padding:50px 40px; text-align:center; }
  .help-title { font-family:'Cinzel',serif; font-size:clamp(20px,3vw,28px); font-weight:700; color:white; margin-bottom:12px; }
  .help-sub { color:rgba(255,255,255,0.5); font-size:15px; margin-bottom:30px; }
  .help-btns { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
  .btn-whatsapp { background:linear-gradient(135deg,#25d366,#128c7e); color:white; padding:14px 32px;
    border-radius:50px; text-decoration:none; font-size:14px; font-weight:600; transition:all 0.3s; }
  .btn-whatsapp:hover { box-shadow:0 0 25px rgba(37,211,102,0.5); transform:translateY(-2px); }
  .btn-contact { background:transparent; color:var(--purple-light); padding:14px 32px;
    border-radius:50px; text-decoration:none; font-size:14px; font-weight:600;
    border:1px solid rgba(139,0,255,0.5); transition:all 0.3s; }
  .btn-contact:hover { background:rgba(139,0,255,0.15); transform:translateY(-2px); }

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
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.15); }

  @media(max-width:768px){
    .help-box{padding:36px 24px;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
  }
`;

const faqs = {
  "Orders & Payment": [
    { q: "How do I place an order?", a: "Browse our products, add items to your cart, fill in your delivery details, choose your payment method (bank transfer or cash on delivery), and click Place Order. You'll receive an Order ID instantly." },
    { q: "What payment methods do you accept?", a: "We accept UK bank transfer and cash on delivery. For bank transfer, our account details are shown at checkout. Simply transfer the amount and upload your receipt — we verify it manually within a few hours." },
    { q: "How do I pay by bank transfer?", a: "At checkout, select Bank Transfer. Our UK bank account details will be displayed. Transfer the exact amount using the Order ID as your reference, then upload a screenshot of your receipt. We'll verify and confirm your order shortly." },
    { q: "Is cash on delivery available?", a: "Yes! Cash on delivery is available for physical products (Firestick and Android Boxes) delivered across the UK. Simply select this option at checkout." },
    { q: "Can I cancel my order?", a: "You can cancel your order before it has been dispatched. Please contact us via WhatsApp with your Order ID as soon as possible. Once dispatched, cancellations are not possible but you may be eligible for a return." },
  ],
  "Delivery & Shipping": [
    { q: "How long does delivery take?", a: "Physical items (Firestick and Android Boxes) are delivered within 2-3 working days across the UK. Subscription plans are activated digitally within a few hours of payment verification." },
    { q: "Do you deliver across the whole UK?", a: "Yes, we deliver to all mainland UK addresses. For remote locations such as Scottish Highlands or islands, delivery may take an extra 1-2 days." },
    { q: "How much does shipping cost?", a: "Shipping is free on subscription plans. For physical products, a standard shipping fee of £3.99 applies unless otherwise stated at checkout." },
    { q: "How do I track my order?", a: "Once your order is confirmed, use your Order ID on our Order Tracking page to check real-time status — from confirmation through to delivery." },
  ],
  "Products & Setup": [
    { q: "Do Firesticks come pre-configured?", a: "Yes! Our Firestick devices are pre-configured and ready to use straight out of the box. Simply plug in, connect to your Wi-Fi, and you're good to go." },
    { q: "What is a subscription plan?", a: "Our subscription plans give you access to premium content through compatible apps on your device. Plans are available monthly, 6-monthly, and yearly." },
    { q: "Which devices are compatible with the subscription plans?", a: "Our plans are compatible with Firestick, Android Boxes, Smart TVs, phones, tablets, and most other streaming devices." },
    { q: "What if my device stops working?", a: "Please contact us via WhatsApp with your Order ID and a description of the issue. We'll do our best to help resolve it quickly." },
  ],
  "Returns & Refunds": [
    { q: "What is your refund policy?", a: "We offer refunds on physical products within 14 days of delivery, provided the item is unused and in its original packaging. Subscription plans are non-refundable once activated. See our full Refund Policy for details." },
    { q: "How do I return an item?", a: "Contact us via WhatsApp or email with your Order ID and reason for return. We'll guide you through the process. Return postage costs are the responsibility of the customer unless the item is faulty." },
    { q: "What if I received a faulty item?", a: "We're sorry to hear that! Please contact us immediately via WhatsApp with photos of the fault. We'll arrange a replacement or full refund at no extra cost to you." },
  ],
};

const categories = ["All", ...Object.keys(faqs)];

export default function FAQPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [openItem, setOpenItem] = useState<string | null>(null);

  const toggle = (key: string) => setOpenItem(openItem === key ? null : key);

  const filteredFaqs = activeCategory === "All"
    ? faqs
    : { [activeCategory]: faqs[activeCategory as keyof typeof faqs] };

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
          <div className="section-tag">✦ Help Centre</div>
          <h1 className="page-title">Frequently Asked <span>Questions</span></h1>
          <p className="page-sub">Find quick answers to the most common questions about our products, orders and delivery.</p>
        </div>

        <div className="faq-categories">
          {categories.map(cat => (
            <button key={cat} className={`cat-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>

        <div className="faq-section">
          {Object.entries(filteredFaqs).map(([group, items]) => (
            <div className="faq-group" key={group}>
              <div className="faq-group-title">{group}</div>
              <div className="faq-list">
                {items.map((item, i) => {
                  const key = `${group}-${i}`;
                  const isOpen = openItem === key;
                  return (
                    <div className={`faq-item ${isOpen ? "open" : ""}`} key={key}>
                      <div className="faq-question" onClick={() => toggle(key)}>
                        <span className="faq-question-text">{item.q}</span>
                        <span className={`faq-arrow ${isOpen ? "open" : ""}`}>▼</span>
                      </div>
                      {isOpen && <div className="faq-answer">{item.a}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="help-section">
          <div className="help-box">
            <div className="help-title">Still Have Questions?</div>
            <p className="help-sub">Can&apos;t find the answer you&apos;re looking for? Our team is happy to help.</p>
            <div className="help-btns">
              <a href="https://wa.me/447934519060" className="btn-whatsapp" target="_blank" rel="noopener noreferrer">
                💬 WhatsApp Us
              </a>
              <a href="/contact" className="btn-contact">📧 Contact Form</a>
            </div>
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

      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
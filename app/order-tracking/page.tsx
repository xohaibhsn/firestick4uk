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

  .page-header { max-width:800px; margin:0 auto; padding:50px 24px 30px; text-align:center; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(28px,4vw,48px); font-weight:700; color:white; margin-bottom:14px; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .page-sub { color:rgba(255,255,255,0.5); font-size:15px; line-height:1.7; }

  /* SEARCH BOX */
  .search-section { max-width:600px; margin:0 auto; padding:30px 24px 0; }
  .search-box { display:flex; gap:12px; }
  .search-input { flex:1; background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.3);
    border-radius:50px; padding:16px 24px; color:white; font-family:'Raleway',sans-serif;
    font-size:15px; outline:none; transition:all 0.3s; }
  .search-input::placeholder { color:rgba(255,255,255,0.3); }
  .search-input:focus { border-color:var(--purple-glow); background:rgba(139,0,255,0.15); box-shadow:0 0 20px rgba(139,0,255,0.2); }
  .search-btn { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:16px 32px; border-radius:50px; font-size:14px;
    font-weight:600; cursor:pointer; transition:all 0.3s; white-space:nowrap; letter-spacing:0.5px; }
  .search-btn:hover { box-shadow:0 0 25px rgba(139,0,255,0.6); transform:translateY(-2px); }

  .error-msg { text-align:center; margin-top:20px; color:rgba(255,100,100,0.8); font-size:14px; }

  /* RESULT */
  .result-section { max-width:700px; margin:40px auto; padding:0 24px; }

  .order-card { background:linear-gradient(135deg,rgba(74,0,128,0.25),rgba(26,0,37,0.9));
    border:1px solid rgba(139,0,255,0.3); border-radius:24px; overflow:hidden;
    animation:fadeInUp 0.5s ease; }
  @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

  .order-card-header { padding:28px 32px; border-bottom:1px solid rgba(139,0,255,0.15);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
  .order-id-label { font-size:12px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:6px; }
  .order-id-value { font-family:'Cinzel',serif; font-size:20px; font-weight:700; color:white; }
  .order-status-badge { padding:8px 20px; border-radius:30px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; }
  .status-pending { background:rgba(255,180,0,0.15); border:1px solid rgba(255,180,0,0.4); color:#ffb400; }
  .status-confirmed { background:rgba(139,0,255,0.2); border:1px solid rgba(139,0,255,0.5); color:var(--purple-glow); }
  .status-dispatched { background:rgba(0,100,255,0.15); border:1px solid rgba(0,100,255,0.4); color:#6699ff; }
  .status-delivered { background:rgba(0,200,100,0.15); border:1px solid rgba(0,200,100,0.4); color:#00c864; }

  .order-card-body { padding:28px 32px; }

  /* ORDER ITEMS */
  .order-items { margin-bottom:28px; }
  .order-items h4 { font-size:12px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:14px; }
  .order-item-row { display:flex; justify-content:space-between; align-items:center;
    padding:12px 0; border-bottom:1px solid rgba(139,0,255,0.1); font-size:14px; }
  .order-item-row:last-child { border:none; }
  .order-item-name { color:white; font-weight:500; }
  .order-item-price { color:var(--purple-glow); font-weight:700; font-family:'Cinzel',serif; }

  .order-total-row { display:flex; justify-content:space-between; padding:14px 0;
    border-top:1px solid rgba(139,0,255,0.2); font-size:16px; }
  .order-total-row span:first-child { font-family:'Cinzel',serif; font-weight:700; }
  .order-total-row span:last-child { font-family:'Cinzel',serif; font-weight:700; color:var(--purple-glow); font-size:20px; }

  /* PROGRESS TRACKER */
  .progress-section { margin-top:28px; }
  .progress-section h4 { font-size:12px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:20px; }

  .steps { display:flex; flex-direction:column; gap:0; }
  .step { display:flex; gap:16px; position:relative; }
  .step-left { display:flex; flex-direction:column; align-items:center; width:32px; flex-shrink:0; }
  .step-dot-outer { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .step-dot-outer.done { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)); box-shadow:0 0 15px rgba(139,0,255,0.5); }
  .step-dot-outer.active { background:linear-gradient(135deg,#b8860b,var(--gold)); box-shadow:0 0 15px rgba(255,215,0,0.5); animation:pulse 2s ease-in-out infinite; }
  .step-dot-outer.inactive { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); }
  @keyframes pulse { 0%,100%{box-shadow:0 0 15px rgba(255,215,0,0.5)} 50%{box-shadow:0 0 25px rgba(255,215,0,0.8)} }
  .step-dot-icon { font-size:14px; }
  .step-line { width:2px; flex:1; min-height:20px; background:rgba(139,0,255,0.2); margin:2px 0; }
  .step-line.done { background:linear-gradient(to bottom,var(--purple-bright),rgba(139,0,255,0.3)); }
  .step-content { padding:4px 0 24px; flex:1; }
  .step-title { font-size:15px; font-weight:600; color:white; margin-bottom:4px; }
  .step-title.inactive { color:rgba(255,255,255,0.4); }
  .step-desc { font-size:13px; color:rgba(255,255,255,0.4); line-height:1.5; }
  .step-time { font-size:11px; color:var(--purple-glow); margin-top:4px; letter-spacing:0.5px; }

  /* CUSTOMER INFO */
  .customer-info { background:rgba(139,0,255,0.06); border:1px solid rgba(139,0,255,0.12);
    border-radius:14px; padding:20px; margin-top:20px; }
  .customer-info h4 { font-size:12px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:14px; }
  .info-row { display:flex; justify-content:space-between; padding:7px 0;
    border-bottom:1px solid rgba(139,0,255,0.08); font-size:13px; }
  .info-row:last-child { border:none; }
  .info-row span:first-child { color:rgba(255,255,255,0.45); }
  .info-row span:last-child { color:white; font-weight:500; }

  /* HELP */
  .help-section { max-width:700px; margin:0 auto 80px; padding:0 24px; }
  .help-card { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:16px; padding:28px 32px;
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .help-text h4 { font-family:'Cinzel',serif; font-size:16px; margin-bottom:6px; }
  .help-text p { font-size:13px; color:rgba(255,255,255,0.5); }
  .wa-btn { background:linear-gradient(135deg,#25d366,#128c7e); color:white; padding:12px 28px;
    border-radius:50px; text-decoration:none; font-size:14px; font-weight:600; transition:all 0.3s; }
  .wa-btn:hover { box-shadow:0 0 20px rgba(37,211,102,0.5); transform:translateY(-2px); }

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

  @media(max-width:600px){
    .order-card-header{flex-direction:column;align-items:flex-start;}
    .search-box{flex-direction:column;}
    .search-btn{width:100%;}
    footer{padding:30px 24px;flex-direction:column;text-align:center;}
    .help-card{flex-direction:column;text-align:center;}
  }
`;

type OrderResult = {
  id: string; status: "pending" | "confirmed" | "dispatched" | "delivered";
  items: { name: string; price: number; qty: number }[];
  total: number; name: string; email: string; phone: string; address: string; date: string;
};

const statusSteps = [
  { key: "pending", icon: "🕐", title: "Order Received", desc: "We have received your order and payment receipt." },
  { key: "confirmed", icon: "✅", title: "Payment Verified", desc: "Your payment has been verified and order confirmed." },
  { key: "dispatched", icon: "🚚", title: "Dispatched", desc: "Your order is on its way! Delivery in 2-3 working days." },
  { key: "delivered", icon: "📦", title: "Delivered", desc: "Your order has been delivered. Enjoy!" },
];

const statusOrder = ["pending", "confirmed", "dispatched", "delivered"];

export default function OrderTrackingPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setResult(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/track?order_id=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && data.order) {
        const o = data.order;
        const items = (data.items || []).map((it: any) => ({
          name: it.product_name,
          price: parseFloat(it.price),
          qty: it.quantity,
        }));
        setResult({
          id: o.order_id,
          status: o.status,
          items,
          total: parseFloat(o.total),
          name: o.customer_name,
          email: o.customer_email,
          phone: o.customer_phone,
          address: [o.delivery_address, o.city, o.postcode].filter(Boolean).join(", "),
          date: o.created_at ? new Date(o.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" }) : "",
        });
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
    setSearching(false);
  };

  const currentStatusIndex = result ? statusOrder.indexOf(result.status) : -1;

  const statusBadgeClass = (status: string) => {
    if (status === "pending") return "order-status-badge status-pending";
    if (status === "confirmed") return "order-status-badge status-confirmed";
    if (status === "dispatched") return "order-status-badge status-dispatched";
    return "order-status-badge status-delivered";
  };

  const statusLabel = (status: string) => {
    if (status === "pending") return "⏳ Pending Verification";
    if (status === "confirmed") return "✅ Confirmed";
    if (status === "dispatched") return "🚚 Dispatched";
    return "📦 Delivered";
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
          <div className="section-tag">✦ Order Tracking</div>
          <h1 className="page-title">Track Your <span>Order</span></h1>
          <p className="page-sub">Enter your Order ID to check the latest status of your order.</p>
        </div>

        <div className="search-section">
          <div className="search-box">
            <input
              className="search-input"
              type="text"
              placeholder="e.g. FK44-62305"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
            <button className="search-btn" onClick={handleSearch} disabled={searching}>{searching ? "Searching..." : "Track Order"}</button>
          </div>
          {notFound && <p className="error-msg">❌ Order not found. Please check your Order ID and try again.</p>}
        </div>

        {result && (
          <div className="result-section">
            <div className="order-card">
              <div className="order-card-header">
                <div>
                  <div className="order-id-label">Order ID</div>
                  <div className="order-id-value">{result.id}</div>
                </div>
                <div className={statusBadgeClass(result.status)}>{statusLabel(result.status)}</div>
              </div>

              <div className="order-card-body">
                {/* Items */}
                <div className="order-items">
                  <h4>Items Ordered</h4>
                  {result.items.map((item, i) => (
                    <div className="order-item-row" key={i}>
                      <span className="order-item-name">{item.name} × {item.qty}</span>
                      <span className="order-item-price">£{(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="order-total-row">
                    <span>Total</span>
                    <span>£{result.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Progress */}
                <div className="progress-section">
                  <h4>Order Progress</h4>
                  <div className="steps">
                    {statusSteps.map((step, i) => {
                      const isDone = i < currentStatusIndex;
                      const isActive = i === currentStatusIndex;
                      const isInactive = i > currentStatusIndex;
                      const isLast = i === statusSteps.length - 1;
                      return (
                        <div className="step" key={step.key}>
                          <div className="step-left">
                            <div className={`step-dot-outer ${isDone ? "done" : isActive ? "active" : "inactive"}`}>
                              <span className="step-dot-icon">{step.icon}</span>
                            </div>
                            {!isLast && <div className={`step-line ${isDone ? "done" : ""}`} />}
                          </div>
                          <div className="step-content">
                            <div className={`step-title ${isInactive ? "inactive" : ""}`}>{step.title}</div>
                            <div className="step-desc">{step.desc}</div>
                            {(isDone || isActive) && (
                              <div className="step-time">{isActive ? "Current Status" : "Completed"} — {result.date}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Customer Info */}
                <div className="customer-info">
                  <h4>Delivery Details</h4>
                  <div className="info-row"><span>Name</span><span>{result.name}</span></div>
                  <div className="info-row"><span>Email</span><span>{result.email}</span></div>
                  <div className="info-row"><span>Phone</span><span>{result.phone}</span></div>
                  <div className="info-row"><span>Address</span><span>{result.address}</span></div>
                  <div className="info-row"><span>Order Date</span><span>{result.date}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help */}
        <div className="help-section" style={{ marginTop: result ? "24px" : "50px" }}>
          <div className="help-card">
            <div className="help-text">
              <h4>Need Help?</h4>
              <p>Can&apos;t find your order or have a question? Chat with us on WhatsApp.</p>
            </div>
            <a href="https://wa.me/447934519060" className="wa-btn" target="_blank" rel="noopener noreferrer">
              💬 WhatsApp Us
            </a>
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
"use client";
import { useState } from "react";

const navStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --purple-deep: #0d0010; --purple-mid: #4a0080; --purple-bright: #8b00ff;
    --purple-glow: #bf5fff; --purple-light: #e0b3ff; --gold: #ffd700;
  }
  body { background: var(--purple-deep); color: #fff; font-family: 'Raleway', sans-serif; overflow-x: hidden; }
  .bg-fixed { position:fixed; inset:0; z-index:0;
    background: radial-gradient(ellipse at 20% 20%, #2d0050 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, #1a0035 0%, transparent 50%), #0a0010; }

  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px;
    display:flex; align-items:center; justify-content:space-between;
    background:rgba(13,0,16,0.96); backdrop-filter:blur(20px);
    border-bottom:1px solid rgba(139,0,255,0.2); }
  .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:36px; list-style:none; }
  .nav-links a { color:rgba(255,255,255,0.8); text-decoration:none; font-size:13px;
    font-weight:500; letter-spacing:1.5px; text-transform:uppercase; transition:color 0.3s; }
  .nav-links a:hover { color:var(--purple-glow); }
  .nav-cta { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright)) !important;
    color:white !important; padding:10px 24px !important; border-radius:30px !important; font-weight:600 !important; }
  .hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:5px; z-index:101; }
  .hamburger span { display:block; width:25px; height:2px; background:var(--purple-glow); }
  @media(max-width:768px){
    nav{padding:16px 24px;}
    .nav-links{display:none;}
    .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(13,0,16,0.98);align-items:center;justify-content:center;gap:28px;z-index:99;}
    .hamburger{display:flex;}
  }

  .page-wrapper { position:relative; z-index:1; padding-top:100px; min-height:100vh; }
  .page-header { max-width:1200px; margin:0 auto; padding:50px 60px 30px; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:var(--purple-glow); margin-bottom:12px; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(26px,3.5vw,44px); font-weight:700; color:white; }
  .page-title span { background:linear-gradient(135deg,var(--purple-glow),var(--gold)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }

  /* CART LAYOUT */
  .cart-layout { max-width:1200px; margin:0 auto; padding:0 60px 80px; display:grid; grid-template-columns:1fr 380px; gap:30px; }

  /* CART ITEMS */
  .cart-items { display:flex; flex-direction:column; gap:16px; }

  .cart-empty { text-align:center; padding:80px 40px;
    background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:20px; }
  .cart-empty-icon { font-size:60px; margin-bottom:20px; display:block; }
  .cart-empty h3 { font-family:'Cinzel',serif; font-size:22px; margin-bottom:12px; }
  .cart-empty p { color:rgba(255,255,255,0.5); font-size:14px; margin-bottom:30px; }

  .cart-item {
    display:grid; grid-template-columns:100px 1fr auto;
    gap:20px; align-items:center;
    background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:16px;
    padding:20px; transition:all 0.3s;
  }
  .cart-item:hover { border-color:rgba(139,0,255,0.5); }
  .cart-item-image { width:100px; height:100px; border-radius:12px;
    background:linear-gradient(135deg,rgba(74,0,128,0.4),rgba(139,0,255,0.15));
    border:1px solid rgba(139,0,255,0.2);
    display:flex; align-items:center; justify-content:center;
    font-size:36px; flex-shrink:0; }
  .cart-item-details { flex:1; }
  .cart-item-name { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:white; margin-bottom:6px; }
  .cart-item-price { font-size:18px; font-weight:700; color:var(--purple-glow); font-family:'Cinzel',serif; }
  .cart-item-actions { display:flex; flex-direction:column; align-items:flex-end; gap:12px; }
  .qty-control { display:flex; align-items:center; gap:10px; }
  .qty-btn { width:32px; height:32px; border-radius:50%; border:1px solid rgba(139,0,255,0.4);
    background:rgba(139,0,255,0.1); color:white; font-size:16px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
  .qty-btn:hover { background:rgba(139,0,255,0.3); border-color:var(--purple-glow); }
  .qty-num { font-size:16px; font-weight:600; min-width:20px; text-align:center; }
  .remove-btn { background:none; border:none; color:rgba(255,100,100,0.6); font-size:13px;
    cursor:pointer; transition:color 0.2s; letter-spacing:0.5px; }
  .remove-btn:hover { color:rgba(255,100,100,1); }

  /* ORDER SUMMARY */
  .order-summary { position:sticky; top:100px; height:fit-content;
    background:linear-gradient(135deg,rgba(74,0,128,0.25),rgba(26,0,37,0.9));
    border:1px solid rgba(139,0,255,0.25); border-radius:20px; overflow:hidden; }
  .summary-header { padding:24px 28px; border-bottom:1px solid rgba(139,0,255,0.15); }
  .summary-header h3 { font-family:'Cinzel',serif; font-size:18px; font-weight:700; }
  .summary-body { padding:24px 28px; display:flex; flex-direction:column; gap:14px; }
  .summary-row { display:flex; justify-content:space-between; align-items:center; font-size:14px; }
  .summary-row span:first-child { color:rgba(255,255,255,0.6); }
  .summary-row span:last-child { color:white; font-weight:500; }
  .summary-divider { border:none; border-top:1px solid rgba(139,0,255,0.15); margin:4px 0; }
  .summary-total { font-size:18px !important; }
  .summary-total span:first-child { color:white !important; font-weight:700; font-family:'Cinzel',serif; }
  .summary-total span:last-child { color:var(--purple-glow) !important; font-weight:700; font-family:'Cinzel',serif; font-size:22px; }
  .checkout-btn { margin:0 28px 28px;
    background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:16px; border-radius:50px; width:calc(100% - 56px);
    font-size:15px; font-weight:600; letter-spacing:1px; cursor:pointer;
    box-shadow:0 0 25px rgba(139,0,255,0.4); transition:all 0.3s; }
  .checkout-btn:hover { box-shadow:0 0 40px rgba(139,0,255,0.7); transform:translateY(-2px); }
  .checkout-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }

  /* CHECKOUT FORM */
  .checkout-section { max-width:1200px; margin:0 auto; padding:0 60px 80px; }
  .checkout-grid { display:grid; grid-template-columns:1fr 1fr; gap:30px; }
  .form-section { background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.8));
    border:1px solid rgba(139,0,255,0.2); border-radius:20px; padding:32px; }
  .form-section h3 { font-family:'Cinzel',serif; font-size:18px; font-weight:700; margin-bottom:24px;
    padding-bottom:14px; border-bottom:1px solid rgba(139,0,255,0.15); }
  .form-group { margin-bottom:18px; }
  .form-group label { display:block; font-size:12px; letter-spacing:2px; text-transform:uppercase;
    color:rgba(255,255,255,0.5); margin-bottom:8px; }
  .form-group input, .form-group select, .form-group textarea {
    width:100%; background:rgba(139,0,255,0.08); border:1px solid rgba(139,0,255,0.25);
    border-radius:10px; padding:12px 16px; color:white; font-family:'Raleway',sans-serif;
    font-size:14px; transition:all 0.3s; outline:none; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color:var(--purple-glow); background:rgba(139,0,255,0.15);
    box-shadow:0 0 15px rgba(139,0,255,0.2); }
  .form-group select option { background:#1a0025; }
  .form-group textarea { resize:vertical; min-height:80px; }

  /* PAYMENT OPTIONS */
  .payment-options { display:flex; flex-direction:column; gap:12px; margin-bottom:20px; }
  .payment-option { display:flex; align-items:center; gap:14px; padding:16px 20px;
    border:1px solid rgba(139,0,255,0.2); border-radius:12px; cursor:pointer;
    transition:all 0.3s; background:rgba(139,0,255,0.05); }
  .payment-option:hover { border-color:rgba(139,0,255,0.5); background:rgba(139,0,255,0.1); }
  .payment-option.selected { border-color:var(--purple-glow); background:rgba(139,0,255,0.15); box-shadow:0 0 15px rgba(139,0,255,0.2); }
  .payment-option input[type="radio"] { accent-color:var(--purple-glow); width:16px; height:16px; }
  .payment-option-label { font-size:15px; font-weight:500; }
  .payment-option-sub { font-size:12px; color:rgba(255,255,255,0.4); margin-top:2px; }

  /* BANK DETAILS BOX */
  .bank-details { background:rgba(139,0,255,0.1); border:1px solid rgba(139,0,255,0.3);
    border-radius:12px; padding:20px; margin-bottom:20px; }
  .bank-details h4 { font-size:13px; letter-spacing:2px; text-transform:uppercase;
    color:var(--purple-glow); margin-bottom:14px; }
  .bank-row { display:flex; justify-content:space-between; padding:8px 0;
    border-bottom:1px solid rgba(139,0,255,0.1); font-size:14px; }
  .bank-row:last-child { border:none; }
  .bank-row span:first-child { color:rgba(255,255,255,0.5); }
  .bank-row span:last-child { color:white; font-weight:600; }

  /* RECEIPT UPLOAD */
  .upload-area { border:2px dashed rgba(139,0,255,0.4); border-radius:12px; padding:30px;
    text-align:center; cursor:pointer; transition:all 0.3s; position:relative; }
  .upload-area:hover { border-color:var(--purple-glow); background:rgba(139,0,255,0.08); }
  .upload-area.has-file { border-color:var(--purple-glow); background:rgba(139,0,255,0.1); }
  .upload-icon { font-size:36px; margin-bottom:10px; display:block; }
  .upload-text { font-size:14px; color:rgba(255,255,255,0.5); }
  .upload-text strong { color:var(--purple-glow); }
  .upload-area input[type="file"] { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; }
  .file-name { font-size:13px; color:var(--purple-glow); margin-top:8px; font-weight:600; }

  /* PLACE ORDER BTN */
  .place-order-btn { width:100%; background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; border:none; padding:18px; border-radius:50px; font-size:16px;
    font-weight:700; letter-spacing:1.5px; text-transform:uppercase; cursor:pointer;
    box-shadow:0 0 30px rgba(139,0,255,0.4); transition:all 0.3s; margin-top:10px; }
  .place-order-btn:hover { box-shadow:0 0 50px rgba(139,0,255,0.7); transform:translateY(-3px); }
  .place-order-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }

  /* SUCCESS */
  .success-screen { max-width:600px; margin:60px auto; padding:0 24px 80px;
    text-align:center; position:relative; z-index:1; }
  .success-icon { font-size:80px; margin-bottom:24px; display:block; animation:popIn 0.5s ease; }
  @keyframes popIn { from{transform:scale(0)} to{transform:scale(1)} }
  .success-title { font-family:'Cinzel',serif; font-size:32px; font-weight:700; margin-bottom:14px;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .success-sub { color:rgba(255,255,255,0.6); font-size:15px; line-height:1.7; margin-bottom:10px; }
  .order-id { font-family:'Cinzel',serif; font-size:18px; color:var(--gold); margin:20px 0; }
  .status-box { background:linear-gradient(135deg,rgba(74,0,128,0.3),rgba(26,0,37,0.9));
    border:1px solid rgba(139,0,255,0.3); border-radius:16px; padding:24px;
    margin:24px 0; text-align:left; }
  .status-step { display:flex; align-items:center; gap:14px; padding:10px 0;
    border-bottom:1px solid rgba(139,0,255,0.1); }
  .status-step:last-child { border:none; }
  .step-dot { width:10px; height:10px; border-radius:50%; background:var(--purple-glow); flex-shrink:0; }
  .step-dot.active { background:var(--gold); box-shadow:0 0 10px var(--gold); }
  .step-dot.inactive { background:rgba(255,255,255,0.2); }
  .step-text { font-size:14px; }
  .step-text strong { color:white; display:block; margin-bottom:2px; }
  .step-text span { color:rgba(255,255,255,0.4); font-size:12px; }

  .btn-primary { background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));
    color:white; padding:15px 40px; border-radius:50px; font-size:14px; font-weight:600;
    letter-spacing:1.5px; text-transform:uppercase; text-decoration:none;
    box-shadow:0 0 25px rgba(139,0,255,0.4); transition:all 0.3s; display:inline-block; margin-top:10px; }
  .btn-primary:hover { box-shadow:0 0 45px rgba(139,0,255,0.7); transform:translateY(-3px); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px;
    border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.15); }

  footer { position:relative; z-index:1; padding:40px 60px;
    border-top:1px solid rgba(139,0,255,0.15);
    display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900;
    background:linear-gradient(135deg,var(--purple-glow),var(--gold));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.3); }

  @media(max-width:900px){
    .cart-layout { grid-template-columns:1fr; padding:0 24px 60px; }
    .order-summary { position:static; }
    .checkout-grid { grid-template-columns:1fr; }
    .checkout-section { padding:0 24px 60px; }
    .page-header { padding:40px 24px 24px; }
    footer { padding:30px 24px; flex-direction:column; text-align:center; }
  }
`;

// Dummy cart items
const initialCart = [
  { id: 2, name: "B1G 6 Month Plan", price: 49.99, qty: 1, emoji: "📦" },
  { id: 4, name: "Firestick 4K", price: 39.99, qty: 1, emoji: "🔥" },
];

type Step = "cart" | "checkout" | "success";

export default function CartPage() {
  const [cart, setCart] = useState(initialCart);
  const [step, setStep] = useState<Step>("cart");
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "cod">("bank");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [orderId] = useState("FK44-" + Math.floor(10000 + Math.random() * 90000));

  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", postcode: "", notes: ""
  });

  const updateQty = (id: number, delta: number) => {
    setCart(cart.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  };
  const removeItem = (id: number) => setCart(cart.filter(i => i.id !== id));
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = cart.some(i => i.name.toLowerCase().includes("plan")) ? 0 : 3.99;
  const total = subtotal + shipping;

  const handleOrder = () => {
    if (!form.name || !form.email || !form.phone || !form.address) return;
    if (paymentMethod === "bank" && !receiptFile) return;
    setStep("success");
  };

  if (step === "success") {
    return (
      <>
        <style>{navStyles}</style>
        <div className="bg-fixed" />
        <nav>
          <a href="/" className="nav-logo">FIRESTICK44UK</a>
          <ul className="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/products">Products</a></li>
            <li><a href="/order-tracking">Track Order</a></li>
          </ul>
        </nav>
        <div className="success-screen">
          <span className="success-icon">✅</span>
          <h2 className="success-title">Order Placed!</h2>
          <p className="success-sub">Thank you for your order. We have received your details and will verify your payment shortly.</p>
          <div className="order-id">Order ID: {orderId}</div>
          <div className="status-box">
            <div className="status-step">
              <div className="step-dot active" />
              <div className="step-text"><strong>Order Received</strong><span>Just now</span></div>
            </div>
            <div className="status-step">
              <div className="step-dot inactive" />
              <div className="step-text"><strong>Payment Verification</strong><span>Pending — usually within 2 hours</span></div>
            </div>
            <div className="status-step">
              <div className="step-dot inactive" />
              <div className="step-text"><strong>Order Confirmed</strong><span>After payment verified</span></div>
            </div>
            <div className="status-step">
              <div className="step-dot inactive" />
              <div className="step-text"><strong>Dispatched / Activated</strong><span>Within 24 hours</span></div>
            </div>
            <div className="status-step">
              <div className="step-dot inactive" />
              <div className="step-text"><strong>Delivered</strong><span>2–3 working days</span></div>
            </div>
          </div>
          <p className="success-sub">Use your Order ID to track your order anytime.</p>
          <a href="/order-tracking" className="btn-primary">Track My Order</a>
        </div>
        <footer>
          <div className="footer-logo">FIRESTICK44UK</div>
          <div className="footer-copy">© 2026 Firestick44UK. All rights reserved.</div>
        </footer>
        <a href="https://wa.me/447000000000" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
      </>
    );
  }

  return (
    <>
      <style>{navStyles}</style>
      <div className="bg-fixed" />

      <nav>
        <a href="/" className="nav-logo">FIRESTICK44UK</a>
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
          <div className="section-tag">✦ {step === "cart" ? "Your Cart" : "Checkout"}</div>
          <h1 className="page-title">{step === "cart" ? <>My <span>Cart</span></> : <>Complete <span>Order</span></>}</h1>
        </div>

        {step === "cart" && (
          <>
            <div className="cart-layout">
              {/* ITEMS */}
              <div className="cart-items">
                {cart.length === 0 ? (
                  <div className="cart-empty">
                    <span className="cart-empty-icon">🛒</span>
                    <h3>Your cart is empty</h3>
                    <p>Add some products to get started!</p>
                    <a href="/" className="btn-primary">Browse Products</a>
                  </div>
                ) : (
                  cart.map(item => (
                    <div className="cart-item" key={item.id}>
                      <div className="cart-item-image">{item.emoji}</div>
                      <div className="cart-item-details">
                        <div className="cart-item-name">{item.name}</div>
                        <div className="cart-item-price">£{(item.price * item.qty).toFixed(2)}</div>
                      </div>
                      <div className="cart-item-actions">
                        <div className="qty-control">
                          <button className="qty-btn" onClick={() => updateQty(item.id, -1)}>−</button>
                          <span className="qty-num">{item.qty}</span>
                          <button className="qty-btn" onClick={() => updateQty(item.id, 1)}>+</button>
                        </div>
                        <button className="remove-btn" onClick={() => removeItem(item.id)}>✕ Remove</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* SUMMARY */}
              <div className="order-summary">
                <div className="summary-header"><h3>Order Summary</h3></div>
                <div className="summary-body">
                  <div className="summary-row"><span>Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
                  <div className="summary-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : `£${shipping.toFixed(2)}`}</span></div>
                  <hr className="summary-divider" />
                  <div className="summary-row summary-total"><span>Total</span><span>£{total.toFixed(2)}</span></div>
                </div>
                <button className="checkout-btn" disabled={cart.length === 0} onClick={() => setStep("checkout")}>
                  Proceed to Checkout →
                </button>
              </div>
            </div>
          </>
        )}

        {step === "checkout" && (
          <div className="checkout-section">
            <div className="checkout-grid">
              {/* LEFT — Customer Details */}
              <div>
                <div className="form-section" style={{ marginBottom: "24px" }}>
                  <h3>Your Details</h3>
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input type="text" placeholder="John Smith" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Email Address *</label>
                    <input type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>WhatsApp / Phone *</label>
                    <input type="tel" placeholder="+44 7000 000000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Delivery Address *</label>
                    <input type="text" placeholder="123 High Street" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div className="form-group">
                      <label>City</label>
                      <input type="text" placeholder="London" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Postcode</label>
                      <input type="text" placeholder="SW1A 1AA" value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Order Notes (Optional)</label>
                    <textarea placeholder="Any special instructions..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* RIGHT — Payment */}
              <div>
                <div className="form-section">
                  <h3>Payment Method</h3>
                  <div className="payment-options">
                    <div className={`payment-option ${paymentMethod === "bank" ? "selected" : ""}`} onClick={() => setPaymentMethod("bank")}>
                      <input type="radio" name="payment" readOnly checked={paymentMethod === "bank"} />
                      <div>
                        <div className="payment-option-label">🏦 Bank Transfer</div>
                        <div className="payment-option-sub">Transfer to our UK bank & upload receipt</div>
                      </div>
                    </div>
                    <div className={`payment-option ${paymentMethod === "cod" ? "selected" : ""}`} onClick={() => setPaymentMethod("cod")}>
                      <input type="radio" name="payment" readOnly checked={paymentMethod === "cod"} />
                      <div>
                        <div className="payment-option-label">💵 Cash on Delivery</div>
                        <div className="payment-option-sub">Pay when your order arrives</div>
                      </div>
                    </div>
                  </div>

                  {paymentMethod === "bank" && (
                    <>
                      <div className="bank-details">
                        <h4>Bank Account Details</h4>
                        <div className="bank-row"><span>Account Name</span><span>Firestick44UK Ltd</span></div>
                        <div className="bank-row"><span>Sort Code</span><span>12-34-56</span></div>
                        <div className="bank-row"><span>Account No.</span><span>12345678</span></div>
                        <div className="bank-row"><span>Amount to Send</span><span>£{total.toFixed(2)}</span></div>
                        <div className="bank-row"><span>Reference</span><span>{orderId}</span></div>
                      </div>
                      <div className="form-group">
                        <label>Upload Payment Receipt *</label>
                        <div className={`upload-area ${receiptFile ? "has-file" : ""}`}>
                          <span className="upload-icon">{receiptFile ? "✅" : "📎"}</span>
                          <div className="upload-text">
                            {receiptFile ? <strong>{receiptFile.name}</strong> : <><strong>Click to upload</strong> your receipt<br />JPG, PNG or PDF</>}
                          </div>
                          <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                    </>
                  )}

                  {paymentMethod === "cod" && (
                    <div className="bank-details">
                      <h4>Cash on Delivery</h4>
                      <div className="bank-row"><span>Amount Due</span><span>£{total.toFixed(2)}</span></div>
                      <div className="bank-row"><span>When</span><span>On delivery</span></div>
                    </div>
                  )}

                  <div className="summary-body" style={{ background: "rgba(139,0,255,0.05)", borderRadius: "12px", marginBottom: "16px" }}>
                    <div className="summary-row"><span>Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
                    <div className="summary-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : `£${shipping.toFixed(2)}`}</span></div>
                    <hr className="summary-divider" />
                    <div className="summary-row summary-total"><span>Total</span><span>£{total.toFixed(2)}</span></div>
                  </div>

                  <button className="place-order-btn"
                    disabled={!form.name || !form.email || !form.phone || !form.address || (paymentMethod === "bank" && !receiptFile)}
                    onClick={handleOrder}>
                    Place Order →
                  </button>
                  <button onClick={() => setStep("cart")} style={{ width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "12px", cursor: "pointer" }}>
                    ← Back to Cart
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <footer>
          <div className="footer-logo">FIRESTICK44UK</div>
          <div className="footer-copy">© 2026 Firestick44UK. All rights reserved.</div>
        </footer>
      </div>

      <a href="https://wa.me/447000000000" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
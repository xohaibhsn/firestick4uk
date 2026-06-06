"use client";
export const dynamic = 'force-dynamic';
import { useEffect, useState } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  body { background:#FFFFFF; color:#111111; font-family:'Raleway',sans-serif; }
  nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:18px 60px; display:flex; align-items:center; justify-content:space-between; background:#FFFFFF; border-bottom:1px solid #E5E5E5; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .nav-logo { font-family:'Cinzel',serif; font-size:20px; font-weight:900; color:#111111; text-decoration:none; letter-spacing:2px; }
  .nav-links { display:flex; gap:28px; list-style:none; }
  .nav-links a { color:#111; text-decoration:none; font-size:13px; font-weight:500; letter-spacing:1.5px; text-transform:uppercase; }
  @media(max-width:768px){ nav{padding:16px 24px;} .nav-links{gap:18px;} }

  .page { padding-top:100px; min-height:100vh; background:#FFFFFF; }
  .container { max-width:660px; margin:0 auto; padding:40px 24px 80px; }

  .check-wrapper { display:flex; justify-content:center; margin-bottom:28px; }
  .check-circle { width:90px; height:90px; border-radius:50%; background:linear-gradient(135deg,#16A34A,#22C55E); display:flex; align-items:center; justify-content:center; animation:popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both; box-shadow:0 8px 30px rgba(22,163,74,0.35); }
  .check-circle svg { width:46px; height:46px; stroke:#fff; stroke-width:3.5; fill:none; stroke-linecap:round; stroke-linejoin:round; }
  .check-path { stroke-dasharray:60; stroke-dashoffset:60; animation:drawCheck 0.4s ease 0.4s forwards; }
  @keyframes popIn { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes drawCheck { to { stroke-dashoffset:0 } }

  .title { font-family:'Cinzel',serif; font-size:clamp(22px,4vw,30px); font-weight:700; color:#111; text-align:center; margin-bottom:8px; }
  .subtitle { color:#666; font-size:15px; text-align:center; line-height:1.7; margin-bottom:24px; }

  .order-id-box { background:#F5F3FF; border:1px solid #DDD6FE; border-radius:12px; padding:14px 20px; text-align:center; margin-bottom:24px; }
  .order-id-label { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#7C3AED; margin-bottom:4px; font-weight:700; }
  .order-id-value { font-family:'Cinzel',serif; font-size:20px; font-weight:700; color:#5B21B6; }

  .card { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:14px; overflow:hidden; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
  .card-header { padding:12px 18px; background:#FAFAFA; border-bottom:1px solid #F0F0F0; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700; color:#555; }
  .card-body { padding:18px; }

  .items-table { width:100%; border-collapse:collapse; }
  .items-table th { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#888; font-weight:700; padding:0 0 10px; text-align:left; }
  .items-table th:last-child { text-align:right; }
  .items-table td { padding:9px 0; border-top:1px solid #F5F5F5; font-size:14px; color:#111; vertical-align:middle; }
  .items-table td:last-child { text-align:right; font-weight:600; color:#5B21B6; white-space:nowrap; }
  .item-name { font-weight:600; }
  .item-qty { font-size:12px; color:#999; margin-top:2px; }

  .breakdown-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; font-size:14px; border-bottom:1px solid #F8F8F8; }
  .breakdown-row:last-child { border:none; }
  .breakdown-label { color:#666; }
  .breakdown-value { font-weight:600; color:#111; }
  .breakdown-discount { color:#16A34A !important; }
  .breakdown-total { padding-top:12px !important; border-top:2px solid #E5E5E5 !important; border-bottom:none !important; margin-top:4px; }
  .breakdown-total .breakdown-label { color:#111; font-weight:700; font-size:15px; }
  .breakdown-total .breakdown-value { color:#5B21B6 !important; font-size:21px; font-family:'Cinzel',serif; }

  .wa-btn { display:flex; align-items:center; justify-content:center; gap:10px; background:linear-gradient(135deg,#25d366,#128c7e); color:#FFFFFF !important; text-decoration:none; padding:15px 28px; border-radius:50px; font-size:14px; font-weight:700; letter-spacing:0.3px; box-shadow:0 4px 20px rgba(37,211,102,0.4); transition:all 0.2s; margin-bottom:10px; text-align:center; line-height:1.4; }
  .wa-btn:hover { transform:translateY(-2px); box-shadow:0 6px 28px rgba(37,211,102,0.5); }
  .wa-optional { font-size:11px; color:#999; text-align:center; margin-bottom:24px; line-height:1.5; }

  .track-btn { display:block; text-align:center; background:#111; color:#fff !important; text-decoration:none; padding:14px 28px; border-radius:9px; font-size:13px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; transition:all 0.2s; }
  .track-btn:hover { background:#5B21B6; transform:translateY(-1px); }

  footer { background:#111; padding:40px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:16px; font-weight:900; color:#fff; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }
  @media(max-width:768px){ footer{padding:32px 24px;flex-direction:column;text-align:center;} }
`;

interface OrderSnapshot {
  orderId: string;
  items: { id: string; name: string; price: number; qty: number }[];
  subtotal: number;
  shipping: number;
  vatAmount: number;
  discountAmount: number;
  grandTotal: number;
  couponApplied: { code: string } | null;
  form: { name: string; email: string; phone: string; address: string; city: string; postcode: string; notes: string };
  paymentMethod: string;
  waMessage: string;
}

export default function CartSuccessPage() {
  const [snap, setSnap] = useState<OrderSnapshot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('orderSuccess');
      if (raw) setSnap(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!snap) {
    return (
      <>
        <style>{styles}</style>
        <nav>
          <a href="/" className="nav-logo">FIRESTICK4UK</a>
          <ul className="nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/products">Products</a></li>
          </ul>
        </nav>
        <div className="page">
          <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🛒</div>
            <h2 className="title">No order found</h2>
            <p className="subtitle">It looks like you navigated here directly.</p>
            <a href="/products" style={{ background: '#5B21B6', color: '#fff', textDecoration: 'none', padding: '13px 32px', borderRadius: 9, fontWeight: 700, fontSize: 14, display: 'inline-block' }}>Browse Products</a>
          </div>
        </div>
      </>
    );
  }

  const waUrl = `https://wa.me/447934519060?text=${encodeURIComponent(snap.waMessage)}`;

  return (
    <>
      <style>{styles}</style>

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className="nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/order-tracking">Track Order</a></li>
        </ul>
      </nav>

      <div className="page">
        <div className="container">

          {/* Animated checkmark */}
          <div className="check-wrapper">
            <div className="check-circle">
              <svg viewBox="0 0 52 52">
                <polyline className="check-path" points="14,27 22,35 38,17" />
              </svg>
            </div>
          </div>

          <h1 className="title">Thank you for your order!</h1>
          <p className="subtitle">
            Your order has been received and is being processed.<br />
            You&apos;ll receive confirmation once payment is verified.
          </p>

          {/* Order ID */}
          <div className="order-id-box">
            <div className="order-id-label">Order Reference</div>
            <div className="order-id-value">{snap.orderId}</div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="card-header">Order Items</div>
            <div className="card-body">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.items.map((item, i) => (
                    <tr key={i}>
                      <td>
                        <div className="item-name">{item.name}</div>
                        <div className="item-qty">Qty: {item.qty} &times; £{Number(item.price).toFixed(2)}</div>
                      </td>
                      <td>£{(Number(item.price) * Number(item.qty)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="card">
            <div className="card-header">Cost Breakdown</div>
            <div className="card-body">
              <div className="breakdown-row">
                <span className="breakdown-label">Subtotal</span>
                <span className="breakdown-value">£{Number(snap.subtotal).toFixed(2)}</span>
              </div>
              <div className="breakdown-row">
                <span className="breakdown-label">Shipping</span>
                <span className="breakdown-value">{snap.shipping === 0 ? 'Free' : `£${Number(snap.shipping).toFixed(2)}`}</span>
              </div>
              <div className="breakdown-row">
                <span className="breakdown-label">VAT (20%)</span>
                <span className="breakdown-value">£{Number(snap.vatAmount).toFixed(2)}</span>
              </div>
              {snap.couponApplied && snap.discountAmount > 0 && (
                <div className="breakdown-row">
                  <span className="breakdown-label">Discount ({snap.couponApplied.code})</span>
                  <span className="breakdown-value breakdown-discount">&minus;£{Number(snap.discountAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="breakdown-row breakdown-total">
                <span className="breakdown-label">Grand Total</span>
                <span className="breakdown-value">£{Number(snap.grandTotal).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Optional WhatsApp CTA */}
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="wa-btn">
            💬 Need Instant Activation? Chat with Support via WhatsApp (Optional)
          </a>
          <p className="wa-optional">
            This is completely optional — your order is already confirmed and being processed above.<br />
            Click only if you need immediate assistance.
          </p>

          {/* Track order */}
          <a href="/order-tracking" className="track-btn">Track My Order &rarr;</a>
        </div>
      </div>

      <footer>
        <div className="footer-logo">FIRESTICK4UK</div>
        <div className="footer-copy">&copy; 2026 Firestick4UK. All rights reserved.</div>
      </footer>
    </>
  );
}

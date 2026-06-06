"use client";
export const dynamic = 'force-dynamic';
import { useState } from "react";
import { useCart } from "../lib/cartContext";

const navStyles = `
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
  .page-header { max-width:1200px; margin:0 auto; padding:50px 60px 30px; }
  .section-tag { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; font-weight:600; }
  .page-title { font-family:'Cinzel',serif; font-size:clamp(26px,3.5vw,44px); font-weight:700; color:#111111; }
  .page-title span { color:#5B21B6; -webkit-text-fill-color:#5B21B6; }

  /* CART LAYOUT */
  .cart-layout { max-width:1200px; margin:0 auto; padding:0 60px 80px; display:grid; grid-template-columns:1fr 380px; gap:30px; }
  .cart-items { display:flex; flex-direction:column; gap:16px; }

  /* CART EMPTY */
  .cart-empty { text-align:center; padding:70px 40px; background:#F5F5F5; border:1px solid #E5E5E5; border-radius:16px; }
  .cart-empty-icon { font-size:60px; margin-bottom:20px; display:block; }
  .cart-empty h3 { font-family:'Cinzel',serif; font-size:22px; color:#111111; margin-bottom:10px; }
  .cart-empty p { color:#666666; font-size:14px; margin-bottom:28px; }

  /* CART ITEM */
  .cart-item { display:grid; grid-template-columns:100px 1fr auto; gap:20px; align-items:center; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:14px; padding:20px; transition:all 0.2s; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
  .cart-item:hover { border-color:#5B21B6; box-shadow:0 4px 14px rgba(91,33,182,0.1); }
  .cart-item-image { width:100px; height:100px; border-radius:10px; background:#F5F3FF; border:1px solid #DDD6FE; display:flex; align-items:center; justify-content:center; font-size:36px; flex-shrink:0; }
  .cart-item-details { flex:1; }
  .cart-item-name { font-family:'Cinzel',serif; font-size:16px; font-weight:700; color:#111111; margin-bottom:6px; }
  .cart-item-price { font-size:17px; font-weight:700; color:#5B21B6; font-family:'Cinzel',serif; }
  .cart-item-actions { display:flex; flex-direction:column; align-items:flex-end; gap:12px; }
  .qty-control { display:flex; align-items:center; gap:10px; }
  .qty-btn { width:32px; height:32px; border-radius:50%; border:1px solid #E5E5E5; background:#F5F5F5; color:#111111; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
  .qty-btn:hover { background:#5B21B6; color:#FFFFFF; border-color:#5B21B6; }
  .qty-num { font-size:16px; font-weight:700; color:#111111; min-width:20px; text-align:center; }
  .remove-btn { background:none; border:none; color:#CCCCCC; font-size:13px; cursor:pointer; transition:color 0.2s; }
  .remove-btn:hover { color:#DC2626; }

  /* ORDER SUMMARY */
  .order-summary { position:sticky; top:100px; height:fit-content; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06); }
  .summary-header { padding:22px 26px; border-bottom:1px solid #F0F0F0; background:#FAFAFA; }
  .summary-header h3 { font-family:'Cinzel',serif; font-size:17px; font-weight:700; color:#111111; }
  .summary-body { padding:20px 26px; display:flex; flex-direction:column; gap:12px; }
  .summary-row { display:flex; justify-content:space-between; align-items:center; font-size:14px; }
  .summary-row span:first-child { color:#666666; }
  .summary-row span:last-child { color:#111111; font-weight:500; }
  .summary-divider { border:none; border-top:1px solid #F0F0F0; margin:4px 0; }
  .summary-total span:first-child { color:#111111 !important; font-weight:700; font-family:'Cinzel',serif; font-size:15px; }
  .summary-total span:last-child { color:#5B21B6 !important; font-weight:700; font-family:'Cinzel',serif; font-size:22px; }
  .checkout-btn { margin:0 20px 20px; background:#5B21B6; color:#FFFFFF; border:none; padding:15px; border-radius:8px; width:calc(100% - 40px); font-size:15px; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .checkout-btn:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 12px rgba(91,33,182,0.3); }
  .checkout-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }

  /* CHECKOUT */
  .checkout-section { max-width:1200px; margin:0 auto; padding:0 60px 80px; }
  .checkout-grid { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
  .form-section { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:16px; padding:30px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
  .form-section h3 { font-family:'Cinzel',serif; font-size:17px; font-weight:700; color:#111111; margin-bottom:22px; padding-bottom:14px; border-bottom:1px solid #F0F0F0; }
  .form-group { margin-bottom:16px; }
  .form-group label { display:block; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#666666; margin-bottom:7px; font-weight:600; }
  .form-group input, .form-group textarea { width:100%; background:#FFFFFF; border:1px solid #E5E5E5; border-radius:9px; padding:11px 14px; color:#111111; font-family:'Raleway',sans-serif; font-size:14px; transition:all 0.2s; outline:none; }
  .form-group input:focus, .form-group textarea:focus { border-color:#5B21B6; box-shadow:0 0 0 3px rgba(91,33,182,0.1); }
  .form-group input::placeholder, .form-group textarea::placeholder { color:#AAAAAA; }
  .form-group textarea { resize:vertical; min-height:80px; }

  /* PAYMENT */
  .payment-options { display:flex; flex-direction:column; gap:10px; margin-bottom:18px; }
  .payment-option { display:flex; align-items:center; gap:14px; padding:14px 18px; border:1px solid #E5E5E5; border-radius:10px; cursor:pointer; transition:all 0.2s; background:#FFFFFF; }
  .payment-option:hover { border-color:#5B21B6; background:#F5F3FF; }
  .payment-option.selected { border-color:#5B21B6; background:#F5F3FF; }
  .payment-option input[type="radio"] { accent-color:#5B21B6; width:16px; height:16px; }
  .payment-option-label { font-size:15px; font-weight:600; color:#111111; }
  .payment-option-sub { font-size:12px; color:#888888; margin-top:2px; }

  /* BANK DETAILS */
  .bank-details { background:#F9F9F9; border:1px solid #E5E5E5; border-radius:10px; padding:18px; margin-bottom:18px; }
  .bank-details h4 { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#5B21B6; margin-bottom:12px; font-weight:700; }
  .bank-row { display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid #F0F0F0; font-size:14px; }
  .bank-row:last-child { border:none; }
  .bank-row span:first-child { color:#777777; }
  .bank-row span:last-child { color:#111111; font-weight:600; }

  /* UPLOAD */
  .upload-area { border:2px dashed #CCCCCC; border-radius:10px; padding:28px; text-align:center; cursor:pointer; transition:all 0.2s; position:relative; background:#FAFAFA; }
  .upload-area:hover { border-color:#5B21B6; background:#F5F3FF; }
  .upload-area.has-file { border-color:#16A34A; background:#F0FDF4; }
  .upload-icon { font-size:32px; margin-bottom:8px; display:block; }
  .upload-text { font-size:14px; color:#666666; }
  .upload-text strong { color:#5B21B6; }
  .upload-area input[type="file"] { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; }

  /* PLACE ORDER */
  .place-order-btn { width:100%; background:#5B21B6; color:#FFFFFF; border:none; padding:16px; border-radius:9px; font-size:15px; font-weight:700; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all 0.2s; margin-top:10px; }
  .place-order-btn:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 14px rgba(91,33,182,0.35); }
  .place-order-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; }

  /* SUCCESS */
  .success-screen { max-width:600px; margin:60px auto; padding:0 24px 80px; text-align:center; }
  .success-icon { font-size:80px; margin-bottom:24px; display:block; animation:popIn 0.5s ease; }
  @keyframes popIn { from{transform:scale(0)} to{transform:scale(1)} }
  .success-title { font-family:'Cinzel',serif; font-size:32px; font-weight:700; color:#111111; margin-bottom:14px; }
  .success-title span { color:#5B21B6; }
  .success-sub { color:#555555; font-size:15px; line-height:1.7; margin-bottom:10px; }
  .order-id-box { font-family:'Cinzel',serif; font-size:17px; color:#5B21B6; background:#F5F3FF; border:1px solid #DDD6FE; border-radius:10px; padding:12px 20px; margin:20px 0; display:inline-block; }
  .status-box { background:#FFFFFF; border:1px solid #E5E5E5; border-radius:14px; padding:22px; margin:24px 0; text-align:left; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
  .status-step { display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid #F5F5F5; }
  .status-step:last-child { border:none; }
  .step-dot { width:10px; height:10px; border-radius:50%; background:#CCCCCC; flex-shrink:0; }
  .step-dot.active { background:#5B21B6; box-shadow:0 0 8px rgba(91,33,182,0.5); }
  .step-dot.inactive { background:#E5E5E5; }
  .step-text strong { color:#111111; display:block; margin-bottom:2px; font-size:14px; }
  .step-text span { color:#888888; font-size:12px; }
  .btn-primary { background:#5B21B6; color:#FFFFFF; padding:14px 36px; border-radius:8px; font-size:14px; font-weight:600; letter-spacing:1px; text-decoration:none; transition:all 0.2s; display:inline-block; margin-top:10px; }
  .btn-primary:hover { background:#4C1D95; transform:translateY(-1px); box-shadow:0 4px 12px rgba(91,33,182,0.3); }

  /* FOOTER */
  footer { background:#111111; padding:50px 60px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
  .footer-logo { font-family:'Cinzel',serif; font-size:17px; font-weight:900; color:#FFFFFF; }
  .footer-copy { font-size:12px; color:rgba(255,255,255,0.4); }

  .whatsapp-btn { position:fixed; bottom:30px; right:30px; z-index:999; width:58px; height:58px; border-radius:50%; background:linear-gradient(135deg,#25d366,#128c7e); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 25px rgba(37,211,102,0.5); text-decoration:none; font-size:26px; transition:all 0.3s; }
  .whatsapp-btn:hover { transform:scale(1.1); }

  @media(max-width:900px){
    .cart-layout{grid-template-columns:1fr;padding:0 24px 60px;}
    .order-summary{position:static;}
    .checkout-grid{grid-template-columns:1fr;}
    .checkout-section{padding:0 24px 60px;}
    .page-header{padding:36px 24px 20px;}
    footer{padding:36px 24px;flex-direction:column;text-align:center;}
  }
  @media(max-width:500px){
    .cart-item{grid-template-columns:70px 1fr auto;gap:12px;padding:14px;}
    .place-order-btn{font-size:14px;padding:14px;}
  }
`;

type Step = "cart" | "checkout" | "success";

export default function CartPage() {
  const { cart, removeFromCart, updateQty, clearCart, total } = useCart();
  const [step, setStep] = useState<Step>("cart");
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "cod">("bank");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderError, setOrderError] = useState("");

  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", postcode: "", notes: ""
  });

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{code:string;type:string;value:number;discount_amount:number;message:string}|null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  const shipping = cart.some(i => i.name.toLowerCase().includes("plan")) ? 0 : cart.length > 0 ? 3.99 : 0;
  const subtotal = total;
  const vatAmount = Math.round(subtotal * 0.20 * 100) / 100;
  const discountAmount = couponApplied ? couponApplied.discount_amount : 0;
  const grandTotal = Math.round((subtotal + shipping + vatAmount - discountAmount) * 100) / 100;

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponChecking(true); setCouponError(""); setCouponApplied(null);
    const res = await fetch("/api/coupons?action=validate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code: couponCode, cart_total: subtotal + shipping }) }).then(r=>r.json()).catch(()=>({}));
    if (res.valid) { setCouponApplied(res); setCouponError(""); }
    else { setCouponError(res.message || "Invalid coupon"); }
    setCouponChecking(false);
  };

  const handleOrder = async () => {
    if (cart.length === 0) return;
    setPlacing(true);
    setOrderError("");

    try {
      let receiptPath = "";
      if (receiptFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(receiptFile);
        });
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64, name: receiptFile.name, folder: "firestick4uk/receipts" }),
        });
        const uploadData = await uploadRes.json();
        receiptPath = uploadData.path || "";
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: form.name,
          customer_email: form.email,
          customer_phone: form.phone,
          delivery_address: form.address,
          city: form.city,
          postcode: form.postcode,
          notes: form.notes,
          payment_method: paymentMethod,
          receipt_path: receiptPath,
          payment_reference: paymentReference || null,
          items: cart,
          total: grandTotal,
          coupon_code: couponApplied?.code || null,
          discount_amount: discountAmount,
          vat_amount: vatAmount,
        })
      });

      const data = await res.json();
      if (data.order_id) {
        const oid = data.order_id;
        setOrderId(oid);

        const itemsList = cart.map(i => `• ${i.name} x${i.qty} — £${(i.price * i.qty).toFixed(2)}`).join('\n');
        const fullAddress = [form.address, form.city, form.postcode].filter(Boolean).join(', ');
        const waMessage = [
          '🛍️ *NEW ORDER — firestick4uk.com*',
          '',
          `📋 *Order ID:* ${oid}`,
          `👤 *Name:* ${form.name}`,
          `📧 *Email:* ${form.email}`,
          `📱 *Phone:* ${form.phone}`,
          `📍 *Address:* ${fullAddress}`,
          form.notes ? `📝 *Notes:* ${form.notes}` : null,
          '',
          '🛒 *Items:*',
          itemsList,
          '',
          `💰 *Subtotal:* £${subtotal.toFixed(2)}`,
          `🚚 *Shipping:* ${shipping === 0 ? 'Free' : '£' + shipping.toFixed(2)}`,
          `🧾 *VAT (20%):* £${vatAmount.toFixed(2)}`,
          couponApplied ? `🎟️ *Discount (${couponApplied.code}):* -£${discountAmount.toFixed(2)}` : null,
          `💵 *Total: £${grandTotal.toFixed(2)}*`,
          '',
          `💳 *Payment:* ${paymentMethod === 'bank' ? 'Bank Transfer' : 'Cash on Delivery'}`,
          paymentMethod === 'bank' ? '✅ Payment receipt uploaded' : '',
          paymentReference ? `🏷️ *Payment Reference:* ${paymentReference}` : '💳 *Payment Reference:* Not provided',
          '',
          '📦 *Status:* Pending ⏳',
          '— Sent from firestick4uk.com',
        ].filter(Boolean).join('\n');

        sessionStorage.setItem('orderSuccess', JSON.stringify({
          orderId: oid, items: cart, subtotal, shipping, vatAmount,
          discountAmount, grandTotal, couponApplied, form, paymentMethod, waMessage,
        }));
        clearCart();
        window.location.href = '/cart/success';
      } else {
        setOrderError(data.error?.includes("connect") || data.error?.includes("timeout")
          ? "Our system is temporarily unavailable. Please try again in a moment."
          : "Order could not be placed. Please try again or contact us on WhatsApp.");
      }
    } catch {
      setOrderError("Network error. Please check your connection and try again.");
    }
    setPlacing(false);
  };

  return (
    <>
      <style>{navStyles}</style>
      
      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
        <ul className={`nav-links ${menuOpen ? "open" : ""}`}>
          <li><a href="/" onClick={() => setMenuOpen(false)}>Home</a></li>
          <li><a href="/products" onClick={() => setMenuOpen(false)}>Products</a></li>
          <li><a href="/order-tracking" onClick={() => setMenuOpen(false)}>Track Order</a></li>
          <li><a href="/blog" onClick={() => setMenuOpen(false)}>Blog</a></li>
          <li><a href="/contact" onClick={() => setMenuOpen(false)}>Contact</a></li>
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
          <div className="cart-layout">
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
                    <div className="cart-item-image">📦</div>
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
                      <button className="remove-btn" onClick={() => removeFromCart(item.id)}>✕ Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="order-summary">
              <div className="summary-header"><h3>Order Summary</h3></div>
              <div className="summary-body">
                <div className="summary-row"><span>Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
                <div className="summary-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : `£${shipping.toFixed(2)}`}</span></div>
                <div className="summary-row"><span>VAT (20%)</span><span>£{vatAmount.toFixed(2)}</span></div>
                {couponApplied && <div className="summary-row" style={{color:"#00c864"}}><span>Discount ({couponApplied.code})</span><span>-£{discountAmount.toFixed(2)}</span></div>}
                <hr className="summary-divider" />
                <div className="summary-row summary-total"><span>Total</span><span>£{grandTotal.toFixed(2)}</span></div>
              </div>
              {/* Coupon input */}
              <div style={{padding:"0 20px 16px"}}>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <input style={{flex:1,background:"rgba(139,0,255,0.08)",border:"1px solid rgba(139,0,255,0.25)",borderRadius:8,padding:"8px 12px",color:"white",fontSize:13,outline:"none"}} placeholder="Coupon code" value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&applyCoupon()} />
                  <button style={{background:"rgba(139,0,255,0.2)",border:"1px solid rgba(139,0,255,0.4)",color:"var(--purple-glow)",padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,whiteSpace:"nowrap"}} onClick={applyCoupon} disabled={couponChecking}>{couponChecking?"...":"Apply"}</button>
                </div>
                {couponApplied && <div style={{fontSize:12,color:"#00c864"}}>✅ {couponApplied.message} — Save £{discountAmount.toFixed(2)}</div>}
                {couponError && <div style={{fontSize:12,color:"#ff6666"}}>❌ {couponError}</div>}
              </div>
              <button className="checkout-btn" disabled={cart.length === 0} onClick={() => setStep("checkout")}>
                Proceed to Checkout →
              </button>
            </div>
          </div>
        )}

        {step === "checkout" && (
          <div className="checkout-section">
            <div className="checkout-grid">
              <div>
                <div className="form-section">
                  <h3>Your Details</h3>
                  {[
                    {label:"Full Name", key:"name", type:"text", placeholder:"John Smith"},
                    {label:"Email Address", key:"email", type:"email", placeholder:"john@example.com"},
                    {label:"WhatsApp / Phone", key:"phone", type:"tel", placeholder:"+447934519060"},
                    {label:"Delivery Address", key:"address", type:"text", placeholder:"123 High Street"},
                  ].map(f => (
                    <div className="form-group" key={f.key}>
                      <label>{f.label}</label>
                      <input type={f.type} placeholder={f.placeholder}
                        value={(form as any)[f.key]}
                        onChange={e => setForm({...form, [f.key]: e.target.value})} />
                    </div>
                  ))}
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px"}}>
                    <div className="form-group">
                      <label>City</label>
                      <input type="text" placeholder="London" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Postcode</label>
                      <input type="text" placeholder="SW1A 1AA" value={form.postcode} onChange={e => setForm({...form, postcode: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Order Notes (Optional)</label>
                    <textarea placeholder="Any special instructions..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                  </div>
                </div>
              </div>

              <div>
                <div className="form-section">
                  <h3>Payment Method</h3>
                  <div className="payment-options">
                    {[
                      {val:"bank", label:"🏦 Bank Transfer", sub:"Transfer to our UK bank & upload receipt"},
                      {val:"cod", label:"💵 Cash on Delivery", sub:"Pay when your order arrives"},
                    ].map(p => (
                      <div key={p.val} className={`payment-option ${paymentMethod === p.val ? "selected" : ""}`} onClick={() => setPaymentMethod(p.val as any)}>
                        <input type="radio" readOnly checked={paymentMethod === p.val} />
                        <div>
                          <div className="payment-option-label">{p.label}</div>
                          <div className="payment-option-sub">{p.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {paymentMethod === "bank" && (
                    <>
                      <div className="bank-details">
                        <h4>Bank Account Details</h4>
                        <div className="bank-row"><span>Account Name</span><span>Robert George Bennett</span></div>
                        <div className="bank-row"><span>Sort Code</span><span>60-84-07</span></div>
                        <div className="bank-row"><span>Account No.</span><span>70745518</span></div>
                        <div className="bank-row"><span>Reference</span><span>Your name only</span></div>
                        <div className="bank-row"><span>Amount</span><span>£{grandTotal.toFixed(2)}</span></div>
                      </div>
                      <div className="form-group">
                        <label>Upload Payment Receipt (Optional)</label>
                        <div className={`upload-area ${receiptFile ? "has-file" : ""}`}>
                          <span className="upload-icon">{receiptFile ? "✅" : "📎"}</span>
                          <div className="upload-text">
                            {receiptFile ? <strong>{receiptFile.name}</strong> : <><strong>Click to upload</strong> your receipt</>}
                          </div>
                          <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Payment Reference</label>
                        <input
                          type="text"
                          placeholder="Enter your first name as payment reference"
                          value={paymentReference}
                          onChange={e => setPaymentReference(e.target.value)}
                        />
                        <div style={{fontSize:12,color:"#666666",marginTop:6,lineHeight:1.5}}>
                          💡 Use your first name as the payment reference when making the bank transfer — this helps us identify your payment quickly!
                        </div>
                      </div>
                    </>
                  )}

                  {paymentMethod === "cod" && (
                    <div className="bank-details">
                      <h4>Cash on Delivery</h4>
                      <div className="bank-row"><span>Amount Due</span><span>£{grandTotal.toFixed(2)}</span></div>
                    </div>
                  )}

                  <div className="summary-body" style={{background:"rgba(139,0,255,0.05)", borderRadius:"12px", marginBottom:"16px"}}>
                    <div className="summary-row"><span>Subtotal</span><span>£{subtotal.toFixed(2)}</span></div>
                    <div className="summary-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : `£${shipping.toFixed(2)}`}</span></div>
                    <div className="summary-row"><span>VAT (20%)</span><span>£{vatAmount.toFixed(2)}</span></div>
                    {couponApplied && <div className="summary-row" style={{color:"#00c864"}}><span>Discount ({couponApplied.code})</span><span>-£{discountAmount.toFixed(2)}</span></div>}
                    <hr className="summary-divider" />
                    <div className="summary-row summary-total"><span>Total</span><span>£{grandTotal.toFixed(2)}</span></div>
                  </div>

                  <button className="place-order-btn"
                    disabled={placing || cart.length === 0}
                    onClick={handleOrder}>
                    {placing ? "Placing Order..." : "Place Order →"}
                  </button>
                  {orderError && (
                    <div style={{marginTop:"14px",background:"rgba(255,68,68,0.1)",border:"1px solid rgba(255,68,68,0.3)",borderRadius:"12px",padding:"14px 16px"}}>
                      <p style={{color:"#ff8888",fontSize:"13px",marginBottom:"10px"}}>⚠️ {orderError}</p>
                      <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
                        <button onClick={handleOrder} style={{background:"rgba(255,68,68,0.2)",border:"1px solid rgba(255,68,68,0.4)",color:"#ff8888",padding:"7px 16px",borderRadius:"8px",fontSize:"12px",cursor:"pointer"}}>
                          🔄 Retry
                        </button>
                        <a href="https://wa.me/447934519060" target="_blank" rel="noopener noreferrer" style={{background:"rgba(37,211,102,0.15)",border:"1px solid rgba(37,211,102,0.3)",color:"#25d366",padding:"7px 16px",borderRadius:"8px",fontSize:"12px",textDecoration:"none"}}>
                          💬 WhatsApp Us
                        </a>
                      </div>
                    </div>
                  )}
                  <button onClick={() => setStep("cart")} style={{width:"100%", background:"none", border:"none", color:"rgba(255,255,255,0.4)", fontSize:"13px", marginTop:"12px", cursor:"pointer"}}>
                    ← Back to Cart
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <footer>
          <div className="footer-logo">FIRESTICK4UK</div>
          <div className="footer-copy">© 2026 Firestick4UK. All rights reserved.</div>
        </footer>
      </div>
      <a href="https://wa.me/447934519060" className="whatsapp-btn" target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}
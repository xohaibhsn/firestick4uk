"use client";
import { useEffect, useState } from "react";
import xss from "xss";
import { fixContentLinkRels } from "@/lib/seoLinks";
import { useCart } from "../../lib/cartContext";
import Navbar from "@/components/Navbar";

const xssOptions = {
  whiteList: {
    h1: [], h2: [], h3: [], h4: [],
    p: ["style", "class"],
    strong: [], em: [], u: [], s: [], b: [], i: [],
    ul: [], ol: [], li: [],
    blockquote: [],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "class"],
    br: [], hr: [],
    span: ["style", "class"],
    div: ["style", "class"],
    pre: [], code: [],
  } as Record<string, string[]>,
  stripIgnoreTag: true,
};

interface Product {
  id: number; name: string; description: string;
  price: number; badge: string | null; image: string | null; category: string; stock: string;
  short_description: string | null; full_description: string | null;
  features: string | null; seo_title: string | null; og_image: string | null;
}

export default function ProductDetail({ slug, initialProduct }: { slug: string; initialProduct: Product | null }) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [added, setAdded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const { addToCart, removeFromCart, cart } = useCart();

  useEffect(() => {
    if (initialProduct) return;
    fetch(`/api/products?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => { setProduct(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, initialProduct]);

  const isInCart = product ? cart.some(i => i.id === product.id) : false;

  const handleAdd = () => {
    if (!product || isInCart) return;
    addToCart({ id: product.id, name: product.name, price: Number(product.price), qty: 1 });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const featureList = product?.features
    ? product.features.split('\n').map(f => f.trim()).filter(Boolean)
    : [];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Raleway:wght@300;400;500;600&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        body{background:#FFFFFF;color:#111111;font-family:'Raleway',sans-serif;}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:#FFFFFF;border-bottom:1px solid #E5E5E5;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
        .nav-logo{font-family:'Cinzel',serif;font-size:20px;font-weight:900;color:#111111;text-decoration:none;letter-spacing:2px;}
        .nav-links{display:flex;gap:36px;list-style:none;}
        .nav-links a{color:#111111;text-decoration:none;font-size:13px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;transition:color 0.2s;}
        .nav-links a:hover{color:#5B21B6;}
        .nav-cta{background:#5B21B6 !important;color:#FFFFFF !important;padding:10px 24px !important;border-radius:30px !important;font-weight:600 !important;}
        .nav-cta:hover{background:#4C1D95 !important;}
        .hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:6px;z-index:101;}
        .hamburger span{display:block;width:25px;height:2px;background:#111111;border-radius:2px;}
        @media(max-width:768px){
          nav{padding:16px 24px;}
          .nav-links{display:none;}
          .nav-links.open{display:flex;flex-direction:column;position:fixed;top:0;left:0;width:100vw;height:100vh;background:#FFFFFF;align-items:center;justify-content:center;gap:28px;z-index:9999;margin:0;padding:0;}
          .nav-links.open a{color:#111111;font-size:18px;}
          .hamburger{display:flex;}
        }
        .back-link{color:#666666;text-decoration:none;font-size:14px;display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;transition:color 0.2s;}
        .back-link:hover{color:#5B21B6;}
        .page-wrap{padding:110px 60px 80px;max-width:1100px;margin:0 auto;}
        .product-layout{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start;}
        .product-img-box{background:#F5F5F5;border:1px solid #E5E5E5;border-radius:20px;overflow:hidden;aspect-ratio:1;display:flex;align-items:center;justify-content:center;}
        .product-img-box img{width:100%;height:100%;object-fit:cover;}
        .placeholder-img{font-size:80px;text-align:center;}
        .product-category{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#5B21B6;margin-bottom:12px;font-weight:600;}
        .product-name{font-family:'Cinzel',serif;font-size:clamp(22px,3vw,34px);font-weight:700;color:#111111;margin-bottom:12px;line-height:1.25;}
        .product-short-desc{color:#555555;font-size:15px;line-height:1.8;margin-bottom:18px;}
        .product-description,.product-full-description{color:#444444;font-size:15px;line-height:1.85;}
        .product-description p,.product-full-description p{margin:0 0 1rem;line-height:1.85;}
        .product-description ul,.product-full-description ul{list-style:disc;padding-left:1.5rem;margin:1rem 0;}
        .product-description ol,.product-full-description ol{list-style:decimal;padding-left:1.5rem;margin:1rem 0;}
        .product-description li,.product-full-description li{margin:0.4rem 0;color:#333333;}
        .product-description h1,.product-full-description h1{font-family:'Cinzel',serif;font-size:1.75rem;font-weight:700;color:#111111;margin:1.25rem 0 0.75rem;}
        .product-description h2,.product-full-description h2{font-family:'Cinzel',serif;font-size:1.5rem;font-weight:700;color:#111111;margin:1.25rem 0 0.75rem;}
        .product-description h3,.product-full-description h3{font-family:'Cinzel',serif;font-size:1.25rem;font-weight:600;color:#5B21B6;margin:1rem 0 0.5rem;}
        .product-description a,.product-full-description a{color:#5B21B6;text-decoration:underline;}
        .product-description strong,.product-full-description strong{font-weight:700;color:#111111;}
        .product-description blockquote,.product-full-description blockquote{border-left:4px solid #5B21B6;padding:1rem 1.5rem;background:#F5F3FF;margin:1.25rem 0;color:#444444;font-style:italic;border-radius:0 8px 8px 0;}
        .product-description img,.product-full-description img{max-width:100%;border-radius:10px;margin:1.25rem 0;display:block;}
        .product-price{font-family:'Cinzel',serif;font-size:36px;font-weight:900;color:#5B21B6;-webkit-text-fill-color:#5B21B6;margin-bottom:22px;}
        .badge-tag{display:inline-block;background:#5B21B6;color:#FFFFFF;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;margin-bottom:14px;}
        .add-btn{width:100%;background:#5B21B6;color:#FFFFFF;border:none;padding:18px;border-radius:9px;font-size:16px;font-weight:700;letter-spacing:0.5px;cursor:pointer;transition:all 0.2s;}
        .add-btn:hover{background:#4C1D95;transform:translateY(-1px);box-shadow:0 4px 16px rgba(91,33,182,0.35);}
        .add-btn.added{background:#16A34A;}
        .meta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px;}
        .meta-pill{background:#F5F5F5;border:1px solid #E5E5E5;border-radius:20px;padding:6px 14px;font-size:13px;color:#555555;}
        .activation-note{background:#F5F3FF;border:1px solid #DDD6FE;border-radius:12px;padding:12px 14px;margin-bottom:18px;color:#444444;font-size:14px;line-height:1.6;}
        .cart-link{display:block;text-align:center;margin-top:14px;color:#5B21B6;font-size:13px;text-decoration:none;font-weight:600;}
        .cart-link:hover{color:#4C1D95;}
        .loading-state{text-align:center;padding:120px 24px;color:#888888;font-size:18px;}
        .product-sections{max-width:1100px;margin:0 auto;padding:0 60px 80px;}
        .section-block{background:#F9F9F9;border:1px solid #E5E5E5;border-radius:16px;padding:30px;margin-bottom:18px;}
        .section-heading{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#111111;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #E5E5E5;}
        .feature-list{list-style:none;display:flex;flex-direction:column;gap:10px;}
        .feature-list li{display:flex;align-items:center;gap:12px;color:#444444;font-size:15px;}
        .feature-list li::before{content:"✅";flex-shrink:0;}
        footer{background:#111111;padding:40px 60px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;}
        .footer-logo{font-family:'Cinzel',serif;font-size:16px;font-weight:900;color:#FFFFFF;}
        .footer-copy{font-size:12px;color:rgba(255,255,255,0.4);}
        .whatsapp-btn{position:fixed;bottom:30px;right:30px;z-index:999;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 25px rgba(37,211,102,0.5);text-decoration:none;font-size:26px;transition:all 0.3s;}
        .whatsapp-btn:hover{transform:scale(1.1);}
        @media(max-width:768px){.page-wrap{padding:90px 16px 40px;}.product-sections{padding:0 16px 60px;}.product-layout{grid-template-columns:1fr;gap:24px;}footer{padding:30px 24px;flex-direction:column;text-align:center;}}
      `}</style>

      <Navbar cartCount={cart.length} cta="cart" />

      <div className="page-wrap">
        {loading ? (
          <div className="loading-state">Loading product...</div>
        ) : !product ? (
          <div className="loading-state">
            Product not found. <a href="/products" style={{color:"var(--purple-glow)"}}>Browse all products →</a>
          </div>
        ) : (
          <>
            <a href="/products" className="back-link">← Back to Products</a>
            <div className="product-layout">
              <div className="product-img-box">
                {product.image
                  ? <img src={product.image} alt={product.name} loading="eager" />
                  : <div className="placeholder-img">📦</div>
                }
              </div>
              <div>
                <div className="product-category">{product.category}</div>
                {product.badge && <div className="badge-tag">{product.badge}</div>}
                <h1 className="product-name">{product.name}</h1>
                {product.short_description && (
                  <div
                    className="product-description"
                    dangerouslySetInnerHTML={{
                      __html: fixContentLinkRels(xss(product.short_description, xssOptions)),
                    }}
                  />
                )}
                <div className="product-price">£{Number(product.price).toFixed(2)}</div>
                <div className="meta-row">
                  <span className="meta-pill">📦 {product.stock || "In Stock"}</span>
                  <span className="meta-pill">🚚 Fast Delivery</span>
                  <span className="meta-pill">⚡ Active within 1 hour</span>
                  <span className="meta-pill">✅ UK Based</span>
                </div>
                <div className="activation-note">
                  Subscription services are active within 1 hour of payment confirmation. Need help? WhatsApp +447518787653 or Telegram @firestick44.
                </div>
                <button
                  className="add-btn"
                  style={{background: isInCart ? (hovering ? "#DC2626" : "#16A34A") : "#5B21B6", cursor: isInCart && !hovering ? "default" : "pointer", transform: "none"}}
                  onMouseEnter={() => isInCart && setHovering(true)}
                  onMouseLeave={() => setHovering(false)}
                  onClick={() => isInCart ? removeFromCart(product!.id) : handleAdd()}
                >
                  {isInCart ? (hovering ? "✕ Remove from Cart" : "✅ Added to Cart!") : "Add to Cart →"}
                </button>
                <a href="/cart" className="cart-link">View Cart & Checkout →</a>
              </div>
            </div>
          </>
        )}
      </div>

      {product && (product.full_description || featureList.length > 0) && (
        <div className="product-sections">
          {product.full_description && (
            <div className="section-block">
              <div className="section-heading">About This Product</div>
              <div
                className="product-full-description"
                dangerouslySetInnerHTML={{
                  __html: fixContentLinkRels(xss(product.full_description, xssOptions)),
                }}
              />
            </div>
          )}
          {featureList.length > 0 && (
            <div className="section-block">
              <div className="section-heading">What&apos;s Included</div>
              <ul className="feature-list">
                {featureList.map((f, i) => (
                  <li key={i}>{f.replace(/^[✅✔️•\-*]\s*/,'')}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <footer>
        <div className="footer-logo">FIRESTICK4UK</div>
        <div className="footer-copy">© 2026 Firestick4UK. All rights reserved.</div>
      </footer>

    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useCart } from "../../lib/cartContext";

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
  const { addToCart } = useCart();

  useEffect(() => {
    if (initialProduct) return;
    fetch(`/api/products?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => { setProduct(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, initialProduct]);

  const handleAdd = () => {
    if (!product) return;
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
        :root{--purple-mid:#4a0080;--purple-bright:#8b00ff;--purple-glow:#bf5fff;--gold:#ffd700;}
        body{background:#0a0010;color:#fff;font-family:'Raleway',sans-serif;}
        .hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:5px;z-index:101;}
        .hamburger span{display:block;width:25px;height:2px;background:var(--purple-glow);}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:rgba(13,0,16,0.96);backdrop-filter:blur(20px);border-bottom:1px solid rgba(139,0,255,0.2);}
        .nav-logo{font-family:'Cinzel',serif;font-size:20px;font-weight:900;background:linear-gradient(135deg,var(--purple-glow),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-decoration:none;letter-spacing:2px;}
        .back-link{color:rgba(255,255,255,0.5);text-decoration:none;font-size:14px;display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;transition:color 0.2s;}
        .back-link:hover{color:var(--purple-glow);}
        .page-wrap{position:relative;z-index:1;padding:120px 60px 80px;max-width:1100px;margin:0 auto;}
        .product-layout{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start;}
        .product-img-box{background:linear-gradient(135deg,rgba(74,0,128,0.2),rgba(26,0,37,0.9));border:1px solid rgba(139,0,255,0.2);border-radius:24px;overflow:hidden;aspect-ratio:1;display:flex;align-items:center;justify-content:center;}
        .product-img-box img{width:100%;height:100%;object-fit:cover;}
        .placeholder-img{font-size:80px;text-align:center;}
        .product-category{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--purple-glow);margin-bottom:12px;}
        .product-name{font-family:'Cinzel',serif;font-size:clamp(22px,3vw,34px);font-weight:700;color:white;margin-bottom:12px;line-height:1.25;}
        .product-short-desc{color:rgba(255,255,255,0.65);font-size:15px;line-height:1.8;margin-bottom:18px;}
        .product-price{font-family:'Cinzel',serif;font-size:36px;font-weight:900;color:#5B21B6;-webkit-text-fill-color:#5B21B6;margin-bottom:22px;}
        .badge-tag{display:inline-block;background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));color:white;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;margin-bottom:14px;}
        .add-btn{width:100%;background:linear-gradient(135deg,var(--purple-mid),var(--purple-bright));color:white;border:none;padding:18px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:all 0.3s;box-shadow:0 0 30px rgba(139,0,255,0.4);}
        .add-btn:hover{box-shadow:0 0 50px rgba(139,0,255,0.7);transform:translateY(-2px);}
        .add-btn.added{background:linear-gradient(135deg,#00a050,#00c864);}
        .meta-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px;}
        .meta-pill{background:rgba(139,0,255,0.1);border:1px solid rgba(139,0,255,0.25);border-radius:20px;padding:6px 14px;font-size:13px;color:rgba(255,255,255,0.7);}
        .cart-link{display:block;text-align:center;margin-top:14px;color:rgba(255,255,255,0.5);font-size:13px;text-decoration:none;}
        .cart-link:hover{color:var(--purple-glow);}
        .loading-state{text-align:center;padding:120px 24px;color:rgba(255,255,255,0.4);font-size:18px;}
        .product-sections{max-width:1100px;margin:0 auto;padding:0 60px 80px;}
        .section-block{background:linear-gradient(135deg,rgba(74,0,128,0.12),rgba(26,0,37,0.8));border:1px solid rgba(139,0,255,0.15);border-radius:20px;padding:32px;margin-bottom:20px;}
        .section-heading{font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:white;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(139,0,255,0.12);}
        .full-desc{color:rgba(255,255,255,0.65);font-size:15px;line-height:1.9;}
        .feature-list{list-style:none;display:flex;flex-direction:column;gap:10px;}
        .feature-list li{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,0.75);font-size:15px;}
        .feature-list li::before{content:"✅";flex-shrink:0;}
        @media(max-width:768px){nav{padding:16px 24px;}.page-wrap{padding:100px 24px 40px;}.product-sections{padding:0 24px 60px;}.product-layout{grid-template-columns:1fr;gap:28px;}.hamburger{display:flex;}}
      `}</style>

      <nav>
        <a href="/" className="nav-logo">FIRESTICK4UK</a>
      </nav>

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
                  <p className="product-short-desc">{product.short_description}</p>
                )}
                <div className="product-price">£{Number(product.price).toFixed(2)}</div>
                <div className="meta-row">
                  <span className="meta-pill">📦 {product.stock || "In Stock"}</span>
                  <span className="meta-pill">🚚 Fast Delivery</span>
                  <span className="meta-pill">✅ UK Based</span>
                </div>
                <button className={`add-btn ${added ? "added" : ""}`} onClick={handleAdd}>
                  {added ? "✓ Added to Cart!" : "Add to Cart →"}
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
              <p className="full-desc">{product.full_description}</p>
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

      <a href="https://wa.me/447934519060" style={{position:"fixed",bottom:30,right:30,zIndex:999,width:58,height:58,borderRadius:"50%",background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 25px rgba(37,211,102,0.5)",textDecoration:"none",fontSize:26}} target="_blank" rel="noopener noreferrer">💬</a>
    </>
  );
}

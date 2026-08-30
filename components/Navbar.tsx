"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface NavbarProps {
  logoUrl?: string;
  cartCount?: number;
  /** cart = Cart CTA, shop = Shop Now, none = links only */
  cta?: "cart" | "shop" | "none";
  shopHref?: string;
  /** Extra content before the hamburger (e.g. products search) */
  children?: ReactNode;
}

export default function Navbar({
  logoUrl,
  cartCount = 0,
  cta = "cart",
  shopHref = "/products",
  children,
}: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logo, setLogo] = useState(logoUrl || "");
  const [labels, setLabels] = useState({
    alt: "Firestick4UK",
    text: "FIRESTICK4UK",
    cart: "Cart",
    shop: "Shop Now",
    subscription: "IPTV Subscription",
  });

  useEffect(() => {
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((d) => {
        if (!d || typeof d !== "object") return;
        if (logoUrl === undefined && d.site_logo_url) setLogo(String(d.site_logo_url));
        setLabels({
          alt: (d.nav_logo_alt || d.site_title || "Firestick4UK").trim() || "Firestick4UK",
          text: (d.nav_logo_text || d.site_title || "FIRESTICK4UK").trim() || "FIRESTICK4UK",
          cart: (d.nav_cart_label || "Cart").trim() || "Cart",
          shop: (d.nav_shop_label || "Shop Now").trim() || "Shop Now",
          subscription:
            (d.nav_subscription_label || "IPTV Subscription").trim() || "IPTV Subscription",
        });
      })
      .catch(() => {});
  }, [logoUrl]);

  useEffect(() => {
    if (logoUrl !== undefined) setLogo(logoUrl || "");
  }, [logoUrl]);

  const close = () => setMenuOpen(false);

  const logoEl = logo ? (
    <a href="/" className="nav-logo nav-logo-img">
      <img
        src={logo}
        alt={labels.alt}
        style={{ height: 36, width: "auto", objectFit: "contain", display: "block" }}
      />
    </a>
  ) : (
    <a href="/" className="nav-logo nav-logo-text">
      {labels.text}
    </a>
  );

  return (
    <>
      <style>{`
        .site-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 18px 60px; display: flex; align-items: center; justify-content: space-between;
          background: #FFFFFF; border-bottom: 1px solid #E5E5E5;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .site-nav .nav-logo {
          display: flex; align-items: center; flex-shrink: 0;
          text-decoration: none; color: #111111;
        }
        .site-nav .nav-logo-text {
          font-family: var(--font-logo), 'Cinzel', Georgia, serif;
          font-size: 20px; font-weight: 900; letter-spacing: 2px;
          color: #111111; text-decoration: none;
        }
        .site-nav .nav-links {
          display: flex; gap: 36px; list-style: none; margin: 0; padding: 0;
          align-items: center;
        }
        .site-nav .nav-links a {
          font-family: var(--font-body), 'Inter', system-ui, sans-serif;
          color: #374151; text-decoration: none; font-size: 14px; font-weight: 500;
          letter-spacing: 0.01em; text-transform: uppercase; transition: color 0.2s;
        }
        .site-nav .nav-links a:hover { color: #5B21B6; }
        .site-nav .nav-cta {
          background: #5B21B6 !important; color: #FFFFFF !important;
          padding: 10px 24px !important; border-radius: 30px !important; font-weight: 600 !important;
          font-family: var(--font-body), 'Inter', system-ui, sans-serif !important;
        }
        .site-nav .nav-cta:hover { background: #4C1D95 !important; }
        .site-nav .hamburger {
          display: none; flex-direction: column; gap: 5px; cursor: pointer;
          background: none; border: none; padding: 5px; z-index: 101;
        }
        .site-nav .hamburger span {
          display: block; width: 25px; height: 2px; background: #111111; border-radius: 2px;
        }
        .site-nav .nav-end { display: flex; align-items: center; gap: 12px; }
        @media (max-width: 768px) {
          .site-nav { padding: 16px 24px; }
          .site-nav .nav-links { display: none; }
          .site-nav .nav-links.open {
            display: flex; flex-direction: column; position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh; background: #FFFFFF;
            align-items: center; justify-content: center; gap: 28px; z-index: 9999;
            margin: 0; padding: 0;
          }
          .site-nav .nav-links.open a { color: #111111; font-size: 18px; }
          .site-nav .hamburger { display: flex; }
        }
      `}</style>

      <nav className="site-nav">
        {logoEl}
        <ul className={`nav-links ${menuOpen ? "open" : ""}`}>
          <li><a href="/" onClick={close}>Home</a></li>
          <li><a href="/products" onClick={close}>Products</a></li>
          <li>
            <a href="/iptv-subscriptions-uk/" onClick={close}>
              {labels.subscription}
            </a>
          </li>
          <li><a href="/order-tracking" onClick={close}>Track Order</a></li>
          <li><a href="/blog" onClick={close}>Blog</a></li>
          <li><a href="/contact" onClick={close}>Contact</a></li>
          {cta === "cart" && (
            <li>
              <a href="/cart" className="nav-cta" onClick={close}>
                {labels.cart}{cartCount > 0 ? ` (${cartCount})` : ""}
              </a>
            </li>
          )}
          {cta === "shop" && (
            <li>
              <a href={shopHref} className="nav-cta" onClick={close}>
                {labels.shop}
              </a>
            </li>
          )}
        </ul>
        <div className="nav-end">
          {children}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
            type="button"
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>
    </>
  );
}

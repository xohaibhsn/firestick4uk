"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";

export interface NavbarProps {
  logoUrl?: string;
  cartCount?: number;
  /** cart = Cart CTA, shop = Shop Now, none = links only */
  cta?: "cart" | "shop" | "none";
  shopHref?: string;
  /** Extra content before the hamburger (e.g. products search) */
  children?: ReactNode;
}

function normalizeSubscriptionSlug(raw: string): string {
  return (
    String(raw || "iptv-subscriptions-uk")
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "iptv-subscriptions-uk"
  );
}

export default function Navbar({
  logoUrl,
  cartCount = 0,
  cta = "cart",
  shopHref = "/products",
  children,
}: NavbarProps) {
  const { sc } = useSiteContent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logo, setLogo] = useState(logoUrl || "");
  /** Client-only header cart icon — false on SSR so nav link HTML is unchanged. */
  const [headerCartMounted, setHeaderCartMounted] = useState(false);
  const menuId = useId();

  useEffect(() => {
    setHeaderCartMounted(true);
  }, []);

  const labels = useMemo(() => {
    const slug = normalizeSubscriptionSlug(
      String(sc.subscription_slug || "iptv-subscriptions-uk")
    );
    return {
      alt:
        (sc.nav_logo_alt || sc.site_title || "Firestick4UK").trim() ||
        "Firestick4UK",
      text:
        (sc.nav_logo_text || sc.site_title || "FIRESTICK4UK").trim() ||
        "FIRESTICK4UK",
      cart: (sc.nav_cart_label || "Cart").trim() || "Cart",
      shop: (sc.nav_shop_label || "Shop Now").trim() || "Shop Now",
      subscription:
        (sc.nav_subscription_label || "IPTV Subscription").trim() ||
        "IPTV Subscription",
      subscriptionHref: `/${slug}`,
    };
  }, [sc]);

  useEffect(() => {
    if (logoUrl !== undefined) {
      setLogo(logoUrl || "");
      return;
    }
    if (sc.site_logo_url) setLogo(String(sc.site_logo_url));
  }, [logoUrl, sc.site_logo_url]);

  const close = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 769px)").matches) setMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        .site-nav .nav-cta:hover { background: #4C1D95 !important; color: #FFFFFF !important; }
        /* Open-menu links are dark; keep Cart pill readable (white on purple). */
        .site-nav .nav-links.open a.nav-cta,
        .site-nav .nav-links.open a.nav-cta:hover,
        .site-nav .nav-links.open a.nav-cta:focus-visible {
          background: #5B21B6 !important;
          color: #FFFFFF !important;
        }
        .site-nav .hamburger {
          display: none; flex-direction: column; gap: 5px; cursor: pointer;
          background: none; border: none; padding: 5px; z-index: 101;
          min-width: 44px; min-height: 44px; align-items: center; justify-content: center;
        }
        .site-nav .hamburger span {
          display: block; width: 25px; height: 2px; background: #111111; border-radius: 2px;
        }
        .site-nav .hamburger .hamburger-icon {
          display: block; width: 24px; height: 24px; color: #111111; flex-shrink: 0;
        }
        .site-nav .nav-end { display: flex; align-items: center; gap: 12px; }
        .site-nav .nav-header-cart {
          display: none;
          position: relative;
          align-items: center;
          justify-content: center;
          min-width: 44px; min-height: 44px;
          color: #111111; text-decoration: none;
          border-radius: 8px;
        }
        .site-nav .nav-header-cart:focus-visible {
          outline: 2px solid #5B21B6; outline-offset: 2px;
        }
        .site-nav .nav-header-cart__badge {
          position: absolute; top: 4px; right: 2px;
          min-width: 18px; height: 18px; padding: 0 5px;
          border-radius: 999px; background: #5B21B6; color: #FFFFFF;
          font-size: 11px; font-weight: 700; line-height: 18px; text-align: center;
          font-family: var(--font-body), 'Inter', system-ui, sans-serif;
        }
        @media (max-width: 768px) {
          .site-nav { padding: 16px 24px; }
          .site-nav.menu-open { z-index: 10050; }
          .site-nav .nav-links { display: none; }
          .site-nav .nav-links.open {
            display: flex; flex-direction: column; position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh; background: #FFFFFF;
            align-items: center; justify-content: center; gap: 28px; z-index: 1;
            margin: 0; padding: 0;
          }
          .site-nav .nav-links.open a { color: #111111; font-size: 18px; }
          .site-nav .nav-links.open a.nav-cta { color: #FFFFFF !important; }
          .site-nav .hamburger { display: flex; position: relative; z-index: 2; }
          .site-nav .nav-header-cart { display: inline-flex; position: relative; z-index: 2; }
          .site-nav.menu-open .nav-logo,
          .site-nav.menu-open .nav-end {
            position: relative; z-index: 2;
          }
        }
      `}</style>

      <nav className={`site-nav${menuOpen ? " menu-open" : ""}`}>
        {logoEl}
        <ul id={menuId} className={`nav-links ${menuOpen ? "open" : ""}`}>
          <li><a href="/" onClick={close}>Home</a></li>
          <li><a href="/products" onClick={close}>Products</a></li>
          <li>
            <a href={labels.subscriptionHref} onClick={close}>
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
          {headerCartMounted && cta === "cart" && (
            <a
              href="/cart"
              className="nav-header-cart"
              aria-label={
                cartCount > 0
                  ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`
                  : "Cart"
              }
              data-nav-header-cart="1"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M7 4h-2l-1 2v1h2l2.4 10.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="20" r="1.5" fill="currentColor" />
                <circle cx="18" cy="20" r="1.5" fill="currentColor" />
              </svg>
              {cartCount > 0 && (
                <span className="nav-header-cart__badge" aria-hidden="true">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </a>
          )}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Menu"}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            type="button"
          >
            {menuOpen ? (
              <svg
                className="hamburger-icon"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M6 6L18 18M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <>
                <span /><span /><span />
              </>
            )}
          </button>
        </div>
      </nav>
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/app/lib/cartContext";
import { useCartClassification } from "@/lib/useCartClassification";
import { formatMiniCartAmountText } from "@/lib/cartDisplayTotals";
import { useSiteContent } from "@/hooks/useSiteContent";
import { parsePricesIncludeVat } from "@/lib/pricesIncludeVat";

/** Routes where the mini-cart bar must stay hidden. */
export function shouldHideMiniCartBar(pathname: string | null): boolean {
  const p = String(pathname || "").toLowerCase();
  if (!p) return false;
  if (p === "/cart" || p.startsWith("/cart/")) return true;
  if (p === "/sidhu" || p.startsWith("/sidhu/")) return true;
  if (p.includes("checkout")) return true;
  return false;
}

const BAR_VISIBLE_ATTR = "data-minicart-bar";
const PDP_STICKY_ATC_ATTR = "data-pdp-sticky-atc";
const MINI_CART_FLASH_MS = 900;

export default function MiniCartBar() {
  const pathname = usePathname();
  const { cart, total, itemCount, lastAddedAt } = useCart();
  const { sc, loaded: cmsLoaded } = useSiteContent();
  const pricesIncludeVat = parsePricesIncludeVat(
    cmsLoaded ? sc.prices_include_vat : undefined
  );
  const [mounted, setMounted] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [pdpStickyAtc, setPdpStickyAtc] = useState(false);
  const [addFlash, setAddFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenLastAddedRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hide mini-cart while PDP sticky Add-to-Cart bar is active (avoids tap intercept).
  useEffect(() => {
    const sync = () => {
      setPdpStickyAtc(
        document.body.classList.contains("pdp-sticky-atc-visible") ||
          document.documentElement.getAttribute(PDP_STICKY_ATC_ATTR) === "1"
      );
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [PDP_STICKY_ATC_ATTR],
    });
    return () => obs.disconnect();
  }, []);

  const hide = shouldHideMiniCartBar(pathname);
  const visible = mounted && !hide && itemCount > 0 && !pdpStickyAtc;

  // Coupons are not applied in the bar — /cart is the source of truth for discounts.
  const { classification } = useCartClassification({
    enabled: visible,
    cart,
  });

  const classificationReady = Boolean(
    classification && classification.ready && !classification.error
  );

  const amountText = useMemo(() => {
    // Until CMS loads, do not guess OFF and show a VAT-added total.
    if (!cmsLoaded) return "Calculating…";
    return formatMiniCartAmountText({
      subtotal: total,
      cartLength: cart.length,
      classificationReady,
      hasPhysicalItems: classification?.hasPhysicalItems === true,
      pricesIncludeVat,
    });
  }, [
    cmsLoaded,
    total,
    cart.length,
    classificationReady,
    classification?.hasPhysicalItems,
    pricesIncludeVat,
  ]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      document.documentElement.setAttribute(BAR_VISIBLE_ATTR, "1");
      document.body.classList.add("minicart-bar-visible");
    } else {
      document.documentElement.removeAttribute(BAR_VISIBLE_ATTR);
      document.body.classList.remove("minicart-bar-visible");
    }
    return () => {
      document.documentElement.removeAttribute(BAR_VISIBLE_ATTR);
      document.body.classList.remove("minicart-bar-visible");
    };
  }, [mounted, visible]);

  useEffect(() => {
    if (!mounted || !lastAddedAt) return;
    const label =
      itemCount === 1
        ? `1 item in cart, ${amountText}`
        : `${itemCount} items in cart, ${amountText}`;
    setAnnounce(`Added to cart. ${label}`);
  }, [lastAddedAt, itemCount, amountText, mounted]);

  useEffect(() => {
    if (!mounted || !lastAddedAt) return;
    if (seenLastAddedRef.current === null) {
      seenLastAddedRef.current = lastAddedAt;
      return;
    }
    if (lastAddedAt === seenLastAddedRef.current) return;
    seenLastAddedRef.current = lastAddedAt;
    setAddFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setAddFlash(false);
      flashTimerRef.current = null;
    }, MINI_CART_FLASH_MS);
  }, [lastAddedAt, mounted]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // SSR + first client paint: no markup (SEO / CLS safe)
  if (!mounted || !visible) return null;

  const itemLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;

  return (
    <>
      <style>{`
        .mini-cart-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 56px;
          padding: 10px 16px;
          padding-bottom: max(10px, env(safe-area-inset-bottom));
          background: #FFFFFF;
          color: #111827;
          border-top: 3px solid #5B21B6;
          font-family: var(--font-body), 'Inter', system-ui, sans-serif;
          box-shadow: 0 -8px 28px rgba(17,24,39,0.22);
        }
        .mini-cart-bar__summary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #111827;
        }
        .mini-cart-bar__summary-icon {
          flex-shrink: 0;
          color: #5B21B6;
        }
        .mini-cart-bar__actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .mini-cart-bar__btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          min-width: 44px;
          padding: 0 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid transparent;
          cursor: pointer;
        }
        .mini-cart-bar__btn--view {
          background: transparent;
          color: #5B21B6;
          border: 1.5px solid #5B21B6;
        }
        .mini-cart-bar__btn--view:hover {
          background: #F5F3FF;
        }
        .mini-cart-bar__btn--view:focus-visible {
          outline: 2px solid #5B21B6;
          outline-offset: 2px;
        }
        .mini-cart-bar__btn--checkout {
          background: #15803D;
          color: #FFFFFF;
          border-color: transparent;
        }
        .mini-cart-bar__btn--checkout:hover {
          background: #166534;
        }
        .mini-cart-bar__btn--checkout:focus-visible {
          outline: 2px solid #15803D;
          outline-offset: 2px;
        }
        .mini-cart-bar__live {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        @keyframes mini-cart-bar-add-flash {
          0% {
            transform: translateY(8px);
            border-top-color: #7C3AED;
          }
          100% {
            transform: translateY(0);
            border-top-color: #5B21B6;
          }
        }
        .mini-cart-bar.mini-cart-bar--add-flash {
          animation: mini-cart-bar-add-flash 900ms ease-out 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .mini-cart-bar {
            transition: none;
          }
          .mini-cart-bar.mini-cart-bar--add-flash {
            animation: none;
          }
        }
      `}</style>
      <div
        className={`mini-cart-bar${addFlash ? " mini-cart-bar--add-flash" : ""}`}
        role="region"
        aria-label="Cart summary"
        data-minicart-bar="visible"
        data-minicart-classification={
          classificationReady ? "ready" : "pending"
        }
      >
        <div className="mini-cart-bar__summary">
          <svg
            className="mini-cart-bar__summary-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
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
          {itemLabel} · {amountText}
        </div>
        <div className="mini-cart-bar__actions">
          <a
            className="mini-cart-bar__btn mini-cart-bar__btn--view"
            href="/cart"
            data-insights-id="cart_view"
          >
            View cart
          </a>
          <a
            className="mini-cart-bar__btn mini-cart-bar__btn--checkout"
            href="/cart"
            data-insights-id="mini_checkout"
          >
            Checkout
          </a>
        </div>
        <div className="mini-cart-bar__live" aria-live="polite" aria-atomic="true">
          {announce}
        </div>
      </div>
    </>
  );
}

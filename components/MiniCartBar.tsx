"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/app/lib/cartContext";
import { useCartClassification } from "@/lib/useCartClassification";
import { formatMiniCartAmountText } from "@/lib/cartDisplayTotals";

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

export default function MiniCartBar() {
  const pathname = usePathname();
  const { cart, total, itemCount, lastAddedAt } = useCart();
  const [mounted, setMounted] = useState(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const hide = shouldHideMiniCartBar(pathname);
  const visible = mounted && !hide && itemCount > 0;

  // Coupons are not applied in the bar — /cart is the source of truth for discounts.
  const { classification } = useCartClassification({
    enabled: visible,
    cart,
  });

  const classificationReady = Boolean(
    classification && classification.ready && !classification.error
  );

  const amountText = useMemo(
    () =>
      formatMiniCartAmountText({
        subtotal: total,
        cartLength: cart.length,
        classificationReady,
        hasPhysicalItems: classification?.hasPhysicalItems === true,
      }),
    [total, cart.length, classificationReady, classification?.hasPhysicalItems]
  );

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
          background: #111111;
          color: #FFFFFF;
          font-family: var(--font-body), 'Inter', system-ui, sans-serif;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.18);
        }
        .mini-cart-bar__summary {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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
          color: #FFFFFF;
          border-color: rgba(255,255,255,0.45);
        }
        .mini-cart-bar__btn--view:hover,
        .mini-cart-bar__btn--view:focus-visible {
          border-color: #FFFFFF;
          outline: 2px solid #FFFFFF;
          outline-offset: 2px;
        }
        .mini-cart-bar__btn--checkout {
          background: #5B21B6;
          color: #FFFFFF;
        }
        .mini-cart-bar__btn--checkout:hover,
        .mini-cart-bar__btn--checkout:focus-visible {
          background: #4C1D95;
          outline: 2px solid #FFFFFF;
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
        @media (prefers-reduced-motion: reduce) {
          .mini-cart-bar {
            transition: none;
          }
        }
      `}</style>
      <div
        className="mini-cart-bar"
        role="region"
        aria-label="Cart summary"
        data-minicart-bar="visible"
        data-minicart-classification={
          classificationReady ? "ready" : "pending"
        }
      >
        <div className="mini-cart-bar__summary">
          {itemLabel} · {amountText}
        </div>
        <div className="mini-cart-bar__actions">
          <a className="mini-cart-bar__btn mini-cart-bar__btn--view" href="/cart">
            View cart
          </a>
          <a
            className="mini-cart-bar__btn mini-cart-bar__btn--checkout"
            href="/cart"
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSiteContent } from "@/hooks/useSiteContent";

function isWaHiddenRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/cart" || p === "/cart/success";
}

function isProductsRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/products";
}

export default function WhatsAppButton() {
  const { sc } = useSiteContent();
  const pathname = usePathname();
  const hideOnRoute = isWaHiddenRoute(pathname);
  const productsRoute = isProductsRoute(pathname);
  const [offsetForMiniCart, setOffsetForMiniCart] = useState(false);
  const [hideForConsent, setHideForConsent] = useState(false);
  const [hideForStickyCheckout, setHideForStickyCheckout] = useState(false);

  const config = useMemo(
    () => ({
      number:
        sc.contact_whatsapp || sc.whatsapp_number || "447518787653",
      iconUrl: sc.whatsapp_icon_url || "",
      title:
        (sc.wa_chat_title || "Chat on WhatsApp").trim() || "Chat on WhatsApp",
    }),
    [sc]
  );

  // Offset / hide after mount from body/html markers (no SSR class change)
  useEffect(() => {
    const sync = () => {
      setOffsetForMiniCart(
        document.body.classList.contains("minicart-bar-visible") ||
          document.documentElement.getAttribute("data-minicart-bar") === "1"
      );
      setHideForConsent(
        document.body.classList.contains("consent-banner-visible") ||
          document.documentElement.getAttribute("data-consent-banner") === "1"
      );
      setHideForStickyCheckout(
        document.body.classList.contains("sticky-checkout-bar-visible") ||
          document.documentElement.getAttribute("data-sticky-checkout") === "1"
      );
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "data-minicart-bar",
        "data-consent-banner",
        "data-sticky-checkout",
      ],
    });
    return () => obs.disconnect();
  }, []);

  // Route markers for CSS padding / products-side placement (client-only)
  useEffect(() => {
    if (hideOnRoute) {
      document.body.setAttribute("data-hide-wa-float", "1");
      document.body.classList.remove("wa-float-safe-pad");
    } else {
      document.body.removeAttribute("data-hide-wa-float");
      document.body.classList.add("wa-float-safe-pad");
    }
    if (productsRoute) {
      document.body.setAttribute("data-products-page", "1");
    } else {
      document.body.removeAttribute("data-products-page");
    }
    return () => {
      document.body.removeAttribute("data-hide-wa-float");
      document.body.removeAttribute("data-products-page");
      document.body.classList.remove("wa-float-safe-pad");
    };
  }, [hideOnRoute, productsRoute]);

  const whatsappUrl = `https://wa.me/${config.number}`;
  const hidden = hideOnRoute || hideForConsent || hideForStickyCheckout;

  return (
    <>
      <style>{`
        .wa-float {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9997;
          cursor: pointer;
          overflow: hidden;
        }
        .wa-float img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }
        /* Stack WhatsApp above the mini-cart bar (bar ~56px + gap) */
        .wa-float.wa-float--above-minicart {
          bottom: 88px;
        }
        .wa-float.wa-float--hidden {
          display: none !important;
        }
        /* Mobile: smaller, slightly transparent; page pad so last cards clear it */
        @media (max-width: 900px) {
          .wa-float {
            width: 48px;
            height: 48px;
            bottom: 16px;
            right: 16px;
            opacity: 0.85;
          }
          .wa-float.wa-float--above-minicart {
            bottom: 80px;
          }
          body.wa-float-safe-pad {
            padding-bottom: 72px;
          }
          /* Products listing: keep Add to Cart tappable — float on bottom-LEFT */
          body[data-products-page="1"] .wa-float {
            left: 16px;
            right: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .wa-float {
            transition: none;
          }
        }
      `}</style>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          "wa-float",
          offsetForMiniCart ? "wa-float--above-minicart" : "",
          "wa-float--cart-aware",
          hidden ? "wa-float--hidden" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          background: config.iconUrl ? "transparent" : "#25D366",
        }}
        title={config.title}
        aria-hidden={hidden ? true : undefined}
        tabIndex={hidden ? -1 : undefined}
        data-wa-hidden={hidden ? "1" : "0"}
        data-wa-route-hidden={hideOnRoute ? "1" : "0"}
      >
        {config.iconUrl ? (
          <img
            src={config.iconUrl}
            alt="WhatsApp"
          />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m0 0h-.001zM12.05 21.785h-.004c-1.708 0-3.385-.458-4.856-1.325l-.348-.207-3.61.948.964-3.521-.227-.362A9.86 9.86 0 0 1 2.15 11.03c0-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05.001C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
          </svg>
        )}
      </a>
    </>
  );
}

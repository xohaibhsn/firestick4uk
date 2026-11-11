"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import xss from "xss";
import { fixContentLinkRels } from "@/lib/seoLinks";
import { useCart } from "../../lib/cartContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useContactConfig } from "@/hooks/useContactConfig";
import { useSiteContent } from "@/hooks/useSiteContent";
import { fillVars } from "@/lib/cms";
import SeasonalCountdown from "@/components/product/SeasonalCountdown";
import SeasonalAlternativeCards, {
  type SeasonalAltCard,
} from "@/components/product/SeasonalAlternativeCards";
import { floorSecondUtcMs, parseUtcSqlToMs } from "@/lib/productSeasonLondon";
import {
  bindCoordinatorProduct,
  clearPurchaseBlockAfterAuthoritativeOk,
  createBoundaryCoordinator,
  makeBoundaryKey,
  runBoundaryRevalidation,
  type BoundaryCoordinatorState,
} from "@/lib/productSeasonBoundaryClient";
import { isDigitalProduct } from "@/lib/productFulfilment";
import { stockBadgeLabel } from "@/lib/stockBadgeLabel";

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
  season_ended_notice?: string | null;
  available_offers_heading?: string | null;
  season_name?: string | null;
  season_phase?: string;
  season_starts_at?: string | null;
  season_ends_at?: string | null;
  season_show_countdown?: boolean;
  purchasable?: boolean;
}

export default function ProductDetail({
  slug,
  initialProduct,
  seasonPhase = "permanent",
  purchasable = true,
  showHubLink = false,
  availableOffers = [],
  upcomingOffers = [],
  /** Test-only coherent clock shared with SeasonalCountdown. */
  getNowMs,
  /** Test-only fetch boundary (production uses global fetch). */
  fetchImpl,
}: {
  slug: string;
  initialProduct: Product | null;
  seasonPhase?: string;
  purchasable?: boolean;
  showHubLink?: boolean;
  availableOffers?: SeasonalAltCard[];
  upcomingOffers?: SeasonalAltCard[];
  getNowMs?: () => number;
  fetchImpl?: typeof fetch;
}) {
  const doFetch = fetchImpl || fetch;
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [phase, setPhase] = useState(seasonPhase);
  const [canBuyProp, setCanBuyProp] = useState(purchasable);
  const [availAlts, setAvailAlts] = useState(availableOffers);
  const [upAlts, setUpAlts] = useState(upcomingOffers);
  const [loading, setLoading] = useState(!initialProduct);
  const [added, setAdded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateFailed, setRevalidateFailed] = useState(false);
  const [purchaseBlockedLocal, setPurchaseBlockedLocal] = useState(false);
  const boundaryRef = useRef<BoundaryCoordinatorState>(createBoundaryCoordinator());
  // Bind coordinator to the current product/slug on route changes (never via late callbacks).
  useEffect(() => {
    if (!initialProduct?.id && !product?.id) return;
    const id = initialProduct?.id ?? product?.id;
    if (id == null) return;
    bindCoordinatorProduct(boundaryRef.current, id, slug);
  }, [slug, initialProduct?.id, product?.id]);
  const { addToCart, removeFromCart, cart, itemCount } = useCart();
  const contact = useContactConfig();
  const { t } = useSiteContent();
  const vars = { phone: contact.phone, telegram: contact.telegram };

  // SSR / router.refresh props replace stale client state — never re-enable an expired CTA
  // from stale purchasable=true while a boundary block is active. After a settled boundary
  // refresh, do not clobber the authoritative client purchase decision with stale props.
  useEffect(() => {
    if (!initialProduct) return;
    setProduct((prev) => {
      // Prefer fresher client merge when a boundary already settled for this product.
      if (
        prev &&
        Number(prev.id) === Number(initialProduct.id) &&
        boundaryRef.current.completed.size > 0
      ) {
        return {
          ...initialProduct,
          ...prev,
          // Keep SSR alts/content fields from props when present
          name: initialProduct.name ?? prev.name,
          short_description: initialProduct.short_description ?? prev.short_description,
        };
      }
      return initialProduct;
    });
    setAvailAlts(availableOffers);
    setUpAlts(upcomingOffers);
    setLoading(false);
    const blocked = boundaryRef.current.purchaseBlocked;
    if (blocked && boundaryRef.current.blockedReason) {
      setCanBuyProp(false);
      return;
    }
    if (boundaryRef.current.completed.size > 0) {
      // Authoritative client decision already applied — ignore stale purchasable prop.
      return;
    }
    setPhase(seasonPhase);
    setCanBuyProp(purchasable);
    setRevalidateFailed(false);
  }, [initialProduct, seasonPhase, purchasable, availableOffers, upcomingOffers]);

  useEffect(() => {
    if (initialProduct) return;
    doFetch(`/api/products?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => { setProduct(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, initialProduct, doFetch]);

  const handleBoundary = useCallback(
    async (kind: "start" | "end") => {
      const p = product;
      if (!p?.id) return;
      const targetIso = kind === "start" ? p.season_starts_at : p.season_ends_at;
      const targetMs = parseUtcSqlToMs(targetIso);
      if (targetMs == null) return;
      const key = makeBoundaryKey({ productId: p.id, kind, targetMs });
      const requestSlug = slug;
      const requestProductId = p.id;

      const outcome = await runBoundaryRevalidation({
        state: boundaryRef.current,
        key,
        productId: requestProductId,
        slug: requestSlug,
        maxRetries: 3,
        onImmediateBlock: () => {
          setPurchaseBlockedLocal(true);
          setCanBuyProp(false);
          setRevalidating(true);
        },
        refresh: async () => {
          const r = await doFetch(`/api/products?slug=${encodeURIComponent(requestSlug)}`, {
            cache: "no-store",
          });
          if (!r.ok) throw new Error("refresh_failed");
          const data = await r.json();
          if (!data || typeof data !== "object") throw new Error("empty");
          if (Number(data.id) !== Number(requestProductId)) throw new Error("stale_product_response");
          return data;
        },
      });

      // Completed/stale duplicates must not re-disable CTA or re-apply settled state.
      if (outcome.completedDuplicate || outcome.ignoredStaleContext) {
        return;
      }

      if (outcome.duplicate && !outcome.result && !outcome.error) {
        setRevalidating(boundaryRef.current.inflight.size > 0);
        return;
      }

      // Ignore late response if product/slug changed while awaiting.
      if (
        String(boundaryRef.current.activeProductId) !== String(requestProductId) ||
        boundaryRef.current.activeSlug !== requestSlug
      ) {
        return;
      }

      if (outcome.error || !outcome.result) {
        setRevalidateFailed(true);
        setCanBuyProp(false);
        setPurchaseBlockedLocal(true);
        setPhase((prev) => (prev === "live" || prev === "upcoming" ? "ended" : prev));
        setRevalidating(false);
        return;
      }

      // Apply settled response only once (owner started === true, or first joiner with result).
      if (outcome.duplicate && !outcome.started) {
        // Joiners that received the same settled result: apply only if still pending block.
        if (!boundaryRef.current.purchaseBlocked && !revalidating) {
          return;
        }
      }

      const data = outcome.result as Product & { season_phase?: string; purchasable?: boolean };
      setProduct((prev) => ({ ...(prev || {}), ...data }));
      if (typeof data.season_phase === "string") setPhase(data.season_phase);
      const nextPurchasable = data.purchasable !== false && data.purchasable !== undefined
        ? !!data.purchasable
        : false;
      setCanBuyProp(nextPurchasable);
      clearPurchaseBlockAfterAuthoritativeOk(boundaryRef.current, {
        productId: requestProductId,
        slug: requestSlug,
        purchasable: nextPurchasable,
      });
      setPurchaseBlockedLocal(boundaryRef.current.purchaseBlocked);
      setRevalidateFailed(false);
      setRevalidating(false);
      if (outcome.started) {
        router.refresh();
      }
    },
    [product, slug, router, doFetch, revalidating]
  );

  const onSeasonBoundary = useCallback(
    (kind: "start" | "end") => {
      void handleBoundary(kind);
    },
    [handleBoundary]
  );

  // Test-only fixture controls (present only when a coherent getNowMs clock is injected).
  useEffect(() => {
    if (!getNowMs || typeof window === "undefined") return;
    const w = window as unknown as {
      __PRODUCT_DETAIL_FIXTURE__?: {
        refireBoundary: (kind: "start" | "end") => void;
        getBoundarySnapshot: () => {
          completed: string[];
          purchaseBlocked: boolean;
          blockedReason: string | null;
        };
      };
    };
    w.__PRODUCT_DETAIL_FIXTURE__ = {
      refireBoundary: (kind) => {
        void handleBoundary(kind);
      },
      getBoundarySnapshot: () => ({
        completed: Array.from(boundaryRef.current.completed),
        purchaseBlocked: boundaryRef.current.purchaseBlocked,
        blockedReason: boundaryRef.current.blockedReason,
      }),
    };
    return () => {
      delete w.__PRODUCT_DETAIL_FIXTURE__;
    };
  }, [getNowMs, handleBoundary]);

  // Purchase-state boundary handling even when countdown display is OFF.
  useEffect(() => {
    if (phase !== "upcoming" && phase !== "live") return;
    const targetIso =
      phase === "upcoming" ? product?.season_starts_at : product?.season_ends_at;
    if (!targetIso || !product?.id) return;
    const target = parseUtcSqlToMs(targetIso);
    if (target == null) return;
    const kind = phase === "upcoming" ? "start" : "end";
    const tick = () => {
      const now = getNowMs ? getNowMs() : floorSecondUtcMs();
      if (now >= target) void handleBoundary(kind);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, [phase, product?.id, product?.season_starts_at, product?.season_ends_at, handleBoundary, getNowMs]);

  const isInCart = product ? cart.some(i => i.id === product.id) : false;

  const canPurchase =
    canBuyProp &&
    product?.purchasable !== false &&
    !revalidateFailed &&
    !purchaseBlockedLocal &&
    !revalidating;
  const handleAdd = () => {
    if (!product || isInCart || !canPurchase) return;
    addToCart({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      qty: 1,
      image: product.image || undefined,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const isDigital = product
    ? isDigitalProduct({ category: product.category, stock: product.stock })
    : false;

  // Sticky mobile ATC: hide mini-cart while this bar is active (combined CTA surface).
  useEffect(() => {
    if (!product) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => {
      const on = mq.matches;
      if (on) {
        document.body.classList.add("pdp-sticky-atc-visible");
        document.documentElement.setAttribute("data-pdp-sticky-atc", "1");
      } else {
        document.body.classList.remove("pdp-sticky-atc-visible");
        document.documentElement.removeAttribute("data-pdp-sticky-atc");
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      document.body.classList.remove("pdp-sticky-atc-visible");
      document.documentElement.removeAttribute("data-pdp-sticky-atc");
    };
  }, [product]);

  const featureList = product?.features
    ? product.features.split('\n').map(f => f.trim()).filter(Boolean)
    : [];

  return (
    <>
      <style>{`
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        body{background:#FFFFFF;color:#111111;font-family:var(--font-body);}
        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 60px;display:flex;align-items:center;justify-content:space-between;background:#FFFFFF;border-bottom:1px solid #E5E5E5;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
        .nav-logo{font-family:var(--font-display);font-size:20px;font-weight:800;color:#111111;text-decoration:none;letter-spacing:2px;}
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
        .product-name{font-family:var(--font-display);font-size:clamp(22px,3vw,34px);font-weight:800;letter-spacing:-0.03em;color:#111111;margin-bottom:12px;line-height:1.25;}
        .product-short-desc{color:#555555;font-size:15px;line-height:1.8;margin-bottom:18px;}
        .product-description,.product-full-description{color:#444444;font-size:15px;line-height:1.85;}
        .product-description p,.product-full-description p{margin:0 0 1rem;line-height:1.85;}
        .product-description ul,.product-full-description ul{list-style:disc;padding-left:1.5rem;margin:1rem 0;}
        .product-description ol,.product-full-description ol{list-style:decimal;padding-left:1.5rem;margin:1rem 0;}
        .product-description li,.product-full-description li{margin:0.4rem 0;color:#333333;}
        .product-description h1,.product-full-description h1{font-family:var(--font-display);font-size:1.75rem;font-weight:700;color:#111111;margin:1.25rem 0 0.75rem;}
        .product-description h2,.product-full-description h2{font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:#111111;margin:1.25rem 0 0.75rem;}
        .product-description h3,.product-full-description h3{font-family:var(--font-display);font-size:1.25rem;font-weight:600;color:#5B21B6;margin:1rem 0 0.5rem;}
        .product-description a,.product-full-description a{color:#5B21B6;text-decoration:underline;}
        .product-description strong,.product-full-description strong{font-weight:700;color:#111111;}
        .product-description blockquote,.product-full-description blockquote{border-left:4px solid #5B21B6;padding:1rem 1.5rem;background:#F5F3FF;margin:1.25rem 0;color:#444444;font-style:italic;border-radius:0 8px 8px 0;}
        .product-description img,.product-full-description img{max-width:100%;border-radius:10px;margin:1.25rem 0;display:block;}
        .product-price{font-family:var(--font-display);font-size:36px;font-weight:800;color:#5B21B6;-webkit-text-fill-color:#5B21B6;margin-bottom:22px;}
        .badge-tag{display:inline-block;background:#5B21B6;color:#FFFFFF;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;margin-bottom:14px;}
        .add-btn{width:100%;min-height:44px;background:#5B21B6;color:#FFFFFF;border:none;padding:18px;border-radius:9px;font-size:16px;font-weight:700;letter-spacing:0.5px;cursor:pointer;transition:all 0.2s;}
        .add-btn:hover{background:#4C1D95;transform:translateY(-1px);box-shadow:0 4px 16px rgba(91,33,182,0.35);}
        .add-btn:focus-visible,.pdp-sticky-atc__btn:focus-visible,.back-link:focus-visible,.cart-link:focus-visible{outline:2px solid #5B21B6;outline-offset:2px;}
        .add-btn.added{background:#16A34A;}
        .meta-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px;}
        .meta-pill{background:#F5F5F5;border:1px solid #E5E5E5;border-radius:20px;padding:6px 14px;font-size:13px;color:#555555;}
        .activation-note{background:#F5F3FF;border:1px solid #DDD6FE;border-radius:12px;padding:12px 14px;margin-bottom:18px;color:#444444;font-size:14px;line-height:1.6;}
        .cart-link{display:block;text-align:center;margin-top:14px;color:#5B21B6;font-size:13px;text-decoration:none;font-weight:600;}
        .cart-link:hover{color:#4C1D95;}
        .loading-state{text-align:center;padding:120px 24px;color:#888888;font-size:18px;}
        .product-sections{max-width:1100px;margin:0 auto;padding:0 60px 80px;}
        .section-block{background:#F9F9F9;border:1px solid #E5E5E5;border-radius:16px;padding:30px;margin-bottom:18px;}
        .section-heading{font-family:var(--font-display);font-size:17px;font-weight:700;color:#111111;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #E5E5E5;}
        .feature-list{list-style:none;display:flex;flex-direction:column;gap:10px;}
        .feature-list li{display:flex;align-items:center;gap:12px;color:#444444;font-size:15px;}
        .feature-list li::before{content:"✅";flex-shrink:0;}
        footer{background:#111111;padding:40px 60px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;}
        .footer-logo{font-family:var(--font-display);font-size:16px;font-weight:800;color:#FFFFFF;}
        .footer-copy{font-size:12px;color:rgba(255,255,255,0.4);}
        .whatsapp-btn{position:fixed;bottom:30px;right:30px;z-index:999;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 25px rgba(37,211,102,0.5);text-decoration:none;font-size:26px;transition:all 0.3s;}
        .whatsapp-btn:hover{transform:scale(1.1);}
        .pdp-sticky-atc{display:none;}
        .pdp-sticky-atc__live{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
        @media(max-width:768px){
          .page-wrap{padding:90px 16px 40px;padding-bottom:calc(88px + env(safe-area-inset-bottom, 0px));}
          .product-sections{padding:0 16px 60px;padding-bottom:calc(80px + env(safe-area-inset-bottom, 0px));}
          .product-layout{grid-template-columns:1fr;gap:24px;}
          footer{padding:30px 24px;flex-direction:column;text-align:center;}
          .pdp-sticky-atc{
            display:flex;position:fixed;left:0;right:0;bottom:0;z-index:10001;
            align-items:center;justify-content:space-between;gap:12px;
            min-height:56px;padding:10px 16px;padding-bottom:max(10px, env(safe-area-inset-bottom, 0px));
            background:#111111;color:#FFFFFF;box-shadow:0 -4px 20px rgba(0,0,0,0.18);
          }
          .pdp-sticky-atc__price{font-family:var(--font-display);font-size:18px;font-weight:800;color:#C4B5FD;white-space:nowrap;}
          .pdp-sticky-atc__btn{
            flex:1;max-width:240px;min-height:44px;border:none;border-radius:8px;
            background:#5B21B6;color:#FFFFFF;font-size:14px;font-weight:700;cursor:pointer;
          }
          .pdp-sticky-atc__btn.added{background:#16A34A;}
          .pdp-sticky-atc__btn:disabled{background:#9CA3AF;cursor:not-allowed;}
        }
      `}</style>

      <Navbar cartCount={itemCount} cta="cart" />

      <div className="page-wrap">
        {loading ? (
          <div className="loading-state">Loading product...</div>
        ) : !product ? (
          <div className="loading-state">
            <a href="/products" style={{color:"#5B21B6"}}>{t("pd_not_found", "Product not found. Browse all products →")}</a>
          </div>
        ) : (
          <>
            <a href="/products" className="back-link">{t("pd_back", "← Back to Products")}</a>
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
                <div className="product-price">
                  £{Number(product.price).toFixed(2)}
                  {(phase === "ended" || phase === "paused") && (
                    <span
                      data-testid="historical-price-label"
                      style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#92400E", marginTop: 4 }}
                    >
                      Historical seasonal price — not currently available to purchase
                    </span>
                  )}
                </div>
                {(phase === "ended" || phase === "paused" || phase === "upcoming" || revalidateFailed) && (
                  <div
                    data-testid="seasonal-status-banner"
                    style={{
                      margin: "12px 0",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #FCD34D",
                      background: "#FFFBEB",
                      color: "#92400E",
                      fontSize: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    {revalidateFailed
                      ? "Offer status could not be refreshed. Purchasing is unavailable until you reload."
                      : phase === "upcoming"
                      ? `Upcoming seasonal offer${product.season_name ? `: ${product.season_name}` : ""}. Purchasing is not available yet.`
                      : product.season_ended_notice ||
                        (phase === "paused"
                          ? "This seasonal offer is paused. Historical information remains available; purchasing is disabled."
                          : "This seasonal offer has ended. Prices shown are historical; purchasing is disabled.")}
                  </div>
                )}
                {revalidating ? (
                  <div data-testid="seasonal-revalidating" style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                    Updating offer status…
                  </div>
                ) : null}
                <SeasonalCountdown
                  phase={phase}
                  show={product.season_show_countdown !== false}
                  startsAt={product.season_starts_at}
                  endsAt={product.season_ends_at}
                  onBoundary={onSeasonBoundary}
                  getNowMs={getNowMs}
                />
                <div className="meta-row">
                  <span className="meta-pill" data-stock-badge="1">{stockBadgeLabel(product.stock)}</span>
                  {canPurchase ? (
                    <>
                      <span className="meta-pill">🚚 {t("pd_pill_delivery", "Fast Delivery")}</span>
                      {isDigital ? (
                        <span className="meta-pill" data-activation-badge="1">⚡ {t("pd_pill_active", "Active within 1 hour")}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="meta-pill" data-testid="seasonal-archive-meta">
                      Archive information
                    </span>
                  )}
                  <span className="meta-pill">✅ {t("pd_pill_uk", "UK Based")}</span>
                </div>
                {canPurchase && isDigital ? (
                  <div className="activation-note" data-activation-note="1">
                    {fillVars(t("pd_activation", "Subscription services are active within 1 hour of payment confirmation. Need help? WhatsApp {phone} or Telegram {telegram}."), vars)}
                  </div>
                ) : null}
                {canPurchase ? (
                  <button
                    className={`add-btn${added ? " added" : ""}`}
                    data-pdp-atc="inline"
                    data-insights-id="cart_add"
                    style={{background: isInCart ? (hovering ? "#DC2626" : "#16A34A") : (added ? "#16A34A" : "#5B21B6"), cursor: isInCart && !hovering ? "default" : "pointer", transform: "none"}}
                    onMouseEnter={() => isInCart && setHovering(true)}
                    onMouseLeave={() => setHovering(false)}
                    onClick={() => isInCart ? removeFromCart(product!.id) : handleAdd()}
                  >
                    {added && !isInCart
                      ? "✅ Added!"
                      : isInCart
                        ? (hovering ? t("pd_remove", "Remove from Cart") : t("pd_added", "Added to Cart!"))
                        : t("pd_add_cart", "Add to Cart →")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="add-btn"
                    disabled
                    data-testid="seasonal-purchase-disabled"
                    style={{ background: "#9CA3AF", cursor: "not-allowed", transform: "none" }}
                  >
                    {phase === "upcoming" ? "Purchasing opens soon" : "Offer not available to purchase"}
                  </button>
                )}
                <a href={t("pd_view_cart_link", "/cart")} className="cart-link">{t("pd_view_cart", "View Cart & Checkout →")}</a>
                {showHubLink ? (
                  <a
                    href="/seasonal-offers"
                    data-testid="seasonal-hub-link"
                    style={{ display: "block", marginTop: 10, fontSize: 13, color: "#5B21B6" }}
                  >
                    Seasonal offers hub
                  </a>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      {product && (product.full_description || featureList.length > 0) && (
        <div className="product-sections">
          {product.full_description && (
            <div className="section-block">
              <div className="section-heading">{t("pd_about_heading", "About This Product")}</div>
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
              <div className="section-heading">{t("pd_included_heading", "What's Included")}</div>
              <ul className="feature-list">
                {featureList.map((f, i) => (
                  <li key={i}>{f.replace(/^[✅✔️•\-*]\s*/,'')}</li>
                ))}
              </ul>
            </div>
          )}
          <SeasonalAlternativeCards
            heading={product.available_offers_heading}
            available={availAlts}
            upcoming={upAlts}
          />
        </div>
      )}
      {product && !(product.full_description || featureList.length > 0) && (
        <div className="product-sections">
          <SeasonalAlternativeCards
            heading={product.available_offers_heading}
            available={availableOffers}
            upcoming={upcomingOffers}
          />
        </div>
      )}
      {product ? (
        <div
          className="pdp-sticky-atc"
          data-pdp-sticky-atc-bar="1"
          role="region"
          aria-label="Add to cart"
        >
          <div className="pdp-sticky-atc__price">£{Number(product.price).toFixed(2)}</div>
          {canPurchase ? (
            <button
              type="button"
              className={`pdp-sticky-atc__btn${added || isInCart ? " added" : ""}`}
              data-pdp-atc="sticky"
              onClick={() => (isInCart ? removeFromCart(product.id) : handleAdd())}
            >
              {added && !isInCart
                ? "✅ Added!"
                : isInCart
                  ? t("pd_added", "Added to Cart!")
                  : t("pd_add_cart", "Add to Cart →")}
            </button>
          ) : (
            <button type="button" className="pdp-sticky-atc__btn" disabled>
              {phase === "upcoming" ? "Purchasing opens soon" : "Offer not available to purchase"}
            </button>
          )}
          <div className="pdp-sticky-atc__live" aria-live="polite" aria-atomic="true">
            {added ? "Added to cart" : ""}
          </div>
        </div>
      ) : null}
        <Footer />

    </>
  );
}

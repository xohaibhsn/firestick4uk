/**
 * Localhost component/integration fixture mounting ACTUAL ProductDetail.tsx
 * + SeasonalCountdown with mocked router/cart/content/fetch boundaries.
 *
 * Label: NOT live authenticated Sidhu / full production-route acceptance.
 */
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = process.env.FIXTURE_OUT
  ? path.resolve(process.env.FIXTURE_OUT)
  : path.join(ROOT, "review-artifacts/visibility-11/ui-fixture");
fs.mkdirSync(OUT, { recursive: true });

const abs = (p) => path.resolve(p).split(path.sep).join("/");

// Stub modules for browser bundle
const stubsDir = path.join(OUT, "stubs");
fs.mkdirSync(stubsDir, { recursive: true });

fs.writeFileSync(
  path.join(stubsDir, "next-navigation.js"),
  `
export function useRouter() {
  return {
    refresh() {
      window.__FIXTURE_EVENTS__ = window.__FIXTURE_EVENTS__ || [];
      window.__FIXTURE_EVENTS__.push({ type: "router.refresh", t: Date.now() });
      window.__FIXTURE_DUMP__ && window.__FIXTURE_DUMP__();
    },
    push() {},
    replace() {},
    prefetch() {},
  };
}
export function usePathname() { return "/products/winter-bundle"; }
export function useSearchParams() { return new URLSearchParams(); }
`
);

fs.writeFileSync(
  path.join(stubsDir, "cart-context.js"),
  `
import React, { createContext, useContext, useState } from "react";
const Ctx = createContext(null);
export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const addToCart = (item) => {
    window.__FIXTURE_EVENTS__ = window.__FIXTURE_EVENTS__ || [];
    window.__FIXTURE_EVENTS__.push({ type: "addToCart", item, t: Date.now() });
    setCart((c) => [...c, item]);
  };
  const removeFromCart = (id) => setCart((c) => c.filter((i) => i.id !== id));
  return React.createElement(Ctx.Provider, { value: { cart, addToCart, removeFromCart } }, children);
}
export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CartProvider required");
  return v;
}
`
);

fs.writeFileSync(
  path.join(stubsDir, "contact.js"),
  `export function useContactConfig() { return { phone: "07000", telegram: "@test" }; }`
);

fs.writeFileSync(
  path.join(stubsDir, "site-content.js"),
  `export function useSiteContent() { return { t: (k, d) => d || k }; }`
);

fs.writeFileSync(
  path.join(stubsDir, "navbar.js"),
  `export default function Navbar() { return null; }`
);
fs.writeFileSync(
  path.join(stubsDir, "footer.js"),
  `export default function Footer() { return null; }`
);
fs.writeFileSync(
  path.join(stubsDir, "cms.js"),
  `export function fillVars(s) { return s; }`
);
fs.writeFileSync(
  path.join(stubsDir, "seoLinks.js"),
  `export function fixContentLinkRels(s) { return s; }`
);
fs.writeFileSync(
  path.join(stubsDir, "xss.js"),
  `export default function xss(s) { return s; }`
);
fs.writeFileSync(
  path.join(stubsDir, "alts.js"),
  `export default function SeasonalAlternativeCards() { return null; }`
);

const mountEntry = path.join(OUT, "mount-entry.tsx");
fs.writeFileSync(
  mountEntry,
  `
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CartProvider } from "./stubs/cart-context.js";
import ProductDetail from "../../../app/products/[slug]/ProductDetail";

/**
 * Host for ACTUAL ProductDetail — coherent simulated clock for parent + countdown.
 * Scenarios driven via window.__FIXTURE_SCENARIO__ and clock control.
 */
function FixtureHost() {
  const endMs = Date.UTC(2026, 10, 8, 12, 0, 0);
  const startMs = Date.UTC(2026, 10, 8, 11, 0, 0);
  const scenario = (window as any).__FIXTURE_SCENARIO__ || "live_to_ended";
  const countdownOff = scenario === "countdown_off";
  const upcoming = scenario === "upcoming_to_live";

  const initialClock = upcoming ? startMs - 6000 : endMs - 6000;
  const clockRef = useRef(initialClock);
  const [, bump] = useState(0);
  const getNowMs = useCallback(() => clockRef.current, []);

  const requestsRef = useRef<any[]>([]);
  const deferredRef = useRef<{ resolve: () => void } | null>(null);
  const responseRef = useRef<any>(null);

  useEffect(() => {
    (window as any).__FIXTURE_EVENTS__ = [];
    (window as any).__FIXTURE_REQUESTS__ = requestsRef.current;
    (window as any).__FIXTURE_DUMP__ = () => {
      const btn = document.querySelector(
        "[data-testid=seasonal-purchase-disabled],[data-testid=add-to-cart],button"
      );
      const payload = {
        scenario,
        clock: clockRef.current,
        events: (window as any).__FIXTURE_EVENTS__,
        requests: requestsRef.current.map((r) => ({
          url: r.url,
          status: r.status,
          t: r.t,
        })),
        ctaDisabled: !!(btn as HTMLButtonElement)?.disabled,
        ctaText: btn?.textContent?.trim(),
        phaseText: document.body.innerText.includes("ended")
          ? "mentions-ended"
          : document.body.innerText.includes("Updating offer")
            ? "revalidating"
            : "other",
        historical: !!document.querySelector("[data-testid=historical-price-label]"),
      };
      fetch("/__dump", { method: "POST", body: JSON.stringify(payload) }).catch(() => {});
      (window as any).__LAST_DUMP__ = payload;
    };

    const id = window.setInterval(() => {
      clockRef.current += 500;
      bump((n) => n + 1);
      (window as any).__FIXTURE_DUMP__?.();
    }, 200);
    return () => window.clearInterval(id);
  }, [scenario]);

  const emptyAlts = useMemo(() => [], []);
  const product = useMemo(() => {
    if (upcoming) {
      return {
        id: 42,
        name: "Winter Bundle",
        description: "Seasonal",
        price: 65,
        badge: null,
        image: null,
        category: "Bundle",
        stock: "Digital",
        short_description: "Upcoming seasonal offer",
        full_description: null,
        features: null,
        seo_title: null,
        og_image: null,
        season_starts_at: "2026-11-08 11:00:00",
        season_ends_at: "2026-11-08 14:00:00",
        season_show_countdown: !countdownOff,
        purchasable: false,
        season_phase: "upcoming",
      };
    }
    return {
      id: 42,
      name: "Winter Bundle",
      description: "Seasonal",
      price: 65,
      badge: null,
      image: null,
      category: "Bundle",
      stock: "Digital",
      short_description: "Live seasonal offer",
      full_description: null,
      features: null,
      seo_title: null,
      og_image: null,
      season_starts_at: "2026-11-01 00:00:00",
      season_ends_at: "2026-11-08 12:00:00",
      season_show_countdown: !countdownOff,
      purchasable: true,
      season_phase: "live",
    };
  }, [upcoming, countdownOff]);

  const fetchImpl = useCallback(async (url: string, init?: RequestInit) => {
    const entry = { url: String(url), t: Date.now(), status: "pending" };
    requestsRef.current.push(entry);
    (window as any).__FIXTURE_REQUESTS__ = requestsRef.current;
    (window as any).__FIXTURE_EVENTS__ = (window as any).__FIXTURE_EVENTS__ || [];
    (window as any).__FIXTURE_EVENTS__.push({ type: "fetch", url: entry.url, t: entry.t });
    (window as any).__FIXTURE_DUMP__?.();

    const deferMs = scenario === "fail" ? 800 : 4500;
    await new Promise<void>((resolve) => {
      deferredRef.current = { resolve };
      const finish = () => {
        if (entry.status === "resolved") return;
        entry.status = "resolved";
        deferredRef.current?.resolve();
        deferredRef.current = null;
        (window as any).__FIXTURE_DUMP__?.();
      };
      (window as any).__FIXTURE_RELEASE_RESPONSE__ = finish;
      if ((window as any).__FIXTURE_HOLD_RESPONSE__) {
        // Evidence mode: stay pending until explicitly released.
        return;
      }
      window.setTimeout(finish, deferMs);
    });

    if (scenario === "fail") {
      return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as any;
    }

    const body =
      responseRef.current ||
      (upcoming
        ? {
            id: 42,
            name: "Winter Bundle",
            slug: "winter-bundle",
            price: 65,
            purchasable: true,
            season_phase: "live",
            season_starts_at: product.season_starts_at,
            season_ends_at: product.season_ends_at,
            season_show_countdown: product.season_show_countdown,
          }
        : {
            id: 42,
            name: "Winter Bundle",
            slug: "winter-bundle",
            price: 65,
            purchasable: false,
            season_phase: "ended",
            season_starts_at: product.season_starts_at,
            season_ends_at: product.season_ends_at,
            season_show_countdown: product.season_show_countdown,
          });

    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as any;
  }, [scenario, upcoming, product]);

  // Expose controls for late-duplicate / recovery demos
  useEffect(() => {
    (window as any).__FIXTURE_SET_RESPONSE__ = (r: any) => {
      responseRef.current = r;
    };
    (window as any).__FIXTURE_FIRE_BOUNDARY__ = () => {
      // Force clock past target
      clockRef.current = upcoming ? startMs + 1000 : endMs + 1000;
      bump((n) => n + 1);
    };
  }, [upcoming, startMs, endMs]);

  return (
    <CartProvider>
      <div style={{ fontFamily: "sans-serif" }}>
        <p
          style={{
            padding: "8px 16px",
            margin: 0,
            background: "#fff3cd",
            borderBottom: "1px solid #f0c36d",
            font: "12px monospace",
          }}
        >
          COMPONENT/INTEGRATION FIXTURE — mounts ACTUAL ProductDetail.tsx. Not live
          authenticated Sidhu / full production-route acceptance. scenario={scenario}
        </p>
        <ProductDetail
          slug="winter-bundle"
          initialProduct={product as any}
          seasonPhase={upcoming ? "upcoming" : "live"}
          purchasable={!upcoming}
          showHubLink={false}
          availableOffers={emptyAlts}
          upcomingOffers={emptyAlts}
          getNowMs={getNowMs}
          fetchImpl={fetchImpl as any}
        />
      </div>
    </CartProvider>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<FixtureHost />);
`
);

const build = spawnSync(process.execPath, [path.join(__dirname, "build-product-detail-fixture.cjs")], {
  encoding: "utf8",
  cwd: ROOT,
});

const evidence = {
  label:
    "component/integration fixture — ACTUAL ProductDetail.tsx — not live Sidhu / full production-route acceptance",
  esbuild: {
    status: build.status,
    stderr: (build.stderr || "").slice(0, 6000),
    stdout: (build.stdout || "").slice(0, 2000),
  },
};

fs.writeFileSync(
  path.join(OUT, "esbuild-log.txt"),
  (build.stderr || "") + "\n" + (build.stdout || ""),
  "utf8"
);

/**
 * Content page: NO fixed-width DIV wrapper.
 * Viewport is whatever browsing context loads this document
 * (top-level Emulation metrics OR a same-origin iframe of 390×844).
 */
const htmlFor = (scenario) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>ProductDetail boundary fixture (${scenario})</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    (function () {
      var params = new URLSearchParams(location.search);
      window.__FIXTURE_SCENARIO__ = ${JSON.stringify(scenario)};
      window.__FIXTURE_HOLD_RESPONSE__ = params.get("hold") === "1";
      window.__FIXTURE_CONSOLE_ERRORS__ = [];
      var orig = console.error;
      console.error = function () {
        try {
          window.__FIXTURE_CONSOLE_ERRORS__.push(
            Array.prototype.slice.call(arguments).map(String).join(" ")
          );
        } catch (_) {}
        return orig.apply(console, arguments);
      };
      window.__FIXTURE_MEASURE__ = function () {
        var layout = document.querySelector(".product-layout");
        var btn = document.querySelector(
          "[data-testid=seasonal-purchase-disabled],button"
        );
        var cs = layout ? getComputedStyle(layout) : null;
        var br = btn ? btn.getBoundingClientRect() : null;
        return {
          browsingContext: "content",
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          devicePixelRatio: window.devicePixelRatio,
          matchMediaMax768: window.matchMedia("(max-width: 768px)").matches,
          productLayoutColumns: cs ? cs.gridTemplateColumns : null,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          cta: btn
            ? {
                text: (btn.textContent || "").trim(),
                disabled: !!btn.disabled,
                testId: btn.getAttribute("data-testid"),
                rect: {
                  x: br.x,
                  y: br.y,
                  width: br.width,
                  height: br.height,
                  top: br.top,
                  bottom: br.bottom,
                  left: br.left,
                  right: br.right,
                },
                inViewport:
                  !!br &&
                  br.top >= 0 &&
                  br.bottom <= window.innerHeight &&
                  br.left >= 0 &&
                  br.right <= window.innerWidth,
              }
            : null,
          requests: (window.__FIXTURE_REQUESTS__ || []).map(function (r) {
            return { url: r.url, status: r.status };
          }),
          requestCount: (window.__FIXTURE_REQUESTS__ || []).length,
          boundarySnap:
            window.__PRODUCT_DETAIL_FIXTURE__ &&
            window.__PRODUCT_DETAIL_FIXTURE__.getBoundarySnapshot
              ? window.__PRODUCT_DETAIL_FIXTURE__.getBoundarySnapshot()
              : null,
          consoleErrors: window.__FIXTURE_CONSOLE_ERRORS__ || [],
        };
      };
    })();
  </script>
  <script src="/mount.js"></script>
</body>
</html>`;

/** Same-origin iframe host: provides a genuine 390×844 browsing viewport for ProductDetail. */
const mobileHostHtml = (contentPath) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Mobile iframe host 390×844 — ${contentPath}</title>
  <style>
    html, body { margin: 0; padding: 16px; background: #111827; color: #e5e7eb; font: 12px/1.4 monospace; }
    .label { margin-bottom: 8px; }
    iframe#mobile-viewport {
      display: block;
      width: 390px;
      height: 844px;
      border: 2px solid #fbbf24;
      background: #fff;
      /* No transform/scale — content viewport must be the iframe's own CSS viewport. */
    }
  </style>
</head>
<body>
  <div class="label">SAME-ORIGIN IFRAME browsing context 390×844 — mounts ACTUAL ProductDetail inside iframe. Not a DIV clip.</div>
  <iframe
    id="mobile-viewport"
    title="mobile-390x844"
    src="${contentPath}"
    width="390"
    height="844"
  ></iframe>
  <script>
    window.__HOST_MEASURE_IFRAME__ = function () {
      var frame = document.getElementById("mobile-viewport");
      var w = frame.contentWindow;
      var d = frame.contentDocument;
      if (!w || !d || typeof w.__FIXTURE_MEASURE__ !== "function") {
        return { error: "iframe_not_ready", frameAttrs: { width: frame.width, height: frame.height } };
      }
      var m = w.__FIXTURE_MEASURE__();
      m.host = {
        iframeAttrWidth: Number(frame.getAttribute("width")),
        iframeAttrHeight: Number(frame.getAttribute("height")),
        iframeCssWidth: frame.getBoundingClientRect().width,
        iframeCssHeight: frame.getBoundingClientRect().height,
      };
      m.browsingContext = "same-origin-iframe";
      return m;
    };
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(OUT, "index.html"), htmlFor("live_to_ended"));
fs.writeFileSync(path.join(OUT, "upcoming.html"), htmlFor("upcoming_to_live"));
fs.writeFileSync(path.join(OUT, "countdown-off.html"), htmlFor("countdown_off"));
fs.writeFileSync(path.join(OUT, "fail.html"), htmlFor("fail"));
fs.writeFileSync(
  path.join(OUT, "mobile-host-live-ended.html"),
  mobileHostHtml("/content-live-ended.html?hold=1")
);
fs.writeFileSync(
  path.join(OUT, "mobile-host-upcoming.html"),
  mobileHostHtml("/content-upcoming.html?hold=1")
);
fs.writeFileSync(path.join(OUT, "content-live-ended.html"), htmlFor("live_to_ended"));
fs.writeFileSync(path.join(OUT, "content-upcoming.html"), htmlFor("upcoming_to_live"));

let dumps = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://127.0.0.1");
  if (u.pathname === "/__dump" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        dumps.push(JSON.parse(body));
        fs.writeFileSync(path.join(OUT, "interaction-log.json"), JSON.stringify(dumps, null, 2));
      } catch {}
      res.writeHead(204);
      res.end();
    });
    return;
  }
  if (u.pathname === "/mount.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(fs.readFileSync(path.join(OUT, "mount.js")));
    return;
  }
  const routes = {
    "/": htmlFor("live_to_ended"),
    "/index.html": htmlFor("live_to_ended"),
    "/upcoming": htmlFor("upcoming_to_live"),
    "/upcoming.html": htmlFor("upcoming_to_live"),
    "/countdown-off": htmlFor("countdown_off"),
    "/countdown-off.html": htmlFor("countdown_off"),
    "/fail": htmlFor("fail"),
    "/fail.html": htmlFor("fail"),
    "/content-live-ended.html": htmlFor("live_to_ended"),
    "/content-upcoming.html": htmlFor("upcoming_to_live"),
    "/mobile-host-live-ended.html": mobileHostHtml(
      "/content-live-ended.html" + (u.search || "?hold=1")
    ),
    "/mobile-host-upcoming.html": mobileHostHtml(
      "/content-upcoming.html" + (u.search || "?hold=1")
    ),
  };
  if (Object.prototype.hasOwnProperty.call(routes, u.pathname)) {
    let html = routes[u.pathname];
    // Preserve hold/query on content pages served via pathname-only routes
    if (u.pathname.startsWith("/content-") || u.pathname === "/" || u.pathname.endsWith(".html")) {
      // hold already baked via search on iframe src; for direct content, inject from query:
      if (u.searchParams.get("hold") === "1" && !html.includes('__FIXTURE_HOLD_RESPONSE__ = true')) {
        html = html.replace(
          'window.__FIXTURE_HOLD_RESPONSE__ = params.get("hold") === "1";',
          "window.__FIXTURE_HOLD_RESPONSE__ = true;"
        );
      }
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

const PORT = 8769;
if (build.status !== 0) {
  evidence.error = "esbuild failed";
  fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.error(JSON.stringify(evidence, null, 2));
  process.exit(1);
}

server.listen(PORT, "127.0.0.1", () => {
  evidence.server = `http://127.0.0.1:${PORT}/`;
  fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, url: evidence.server }, null, 2));
  console.log("Fixture server listening for browser screenshots.");
});

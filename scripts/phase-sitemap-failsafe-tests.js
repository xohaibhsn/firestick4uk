/**
 * Focused sitemap fail-closed guards for metadata-route 500 prevention.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const sitemap = read("app/sitemap.ts");
const sitemapData = read("lib/sitemapDataServer.ts");
const nextResolve = read(
  "node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js"
);
const nextLoader = read(
  "node_modules/next/dist/build/webpack/loaders/next-metadata-route-loader.js"
);
const invalidation = read("lib/hostingerResourceInvalidation.ts");

ok(
  "next_serializer_calls_toISOString_on_Date",
  /lastModified\.toISOString\(\)/.test(nextResolve)
);
ok(
  "next_metadata_loader_has_no_try_catch_around_handler",
  /const data = await handler\(\)/.test(nextLoader) &&
    /const content = resolveRouteData\(data, fileType\)/.test(nextLoader) &&
    !/try\s*\{\s*const data = await handler\(\)/.test(nextLoader)
);

ok(
  "sitemap_route_uses_safe_wrapper_not_raw_cache",
  /getSitemapDynamicDataSafe/.test(sitemap) &&
    !/await getCachedSitemapDynamicData\(\)/.test(sitemap)
);
ok(
  "sitemap_route_uses_parseFactualLastModified",
  /parseFactualLastModified\(p\.lastModified\)/.test(sitemap) &&
    !/new Date\(p\.lastModified\)/.test(sitemap)
);
ok(
  "sitemap_route_outer_try_catch_static_fallback",
  /try\s*\{[\s\S]*getSitemapDynamicDataSafe[\s\S]*\}\s*catch/.test(sitemap) &&
    /emptySitemapDynamicData/.test(sitemap)
);
ok(
  "sitemap_keeps_force_dynamic_and_ttl_cache",
  /export const dynamic = ["']force-dynamic["']/.test(sitemap) &&
    /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData) &&
    /unstable_cache/.test(sitemapData)
);
ok(
  "sitemap_cache_key_v2",
  /\["sitemap-dynamic-data-v2"\]/.test(sitemapData)
);
ok(
  "no_pages_router_revalidate_regression",
  !/revalidateTag\s*\(/.test(sitemapData) &&
    !/revalidatePath\s*\(/.test(sitemapData) &&
    !/revalidateTag\s*\(/.test(invalidation) &&
    !/revalidatePath\s*\(/.test(invalidation)
);

function emptySitemapDynamicData() {
  return {
    subscriptionUrl: "https://firestick4uk.com/iptv-subscriptions-uk",
    products: [],
    posts: [],
  };
}
function factualTimestamp(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function parseFactualLastModified(iso) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}
async function resolveSitemapDynamicDataWithFallback(
  primary,
  secondary,
  fallback = emptySitemapDynamicData
) {
  try {
    return await primary();
  } catch {
    try {
      return await secondary();
    } catch {
      return fallback();
    }
  }
}

ok("factualTimestamp_rejects_invalid", factualTimestamp("not-a-date") === null);
ok(
  "factualTimestamp_accepts_valid",
  typeof factualTimestamp("2024-01-02T03:04:05.000Z") === "string"
);
ok(
  "parseFactualLastModified_rejects_invalid",
  parseFactualLastModified("nope") === undefined &&
    parseFactualLastModified(null) === undefined
);
const good = parseFactualLastModified("2024-01-02T03:04:05.000Z");
ok(
  "parseFactualLastModified_valid_serializes",
  good instanceof Date && good.toISOString() === "2024-01-02T03:04:05.000Z"
);

let threw = false;
try {
  const bad = new Date("nope");
  if (bad) bad.toISOString();
} catch {
  threw = true;
}
ok("invalid_Date_toISOString_throws_RangeError", threw);

(async () => {
  const fromPrimaryFail = await resolveSitemapDynamicDataWithFallback(
    async () => {
      throw new Error("cache boom");
    },
    async () => ({
      subscriptionUrl: "https://firestick4uk.com/iptv-subscriptions-uk",
      products: [{ slug: "firestick-4k", lastModified: "2024-01-02T03:04:05.000Z" }],
      posts: [],
    })
  );
  ok(
    "fallback_uses_secondary_on_cache_throw",
    fromPrimaryFail.products[0]?.slug === "firestick-4k"
  );

  const fromBothFail = await resolveSitemapDynamicDataWithFallback(
    async () => {
      throw new Error("cache boom");
    },
    async () => {
      throw new Error("db boom");
    }
  );
  ok(
    "fallback_empty_when_both_throw",
    fromBothFail.products.length === 0 &&
      fromBothFail.posts.length === 0 &&
      fromBothFail.subscriptionUrl.includes("iptv-subscriptions-uk")
  );

  ok(
    "empty_helper_shape",
    emptySitemapDynamicData().subscriptionUrl ===
      "https://firestick4uk.com/iptv-subscriptions-uk"
  );

  // Static URL inventory still present in route source.
  ok(
    "static_urls_present",
    /\/products/.test(sitemap) &&
      /\/blog/.test(sitemap) &&
      /\/contact/.test(sitemap) &&
      /subscriptionUrl/.test(sitemap)
  );
  ok(
    "no_fabricated_request_time_lastmod",
    !/lastModified:\s*now/.test(sitemap) &&
      !/const now = new Date\(\)/.test(sitemap)
  );

  console.log(`\nphase-sitemap-failsafe: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

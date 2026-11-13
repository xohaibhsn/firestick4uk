/**
 * F4UK-PERF-HOME-81 — focused assertions (no live DB).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

let pass = 0;
let fail = 0;
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// Mirror of lib/cloudinaryDelivery.ts (keep in sync — also asserted via source patterns)
function stripTransforms(rest) {
  const parts = rest.split("/");
  let i = 0;
  while (i < parts.length) {
    const seg = parts[i];
    if (!seg) {
      i++;
      continue;
    }
    if (/^v\d+$/i.test(seg)) break;
    const isTransform =
      seg.includes(",") ||
      /^(c_|w_|h_|f_|q_|fl_|dpr_|e_|b_|g_|ar_|r_|u_|l_|o_|a_|t_)/i.test(seg);
    if (!isTransform) break;
    i++;
  }
  return parts.slice(i).join("/");
}

function cloudinaryDeliveryUrl(src, opts = {}) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i);
  if (!m) return raw;
  const prefix = m[1];
  const assetPath = stripTransforms(m[2]);
  if (!assetPath) return raw;
  const width = opts.width && opts.width > 0 ? Math.round(opts.width) : null;
  const height = opts.height && opts.height > 0 ? Math.round(opts.height) : null;
  const crop = opts.crop || "limit";
  const format = opts.format || "f_auto";
  const quality = opts.quality || "q_auto";
  const transforms = [];
  if (width && height) transforms.push(`c_${crop}`, `w_${width}`, `h_${height}`);
  else if (width) transforms.push(`c_limit`, `w_${width}`);
  else if (height) transforms.push(`c_limit`, `h_${height}`);
  transforms.push(format, quality);
  return `${prefix}${transforms.join(",")}/${assetPath}`;
}
function heroSlideSrc(src) {
  return cloudinaryDeliveryUrl(src, { width: 1600 });
}
function productCardSrc(src) {
  return cloudinaryDeliveryUrl(src, { width: 600 });
}

const sample =
  "https://res.cloudinary.com/dehknghwm/image/upload/v1785798299/firestick4uk/hero-slides/lkzagldrzr5vqos9ycgr.webp";

ok(
  "cld_injects_f_auto_q_auto_w",
  /\/upload\/c_limit,w_1600,f_auto,q_auto\//.test(heroSlideSrc(sample)),
  heroSlideSrc(sample)
);
ok(
  "cld_product_w_600",
  /\/upload\/c_limit,w_600,f_auto,q_auto\//.test(productCardSrc(sample))
);
ok(
  "cld_passthrough_non_cloudinary",
  cloudinaryDeliveryUrl("https://example.com/x.png", { width: 100 }) ===
    "https://example.com/x.png"
);
ok(
  "cld_replaces_existing_transform",
  productCardSrc(
    "https://res.cloudinary.com/dehknghwm/image/upload/c_fit,w_48,h_48,f_png,q_auto/v1/folder/x.webp"
  ) ===
    "https://res.cloudinary.com/dehknghwm/image/upload/c_limit,w_600,f_auto,q_auto/v1/folder/x.webp"
);

const cldSrc = read("lib/cloudinaryDelivery.ts");
ok("cld_source_has_hero_w1600", /width:\s*1600/.test(cldSrc));
ok("cld_source_has_product_w600", /width:\s*600/.test(cldSrc));

const hero = read("components/HeroSlider.tsx");
ok("hero_imports_delivery", /heroSlideSrc/.test(hero));
ok("hero_lcp_fetchpriority_high", /fetchPriority=\{isLcp \? "high" : "low"\}/.test(hero));
ok("hero_lcp_not_lazy", /loading=\{isLcp \? "eager" : "lazy"\}/.test(hero));
ok("hero_has_width_height", /width=\{HERO_W\}/.test(hero) && /height=\{HERO_H\}/.test(hero));
ok("hero_tab_role_on_dots", /role="tab"/.test(hero));

const homePage = read("app/page.tsx");
ok("home_fetches_hero_slide_keys", /hero_slide_1/.test(homePage) && /hero_slide_4/.test(homePage));
ok("home_passes_initialSlides", /initialSlides=\{initialSlides\}/.test(homePage));
ok("home_preloads_lcp_image", /rel="preload"/.test(homePage) && /as="image"/.test(homePage));
ok("home_uses_heroSlideSrc_preload", /heroSlideSrc\(initialSlides\[0\]\)/.test(homePage));

const homeClient = read("app/HomeClient.tsx");
ok("homeclient_initialSlides_prop", /initialSlides\?:/.test(homeClient));
ok("homeclient_seeds_slides_state", /useState<string\[\]>\(\(\)\s*=>/.test(homeClient));
ok("homeclient_product_card_delivery", /productCardSrc\(p\.image\)/.test(homeClient));
ok("homeclient_product_dims", /width=\{600\}/.test(homeClient) && /height=\{600\}/.test(homeClient));

const products = read("app/products/ProductsClient.tsx");
ok("products_card_delivery", /productCardSrc\(p\.image\)/.test(products));
ok("products_first_not_all_lazy", /loading=\{aboveFold \? "eager" : "lazy"\}/.test(products));
ok("products_first_fetchpriority", /fetchPriority=\{idx === 0 \? "high" : undefined\}/.test(products));
ok("products_dims", /width=\{600\}/.test(products) && /height=\{600\}/.test(products));

const layout = read("app/layout.tsx");
ok("fonts_nonblocking_media_print", /id="f4uk-fonts"/.test(layout) && /media="print"/.test(layout));
ok(
  "fonts_same_families",
  /family=Cinzel/.test(layout) && /family=Inter/.test(layout) && /Plus\+Jakarta\+Sans/.test(layout)
);
ok("fonts_noscript_fallback", /<noscript>/.test(layout));

const nav = read("components/Navbar.tsx");
ok("nav_logo_explicit_dims", /width=\{180\}/.test(nav) && /height=\{36\}/.test(nav));

ok("no_home_canonical_change", /canonical:\s*"https:\/\/firestick4uk\.com"/.test(homePage));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

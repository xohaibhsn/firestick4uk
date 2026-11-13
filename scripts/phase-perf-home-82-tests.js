/**
 * F4UK-PERF-HOME-82 — responsive hero srcset/sizes + <main> landmark (no live DB).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

// Mirror of lib/cloudinaryDelivery.ts helpers used by hero
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

const CLOUDINARY_UPLOAD =
  /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i;

function cloudinaryDeliveryUrl(src, opts = {}) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  const m = raw.match(CLOUDINARY_UPLOAD);
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

const HERO_SRCSET_WIDTHS = [480, 768, 1024, 1366, 1600];
function heroSlideSrcSet(src) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (!CLOUDINARY_UPLOAD.test(raw)) return "";
  return HERO_SRCSET_WIDTHS.map(
    (w) => `${cloudinaryDeliveryUrl(raw, { width: w })} ${w}w`
  ).join(", ");
}

const sample =
  "https://res.cloudinary.com/dehknghwm/image/upload/v1785798299/firestick4uk/hero-slides/lkzagldrzr5vqos9ycgr.webp";
const nonCld = "https://example.com/hero.png";

const srcSet = heroSlideSrcSet(sample);
ok(
  "srcset_has_all_widths",
  HERO_SRCSET_WIDTHS.every((w) =>
    srcSet.includes(`c_limit,w_${w},f_auto,q_auto/`)
  ) && HERO_SRCSET_WIDTHS.every((w) => srcSet.includes(` ${w}w`)),
  srcSet.slice(0, 120)
);
ok("srcset_empty_non_cloudinary", heroSlideSrcSet(nonCld) === "");
ok(
  "src_fallback_unchanged_non_cloudinary",
  heroSlideSrc(nonCld) === nonCld
);
ok(
  "src_still_w1600_cloudinary",
  /\/upload\/c_limit,w_1600,f_auto,q_auto\//.test(heroSlideSrc(sample))
);

const cldSrc = read("lib/cloudinaryDelivery.ts");
ok("cld_exports_heroSlideSrcSet", /export function heroSlideSrcSet/.test(cldSrc));
ok("cld_exports_HERO_SIZES", /HERO_SIZES\s*=\s*"100vw"/.test(cldSrc));
ok(
  "cld_widths_list",
  /480/.test(cldSrc) &&
    /768/.test(cldSrc) &&
    /1024/.test(cldSrc) &&
    /1366/.test(cldSrc) &&
    /1600/.test(cldSrc)
);

const hero = read("components/HeroSlider.tsx");
ok("hero_imports_srcset", /heroSlideSrcSet/.test(hero) && /HERO_SIZES/.test(hero));
ok(
  "hero_lcp_eager_high",
  /loading=\{isLcp \? "eager" : "lazy"\}/.test(hero) &&
    /fetchPriority=\{isLcp \? "high" : "low"\}/.test(hero)
);
ok(
  "hero_applies_srcset_conditionally",
  /srcSet/.test(hero) && /sizes:\s*HERO_SIZES/.test(hero)
);
ok("hero_has_width_height", /width=\{HERO_W\}/.test(hero) && /height=\{HERO_H\}/.test(hero));

const homePage = read("app/page.tsx");
ok(
  "home_preload_imagesrcset",
  /imageSrcSet=\{lcpSrcSet\}/.test(homePage) &&
    /imageSizes=\{HERO_SIZES\}/.test(homePage) &&
    /rel="preload"/.test(homePage) &&
    /as="image"/.test(homePage)
);
ok(
  "home_no_single_href_when_srcset",
  /lcpSrcSet \? \(/.test(homePage) &&
    /href=\{lcpSrc\}/.test(homePage) // fallback branch only
);
ok("home_canonical_unchanged", /canonical:\s*"https:\/\/firestick4uk\.com"/.test(homePage));

const homeClient = read("app/HomeClient.tsx");
ok(
  "home_main_landmark",
  /<main className=\{`page-wrapper/.test(homeClient) && /<\/main>/.test(homeClient)
);
ok(
  "home_one_main_open",
  (homeClient.match(/<main\b/g) || []).length === 1
);

const products = read("app/products/ProductsClient.tsx");
ok(
  "products_main_landmark",
  /<main className="page-wrapper">/.test(products) && /<\/main>/.test(products)
);
ok(
  "products_one_main_open",
  (products.match(/<main\b/g) || []).length === 1
);

const pdp = read("app/products/[slug]/ProductDetail.tsx");
ok(
  "pdp_main_landmark",
  /<main className="page-wrap">/.test(pdp) && /<\/main>/.test(pdp)
);
ok(
  "pdp_one_main_open",
  (pdp.match(/<main\b/g) || []).length === 1
);

// Retain PERF-81 suite
const r81 = spawnSync(process.execPath, [path.join(__dirname, "phase-perf-home-81-tests.js")], {
  cwd: ROOT,
  encoding: "utf8",
});
ok("perf81_suite_exit0", r81.status === 0, (r81.stdout || "").split("\n").slice(-3).join(" "));
if (r81.status !== 0) {
  console.log(r81.stdout);
  console.log(r81.stderr);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/**
 * Phase 18A — Media Library editor integration (static / source tests).
 * No DB mutations. Never prints secrets.
 *
 * Usage:
 *   node scripts/phase18a-media-editor-integration-tests.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  const tipTap = read("components/admin/TipTapEditor.tsx");
  const picker = read("components/admin/MediaLibraryPicker.tsx");
  const sidhu = read("app/sidhu/page.tsx");
  const mediaApi = read("pages/api/admin-media.ts");
  const perms = read("lib/adminPermissions.ts");
  const mediaLib = read("lib/mediaLibrary.ts");

  // A — TipTap still supports manual URL image insertion
  mark(
    "A",
    tipTap.includes('placeholder="https://res.cloudinary.com/... or any image URL"') &&
      tipTap.includes("setImage({ src: imgUrl })") &&
      /Insert/.test(tipTap),
    "manual URL + Insert"
  );

  // B — TipTap exposes optional Media Library callback
  mark(
    "B",
    tipTap.includes("onRequestMedia?:") &&
      tipTap.includes("insertImage: (url: string) => void") &&
      tipTap.includes("Choose from Library"),
    "onRequestMedia prop"
  );

  // C — TipTap captures/restores intended selection for library insertion
  mark(
    "C",
    tipTap.includes("pendingSelectionRef") &&
      tipTap.includes("setTextSelection") &&
      tipTap.includes("Math.min") &&
      tipTap.includes("setImage({ src })"),
    "selection restore"
  );

  // D — Blog content opens picker restricted to ["blog"]
  mark(
    "D",
    /Choose Blog Image[\s\S]{0,200}purposes:\s*\["blog"\]/.test(sidhu) ||
      /purposes:\s*\["blog"\][\s\S]{0,200}Choose Blog Image/.test(sidhu) ||
      (sidhu.includes('title: "Choose Blog Image"') &&
        sidhu.includes('purposes: ["blog"]') &&
        sidhu.includes("onRequestMedia={(insertImage)") &&
        /editBlog\.content[\s\S]{0,800}onRequestMedia/.test(sidhu)),
    "blog TipTap library"
  );

  // E — Product short/full editors open picker restricted to ["products"]
  mark(
    "E",
    sidhu.includes('title: "Choose Product Content Image"') &&
      (sidhu.match(/Choose Product Content Image/g) || []).length >= 2 &&
      /short_description[\s\S]{0,600}purposes:\s*\["products"\]/.test(sidhu) &&
      /full_description[\s\S]{0,600}purposes:\s*\["products"\]/.test(sidhu),
    "product TipTap library"
  );

  // F — Existing product main-image picker remains products purpose
  mark(
    "F",
    sidhu.includes('title: "Choose Product Image"') &&
      /Choose Product Image[\s\S]{0,250}purposes:\s*\["products"\]|purposes:\s*\["products"\][\s\S]{0,250}Choose Product Image/.test(
        sidhu
      ) &&
      /image:\s*asset\.url/.test(sidhu),
    "product main image"
  );

  // G — Existing blog featured-image picker remains blog purpose
  mark(
    "G",
    sidhu.includes('title: "Choose Featured Image"') &&
      /featured_image:\s*asset\.url/.test(sidhu) &&
      /Choose Featured Image[\s\S]{0,250}purposes:\s*\["blog"\]|purposes:\s*\["blog"\][\s\S]{0,250}Choose Featured Image/.test(
        sidhu
      ),
    "blog featured"
  );

  // H — Page Builder hero_image has Choose from Library
  mark(
    "H",
    /Hero Visual Image[\s\S]{0,3500}Choose from Library/.test(sidhu) &&
      sidhu.includes('title: "Choose Hero Image"'),
    "hero library button"
  );

  // I — Hero picker uses ["hero"]
  mark(
    "I",
    /Choose Hero Image[\s\S]{0,300}purposes:\s*\["hero"\]|purposes:\s*\["hero"\][\s\S]{0,300}Choose Hero Image/.test(
      sidhu
    ),
    "hero purposes"
  );

  // J — Selected hero asset changes sectionEditing.hero_image only (state, not immediate sections POST)
  {
    const heroBlock = sidhu.match(
      /Choose Hero Image[\s\S]{0,500}setSectionEditing\(\(p:\s*any\)\s*=>\s*\(\{\s*\.\.\.p,\s*hero_image:\s*asset\.url\s*\}\)\)/
    );
    const idx = sidhu.indexOf("Choose Hero Image");
    const nearby = idx >= 0 ? sidhu.slice(idx, idx + 500) : "";
    const noImmediatePostNear = nearby && !nearby.includes("/api/sections");
    mark("J", !!heroBlock && !!noImmediatePostNear, "state-only hero select");
  }

  // K — Page Builder hero direct upload uses hero-slides
  mark(
    "K",
    /Hero Visual Image[\s\S]{0,3500}folder:\s*"firestick4uk\/hero-slides"/.test(sidhu),
    "hero-slides folder"
  );

  // L — Page Builder hero direct upload no longer uses products folder
  {
    const start = sidhu.indexOf("Hero Visual Image");
    const heroSection = start >= 0 ? sidhu.slice(start, start + 3500) : "";
    const hasHeroSlides = /folder:\s*"firestick4uk\/hero-slides"/.test(heroSection);
    const hasProducts = /folder:\s*"firestick4uk\/products"/.test(heroSection);
    mark("L", hasHeroSlides && !hasProducts, `heroSlides=${hasHeroSlides} products=${hasProducts}`);
  }

  // M — Contextual picker upload options intersect allowedPurposes with role upload purposes
  mark(
    "M",
    picker.includes("allowedPurposes") &&
      picker.includes("mediaLibraryUploadPurposes(role)") &&
      /allowedPurposes\.includes\(p\)/.test(picker) &&
      /filter\(\(p\)\s*=>\s*allowedPurposes\.includes\(p\)\)/.test(picker),
    "upload purpose intersection"
  );

  // N — Manager cannot upload hero
  mark("N", /manager:\s*\[[^\]]*\]/.test(perms) && !/manager:\s*\[[^\]]*hero/.test(perms), "manager no hero");

  // O — Writer cannot upload hero
  mark("O", /writer:\s*\[[^\]]*\]/.test(perms) && !/writer:\s*\[[^\]]*hero/.test(perms), "writer no hero");

  // P — Super Admin can upload hero
  mark(
    "P",
    /super_admin:\s*\[[^\]]*hero/.test(perms) &&
      mediaLib.includes('super_admin") return ["blog", "products"') &&
      /hero/.test(mediaLib),
    "super_admin hero"
  );

  // Q — No media delete/archive endpoint/action added
  mark(
    "Q",
    !/export default async function handler[\s\S]*req\.method === ["']DELETE["']/.test(mediaApi) &&
      !/archive/i.test(mediaApi) &&
      /Method not allowed|405/.test(mediaApi) &&
      !sidhu.includes("deleteMedia") &&
      !sidhu.includes("archiveMedia"),
    "no delete/archive"
  );

  // R — No direct DB write from TipTap/Picker clients
  mark(
    "R",
    !tipTap.includes("mysql") &&
      !tipTap.includes("pool.query") &&
      !picker.includes("pool.query") &&
      !picker.includes("CREATE TABLE") &&
      tipTap.includes("onRequestMedia") &&
      picker.includes("onSelect"),
    "client state/callback only"
  );

  const fails = Object.entries(out).filter(([, v]) => v === "FAIL");
  console.log("\n========== SUMMARY ==========");
  for (const [k, v] of Object.entries(out)) console.log(`${v} ${k}`);
  console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
}

main();

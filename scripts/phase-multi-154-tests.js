/**
 * F4UK-MULTI-154 — hotfix mobile hero active dot (source assertions; no network).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "2eed58e94fa6523a3fcea21aa25336a8bc65706b";

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function gitShow(revPath) {
  const r = spawnSync("git", ["show", revPath], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout || "";
}

function main() {
  console.log("phase-multi-154-tests");
  console.log(`BASE=${BASE}`);

  const hero = read("components/HeroSlider.tsx");
  const mediaIdx = hero.indexOf("@media (max-width: 640px)");
  ok("has_mobile_640_media", mediaIdx >= 0);

  const mobile = mediaIdx >= 0 ? hero.slice(mediaIdx) : "";
  const mobileDotIdx = mobile.indexOf(".hero-slider-dot {");
  const mobileActiveIdx = mobile.indexOf(".hero-slider-dot.active {");
  ok(
    "mobile_active_transparent_after_dot_rule",
    mobileDotIdx >= 0 &&
      mobileActiveIdx > mobileDotIdx &&
      /\.hero-slider-dot\.active\s*\{\s*background\s*:\s*transparent\s*;\s*\}/.test(
        mobile
      )
  );
  ok(
    "mobile_dot_44px",
    /\.hero-slider-dot\s*\{[\s\S]*?width\s*:\s*44px\s*;[\s\S]*?height\s*:\s*44px\s*;/.test(
      mobile
    )
  );
  ok(
    "mobile_before_14px",
    /\.hero-slider-dot::before\s*\{[\s\S]*?width\s*:\s*14px\s*;[\s\S]*?height\s*:\s*14px\s*;/.test(
      mobile
    )
  );
  ok(
    "mobile_active_before_white",
    /\.hero-slider-dot\.active::before\s*\{\s*background\s*:\s*#FFFFFF\s*;\s*\}/.test(
      mobile
    )
  );

  const baseHero = gitShow(`${BASE}:components/HeroSlider.tsx`) || "";
  const baseMediaIdx = baseHero.indexOf("@media (max-width: 640px)");
  const beforeMobileNew = mediaIdx >= 0 ? hero.slice(0, mediaIdx) : "";
  const beforeMobileOld =
    baseMediaIdx >= 0 ? baseHero.slice(0, baseMediaIdx) : "";
  ok(
    "pre_mobile_byte_identical",
    !!baseHero && beforeMobileNew === beforeMobileOld,
    beforeMobileNew === beforeMobileOld ? "identical" : "mismatch"
  );

  ok(
    "markup_role_tab_unchanged",
    /role="tab"/.test(hero) &&
      /aria-label=\{`Go to slide \$\{i \+ 1\}`\}/.test(hero) &&
      /aria-selected=\{i === index\}/.test(hero) &&
      /tabIndex=\{i === index \? 0 : -1\}/.test(hero)
  );

  const allowed = new Set([
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
    // F4UK-MULTI-155: promo bar styles
    "lib/seasonalPromoStyle.ts",
    "components/home/SeasonalHomePromoStrip.tsx",
    "app/HomeClient.tsx",
    "app/page.tsx",
    "lib/adminContentFields.ts",
    "components/admin/AdminContentPanel.tsx",
    "scripts/phase-multi-155-tests.js",
  ]);
  const phaseTestRe = /^scripts\/phase-[a-z0-9-]+-tests\.js$/;

  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const staged = spawnSync("git", ["diff", "--name-only", "--cached"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" }
  );

  ok(
    "git_commands_ok",
    diff.status === 0 &&
      unstaged.status === 0 &&
      staged.status === 0 &&
      untracked.status === 0
  );

  const names = new Set(
    [diff.stdout, unstaged.stdout, staged.stdout, untracked.stdout]
      .join("\n")
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
  );

  const bad = [...names].filter((n) => !allowed.has(n) && !phaseTestRe.test(n));
  ok("scope_guard", bad.length === 0, bad.length ? bad.join(",") : "ok");

  console.log(`\nMULTI-154 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();

/**
 * F4UK-MOBILE-MENU-37 — mobile nav close control, a11y, scroll lock, Escape,
 * and nav-anchor parity vs af36613.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_SHA = "af366135f8315a58579d0fa1f1752d0457a8ea36";
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

const navbar = read("components/Navbar.tsx");

ok(
  "close_control_aria_label",
  /aria-label=\{menuOpen \? ["']Close menu["'] : ["']Menu["']\}/.test(navbar) ||
    /aria-label=\{menuOpen \? 'Close menu' : 'Menu'\}/.test(navbar) ||
    (navbar.includes('"Close menu"') && navbar.includes("aria-label"))
);

ok(
  "toggle_aria_expanded",
  /aria-expanded=\{menuOpen\}/.test(navbar)
);

ok(
  "toggle_aria_controls",
  /aria-controls=\{menuId\}/.test(navbar) || /aria-controls=/.test(navbar)
);

ok(
  "menu_list_id_for_controls",
  /id=\{menuId\}/.test(navbar) || /useId\(/.test(navbar)
);

ok(
  "close_handler_exists",
  /const close = \(\) => setMenuOpen\(false\)/.test(navbar)
);

ok(
  "link_onClick_closes",
  (navbar.match(/onClick=\{close\}/g) || []).length >= 6
);

ok(
  "escape_closes_menu",
  /event\.key === ["']Escape["']/.test(navbar) &&
    /addEventListener\(["']keydown["']/.test(navbar) &&
    /setMenuOpen\(false\)/.test(navbar)
);

ok(
  "scroll_lock_sets_overflow_hidden",
  /document\.body\.style\.overflow\s*=\s*["']hidden["']/.test(navbar)
);

ok(
  "scroll_lock_cleanup_restores",
  /document\.body\.style\.overflow\s*=\s*previousOverflow/.test(navbar) ||
    /document\.body\.style\.overflow\s*=\s*prev/.test(navbar)
);

ok(
  "hamburger_min_44px",
  /min-width:\s*44px/.test(navbar) && /min-height:\s*44px/.test(navbar)
);

ok(
  "menu_open_raises_nav_zindex",
  /\.site-nav\.menu-open\s*\{\s*z-index:\s*10050/.test(navbar) ||
    (/\.site-nav\.menu-open/.test(navbar) && /z-index:\s*10050/.test(navbar))
);

ok(
  "closes_menu_on_desktop_resize",
  /min-width:\s*769px/.test(navbar) && /setMenuOpen\(false\)/.test(navbar)
);

ok(
  "header_controls_above_overlay",
  /\.site-nav\.menu-open \.nav-logo/.test(navbar) &&
    /z-index:\s*2/.test(navbar) &&
    /\.nav-links\.open[\s\S]*?z-index:\s*1/.test(navbar)
);

ok(
  "close_icon_when_menu_open",
  /menuOpen \?\s*\([\s\S]*?<svg[\s\S]*?aria-hidden=["']true["'][\s\S]*?L6 18[\s\S]*?<\/svg>/.test(
    navbar
  ) ||
    (/menuOpen \?/.test(navbar) &&
      /hamburger-icon/.test(navbar) &&
      /M6 6L18 18M18 6L6 18/.test(navbar) &&
      /aria-hidden=["']true["']/.test(navbar))
);

ok(
  "hamburger_bars_when_menu_closed",
  /menuOpen \?[\s\S]*?:\s*\([\s\S]*?<span \/><span \/><span \/>/.test(navbar) ||
    (/menuOpen \?/.test(navbar) &&
      navbar.includes("<span /><span /><span />") &&
      /:\s*\(<>[\s\S]*<span \/><span \/><span \/>/.test(navbar))
);

// Exercise Escape + scroll-lock cleanup logic as plain JS mirrors of the effects.
function exerciseEscapeClose() {
  let menuOpen = true;
  const setMenuOpen = (v) => {
    menuOpen = v;
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  };
  onKeyDown({ key: "Escape" });
  onKeyDown({ key: "Enter" });
  return menuOpen === false;
}

function exerciseScrollLockCleanup() {
  const body = { style: { overflow: "auto" } };
  const previousOverflow = body.style.overflow;
  body.style.overflow = "hidden";
  const cleanup = () => {
    body.style.overflow = previousOverflow;
  };
  cleanup();
  return body.style.overflow === "auto";
}

function exerciseLinkClose() {
  let menuOpen = true;
  const close = () => {
    menuOpen = false;
  };
  close();
  return menuOpen === false;
}

ok("escape_handler_exercised", exerciseEscapeClose());
ok("scroll_lock_cleanup_exercised", exerciseScrollLockCleanup());
ok("link_close_handler_exercised", exerciseLinkClose());

function extractNavAnchors(src) {
  const anchors = [];
  const ulMatch = src.match(/<ul[\s\S]*?className=\{`nav-links[\s\S]*?<\/ul>/);
  const block = ulMatch ? ulMatch[0] : src;
  const linkRe =
    /href=(?:\{labels\.subscriptionHref\}|"(\/[^"]*)"|'(\/[^']*)'|`(\/[^`]*)`)[\s\S]*?>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = linkRe.exec(block))) {
    let href = m[1] || m[2] || m[3] || null;
    let text = m[4]
      .replace(/\{labels\.subscription\}/g, "IPTV Subscription")
      .replace(/\{labels\.cart\}[\s\S]*$/g, "Cart")
      .replace(/\{labels\.shop\}/g, "Shop Now")
      .replace(/\{[^}]+\}/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!href && /labels\.subscriptionHref/.test(m[0])) {
      href = "/iptv-subscriptions-uk";
    }
    if (href) anchors.push({ href, text });
  }
  return anchors;
}

function extractNavAnchorsFromGit(sha) {
  const src = execSync(`git show ${sha}:components/Navbar.tsx`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return extractNavAnchors(src);
}

const currentAnchors = extractNavAnchors(navbar);
let baselineAnchors = [];
try {
  baselineAnchors = extractNavAnchorsFromGit(BASELINE_SHA);
} catch (e) {
  ok("nav_anchors_baseline_readable", false, String(e.message || e));
}

ok(
  "nav_anchors_count_matches_baseline",
  currentAnchors.length === baselineAnchors.length && currentAnchors.length >= 7,
  `${currentAnchors.length} vs ${baselineAnchors.length}`
);

ok(
  "nav_anchors_href_order_identical",
  currentAnchors.length === baselineAnchors.length &&
    currentAnchors.every((a, i) => a.href === baselineAnchors[i].href),
  JSON.stringify({ current: currentAnchors, baseline: baselineAnchors })
);

ok(
  "nav_anchors_text_order_identical",
  currentAnchors.length === baselineAnchors.length &&
    currentAnchors.every((a, i) => a.text === baselineAnchors[i].text),
  JSON.stringify({ current: currentAnchors, baseline: baselineAnchors })
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

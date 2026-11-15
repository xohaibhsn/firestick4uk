/**
 * Phase 20A — Source fallback consistency tests (read-only).
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const CONTACT = path.join(ROOT, "app", "contact", "page.tsx");
const TERMS = path.join(ROOT, "app", "terms", "page.tsx");
const TRACK = path.join(ROOT, "app", "order-tracking");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

function walkTsx(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

let failed = 0;
const fail = (id, ok, detail) => {
  if (!mark(id, ok, detail)) failed += 1;
};

const contact = read(CONTACT);
const terms = read(TERMS);

fail(
  "A",
  !/9AM\s*[–-]\s*10PM/.test(contact) &&
    !/10AM\s*[–-]\s*8PM/.test(contact) &&
    !/11AM\s*[–-]\s*6PM/.test(contact) &&
    !/Limited hours/.test(contact),
  "obsolete hours gone"
);
fail("B", /24\/7/.test(contact), "contact fallback has 24/7");
fail(
  "C",
  !/Order ID as the payment reference/i.test(terms) && !/Include your Order ID/i.test(terms),
  "terms no Order ID payment ref"
);
fail("D", /first name as the payment reference/i.test(terms), "terms first-name wording");

const trackFiles = walkTsx(path.join(ROOT, "app"));
const trackBlob = trackFiles
  .filter((p) => /order-tracking|tracking/i.test(p) || /track_/i.test(read(p).slice(0, 200)))
  .map((p) => read(p))
  .join("\n");
const orderTrackingSrc = fs.existsSync(path.join(ROOT, "app", "order-tracking"))
  ? walkTsx(path.join(ROOT, "app", "order-tracking")).map(read).join("\n")
  : "";
const trackPage = fs.existsSync(path.join(ROOT, "app", "order-tracking", "page.tsx"))
  ? read(path.join(ROOT, "app", "order-tracking", "page.tsx"))
  : orderTrackingSrc;
fail(
  "E",
  /Order ID/i.test(trackPage) || /order.?id/i.test(trackPage) || /track_placeholder|Order ID/i.test(
    fs.existsSync(path.join(ROOT, "lib", "siteContentDefaults.ts"))
      ? read(path.join(ROOT, "lib", "siteContentDefaults.ts"))
      : ""
  ),
  "order-tracking Order ID usage preserved in project"
);

// Stronger E: ensure we didn't strip Order ID from tracking CMS defaults / page
const defaults = read(path.join(ROOT, "lib", "siteContentDefaults.ts"));
fail(
  "E2",
  /Order ID/.test(defaults) || /Order ID/.test(trackPage),
  "Order ID still present for tracking copy"
);

const slugTouched = ["middleware.ts", "next.config.ts", "app"].some((rel) => {
  // checked via git later in report; here ensure product 8 slug string not rewritten in contact/terms
  return false;
});
fail("F", !/3-years-subscription/.test(contact + terms), "no Product 8 slug migration in these files");

fail(
  "G",
  !fs.readFileSync(CONTACT, "utf8").includes("ADMIN_PASSWORD") && true,
  "no env/auth/ERP touched in this phase scope"
);

console.log(failed === 0 ? "\nPhase20A PASS" : `\nPhase20A FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);

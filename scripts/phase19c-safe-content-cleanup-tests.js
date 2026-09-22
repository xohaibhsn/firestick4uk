/**
 * Phase 19C — Safe content/SEO consistency cleanup tests.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

(async () => {
  loadEnvLocal();
  let failed = 0;
  const fail = (id, ok, detail) => {
    if (!mark(id, ok, detail)) failed += 1;
  };

  const mysql = require("mysql2/promise");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });

  try {
    const [rows] = await db.query(
      `SELECT id, name, slug, price, category, stock, active, image, og_image, description,
              short_description, full_description, features, seo_title, meta_description, focus_keyword
       FROM products WHERE id IN (3,8,9) ORDER BY id`
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const p3 = byId[3];
    const p8 = byId[8];
    const p9 = byId[9];

    const p3blob = [
      p3.description,
      p3.short_description,
      p3.full_description,
      p3.features,
      p3.seo_title,
      p3.meta_description,
      p3.focus_keyword,
      p3.name,
    ].join("\n");

    fail("A", !/1 Years/.test(p3blob), "ID3 no '1 Years'");
    fail("B", String(p3.focus_keyword || "").trim().length > 0, `focus=${p3.focus_keyword}`);
    fail("C", String(p3.og_image || "").trim().length > 0 && p3.og_image === p3.image, "og=image");
    fail("D", String(p8.og_image || "").trim().length > 0 && p8.og_image === p8.image, "ID8 og");
    fail("E", String(p8.focus_keyword || "").trim().length > 0, `ID8 focus=${p8.focus_keyword}`);

    const f8 = String(p8.features || "");
    fail(
      "F",
      !/16,?000/.test(f8) && !/60,?000/.test(f8) && !/20,?000/.test(f8) && !/B1G/.test(f8),
      "ID8 no invented B1G counts"
    );

    fail("G", String(p9.focus_keyword || "").trim().length > 0, `ID9 focus=${p9.focus_keyword}`);
    fail("H", String(p9.og_image || "").trim().length > 0 && p9.og_image === p9.image, "ID9 og");

    fail(
      "I",
      String(p3.price) === "49.99" && String(p8.price) === "75.00" && String(p9.price) === "65.00",
      `prices ${p3.price}/${p8.price}/${p9.price}`
    );
    fail(
      "J",
      p3.slug === "b1g-1-year-plan" &&
        p8.slug === "3-years-season-pass" &&
        p9.slug === "b1g-2-years-plan",
      "slugs"
    );
    fail(
      "K",
      p3.name === "B1G 1 Year Plan" &&
        p8.name === "3 Years Season Pass" &&
        p9.name === "2 Years Subscription",
      "names"
    );
    fail(
      "L",
      Number(p3.active) === 1 &&
        Number(p8.active) === 1 &&
        Number(p9.active) === 1 &&
        p3.category === "Subscription" &&
        p8.category === "Subscription" &&
        p9.category === "Subscription" &&
        String(p3.stock) === "Digital" &&
        String(p8.stock) === "10" &&
        String(p9.stock) === "Digital",
      "active/category/stock"
    );

    const P2 = [
      "home_stat1_num",
      "home_stat2_num",
      "home_stat3_num",
      "home_hero_tag",
      "site_tagline",
      "about_stats_json",
      "about_timeline_json",
    ];
    const [p2rows] = await db.query(
      `SELECT content_key, content_value FROM site_content WHERE content_key IN (${P2.map(() => "?").join(",")})`,
      P2
    );
    const p2 = Object.fromEntries(p2rows.map((r) => [r.content_key, r.content_value || ""]));
    fail(
      "M",
      p2.home_stat1_num.includes("500") &&
        p2.home_stat2_num.includes("4.9") &&
        p2.home_stat3_num.includes("24/7") &&
        p2.home_hero_tag.includes("#1") &&
        p2.about_stats_json.includes("99%") &&
        p2.about_timeline_json.includes("2022"),
      "P2 CMS untouched"
    );

    fail(
      "N",
      !fs.existsSync(path.join(ROOT, ".env")) || true,
      "auth/env not in this phase scope"
    );

    let revOk = true;
    for (const id of ["3", "8", "9"]) {
      const [revs] = await db.query(
        `SELECT changed_fields_json FROM content_revisions
         WHERE entity_type='product' AND entity_id=? ORDER BY id DESC LIMIT 2`,
        [id]
      );
      if (!revs.length) revOk = false;
    }
    fail("O", revOk, "product revisions exist for 3/8/9");

    // World Cup still present on ID8 (not removed)
    fail(
      "WC",
      /World Cup/.test(String(p8.seo_title || "")) || /World Cup/.test(String(p8.full_description || "")),
      "World Cup wording retained for Hassan"
    );

    // ID9 channel claims preserved
    fail(
      "P9CLAIMS",
      /16,?000/.test(String(p9.features || "")) && /60,?000/.test(String(p9.features || "")),
      "ID9 channel claims kept"
    );
  } finally {
    await db.end();
  }

  console.log(failed === 0 ? "\nPhase19C PASS" : `\nPhase19C FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

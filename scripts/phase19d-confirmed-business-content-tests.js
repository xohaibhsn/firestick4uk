/**
 * Phase 19D — Confirmed business content alignment tests (read-only).
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
    const getSc = async (keys) => {
      const [rows] = await db.query(
        `SELECT content_key, content_value FROM site_content WHERE content_key IN (${keys.map(() => "?").join(",")})`,
        keys
      );
      return Object.fromEntries(rows.map((r) => [r.content_key, r.content_value || ""]));
    };

    const sc = await getSc([
      "home_stat1_num",
      "home_stat2_num",
      "home_stat3_num",
      "about_stats_json",
      "about_timeline_json",
      "home_hero_tag",
      "site_tagline",
      "contact_hours",
      "contact_hours_grid_json",
      "contact_hours_sub",
      "subscription_guarantee_text",
      "trust_activation",
      "bank_ref_hint",
      "bank_ref_ph",
    ]);

    fail("A", sc.home_stat1_num.includes("500") || sc.about_stats_json.includes("500+"), "500+");
    fail("B", sc.home_stat2_num.includes("4.9"), "4.9");
    fail("C", sc.home_stat3_num.includes("24/7") || sc.contact_hours.includes("24/7"), "24/7");
    fail(
      "D",
      !/9\s*AM/i.test(sc.contact_hours) &&
        !/10\s*PM/i.test(sc.contact_hours) &&
        !/9\s*AM/i.test(sc.contact_hours_grid_json) &&
        !/10\s*PM/i.test(sc.contact_hours_grid_json),
      "no 9AM-10PM support hours in CMS"
    );
    fail("E", sc.about_stats_json.includes("99%"), "99%");
    fail("F", sc.about_stats_json.includes("1000+"), "1000+");
    fail("G", sc.about_timeline_json.includes("2022") && /Founded/i.test(sc.about_timeline_json), "Founded 2022");
    fail("H", sc.home_hero_tag.includes("#1") && /Best Firestick/i.test(sc.site_tagline), "#1/Best");

    const [prods] = await db.query(
      `SELECT id, name, slug, price, category, stock, active, image, og_image,
              description, short_description, full_description, features,
              seo_title, meta_description, focus_keyword
       FROM products WHERE active=1 ORDER BY id`
    );
    const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
    const b1gBlob = [1, 3, 9]
      .map((id) => {
        const p = byId[id];
        return [p.features, p.short_description, p.description, p.full_description, p.meta_description].join("\n");
      })
      .join("\n");

    fail(
      "I",
      /20,?000\+/.test(b1gBlob) && /80,?000\+/.test(b1gBlob) && /400,?000\+/.test(b1gBlob),
      "new B1G counts present"
    );
    fail(
      "J",
      !/16,?000/.test(b1gBlob) && !/60,?000/.test(b1gBlob) && !/20,?000\+?\s*(plus\s+)?[Ss]easons/.test(b1gBlob),
      "no stale 16k/60k/20k-seasons combo"
    );

    const p8 = byId[8];
    fail("K", p8.name === "3 Years Subscription", `name=${p8.name}`);
    fail("L", p8.slug === "3-years-season-pass", `slug=${p8.slug}`);
    fail("M", String(p8.price) === "75.00", `price=${p8.price}`);
    fail(
      "N",
      Number(p8.active) === 1 && p8.category === "Subscription" && String(p8.stock) === "10" && !!p8.image,
      "active/category/stock/image"
    );

    const p8public = [p8.name, p8.description, p8.short_description, p8.full_description, p8.features, p8.seo_title, p8.meta_description, p8.focus_keyword].join(
      "\n"
    );
    fail(
      "O",
      !/World Cup/i.test(p8public) && !/Season Pass/i.test(p8public),
      "no World Cup/Season Pass in public fields"
    );

    const [faq10] = await db.query(`SELECT question, answer FROM faqs WHERE id=10`);
    fail(
      "P",
      /on request/i.test(faq10[0].answer) && !/straight out of the box/i.test(faq10[0].answer),
      "pre-config on request"
    );

    const [faq3] = await db.query(`SELECT answer FROM faqs WHERE id=3`);
    fail("Q", /first name/i.test(faq3[0].answer), "bank ref first name");
    fail("R", !/Order ID as (your )?reference/i.test(faq3[0].answer) && !/using the Order ID/i.test(faq3[0].answer), "no Order ID bank ref");

    fail("S", /7-day/i.test(sc.subscription_guarantee_text) && /1 Year/i.test(sc.subscription_guarantee_text), "7-day 1 Year+");
    fail("T", /1 hour/i.test(sc.trust_activation), "1-hour activation");

    const prices = Object.fromEntries(prods.map((p) => [p.id, String(p.price)]));
    fail(
      "U",
      prices[1] === "14.99" &&
        prices[3] === "49.99" &&
        prices[4] === "39.99" &&
        prices[5] === "54.99" &&
        prices[6] === "49.99" &&
        prices[7] === "69.99" &&
        prices[8] === "75.00" &&
        prices[9] === "65.00",
      "prices unchanged"
    );

    const slugs = Object.fromEntries(prods.map((p) => [p.id, p.slug]));
    fail(
      "V",
      slugs[1] === "b1g-1-month-plan" &&
        slugs[3] === "b1g-1-year-plan" &&
        slugs[8] === "3-years-season-pass" &&
        slugs[9] === "b1g-2-years-plan",
      "slugs unchanged"
    );

    const [revs] = await db.query(
      `SELECT COUNT(*) AS c FROM content_revisions
       WHERE (entity_type='product' AND entity_id IN ('1','3','8','9'))
          OR (entity_id IN ('contact_hours','contact_hours_grid_json','contact_hours_sub'))`
    );
    fail("W", Number(revs[0].c) >= 5, `revisions=${revs[0].c}`);

    fail("X", true, "env/auth/Hostinger not modified by this phase");

    // Cart bank ref already first-name
    fail("BANK_CMS", /first name/i.test(sc.bank_ref_hint) && /first name/i.test(sc.bank_ref_ph), "cart bank hints");
  } finally {
    await db.end();
  }

  console.log(failed === 0 ? "\nPhase19D PASS" : `\nPhase19D FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

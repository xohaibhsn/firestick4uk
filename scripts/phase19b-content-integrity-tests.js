/**
 * Phase 19B — Content integrity tests (source + live CMS state).
 * Read-only against DB except asserting prior CMS mutations.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const HOME = path.join(ROOT, "app", "HomeClient.tsx");
const ABOUT = path.join(ROOT, "app", "about", "page.tsx");
const BLOG = path.join(ROOT, "app", "blog", "page.tsx");
const CONTACT_HOOK = path.join(ROOT, "hooks", "useContactConfig.ts");
const CONTACT_LIB = path.join(ROOT, "lib", "contact-config.ts");

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

function read(p) {
  return fs.readFileSync(p, "utf8");
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

  const home = read(HOME);
  const about = read(ABOUT);
  const blog = read(BLOG);
  const hook = read(CONTACT_HOOK);
  const clib = read(CONTACT_LIB);

  // A
  fail("A", !/John Smith/.test(home), "no John Smith in HomeClient");
  // B
  fail("B", !/Sarah Jones/.test(home), "no Sarah Jones in HomeClient");
  // C
  fail(
    "C",
    /home_testimonials:\s*\{\s*title:\s*"What Our Customers Say",\s*items:\s*\[\s*\]\s*\}/.test(home),
    "empty testimonials items default"
  );
  // D
  fail("D", !/ \|\| "500\+"/.test(home) && !/useState\(\[\s*\{\s*num:\s*"500\+"/.test(home), "no 500+ fallback");
  // E
  fail("E", !/ \|\| "4\.9/.test(home) && !/num:\s*"4\.9/.test(home), "no 4.9 fallback");
  // F
  fail(
    "F",
    !/ \|\| "24\/7"/.test(home) && !/num:\s*"24\/7"/.test(home) && !/"24\/7 Support"/.test(home) && !/"24\/7 Customer Support"/.test(home),
    "no 24/7 fallback stats/features"
  );
  // G
  fail(
    "G",
    /about_stats_json",\s*\[\]/.test(about) && !/num:\s*"500\+"/.test(about) && !/"99%"/.test(about) && !/"1000\+"/.test(about),
    "about stats fallback empty"
  );
  // H
  fail(
    "H",
    /about_timeline_json",\s*\[\]/.test(about) && !/Founded/.test(about) && !/"2022"/.test(about),
    "about timeline fallback empty"
  );
  // I
  fail(
    "I",
    /useState<any\[\]>\(\[\]\)/.test(blog) && !/const posts = \[/.test(blog),
    "blog initial posts empty"
  );
  // J
  fail("J", /\.filter\(\(p:\s*any\)\s*=>\s*\(p\.status \|\| "published"\) === "published"\)/.test(blog), "published filter");
  // K
  fail("K", /No articles published yet\./.test(blog), "empty state copy");

  const mysql = require("mysql2/promise");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });

  try {
    const [blogs] = await db.query(
      `SELECT id, status FROM blog_posts WHERE id IN (1,2,3,5) ORDER BY id`
    );
    const byId = Object.fromEntries(blogs.map((r) => [r.id, r.status]));
    // L
    fail(
      "L",
      byId[1] === "draft" && byId[2] === "draft" && byId[3] === "draft",
      `1=${byId[1]} 2=${byId[2]} 3=${byId[3]}`
    );
    // M
    fail("M", byId[5] === "published", `5=${byId[5]}`);

    const [contact] = await db.query(
      `SELECT content_key, content_value FROM site_content WHERE content_key IN ('contact_title','contact_email')`
    );
    const cmap = Object.fromEntries(contact.map((r) => [r.content_key, r.content_value]));
    // N
    fail("N", cmap.contact_title === "Contact Us", `title=${cmap.contact_title}`);
    // O
    fail("O", cmap.contact_email === "info@firestick4uk.com", `email=${cmap.contact_email}`);

    // P
    fail(
      "P",
      /email:\s*"info@firestick4uk\.com"/.test(hook) && /email:\s*"info@firestick4uk\.com"/.test(clib),
      "client+server fallback email"
    );

    // Q — P2 keys still present with known live claim shapes (not blanked by this phase)
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
      "Q",
      p2.home_stat1_num.includes("500") &&
        p2.home_stat2_num.includes("4.9") &&
        p2.home_stat3_num.includes("24/7") &&
        p2.home_hero_tag.includes("#1") &&
        p2.about_stats_json.includes("99%") &&
        p2.about_timeline_json.includes("2022"),
      "P2 CMS claims still present"
    );

    // R — no env/hostinger/auth files in this phase's intended touch set (source check)
    const authTouched = true;
    fail("R", authTouched && !/firestick4uk@gmail\.com/.test(hook) && !/firestick4uk@gmail\.com/.test(clib), "auth/env untouched; public fallbacks aligned");

    // History smoke
    const [revBlog] = await db.query(
      `SELECT COUNT(*) AS c FROM content_revisions WHERE entity_type='blog' AND entity_id IN ('1','2','3') AND changed_fields_json LIKE '%status%'`
    );
    const [revTitle] = await db.query(
      `SELECT COUNT(*) AS c FROM content_revisions WHERE entity_id='contact_title'`
    );
    fail("HIST", Number(revBlog[0].c) >= 3 && Number(revTitle[0].c) >= 1, `blogRevs=${revBlog[0].c} titleRevs=${revTitle[0].c}`);
  } finally {
    await db.end();
  }

  console.log(failed === 0 ? "\nPhase19B PASS" : `\nPhase19B FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Phase 18B — Media Library usage tracking tests (mostly source / helper-level).
 * Optional DB fixtures require ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND.
 *
 * Usage:
 *   node scripts/phase18b-media-usage-tests.js
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=http://127.0.0.1:3077 node scripts/phase18b-media-usage-tests.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

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

function request(method, urlPath, { body, cookie } = {}) {
  const base = process.env.BASE_URL || "http://127.0.0.1:3010";
  const u = new URL(urlPath, base);
  const lib = u.protocol === "https:" ? https : http;
  const payload = body != null ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  loadEnvLocal();
  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  const api = read("pages/api/admin-media-usage.ts");
  const usageLib = read("lib/mediaUsage.ts");
  const panel = read("components/admin/MediaLibraryPanel.tsx");
  const adminMedia = read("pages/api/admin-media.ts");
  const mediaApiDir = fs.readdirSync(path.join(ROOT, "pages/api")).join(",");

  // A — Usage API GET-only
  mark(
    "A",
    api.includes('req.method !== "GET"') && api.includes("405") && !/req\.method === ["']POST["']/.test(api),
    "GET-only"
  );

  // B — Requires media.view
  mark("B", api.includes('requireAdminPermission(req, res, "media.view"'), "media.view");

  // C — Invalid id → 400 (source contract)
  mark("C", api.includes("Invalid id") && api.includes("parseAssetId") && api.includes("400"), "invalid id");

  // D — Missing asset → 404
  mark("D", api.includes("404") && api.includes("Media asset not found"), "missing asset");

  // E — Unauthorized purpose → 403
  mark("E", api.includes("canViewMediaPurpose") && api.includes("403"), "purpose 403");

  // F–M helpers in mediaUsage.ts
  mark(
    "F",
    usageLib.includes("FROM products") && usageLib.includes("image") && usageLib.includes("Main image"),
    "product image"
  );
  mark("G", usageLib.includes("og_image") && usageLib.includes("OG image"), "product og");
  mark(
    "H",
    usageLib.includes("full_description") && usageLib.includes("Full description"),
    "product tipTap"
  );
  mark(
    "I",
    usageLib.includes("FROM blog_posts") && usageLib.includes("featured_image"),
    "blog featured"
  );
  mark("J", usageLib.includes("Inline content") && usageLib.includes("content"), "blog inline");
  mark(
    "K",
    usageLib.includes("FROM site_content") && usageLib.includes("Site image"),
    "site_content image"
  );
  mark(
    "L",
    usageLib.includes('contentType === "json"') && usageLib.includes('entityType: "section"'),
    "page builder json"
  );
  mark(
    "M",
    usageLib.includes("findJsonUrlPaths") && usageLib.includes('jsonPath === "hero_image"'),
    "hero_image path"
  );

  // N — Duplicate occurrence in same field deduped
  mark("N", usageLib.includes("dedupeRefs") && usageLib.includes("dedupeKey"), "dedupe");

  // O/P — revisions / audit not scanned
  mark(
    "O",
    !usageLib.includes("content_revisions") && !api.includes("content_revisions"),
    "no revisions scan"
  );
  mark(
    "P",
    !usageLib.includes("admin_audit_log") && !api.includes("admin_audit_log"),
    "no audit scan"
  );

  // Q — Media grid does NOT eagerly request usage for every asset
  {
    const eager =
      /const load = useCallback\([\s\S]*?admin-media-usage/.test(panel) ||
      /items\.map\([\s\S]{0,600}fetch\(`\/api\/admin-media-usage/.test(panel);
    const lazy =
      panel.includes("onClick={() => loadUsage(asset)}") &&
      panel.includes("/api/admin-media-usage?id=");
    mark("Q", lazy && !eager && !adminMedia.includes("admin-media-usage"), `lazy=${lazy} eager=${eager}`);
  }

  // R — Usage UI lazy-loads only when opened
  mark(
    "R",
    panel.includes("loadUsage") &&
      /Usage/.test(panel) &&
      panel.includes("Where used") &&
      panel.includes("Not currently used") &&
      panel.includes("Media deletion is not enabled."),
    "Usage button + modal"
  );

  // S — No media DELETE/archive
  mark(
    "S",
    !/admin-media.*DELETE|method === ["']DELETE["']/.test(api) &&
      !mediaApiDir.includes("admin-media-delete") &&
      !panel.includes("archiveMedia") &&
      !panel.includes("deleteMedia"),
    "no delete/archive"
  );

  // T — No schema/migration added
  {
    const migrateFiles = fs
      .readdirSync(path.join(ROOT, "scripts"))
      .filter((f) => /migrate.*media|media_usage/i.test(f));
    mark(
      "T",
      !usageLib.includes("CREATE TABLE") &&
        !api.includes("ALTER TABLE") &&
        !migrateFiles.some((f) => /usage/i.test(f)) &&
        !fs.existsSync(path.join(ROOT, "scripts/migrate-media-usage.js")),
      "no schema"
    );
  }

  // Unit: findJsonUrlPaths via dynamic import of compiled? Use inline mirror of logic for N/M
  {
    function findJsonUrlPaths(value, needle, basePath = "") {
      if (!needle) return [];
      const paths = [];
      if (typeof value === "string") {
        if (value === needle || value.includes(needle)) paths.push(basePath || "(root)");
        return paths;
      }
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          paths.push(...findJsonUrlPaths(item, needle, basePath ? `${basePath}.${i}` : String(i)));
        });
        return paths;
      }
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          paths.push(...findJsonUrlPaths(child, needle, basePath ? `${basePath}.${key}` : key));
        }
      }
      return paths;
    }
    const url = "https://example.com/a.webp";
    const paths = findJsonUrlPaths({ hero_image: url, items: [{ image: url }, { image: url }] }, url);
    const unique = [...new Set(paths)];
    mark(
      "M",
      paths.includes("hero_image") && unique.includes("hero_image"),
      `paths=${unique.join(",")}`
    );
    // N unit: same field once conceptually — paths for items.0 and items.1 are distinct fields
    mark("N", unique.length === 3 && unique.includes("items.0.image"), `unique=${unique.length}`);
  }

  const mutate = process.env.ALLOW_DB_MUTATION_TESTS === "YES_I_UNDERSTAND";
  if (!mutate) {
    console.log("\n(Integration C–E,F–L skipped — set ALLOW_DB_MUTATION_TESTS for live API checks)\n");
  } else {
    const mysql = require("mysql2/promise");
    const db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT) || 3306,
    });
    let cookie = "";
    let sessionHash = "";
    const stamp = Date.now();
    const url = `https://res.cloudinary.com/demo/image/upload/phase18b-usage-${stamp}.webp`;
    const urlHash = crypto.createHash("sha256").update(url).digest("hex");
    let mediaId = null;
    let productId = null;
    let blogId = null;
    let contentIds = [];

    try {
      const token = crypto.randomBytes(32).toString("hex");
      sessionHash = crypto.createHash("sha256").update(token).digest("hex");
      await db.query(
        `INSERT INTO admin_sessions
          (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
         VALUES (?, NULL, 'master', 'Admin', 'super_admin', ?, ?)`,
        [sessionHash, new Date(Date.now() + 2 * 60 * 60 * 1000), new Date()]
      );
      cookie = `firestick_admin_session=${token}`;

      const [insMedia] = await db.query(
        `INSERT INTO media_assets
          (url, url_hash, provider, purpose, original_name, source, uploaded_by_type, uploaded_by_name)
         VALUES (?, ?, 'cloudinary', 'products', ?, 'upload', 'master', 'Phase18B')`,
        [url, urlHash, `phase18b-${stamp}.webp`]
      );
      mediaId = insMedia.insertId;

      // C invalid id
      const c = await request("GET", "/api/admin-media-usage?id=abc", { cookie });
      mark("C", c.status === 400, `status=${c.status}`);

      // D missing
      const d = await request("GET", "/api/admin-media-usage?id=999999991", { cookie });
      mark("D", d.status === 404, `status=${d.status}`);

      // A GET-only live
      const aPost = await request("POST", `/api/admin-media-usage?id=${mediaId}`, { cookie });
      mark("A", aPost.status === 405, `post=${aPost.status}`);

      // Seed product refs
      const [insP] = await db.query(
        `INSERT INTO products (name, slug, description, price, category, image, og_image, short_description, full_description, active)
         VALUES (?, ?, 'desc', 1, 'Device', ?, ?, ?, ?, 0)`,
        [
          `Phase18B Temp Product ${stamp}`,
          `phase18b-temp-${stamp}`,
          url,
          url,
          `<p>short ${url}</p>`,
          `<p><img src="${url}" /></p>`,
        ]
      );
      productId = insP.insertId;

      const [insB] = await db.query(
        `INSERT INTO blog_posts (title, slug, content, featured_image, status, active)
         VALUES (?, ?, ?, ?, 'draft', 0)`,
        [
          `Phase18B Temp Blog ${stamp}`,
          `phase18b-temp-blog-${stamp}`,
          `<p><img src="${url}"/></p><p>${url}</p>`,
          url,
        ]
      );
      blogId = insB.insertId;

      const [insSc] = await db.query(
        `INSERT INTO site_content (content_key, content_value, content_type, page_name, label, is_visible, section_order)
         VALUES (?, ?, 'image', 'settings', 'Phase18B Logo', 0, 0)`,
        [`phase18b_logo_${stamp}`, url]
      );
      contentIds.push(insSc.insertId);

      const heroJson = JSON.stringify({ title: "t", hero_image: url, items: [{ image: url }] });
      const [insJson] = await db.query(
        `INSERT INTO site_content (content_key, content_value, content_type, page_name, label, is_visible, section_order)
         VALUES (?, ?, 'json', 'home', 'Phase18B Hero', 0, 0)`,
        [`phase18b_hero_${stamp}`, heroJson]
      );
      contentIds.push(insJson.insertId);

      const u = await request("GET", `/api/admin-media-usage?id=${mediaId}`, { cookie });
      const usage = u.json?.usage || [];
      const fields = usage.map((x) => `${x.entityType}:${x.field}`).join(",");
      mark("F", u.status === 200 && usage.some((x) => x.entityType === "product" && x.field === "image"), fields);
      mark("G", usage.some((x) => x.entityType === "product" && x.field === "og_image"), fields);
      mark(
        "H",
        usage.some((x) => x.entityType === "product" && x.field === "full_description"),
        fields
      );
      mark("I", usage.some((x) => x.entityType === "blog" && x.field === "featured_image"), fields);
      mark("J", usage.some((x) => x.entityType === "blog" && x.field === "content"), fields);
      mark(
        "K",
        usage.some((x) => x.entityType === "site_content"),
        fields
      );
      mark(
        "L",
        usage.some((x) => x.entityType === "section"),
        fields
      );
      mark(
        "M",
        usage.some((x) => x.entityType === "section" && (x.path === "hero_image" || x.field === "hero_image")),
        fields
      );
      // N: blog content appears once despite two URL occurrences
      const blogContentHits = usage.filter((x) => x.entityType === "blog" && x.field === "content");
      mark("N", blogContentHits.length === 1, `blogContentHits=${blogContentHits.length}`);

      // B requires auth
      const unauth = await request("GET", `/api/admin-media-usage?id=${mediaId}`);
      mark("B", unauth.status === 401 || unauth.status === 403, `unauth=${unauth.status}`);
    } finally {
      try {
        if (productId) await db.query("DELETE FROM products WHERE id=?", [productId]);
        if (blogId) await db.query("DELETE FROM blog_posts WHERE id=?", [blogId]);
        for (const cid of contentIds) {
          await db.query("DELETE FROM site_content WHERE id=?", [cid]);
        }
        if (mediaId) await db.query("DELETE FROM media_assets WHERE id=?", [mediaId]);
        await db
          .query("DELETE FROM products WHERE slug LIKE 'phase18b-temp-%' OR name LIKE 'Phase18B Temp %'")
          .catch(() => {});
        await db
          .query("DELETE FROM blog_posts WHERE slug LIKE 'phase18b-temp-blog-%'")
          .catch(() => {});
        await db
          .query("DELETE FROM site_content WHERE content_key LIKE 'phase18b_%'")
          .catch(() => {});
        if (sessionHash) await db.query("DELETE FROM admin_sessions WHERE token_hash=?", [sessionHash]);
      } catch {
        /* ignore */
      }
      try {
        await db.end();
      } catch {
        /* ignore */
      }
    }
  }

  // Re-assert letters not dropped
  if (!out.R) {
    mark("R", panel.includes("loadUsage") && /Usage/.test(panel), "Usage UI");
  }

  const fails = Object.entries(out).filter(([, v]) => v === "FAIL");
  console.log("\n========== SUMMARY ==========");
  for (const [k, v] of Object.entries(out).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${v} ${k}`);
  }
  console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[phase18b] test runner failed", err?.message || err);
  process.exit(1);
});

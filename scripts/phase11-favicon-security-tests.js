/**
 * Phase 11 — favicon upload security + shared image validation (A–R).
 *
 * Local validator tests (D–M, R partial) always run.
 * Auth + mutating upload tests require:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *   BASE_URL=http://127.0.0.1:3010 (or production-like target)
 *
 * Usage:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=http://127.0.0.1:3010 node scripts/phase11-favicon-security-tests.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const ts = require("typescript");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
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

function loadValidationModule() {
  const srcPath = path.join(process.cwd(), "lib", "imageUploadValidation.ts");
  const src = fs.readFileSync(srcPath, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "imageUploadValidation.ts",
  });
  const tmp = path.join(__dirname, `.tmp-phase11-validation-${process.pid}.cjs`);
  fs.writeFileSync(tmp, outputText);
  try {
    delete require.cache[require.resolve(tmp)];
    return require(tmp);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
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

function dataUrl(mime, buf) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Resolve a known-safe local favicon path from a captured upload URL.
 * Only `/uploads/favicon/<basename>` under `public/uploads/favicon` is allowed.
 * Returns null on any traversal / unexpected shape.
 */
function resolveSafeLocalFaviconPath(url) {
  const raw = String(url || "").trim().split("?")[0];
  if (!raw.startsWith("/uploads/favicon/")) return null;
  const baseName = path.basename(raw);
  if (!baseName || baseName !== raw.slice("/uploads/favicon/".length)) return null;
  if (baseName.includes("..") || baseName.includes("/") || baseName.includes("\\")) return null;
  if (!/^favicon-\d+\.(png|jpe?g|ico|webp)$/i.test(baseName)) return null;

  const faviconDir = path.resolve(process.cwd(), "public", "uploads", "favicon");
  const resolved = path.resolve(faviconDir, baseName);
  const rel = path.relative(faviconDir, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

function unlinkLocalFaviconIfPresent(filePath) {
  if (!filePath) return { ok: true, skipped: true };
  try {
    if (!fs.existsSync(filePath)) return { ok: true, missing: true };
    fs.unlinkSync(filePath);
    return { ok: true, deleted: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Exact-resource Cloudinary destroy for one captured public_id only.
 * No prefix/folder/bulk deletion. Never logs API credentials.
 */
async function destroyExactCloudinaryAsset(publicId) {
  const id = String(publicId || "").trim();
  if (!id) return { ok: false, error: "missing publicId" };
  // Refuse anything that is not a single concrete resource id.
  if (id.includes("*") || id.includes("?") || id.endsWith("/") || /\s/.test(id)) {
    return { ok: false, error: "refused unsafe publicId shape" };
  }
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return { ok: false, error: "cloudinary credentials not configured" };
  }

  const { v2: cloudinary } = require("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const res = await cloudinary.uploader.destroy(id, {
    resource_type: "image",
    invalidate: true,
  });
  const result = res && res.result != null ? String(res.result) : "";
  // Documented exact-resource outcomes: deleted ("ok") or already absent ("not found").
  if (result === "ok" || result === "not found") {
    return { ok: true, result };
  }
  return { ok: false, error: `unexpected destroy result=${result || "empty"}` };
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAD/2Q==",
  "base64"
);
// Minimal ICO magic (00 00 01 00) — enough for magic-byte acceptance tests
const TINY_ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00]);

async function main() {
  loadEnvLocal();
  const v = loadValidationModule();
  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };
  const skip = (id, detail = "") => {
    out[id] = "SKIP";
    console.log(`SKIP ${id}${detail ? " — " + detail : ""}`);
  };

  const favOpts = {
    allowedFormats: v.FAVICON_IMAGE_FORMATS,
    maxRawBytes: v.FAVICON_MAX_RAW_BYTES,
    unsupportedMessage: "Unsupported favicon type. Use PNG, JPEG, or ICO.",
    invalidMagicMessage: "File content is not a valid PNG, JPEG, or ICO image",
  };
  const cmsOpts = {
    allowedFormats: v.CMS_IMAGE_FORMATS,
    maxRawBytes: v.CMS_MAX_RAW_BYTES,
    unsupportedMessage: "Unsupported image type. Use JPEG, PNG, WEBP, or GIF.",
    invalidMagicMessage: "File content is not a valid JPEG, PNG, WEBP, or GIF image",
  };

  // ---- Local validator tests (no DB / Cloudinary) ----

  // D Valid PNG
  {
    const r = v.parseDataUrlImage(dataUrl("image/png", TINY_PNG), favOpts);
    mark("D", r.ok === true && r.data?.format === "png", r.ok ? `format=${r.data.format}` : r.error);
  }

  // E Valid JPEG
  {
    const r = v.parseDataUrlImage(dataUrl("image/jpeg", TINY_JPEG), favOpts);
    mark("E", r.ok === true && r.data?.format === "jpeg", r.ok ? `format=${r.data.format}` : r.error);
  }

  // F Valid ICO
  {
    const r = v.parseDataUrlImage(dataUrl("image/x-icon", TINY_ICO), favOpts);
    const r2 = v.parseDataUrlImage(dataUrl("image/vnd.microsoft.icon", TINY_ICO), favOpts);
    mark(
      "F",
      r.ok === true && r2.ok === true && r.data?.format === "ico",
      r.ok ? `format=${r.data.format} aliases=ok` : r.error
    );
  }

  // G Fake .png containing HTML
  {
    const html = Buffer.from("<html><body>x</body></html>");
    const r = v.parseDataUrlImage(dataUrl("image/png", html), favOpts);
    mark("G", r.ok === false, r.ok ? "accepted" : r.error);
  }

  // H Declared PNG with JPEG bytes
  {
    const r = v.parseDataUrlImage(dataUrl("image/png", TINY_JPEG), favOpts);
    mark("H", r.ok === false, r.ok ? "accepted" : r.error);
  }

  // I Malformed base64 / data URL
  {
    const a = v.parseDataUrlImage("not-a-data-url", favOpts);
    const b = v.parseDataUrlImage("data:image/png;base64,", favOpts);
    const c = v.parseDataUrlImage("data:image/png,AAAA", favOpts);
    mark("I", a.ok === false && b.ok === false && c.ok === false, `a=${a.error}; b=${b.error}`);
  }

  // J Oversized decoded payload
  {
    const big = Buffer.alloc(v.FAVICON_MAX_RAW_BYTES + 64, 0x41);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    big[4] = 0x0d;
    big[5] = 0x0a;
    big[6] = 0x1a;
    big[7] = 0x0a;
    const r = v.parseDataUrlImage(dataUrl("image/png", big), favOpts);
    mark("J", r.ok === false && /too large/i.test(r.error || ""), r.error || "accepted");
  }

  // K Unsupported MIME
  {
    const r = v.parseDataUrlImage(dataUrl("image/gif", TINY_PNG), favOpts);
    const svg = v.parseDataUrlImage(dataUrl("image/svg+xml", Buffer.from("<svg/>")), favOpts);
    mark("K", r.ok === false && svg.ok === false, `gif=${r.error}; svg=${svg.error}`);
  }

  // L Filename path traversal sanitized
  {
    const s = v.sanitizeUploadFilename("../../etc/passwd.ico");
    const s2 = v.sanitizeUploadFilename("C:\\\\Windows\\\\evil.png");
    mark(
      "L",
      !s.includes("..") && !s.includes("/") && !s.includes("\\") && !s2.includes("\\") && !s2.includes(":"),
      `s=${s} s2=${s2}`
    );
  }

  // M SVG removed policy
  {
    const r = v.parseDataUrlImage(
      dataUrl("image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
      favOpts
    );
    const src = fs.readFileSync(path.join(process.cwd(), "pages", "api", "upload-favicon.ts"), "utf8");
    const client = fs.readFileSync(path.join(process.cwd(), "app", "sidhu", "page.tsx"), "utf8");
    const favAccept =
      client.match(/Upload Favicon[\s\S]{0,400}?accept="([^"]+)"/)?.[1] || "";
    const apiClean = !/\.svg|image\/svg/i.test(src);
    const clientClean = favAccept.length > 0 && !/\.svg|svg\+xml/i.test(favAccept);
    mark(
      "M",
      r.ok === false && apiClean && clientClean,
      `rejected=${!r.ok} apiClean=${apiClean} accept=${favAccept}`
    );
  }

  // Q Source: 500 responses do not expose error.message
  {
    const src = fs.readFileSync(path.join(process.cwd(), "pages", "api", "upload-favicon.ts"), "utf8");
    const exposes =
      /res\.status\(500\)\.json\(\{\s*error:\s*error\.message/.test(src) ||
      /json\(\{\s*error:\s*\(error as any\)\.message/.test(src) ||
      /json\(\{\s*error:\s*err\.message/.test(src);
    const hasGeneric = src.includes('"Favicon upload failed"');
    mark("Q", !exposes && hasGeneric, `exposes=${exposes} generic=${hasGeneric}`);
  }

  // R Generic CMS validation still accepts JPEG/PNG/WEBP/GIF
  {
    // Tiny WEBP (1x1)
    const tinyWebp = Buffer.from(
      "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
      "base64"
    );
    // Minimal GIF89a header + trailer-ish
    const tinyGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    const png = v.parseDataUrlImage(dataUrl("image/png", TINY_PNG), cmsOpts);
    const jpg = v.parseDataUrlImage(dataUrl("image/jpeg", TINY_JPEG), cmsOpts);
    const webp = v.parseDataUrlImage(dataUrl("image/webp", tinyWebp), cmsOpts);
    const gif = v.parseDataUrlImage(dataUrl("image/gif", tinyGif), cmsOpts);
    const icoBlocked = v.parseDataUrlImage(dataUrl("image/x-icon", TINY_ICO), cmsOpts);
    mark(
      "R",
      png.ok && jpg.ok && webp.ok && gif.ok && !icoBlocked.ok,
      `png=${png.ok} jpg=${jpg.ok} webp=${webp.ok} gif=${gif.ok} icoBlocked=${!icoBlocked.ok}`
    );
  }

  // S Source: current-run artifact cleanup protections (non-mutating)
  {
    const selfSrc = fs.readFileSync(__filename, "utf8");
    const tracksExactId =
      /createdTestAsset\s*=/.test(selfSrc) &&
      /mediaId/.test(selfSrc) &&
      /originalName/.test(selfSrc) &&
      /phase11-favicon-\$\{stamp\}\.png/.test(selfSrc);
    const exactRowDelete =
      /DELETE FROM media_assets\s+WHERE id=\?\s+AND original_name=\?/.test(selfSrc);
    const noBroadPurposeDelete = !/DELETE FROM media_assets\s+WHERE\s+purpose\s*=\s*['"]favicon['"]/.test(
      selfSrc
    );
    const noBroadNameLike =
      !/DELETE FROM media_assets[\s\S]{0,120}original_name\s+LIKE\s+['"]%?phase11/.test(selfSrc);
    const localPathGuard =
      /resolveSafeLocalFaviconPath/.test(selfSrc) &&
      /public['",\s]*uploads['",\s]*favicon/.test(selfSrc) &&
      /startsWith\("\.\."\)/.test(selfSrc);
    const faviconRestore =
      /UPDATE site_content SET content_value=\? WHERE content_key='favicon_url'/.test(selfSrc) &&
      /previousFavicon/.test(selfSrc);
    const cleanupObservable =
      /cleanupFailures/.test(selfSrc) && /console\.error\(\s*"[^\"]*cleanup/.test(selfSrc);
    const cloudinaryExactDestroy =
      /destroyExactCloudinaryAsset/.test(selfSrc) &&
      /createdTestAsset\.provider\s*===\s*"cloudinary"/.test(selfSrc) &&
      /createdTestAsset\.publicId/.test(selfSrc) &&
      /uploader\.destroy\(id/.test(selfSrc);
    // Build banned API names at runtime so this assertion text cannot false-positive itself.
    const bannedCloudinaryApis = [
      "delete_resources" + "_by_prefix",
      "delete_" + "folder",
      "destroy_" + "by_prefix",
    ];
    const noCloudinaryBulk =
      bannedCloudinaryApis.every((name) => !selfSrc.includes(name)) &&
      !/\.delete_resources\s*\(/.test(selfSrc);
    mark(
      "S",
      tracksExactId &&
        exactRowDelete &&
        noBroadPurposeDelete &&
        noBroadNameLike &&
        localPathGuard &&
        faviconRestore &&
        cleanupObservable &&
        cloudinaryExactDestroy &&
        noCloudinaryBulk,
      `track=${tracksExactId} exactDel=${exactRowDelete} noBroadPurpose=${noBroadPurposeDelete} noLike=${noBroadNameLike} pathGuard=${localPathGuard} restore=${faviconRestore} observable=${cleanupObservable} cld=${cloudinaryExactDestroy} noBulk=${noCloudinaryBulk}`
    );

    // Local path helper unit checks (no filesystem writes)
    {
      const okPath = resolveSafeLocalFaviconPath("/uploads/favicon/favicon-1234567890123.png?v=1");
      const trav = resolveSafeLocalFaviconPath("/uploads/favicon/../../etc/passwd");
      const outside = resolveSafeLocalFaviconPath("/uploads/other/x.png");
      const abs = resolveSafeLocalFaviconPath("C:\\\\Windows\\\\evil.png");
      mark(
        "S2",
        !!okPath &&
          okPath.includes(`${path.sep}public${path.sep}uploads${path.sep}favicon${path.sep}`) &&
          trav == null &&
          outside == null &&
          abs == null,
        `ok=${!!okPath} trav=${trav} outside=${outside} abs=${abs}`
      );
    }

    // Cloudinary helper rejects unsafe public_id shapes without provider calls
    {
      const missing = await destroyExactCloudinaryAsset("");
      const star = await destroyExactCloudinaryAsset("firestick4uk/favicon/*");
      const q = await destroyExactCloudinaryAsset("firestick4uk/favicon/favicon-1?");
      const folder = await destroyExactCloudinaryAsset("firestick4uk/favicon/");
      mark(
        "S3",
        missing.ok === false &&
          star.ok === false &&
          q.ok === false &&
          folder.ok === false &&
          /missing publicId|refused unsafe/.test(
            `${missing.error || ""} ${star.error || ""} ${q.error || ""} ${folder.error || ""}`
          ),
        `missing=${missing.error} star=${star.error} q=${q.error} folder=${folder.error}`
      );
    }
  }

  // ---- Auth + mutating integration (optional gate) ----
  const mutate = process.env.ALLOW_DB_MUTATION_TESTS === "YES_I_UNDERSTAND";
  if (!mutate) {
    console.log("\nSKIP A–C,N–P,T — set ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND for auth/upload integration");
    for (const id of ["A", "B", "C", "N", "O", "P", "T"]) {
      skip(id, "mutation opt-in required");
    }
  } else {
    const { requireMutationOptIn } = require("./testMutationGuard");
    requireMutationOptIn("phase11-favicon-security-tests");
    const bcrypt = require("bcryptjs");
    const mysql = require("mysql2/promise");
    const db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT) || 3306,
    });

    const stamp = Date.now();
    const expectedOriginalName = `phase11-favicon-${stamp}.png`;
    const tempPw = "Phase11FaviconPass99!";
    const hash = await bcrypt.hash(tempPw, 10);
    const mgrEmail = "phase11.manager@test.local";
    const wrEmail = "phase11.writer@test.local";
    const sessionTokenHashes = [];
    let previousFavicon = null;
    /** @type {{ stamp: number, originalName: string, url: string, mediaId: number, provider: string|null, publicId: string|null } | null} */
    let createdTestAsset = null;
    const cleanupFailures = [];

    try {
      async function ensureStaff(email, role, name) {
        const [rows] = await db.query("SELECT id FROM admin_staff WHERE email=? LIMIT 1", [email]);
        if (rows.length) {
          await db.query(
            "UPDATE admin_staff SET password_hash=?, role=?, active=1, updated_at=NOW() WHERE email=?",
            [hash, role, email]
          );
          return rows[0].id;
        }
        const [r] = await db.query(
          `INSERT INTO admin_staff (name, email, password_hash, role, active, password_changed_at, updated_at)
           VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
          [name, email, hash, role]
        );
        return r.insertId;
      }

      async function mintCookie(email, role) {
        const [rows] = await db.query("SELECT id, name FROM admin_staff WHERE email=? LIMIT 1", [email]);
        if (!rows.length) throw new Error("missing staff " + email);
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        sessionTokenHashes.push(tokenHash);
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await db.query(
          `INSERT INTO admin_sessions
            (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
           VALUES (?, ?, 'staff', ?, ?, ?, ?)`,
          [tokenHash, rows[0].id, rows[0].name, role, expiresAt, new Date()]
        );
        return `firestick_admin_session=${token}`;
      }

      async function mintMasterCookie() {
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        sessionTokenHashes.push(tokenHash);
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await db.query(
          `INSERT INTO admin_sessions
            (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
           VALUES (?, NULL, 'master', 'Admin', 'super_admin', ?, ?)`,
          [tokenHash, expiresAt, new Date()]
        );
        return `firestick_admin_session=${token}`;
      }

      await ensureStaff(mgrEmail, "manager", "Phase11 Manager");
      await ensureStaff(wrEmail, "writer", "Phase11 Writer");
      const saCookie = await mintMasterCookie();
      const mgrCookie = await mintCookie(mgrEmail, "manager");
      const wrCookie = await mintCookie(wrEmail, "writer");

      const [prevRows] = await db.query(
        `SELECT content_value FROM site_content WHERE content_key='favicon_url' LIMIT 1`
      );
      previousFavicon = prevRows?.[0]?.content_value || null;

      // A No cookie → 401
      {
        const r = await request("POST", "/api/upload-favicon", {
          body: { file: dataUrl("image/png", TINY_PNG), name: "x.png" },
        });
        mark("A", r.status === 401, `status=${r.status}`);
      }

      // B Manager → 403
      {
        const r = await request("POST", "/api/upload-favicon", {
          cookie: mgrCookie,
          body: { file: dataUrl("image/png", TINY_PNG), name: "x.png" },
        });
        mark("B", r.status === 403, `status=${r.status}`);
      }

      // C Writer → 403
      {
        const r = await request("POST", "/api/upload-favicon", {
          cookie: wrCookie,
          body: { file: dataUrl("image/png", TINY_PNG), name: "x.png" },
        });
        mark("C", r.status === 403, `status=${r.status}`);
      }

      // N / O / P — one real favicon upload (minimal Cloudinary volume)
      {
        const beforeAudits = await db.query(
          `SELECT COUNT(*) AS c FROM admin_audit_log WHERE action='media.uploaded' AND summary='Uploaded favicon'`
        );
        const beforeCount = Number(beforeAudits[0]?.[0]?.c || 0);

        const up = await request("POST", "/api/upload-favicon", {
          cookie: saCookie,
          body: {
            file: dataUrl("image/png", TINY_PNG),
            name: expectedOriginalName,
          },
        });

        let favRow = null;
        if (up.json?.url) {
          const [rows] = await db.query(
            `SELECT content_value FROM site_content WHERE content_key='favicon_url' LIMIT 1`
          );
          favRow = rows?.[0]?.content_value || null;
        }
        const favUpdated = !!favRow && !!up.json?.url && String(favRow) === String(up.json.url);
        mark(
          "N",
          up.status === 200 && !!up.json?.success && !!up.json?.url && favUpdated,
          `status=${up.status} url=${!!up.json?.url} favUpdated=${favUpdated} err=${up.json?.error || ""}`
        );

        let mediaOk = false;
        if (up.json?.url) {
          const [mrows] = await db.query(
            `SELECT id, purpose, provider, public_id, original_name, url
             FROM media_assets
             WHERE purpose='favicon' AND url=? AND original_name=?
             LIMIT 1`,
            [up.json.url, expectedOriginalName]
          );
          const row = mrows?.[0] || null;
          mediaOk = !!row?.id;
          if (row?.id) {
            createdTestAsset = {
              stamp,
              originalName: String(row.original_name || expectedOriginalName),
              url: String(row.url || up.json.url),
              mediaId: Number(row.id),
              provider: row.provider != null ? String(row.provider) : null,
              publicId: row.public_id != null ? String(row.public_id) : null,
            };
          }
        }
        mark(
          "O",
          up.status === 200 &&
            mediaOk &&
            !!createdTestAsset?.mediaId &&
            (createdTestAsset.provider !== "cloudinary" || !!createdTestAsset.publicId),
          `indexed=${mediaOk} mediaId=${createdTestAsset?.mediaId || "none"} provider=${createdTestAsset?.provider || "?"} publicId=${createdTestAsset?.publicId ? "yes" : "no"}`
        );

        const afterAudits = await db.query(
          `SELECT COUNT(*) AS c FROM admin_audit_log WHERE action='media.uploaded' AND summary='Uploaded favicon'`
        );
        const afterCount = Number(afterAudits[0]?.[0]?.c || 0);
        mark("P", up.status === 200 && afterCount === beforeCount + 1, `before=${beforeCount} after=${afterCount}`);
      }
    } finally {
      // Each cleanup step is independent so one failure does not block the rest.
      try {
        if (sessionTokenHashes.length) {
          await db.query(
            `DELETE FROM admin_sessions WHERE token_hash IN (${sessionTokenHashes.map(() => "?").join(",")})`,
            sessionTokenHashes
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupFailures.push(`sessions: ${msg}`);
        console.error("[phase11 cleanup] sessions failed:", msg);
      }

      // Restore prior favicon_url so local/dev test does not leave a local path on shared DB.
      try {
        if (previousFavicon != null) {
          await db.query(
            `UPDATE site_content SET content_value=? WHERE content_key='favicon_url'`,
            [previousFavicon]
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupFailures.push(`favicon_restore: ${msg}`);
        console.error("[phase11 cleanup] favicon restore failed:", msg);
      }

      // Local provider: exact file under public/uploads/favicon only.
      try {
        if (createdTestAsset && createdTestAsset.provider === "local") {
          const localPath = resolveSafeLocalFaviconPath(createdTestAsset.url);
          if (!localPath) {
            cleanupFailures.push(
              `local_file: refused unsafe path for url=${String(createdTestAsset.url).slice(0, 120)}`
            );
            console.error("[phase11 cleanup] local path rejected");
          } else {
            const removed = unlinkLocalFaviconIfPresent(localPath);
            if (!removed.ok) {
              cleanupFailures.push(`local_file: ${removed.error}`);
              console.error("[phase11 cleanup] local unlink failed:", removed.error);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupFailures.push(`local_file: ${msg}`);
        console.error("[phase11 cleanup] local file step failed:", msg);
      }

      // Cloudinary provider: exact-resource destroy using captured publicId only.
      try {
        if (createdTestAsset && createdTestAsset.provider === "cloudinary") {
          if (!createdTestAsset.publicId) {
            cleanupFailures.push("cloudinary: missing captured publicId for current-run asset");
            console.error("[phase11 cleanup] cloudinary publicId missing — refusing guessed destroy");
          } else {
            const destroyed = await destroyExactCloudinaryAsset(createdTestAsset.publicId);
            if (!destroyed.ok) {
              cleanupFailures.push(`cloudinary: ${destroyed.error}`);
              console.error(
                "[phase11 cleanup] cloudinary destroy failed:",
                destroyed.error,
                `public_id=${createdTestAsset.publicId}`
              );
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupFailures.push(`cloudinary: ${msg}`);
        console.error("[phase11 cleanup] cloudinary step failed:", msg);
      }

      // Exact current-run media_assets row only (id + original_name + url ownership guards).
      try {
        if (createdTestAsset?.mediaId) {
          const [delResult] = await db.query(
            `DELETE FROM media_assets
             WHERE id=? AND original_name=? AND url=?`,
            [createdTestAsset.mediaId, createdTestAsset.originalName, createdTestAsset.url]
          );
          const affected = Number(delResult?.affectedRows || 0);
          if (affected !== 1) {
            cleanupFailures.push(
              `media_row: expected 1 deleted row for id=${createdTestAsset.mediaId}, got ${affected}`
            );
            console.error(
              "[phase11 cleanup] media_assets delete mismatch:",
              `id=${createdTestAsset.mediaId} affected=${affected}`
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupFailures.push(`media_row: ${msg}`);
        console.error("[phase11 cleanup] media_assets delete failed:", msg);
      }

      try {
        await db.end();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cleanupFailures.push(`db_end: ${msg}`);
        console.error("[phase11 cleanup] db.end failed:", msg);
      }
    }

    mark(
      "T",
      cleanupFailures.length === 0,
      cleanupFailures.length ? cleanupFailures.join("; ") : "cleanup ok"
    );
  }

  const fails = Object.entries(out).filter(([, status]) => status === "FAIL");
  const skips = Object.entries(out).filter(([, status]) => status === "SKIP");
  console.log("\n========== SUMMARY ==========");
  for (const id of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "S2", "S3", "T"]) {
    console.log(`${out[id] || "MISSING"} ${id}`);
  }
  if (fails.length) {
    console.log(`\nFAILED: ${fails.length}`);
    process.exit(1);
  }
  console.log(skips.length ? `\nALL PASS (${skips.length} skipped)` : "\nALL PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

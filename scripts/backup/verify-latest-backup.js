/**
 * Server-side verification of the newest encrypted off-site backup.
 * Download (signed private URL) → decrypt → integrity + per-table row counts.
 * Never imports into MySQL. Never prints secrets, key, or row data.
 *
 * Exit codes:
 *   0  verify=ok
 *   1  unexpected error / verify=fail
 *   2  missing/invalid env
 *   4  decrypt/integrity failure
 *
 * Usage:
 *   node scripts/backup/verify-latest-backup.js
 *
 * Env (names only — values never logged):
 *   BACKUP_ENC_KEY (64 hex chars)
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");

const {
  validateBackupKey,
  requireEnvNames,
  unpackEncryptedFile,
  CLOUD_FOLDER,
  PUBLIC_ID_PREFIX,
  CLOUDINARY_ENV_NAMES,
  parseStampFromPublicId,
} = require("./offsite-db-backup");
const { countRowsByTable, countSqlForbidden } = require("./sql-tuple-parser");

const LIST_PREFIX = CLOUD_FOLDER + "/" + PUBLIC_ID_PREFIX;

function splitPublicIdFormat(publicId) {
  const id = String(publicId || "");
  if (/\.enc$/i.test(id)) {
    return { publicId: id.replace(/\.enc$/i, ""), format: "enc" };
  }
  return { publicId: id, format: "" };
}

async function listResourcesPage(cloudinary, opts) {
  const {
    type = "private",
    resource_type = "raw",
    prefix,
    max_results = 500,
    next_cursor,
  } = opts;
  return cloudinary.api.resources({
    type,
    resource_type,
    prefix,
    max_results,
    next_cursor,
  });
}

async function listAllResources(cloudinary, opts) {
  let resources = [];
  let nextCursor = undefined;
  do {
    const page = await listResourcesPage(cloudinary, {
      ...opts,
      next_cursor: nextCursor,
    });
    resources = resources.concat(page.resources || []);
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return resources;
}

/**
 * Primary listing: private raw with backup prefix.
 * If empty, try diagnostic variants (type / prefix with .enc) and report which hit.
 */
async function listBackupResources(cloudinary) {
  const primary = await listAllResources(cloudinary, {
    type: "private",
    resource_type: "raw",
    prefix: LIST_PREFIX,
  });
  if (primary.length > 0) {
    return {
      resources: primary,
      listing_variant: "private/raw/prefix=" + LIST_PREFIX,
      variants_tried: [],
    };
  }

  const variants = [
    { type: "private", resource_type: "raw", prefix: LIST_PREFIX + ".enc" },
    { type: "authenticated", resource_type: "raw", prefix: LIST_PREFIX },
    { type: "authenticated", resource_type: "raw", prefix: LIST_PREFIX + ".enc" },
    { type: "upload", resource_type: "raw", prefix: LIST_PREFIX },
    { type: "upload", resource_type: "raw", prefix: LIST_PREFIX + ".enc" },
  ];
  const variants_tried = [];
  for (const v of variants) {
    let found = [];
    let errMsg = null;
    try {
      found = await listAllResources(cloudinary, v);
    } catch (e) {
      errMsg = e && e.message ? String(e.message).slice(0, 80) : "error";
    }
    const label =
      v.type +
      "/raw/prefix=" +
      v.prefix +
      (errMsg ? " err=" + errMsg : " count=" + found.length);
    variants_tried.push(label);
    if (found.length > 0) {
      return {
        resources: found,
        listing_variant: label,
        variants_tried,
      };
    }
  }
  return {
    resources: [],
    listing_variant: "private/raw/prefix=" + LIST_PREFIX + " (empty)",
    variants_tried,
  };
}

function pickNewest(resources) {
  const scored = [];
  for (const r of resources || []) {
    if (!r || !r.public_id) continue;
    const stamp = parseStampFromPublicId(r.public_id);
    const created = r.created_at ? Date.parse(r.created_at) : 0;
    scored.push({
      resource: r,
      stamp: stamp || "",
      created: Number.isFinite(created) ? created : 0,
      bytes: Number(r.bytes) || 0,
    });
  }
  scored.sort((a, b) => {
    if (a.stamp && b.stamp && a.stamp !== b.stamp) {
      return a.stamp < b.stamp ? 1 : -1;
    }
    return b.created - a.created;
  });
  return scored[0] || null;
}

function downloadUrlToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("http://") ? http.get : https.get;
    const req = get(url, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume();
        downloadUrlToFile(res.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(
          Object.assign(new Error("download_http_" + res.statusCode), {
            code: 4,
          })
        );
        return;
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on("finish", () => resolve(destPath));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function gunzipToString(gzipBuf) {
  const chunks = [];
  const gunzip = zlib.createGunzip();
  await pipeline(Readable.from(gzipBuf), gunzip, async function consume(source) {
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk));
    }
  });
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Build candidate signed download URLs for a private raw backup.
 * Cloudinary may store public_id WITH the ".enc" suffix (no separate format)
 * or as base + format=enc — try both download API shapes, then signed delivery.
 */
function buildSignedDownloadCandidates(cloudinary, publicId, type) {
  const t = type || "private";
  const opts = { resource_type: "raw", type: t, attachment: true };
  const { publicId: stripped, format } = splitPublicIdFormat(publicId);
  const candidates = [];
  // 1) public_id as listed (includes .enc) + empty format — matches OFFSITE-118 upload result
  candidates.push({
    label: "download_full_id",
    url: cloudinary.utils.private_download_url(publicId, "", opts),
    publicId,
    format: "",
  });
  // 2) strip .enc + format=enc
  if (format === "enc" && stripped !== publicId) {
    candidates.push({
      label: "download_strip_format",
      url: cloudinary.utils.private_download_url(stripped, "enc", opts),
      publicId: stripped,
      format: "enc",
    });
  }
  // 3) signed delivery URL for private raw
  if (typeof cloudinary.url === "function") {
    candidates.push({
      label: "signed_delivery",
      url: cloudinary.url(publicId, {
        resource_type: "raw",
        type: t,
        sign_url: true,
        secure: true,
      }),
      publicId,
      format: null,
    });
  }
  return candidates;
}

function buildSignedDownloadUrl(cloudinary, publicId, type) {
  const cands = buildSignedDownloadCandidates(cloudinary, publicId, type);
  return cands[0].url;
}

async function verifyLatestBackup(options = {}) {
  const key = validateBackupKey(process.env.BACKUP_ENC_KEY);
  if (!key) {
    console.error("missing/invalid key");
    const err = new Error("missing/invalid key");
    err.code = 2;
    throw err;
  }
  const missing = requireEnvNames(CLOUDINARY_ENV_NAMES);
  if (missing.length) {
    console.error("missing env: " + missing.join(","));
    const err = new Error("missing env");
    err.code = 2;
    throw err;
  }

  const cloudinary =
    options.cloudinary || require("cloudinary").v2;
  if (!options.skipCloudinaryConfig) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-verify-"));
  const encPath = path.join(tmpDir, "latest.enc");
  const temps = [encPath, tmpDir];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    const listed = await listBackupResources(cloudinary);
    const resources = listed.resources;
    console.log("resource_count=" + resources.length);
    console.log("listing_variant=" + listed.listing_variant);
    if (listed.variants_tried.length) {
      console.log("listing_variants_tried=" + listed.variants_tried.join("|"));
    }

    const newest = pickNewest(resources);
    if (!newest) {
      console.log("verify=fail");
      console.log("reason=no_resources");
      const err = new Error("no backup resources found");
      err.code = 4;
      throw err;
    }

    const publicId = newest.resource.public_id;
    const encBytesListed = newest.bytes;
    console.log("newest_public_id=" + publicId);
    console.log(
      "newest_created_at=" + (newest.resource.created_at || "")
    );
    console.log("newest_bytes=" + encBytesListed);

    // Prefer variant type from listing_variant string
    let type = "private";
    if (listed.listing_variant.startsWith("authenticated/")) type = "authenticated";
    else if (listed.listing_variant.startsWith("upload/")) type = "upload";

    const candidates =
      options.signedUrl
        ? [{ label: "injected", url: options.signedUrl, publicId, format: null }]
        : buildSignedDownloadCandidates(cloudinary, publicId, type);
    console.log("signed_download=1");
    console.log("download_candidates=" + candidates.length);

    let signedUrl = null;
    let downloadLabel = null;
    let lastDownloadErr = null;
    for (const cand of candidates) {
      try {
        if (options.downloadFn) {
          await options.downloadFn(cand.url, encPath, cand);
        } else {
          await downloadUrlToFile(cand.url, encPath);
        }
        signedUrl = cand.url;
        downloadLabel = cand.label;
        break;
      } catch (e) {
        lastDownloadErr = e;
        const msg = e && e.message ? String(e.message) : "";
        // Only fall through on HTTP 404; other errors abort
        if (!/download_http_404/.test(msg)) {
          throw e;
        }
        try {
          if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
        } catch {
          /* ignore */
        }
      }
    }
    if (!signedUrl) {
      console.log("verify=fail");
      console.log("reason=download_failed");
      throw (
        lastDownloadErr ||
        Object.assign(new Error("download_failed"), { code: 4 })
      );
    }
    console.log("download_variant=" + downloadLabel);

    const encBuf = fs.readFileSync(encPath);
    const encSha256 = crypto.createHash("sha256").update(encBuf).digest("hex");
    console.log("public_id=" + publicId);
    console.log("enc_bytes=" + encBuf.length);
    console.log("enc_sha256=" + encSha256);

    let unpacked;
    let gcm_ok = false;
    try {
      unpacked = unpackEncryptedFile(key, encBuf);
      gcm_ok = true;
    } catch (e) {
      console.log("gcm_ok=0");
      console.log("verify=fail");
      console.log("reason=decrypt_failed");
      const err = new Error("decrypt failed");
      err.code = 4;
      throw err;
    }
    console.log("gcm_ok=1");

    const { manifest, gzipPlain } = unpacked;
    if (manifest.gzip_sha256) {
      const gzSha = crypto.createHash("sha256").update(gzipPlain).digest("hex");
      if (gzSha !== manifest.gzip_sha256) {
        console.log("verify=fail");
        console.log("reason=gzip_sha256_mismatch");
        const err = new Error("gzip sha256 mismatch");
        err.code = 4;
        throw err;
      }
    }

    const sql = await gunzipToString(gzipPlain);
    const parsedTables = countRowsByTable(sql);
    const forbidden = countSqlForbidden(sql);

    const manifestTables =
      manifest.tables && typeof manifest.tables === "object"
        ? manifest.tables
        : {};
    const manifestTableNames = Object.keys(manifestTables).sort();
    const parsedTableNames = Object.keys(parsedTables).sort();
    const allNames = Array.from(
      new Set([...manifestTableNames, ...parsedTableNames])
    ).sort();

    const mismatches = [];
    for (const name of allNames) {
      const m = Number(manifestTables[name] || 0);
      const p = Number(parsedTables[name] || 0);
      if (m !== p) mismatches.push(name);
    }

    const manifest_total_rows = Number(
      manifest.total_rows != null
        ? manifest.total_rows
        : Object.values(manifestTables).reduce((a, b) => a + Number(b), 0)
    );
    const parsed_total_rows = Object.values(parsedTables).reduce(
      (a, b) => a + Number(b),
      0
    );

    console.log("manifest_tables=" + manifestTableNames.length);
    console.log("manifest_total_rows=" + manifest_total_rows);
    console.log("parsed_tables=" + parsedTableNames.length);
    console.log("parsed_total_rows=" + parsed_total_rows);
    console.log("mismatches=" + JSON.stringify(mismatches));
    console.log("sql_use_count=" + forbidden.use_database);
    console.log("sql_create_database_count=" + forbidden.create_database);
    console.log("sql_definer_count=" + forbidden.definer);

    const ok =
      gcm_ok &&
      mismatches.length === 0 &&
      manifestTableNames.length === parsedTableNames.length &&
      manifest_total_rows === parsed_total_rows &&
      forbidden.use_database === 0 &&
      forbidden.create_database === 0 &&
      forbidden.definer === 0;

    console.log("verify=" + (ok ? "ok" : "fail"));

    if (!ok) {
      const err = new Error("verify fail");
      err.code = 4;
      err.mismatches = mismatches;
      throw err;
    }

    return {
      ok: true,
      public_id: publicId,
      enc_bytes: encBuf.length,
      enc_sha256: encSha256,
      manifest_tables: manifestTableNames.length,
      manifest_total_rows,
      parsed_tables: parsedTableNames.length,
      parsed_total_rows,
      mismatches,
      gcm_ok,
      tmpDir,
      temps,
      signedUrl,
      listing_variant: listed.listing_variant,
    };
  } finally {
    if (!options.skipCleanup) cleanup();
  }
}

async function main() {
  try {
    await verifyLatestBackup();
    process.exit(0);
  } catch (err) {
    const code = err && err.code ? Number(err.code) : 1;
    const msg = err && err.message ? String(err.message) : "";
    if (
      msg &&
      !/missing\/invalid key|missing env|verify fail|decrypt failed|no backup/.test(
        msg
      )
    ) {
      console.error(msg);
    }
    process.exit(Number.isFinite(code) && code > 0 ? code : 1);
  }
}

module.exports = {
  LIST_PREFIX,
  splitPublicIdFormat,
  listBackupResources,
  listAllResources,
  pickNewest,
  downloadUrlToFile,
  buildSignedDownloadUrl,
  buildSignedDownloadCandidates,
  gunzipToString,
  verifyLatestBackup,
};

if (require.main === module) {
  main();
}

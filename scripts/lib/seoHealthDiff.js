/**
 * SEO field extract + field-level diff helpers for live-health-check.
 * Pure Node; no deps. Countdown-digit-insensitive JSON-LD hashing.
 */
"use strict";

const crypto = require("crypto");

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html, name) {
  const re1 = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["'][^>]*>`,
    "i"
  );
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : "";
}

function canonicalHref(html) {
  const re1 = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i;
  const re2 = /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/i;
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : "";
}

function extractH1List(html) {
  const out = [];
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push(stripTags(m[1]));
  }
  return out;
}

/** Ordered nav links from <nav>…</nav> blocks: {text, href}. */
function extractNav(html) {
  const navs = [];
  const navRe = /<nav\b[^>]*>([\s\S]*?)<\/nav>/gi;
  let nm;
  while ((nm = navRe.exec(html))) {
    navs.push(nm[1]);
  }
  const scope = navs.length ? navs.join("\n") : "";
  const links = [];
  if (!scope) return links;
  const aRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let am;
  while ((am = aRe.exec(scope))) {
    const href = am[1].trim();
    const text = stripTags(am[2]);
    if (!href || href.startsWith("#")) continue;
    links.push({ text, href });
  }
  return links;
}

/** Normalize countdown digits in JSON-LD before hashing (live tick drift). */
function normalizeCountdownDigits(s) {
  return String(s || "").replace(/\d+/g, "#");
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

function jsonLdSha256(html) {
  const joined = extractJsonLdBlocks(html)
    .map((b) => normalizeCountdownDigits(b))
    .join("\n---\n");
  return crypto.createHash("sha256").update(joined, "utf8").digest("hex");
}

function extractSeoFields(html, urlPath) {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    path: urlPath,
    title: titleM ? stripTags(titleM[1]) : "",
    description: metaContent(html, "description"),
    canonical: canonicalHref(html),
    robots: metaContent(html, "robots"),
    h1: extractH1List(html),
    nav: extractNav(html),
    jsonLdSha256: jsonLdSha256(html),
  };
}

/**
 * Field-level diff of two SEO snapshots.
 * Returns [] when identical; else list of { path, field, before, after }.
 */
function diffSeoFields(baselineEntry, liveEntry) {
  const diffs = [];
  const path = (liveEntry && liveEntry.path) || (baselineEntry && baselineEntry.path) || "";
  if (!baselineEntry) {
    diffs.push({ path, field: "_missing_baseline", before: null, after: liveEntry || null });
    return diffs;
  }
  if (!liveEntry) {
    diffs.push({ path, field: "_missing_live", before: baselineEntry, after: null });
    return diffs;
  }
  for (const field of ["title", "description", "canonical", "robots", "jsonLdSha256"]) {
    const b = baselineEntry[field] == null ? "" : String(baselineEntry[field]);
    const a = liveEntry[field] == null ? "" : String(liveEntry[field]);
    if (b !== a) diffs.push({ path, field, before: b, after: a });
  }
  const bh = JSON.stringify(baselineEntry.h1 || []);
  const ah = JSON.stringify(liveEntry.h1 || []);
  if (bh !== ah) {
    diffs.push({ path, field: "h1", before: baselineEntry.h1 || [], after: liveEntry.h1 || [] });
  }
  const bn = JSON.stringify(baselineEntry.nav || []);
  const an = JSON.stringify(liveEntry.nav || []);
  if (bn !== an) {
    diffs.push({ path, field: "nav", before: baselineEntry.nav || [], after: liveEntry.nav || [] });
  }
  return diffs;
}

function diffSeoBaselines(baseline, liveMap) {
  const allPaths = new Set([
    ...Object.keys((baseline && baseline.pages) || {}),
    ...Object.keys(liveMap || {}),
  ]);
  const diffs = [];
  for (const p of [...allPaths].sort()) {
    const b = baseline && baseline.pages ? baseline.pages[p] : null;
    const a = liveMap ? liveMap[p] : null;
    diffs.push(...diffSeoFields(b, a));
  }
  return diffs;
}

module.exports = {
  stripTags,
  extractSeoFields,
  diffSeoFields,
  diffSeoBaselines,
  normalizeCountdownDigits,
  jsonLdSha256,
  extractNav,
  extractH1List,
};

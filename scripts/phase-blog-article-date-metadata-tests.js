/**
 * Narrow regression: blog article openGraph / JSON-LD date serialization.
 * Proves Date objects never become "[object Object]" in metadata fields.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
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

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {} };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox, require);
  return sandbox.exports;
}

const { toIsoDateString, resolveArticleDates } = loadTsModule(
  "app/blog/[slug]/blogArticleDates.ts"
);

const sampleDate = new Date("2026-06-08T14:10:18.000Z");
const fromDate = toIsoDateString(sampleDate);
ok("1_date_object_iso", fromDate === "2026-06-08T14:10:18.000Z", String(fromDate));

const fromString = toIsoDateString("2026-06-08T14:10:18.000Z");
ok(
  "2_valid_string_iso",
  typeof fromString === "string" &&
    !Number.isNaN(Date.parse(fromString)) &&
    fromString.includes("2026-06-08"),
  String(fromString)
);

ok("3_null_omitted", toIsoDateString(null) === undefined);
ok("4_undefined_omitted", toIsoDateString(undefined) === undefined);
ok("5_invalid_string_omitted", toIsoDateString("not-a-date") === undefined);
ok("5b_empty_omitted", toIsoDateString("") === undefined);
ok("5c_invalid_date_object_omitted", toIsoDateString(new Date("invalid")) === undefined);

const badObject = toIsoDateString({ created_at: "x" });
ok(
  "6_object_never_object_object",
  badObject === undefined && String(badObject) !== "[object Object]",
  String(badObject)
);
ok("6b_stringified_object_rejected", toIsoDateString("[object Object]") === undefined);

const datesFromDate = resolveArticleDates(sampleDate, null);
ok(
  "7_og_publishedTime_normalized_string",
  datesFromDate.publishedTime === "2026-06-08T14:10:18.000Z" &&
    typeof datesFromDate.publishedTime === "string" &&
    datesFromDate.publishedTime !== "[object Object]"
);
ok(
  "8_article_datePublished_normalized",
  datesFromDate.datePublished === "2026-06-08T14:10:18.000Z"
);

const updated = new Date("2026-07-01T12:00:00.000Z");
const withUpdated = resolveArticleDates(sampleDate, updated);
ok(
  "9_dateModified_uses_updated_at",
  withUpdated.dateModified === "2026-07-01T12:00:00.000Z"
);

const fallbackMod = resolveArticleDates(sampleDate, null);
ok(
  "10_missing_updated_falls_back_to_published",
  fallbackMod.dateModified === fallbackMod.datePublished &&
    fallbackMod.dateModified === "2026-06-08T14:10:18.000Z"
);

const bothBad = resolveArticleDates("nope", { x: 1 });
ok(
  "11_invalid_both_no_fabricated",
  bothBad.publishedTime === undefined &&
    bothBad.datePublished === undefined &&
    bothBad.dateModified === undefined &&
    !Object.values(bothBad).some((v) => String(v) === "[object Object]")
);

ok("pre_fix_object_coercion_is_object_object", String({ a: 1 }) === "[object Object]");
ok(
  "numeric_epoch_iso",
  toIsoDateString(sampleDate.getTime()) === "2026-06-08T14:10:18.000Z"
);

const page = read("app/blog/[slug]/page.tsx");
ok(
  "wire_imports_resolveArticleDates",
  /resolveArticleDates/.test(page) && /from ["']\.\/blogArticleDates["']/.test(page)
);
ok("wire_no_raw_publishedTime_created_at", !/publishedTime:\s*post\.created_at/.test(page));
ok("wire_no_raw_datePublished_created_at", !/datePublished:\s*post\.created_at/.test(page));
ok("wire_no_raw_dateModified_or", !/dateModified:\s*post\.updated_at\s*\|\|/.test(page));
ok(
  "wire_conditional_publishedTime",
  /\.\.\.\(dates\.publishedTime\s*\?\s*\{\s*publishedTime:\s*dates\.publishedTime/.test(page)
);
ok(
  "wire_conditional_jsonld_dates",
  /if\s*\(dates\.datePublished\)\s*articleLd\.datePublished/.test(page) &&
    /if\s*\(dates\.dateModified\)\s*articleLd\.dateModified/.test(page)
);
ok(
  "wire_no_Date_now_fabricate",
  !/Date\.now\s*\(/.test(page) && !/new Date\s*\(\s*\)/.test(page)
);

const helperSrc = read("app/blog/[slug]/blogArticleDates.ts");
ok(
  "helper_no_fabricate_now",
  !/Date\.now\s*\(/.test(helperSrc) && !/new Date\s*\(\s*\)/.test(helperSrc)
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

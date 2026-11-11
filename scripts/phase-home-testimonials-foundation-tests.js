/**
 * Homepage customer-reviews foundation — source + helper contracts.
 * No fabricated testimonials, no default five-star fallback, approval gate required.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

function loadHelper() {
  const src = read("lib/homeTestimonials.ts");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: "lib/homeTestimonials.ts",
  });
  const fakeModule = { exports: {} };
  const fn = new Function("require", "module", "exports", outputText);
  fn(require, fakeModule, fakeModule.exports);
  const {
    parseHomeTestimonialRating,
    isHomeTestimonialApproved,
    getPublishableHomeTestimonials,
  } = fakeModule.exports;
  return {
    m1: parseHomeTestimonialRating(undefined),
    m2: parseHomeTestimonialRating(null),
    m3: parseHomeTestimonialRating(""),
    m4: parseHomeTestimonialRating(0),
    m5: parseHomeTestimonialRating(6),
    m6: parseHomeTestimonialRating(5),
    m7: parseHomeTestimonialRating("3"),
    m8len: getPublishableHomeTestimonials([
      { name: "John Smith", rating: 5, text: "Amazing", approved: false },
      { name: "A", text: "Real", approved: true },
    ]).length,
    m8rating:
      getPublishableHomeTestimonials([
        { name: "A", text: "Real", approved: true },
      ])[0]?.rating ?? null,
    m9:
      getPublishableHomeTestimonials([
        { name: "A", text: "Real", approved: true, rating: 4 },
      ])[0]?.rating ?? null,
    approvedFalse: isHomeTestimonialApproved({ approved: false }),
    approvedTrue: isHomeTestimonialApproved({ approved: true }),
  };
}

(async () => {
  let failed = 0;
  const fail = (id, ok, detail) => {
    if (!mark(id, ok, detail)) failed += 1;
  };

  const home = read("app/HomeClient.tsx");
  const seed = read("lib/siteContentSeed.ts");
  const sidhu = read("app/sidhu/page.tsx");
  const helperSrc = read("lib/homeTestimonials.ts");

  fail("A", /getPublishableHomeTestimonials/.test(home), "HomeClient uses publishable filter");
  fail("B", /Share Your Experience/.test(home) && /href="\/contact"/.test(home), "empty-state CTA to /contact");
  fail(
    "C",
    /Genuine customer reviews will be featured here with permission/.test(home),
    "truthful empty-state message"
  );
  fail(
    "D",
    /Your feedback helps us improve our service\./.test(home) ||
      /Your feedback helps us improve our service\./.test(helperSrc) ||
      /getHomeTestimonialsSubtitle/.test(home),
    "subtitle present (CMS or helper default)"
  );
  fail("E", !/rating\s*\|\|\s*5/.test(home), "no five-star fallback in HomeClient");
  fail("F", !/AggregateRating/.test(home) && !/"@type"\s*:\s*"Review"/.test(home), "no review structured data");
  fail("G", !/Verified Purchase/.test(home), "no Verified Purchase badge");
  fail(
    "H",
    /home_testimonials:\s*\{\s*title:\s*"What Our Customers Say",\s*items:\s*\[\s*\]\s*\}/.test(home),
    "client default empty items"
  );
  fail(
    "I",
    /"home_testimonials",\s*\n\s*'\{"title":"What Our Customers Say","items":\[\]\}'/.test(seed),
    "seed testimonials empty"
  );
  fail("J", !/John Smith/.test(seed) && !/Sarah Jones/.test(seed), "seed has no fabricated names");
  fail(
    "K",
    /Customer permission granted — publish on homepage/.test(sidhu) &&
      /approved:false/.test(sidhu) &&
      !/testimonial'\)\?\{name:"",rating:5,text:""\}/.test(sidhu),
    "CMS approval gate; no default rating:5 on add"
  );
  fail("L", /parseHomeTestimonialRating/.test(helperSrc) && /approved === true/.test(helperSrc), "helper approval + rating");

  let results;
  try {
    results = loadHelper();
  } catch (e) {
    fail("M", false, `helper load failed: ${e.message}`);
    console.log(`\nHomeTestimonials FAIL (${failed})`);
    process.exit(1);
  }

  fail("M1", results.m1 === null, "missing rating → null");
  fail("M2", results.m2 === null, "null rating → null");
  fail("M3", results.m3 === null, "empty rating → null");
  fail("M4", results.m4 === null, "0 rating → null");
  fail("M5", results.m5 === null, "6 rating → null");
  fail("M6", results.m6 === 5, "5 rating ok");
  fail("M7", results.m7 === 3, "string 3 ok");
  fail("M8", results.m8len === 1 && results.m8rating === null, "unapproved hidden; approved without rating has no stars");
  fail("M9", results.m9 === 4, "approved with rating keeps stars");
  fail("M10", results.approvedFalse === false && results.approvedTrue === true, "approval boolean");

  console.log(failed === 0 ? "\nHomeTestimonials PASS" : `\nHomeTestimonials FAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** CJS esbuild build — resolve esbuild from npx cache when not installed locally. */
const path = require("path");
const fs = require("fs");
const Module = require("module");

function loadEsbuild() {
  try {
    return require("esbuild");
  } catch {
    const npxRoot = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
    const candidates = [];
    function walk(dir, depth) {
      if (depth > 6 || !fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "esbuild" && fs.existsSync(path.join(abs, "lib", "main.js"))) {
            candidates.push(abs);
          } else {
            walk(abs, depth + 1);
          }
        }
      }
    }
    walk(npxRoot, 0);
    if (!candidates.length) throw new Error("esbuild not found locally or in npx cache");
    return require(candidates[0]);
  }
}
const esbuild = loadEsbuild();

const ROOT = path.join(__dirname, "../..");
const OUT = process.env.FIXTURE_OUT
  ? path.resolve(process.env.FIXTURE_OUT)
  : path.join(ROOT, "review-artifacts/visibility-10/ui-fixture");
const stubs = path.join(OUT, "stubs");
const cartStub = path.join(stubs, "cart-context.js");

const stubMap = {
  "next/navigation": path.join(stubs, "next-navigation.js"),
  "@/hooks/useContactConfig": path.join(stubs, "contact.js"),
  "@/hooks/useSiteContent": path.join(stubs, "site-content.js"),
  "@/components/Navbar": path.join(stubs, "navbar.js"),
  "@/components/Footer": path.join(stubs, "footer.js"),
  "@/lib/cms": path.join(stubs, "cms.js"),
  "@/lib/seoLinks": path.join(stubs, "seoLinks.js"),
  xss: path.join(stubs, "xss.js"),
  "@/components/product/SeasonalAlternativeCards": path.join(stubs, "alts.js"),
  "@/lib/productSeasonBoundaryClient": path.join(ROOT, "lib/productSeasonBoundaryClient.ts"),
  "@/lib/productSeasonLondon": path.join(ROOT, "lib/productSeasonLondon.ts"),
  "@/components/product/SeasonalCountdown": path.join(
    ROOT,
    "components/product/SeasonalCountdown.tsx"
  ),
};

esbuild
  .build({
    entryPoints: [path.join(OUT, "mount-entry.tsx")],
    bundle: true,
    outfile: path.join(OUT, "mount.js"),
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    loader: { ".ts": "ts", ".tsx": "tsx" },
    plugins: [
      {
        name: "fixture-stubs",
        setup(build) {
          for (const [key, target] of Object.entries(stubMap)) {
            const filter = new RegExp(
              "^" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"
            );
            build.onResolve({ filter }, () => ({ path: target }));
          }
          build.onResolve({ filter: /cartContext/ }, () => ({ path: cartStub }));
        },
      },
    ],
  })
  .then(() => {
    console.log(JSON.stringify({ ok: true, outfile: path.join(OUT, "mount.js") }));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

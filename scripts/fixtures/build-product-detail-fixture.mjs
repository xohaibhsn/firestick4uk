/** esbuild build for ACTUAL ProductDetail fixture with dependency stubs. */
import esbuild from "esbuild";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = process.env.FIXTURE_OUT
  ? path.resolve(process.env.FIXTURE_OUT)
  : path.join(ROOT, "review-artifacts/visibility-10/ui-fixture");
const stubs = path.join(OUT, "stubs");

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

const cartStub = path.join(stubs, "cart-context.js");
const cartReal = path.join(ROOT, "app/lib/cartContext.tsx");

const result = await esbuild.build({
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
        build.onResolve({ filter: /cartContext/ }, (args) => {
          return { path: cartStub };
        });
        build.onResolve({ filter: /ProductDetail/ }, (args) => {
          if (args.path.includes("ProductDetail") || args.path.includes("[slug]")) {
            return { path: path.join(ROOT, "app/products/[slug]/ProductDetail.tsx") };
          }
        });
      },
    },
  ],
});

console.log(JSON.stringify({ ok: true, errors: result.errors, cartReal, cartStub }, null, 2));

/**
 * 4K Strong public download bridge — source invariants (no network mutation).
 */
const fs = require("fs");
const path = require("path");

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

const ONEDRIVE =
  "https://1drv.ms/u/c/8b504e12d9968aae/IQBD5Da7pks6S5nf0LYmJcX-ARhEGcWCT7sKcr8M4vZPZDo?download=1";

const routeRel = "app/download/4kstrong/route.ts";
const libRel = "lib/fourKStrongDownloadBridge.ts";
ok("bridge_route_exists", fs.existsSync(path.join(ROOT, routeRel)));
ok("bridge_lib_exists", fs.existsSync(path.join(ROOT, libRel)));

const src = read(routeRel) + "\n" + read(libRel);
const sitemap = read("app/sitemap.xml/route.ts") + "\n" + read("lib/sitemapXml.ts");

ok("contains_onedrive_destination", src.includes(ONEDRIVE));
ok(
  "client_navigation",
  /location\.replace/.test(src) || /location\.href/.test(src)
);
ok("meta_refresh_fallback", /meta http-equiv/.test(src));
ok(
  "visible_fallback_link",
  /Download 4K Strong/.test(src) && /<a href=/.test(src)
);
ok(
  "marked_noindex",
  /noindex/.test(src) && /X-Robots-Tag/.test(src)
);
ok("returns_http_200", /status:\s*200/.test(src));
ok(
  "does_not_proxy_apk",
  !/fetch\s*\(/.test(src) &&
    !/createReadStream/.test(src) &&
    !/arrayBuffer\s*\(/.test(src) &&
    !/\.apk["']/.test(src) &&
    !/NextResponse\.rewrite/.test(src) &&
    /Does NOT proxy the APK/.test(src)
);
ok("not_server_redirect", !/NextResponse\.redirect|permanentRedirect|redirect\(/.test(src));
ok(
  "not_in_sitemap",
  !/download\/4kstrong/.test(sitemap) && !/4kstrong/.test(sitemap)
);
ok("no_git_apk_added", !fs.existsSync(path.join(ROOT, "public/downloads/4kstrong.apk")));

console.log(`\n4K Strong bridge: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

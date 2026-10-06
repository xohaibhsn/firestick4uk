/**
 * Phase: Retire Berlin chat + CMS Training (preserve WhatsApp + SEO AI-1A).
 * Run: node scripts/phase-remove-berlin-chat-tests.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function walkFiles(dirRel, exts) {
  const abs = path.join(ROOT, dirRel);
  const out = [];
  if (!fs.existsSync(abs)) return out;
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (exts.some((e) => name.endsWith(e))) out.push(p);
    }
  }
  walk(abs);
  return out;
}

const pkg = JSON.parse(read("package.json"));
const layout = read("app/layout.tsx");
const sidhu = read("app/sidhu/page.tsx");
const perms = read("lib/adminPermissions.ts");
const wa = read("components/WhatsAppButton.tsx");
const leadsApi = read("pages/api/admin/leads.ts");
const migrateCore = read("scripts/migrate-core-runtime-schema.js");

console.log("\nRemove Berlin Chat + Training\n");

ok("A_ChatWidget_absent", !exists("components/ChatWidget.tsx"));
ok("B_api_chat_absent", !exists("pages/api/chat.ts"));
ok("C_berlin_training_api_absent", !exists("pages/api/admin/berlin-training.ts"));
ok(
  "D_berlin_training_chat_api_absent",
  !exists("pages/api/admin/berlin-training-chat.ts")
);
ok("E_layout_has_WhatsAppButton", /<WhatsAppButton\s*\/>/.test(layout));
ok("F_layout_no_ChatWidget", !/ChatWidget/.test(layout));
ok(
  "G_sidhu_no_Training_tab",
  !/Berlin Training/.test(sidhu) &&
    !/id:\s*["']training["']/.test(sidhu) &&
    !/tab===["']training["']/.test(sidhu)
);
ok(
  "H_sidhu_no_berlin_api_fetch",
  !/\/api\/admin\/berlin-training/.test(sidhu) &&
    !/\/api\/chat/.test(sidhu)
);
ok(
  "I_training_manage_absent",
  !/training\.manage/.test(perms) &&
    !/"training"/.test(perms) &&
    !/training\.manage/.test(sidhu)
);

const runtimeRoots = ["app", "pages", "components", "lib"];
let anthropicKeyHits = [];
let anthropicModelHits = [];
let anthropicImportHits = [];
for (const root of runtimeRoots) {
  for (const file of walkFiles(root, [".ts", ".tsx", ".js", ".jsx"])) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (/ANTHROPIC_API_KEY/.test(src)) anthropicKeyHits.push(rel);
    if (/ANTHROPIC_MODEL/.test(src)) anthropicModelHits.push(rel);
    if (/@anthropic-ai\/sdk|from ["']@anthropic-ai|require\(["']@anthropic-ai/.test(src)) {
      anthropicImportHits.push(rel);
    }
  }
}
ok("J_no_runtime_ANTHROPIC_API_KEY", anthropicKeyHits.length === 0, anthropicKeyHits.join(","));
ok("K_no_runtime_ANTHROPIC_MODEL", anthropicModelHits.length === 0, anthropicModelHits.join(","));
ok("L_no_runtime_anthropic_sdk_import", anthropicImportHits.length === 0, anthropicImportHits.join(","));
ok(
  "M_anthropic_removed_from_package_json",
  !pkg.dependencies["@anthropic-ai/sdk"] &&
    !pkg.devDependencies?.["@anthropic-ai/sdk"]
);
ok("N_openai_remains", !!pkg.dependencies.openai);
ok("O_WhatsAppButton_uses_wa_me", /wa\.me/.test(wa));
ok("P_leads_api_remains", exists("pages/api/admin/leads.ts") && /chat_leads/.test(leadsApi));
ok(
  "Q_chat_leads_not_dropped",
  !/DROP TABLE\s+chat_leads/i.test(migrateCore) &&
    !/DROP TABLE\s+berlin_training/i.test(migrateCore) &&
    /chat_leads/.test(leadsApi)
);
ok("R_seoAi_remains", exists("lib/seoAi.ts"));
ok("S_seoAiServer_remains", exists("lib/seoAiServer.ts"));
ok("T_admin_seo_ai_remains", exists("pages/api/admin-seo-ai.ts"));
ok("U_ai1a_tests_remain", exists("scripts/phase-seo-ai1a-tests.js"));
ok(
  "V_no_destructive_db_migration_added",
  !exists("scripts/migrate-drop-berlin.js") &&
    !exists("scripts/drop-berlin-tables.js") &&
    !/DROP TABLE\s+berlin_training/i.test(
      walkFiles("scripts", [".js"])
        .map((f) => fs.readFileSync(f, "utf8"))
        .join("\n")
    )
);
ok("W_erp_untouched", !exists("app/erp") && !exists("pages/api/erp"));

console.log(`\nRemove Berlin Chat: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

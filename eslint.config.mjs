import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Project-wide baseline: keep type/framework debt visible without blocking lint.
  {
    rules: {
      // Legacy CMS/API still use explicit any extensively; warn until Phase 12.1+ typing work.
      "@typescript-eslint/no-explicit-any": "warn",
      // Prefer <Link>, but mass migration of legacy <a> is deferred (behavior/layout risk).
      "@next/next/no-html-link-for-pages": "warn",
      // React 19 rule flags common mount/sync patterns; changing effects risks request loops.
      "react-hooks/set-state-in-effect": "warn",
    },
  },

  // Node CJS scripts — keep correctness rules; allow require() used by test/migration tooling.
  {
    files: ["scripts/**/*.{js,mjs,cjs}", ".tmp-migrate-seeds/**/*.{js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ERP is frozen this phase — demote residual React surface rules to warnings only.
  {
    files: ["app/erp/**/*.{js,jsx,ts,tsx}", "pages/api/erp/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/immutability": "warn",
    },
  },

  // IPTV player keeps Xtream credentials in a ref for stable non-reactive reads when
  // building episode URLs; converting to state would change render/update behavior.
  {
    files: ["app/player/page.tsx"],
    rules: {
      "react-hooks/refs": "warn",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local/temp artifacts (not source):
    "tmp-eslint-report.json",
    "tmp-*.json",
    ".tmp-*/**",
    "public/uploads/**",
  ]),
]);

export default eslintConfig;

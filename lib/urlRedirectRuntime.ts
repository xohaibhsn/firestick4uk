/**
 * Redirect Manager V1 public runtime — App Router miss-path only.
 * Cache lives here (NOT in Proxy). Fail-safe: errors → null → existing 404.
 */
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import {
  F4UK_ORIGINAL_PATH_HEADER,
  F4UK_ORIGINAL_SEARCH_HEADER,
} from "@/lib/urlRedirectHeaders";
import {
  isProtectedRedirectPath,
  normalizeInternalPathname,
  URL_REDIRECT_TYPE_V1,
  type UrlRedirectRow,
} from "@/lib/urlRedirects";
import { loadActiveRedirects } from "@/lib/urlRedirectsServer";

export const URL_REDIRECT_REGISTRY_CACHE_KEY = "url-redirect-registry-v1";
export const URL_REDIRECT_REGISTRY_TTL_SECONDS = 60;

type RegistryMap = Record<string, string>;

/**
 * Defense-in-depth: build a safe exact-path map from DB rows.
 * Skips invalid / protected / self / chained rules (log warning only).
 */
export function buildSafeRedirectRegistry(
  rows: readonly UrlRedirectRow[]
): RegistryMap {
  const candidates: Array<{ source: string; dest: string }> = [];

  for (const row of rows) {
    if (Number(row.active) !== 1) continue;
    if (Number(row.redirect_type) !== URL_REDIRECT_TYPE_V1) {
      console.warn("[url-redirect-runtime] skip non-308 row");
      continue;
    }

    const srcNorm = normalizeInternalPathname(row.source_path, "source");
    const destNorm = normalizeInternalPathname(row.destination_path, "destination");
    if (!srcNorm.ok || !destNorm.ok) {
      console.warn("[url-redirect-runtime] skip malformed path row");
      continue;
    }
    if (isProtectedRedirectPath(srcNorm.path) || isProtectedRedirectPath(destNorm.path)) {
      console.warn("[url-redirect-runtime] skip protected path row");
      continue;
    }
    if (srcNorm.path === destNorm.path) {
      console.warn("[url-redirect-runtime] skip self-redirect row");
      continue;
    }
    candidates.push({ source: srcNorm.path, dest: destNorm.path });
  }

  const sources = new Set(candidates.map((c) => c.source));
  const map: RegistryMap = {};
  for (const edge of candidates) {
    // One-hop V1: destination must not also be an active source (no chains).
    if (sources.has(edge.dest)) {
      console.warn("[url-redirect-runtime] skip chain-participating rule");
      continue;
    }
    // Last-write wins on duplicate source (should not happen with UNIQUE).
    map[edge.source] = edge.dest;
  }
  return map;
}

async function loadAndBuildRegistry(): Promise<RegistryMap> {
  const rows = await loadActiveRedirects();
  return buildSafeRedirectRegistry(rows);
}

const getCachedRedirectRegistry = unstable_cache(
  loadAndBuildRegistry,
  [URL_REDIRECT_REGISTRY_CACHE_KEY],
  { revalidate: URL_REDIRECT_REGISTRY_TTL_SECONDS }
);

/** Append original search onto an internal destination pathname (no double ?). */
export function appendOriginalSearch(destinationPath: string, search: string): string {
  const dest = String(destinationPath || "").trim() || "/";
  const q = String(search || "");
  if (!q || q === "?") return dest;
  const suffix = q.startsWith("?") ? q : `?${q}`;
  if (dest.includes("?")) return dest;
  return `${dest}${suffix}`;
}

/**
 * Miss-path resolver. Returns internal destination (+ query) or null.
 * Fail-safe: any unexpected error → null (caller keeps 404).
 */
export async function resolveManagedRedirectForCurrentRequest(): Promise<string | null> {
  try {
    const h = await headers();
    const rawPath = h.get(F4UK_ORIGINAL_PATH_HEADER);
    if (!rawPath) return null;

    const srcNorm = normalizeInternalPathname(rawPath, "source");
    if (!srcNorm.ok) return null;

    const registry = await getCachedRedirectRegistry();
    const dest = registry[srcNorm.path];
    if (!dest) return null;

    const search = h.get(F4UK_ORIGINAL_SEARCH_HEADER) || "";
    return appendOriginalSearch(dest, search);
  } catch (err) {
    console.error(
      "[url-redirect-runtime] resolve failed:",
      err instanceof Error ? err.message : "unknown"
    );
    return null;
  }
}

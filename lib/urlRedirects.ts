/**
 * Pure Redirect Manager V1 model — normalize / validate / graph safety.
 * No DB, no HTTP, no side effects.
 *
 * Case policy: stored paths are lowercase exact pathnames.
 * Type policy: 308 only (App Router permanentRedirect()).
 */

export const URL_REDIRECT_TYPE_V1 = 308 as const;
export type UrlRedirectTypeV1 = typeof URL_REDIRECT_TYPE_V1;

export type UrlRedirectRow = {
  id: number;
  source_path: string;
  destination_path: string;
  redirect_type: number;
  active: 0 | 1;
  created_at: string | Date | null;
  updated_at: string | Date | null;
};

export type UrlRedirectGraphRule = {
  id?: number | null;
  source_path: string;
  destination_path: string;
  active: 0 | 1;
};

export type PathNormalizeResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export type RedirectValidateResult =
  | {
      ok: true;
      source_path: string;
      destination_path: string;
      redirect_type: UrlRedirectTypeV1;
      active: 0 | 1;
    }
  | { ok: false; error: string; code?: "conflict" };

/** Exact code-owned migration sources — CMS must not create duplicate rules. */
export const CODE_OWNED_REDIRECT_SOURCES: readonly string[] = [
  "/products/world-cup-offer-3-years",
  "/products/3-years-season-pass",
  "/products/2-years-subscription",
] as const;

const PROTECTED_EXACT: ReadonlySet<string> = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/admin",
  ...CODE_OWNED_REDIRECT_SOURCES,
]);

const PROTECTED_PREFIXES: readonly string[] = ["/sidhu", "/api", "/_next"] as const;

const MAX_PATH_LEN = 512;

const UNSAFE_SCHEME_RE = /^(javascript|data|vbscript|file|blob):/i;

function hasProtectedPrefix(pathname: string): boolean {
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

export function isProtectedRedirectPath(pathname: string): boolean {
  const p = String(pathname || "");
  if (!p) return true;
  if (PROTECTED_EXACT.has(p)) return true;
  if (hasProtectedPrefix(p)) return true;
  return false;
}

/**
 * Normalize a user-supplied internal pathname candidate.
 * Rejects absolute URLs, queries, fragments, protocols, and root `/`.
 */
export function normalizeInternalPathname(input: unknown, kind: "source" | "destination"): PathNormalizeResult {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { ok: false, error: `${kind} path is required` };
  }

  if (/\s/.test(raw)) {
    return { ok: false, error: `${kind} path must not contain whitespace` };
  }

  if (UNSAFE_SCHEME_RE.test(raw)) {
    return { ok: false, error: `${kind} path uses an unsafe scheme` };
  }

  if (raw.includes("://") || raw.startsWith("//")) {
    return { ok: false, error: `${kind} must be an internal pathname only (no URL/host)` };
  }

  if (raw.includes("?") || raw.includes("#")) {
    return { ok: false, error: `${kind} must not include query string or fragment` };
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return { ok: false, error: `${kind} path uses an unsupported scheme` };
  }

  let path = raw;
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  // Collapse duplicate slashes (keep leading single slash).
  path = path.replace(/\/{2,}/g, "/");

  // Strip trailing slash except we never allow bare root as a managed rule.
  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "");
  }

  path = path.toLowerCase();

  if (!path || path === "/") {
    return { ok: false, error: kind === "source" ? "Homepage (/) cannot be a redirect source" : "Destination cannot be /" };
  }

  if (path.length > MAX_PATH_LEN) {
    return { ok: false, error: `${kind} path is too long (max ${MAX_PATH_LEN})` };
  }

  // Path segments: allow a-z 0-9 _ - . / only after lowercasing.
  if (!/^\/[a-z0-9/_.\-]+$/.test(path)) {
    return { ok: false, error: `${kind} path contains invalid characters` };
  }

  return { ok: true, path };
}

export function normalizeRedirectType(input: unknown): { ok: true; type: UrlRedirectTypeV1 } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") {
    return { ok: true, type: URL_REDIRECT_TYPE_V1 };
  }
  const n = Number(input);
  if (!Number.isFinite(n) || n !== URL_REDIRECT_TYPE_V1) {
    return { ok: false, error: "Redirect type must be 308 (Permanent) in V1" };
  }
  return { ok: true, type: URL_REDIRECT_TYPE_V1 };
}

export function parseRedirectActive(value: unknown, fallback: 0 | 1 = 1): 0 | 1 {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

/**
 * One-hop V1 graph: among active rules, no destination may also be a source.
 * That rejects chains and cycles.
 */
export function validateActiveRedirectGraph(
  existing: readonly UrlRedirectGraphRule[],
  proposed: UrlRedirectGraphRule
): { ok: true } | { ok: false; error: string } {
  if (proposed.source_path === proposed.destination_path) {
    return { ok: false, error: "Source and destination cannot be the same" };
  }

  const proposedId = proposed.id != null && Number(proposed.id) > 0 ? Number(proposed.id) : null;

  // Duplicate source among any rows (active or inactive) — caller may also rely on UNIQUE.
  for (const row of existing) {
    const rowId = row.id != null && Number(row.id) > 0 ? Number(row.id) : null;
    if (proposedId != null && rowId === proposedId) continue;
    if (row.source_path === proposed.source_path) {
      return { ok: false, error: "A redirect with this source path already exists" };
    }
  }

  if (proposed.active !== 1) {
    return { ok: true };
  }

  const activeEdges: Array<{ id: number | null; source: string; dest: string }> = [];
  for (const row of existing) {
    const rowId = row.id != null && Number(row.id) > 0 ? Number(row.id) : null;
    if (proposedId != null && rowId === proposedId) continue;
    if (Number(row.active) !== 1) continue;
    activeEdges.push({
      id: rowId,
      source: row.source_path,
      dest: row.destination_path,
    });
  }
  activeEdges.push({
    id: proposedId,
    source: proposed.source_path,
    dest: proposed.destination_path,
  });

  const sources = new Set(activeEdges.map((e) => e.source));
  for (const edge of activeEdges) {
    if (sources.has(edge.dest)) {
      return {
        ok: false,
        error:
          "Redirect chains and loops are not allowed in V1. Destination must not be another active redirect source.",
      };
    }
  }

  // Extra cycle walk (defensive; one-hop rule above already blocks cycles).
  const next = new Map(activeEdges.map((e) => [e.source, e.dest]));
  for (const start of next.keys()) {
    const seen = new Set<string>();
    let cur: string | undefined = start;
    let hops = 0;
    while (cur && hops < 32) {
      if (seen.has(cur)) {
        return { ok: false, error: "Redirect loop detected" };
      }
      seen.add(cur);
      cur = next.get(cur);
      hops += 1;
    }
  }

  return { ok: true };
}

export function validateRedirectFields(input: {
  source_path: unknown;
  destination_path: unknown;
  redirect_type?: unknown;
  active?: unknown;
  existing?: readonly UrlRedirectGraphRule[];
  id?: number | null;
}): RedirectValidateResult {
  const source = normalizeInternalPathname(input.source_path, "source");
  if (!source.ok) return source;

  const dest = normalizeInternalPathname(input.destination_path, "destination");
  if (!dest.ok) return dest;

  if (isProtectedRedirectPath(source.path)) {
    return { ok: false, error: "This source path is protected and cannot be managed in Redirect Manager" };
  }
  if (isProtectedRedirectPath(dest.path)) {
    return { ok: false, error: "This destination path is protected and cannot be used" };
  }

  const type = normalizeRedirectType(input.redirect_type);
  if (!type.ok) return type;

  const active = parseRedirectActive(input.active, 1);

  const graph = validateActiveRedirectGraph(input.existing || [], {
    id: input.id ?? null,
    source_path: source.path,
    destination_path: dest.path,
    active,
  });
  if (!graph.ok) {
    return { ok: false, error: graph.error, code: "conflict" };
  }

  return {
    ok: true,
    source_path: source.path,
    destination_path: dest.path,
    redirect_type: type.type,
    active,
  };
}

export function safeRedirectRow(row: any): UrlRedirectRow {
  return {
    id: Number(row.id),
    source_path: String(row.source_path || ""),
    destination_path: String(row.destination_path || ""),
    redirect_type: Number(row.redirect_type) || URL_REDIRECT_TYPE_V1,
    active: Number(row.active) === 1 ? 1 : 0,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

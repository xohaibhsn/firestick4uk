/**
 * F4UK-MULTI-106 — client-safe helpers for CMS revision compare / per-field history.
 * No DB, no server imports. Read-only: never writes revisions or content.
 */
import { valuesEqual } from "./textDiff";

/**
 * Fields shown in product compare, in display order.
 * Mirrors PRODUCT_SNAPSHOT_FIELDS in lib/contentRevisions.ts (server-only module) minus
 * `id` and `product_version` (identity / concurrency counter, not editable content).
 * scripts/phase-multi-106-tests.js asserts this stays in sync with the server list.
 */
export const PRODUCT_COMPARE_FIELDS = [
  "name",
  "slug",
  "price",
  "category",
  "badge",
  "image",
  "stock",
  "active",
  "description",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "og_image",
  "lifecycle_mode",
  "shop_listed",
  "season_name",
  "season_starts_at",
  "season_ends_at",
  "season_paused",
  "season_show_countdown",
  "season_ended_notice",
  "available_offers_heading",
  "season_available_ids",
  "season_upcoming_ids",
] as const;

export const BLOG_COMPARE_FIELDS = [
  "title",
  "slug",
  "excerpt",
  "content",
  "category",
  "emoji",
  "badge",
  "badgeText",
  "featured_image",
  "meta_title",
  "meta_description",
  "focus_keyword",
  "status",
  "featured",
  "canonical_url",
  "faqs",
  "active",
] as const;

export const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  slug: "URL slug",
  price: "Price",
  category: "Category",
  badge: "Badge",
  image: "Image",
  stock: "Stock / type",
  active: "Visible (active)",
  description: "Description",
  short_description: "Short description",
  full_description: "Full description",
  features: "Features",
  seo_title: "SEO title",
  meta_description: "Meta description",
  focus_keyword: "Focus keyword",
  og_image: "Social / OG image",
  lifecycle_mode: "Lifecycle mode",
  shop_listed: "Shop listed",
  season_name: "Season name",
  season_starts_at: "Season starts",
  season_ends_at: "Season ends",
  season_paused: "Season paused",
  season_show_countdown: "Season countdown",
  season_ended_notice: "Season ended notice",
  available_offers_heading: "Available offers heading",
  season_available_ids: "Season available offers",
  season_upcoming_ids: "Season upcoming offers",
  title: "Title",
  excerpt: "Excerpt",
  content: "Content",
  emoji: "Emoji",
  badgeText: "Badge text",
  featured_image: "Featured image",
  meta_title: "Meta title",
  status: "Status",
  featured: "Featured",
  canonical_url: "Canonical URL",
  faqs: "FAQs",
};

/** Fields whose values are HTML (rendered via CmsBody in "Rendered" mode). */
export const HTML_FIELDS = new Set<string>([
  "description",
  "short_description",
  "full_description",
  "content",
  "excerpt",
  "season_ended_notice",
]);

/**
 * Product fields that the restore endpoint does NOT apply from a snapshot
 * (lifecycle / listing / seasonal controls are preserved on restore).
 */
export const PRODUCT_FIELDS_NOT_RESTORED = new Set<string>([
  "active",
  "shop_listed",
  "lifecycle_mode",
  "season_name",
  "season_starts_at",
  "season_ends_at",
  "season_paused",
  "season_show_countdown",
  "season_ended_notice",
  "available_offers_heading",
  "season_available_ids",
  "season_upcoming_ids",
  "product_version",
  "id",
]);

export function isSiteContentEntity(entityType: string): boolean {
  return (
    entityType === "site_content" ||
    entityType === "site_settings" ||
    entityType === "site_content_batch"
  );
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

/** Display text for any snapshot value. */
export function valueToText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(String(s || ""));
}

function normalizeForCompare(field: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  const text = valueToText(v);
  if (field === "price") {
    const n = Number(String(text).replace(/£/g, "").trim());
    if (text.trim() !== "" && Number.isFinite(n)) return String(n);
  }
  return text;
}

export function fieldValuesEqual(field: string, a: unknown, b: unknown): boolean {
  return valuesEqual(normalizeForCompare(field, a), normalizeForCompare(field, b));
}

export type CompareRow = {
  field: string;
  label: string;
  /** Value in the revision (left). */
  before: string;
  /** Value in the current entity (right). */
  after: string;
  changed: boolean;
  html: boolean;
  /** False when the revision snapshot never recorded this field (older revision). */
  recorded: boolean;
};

function plainObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Normalise any revision/current snapshot to a flat field → value map. */
export function snapshotValues(entityType: string, snapshot: unknown): Record<string, unknown> {
  const snap = plainObject(snapshot);
  if (!snap) return {};
  if (isSiteContentEntity(entityType)) {
    const values = plainObject(snap.values);
    if (values) return { ...values };
    if (snap.content_key != null) {
      return { [String(snap.content_key)]: snap.content_value ?? "" };
    }
    return {};
  }
  return { ...snap };
}

export function snapshotFieldValue(entityType: string, snapshot: unknown, field: string): unknown {
  return snapshotValues(entityType, snapshot)[field];
}

/** Keys / fields a revision snapshot carries (for compare + per-field lookups). */
export function snapshotFieldNames(entityType: string, snapshot: unknown): string[] {
  const values = snapshotValues(entityType, snapshot);
  if (entityType === "product") {
    return PRODUCT_COMPARE_FIELDS.filter((f) => f in values);
  }
  if (entityType === "blog") {
    return BLOG_COMPARE_FIELDS.filter((f) => f in values);
  }
  return Object.keys(values);
}

export function buildCompareRows(opts: {
  entityType: string;
  revisionSnapshot: unknown;
  currentSnapshot: unknown;
  focusField?: string | null;
}): CompareRow[] {
  const { entityType, revisionSnapshot, currentSnapshot, focusField } = opts;
  const rev = snapshotValues(entityType, revisionSnapshot);
  const cur = snapshotValues(entityType, currentSnapshot);

  let fields: string[];
  if (entityType === "product") {
    fields = PRODUCT_COMPARE_FIELDS.filter((f) => f in rev || f in cur);
  } else if (entityType === "blog") {
    fields = BLOG_COMPARE_FIELDS.filter((f) => f in rev || f in cur);
  } else {
    fields = Object.keys(rev);
  }
  if (focusField && !fields.includes(focusField) && (focusField in rev || focusField in cur)) {
    fields = [focusField, ...fields];
  }
  if (focusField && fields.includes(focusField)) {
    fields = [focusField, ...fields.filter((f) => f !== focusField)];
  }

  return fields.map((field) => {
    const recorded = field in rev;
    const before = valueToText(rev[field]);
    const after = valueToText(cur[field]);
    return {
      field,
      label: fieldLabel(field),
      before,
      after,
      recorded,
      changed: recorded && !fieldValuesEqual(field, rev[field], cur[field]),
      html: HTML_FIELDS.has(field) || looksLikeHtml(before) || looksLikeHtml(after),
    };
  });
}

export type CurrentFetchResult =
  | {
      ok: true;
      /** Snapshot-shaped current state (site content: { values }, product/blog: row). */
      snapshot: Record<string, unknown>;
      /** Product only — product_version from the authorized current read (never the snapshot). */
      version: number | null;
    }
  | { ok: false; error: string; status?: number };

type FetchLike = (input: string, init?: any) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

/**
 * Authorized READ of the current entity for the "Current" side of compare.
 * Uses existing GET endpoints only:
 *  - product: GET /api/admin-products (find by id)
 *  - blog: GET /api/blog?id=
 *  - site_content*: GET /api/site-content?page=all&scope=admin (values for the snapshot keys)
 */
export async function fetchCurrentForRevision(
  entityType: string,
  entityId: string,
  revisionSnapshot: unknown,
  fetchImpl?: FetchLike
): Promise<CurrentFetchResult> {
  const doFetch: FetchLike | undefined =
    fetchImpl || (typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined);
  if (!doFetch) return { ok: false, error: "Fetch unavailable" };
  const init = { credentials: "include", cache: "no-store" };
  try {
    if (entityType === "product") {
      const r = await doFetch("/api/admin-products", init);
      if (r.status === 401) return { ok: false, error: "Session expired", status: 401 };
      if (r.status === 403) return { ok: false, error: "Permission denied", status: 403 };
      if (!r.ok) return { ok: false, error: "Failed to load current product", status: r.status };
      const list = await r.json().catch(() => null);
      const row = Array.isArray(list)
        ? list.find((p: any) => String(p?.id) === String(entityId))
        : null;
      if (!row) return { ok: false, error: "Product no longer exists", status: 404 };
      const v =
        row.product_version != null && Number.isFinite(Number(row.product_version))
          ? Number(row.product_version)
          : null;
      return { ok: true, snapshot: row, version: v };
    }
    if (entityType === "blog") {
      const r = await doFetch(`/api/blog?id=${encodeURIComponent(entityId)}`, init);
      if (r.status === 401) return { ok: false, error: "Session expired", status: 401 };
      if (r.status === 403) return { ok: false, error: "Permission denied", status: 403 };
      if (!r.ok) return { ok: false, error: "Failed to load current post", status: r.status };
      const row = await r.json().catch(() => null);
      if (!row || typeof row !== "object") {
        return { ok: false, error: "Blog post no longer exists", status: 404 };
      }
      return { ok: true, snapshot: row as Record<string, unknown>, version: null };
    }
    if (isSiteContentEntity(entityType)) {
      const r = await doFetch("/api/site-content?page=all&scope=admin", init);
      if (r.status === 401) return { ok: false, error: "Session expired", status: 401 };
      if (r.status === 403) return { ok: false, error: "Permission denied", status: 403 };
      if (!r.ok) return { ok: false, error: "Failed to load current content", status: r.status };
      const map = await r.json().catch(() => null);
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        return { ok: false, error: "Unexpected content response", status: 500 };
      }
      const keys = Object.keys(snapshotValues(entityType, revisionSnapshot));
      const values: Record<string, string> = {};
      for (const k of keys) values[k] = typeof map[k] === "string" ? map[k] : "";
      return { ok: true, snapshot: { values }, version: null };
    }
    return { ok: false, error: "Current version is not available for this entity type" };
  } catch {
    return { ok: false, error: "Failed to load current version" };
  }
}

/** Query string for the per-field history list (existing GET /api/admin-revisions + `field`). */
export function buildFieldHistoryQuery(opts: {
  entityType?: string;
  entityId?: string | number;
  field: string;
  page?: number;
  limit?: number;
}): string {
  const p = new URLSearchParams();
  p.set("page", String(opts.page && opts.page > 0 ? opts.page : 1));
  p.set("limit", String(opts.limit && opts.limit > 0 ? opts.limit : 10));
  if (opts.entityType) p.set("entity_type", opts.entityType);
  if (opts.entityId != null && String(opts.entityId) !== "") p.set("entity_id", String(opts.entityId));
  p.set("field", opts.field);
  return p.toString();
}

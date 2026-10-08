/**
 * AB-2 — Shared SERVER-ONLY blog persistence + autonomous-safe adapters.
 *
 * Manual CMS POST/PUT and future autonomous pipeline share one write lifecycle.
 * No HTTP routes for autonomous adapters. No providers. No DB schema changes.
 */

import pool from "@/lib/db";
import type { AdminIdentity } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordContentRevision, snapshotBlog } from "@/lib/contentRevisions";
import { invalidateSitemapCache } from "@/lib/hostingerResourceInvalidation";
import {
  BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE,
  normalizeBlogCanonicalInput,
  normalizeBlogSlug,
  resolveBlogCanonicalForPut,
} from "@/lib/blogSeoSafety";
import {
  runPostSaveSeoGuard,
  shouldRunPostSaveSeoGuard,
  type SeoGuardResult,
} from "@/lib/postSaveSeoGuard";
import {
  evaluateAutonomousBlogPrePublish,
  type BlogPrePublishEditorialPolicy,
  type BlogPrePublishQaResult,
  type ExistingBlogPostInventoryRow,
} from "@/lib/blogPrePublishQa";

export type BlogWriteMode = "draft" | "publish";
export type BlogWriteSource = "manual_cms" | "autonomous";

export type BlogPostInput = {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  content?: unknown;
  category?: unknown;
  emoji?: unknown;
  badge?: unknown;
  badgeText?: unknown;
  featured_image?: unknown;
  meta_title?: unknown;
  meta_description?: unknown;
  focus_keyword?: unknown;
  featured?: unknown;
  canonical_url?: unknown;
  faqs?: unknown;
};

export type BlogPostPatch = BlogPostInput & {
  status?: unknown;
};

export class BlogPersistenceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BlogPersistenceError";
    this.status = status;
    this.code = code;
  }
}

/** Write-path slug normalization — single shared algorithm for create/update. */
export function normalizeBlogWriteSlug(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeBlogFaqs(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined ? "" : String(a);
  const nb = b === null || b === undefined ? "" : String(b);
  return na === nb;
}

export function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function modeToDbStatus(mode: BlogWriteMode): "draft" | "published" {
  return mode === "publish" ? "published" : "draft";
}

/**
 * Require explicit create status. No default-to-published.
 * Accepts only exact "draft" | "published".
 */
export function requireExplicitBlogStatus(value: unknown): BlogWriteMode {
  if (value === undefined || value === null || value === "") {
    throw new BlogPersistenceError(
      400,
      "invalid_status",
      "Blog status must be explicitly 'draft' or 'published'."
    );
  }
  if (value === "draft") return "draft";
  if (value === "published") return "publish";
  throw new BlogPersistenceError(
    400,
    "invalid_status",
    "Blog status must be explicitly 'draft' or 'published'."
  );
}

/** When status is supplied on update, it must be exact draft|published. */
export function requireSuppliedBlogStatus(value: unknown): BlogWriteMode {
  return requireExplicitBlogStatus(value);
}

function parseFaqsForQa(
  value: unknown
): Array<{ question: string; answer: string }> | undefined {
  if (value == null || value === "") return undefined;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { question: "", answer: "" };
    }
    const row = entry as Record<string, unknown>;
    return {
      question: typeof row.question === "string" ? row.question : "",
      answer: typeof row.answer === "string" ? row.answer : "",
    };
  });
}

export type BlogPersistenceDeps = {
  query: (sql: string, params?: unknown[]) => Promise<[any, any]>;
  getConnection: () => Promise<{
    beginTransaction: () => Promise<void>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    release: () => void;
    query: (sql: string, params?: unknown[]) => Promise<[any, any]>;
  }>;
  recordAdminAudit: typeof recordAdminAudit;
  recordContentRevision: typeof recordContentRevision;
  snapshotBlog: typeof snapshotBlog;
  invalidateSitemapCache: () => void;
  runPostSaveSeoGuard: typeof runPostSaveSeoGuard;
  shouldRunPostSaveSeoGuard: typeof shouldRunPostSaveSeoGuard;
  evaluateAutonomousBlogPrePublish: typeof evaluateAutonomousBlogPrePublish;
};

function defaultDeps(): BlogPersistenceDeps {
  return {
    query: (sql, params) => pool.query(sql, params as any) as Promise<[any, any]>,
    getConnection: () => pool.getConnection() as any,
    recordAdminAudit,
    recordContentRevision,
    snapshotBlog,
    invalidateSitemapCache,
    runPostSaveSeoGuard,
    shouldRunPostSaveSeoGuard,
    evaluateAutonomousBlogPrePublish,
  };
}

type QueryFn = (sql: string, params?: unknown[]) => Promise<[any, any]>;

async function assertSlugAvailable(
  queryFn: QueryFn,
  slug: string,
  excludeId?: number
): Promise<void> {
  if (!slug) return;
  if (excludeId != null && Number.isFinite(excludeId)) {
    const [rows]: any = await queryFn(
      "SELECT id FROM blog_posts WHERE slug = ? AND id <> ? LIMIT 1",
      [slug, excludeId]
    );
    if (Array.isArray(rows) && rows[0]) {
      throw new BlogPersistenceError(409, "slug_conflict", "Blog slug already exists.");
    }
    return;
  }
  const [rows]: any = await queryFn(
    "SELECT id FROM blog_posts WHERE slug = ? LIMIT 1",
    [slug]
  );
  if (Array.isArray(rows) && rows[0]) {
    throw new BlogPersistenceError(409, "slug_conflict", "Blog slug already exists.");
  }
}

const LOCKED_BLOG_SELECT =
  "SELECT * FROM blog_posts WHERE id = ? LIMIT 1 FOR UPDATE";

const INVENTORY_SELECT =
  "SELECT id, title, slug, status, active FROM blog_posts ORDER BY id ASC LIMIT 5000";

function skippedSeoGuard(
  id: number,
  skipReason?: "no_seo_field_change" | "noop_update"
): SeoGuardResult {
  return {
    status: "skipped" as const,
    entity_type: "blog" as const,
    entity_id: String(id),
    operation: "update" as const,
    issue_count: 0,
    needs_attention: 0,
    review: 0,
    issues: [],
    memory_synced: false,
    skip_reason: skipReason || "noop_update",
  };
}

function buildNextBlogState(args: {
  current: Record<string, unknown>;
  patch: Record<string, unknown>;
  mode?: BlogWriteMode;
  statusOnly?: boolean;
}): {
  next: Record<string, unknown>;
  changedFields: string[];
  finalSlug: string;
} {
  const { current, patch } = args;
  const oldSlug = normalizeBlogSlug(current.slug as string);
  let finalSlug = oldSlug;
  if (!args.statusOnly && hasOwn(patch, "slug")) {
    finalSlug = normalizeBlogWriteSlug(patch.slug) || oldSlug;
  } else if (!args.statusOnly) {
    finalSlug = normalizeBlogWriteSlug(current.slug) || oldSlug;
  }
  if (!finalSlug) {
    throw new BlogPersistenceError(400, "invalid_request", "Slug cannot be empty");
  }

  const currentWasPublishedPublic =
    String(current.status || "") === "published" && Number(current.active) === 1;
  if (currentWasPublishedPublic && finalSlug !== oldSlug) {
    throw new BlogPersistenceError(
      409,
      "published_slug_protected",
      BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE
    );
  }

  let nextStatus = String(current.status || "");
  if (args.mode !== undefined) {
    if (args.mode !== "draft" && args.mode !== "publish") {
      throw new BlogPersistenceError(
        400,
        "invalid_status",
        "Blog status must be explicitly 'draft' or 'published'."
      );
    }
    nextStatus = modeToDbStatus(args.mode);
  }

  const bodyHasCanonical = !args.statusOnly && hasOwn(patch, "canonical_url");
  const slugChanged = finalSlug !== oldSlug;
  const canon = args.statusOnly
    ? {
        ok: true as const,
        canonical: String(current.canonical_url || ""),
      }
    : resolveBlogCanonicalForPut({
        bodyHasCanonical,
        suppliedCanonical: bodyHasCanonical
          ? String(patch.canonical_url ?? "")
          : undefined,
        currentCanonical: current.canonical_url as string | null | undefined,
        oldSlug,
        finalSlug,
        slugChanged,
      });
  if (!canon.ok) {
    throw new BlogPersistenceError(400, "invalid_request", canon.error);
  }

  const next = args.statusOnly
    ? {
        title: current.title,
        slug: finalSlug,
        excerpt: current.excerpt ?? "",
        content: current.content ?? "",
        category: current.category ?? "Guides",
        emoji: current.emoji ?? "📝",
        badge: current.badge ?? "guide",
        badgeText: current.badgeText ?? "Guide",
        featured_image: current.featured_image ?? "",
        meta_title: current.meta_title ?? "",
        meta_description: current.meta_description ?? "",
        focus_keyword: current.focus_keyword ?? "",
        status: nextStatus,
        featured: current.featured ? 1 : 0,
        canonical_url: canon.canonical,
        faqs: normalizeBlogFaqs(current.faqs),
      }
    : {
        title: patch.title ?? current.title,
        slug: finalSlug,
        excerpt: patch.excerpt ?? current.excerpt ?? "",
        content: patch.content ?? current.content ?? "",
        category: patch.category ?? current.category ?? "Guides",
        emoji: patch.emoji ?? current.emoji ?? "📝",
        badge: patch.badge ?? current.badge ?? "guide",
        badgeText: patch.badgeText ?? current.badgeText ?? "Guide",
        featured_image: patch.featured_image ?? current.featured_image ?? "",
        meta_title: patch.meta_title ?? current.meta_title ?? "",
        meta_description: patch.meta_description ?? current.meta_description ?? "",
        focus_keyword: patch.focus_keyword ?? current.focus_keyword ?? "",
        status: nextStatus,
        featured:
          patch.featured != null
            ? patch.featured
              ? 1
              : 0
            : current.featured
              ? 1
              : 0,
        canonical_url: canon.canonical,
        faqs: normalizeBlogFaqs(
          patch.faqs !== undefined ? patch.faqs : current.faqs
        ),
      };

  const changedFields: string[] = [];
  const track = (key: string, a: unknown, b: unknown) => {
    if (!valuesEqual(a, b)) changedFields.push(key);
  };
  track("title", next.title, current.title);
  track("slug", next.slug, current.slug);
  track("excerpt", next.excerpt, current.excerpt);
  track("content", next.content, current.content);
  track("category", next.category, current.category);
  track("emoji", next.emoji, current.emoji);
  track("badge", next.badge, current.badge);
  track("badgeText", next.badgeText, current.badgeText);
  track("featured_image", next.featured_image, current.featured_image);
  track("meta_title", next.meta_title, current.meta_title);
  track("meta_description", next.meta_description, current.meta_description);
  track("focus_keyword", next.focus_keyword, current.focus_keyword);
  track("status", next.status, current.status);
  track("featured", next.featured, current.featured);
  track("canonical_url", next.canonical_url, current.canonical_url);
  track(
    "faqs",
    next.faqs,
    typeof current.faqs === "string" ? current.faqs : normalizeBlogFaqs(current.faqs)
  );

  return { next, changedFields, finalSlug };
}

function buildQaCandidateFromLockedRow(
  draft: Record<string, unknown>,
  id: number,
  evidenceState: "ready" | "missing" | "stale",
  mediaState: { featuredImageReady: boolean }
) {
  return {
    id,
    title: String(draft.title || ""),
    slug: String(draft.slug || ""),
    excerpt: String(draft.excerpt || ""),
    content: String(draft.content || ""),
    featured_image: String(draft.featured_image || ""),
    meta_title: String(draft.meta_title || ""),
    meta_description: String(draft.meta_description || ""),
    focus_keyword:
      draft.focus_keyword != null ? String(draft.focus_keyword) : undefined,
    canonical_url:
      draft.canonical_url === null || draft.canonical_url === undefined
        ? null
        : String(draft.canonical_url),
    faqs: parseFaqsForQa(draft.faqs),
    publicationIntent: "publish" as const,
    evidenceState,
    mediaState: {
      featuredImageReady: !!mediaState?.featuredImageReady,
    },
  };
}

async function writeRevisionAndUpdate(args: {
  deps: BlogPersistenceDeps;
  conn: Awaited<ReturnType<BlogPersistenceDeps["getConnection"]>>;
  actor: AdminIdentity;
  id: number;
  current: Record<string, unknown>;
  next: Record<string, unknown>;
  changedFields: string[];
}): Promise<void> {
  await args.deps.recordContentRevision(
    {
      entityType: "blog",
      entityId: args.id,
      entityLabel: String(args.current.title || ""),
      revisionAction: "update",
      snapshot: args.deps.snapshotBlog(args.current),
      changedFields: args.changedFields,
      actor: args.actor,
    },
    args.conn as any
  );
  await args.conn.query(
    "UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category=?, emoji=?, badge=?, badgeText=?, featured_image=?, meta_title=?, meta_description=?, focus_keyword=?, status=?, featured=?, canonical_url=?, faqs=? WHERE id=?",
    [
      args.next.title,
      args.next.slug || "",
      args.next.excerpt,
      args.next.content,
      args.next.category,
      args.next.emoji,
      args.next.badge,
      args.next.badgeText,
      args.next.featured_image,
      args.next.meta_title,
      args.next.meta_description,
      args.next.focus_keyword,
      args.next.status,
      args.next.featured,
      args.next.canonical_url,
      args.next.faqs,
      args.id,
    ]
  );
}

export type CreateBlogPostResult = {
  success: true;
  id: number;
  seo_guard: SeoGuardResult;
};

export async function createBlogPost(args: {
  actor: AdminIdentity;
  input: BlogPostInput;
  mode: BlogWriteMode;
  source: BlogWriteSource;
  ip?: string | null;
  deps?: Partial<BlogPersistenceDeps>;
}): Promise<CreateBlogPostResult> {
  const deps = { ...defaultDeps(), ...args.deps };
  const mode = args.mode;
  if (mode !== "draft" && mode !== "publish") {
    throw new BlogPersistenceError(
      400,
      "invalid_status",
      "Blog status must be explicitly 'draft' or 'published'."
    );
  }

  const title = String(args.input.title || "").trim();
  const finalSlug =
    normalizeBlogWriteSlug(args.input.slug) || normalizeBlogWriteSlug(args.input.title);
  if (!title || !finalSlug) {
    throw new BlogPersistenceError(400, "invalid_request", "Title and slug are required");
  }

  const canon = normalizeBlogCanonicalInput(
    args.input.canonical_url as string | null | undefined,
    finalSlug
  );
  if (!canon.ok) {
    throw new BlogPersistenceError(400, "invalid_request", canon.error);
  }

  await assertSlugAvailable(deps.query, finalSlug);

  const status = modeToDbStatus(mode);
  const faqsJson = args.input.faqs ? normalizeBlogFaqs(args.input.faqs) : null;

  const [result]: any = await deps.query(
    "INSERT INTO blog_posts (title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    [
      title,
      finalSlug,
      args.input.excerpt || "",
      args.input.content || "",
      args.input.category || "Guides",
      args.input.emoji || "📝",
      args.input.badge || "guide",
      args.input.badgeText || "Guide",
      args.input.featured_image || "",
      args.input.meta_title || "",
      args.input.meta_description || "",
      args.input.focus_keyword || "",
      status,
      args.input.featured ? 1 : 0,
      canon.canonical,
      faqsJson,
    ]
  );

  const insertId = Number(result.insertId);
  await deps.recordAdminAudit({
    actor: args.actor,
    action: "blog.created",
    entityType: "blog",
    entityId: insertId,
    summary: `Created blog post ${title || insertId}`,
    metadata: { source: args.source, status },
    ip: args.ip,
  });
  deps.invalidateSitemapCache();
  const seo_guard = await deps.runPostSaveSeoGuard({
    entityType: "blog",
    entityId: insertId,
    operation: "create",
  });
  return { success: true, id: insertId, seo_guard };
}

export type UpdateBlogPostResult = {
  success: true;
  changed_fields: string[];
  seo_guard: SeoGuardResult;
};

export async function updateBlogPost(args: {
  actor: AdminIdentity;
  id: number;
  patch: BlogPostPatch;
  /** When omitted, current DB status is preserved. */
  mode?: BlogWriteMode;
  source: BlogWriteSource;
  ip?: string | null;
  /** When true, ignore all patch fields except the forced status transition. */
  statusOnly?: boolean;
  /** Enforce locked-row status at the authoritative mutation point. */
  requiredCurrentStatus?: "draft" | "published";
  deps?: Partial<BlogPersistenceDeps>;
}): Promise<UpdateBlogPostResult> {
  const deps = { ...defaultDeps(), ...args.deps };
  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BlogPersistenceError(400, "invalid_request", "Valid blog id is required");
  }

  const patch = (args.patch || {}) as Record<string, unknown>;
  const conn = await deps.getConnection();
  let nextTitle: unknown = id;
  let changedFields: string[] = [];
  let wrote = false;

  try {
    await conn.beginTransaction();
    const [existingRows]: any = await conn.query(LOCKED_BLOG_SELECT, [id]);
    const current =
      Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
    if (!current) {
      throw new BlogPersistenceError(404, "entity_not_found", "Blog post not found");
    }

    if (
      args.requiredCurrentStatus &&
      String(current.status || "") !== args.requiredCurrentStatus
    ) {
      throw new BlogPersistenceError(
        409,
        "not_draft",
        args.requiredCurrentStatus === "draft"
          ? "Autonomous draft update requires an existing draft BlogPost."
          : `BlogPost must currently be ${args.requiredCurrentStatus}.`
      );
    }

    const built = buildNextBlogState({
      current,
      patch,
      mode: args.mode,
      statusOnly: args.statusOnly,
    });
    const oldSlug = normalizeBlogSlug(current.slug);
    if (built.finalSlug !== oldSlug) {
      await assertSlugAvailable(conn.query.bind(conn), built.finalSlug, id);
    }

    if (built.changedFields.length === 0) {
      await conn.commit();
      const skip = deps.shouldRunPostSaveSeoGuard({
        entityType: "blog",
        operation: "update",
        changedFields: [],
      });
      return {
        success: true,
        changed_fields: [],
        seo_guard: skippedSeoGuard(id, skip.skip_reason || "noop_update"),
      };
    }

    await writeRevisionAndUpdate({
      deps,
      conn,
      actor: args.actor,
      id,
      current,
      next: built.next,
      changedFields: built.changedFields,
    });
    await conn.commit();
    wrote = true;
    nextTitle = built.next.title;
    changedFields = built.changedFields;
  } catch (txErr: any) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (txErr instanceof BlogPersistenceError) throw txErr;
    if (txErr?.code === "REVISION_TOO_LARGE") {
      throw new BlogPersistenceError(400, "invalid_request", txErr.message);
    }
    throw txErr;
  } finally {
    conn.release();
  }

  if (!wrote) {
    // unreachable: no-op returns inside try
    return {
      success: true,
      changed_fields: [],
      seo_guard: skippedSeoGuard(id, "noop_update"),
    };
  }

  await deps.recordAdminAudit({
    actor: args.actor,
    action: "blog.updated",
    entityType: "blog",
    entityId: id,
    summary: `Updated blog post ${nextTitle || id}`,
    metadata: { changed_fields: changedFields, source: args.source },
    ip: args.ip,
  });
  deps.invalidateSitemapCache();
  const seo_guard = await deps.runPostSaveSeoGuard({
    entityType: "blog",
    entityId: id,
    operation: "update",
    changedFields,
  });
  return { success: true, changed_fields: changedFields, seo_guard };
}

/** Always creates status=draft. Caller cannot override to published. */
export async function createAutonomousBlogDraft(args: {
  actor: AdminIdentity;
  input: BlogPostInput;
  ip?: string | null;
  deps?: Partial<BlogPersistenceDeps>;
}): Promise<CreateBlogPostResult> {
  return createBlogPost({
    actor: args.actor,
    input: args.input,
    mode: "draft",
    source: "autonomous",
    ip: args.ip,
    deps: args.deps,
  });
}

/**
 * Updates an existing draft only; remains draft.
 * Draft requirement is enforced on the locked authoritative row.
 */
export async function updateAutonomousBlogDraft(args: {
  actor: AdminIdentity;
  id: number;
  patch: BlogPostInput;
  ip?: string | null;
  deps?: Partial<BlogPersistenceDeps>;
}): Promise<UpdateBlogPostResult> {
  return updateBlogPost({
    actor: args.actor,
    id: args.id,
    patch: args.patch,
    mode: "draft",
    source: "autonomous",
    ip: args.ip,
    requiredCurrentStatus: "draft",
    deps: args.deps,
  });
}

export type AutonomousPublishResult =
  | {
      outcome: "PUBLISHED";
      id: number;
      qa: BlogPrePublishQaResult;
      changed_fields: string[];
      seo_guard: SeoGuardResult;
    }
  | {
      outcome: "HELD";
      id: number;
      qa: BlogPrePublishQaResult;
    };

/**
 * Explicit draft → published after AB-1 PASS on the locked saved row.
 * HOLD = zero mutation (transaction rolled back).
 */
export async function publishAutonomousBlogDraft(args: {
  actor: AdminIdentity;
  id: number;
  evidenceState: "ready" | "missing" | "stale";
  mediaState: { featuredImageReady: boolean };
  policy?: Partial<BlogPrePublishEditorialPolicy> | null;
  ip?: string | null;
  deps?: Partial<BlogPersistenceDeps>;
}): Promise<AutonomousPublishResult> {
  const deps = { ...defaultDeps(), ...args.deps };
  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BlogPersistenceError(400, "invalid_request", "Valid blog id is required");
  }

  const conn = await deps.getConnection();
  let qa: BlogPrePublishQaResult | null = null;
  let changedFields: string[] = [];
  let publishedTitle: unknown = id;
  let wrote = false;

  try {
    await conn.beginTransaction();
    const [draftRows]: any = await conn.query(LOCKED_BLOG_SELECT, [id]);
    const draft =
      Array.isArray(draftRows) && draftRows[0] ? draftRows[0] : null;
    if (!draft) {
      throw new BlogPersistenceError(404, "entity_not_found", "Blog post not found");
    }
    if (String(draft.status || "") !== "draft") {
      throw new BlogPersistenceError(
        409,
        "not_draft",
        "Autonomous publish requires an existing draft BlogPost."
      );
    }

    const [inventoryRows]: any = await conn.query(INVENTORY_SELECT);
    const inventory: ExistingBlogPostInventoryRow[] = Array.isArray(inventoryRows)
      ? inventoryRows.map((r: any) => ({
          id: Number(r.id),
          title: String(r.title || ""),
          slug: String(r.slug || ""),
          status: r.status != null ? String(r.status) : undefined,
          active: r.active,
        }))
      : [];

    const candidate = buildQaCandidateFromLockedRow(
      draft,
      id,
      args.evidenceState,
      args.mediaState
    );
    qa = deps.evaluateAutonomousBlogPrePublish({
      candidate,
      existingPosts: inventory,
      policy: args.policy,
    });

    if (qa.verdict !== "PASS") {
      await conn.rollback();
      return { outcome: "HELD", id, qa };
    }

    const built = buildNextBlogState({
      current: draft,
      patch: {},
      mode: "publish",
      statusOnly: true,
    });

    await writeRevisionAndUpdate({
      deps,
      conn,
      actor: args.actor,
      id,
      current: draft,
      next: built.next,
      changedFields: built.changedFields,
    });
    await conn.commit();
    wrote = true;
    changedFields = built.changedFields;
    publishedTitle = built.next.title;
  } catch (txErr: any) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (txErr instanceof BlogPersistenceError) throw txErr;
    if (txErr?.code === "REVISION_TOO_LARGE") {
      throw new BlogPersistenceError(400, "invalid_request", txErr.message);
    }
    throw txErr;
  } finally {
    conn.release();
  }

  if (!wrote || !qa) {
    // HOLD already returned; defensive
    return {
      outcome: "HELD",
      id,
      qa: qa || {
        verdict: "HOLD",
        blockers: [],
        warnings: [],
        existingSeoIssues: [],
        checks: {} as BlogPrePublishQaResult["checks"],
      },
    };
  }

  await deps.recordAdminAudit({
    actor: args.actor,
    action: "blog.updated",
    entityType: "blog",
    entityId: id,
    summary: `Updated blog post ${publishedTitle || id}`,
    metadata: { changed_fields: changedFields, source: "autonomous" },
    ip: args.ip,
  });
  deps.invalidateSitemapCache();
  const seo_guard = await deps.runPostSaveSeoGuard({
    entityType: "blog",
    entityId: id,
    operation: "update",
    changedFields,
  });

  return {
    outcome: "PUBLISHED",
    id,
    qa,
    changed_fields: changedFields,
    seo_guard,
  };
}

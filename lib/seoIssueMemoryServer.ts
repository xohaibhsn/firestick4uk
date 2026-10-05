/**
 * SERVER ONLY — SEO Issue Memory persistence + authoritative reconcile.
 * Never import from client components.
 */
import pool from "@/lib/db";
import { buildSeoDiagnostics } from "@/lib/seoDiagnostics";
import {
  normalizeBlogDiagnosticRow,
  normalizeProductDiagnosticRow,
} from "@/lib/seoDiagnosticRows";
import {
  classifyAbsentOpenIssue,
  entityStateKey,
  toDetectedPayload,
  type SeoIssueDetectedPayload,
  type SeoIssueEntityState,
  type SeoIssueEntityType,
  type SeoIssueMemoryRow,
  type SeoIssueReconcileScope,
  type SeoIssueResolutionReason,
} from "@/lib/seoIssueMemory";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export type SeoIssueReconcileResult = {
  scope: string;
  evaluatedProducts: number;
  evaluatedBlogs: number;
  detectedIssues: number;
  opened: number;
  updated: number;
  reopened: number;
  resolved: number;
  resolutionReasons: Record<SeoIssueResolutionReason, number>;
};

function clampLimit(raw: unknown, def = 50): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(100, Math.max(10, Math.floor(n)));
}

export async function listSeoIssueMemory(opts: {
  status?: "open" | "resolved" | "all";
  entityType?: SeoIssueEntityType | null;
  entityId?: string | null;
  allowProducts: boolean;
  allowBlog: boolean;
  limit?: unknown;
}): Promise<SeoIssueMemoryRow[]> {
  if (!opts.allowProducts && !opts.allowBlog) return [];

  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.allowProducts && opts.allowBlog) {
    // both
  } else if (opts.allowProducts) {
    where.push(`entity_type = 'product'`);
  } else {
    where.push(`entity_type = 'blog'`);
  }

  if (opts.entityType === "product" || opts.entityType === "blog") {
    if (opts.entityType === "product" && !opts.allowProducts) return [];
    if (opts.entityType === "blog" && !opts.allowBlog) return [];
    where.push(`entity_type = ?`);
    params.push(opts.entityType);
  }

  if (opts.entityId) {
    where.push(`entity_id = ?`);
    params.push(opts.entityId);
  }

  if (opts.status === "open" || opts.status === "resolved") {
    where.push(`status = ?`);
    params.push(opts.status);
  }

  const limit = clampLimit(opts.limit);
  const sql = `
    SELECT issue_key, rule_code, entity_type, entity_id, entity_label,
           category, severity, field_name, status, resolution_reason,
           first_seen_at, last_seen_at, resolved_at,
           reopened_count, occurrence_count, latest_message, latest_evidence
    FROM seo_diagnostic_issues
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE status WHEN 'open' THEN 0 ELSE 1 END,
      last_seen_at DESC,
      issue_key ASC
    LIMIT ${limit}
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return (Array.isArray(rows) ? rows : []).map(mapMemoryRow);
}

function mapMemoryRow(r: RowDataPacket): SeoIssueMemoryRow {
  return {
    issue_key: String(r.issue_key),
    rule_code: String(r.rule_code),
    entity_type: r.entity_type === "blog" ? "blog" : "product",
    entity_id: String(r.entity_id),
    entity_label: r.entity_label == null ? null : String(r.entity_label),
    category: String(r.category || ""),
    severity: String(r.severity || ""),
    field_name: r.field_name == null ? null : String(r.field_name),
    status: r.status === "resolved" ? "resolved" : "open",
    resolution_reason: (r.resolution_reason as SeoIssueResolutionReason) || null,
    first_seen_at: formatDt(r.first_seen_at),
    last_seen_at: formatDt(r.last_seen_at),
    resolved_at: r.resolved_at == null ? null : formatDt(r.resolved_at),
    reopened_count: Number(r.reopened_count || 0),
    occurrence_count: Number(r.occurrence_count || 0),
    latest_message: String(r.latest_message || ""),
    latest_evidence: String(r.latest_evidence || ""),
  };
}

function formatDt(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v || "");
}

async function loadAuthoritativeProducts(
  conn: PoolConnection,
  entityId?: string | null
): Promise<{
  rows: ReturnType<typeof normalizeProductDiagnosticRow>[];
  entityStates: Map<string, SeoIssueEntityState>;
}> {
  const params: unknown[] = [];
  let sql = `SELECT id, name, slug, active, seo_title, meta_description, focus_keyword,
                    image, og_image, short_description, description, full_description
             FROM products`;
  if (entityId) {
    sql += ` WHERE id = ?`;
    params.push(Number(entityId));
  }
  sql += ` ORDER BY id ASC`;
  const [raw] = await conn.query<RowDataPacket[]>(sql, params);
  if (!Array.isArray(raw)) {
    throw new Error("Product authoritative query returned invalid result");
  }
  const rows = raw.map((p) => normalizeProductDiagnosticRow(p as any));
  const entityStates = new Map<string, SeoIssueEntityState>();
  for (const p of rows) {
    entityStates.set(entityStateKey("product", String(p.id)), {
      entityType: "product",
      entityId: String(p.id),
      exists: true,
      eligible: !!p.active,
    });
  }
  return { rows, entityStates };
}

async function loadAuthoritativeBlogs(
  conn: PoolConnection,
  entityId?: string | null
): Promise<{
  rows: ReturnType<typeof normalizeBlogDiagnosticRow>[];
  entityStates: Map<string, SeoIssueEntityState>;
}> {
  const params: unknown[] = [];
  let sql = `SELECT id, title, slug, status, active, meta_title, meta_description,
                    focus_keyword, canonical_url, featured_image, excerpt, content
             FROM blog_posts`;
  if (entityId) {
    sql += ` WHERE id = ?`;
    params.push(Number(entityId));
  }
  sql += ` ORDER BY id DESC`;
  const [raw] = await conn.query<RowDataPacket[]>(sql, params);
  if (!Array.isArray(raw)) {
    throw new Error("Blog authoritative query returned invalid result");
  }
  const rows = raw.map((b) => normalizeBlogDiagnosticRow(b as any));
  const entityStates = new Map<string, SeoIssueEntityState>();
  for (const b of rows) {
    const eligible =
      String(b.status || "").toLowerCase() === "published" && !!b.active;
    entityStates.set(entityStateKey("blog", String(b.id)), {
      entityType: "blog",
      entityId: String(b.id),
      exists: true,
      eligible,
    });
  }
  return { rows, entityStates };
}

async function loadOpenMemory(
  conn: PoolConnection,
  opts: {
    evaluatedProducts: boolean;
    evaluatedBlogs: boolean;
    entityFilter?: { entityType: SeoIssueEntityType; entityId: string } | null;
  }
): Promise<SeoIssueMemoryRow[]> {
  const where: string[] = [`status = 'open'`];
  const params: unknown[] = [];
  if (opts.entityFilter) {
    where.push(`entity_type = ?`, `entity_id = ?`);
    params.push(opts.entityFilter.entityType, opts.entityFilter.entityId);
  } else {
    const types: string[] = [];
    if (opts.evaluatedProducts) types.push("product");
    if (opts.evaluatedBlogs) types.push("blog");
    if (!types.length) return [];
    where.push(`entity_type IN (${types.map(() => "?").join(",")})`);
    params.push(...types);
  }
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT issue_key, rule_code, entity_type, entity_id, entity_label,
            category, severity, field_name, status, resolution_reason,
            first_seen_at, last_seen_at, resolved_at,
            reopened_count, occurrence_count, latest_message, latest_evidence
     FROM seo_diagnostic_issues
     WHERE ${where.join(" AND ")}`,
    params
  );
  return (Array.isArray(rows) ? rows : []).map(mapMemoryRow);
}

async function upsertDetected(
  conn: PoolConnection,
  detected: SeoIssueDetectedPayload[]
): Promise<{ opened: number; updated: number; reopened: number }> {
  if (!detected.length) return { opened: 0, updated: 0, reopened: 0 };

  const keys = detected.map((d) => d.issue_key);
  const [existingRows] = await conn.query<RowDataPacket[]>(
    `SELECT issue_key, status FROM seo_diagnostic_issues
     WHERE issue_key IN (${keys.map(() => "?").join(",")})`,
    keys
  );
  const prior = new Map<string, string>();
  for (const r of Array.isArray(existingRows) ? existingRows : []) {
    prior.set(String(r.issue_key), String(r.status));
  }

  let opened = 0;
  let updated = 0;
  let reopened = 0;
  for (const d of detected) {
    const prev = prior.get(d.issue_key);
    if (!prev) opened += 1;
    else if (prev === "resolved") reopened += 1;
    else updated += 1;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (const d of detected) {
    placeholders.push("(?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),NULL,0,1,?,?)");
    values.push(
      d.issue_key,
      d.rule_code,
      d.entity_type,
      d.entity_id,
      d.entity_label || null,
      d.category,
      d.severity,
      d.field_name,
      "open",
      null,
      d.latest_message,
      d.latest_evidence
    );
  }

  await conn.query(
    `INSERT INTO seo_diagnostic_issues (
       issue_key, rule_code, entity_type, entity_id, entity_label,
       category, severity, field_name, status, resolution_reason,
       first_seen_at, last_seen_at, resolved_at, reopened_count, occurrence_count,
       latest_message, latest_evidence
     ) VALUES ${placeholders.join(",")}
     ON DUPLICATE KEY UPDATE
       entity_label = VALUES(entity_label),
       category = VALUES(category),
       severity = VALUES(severity),
       field_name = VALUES(field_name),
       latest_message = VALUES(latest_message),
       latest_evidence = VALUES(latest_evidence),
       last_seen_at = NOW(),
       occurrence_count = occurrence_count + 1,
       reopened_count = IF(status = 'resolved', reopened_count + 1, reopened_count),
       status = 'open',
       resolved_at = NULL,
       resolution_reason = NULL`,
    values
  );

  return { opened, updated, reopened };
}

async function resolveKeys(
  conn: PoolConnection,
  byReason: Map<SeoIssueResolutionReason, string[]>
): Promise<number> {
  let total = 0;
  for (const [reason, keys] of byReason.entries()) {
    if (!keys.length) continue;
    const [result]: any = await conn.query(
      `UPDATE seo_diagnostic_issues
       SET status = 'resolved',
           resolution_reason = ?,
           resolved_at = NOW()
       WHERE status = 'open'
         AND issue_key IN (${keys.map(() => "?").join(",")})`,
      [reason, ...keys]
    );
    total += Number(result?.affectedRows || 0);
  }
  return total;
}

/**
 * Authoritative reconcile. Throws on source failure — caller must not resolve.
 */
export async function reconcileSeoIssueMemory(
  scopeInput: SeoIssueReconcileScope
): Promise<SeoIssueReconcileResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const evaluatedProducts =
      scopeInput.scope === "all" ||
      scopeInput.scope === "products" ||
      (scopeInput.scope === "entity" && scopeInput.entity_type === "product");
    const evaluatedBlogs =
      scopeInput.scope === "all" ||
      scopeInput.scope === "blog" ||
      (scopeInput.scope === "entity" && scopeInput.entity_type === "blog");

    const entityFilter =
      scopeInput.scope === "entity"
        ? {
            entityType: scopeInput.entity_type,
            entityId: scopeInput.entity_id,
          }
        : null;

    const entityStates = new Map<string, SeoIssueEntityState>();
    let productRows: ReturnType<typeof normalizeProductDiagnosticRow>[] = [];
    let blogRows: ReturnType<typeof normalizeBlogDiagnosticRow>[] = [];

    if (evaluatedProducts) {
      const loaded = await loadAuthoritativeProducts(
        conn,
        entityFilter?.entityType === "product" ? entityFilter.entityId : null
      );
      productRows = loaded.rows;
      for (const [k, v] of loaded.entityStates) entityStates.set(k, v);
      if (
        entityFilter?.entityType === "product" &&
        !entityStates.has(
          entityStateKey("product", entityFilter.entityId)
        )
      ) {
        entityStates.set(entityStateKey("product", entityFilter.entityId), {
          entityType: "product",
          entityId: entityFilter.entityId,
          exists: false,
          eligible: false,
        });
      }
    }

    if (evaluatedBlogs) {
      const loaded = await loadAuthoritativeBlogs(
        conn,
        entityFilter?.entityType === "blog" ? entityFilter.entityId : null
      );
      blogRows = loaded.rows;
      for (const [k, v] of loaded.entityStates) entityStates.set(k, v);
      if (
        entityFilter?.entityType === "blog" &&
        !entityStates.has(entityStateKey("blog", entityFilter.entityId))
      ) {
        entityStates.set(entityStateKey("blog", entityFilter.entityId), {
          entityType: "blog",
          entityId: entityFilter.entityId,
          exists: false,
          eligible: false,
        });
      }
    }

    const diagnostics = buildSeoDiagnostics({
      products: evaluatedProducts ? productRows : undefined,
      blog: evaluatedBlogs ? blogRows : undefined,
    });

    const detected: SeoIssueDetectedPayload[] = [];
    const detectedKeys = new Set<string>();
    for (const issue of diagnostics.issues) {
      if (entityFilter) {
        if (
          issue.entityType !== entityFilter.entityType ||
          String(issue.entityId) !== entityFilter.entityId
        ) {
          continue;
        }
      }
      const payload = toDetectedPayload(issue);
      if (!payload) continue;
      detected.push(payload);
      detectedKeys.add(payload.issue_key);
    }

    const openMemory = await loadOpenMemory(conn, {
      evaluatedProducts,
      evaluatedBlogs,
      entityFilter,
    });

    const byReason = new Map<SeoIssueResolutionReason, string[]>([
      ["fixed", []],
      ["entity_out_of_scope", []],
      ["deleted", []],
    ]);

    for (const mem of openMemory) {
      if (detectedKeys.has(mem.issue_key)) continue;
      const reason = classifyAbsentOpenIssue({
        memory: mem,
        entityStates,
        evaluatedProducts,
        evaluatedBlogs,
        entityFilter,
      });
      if (!reason) continue;
      byReason.get(reason)!.push(mem.issue_key);
    }

    const upsertStats = await upsertDetected(conn, detected);
    const resolved = await resolveKeys(conn, byReason);

    await conn.commit();

    return {
      scope: scopeInput.scope,
      evaluatedProducts: productRows.length,
      evaluatedBlogs: blogRows.length,
      detectedIssues: detected.length,
      opened: upsertStats.opened,
      updated: upsertStats.updated,
      reopened: upsertStats.reopened,
      resolved,
      resolutionReasons: {
        fixed: byReason.get("fixed")!.length,
        entity_out_of_scope: byReason.get("entity_out_of_scope")!.length,
        deleted: byReason.get("deleted")!.length,
      },
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}

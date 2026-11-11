/**
 * Resolve seasonal schema capability from information_schema (injectable for tests).
 * Failures → unknown (never legacy fail-open).
 * Cache keys are scoped by real adapter/pool identity (WeakMap) + schema + context.
 * Credentials are never serialized or exposed.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import {
  clearSchemaCapabilityCache,
  getCachedSchemaCapability,
  rememberSchemaCapability,
  resolveSchemaCapability,
  type SchemaCapability,
} from "@/lib/productSchemaCapability";

export type CapabilityDb = {
  query: Pool["query"] | PoolConnection["query"];
};

/** Opaque identity for ordinary pool/connection adapters — no markers required from callers. */
const adapterIdentity = new WeakMap<object, string>();
let adapterSeq = 0;

export function capabilityAdapterIdentity(db: object | null | undefined): string {
  if (db == null || (typeof db !== "object" && typeof db !== "function")) {
    return "unresolved-adapter";
  }
  const key = db as object;
  let id = adapterIdentity.get(key);
  if (!id) {
    adapterSeq += 1;
    id = `adapter-${adapterSeq}`;
    adapterIdentity.set(key, id);
  }
  return id;
}

export function capabilityCacheContextKey(opts?: {
  schemaName?: string;
  contextKey?: string;
  db?: CapabilityDb | null;
}): string {
  const schema = opts?.schemaName || process.env.DB_NAME || "no-schema";
  const poolId = opts?.db ? capabilityAdapterIdentity(opts.db) : "unresolved-adapter";
  const extra = opts?.contextKey || "default";
  return `schema:${schema}|pool:${poolId}|ctx:${extra}`;
}

export async function detectProductSchemaCapability(
  db: CapabilityDb = pool,
  opts?: { bypassCache?: boolean; schemaName?: string; contextKey?: string }
): Promise<SchemaCapability> {
  const schema = opts?.schemaName || process.env.DB_NAME;
  const cacheKey = capabilityCacheContextKey({
    schemaName: schema || undefined,
    contextKey: opts?.contextKey,
    db,
  });

  if (!opts?.bypassCache) {
    const cached = getCachedSchemaCapability(cacheKey);
    if (cached) return cached;
  }

  try {
    if (!schema) {
      return rememberSchemaCapability(
        resolveSchemaCapability({ columnNames: null, error: "DB_NAME missing" }),
        cacheKey
      );
    }
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products'`,
      [schema]
    );
    const names = Array.isArray(rows) ? rows.map((r) => String(r.name || r.COLUMN_NAME || "")) : [];
    return rememberSchemaCapability(resolveSchemaCapability({ columnNames: names }), cacheKey);
  } catch (err: any) {
    return rememberSchemaCapability(
      resolveSchemaCapability({
        columnNames: null,
        error: String(err?.message || err || "detect_failed"),
      }),
      cacheKey
    );
  }
}

/** Clear cache for a specific adapter/schema/context (same key shape as detect). */
export function clearProductSchemaCapabilityCache(opts?: {
  schemaName?: string;
  contextKey?: string;
  db?: CapabilityDb | null;
}): void {
  if (!opts) {
    clearSchemaCapabilityCache();
    return;
  }
  clearSchemaCapabilityCache(
    capabilityCacheContextKey({
      schemaName: opts.schemaName,
      contextKey: opts.contextKey,
      db: opts.db,
    })
  );
}

export { clearSchemaCapabilityCache };

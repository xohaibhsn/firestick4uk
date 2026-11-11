/**
 * Shared product writer lock + version checks (expanded schema).
 * Callers must already hold an open transaction on `conn`.
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PRODUCT_VERSION_MAX } from "@/lib/productSeasonActions";
import { normalizeSeasonalUtcFields } from "@/lib/productSeasonLondon";
import { queryWithSeasonalUtc } from "@/lib/productSeasonalQuery";

export type LockedProduct =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; status: 404; error: string; code: "not_found" };

export type VersionGate =
  | { ok: true; version: number; expanded: boolean }
  | {
      ok: false;
      status: 400 | 409;
      error: string;
      code: "validation" | "stale_version" | "version_overflow";
      current_version?: number;
    };

export async function lockProductRow(
  conn: PoolConnection,
  productId: number
): Promise<LockedProduct> {
  const [rows] = await queryWithSeasonalUtc<RowDataPacket[]>(
    conn,
    `SELECT * FROM products WHERE id = ? LIMIT 1 FOR UPDATE`,
    [productId]
  );
  const raw = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  if (!raw) {
    return { ok: false, status: 404, error: "Product not found", code: "not_found" };
  }
  return { ok: true, row: normalizeSeasonalUtcFields(raw) };
}

export function readProductVersion(row: Record<string, unknown>): {
  expanded: boolean;
  version: number | null;
} {
  if (!Object.prototype.hasOwnProperty.call(row, "product_version")) {
    return { expanded: false, version: null };
  }
  const n = Number(row.product_version);
  if (!Number.isInteger(n) || n < 0) {
    return { expanded: true, version: null };
  }
  return { expanded: true, version: n };
}

/** Gate expected_version against a locked row. Legacy (no column) always passes. */
export function gateExpectedVersion(
  row: Record<string, unknown>,
  expectedVersion: unknown,
  opts?: { requireWhenExpanded?: boolean; allowMissingExpectedForLegacy?: boolean }
): VersionGate {
  const { expanded, version } = readProductVersion(row);
  if (!expanded) return { ok: true, version: 0, expanded: false };
  if (version == null) {
    return {
      ok: false,
      status: 409,
      error: "Invalid product_version on product row",
      code: "stale_version",
    };
  }
  const require = opts?.requireWhenExpanded !== false;
  if (require && (expectedVersion === undefined || expectedVersion === null)) {
    return {
      ok: false,
      status: 400,
      error: "expected_version is required on expanded schema",
      code: "validation",
    };
  }
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return {
      ok: false,
      status: 400,
      error: "expected_version must be a non-negative integer",
      code: "validation",
    };
  }
  if (expectedVersion !== version) {
    return {
      ok: false,
      status: 409,
      error: "Stale product_version; refresh and retry",
      code: "stale_version",
      current_version: version,
    };
  }
  if (version === PRODUCT_VERSION_MAX) {
    return {
      ok: false,
      status: 409,
      error: "product_version overflow; refuse further mutations",
      code: "version_overflow",
      current_version: version,
    };
  }
  return { ok: true, version, expanded: true };
}

/** Version gate that allows no-op at max version (caller decides no-op first). */
export function gateExpectedVersionAllowMaxNoop(
  row: Record<string, unknown>,
  expectedVersion: unknown,
  isNoop: boolean
): VersionGate {
  const { expanded, version } = readProductVersion(row);
  if (!expanded) return { ok: true, version: 0, expanded: false };
  if (version == null) {
    return {
      ok: false,
      status: 409,
      error: "Invalid product_version on product row",
      code: "stale_version",
    };
  }
  if (expectedVersion === undefined || expectedVersion === null) {
    return {
      ok: false,
      status: 400,
      error: "expected_version is required on expanded schema",
      code: "validation",
    };
  }
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return {
      ok: false,
      status: 400,
      error: "expected_version must be a non-negative integer",
      code: "validation",
    };
  }
  if (expectedVersion !== version) {
    return {
      ok: false,
      status: 409,
      error: "Stale product_version; refresh and retry",
      code: "stale_version",
      current_version: version,
    };
  }
  if (version === PRODUCT_VERSION_MAX && !isNoop) {
    return {
      ok: false,
      status: 409,
      error: "product_version overflow; refuse further mutations",
      code: "version_overflow",
      current_version: version,
    };
  }
  return { ok: true, version, expanded: true };
}

export function assertSingleUpdate(result: ResultSetHeader, label: string): void {
  if (Number(result.affectedRows || 0) !== 1) {
    const err: any = new Error(`${label}: concurrent change or missing row`);
    err.code = "concurrent_conflict";
    err.status = 409;
    throw err;
  }
}

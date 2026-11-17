/**
 * F4UK-MULTI-130 — pure helpers for Products Quick Edit (price + stock only).
 * Reuses parseStrictPriceGbp; never includes other product fields.
 */

import { parseStrictPriceGbp } from "@/lib/productAiClient";

export const QUICK_EDIT_CONCURRENT_RELOAD_MESSAGE =
  "This product changed elsewhere — Reload";

export type QuickEditFields = {
  price: string;
  stock: string;
};

export type QuickEditPutBody = {
  id: number;
  price: string;
  stock: string;
  expected_version: number;
};

export type QuickEditBuildResult =
  | { ok: true; body: QuickEditPutBody }
  | { ok: false; error: string };

/**
 * Build the admin-products PUT body for Quick Edit.
 * ONLY id, price, stock, expected_version — never name/slug/SEO/ops fields.
 */
export function buildQuickEditPutBody(
  id: unknown,
  fields: QuickEditFields,
  expectedVersion: unknown
): QuickEditBuildResult {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return { ok: false, error: "Invalid product id." };
  }
  const parsedPrice = parseStrictPriceGbp(fields.price);
  if (parsedPrice === undefined) {
    return {
      ok: false,
      error: "Enter a valid price (non-negative number, max 2 decimal places).",
    };
  }
  const version = Number(expectedVersion);
  if (!Number.isFinite(version)) {
    return { ok: false, error: "Missing product version — reload and try again." };
  }
  const stock = String(fields.stock ?? "").trim() || "Digital";
  return {
    ok: true,
    body: {
      id: productId,
      price: String(parsedPrice),
      stock,
      expected_version: version,
    },
  };
}

/** True when body keys are exactly the Quick Edit allowlist. */
export function isQuickEditPutBodyStrict(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).sort();
  return (
    keys.length === 4 &&
    keys[0] === "expected_version" &&
    keys[1] === "id" &&
    keys[2] === "price" &&
    keys[3] === "stock"
  );
}

export function quickEditConflictMessage(res: {
  status?: number;
  code?: unknown;
  error?: unknown;
}): string | null {
  if (Number(res.status) !== 409) return null;
  const code = String(res.code || "");
  if (code === "concurrent_conflict" || code === "stale_version") {
    return QUICK_EDIT_CONCURRENT_RELOAD_MESSAGE;
  }
  return QUICK_EDIT_CONCURRENT_RELOAD_MESSAGE;
}

/**
 * On 409 concurrent_conflict: surface reload message; do not retry or overwrite.
 */
export function shouldAbortQuickEditOnConflict(status: number, code: unknown): boolean {
  if (status !== 409) return false;
  const c = String(code || "");
  return c === "concurrent_conflict" || c === "stale_version" || c === "";
}

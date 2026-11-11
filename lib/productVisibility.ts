/**
 * Product Private toggle payload (task-01 evolved).
 * active=1 public page eligible; active=0 private/inactive (404).
 * Not used for seasonal archive hide-from-shop.
 */
export const PRODUCT_VISIBILITY_ALLOWED_KEYS = [
  "id",
  "active",
  "expected_active",
  "expected_version",
] as const;

export type ProductVisibilityFlag = 0 | 1;

export type ProductVisibilityPayload = {
  id: number;
  active: ProductVisibilityFlag;
  expected_active: ProductVisibilityFlag;
  /** Required when expanded schema rows carry product_version. */
  expected_version?: number;
};

export type ProductVisibilityParseResult =
  | { ok: true; payload: ProductVisibilityPayload }
  | { ok: false; error: string; code: "validation" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parsePositiveIntegerId(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function parseActiveFlag(value: unknown): ProductVisibilityFlag | null {
  if (value === 0 || value === 1) return value;
  return null;
}

export function parseProductVisibilityPayload(
  body: unknown
): ProductVisibilityParseResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Visibility payload must be a JSON object", code: "validation" };
  }

  const keys = Object.keys(body);
  const unexpected = keys.filter(
    (k) => !(PRODUCT_VISIBILITY_ALLOWED_KEYS as readonly string[]).includes(k)
  );
  if (unexpected.length > 0) {
    return {
      ok: false,
      error: `Visibility PATCH rejects unrelated fields: ${unexpected.join(", ")}`,
      code: "validation",
    };
  }

  for (const key of ["id", "active", "expected_active"] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      return { ok: false, error: `Missing required field: ${key}`, code: "validation" };
    }
  }

  const id = parsePositiveIntegerId(body.id);
  if (id === null) {
    return { ok: false, error: "id must be a positive integer", code: "validation" };
  }

  const active = parseActiveFlag(body.active);
  if (active === null) {
    return {
      ok: false,
      error: "active must be exactly 0 (Private) or 1 (Public)",
      code: "validation",
    };
  }

  const expected_active = parseActiveFlag(body.expected_active);
  if (expected_active === null) {
    return {
      ok: false,
      error: "expected_active must be exactly 0 or 1",
      code: "validation",
    };
  }

  const payload: ProductVisibilityPayload = { id, active, expected_active };
  if (Object.prototype.hasOwnProperty.call(body, "expected_version")) {
    const v = body.expected_version;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 4294967295) {
      return {
        ok: false,
        error: "expected_version must be an integer 0..4294967295",
        code: "validation",
      };
    }
    payload.expected_version = v;
  }

  return { ok: true, payload };
}

export function normalizeStoredActive(value: unknown): ProductVisibilityFlag {
  return Number(value) === 1 ? 1 : 0;
}

export function visibilityLabel(active: ProductVisibilityFlag): "Public" | "Private" {
  return active === 1 ? "Public" : "Private";
}

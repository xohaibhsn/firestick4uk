/**
 * Pure controlled product URL migration helpers.
 * No DB / HTTP. Validates slug identity and builds exact one-hop redirect paths.
 */
import {
  CODE_OWNED_REDIRECT_SOURCES,
  isProtectedRedirectPath,
  normalizeInternalPathname,
  validateRedirectFields,
  type UrlRedirectGraphRule,
} from "@/lib/urlRedirects";

export type ProductUrlMigrationInput = {
  productId: unknown;
  expectedOldSlug: unknown;
  newSlug: unknown;
};

export type ProductUrlMigrationPaths = {
  productId: number;
  expectedOldSlug: string;
  newSlug: string;
  sourcePath: string;
  destinationPath: string;
};

export type ProductUrlMigrationValidateOk = {
  ok: true;
  paths: ProductUrlMigrationPaths;
};

export type ProductUrlMigrationValidateErr = {
  ok: false;
  error: string;
  code?: "conflict" | "validation";
};

export function toProductSlug(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function productPathFromSlug(slug: string): string {
  return `/products/${slug}`;
}

/**
 * Normalize and validate migration identity + path pair before any DB writes.
 * Does not check live collisions (caller supplies redirect graph + product checks).
 */
export function validateProductUrlMigrationRequest(
  input: ProductUrlMigrationInput,
  existingRedirects: readonly UrlRedirectGraphRule[] = []
): ProductUrlMigrationValidateOk | ProductUrlMigrationValidateErr {
  const productId = Number(input.productId);
  if (!Number.isFinite(productId) || productId <= 0 || !Number.isInteger(productId)) {
    return { ok: false, error: "Valid product id is required", code: "validation" };
  }

  const expectedOldSlug = toProductSlug(input.expectedOldSlug);
  const newSlug = toProductSlug(input.newSlug);

  if (!expectedOldSlug) {
    return { ok: false, error: "expected_old_slug is required", code: "validation" };
  }
  if (!newSlug) {
    return { ok: false, error: "new_slug is required", code: "validation" };
  }
  if (expectedOldSlug === newSlug) {
    return {
      ok: false,
      error: "new_slug must differ from expected_old_slug",
      code: "validation",
    };
  }

  const sourcePath = productPathFromSlug(expectedOldSlug);
  const destinationPath = productPathFromSlug(newSlug);

  // Extra guard: never allow managed migration to overwrite code-owned legacy sources.
  if (CODE_OWNED_REDIRECT_SOURCES.includes(sourcePath)) {
    return {
      ok: false,
      error: "This product URL is code-owned and cannot be migrated via Redirect Manager",
      code: "conflict",
    };
  }
  if (CODE_OWNED_REDIRECT_SOURCES.includes(destinationPath)) {
    return {
      ok: false,
      error: "Destination collides with a code-owned legacy product URL",
      code: "conflict",
    };
  }

  if (isProtectedRedirectPath(sourcePath) || isProtectedRedirectPath(destinationPath)) {
    return {
      ok: false,
      error: "Source or destination path is protected",
      code: "conflict",
    };
  }

  const srcNorm = normalizeInternalPathname(sourcePath, "source");
  const destNorm = normalizeInternalPathname(destinationPath, "destination");
  if (!srcNorm.ok) return { ok: false, error: srcNorm.error, code: "validation" };
  if (!destNorm.ok) return { ok: false, error: destNorm.error, code: "validation" };

  const redirectCheck = validateRedirectFields({
    source_path: srcNorm.path,
    destination_path: destNorm.path,
    redirect_type: 308,
    active: 1,
    existing: existingRedirects,
  });
  if (!redirectCheck.ok) {
    // Idempotent-compatible callers may still proceed when an exact active rule already exists.
    const exactExisting = existingRedirects.find(
      (r) =>
        r.source_path === srcNorm.path &&
        r.destination_path === destNorm.path &&
        Number(r.active) === 1
    );
    if (!exactExisting) {
      return {
        ok: false,
        error: redirectCheck.error,
        code: redirectCheck.code === "conflict" ? "conflict" : "validation",
      };
    }
  }

  return {
    ok: true,
    paths: {
      productId,
      expectedOldSlug,
      newSlug,
      sourcePath: srcNorm.path,
      destinationPath: destNorm.path,
    },
  };
}

export function isExactActiveRedirect(
  rules: readonly UrlRedirectGraphRule[],
  sourcePath: string,
  destinationPath: string
): boolean {
  return rules.some(
    (r) =>
      r.source_path === sourcePath &&
      r.destination_path === destinationPath &&
      Number(r.active) === 1
  );
}

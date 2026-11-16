/**
 * Server/test site_content stale-write hash (MULTI-108).
 * Uses Node createHash — do not import from client components.
 */
import { createHash } from "crypto";
import {
  SITE_CONTENT_ABSENT_SENTINEL,
  siteContentHashInput,
} from "./siteContentBaseHashCore";

export {
  SITE_CONTENT_ABSENT_SENTINEL,
  siteContentHashInput,
} from "./siteContentBaseHashCore";

/** Sync SHA-256 hex (Node / server / tests). Identical UTF-8 digest to Web Crypto. */
export function hashSiteContentValue(
  value: string | undefined | null,
  present: boolean
): string {
  return createHash("sha256")
    .update(siteContentHashInput(value, present), "utf8")
    .digest("hex");
}

/** Precomputed absent-key hash (same algorithm). */
export const SITE_CONTENT_ABSENT_HASH = hashSiteContentValue(undefined, false);

/**
 * Shared site_content stale-write hash core (MULTI-108).
 * Safe for client + server — no Node crypto imports.
 */

/** Literal sentinel hashed when a key is absent from the loaded map. */
export const SITE_CONTENT_ABSENT_SENTINEL = "\u0000<absent>";

export function siteContentHashInput(
  value: string | undefined | null,
  present: boolean
): string {
  if (!present) return SITE_CONTENT_ABSENT_SENTINEL;
  return value == null ? "" : String(value);
}

/** Browser / SubtleCrypto path — UTF-8 bytes match Node createHash("sha256"). */
export async function hashSiteContentValueWeb(
  value: string | undefined | null,
  present: boolean
): Promise<string> {
  const input = siteContentHashInput(value, present);
  const data = new TextEncoder().encode(input);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SubtleCrypto unavailable");
  }
  const buf = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build base_hash map for every key present in a loaded content object. */
export async function buildBaseHashMap(
  content: Record<string, string>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(content || {})) {
    out[key] = await hashSiteContentValueWeb(String(value ?? ""), true);
  }
  return out;
}

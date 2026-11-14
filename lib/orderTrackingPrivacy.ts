/**
 * Masking helpers for the public order-tracking API.
 * Never return full email, phone, address, notes, receipt paths, or payment refs.
 */

const ORDER_ID_RE = /^ORD-\d{10,20}$/;

export function normaliseTrackOrderId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const id = String(raw).trim().slice(0, 32);
  if (!ORDER_ID_RE.test(id)) return null;
  return id;
}

export function normaliseTrackEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase().slice(0, 254);
  if (!email || email.length > 254) return null;
  // Minimal shape check — not a full RFC validator; enough to reject empty/garbage.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** "Zohaib Hassan" → "Zohaib H."; single token kept as-is; empty → "—". */
export function maskCustomerName(name: unknown): string {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return "—";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

/** "zohaib@hotmail.com" → "z***@h***.com" */
export function maskEmail(email: unknown): string {
  const raw = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!raw || !raw.includes("@")) return "—";
  const [local, domain] = raw.split("@");
  if (!local || !domain) return "—";
  const dot = domain.lastIndexOf(".");
  const tld = dot > 0 ? domain.slice(dot) : "";
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const localMasked = `${local.charAt(0)}***`;
  const hostMasked = host ? `${host.charAt(0)}***` : "***";
  return `${localMasked}@${hostMasked}${tld}`;
}

/** Last 3 digits only (digits stripped); empty → "—". */
export function maskPhone(phone: unknown): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  const last3 = digits.slice(-3);
  return `***${last3}`;
}

/** UK outward code only, e.g. "SW1A 1AA" → "SW1A ***". */
export function maskPostcode(postcode: unknown): string {
  const raw = typeof postcode === "string" ? postcode.trim().toUpperCase() : "";
  if (!raw) return "—";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ***`;
  // Compact form: last 3 chars are inward → strip them if long enough
  if (raw.length > 3) return `${raw.slice(0, -3).trim()} ***`;
  return `${raw} ***`;
}

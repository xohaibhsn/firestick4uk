/**
 * Non-secret public hint that an admin browser may show the edit bar.
 * Value is always "1" — never a token, id, or role. Session stays HttpOnly.
 */

export const ADMIN_HINT_COOKIE = "f4uk_ah";
export const ADMIN_HINT_MAX_AGE_SEC = 43200; // 12h

/** Exact Set-Cookie value used by /sidhu client (tests assert this format). */
export function buildAdminHintCookieSet(): string {
  return `${ADMIN_HINT_COOKIE}=1; Path=/; Max-Age=${ADMIN_HINT_MAX_AGE_SEC}; SameSite=Lax; Secure`;
}

export function buildAdminHintCookieClear(): string {
  return `${ADMIN_HINT_COOKIE}=1; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export function setAdminHintCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = buildAdminHintCookieSet();
}

export function clearAdminHintCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = buildAdminHintCookieClear();
}

/** True when document.cookie contains f4uk_ah=1. */
export function hasAdminHintCookie(cookieStr?: string): boolean {
  const raw =
    cookieStr != null
      ? String(cookieStr)
      : typeof document !== "undefined"
        ? document.cookie
        : "";
  return /(?:^|;\s*)f4uk_ah=1(?:;|$)/.test(raw);
}

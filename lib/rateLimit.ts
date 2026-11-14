import net from "net";

// Simple in-memory rate limiter for Next.js API routes
const store = new Map<string, { count: number; resetAt: number }>();

/** Soft cap on distinct rate-limit keys (DoS / memory bound). */
const MAX_KEYS = 20000;
const EVICT_TARGET = Math.floor(MAX_KEYS * 0.9);

function sweepExpired(now = Date.now()): void {
  for (const [key, val] of store.entries()) {
    if (now > val.resetAt) store.delete(key);
  }
}

/** When at capacity: drop expired, then oldest-inserted keys until under 90% of cap. */
function enforceStoreCap(): void {
  if (store.size < MAX_KEYS) return;
  sweepExpired();
  if (store.size < MAX_KEYS) return;
  const toDelete = store.size - EVICT_TARGET;
  let n = 0;
  for (const key of store.keys()) {
    if (n >= toDelete) break;
    store.delete(key);
    n++;
  }
}

// Clean old entries every 5 minutes
const sweepTimer = setInterval(() => {
  sweepExpired();
}, 5 * 60 * 1000);
if (typeof (sweepTimer as NodeJS.Timeout).unref === "function") {
  (sweepTimer as NodeJS.Timeout).unref();
}

export function rateLimit(
  ip: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const key = ip;
  const record = store.get(key);

  if (!record || now > record.resetAt) {
    enforceStoreCap();
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  record.count++;
  return { allowed: true, remaining: limit - record.count, retryAfterSec };
}

/** Test/diagnostic: current in-memory key count. */
export function getRateLimitStoreSize(): number {
  return store.size;
}

export const RATE_LIMIT_MAX_KEYS = MAX_KEYS;

// Presets
export const RL_GENERAL = (ip: string) => rateLimit(ip, 100, 15 * 60 * 1000);
export const RL_AUTH = (ip: string) => rateLimit(`auth:${ip}`, 5, 15 * 60 * 1000);
export const RL_SEARCH = (ip: string) => rateLimit(`search:${ip}`, 60, 60 * 1000);
/** Public CMS GETs (faqs/blog/sections) — 120 / min / IP, route-keyed. */
export const RL_PUBLIC_GET = (ip: string, route: string) =>
  rateLimit(`public-get:${route}:${ip}`, 120, 60 * 1000);
/** SEO AI assist — 10 calls / 15m, keyed by authenticated admin session id. */
export const RL_SEO_AI = (sessionId: string | number) =>
  rateLimit(`seo-ai:session:${sessionId}`, 10, 15 * 60 * 1000);

/**
 * Client IP for rate limits / audit.
 * Evidence (MULTI-93 live Hostinger): X-Forwarded-For is APPEND-only
 * ("spoof, spoof, real-client"), X-Real-IP = real client, socket = 127.0.0.1.
 * Taking the LEFT-most XFF hop is client-controlled and bypasses per-IP limits.
 * Prefer the RIGHT-most public hop, then X-Real-IP, then socket.
 */
function normalizeIpCandidate(raw: string): string | null {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (s.toLowerCase() === "unknown") return null;

  // Bracketed IPv6 with optional port: [2001:db8::1]:443
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end > 1) s = s.slice(1, end);
  } else if (s.includes(".") && s.includes(":")) {
    // IPv4 with port: 1.2.3.4:12345
    const lastColon = s.lastIndexOf(":");
    const maybePort = s.slice(lastColon + 1);
    if (/^\d+$/.test(maybePort)) s = s.slice(0, lastColon);
  }

  // IPv4-mapped IPv6
  const mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) s = mapped[1];

  if (!net.isIP(s)) return null;
  return s;
}

function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isNonPublicIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const o = ipv4Octets(ip);
    if (!o) return true;
    const [a, b] = o;
    // loopback 127.0.0.0/8
    if (a === 127) return true;
    // private 10.0.0.0/8
    if (a === 10) return true;
    // private 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // private 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // link-local 169.254.0.0/16
    if (a === 169 && b === 254) return true;
    // CGNAT 100.64.0.0/10
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    // Unique local fc00::/7
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // Link-local fe80::/10
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  }
  return true;
}

function parseForwardedList(raw: string | string[] | undefined): string[] {
  if (raw == null) return [];
  const joined = Array.isArray(raw) ? raw.join(",") : String(raw);
  return joined
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function getClientIp(req: { headers: any; socket?: any }): string {
  const xffParts = parseForwardedList(req.headers?.["x-forwarded-for"]);
  for (let i = xffParts.length - 1; i >= 0; i--) {
    const ip = normalizeIpCandidate(xffParts[i]);
    if (ip && !isNonPublicIp(ip)) return ip;
  }

  const realRaw = req.headers?.["x-real-ip"];
  const realStr = Array.isArray(realRaw) ? realRaw[0] : realRaw;
  const realIp = normalizeIpCandidate(String(realStr || ""));
  if (realIp && !isNonPublicIp(realIp)) return realIp;

  const remote = normalizeIpCandidate(String(req.socket?.remoteAddress || ""));
  if (remote) return remote;

  return "unknown";
}

import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import pool from "@/lib/db";

export type AdminRole = "super_admin" | "manager" | "writer";
export type PrincipalType = "master" | "staff";

export type AdminIdentity = {
  authenticated: true;
  principalType: PrincipalType;
  staffId?: number;
  name: string;
  email?: string;
  role: AdminRole;
  sessionId: number;
};

export const ADMIN_SESSION_COOKIE = "firestick_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const VALID_ROLES: AdminRole[] = ["super_admin", "manager", "writer"];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (VALID_ROLES as string[]).includes(value);
}

export async function ensureAdminSessionsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL,
      staff_id INT NULL,
      principal_type ENUM('master','staff') NOT NULL,
      principal_name VARCHAR(255) NOT NULL,
      role ENUM('super_admin','manager','writer') NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      UNIQUE KEY uniq_admin_session_token (token_hash),
      KEY idx_admin_session_expires (expires_at),
      KEY idx_admin_session_staff (staff_id)
    )
  `);
}

export async function ensureAdminStaffTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_staff (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('super_admin','manager','writer') DEFAULT 'writer',
      active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function parseCookieHeader(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(";") : header || "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function readAdminSessionToken(req: NextApiRequest): string {
  const fromCookies = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (typeof fromCookies === "string" && fromCookies) return fromCookies;
  const parsed = parseCookieHeader(req.headers.cookie);
  return parsed[ADMIN_SESSION_COOKIE] || "";
}

function isSecureRequest(req: NextApiRequest): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const xfProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (xfProto === "https") return true;
  // Hostinger / reverse proxies usually set x-forwarded-proto
  return false;
}

export function buildAdminSessionCookie(token: string, maxAgeSec: number, req: NextApiRequest): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, maxAgeSec)}`,
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearAdminSessionCookie(req: NextApiRequest): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export function setAdminSessionCookie(res: NextApiResponse, token: string, req: NextApiRequest): void {
  const maxAgeSec = Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  res.setHeader("Set-Cookie", buildAdminSessionCookie(token, maxAgeSec, req));
}

export function clearAdminSessionCookie(res: NextApiResponse, req: NextApiRequest): void {
  res.setHeader("Set-Cookie", buildClearAdminSessionCookie(req));
}

export function getRequestMeta(req: NextApiRequest): { ip: string; userAgent: string } {
  const xf = req.headers["x-forwarded-for"];
  const ip =
    (typeof xf === "string" ? xf.split(",")[0].trim() : "") ||
    String(req.headers["x-real-ip"] || "") ||
    req.socket?.remoteAddress ||
    "";
  const ua = String(req.headers["user-agent"] || "").slice(0, 512);
  return { ip: ip.slice(0, 64), userAgent: ua };
}

/**
 * Lightweight CSRF defense for cookie-authenticated mutations.
 * Allows missing Origin (some same-site navigations / tools) when Sec-Fetch-Site is same-origin/none.
 */
export function assertSameOriginMutation(req: NextApiRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;

  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!host) return true;

  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost === host) return true;
      // Localhost variants during development
      if (
        process.env.NODE_ENV !== "production" &&
        ((originHost.startsWith("localhost:") && host.startsWith("localhost:")) ||
          (originHost.startsWith("127.0.0.1:") && host.startsWith("127.0.0.1:")))
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none" || fetchSite === "") {
    return true;
  }
  return false;
}

export type CreateSessionInput = {
  principalType: PrincipalType;
  principalName: string;
  role: AdminRole;
  staffId?: number | null;
  email?: string;
  ip?: string;
  userAgent?: string;
};

export async function createAdminSession(
  input: CreateSessionInput
): Promise<{ token: string; expiresAt: Date }> {
  await ensureAdminSessionsTable();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);

  await pool.query(
    `INSERT INTO admin_sessions
      (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
    [
      tokenHash,
      input.staffId ?? null,
      input.principalType,
      input.principalName,
      input.role,
      expiresAt,
      input.ip || null,
      input.userAgent || null,
    ]
  );

  // Opportunistic cleanup of expired rows
  try {
    await pool.query("DELETE FROM admin_sessions WHERE expires_at < NOW() LIMIT 200");
  } catch {
    /* ignore */
  }

  return { token, expiresAt };
}

export async function destroyAdminSessionByToken(token: string): Promise<void> {
  if (!token) return;
  await ensureAdminSessionsTable();
  const tokenHash = hashSessionToken(token);
  await pool.query("DELETE FROM admin_sessions WHERE token_hash = ?", [tokenHash]);
}

export async function getAdminSession(req: NextApiRequest): Promise<AdminIdentity | null> {
  const token = readAdminSessionToken(req);
  if (!token) return null;

  await ensureAdminSessionsTable();
  const tokenHash = hashSessionToken(token);

  const [rows]: any = await pool.query(
    `SELECT id, staff_id, principal_type, principal_name, role, expires_at
     FROM admin_sessions
     WHERE token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await pool.query("DELETE FROM admin_sessions WHERE id = ?", [row.id]).catch(() => {});
    return null;
  }

  if (!isAdminRole(row.role)) {
    await pool.query("DELETE FROM admin_sessions WHERE id = ?", [row.id]).catch(() => {});
    return null;
  }

  // Staff sessions: re-validate active account + current role from DB
  if (row.principal_type === "staff") {
    if (!row.staff_id) {
      await pool.query("DELETE FROM admin_sessions WHERE id = ?", [row.id]).catch(() => {});
      return null;
    }
    await ensureAdminStaffTable();
    const [staffRows]: any = await pool.query(
      `SELECT id, name, email, role, active
       FROM admin_staff
       WHERE id = ?
       LIMIT 1`,
      [row.staff_id]
    );
    const staff = Array.isArray(staffRows) && staffRows[0] ? staffRows[0] : null;
    if (!staff || Number(staff.active) !== 1 || !isAdminRole(staff.role)) {
      await pool.query("DELETE FROM admin_sessions WHERE id = ?", [row.id]).catch(() => {});
      return null;
    }

    // Keep session role in sync if staff role changed
    if (staff.role !== row.role) {
      await pool
        .query("UPDATE admin_sessions SET role = ?, last_seen_at = NOW() WHERE id = ?", [
          staff.role,
          row.id,
        ])
        .catch(() => {});
    } else {
      await pool
        .query("UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = ?", [row.id])
        .catch(() => {});
    }

    return {
      authenticated: true,
      principalType: "staff",
      staffId: Number(staff.id),
      name: String(staff.name || row.principal_name),
      email: staff.email ? String(staff.email) : undefined,
      role: staff.role,
      sessionId: Number(row.id),
    };
  }

  // Master sessions: trusted super_admin only
  if (row.principal_type === "master" && row.role === "super_admin") {
    await pool
      .query("UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = ?", [row.id])
      .catch(() => {});
    return {
      authenticated: true,
      principalType: "master",
      name: String(row.principal_name || "Admin"),
      role: "super_admin",
      sessionId: Number(row.id),
    };
  }

  await pool.query("DELETE FROM admin_sessions WHERE id = ?", [row.id]).catch(() => {});
  return null;
}

export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  options?: { mutate?: boolean }
): Promise<AdminIdentity | null> {
  if (options?.mutate !== false && req.method !== "GET" && req.method !== "HEAD") {
    if (!assertSameOriginMutation(req)) {
      res.status(403).json({ error: "Forbidden: invalid origin" });
      return null;
    }
  }

  const identity = await getAdminSession(req);
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return identity;
}

export async function requireAdminRole(
  req: NextApiRequest,
  res: NextApiResponse,
  allowedRoles: AdminRole[],
  options?: { mutate?: boolean }
): Promise<AdminIdentity | null> {
  const identity = await requireAdmin(req, res, options);
  if (!identity) return null;
  if (!allowedRoles.includes(identity.role)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return identity;
}

/** Public-safe identity payload for /api/admin-session */
export function publicAdminIdentity(identity: AdminIdentity) {
  return {
    authenticated: true as const,
    name: identity.name,
    role: identity.role,
    principalType: identity.principalType,
    email: identity.email || null,
  };
}

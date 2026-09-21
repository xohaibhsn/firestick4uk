import type { NextApiRequest, NextApiResponse } from "next";
import { RL_AUTH, getClientIp } from "../../lib/rateLimit";
import pool from "../../lib/db";
import {
  createAdminSession,
  getRequestMeta,
  hashStaffPassword,
  isAdminRole,
  normalizeStaffEmail,
  setAdminSessionCookie,
  verifyStaffPassword,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import {
  readRecoveryAuthConfigFromEnv,
  verifyRecoveryAdminPassword,
} from "../../lib/recoveryAdminAuth";

const PUBLIC_INVALID = "Invalid email or password";
const PUBLIC_AUTH_UNAVAILABLE = "Authentication unavailable";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const limitResult = RL_AUTH(getClientIp(req));
  if (!limitResult.allowed) {
    const retryAfter = Math.max(1, Number(limitResult.retryAfterSec) || 900);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      success: false,
      error: "Too many login attempts. Try again in 15 minutes.",
    });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: PUBLIC_INVALID });
  }

  const meta = getRequestMeta(req);
  const loginId = String(username).trim();

  try {
    const email = normalizeStaffEmail(loginId);
    const [rows]: any = await pool.query(
      "SELECT id, name, email, role, active, password_hash FROM admin_staff WHERE email = ? LIMIT 1",
      [email]
    );

    if (Array.isArray(rows) && rows.length) {
      const staff = rows[0];

      // Uniform public message — do not reveal inactive / invalid role before auth
      if (Number(staff.active) !== 1 || !isAdminRole(staff.role)) {
        return res.status(401).json({ success: false, error: PUBLIC_INVALID });
      }

      const verified = await verifyStaffPassword(String(password), String(staff.password_hash || ""));
      if (!verified.ok) {
        return res.status(401).json({ success: false, error: PUBLIC_INVALID });
      }

      if (verified.needsUpgrade) {
        const bcryptHash = await hashStaffPassword(String(password));
        await pool.query(
          `UPDATE admin_staff
           SET password_hash = ?, password_changed_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [bcryptHash, staff.id]
        );
      }

      await pool.query("UPDATE admin_staff SET last_login_at = NOW(), updated_at = NOW() WHERE id = ?", [
        staff.id,
      ]);

      const { token } = await createAdminSession({
        principalType: "staff",
        principalName: String(staff.name || "Staff"),
        role: staff.role,
        staffId: Number(staff.id),
        email: String(staff.email || ""),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      setAdminSessionCookie(res, token, req);
      await recordAdminAudit({
        actor: {
          principalType: "staff",
          staffId: Number(staff.id),
          name: String(staff.name || "Staff"),
          role: staff.role,
        },
        action: "auth.login",
        entityType: "session",
        entityId: staff.id,
        summary: "Admin signed in",
        metadata: { principal: "staff" },
        ip: meta.ip,
      });
      return res.status(200).json({
        success: true,
        role: staff.role,
        name: staff.name,
        principalType: "staff",
        staffUser: true,
      });
    }
  } catch {
    /* DB not ready — fall through to master admin check */
  }

  // ── Recovery Admin (username must be 'admin') ─────────────────────────────
  if (loginId.toLowerCase() !== "admin") {
    return res.status(401).json({ success: false, error: PUBLIC_INVALID });
  }

  const recovery = await verifyRecoveryAdminPassword(
    String(password),
    readRecoveryAuthConfigFromEnv()
  );

  if (recovery.configError) {
    console.error("[admin-login] recovery auth configuration invalid");
    return res.status(500).json({ success: false, error: PUBLIC_AUTH_UNAVAILABLE });
  }

  if (recovery.ignoredMalformedHash) {
    console.error("[admin-login] recovery auth configuration invalid");
  }

  if (!recovery.ok) {
    return res.status(401).json({ success: false, error: PUBLIC_INVALID });
  }

  if (recovery.legacy) {
    console.warn("[admin-login] legacy recovery admin credential mode in use");
  }

  try {
    const { token } = await createAdminSession({
      principalType: "master",
      principalName: "Admin",
      role: "super_admin",
      staffId: null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    setAdminSessionCookie(res, token, req);
    await recordAdminAudit({
      actor: {
        principalType: "master",
        staffId: null,
        name: "Admin",
        role: "super_admin",
      },
      action: "auth.login",
      entityType: "session",
      entityId: null,
      summary: "Admin signed in",
      metadata: { principal: "master" },
      ip: meta.ip,
    });
    return res.status(200).json({
      success: true,
      role: "super_admin",
      name: "Admin",
      principalType: "master",
    });
  } catch {
    console.error("[admin-login] session create failed");
    return res.status(500).json({ success: false, error: PUBLIC_AUTH_UNAVAILABLE });
  }
}

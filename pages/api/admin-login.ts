import type { NextApiRequest, NextApiResponse } from "next";
import { RL_AUTH, getClientIp } from "../../lib/rateLimit";
import pool from "../../lib/db";
import {
  createAdminSession,
  ensureAdminSessionsTable,
  ensureAdminStaffTable,
  getRequestMeta,
  hashStaffPassword,
  isAdminRole,
  normalizeStaffEmail,
  setAdminSessionCookie,
  sha256Hex,
  verifyStaffPassword,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { allowed } = RL_AUTH(getClientIp(req));
  if (!allowed) {
    return res.status(429).json({ success: false, error: "Too many login attempts. Try again in 15 minutes." });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Invalid email or password" });
  }

  const meta = getRequestMeta(req);
  const loginId = String(username).trim();

  try {
    await ensureAdminStaffTable();
    await ensureAdminSessionsTable();

    const email = normalizeStaffEmail(loginId);
    const [rows]: any = await pool.query(
      "SELECT id, name, email, role, active, password_hash FROM admin_staff WHERE email = ? LIMIT 1",
      [email]
    );

    if (Array.isArray(rows) && rows.length) {
      const staff = rows[0];

      if (Number(staff.active) !== 1) {
        return res.status(401).json({ success: false, error: "Account disabled" });
      }

      if (!isAdminRole(staff.role)) {
        return res.status(401).json({ success: false, error: "Invalid email or password" });
      }

      const verified = await verifyStaffPassword(String(password), String(staff.password_hash || ""));
      if (!verified.ok) {
        return res.status(401).json({ success: false, error: "Invalid email or password" });
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

  // ── Master admin login (username must be 'admin') ─────────────────────────
  if (loginId.toLowerCase() !== "admin") {
    return res.status(401).json({ success: false, error: "Invalid email or password" });
  }

  const hashEnv = process.env.ADMIN_PASSWORD_HASH;
  const sha256Env = process.env.ADMIN_PASSWORD_SHA256;
  const plainEnv = process.env.ADMIN_PASSWORD;

  let masterOk = false;

  if (sha256Env) {
    if (sha256Hex(String(password)) === sha256Env) masterOk = true;
  }

  if (!masterOk && hashEnv && hashEnv.startsWith("$2")) {
    try {
      const bcrypt = require("bcryptjs");
      const match = await bcrypt.compare(String(password), hashEnv);
      if (match) masterOk = true;
    } catch {
      /* ignore */
    }
  }

  if (!masterOk && plainEnv && String(password) === plainEnv) {
    masterOk = true;
  }

  if (!hashEnv && !sha256Env && !plainEnv) {
    return res.status(500).json({ success: false, error: "Server not configured" });
  }

  if (!masterOk) {
    return res.status(401).json({ success: false, error: "Invalid email or password" });
  }

  try {
    await ensureAdminSessionsTable();
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
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || "Session create failed" });
  }
}

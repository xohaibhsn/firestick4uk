import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { RL_AUTH, getClientIp } from "../../lib/rateLimit";
import pool from "../../lib/db";
import {
  createAdminSession,
  ensureAdminSessionsTable,
  ensureAdminStaffTable,
  getRequestMeta,
  isAdminRole,
  setAdminSessionCookie,
} from "../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { allowed } = RL_AUTH(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: "Missing credentials" });

  const meta = getRequestMeta(req);

  try {
    await ensureAdminStaffTable();
    await ensureAdminSessionsTable();

    // ── Staff login (multi-user RBAC) ───────────────────────────────────────
    const inputHash = crypto.createHash("sha256").update(String(password)).digest("hex");
    const [rows]: any = await pool.query(
      "SELECT id, name, email, role FROM admin_staff WHERE email=? AND password_hash=? AND active=1",
      [username, inputHash]
    );
    if (Array.isArray(rows) && rows.length) {
      const staff = rows[0];
      if (!isAdminRole(staff.role)) {
        return res.status(401).json({ success: false });
      }
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
  if (username !== "admin") {
    return res.status(401).json({ success: false });
  }

  const hashEnv = process.env.ADMIN_PASSWORD_HASH;
  const sha256Env = process.env.ADMIN_PASSWORD_SHA256;
  const plainEnv = process.env.ADMIN_PASSWORD;

  let masterOk = false;

  if (sha256Env) {
    const inputHash = crypto.createHash("sha256").update(String(password)).digest("hex");
    if (inputHash === sha256Env) masterOk = true;
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
    return res.status(401).json({ success: false });
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

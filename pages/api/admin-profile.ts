import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import {
  clearAdminSessionCookie,
  getRequestMeta,
  hashStaffPassword,
  readAdminSessionToken,
  requireAdmin,
  validateStaffPassword,
  verifyStaffPassword,
  destroyAdminSessionByToken,
} from "../../lib/adminAuth";
import { applyStaffPasswordChange } from "../../lib/adminStaffPasswordTx";
import { recordAdminAudit } from "../../lib/adminAudit";
import { setAdminNoStore } from "../../lib/adminNoStore";

/** Own profile + password change for authenticated admin. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") setAdminNoStore(res);
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      if (admin.principalType === "master") {
        return res.status(200).json({
          principalType: "master",
          name: admin.name,
          role: admin.role,
          email: null,
          last_login_at: null,
          passwordManagedByEnv: true,
        });
      }

      const [rows]: any = await pool.query(
        `SELECT name, email, role, last_login_at
         FROM admin_staff WHERE id = ? LIMIT 1`,
        [admin.staffId]
      );
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      return res.status(200).json({
        principalType: "staff",
        name: row?.name || admin.name,
        email: row?.email || admin.email || null,
        role: row?.role || admin.role,
        last_login_at: row?.last_login_at || null,
        passwordManagedByEnv: false,
      });
    }

    if (req.method === "POST") {
      // Change own password
      if (admin.principalType === "master") {
        return res.status(400).json({
          error: "Master Administrator password is managed via server environment and cannot be changed here",
          passwordManagedByEnv: true,
        });
      }

      if (!admin.staffId) {
        return res.status(400).json({ error: "Staff identity required" });
      }

      const { current_password, new_password, confirm_password } = req.body || {};
      if (!current_password || !new_password) {
        return res.status(400).json({ error: "Current and new password are required" });
      }
      if (String(new_password) !== String(confirm_password || "")) {
        return res.status(400).json({ error: "Passwords do not match" });
      }

      const pwError = validateStaffPassword(new_password);
      if (pwError) return res.status(400).json({ error: pwError });

      const [rows]: any = await pool.query(
        "SELECT id, password_hash FROM admin_staff WHERE id = ? AND active = 1 LIMIT 1",
        [admin.staffId]
      );
      const staff = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!staff) return res.status(401).json({ error: "Unauthorized" });

      const verified = await verifyStaffPassword(
        String(current_password),
        String(staff.password_hash || "")
      );
      if (!verified.ok) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      const passwordHash = await hashStaffPassword(String(new_password));
      const applied = await applyStaffPasswordChange(admin.staffId, passwordHash, {
        expectedHash: String(staff.password_hash || ""),
        requireActive: true,
      });
      if (!applied.ok) {
        if (applied.code === "stale") {
          return res.status(409).json({
            error:
              "Your password was changed elsewhere. Please sign in again and retry.",
            code: "stale",
          });
        }
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = readAdminSessionToken(req);
      if (token) await destroyAdminSessionByToken(token).catch(() => {});
      clearAdminSessionCookie(res, req);

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "profile.password_changed",
        entityType: "staff",
        entityId: admin.staffId,
        summary: "Admin changed own password",
        ip,
      });

      return res.status(200).json({
        success: true,
        reLoginRequired: true,
        message: "Password changed. Please sign in again.",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    const errCode = typeof error?.code === "string" ? error.code : undefined;
    const errName = typeof error?.name === "string" ? error.name : "Error";
    console.error("[admin-profile] failed", errCode || errName);
    return res.status(500).json({ error: "Request failed" });
  }
}

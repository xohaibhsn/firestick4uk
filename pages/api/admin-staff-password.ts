import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import {
  destroyAdminSessionsForStaff,
  getRequestMeta,
  hashStaffPassword,
  requireAdminPermission,
  validateStaffPassword,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";

/** Super Admin: reset another staff user's password (no old password required). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdminPermission(req, res, "staff.manage");
  if (!admin) return;

  try {
    const { id, new_password, confirm_password } = req.body || {};
    const staffId = Number(id);
    if (!Number.isFinite(staffId) || staffId <= 0) {
      return res.status(400).json({ error: "Staff ID required" });
    }

    if (String(new_password || "") !== String(confirm_password || "")) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const pwError = validateStaffPassword(new_password);
    if (pwError) return res.status(400).json({ error: pwError });

    const [rows]: any = await pool.query(
      "SELECT id FROM admin_staff WHERE id = ? LIMIT 1",
      [staffId]
    );
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({ error: "Staff user not found" });
    }

    const passwordHash = await hashStaffPassword(String(new_password));
    await pool.query(
      `UPDATE admin_staff
       SET password_hash = ?, password_changed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, staffId]
    );
    await destroyAdminSessionsForStaff(staffId);

    const { ip } = getRequestMeta(req);
    await recordAdminAudit({
      actor: admin,
      action: "staff.password_reset",
      entityType: "staff",
      entityId: staffId,
      summary: "Staff password reset by Super Admin",
      metadata: { target_staff_id: staffId },
      ip,
    });

    return res.status(200).json({ success: true, sessionsRevoked: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Password reset failed" });
  }
}

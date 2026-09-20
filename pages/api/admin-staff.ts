import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import {
  destroyAdminSessionsForStaff,
  getRequestMeta,
  hashStaffPassword,
  isAdminRole,
  isValidStaffEmail,
  normalizeStaffEmail,
  requireAdminPermission,
  validateStaffPassword,
  wouldLeaveZeroActiveSuperAdmins,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";

function parseActive(value: unknown, fallback = 1): 0 | 1 {
  if (value === undefined || value === null || value === "") return fallback as 0 | 1;
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

function safeStaffRow(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    email: String(row.email || ""),
    role: row.role,
    active: Number(row.active) === 1 ? 1 : 0,
    last_login_at: row.last_login_at || null,
    password_changed_at: row.password_changed_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdminPermission(req, res, "staff.manage");
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const [rows]: any = await pool.query(
        `SELECT id, name, email, role, active, last_login_at, password_changed_at, created_at, updated_at
         FROM admin_staff
         ORDER BY created_at DESC`
      );
      const list = Array.isArray(rows) ? rows.map(safeStaffRow) : [];
      return res.status(200).json(list);
    }

    if (req.method === "POST") {
      const { name, email, password, role, active } = req.body || {};
      const trimmedName = String(name || "").trim();
      const normalizedEmail = normalizeStaffEmail(email);

      if (!trimmedName) return res.status(400).json({ error: "Name is required" });
      if (!isValidStaffEmail(normalizedEmail)) return res.status(400).json({ error: "Valid email is required" });

      const pwError = validateStaffPassword(password);
      if (pwError) return res.status(400).json({ error: pwError });

      if (!isAdminRole(role)) return res.status(400).json({ error: "Invalid role" });

      const activeFlag = parseActive(active, 1);
      const passwordHash = await hashStaffPassword(String(password));

      try {
        const [result]: any = await pool.query(
          `INSERT INTO admin_staff
            (name, email, password_hash, role, active, password_changed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [trimmedName, normalizedEmail, passwordHash, role, activeFlag]
        );
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: "staff.created",
          entityType: "staff",
          entityId: result.insertId,
          summary: `Created staff user ${trimmedName}`,
          metadata: { target_email: normalizedEmail, target_role: role, active: activeFlag },
          ip,
        });
        return res.status(200).json({ success: true, id: result.insertId });
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "A staff user with this email already exists" });
        }
        throw err;
      }
    }

    if (req.method === "PUT") {
      const { id, name, email, role, active } = req.body || {};
      const staffId = Number(id);
      if (!Number.isFinite(staffId) || staffId <= 0) {
        return res.status(400).json({ error: "ID required" });
      }

      const [existingRows]: any = await pool.query(
        "SELECT id, name, email, role, active FROM admin_staff WHERE id = ? LIMIT 1",
        [staffId]
      );
      const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
      if (!existing) return res.status(404).json({ error: "Staff user not found" });

      const trimmedName = String(name ?? existing.name).trim();
      const normalizedEmail = normalizeStaffEmail(email ?? existing.email);
      const nextRole = isAdminRole(role) ? role : existing.role;
      const nextActive = parseActive(active, Number(existing.active));

      if (!trimmedName) return res.status(400).json({ error: "Name is required" });
      if (!isValidStaffEmail(normalizedEmail)) return res.status(400).json({ error: "Valid email is required" });
      if (!isAdminRole(nextRole)) return res.status(400).json({ error: "Invalid role" });

      // Self-disable guard
      if (admin.principalType === "staff" && admin.staffId === staffId && nextActive === 0) {
        return res.status(400).json({ error: "You cannot disable your own account" });
      }

      // Last active super_admin / self-demote lockout
      if (
        await wouldLeaveZeroActiveSuperAdmins(staffId, {
          role: nextRole,
          active: nextActive,
        })
      ) {
        return res.status(400).json({
          error: "Cannot demote or disable the last active Super Admin",
        });
      }

      try {
        await pool.query(
          `UPDATE admin_staff
           SET name = ?, email = ?, role = ?, active = ?, updated_at = NOW()
           WHERE id = ?`,
          [trimmedName, normalizedEmail, nextRole, nextActive, staffId]
        );
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "A staff user with this email already exists" });
        }
        throw err;
      }

      // Revoke sessions when disabling
      if (nextActive === 0) {
        await destroyAdminSessionsForStaff(staffId);
      }

      const changedFields: string[] = [];
      if (trimmedName !== existing.name) changedFields.push("name");
      if (normalizedEmail !== existing.email) changedFields.push("email");
      if (nextRole !== existing.role) changedFields.push("role");
      if (nextActive !== Number(existing.active)) changedFields.push("active");

      const { ip } = getRequestMeta(req);
      let action = "staff.updated";
      let summary = `Updated staff user ${trimmedName}`;
      if (nextActive === 0 && Number(existing.active) === 1) {
        action = "staff.disabled";
        summary = `Disabled staff user ${trimmedName}`;
      } else if (nextActive === 1 && Number(existing.active) === 0) {
        action = "staff.enabled";
        summary = `Enabled staff user ${trimmedName}`;
      }

      await recordAdminAudit({
        actor: admin,
        action,
        entityType: "staff",
        entityId: staffId,
        summary,
        metadata: {
          target_email: normalizedEmail,
          target_role: nextRole,
          changed_fields: changedFields,
        },
        ip,
      });

      return res.status(200).json({ success: true });
    }

    if (req.method === "DELETE") {
      const staffId = Number(req.query.id);
      if (!Number.isFinite(staffId) || staffId <= 0) {
        return res.status(400).json({ error: "ID required" });
      }

      const [existingRows]: any = await pool.query(
        "SELECT id, name, email, role, active FROM admin_staff WHERE id = ? LIMIT 1",
        [staffId]
      );
      const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
      if (!existing) return res.status(404).json({ error: "Staff user not found" });

      if (admin.principalType === "staff" && admin.staffId === staffId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }

      if (await wouldLeaveZeroActiveSuperAdmins(staffId, { deleting: true })) {
        return res.status(400).json({ error: "Cannot delete the last active Super Admin" });
      }

      await destroyAdminSessionsForStaff(staffId);
      await pool.query("DELETE FROM admin_staff WHERE id = ?", [staffId]);
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "staff.deleted",
        entityType: "staff",
        entityId: staffId,
        summary: `Deleted staff user ${existing.name || staffId}`,
        metadata: { target_email: existing.email, target_role: existing.role },
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Staff request failed" });
  }
}

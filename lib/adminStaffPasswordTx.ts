import pool from "./db";

export type ApplyStaffPasswordChangeResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "stale" };

/**
 * Atomically update a staff password hash and revoke that user's sessions
 * on one connection / one transaction.
 *
 * Callers must compute `passwordHash` (bcrypt) BEFORE invoking this helper
 * so the row lock is not held during hashing.
 */
export async function applyStaffPasswordChange(
  staffId: number,
  passwordHash: string,
  opts?: { expectedHash?: string; requireActive?: boolean }
): Promise<ApplyStaffPasswordChangeResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      "SELECT id, password_hash, active FROM admin_staff WHERE id = ? FOR UPDATE",
      [staffId]
    );
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row || (opts?.requireActive && Number(row.active) !== 1)) {
      await conn.rollback();
      return { ok: false, code: "not_found" };
    }
    if (
      opts?.expectedHash !== undefined &&
      String(row.password_hash || "") !== opts.expectedHash
    ) {
      await conn.rollback();
      return { ok: false, code: "stale" };
    }
    await conn.query(
      `UPDATE admin_staff
       SET password_hash = ?, password_changed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, staffId]
    );
    await conn.query("DELETE FROM admin_sessions WHERE staff_id = ?", [staffId]);
    await conn.commit();
    return { ok: true };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}

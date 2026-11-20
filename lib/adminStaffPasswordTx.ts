import pool from "./db";
import {
  ADMIN_SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  isAdminRole,
  type AdminRole,
} from "./adminAuth";

export type ApplyStaffPasswordChangeResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "stale" };

export type CreateStaffSessionIfUnchangedInput = {
  staffId: number;
  verifiedHash: string;
  upgradeHash?: string | null;
  principalName: string;
  role: AdminRole | string;
  ip?: string;
  userAgent?: string;
};

export type CreateStaffSessionIfUnchangedResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; code: "changed" | "inactive" | "not_found" };

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

/**
 * Atomically re-check the staff password hash (and active/role) under a row
 * lock, optionally upgrade the hash, stamp last_login, and create a session
 * on one connection / one transaction.
 *
 * Callers must run bcrypt verify (+ optional upgrade hash) BEFORE invoking
 * so the row lock is not held during hashing.
 */
export async function createStaffSessionIfUnchanged(
  input: CreateStaffSessionIfUnchangedInput
): Promise<CreateStaffSessionIfUnchangedResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(
      "SELECT id, password_hash, active, role FROM admin_staff WHERE id = ? FOR UPDATE",
      [input.staffId]
    );
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) {
      await conn.rollback();
      return { ok: false, code: "not_found" };
    }
    if (Number(row.active) !== 1 || !isAdminRole(row.role)) {
      await conn.rollback();
      return { ok: false, code: "inactive" };
    }
    if (String(row.password_hash || "") !== input.verifiedHash) {
      await conn.rollback();
      return { ok: false, code: "changed" };
    }
    if (input.upgradeHash) {
      await conn.query(
        `UPDATE admin_staff
         SET password_hash = ?, password_changed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [input.upgradeHash, input.staffId]
      );
    }
    await conn.query(
      "UPDATE admin_staff SET last_login_at = NOW(), updated_at = NOW() WHERE id = ?",
      [input.staffId]
    );
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
    await conn.query(
      `INSERT INTO admin_sessions
        (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        tokenHash,
        input.staffId,
        "staff",
        input.principalName,
        input.role,
        expiresAt,
        input.ip || null,
        input.userAgent || null,
      ]
    );
    await conn.commit();
    try {
      await pool.query("DELETE FROM admin_sessions WHERE expires_at < NOW() LIMIT 200");
    } catch {
      /* ignore */
    }
    return { ok: true, token, expiresAt };
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

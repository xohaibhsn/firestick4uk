import type { PoolConnection } from "mysql2/promise";
import pool from "./db";

/** MySQL GET_LOCK timed out or failed (result ≠ 1). */
export class LockTimeoutError extends Error {
  readonly lockName: string;

  constructor(lockName: string) {
    super(`Lock busy or unavailable: ${lockName}`);
    this.name = "LockTimeoutError";
    this.lockName = lockName;
  }
}

export const LOCK_ADMIN_STAFF = "f4uk_admin_staff";
export const LOCK_REDIRECTS = "f4uk_redirects";
export const LOCK_SEO_ISSUE_RECONCILE = "f4uk_seo_issue_reconcile";

/**
 * Acquire a MySQL named advisory lock on a dedicated pool connection,
 * run `fn`, then always RELEASE_LOCK + release the connection.
 */
export async function withNamedLock<T>(
  name: string,
  timeoutSec: number,
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.query("SELECT GET_LOCK(?, ?) AS got", [
      name,
      timeoutSec,
    ]);
    const got = Array.isArray(rows) ? Number(rows[0]?.got) : NaN;
    if (got !== 1) {
      throw new LockTimeoutError(name);
    }
    return await fn(conn);
  } finally {
    try {
      await conn.query("SELECT RELEASE_LOCK(?)", [name]);
    } catch {
      // best-effort release
    }
    conn.release();
  }
}

/** Acquire GET_LOCK on an existing connection (same conn as the caller's transaction). */
export async function acquireNamedLockOnConn(
  conn: PoolConnection,
  name: string,
  timeoutSec: number
): Promise<void> {
  const [rows]: any = await conn.query("SELECT GET_LOCK(?, ?) AS got", [
    name,
    timeoutSec,
  ]);
  const got = Array.isArray(rows) ? Number(rows[0]?.got) : NaN;
  if (got !== 1) {
    throw new LockTimeoutError(name);
  }
}

/** Best-effort RELEASE_LOCK on an existing connection. Never throws. */
export async function releaseNamedLockOnConn(
  conn: PoolConnection,
  name: string
): Promise<boolean> {
  try {
    await conn.query("SELECT RELEASE_LOCK(?)", [name]);
    return true;
  } catch {
    return false;
  }
}

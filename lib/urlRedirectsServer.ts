/**
 * Server-only Redirect Manager DB helpers.
 * Table must exist via scripts/migrate-url-redirects.js — no runtime DDL.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import {
  safeRedirectRow,
  type UrlRedirectGraphRule,
  type UrlRedirectRow,
  type UrlRedirectTypeV1,
} from "@/lib/urlRedirects";

type Queryable = typeof pool;

export async function listRedirects(conn: Queryable = pool): Promise<UrlRedirectRow[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, source_path, destination_path, redirect_type, active, created_at, updated_at
     FROM url_redirects
     ORDER BY updated_at DESC, id DESC`
  );
  return Array.isArray(rows) ? rows.map(safeRedirectRow) : [];
}

export async function getRedirectById(
  id: number,
  conn: Queryable = pool
): Promise<UrlRedirectRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, source_path, destination_path, redirect_type, active, created_at, updated_at
     FROM url_redirects
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row ? safeRedirectRow(row) : null;
}

export async function loadActiveRedirects(conn: Queryable = pool): Promise<UrlRedirectRow[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, source_path, destination_path, redirect_type, active, created_at, updated_at
     FROM url_redirects
     WHERE active = 1
     ORDER BY id ASC`
  );
  return Array.isArray(rows) ? rows.map(safeRedirectRow) : [];
}

/** All rows as graph rules for create/update validation (active + inactive). */
export async function loadRedirectGraphRules(conn: Queryable = pool): Promise<UrlRedirectGraphRule[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, source_path, destination_path, active
     FROM url_redirects`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: Number(r.id),
    source_path: String(r.source_path || ""),
    destination_path: String(r.destination_path || ""),
    active: Number(r.active) === 1 ? 1 : 0,
  }));
}

export async function createRedirect(
  input: {
    source_path: string;
    destination_path: string;
    redirect_type: UrlRedirectTypeV1;
    active: 0 | 1;
  },
  conn: Queryable = pool
): Promise<number> {
  const [result] = await conn.query<ResultSetHeader>(
    `INSERT INTO url_redirects
      (source_path, destination_path, redirect_type, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [input.source_path, input.destination_path, input.redirect_type, input.active]
  );
  return Number(result.insertId);
}

export async function updateRedirect(
  id: number,
  input: {
    source_path: string;
    destination_path: string;
    redirect_type: UrlRedirectTypeV1;
    active: 0 | 1;
  },
  conn: Queryable = pool
): Promise<boolean> {
  const [result] = await conn.query<ResultSetHeader>(
    `UPDATE url_redirects
     SET source_path = ?, destination_path = ?, redirect_type = ?, active = ?, updated_at = NOW()
     WHERE id = ?`,
    [input.source_path, input.destination_path, input.redirect_type, input.active, id]
  );
  return Number(result.affectedRows || 0) > 0;
}

export async function deleteRedirect(id: number, conn: Queryable = pool): Promise<boolean> {
  const [result] = await conn.query<ResultSetHeader>(`DELETE FROM url_redirects WHERE id = ?`, [id]);
  return Number(result.affectedRows || 0) > 0;
}

/**
 * Server-only controlled product URL migration.
 * One transactional change: product slug + permanent one-hop redirect.
 * No DDL. No commercial field mutation. Fail-closed on partial failure.
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { recordContentRevision, snapshotProduct } from "@/lib/contentRevisions";
import type { AdminIdentity } from "@/lib/adminAuth";
import {
  isExactActiveRedirect,
  toProductSlug,
  validateProductUrlMigrationRequest,
  type ProductUrlMigrationPaths,
} from "@/lib/productUrlMigration";
import {
  createRedirect,
  loadRedirectGraphRules,
} from "@/lib/urlRedirectsServer";
import { URL_REDIRECT_TYPE_V1 } from "@/lib/urlRedirects";
import { invalidateSitemapCache } from "@/lib/hostingerResourceInvalidation";

export type MigrateProductUrlInput = {
  productId: number;
  expectedOldSlug: string;
  newSlug: string;
  actor: AdminIdentity;
};

export type MigrateProductUrlResult =
  | {
      ok: true;
      alreadyMigrated: boolean;
      productId: number;
      oldSlug: string;
      newSlug: string;
      sourcePath: string;
      destinationPath: string;
      redirectId: number | null;
      preserved: {
        name: string;
        price: string | number;
        category: string;
        active: number;
        stock: string | null;
        image: string | null;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
    };

function commercialFingerprint(row: RowDataPacket) {
  return {
    name: String(row.name || ""),
    price: row.price,
    category: String(row.category || ""),
    active: Number(row.active) === 1 ? 1 : 0,
    stock: row.stock == null ? null : String(row.stock),
    image: row.image == null ? null : String(row.image),
  };
}

async function findRedirectId(
  conn: PoolConnection,
  sourcePath: string,
  destinationPath: string
): Promise<number | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM url_redirects
     WHERE source_path = ? AND destination_path = ? AND active = 1
     LIMIT 1`,
    [sourcePath, destinationPath]
  );
  const id = Array.isArray(rows) && rows[0] ? Number(rows[0].id) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function migrateProductUrl(
  input: MigrateProductUrlInput
): Promise<MigrateProductUrlResult> {
  const precheck = validateProductUrlMigrationRequest(
    {
      productId: input.productId,
      expectedOldSlug: input.expectedOldSlug,
      newSlug: input.newSlug,
    },
    []
  );
  if (!precheck.ok) {
    return {
      ok: false,
      status: precheck.code === "conflict" ? 409 : 400,
      error: precheck.error,
      code: precheck.code,
    };
  }

  const paths: ProductUrlMigrationPaths = precheck.paths;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [lockedRows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM products WHERE id = ? LIMIT 1 FOR UPDATE`,
      [paths.productId]
    );
    const current = Array.isArray(lockedRows) && lockedRows[0] ? lockedRows[0] : null;
    if (!current) {
      await conn.rollback();
      return { ok: false, status: 404, error: "Product not found", code: "not_found" };
    }

    const currentSlug = toProductSlug(current.slug) || String(current.slug || "").trim();
    const graph = await loadRedirectGraphRules(conn);

    // Idempotent: already on destination with exact redirect present.
    if (currentSlug === paths.newSlug) {
      const redirectOk = isExactActiveRedirect(
        graph,
        paths.sourcePath,
        paths.destinationPath
      );
      if (redirectOk) {
        const redirectId = await findRedirectId(conn, paths.sourcePath, paths.destinationPath);
        await conn.commit();
        return {
          ok: true,
          alreadyMigrated: true,
          productId: paths.productId,
          oldSlug: paths.expectedOldSlug,
          newSlug: paths.newSlug,
          sourcePath: paths.sourcePath,
          destinationPath: paths.destinationPath,
          redirectId,
          preserved: commercialFingerprint(current),
        };
      }

      // Repair path: slug already moved; ensure exact redirect exists.
      const repairValidate = validateProductUrlMigrationRequest(
        {
          productId: paths.productId,
          expectedOldSlug: paths.expectedOldSlug,
          newSlug: paths.newSlug,
        },
        graph
      );
      if (!repairValidate.ok && !isExactActiveRedirect(graph, paths.sourcePath, paths.destinationPath)) {
        await conn.rollback();
        return {
          ok: false,
          status: repairValidate.code === "conflict" ? 409 : 400,
          error: repairValidate.error,
          code: repairValidate.code,
        };
      }

      let redirectId: number | null = null;
      try {
        redirectId = await createRedirect(
          {
            source_path: paths.sourcePath,
            destination_path: paths.destinationPath,
            redirect_type: URL_REDIRECT_TYPE_V1,
            active: 1,
          },
          conn
        );
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          await conn.rollback();
          return {
            ok: false,
            status: 409,
            error: "A redirect with this source path already exists",
            code: "conflict",
          };
        }
        throw err;
      }

      await conn.commit();
      invalidateSitemapCache();
      return {
        ok: true,
        alreadyMigrated: false,
        productId: paths.productId,
        oldSlug: paths.expectedOldSlug,
        newSlug: paths.newSlug,
        sourcePath: paths.sourcePath,
        destinationPath: paths.destinationPath,
        redirectId,
        preserved: commercialFingerprint(current),
      };
    }

    if (currentSlug !== paths.expectedOldSlug) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: `Product slug mismatch. Expected "${paths.expectedOldSlug}" but found "${currentSlug}"`,
        code: "slug_mismatch",
      };
    }

    const [collisionRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, slug FROM products WHERE slug = ? AND id <> ? LIMIT 1`,
      [paths.newSlug, paths.productId]
    );
    if (Array.isArray(collisionRows) && collisionRows[0]) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: "Destination slug is already used by another product",
        code: "slug_collision",
      };
    }

    const exactRedirectExists = isExactActiveRedirect(
      graph,
      paths.sourcePath,
      paths.destinationPath
    );
    if (!exactRedirectExists) {
      const redirectValidate = validateProductUrlMigrationRequest(
        {
          productId: paths.productId,
          expectedOldSlug: paths.expectedOldSlug,
          newSlug: paths.newSlug,
        },
        graph
      );
      if (!redirectValidate.ok) {
        await conn.rollback();
        return {
          ok: false,
          status: redirectValidate.code === "conflict" ? 409 : 400,
          error: redirectValidate.error,
          code: redirectValidate.code,
        };
      }
    }

    await recordContentRevision(
      {
        entityType: "product",
        entityId: paths.productId,
        entityLabel: String(current.name || ""),
        revisionAction: "update",
        snapshot: snapshotProduct(current as Record<string, unknown>),
        changedFields: ["slug"],
        actor: input.actor,
      },
      conn
    );

    const [updateResult] = await conn.query<ResultSetHeader>(
      `UPDATE products SET slug = ? WHERE id = ? AND slug = ?`,
      [paths.newSlug, paths.productId, current.slug]
    );
    if (Number(updateResult.affectedRows || 0) !== 1) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: "Concurrent product slug change detected; migration aborted",
        code: "concurrent_conflict",
      };
    }

    let redirectId: number | null = null;
    if (exactRedirectExists) {
      redirectId = await findRedirectId(conn, paths.sourcePath, paths.destinationPath);
    } else {
      try {
        redirectId = await createRedirect(
          {
            source_path: paths.sourcePath,
            destination_path: paths.destinationPath,
            redirect_type: URL_REDIRECT_TYPE_V1,
            active: 1,
          },
          conn
        );
      } catch (err: any) {
        // Fail closed: never leave slug changed without its redirect.
        await conn.rollback();
        if (err?.code === "ER_DUP_ENTRY") {
          return {
            ok: false,
            status: 409,
            error: "A redirect with this source path already exists",
            code: "conflict",
          };
        }
        throw err;
      }
    }

    await conn.commit();
    invalidateSitemapCache();

    return {
      ok: true,
      alreadyMigrated: false,
      productId: paths.productId,
      oldSlug: paths.expectedOldSlug,
      newSlug: paths.newSlug,
      sourcePath: paths.sourcePath,
      destinationPath: paths.destinationPath,
      redirectId,
      preserved: commercialFingerprint(current),
    };
  } catch (err: any) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (err?.code === "REVISION_TOO_LARGE") {
      return { ok: false, status: 400, error: String(err.message || err), code: "revision" };
    }
    if (err?.code === "ER_DUP_ENTRY") {
      return {
        ok: false,
        status: 409,
        error: "Slug or redirect conflict",
        code: "conflict",
      };
    }
    throw err;
  } finally {
    conn.release();
  }
}

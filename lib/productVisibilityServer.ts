/**
 * Private/Public (active) mutation with optional product_version when expanded.
 */
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import type { AdminIdentity } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordContentRevision, snapshotProduct } from "@/lib/contentRevisions";
import { invalidateSitemapCache } from "@/lib/hostingerResourceInvalidation";
import {
  normalizeStoredActive,
  type ProductVisibilityFlag,
  type ProductVisibilityPayload,
  visibilityLabel,
} from "@/lib/productVisibility";
import { PRODUCT_VERSION_MAX } from "@/lib/productSeasonActions";

type Queryable = import("mysql2/promise").Pool | PoolConnection;

export type ProductVisibilityDeps = {
  getConnection: () => Promise<PoolConnection>;
  recordContentRevision: typeof recordContentRevision;
  recordAdminAudit: typeof recordAdminAudit;
  invalidateSitemapCache: () => void;
  snapshotProduct: typeof snapshotProduct;
};

const defaultDeps: ProductVisibilityDeps = {
  getConnection: () => pool.getConnection(),
  recordContentRevision,
  recordAdminAudit,
  invalidateSitemapCache,
  snapshotProduct,
};

export type ProductVisibilitySuccess = {
  ok: true;
  status: 200;
  id: number;
  name: string;
  slug: string;
  active: ProductVisibilityFlag;
  expected_active: ProductVisibilityFlag;
  changed_fields: string[];
  noop: boolean;
  public_page_available: boolean;
  product_version?: number;
};

export type ProductVisibilityFailure = {
  ok: false;
  status: 404 | 409 | 400 | 500;
  error: string;
  code: string;
  id?: number;
  name?: string;
  slug?: string;
  current_active?: ProductVisibilityFlag;
  current_version?: number;
  public_page_available?: boolean;
};

export type ProductVisibilityResult = ProductVisibilitySuccess | ProductVisibilityFailure;

export async function applyProductVisibilityChange(
  payload: ProductVisibilityPayload,
  actor: AdminIdentity,
  ip: string | null | undefined,
  deps: ProductVisibilityDeps = defaultDeps
): Promise<ProductVisibilityResult> {
  const conn = await deps.getConnection();
  let committed = false;

  try {
    await conn.beginTransaction();

    const [lockedRows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM products WHERE id = ? LIMIT 1 FOR UPDATE`,
      [payload.id]
    );
    const current =
      Array.isArray(lockedRows) && lockedRows[0]
        ? (lockedRows[0] as Record<string, unknown>)
        : null;

    if (!current) {
      await conn.rollback();
      return {
        ok: false,
        status: 404,
        error: "Product not found",
        code: "not_found",
        id: payload.id,
      };
    }

    const hasVersion = Object.prototype.hasOwnProperty.call(current, "product_version");
    const currentVersion = Number(current.product_version);
    if (hasVersion) {
      if (!Number.isInteger(currentVersion) || currentVersion < 0) {
        await conn.rollback();
        return {
          ok: false,
          status: 500,
          error: "Invalid product_version on row",
          code: "server_error",
          id: payload.id,
        };
      }
      if (payload.expected_version === undefined) {
        await conn.rollback();
        return {
          ok: false,
          status: 400,
          error: "expected_version is required when product_version exists",
          code: "validation",
          id: payload.id,
        };
      }
      if (currentVersion === PRODUCT_VERSION_MAX) {
        await conn.rollback();
        return {
          ok: false,
          status: 409,
          error: "product_version overflow",
          code: "version_overflow",
          current_version: currentVersion,
          id: payload.id,
        };
      }
      if (currentVersion !== payload.expected_version) {
        await conn.rollback();
        return {
          ok: false,
          status: 409,
          error: "Stale product_version",
          code: "stale_version",
          current_version: currentVersion,
          id: payload.id,
        };
      }
    }

    const currentActive = normalizeStoredActive(current.active);
    const name = String(current.name || "");
    const slug = String(current.slug || "");

    if (currentActive !== payload.expected_active) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: `Privacy conflict: expected ${visibilityLabel(payload.expected_active)} but product is ${visibilityLabel(currentActive)}`,
        code: "stale_active",
        id: payload.id,
        name,
        slug,
        current_active: currentActive,
        public_page_available: currentActive === 1,
      };
    }

    if (currentActive === payload.active) {
      await conn.commit();
      committed = true;
      return {
        ok: true,
        status: 200,
        id: payload.id,
        name,
        slug,
        active: currentActive,
        expected_active: payload.expected_active,
        changed_fields: [],
        noop: true,
        public_page_available: currentActive === 1,
        ...(hasVersion ? { product_version: currentVersion } : {}),
      };
    }

    await deps.recordContentRevision(
      {
        entityType: "product",
        entityId: payload.id,
        entityLabel: name,
        revisionAction: "update",
        snapshot: deps.snapshotProduct(current),
        changedFields: hasVersion ? ["active", "product_version"] : ["active"],
        actor,
      },
      conn as Queryable
    );

    if (hasVersion) {
      await conn.query(`UPDATE products SET active = ?, product_version = ? WHERE id = ?`, [
        payload.active,
        currentVersion + 1,
        payload.id,
      ]);
    } else {
      await conn.query(`UPDATE products SET active = ? WHERE id = ?`, [payload.active, payload.id]);
    }

    await conn.commit();
    committed = true;

    await deps.recordAdminAudit({
      actor,
      action: "product.visibility_changed",
      entityType: "product",
      entityId: payload.id,
      summary: `${visibilityLabel(payload.expected_active)} → ${visibilityLabel(payload.active)}: ${name}`,
      metadata: {
        from_active: payload.expected_active,
        to_active: payload.active,
        slug,
        public_page_available: payload.active === 1,
      },
      ip: ip ?? null,
    });
    deps.invalidateSitemapCache();

    return {
      ok: true,
      status: 200,
      id: payload.id,
      name,
      slug,
      active: payload.active,
      expected_active: payload.expected_active,
      changed_fields: ["active"],
      noop: false,
      public_page_available: payload.active === 1,
      ...(hasVersion ? { product_version: currentVersion + 1 } : {}),
    };
  } catch (err: any) {
    if (!committed) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    if (err?.code === "REVISION_TOO_LARGE") {
      return {
        ok: false,
        status: 500,
        error: String(err.message || "Revision too large"),
        code: "server_error",
        id: payload.id,
      };
    }
    throw err;
  } finally {
    conn.release();
  }
}

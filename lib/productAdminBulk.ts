/**
 * F4UK-MULTI-131 — pure helpers for Products bulk actions (UI only).
 * Visibility → PATCH; price/stock → PUT allowlist identical to Quick Edit.
 * No DB. Sequential runner only (pool 3 / queue 5).
 */

import { isProductSeasonal } from "@/lib/productAdminListFilters";
import {
  buildQuickEditPutBody,
  isQuickEditPutBodyStrict,
  type QuickEditPutBody,
} from "@/lib/productAdminQuickEdit";

export const PRODUCT_BULK_MAX_SELECTION = 25;

export const BULK_CHANGED_ELSEWHERE_REASON = "changed elsewhere";

export type ProductBulkRow = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  active?: unknown;
  price?: unknown;
  stock?: unknown;
  product_version?: unknown;
  lifecycle_mode?: unknown;
};

export type BulkVisibilityAction = "make_public" | "make_private";
export type BulkFieldAction = "set_price" | "set_stock";
export type BulkAction = BulkVisibilityAction | BulkFieldAction;

export type BulkSkipReason =
  | "already_public"
  | "already_private"
  | "seasonal_must_stay_public"
  | "missing_id"
  | "max_selection"
  | "changed_elsewhere"
  | "invalid_price"
  | "missing_version"
  | "cancelled";

export type BulkSkippedItem = {
  id: number | null;
  name: string;
  reason: BulkSkipReason | string;
};

export type BulkVisibilityPatchBody = {
  id: number;
  active: 0 | 1;
  expected_active: 0 | 1;
  expected_version?: number;
};

export type BulkRowOutcome =
  | { id: number; status: "succeeded" }
  | { id: number; status: "skipped"; reason: string }
  | { id: number; status: "failed"; reason: string };

export type BulkRunAbort = "session" | "permission" | null;

export type BulkRunSummary = {
  succeeded: number;
  skipped: BulkSkippedItem[];
  failed: BulkSkippedItem[];
  aborted: BulkRunAbort;
  requestCount: number;
  outcomes: BulkRowOutcome[];
};

/** Exact keys allowed on visibility PATCH (expected_version optional). */
export function isBulkVisibilityPatchBodyStrict(
  body: Record<string, unknown>
): boolean {
  const keys = Object.keys(body).sort();
  if (keys.includes("expected_version")) {
    return (
      keys.length === 4 &&
      keys[0] === "active" &&
      keys[1] === "expected_active" &&
      keys[2] === "expected_version" &&
      keys[3] === "id"
    );
  }
  return (
    keys.length === 3 &&
    keys[0] === "active" &&
    keys[1] === "expected_active" &&
    keys[2] === "id"
  );
}

export { isQuickEditPutBodyStrict };

export function productBulkDisplayName(p: ProductBulkRow): string {
  const name = String(p.name || "").trim();
  if (name) return name;
  const id = Number(p.id);
  return Number.isInteger(id) && id > 0 ? `#${id}` : "(unknown)";
}

/**
 * Toggle one id into the selection set, capped at max.
 * Returns capped=true when the add was refused because of the max.
 */
export function toggleProductBulkSelection(
  selected: number[],
  id: number,
  max: number = PRODUCT_BULK_MAX_SELECTION
): { next: number[]; capped: boolean } {
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) {
    return { next: selected.slice(), capped: false };
  }
  if (selected.includes(pid)) {
    return { next: selected.filter((x) => x !== pid), capped: false };
  }
  if (selected.length >= max) {
    return { next: selected.slice(), capped: true };
  }
  return { next: [...selected, pid], capped: false };
}

/**
 * Select-all for currently visible filtered rows only.
 * Keeps already-selected ids that are not in the visible set.
 * Adds visible ids up to max; reports how many visible were left out.
 */
export function selectAllVisibleProductIds(
  visibleIds: number[],
  current: number[],
  max: number = PRODUCT_BULK_MAX_SELECTION
): { next: number[]; capped: boolean; omittedVisible: number } {
  const visible = visibleIds
    .map((x) => Number(x))
    .filter((id) => Number.isInteger(id) && id > 0);
  const keepOutside = current.filter((id) => !visible.includes(id));
  const room = Math.max(0, max - keepOutside.length);
  const take = visible.slice(0, room);
  const omittedVisible = Math.max(0, visible.length - take.length);
  const next = [...keepOutside, ...take];
  // de-dupe while preserving order
  const seen = new Set<number>();
  const deduped: number[] = [];
  for (const id of next) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return {
    next: deduped.slice(0, max),
    capped: omittedVisible > 0 || deduped.length > max,
    omittedVisible,
  };
}

export function clearProductBulkSelection(): number[] {
  return [];
}

export function partitionBulkVisibilityTargets(
  products: ProductBulkRow[],
  action: BulkVisibilityAction
): { eligible: ProductBulkRow[]; skipped: BulkSkippedItem[] } {
  const eligible: ProductBulkRow[] = [];
  const skipped: BulkSkippedItem[] = [];
  for (const p of products) {
    const id = Number(p.id);
    const name = productBulkDisplayName(p);
    if (!Number.isInteger(id) || id <= 0) {
      skipped.push({ id: null, name, reason: "missing_id" });
      continue;
    }
    const isPublic = Number(p.active) === 1;
    if (action === "make_public") {
      if (isPublic) {
        skipped.push({ id, name, reason: "already_public" });
        continue;
      }
      eligible.push(p);
      continue;
    }
    // make_private
    if (isProductSeasonal(p)) {
      skipped.push({ id, name, reason: "seasonal_must_stay_public" });
      continue;
    }
    if (!isPublic) {
      skipped.push({ id, name, reason: "already_private" });
      continue;
    }
    eligible.push(p);
  }
  return { eligible, skipped };
}

export function buildBulkVisibilityPatchBody(
  product: ProductBulkRow,
  nextActive: 0 | 1
):
  | { ok: true; body: BulkVisibilityPatchBody }
  | { ok: false; error: string } {
  const id = Number(product.id);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Invalid product id." };
  }
  const expectedActive: 0 | 1 = Number(product.active) === 1 ? 1 : 0;
  const body: BulkVisibilityPatchBody = {
    id,
    active: nextActive,
    expected_active: expectedActive,
  };
  const rowVersion = product.product_version;
  if (rowVersion != null && rowVersion !== "") {
    const v = Number(rowVersion);
    if (!Number.isFinite(v)) {
      return { ok: false, error: "Missing product version — reload and try again." };
    }
    body.expected_version = v;
  }
  return { ok: true, body };
}

/**
 * Build Quick-Edit-identical PUT body for bulk price and/or stock.
 * - price-only: reuse row stock
 * - stock-only: reuse row price
 * - empty stock → "Digital" (via buildQuickEditPutBody)
 * Invalid price → ok:false (caller must send zero requests).
 */
export function buildBulkPriceStockPutBody(
  product: ProductBulkRow,
  fields: { price?: string; stock?: string },
  mode: BulkFieldAction
):
  | { ok: true; body: QuickEditPutBody }
  | { ok: false; error: string } {
  const price =
    mode === "set_price"
      ? String(fields.price ?? "")
      : String(product.price ?? "");
  const stock =
    mode === "set_stock"
      ? String(fields.stock ?? "")
      : String(product.stock ?? "");
  return buildQuickEditPutBody(product.id, { price, stock }, product.product_version);
}

function formatSkipReason(reason: string): string {
  switch (reason) {
    case "already_public":
      return "already Public";
    case "already_private":
      return "already Private";
    case "seasonal_must_stay_public":
      return "seasonal — must stay Public (use Hidden from shop / Pause)";
    case "changed_elsewhere":
      return BULK_CHANGED_ELSEWHERE_REASON;
    case "invalid_price":
      return "invalid price";
    case "missing_version":
      return "missing version";
    default:
      return reason;
  }
}

function listProductNames(products: ProductBulkRow[], limit = 10): string {
  const names = products.map(productBulkDisplayName);
  if (names.length <= limit) return names.join(", ");
  const shown = names.slice(0, limit).join(", ");
  const more = names.length - limit;
  return `${shown}, and ${more} more`;
}

/**
 * ONE summary confirm message before a bulk run.
 * Make Private repeats privacy / 404 / sitemap warning.
 */
export function buildBulkConfirmMessage(opts: {
  action: BulkAction;
  eligible: ProductBulkRow[];
  skipped: BulkSkippedItem[];
  priceValue?: string;
  stockValue?: string;
}): string {
  const { action, eligible, skipped } = opts;
  const actionLabel =
    action === "make_public"
      ? "Make Public"
      : action === "make_private"
        ? "Make Private"
        : action === "set_price"
          ? `Set price to ${opts.priceValue ?? ""}`
          : `Set stock to ${opts.stockValue?.trim() ? opts.stockValue : "Digital"}`;

  const lines: string[] = [
    `Bulk action: ${actionLabel}`,
    `Products to update: ${eligible.length}`,
    eligible.length ? `Products: ${listProductNames(eligible, 10)}` : "Products: (none)",
  ];

  if (skipped.length) {
    lines.push("");
    lines.push(`Will skip (${skipped.length}):`);
    for (const s of skipped.slice(0, 15)) {
      lines.push(`- ${s.name}${s.id != null ? ` (#${s.id})` : ""}: ${formatSkipReason(String(s.reason))}`);
    }
    if (skipped.length > 15) {
      lines.push(`… and ${skipped.length - 15} more skipped`);
    }
  }

  if (action === "make_private") {
    lines.push("");
    lines.push(
      "PRIVATE: each public product page becomes unavailable (404) and drops from the sitemap after cache refresh. This is genuine privacy — not “hidden from shop”. Seasonal archives must stay Public (active=1) and use Hidden from shop / Pause instead."
    );
  }

  lines.push("");
  lines.push(eligible.length ? "Continue with bulk update?" : "Nothing to update. Dismiss?");
  return lines.join("\n");
}

export function formatBulkRunSummaryMessage(summary: BulkRunSummary): string {
  const parts = [
    `Bulk finished: ${summary.succeeded} succeeded`,
    `${summary.skipped.length} skipped`,
    `${summary.failed.length} failed`,
  ];
  if (summary.aborted === "session") parts.push("(aborted: session expired)");
  if (summary.aborted === "permission") parts.push("(aborted: permission denied)");
  const detail: string[] = [];
  for (const s of summary.skipped.slice(0, 8)) {
    detail.push(`skip ${s.name}: ${formatSkipReason(String(s.reason))}`);
  }
  for (const f of summary.failed.slice(0, 8)) {
    detail.push(`fail ${f.name}: ${f.reason}`);
  }
  return detail.length
    ? `${parts.join(", ")}. ${detail.join("; ")}`
    : parts.join(", ");
}

export type BulkRequestSpec =
  | { method: "PATCH"; body: BulkVisibilityPatchBody }
  | { method: "PUT"; body: QuickEditPutBody };

export type BulkRequestResult = {
  status: number;
  ok: boolean;
  code?: unknown;
  error?: unknown;
  success?: unknown;
};

/**
 * Strictly sequential bulk runner. No retries. No overwrite on 409.
 * 401 / 403 abort the whole run. Other errors mark the row failed and continue.
 */
export async function runProductBulkSequential(opts: {
  items: Array<{
    id: number;
    name: string;
    request: BulkRequestSpec | null;
    preSkipReason?: string;
  }>;
  send: (spec: BulkRequestSpec) => Promise<BulkRequestResult>;
  onProgress?: (done: number, total: number) => void;
}): Promise<BulkRunSummary> {
  const outcomes: BulkRowOutcome[] = [];
  const skipped: BulkSkippedItem[] = [];
  const failed: BulkSkippedItem[] = [];
  let succeeded = 0;
  let requestCount = 0;
  let aborted: BulkRunAbort = null;

  const total = opts.items.length;
  let done = 0;

  for (const item of opts.items) {
    if (aborted) break;

    if (item.preSkipReason || !item.request) {
      const reason = item.preSkipReason || "skipped";
      skipped.push({ id: item.id, name: item.name, reason });
      outcomes.push({ id: item.id, status: "skipped", reason });
      done += 1;
      opts.onProgress?.(done, total);
      continue;
    }

    requestCount += 1;
    let res: BulkRequestResult;
    try {
      res = await opts.send(item.request);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Network error";
      failed.push({ id: item.id, name: item.name, reason });
      outcomes.push({ id: item.id, status: "failed", reason });
      done += 1;
      opts.onProgress?.(done, total);
      continue;
    }

    if (res.status === 401) {
      aborted = "session";
      failed.push({ id: item.id, name: item.name, reason: "session expired" });
      outcomes.push({ id: item.id, status: "failed", reason: "session expired" });
      done += 1;
      opts.onProgress?.(done, total);
      break;
    }
    if (res.status === 403) {
      aborted = "permission";
      failed.push({ id: item.id, name: item.name, reason: "permission denied" });
      outcomes.push({ id: item.id, status: "failed", reason: "permission denied" });
      done += 1;
      opts.onProgress?.(done, total);
      break;
    }
    if (res.status === 409) {
      skipped.push({
        id: item.id,
        name: item.name,
        reason: "changed_elsewhere",
      });
      outcomes.push({
        id: item.id,
        status: "skipped",
        reason: BULK_CHANGED_ELSEWHERE_REASON,
      });
      done += 1;
      opts.onProgress?.(done, total);
      continue;
    }
    if (!res.ok || res.error || res.success === false) {
      const reason = String(res.error || `HTTP ${res.status}`);
      failed.push({ id: item.id, name: item.name, reason });
      outcomes.push({ id: item.id, status: "failed", reason });
      done += 1;
      opts.onProgress?.(done, total);
      continue;
    }

    succeeded += 1;
    outcomes.push({ id: item.id, status: "succeeded" });
    done += 1;
    opts.onProgress?.(done, total);
  }

  return {
    succeeded,
    skipped,
    failed,
    aborted,
    requestCount,
    outcomes,
  };
}

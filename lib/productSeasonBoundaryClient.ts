/**
 * Client-side seasonal boundary revalidation coordinator for ProductDetail.
 * Immediately disables purchase at a new deadline; deduplicates in-flight refresh.
 * Completed duplicates must not re-block purchase or mutate eligibility.
 * Late callbacks from another product/slug never rebind the active coordinator.
 */

export type BoundaryKind = "start" | "end";

export type BoundaryKey = string;

export function makeBoundaryKey(opts: {
  productId: number | string;
  kind: BoundaryKind;
  targetMs: number;
}): BoundaryKey {
  return `${opts.productId}:${opts.kind}:${opts.targetMs}`;
}

export type BoundaryCoordinatorState = {
  /** Boundary keys that have been started (in-flight or completed). */
  fired: Set<BoundaryKey>;
  /** Boundary keys that completed a settled refresh (success or terminal failure). */
  completed: Set<BoundaryKey>;
  /** In-flight request for a boundary key. */
  inflight: Map<BoundaryKey, Promise<unknown>>;
  /** Per-boundary retry counts (not lifetime). */
  retries: Map<BoundaryKey, number>;
  /** Purchase blocked until authoritative refresh settles for this boundary. */
  purchaseBlocked: boolean;
  blockedReason: null | "boundary_pending" | "boundary_failed" | "expired_local";
  activeProductId: number | string | null;
  activeSlug: string | null;
};

export function createBoundaryCoordinator(): BoundaryCoordinatorState {
  return {
    fired: new Set(),
    completed: new Set(),
    inflight: new Map(),
    retries: new Map(),
    purchaseBlocked: false,
    blockedReason: null,
    activeProductId: null,
    activeSlug: null,
  };
}

/** Explicit bind when the parent product/slug route changes — not from late callbacks. */
export function bindCoordinatorProduct(
  state: BoundaryCoordinatorState,
  productId: number | string,
  slug: string
): void {
  if (
    state.activeProductId != null &&
    (String(state.activeProductId) !== String(productId) || state.activeSlug !== slug)
  ) {
    state.fired.clear();
    state.completed.clear();
    state.inflight.clear();
    state.retries.clear();
    state.purchaseBlocked = false;
    state.blockedReason = null;
  }
  state.activeProductId = productId;
  state.activeSlug = slug;
}

export type BoundaryRevalidationOutcome<T> = {
  started: boolean;
  result?: T;
  error?: unknown;
  duplicate: boolean;
  /** Settled prior completion — caller must not change CTA/phase/loading. */
  completedDuplicate?: boolean;
  /** Late callback for a different product/slug — ignored. */
  ignoredStaleContext?: boolean;
};

/**
 * Crossed a deadline: for a genuinely new boundary on the active product/slug,
 * immediately block purchase, then run refresh at most once per boundary key.
 */
export async function runBoundaryRevalidation<T>(opts: {
  state: BoundaryCoordinatorState;
  key: BoundaryKey;
  productId: number | string;
  slug: string;
  maxRetries?: number;
  refresh: () => Promise<T>;
  onImmediateBlock: () => void;
}): Promise<BoundaryRevalidationOutcome<T>> {
  // First use: bind. Later: never rebind from a late foreign callback.
  if (opts.state.activeProductId == null) {
    bindCoordinatorProduct(opts.state, opts.productId, opts.slug);
  } else if (
    String(opts.state.activeProductId) !== String(opts.productId) ||
    (opts.state.activeSlug != null && opts.state.activeSlug !== opts.slug)
  ) {
    return {
      started: false,
      duplicate: true,
      ignoredStaleContext: true,
    };
  }

  // Completed duplicate: no eligibility / phase / loading / retry mutations.
  if (
    opts.state.completed.has(opts.key) ||
    (opts.state.fired.has(opts.key) && !opts.state.inflight.has(opts.key))
  ) {
    opts.state.completed.add(opts.key);
    return {
      started: false,
      duplicate: true,
      completedDuplicate: true,
    };
  }

  // In-flight duplicate: join existing request without re-blocking or new fetch.
  const existing = opts.state.inflight.get(opts.key);
  if (existing) {
    try {
      const result = (await existing) as T;
      return { started: false, result, duplicate: true };
    } catch (error) {
      return { started: false, error, duplicate: true };
    }
  }

  const maxRetries = opts.maxRetries ?? 3;
  const prior = opts.state.retries.get(opts.key) || 0;
  if (prior >= maxRetries) {
    opts.state.purchaseBlocked = true;
    opts.state.blockedReason = "boundary_failed";
    opts.state.completed.add(opts.key);
    return {
      started: false,
      duplicate: true,
      completedDuplicate: true,
      error: new Error("boundary_retry_exhausted"),
    };
  }

  // Genuinely new crossed boundary — immediate block, then refresh once.
  opts.state.purchaseBlocked = true;
  opts.state.blockedReason = "expired_local";
  opts.onImmediateBlock();

  opts.state.fired.add(opts.key);
  opts.state.purchaseBlocked = true;
  opts.state.blockedReason = "boundary_pending";
  opts.state.retries.set(opts.key, prior + 1);

  const promise = (async () => {
    try {
      return await opts.refresh();
    } finally {
      opts.state.inflight.delete(opts.key);
    }
  })();
  opts.state.inflight.set(opts.key, promise);

  try {
    const result = await promise;
    opts.state.completed.add(opts.key);
    return { started: true, result, duplicate: false };
  } catch (error) {
    opts.state.purchaseBlocked = true;
    opts.state.blockedReason = "boundary_failed";
    opts.state.completed.add(opts.key);
    return { started: true, error, duplicate: false };
  }
}

export function clearPurchaseBlockAfterAuthoritativeOk(
  state: BoundaryCoordinatorState,
  opts: { productId: number | string; slug: string; purchasable: boolean }
): void {
  if (String(state.activeProductId) !== String(opts.productId)) return;
  if (state.activeSlug && state.activeSlug !== opts.slug) return;
  if (opts.purchasable) {
    state.purchaseBlocked = false;
    state.blockedReason = null;
  } else {
    state.purchaseBlocked = true;
    state.blockedReason = "expired_local";
  }
}

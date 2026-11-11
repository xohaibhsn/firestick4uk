/**
 * Cart line classification — same rules as app/cart/page.tsx
 * (productMap from GET /api/products + isDigitalProduct).
 * Used by the mini-cart bar only; do not change /cart page.
 */
import { isDigitalProduct } from "./productFulfilment";

export type CartProductFacts = {
  id: number;
  name?: string;
  category?: string | null;
  stock?: string | null;
  active?: number | boolean;
};

export type CartClassification = {
  ready: boolean;
  error: string | null;
  hasDigitalItems: boolean;
  hasPhysicalItems: boolean;
};

export type CartLineRef = { id: number };

const CATALOG_TTL_MS = 5 * 60 * 1000;
const SESSION_KEY = "f4uk_minicart_product_facts_v1";

type CatalogCache = {
  map: Map<number, CartProductFacts>;
  fetchedAt: number;
};

let moduleCatalog: CatalogCache | null = null;
let inflight: Promise<Map<number, CartProductFacts>> | null = null;

/** Sorted unique product-id cache key (for tests / dedupe diagnostics). */
export function cartIdsCacheKey(ids: number[]): string {
  const uniq = Array.from(
    new Set(
      ids
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  ).sort((a, b) => a - b);
  return uniq.join(",");
}

export function buildProductFactsMap(list: unknown): Map<number, CartProductFacts> {
  const map = new Map<number, CartProductFacts>();
  const rows = Array.isArray(list) ? list : [];
  for (const p of rows) {
    const id = Number((p as { id?: unknown })?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const row = p as {
      name?: unknown;
      category?: unknown;
      stock?: unknown;
      active?: unknown;
    };
    map.set(id, {
      id,
      name: String(row.name || ""),
      category: (row.category as string | null | undefined) ?? null,
      stock: (row.stock as string | null | undefined) ?? null,
      active: row.active as number | boolean | undefined,
    });
  }
  return map;
}

/**
 * Same classification branching as /cart (loading handled by caller).
 * Unknown product id → not ready (matches UNRESOLVED path on /cart).
 */
export function classifyCartItems(
  cart: CartLineRef[],
  productMap: Map<number, CartProductFacts> | null
): CartClassification {
  if (!productMap) {
    return {
      ready: false,
      error: "unavailable",
      hasDigitalItems: false,
      hasPhysicalItems: false,
    };
  }
  if (cart.length === 0) {
    return {
      ready: true,
      error: null,
      hasDigitalItems: false,
      hasPhysicalItems: false,
    };
  }
  let hasDigitalItems = false;
  let hasPhysicalItems = false;
  for (const item of cart) {
    const facts = productMap.get(Number(item.id));
    if (!facts) {
      return {
        ready: false,
        error: "unresolved",
        hasDigitalItems: false,
        hasPhysicalItems: false,
      };
    }
    if (isDigitalProduct(facts)) hasDigitalItems = true;
    else hasPhysicalItems = true;
  }
  return {
    ready: true,
    error: null,
    hasDigitalItems,
    hasPhysicalItems,
  };
}

function readSessionCatalog(): CatalogCache | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      fetchedAt?: number;
      entries?: CartProductFacts[];
    };
    if (!parsed || !Array.isArray(parsed.entries) || !parsed.fetchedAt) return null;
    if (Date.now() - parsed.fetchedAt > CATALOG_TTL_MS) return null;
    const map = new Map<number, CartProductFacts>();
    for (const e of parsed.entries) {
      if (e && Number.isInteger(e.id)) map.set(e.id, e);
    }
    return { map, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeSessionCatalog(cache: CatalogCache): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        fetchedAt: cache.fetchedAt,
        entries: Array.from(cache.map.values()),
      })
    );
  } catch {
    /* quota / private mode */
  }
}

function getFreshModuleCatalog(): CatalogCache | null {
  if (!moduleCatalog) return null;
  if (Date.now() - moduleCatalog.fetchedAt > CATALOG_TTL_MS) return null;
  return moduleCatalog;
}

/** Test helper — clear module catalog + inflight. */
export function __resetCartClassificationCacheForTests(): void {
  moduleCatalog = null;
  inflight = null;
}

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

/**
 * Fetch GET /api/products once (shared promise). Cached in module memory
 * and sessionStorage (TTL). Caller `signal` aborts only that waiter — the
 * shared catalog fetch is not cancelled (avoids request storms / races).
 */
export async function loadProductFactsCatalog(
  signal?: AbortSignal
): Promise<Map<number, CartProductFacts>> {
  if (signal?.aborted) throw abortError();

  const fresh = getFreshModuleCatalog();
  if (fresh) return fresh.map;

  const fromSession = readSessionCatalog();
  if (fromSession) {
    moduleCatalog = fromSession;
    return fromSession.map;
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("products_fetch_failed");
        const data = await res.json();
        const map = buildProductFactsMap(data);
        const cache: CatalogCache = { map, fetchedAt: Date.now() };
        moduleCatalog = cache;
        writeSessionCatalog(cache);
        return map;
      } finally {
        inflight = null;
      }
    })();
  }

  const shared = inflight;
  if (!signal) return shared;

  return new Promise<Map<number, CartProductFacts>>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(
      (map) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) reject(abortError());
        else resolve(map);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

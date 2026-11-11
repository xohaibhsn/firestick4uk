"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cartIdsCacheKey,
  classifyCartItems,
  loadProductFactsCatalog,
  type CartClassification,
  type CartLineRef,
  type CartProductFacts,
} from "./cartClassification";

export type UseCartClassificationResult = {
  status: "idle" | "loading" | "ready" | "error";
  classification: CartClassification | null;
  productMap: Map<number, CartProductFacts> | null;
  cacheKey: string;
};

/**
 * Fetch product facts only when `enabled` (mini-bar visible).
 * Dedupes via shared catalog promise/cache; aborts waiter on unmount/disable.
 */
export function useCartClassification(opts: {
  enabled: boolean;
  cart: CartLineRef[];
}): UseCartClassificationResult {
  const cacheKey = cartIdsCacheKey(opts.cart.map((c) => Number(c.id)));

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [productMap, setProductMap] = useState<Map<
    number,
    CartProductFacts
  > | null>(null);

  useEffect(() => {
    if (!opts.enabled) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setStatus("loading");

    loadProductFactsCatalog(ac.signal)
      .then((map) => {
        if (cancelled) return;
        setProductMap(map);
        setStatus("ready");
      })
      .catch((err: { name?: string }) => {
        if (cancelled || err?.name === "AbortError") return;
        setProductMap(null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [opts.enabled, cacheKey]);

  const classification = useMemo(() => {
    if (!opts.enabled) return null;
    if (status === "loading" || status === "idle") {
      return {
        ready: false,
        error: null,
        hasDigitalItems: false,
        hasPhysicalItems: false,
      } satisfies CartClassification;
    }
    if (status === "error" || !productMap) {
      return {
        ready: false,
        error: "fetch",
        hasDigitalItems: false,
        hasPhysicalItems: false,
      } satisfies CartClassification;
    }
    return classifyCartItems(opts.cart, productMap);
  }, [opts.enabled, opts.cart, status, productMap]);

  return { status, classification, productMap, cacheKey };
}

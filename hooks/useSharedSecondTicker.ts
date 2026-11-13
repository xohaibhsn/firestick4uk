"use client";

import { useEffect, useState } from "react";
import { floorSecondUtcMs } from "@/lib/productSeasonLondon";

type Listener = (nowMs: number) => void;

const listeners = new Set<Listener>();
let intervalId: number | null = null;
let lastNowMs = floorSecondUtcMs();

function ensureTicker() {
  if (typeof window === "undefined") return;
  if (intervalId != null) return;
  const tick = () => {
    lastNowMs = floorSecondUtcMs();
    listeners.forEach((fn) => fn(lastNowMs));
  };
  tick();
  intervalId = window.setInterval(tick, 1000);
  const onVis = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", tick);
}

function releaseTickerIfIdle() {
  if (listeners.size > 0) return;
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Single shared 1s wall-clock ticker for all seasonal card countdowns on a page.
 * One setInterval for N subscribers — avoids per-card timers.
 */
export function useSharedSecondTicker(enabled = true): number {
  const [nowMs, setNowMs] = useState(() => lastNowMs);

  useEffect(() => {
    if (!enabled) return;
    ensureTicker();
    const listener: Listener = (n) => setNowMs(n);
    listeners.add(listener);
    setNowMs(lastNowMs);
    return () => {
      listeners.delete(listener);
      releaseTickerIfIdle();
    };
  }, [enabled]);

  return nowMs;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { floorSecondUtcMs, parseUtcSqlToMs } from "@/lib/productSeasonLondon";

/**
 * Presentation countdown. On start/end boundary, notifies parent once for
 * authoritative revalidation — does not authorize purchase by itself.
 */
export default function SeasonalCountdown({
  phase,
  show,
  startsAt,
  endsAt,
  onBoundary,
  /** Test-only coherent clock; production defaults to wall UTC seconds. */
  getNowMs,
}: {
  phase: string;
  show: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  onBoundary?: (kind: "start" | "end") => void;
  getNowMs?: () => number;
}) {
  const readNow = () => (getNowMs ? getNowMs() : floorSecondUtcMs());
  const [nowMs, setNowMs] = useState(() => readNow());
  const [label, setLabel] = useState("");
  const firedRef = useRef<string>("");

  useEffect(() => {
    firedRef.current = "";
  }, [phase, startsAt, endsAt]);

  useEffect(() => {
    if (phase !== "upcoming" && phase !== "live") return;

    const tick = () => {
      const now = getNowMs ? getNowMs() : floorSecondUtcMs();
      setNowMs(now);
      const target =
        phase === "upcoming" ? parseUtcSqlToMs(startsAt) : parseUtcSqlToMs(endsAt);
      if (target == null) {
        setLabel("");
        return;
      }
      const diff = target - now;
      if (diff <= 0) {
        const kind = phase === "upcoming" ? "start" : "end";
        const key = `${kind}:${target}`;
        if (firedRef.current !== key) {
          firedRef.current = key;
          onBoundary?.(kind);
        }
        if (show) {
          setLabel(phase === "upcoming" ? "Starting…" : "Ending…");
        }
        return;
      }
      if (!show) {
        setLabel("");
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const parts = [
        d > 0 ? `${d}d` : null,
        `${h}h`,
        `${m}m`,
        `${s}s`,
      ].filter(Boolean);
      setLabel(
        phase === "upcoming"
          ? `Opens in ${parts.join(" ")}`
          : `Ends in ${parts.join(" ")}`
      );
    };

    tick();
    const id = window.setInterval(tick, 1000);
    const onFocus = () => tick();
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [show, phase, startsAt, endsAt, onBoundary, getNowMs]);

  if (!show) return null;
  if (phase === "paused" || phase === "ended" || phase === "permanent" || phase === "private") {
    return null;
  }
  if (!label) return null;

  return (
    <div
      data-testid="seasonal-countdown"
      data-now={nowMs}
      style={{
        margin: "10px 0 14px",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #DDD6FE",
        background: "#F5F3FF",
        color: "#4C1D95",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

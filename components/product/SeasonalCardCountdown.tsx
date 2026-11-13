"use client";

import { useEffect, useRef } from "react";
import { useSharedSecondTicker } from "@/hooks/useSharedSecondTicker";
import { parseUtcSqlToMs } from "@/lib/productSeasonLondon";
import { formatSeasonalCardCountdown } from "@/lib/seasonalCountdownLabel";

/**
 * Compact pill countdown for product cards (home + /products + seasonal offers).
 * Uses the shared 1s ticker. Reserved height avoids CLS. aria-live="off".
 */
export default function SeasonalCardCountdown({
  endsAt,
  phase,
  onEnded,
}: {
  endsAt?: string | null;
  phase?: string | null;
  /** Fires once when remaining hits 0 (card should disable ATC until refresh). */
  onEnded?: () => void;
}) {
  const live = phase === "live" && Boolean(endsAt);
  const nowMs = useSharedSecondTicker(live);
  const endMs = live ? parseUtcSqlToMs(endsAt) : null;
  const endedNotified = useRef(false);

  const remainingSec =
    live && endMs != null ? Math.floor((endMs - nowMs) / 1000) : null;
  const ended = remainingSec != null && remainingSec <= 0;
  const label =
    remainingSec == null ? "" : formatSeasonalCardCountdown(remainingSec);

  useEffect(() => {
    endedNotified.current = false;
  }, [endsAt, phase]);

  useEffect(() => {
    if (!ended || !onEnded || endedNotified.current) return;
    endedNotified.current = true;
    onEnded();
  }, [ended, onEnded]);

  if (!live || endMs == null) return null;

  return (
    <div
      data-testid="seasonal-card-countdown"
      role="timer"
      aria-live="off"
      style={{
        minHeight: 22,
        marginBottom: 8,
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        background: ended ? "#FEE2E2" : "#F5F3FF",
        border: ended ? "1px solid #FECACA" : "1px solid #DDD6FE",
        color: ended ? "#991B1B" : "#5B21B6",
        fontSize: 12,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.01em",
        lineHeight: 1.35,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

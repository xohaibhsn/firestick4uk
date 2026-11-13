"use client";

import { useEffect, useRef, useState } from "react";
import { floorSecondUtcMs, parseUtcSqlToMs } from "@/lib/productSeasonLondon";
import {
  DEFAULT_COUNTDOWN_PREFIX,
  DEFAULT_COUNTDOWN_UPCOMING_PREFIX,
  splitCountdownParts,
} from "@/lib/seasonalCountdownLabel";

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/**
 * Presentation countdown. Prominent DD / HRS / MINS / SECS boxes; seconds always tick.
 * On start/end boundary, notifies parent once for authoritative revalidation —
 * does not authorize purchase by itself.
 */
export default function SeasonalCountdown({
  phase,
  show,
  startsAt,
  endsAt,
  onBoundary,
  /** Test-only coherent clock; production defaults to wall UTC seconds. */
  getNowMs,
  prefix = DEFAULT_COUNTDOWN_PREFIX,
  upcomingPrefix = DEFAULT_COUNTDOWN_UPCOMING_PREFIX,
}: {
  phase: string;
  show: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  onBoundary?: (kind: "start" | "end") => void;
  getNowMs?: () => number;
  prefix?: string;
  upcomingPrefix?: string;
}) {
  const readNow = () => (getNowMs ? getNowMs() : floorSecondUtcMs());
  const [nowMs, setNowMs] = useState(() => readNow());
  const [parts, setParts] = useState(() => splitCountdownParts(0));
  const [active, setActive] = useState(false);
  const [prefixLabel, setPrefixLabel] = useState("");
  const [srText, setSrText] = useState("");
  const firedRef = useRef<string>("");
  const lastSrMinRef = useRef<number>(-1);

  useEffect(() => {
    firedRef.current = "";
    lastSrMinRef.current = -1;
  }, [phase, startsAt, endsAt]);

  useEffect(() => {
    if (phase !== "upcoming" && phase !== "live") {
      setActive(false);
      return;
    }

    const tick = () => {
      const now = getNowMs ? getNowMs() : floorSecondUtcMs();
      setNowMs(now);
      const target =
        phase === "upcoming" ? parseUtcSqlToMs(startsAt) : parseUtcSqlToMs(endsAt);
      if (target == null) {
        setActive(false);
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
          setParts(splitCountdownParts(0));
          setActive(true);
          setPrefixLabel(phase === "upcoming" ? "Starting…" : "Ending…");
        } else {
          setActive(false);
        }
        return;
      }
      if (!show) {
        setActive(false);
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const next = splitCountdownParts(totalSec);
      setParts(next);
      setActive(true);
      const label =
        phase === "upcoming"
          ? String(upcomingPrefix || DEFAULT_COUNTDOWN_UPCOMING_PREFIX).trim() ||
            DEFAULT_COUNTDOWN_UPCOMING_PREFIX
          : String(prefix || DEFAULT_COUNTDOWN_PREFIX).trim() || DEFAULT_COUNTDOWN_PREFIX;
      setPrefixLabel(label);
      // Screen-reader announcement at most once per minute
      const minuteBucket = Math.floor(totalSec / 60);
      if (minuteBucket !== lastSrMinRef.current) {
        lastSrMinRef.current = minuteBucket;
        setSrText(
          `${label} ${next.days} days ${next.hours} hours ${next.mins} minutes ${next.secs} seconds`
        );
      }
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
  }, [show, phase, startsAt, endsAt, onBoundary, getNowMs, prefix, upcomingPrefix]);

  if (!show) return null;
  if (phase === "paused" || phase === "ended" || phase === "permanent" || phase === "private") {
    return null;
  }
  if (!active) return null;

  const boxes: { label: string; value: string }[] = [
    { label: "DAYS", value: pad2(parts.days) },
    { label: "HRS", value: pad2(parts.hours) },
    { label: "MINS", value: pad2(parts.mins) },
    { label: "SECS", value: pad2(parts.secs) },
  ];

  const urgent = phase === "live";

  return (
    <div
      data-testid="seasonal-countdown"
      data-now={nowMs}
      role="timer"
      aria-live="off"
      style={{
        margin: "12px 0 16px",
        maxWidth: "100%",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          color: urgent ? "#DC2626" : "#7C3AED",
          marginBottom: 8,
        }}
      >
        {prefixLabel}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        {boxes.map((b) => (
          <div
            key={b.label}
            data-testid={`seasonal-countdown-${b.label.toLowerCase()}`}
            style={{
              flex: "1 1 56px",
              minWidth: 56,
              maxWidth: 88,
              background: "#5B21B6",
              color: "#FFFFFF",
              borderRadius: 10,
              padding: "10px 6px 8px",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontSize: "clamp(1.25rem, 5vw, 1.75rem)",
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.1,
                letterSpacing: "0.02em",
              }}
            >
              {b.value}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                opacity: 0.85,
                marginTop: 4,
                letterSpacing: "0.06em",
              }}
            >
              {b.label}
            </div>
          </div>
        ))}
      </div>
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        aria-live="polite"
      >
        {srText}
      </span>
    </div>
  );
}

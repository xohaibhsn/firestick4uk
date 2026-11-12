/**
 * Pure seasonal countdown label formatting (CMS prefixes + unit rules).
 * Presentation only — does not authorize purchase.
 */

export const DEFAULT_COUNTDOWN_PREFIX = "Offer ends in";
export const DEFAULT_COUNTDOWN_UPCOMING_PREFIX = "Offer starts in";

function unit(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Format remaining time for live/upcoming seasonal countdowns.
 * - Hide days when 0
 * - Show seconds only when less than 1 hour remains
 * - Singular forms for 1
 */
export function formatSeasonalCountdownRemaining(
  totalSec: number,
  opts: { phase: "live" | "upcoming"; prefix: string; upcomingPrefix: string }
): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const prefix =
    opts.phase === "upcoming"
      ? String(opts.upcomingPrefix || DEFAULT_COUNTDOWN_UPCOMING_PREFIX).trim() ||
        DEFAULT_COUNTDOWN_UPCOMING_PREFIX
      : String(opts.prefix || DEFAULT_COUNTDOWN_PREFIX).trim() || DEFAULT_COUNTDOWN_PREFIX;

  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const parts: string[] = [];
  if (sec < 3600) {
    if (m > 0) parts.push(unit(m, "min", "mins"));
    parts.push(unit(s, "sec", "secs"));
  } else {
    if (d > 0) parts.push(unit(d, "day", "days"));
    parts.push(unit(h, "hr", "hrs"));
    parts.push(unit(m, "min", "mins"));
  }

  return `${prefix} ${parts.join(" ")}`;
}

/**
 * Pure seasonal countdown label formatting (CMS prefixes + unit rules).
 * Presentation only — does not authorize purchase.
 */

export const DEFAULT_COUNTDOWN_PREFIX = "Offer ends in";
export const DEFAULT_COUNTDOWN_UPCOMING_PREFIX = "Offer starts in";

function unit(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** Split remaining seconds into days / hours / mins / secs (floored, non-negative). */
export function splitCountdownParts(totalSec: number): {
  days: number;
  hours: number;
  mins: number;
  secs: number;
} {
  const sec = Math.max(0, Math.floor(totalSec));
  return {
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    mins: Math.floor((sec % 3600) / 60),
    secs: sec % 60,
  };
}

/**
 * Compact time fragment: "18d 03:12:45" (hide "0d"). Shared by card + home bar.
 * When remaining ≤ 0 → "0:00:00".
 */
export function formatSeasonalCompactHms(totalSec: number): string {
  const sec = Math.floor(totalSec);
  if (sec <= 0) return "0:00:00";
  const { days, hours, mins, secs } = splitCountdownParts(sec);
  const hms = `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
  if (days > 0) return `${days}d ${hms}`;
  return hms;
}

/**
 * Compact card countdown: "⏳ Ends in 18d 03:12:45" (hide "0d").
 * When remaining ≤ 0 → "Offer ended".
 */
export function formatSeasonalCardCountdown(totalSec: number): string {
  const sec = Math.floor(totalSec);
  if (sec <= 0) return "Offer ended";
  return `⏳ Ends in ${formatSeasonalCompactHms(sec)}`;
}

/** Default home announcement copy when CMS seasonal_promo_text is empty. */
export const DEFAULT_SEASONAL_PROMO_TEXT = "{season} deal is live";
/** Default home announcement CTA when CMS seasonal_promo_cta is empty. */
export const DEFAULT_SEASONAL_PROMO_CTA = "Shop now";

/**
 * Replace `{season}` tokens with the season name (empty → "Seasonal").
 * Does not mutate stored CMS values — apply only at render time.
 */
export function applySeasonalPromoText(
  stored: string | null | undefined,
  seasonName: string | null | undefined
): string {
  const raw = String(stored ?? "").trim() || DEFAULT_SEASONAL_PROMO_TEXT;
  const season = String(seasonName ?? "").trim() || "Seasonal";
  return raw.replace(/\{season\}/gi, season);
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

/**
 * Offer priceValidUntil helper — London calendar date of season end instant.
 */
import { londonPartsFromUtcMs, parseUtcSqlToMs } from "@/lib/productSeasonLondon";

/** YYYY-MM-DD in Europe/London for the given UTC SQL/ISO instant; null if unparseable. */
export function londonDateYmdFromUtcInstant(endsAt: unknown): string | null {
  const ms = parseUtcSqlToMs(endsAt);
  if (ms == null) return null;
  const parts = londonPartsFromUtcMs(ms);
  if (!parts?.wall) return null;
  return parts.wall.slice(0, 10);
}

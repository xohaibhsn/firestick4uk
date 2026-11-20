import { parseUtcSqlToMs } from "@/lib/productSeasonLondon";

const BLOG_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

/**
 * Deterministic blog date label in Europe/London.
 * Accepts Date | ISO string | timezone-less SQL "YYYY-MM-DD HH:MM:SS" (UTC).
 * Invalid/empty → "". Never throws.
 */
export function formatBlogDate(input: unknown): string {
  try {
    if (input == null || input === "") return "";

    let ms: number | null = null;
    if (input instanceof Date) {
      const t = input.getTime();
      if (!Number.isFinite(t)) return "";
      ms = t;
    } else {
      ms = parseUtcSqlToMs(input);
    }
    if (ms == null) return "";

    return BLOG_DATE_FMT.format(ms);
  } catch {
    return "";
  }
}

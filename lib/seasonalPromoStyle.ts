export type SeasonalPromoStyle =
  | "classic"
  | "red-alert"
  | "black-friday"
  | "timer-pulse";

export const DEFAULT_SEASONAL_PROMO_STYLE: SeasonalPromoStyle = "red-alert";

export const SEASONAL_PROMO_STYLE_OPTIONS = [
  { value: "classic", label: "Brand Purple (Classic)" },
  { value: "red-alert", label: "Red Alert (Blinking)" },
  { value: "black-friday", label: "Black Friday (Black + Amber)" },
  { value: "timer-pulse", label: "Purple + Red Timer (Pulse)" },
] as const;

export function normalizeSeasonalPromoStyle(raw: unknown): SeasonalPromoStyle {
  if (typeof raw !== "string") return DEFAULT_SEASONAL_PROMO_STYLE;
  const v = raw.trim().toLowerCase();
  if (
    v === "classic" ||
    v === "red-alert" ||
    v === "black-friday" ||
    v === "timer-pulse"
  ) {
    return v;
  }
  return DEFAULT_SEASONAL_PROMO_STYLE;
}

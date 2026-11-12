/**
 * Sidhu Insights — client-safe shared types, bounds and pure date helpers.
 * No server imports here (no db / fs): used by both /api/admin-insights/* and the Sidhu UI.
 */

export const INSIGHTS_NOT_INSTALLED = { installed: false, state: "not_installed" } as const;

export const INSIGHTS_MAX_RANGE_DAYS = 366;

/** Safe bounds for Settings POST (server-authoritative; UI mirrors for input min/max). */
export const INSIGHTS_SETTINGS_BOUNDS = {
  cleanup_min_interval_sec: { min: 60, max: 86_400 },
  detail_retention_days: { min: 7, max: 365 },
  summary_retention_days: { min: 30, max: 730 },
  ip_full_retention_days: { min: 1, max: 90 },
} as const;

export type InsightsRangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export type InsightsRangeState = {
  preset: InsightsRangePreset;
  from: string;
  to: string;
};

export type InsightsRangeMeta = {
  from: string;
  to: string;
  days: number;
};

export type InsightsNotInstalled = { installed: false; state: "not_installed" };

export type InsightsDataSource = "detail" | "summary";

type OkBase = {
  installed: true;
  state: "ok";
  range: InsightsRangeMeta;
  include_bots: boolean;
  /** "detail" = exact from sessions/events; "summary" = daily rollups (older than detail retention). */
  source: InsightsDataSource;
  notes: string[];
};

export type InsightsKpis = {
  sessions: number;
  visitors: number | null;
  pageviews: number;
  add_to_cart: number;
  checkout_starts: number;
  place_order_clicks: number;
  orders: number;
  new_sessions: number | null;
  returning_sessions: number | null;
  js_errors: number | null;
  not_found_404: number | null;
};

export type InsightsTrendPoint = {
  date: string;
  sessions: number;
  visitors: number | null;
  pageviews: number;
  orders: number;
};

export type InsightsTopPath = { path: string; sessions: number };

export type InsightsSummaryResponse = OkBase & {
  has_data: boolean;
  kpis: InsightsKpis;
  /** AVG(duration_ms) over sessions with engaged time; null when unavailable (rollup mode / none yet). */
  avg_engaged_ms: number | null;
  trend: InsightsTrendPoint[];
  top_paths: Array<{ path: string; pageviews: number; sessions: number }>;
  top_landings: InsightsTopPath[];
  top_exits: InsightsTopPath[];
};

export type InsightsJourneyStep = {
  type: string;
  path: string;
  label: string | null;
  /** Page-view steps only: engaged ms summed from timing events for that page view. */
  engaged_ms: number | null;
  /** Page-view steps only: deepest scroll watermark (0-100). */
  scroll_pct: number | null;
};

export type InsightsJourney = {
  ref: string;
  started_at: string;
  duration_ms: number | null;
  is_bot: boolean;
  is_new_visitor: boolean;
  is_returning: boolean;
  device_type: string;
  browser_name: string | null;
  os_name: string | null;
  source_bucket: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_host: string | null;
  landing_path: string;
  exit_path: string | null;
  pageview_count: number;
  event_count: number;
  has_order: boolean;
  steps: InsightsJourneyStep[];
  steps_truncated: boolean;
  /** Last clicked element on the exit page (label from allowlisted click props); null if none. */
  exit_click: { label: string | null; tag: string | null; click_id: string | null } | null;
};

export type InsightsJourneysResponse = OkBase & {
  has_data: boolean;
  limit: number;
  rows: InsightsJourney[];
};
export type InsightsSettingsValues = {
  enabled: boolean;
  recording_enabled: boolean;
  kill_switch: boolean;
  geo_city_enabled: boolean;
  cleanup_min_interval_sec: number;
  detail_retention_days: number;
  summary_retention_days: number;
  ip_full_retention_days: number;
  exclude_bots_from_kpis: boolean;
};

export type InsightsSettingsResponse = {
  installed: true;
  state: "ok";
  settings: InsightsSettingsValues;
  recording_active: boolean;
  cleanup: {
    holder: string | null;
    acquired_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    last_deleted_events: number;
    last_deleted_sessions: number;
    last_masked_ips: number;
  } | null;
  bounds: typeof INSIGHTS_SETTINGS_BOUNDS;
};

/** Phase 2 — funnel step ids (product view → order placed). */
export type InsightsFunnelStepId =
  | "product_view"
  | "add_to_cart"
  | "cart_view"
  | "checkout_start"
  | "order_placed";

export type InsightsFunnelStep = {
  id: InsightsFunnelStepId;
  label: string;
  sessions: number;
  /** Drop-off % from previous step; null for the first step or when previous is 0. */
  dropoff_pct: number | null;
};

export type InsightsFunnelResponse = OkBase & {
  has_data: boolean;
  steps: InsightsFunnelStep[];
};

/** Phase 2 — checkout problem metric; tracked=false when the beacon never emits that signal. */
export type InsightsCheckoutMetric = {
  id: string;
  label: string;
  tracked: boolean;
  count: number | null;
  note: string | null;
};

export type InsightsCheckoutProblemsResponse = OkBase & {
  has_data: boolean;
  metrics: InsightsCheckoutMetric[];
};

export type InsightsOrderAttributionRow = {
  order_id: string;
  ordered_at: string | null;
  payment_method: string | null;
  status: string | null;
  total: number | null;
  source: string | null;
  medium: string | null;
  referrer_host: string | null;
  landing_path: string;
  device_type: string;
};

export type InsightsOrdersAttributionResponse = OkBase & {
  has_data: boolean;
  limit: number;
  rows: InsightsOrderAttributionRow[];
};

export type InsightsDevice = "m" | "d";

export type InsightsClickedElement = {
  label: string;
  tag: string;
  clicks: number;
};

export type InsightsPageBehaviourRow = {
  path: string;
  views: number;
  /** Total engaged ms for the path / views; null when no timing was recorded. */
  avg_engaged_ms: number | null;
  /** Page views that reached each milestone (count) — share of views = count / views. */
  reach: { m25: number; m50: number; m75: number; m100: number };
  top_clicks: InsightsClickedElement[];
  rage_clicks: number;
  /** Sessions whose exit_path is this path / views; null when not computable. */
  exit_rate_pct: number | null;
};

export type InsightsPageBehaviourResponse = OkBase & {
  has_data: boolean;
  device: InsightsDevice | "all";
  path: string | null;
  truncated: boolean;
  rows: InsightsPageBehaviourRow[];
};

export type InsightsClickMapBucket = { x_pct: number; y_pct: number; count: number };

export type InsightsClickMapResponse = OkBase & {
  has_data: boolean;
  path: string;
  device: InsightsDevice;
  total_clicks: number;
  truncated: boolean;
  /** x_pct / y_pct are stored rounded to the nearest 2%. */
  buckets: InsightsClickMapBucket[];
};

export const INSIGHTS_MOBILE_WIDTH_PX = 390;
export const INSIGHTS_DESKTOP_WIDTH_PX = 1280;

export const INSIGHTS_EXPORT_MAX_ROWS = 50_000;
export const INSIGHTS_EXPORT_DEFAULT_ROWS = 10_000;

export type InsightsExportKind = "daily" | "sessions";

// ---------------------------------------------------------------------------
// Pure date helpers (UTC, YYYY-MM-DD) — insights timestamps are stored in UTC.
// ---------------------------------------------------------------------------

export function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDaysIso(s: string, days: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return isoDateUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Inclusive day count between two valid ISO dates (from <= to => >= 1). */
export function inclusiveDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(ms / 86_400_000) + 1;
}

export function rangeFromPreset(preset: Exclude<InsightsRangePreset, "custom">, now = new Date()): InsightsRangeState {
  const to = isoDateUtc(now);
  const span = preset === "today" ? 1 : preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return { preset, from: addDaysIso(to, -(span - 1)), to };
}

/** Returns an error message or null when from/to are a valid inclusive range. */
export function validateRangeInputs(from: string, to: string): string | null {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return "Enter valid dates (YYYY-MM-DD).";
  if (from > to) return "Start date must be on or before end date.";
  if (inclusiveDays(from, to) > INSIGHTS_MAX_RANGE_DAYS) {
    return `Range cannot exceed ${INSIGHTS_MAX_RANGE_DAYS} days.`;
  }
  return null;
}

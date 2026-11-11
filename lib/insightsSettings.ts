/**
 * Sidhu Insights settings reader — fail-safe, short TTL cache.
 * Missing tables / DB errors => disabled (never throw to callers, never log PII).
 */

export type InsightsSettings = {
  enabled: boolean;
  kill_switch: boolean;
  recording_enabled: boolean;
  geo_city_enabled: boolean;
  detail_retention_days: number;
  summary_retention_days: number;
  ip_full_retention_days: number;
  cleanup_batch_size: number;
  cleanup_min_interval_sec: number;
  ingest_max_body_bytes: number;
  exclude_bots_from_kpis: boolean;
};

export const INSIGHTS_SETTINGS_CACHE_TTL_MS = 5_000;

const DISABLED: InsightsSettings = {
  enabled: false,
  kill_switch: false,
  recording_enabled: false,
  geo_city_enabled: false,
  detail_retention_days: 90,
  summary_retention_days: 365,
  ip_full_retention_days: 30,
  cleanup_batch_size: 500,
  cleanup_min_interval_sec: 300,
  ingest_max_body_bytes: 16384,
  exclude_bots_from_kpis: true,
};

type CacheEntry = { at: number; value: InsightsSettings };

let cache: CacheEntry | null = null;

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown?]>;
};

function asBool(v: unknown, fallback = false): boolean {
  if (v === true || v === 1 || v === "1" || v === "true") return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return fallback;
}

function asInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function mapRows(rows: Array<{ setting_key?: string; setting_value?: string }>): InsightsSettings {
  const map = new Map<string, string>();
  for (const r of rows || []) {
    if (r && typeof r.setting_key === "string") {
      map.set(r.setting_key, String(r.setting_value ?? ""));
    }
  }
  return {
    enabled: asBool(map.get("enabled"), false),
    kill_switch: asBool(map.get("kill_switch"), false),
    recording_enabled: asBool(map.get("recording_enabled"), false),
    geo_city_enabled: asBool(map.get("geo_city_enabled"), false),
    detail_retention_days: asInt(map.get("detail_retention_days"), 90),
    summary_retention_days: asInt(map.get("summary_retention_days"), 365),
    ip_full_retention_days: asInt(map.get("ip_full_retention_days"), 30),
    cleanup_batch_size: asInt(map.get("cleanup_batch_size"), 500),
    cleanup_min_interval_sec: asInt(map.get("cleanup_min_interval_sec"), 300),
    ingest_max_body_bytes: asInt(map.get("ingest_max_body_bytes"), 16384),
    exclude_bots_from_kpis: asBool(map.get("exclude_bots_from_kpis"), true),
  };
}

/** True when ingest should accept and store (enabled, not killed, recording on). */
export function insightsRecordingActive(s: InsightsSettings): boolean {
  return s.enabled === true && s.kill_switch !== true && s.recording_enabled === true;
}

export function clearInsightsSettingsCache(): void {
  cache = null;
}

/**
 * Read settings. Fail-safe: any error / missing table => DISABLED defaults.
 * Optional `db` injection for tests; otherwise dynamic-imports pool.
 */
export async function getInsightsSettings(opts?: {
  db?: Queryable;
  nowMs?: number;
  ttlMs?: number;
}): Promise<InsightsSettings> {
  const now = opts?.nowMs ?? Date.now();
  const ttl = opts?.ttlMs ?? INSIGHTS_SETTINGS_CACHE_TTL_MS;
  if (cache && now - cache.at < ttl) return cache.value;

  try {
    const db =
      opts?.db ??
      ((await import("./db")).default as unknown as Queryable);
    const [rows] = await db.query(
      "SELECT setting_key, setting_value FROM insights_settings"
    );
    const value = mapRows(rows as Array<{ setting_key?: string; setting_value?: string }>);
    cache = { at: now, value };
    return value;
  } catch {
    const value = { ...DISABLED };
    cache = { at: now, value };
    return value;
  }
}

export function __insightsSettingsDisabledDefaults(): InsightsSettings {
  return { ...DISABLED };
}

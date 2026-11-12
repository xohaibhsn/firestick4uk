/**
 * GET/POST /api/admin-insights/settings — Super Admin only (insights.settings).
 * Writers/managers => 403 on every method (requireAdminPermission).
 * POST requires same-origin (requireAdmin mutate check) and validates every field strictly.
 * Updates insights_settings with parameterised SQL, clears in-memory readers, and audits
 * `insights.settings_update` (metadata holds flags/numbers only — no PII).
 *
 * Missing tables => 200 { installed:false, state:"not_installed" } (never 500).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import pool from "@/lib/db";
import { getRequestMeta, requireAdminPermission } from "@/lib/adminAuth";
import { actorFromIdentity, recordAdminAudit } from "@/lib/adminAudit";
import { clearInsightsSettingsCache } from "@/lib/insightsSettings";
import {
  isMissingTableError,
  qrows,
} from "@/components/sidhu/insights/insightsServer";
import {
  INSIGHTS_NOT_INSTALLED,
  INSIGHTS_SETTINGS_BOUNDS,
  type InsightsSettingsResponse,
  type InsightsSettingsValues,
} from "@/components/sidhu/insights/insightsTypes";

const BOOL_KEYS = ["enabled", "recording_enabled", "kill_switch", "geo_city_enabled"] as const;
const INT_KEYS = [
  "cleanup_min_interval_sec",
  "detail_retention_days",
  "summary_retention_days",
  "ip_full_retention_days",
] as const;
const ALLOWED_BODY_KEYS = new Set<string>([...BOOL_KEYS, ...INT_KEYS, "confirm_privacy_approved"]);

type BoolKey = (typeof BOOL_KEYS)[number];
type IntKey = (typeof INT_KEYS)[number];

function asBool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === 1 || v === "1" || v === "true") return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return fallback;
}

function asInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

async function readSettings(): Promise<InsightsSettingsValues> {
  const rows = await qrows<{ setting_key?: string; setting_value?: string }>(
    "SELECT setting_key, setting_value FROM insights_settings"
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r && typeof r.setting_key === "string") map.set(r.setting_key, String(r.setting_value ?? ""));
  }
  // Defaults mirror migration defaults: everything OFF.
  return {
    enabled: asBool(map.get("enabled"), false),
    recording_enabled: asBool(map.get("recording_enabled"), false),
    kill_switch: asBool(map.get("kill_switch"), false),
    geo_city_enabled: asBool(map.get("geo_city_enabled"), false),
    cleanup_min_interval_sec: asInt(map.get("cleanup_min_interval_sec"), 300),
    detail_retention_days: asInt(map.get("detail_retention_days"), 90),
    summary_retention_days: asInt(map.get("summary_retention_days"), 365),
    ip_full_retention_days: asInt(map.get("ip_full_retention_days"), 30),
    exclude_bots_from_kpis: asBool(map.get("exclude_bots_from_kpis"), true),
  };
}

async function readCleanup(): Promise<InsightsSettingsResponse["cleanup"]> {
  try {
    const rows = await qrows<Record<string, unknown>>(
      `SELECT holder,
              DATE_FORMAT(acquired_at, '%Y-%m-%dT%H:%i:%sZ') AS acquired_at,
              DATE_FORMAT(last_success_at, '%Y-%m-%dT%H:%i:%sZ') AS last_success_at,
              last_error, last_deleted_events, last_deleted_sessions, last_masked_ips
         FROM insights_cleanup_lease
        WHERE lease_name = ?
        LIMIT 1`,
      ["insights_retention"]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      holder: r.holder ? String(r.holder).slice(0, 64) : null,
      acquired_at: r.acquired_at ? String(r.acquired_at) : null,
      last_success_at: r.last_success_at ? String(r.last_success_at) : null,
      // Truncated; DB error text only — never request data.
      last_error: r.last_error ? String(r.last_error).slice(0, 200) : null,
      last_deleted_events: Number(r.last_deleted_events) || 0,
      last_deleted_sessions: Number(r.last_deleted_sessions) || 0,
      last_masked_ips: Number(r.last_masked_ips) || 0,
    };
  } catch {
    return null;
  }
}

async function buildPayload(): Promise<InsightsSettingsResponse> {
  const settings = await readSettings();
  const cleanup = await readCleanup();
  return {
    installed: true,
    state: "ok",
    settings,
    recording_active:
      settings.enabled === true && settings.kill_switch !== true && settings.recording_enabled === true,
    cleanup,
    bounds: INSIGHTS_SETTINGS_BOUNDS,
  };
}

type Validated =
  | { ok: false; error: string; code?: string }
  | {
      ok: true;
      changed: Partial<Record<BoolKey, boolean>> & Partial<Record<IntKey, number>>;
    };

function validateBody(body: unknown, current: InsightsSettingsValues): Validated {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "JSON object body required." };
  }
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (!ALLOWED_BODY_KEYS.has(k)) return { ok: false, error: `Unknown field: ${k.slice(0, 40)}` };
  }

  const settingKeysPresent = [...BOOL_KEYS, ...INT_KEYS].filter((k) => k in b);

  if ("confirm_privacy_approved" in b && typeof b.confirm_privacy_approved !== "boolean") {
    return { ok: false, error: "confirm_privacy_approved must be a boolean." };
  }
  if (settingKeysPresent.length === 0) return { ok: false, error: "No settings provided." };

  const changed: Partial<Record<BoolKey, boolean>> & Partial<Record<IntKey, number>> = {};

  for (const k of BOOL_KEYS) {
    if (!(k in b)) continue;
    const v = b[k];
    if (v === true || v === 1) changed[k] = true;
    else if (v === false || v === 0) changed[k] = false;
    else return { ok: false, error: `${k} must be a boolean.` };
  }

  for (const k of INT_KEYS) {
    if (!(k in b)) continue;
    const v = b[k];
    const { min, max } = INSIGHTS_SETTINGS_BOUNDS[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      return { ok: false, error: `${k} must be a whole number between ${min} and ${max}.` };
    }
    changed[k] = v;
  }

  const merged = { ...current, ...changed };
  if (merged.ip_full_retention_days > merged.detail_retention_days) {
    return { ok: false, error: "ip_full_retention_days cannot exceed detail_retention_days." };
  }
  if (merged.detail_retention_days > merged.summary_retention_days) {
    return { ok: false, error: "detail_retention_days cannot exceed summary_retention_days." };
  }

  // Recording must stay OFF until privacy text is approved — require explicit confirmation to turn it ON.
  if (changed.recording_enabled === true && current.recording_enabled !== true) {
    if (b.confirm_privacy_approved !== true) {
      return {
        ok: false,
        code: "privacy_confirmation_required",
        error:
          "Recording must stay OFF until the privacy text is approved. Send confirm_privacy_approved: true to enable.",
      };
    }
  }

  return { ok: true, changed };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 401 / 403 (writer + manager) / same-origin check on POST all happen here.
  const admin = await requireAdminPermission(req, res, "insights.settings");
  if (!admin) return;

  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      return res.status(200).json(await buildPayload());
    }

    const current = await readSettings();
    const v = validateBody(req.body, current);
    if (!v.ok) {
      return res.status(400).json({ error: v.error, ...(v.code ? { code: v.code } : {}) });
    }

    const meta = getRequestMeta(req);
    const actor = actorFromIdentity(admin);

    const keys = Object.keys(v.changed);
    const updatedBy = admin.staffId ? `staff:${admin.staffId}` : "master";
    const placeholders = keys.map(() => "(?, ?, ?)").join(", ");
    const params: unknown[] = [];
    for (const k of keys) {
      const val = (v.changed as Record<string, boolean | number>)[k];
      params.push(k, typeof val === "boolean" ? (val ? "1" : "0") : String(val), updatedBy);
    }
    await pool.query(
      `INSERT INTO insights_settings (setting_key, setting_value, updated_by)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      params as never[]
    );

    clearInsightsSettingsCache();

    await recordAdminAudit({
      actor,
      action: "insights.settings_update",
      entityType: "insights_settings",
      entityId: keys.join(",").slice(0, 150),
      summary: `Insights settings updated: ${keys.join(", ")}`.slice(0, 500),
      metadata: { changed: v.changed },
      ip: meta.ip,
    });

    return res.status(200).json({ ok: true, ...(await buildPayload()) });
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.status(200).json({ ...INSIGHTS_NOT_INSTALLED });
    }
    const code = err && typeof err === "object" ? String((err as { code?: string }).code || "") : "";
    console.error("[insights-admin] settings failed", code || "unknown");
    return res.status(500).json({ error: "Insights settings are temporarily unavailable." });
  }
}

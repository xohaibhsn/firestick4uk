/**
 * Microsoft Clarity CMS settings helpers.
 * Keys live in existing site_content (page_name=settings). Off / empty by default.
 */

export const CLARITY_ENABLED_KEY = "clarity_enabled";
export const CLARITY_PROJECT_ID_KEY = "clarity_project_id";
export const CLARITY_DASHBOARD_URL_KEY = "clarity_dashboard_url";

export const CLARITY_PROJECT_ID_PATTERN = /^[a-z0-9]{6,20}$/i;
export const CLARITY_DASHBOARD_URL_PREFIX = "https://clarity.microsoft.com/";

export const CLARITY_CMS_KEYS = [
  CLARITY_ENABLED_KEY,
  CLARITY_PROJECT_ID_KEY,
  CLARITY_DASHBOARD_URL_KEY,
] as const;

export type ClarityCmsSettings = {
  enabled: boolean;
  projectId: string;
  dashboardUrl: string;
};

export function isClarityEnabledValue(raw: unknown): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function normalizeClarityEnabledForStore(raw: unknown): string {
  return isClarityEnabledValue(raw) ? "1" : "0";
}

export function isValidClarityProjectId(raw: unknown): boolean {
  const v = String(raw ?? "").trim();
  if (!v) return false;
  return CLARITY_PROJECT_ID_PATTERN.test(v);
}

/** Empty is valid (means unset). Non-empty must match the project-id pattern. */
export function validateClarityProjectIdInput(raw: unknown): {
  ok: boolean;
  value: string;
  error?: string;
} {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: "" };
  if (!CLARITY_PROJECT_ID_PATTERN.test(value)) {
    return {
      ok: false,
      value: "",
      error:
        "clarity_project_id must be 6–20 alphanumeric characters (a-z, 0-9), or empty",
    };
  }
  return { ok: true, value: value.toLowerCase() };
}

/** Empty is valid. Non-empty must start with https://clarity.microsoft.com/ */
export function validateClarityDashboardUrlInput(raw: unknown): {
  ok: boolean;
  value: string;
  error?: string;
} {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: "" };
  if (!value.startsWith(CLARITY_DASHBOARD_URL_PREFIX)) {
    return {
      ok: false,
      value: "",
      error: `clarity_dashboard_url must start with ${CLARITY_DASHBOARD_URL_PREFIX} or be empty`,
    };
  }
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") {
      return {
        ok: false,
        value: "",
        error: "clarity_dashboard_url must use https",
      };
    }
  } catch {
    return {
      ok: false,
      value: "",
      error: "clarity_dashboard_url is not a valid URL",
    };
  }
  return { ok: true, value };
}

/**
 * Read-side sanitiser: invalid project IDs and dashboard URLs become empty;
 * enabled becomes a normalised 0/1. Returns a shallow copy.
 */
export function sanitizeClaritySiteContentMap(
  map: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = { ...map };
  if (
    Object.prototype.hasOwnProperty.call(out, CLARITY_ENABLED_KEY) ||
    out[CLARITY_ENABLED_KEY] !== undefined
  ) {
    out[CLARITY_ENABLED_KEY] = normalizeClarityEnabledForStore(
      out[CLARITY_ENABLED_KEY]
    );
  }
  if (Object.prototype.hasOwnProperty.call(out, CLARITY_PROJECT_ID_KEY)) {
    const id = validateClarityProjectIdInput(out[CLARITY_PROJECT_ID_KEY]);
    out[CLARITY_PROJECT_ID_KEY] = id.ok ? id.value : "";
  }
  if (Object.prototype.hasOwnProperty.call(out, CLARITY_DASHBOARD_URL_KEY)) {
    const url = validateClarityDashboardUrlInput(out[CLARITY_DASHBOARD_URL_KEY]);
    out[CLARITY_DASHBOARD_URL_KEY] = url.ok ? url.value : "";
  }
  return out;
}

export function readClarityCmsSettings(
  map: Record<string, string> | null | undefined
): ClarityCmsSettings {
  const safe = sanitizeClaritySiteContentMap(map || {});
  const projectId = safe[CLARITY_PROJECT_ID_KEY] || "";
  return {
    enabled: isClarityEnabledValue(safe[CLARITY_ENABLED_KEY]),
    projectId: isValidClarityProjectId(projectId) ? projectId : "",
    dashboardUrl: safe[CLARITY_DASHBOARD_URL_KEY] || "",
  };
}

/** Validate a single CMS update for Clarity keys. Non-Clarity keys pass through. */
export function validateClarityCmsUpdate(
  key: string,
  value: string
): { ok: boolean; value: string; error?: string } {
  const k = String(key || "").trim();
  if (k === CLARITY_ENABLED_KEY) {
    return { ok: true, value: normalizeClarityEnabledForStore(value) };
  }
  if (k === CLARITY_PROJECT_ID_KEY) {
    return validateClarityProjectIdInput(value);
  }
  if (k === CLARITY_DASHBOARD_URL_KEY) {
    return validateClarityDashboardUrlInput(value);
  }
  return { ok: true, value: String(value ?? "") };
}

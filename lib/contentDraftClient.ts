/**
 * F4UK-MULTI-143 — pure client-safe draft helpers (Draft/Publish D3).
 * No Node imports, no DB, no lib/siteContentBaseHash.ts.
 */

export const DRAFT_ENTITY_TYPE = "site_content_page" as const;

export type DraftChangeEntry = { value: string; base_hash: string };
export type DraftChanges = Record<string, DraftChangeEntry>;

export type DraftBannerDto = {
  updated_by_name?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  key_count?: number | null;
  age_days?: number | null;
};

export type BuildDraftChangesResult = {
  changes: DraftChanges;
  skippedSettingsKeys: string[];
  missingHashKeys: string[];
};

export function buildDraftChanges(
  siteContent: Record<string, string>,
  savedContent: Record<string, string>,
  baseHashFn: (key: string) => string | undefined,
  isSettingsKey: (key: string) => boolean,
  keepBaseFrom?: DraftChanges | null
): BuildDraftChangesResult {
  const changes: DraftChanges = {};
  const skippedSettingsKeys: string[] = [];
  const missingHashKeys: string[] = [];
  const keys = new Set([
    ...Object.keys(siteContent || {}),
    ...Object.keys(savedContent || {}),
  ]);
  for (const key of keys) {
    const a = siteContent?.[key];
    const b = savedContent?.[key];
    if (String(a ?? "") === String(b ?? "")) continue;
    if (isSettingsKey(key)) {
      skippedSettingsKeys.push(key);
      continue;
    }
    const kept = keepBaseFrom?.[key];
    const keptHash =
      kept && typeof kept === "object"
        ? String((kept as DraftChangeEntry).base_hash ?? "")
        : "";
    const bh =
      /^[0-9a-f]{64}$/i.test(keptHash) ? keptHash : baseHashFn(key);
    if (bh === undefined) {
      missingHashKeys.push(key);
      continue;
    }
    changes[key] = { value: String(a ?? ""), base_hash: bh };
  }
  return { changes, skippedSettingsKeys, missingHashKeys };
}

/** Keys whose stored base_hash !== the current baseline hash (and baseline is known). */
export function liveChangedKeys(
  draftChanges: DraftChanges | null | undefined,
  baseHashFn: (key: string) => string | undefined
): string[] {
  const out: string[] = [];
  if (!draftChanges || typeof draftChanges !== "object") return out;
  for (const [key, entry] of Object.entries(draftChanges)) {
    if (!entry || typeof entry !== "object") continue;
    const stored = String((entry as DraftChangeEntry).base_hash ?? "");
    const live = baseHashFn(key);
    if (live === undefined) continue;
    if (stored !== live) out.push(key);
  }
  return out;
}

export function draftOverrides(
  draftChanges: DraftChanges | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!draftChanges || typeof draftChanges !== "object") return out;
  for (const [key, entry] of Object.entries(draftChanges)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof (entry as DraftChangeEntry).value === "string") {
      out[key] = (entry as DraftChangeEntry).value;
    }
  }
  return out;
}

/** Keys whose draft value already equals the saved (live) value. */
export function keysMatchingLive(
  draftChanges: DraftChanges | null | undefined,
  savedContent: Record<string, string>
): string[] {
  const out: string[] = [];
  if (!draftChanges || typeof draftChanges !== "object") return out;
  for (const [key, entry] of Object.entries(draftChanges)) {
    if (!entry || typeof entry !== "object") continue;
    const draftVal = String((entry as DraftChangeEntry).value ?? "");
    const liveVal = String(savedContent?.[key] ?? "");
    if (draftVal === liveVal) out.push(key);
  }
  return out;
}

function formatLondon(iso: string | null | undefined, nowMs: number): string {
  try {
    const raw = iso != null ? String(iso) : "";
    const d = raw ? new Date(raw) : new Date(nowMs);
    if (Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(nowMs));
    }
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    try {
      return new Date(nowMs).toISOString();
    } catch {
      return "";
    }
  }
}

/** Banner fields for the draft UI. Never throws. */
export function formatDraftBanner(
  dto: DraftBannerDto | null | undefined,
  nowMs: number = Date.now()
): {
  who: string;
  whenLondon: string;
  count: number;
  staleDaysWarning: boolean;
} {
  try {
    const who =
      String(dto?.updated_by_name || dto?.created_by_name || "someone").trim() ||
      "someone";
    const whenLondon = formatLondon(dto?.updated_at || dto?.created_at, nowMs);
    const count = Math.max(0, Number(dto?.key_count) || 0);
    const age = Number(dto?.age_days);
    const staleDaysWarning = Number.isFinite(age) && age >= 7;
    return { who, whenLondon, count, staleDaysWarning };
  } catch {
    return {
      who: "someone",
      whenLondon: "",
      count: 0,
      staleDaysWarning: false,
    };
  }
}

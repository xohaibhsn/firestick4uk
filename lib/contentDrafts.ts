/**
 * F4UK-MULTI-142 — CMS content draft helpers (SERVER ONLY).
 * Never writes site_content. Table created via scripts/migrate-content-drafts.js (owner DDL).
 */
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { isSuperAdminSettingsKey } from "./adminPermissions";
import { REVISION_MAX_BYTES } from "./contentRevisions";
import { SITE_CONTENT_DEFAULTS } from "./siteContentSeed";

export const DRAFT_ENTITY_TYPES = ["site_content_page"] as const;
export type DraftEntityType = (typeof DRAFT_ENTITY_TYPES)[number];

/** Identical source to lib/contentRevisions.ts SECRET_KEY_RE (not exported there). */
const SECRET_KEY_RE =
  /password|password_hash|session_token|cookie|authorization|smtp|secret|credential|api_key|api_secret|db_password|private_key/i;

const ENTITY_ID_RE = /^[a-z0-9_-]{1,50}$/;
const CONTENT_KEY_RE = /^[a-z0-9_]{1,100}$/;
const BASE_HASH_RE = /^[a-f0-9]{64}$/;

export type DraftChangeEntry = { value: string; base_hash: string };
export type DraftChanges = Record<string, DraftChangeEntry>;

export type DraftValidationError = {
  code:
    | "invalid_entity"
    | "empty_draft"
    | "too_many_keys"
    | "invalid_key"
    | "settings_key_not_allowed"
    | "secret_key_not_allowed"
    | "unknown_key"
    | "invalid_value"
    | "invalid_base_hash"
    | "draft_too_large";
  message: string;
  key?: string;
};

export type ContentDraftRow = {
  entity_type: string;
  entity_id: string;
  draft_json: string;
  draft_version: number;
  created_by_name: string;
  updated_by_name: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ContentDraftDto = {
  entity_type: string;
  entity_id: string;
  changes: DraftChanges;
  draft_version: number;
  created_by_name: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
  age_days: number;
  key_count: number;
  corrupt?: true;
};

export type ContentDraftSummaryDto = Omit<ContentDraftDto, "changes">;

/** Exported for tests that assert source identity with contentRevisions. */
export function secretKeyReSource(): string {
  return SECRET_KEY_RE.source;
}

export function validateEntity(
  entityType: unknown,
  entityId: unknown
): { ok: true; entity_type: DraftEntityType; entity_id: string } | { ok: false; errors: DraftValidationError[] } {
  const type = typeof entityType === "string" ? entityType.trim() : "";
  const id = typeof entityId === "string" ? entityId.trim() : "";
  if (!(DRAFT_ENTITY_TYPES as readonly string[]).includes(type) || !ENTITY_ID_RE.test(id)) {
    return {
      ok: false,
      errors: [{ code: "invalid_entity", message: "Invalid entity_type or entity_id." }],
    };
  }
  return { ok: true, entity_type: type as DraftEntityType, entity_id: id };
}

export function validateEntityTypeOnly(
  entityType: unknown
): { ok: true; entity_type: DraftEntityType } | { ok: false; errors: DraftValidationError[] } {
  const type = typeof entityType === "string" ? entityType.trim() : "";
  if (!(DRAFT_ENTITY_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      errors: [{ code: "invalid_entity", message: "Invalid entity_type." }],
    };
  }
  return { ok: true, entity_type: type as DraftEntityType };
}

export function validateDraftChanges(
  changes: unknown,
  opts: { knownKeys: Set<string> }
): { ok: true; changes: DraftChanges } | { ok: false; errors: DraftValidationError[] } {
  const errors: DraftValidationError[] = [];
  if (
    changes == null ||
    typeof changes !== "object" ||
    Array.isArray(changes) ||
    Object.getPrototypeOf(changes) !== Object.prototype
  ) {
    return { ok: false, errors: [{ code: "empty_draft", message: "Draft changes must be a plain object." }] };
  }

  const keys = Object.keys(changes as Record<string, unknown>);
  if (keys.length === 0) {
    return { ok: false, errors: [{ code: "empty_draft", message: "Draft has no changes." }] };
  }
  if (keys.length > 200) {
    return {
      ok: false,
      errors: [{ code: "too_many_keys", message: "Draft exceeds 200 keys." }],
    };
  }

  const out: DraftChanges = {};
  for (const key of keys) {
    if (!CONTENT_KEY_RE.test(key)) {
      errors.push({ code: "invalid_key", message: "Invalid content key.", key });
      continue;
    }
    if (isSuperAdminSettingsKey(key)) {
      errors.push({
        code: "settings_key_not_allowed",
        message: "Super-admin settings keys cannot be drafted.",
        key,
      });
      continue;
    }
    if (SECRET_KEY_RE.test(key)) {
      errors.push({
        code: "secret_key_not_allowed",
        message: "Secret keys cannot be drafted.",
        key,
      });
      continue;
    }
    if (!opts.knownKeys.has(key)) {
      errors.push({ code: "unknown_key", message: "Unknown content key.", key });
      continue;
    }
    const entry = (changes as Record<string, unknown>)[key];
    if (
      entry == null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof (entry as { value?: unknown }).value !== "string"
    ) {
      errors.push({ code: "invalid_value", message: "Draft value must be a string.", key });
      continue;
    }
    const baseHash = (entry as { base_hash?: unknown }).base_hash;
    if (typeof baseHash !== "string" || !BASE_HASH_RE.test(baseHash)) {
      errors.push({
        code: "invalid_base_hash",
        message: "base_hash must be a 64-char lowercase hex SHA-256.",
        key,
      });
      continue;
    }
    out[key] = { value: (entry as { value: string }).value, base_hash: baseHash };
  }

  if (errors.length) return { ok: false, errors };

  let serialized: string;
  try {
    serialized = JSON.stringify(out);
  } catch {
    return { ok: false, errors: [{ code: "draft_too_large", message: "Draft could not be serialized." }] };
  }
  if (Buffer.byteLength(serialized, "utf8") > REVISION_MAX_BYTES) {
    return {
      ok: false,
      errors: [{ code: "draft_too_large", message: "Draft exceeds 1 MB." }],
    };
  }

  return { ok: true, changes: out };
}

/** Keys that exist in site_content (for the requested set) UNION seed defaults. */
export async function loadKnownKeys(
  conn: Pick<PoolConnection, "query">,
  keys: string[]
): Promise<Set<string>> {
  const known = new Set<string>();
  for (const tuple of SITE_CONTENT_DEFAULTS) {
    const k = tuple[0];
    if (keys.includes(k)) known.add(k);
  }
  if (keys.length === 0) return known;

  const placeholders = keys.map(() => "?").join(",");
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT content_key FROM site_content WHERE content_key IN (${placeholders})`,
    keys
  );
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const k = String((row as { content_key?: unknown }).content_key || "");
      if (k) known.add(k);
    }
  }
  return known;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return String(value);
}

function ageDaysFrom(createdAt: Date | string, nowMs = Date.now()): number {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 0;
  const ms = Math.max(0, nowMs - d.getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function parseDraftJson(raw: unknown): { changes: DraftChanges; corrupt?: true } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { changes: {}, corrupt: true };
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.getPrototypeOf(parsed) !== Object.prototype
    ) {
      return { changes: {}, corrupt: true };
    }
    const changes: DraftChanges = {};
    for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        entry != null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof (entry as { value?: unknown }).value === "string" &&
        typeof (entry as { base_hash?: unknown }).base_hash === "string"
      ) {
        changes[key] = {
          value: (entry as { value: string }).value,
          base_hash: (entry as { base_hash: string }).base_hash,
        };
      } else {
        return { changes: {}, corrupt: true };
      }
    }
    return { changes };
  } catch {
    return { changes: {}, corrupt: true };
  }
}

export function draftRowToDto(row: ContentDraftRow, nowMs = Date.now()): ContentDraftDto {
  const parsed = parseDraftJson(row.draft_json);
  const dto: ContentDraftDto = {
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    changes: parsed.changes,
    draft_version: Number(row.draft_version) || 0,
    created_by_name: String(row.created_by_name || ""),
    updated_by_name: String(row.updated_by_name || ""),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    age_days: ageDaysFrom(row.created_at, nowMs),
    key_count: Object.keys(parsed.changes).length,
  };
  if (parsed.corrupt) dto.corrupt = true;
  return dto;
}

export function draftRowToSummary(row: ContentDraftRow, nowMs = Date.now()): ContentDraftSummaryDto {
  const full = draftRowToDto(row, nowMs);
  const { changes: _omit, ...summary } = full;
  return summary;
}

export { REVISION_MAX_BYTES, SECRET_KEY_RE };

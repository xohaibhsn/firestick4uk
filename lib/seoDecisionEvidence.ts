/**
 * AB-5M — Pure Measurement / Decision Evidence contracts.
 *
 * Durable decision + outcome shapes only. No DB, HTTP, providers, timers,
 * scheduling, or side effects. Reuses AB-3 / AB-5 taxonomies.
 *
 * Runtime usage / provider accounting belongs to AB-11A.
 *
 * AB-5M1A: recursive NO_GSC_DEGRADED_MODE metric guard, JSON-safe evidence
 * normalization, canonical key-sorted serialization for replay equality, and
 * AB-3 schedulerEligible consistency.
 */

import {
  BLOG_NEXT_BEST_ACTIONS,
  MAX_INTENT_CHARS,
  MAX_OPPORTUNITY_ID_CHARS,
  MAX_REASON_EVIDENCE_ITEMS,
  MAX_TOPIC_CHARS,
  MAX_URL_CHARS,
  isAutonomousNewBlogEligible,
  isOnSiteFirestickUrl,
  type BlogNextBestAction,
  type BlogOpportunityDecision,
  type BlogOpportunityReasonCode,
} from "@/lib/blogOpportunityEngine";

import {
  BLOG_PRIORITY_UNCERTAINTIES,
  BLOG_RELATIVE_ACTION_COSTS,
  MAX_PRIORITY_UNCERTAINTY_REASON_CHARS,
  MAX_PRIORITY_UNCERTAINTY_REASONS,
  type BlogPrioritizedOpportunity,
  type BlogPriorityClass,
  type BlogPriorityTier,
  type BlogPriorityUncertainty,
  type BlogRelativeActionCost,
} from "@/lib/blogOpportunityPrioritizer";

export const SEO_DECISION_EVIDENCE_MODES = [
  "GSC_AVAILABLE",
  "NO_GSC_DEGRADED_MODE",
] as const;

export type SeoDecisionEvidenceMode =
  (typeof SEO_DECISION_EVIDENCE_MODES)[number];

export const SEO_DECISION_OUTCOME_WINDOWS = [7, 14, 28] as const;

export type SeoDecisionOutcomeWindow =
  (typeof SEO_DECISION_OUTCOME_WINDOWS)[number];

export const MAX_DECISION_EXPLANATION_CHARS = 280;
export const MAX_BASELINE_EVIDENCE_CHARS = 4_000;
export const MAX_OUTCOME_EVIDENCE_CHARS = 4_000;
export const MAX_EVIDENCE_DEPTH = 8;
export const MAX_EVIDENCE_OBJECT_KEYS = 64;
export const MAX_EVIDENCE_ARRAY_LENGTH = 64;
export const MAX_EVIDENCE_NODES = 256;

/** Google-metric key names forbidden under NO_GSC_DEGRADED_MODE (any nesting). */
export const FABRICATED_GSC_METRIC_KEYS = [
  "impressions",
  "clicks",
  "ctr",
  "position",
  "averagePosition",
  "average_position",
  "avg_position",
  "avgPosition",
  "rank",
  "ranking",
  "indexed",
  "indexingStatus",
  "indexing_status",
  "indexing_state",
  "indexingState",
] as const;

const ACTIONS = new Set<string>(BLOG_NEXT_BEST_ACTIONS);
const UNCERTAINTIES = new Set<string>(BLOG_PRIORITY_UNCERTAINTIES);
const COSTS = new Set<string>(BLOG_RELATIVE_ACTION_COSTS);
const EVIDENCE_MODES = new Set<string>(SEO_DECISION_EVIDENCE_MODES);
const OUTCOME_WINDOWS = new Set<number>(SEO_DECISION_OUTCOME_WINDOWS);
const PRIORITY_TIERS = new Set<number>([0, 1, 2, 3, 9]);
const PRIORITY_CLASSES = new Set<string>([
  "BLOCKING_TECHNICAL",
  "REUSE_EXISTING",
  "IMPROVE_EXISTING",
  "CREATE_NEW",
  "NO_ACTION",
]);

const AB3_REASON_CODES = new Set<string>([
  "INVALID_INPUT",
  "EVIDENCE_MISSING",
  "EVIDENCE_STALE",
  "TECHNICAL_BLOCKER",
  "HISTORICAL_RECOVERY_CANDIDATE",
  "INDEXING_REVIEW_REQUIRED",
  "EXISTING_CONTENT_REFRESH",
  "METADATA_ONLY",
  "INTERNAL_LINK_GAP",
  "IMAGE_GAP",
  "NO_EXISTING_CONTENT",
  "NEW_BLOG_EVIDENCE_READY",
  "NO_ACTIONABLE_SIGNAL",
]);

const FORBIDDEN_GSC_KEYS = new Set<string>(
  FABRICATED_GSC_METRIC_KEYS.map((k) => normalizeEvidenceKey(k))
);

export type SeoDecisionEvidenceInput = {
  opportunityId: string;
  topic?: string | null;
  intent?: string | null;
  decisionAction: BlogNextBestAction;
  targetEntityId: number | null;
  targetUrl: string | null;
  schedulerEligible: boolean;
  decisionReasonCodes: BlogOpportunityReasonCode[];
  decisionExplanation: string;
  priorityTier: BlogPriorityTier;
  priorityClass: BlogPriorityClass;
  uncertainty: BlogPriorityUncertainty;
  uncertaintyReasons?: string[];
  estimatedCost: BlogRelativeActionCost;
  evidenceMode: SeoDecisionEvidenceMode;
  /** Factual non-invented baseline only; may be null/absent when unknown. */
  baselineEvidence?: Record<string, unknown> | null;
  decidedAt?: string | null;
};

export type SeoDecisionEvidenceRecord = {
  id: number;
  opportunityId: string;
  topic: string | null;
  intent: string | null;
  decisionAction: BlogNextBestAction;
  targetEntityId: number | null;
  targetUrl: string | null;
  schedulerEligible: boolean;
  decisionReasonCodes: BlogOpportunityReasonCode[];
  decisionExplanation: string;
  priorityTier: BlogPriorityTier;
  priorityClass: BlogPriorityClass;
  uncertainty: BlogPriorityUncertainty;
  uncertaintyReasons: string[];
  estimatedCost: BlogRelativeActionCost;
  evidenceMode: SeoDecisionEvidenceMode;
  baselineEvidence: Record<string, unknown> | null;
  decidedAt: string;
  createdAt: string;
};

export type SeoDecisionOutcomeInput = {
  decisionId: number;
  windowDays: SeoDecisionOutcomeWindow;
  evidenceMode: SeoDecisionEvidenceMode;
  outcomeEvidence?: Record<string, unknown> | null;
  observedAt: string;
};

export type SeoDecisionOutcomeRecord = {
  id: number;
  decisionId: number;
  windowDays: SeoDecisionOutcomeWindow;
  evidenceMode: SeoDecisionEvidenceMode;
  outcomeEvidence: Record<string, unknown> | null;
  observedAt: string;
  createdAt: string;
};

export type SeoDecisionEvidenceParseOk<T> = { ok: true; value: T };
export type SeoDecisionEvidenceParseBad = {
  ok: false;
  code: string;
  message: string;
};
export type SeoDecisionEvidenceParseResult<T> =
  | SeoDecisionEvidenceParseOk<T>
  | SeoDecisionEvidenceParseBad;

function fail(code: string, message: string): SeoDecisionEvidenceParseBad {
  return { ok: false, code, message };
}

export function normalizeEvidenceKey(key: string): string {
  return String(key).trim().toLowerCase();
}

function isStrictPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwnAccessor(obj: object): boolean {
  for (const key of Object.getOwnPropertyNames(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc) continue;
    if (typeof desc.get === "function" || typeof desc.set === "function") {
      return true;
    }
  }
  for (const sym of Object.getOwnPropertySymbols(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, sym);
    if (!desc) continue;
    if (typeof desc.get === "function" || typeof desc.set === "function") {
      return true;
    }
  }
  return false;
}

type NormalizeOk = { ok: true; value: unknown };
type NormalizeBad = { ok: false; message: string };

/**
 * Deep-clone JSON-safe evidence without invoking getters.
 * Rejects Date/class/Map/Set/cycles/NaN/Infinity/bigint/symbol/functions.
 */
export function normalizeJsonSafeEvidence(
  raw: unknown
): NormalizeOk | NormalizeBad {
  const seen = new WeakSet<object>();
  let nodes = 0;

  function walk(value: unknown, depth: number): NormalizeOk | NormalizeBad {
    nodes += 1;
    if (nodes > MAX_EVIDENCE_NODES) {
      return { ok: false, message: "Evidence payload exceeds node bound." };
    }
    if (depth > MAX_EVIDENCE_DEPTH) {
      return { ok: false, message: "Evidence payload exceeds nesting depth." };
    }

    if (value === null) return { ok: true, value: null };

    const t = typeof value;
    if (t === "string" || t === "boolean") return { ok: true, value };

    if (t === "number") {
      if (!Number.isFinite(value as number)) {
        return { ok: false, message: "Evidence numbers must be finite." };
      }
      return { ok: true, value };
    }

    if (t === "undefined") {
      return { ok: false, message: "Evidence must not contain undefined." };
    }
    if (t === "function" || t === "symbol" || t === "bigint") {
      return { ok: false, message: "Evidence contains non-JSON value types." };
    }

    if (t !== "object") {
      return { ok: false, message: "Evidence contains unsupported value." };
    }

    if (value instanceof Date) {
      return { ok: false, message: "Evidence must not contain Date objects." };
    }
    if (value instanceof Map || value instanceof Set) {
      return { ok: false, message: "Evidence must not contain Map/Set." };
    }

    const obj = value as object;
    if (seen.has(obj)) {
      return { ok: false, message: "Evidence payload contains a cycle." };
    }

    if (Array.isArray(value)) {
      if (value.length > MAX_EVIDENCE_ARRAY_LENGTH) {
        return { ok: false, message: "Evidence array exceeds length bound." };
      }
      seen.add(obj);
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, i)) {
          return { ok: false, message: "Evidence arrays must be dense." };
        }
        const item = walk(value[i], depth + 1);
        if (!item.ok) return item;
        out.push(item.value);
      }
      seen.delete(obj);
      return { ok: true, value: out };
    }

    if (!isStrictPlainObject(value)) {
      return {
        ok: false,
        message: "Evidence objects must be plain Object prototypes only.",
      };
    }

    if (hasOwnAccessor(value)) {
      return {
        ok: false,
        message: "Evidence must not contain accessor/getter properties.",
      };
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return {
        ok: false,
        message: "Evidence must not contain symbol keys.",
      };
    }

    const keys = Object.getOwnPropertyNames(value);
    if (keys.length > MAX_EVIDENCE_OBJECT_KEYS) {
      return { ok: false, message: "Evidence object exceeds key bound." };
    }

    seen.add(obj);
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc || !("value" in desc) || desc.get || desc.set) {
        return {
          ok: false,
          message: "Evidence must use data properties only.",
        };
      }
      const child = walk(desc.value, depth + 1);
      if (!child.ok) return child;
      out[key] = child.value;
    }
    seen.delete(obj);
    return { ok: true, value: out };
  }

  return walk(raw, 0);
}

/**
 * Recursively find forbidden GSC metric keys (case-insensitive).
 * Operates on already-normalized JSON-safe plain structures.
 */
export function findForbiddenGscMetricKey(
  value: unknown,
  depth = 0
): string | null {
  if (value == null) return null;
  if (depth > MAX_EVIDENCE_DEPTH) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenGscMetricKey(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  if (!isStrictPlainObject(value) && !(value && typeof value === "object")) {
    return null;
  }

  // Normalized evidence uses null-prototype or plain objects.
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const norm = normalizeEvidenceKey(key);
    if (FORBIDDEN_GSC_KEYS.has(norm)) return key;
    const hit = findForbiddenGscMetricKey(obj[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Deterministic canonical JSON: sort plain-object keys recursively;
 * preserve array order; preserve primitives/null.
 */
export function canonicalizeEvidenceValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeEvidenceValue(item));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = canonicalizeEvidenceValue(obj[key]);
    }
    return out;
  }
  return value;
}

export function serializeCanonicalEvidenceJson(
  value: unknown,
  maxChars: number
): { ok: true; json: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, json: null };
  }
  let json: string;
  try {
    json = JSON.stringify(canonicalizeEvidenceValue(value));
  } catch {
    return { ok: false, message: "Evidence payload is not JSON-serializable." };
  }
  if (typeof json !== "string" || json.length > maxChars) {
    return {
      ok: false,
      message: `Evidence payload exceeds ${maxChars} characters.`,
    };
  }
  return { ok: true, json };
}

/**
 * Normalize + optional GSC guard + canonical serialize for evidence payloads.
 * Returns a plain object clone (or null). Does not mutate caller input.
 */
export function prepareEvidencePayload(
  raw: unknown,
  opts: { evidenceMode: SeoDecisionEvidenceMode; maxChars: number }
):
  | { ok: true; value: Record<string, unknown> | null; json: string | null }
  | { ok: false; code: string; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null, json: null };
  }

  const normalized = normalizeJsonSafeEvidence(raw);
  if (!normalized.ok) {
    return {
      ok: false,
      code: "invalid_evidence_payload",
      message: normalized.message,
    };
  }

  if (
    normalized.value === null ||
    typeof normalized.value !== "object" ||
    Array.isArray(normalized.value)
  ) {
    return {
      ok: false,
      code: "invalid_evidence_payload",
      message: "Evidence root must be a plain object or null.",
    };
  }

  const obj = normalized.value as Record<string, unknown>;

  if (opts.evidenceMode === "NO_GSC_DEGRADED_MODE") {
    const forbidden = findForbiddenGscMetricKey(obj);
    if (forbidden) {
      return {
        ok: false,
        code: "fabricated_gsc_metrics",
        message: `NO_GSC_DEGRADED_MODE must not include fabricated GSC metric key: ${forbidden}`,
      };
    }
  }

  const ser = serializeCanonicalEvidenceJson(obj, opts.maxChars);
  if (!ser.ok) {
    return {
      ok: false,
      code: "invalid_evidence_payload",
      message: ser.message,
    };
  }

  // Re-parse canonical JSON so stored object key order matches equality form.
  const canonicalObj =
    ser.json == null
      ? null
      : (JSON.parse(ser.json) as Record<string, unknown>);

  return { ok: true, value: canonicalObj, json: ser.json };
}

/** @deprecated name kept for tests — delegates to canonical serializer. */
export function serializeSeoEvidenceJson(
  value: unknown,
  maxChars: number
): { ok: true; json: string | null } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, json: null };
  }
  const prepared = prepareEvidencePayload(value, {
    evidenceMode: "GSC_AVAILABLE",
    maxChars,
  });
  if (!prepared.ok) {
    return { ok: false, message: prepared.message };
  }
  return { ok: true, json: prepared.json };
}

export function parseSeoEvidenceJson(
  raw: unknown
): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  if (isStrictPlainObject(raw)) {
    const prepared = prepareEvidencePayload(raw, {
      evidenceMode: "GSC_AVAILABLE",
      maxChars: MAX_OUTCOME_EVIDENCE_CHARS,
    });
    return prepared.ok ? prepared.value : null;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const prepared = prepareEvidencePayload(parsed, {
      evidenceMode: "GSC_AVAILABLE",
      maxChars: MAX_OUTCOME_EVIDENCE_CHARS,
    });
    return prepared.ok ? prepared.value : null;
  } catch {
    return null;
  }
}

export function serializeStringArrayJson(value: string[]): string {
  return JSON.stringify(value);
}

export function parseStringArrayJson(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function parseIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseReasonCodes(
  raw: unknown
): BlogOpportunityReasonCode[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_REASON_EVIDENCE_ITEMS) return null;
  const out: BlogOpportunityReasonCode[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !AB3_REASON_CODES.has(item)) return null;
    out.push(item as BlogOpportunityReasonCode);
  }
  return out;
}

function parseUncertaintyReasons(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_PRIORITY_UNCERTAINTY_REASONS) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const t = item.trim();
    if (!t || t.length > MAX_PRIORITY_UNCERTAINTY_REASON_CHARS) return null;
    out.push(t);
  }
  return out;
}

function isPlainObjectInput(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate and normalize a decision evidence input.
 * Does not mutate the caller-owned object.
 */
export function parseSeoDecisionEvidenceInput(
  raw: unknown
): SeoDecisionEvidenceParseResult<SeoDecisionEvidenceInput> {
  if (!isPlainObjectInput(raw)) {
    return fail("invalid_input", "Decision evidence input must be an object.");
  }

  if (typeof raw.opportunityId !== "string") {
    return fail("invalid_opportunity_id", "opportunityId must be a string.");
  }
  const opportunityId = raw.opportunityId.trim();
  if (!opportunityId || opportunityId.length > MAX_OPPORTUNITY_ID_CHARS) {
    return fail(
      "invalid_opportunity_id",
      "opportunityId must be non-empty and bounded."
    );
  }

  let topic: string | null = null;
  if (raw.topic !== undefined && raw.topic !== null) {
    if (typeof raw.topic !== "string") {
      return fail("invalid_topic", "topic must be a string or null.");
    }
    const t = raw.topic.trim();
    if (t.length > MAX_TOPIC_CHARS) {
      return fail("invalid_topic", "topic exceeds max length.");
    }
    topic = t || null;
  }

  let intent: string | null = null;
  if (raw.intent !== undefined && raw.intent !== null) {
    if (typeof raw.intent !== "string") {
      return fail("invalid_intent", "intent must be a string or null.");
    }
    const t = raw.intent.trim();
    if (t.length > MAX_INTENT_CHARS) {
      return fail("invalid_intent", "intent exceeds max length.");
    }
    intent = t || null;
  }

  if (
    typeof raw.decisionAction !== "string" ||
    !ACTIONS.has(raw.decisionAction)
  ) {
    return fail("invalid_action", "decisionAction is not a canonical AB-3 action.");
  }
  const decisionAction = raw.decisionAction as BlogNextBestAction;

  let targetEntityId: number | null = null;
  if (raw.targetEntityId !== undefined && raw.targetEntityId !== null) {
    if (
      typeof raw.targetEntityId !== "number" ||
      !Number.isFinite(raw.targetEntityId) ||
      !Number.isInteger(raw.targetEntityId) ||
      raw.targetEntityId <= 0
    ) {
      return fail(
        "invalid_target",
        "targetEntityId must be a positive integer or null."
      );
    }
    targetEntityId = raw.targetEntityId;
  }

  let targetUrl: string | null = null;
  if (raw.targetUrl !== undefined && raw.targetUrl !== null) {
    if (!isOnSiteFirestickUrl(raw.targetUrl)) {
      return fail(
        "invalid_target",
        "targetUrl must be a valid on-site Firestick HTTPS URL or null."
      );
    }
    targetUrl = String(raw.targetUrl).trim();
    if (targetUrl.length > MAX_URL_CHARS) {
      return fail("invalid_target", "targetUrl exceeds max length.");
    }
  }

  if (typeof raw.schedulerEligible !== "boolean") {
    return fail(
      "invalid_scheduler_eligible",
      "schedulerEligible must be an exact boolean."
    );
  }
  const expectedEligible = isAutonomousNewBlogEligible(decisionAction);
  if (raw.schedulerEligible !== expectedEligible) {
    return fail(
      "invalid_scheduler_eligible",
      `schedulerEligible must be ${expectedEligible} for action ${decisionAction}.`
    );
  }

  const decisionReasonCodes = parseReasonCodes(raw.decisionReasonCodes);
  if (!decisionReasonCodes) {
    return fail(
      "invalid_reason_codes",
      "decisionReasonCodes must be a bounded dense array of AB-3 reason codes."
    );
  }

  if (typeof raw.decisionExplanation !== "string") {
    return fail(
      "invalid_explanation",
      "decisionExplanation must be a string."
    );
  }
  const decisionExplanation = raw.decisionExplanation.trim();
  if (
    !decisionExplanation ||
    decisionExplanation.length > MAX_DECISION_EXPLANATION_CHARS
  ) {
    return fail(
      "invalid_explanation",
      "decisionExplanation must be non-empty and bounded."
    );
  }

  if (
    typeof raw.priorityTier !== "number" ||
    !PRIORITY_TIERS.has(raw.priorityTier)
  ) {
    return fail("invalid_priority_tier", "priorityTier must be 0|1|2|3|9.");
  }
  const priorityTier = raw.priorityTier as BlogPriorityTier;

  if (
    typeof raw.priorityClass !== "string" ||
    !PRIORITY_CLASSES.has(raw.priorityClass)
  ) {
    return fail(
      "invalid_priority_class",
      "priorityClass is not a known AB-5 class."
    );
  }
  const priorityClass = raw.priorityClass as BlogPriorityClass;

  if (
    typeof raw.uncertainty !== "string" ||
    !UNCERTAINTIES.has(raw.uncertainty)
  ) {
    return fail(
      "invalid_uncertainty",
      "uncertainty must be a known AB-5 uncertainty."
    );
  }
  const uncertainty = raw.uncertainty as BlogPriorityUncertainty;

  const uncertaintyReasons = parseUncertaintyReasons(raw.uncertaintyReasons);
  if (!uncertaintyReasons) {
    return fail(
      "invalid_uncertainty_reasons",
      "uncertaintyReasons must be a bounded dense string array."
    );
  }

  if (
    typeof raw.estimatedCost !== "string" ||
    !COSTS.has(raw.estimatedCost)
  ) {
    return fail(
      "invalid_estimated_cost",
      "estimatedCost must be a known AB-5 relative cost."
    );
  }
  const estimatedCost = raw.estimatedCost as BlogRelativeActionCost;

  if (
    typeof raw.evidenceMode !== "string" ||
    !EVIDENCE_MODES.has(raw.evidenceMode)
  ) {
    return fail(
      "invalid_evidence_mode",
      "evidenceMode must be GSC_AVAILABLE or NO_GSC_DEGRADED_MODE."
    );
  }
  const evidenceMode = raw.evidenceMode as SeoDecisionEvidenceMode;

  let baselineEvidence: Record<string, unknown> | null = null;
  if (raw.baselineEvidence !== undefined && raw.baselineEvidence !== null) {
    const prepared = prepareEvidencePayload(raw.baselineEvidence, {
      evidenceMode,
      maxChars: MAX_BASELINE_EVIDENCE_CHARS,
    });
    if (!prepared.ok) {
      return fail(prepared.code, prepared.message);
    }
    baselineEvidence = prepared.value;
  }

  let decidedAt: string | null = null;
  if (raw.decidedAt !== undefined && raw.decidedAt !== null) {
    const iso = parseIsoTimestamp(raw.decidedAt);
    if (!iso) {
      return fail("invalid_timestamp", "decidedAt must be a valid ISO timestamp.");
    }
    decidedAt = iso;
  }

  return {
    ok: true,
    value: {
      opportunityId,
      topic,
      intent,
      decisionAction,
      targetEntityId,
      targetUrl,
      schedulerEligible: raw.schedulerEligible,
      decisionReasonCodes: decisionReasonCodes.slice(),
      decisionExplanation,
      priorityTier,
      priorityClass,
      uncertainty,
      uncertaintyReasons: uncertaintyReasons.slice(),
      estimatedCost,
      evidenceMode,
      baselineEvidence,
      decidedAt,
    },
  };
}

/**
 * Validate and normalize an outcome input.
 * Does not mutate the caller-owned object.
 */
export function parseSeoDecisionOutcomeInput(
  raw: unknown
): SeoDecisionEvidenceParseResult<SeoDecisionOutcomeInput> {
  if (!isPlainObjectInput(raw)) {
    return fail("invalid_input", "Outcome input must be an object.");
  }

  if (
    typeof raw.decisionId !== "number" ||
    !Number.isFinite(raw.decisionId) ||
    !Number.isInteger(raw.decisionId) ||
    raw.decisionId <= 0
  ) {
    return fail(
      "invalid_decision_id",
      "decisionId must be a positive integer."
    );
  }

  if (
    typeof raw.windowDays !== "number" ||
    !OUTCOME_WINDOWS.has(raw.windowDays)
  ) {
    return fail(
      "invalid_window",
      "windowDays must be exactly 7, 14, or 28."
    );
  }
  const windowDays = raw.windowDays as SeoDecisionOutcomeWindow;

  if (
    typeof raw.evidenceMode !== "string" ||
    !EVIDENCE_MODES.has(raw.evidenceMode)
  ) {
    return fail(
      "invalid_evidence_mode",
      "evidenceMode must be GSC_AVAILABLE or NO_GSC_DEGRADED_MODE."
    );
  }
  const evidenceMode = raw.evidenceMode as SeoDecisionEvidenceMode;

  let outcomeEvidence: Record<string, unknown> | null = null;
  if (raw.outcomeEvidence !== undefined && raw.outcomeEvidence !== null) {
    const prepared = prepareEvidencePayload(raw.outcomeEvidence, {
      evidenceMode,
      maxChars: MAX_OUTCOME_EVIDENCE_CHARS,
    });
    if (!prepared.ok) {
      return fail(prepared.code, prepared.message);
    }
    outcomeEvidence = prepared.value;
  }

  const observedAt = parseIsoTimestamp(raw.observedAt);
  if (!observedAt) {
    return fail(
      "invalid_timestamp",
      "observedAt must be a valid ISO timestamp."
    );
  }

  return {
    ok: true,
    value: {
      decisionId: raw.decisionId,
      windowDays,
      evidenceMode,
      outcomeEvidence,
      observedAt,
    },
  };
}

/**
 * Convenience builder from AB-3 decision + AB-5 prioritized result.
 * Does not mutate caller-owned inputs.
 */
export function buildSeoDecisionEvidenceInput(args: {
  decision: BlogOpportunityDecision;
  prioritized: BlogPrioritizedOpportunity;
  evidenceMode: SeoDecisionEvidenceMode;
  topic?: string | null;
  intent?: string | null;
  baselineEvidence?: Record<string, unknown> | null;
  decidedAt?: string | null;
  uncertaintyReasons?: string[];
}): SeoDecisionEvidenceParseResult<SeoDecisionEvidenceInput> {
  if (!isPlainObjectInput(args)) {
    return fail("invalid_input", "Builder args must be an object.");
  }
  const decision = args.decision;
  const prioritized = args.prioritized;
  if (!isPlainObjectInput(decision) || !isPlainObjectInput(prioritized)) {
    return fail("invalid_input", "decision and prioritized are required.");
  }

  return parseSeoDecisionEvidenceInput({
    opportunityId: decision.opportunityId,
    topic: args.topic ?? null,
    intent: args.intent ?? null,
    decisionAction: decision.action,
    targetEntityId: decision.target?.entityId ?? null,
    targetUrl: decision.target?.url ?? null,
    schedulerEligible: decision.schedulerEligible,
    decisionReasonCodes: Array.isArray(decision.reasonCodes)
      ? decision.reasonCodes.slice()
      : decision.reasonCodes,
    decisionExplanation: decision.explanation,
    priorityTier: prioritized.priorityTier,
    priorityClass: prioritized.priorityClass,
    uncertainty: prioritized.uncertainty,
    uncertaintyReasons: args.uncertaintyReasons,
    estimatedCost: prioritized.estimatedCost,
    evidenceMode: args.evidenceMode,
    baselineEvidence: args.baselineEvidence ?? null,
    decidedAt: args.decidedAt ?? null,
  });
}

/**
 * Replay equality key: evidence_mode + canonical outcome evidence JSON.
 * observedAt is intentionally excluded.
 */
export function canonicalOutcomeEvidenceKey(
  evidenceMode: SeoDecisionEvidenceMode,
  outcomeEvidence: Record<string, unknown> | null
): string {
  const ser = serializeCanonicalEvidenceJson(
    outcomeEvidence,
    MAX_OUTCOME_EVIDENCE_CHARS
  );
  const payload = ser.ok ? ser.json : null;
  return `${evidenceMode}\n${payload ?? ""}`;
}

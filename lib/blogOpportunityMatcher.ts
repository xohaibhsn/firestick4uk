/**
 * AB-4 — Pure deterministic Blog Opportunity refresh-first / dedup matcher.
 *
 * Compares one proposed opportunity against bounded Blog inventory and returns
 * existing-content matching signals for AB-3. Does not select NBA, score,
 * research, persist, or schedule.
 *
 * Phase boundaries:
 * - AB-5: priority / uncertainty / cost
 * - AB-6+: links / research / generation / scheduler
 *
 * Similarity thresholds are an internal dedup safety heuristic only.
 * They do NOT prove Google cannibalization or ranking factors.
 */

import { blogPublicUrl } from "@/lib/seoOverview";

export const MAX_BLOG_MATCH_INVENTORY = 500;
export const MAX_MATCH_TOPIC_CHARS = 200;
export const MAX_MATCH_TITLE_CHARS = 300;
export const MAX_MATCH_SLUG_CHARS = 200;
export const MAX_MATCH_FOCUS_KEYWORD_CHARS = 120;
export const MAX_MATCH_INTENT_CHARS = 200;
export const MAX_MATCH_CATEGORY_CHARS = 120;
export const MAX_MATCH_TOKENS = 32;
export const MIN_MEANINGFUL_TOKENS = 3;
/** Internal dedup safety heuristic — NOT a Google ranking factor. */
export const STRONG_TOKEN_SIMILARITY_THRESHOLD = 0.8;
export const SIMILARITY_DECIMAL_PLACES = 4;

export type BlogMatchOpportunity = {
  topic: string;
  proposedSlug?: string | null;
  focusKeyword?: string | null;
  intent?: string | null;
};

export type BlogMatchInventoryRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  active: boolean | number;
  focus_keyword?: string | null;
  category?: string | null;
};

export type BlogMatchKind = "EXACT" | "STRONG" | "NONE";

export type BlogMatchDisposition =
  | "refresh"
  | "historical_recovery"
  | "none";

export type BlogMatchReasonCode =
  | "INVALID_INPUT"
  | "EXACT_SLUG_MATCH"
  | "EXACT_TITLE_MATCH"
  | "EXACT_FOCUS_KEYWORD_MATCH"
  | "STRONG_TOPIC_OVERLAP"
  | "POTENTIAL_CANNIBALIZATION"
  | "EXISTING_DRAFT_MATCH"
  | "EXISTING_PUBLISHED_MATCH"
  | "INACTIVE_EXISTING_MATCH"
  | "NO_EXISTING_MATCH";

export type BlogOpportunityMatchResult = {
  match: BlogMatchKind;
  matchedEntityId: number | null;
  matchedUrl: string | null;
  matchedStatus: string | null;
  disposition: BlogMatchDisposition;
  newBlogCandidate: boolean;
  reasonCodes: BlogMatchReasonCode[];
  signals: {
    slugExact: boolean;
    titleExact: boolean;
    focusKeywordExact: boolean;
    tokenSimilarity: number;
  };
};

/** AB-3 existing-content handoff (orchestrator builds full AB-3 input). */
export type BlogOpportunityExistingContentHandoff = {
  existingContent: {
    disposition: BlogMatchDisposition;
    entityId: number | null;
    url: string | null;
  };
  newBlogCandidate: boolean;
};

const ALLOWED_STATUS = new Set(["draft", "published"]);

/** Small explicit neutral stop-word set — matching aid only. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "your",
  "you",
  "how",
  "with",
  "is",
  "are",
  "be",
]);

type ParsedOpportunity = {
  topic: string;
  proposedSlug: string | null;
  focusKeyword: string | null;
  intent: string | null;
};

type ParsedInventoryRow = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  active: boolean;
  focus_keyword: string | null;
  category: string | null;
  normTitle: string;
  normSlug: string;
  normFocus: string;
};

type RankedCandidate = {
  row: ParsedInventoryRow;
  match: "EXACT" | "STRONG";
  /** 1=slug, 2=title, 3=focus, 4=similarity */
  tier: 1 | 2 | 3 | 4;
  similarity: number;
  slugExact: boolean;
  titleExact: boolean;
  focusKeywordExact: boolean;
  reasonCodes: BlogMatchReasonCode[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Write-path slug semantics (mirrors AB-1 normalizeAutonomousBlogSlug /
 * pages/api/blog.ts toBlogSlug).
 */
export function normalizeBlogMatchSlug(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Title/topic normalization for exact equality.
 * Mirrors AB-1 title lowercasing + whitespace collapse, plus punctuation
 * separators normalized to spaces so "Firestick — Setup" ≈ "Firestick Setup".
 */
export function normalizeBlogMatchTitle(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_–—:/|.,;!?()[\]{}"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBlogMatchFocusKeyword(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function roundSimilarity(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  const f = 10 ** SIMILARITY_DECIMAL_PLACES;
  return Math.round(n * f) / f;
}

/**
 * Deterministic tokenization: lowercase, strip punctuation, split, drop stop
 * words, dedupe, bound count. No stemming / NLP.
 */
export function tokenizeBlogTopic(value: unknown): string[] {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(" ")) {
    if (!part || STOP_WORDS.has(part)) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
    if (out.length >= MAX_MATCH_TOKENS) break;
  }
  return out;
}

/**
 * Deterministic Jaccard token similarity in [0,1].
 * Returns 0 when either side has fewer than MIN_MEANINGFUL_TOKENS.
 * Rounded to SIMILARITY_DECIMAL_PLACES for stable equality.
 */
export function computeBlogTopicSimilarity(a: unknown, b: unknown): number {
  const ta = tokenizeBlogTopic(a);
  const tb = tokenizeBlogTopic(b);
  if (ta.length < MIN_MEANINGFUL_TOKENS || tb.length < MIN_MEANINGFUL_TOKENS) {
    return 0;
  }
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  if (union <= 0) return 0;
  return roundSimilarity(inter / union);
}

function parseOptionalBoundedString(
  value: unknown,
  max: number
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed || null };
}

function parseOpportunity(
  raw: unknown
): { ok: true; value: ParsedOpportunity } | { ok: false } {
  if (!isPlainObject(raw)) return { ok: false };
  if (typeof raw.topic !== "string") return { ok: false };
  const topic = raw.topic.trim();
  if (!topic || topic.length > MAX_MATCH_TOPIC_CHARS) return { ok: false };

  const slugP = parseOptionalBoundedString(raw.proposedSlug, MAX_MATCH_SLUG_CHARS);
  if (!slugP.ok) return { ok: false };
  const focusP = parseOptionalBoundedString(
    raw.focusKeyword,
    MAX_MATCH_FOCUS_KEYWORD_CHARS
  );
  if (!focusP.ok) return { ok: false };
  const intentP = parseOptionalBoundedString(raw.intent, MAX_MATCH_INTENT_CHARS);
  if (!intentP.ok) return { ok: false };

  return {
    ok: true,
    value: {
      topic,
      proposedSlug: slugP.value,
      focusKeyword: focusP.value,
      intent: intentP.value,
    },
  };
}

function parseActive(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

function parseInventoryRow(
  raw: unknown
): { ok: true; value: ParsedInventoryRow } | { ok: false } {
  if (!isPlainObject(raw)) return { ok: false };
  if (
    typeof raw.id !== "number" ||
    !Number.isFinite(raw.id) ||
    !Number.isInteger(raw.id) ||
    raw.id <= 0
  ) {
    return { ok: false };
  }
  if (typeof raw.title !== "string") return { ok: false };
  const title = raw.title.trim();
  if (!title || title.length > MAX_MATCH_TITLE_CHARS) return { ok: false };

  if (typeof raw.slug !== "string") return { ok: false };
  if (raw.slug.trim().length > MAX_MATCH_SLUG_CHARS) return { ok: false };
  const slug = raw.slug.trim();

  if (typeof raw.status !== "string") return { ok: false };
  const status = raw.status.trim().toLowerCase();
  if (!ALLOWED_STATUS.has(status)) return { ok: false };

  const active = parseActive(raw.active);
  if (active === null) return { ok: false };

  const focusP = parseOptionalBoundedString(
    raw.focus_keyword,
    MAX_MATCH_FOCUS_KEYWORD_CHARS
  );
  if (!focusP.ok) return { ok: false };
  const catP = parseOptionalBoundedString(raw.category, MAX_MATCH_CATEGORY_CHARS);
  if (!catP.ok) return { ok: false };

  return {
    ok: true,
    value: {
      id: raw.id,
      title,
      slug,
      status: status as "draft" | "published",
      active,
      focus_keyword: focusP.value,
      category: catP.value,
      normTitle: normalizeBlogMatchTitle(title),
      normSlug: normalizeBlogMatchSlug(slug),
      normFocus: normalizeBlogMatchFocusKeyword(focusP.value || ""),
    },
  };
}

function parseInventory(
  raw: unknown
): { ok: true; value: ParsedInventoryRow[] } | { ok: false } {
  if (!Array.isArray(raw)) return { ok: false };
  if (raw.length > MAX_BLOG_MATCH_INVENTORY) return { ok: false };
  const rows: ParsedInventoryRow[] = [];
  for (const item of raw) {
    const parsed = parseInventoryRow(item);
    if (!parsed.ok) return { ok: false };
    rows.push(parsed.value);
  }
  return { ok: true, value: rows };
}

function statusActivityRank(row: ParsedInventoryRow): number {
  // Prefer published+active, then draft+active, then inactive.
  if (row.active && row.status === "published") return 0;
  if (row.active && row.status === "draft") return 1;
  return 2;
}

/**
 * Deterministic candidate ordering:
 * lower tier wins (slug > title > focus > similarity),
 * then status/activity preference,
 * then higher similarity,
 * then lowest id.
 */
function isBetterCandidate(a: RankedCandidate, b: RankedCandidate): boolean {
  if (a.tier !== b.tier) return a.tier < b.tier;
  const sa = statusActivityRank(a.row);
  const sb = statusActivityRank(b.row);
  if (sa !== sb) return sa < sb;
  if (a.similarity !== b.similarity) return a.similarity > b.similarity;
  return a.row.id < b.row.id;
}

function matchedPublicUrl(row: ParsedInventoryRow): string | null {
  if (!row.normSlug) return null;
  return blogPublicUrl(row.slug);
}

function dispositionFor(row: ParsedInventoryRow): BlogMatchDisposition {
  return row.active ? "refresh" : "historical_recovery";
}

function statusReason(row: ParsedInventoryRow): BlogMatchReasonCode {
  if (!row.active) return "INACTIVE_EXISTING_MATCH";
  if (row.status === "draft") return "EXISTING_DRAFT_MATCH";
  return "EXISTING_PUBLISHED_MATCH";
}

function emptySignals(): BlogOpportunityMatchResult["signals"] {
  return {
    slugExact: false,
    titleExact: false,
    focusKeywordExact: false,
    tokenSimilarity: 0,
  };
}

function invalidResult(): BlogOpportunityMatchResult {
  return {
    match: "NONE",
    matchedEntityId: null,
    matchedUrl: null,
    matchedStatus: null,
    disposition: "none",
    newBlogCandidate: false,
    reasonCodes: ["INVALID_INPUT"],
    signals: emptySignals(),
  };
}

function noneResult(): BlogOpportunityMatchResult {
  return {
    match: "NONE",
    matchedEntityId: null,
    matchedUrl: null,
    matchedStatus: null,
    disposition: "none",
    newBlogCandidate: true,
    reasonCodes: ["NO_EXISTING_MATCH"],
    signals: emptySignals(),
  };
}

function fromCandidate(best: RankedCandidate): BlogOpportunityMatchResult {
  const codes = best.reasonCodes.slice();
  const statusCode = statusReason(best.row);
  if (!codes.includes(statusCode)) codes.push(statusCode);
  return {
    match: best.match,
    matchedEntityId: best.row.id,
    matchedUrl: matchedPublicUrl(best.row),
    matchedStatus: best.row.status,
    disposition: dispositionFor(best.row),
    newBlogCandidate: false,
    reasonCodes: codes,
    signals: {
      slugExact: best.slugExact,
      titleExact: best.titleExact,
      focusKeywordExact: best.focusKeywordExact,
      tokenSimilarity: best.similarity,
    },
  };
}

/**
 * Match one opportunity against inventory. Exactly one best existing row when
 * matched. Fail-closed: malformed opportunity/inventory never yields NEW_BLOG.
 */
export function matchBlogOpportunity(
  opportunity: unknown,
  inventory: unknown
): BlogOpportunityMatchResult {
  const opp = parseOpportunity(opportunity);
  if (!opp.ok) return invalidResult();
  const inv = parseInventory(inventory);
  if (!inv.ok) return invalidResult();

  const topicNorm = normalizeBlogMatchTitle(opp.value.topic);
  const slugNorm = opp.value.proposedSlug
    ? normalizeBlogMatchSlug(opp.value.proposedSlug)
    : "";
  const focusNorm = opp.value.focusKeyword
    ? normalizeBlogMatchFocusKeyword(opp.value.focusKeyword)
    : "";

  let best: RankedCandidate | null = null;

  for (const row of inv.value) {
    const slugExact = !!(slugNorm && row.normSlug && slugNorm === row.normSlug);
    const titleExact = !!(topicNorm && row.normTitle && topicNorm === row.normTitle);
    const focusKeywordExact = !!(
      focusNorm &&
      row.normFocus &&
      focusNorm === row.normFocus
    );
    const similarity = computeBlogTopicSimilarity(opp.value.topic, row.title);

    let candidate: RankedCandidate | null = null;

    if (slugExact) {
      candidate = {
        row,
        match: "EXACT",
        tier: 1,
        similarity,
        slugExact: true,
        titleExact,
        focusKeywordExact,
        reasonCodes: ["EXACT_SLUG_MATCH"],
      };
    } else if (titleExact) {
      candidate = {
        row,
        match: "EXACT",
        tier: 2,
        similarity,
        slugExact: false,
        titleExact: true,
        focusKeywordExact,
        reasonCodes: ["EXACT_TITLE_MATCH"],
      };
    } else if (focusKeywordExact) {
      candidate = {
        row,
        match: "STRONG",
        tier: 3,
        similarity,
        slugExact: false,
        titleExact: false,
        focusKeywordExact: true,
        reasonCodes: [
          "EXACT_FOCUS_KEYWORD_MATCH",
          "POTENTIAL_CANNIBALIZATION",
        ],
      };
    } else if (similarity >= STRONG_TOKEN_SIMILARITY_THRESHOLD) {
      candidate = {
        row,
        match: "STRONG",
        tier: 4,
        similarity,
        slugExact: false,
        titleExact: false,
        focusKeywordExact: false,
        reasonCodes: ["STRONG_TOPIC_OVERLAP", "POTENTIAL_CANNIBALIZATION"],
      };
    }

    if (!candidate) continue;
    if (!best || isBetterCandidate(candidate, best)) {
      best = candidate;
    }
  }

  if (!best) return noneResult();
  return fromCandidate(best);
}

/**
 * Convert AB-4 match result into AB-3 existing-content fields.
 * Does not call evaluateBlogOpportunity.
 */
export function toBlogOpportunityExistingContent(
  match: BlogOpportunityMatchResult | unknown
): BlogOpportunityExistingContentHandoff {
  if (!isPlainObject(match)) {
    return {
      existingContent: {
        disposition: "none",
        entityId: null,
        url: null,
      },
      newBlogCandidate: false,
    };
  }

  const disposition =
    match.disposition === "refresh" ||
    match.disposition === "historical_recovery" ||
    match.disposition === "none"
      ? match.disposition
      : "none";

  const entityId =
    typeof match.matchedEntityId === "number" &&
    Number.isInteger(match.matchedEntityId) &&
    match.matchedEntityId > 0
      ? match.matchedEntityId
      : null;

  const url =
    typeof match.matchedUrl === "string" && match.matchedUrl.trim()
      ? match.matchedUrl.trim()
      : null;

  const newBlogCandidate =
    disposition === "none" && match.newBlogCandidate === true;

  if (disposition === "none") {
    return {
      existingContent: {
        disposition: "none",
        entityId: null,
        url: null,
      },
      newBlogCandidate,
    };
  }

  return {
    existingContent: {
      disposition,
      entityId,
      url,
    },
    newBlogCandidate: false,
  };
}

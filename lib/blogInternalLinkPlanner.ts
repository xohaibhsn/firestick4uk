/**
 * AB-6 — Pure deterministic Blog internal-link / content-cluster planner.
 *
 * This module identifies related Blog inventory and recommends only safe,
 * already-published link targets. It does not edit HTML, persist, publish,
 * research, call providers, or schedule work.
 *
 * Relationship tiers and the fixed five-link cap are internal planning policy,
 * not Google ranking factors.
 */

import {
  MAX_MATCH_CATEGORY_CHARS,
  MAX_MATCH_FOCUS_KEYWORD_CHARS,
  MAX_MATCH_SLUG_CHARS,
  MAX_MATCH_TITLE_CHARS,
  STRONG_TOKEN_SIMILARITY_THRESHOLD,
  computeBlogTopicSimilarity,
  normalizeBlogMatchFocusKeyword,
  normalizeBlogMatchSlug,
} from "@/lib/blogOpportunityMatcher";
import { blogPublicUrl } from "@/lib/seoOverview";

export const MAX_BLOG_INTERNAL_LINK_INVENTORY = 500;
export const MAX_BLOG_EXISTING_INTERNAL_HREFS = 100;
/** Planner output policy only — NOT a Google ranking claim. */
export const MAX_BLOG_INTERNAL_LINK_SUGGESTIONS = 5;
export const MAX_BLOG_INTERNAL_HREF_CHARS = 500;

export type BlogInternalLinkSource = {
  id?: number | null;
  title: string;
  slug: string;
  category?: string | null;
  focusKeyword?: string | null;
  existingInternalHrefs?: string[];
};

export type BlogClusterInventoryRow = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  active: boolean | number;
  category?: string | null;
  focus_keyword?: string | null;
};

export type BlogClusterRelationship =
  | "EXACT_FOCUS_KEYWORD"
  | "STRONG_TOPIC_OVERLAP"
  | "SAME_CATEGORY";

export type BlogClusterRelationshipTier = 0 | 1 | 2;

export type BlogInternalLinkReasonCode =
  | "EXACT_FOCUS_KEYWORD"
  | "STRONG_TOPIC_OVERLAP"
  | "SAME_CATEGORY"
  | "PUBLISHED_ACTIVE_LINKABLE"
  | "DRAFT_NOT_LINKABLE"
  | "INACTIVE_NOT_LINKABLE"
  | "SELF_EXCLUDED"
  | "ALREADY_LINKED"
  | "INVALID_INPUT"
  | "NO_RELATED_CONTENT"
  | "NO_LINK_SUGGESTIONS";

export type BlogClusterMember = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  active: boolean;
  relationship: BlogClusterRelationship;
  relationshipTier: BlogClusterRelationshipTier;
  topicSimilarity: number;
  linkEligible: boolean;
  reasonCodes: BlogInternalLinkReasonCode[];
};

export type BlogInternalLinkSuggestion = {
  targetId: number;
  targetTitle: string;
  targetSlug: string;
  href: string;
  canonicalUrl: string;
  anchorText: string;
  relationship: BlogClusterRelationship;
  relationshipTier: BlogClusterRelationshipTier;
  topicSimilarity: number;
  reasonCodes: BlogInternalLinkReasonCode[];
};

export type BlogInternalLinkPlanResult =
  | {
      ok: true;
      source: {
        id: number | null;
        slug: string;
      };
      clusterMembers: BlogClusterMember[];
      linkSuggestions: BlogInternalLinkSuggestion[];
      reasonCodes: BlogInternalLinkReasonCode[];
    }
  | {
      ok: false;
      clusterMembers: [];
      linkSuggestions: [];
      reasonCodes: ["INVALID_INPUT"];
    };

type ParsedSource = {
  id: number | null;
  title: string;
  slug: string;
  category: string;
  focusKeyword: string;
  existingSlugs: Set<string>;
};

type ParsedInventoryRow = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  active: boolean;
  category: string;
  focusKeyword: string;
};

type Relationship = {
  relationship: BlogClusterRelationship;
  tier: BlogClusterRelationshipTier;
  topicSimilarity: number;
};

type DataSnapshot = { ok: true; value: Record<string, unknown> } | { ok: false };
type ArraySnapshot = { ok: true; value: unknown[] } | { ok: false };

const SOURCE_KEYS = new Set([
  "id",
  "title",
  "slug",
  "category",
  "focusKeyword",
  "existingInternalHrefs",
]);
const REQUIRED_SOURCE_KEYS = new Set(["title", "slug"]);
const INVENTORY_KEYS = new Set([
  "id",
  "title",
  "slug",
  "status",
  "active",
  "category",
  "focus_keyword",
]);
const REQUIRED_INVENTORY_KEYS = new Set([
  "id",
  "title",
  "slug",
  "status",
  "active",
]);

/** Snapshot exact own enumerable data properties without invoking accessors. */
function snapshotDataObject(
  raw: unknown,
  allowedKeys: Set<string>,
  requiredKeys: Set<string>
): DataSnapshot {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false };
    }
    const prototype = Object.getPrototypeOf(raw);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false };
    }

    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(raw)) {
      if (typeof key !== "string" || !allowedKeys.has(key)) {
        return { ok: false };
      }
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return { ok: false };
      }
      snapshot[key] = descriptor.value;
    }
    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        return { ok: false };
      }
    }
    return { ok: true, value: snapshot };
  } catch {
    return { ok: false };
  }
}

/** Snapshot a bounded dense array without calling caller-owned methods. */
function snapshotDenseArray(raw: unknown, maxItems: number): ArraySnapshot {
  try {
    if (!Array.isArray(raw)) return { ok: false };
    const lengthDescriptor = Object.getOwnPropertyDescriptor(raw, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) {
      return { ok: false };
    }
    const length = lengthDescriptor.value;
    if (
      typeof length !== "number" ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > maxItems
    ) {
      return { ok: false };
    }

    const ownKeys = Reflect.ownKeys(raw);
    if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) {
      return { ok: false };
    }

    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return { ok: false };
      }
      values.push(descriptor.value);
    }
    return { ok: true, value: values };
  } catch {
    return { ok: false };
  }
}

function parsePositiveId(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return null;
  }
  return value;
}

function parseCanonicalSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (
    !value ||
    value.length > MAX_MATCH_SLUG_CHARS ||
    value !== value.trim() ||
    value !== normalizeBlogMatchSlug(value) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    return null;
  }
  return value;
}

function parseDisplayTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > MAX_MATCH_TITLE_CHARS) return null;
  return normalized;
}

function parseOptionalString(
  value: unknown,
  maxChars: number
): { ok: true; value: string } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > maxChars) return { ok: false };
  return { ok: true, value: trimmed };
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseActive(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

/** Normalize only the two explicitly supported existing Blog href forms. */
export function normalizeExistingBlogInternalHref(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_BLOG_INTERNAL_HREF_CHARS ||
    value !== value.trim()
  ) {
    return null;
  }

  const relative = value.match(/^\/blog\/([^/?#]+)\/?$/);
  const absolute = value.match(
    /^https:\/\/firestick4uk\.com\/blog\/([^/?#]+)\/?$/
  );
  const rawSlug = relative?.[1] ?? absolute?.[1];
  const slug = parseCanonicalSlug(rawSlug);
  return slug ? `/blog/${slug}` : null;
}

function parseExistingHrefs(
  raw: unknown
): { ok: true; value: Set<string> } | { ok: false } {
  if (raw === undefined) return { ok: true, value: new Set<string>() };
  const snapshot = snapshotDenseArray(raw, MAX_BLOG_EXISTING_INTERNAL_HREFS);
  if (!snapshot.ok) return { ok: false };
  const slugs = new Set<string>();
  for (const href of snapshot.value) {
    const normalized = normalizeExistingBlogInternalHref(href);
    if (!normalized) return { ok: false };
    slugs.add(normalized.slice("/blog/".length));
  }
  return { ok: true, value: slugs };
}

function parseSource(raw: unknown): { ok: true; value: ParsedSource } | { ok: false } {
  const snapshot = snapshotDataObject(raw, SOURCE_KEYS, REQUIRED_SOURCE_KEYS);
  if (!snapshot.ok) return { ok: false };
  const value = snapshot.value;

  let id: number | null = null;
  if (value.id !== undefined && value.id !== null) {
    id = parsePositiveId(value.id);
    if (id === null) return { ok: false };
  }
  const title = parseDisplayTitle(value.title);
  const slug = parseCanonicalSlug(value.slug);
  if (!title || !slug) return { ok: false };

  const category = parseOptionalString(value.category, MAX_MATCH_CATEGORY_CHARS);
  const focus = parseOptionalString(
    value.focusKeyword,
    MAX_MATCH_FOCUS_KEYWORD_CHARS
  );
  const hrefs = parseExistingHrefs(value.existingInternalHrefs);
  if (!category.ok || !focus.ok || !hrefs.ok) return { ok: false };

  return {
    ok: true,
    value: {
      id,
      title,
      slug,
      category: normalizeCategory(category.value),
      focusKeyword: normalizeBlogMatchFocusKeyword(focus.value),
      existingSlugs: hrefs.value,
    },
  };
}

function parseInventoryRow(
  raw: unknown
): { ok: true; value: ParsedInventoryRow } | { ok: false } {
  const snapshot = snapshotDataObject(
    raw,
    INVENTORY_KEYS,
    REQUIRED_INVENTORY_KEYS
  );
  if (!snapshot.ok) return { ok: false };
  const value = snapshot.value;

  const id = parsePositiveId(value.id);
  const title = parseDisplayTitle(value.title);
  const slug = parseCanonicalSlug(value.slug);
  if (!id || !title || !slug) return { ok: false };
  if (value.status !== "draft" && value.status !== "published") {
    return { ok: false };
  }
  const active = parseActive(value.active);
  if (active === null) return { ok: false };

  const category = parseOptionalString(value.category, MAX_MATCH_CATEGORY_CHARS);
  const focus = parseOptionalString(
    value.focus_keyword,
    MAX_MATCH_FOCUS_KEYWORD_CHARS
  );
  if (!category.ok || !focus.ok) return { ok: false };

  return {
    ok: true,
    value: {
      id,
      title,
      slug,
      status: value.status,
      active,
      category: normalizeCategory(category.value),
      focusKeyword: normalizeBlogMatchFocusKeyword(focus.value),
    },
  };
}

function parseInventory(
  raw: unknown
): { ok: true; value: ParsedInventoryRow[] } | { ok: false } {
  const snapshot = snapshotDenseArray(raw, MAX_BLOG_INTERNAL_LINK_INVENTORY);
  if (!snapshot.ok) return { ok: false };

  const rows: ParsedInventoryRow[] = [];
  const ids = new Set<number>();
  const slugs = new Set<string>();
  for (const rawRow of snapshot.value) {
    const parsed = parseInventoryRow(rawRow);
    if (!parsed.ok) return { ok: false };
    if (ids.has(parsed.value.id) || slugs.has(parsed.value.slug)) {
      return { ok: false };
    }
    ids.add(parsed.value.id);
    slugs.add(parsed.value.slug);
    rows.push(parsed.value);
  }
  return { ok: true, value: rows };
}

function relationshipFor(
  source: ParsedSource,
  target: ParsedInventoryRow
): Relationship | null {
  const topicSimilarity = computeBlogTopicSimilarity(source.title, target.title);
  if (
    source.focusKeyword &&
    target.focusKeyword &&
    source.focusKeyword === target.focusKeyword
  ) {
    return {
      relationship: "EXACT_FOCUS_KEYWORD",
      tier: 0,
      topicSimilarity,
    };
  }
  if (topicSimilarity >= STRONG_TOKEN_SIMILARITY_THRESHOLD) {
    return {
      relationship: "STRONG_TOPIC_OVERLAP",
      tier: 1,
      topicSimilarity,
    };
  }
  if (source.category && target.category && source.category === target.category) {
    return { relationship: "SAME_CATEGORY", tier: 2, topicSimilarity };
  }
  return null;
}

function lifecycleRank(member: BlogClusterMember): number {
  if (member.active && member.status === "published") return 0;
  if (member.active && member.status === "draft") return 1;
  return 2;
}

function compareClusterMembers(a: BlogClusterMember, b: BlogClusterMember): number {
  if (a.relationshipTier !== b.relationshipTier) {
    return a.relationshipTier - b.relationshipTier;
  }
  if (a.topicSimilarity !== b.topicSimilarity) {
    return b.topicSimilarity - a.topicSimilarity;
  }
  const lifecycleDifference = lifecycleRank(a) - lifecycleRank(b);
  if (lifecycleDifference !== 0) return lifecycleDifference;
  return a.id - b.id;
}

function compareSuggestions(
  a: BlogInternalLinkSuggestion,
  b: BlogInternalLinkSuggestion
): number {
  if (a.relationshipTier !== b.relationshipTier) {
    return a.relationshipTier - b.relationshipTier;
  }
  if (a.topicSimilarity !== b.topicSimilarity) {
    return b.topicSimilarity - a.topicSimilarity;
  }
  return a.targetId - b.targetId;
}

function invalidResult(): BlogInternalLinkPlanResult {
  return {
    ok: false,
    clusterMembers: [],
    linkSuggestions: [],
    reasonCodes: ["INVALID_INPUT"],
  };
}

/**
 * Build a complete bounded plan. Ordinary validation failures return a safe
 * INVALID_INPUT result and never fabricate a link.
 */
export function planBlogInternalLinks(
  sourceInput: BlogInternalLinkSource | unknown,
  inventoryInput: BlogClusterInventoryRow[] | unknown
): BlogInternalLinkPlanResult {
  const source = parseSource(sourceInput);
  const inventory = parseInventory(inventoryInput);
  if (!source.ok || !inventory.ok) return invalidResult();

  const clusterMembers: BlogClusterMember[] = [];
  let selfExcluded = false;

  for (const row of inventory.value) {
    if (
      (source.value.id !== null && source.value.id === row.id) ||
      source.value.slug === row.slug
    ) {
      selfExcluded = true;
      continue;
    }

    const relationship = relationshipFor(source.value, row);
    if (!relationship) continue;

    const alreadyLinked = source.value.existingSlugs.has(row.slug);
    const relationshipLinkable = relationship.tier === 0 || relationship.tier === 1;
    const linkEligible =
      row.status === "published" &&
      row.active &&
      relationshipLinkable &&
      !alreadyLinked;

    const reasonCodes: BlogInternalLinkReasonCode[] = [
      relationship.relationship,
    ];
    if (!row.active) {
      reasonCodes.push("INACTIVE_NOT_LINKABLE");
    } else if (row.status === "draft") {
      reasonCodes.push("DRAFT_NOT_LINKABLE");
    } else if (alreadyLinked) {
      reasonCodes.push("ALREADY_LINKED");
    } else if (relationshipLinkable) {
      reasonCodes.push("PUBLISHED_ACTIVE_LINKABLE");
    }

    clusterMembers.push({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      active: row.active,
      relationship: relationship.relationship,
      relationshipTier: relationship.tier,
      topicSimilarity: relationship.topicSimilarity,
      linkEligible,
      reasonCodes,
    });
  }

  clusterMembers.sort(compareClusterMembers);

  const linkSuggestions = clusterMembers
    .filter((member) => member.linkEligible)
    .map<BlogInternalLinkSuggestion>((member) => ({
      targetId: member.id,
      targetTitle: member.title,
      targetSlug: member.slug,
      href: `/blog/${member.slug}`,
      canonicalUrl: blogPublicUrl(member.slug),
      anchorText: member.title,
      relationship: member.relationship,
      relationshipTier: member.relationshipTier,
      topicSimilarity: member.topicSimilarity,
      reasonCodes: [member.relationship, "PUBLISHED_ACTIVE_LINKABLE"],
    }))
    .sort(compareSuggestions)
    .slice(0, MAX_BLOG_INTERNAL_LINK_SUGGESTIONS);

  const reasonCodes: BlogInternalLinkReasonCode[] = [];
  if (selfExcluded) reasonCodes.push("SELF_EXCLUDED");
  if (clusterMembers.length === 0) reasonCodes.push("NO_RELATED_CONTENT");
  if (linkSuggestions.length === 0) reasonCodes.push("NO_LINK_SUGGESTIONS");

  return {
    ok: true,
    source: { id: source.value.id, slug: source.value.slug },
    clusterMembers,
    linkSuggestions,
    reasonCodes,
  };
}

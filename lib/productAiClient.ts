/**
 * Client-safe helpers for PAI-3 New Product AI drafting UI,
 * PAI-4 Existing Product AI review Apply, and PAI-5 image briefs.
 * No DB. No CMS writes. No provider calls. No image generation.
 */

import { escapeHtml } from "@/lib/contentHtml";
import {
  IMAGE_BRIEF_SLOTS,
  PRODUCT_AI_EXISTING_EDITABLE_FIELDS,
  PRODUCT_AI_FIELD_MAX,
  PRODUCT_AI_NEW_EDITABLE_FIELDS,
  PRODUCT_AI_REVIEW_FIELDS,
  normalizeProductAiSlug,
  type ImageBriefSlot,
  type ImageBriefSlotId,
  type ProductAiEditableField,
  type ProductAiExistingEditableField,
  type ProductAiNewEditableField,
  type ProductAiReviewField,
  type ProductAiReviewItem,
  type ProductKindHint,
} from "@/lib/seoAi";

export type ProductAiProviderChoice = "gemini" | "openai";

export const NEW_PRODUCT_AI_GENERATE_ALL_FIELDS: readonly ProductAiNewEditableField[] =
  PRODUCT_AI_NEW_EDITABLE_FIELDS;

/** Fields Apply may mutate in the NEW product flow only. */
export const NEW_PRODUCT_AI_APPLY_FIELDS = [
  "name",
  "slug",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
] as const;

export type NewProductAiApplyField = (typeof NEW_PRODUCT_AI_APPLY_FIELDS)[number];

/**
 * Strict existing-product Apply allowlist (Class-A only).
 * Never includes name, slug, or C-class fields.
 */
export const EXISTING_PRODUCT_AI_APPLY_FIELDS = [
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
] as const;

export type ExistingProductAiApplyField =
  (typeof EXISTING_PRODUCT_AI_APPLY_FIELDS)[number];

export const PRODUCT_AI_C_CLASS_APPLY_BLOCKED = [
  "price",
  "category",
  "stock",
  "active",
  "image",
  "og_image",
  "badge",
  "id",
] as const;

export type ProductAiFactsState = {
  productKind: ProductKindHint;
  productKindOverridden: boolean;
  duration: string;
  variant: string;
  confirmedCompatibility: string;
  confirmedFeatures: string;
  approvedClaims: string;
  factsOpen: boolean;
};

export type ProductAiSuggestionEntry = {
  value: string;
  reason?: string;
  selected: boolean;
};

export type ProductAiUnavailableEntry = {
  unavailable: true;
  reason: string;
};

export type ProductAiSuggestionMap = Partial<
  Record<ProductAiEditableField, ProductAiSuggestionEntry>
>;

export type ProductAiUnavailableMap = Partial<
  Record<ProductAiEditableField, ProductAiUnavailableEntry>
>;

export type ProductAiUiState = {
  status: "idle" | "loading" | "ok" | "error";
  provider: ProductAiProviderChoice;
  error: string;
  suggestions: ProductAiSuggestionMap;
  unavailable: ProductAiUnavailableMap;
  lastRequestedFields: ProductAiEditableField[];
};

export function defaultProductKindFromCategory(
  category: string
): ProductKindHint {
  const c = String(category || "").trim();
  if (c === "Subscription") return "digital_subscription";
  if (c === "Device") return "physical";
  return "unknown";
}

export function createDefaultProductAiFacts(
  category = "Subscription"
): ProductAiFactsState {
  return {
    productKind: defaultProductKindFromCategory(category),
    productKindOverridden: false,
    duration: "",
    variant: "",
    confirmedCompatibility: "",
    confirmedFeatures: "",
    approvedClaims: "",
    factsOpen: false,
  };
}

export function createIdleProductAiUi(
  provider: ProductAiProviderChoice = "gemini"
): ProductAiUiState {
  return {
    status: "idle",
    provider,
    error: "",
    suggestions: {},
    unavailable: {},
    lastRequestedFields: [],
  };
}

/**
 * TipTap HTML → bounded plain text for AI request context.
 * Does not mutate editor state.
 */
export function tipTapHtmlToPlainContext(
  html: unknown,
  max = 4000
): string {
  const raw = String(html ?? "");
  const plain = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max);
}

/**
 * Escape provider plain text, then wrap paragraphs into minimal TipTap-safe HTML.
 * Never treats provider output as trusted HTML.
 */
export function plainTextToSafeTipTapHtml(text: unknown): string {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return "";
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs
    .map((p) => {
      const escaped = escapeHtml(p).replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("");
}

export function isNewProductAiApplyField(
  field: string
): field is NewProductAiApplyField {
  return (NEW_PRODUCT_AI_APPLY_FIELDS as readonly string[]).includes(field);
}

export function isExistingProductAiApplyField(
  field: string
): field is ExistingProductAiApplyField {
  return (EXISTING_PRODUCT_AI_APPLY_FIELDS as readonly string[]).includes(field);
}

export function isBlockedCClassApplyField(field: string): boolean {
  return (PRODUCT_AI_C_CLASS_APPLY_BLOCKED as readonly string[]).includes(field);
}

/**
 * Apply one AI suggestion into a shallow copy of editor state.
 * NEW-product flow only — name/slug allowed here; existing products must not reuse this
 * without a stricter allowlist.
 */
export function applyNewProductAiFieldLocally<
  T extends Record<string, unknown>,
>(
  editProduct: T,
  field: string,
  value: string
): T {
  if (!isNewProductAiApplyField(field)) {
    return editProduct;
  }
  if (isBlockedCClassApplyField(field)) {
    return editProduct;
  }

  let nextValue = String(value ?? "");
  if (field === "slug") {
    const normalized = normalizeProductAiSlug(nextValue);
    if (!normalized) return editProduct;
    nextValue = normalized;
  } else if (field === "short_description" || field === "full_description") {
    nextValue = plainTextToSafeTipTapHtml(nextValue);
  } else {
    nextValue = nextValue.trim();
    const max = PRODUCT_AI_FIELD_MAX[field];
    if (max && nextValue.length > max) {
      nextValue = nextValue.slice(0, max);
    }
  }

  return { ...editProduct, [field]: nextValue };
}

/**
 * Apply one Class-A AI suggestion into a shallow copy of editor state.
 * Existing products only — never name/slug/C-class.
 */
export function applyExistingProductAiFieldLocally<
  T extends Record<string, unknown>,
>(
  editProduct: T,
  field: string,
  value: string
): T {
  if (!isExistingProductAiApplyField(field)) {
    return editProduct;
  }
  if (isBlockedCClassApplyField(field)) {
    return editProduct;
  }

  let nextValue = String(value ?? "");
  if (field === "short_description" || field === "full_description") {
    nextValue = plainTextToSafeTipTapHtml(nextValue);
  } else {
    nextValue = nextValue.trim();
    const max = PRODUCT_AI_FIELD_MAX[field];
    if (max && nextValue.length > max) {
      nextValue = nextValue.slice(0, max);
    }
  }

  return { ...editProduct, [field]: nextValue };
}

/** Whole pounds or up to 2 decimals; optional £ and thousands commas. */
const STRICT_PRICE_NUMERIC =
  /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

export function parseStrictPriceGbp(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return undefined;
    return value;
  }
  if (typeof value !== "string") return undefined;
  let raw = value.trim();
  if (!raw || /^(nan|infinity|\+infinity|-infinity)$/i.test(raw)) return undefined;
  if (raw.startsWith("£")) raw = raw.slice(1).trim();
  if (!STRICT_PRICE_NUMERIC.test(raw)) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function parseLinesList(text: string, maxItems = 12): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function currentEditorPlainPreview(
  field: ProductAiEditableField,
  editProduct: Record<string, unknown>
): string {
  const raw = editProduct[field];
  if (field === "short_description" || field === "full_description") {
    return tipTapHtmlToPlainContext(raw, 500);
  }
  return String(raw ?? "").trim();
}

export type BuildNewProductAiRequestInput = {
  provider: ProductAiProviderChoice;
  requestedFields: ProductAiEditableField[];
  editProduct: {
    name: string;
    slug: string;
    category: string;
    price: string;
    stock: string;
    image: string;
    og_image: string;
    short_description: string;
    full_description: string;
    features: string;
    seo_title: string;
    meta_description: string;
    focus_keyword: string;
  };
  facts: ProductAiFactsState;
};

export type BuildNewProductAiRequestResult =
  | {
      ok: true;
      body: {
        provider: ProductAiProviderChoice;
        task: "draft_product_fields";
        productId: null;
        productKind: ProductKindHint;
        requestedFields: ProductAiEditableField[];
        authoritative: Record<string, unknown>;
        currentEditorCopy: Record<string, string>;
      };
    }
  | { ok: false; message: string };

export function buildNewProductDraftRequest(
  input: BuildNewProductAiRequestInput
): BuildNewProductAiRequestResult {
  const name = String(input.editProduct.name || "").trim();
  if (!name) {
    return {
      ok: false,
      message:
        "Enter a basic product name first so AI has an authoritative product identity.",
    };
  }

  const fields = input.requestedFields.filter((f) =>
    (NEW_PRODUCT_AI_GENERATE_ALL_FIELDS as readonly string[]).includes(f)
  );
  if (!fields.length) {
    return { ok: false, message: "No eligible fields requested." };
  }

  const category = String(input.editProduct.category || "").trim();
  const slugNorm = normalizeProductAiSlug(input.editProduct.slug || "");
  const priceGbp = parseStrictPriceGbp(input.editProduct.price);
  const stockLabel = String(input.editProduct.stock || "").trim();
  const imageUrl = String(input.editProduct.image || "").trim() || null;
  const ogImageUrl = String(input.editProduct.og_image || "").trim() || null;

  const compatibility = parseLinesList(input.facts.confirmedCompatibility);
  const features = parseLinesList(input.facts.confirmedFeatures);
  const claims = parseLinesList(input.facts.approvedClaims);
  const duration = String(input.facts.duration || "").trim();
  const variant = String(input.facts.variant || "").trim();

  const authoritative: Record<string, unknown> = {
    productKind: input.facts.productKind,
    brand: "Firestick4UK",
    canonicalName: name,
    productId: null,
    active: true,
  };
  if (
    category === "Subscription" ||
    category === "Device" ||
    category === "Bundle"
  ) {
    authoritative.category = category;
  }
  if (priceGbp !== undefined) authoritative.priceGbp = priceGbp;
  if (stockLabel) authoritative.stockLabel = stockLabel;
  authoritative.slug = slugNorm;
  if (duration) authoritative.duration = duration;
  if (variant) authoritative.variant = variant;
  if (compatibility.length) authoritative.confirmedCompatibility = compatibility;
  if (features.length) authoritative.confirmedFeatures = features;
  if (claims.length) authoritative.approvedClaims = claims;
  authoritative.imageUrl = imageUrl;
  authoritative.ogImageUrl = ogImageUrl;

  const shortPlain = tipTapHtmlToPlainContext(
    input.editProduct.short_description,
    PRODUCT_AI_FIELD_MAX.short_description
  );
  const fullPlain = tipTapHtmlToPlainContext(
    input.editProduct.full_description,
    PRODUCT_AI_FIELD_MAX.full_description
  );

  const currentEditorCopy: Record<string, string> = {};
  if (name) currentEditorCopy.name = name;
  if (slugNorm) currentEditorCopy.slug = slugNorm;
  if (shortPlain) currentEditorCopy.short_description = shortPlain;
  if (fullPlain) currentEditorCopy.full_description = fullPlain;
  const feat = String(input.editProduct.features || "").trim();
  if (feat) currentEditorCopy.features = feat.slice(0, PRODUCT_AI_FIELD_MAX.features);
  const seo = String(input.editProduct.seo_title || "").trim();
  if (seo) currentEditorCopy.seo_title = seo.slice(0, PRODUCT_AI_FIELD_MAX.seo_title);
  const meta = String(input.editProduct.meta_description || "").trim();
  if (meta) {
    currentEditorCopy.meta_description = meta.slice(
      0,
      PRODUCT_AI_FIELD_MAX.meta_description
    );
  }
  const kw = String(input.editProduct.focus_keyword || "").trim();
  if (kw) currentEditorCopy.focus_keyword = kw.slice(0, PRODUCT_AI_FIELD_MAX.focus_keyword);

  return {
    ok: true,
    body: {
      provider: input.provider,
      task: "draft_product_fields",
      productId: null,
      productKind: input.facts.productKind,
      requestedFields: fields,
      authoritative,
      currentEditorCopy,
    },
  };
}

export function mapProviderSuggestionsToUi(
  suggestions: Record<string, { value?: string; reason?: string } | undefined> | null | undefined,
  requestedFields: ProductAiEditableField[]
): { suggestions: ProductAiSuggestionMap; unavailable: ProductAiUnavailableMap } {
  const out: ProductAiSuggestionMap = {};
  const unavailable: ProductAiUnavailableMap = {};
  const req = new Set(requestedFields);
  const src = suggestions || {};
  for (const field of requestedFields) {
    if (!(field in src) || !src[field]) {
      unavailable[field] = {
        unavailable: true,
        reason: "No suggestion returned for this field.",
      };
      continue;
    }
    const entry = src[field]!;
    const value = String(entry.value || "").trim();
    if (!value) {
      unavailable[field] = {
        unavailable: true,
        reason: entry.reason || "Insufficient facts to draft safely.",
      };
      continue;
    }
    out[field] = {
      value,
      ...(entry.reason ? { reason: String(entry.reason) } : {}),
      selected: false,
    };
  }
  for (const key of Object.keys(src)) {
    if (!req.has(key as ProductAiEditableField)) {
      // Ignore unexpected keys — do not surface / apply.
      continue;
    }
  }
  return { suggestions: out, unavailable };
}

/** Existing-product draft whitelist must never include name/slug. */
export function existingProductDraftAllowsNameOrSlug(): boolean {
  return (
    (PRODUCT_AI_EXISTING_EDITABLE_FIELDS as readonly string[]).includes("name") ||
    (PRODUCT_AI_EXISTING_EDITABLE_FIELDS as readonly string[]).includes("slug")
  );
}

/** Existing Apply allowlist must never include name/slug. */
export function existingProductApplyAllowsNameOrSlug(): boolean {
  return (
    (EXISTING_PRODUCT_AI_APPLY_FIELDS as readonly string[]).includes(
      "name" as ExistingProductAiApplyField
    ) ||
    (EXISTING_PRODUCT_AI_APPLY_FIELDS as readonly string[]).includes(
      "slug" as ExistingProductAiApplyField
    )
  );
}

export function suggestionContainsUnsafeHtml(value: string): boolean {
  return /<\s*\/?\s*[a-z]|javascript\s*:|on\w+\s*=/i.test(String(value || ""));
}

export type ProductReviewUiEntry = ProductAiReviewItem & {
  selected: boolean;
};

export type ProductReviewUiState = {
  status: "idle" | "loading" | "ok" | "error";
  provider: ProductAiProviderChoice;
  error: string;
  productId: number | null;
  items: ProductReviewUiEntry[];
};

export function createIdleProductReviewUi(
  provider: ProductAiProviderChoice = "gemini"
): ProductReviewUiState {
  return {
    status: "idle",
    provider,
    error: "",
    productId: null,
    items: [],
  };
}

export type BuildExistingProductReviewRequestInput = {
  provider: ProductAiProviderChoice;
  productId: number;
  productKind?: ProductKindHint;
  editProduct: {
    short_description: string;
    full_description: string;
    features: string;
    seo_title: string;
    meta_description: string;
    focus_keyword: string;
  };
};

export type BuildExistingProductReviewRequestResult =
  | {
      ok: true;
      body: {
        provider: ProductAiProviderChoice;
        task: "review_product";
        productId: number;
        productKind?: ProductKindHint;
        currentEditorCopy: Record<string, string>;
      };
    }
  | { ok: false; message: string };

export function buildExistingProductReviewRequest(
  input: BuildExistingProductReviewRequestInput
): BuildExistingProductReviewRequestResult {
  const productId = Number(input.productId);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return { ok: false, message: "productId is invalid." };
  }

  const shortPlain = tipTapHtmlToPlainContext(
    input.editProduct.short_description,
    PRODUCT_AI_FIELD_MAX.short_description
  );
  const fullPlain = tipTapHtmlToPlainContext(
    input.editProduct.full_description,
    PRODUCT_AI_FIELD_MAX.full_description
  );

  const currentEditorCopy: Record<string, string> = {};
  if (shortPlain) currentEditorCopy.short_description = shortPlain;
  if (fullPlain) currentEditorCopy.full_description = fullPlain;
  const feat = String(input.editProduct.features || "").trim();
  if (feat) {
    currentEditorCopy.features = feat.slice(0, PRODUCT_AI_FIELD_MAX.features);
  }
  const seo = String(input.editProduct.seo_title || "").trim();
  if (seo) {
    currentEditorCopy.seo_title = seo.slice(0, PRODUCT_AI_FIELD_MAX.seo_title);
  }
  const meta = String(input.editProduct.meta_description || "").trim();
  if (meta) {
    currentEditorCopy.meta_description = meta.slice(
      0,
      PRODUCT_AI_FIELD_MAX.meta_description
    );
  }
  const kw = String(input.editProduct.focus_keyword || "").trim();
  if (kw) {
    currentEditorCopy.focus_keyword = kw.slice(
      0,
      PRODUCT_AI_FIELD_MAX.focus_keyword
    );
  }

  return {
    ok: true,
    body: {
      provider: input.provider,
      task: "review_product" as const,
      productId,
      ...(input.productKind ? { productKind: input.productKind } : {}),
      currentEditorCopy,
    },
  };
}

export function mapProductReviewToUi(
  review: ProductAiReviewItem[] | null | undefined
): ProductReviewUiEntry[] {
  const list = Array.isArray(review) ? review : [];
  const out: ProductReviewUiEntry[] = [];
  const allowed = new Set<string>(PRODUCT_AI_REVIEW_FIELDS);
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const field = String(item.field || "");
    if (!allowed.has(field) || seen.has(field)) continue;
    if (field === "slug" || isBlockedCClassApplyField(field)) continue;
    seen.add(field);
    out.push({
      field: field as ProductAiReviewField,
      current: String(item.current ?? ""),
      suggested: item.suggested == null ? null : String(item.suggested),
      reason: String(item.reason || ""),
      status: item.status,
      ...(item.confidence ? { confidence: item.confidence } : {}),
      selected: false,
    });
  }
  return out;
}

export function isReviewFieldApplyable(field: string): boolean {
  return isExistingProductAiApplyField(field);
}

/** Assert review contract includes name as review-only and Class-A apply fields. */
export function reviewContractIncludesNameAsReviewOnly(): boolean {
  return (
    (PRODUCT_AI_REVIEW_FIELDS as readonly string[]).includes("name") &&
    !(EXISTING_PRODUCT_AI_APPLY_FIELDS as readonly string[]).includes(
      "name" as ExistingProductAiApplyField
    )
  );
}

export type { ProductAiExistingEditableField, ProductAiReviewField };

/* ─── PAI-5 Image Brief UI helpers ──────────────────────────────────────── */

export type ProductImageBriefUiState = {
  status: "idle" | "loading" | "ok" | "error";
  provider: ProductAiProviderChoice;
  error: string;
  productId: number | null;
  slots: ImageBriefSlot[];
};

export function createIdleProductImageBriefUi(
  provider: ProductAiProviderChoice = "gemini"
): ProductImageBriefUiState {
  return {
    status: "idle",
    provider,
    error: "",
    productId: null,
    slots: [],
  };
}

export type BuildImageBriefRequestInput = {
  provider: ProductAiProviderChoice;
  productId: number | null;
  editProduct: {
    name: string;
    slug: string;
    category: string;
    price: string;
    stock: string;
    image: string;
    short_description: string;
    full_description: string;
    features: string;
    seo_title: string;
    meta_description: string;
    focus_keyword: string;
    og_image: string;
  };
  facts: ProductAiFactsState;
};

export type BuildImageBriefRequestResult =
  | {
      ok: true;
      body: {
        provider: ProductAiProviderChoice;
        task: "image_brief";
        productId: number | null;
        productKind: ProductKindHint;
        authoritative: Record<string, unknown>;
        currentEditorCopy: Record<string, string>;
      };
    }
  | { ok: false; message: string };

export function buildProductImageBriefRequest(
  input: BuildImageBriefRequestInput
): BuildImageBriefRequestResult {
  const name = String(input.editProduct.name || "").trim();
  if (!name) {
    return {
      ok: false,
      message:
        "Enter a basic product name first so AI has an authoritative product identity.",
    };
  }

  let productId: number | null = null;
  if (input.productId != null) {
    const id = Number(input.productId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { ok: false, message: "productId is invalid." };
    }
    productId = id;
  }

  const category = String(input.editProduct.category || "").trim();
  const slugNorm = normalizeProductAiSlug(input.editProduct.slug || "");
  const priceGbp = parseStrictPriceGbp(input.editProduct.price);
  const stockLabel = String(input.editProduct.stock || "").trim();
  const imageUrl = String(input.editProduct.image || "").trim() || null;
  const ogImageUrl = String(input.editProduct.og_image || "").trim() || null;

  const compatibility = parseLinesList(input.facts.confirmedCompatibility);
  const features = parseLinesList(input.facts.confirmedFeatures);
  const claims = parseLinesList(input.facts.approvedClaims);
  const duration = String(input.facts.duration || "").trim();
  const variant = String(input.facts.variant || "").trim();

  const authoritative: Record<string, unknown> = {
    productKind: input.facts.productKind,
    brand: "Firestick4UK",
    canonicalName: name,
    productId,
    active: true,
  };
  if (
    category === "Subscription" ||
    category === "Device" ||
    category === "Bundle"
  ) {
    authoritative.category = category;
  }
  if (priceGbp !== undefined) authoritative.priceGbp = priceGbp;
  if (stockLabel) authoritative.stockLabel = stockLabel;
  authoritative.slug = slugNorm || null;
  if (duration) authoritative.duration = duration;
  if (variant) authoritative.variant = variant;
  if (compatibility.length) authoritative.confirmedCompatibility = compatibility;
  if (features.length) authoritative.confirmedFeatures = features;
  if (claims.length) authoritative.approvedClaims = claims;
  authoritative.imageUrl = imageUrl;
  authoritative.ogImageUrl = ogImageUrl;

  const shortPlain = tipTapHtmlToPlainContext(
    input.editProduct.short_description,
    PRODUCT_AI_FIELD_MAX.short_description
  );
  const fullPlain = tipTapHtmlToPlainContext(
    input.editProduct.full_description,
    PRODUCT_AI_FIELD_MAX.full_description
  );

  const currentEditorCopy: Record<string, string> = {};
  if (name) currentEditorCopy.name = name;
  if (slugNorm) currentEditorCopy.slug = slugNorm;
  if (shortPlain) currentEditorCopy.short_description = shortPlain;
  if (fullPlain) currentEditorCopy.full_description = fullPlain;
  const feat = String(input.editProduct.features || "").trim();
  if (feat) {
    currentEditorCopy.features = feat.slice(0, PRODUCT_AI_FIELD_MAX.features);
  }
  const seo = String(input.editProduct.seo_title || "").trim();
  if (seo) {
    currentEditorCopy.seo_title = seo.slice(0, PRODUCT_AI_FIELD_MAX.seo_title);
  }
  const meta = String(input.editProduct.meta_description || "").trim();
  if (meta) {
    currentEditorCopy.meta_description = meta.slice(
      0,
      PRODUCT_AI_FIELD_MAX.meta_description
    );
  }
  const kw = String(input.editProduct.focus_keyword || "").trim();
  if (kw) {
    currentEditorCopy.focus_keyword = kw.slice(
      0,
      PRODUCT_AI_FIELD_MAX.focus_keyword
    );
  }

  return {
    ok: true,
    body: {
      provider: input.provider,
      task: "image_brief" as const,
      productId,
      productKind: input.facts.productKind,
      authoritative,
      currentEditorCopy,
    },
  };
}

export function mapImageBriefSlotsToUi(
  slots: ImageBriefSlot[] | null | undefined
): ImageBriefSlot[] {
  const list = Array.isArray(slots) ? slots : [];
  const bySlot = new Map<string, ImageBriefSlot>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.slot || "") as ImageBriefSlotId;
    if (!(IMAGE_BRIEF_SLOTS as readonly string[]).includes(id)) continue;
    if (bySlot.has(id)) continue;
    bySlot.set(id, item);
  }
  return IMAGE_BRIEF_SLOTS.map((id) => bySlot.get(id)).filter(
    Boolean
  ) as ImageBriefSlot[];
}

export function formatImageBriefClipboard(slot: ImageBriefSlot): string {
  return [
    `Slot: ${slot.slot}`,
    `Use: ${slot.use ? "yes" : "no"}`,
    `Purpose: ${slot.purpose}`,
    `Size: ${slot.width}×${slot.height} (${slot.aspect_ratio})`,
    `Format: ${slot.format}`,
    `Composition: ${slot.composition}`,
    `Prompt: ${slot.prompt}`,
    `Negative prompt: ${slot.negative_prompt}`,
    `Approved text: ${slot.approved_text || "(none)"}`,
    `Text guidance: ${slot.text_guidance}`,
    `Alt text: ${slot.alt_text}`,
  ].join("\n");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export type { ImageBriefSlot, ImageBriefSlotId };

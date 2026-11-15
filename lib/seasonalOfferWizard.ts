/**
 * F4UK-MULTI-101 — Seasonal offer wizard helpers.
 * Maps wizard state → existing admin-products POST + PATCH season actions.
 * Does not change eligibility logic or invent new APIs.
 */

import { parseStrictPriceGbp } from "@/lib/productAiClient";
import {
  londonPartsFromUtcMs,
  parseLondonWallInput,
  type LondonWallInput,
} from "@/lib/productSeasonLondon";

export type WizardBaseProduct = {
  id: number;
  name: string;
  slug?: string;
  price?: string | number;
  category?: string;
  stock?: string;
  shop_listed?: number | null;
  short_description?: string;
  full_description?: string;
  description?: string;
  features?: string;
  image?: string | null;
  seo_title?: string;
  meta_description?: string;
  focus_keyword?: string;
  og_image?: string;
  season_name?: string | null;
};

export type WizardFormState = {
  baseProductId: number | null;
  name: string;
  slug: string;
  season_name: string;
  seo_title: string;
  meta_description: string;
  price: string;
  startsWall: string; // YYYY-MM-DDTHH:mm:ss
  startsOffset: "+00:00" | "+01:00";
  endsWall: string;
  endsOffset: "+00:00" | "+01:00";
  image: string;
  availableIds: number[];
  upcomingIds: number[];
  category: string;
  stock: string;
  shop_listed: 0 | 1;
  short_description: string;
  full_description: string;
  features: string;
  focus_keyword: string;
  og_image: string;
};

export type CreateStepName =
  | "create_product"
  | "set_lifecycle_settings"
  | "set_season_window"
  | "set_archive_presentation"
  | "set_shop_listed";

export type CreateStepResult = {
  step: CreateStepName;
  ok: boolean;
  error?: string;
  productId?: number;
  productVersion?: number;
  slug?: string;
};

export function toProductSlug(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function emptyWizardState(): WizardFormState {
  return {
    baseProductId: null,
    name: "",
    slug: "",
    season_name: "",
    seo_title: "",
    meta_description: "",
    price: "",
    startsWall: "",
    startsOffset: "+00:00",
    endsWall: "",
    endsOffset: "+00:00",
    image: "",
    availableIds: [],
    upcomingIds: [],
    category: "Subscription",
    stock: "Digital",
    shop_listed: 1,
    short_description: "",
    full_description: "",
    features: "",
    focus_keyword: "",
    og_image: "",
  };
}

/** Prefill SEO by replacing base season/event name (or product name) with the new event name. */
export function prefillSeoFromBase(
  base: WizardBaseProduct,
  seasonName: string
): { seo_title: string; meta_description: string } {
  const event = String(seasonName || "").trim();
  const baseSeason = String(base.season_name || "").trim();
  const replaceToken = (text: string) => {
    let t = String(text || "");
    if (baseSeason && event) {
      t = t.split(baseSeason).join(event);
    } else if (event && base.name) {
      // If no prior season name, append event lightly when empty
      if (!t.trim()) {
        return `${base.name} — ${event}`.slice(0, 65);
      }
    }
    return t;
  };
  let seo_title = replaceToken(base.seo_title || "");
  let meta_description = replaceToken(base.meta_description || "");
  if (!seo_title.trim() && base.name) {
    seo_title = event
      ? `${base.name} | ${event}`.slice(0, 65)
      : String(base.name).slice(0, 65);
  }
  if (!meta_description.trim()) {
    meta_description = String(base.short_description || base.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }
  return {
    seo_title: seo_title.slice(0, 120),
    meta_description: meta_description.slice(0, 320),
  };
}

export function applyBaseProduct(
  base: WizardBaseProduct,
  seasonName = ""
): Partial<WizardFormState> {
  const seo = prefillSeoFromBase(base, seasonName);
  return {
    baseProductId: Number(base.id),
    category: String(base.category || "Subscription"),
    stock: String(base.stock || "Digital"),
    shop_listed: Number(base.shop_listed) === 0 ? 0 : 1,
    short_description: String(base.short_description || base.description || ""),
    full_description: String(base.full_description || ""),
    features: String(base.features || ""),
    image: String(base.image || ""),
    og_image: String(base.og_image || ""),
    focus_keyword: String(base.focus_keyword || ""),
    seo_title: seo.seo_title,
    meta_description: seo.meta_description,
    price:
      base.price != null && String(base.price).trim() !== ""
        ? String(base.price)
        : "",
  };
}

export function buildProductCreateBody(state: WizardFormState): {
  ok: true;
  body: Record<string, unknown>;
} | { ok: false; error: string } {
  const name = String(state.name || "").trim();
  if (!name) return { ok: false, error: "Product name is required" };
  const slug = (String(state.slug || "").trim() || toProductSlug(name)).trim();
  if (!slug) return { ok: false, error: "Slug is required" };
  const parsed = parseStrictPriceGbp(state.price);
  if (parsed === undefined) {
    return {
      ok: false,
      error: "Enter a valid GBP price (non-negative, max 2 decimal places)",
    };
  }
  return {
    ok: true,
    body: {
      name,
      slug,
      price: String(parsed),
      category: state.category || "Subscription",
      description: state.short_description || "",
      short_description: state.short_description || "",
      full_description: state.full_description || "",
      features: state.features || "",
      image: state.image || null,
      stock: state.stock || "Digital",
      badge: null,
      seo_title: String(state.seo_title || "").slice(0, 65),
      meta_description: String(state.meta_description || "").slice(0, 160),
      focus_keyword: state.focus_keyword || "",
      og_image: state.og_image || "",
    },
  };
}

export function buildLifecyclePatch(
  id: number,
  expected_version: number,
  season_name: string
): Record<string, unknown> {
  return {
    id,
    action: "set_lifecycle_settings",
    expected_version,
    lifecycle_mode: "seasonal",
    season_name: String(season_name || "").trim(),
  };
}

export function buildWindowPatch(
  id: number,
  expected_version: number,
  state: Pick<
    WizardFormState,
    "startsWall" | "startsOffset" | "endsWall" | "endsOffset"
  >
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const starts_at_london: LondonWallInput = {
    wall: state.startsWall,
    offset: state.startsOffset,
  };
  const ends_at_london: LondonWallInput = {
    wall: state.endsWall,
    offset: state.endsOffset,
  };
  const starts = parseLondonWallInput(starts_at_london);
  if (!starts.ok) return { ok: false, error: `Start: ${starts.error}` };
  const ends = parseLondonWallInput(ends_at_london);
  if (!ends.ok) return { ok: false, error: `End: ${ends.error}` };
  if (starts.utcMs >= ends.utcMs) {
    return { ok: false, error: "End must be after start" };
  }
  return {
    ok: true,
    body: {
      id,
      action: "set_season_window",
      expected_version,
      starts_at_london,
      ends_at_london,
    },
  };
}

export function buildArchivePatch(
  id: number,
  expected_version: number,
  state: Pick<WizardFormState, "availableIds" | "upcomingIds">
): Record<string, unknown> {
  return {
    id,
    action: "set_archive_presentation",
    expected_version,
    season_available_ids: state.availableIds,
    season_upcoming_ids: state.upcomingIds,
  };
}

export type CustomerWindowPhase = "upcoming" | "live" | "ended" | "invalid";

export function customerWindowPhase(
  starts: LondonWallInput,
  ends: LondonWallInput,
  nowMs = Date.now()
): CustomerWindowPhase {
  const s = parseLondonWallInput(starts);
  const e = parseLondonWallInput(ends);
  if (!s.ok || !e.ok || s.utcMs >= e.utcMs) return "invalid";
  if (nowMs < s.utcMs) return "upcoming";
  if (nowMs < e.utcMs) return "live";
  return "ended";
}

export function formatLondonPreview(
  starts: LondonWallInput,
  ends: LondonWallInput
): string {
  const s = parseLondonWallInput(starts);
  const e = parseLondonWallInput(ends);
  if (!s.ok || !e.ok) return "Invalid window";
  const fmt = (wall: string, offset: string) => {
    const m = wall.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
    );
    if (!m) return wall;
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]} (UTC${offset})`;
  };
  return `Live from ${fmt(starts.wall, starts.offset)} to ${fmt(ends.wall, ends.offset)} (London)`;
}

/** Suggest London offset for a wall datetime using Intl Europe/London. */
export function suggestLondonOffsetForWall(
  wall: string
): "+00:00" | "+01:00" | null {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  // Probe with both offsets via parseLondonWallInput validity is elsewhere;
  // use a UTC guess then read londonParts.
  const guessUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
  // Try nearby instants to find matching wall
  for (const delta of [0, -3600000, 3600000, -7200000, 7200000]) {
    const parts = londonPartsFromUtcMs(guessUtc + delta);
    if (parts && parts.wall === wall) return parts.offset;
  }
  // DST spring-forward gap / autumn overlap — prefer +01:00 in summer months
  const mo = Number(m[2]);
  return mo >= 4 && mo <= 10 ? "+01:00" : "+00:00";
}

/**
 * Sequential create using existing APIs.
 * If a step fails, returns completed + failed step; caller may retry remaining.
 */
export async function runSeasonalOfferCreate(
  state: WizardFormState,
  opts: {
    fetchImpl?: typeof fetch;
    startFrom?: CreateStepName;
    existingProductId?: number;
    existingVersion?: number;
  } = {}
): Promise<{
  ok: boolean;
  results: CreateStepResult[];
  productId?: number;
  productVersion?: number;
  slug?: string;
}> {
  const doFetch = opts.fetchImpl || fetch;
  const results: CreateStepResult[] = [];
  let productId = opts.existingProductId;
  let productVersion = opts.existingVersion;
  let slug: string | undefined;

  const steps: CreateStepName[] = [
    "create_product",
    "set_lifecycle_settings",
    "set_season_window",
    "set_archive_presentation",
    "set_shop_listed",
  ];
  const startIdx = opts.startFrom ? steps.indexOf(opts.startFrom) : 0;
  if (startIdx < 0) {
    return { ok: false, results: [{ step: "create_product", ok: false, error: "Unknown start step" }] };
  }

  for (let i = startIdx; i < steps.length; i++) {
    const step = steps[i];

    if (step === "create_product") {
      if (productId != null && productVersion != null) {
        results.push({ step, ok: true, productId, productVersion, slug });
        continue;
      }
      const built = buildProductCreateBody(state);
      if (!built.ok) {
        results.push({ step, ok: false, error: built.error });
        return { ok: false, results, productId, productVersion, slug };
      }
      const r = await doFetch("/api/admin-products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.body),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || res.error) {
        results.push({
          step,
          ok: false,
          error: String(res.error || `Create failed (${r.status})`),
        });
        return { ok: false, results, productId, productVersion, slug };
      }
      productId = Number(res.id);
      productVersion = 0;
      slug = String(res.slug || built.body.slug || "");
      // Fetch version from response if present
      if (res.product_version != null) productVersion = Number(res.product_version);
      results.push({ step, ok: true, productId, productVersion, slug });
      continue;
    }

    if (productId == null || productVersion == null) {
      results.push({ step, ok: false, error: "Missing product id/version" });
      return { ok: false, results, productId, productVersion, slug };
    }

    let body: Record<string, unknown> | null = null;
    if (step === "set_lifecycle_settings") {
      const sn = String(state.season_name || "").trim();
      if (!sn) {
        results.push({ step, ok: false, error: "season_name is required" });
        return { ok: false, results, productId, productVersion, slug };
      }
      body = buildLifecyclePatch(productId, productVersion, sn);
    } else if (step === "set_season_window") {
      const w = buildWindowPatch(productId, productVersion, state);
      if (!w.ok) {
        results.push({ step, ok: false, error: w.error });
        return { ok: false, results, productId, productVersion, slug };
      }
      body = w.body;
    } else if (step === "set_shop_listed") {
      // Product create defaults to shop_listed=1; only PATCH when the wizard wants it hidden.
      if (state.shop_listed !== 0) continue;
      body = {
        action: "set_shop_listed",
        id: productId,
        expected_version: productVersion,
        shop_listed: 0,
      };
    } else {
      body = buildArchivePatch(productId, productVersion, state);
    }

    const r = await doFetch("/api/admin-products", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || res.error) {
      results.push({
        step,
        ok: false,
        error: String(res.error || `PATCH ${step} failed (${r.status})`),
        productId,
        productVersion,
      });
      return { ok: false, results, productId, productVersion, slug };
    }
    if (res.product && res.product.product_version != null) {
      productVersion = Number(res.product.product_version);
    } else if (res.product_version != null) {
      productVersion = Number(res.product_version);
    } else {
      productVersion = productVersion + 1;
    }
    results.push({ step, ok: true, productId, productVersion });
  }

  return { ok: true, results, productId, productVersion, slug };
}

/** Duplicate product → create-body for opening the normal editor (unsaved until Save). */
export function buildDuplicateEditProduct(base: WizardBaseProduct): Record<string, unknown> {
  return {
    name: `${String(base.name || "").trim()} (copy)`.trim(),
    slug: "",
    price: base.price != null ? String(base.price) : "",
    category: base.category || "Subscription",
    stock: base.stock || "Digital",
    short_description: base.short_description || base.description || "",
    full_description: base.full_description || "",
    features: base.features || "",
    image: base.image || "",
    seo_title: base.seo_title || "",
    meta_description: base.meta_description || "",
    focus_keyword: base.focus_keyword || "",
    og_image: base.og_image || "",
  };
}

/** datetime-local value (no seconds) ↔ wall with seconds */
export function wallFromDatetimeLocal(v: string): string {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return s;
}

export function datetimeLocalFromWall(wall: string): string {
  const m = String(wall || "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return m ? m[1] : "";
}

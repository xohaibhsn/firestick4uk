/**
 * Content-draft base version contract for Sidhu product editor (production source of truth).
 * Keeps unsaved content draft base separate from live list/ops version.
 */

export type EditProductDraft = {
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

export type ContentDraftSession = {
  /** Opaque editor session id — bind mutation responses to this session. */
  editorSessionId: string;
  productId: number;
  contentDraftBaseVersion: number | null;
  editProduct: EditProductDraft;
  /** Live ops version from list/PATCH (may differ from draft base). */
  liveProductVersion: number | null;
  contentConflict: null | {
    server: Record<string, unknown>;
    draft: EditProductDraft;
    /** True when server placeholder lacks full content — reload required. */
    incompleteServerRow: boolean;
  };
};

let sessionSeq = 0;
export function newEditorSessionId(): string {
  sessionSeq += 1;
  return `editor-${sessionSeq}-${Date.now()}`;
}

/** Immutable request context captured at dispatch — never rebuilt from a live ref later. */
export type EditorRequestContext = {
  editorSessionId: string;
  productId: number;
  actionStartedAtVersion: number | null;
};

/**
 * Compare a response's captured dispatch context against the currently active editor.
 * Use the live session id for comparison only — never to manufacture the response identity.
 */
export function isActiveEditorRequest(
  activeEditorSessionId: string | null | undefined,
  activeProductId: number | null | undefined,
  request: EditorRequestContext
): boolean {
  if (!activeEditorSessionId || !request?.editorSessionId) return false;
  if (request.editorSessionId !== activeEditorSessionId) return false;
  if (
    activeProductId != null &&
    Number.isFinite(Number(activeProductId)) &&
    Number(request.productId) !== Number(activeProductId)
  ) {
    return false;
  }
  return true;
}

function formatPriceDisplay(price: unknown): string {
  if (price == null || price === "") return "";
  const n = Number(String(price).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return "";
  // Preserve legitimate zero.
  return `£${n.toFixed(2)}`;
}

export function productRowToEditDraft(product: Record<string, unknown>): EditProductDraft {
  return {
    name: String(product.name || ""),
    slug: String(product.slug || ""),
    category: String(product.category || "Subscription"),
    price: formatPriceDisplay(product.price),
    stock: String(product.stock || "Digital"),
    image: String(product.image ?? ""),
    short_description: String(product.short_description || product.description || ""),
    full_description: String(product.full_description || ""),
    features: String(product.features || ""),
    seo_title: String(product.seo_title || ""),
    meta_description: String(product.meta_description || ""),
    focus_keyword: String(product.focus_keyword || ""),
    og_image: String(product.og_image || ""),
  };
}

/** True when a row has enough fields to replace the content draft safely. */
export function isCompleteProductContentRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row || typeof row !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(row, "name")) return false;
  if (!Object.prototype.hasOwnProperty.call(row, "slug")) return false;
  if (!Object.prototype.hasOwnProperty.call(row, "price")) return false;
  // Reject version-only placeholders.
  const keys = Object.keys(row);
  if (keys.every((k) => ["id", "product_version", "current_version"].includes(k))) return false;
  return true;
}

export function openContentDraftSession(
  product: Record<string, unknown>,
  editorSessionId = newEditorSessionId()
): ContentDraftSession {
  const version =
    product.product_version != null && Number.isFinite(Number(product.product_version))
      ? Number(product.product_version)
      : null;
  return {
    editorSessionId,
    productId: Number(product.id),
    contentDraftBaseVersion: version,
    liveProductVersion: version,
    contentConflict: null,
    editProduct: productRowToEditDraft(product),
  };
}

/** List refresh updates live ops version but never advances draft base. */
export function applyListRefreshToDraftSession(
  session: ContentDraftSession,
  list: Array<Record<string, unknown>>
): ContentDraftSession {
  const fresh = list.find((p) => Number(p.id) === Number(session.productId));
  if (!fresh) return session;
  const live =
    fresh.product_version != null && Number.isFinite(Number(fresh.product_version))
      ? Number(fresh.product_version)
      : session.liveProductVersion;
  return {
    ...session,
    liveProductVersion: live,
  };
}

export function expectedVersionForContentSave(session: ContentDraftSession): number | null {
  return session.contentDraftBaseVersion;
}

export function saveBlockedByConflict(session: ContentDraftSession): boolean {
  return session.contentConflict != null;
}

export function applyPut409ToDraftSession(
  session: ContentDraftSession,
  opts: {
    currentVersion?: number;
    serverProduct?: Record<string, unknown> | null;
  }
): ContentDraftSession {
  const incomplete = !isCompleteProductContentRow(opts.serverProduct || null);
  const server: Record<string, unknown> = {
    id: session.productId,
    ...(opts.serverProduct || {}),
    ...(opts.currentVersion != null ? { product_version: opts.currentVersion } : {}),
  };
  return {
    ...session,
    liveProductVersion:
      opts.currentVersion != null ? opts.currentVersion : session.liveProductVersion,
    contentDraftBaseVersion: session.contentDraftBaseVersion,
    contentConflict: {
      server,
      draft: { ...session.editProduct },
      incompleteServerRow: incomplete,
    },
  };
}

/**
 * Apply a successful reload using a complete authoritative current product.
 * Rejects incomplete placeholders — leaves conflict/draft unchanged.
 */
export function resolveConflictReloadFromCompleteProduct(
  session: ContentDraftSession,
  completeProduct: Record<string, unknown>,
  opts?: { editorSessionId?: string }
): ContentDraftSession | { ok: false; error: string } {
  if (opts?.editorSessionId && opts.editorSessionId !== session.editorSessionId) {
    return { ok: false, error: "stale_editor_session" };
  }
  if (Number(completeProduct.id) !== Number(session.productId)) {
    return { ok: false, error: "product_id_mismatch" };
  }
  if (!isCompleteProductContentRow(completeProduct)) {
    return { ok: false, error: "incomplete_product_row" };
  }
  return openContentDraftSession(completeProduct, session.editorSessionId);
}

/** @deprecated Prefer resolveConflictReloadFromCompleteProduct with an authorized read. */
export function resolveConflictReloadServer(session: ContentDraftSession): ContentDraftSession {
  if (!session.contentConflict) return session;
  if (!isCompleteProductContentRow(session.contentConflict.server)) {
    // Do not blank the form from a version-only placeholder.
    return session;
  }
  return openContentDraftSession(
    { ...session.contentConflict.server, id: session.productId },
    session.editorSessionId
  );
}

/**
 * Advance draft base after a content-preserving own action only when:
 * - response matches product id + editor session
 * - action started from the same version that owns the current draft content
 * - response is not a no-op that would attach stale draft to an unrelated newer version
 * - existing content conflict is NOT cleared by operational pause alone
 */
export function applyOwnContentPreservingActionResult(
  session: ContentDraftSession,
  opts: {
    editorSessionId: string;
    productId: number;
    /** Version this editor sent as expected_version for the action. */
    actionStartedAtVersion: number | null;
    nextVersion: number;
    noop?: boolean;
    /** Operational success does not clear an outstanding content conflict. */
    clearConflict?: boolean;
  }
): ContentDraftSession {
  if (opts.editorSessionId !== session.editorSessionId) return session;
  if (Number(opts.productId) !== Number(session.productId)) return session;

  // Unqualified version bumps (e.g. panel onVersionUpdate after refresh) must not advance.
  if (
    opts.actionStartedAtVersion == null ||
    session.contentDraftBaseVersion == null ||
    opts.actionStartedAtVersion !== session.contentDraftBaseVersion
  ) {
    return {
      ...session,
      liveProductVersion: opts.nextVersion,
    };
  }

  // No-op: keep draft base; update live only.
  if (opts.noop) {
    return {
      ...session,
      liveProductVersion: opts.nextVersion,
    };
  }

  return {
    ...session,
    contentDraftBaseVersion: opts.nextVersion,
    liveProductVersion: opts.nextVersion,
    contentConflict:
      opts.clearConflict === true ? null : session.contentConflict,
  };
}

/** Live-only version update — never advances content draft base. */
export function applyLiveVersionOnly(
  session: ContentDraftSession,
  nextVersion: number
): ContentDraftSession {
  return {
    ...session,
    liveProductVersion: nextVersion,
  };
}

export function advanceDraftBaseAfterVerifiedMutation(
  session: ContentDraftSession,
  nextVersion: number
): ContentDraftSession {
  return {
    ...session,
    contentDraftBaseVersion: nextVersion,
    liveProductVersion: nextVersion,
    contentConflict: null,
  };
}

export function buildContentPutBody(
  session: ContentDraftSession,
  draft: EditProductDraft = session.editProduct
): Record<string, unknown> {
  const rawPrice = String(draft.price).replace(/[^0-9.]/g, "");
  const body: Record<string, unknown> = {
    id: session.productId,
    name: draft.name,
    slug: draft.slug,
    description: draft.short_description || "",
    price: rawPrice,
    category: draft.category,
    badge: null,
    image: draft.image || null,
    stock: draft.stock || "Digital",
    short_description: draft.short_description || "",
    full_description: draft.full_description || "",
    features: draft.features || "",
    seo_title: draft.seo_title || "",
    meta_description: draft.meta_description || "",
    focus_keyword: draft.focus_keyword || "",
    og_image: draft.og_image || "",
  };
  if (session.contentDraftBaseVersion != null) {
    body.expected_version = session.contentDraftBaseVersion;
  }
  return body;
}

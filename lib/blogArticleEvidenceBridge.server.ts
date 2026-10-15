/**
 * AB-8C1 — Trusted ephemeral research evidence bridge (server-only).
 *
 * Process-local in-memory store for authentic OpenAI provider packets that
 * already passed AB-7A READY validation. Opaque handles are bound to the
 * authenticated administrator session and research subject.
 *
 * Limitations (explicit):
 * - Not distributed storage. Worker A mint + worker B resolve may miss.
 * - Not durable across process restart.
 * - Handle possession alone does not authorize article generation.
 * - No automatic provider re-call on miss/expiry/consume.
 * - Durable cross-worker ledger remains AB-11 scope.
 *
 * No HTTP resolve endpoint. No CMS/DB writes. No new secrets.
 */

import { randomBytes } from "crypto";
import type { AdminIdentity } from "@/lib/adminAuth";
import type {
  BlogGroundedResearchProvider,
  BlogGroundedResearchProviderPacket,
} from "@/lib/blogGroundedResearchContracts";
import type { BlogArticleGenerationEvidenceInput } from "@/lib/blogArticleGenerationContracts";
import type {
  BlogResearchEvidenceResult,
  BlogResearchSubject,
} from "@/lib/blogResearchEvidence";

/** Internal safety policy — not a guaranteed operational capacity. */
export const BLOG_ARTICLE_EVIDENCE_BRIDGE_TTL_MS = 10 * 60 * 1000;
export const BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_HANDLES = 16;
/** Bound retained packet JSON size (aligned with grounded-research raw ceiling). */
export const BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_PACKET_JSON_BYTES = 262_144;
export const BLOG_ARTICLE_EVIDENCE_BRIDGE_TOKEN_BYTES = 32;

export const BLOG_ARTICLE_EVIDENCE_BRIDGE_FAILURE_CODES = [
  "invalid_handle",
  "expired_handle",
  "session_mismatch",
  "subject_mismatch",
  "provider_mismatch",
  "already_consumed",
  "evidence_unavailable",
  "capacity_exceeded",
  "packet_too_large",
  "invalid_evidence",
  "aborted",
] as const;

export type BlogArticleEvidenceBridgeFailureCode =
  (typeof BLOG_ARTICLE_EVIDENCE_BRIDGE_FAILURE_CODES)[number];

export type BlogArticleEvidenceBridgeFailure = {
  ok: false;
  code: BlogArticleEvidenceBridgeFailureCode;
};

export type BlogArticleEvidenceMintSuccess = {
  ok: true;
  handle: string;
  expiresAtMs: number;
};

export type BlogArticleEvidenceResolveSuccess = {
  ok: true;
  provider: "openai";
  evidence: BlogArticleGenerationEvidenceInput;
  /** Retained AB-7A READY result for independent re-inspection (server-only). */
  acceptedEvidence: Extract<BlogResearchEvidenceResult, { ok: true }>;
};

type SessionBinding = {
  sessionId: number;
  principalType: AdminIdentity["principalType"];
  staffId: number | null;
};

type StoredEntry = {
  handle: string;
  binding: SessionBinding;
  subject: {
    opportunityId: string;
    topic: string;
    intent: string | null;
  };
  provider: "openai";
  packet: BlogGroundedResearchProviderPacket;
  acceptedEvidence: Extract<BlogResearchEvidenceResult, { ok: true }>;
  mintedAtMs: number;
  expiresAtMs: number;
};

const store = new Map<string, StoredEntry>();

function fail(
  code: BlogArticleEvidenceBridgeFailureCode
): BlogArticleEvidenceBridgeFailure {
  return { ok: false, code };
}

function nowMs(): number {
  return Date.now();
}

function staffIdKey(admin: AdminIdentity): number | null {
  if (admin.principalType === "staff") {
    const id = admin.staffId;
    if (typeof id === "number" && Number.isInteger(id) && id > 0) return id;
    return null;
  }
  return null;
}

function bindingsEqual(a: SessionBinding, b: SessionBinding): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.principalType === b.principalType &&
    a.staffId === b.staffId
  );
}

function subjectsEqual(
  a: { opportunityId: string; topic: string; intent: string | null },
  b: BlogResearchSubject
): boolean {
  const intent =
    b.intent === undefined || b.intent === null ? null : String(b.intent);
  return (
    a.opportunityId === b.opportunityId &&
    a.topic === b.topic &&
    a.intent === intent
  );
}

function lazyCleanup(atMs: number): void {
  for (const [handle, entry] of store) {
    if (entry.expiresAtMs <= atMs) {
      store.delete(handle);
    }
  }
}

function snapshotPacket(
  packet: BlogGroundedResearchProviderPacket
):
  | { ok: true; packet: BlogGroundedResearchProviderPacket; bytes: number }
  | { ok: false; code: "packet_too_large" | "invalid_evidence" } {
  try {
    const json = JSON.stringify(packet);
    if (typeof json !== "string") {
      return { ok: false, code: "invalid_evidence" };
    }
    const bytes = Buffer.byteLength(json, "utf8");
    if (bytes > BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_PACKET_JSON_BYTES) {
      return { ok: false, code: "packet_too_large" };
    }
    const copy = JSON.parse(json) as BlogGroundedResearchProviderPacket;
    if (
      !copy ||
      typeof copy !== "object" ||
      copy.provider !== "openai" ||
      !copy.providerOutput ||
      !copy.grounding
    ) {
      return { ok: false, code: "invalid_evidence" };
    }
    return { ok: true, packet: copy, bytes };
  } catch {
    return { ok: false, code: "invalid_evidence" };
  }
}

function mintOpaqueHandle(): string {
  return randomBytes(BLOG_ARTICLE_EVIDENCE_BRIDGE_TOKEN_BYTES).toString(
    "base64url"
  );
}

/**
 * Mint a short-lived opaque handle for an authentic READY OpenAI packet.
 * Never accepts browser-supplied READY flags or editorial briefs as proof.
 */
export function mintBlogArticleEvidenceHandle(input: {
  admin: AdminIdentity;
  subject: BlogResearchSubject;
  provider: BlogGroundedResearchProvider;
  packet: BlogGroundedResearchProviderPacket;
  evidence: BlogResearchEvidenceResult;
  signal?: AbortSignal;
  now?: number;
}): BlogArticleEvidenceMintSuccess | BlogArticleEvidenceBridgeFailure {
  const at = typeof input.now === "number" ? input.now : nowMs();

  if (input.signal?.aborted) {
    return fail("aborted");
  }

  if (
    !input.admin ||
    input.admin.authenticated !== true ||
    typeof input.admin.sessionId !== "number" ||
    !Number.isInteger(input.admin.sessionId) ||
    input.admin.sessionId <= 0
  ) {
    return fail("invalid_evidence");
  }

  if (input.provider !== "openai" || input.packet?.provider !== "openai") {
    return fail("provider_mismatch");
  }

  if (
    !input.evidence ||
    input.evidence.ok !== true ||
    input.evidence.evidenceState !== "ready" ||
    !input.evidence.reasonCodes?.includes("GROUNDED_EVIDENCE_READY")
  ) {
    return fail("invalid_evidence");
  }

  if (!subjectsEqual(input.evidence.subject, input.subject)) {
    return fail("subject_mismatch");
  }

  const snap = snapshotPacket(input.packet);
  if (!snap.ok) return fail(snap.code);

  lazyCleanup(at);

  if (store.size >= BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_HANDLES) {
    return fail("capacity_exceeded");
  }

  const handle = mintOpaqueHandle();
  if (!handle || store.has(handle)) {
    return fail("evidence_unavailable");
  }

  const acceptedEvidence: Extract<BlogResearchEvidenceResult, { ok: true }> = {
    ok: true,
    evidenceState: "ready",
    subject: {
      opportunityId: input.evidence.subject.opportunityId,
      topic: input.evidence.subject.topic,
      intent: input.evidence.subject.intent,
    },
    summary: input.evidence.summary,
    sources: input.evidence.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      publishedAt: s.publishedAt,
    })),
    claims: input.evidence.claims.map((c) => ({
      claim: c.claim,
      sourceIds: [...c.sourceIds],
    })),
    unknowns: [...input.evidence.unknowns],
    searchQueries: [...input.evidence.searchQueries],
    reasonCodes: ["GROUNDED_EVIDENCE_READY"],
  };

  const entry: StoredEntry = {
    handle,
    binding: {
      sessionId: input.admin.sessionId,
      principalType: input.admin.principalType,
      staffId: staffIdKey(input.admin),
    },
    subject: {
      opportunityId: acceptedEvidence.subject.opportunityId,
      topic: acceptedEvidence.subject.topic,
      intent: acceptedEvidence.subject.intent,
    },
    provider: "openai",
    packet: snap.packet,
    acceptedEvidence,
    mintedAtMs: at,
    expiresAtMs: at + BLOG_ARTICLE_EVIDENCE_BRIDGE_TTL_MS,
  };

  store.set(handle, entry);
  return { ok: true, handle, expiresAtMs: entry.expiresAtMs };
}

/**
 * Resolve and atomically consume a process-local evidence handle.
 * Wrong session/subject fails closed without leaking packet contents.
 * No automatic OpenAI re-call.
 */
export function resolveBlogArticleEvidenceHandle(input: {
  handle: unknown;
  admin: AdminIdentity;
  subject: BlogResearchSubject;
  provider?: BlogGroundedResearchProvider;
  now?: number;
}): BlogArticleEvidenceResolveSuccess | BlogArticleEvidenceBridgeFailure {
  const at = typeof input.now === "number" ? input.now : nowMs();

  if (typeof input.handle !== "string" || !input.handle) {
    lazyCleanup(at);
    return fail("invalid_handle");
  }

  if (
    !input.admin ||
    input.admin.authenticated !== true ||
    typeof input.admin.sessionId !== "number" ||
    !Number.isInteger(input.admin.sessionId) ||
    input.admin.sessionId <= 0
  ) {
    lazyCleanup(at);
    return fail("session_mismatch");
  }

  const expectedProvider = input.provider ?? "openai";
  if (expectedProvider !== "openai") {
    lazyCleanup(at);
    return fail("provider_mismatch");
  }

  const entry = store.get(input.handle);
  if (!entry) {
    // Unknown, already consumed, or missing on this worker — fail closed.
    lazyCleanup(at);
    return fail("evidence_unavailable");
  }

  if (entry.expiresAtMs <= at) {
    store.delete(input.handle);
    lazyCleanup(at);
    return fail("expired_handle");
  }

  lazyCleanup(at);

  const callerBinding: SessionBinding = {
    sessionId: input.admin.sessionId,
    principalType: input.admin.principalType,
    staffId: staffIdKey(input.admin),
  };

  if (!bindingsEqual(entry.binding, callerBinding)) {
    return fail("session_mismatch");
  }

  if (!subjectsEqual(entry.subject, input.subject)) {
    return fail("subject_mismatch");
  }

  if (entry.provider !== "openai" || entry.packet.provider !== "openai") {
    return fail("provider_mismatch");
  }

  // One-time consumption: remove before handing data to callers.
  const removed = store.delete(input.handle);
  if (!removed) {
    return fail("already_consumed");
  }

  return {
    ok: true,
    provider: "openai",
    evidence: {
      subject: {
        opportunityId: entry.subject.opportunityId,
        topic: entry.subject.topic,
        intent: entry.subject.intent,
      },
      providerOutput: entry.packet.providerOutput,
      grounding: entry.packet.grounding,
    },
    acceptedEvidence: entry.acceptedEvidence,
  };
}

/** Test/process-restart seam — clears process-local store only. */
export function resetBlogArticleEvidenceBridgeForTests(): void {
  store.clear();
}

/** Test introspection — never log handles or packet contents in production. */
export function blogArticleEvidenceBridgeSizeForTests(): number {
  return store.size;
}

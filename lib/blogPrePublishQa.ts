/**
 * AB-1 — Deterministic autonomous blog pre-publish QA.
 *
 * Pure / deterministic / DB-free / HTTP-free / AI-free.
 * Reuses diagnoseBlog + normalizeBlogDiagnosticRow for SEO rules.
 * Does not mutate candidates, CMS data, or Issue Memory.
 */

import { diagnoseBlog, type SeoDiagnosticIssue } from "@/lib/seoDiagnostics";
import { normalizeBlogDiagnosticRow } from "@/lib/seoDiagnosticRows";
import { stripHtml } from "@/lib/seoOverview";

/** Editorial automation floor — NOT a Google ranking factor. */
export const DEFAULT_BLOG_PREPUBLISH_EDITORIAL_POLICY: BlogPrePublishEditorialPolicy =
  {
    minBodyTextChars: 1200,
  };

/** Max FAQ entries accepted for autonomous publication candidates. */
export const MAX_AUTONOMOUS_BLOG_FAQS = 12;

/** Technical bound for individual FAQ question/answer length. */
export const MAX_FAQ_FIELD_CHARS = 4000;

export type BlogPrePublishEditorialPolicy = {
  /**
   * Minimum plain-text body length after HTML strip.
   * This is an editorial automation floor, not a Google ranking factor.
   */
  minBodyTextChars: number;
};

export type AutonomousBlogCandidate = {
  id?: number | null;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category?: string;
  featured_image: string;
  meta_title: string;
  meta_description: string;
  focus_keyword?: string;
  canonical_url?: string | null;
  faqs?: Array<{ question: string; answer: string }>;
  publicationIntent: "publish";
  evidenceState: "ready" | "missing" | "stale";
  mediaState: {
    featuredImageReady: boolean;
  };
};

export type ExistingBlogPostInventoryRow = {
  id: number;
  title: string;
  slug: string;
  status?: string;
  active?: boolean | number;
};

export type BlogPrePublishFinding = {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  field: string | null;
  evidence: string;
};

export type BlogPrePublishChecks = {
  publicationIntent: boolean;
  evidenceReady: boolean;
  uniqueSlug: boolean;
  uniqueTitle: boolean;
  substantiveContent: boolean;
  safeHtml: boolean;
  headingStructure: boolean;
  internalLinksSafe: boolean;
  featuredImageReady: boolean;
  canonicalSafe: boolean;
};

export type BlogPrePublishQaResult = {
  verdict: "PASS" | "HOLD";
  blockers: BlogPrePublishFinding[];
  warnings: BlogPrePublishFinding[];
  existingSeoIssues: SeoDiagnosticIssue[];
  checks: BlogPrePublishChecks;
};

export type BlogPrePublishQaInput = {
  candidate: unknown;
  existingPosts?: ExistingBlogPostInventoryRow[] | null;
  policy?: Partial<BlogPrePublishEditorialPolicy> | null;
};

const PLACEHOLDER_PLAIN =
  /^(todo|tbd|coming soon|lorem ipsum|placeholder|draft content)[\s.!?]*$/i;

const UNSAFE_TAG_RE = /<\s*(script|iframe|object|embed|form)\b/i;
const BODY_H1_RE = /<\s*h1\b/i;
const BODY_H2_RE = /<\s*h2\b/i;
const HREF_RE = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * Write-path slug semantics (matches pages/api/blog.ts toBlogSlug).
 * Used for collision comparison only — not a second SEO algorithm.
 */
export function normalizeAutonomousBlogSlug(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeAutonomousBlogTitle(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function finding(
  code: string,
  severity: "blocker" | "warning",
  message: string,
  field: string | null,
  evidence: string
): BlogPrePublishFinding {
  return { code, severity, message, field, evidence };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseCandidate(
  raw: unknown
):
  | { ok: true; candidate: AutonomousBlogCandidate }
  | { ok: false; reason: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "Candidate must be an object." };
  }
  const title = typeof raw.title === "string" ? raw.title : null;
  const slug = typeof raw.slug === "string" ? raw.slug : null;
  const excerpt = typeof raw.excerpt === "string" ? raw.excerpt : null;
  const content = typeof raw.content === "string" ? raw.content : null;
  const featured_image =
    typeof raw.featured_image === "string" ? raw.featured_image : null;
  const meta_title = typeof raw.meta_title === "string" ? raw.meta_title : null;
  const meta_description =
    typeof raw.meta_description === "string" ? raw.meta_description : null;
  if (
    title === null ||
    slug === null ||
    excerpt === null ||
    content === null ||
    featured_image === null ||
    meta_title === null ||
    meta_description === null
  ) {
    return {
      ok: false,
      reason:
        "Candidate is missing required string fields (title, slug, excerpt, content, featured_image, meta_title, meta_description).",
    };
  }

  const mediaState = isPlainObject(raw.mediaState) ? raw.mediaState : null;
  if (!mediaState || typeof mediaState.featuredImageReady !== "boolean") {
    return {
      ok: false,
      reason: "Candidate.mediaState.featuredImageReady must be a boolean.",
    };
  }

  let faqs: AutonomousBlogCandidate["faqs"];
  if (raw.faqs !== undefined && raw.faqs !== null) {
    if (!Array.isArray(raw.faqs)) {
      return { ok: false, reason: "Candidate.faqs must be an array when provided." };
    }
    faqs = raw.faqs.map((entry) => {
      if (!isPlainObject(entry)) {
        return { question: "", answer: "" };
      }
      return {
        question: typeof entry.question === "string" ? entry.question : "",
        answer: typeof entry.answer === "string" ? entry.answer : "",
      };
    });
  }

  let id: number | null | undefined = undefined;
  if (raw.id !== undefined) {
    if (raw.id === null) id = null;
    else if (typeof raw.id === "number" && Number.isFinite(raw.id)) id = raw.id;
    else return { ok: false, reason: "Candidate.id must be a finite number or null." };
  }

  return {
    ok: true,
    candidate: {
      id,
      title,
      slug,
      excerpt,
      content,
      category: typeof raw.category === "string" ? raw.category : undefined,
      featured_image,
      meta_title,
      meta_description,
      focus_keyword:
        typeof raw.focus_keyword === "string" ? raw.focus_keyword : undefined,
      canonical_url:
        raw.canonical_url === null || typeof raw.canonical_url === "string"
          ? (raw.canonical_url as string | null)
          : undefined,
      faqs,
      publicationIntent: raw.publicationIntent as "publish",
      evidenceState: raw.evidenceState as AutonomousBlogCandidate["evidenceState"],
      mediaState: {
        featuredImageReady: mediaState.featuredImageReady,
      },
    },
  };
}

function collectHrefs(html: string): string[] {
  const out: string[] = [];
  HREF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HREF_RE.exec(html)) !== null) {
    const href = m[1] ?? m[2] ?? m[3] ?? "";
    out.push(String(href).trim());
  }
  return out;
}

function classifyHref(href: string): { ok: boolean; evidence: string } {
  if (!href) return { ok: true, evidence: "" };
  const lower = href.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return { ok: false, evidence: `Unsafe href scheme: ${href.slice(0, 64)}` };
  }
  // Protocol-relative must be rejected before root-relative ("/" also matches "//").
  if (href.startsWith("//")) {
    return {
      ok: false,
      evidence: "Protocol-relative URLs are not allowed in autonomous content.",
    };
  }
  if (href.startsWith("/")) return { ok: true, evidence: "" };
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return { ok: true, evidence: "" };
  }
  if (/^https?:\/\//i.test(href)) {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      return { ok: false, evidence: `Malformed absolute URL: ${href.slice(0, 64)}` };
    }
    if (u.hostname === "firestick4uk.com" || u.hostname === "www.firestick4uk.com") {
      if (u.protocol !== "https:") {
        return {
          ok: false,
          evidence: "Internal absolute links must use HTTPS apex firestick4uk.com.",
        };
      }
      if (u.hostname !== "firestick4uk.com") {
        return {
          ok: false,
          evidence: "Internal absolute links must use apex firestick4uk.com (no www).",
        };
      }
      return { ok: true, evidence: "" };
    }
    if (u.protocol !== "https:") {
      return {
        ok: false,
        evidence: `External links must use HTTPS: ${href.slice(0, 64)}`,
      };
    }
    return { ok: true, evidence: "" };
  }
  return { ok: false, evidence: `Unsupported href form: ${href.slice(0, 64)}` };
}

function ruleCodeFromSeoIssue(issue: SeoDiagnosticIssue): string {
  const parts = String(issue.id || "").split(":");
  const code = parts.length >= 3 ? parts.slice(2).join(":") : String(issue.id);
  return `seo-${code}`;
}

function dedupeFindings(list: BlogPrePublishFinding[]): BlogPrePublishFinding[] {
  const seen = new Set<string>();
  const out: BlogPrePublishFinding[] = [];
  for (const f of list) {
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    out.push(f);
  }
  return out;
}

/**
 * Evaluate an autonomous publication candidate.
 * Fail-closed: malformed input → HOLD. Never throws for validation failure.
 */
export function evaluateAutonomousBlogPrePublish(
  input: BlogPrePublishQaInput
): BlogPrePublishQaResult {
  const emptyChecks: BlogPrePublishChecks = {
    publicationIntent: false,
    evidenceReady: false,
    uniqueSlug: false,
    uniqueTitle: false,
    substantiveContent: false,
    safeHtml: false,
    headingStructure: false,
    internalLinksSafe: false,
    featuredImageReady: false,
    canonicalSafe: false,
  };

  const parsed = parseCandidate(input?.candidate);
  if (!parsed.ok) {
    return {
      verdict: "HOLD",
      blockers: [
        finding(
          "candidate-malformed",
          "blocker",
          "Autonomous publication candidate is malformed.",
          null,
          parsed.reason
        ),
      ],
      warnings: [],
      existingSeoIssues: [],
      checks: emptyChecks,
    };
  }

  const candidate = parsed.candidate;
  const policy: BlogPrePublishEditorialPolicy = {
    minBodyTextChars:
      typeof input.policy?.minBodyTextChars === "number" &&
      Number.isFinite(input.policy.minBodyTextChars) &&
      input.policy.minBodyTextChars >= 0
        ? Math.floor(input.policy.minBodyTextChars)
        : DEFAULT_BLOG_PREPUBLISH_EDITORIAL_POLICY.minBodyTextChars,
  };

  const gateBlockers: BlogPrePublishFinding[] = [];
  const dupBlockers: BlogPrePublishFinding[] = [];
  const techBlockers: BlogPrePublishFinding[] = [];
  const contentBlockers: BlogPrePublishFinding[] = [];
  const mediaBlockers: BlogPrePublishFinding[] = [];
  const seoBlockers: BlogPrePublishFinding[] = [];
  const warnings: BlogPrePublishFinding[] = [];

  const checks: BlogPrePublishChecks = { ...emptyChecks };

  // 1) Publication / evidence gates
  const intentOk = candidate.publicationIntent === "publish";
  checks.publicationIntent = intentOk;
  if (!intentOk) {
    gateBlockers.push(
      finding(
        "publish-intent-missing",
        "blocker",
        "Autonomous publication requires explicit publicationIntent=publish.",
        "publicationIntent",
        `Received: ${String((candidate as { publicationIntent?: unknown }).publicationIntent)}`
      )
    );
  }

  const evidenceOk = candidate.evidenceState === "ready";
  checks.evidenceReady = evidenceOk;
  if (!evidenceOk) {
    gateBlockers.push(
      finding(
        "evidence-not-ready",
        "blocker",
        "Autonomous publication requires evidenceState=ready.",
        "evidenceState",
        `Received: ${String(candidate.evidenceState)}`
      )
    );
  }

  // 2) Duplicate identity
  const inventory = Array.isArray(input.existingPosts) ? input.existingPosts : [];
  const candidateSlug = normalizeAutonomousBlogSlug(candidate.slug);
  const candidateTitle = normalizeAutonomousBlogTitle(candidate.title);
  const selfId =
    candidate.id != null && Number.isFinite(Number(candidate.id))
      ? Number(candidate.id)
      : null;

  let uniqueSlug = !!candidateSlug;
  let uniqueTitle = !!candidateTitle;
  if (!candidateSlug) {
    uniqueSlug = false;
    dupBlockers.push(
      finding(
        "duplicate-slug",
        "blocker",
        "Candidate slug is empty after normalization.",
        "slug",
        "Normalized slug is blank."
      )
    );
  } else {
    for (const row of inventory) {
      if (!row || typeof row !== "object") continue;
      const rowId = Number(row.id);
      if (selfId != null && Number.isFinite(rowId) && rowId === selfId) continue;
      if (normalizeAutonomousBlogSlug(row.slug) === candidateSlug) {
        uniqueSlug = false;
        dupBlockers.push(
          finding(
            "duplicate-slug",
            "blocker",
            "Candidate slug collides with an existing BlogPost.",
            "slug",
            `Collision with id=${rowId} slug=${String(row.slug || "")}`
          )
        );
        break;
      }
    }
  }
  if (!candidateTitle) {
    uniqueTitle = false;
    dupBlockers.push(
      finding(
        "duplicate-title",
        "blocker",
        "Candidate title is empty after normalization.",
        "title",
        "Normalized title is blank."
      )
    );
  } else {
    for (const row of inventory) {
      if (!row || typeof row !== "object") continue;
      const rowId = Number(row.id);
      if (selfId != null && Number.isFinite(rowId) && rowId === selfId) continue;
      if (normalizeAutonomousBlogTitle(row.title) === candidateTitle) {
        uniqueTitle = false;
        dupBlockers.push(
          finding(
            "duplicate-title",
            "blocker",
            "Candidate title collides with an existing BlogPost.",
            "title",
            `Collision with id=${rowId}`
          )
        );
        break;
      }
    }
  }
  checks.uniqueSlug = uniqueSlug;
  checks.uniqueTitle = uniqueTitle;

  // 3) Technical HTML / link / FAQ safety
  let safeHtml = true;
  if (UNSAFE_TAG_RE.test(candidate.content)) {
    safeHtml = false;
    techBlockers.push(
      finding(
        "unsafe-html",
        "blocker",
        "Article content contains unsafe active HTML structures.",
        "content",
        "Detected script/iframe/object/embed/form markup."
      )
    );
  }

  let headingStructureOk = true;
  if (BODY_H1_RE.test(candidate.content)) {
    headingStructureOk = false;
    techBlockers.push(
      finding(
        "body-h1",
        "blocker",
        "Article body must not contain an H1 (page title is already H1).",
        "content",
        "Detected <h1> in content HTML."
      )
    );
  }
  if (!BODY_H2_RE.test(candidate.content)) {
    warnings.push(
      finding(
        "missing-h2",
        "warning",
        "Editorial structure review: article body has no H2 headings.",
        "content",
        "No <h2> tags found. Advisory only — not a ranking rule."
      )
    );
  }
  checks.headingStructure = headingStructureOk;

  let linksSafe = true;
  for (const href of collectHrefs(candidate.content)) {
    const classified = classifyHref(href);
    if (!classified.ok) {
      linksSafe = false;
      techBlockers.push(
        finding(
          "unsafe-link",
          "blocker",
          "Article content contains an unsafe or disallowed link.",
          "content",
          classified.evidence
        )
      );
      break;
    }
  }
  checks.internalLinksSafe = linksSafe;
  checks.safeHtml = safeHtml && linksSafe;

  if (candidate.faqs) {
    if (candidate.faqs.length > MAX_AUTONOMOUS_BLOG_FAQS) {
      techBlockers.push(
        finding(
          "faq-count-exceeded",
          "blocker",
          `FAQ count exceeds autonomous maximum (${MAX_AUTONOMOUS_BLOG_FAQS}).`,
          "faqs",
          `Received ${candidate.faqs.length} FAQ entries.`
        )
      );
    }
    for (let i = 0; i < candidate.faqs.length; i += 1) {
      const faq = candidate.faqs[i];
      const q = String(faq?.question || "").trim();
      const a = String(faq?.answer || "").trim();
      if (!q || !a) {
        techBlockers.push(
          finding(
            "faq-incomplete",
            "blocker",
            "Every FAQ entry requires a non-empty question and answer.",
            "faqs",
            `FAQ index ${i} is incomplete.`
          )
        );
        break;
      }
      if (q.length > MAX_FAQ_FIELD_CHARS || a.length > MAX_FAQ_FIELD_CHARS) {
        techBlockers.push(
          finding(
            "faq-field-too-large",
            "blocker",
            "FAQ question/answer exceeds technical size bound.",
            "faqs",
            `FAQ index ${i} exceeds ${MAX_FAQ_FIELD_CHARS} characters.`
          )
        );
        break;
      }
      if (UNSAFE_TAG_RE.test(q) || UNSAFE_TAG_RE.test(a)) {
        techBlockers.push(
          finding(
            "faq-unsafe-html",
            "blocker",
            "FAQ values must not contain unsafe active HTML.",
            "faqs",
            `FAQ index ${i} contains unsafe markup.`
          )
        );
        break;
      }
    }
  }

  // 4) Substantive content (editorial policy — not a Google ranking factor)
  const plain = stripHtml(candidate.content);
  let substantive = true;
  if (!plain) {
    substantive = false;
    contentBlockers.push(
      finding(
        "content-below-editorial-floor",
        "blocker",
        "Article body is empty after HTML strip.",
        "content",
        "Plain-text length is 0."
      )
    );
  } else if (PLACEHOLDER_PLAIN.test(plain)) {
    substantive = false;
    contentBlockers.push(
      finding(
        "content-placeholder",
        "blocker",
        "Article body looks like placeholder-only content.",
        "content",
        `Matched placeholder pattern: ${plain.slice(0, 80)}`
      )
    );
  } else if (plain.length < policy.minBodyTextChars) {
    substantive = false;
    contentBlockers.push(
      finding(
        "content-below-editorial-floor",
        "blocker",
        "Article body is below the configured editorial automation floor.",
        "content",
        `${plain.length} plain-text chars < minBodyTextChars ${policy.minBodyTextChars}. Editorial floor only — not a Google ranking factor.`
      )
    );
  }
  checks.substantiveContent = substantive;

  // 5) Featured image autonomous gate (hard; separate from diagnoseBlog review)
  const featuredUrlOk = !!String(candidate.featured_image || "").trim();
  const featuredReady = featuredUrlOk && candidate.mediaState.featuredImageReady === true;
  checks.featuredImageReady = featuredReady;
  if (!featuredReady) {
    mediaBlockers.push(
      finding(
        "featured-image-not-ready",
        "blocker",
        "Autonomous publication requires a featured image URL and mediaState.featuredImageReady=true.",
        "featured_image",
        `urlBlank=${!featuredUrlOk}; featuredImageReady=${String(
          candidate.mediaState.featuredImageReady
        )}`
      )
    );
  }

  // 6) Existing SEO diagnostics — synthetic published/active evaluation
  const normalized = normalizeBlogDiagnosticRow({
    id: selfId != null ? selfId : 0,
    title: candidate.title,
    slug: candidate.slug,
    status: "published",
    active: 1,
    meta_title: candidate.meta_title,
    meta_description: candidate.meta_description,
    focus_keyword: candidate.focus_keyword ?? "",
    canonical_url: candidate.canonical_url ?? "",
    featured_image: candidate.featured_image,
    excerpt: candidate.excerpt,
    content: candidate.content,
  });
  const existingSeoIssues = diagnoseBlog(normalized);

  let canonicalSafe = true;
  for (const issue of existingSeoIssues) {
    const mapped = finding(
      ruleCodeFromSeoIssue(issue),
      issue.severity === "needs-attention" ? "blocker" : "warning",
      issue.message,
      issue.field,
      issue.evidence
    );
    if (issue.severity === "needs-attention") {
      seoBlockers.push(mapped);
      if (String(issue.id).includes("canonical-review") || issue.field === "canonical_url") {
        canonicalSafe = false;
      }
    } else {
      warnings.push(mapped);
    }
  }
  if (!existingSeoIssues.some((i) => String(i.id).includes("canonical-review"))) {
    canonicalSafe = true;
  }
  checks.canonicalSafe = canonicalSafe;

  const blockers = dedupeFindings([
    ...gateBlockers,
    ...dupBlockers,
    ...techBlockers,
    ...contentBlockers,
    ...mediaBlockers,
    ...seoBlockers,
  ]);
  const orderedWarnings = dedupeFindings(warnings);

  return {
    verdict: blockers.length === 0 ? "PASS" : "HOLD",
    blockers,
    warnings: orderedWarnings,
    existingSeoIssues,
    checks,
  };
}

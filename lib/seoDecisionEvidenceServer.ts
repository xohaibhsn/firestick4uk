/**
 * SERVER ONLY — AB-5M SEO decision evidence persistence.
 *
 * Insert/read decision history and measurement outcomes.
 * Table must exist via scripts/migrate-seo-decision-evidence.js — no runtime DDL.
 *
 * Duplicate outcome policy:
 * - first write for (decision_id, window_days) inserts
 * - identical replay (same evidence_mode + outcome_evidence JSON) → success, no mutation
 * - different replay → conflict (no overwrite)
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import {
  MAX_BASELINE_EVIDENCE_CHARS,
  MAX_OUTCOME_EVIDENCE_CHARS,
  canonicalOutcomeEvidenceKey,
  parseSeoDecisionEvidenceInput,
  parseSeoDecisionOutcomeInput,
  parseSeoEvidenceJson,
  parseStringArrayJson,
  serializeCanonicalEvidenceJson,
  serializeStringArrayJson,
  type SeoDecisionEvidenceInput,
  type SeoDecisionEvidenceRecord,
  type SeoDecisionOutcomeInput,
  type SeoDecisionOutcomeRecord,
  type SeoDecisionOutcomeWindow,
  type SeoDecisionEvidenceMode,
} from "@/lib/seoDecisionEvidence";
import type { BlogNextBestAction } from "@/lib/blogOpportunityEngine";
import type {
  BlogPriorityClass,
  BlogPriorityTier,
  BlogPriorityUncertainty,
  BlogRelativeActionCost,
} from "@/lib/blogOpportunityPrioritizer";

type Queryable = {
  query: typeof pool.query;
};

export class SeoDecisionEvidenceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SeoDecisionEvidenceError";
    this.status = status;
    this.code = code;
  }
}

function formatDt(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v.trim()) {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
    return v;
  }
  return String(v || "");
}

function mysqlDateTime(iso: string): string {
  // Store UTC wall time as YYYY-MM-DD HH:mm:ss.sss
  const d = new Date(iso);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(d.getUTCMilliseconds(), 3)}`
  );
}

function mapDecisionRow(r: RowDataPacket): SeoDecisionEvidenceRecord {
  return {
    id: Number(r.id),
    opportunityId: String(r.opportunity_id),
    topic: r.topic == null ? null : String(r.topic),
    intent: r.intent == null ? null : String(r.intent),
    decisionAction: String(r.decision_action) as BlogNextBestAction,
    targetEntityId:
      r.target_entity_id == null ? null : Number(r.target_entity_id),
    targetUrl: r.target_url == null ? null : String(r.target_url),
    schedulerEligible: Number(r.scheduler_eligible) === 1,
    decisionReasonCodes: parseStringArrayJson(
      r.decision_reason_codes
    ) as SeoDecisionEvidenceRecord["decisionReasonCodes"],
    decisionExplanation: String(r.decision_explanation || ""),
    priorityTier: Number(r.priority_tier) as BlogPriorityTier,
    priorityClass: String(r.priority_class) as BlogPriorityClass,
    uncertainty: String(r.uncertainty) as BlogPriorityUncertainty,
    uncertaintyReasons: parseStringArrayJson(r.uncertainty_reasons),
    estimatedCost: String(r.estimated_cost) as BlogRelativeActionCost,
    evidenceMode: String(r.evidence_mode) as SeoDecisionEvidenceMode,
    baselineEvidence: parseSeoEvidenceJson(r.baseline_evidence),
    decidedAt: formatDt(r.decided_at),
    createdAt: formatDt(r.created_at),
  };
}

function mapOutcomeRow(r: RowDataPacket): SeoDecisionOutcomeRecord {
  return {
    id: Number(r.id),
    decisionId: Number(r.decision_id),
    windowDays: Number(r.window_days) as SeoDecisionOutcomeWindow,
    evidenceMode: String(r.evidence_mode) as SeoDecisionEvidenceMode,
    outcomeEvidence: parseSeoEvidenceJson(r.outcome_evidence),
    observedAt: formatDt(r.observed_at),
    createdAt: formatDt(r.created_at),
  };
}

function isDupEntry(err: unknown): boolean {
  const e = err as { code?: string; errno?: number };
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062;
}

/** Append one historical decision record. opportunity_id is never unique. */
export async function insertSeoDecisionEvidence(
  rawInput: unknown,
  conn: Queryable = pool
): Promise<SeoDecisionEvidenceRecord> {
  const parsed = parseSeoDecisionEvidenceInput(rawInput);
  if (!parsed.ok) {
    throw new SeoDecisionEvidenceError(400, parsed.code, parsed.message);
  }
  const input: SeoDecisionEvidenceInput = parsed.value;

  const baselineSer = serializeCanonicalEvidenceJson(
    input.baselineEvidence,
    MAX_BASELINE_EVIDENCE_CHARS
  );
  if (!baselineSer.ok) {
    throw new SeoDecisionEvidenceError(
      400,
      "invalid_baseline_evidence",
      baselineSer.message
    );
  }

  const decidedAtIso = input.decidedAt || new Date().toISOString();

  const [result] = await conn.query<ResultSetHeader>(
    `INSERT INTO seo_decision_evidence
      (opportunity_id, topic, intent, decision_action,
       target_entity_id, target_url, scheduler_eligible,
       decision_reason_codes, decision_explanation,
       priority_tier, priority_class, uncertainty, uncertainty_reasons,
       estimated_cost, evidence_mode, baseline_evidence, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.opportunityId,
      input.topic,
      input.intent,
      input.decisionAction,
      input.targetEntityId,
      input.targetUrl,
      input.schedulerEligible ? 1 : 0,
      serializeStringArrayJson(input.decisionReasonCodes),
      input.decisionExplanation,
      input.priorityTier,
      input.priorityClass,
      input.uncertainty,
      serializeStringArrayJson(input.uncertaintyReasons || []),
      input.estimatedCost,
      input.evidenceMode,
      baselineSer.json,
      mysqlDateTime(decidedAtIso),
    ]
  );

  const id = Number(result.insertId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new SeoDecisionEvidenceError(
      500,
      "insert_failed",
      "Decision insert did not return an id."
    );
  }

  const row = await getSeoDecisionEvidenceById(id, conn);
  if (!row) {
    throw new SeoDecisionEvidenceError(
      500,
      "insert_failed",
      "Decision row missing after insert."
    );
  }
  return row;
}

export async function getSeoDecisionEvidenceById(
  id: number,
  conn: Queryable = pool
): Promise<SeoDecisionEvidenceRecord | null> {
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, opportunity_id, topic, intent, decision_action,
            target_entity_id, target_url, scheduler_eligible,
            decision_reason_codes, decision_explanation,
            priority_tier, priority_class, uncertainty, uncertainty_reasons,
            estimated_cost, evidence_mode, baseline_evidence,
            decided_at, created_at
     FROM seo_decision_evidence
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row ? mapDecisionRow(row) : null;
}

export async function listSeoDecisionEvidenceByOpportunityId(
  opportunityId: string,
  conn: Queryable = pool
): Promise<SeoDecisionEvidenceRecord[]> {
  if (typeof opportunityId !== "string") return [];
  const id = opportunityId.trim();
  if (!id) return [];

  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, opportunity_id, topic, intent, decision_action,
            target_entity_id, target_url, scheduler_eligible,
            decision_reason_codes, decision_explanation,
            priority_tier, priority_class, uncertainty, uncertainty_reasons,
            estimated_cost, evidence_mode, baseline_evidence,
            decided_at, created_at
     FROM seo_decision_evidence
     WHERE opportunity_id = ?
     ORDER BY decided_at DESC, id DESC`,
    [id]
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(mapDecisionRow);
}

/**
 * Insert one measurement outcome for a decision window.
 * See file header for duplicate conflict / identical-replay policy.
 */
export async function insertSeoDecisionOutcome(
  rawInput: unknown,
  conn: Queryable = pool
): Promise<SeoDecisionOutcomeRecord> {
  const parsed = parseSeoDecisionOutcomeInput(rawInput);
  if (!parsed.ok) {
    throw new SeoDecisionEvidenceError(400, parsed.code, parsed.message);
  }
  const input: SeoDecisionOutcomeInput = parsed.value;

  const parent = await getSeoDecisionEvidenceById(input.decisionId, conn);
  if (!parent) {
    throw new SeoDecisionEvidenceError(
      404,
      "decision_not_found",
      "Decision not found for outcome."
    );
  }

  const outcomeSer = serializeCanonicalEvidenceJson(
    input.outcomeEvidence,
    MAX_OUTCOME_EVIDENCE_CHARS
  );
  if (!outcomeSer.ok) {
    throw new SeoDecisionEvidenceError(
      400,
      "invalid_outcome_evidence",
      outcomeSer.message
    );
  }

  try {
    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO seo_decision_outcomes
        (decision_id, window_days, evidence_mode, outcome_evidence, observed_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.decisionId,
        input.windowDays,
        input.evidenceMode,
        outcomeSer.json,
        mysqlDateTime(input.observedAt),
      ]
    );
    const id = Number(result.insertId);
    const row = await getSeoDecisionOutcomeById(id, conn);
    if (!row) {
      throw new SeoDecisionEvidenceError(
        500,
        "insert_failed",
        "Outcome row missing after insert."
      );
    }
    return row;
  } catch (err) {
    if (!isDupEntry(err)) throw err;

    const existing = await getSeoDecisionOutcomeByDecisionWindow(
      input.decisionId,
      input.windowDays,
      conn
    );
    if (!existing) {
      throw new SeoDecisionEvidenceError(
        409,
        "outcome_conflict",
        "Outcome window already exists but could not be loaded."
      );
    }

    const existingKey = canonicalOutcomeEvidenceKey(
      existing.evidenceMode,
      existing.outcomeEvidence
    );
    const incomingKey = canonicalOutcomeEvidenceKey(
      input.evidenceMode,
      input.outcomeEvidence ?? null
    );
    if (existingKey === incomingKey) {
      // Identical replay — success, no mutation.
      return existing;
    }

    throw new SeoDecisionEvidenceError(
      409,
      "outcome_conflict",
      "Outcome window already recorded with different evidence; overwrite refused."
    );
  }
}

async function getSeoDecisionOutcomeById(
  id: number,
  conn: Queryable = pool
): Promise<SeoDecisionOutcomeRecord | null> {
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, decision_id, window_days, evidence_mode,
            outcome_evidence, observed_at, created_at
     FROM seo_decision_outcomes
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row ? mapOutcomeRow(row) : null;
}

export async function getSeoDecisionOutcomeByDecisionWindow(
  decisionId: number,
  windowDays: SeoDecisionOutcomeWindow,
  conn: Queryable = pool
): Promise<SeoDecisionOutcomeRecord | null> {
  if (!Number.isFinite(decisionId) || decisionId <= 0) return null;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, decision_id, window_days, evidence_mode,
            outcome_evidence, observed_at, created_at
     FROM seo_decision_outcomes
     WHERE decision_id = ? AND window_days = ?
     LIMIT 1`,
    [decisionId, windowDays]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row ? mapOutcomeRow(row) : null;
}

export async function listSeoDecisionOutcomesByDecisionId(
  decisionId: number,
  conn: Queryable = pool
): Promise<SeoDecisionOutcomeRecord[]> {
  if (!Number.isFinite(decisionId) || !Number.isInteger(decisionId) || decisionId <= 0) {
    return [];
  }
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, decision_id, window_days, evidence_mode,
            outcome_evidence, observed_at, created_at
     FROM seo_decision_outcomes
     WHERE decision_id = ?
     ORDER BY window_days ASC, id ASC`,
    [decisionId]
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(mapOutcomeRow);
}

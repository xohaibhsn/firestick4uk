/**
 * Narrow mysql2 decoding for seasonal DATETIME columns.
 *
 * mysql2 default: DATETIME → JavaScript Date using the process local timezone,
 * which shifts the stored UTC wall clock. Seasonal windows must be read as the
 * raw UTC SQL string BEFORE that conversion.
 *
 * Scope: only season_starts_at / season_ends_at. Legacy order/blog/audit
 * timestamps keep default mysql2 Date behavior.
 *
 * Contract: exactly ONE query per invocation with typeCast. Failures propagate
 * to the caller — never silently retry without the decoder.
 */
import type { Pool, PoolConnection, QueryResult, FieldPacket } from "mysql2/promise";

export const SEASONAL_DATETIME_COLUMN_NAMES = new Set([
  "season_starts_at",
  "season_ends_at",
]);

type MysqlField = {
  type?: number | string;
  name?: string;
  orgName?: string;
  string: () => string | null;
};

/** mysql2 MYSQL_TYPE_DATETIME = 12, TIMESTAMP = 7 */
function isDateTimeLike(field: MysqlField): boolean {
  const t = field.type;
  if (t === 12 || t === 7) return true;
  if (typeof t === "string") {
    const u = t.toUpperCase();
    return u === "DATETIME" || u === "TIMESTAMP";
  }
  return false;
}

/**
 * mysql2 typeCast: return seasonal DATETIME/TIMESTAMP as unambiguous UTC SQL strings.
 * All other fields use default decoding (next()).
 */
export function seasonalDatetimeTypeCast(field: MysqlField, next: () => unknown): unknown {
  const name = String(field.name || field.orgName || "");
  if (SEASONAL_DATETIME_COLUMN_NAMES.has(name) && isDateTimeLike(field)) {
    const raw = field.string();
    return raw == null || raw === "" ? null : String(raw);
  }
  return next();
}

export type Queryable = {
  query: Pool["query"] | PoolConnection["query"];
};

export type SeasonalQueryOptions = {
  sql: string;
  values?: unknown[];
  typeCast: typeof seasonalDatetimeTypeCast;
};

/**
 * Run a single mysql2 query with seasonal DATETIME columns decoded as UTC SQL strings.
 * Propagates the original query failure. Never retries without typeCast.
 */
export async function queryWithSeasonalUtc<T extends QueryResult = QueryResult>(
  db: Queryable,
  sql: string,
  params?: unknown[]
): Promise<[T, FieldPacket[]]> {
  const q = db.query as (options: SeasonalQueryOptions) => Promise<[T, FieldPacket[]]>;
  return q.call(db, {
    sql,
    values: params,
    typeCast: seasonalDatetimeTypeCast,
  });
}

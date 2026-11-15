/**
 * Shared admin order list/filter helpers (no request-time DDL).
 */
import {
  isPublicPaymentMethod,
  paymentFilterStorageValues,
  type PublicPaymentMethod,
} from "./paymentMethod";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Cancel reason codes stored in orders.cancel_reason (VARCHAR(50)). */
export const CANCEL_REASONS = [
  "customer_cancelled",
  "cod_refused",
  "no_response",
  "duplicate_test",
  "payment_not_received",
  "other",
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  customer_cancelled: "Customer cancelled",
  cod_refused: "COD refused / not collected",
  no_response: "No response from customer",
  duplicate_test: "Duplicate / test order",
  payment_not_received: "Payment not received",
  other: "Other",
};

export function isCancelReason(value: unknown): value is CancelReason {
  return (
    typeof value === "string" &&
    (CANCEL_REASONS as readonly string[]).includes(value)
  );
}

export function cancelReasonLabel(code: unknown): string {
  if (!isCancelReason(code)) return "";
  return CANCEL_REASON_LABELS[code];
}

/** Admin filter vocabulary (public contract). Bank filter dual-matches storage. */
export const PAYMENT_METHODS = ["bank", "cod"] as const;
export const EXPORT_MAX = 5000;

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Strict YYYY-MM-DD real calendar date (no JS Date normalization of invalid days). */
export function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const daysInMonth = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Add calendar days to a validated YYYY-MM-DD (Gregorian, UTC-date arithmetic). */
export function addCalendarDaysYmd(ymd: string, days: number): string | null {
  if (!isValidCalendarDate(ymd)) return null;
  if (!Number.isInteger(days)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const ms = Date.UTC(y, m - 1, d + days);
  if (!Number.isFinite(ms)) return null;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Europe/London midnight (00:00:00) for a calendar day → UTC SQL.
 * Tries GMT (+00:00) and BST (+01:00); keeps the offset that round-trips via Intl.
 */
export function londonDayStartUtcSql(ymd: string): string | null {
  if (!isValidCalendarDate(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(5, 7));
  const da = Number(ymd.slice(8, 10));
  for (const offsetMinutes of [0, 60]) {
    const asUtc = Date.UTC(y, mo - 1, da, 0, 0, 0);
    const candidateMs = asUtc - offsetMinutes * 60_000;
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    });
    const parts = dtf.formatToParts(new Date(candidateMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const wall = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
    const tzn = get("timeZoneName") || "";
    let resolvedOffset = 0;
    const m = tzn.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      resolvedOffset = sign * (Number(m[2]) * 60 + Number(m[3] || 0));
    } else if (!/GMT|UTC/i.test(tzn)) {
      continue;
    }
    if (wall === `${ymd}T00:00:00` && resolvedOffset === offsetMinutes) {
      const d = new Date(candidateMs);
      return (
        `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
        `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
      );
    }
  }
  return null;
}

/** UTC SQL "YYYY-MM-DD HH:mm:ss" → UTC epoch seconds. */
export function utcSqlToEpochSeconds(utcSql: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(utcSql).trim());
  if (!m) return null;
  const ms = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

export type OrderFilters = {
  q: string;
  status: string | null;
  paymentMethod: PublicPaymentMethod | null;
  /** Inclusive London calendar day start as UTC SQL (created_at lower bound). */
  dateFrom: string | null;
  /** Exclusive London calendar day end as UTC SQL (day after date_to at 00:00 London). */
  dateTo: string | null;
};

export function parseOrderFilters(query: Record<string, unknown> | any): {
  filters: OrderFilters;
  error?: string;
} {
  const empty = { q: "", status: null, paymentMethod: null, dateFrom: null, dateTo: null };
  const q = String(query.q || "").trim().slice(0, 200);
  const statusRaw = String(query.status || "").trim().toLowerCase();
  const paymentRaw = String(query.payment_method || "").trim().toLowerCase();

  let status: string | null = null;
  if (statusRaw && statusRaw !== "all") {
    if (!(ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
      return { filters: empty, error: "Invalid status" };
    }
    status = statusRaw;
  }

  let paymentMethod: PublicPaymentMethod | null = null;
  if (paymentRaw && paymentRaw !== "all") {
    if (!isPublicPaymentMethod(paymentRaw)) {
      return { filters: empty, error: "Invalid payment_method" };
    }
    paymentMethod = paymentRaw;
  }

  const dateFromRaw = String(query.date_from || "").trim();
  const dateToRaw = String(query.date_to || "").trim();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (dateFromRaw) {
    if (!isValidCalendarDate(dateFromRaw)) {
      return { filters: empty, error: "Invalid date_from" };
    }
    dateFrom = londonDayStartUtcSql(dateFromRaw);
    if (!dateFrom) {
      return { filters: empty, error: "Invalid date_from" };
    }
  }
  if (dateToRaw) {
    if (!isValidCalendarDate(dateToRaw)) {
      return { filters: empty, error: "Invalid date_to" };
    }
    const nextDay = addCalendarDaysYmd(dateToRaw, 1);
    if (!nextDay) {
      return { filters: empty, error: "Invalid date_to" };
    }
    dateTo = londonDayStartUtcSql(nextDay);
    if (!dateTo) {
      return { filters: empty, error: "Invalid date_to" };
    }
  }

  if (dateFromRaw && dateToRaw && dateFromRaw > dateToRaw) {
    return { filters: empty, error: "date_from cannot be after date_to" };
  }

  return { filters: { q, status, paymentMethod, dateFrom, dateTo } };
}

/**
 * CSV cell escape with spreadsheet formula-injection defense.
 * Does not trim the value; inspects first meaningful (non space/tab/CR/LF) character.
 */
export function csvEscapeCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    break;
  }
  const firstMeaningful = i < s.length ? s[i] : "";
  if (
    firstMeaningful === "=" ||
    firstMeaningful === "+" ||
    firstMeaningful === "-" ||
    firstMeaningful === "@"
  ) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildOrderWhere(
  filters: OrderFilters,
  alias = "o"
): { sql: string; params: any[] } {
  const where: string[] = [];
  const params: any[] = [];
  const col = (name: string) => (alias ? `${alias}.${name}` : name);

  if (filters.q) {
    const like = `%${filters.q}%`;
    where.push(
      `(${col("order_id")} LIKE ? OR ${col("customer_name")} LIKE ? OR ${col("customer_email")} LIKE ? OR ${col("customer_phone")} LIKE ? OR ${col("postcode")} LIKE ? OR ${col("payment_reference")} LIKE ?)`
    );
    params.push(like, like, like, like, like, like);
  }
  if (filters.status) {
    where.push(`${col("status")} = ?`);
    params.push(filters.status);
  }
  if (filters.paymentMethod) {
    const storageValues = paymentFilterStorageValues(filters.paymentMethod);
    if (storageValues.length === 1) {
      where.push(`${col("payment_method")} = ?`);
      params.push(storageValues[0]);
    } else {
      const placeholders = storageValues.map(() => "?").join(", ");
      where.push(`${col("payment_method")} IN (${placeholders})`);
      params.push(...storageValues);
    }
  }
  // London calendar days → UTC bounds. Use UNIX_TIMESTAMP so session time_zone
  // cannot mis-interpret bound strings against TIMESTAMP created_at.
  if (filters.dateFrom) {
    const epoch = utcSqlToEpochSeconds(filters.dateFrom);
    if (epoch != null) {
      where.push(`UNIX_TIMESTAMP(${col("created_at")}) >= ?`);
      params.push(epoch);
    }
  }
  if (filters.dateTo) {
    const epoch = utcSqlToEpochSeconds(filters.dateTo);
    if (epoch != null) {
      where.push(`UNIX_TIMESTAMP(${col("created_at")}) < ?`);
      params.push(epoch);
    }
  }

  return {
    sql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export async function itemsListForOrderIds(
  pool: { query: (sql: string, params?: any[]) => Promise<any> },
  orderIds: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!orderIds.length) return map;
  const placeholders = orderIds.map(() => "?").join(",");
  const [rows]: any = await pool.query(
    `SELECT order_id, GROUP_CONCAT(product_name ORDER BY id SEPARATOR ' + ') AS items_list
     FROM order_items
     WHERE order_id IN (${placeholders})
     GROUP BY order_id`,
    orderIds
  );
  for (const r of Array.isArray(rows) ? rows : []) {
    map[String(r.order_id)] = r.items_list || "";
  }
  return map;
}

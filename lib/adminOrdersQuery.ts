/**
 * Shared admin order list/filter helpers (no request-time DDL).
 */
export const ORDER_STATUSES = ["pending", "confirmed", "dispatched", "delivered"] as const;
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

function parseDateBound(raw: unknown, endOfDay: boolean): string | null {
  const s = String(raw || "").trim();
  if (!isValidCalendarDate(s)) return null;
  return endOfDay ? `${s} 23:59:59` : `${s} 00:00:00`;
}

export type OrderFilters = {
  q: string;
  status: string | null;
  paymentMethod: string | null;
  dateFrom: string | null;
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

  let paymentMethod: string | null = null;
  if (paymentRaw && paymentRaw !== "all") {
    if (!(PAYMENT_METHODS as readonly string[]).includes(paymentRaw)) {
      return { filters: empty, error: "Invalid payment_method" };
    }
    paymentMethod = paymentRaw;
  }

  const dateFromRaw = String(query.date_from || "").trim();
  const dateToRaw = String(query.date_to || "").trim();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  if (dateFromRaw) {
    dateFrom = parseDateBound(dateFromRaw, false);
    if (!dateFrom) {
      return { filters: empty, error: "Invalid date_from" };
    }
  }
  if (dateToRaw) {
    dateTo = parseDateBound(dateToRaw, true);
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
    where.push(`${col("payment_method")} = ?`);
    params.push(filters.paymentMethod);
  }
  if (filters.dateFrom) {
    where.push(`${col("created_at")} >= ?`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push(`${col("created_at")} <= ?`);
    params.push(filters.dateTo);
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

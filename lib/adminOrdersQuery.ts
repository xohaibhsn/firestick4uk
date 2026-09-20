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

function parseDateBound(raw: unknown, endOfDay: boolean): string | null {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
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
  const q = String(query.q || "").trim().slice(0, 200);
  const statusRaw = String(query.status || "").trim().toLowerCase();
  const paymentRaw = String(query.payment_method || "").trim().toLowerCase();

  let status: string | null = null;
  if (statusRaw && statusRaw !== "all") {
    if (!(ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
      return {
        filters: { q: "", status: null, paymentMethod: null, dateFrom: null, dateTo: null },
        error: "Invalid status",
      };
    }
    status = statusRaw;
  }

  let paymentMethod: string | null = null;
  if (paymentRaw && paymentRaw !== "all") {
    if (!(PAYMENT_METHODS as readonly string[]).includes(paymentRaw)) {
      return {
        filters: { q: "", status: null, paymentMethod: null, dateFrom: null, dateTo: null },
        error: "Invalid payment_method",
      };
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
      return {
        filters: { q: "", status: null, paymentMethod: null, dateFrom: null, dateTo: null },
        error: "Invalid date_from",
      };
    }
  }
  if (dateToRaw) {
    dateTo = parseDateBound(dateToRaw, true);
    if (!dateTo) {
      return {
        filters: { q: "", status: null, paymentMethod: null, dateFrom: null, dateTo: null },
        error: "Invalid date_to",
      };
    }
  }

  return { filters: { q, status, paymentMethod, dateFrom, dateTo } };
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

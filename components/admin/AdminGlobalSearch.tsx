"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AdminSearchTarget = {
  tab: string;
  kind:
    | "order"
    | "customer"
    | "product"
    | "blog"
    | "faq"
    | "review"
    | "cms_find";
  id?: string | number;
  email?: string;
  query?: string;
};

type Props = {
  onNavigate: (target: AdminSearchTarget) => void;
};

type OrderHit = {
  order_id?: string | number;
  status?: string | null;
  created_at?: string | null;
  customer_initial?: string | null;
};
type CustomerHit = {
  display_name?: string | null;
  email_masked?: string | null;
  /** Optional — only used if the API happens to return it. */
  email?: string | null;
};
type ProductHit = {
  id?: string | number;
  name?: string | null;
  slug?: string | null;
};
type BlogHit = {
  id?: string | number;
  title?: string | null;
  status?: string | null;
};
type FaqHit = { id?: string | number; question?: string | null };
type ReviewHit = {
  id?: string | number;
  name?: string | null;
  status?: string | null;
};

type SearchGroups = {
  orders?: OrderHit[];
  customers?: CustomerHit[];
  products?: ProductHit[];
  blog?: BlogHit[];
  faqs?: FaqHit[];
  reviews?: ReviewHit[];
};

type SearchResponse = { groups?: SearchGroups } & Record<string, unknown>;

type Row = {
  key: string;
  group: string;
  title: string;
  meta?: string;
  target: AdminSearchTarget;
};

const ACCENT = "#5B21B6";
const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/** True for Ctrl+K / Cmd+K (no Alt/Shift). */
export function isAdminSearchHotkey(e: KeyboardEvent): boolean {
  return (
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    !e.shiftKey &&
    typeof e.key === "string" &&
    e.key.toLowerCase() === "k"
  );
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function shortDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function join(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && String(p).trim()).join(" · ");
}

function buildRows(groups: SearchGroups | undefined): Row[] {
  if (!groups) return [];
  const rows: Row[] = [];

  asArray<OrderHit>(groups.orders).forEach((o, i) => {
    if (o?.order_id == null) return;
    rows.push({
      key: `order:${o.order_id}:${i}`,
      group: "Orders",
      title: `#${o.order_id}`,
      meta: join([o.status, shortDate(o.created_at), o.customer_initial]),
      target: { tab: "orders", kind: "order", id: o.order_id },
    });
  });

  asArray<CustomerHit>(groups.customers).forEach((c, i) => {
    const label = c?.display_name || c?.email_masked || "";
    if (!label) return;
    rows.push({
      key: `customer:${c.email_masked ?? c.display_name}:${i}`,
      group: "Customers",
      title: c.display_name || c.email_masked || "Customer",
      meta: c.display_name ? c.email_masked || undefined : undefined,
      target: {
        tab: "customers",
        kind: "customer",
        query: String(c.display_name || "").trim() || undefined,
        email: c.email || undefined,
      },
    });
  });

  asArray<ProductHit>(groups.products).forEach((p, i) => {
    if (p?.id == null) return;
    rows.push({
      key: `product:${p.id}:${i}`,
      group: "Products",
      title: p.name || `Product ${p.id}`,
      meta: p.slug || undefined,
      target: { tab: "products", kind: "product", id: p.id },
    });
  });

  asArray<BlogHit>(groups.blog).forEach((b, i) => {
    if (b?.id == null) return;
    rows.push({
      key: `blog:${b.id}:${i}`,
      group: "Blog",
      title: b.title || `Post ${b.id}`,
      meta: b.status || undefined,
      target: { tab: "blog", kind: "blog", id: b.id },
    });
  });

  asArray<FaqHit>(groups.faqs).forEach((f, i) => {
    if (f?.id == null) return;
    rows.push({
      key: `faq:${f.id}:${i}`,
      group: "FAQs",
      title: f.question || `FAQ ${f.id}`,
      target: { tab: "faqadmin", kind: "faq", id: f.id },
    });
  });

  asArray<ReviewHit>(groups.reviews).forEach((r, i) => {
    if (r?.id == null) return;
    rows.push({
      key: `review:${r.id}:${i}`,
      group: "Reviews",
      title: r.name || `Review ${r.id}`,
      meta: r.status || undefined,
      target: { tab: "reviews", kind: "review", id: r.id },
    });
  });

  return rows;
}

export default function AdminGlobalSearch({ onNavigate }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [active, setActive] = useState(0);

  const trimmed = q.trim();
  const searchable = trimmed.length >= MIN_CHARS;

  // Global Ctrl/Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isAdminSearchHotkey(e)) return;
      e.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside pointer
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!searchable) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin-search?q=${encodeURIComponent(trimmed)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            signal: ctrl.signal,
          }
        );
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const json = (await res.json()) as SearchResponse;
        if (ctrl.signal.aborted) return;
        setData(json && typeof json === "object" ? json : {});
        setLoading(false);
      } catch (err) {
        if (ctrl.signal.aborted || (err as Error)?.name === "AbortError") return;
        setData(null);
        setError(err instanceof Error ? err.message : "Search failed");
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed, searchable]);

  const resultRows = useMemo(() => buildRows(data?.groups), [data]);

  const rows: Row[] = useMemo(() => {
    if (!searchable) return [];
    return [
      ...resultRows,
      {
        key: "cms_find",
        group: "",
        title: `Search CMS texts for '${trimmed}'`,
        target: { tab: "pages", kind: "cms_find", query: trimmed },
      },
    ];
  }, [resultRows, searchable, trimmed]);

  // Reset highlight when the list changes
  useEffect(() => {
    setActive(0);
  }, [resultRows, trimmed]);

  // Keep highlighted row in view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-admin-search-index="${active}"]`
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, rows]);

  const select = useCallback(
    (row: Row) => {
      onNavigate(row.target);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onNavigate]
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) select(row);
    }
  };

  const showPopover = open && (searchable || q.length > 0);
  const noResults =
    searchable && !loading && !error && data !== null && resultRows.length === 0;

  let lastGroup: string | null = null;

  return (
    <div
      ref={rootRef}
      data-testid="admin-global-search"
      style={{ position: "relative", width: "100%", maxWidth: 280 }}
    >
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPopover}
        aria-controls="admin-global-search-list"
        aria-autocomplete="list"
        aria-label="Search admin"
        placeholder="Search admin… (Ctrl+K)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        style={{
          width: "100%",
          padding: "6px 10px",
          border: "1px solid #DDD6FE",
          borderRadius: 8,
          fontSize: 12,
          outlineColor: ACCENT,
          background: "#fff",
        }}
      />

      {showPopover ? (
        <div
          id="admin-global-search-list"
          ref={listRef}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            width: "min(420px, 92vw)",
            maxHeight: 360,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #DDD6FE",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(91,33,182,0.12)",
            zIndex: 1000,
            fontSize: 12,
          }}
        >
          {!searchable ? (
            <div style={{ padding: "8px 10px", color: "#666" }}>
              Type at least {MIN_CHARS} characters…
            </div>
          ) : (
            <>
              {loading ? (
                <div
                  data-admin-search-loading="1"
                  style={{ padding: "8px 10px", color: "#666" }}
                >
                  Searching…
                </div>
              ) : null}
              {error ? (
                <div
                  data-admin-search-error="1"
                  role="alert"
                  style={{ padding: "8px 10px", color: "#B91C1C" }}
                >
                  {error}
                </div>
              ) : null}
              {noResults ? (
                <div
                  data-admin-search-empty="1"
                  style={{ padding: "8px 10px", color: "#666" }}
                >
                  No results
                </div>
              ) : null}

              {rows.map((row, idx) => {
                const header =
                  row.group && row.group !== lastGroup ? row.group : null;
                if (row.group) lastGroup = row.group;
                const isCms = row.target.kind === "cms_find";
                const isActive = idx === active;
                return (
                  <div key={row.key}>
                    {header ? (
                      <div
                        style={{
                          padding: "6px 10px 2px",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          color: ACCENT,
                        }}
                      >
                        {header}
                      </div>
                    ) : null}
                    <div
                      role="option"
                      aria-selected={isActive}
                      data-admin-search-item={row.target.kind}
                      data-admin-search-index={idx}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => select(row)}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                        padding: "6px 10px",
                        cursor: "pointer",
                        background: isActive ? "#F5F3FF" : "transparent",
                        borderLeft: `2px solid ${isActive ? ACCENT : "transparent"}`,
                        borderTop: isCms ? "1px solid #EDE9FE" : undefined,
                        color: isCms ? ACCENT : "#111",
                        fontWeight: isCms ? 600 : 500,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.title}
                      </span>
                      {row.meta ? (
                        <span
                          style={{
                            marginLeft: "auto",
                            flexShrink: 0,
                            color: "#888",
                            fontWeight: 400,
                          }}
                        >
                          {row.meta}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

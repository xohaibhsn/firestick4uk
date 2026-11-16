# Order idempotency (REPORT-ONLY DESIGN)

Status: **design only** — not implemented. No runtime code / no SQL execution in this task.

## Current protections

| Layer | Where | What it does |
|-------|-------|--------------|
| Client double-submit | `app/cart/page.tsx` `handleOrder` | `placing` state + `placingRef`; early return if already placing; buttons `disabled={placing …}`. |
| Order id entropy | `pages/api/orders.ts` `generateOrderId` | `ORD-` + `Date.now()` + 3-digit `randomInt(0,1000)` (fits `VARCHAR(20)`). |
| UNIQUE `order_id` | `app/lib/schema.sql` | `order_id VARCHAR(20) UNIQUE NOT NULL`. Migrate script does not re-assert UNIQUE on existing tables — live enforcement beyond schema intent: treat as intended. |
| Coupon atomicity | `pages/api/orders.ts` + `lib/orderPricing.ts` | Inside order TX: `SELECT … FOR UPDATE` on coupon, `evaluateLockedCoupon`, then `used_count = used_count + 1` before commit. |
| Pricing integrity | orders API | Client totals / item prices ignored; server recomputes. |
| Product eligibility | `lib/orderProductEligibility.ts` | Lock products `FOR UPDATE`; deny if not purchasable. |

**Not present today:** Idempotency-Key header, insert retry on `ER_DUP_ENTRY`, cross-tab server dedupe.

## Remaining failure modes

1. **Network retry after success** — browser/client times out after the server committed; user retries → **new** `order_id` → duplicate order + possible second coupon burn attempt (second may fail if limit=1, but stock/ops noise remains).
2. **Double tab / two devices** — `placingRef` is per page instance; two tabs can both POST.
3. **Slow responses** — user waits, navigates back, submits again with a fresh cart session.
4. **Same-ms id collision (1/1000)** — UNIQUE may 500 without regenerate-and-retry (orders catch → generic 500).
5. **Receipt upload path** — placing armed before upload; failure resets placing, but multi-tab still open.

## Proposal: Idempotency-Key from cart

### Client

- On each **checkout attempt** (first click that begins `handleOrder`), set  
  `idempotencyKey = crypto.randomUUID()` and keep it for retries of that attempt.
- Send header: `Idempotency-Key: <uuid>` on `POST /api/orders`.
- New attempt (user deliberately restarts checkout after a final error) → new UUID.

### Server

1. Require header for browser checkout (or accept missing during rollout → no dedupe).
2. Lookup by key before insert:
   - **Hit + completed order** → return **200** with the **original** `order_id` / public tracking payload (identical success shape). Do **not** re-charge coupon / re-insert.
   - **Hit + in-flight** (optional) → 409 `order_in_progress` or wait — start with completed-only map.
   - **Miss** → proceed; store key with new order in same TX.

### Schema (TEXT ONLY — not approved to run)

```text
OWNER RUNS AFTER BACKUP — NOT APPROVED

-- Option A: nullable UNIQUE column on orders
ALTER TABLE orders
  ADD COLUMN idempotency_key CHAR(36) NULL,
  ADD UNIQUE KEY uq_orders_idempotency_key (idempotency_key);

-- Option B: small side table (preferred if orders row shape is frozen)
CREATE TABLE IF NOT EXISTS order_idempotency_keys (
  idempotency_key CHAR(36) NOT NULL,
  order_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idempotency_key),
  UNIQUE KEY uq_order_idempotency_order_id (order_id),
  CONSTRAINT fk_order_idempotency_order
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Replay behaviour

| Case | Response |
|------|----------|
| Same key, order committed | `200` + original `order_id` (and safe public fields only) |
| Same key, prior request failed before commit | treat as miss; allow one create |
| Different key, same cart contents | **new** order (intentional second purchase) |
| Missing key (legacy) | current behaviour during rollout |

### Rollout

1. Deploy server accepting optional header + writing key when present (feature flag).
2. Deploy client sending UUID.
3. Owner runs DDL after backup (**not** part of this task).
4. Make header required for `/cart` origin; keep optional for vetted integrations.

### Rollback

1. Client stops sending header (or flag off).
2. Server ignores header.
3. DDL left in place (nullable UNIQUE / side table unused) or dropped in a later owner-approved migration.

### Tests (when implemented)

1. Two POSTs same Idempotency-Key → one INSERT; second returns same `order_id`.
2. Coupon `used_count` increments once.
3. Different keys → two orders.
4. Invalid / empty key → 400.
5. Harden-79 placing guard still blocks same-tab double click without needing the server.
6. No customer PII in idempotency logs (key + order_id only).

**Out of scope for MULTI-112:** implementation and any DDL execution.

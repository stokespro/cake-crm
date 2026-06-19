# Finance Revenue/Orders Rework — Cipher Build Spec

> Source of truth for this build. Locked decisions from COO (Joshua). Reviewed against live prod data.
> **Deploy gating: do NOT commit, push, or deploy. Leave all changes uncommitted for Stokely's review.**
> Push to `main` = auto-deploy to prod, so the human gates it.

## Locked decisions
- **Pipeline revenue:** scope to the SELECTED month by expected delivery date (`requested_delivery_date` within `[monthStart, nextMonthStart)`).
- **Revenue source: HYBRID** — use `SUM(order_items.line_total)` when the order HAS line items, else fall back to `orders.total_price`. (See "Why hybrid" below — 64 legacy orders imported 2026-02-20 carry header totals with zero line items = $176,940 of real revenue that would vanish on a hard switch.)
- **Delivery authority:** `delivered_at` is the SOLE source of truth for revenue-month attribution. Retire `actual_delivery_date` from the write path + UI (leave the physical column in place, just unused). Make `delivered_at` editable in the order sheet for back-dating.
- **Margin/COGS:** OUT of scope. Gross revenue only.
- **Pagination:** add `.range(0, 4999)` so the orders fetch never silently caps at 1000.
- **SKU status leak:** `getOrderSkus` (edit-order picker) must exclude discontinued SKUs.
- **total_price guard:** `saveOrder` recomputes `total_price = SUM(line_total)` server-side; never trust the client value.

## Why hybrid (data evidence — already verified, do not re-litigate)
- 331 delivered orders. 64 of them drift (stored total > line items) by a one-directional $176,940.
- Root cause confirmed: all 64 have ZERO `order_items` and were all created 2026-02-20 — the app-consolidation import. Their `total_price` is correct; line items simply don't exist for them.
- Therefore a hard switch to `SUM(line_total)` would zero out $176,940 of legacy revenue. Hybrid preserves it while making all current/future orders item-accurate.

---

## Task 1+2 (combined, single edit) — finance revenue query + hybrid computation
**File:** `actions/finance.ts`, function `getMonthSummary` (orders query ~663–679; revenue loop ~720–746)

1. Move `const nextMonth = incrementMonth(month)` UP to before the `Promise.all` so it's available in the query.
2. Replace the orders query with a month-scoped query that also joins line items:
```ts
supabase
  .from('orders')
  .select(`
    id, order_number, status, total_price, delivered_at, requested_delivery_date,
    customers(business_name),
    order_items(line_total)
  `)
  .or(
    `and(status.eq.delivered,delivered_at.gte.${month},delivered_at.lt.${nextMonth}),` +
    `and(status.in.(confirmed,packed),requested_delivery_date.gte.${month},requested_delivery_date.lt.${nextMonth})`
  )
  .order('requested_delivery_date', { ascending: true })
  .range(0, 4999)
```
3. Revenue loop — HYBRID per order:
```ts
for (const order of ordersData || []) {
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const customerName = customer?.business_name ?? 'Unknown'

  const items = (order.order_items ?? []) as { line_total: number | null }[]
  const itemsTotal = items.reduce((s, i) => s + (i.line_total ?? 0), 0)
  // HYBRID: line items when present, else legacy header total
  const orderRevenue = items.length > 0 ? itemsTotal : (order.total_price ?? 0)

  orderInputs.push({
    id: order.id,
    order_number: String(order.order_number),
    customer_name: customerName,
    total_price: orderRevenue,            // item-accurate, legacy-safe
    status: order.status,
    delivered_at: order.delivered_at ?? null,
    requested_delivery_date: order.requested_delivery_date ?? null,
  })

  if (order.status === 'delivered' && order.delivered_at) {
    const deliveredDate = order.delivered_at.substring(0, 10)
    if (deliveredDate >= month && deliveredDate < nextMonth) realizedRevenue += orderRevenue
  } else if (['confirmed', 'packed'].includes(order.status)) {
    pipelineRevenue += orderRevenue
  }
}
```
**lib/finance/cash-flow.ts:** NO change. It consumes `OrderInput.total_price`, which now carries the hybrid value.
**TS note:** `order.order_items` infers as `{ line_total: number | null }[]`; cast as shown.

**Verify:** Finance page current month — realized total matches the hybrid query below for the month. Pipeline shows $0 when no confirmed/packed order has `requested_delivery_date` this month. Check a past month containing legacy (Feb 2026) orders — their revenue must still appear (proves hybrid fallback works).

---

## Task 3+4+7 (combined, single edit of `actions/orders.ts`) — guard, date retire, SKU filter
**File:** `actions/orders.ts`

### 3 — server-side total guard (`saveOrder` ~507–605)
Before building `updatePayload`:
```ts
const recomputedTotal = (input.items ?? [])
  .filter(item => !item._deleted)
  .reduce((sum, item) => sum + (item.line_total ?? 0), 0)
```
Set `updatePayload.total_price = recomputedTotal` (was `input.total_price`). Remove `total_price` from `SaveOrderInput`.

### 4 — retire actual_delivery_date (`SaveOrderInput` ~496–505; `saveOrder` delivery logic ~517–531)
New interface fields:
```ts
export interface SaveOrderInput {
  status: OrderStatus
  order_notes: string
  requested_delivery_date: string | null
  delivered_at_override: string        // '' = no change; 'YYYY-MM-DD' overwrites delivered_at
  existing_delivered_at?: string | null
  items: UpdateOrderItemInput[]
}
```
Delivery logic:
```ts
let deliveredAt: string | null = null
if (input.delivered_at_override) {
  deliveredAt = new Date(input.delivered_at_override + 'T12:00:00Z').toISOString()
} else if (input.status === 'delivered' && !input.existing_delivered_at) {
  deliveredAt = new Date().toISOString()
} else if (input.status !== 'delivered') {
  deliveredAt = null
}
const keepExistingDeliveredAt =
  input.status === 'delivered' && !!input.existing_delivered_at && !input.delivered_at_override
if (!keepExistingDeliveredAt) updatePayload.delivered_at = deliveredAt
```
> Note: use `T12:00:00Z` (midday UTC), NOT `T00:00:00`, so the Central-time date doesn't slip a day backward. Do NOT write `actual_delivery_date`. Leave the column in the DB.

### 7 — getOrderSkus exclude discontinued (~240–260)
Add `.neq('status', 'discontinued')` to the skus select; include `status` in the selected columns.

**Verify 3:** edit an order, change a qty, save → `orders.total_price` equals `SUM(line_total)` for that order. **Verify 4:** set status delivered with no date → `delivered_at` = today; enter a backdated date → `delivered_at` = that date midday UTC. **Verify 7:** edit-order SKU picker hides discontinued, shows active + staged.

---

## Task 5 (Wave 2) — orders page wiring
**File:** `app/dashboard/orders/page.tsx`
- `EditFormData` (~81–88): rename `actual_delivery_date` → `delivered_at_override`.
- `startEditing` (~380): `delivered_at_override: order.delivered_at ? order.delivered_at.split('T')[0] : ''`.
- `saveSheetOrder` call (~400–415): pass `delivered_at_override: editForm.delivered_at_override`, `existing_delivered_at: selectedOrder.delivered_at`; REMOVE the `total_price` argument.
- Edit-mode UI (~1230–1237): label "Delivered Date", bind to `delivered_at_override`, helper text "Date order was delivered — controls which month revenue is attributed to."

**Verify:** edit mode shows "Delivered Date" prepopulated; saves correctly; `npm run type-check` clean.

## Task 6 (Wave 2) — order sheet label
**File:** `components/orders/order-sheet.tsx` (~528): relabel "Actual Delivery Date" → "Delivered Date" + same helper text. Component already uses `delivered_at` state and `updateOrderFromSheet` (which writes `delivered_at` directly) — no logic change.

---

## Execution order
- **Wave 1 (sequential within the file, but the two files are independent of each other):**
  - Edit `actions/finance.ts` (Task 1+2).
  - Edit `actions/orders.ts` ONCE for Tasks 3+4+7 (do not open two passes on this file).
- **Wave 2 (after Wave 1):** Task 5 (`orders/page.tsx`) — depends on the `SaveOrderInput` change; Task 6 (`order-sheet.tsx`) independent.
- After all: `npm run type-check` and `npm run build` must pass. **Stop. Do not commit/push/deploy.** Report diffs to Stokely.

## Out of scope / leave alone
`lib/finance/cash-flow.ts`, the physical `actual_delivery_date` column, `updateOrderFromSheet`, `createOrder`/`createOrderFromSheet`, finance `_actions/`, and the `calculate_commission_on_delivery()` trigger.

## Reference: month-revenue check query (for verification)
```sql
-- Hybrid realized revenue for a given month (replace bounds)
SELECT COALESCE(SUM(CASE WHEN ic.cnt > 0 THEN ic.items_total ELSE o.total_price END), 0) AS realized
FROM orders o
LEFT JOIN LATERAL (
  SELECT count(*) cnt, COALESCE(SUM(line_total),0) items_total
  FROM order_items WHERE order_id = o.id
) ic ON true
WHERE o.status = 'delivered'
  AND o.delivered_at >= '2026-06-01' AND o.delivered_at < '2026-07-01';
```

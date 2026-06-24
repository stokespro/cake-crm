# Payment Terms — Phase 1 Build Spec (Cipher)

> Design by Nova, reviewed + amended by Stokely. COO-approved.
> **Deploy gate: do NOT git commit/push or run vercel. Leave uncommitted for review.**
> **Migration: Cipher EMITS the .sql file only. Stokely applies via MCP (Cipher has no MCP tools).**

## Locked decisions
- Terms order = sold on terms (pay later). Delivery = shipped, NOT paid. On delivery it sets `delivered_at` but produces **no revenue and no commission** — it sits in PIPELINE at the expected payment date.
- **Manual** "Mark Payment Received" sets `terms_paid_at` → realizes revenue + fires commission, both in the month the cash actually arrived.
- **Two dates:** `terms_payment_date` (expected, editable) + `terms_paid_at` (actual receipt, null until paid).
- **Partial payments: NONE** — full payment only (one mark-paid event flips the whole order). No amount-paid column.
- **STOKELY AMENDMENT — permissions:** setting terms AND marking paid are both available to **whoever can EDIT orders** (use EDIT_ROLES / `canEditOrder`), NOT the management-only APPROVE gate Nova proposed. Apply this to `markTermsOrderPaid`'s gate and the "Mark Payment Received" button visibility.

## Pre-verified facts (Nova)
- Commission fn is `create_commission_on_delivery()` (NOT calculate_…); trigger `order_commission_trigger AFTER UPDATE ON orders`. Fires on status→delivered, has idempotency guard `IF EXISTS (SELECT 1 FROM commissions WHERE order_id=NEW.id) RETURN NEW`.
- `commissions` table: one row per order (`unique_order_commission`), `status='pending'` on insert, `order_date DATE` column.
- `orders` has NO terms columns yet. `types/database.ts` is half generated / half hand-written (`export interface Order` in lower half) — MERGE on regen, don't overwrite.

---

## WAVE 0 — migration (Cipher emits file; Stokely applies via MCP)

Create `supabase/migrations/20260623000000_payment_terms.sql`:

```sql
-- Payment Terms for orders — Phase 1. Stokely applies via mcp__cake-db__apply_migration.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_terms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terms_payment_date DATE,
  ADD COLUMN IF NOT EXISTS terms_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.payment_terms IS 'TRUE = sold on terms; revenue+commission deferred until terms_paid_at set.';
COMMENT ON COLUMN public.orders.terms_payment_date IS 'Expected payment date (required when payment_terms=TRUE; editable).';
COMMENT ON COLUMN public.orders.terms_paid_at IS 'Actual payment receipt; NULL until received. Set only via markTermsOrderPaid.';

CREATE INDEX IF NOT EXISTS idx_orders_terms_unrecognized
  ON public.orders (terms_payment_date)
  WHERE payment_terms = TRUE AND terms_paid_at IS NULL;

-- Terms-aware commission trigger function (replaces existing body).
CREATE OR REPLACE FUNCTION public.create_commission_on_delivery()
RETURNS TRIGGER AS $$
DECLARE
  v_line_item RECORD; v_rate DECIMAL(5,2);
  v_total_commission DECIMAL(10,2) := 0; v_avg_rate DECIMAL(5,2);
BEGIN
  -- PATH A: non-terms order → delivered (unchanged behavior for all existing orders)
  IF NEW.status = 'delivered'
     AND (OLD.status IS NULL OR OLD.status != 'delivered')
     AND (NEW.payment_terms = FALSE OR NEW.payment_terms IS NULL)
  THEN
    IF NEW.agent_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.commissions WHERE order_id = NEW.id) THEN RETURN NEW; END IF;
    FOR v_line_item IN
      SELECT oi.*, s.product_type_id FROM public.order_items oi
      LEFT JOIN public.skus s ON oi.sku_id = s.id WHERE oi.order_id = NEW.id
    LOOP
      v_rate := public.get_commission_rate(NEW.agent_id, v_line_item.sku_id, v_line_item.product_type_id,
                                           v_line_item.unit_price, NEW.order_date::DATE);
      v_total_commission := v_total_commission + ROUND(v_line_item.line_total * (v_rate / 100), 2);
    END LOOP;
    v_avg_rate := CASE WHEN NEW.total_price > 0 THEN ROUND((v_total_commission/NEW.total_price)*100,2) ELSE 0 END;
    INSERT INTO public.commissions (order_id, salesperson_id, order_date, order_total, commission_amount, rate_applied, status)
    VALUES (NEW.id, NEW.agent_id, NEW.order_date::DATE, NEW.total_price, v_total_commission, v_avg_rate, 'pending');

  -- PATH B: terms order → terms_paid_at goes NULL→value (and order delivered)
  ELSIF NEW.payment_terms = TRUE
        AND NEW.terms_paid_at IS NOT NULL
        AND (OLD.terms_paid_at IS NULL OR OLD.terms_paid_at IS DISTINCT FROM NEW.terms_paid_at)
  THEN
    IF NEW.agent_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.commissions WHERE order_id = NEW.id) THEN RETURN NEW; END IF;
    IF NEW.status != 'delivered' THEN RETURN NEW; END IF;
    FOR v_line_item IN
      SELECT oi.*, s.product_type_id FROM public.order_items oi
      LEFT JOIN public.skus s ON oi.sku_id = s.id WHERE oi.order_id = NEW.id
    LOOP
      v_rate := public.get_commission_rate(NEW.agent_id, v_line_item.sku_id, v_line_item.product_type_id,
                                           v_line_item.unit_price, NEW.order_date::DATE);
      v_total_commission := v_total_commission + ROUND(v_line_item.line_total * (v_rate / 100), 2);
    END LOOP;
    v_avg_rate := CASE WHEN NEW.total_price > 0 THEN ROUND((v_total_commission/NEW.total_price)*100,2) ELSE 0 END;
    INSERT INTO public.commissions (order_id, salesperson_id, order_date, order_total, commission_amount, rate_applied, status)
    VALUES (NEW.id, NEW.agent_id, NEW.terms_paid_at::DATE, NEW.total_price, v_total_commission, v_avg_rate, 'pending');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_commission_trigger ON public.orders;
CREATE TRIGGER order_commission_trigger AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_commission_on_delivery();
```
**Safety:** existing orders all default `payment_terms=FALSE`; Path B never fires for them. Idempotency guard retained in both paths. **Verify after apply:** columns exist; `has_function`/trigger present.

---

## WAVE 1 — types (after migration applied)
- `mcp__cake-db__generate_typescript_types` → MERGE the 3 new columns into `Database.public.Tables.orders.Row/Insert/Update` in `types/database.ts` (do NOT overwrite the hand-written half).
- Add to hand-written `Order` interface + `OrderRecord` in `actions/orders.ts`:
  `payment_terms?: boolean | null`, `terms_payment_date?: string | null`, `terms_paid_at?: string | null`.
- Verify: `npm run type-check`.

## WAVE 2 — server actions (`actions/orders.ts`)
- **SaveOrderInput**: add `payment_terms: boolean`, `terms_payment_date: string | null`. In `saveOrder`, set `updatePayload.payment_terms = input.payment_terms`; `updatePayload.terms_payment_date = input.payment_terms ? (input.terms_payment_date||null) : null`. Do NOT write `terms_paid_at` here. Guard: `if (input.payment_terms && !input.terms_payment_date) return { error: 'Payment expected date is required for terms orders' }`.
- **CreateOrderInput** + `createOrder`: add `payment_terms?: boolean`, `terms_payment_date?: string|null`; insert `payment_terms: input.payment_terms ?? false`, `terms_payment_date: (input.payment_terms && input.terms_payment_date) ? input.terms_payment_date : null`. Same guard.
- **UpsertOrderSheetInput** + `createOrderFromSheet` + `updateOrderFromSheet`: add the same two fields + write them through (terms_payment_date null when terms off). Do NOT write terms_paid_at.
- **NEW `markTermsOrderPaid(orderId, paidDate)`** — the ONLY writer of `terms_paid_at`:
```ts
export async function markTermsOrderPaid(orderId: string, paidDate: string): Promise<{ error?: string }> {
  const auth = await requireRole([...EDIT_ROLES])   // STOKELY AMENDMENT: edit-order gate, not APPROVE
  if (!auth.authorized) return { error: auth.reason }
  const db = await createServiceClient()
  const { data: order, error: fe } = await db.from('orders')
    .select('id, payment_terms, status, terms_paid_at').eq('id', orderId).single()
  if (fe || !order) return { error: 'Order not found' }
  if (!order.payment_terms) return { error: 'Order is not a terms order' }
  if (order.status !== 'delivered') return { error: 'Order must be delivered before marking payment received' }
  if (order.terms_paid_at) return { error: 'Payment already recorded for this order' }
  const paidAt = new Date(paidDate + 'T12:00:00Z').toISOString()   // midday UTC, no day-slip
  const { error } = await db.from('orders').update({
    terms_paid_at: paidAt, last_edited_by: auth.session.userId, last_edited_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) { console.error('[orders] markTermsOrderPaid:', error); return { error: 'Failed to record payment' } }
  return {}
}
```
(Use the real `EDIT_ROLES` constant already defined in this file.) Setting terms_paid_at fires Path B commission automatically.

## WAVE 3 — finance (`actions/finance.ts` + `lib/finance/cash-flow.ts`) — parallel to Wave 2
**`getMonthSummary` query** — add terms cols + 4-branch month filter:
```ts
.select(`id, order_number, status, total_price, delivered_at, requested_delivery_date,
         payment_terms, terms_payment_date, terms_paid_at,
         customers(business_name), order_items(line_total)`)
.or(
  `and(status.eq.delivered,payment_terms.eq.false,delivered_at.gte.${month},delivered_at.lt.${nextMonth}),` +
  `and(status.eq.delivered,payment_terms.eq.true,terms_paid_at.gte.${month},terms_paid_at.lt.${nextMonth}),` +
  `and(status.in.(confirmed,packed),payment_terms.eq.false,requested_delivery_date.gte.${month},requested_delivery_date.lt.${nextMonth}),` +
  `and(status.eq.delivered,payment_terms.eq.true,terms_paid_at.is.null,terms_payment_date.gte.${month},terms_payment_date.lt.${nextMonth})`
)
.order('requested_delivery_date', { ascending: true }).range(0, 4999)
```
**Revenue loop** — terms-aware classification (keep hybrid amount rule):
```ts
const isTerms = order.payment_terms === true
const isRealized = isTerms ? !!order.terms_paid_at : (order.status === 'delivered' && !!order.delivered_at)
const revenueDate = isTerms ? (order.terms_paid_at ?? null) : (order.delivered_at ?? null)
const pipelineDate = isTerms ? (order.terms_payment_date ?? null) : (order.requested_delivery_date ?? null)
orderInputs.push({ ...mapped..., total_price: orderRevenue,
  delivered_at: revenueDate, requested_delivery_date: pipelineDate,   // adapter: feed engine generically
  payment_terms: isTerms, is_terms_paid: !!order.terms_paid_at })
if (isRealized && revenueDate) {
  const d = revenueDate.substring(0,10); if (d >= month && d < nextMonth) realizedRevenue += orderRevenue
} else if (!isRealized) { pipelineRevenue += orderRevenue }
```
**`lib/finance/cash-flow.ts`**: add `payment_terms?: boolean` and `is_terms_paid?: boolean` to `OrderInput` (optional, ignored by buildCashFlow — pure type extension; engine stays terms-unaware, fed via the adapter above).

## WAVE 4 — order UI (after Wave 2) — order-sheet.tsx and page.tsx each one pass
- **`components/orders/order-sheet.tsx`** (create/edit sheet): state `paymentTerms` + `termsPaymentDate` (init from `order?.payment_terms`/`terms_payment_date`). After the Requested Delivery Date field add a **Payment Terms `Switch`** (toggling off clears the date) + helper "Enable if this customer pays after delivery. Revenue defers to payment date."; when on, a required **"Payment Expected *"** date `Input`. Wire both into the create/update sheet calls (`payment_terms`, `terms_payment_date`). handleSubmit guard: terms on requires a date. Available to all order creators/editors (no extra gate).
- **`app/dashboard/orders/page.tsx`** (detail + edit): 
  - `EditFormData` += `payment_terms: boolean`, `terms_payment_date: string`, `terms_paid_at_display: string` (read-only). `startEditing` populates them. `saveSheetOrder` passes `payment_terms` + `terms_payment_date`.
  - Edit-mode UI: Payment Terms `Switch` + conditional Payment Expected date; if `terms_paid_at_display`, show "Payment received: <date>".
  - **"Mark Payment Received"** button in the read-only detail view, shown only when `order.payment_terms && order.status==='delivered' && !order.terms_paid_at && canEditOrder(user)` (STOKELY AMENDMENT: canEditOrder, not canApproveOrder). Opens an `AlertDialog` with an editable date `Input` (default today). On confirm → `markTermsOrderPaid(order.id, date)` → toast "Payment recorded — revenue and commission updated" → refresh order + list. `Banknote` icon already imported.

## Gate
After all waves: `npm run type-check` + `npm run build` pass. STOP — no commit/push/deploy. Report files changed, deviations, and the terms-order acceptance test result.

## Acceptance test (after migration applied + build)
Create a terms order, deliver it → it shows in **pipeline** at terms_payment_date, **no commission row**. Mark Payment Received (a date) → it becomes **realized** in that date's month, and a **commission row** appears dated to the payment date. Non-terms orders behave exactly as before.

## Out of scope (Phase 2)
Terms Receivables view (unpaid delivered terms orders, aged by terms_payment_date, quick Mark-Paid) + agent reminder. Don't build now.

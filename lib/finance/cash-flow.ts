/**
 * Cash-flow projection engine for the Finance feature.
 *
 * Core concept: build a date-sorted event stream of future cash movements
 * starting from a snapshot anchor, then reduce over it to find the running
 * balance trough (the lowest point — NOT just the month-end balance).
 *
 * KEY ANCHORING RULE:
 *   - Everything that already moved cash on/before snapshot_date is already
 *     reflected in cash_on_hand. Only events AFTER snapshot_date go in the stream.
 *   - A bill is excluded from the stream ONLY if it was fully paid on/before
 *     snapshot_date (status='paid' AND paid_date <= snapshot_date).
 *   - Overdue-but-unpaid bills still count — they have NOT moved cash yet,
 *     so they appear at the stream's start ("now") rather than their due_date.
 */

export type EventKind = 'BILL' | 'DELIVERED_ORDER' | 'PIPELINE_ORDER'

export interface CashFlowEvent {
  date: string            // ISO date string 'YYYY-MM-DD' — when this event lands on the timeline
  kind: EventKind
  amount: number          // positive = inflow, negative = outflow
  label: string           // human-readable description
  id: string              // bill id or order id
  isPipeline: boolean     // true for confirmed/packed orders (toggle-able in UI)
  vendor: string | null   // vendor name for BILL events; null for order events
  runningBalance?: number // filled in after reduction
}

export interface CashFlowResult {
  events: CashFlowEvent[]                  // sorted by date, with runningBalance populated
  openingBalance: number                   // snapshot.cash_on_hand
  snapshotDate: string                     // snapshot.snapshot_date
  troughBalance: number                    // lowest running balance in the stream
  troughDate: string | null               // date the trough occurs (null if no events)
  troughEvent: CashFlowEvent | null        // the event that caused the trough
  cashGap: number                          // abs(troughBalance) if trough < 0, else 0
}

// ----------------------------------------------------------------
// Input shapes (mirrors what getMonthSummary returns)
// ----------------------------------------------------------------

export interface BillInput {
  id: string
  name: string
  amount: number
  amount_paid: number
  due_date: string          // ISO date 'YYYY-MM-DD'
  status: 'unpaid' | 'paid' | 'partial' | 'void'
  paid_date: string | null  // ISO date, may be null
  payment_method: string | null
  bank_confirmed: boolean
  vendor: string | null     // vendor name from finance_vendors join; null if no vendor
}

export interface OrderInput {
  id: string
  order_number: string
  customer_name: string
  total_price: number
  status: string
  delivered_at: string | null          // ISO timestamp or date
  requested_delivery_date: string | null
  payment_terms?: boolean              // true for net-terms orders
  is_terms_paid?: boolean              // true once terms_paid_at is set
}

export interface SnapshotInput {
  id: string
  snapshot_date: string  // ISO date 'YYYY-MM-DD'
  cash_on_hand: number
}

// ----------------------------------------------------------------
// Main computation
// ----------------------------------------------------------------

/**
 * Build the cash-flow event stream and compute the trough.
 *
 * @param snapshot      The most recent cash snapshot on/before today
 * @param bills         All bills for the projection period (month or wider)
 * @param orders        Orders to include as inflows
 * @param today         Today's date as 'YYYY-MM-DD' (injectable for testing)
 * @param includePipeline  When false, pipeline (confirmed/packed) orders are excluded
 *                         from the reduction — useful for the conservative headline
 */
export function buildCashFlow(
  snapshot: SnapshotInput,
  bills: BillInput[],
  orders: OrderInput[],
  today: string,
  includePipeline: boolean = true
): CashFlowResult {
  const events: CashFlowEvent[] = []

  // ------------------------------------------------------------------
  // OUTFLOWS: bills that have NOT already moved cash by snapshot_date
  // ------------------------------------------------------------------
  for (const bill of bills) {
    if (bill.status === 'void') continue

    // Uncleared check = recorded paid by check but not yet cleared/reconciled at the bank.
    // Its cash is STILL sitting in the bank balance (snapshot), so it must always remain
    // a pending outflow — it bypasses both the paid-skip and the snapshot-skip below.
    const isUnclearedCheck = bill.payment_method === 'check' && !bill.bank_confirmed

    // Paid bills whose cash already left the bank are dropped — except uncleared checks,
    // which are marked paid in the system but the funds haven't cleared the bank yet.
    if (bill.status === 'paid' && !isUnclearedCheck) continue

    const remaining = bill.amount - bill.amount_paid
    if (remaining <= 0 && !isUnclearedCheck) {
      // Fully covered — but was it paid before/on snapshot_date?
      // Only skip if paid on/before snapshot (cash already counted in snapshot).
      // NOTE: isUnclearedCheck is false here (guarded above), so this only fires
      // for non-check or cleared-check bills — those are correctly excluded.
      if (
        bill.status === 'paid' &&
        bill.paid_date !== null &&
        bill.paid_date <= snapshot.snapshot_date
      ) {
        continue // Already reflected in snapshot cash
      }
      // Paid after snapshot: still needs to appear as a future outflow
    }

    // Position: use due_date if in the future, else use snapshot_date ("now")
    // because overdue-but-unpaid bills haven't moved cash yet.
    const eventDate =
      bill.due_date > snapshot.snapshot_date ? bill.due_date : snapshot.snapshot_date

    events.push({
      date: eventDate,
      kind: 'BILL',
      // For uncleared checks: remaining is 0 (fully paid), so this yields -bill.amount (full check value).
      // For unpaid/partial: yields the outstanding balance.
      amount: -(remaining > 0 ? remaining : bill.amount), // outflow
      label: bill.name,
      id: bill.id,
      isPipeline: false,
      vendor: bill.vendor ?? null,
    })
  }

  // ------------------------------------------------------------------
  // INFLOWS: delivered orders (realized revenue after snapshot)
  // ------------------------------------------------------------------
  for (const order of orders) {
    if (order.status !== 'delivered') continue
    if (!order.delivered_at) continue

    // delivered_at may be a full ISO timestamp; extract date portion
    const deliveredDate = order.delivered_at.substring(0, 10)
    if (deliveredDate <= snapshot.snapshot_date) continue // already in snapshot

    events.push({
      date: deliveredDate,
      kind: 'DELIVERED_ORDER',
      amount: order.total_price,
      label: `Order #${order.order_number} — ${order.customer_name}`,
      id: order.id,
      isPipeline: false,
      vendor: null,
    })
  }

  // ------------------------------------------------------------------
  // INFLOWS: pipeline orders
  //
  // An order is a pipeline event if it has NOT yet realized cash:
  //   (a) Non-terms orders with status confirmed/packed (not yet delivered)
  //   (b) Terms orders that are unpaid (is_terms_paid === false), regardless
  //       of delivery status — these include delivered-but-awaiting-payment
  //       orders whose terms_payment_date is the expected inflow date.
  //       The adapter maps terms_payment_date → requested_delivery_date and
  //       sets is_terms_paid=false, so we can key off that flag here.
  //
  // Guard: a terms order that IS paid lands in the realized loop (above) and
  // must NOT appear here — the is_terms_paid check prevents double-counting.
  // ------------------------------------------------------------------
  for (const order of orders) {
    const isUnpaidTerms =
      order.payment_terms === true && order.is_terms_paid === false

    const isPreDeliveryNonTerms =
      !order.payment_terms && ['confirmed', 'packed'].includes(order.status)

    if (!isUnpaidTerms && !isPreDeliveryNonTerms) continue

    // Position at requested_delivery_date (= terms_payment_date for terms orders)
    // if it's in the future; otherwise snap to today so the event stays visible.
    const deliveryDate = order.requested_delivery_date
      ? order.requested_delivery_date.substring(0, 10)
      : null
    const eventDate =
      deliveryDate && deliveryDate > snapshot.snapshot_date
        ? deliveryDate
        : today

    events.push({
      date: eventDate,
      kind: 'PIPELINE_ORDER',
      amount: order.total_price,
      label: `[Pipeline] Order #${order.order_number} — ${order.customer_name}`,
      id: order.id,
      isPipeline: true,
      vendor: null,
    })
  }

  // ------------------------------------------------------------------
  // Sort events by date ascending, then outflows before inflows on same day
  // (conservative: pay bills before counting receipts on the same day)
  // ------------------------------------------------------------------
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    // Same date: outflows first
    if (a.amount < 0 && b.amount >= 0) return -1
    if (a.amount >= 0 && b.amount < 0) return 1
    return 0
  })

  // ------------------------------------------------------------------
  // Reduce over the stream, carrying running balance
  // Track trough (lowest balance reached)
  // ------------------------------------------------------------------
  let balance = snapshot.cash_on_hand
  let troughBalance = balance      // start at opening; trough might be here if no events
  let troughDate: string | null = snapshot.snapshot_date
  let troughEvent: CashFlowEvent | null = null

  for (const event of events) {
    // Skip pipeline events when not included in projection
    if (event.isPipeline && !includePipeline) {
      event.runningBalance = undefined // mark as excluded
      continue
    }

    balance += event.amount
    event.runningBalance = balance

    if (balance < troughBalance) {
      troughBalance = balance
      troughDate = event.date
      troughEvent = event
    }
  }

  return {
    events,
    openingBalance: snapshot.cash_on_hand,
    snapshotDate: snapshot.snapshot_date,
    troughBalance,
    troughDate,
    troughEvent,
    cashGap: troughBalance < 0 ? Math.abs(troughBalance) : 0,
  }
}

/**
 * Convenience wrapper: run the same data twice (with/without pipeline)
 * and return both results so the UI can toggle between them.
 */
export function buildCashFlowBoth(
  snapshot: SnapshotInput,
  bills: BillInput[],
  orders: OrderInput[],
  today: string
): { realized: CashFlowResult; withPipeline: CashFlowResult } {
  return {
    realized:     buildCashFlow(snapshot, bills, orders, today, false),
    withPipeline: buildCashFlow(snapshot, bills, orders, today, true),
  }
}

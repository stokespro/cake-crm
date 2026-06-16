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
  status: 'unpaid' | 'paid' | 'partial' | 'scheduled' | 'void'
  paid_date: string | null  // ISO date, may be null
}

export interface OrderInput {
  id: string
  order_number: string
  customer_name: string
  total_price: number
  status: string
  delivered_at: string | null          // ISO timestamp or date
  requested_delivery_date: string | null
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

    const remaining = bill.amount - bill.amount_paid
    if (remaining <= 0) {
      // Fully covered — but was it paid before/on snapshot_date?
      // Only skip if paid on/before snapshot (cash already counted in snapshot).
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
      amount: -(remaining > 0 ? remaining : bill.amount), // outflow
      label: bill.name,
      id: bill.id,
      isPipeline: false,
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
    })
  }

  // ------------------------------------------------------------------
  // INFLOWS: pipeline orders (confirmed/packed — not yet delivered)
  // ------------------------------------------------------------------
  for (const order of orders) {
    if (!['confirmed', 'packed'].includes(order.status)) continue

    // Position at requested_delivery_date if in the future, else "now"
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

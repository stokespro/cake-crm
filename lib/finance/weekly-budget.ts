/**
 * Weekly budget projection engine for the Finance feature.
 *
 * Computes a rolling 6-week waterfall (Monday-anchored) from a cash snapshot,
 * bucketing bills by planned_pay_date (or due_date when unplanned) and orders
 * by delivered_at / terms_paid_at (realized) or requested_delivery_date (pipeline).
 *
 * No UI dependencies — pure data transformation.
 */

import {
  addDays,
  startOfWeek,
  format,
  parseISO,
  getDay,
} from 'date-fns'
import type { BillInput, OrderInput, SnapshotInput } from './cash-flow'

// ----------------------------------------------------------------
// Re-export shared input types so callers can import from here
// ----------------------------------------------------------------
export type { BillInput, OrderInput, SnapshotInput }

// ----------------------------------------------------------------
// Extended bill input — adds planned_pay_date field from DB
// ----------------------------------------------------------------
export interface WeeklyBillInput extends BillInput {
  planned_pay_date: string | null
}

// ----------------------------------------------------------------
// Enriched bill item assigned to a bucket
// ----------------------------------------------------------------
export interface WeeklyBillItem extends WeeklyBillInput {
  bucketDate: string     // 'yyyy-MM-dd' — the effective date used for bucketing
  isUnplanned: boolean   // planned_pay_date was null; fell back to due_date
  isPastDue: boolean     // bucketDate was before week 1; snapped to week 1 start
  remaining: number      // amount - amount_paid (or full amount for uncleared checks)
}

// ----------------------------------------------------------------
// Order item for weekly view
// ----------------------------------------------------------------
export interface WeeklyOrderItem {
  id: string
  order_number: string
  customer_name: string
  amount: number
  date: string           // 'yyyy-MM-dd' — the event date for this order
  isPipeline: boolean
}

// ----------------------------------------------------------------
// One week bucket
// ----------------------------------------------------------------
export interface WeekBucket {
  weekNumber: number           // 1-based
  weekStart: string            // 'yyyy-MM-dd' Monday
  weekEnd: string              // 'yyyy-MM-dd' Sunday
  label: string                // e.g. 'Jun 30 – Jul 6'
  startBalance: number
  bills: WeeklyBillItem[]
  billsTotal: number           // sum of remaining for all bills in this week
  realizedInflows: WeeklyOrderItem[]
  realizedTotal: number
  pipelineInflows: WeeklyOrderItem[]
  pipelineTotal: number
  conservativeEndBalance: number   // startBalance + realized - bills
  optimisticEndBalance: number     // startBalance + realized + pipeline - bills
  isShortfall: boolean             // conservativeEndBalance < 0
  isPipelineSavesIt: boolean       // conservative < 0 but optimistic >= 0
  hasPastDueBills: boolean
}

// ----------------------------------------------------------------
// Top-level result
// ----------------------------------------------------------------
export interface WeeklyBudgetResult {
  weeks: WeekBucket[]
  unbucketedBills: WeeklyBillItem[]   // bills whose bucket date is beyond week 6
  openingBalance: number
  snapshotDate: string
  conservativeTrough: number           // min conservative end balance across weeks
  optimisticTrough: number             // min optimistic end balance across weeks
}

// ----------------------------------------------------------------
// Week boundary descriptor
// ----------------------------------------------------------------
export interface WeekBoundary {
  weekStart: string   // 'yyyy-MM-dd' Monday
  weekEnd: string     // 'yyyy-MM-dd' Sunday
  label: string
}

// ----------------------------------------------------------------
// Compute week boundaries
// ----------------------------------------------------------------

/**
 * Build an array of numWeeks week boundary objects anchored to the Monday
 * on or before `today`.  Each week runs Mon–Sun.
 *
 * Dates are computed entirely with date-fns to avoid TZ-shift bugs.
 * `today` must be a plain 'yyyy-MM-dd' string — parsed with parseISO.
 */
export function computeWeekBoundaries(today: string, numWeeks = 6): WeekBoundary[] {
  const todayDate = parseISO(today)
  // startOfWeek with weekStartsOn:1 gives the Monday on or before today
  const week1Start = startOfWeek(todayDate, { weekStartsOn: 1 })

  const boundaries: WeekBoundary[] = []
  for (let i = 0; i < numWeeks; i++) {
    const wStart = addDays(week1Start, i * 7)
    const wEnd   = addDays(wStart, 6)           // Sunday — kept for bucketing comparisons
    const wFri   = addDays(wStart, 4)           // Friday — display only (Mon–Fri work week)
    boundaries.push({
      weekStart: format(wStart, 'yyyy-MM-dd'),
      weekEnd:   format(wEnd,   'yyyy-MM-dd'),
      label:     `${format(wStart, 'MMM d')} – ${format(wFri, 'MMM d')}`,
    })
  }
  return boundaries
}

// ----------------------------------------------------------------
// Main engine
// ----------------------------------------------------------------

/**
 * Build the weekly budget waterfall.
 *
 * @param snapshot    Most recent cash snapshot on/before today (or null)
 * @param bills       All non-void bills with planned_pay_date included
 * @param orders      Orders for the projection range
 * @param today       'yyyy-MM-dd' — today's date
 * @param numWeeks    Number of forward weeks (default 6, max 12)
 */
export function buildWeeklyBudget(
  snapshot: SnapshotInput | null,
  bills: WeeklyBillInput[],
  orders: OrderInput[],
  today: string,
  numWeeks = 6
): WeeklyBudgetResult {
  const boundaries = computeWeekBoundaries(today, numWeeks)
  const week1Start = boundaries[0].weekStart
  const week6End   = boundaries[boundaries.length - 1].weekEnd
  const openingBalance = snapshot?.cash_on_hand ?? 0
  const snapshotDate   = snapshot?.snapshot_date ?? today

  // -----------------------------------------------------------------
  // 1. Enrich + classify bills
  // -----------------------------------------------------------------
  const billItems: WeeklyBillItem[] = []
  const unbucketedBills: WeeklyBillItem[] = []

  for (const bill of bills) {
    if (bill.status === 'void') continue

    // Uncleared check: recorded paid by check but bank not confirmed yet.
    // Cash is still in bank (reflected in snapshot), so it remains a pending outflow.
    const isUnclearedCheck =
      bill.payment_method === 'check' && !bill.bank_confirmed

    // Skip fully-cleared paid bills
    if (bill.status === 'paid' && !isUnclearedCheck) continue

    // Remaining amount
    const remaining =
      isUnclearedCheck && bill.amount - bill.amount_paid <= 0
        ? bill.amount                          // uncleared check: use full check amount
        : bill.amount - bill.amount_paid

    if (remaining <= 0 && !isUnclearedCheck) continue

    // Determine bucket date
    const rawBucketDate = bill.planned_pay_date ?? bill.due_date
    const isUnplanned   = bill.planned_pay_date === null

    // Snap weekend dates forward to the following Monday so bills land in
    // the next work week, not the one that just ended.
    let bucketDate = rawBucketDate
    const dow = getDay(parseISO(rawBucketDate))
    if (dow === 6) {
      // Saturday → next Monday (+2 days)
      bucketDate = format(addDays(parseISO(rawBucketDate), 2), 'yyyy-MM-dd')
    } else if (dow === 0) {
      // Sunday → next Monday (+1 day)
      bucketDate = format(addDays(parseISO(rawBucketDate), 1), 'yyyy-MM-dd')
    }

    // Past-due check: snap to week 1 start (applied after weekend snap)
    let isPastDue  = false
    if (bucketDate < week1Start) {
      bucketDate = week1Start
      isPastDue  = true
    }

    const item: WeeklyBillItem = {
      ...bill,
      bucketDate,
      isUnplanned,
      isPastDue,
      remaining,
    }

    if (bucketDate > week6End) {
      unbucketedBills.push(item)
    } else {
      billItems.push(item)
    }
  }

  // -----------------------------------------------------------------
  // 2. Enrich + classify orders
  // -----------------------------------------------------------------
  const realizedItems: WeeklyOrderItem[] = []
  const pipelineItems: WeeklyOrderItem[] = []

  for (const order of orders) {
    const isTerms      = order.payment_terms === true
    const isTermsPaid  = order.is_terms_paid === true
    const amount       = order.total_price

    // Realized: non-terms delivered, or terms paid
    const isRealized =
      isTerms
        ? isTermsPaid && !!order.delivered_at
        : order.status === 'delivered' && !!order.delivered_at

    if (isRealized && order.delivered_at) {
      const dateStr = order.delivered_at.substring(0, 10)
      // Only include events after the snapshot (earlier events are already in cash-on-hand)
      // and within the 6-week window
      if (dateStr > snapshotDate && dateStr >= week1Start && dateStr <= week6End) {
        realizedItems.push({
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          amount,
          date: dateStr,
          isPipeline: false,
        })
      }
      continue  // realized orders never appear as pipeline
    }

    // Pipeline: non-terms confirmed/packed, or unpaid terms orders
    const isUnpaidTerms =
      isTerms && !isTermsPaid

    const isPreDeliveryNonTerms =
      !isTerms && ['confirmed', 'packed'].includes(order.status)

    if (!isUnpaidTerms && !isPreDeliveryNonTerms) continue

    const pipelineDateRaw = order.requested_delivery_date
    if (!pipelineDateRaw) continue

    const pipelineDate = pipelineDateRaw.substring(0, 10)
    // Only include pipeline events within the 6-week window and after snapshotDate
    if (pipelineDate > snapshotDate && pipelineDate >= week1Start && pipelineDate <= week6End) {
      pipelineItems.push({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        amount,
        date: pipelineDate,
        isPipeline: true,
      })
    }
  }

  // -----------------------------------------------------------------
  // 3. Assign items to week buckets and run waterfall
  // -----------------------------------------------------------------
  const weeks: WeekBucket[] = []
  let conservativeRunning = openingBalance
  let optimisticRunning   = openingBalance
  let conservativeTrough  = openingBalance
  let optimisticTrough    = openingBalance

  for (let i = 0; i < boundaries.length; i++) {
    const { weekStart, weekEnd, label } = boundaries[i]
    const weekNumber = i + 1

    // Bills in this week bucket
    const weekBills = billItems.filter(
      (b) => b.bucketDate >= weekStart && b.bucketDate <= weekEnd
    )
    const billsTotal = weekBills.reduce((s, b) => s + b.remaining, 0)

    // Realized inflows this week
    const weekRealized = realizedItems.filter(
      (o) => o.date >= weekStart && o.date <= weekEnd
    )
    const realizedTotal = weekRealized.reduce((s, o) => s + o.amount, 0)

    // Pipeline inflows this week
    const weekPipeline = pipelineItems.filter(
      (o) => o.date >= weekStart && o.date <= weekEnd
    )
    const pipelineTotal = weekPipeline.reduce((s, o) => s + o.amount, 0)

    const startBalance = conservativeRunning  // conservative and optimistic use same start per bucket

    const conservativeEndBalance = conservativeRunning + realizedTotal - billsTotal
    const optimisticEndBalance   = optimisticRunning   + realizedTotal + pipelineTotal - billsTotal

    conservativeRunning = conservativeEndBalance
    optimisticRunning   = optimisticEndBalance

    if (conservativeEndBalance < conservativeTrough) conservativeTrough = conservativeEndBalance
    if (optimisticEndBalance   < optimisticTrough)   optimisticTrough   = optimisticEndBalance

    weeks.push({
      weekNumber,
      weekStart,
      weekEnd,
      label,
      startBalance,
      bills: weekBills,
      billsTotal,
      realizedInflows: weekRealized,
      realizedTotal,
      pipelineInflows: weekPipeline,
      pipelineTotal,
      conservativeEndBalance,
      optimisticEndBalance,
      isShortfall: conservativeEndBalance < 0,
      isPipelineSavesIt: conservativeEndBalance < 0 && optimisticEndBalance >= 0,
      hasPastDueBills: weekBills.some((b) => b.isPastDue),
    })
  }

  return {
    weeks,
    unbucketedBills,
    openingBalance,
    snapshotDate,
    conservativeTrough,
    optimisticTrough,
  }
}

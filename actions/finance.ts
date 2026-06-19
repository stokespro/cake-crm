'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireFinance } from '@/lib/auth/session'
import { buildCashFlowBoth } from '@/lib/finance/cash-flow'
import type {
  BillInput,
  OrderInput,
  SnapshotInput,
  CashFlowResult,
} from '@/lib/finance/cash-flow'

// ============================================================
// TYPES
// ============================================================

export interface Vendor {
  id: string
  name: string
  category: string | null
  contact_info: string | null
  notes: string | null
  is_active: boolean
  bank_keywords: string | null
  created_at: string
  updated_at: string
}

export interface BillTemplate {
  id: string
  vendor_id: string | null
  name: string
  amount: number | null
  is_amount_fixed: boolean
  due_day_of_month: number | null
  recurrence: string
  category: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  vendor?: Pick<Vendor, 'id' | 'name'>
}

export type BillStatus = 'unpaid' | 'paid' | 'partial' | 'scheduled' | 'void'

export interface Bill {
  id: string
  template_id: string | null
  vendor_id: string | null
  name: string
  period_month: string   // 'YYYY-MM-01'
  amount: number
  due_date: string
  status: BillStatus
  amount_paid: number
  paid_date: string | null
  payment_method: string | null
  payment_ref: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  template?: Pick<BillTemplate, 'id' | 'name' | 'amount'>
  vendor?: Pick<Vendor, 'id' | 'name'>
}

export interface CashSnapshot {
  id: string
  snapshot_date: string
  cash_on_hand: number
  source: 'manual' | 'bank'
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export interface BankBalanceSummary {
  current: number
  available: number
  pending: number
  as_of_date: string
  account_number: string
}

export interface MonthSummary {
  bills: Bill[]
  latestSnapshot: CashSnapshot | null
  realizedRevenue: number
  pipelineRevenue: number
  cashFlow: {
    realized: CashFlowResult
    withPipeline: CashFlowResult
  } | null
  // Populated from get_bank_balance() RPC (service_role call).
  // null when bank sync has not run or RPC errors — UI degrades gracefully.
  bankBalance: BankBalanceSummary | null
}

// ============================================================
// VENDORS
// ============================================================

export async function createVendor(input: {
  name: string
  category?: string
  contact_info?: string
  notes?: string
}): Promise<{ success: boolean; data?: Vendor; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('finance_vendors')
      .insert({
        name: input.name.trim(),
        category: input.category?.trim() || null,
        contact_info: input.contact_info?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating vendor:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function updateVendor(
  id: string,
  input: {
    name?: string
    category?: string | null
    contact_info?: string | null
    notes?: string | null
    is_active?: boolean
    bank_keywords?: string | null
  }
): Promise<{ success: boolean; data?: Vendor; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (input.name !== undefined)          updateData.name = input.name.trim()
    if (input.category !== undefined)      updateData.category = input.category?.trim() || null
    if (input.contact_info !== undefined)  updateData.contact_info = input.contact_info?.trim() || null
    if (input.notes !== undefined)         updateData.notes = input.notes?.trim() || null
    if (input.is_active !== undefined)     updateData.is_active = input.is_active
    if (input.bank_keywords !== undefined) updateData.bank_keywords = input.bank_keywords?.trim() || null

    const { data, error } = await supabase
      .from('finance_vendors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating vendor:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================================
// BILL TEMPLATES
// ============================================================

export async function createBillTemplate(input: {
  vendor_id?: string
  name: string
  amount?: number
  is_amount_fixed?: boolean
  due_day_of_month?: number
  recurrence?: string
  category?: string
  notes?: string
}): Promise<{ success: boolean; data?: BillTemplate; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('finance_bill_templates')
      .insert({
        vendor_id: input.vendor_id || null,
        name: input.name.trim(),
        amount: input.amount ?? null,
        is_amount_fixed: input.is_amount_fixed ?? true,
        due_day_of_month: input.due_day_of_month ?? null,
        recurrence: input.recurrence || 'monthly',
        category: input.category?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating bill template:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function updateBillTemplate(
  id: string,
  input: {
    vendor_id?: string | null
    name?: string
    amount?: number | null
    is_amount_fixed?: boolean
    due_day_of_month?: number | null
    recurrence?: string
    category?: string | null
    notes?: string | null
    is_active?: boolean
  }
): Promise<{ success: boolean; data?: BillTemplate; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (input.vendor_id !== undefined)       updateData.vendor_id = input.vendor_id
    if (input.name !== undefined)            updateData.name = input.name.trim()
    if (input.amount !== undefined)          updateData.amount = input.amount
    if (input.is_amount_fixed !== undefined) updateData.is_amount_fixed = input.is_amount_fixed
    if (input.due_day_of_month !== undefined) updateData.due_day_of_month = input.due_day_of_month
    if (input.recurrence !== undefined)      updateData.recurrence = input.recurrence
    if (input.category !== undefined)        updateData.category = input.category?.trim() || null
    if (input.notes !== undefined)           updateData.notes = input.notes?.trim() || null
    if (input.is_active !== undefined)       updateData.is_active = input.is_active

    const { data, error } = await supabase
      .from('finance_bill_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating bill template:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function deactivateBillTemplate(id: string): Promise<{
  success: boolean
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const { error } = await supabase
      .from('finance_bill_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deactivating bill template:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================================
// BILL INSTANTIATION
// ============================================================

/**
 * Instantiate bills from all active templates for a given month.
 * Idempotent: skips any template that already has a bill for this period_month.
 *
 * @param month  'YYYY-MM-01' — always the first of the month
 */
export async function instantiateBillsFromTemplates(month: string): Promise<{
  success: boolean
  created: number
  skipped: number
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, created: 0, skipped: 0, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    // Fetch all active templates with their vendor
    const { data: templates, error: templatesError } = await supabase
      .from('finance_bill_templates')
      .select('*, vendor:finance_vendors(id, name)')
      .eq('is_active', true)

    if (templatesError) {
      console.error('Error fetching bill templates:', templatesError)
      return { success: false, created: 0, skipped: 0, error: templatesError.message }
    }

    if (!templates || templates.length === 0) {
      return { success: true, created: 0, skipped: 0 }
    }

    // Find which templates already have a bill for this period
    const { data: existingBills, error: existingError } = await supabase
      .from('finance_bills')
      .select('template_id')
      .eq('period_month', month)
      .not('template_id', 'is', null)

    if (existingError) {
      console.error('Error checking existing bills:', existingError)
      return { success: false, created: 0, skipped: 0, error: existingError.message }
    }

    const existingTemplateIds = new Set(
      (existingBills || []).map((b) => b.template_id as string)
    )

    let created = 0
    let skipped = 0

    for (const template of templates) {
      if (existingTemplateIds.has(template.id)) {
        skipped++
        continue
      }

      // Compute due_date from due_day_of_month within the period month
      const dueDate = computeDueDate(month, template.due_day_of_month)

      const { error: insertError } = await supabase
        .from('finance_bills')
        .insert({
          template_id: template.id,
          vendor_id: template.vendor_id || null,
          name: template.name,
          period_month: month,
          // If amount is not fixed, use 0 as placeholder (user updates before due date)
          amount: template.is_amount_fixed && template.amount != null ? template.amount : 0,
          due_date: dueDate,
          status: 'unpaid',
          amount_paid: 0,
        })

      if (insertError) {
        console.error(`Error instantiating bill for template ${template.id}:`, insertError)
        // Continue with other templates rather than aborting
      } else {
        created++
      }
    }

    return { success: true, created, skipped }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, created: 0, skipped: 0, error: errorMessage }
  }
}

/**
 * Compute a due date within the given month from a day-of-month integer.
 * Clamps to the last day of the month if due_day_of_month exceeds it (e.g. 31 in Feb).
 * Falls back to the last day of the month when due_day_of_month is null.
 */
function computeDueDate(periodMonth: string, dueDayOfMonth: number | null): string {
  // periodMonth is 'YYYY-MM-01'
  const [year, month] = periodMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate() // 0th day of next month = last day of this month
  const day = dueDayOfMonth ? Math.min(dueDayOfMonth, lastDay) : lastDay
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ============================================================
// BILLS
// ============================================================

export async function createBill(input: {
  template_id?: string
  vendor_id?: string
  name: string
  period_month: string
  amount: number
  due_date: string
  status?: BillStatus
  notes?: string
  created_by?: string
}): Promise<{ success: boolean; data?: Bill; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('finance_bills')
      .insert({
        template_id: input.template_id || null,
        vendor_id: input.vendor_id || null,
        name: input.name.trim(),
        period_month: input.period_month,
        amount: input.amount,
        due_date: input.due_date,
        status: input.status || 'unpaid',
        amount_paid: 0,
        notes: input.notes?.trim() || null,
        created_by: input.created_by || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating bill:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function updateBill(
  id: string,
  input: {
    name?: string
    amount?: number
    due_date?: string
    status?: BillStatus
    amount_paid?: number
    paid_date?: string | null
    payment_method?: string | null
    payment_ref?: string | null
    notes?: string | null
    vendor_id?: string | null
  }
): Promise<{ success: boolean; data?: Bill; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (input.name !== undefined)           updateData.name = input.name.trim()
    if (input.amount !== undefined)         updateData.amount = input.amount
    if (input.due_date !== undefined)       updateData.due_date = input.due_date
    if (input.status !== undefined)         updateData.status = input.status
    if (input.amount_paid !== undefined)    updateData.amount_paid = input.amount_paid
    if (input.paid_date !== undefined)      updateData.paid_date = input.paid_date
    if (input.payment_method !== undefined) updateData.payment_method = input.payment_method
    if (input.payment_ref !== undefined)    updateData.payment_ref = input.payment_ref
    if (input.notes !== undefined)          updateData.notes = input.notes?.trim() || null
    if (input.vendor_id !== undefined)      updateData.vendor_id = input.vendor_id

    const { data, error } = await supabase
      .from('finance_bills')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating bill:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function markBillPaid(
  billId: string,
  payment: {
    amount_paid: number
    paid_date: string
    payment_method?: string
    payment_ref?: string
  }
): Promise<{ success: boolean; data?: Bill; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    // Fetch current bill to determine status
    const { data: bill, error: fetchError } = await supabase
      .from('finance_bills')
      .select('amount')
      .eq('id', billId)
      .single()

    if (fetchError || !bill) {
      return { success: false, error: fetchError?.message || 'Bill not found' }
    }

    // Fully paid if amount_paid >= amount, otherwise partial
    const status: BillStatus =
      payment.amount_paid >= bill.amount ? 'paid' : 'partial'

    const { data, error } = await supabase
      .from('finance_bills')
      .update({
        amount_paid: payment.amount_paid,
        paid_date: status === 'paid' ? payment.paid_date : null,
        payment_method: payment.payment_method?.trim() || null,
        payment_ref: payment.payment_ref?.trim() || null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .select()
      .single()

    if (error) {
      console.error('Error marking bill paid:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================================
// CASH SNAPSHOTS
// ============================================================

export async function recordCashSnapshot(input: {
  snapshot_date: string
  cash_on_hand: number
  notes?: string
  recorded_by?: string
}): Promise<{ success: boolean; data?: CashSnapshot; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('finance_cash_snapshots')
      .insert({
        snapshot_date: input.snapshot_date,
        cash_on_hand: input.cash_on_hand,
        notes: input.notes?.trim() || null,
        recorded_by: input.recorded_by || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording cash snapshot:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================================
// MONTH SUMMARY (main read action)
// ============================================================

/**
 * Returns all data needed to render the Finance Overview for a given month,
 * including bills, revenue, the latest cash snapshot, and the computed
 * cash-flow projections (with/without pipeline).
 *
 * @param month  'YYYY-MM-01' — the first of the month to display
 */
export async function getMonthSummary(month: string): Promise<{
  success: boolean
  data?: MonthSummary
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const today = new Date().toISOString().substring(0, 10)
    const nextMonth = incrementMonth(month)

    // Fetch bills, snapshots, orders, and bank balance in parallel.
    // Bank balance uses the service-role client (service_role-only RPC).
    // It is fetched here for display purposes only — the cash-flow engine
    // anchors on cash_on_hand from the snapshot (already written by cron).
    // If the bank RPC fails we degrade gracefully (bankBalance = null).
    const [billsRes, snapshotsRes, ordersRes, bankBalanceRes] = await Promise.all([
      supabase
        .from('finance_bills')
        .select(`
          *,
          template:finance_bill_templates(id, name, amount),
          vendor:finance_vendors(id, name)
        `)
        .eq('period_month', month)
        .order('due_date', { ascending: true }),

      supabase
        .from('finance_cash_snapshots')
        .select('*')
        .lte('snapshot_date', today)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // Month-scoped: delivered orders attributed by delivered_at; pipeline by requested_delivery_date.
      // Joins order_items so we can use the HYBRID revenue rule (line items when present,
      // else fall back to orders.total_price for legacy header-only orders).
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
        .range(0, 4999),

      // Non-fatal: catch so a bank RPC error doesn't block the whole page.
      createServiceClient()
        .then((svc) => svc.rpc('get_bank_balance'))
        .catch(() => ({ data: null, error: null })),
    ])

    if (billsRes.error) {
      console.error('Error fetching bills:', billsRes.error)
      return { success: false, error: billsRes.error.message }
    }
    if (snapshotsRes.error) {
      console.error('Error fetching cash snapshots:', snapshotsRes.error)
      return { success: false, error: snapshotsRes.error.message }
    }
    if (ordersRes.error) {
      console.error('Error fetching orders:', ordersRes.error)
      return { success: false, error: ordersRes.error.message }
    }

    const bills = billsRes.data
    const latestSnapshot = snapshotsRes.data?.[0] ?? null
    const ordersData = ordersRes.data

    // Resolve bank balance — gracefully null on any error
    let bankBalance: BankBalanceSummary | null = null
    if (bankBalanceRes.data && !bankBalanceRes.error) {
      const row = Array.isArray(bankBalanceRes.data)
        ? bankBalanceRes.data[0]
        : bankBalanceRes.data
      if (row) {
        bankBalance = {
          current:        Number(row.current_balance),
          available:      Number(row.available_balance),
          pending:        Number(row.pending_balance),
          as_of_date:     String(row.as_of_date),
          account_number: String(row.account_number),
        }
      }
    }

    // Compute realized and pipeline revenue — HYBRID rule:
    // use SUM(order_items.line_total) when the order has items, else fall back
    // to orders.total_price (preserves $176,940 of legacy header-only orders).
    let realizedRevenue = 0
    let pipelineRevenue = 0

    const orderInputs: OrderInput[] = []

    for (const order of ordersData || []) {
      // Supabase may return joined customer as an array or object
      const customer = Array.isArray(order.customers)
        ? order.customers[0]
        : order.customers
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

    // Build cash-flow projection if we have a snapshot
    let cashFlow: MonthSummary['cashFlow'] = null
    if (latestSnapshot) {
      const billInputs: BillInput[] = (bills || []).map((b) => ({
        id: b.id,
        name: b.name,
        amount: b.amount,
        amount_paid: b.amount_paid,
        due_date: b.due_date,
        status: b.status as BillInput['status'],
        paid_date: b.paid_date ?? null,
      }))

      const snapshotInput: SnapshotInput = {
        id: latestSnapshot.id,
        snapshot_date: latestSnapshot.snapshot_date,
        cash_on_hand: latestSnapshot.cash_on_hand,
      }

      cashFlow = buildCashFlowBoth(snapshotInput, billInputs, orderInputs, today)
    }

    return {
      success: true,
      data: {
        bills: (bills || []) as Bill[],
        latestSnapshot: latestSnapshot as CashSnapshot | null,
        realizedRevenue,
        pipelineRevenue,
        cashFlow,
        bankBalance,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================================
// READ ACTIONS — page data fetches
// ============================================================

/**
 * Fetch bills for a given period month with template and vendor joins.
 * Used by the Bills page to replace its direct browser-client query.
 */
export async function getBillsForMonth(month: string): Promise<{
  success: boolean
  data?: Bill[]
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('finance_bills')
      .select(`
        *,
        template:finance_bill_templates(id, name, amount),
        vendor:finance_vendors(id, name)
      `)
      .eq('period_month', month)
      .order('due_date', { ascending: true })

    if (error) {
      console.error('Error fetching bills:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: (data || []) as Bill[] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

/**
 * Fetch all bill templates with vendor joins.
 * Used by the Templates page and Bills page to replace direct browser-client queries.
 */
export async function getTemplatesWithVendors(activeOnly = false): Promise<{
  success: boolean
  data?: BillTemplate[]
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    let query = supabase
      .from('finance_bill_templates')
      .select('*, vendor:finance_vendors(id, name)')
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching bill templates:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: (data || []) as BillTemplate[] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

/**
 * Fetch vendors.
 * Used by the Vendors page and bill/template forms to replace direct browser-client queries.
 */
export async function getVendors(activeOnly = false): Promise<{
  success: boolean
  data?: Vendor[]
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    let query = supabase
      .from('finance_vendors')
      .select('*')
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching vendors:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Returns the first day of the next month given 'YYYY-MM-01'.
 */
function incrementMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const nextDate = new Date(year, mon, 1) // month is 0-indexed in Date constructor, so mon = this month's 1-indexed value works directly
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`
}

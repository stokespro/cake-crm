'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireFinance } from '@/lib/auth/session'
import { markBillPaid } from '@/actions/finance'

// ============================================================
// TYPES
// ============================================================

export interface BankBalance {
  current_balance: number
  available_balance: number
  pending_balance: number
  account_number: string
  as_of_date: string
  account_name: string
  bank: string
  account_id: string
}

export interface BankTransaction {
  bs_id: number
  id: string
  txn_date: string
  amount: number
  description: string
  original_description: string | null
  merchant_name: string | null
  category: string | null
  type: string | null
}

export type ReconMatchType =
  | 'check_exact'
  | 'check_amount_mismatch'
  | 'fuzzy_suggested'
  | 'untracked'
  | 'already_paid'
  | 'card_amount_vendor'
  | 'amount_only'
  | 'already_paid_non_check'

export type ReconStatus = 'auto_applied' | 'pending_review' | 'confirmed' | 'dismissed'

export interface ReconciliationLogRow {
  id: string
  bank_bs_id: number
  bill_id: string | null
  match_type: ReconMatchType
  bank_amount: number | null
  bill_amount: number | null
  bank_date: string | null
  bank_description: string | null
  status: ReconStatus
  suggested_payment_method: string | null
  applied_at: string | null
  applied_by: string | null
  created_at: string
  // joined
  bill_name: string | null
}

export interface ReconciliationCounts {
  checked_count: number
  auto_applied_count: number
  mismatch_count: number
  already_paid_count: number
  no_bill_match: number
}

// ============================================================
// SECURITY GATE
// ============================================================
// All functions in this file call SECURITY DEFINER RPCs that are
// EXECUTE-granted to service_role only. Two layers of protection:
//   1. createServiceClient() — uses SUPABASE_SERVICE_ROLE_KEY; never
//      reaches the browser; only possible inside a server action.
//   2. requireFinance() — verifies the crm-session HttpOnly cookie
//      server-side and re-reads the user's role from public.users.
//      Identity and role are NEVER accepted from the client. FAIL CLOSED.

// ============================================================
// getBankBalance
// ============================================================

export async function getBankBalance(): Promise<{
  success: boolean
  data?: BankBalance | null
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('get_bank_balance')

    if (error) {
      console.error('getBankBalance error:', error)
      return { success: false, error: error.message }
    }

    // rpc returns array for set-returning functions
    const row = Array.isArray(data) ? data[0] : data
    return { success: true, data: (row as BankBalance) ?? null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// runReconciliation
// ============================================================

export async function runReconciliation(): Promise<{
  success: boolean
  data?: ReconciliationCounts
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('reconcile_cleared_checks')

    if (error) {
      console.error('runReconciliation error:', error)
      return { success: false, error: error.message }
    }

    const row = Array.isArray(data) ? data[0] : data
    return { success: true, data: row as ReconciliationCounts }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// getReconciliationLog
// ============================================================

export async function getReconciliationLog(
  filter: 'pending' | 'cleared' = 'pending'
): Promise<{
  success: boolean
  data?: ReconciliationLogRow[]
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    let query = supabase
      .from('finance_reconciliation_log')
      .select(`
        id,
        bank_bs_id,
        bill_id,
        match_type,
        bank_amount,
        bill_amount,
        bank_date,
        bank_description,
        status,
        suggested_payment_method,
        applied_at,
        applied_by,
        created_at,
        bill:finance_bills(name)
      `)
      .order('bank_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      query = query.eq('status', 'pending_review')
    } else {
      // cleared = recently auto-applied or confirmed, last 30 days
      const since = new Date()
      since.setDate(since.getDate() - 30)
      query = query
        .in('status', ['auto_applied', 'confirmed'])
        .gte('created_at', since.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('getReconciliationLog error:', error)
      return { success: false, error: error.message }
    }

    const rows: ReconciliationLogRow[] = (data ?? []).map((r) => {
      const billData = r.bill as { name: string } | { name: string }[] | null
      const billName = Array.isArray(billData) ? (billData[0]?.name ?? null) : (billData?.name ?? null)
      return {
        id: r.id,
        bank_bs_id: r.bank_bs_id,
        bill_id: r.bill_id,
        match_type: r.match_type as ReconMatchType,
        bank_amount: r.bank_amount,
        bill_amount: r.bill_amount,
        bank_date: r.bank_date,
        bank_description: r.bank_description,
        status: r.status as ReconStatus,
        suggested_payment_method: r.suggested_payment_method ?? null,
        applied_at: r.applied_at,
        applied_by: r.applied_by,
        created_at: r.created_at,
        bill_name: billName,
      }
    })

    return { success: true, data: rows }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// confirmReconciliationMatch
// ============================================================
// Handles all pending_review match types via bill's CURRENT status (amendment F):
//   - bill.status === 'paid' → backfill missing paid_date / payment_method / amount_paid (amendments E+F)
//   - bill.status !== 'paid' → markBillPaid at bank amount/date/method (covers check_amount_mismatch,
//     card_amount_vendor, amount_only, already_paid_non_check when bill not yet paid)
//
// After confirming, dismisses all other pending_review rows for the same
// bank_bs_id OR bill_id (amendment D).

export async function confirmReconciliationMatch(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  // Use server-derived userId — never trust a client-supplied value
  const userId = auth.session.userId

  try {
    const supabase = await createServiceClient()

    // Fetch the log row — include suggested_payment_method and bank_bs_id for amendments D/E/F
    const { data: logRow, error: fetchError } = await supabase
      .from('finance_reconciliation_log')
      .select('id, bill_id, match_type, bank_amount, bank_date, bank_bs_id, suggested_payment_method, status')
      .eq('id', logId)
      .single()

    if (fetchError || !logRow) {
      return { success: false, error: fetchError?.message ?? 'Log row not found' }
    }

    if (logRow.status !== 'pending_review') {
      return { success: false, error: 'Only pending_review rows can be confirmed' }
    }

    const bankAmount = Math.abs(logRow.bank_amount ?? 0)
    const bankDate   = logRow.bank_date ?? new Date().toISOString().substring(0, 10)
    const payMethod  = logRow.suggested_payment_method ?? 'other'

    if (logRow.bill_id) {
      // Amendment F: key off the bill's CURRENT status, not the stored match_type
      const { data: bill, error: billFetchError } = await supabase
        .from('finance_bills')
        .select('status, paid_date, amount_paid, payment_method')
        .eq('id', logRow.bill_id)
        .single()

      if (billFetchError || !bill) {
        return { success: false, error: billFetchError?.message ?? 'Bill not found' }
      }

      if (bill.status === 'paid') {
        // Amendments E + F: backfill only missing payment fields
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (!bill.paid_date)                              patch.paid_date = bankDate
        if (!bill.payment_method)                         patch.payment_method = payMethod
        if (!bill.amount_paid || Number(bill.amount_paid) === 0) patch.amount_paid = bankAmount

        const { error: patchError } = await supabase
          .from('finance_bills')
          .update(patch)
          .eq('id', logRow.bill_id)

        if (patchError) {
          console.error('confirmReconciliationMatch backfill error:', patchError)
          return { success: false, error: patchError.message }
        }
      } else {
        // Mark the bill paid from the bank transaction (check_amount_mismatch, card_amount_vendor, amount_only)
        const payResult = await markBillPaid(logRow.bill_id, {
          amount_paid: bankAmount,
          paid_date: bankDate,
          payment_method: payMethod,
        })

        if (!payResult.success) {
          return { success: false, error: payResult.error ?? 'Failed to mark bill paid' }
        }
      }
    }

    // Set this row confirmed
    const { error: updateError } = await supabase
      .from('finance_reconciliation_log')
      .update({
        status: 'confirmed',
        applied_by: userId,
        applied_at: new Date().toISOString(),
      })
      .eq('id', logId)

    if (updateError) {
      console.error('confirmReconciliationMatch update error:', updateError)
      return { success: false, error: updateError.message }
    }

    // Amendment D: dismiss conflicting pending_review rows on BOTH sides —
    // same bank_bs_id (other proposals for this charge) or same bill_id
    // (other proposals pointing at this bill).
    const orFilter = logRow.bill_id
      ? `bank_bs_id.eq.${logRow.bank_bs_id},bill_id.eq.${logRow.bill_id}`
      : `bank_bs_id.eq.${logRow.bank_bs_id}`

    const { error: dismissError } = await supabase
      .from('finance_reconciliation_log')
      .update({ status: 'dismissed', applied_at: new Date().toISOString() })
      .eq('status', 'pending_review')
      .neq('id', logId)
      .or(orFilter)

    if (dismissError) {
      // Non-fatal: log but don't fail the confirm
      console.error('confirmReconciliationMatch dismiss-conflicts error:', dismissError)
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// dismissReconciliationMatch
// ============================================================

export async function dismissReconciliationMatch(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  // Use server-derived userId — never trust a client-supplied value
  const userId = auth.session.userId

  try {
    const supabase = await createServiceClient()

    const { error } = await supabase
      .from('finance_reconciliation_log')
      .update({
        status: 'dismissed',
        applied_by: userId,
        applied_at: new Date().toISOString(),
      })
      .eq('id', logId)
      .eq('status', 'pending_review') // only dismiss pending rows

    if (error) {
      console.error('dismissReconciliationMatch error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// runDailyReconciliation
// ============================================================
// Orchestrates check reconciliation then non-check proposals.
// Returns counts for both legs.

export interface DailyReconciliationResult {
  check_auto_applied: number
  check_mismatch: number
  noncheck_proposed: number
}

export async function runDailyReconciliation(): Promise<{
  success: boolean
  data?: DailyReconciliationResult
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('run_daily_reconciliation')

    if (error) {
      console.error('runDailyReconciliation error:', error)
      return { success: false, error: error.message }
    }

    const row = Array.isArray(data) ? data[0] : data
    return { success: true, data: row as DailyReconciliationResult }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// runNonCheckReconciliation
// ============================================================
// Proposes non-check debit matches only.

export interface NonCheckReconciliationResult {
  scanned_count: number
  proposed_count: number
  skipped_count: number
}

export async function runNonCheckReconciliation(): Promise<{
  success: boolean
  data?: NonCheckReconciliationResult
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('reconcile_non_check_debits')

    if (error) {
      console.error('runNonCheckReconciliation error:', error)
      return { success: false, error: error.message }
    }

    const row = Array.isArray(data) ? data[0] : data
    return { success: true, data: row as NonCheckReconciliationResult }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// getProposedTransactions
// ============================================================
// Returns pending_review rows from finance_reconciliation_log joined
// to finance_bills(name), scoped to a calendar month by bank_date.
// Does NOT call get_bank_transactions — reads log rows directly.

export interface ProposedTransaction {
  log_id: string
  bank_bs_id: number
  bill_id: string | null
  bill_name: string | null
  match_type: ReconMatchType
  bank_amount: number | null
  bank_date: string | null
  bank_description: string | null
  suggested_payment_method: string | null
}

export async function getProposedTransactions(month: string): Promise<{
  success: boolean
  data?: ProposedTransaction[]
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()

    // Scope to the given month by YYYY-MM prefix on bank_date
    const monthStart = month                               // 'YYYY-MM-01'
    const [year, mon] = month.split('-').map(Number)
    const endDate = new Date(year, mon, 1)                 // first day of next month
    const monthEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`

    const { data, error } = await supabase
      .from('finance_reconciliation_log')
      .select(`
        id,
        bank_bs_id,
        bill_id,
        match_type,
        bank_amount,
        bank_date,
        bank_description,
        suggested_payment_method,
        bill:finance_bills(name)
      `)
      .eq('status', 'pending_review')
      .gte('bank_date', monthStart)
      .lt('bank_date', monthEnd)
      .order('bank_date', { ascending: false })

    if (error) {
      console.error('getProposedTransactions error:', error)
      return { success: false, error: error.message }
    }

    const rows: ProposedTransaction[] = (data ?? []).map((r) => {
      const billData = r.bill as { name: string } | { name: string }[] | null
      const billName = Array.isArray(billData) ? (billData[0]?.name ?? null) : (billData?.name ?? null)
      return {
        log_id: r.id,
        bank_bs_id: r.bank_bs_id,
        bill_id: r.bill_id,
        bill_name: billName,
        match_type: r.match_type as ReconMatchType,
        bank_amount: r.bank_amount,
        bank_date: r.bank_date,
        bank_description: r.bank_description,
        suggested_payment_method: r.suggested_payment_method ?? null,
      }
    })

    return { success: true, data: rows }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

// ============================================================
// getUntrackedBankTransactions
// ============================================================
// Calls the service-role-only RPC, then filters to the given month.
// `month` is the same YYYY-MM-01 string used by getMonthSummary (e.g. '2026-06-01').

export async function getUntrackedBankTransactions(month: string): Promise<{
  success: boolean
  data?: BankTransaction[]
  error?: string
}> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc('get_untracked_bank_transactions')

    if (error) {
      console.error('getUntrackedBankTransactions error:', error)
      return { success: false, error: error.message }
    }

    // Filter to only transactions whose txn_date falls within the selected month.
    // Both month and txn_date are ISO date strings; compare YYYY-MM prefixes.
    const monthPrefix = month.substring(0, 7) // 'YYYY-MM'
    const filtered = ((data ?? []) as BankTransaction[]).filter(
      (txn) => txn.txn_date.substring(0, 7) === monthPrefix
    )

    return { success: true, data: filtered }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

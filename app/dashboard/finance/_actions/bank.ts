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
// For check_amount_mismatch: marks the linked bill paid at the BANK amount.
// For already_paid: just confirms the log row (bill is already paid).
// Sets log status='confirmed', applied_by=session.userId, applied_at=now.

export async function confirmReconciliationMatch(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  // Use server-derived userId — never trust a client-supplied value
  const userId = auth.session.userId

  try {
    const supabase = await createServiceClient()

    // Fetch the log row
    const { data: logRow, error: fetchError } = await supabase
      .from('finance_reconciliation_log')
      .select('id, bill_id, match_type, bank_amount, bank_date, status')
      .eq('id', logId)
      .single()

    if (fetchError || !logRow) {
      return { success: false, error: fetchError?.message ?? 'Log row not found' }
    }

    if (logRow.status !== 'pending_review') {
      return { success: false, error: 'Only pending_review rows can be confirmed' }
    }

    // For check_amount_mismatch: pay the bill at the bank amount
    if (logRow.match_type === 'check_amount_mismatch' && logRow.bill_id) {
      const bankAmount = Math.abs(logRow.bank_amount ?? 0)
      const bankDate = logRow.bank_date ?? new Date().toISOString().substring(0, 10)

      const payResult = await markBillPaid(logRow.bill_id, {
        amount_paid: bankAmount,
        paid_date: bankDate,
        payment_method: 'check',
      })

      if (!payResult.success) {
        return { success: false, error: payResult.error ?? 'Failed to mark bill paid' }
      }
    }
    // For already_paid: bill is already paid, just confirm the log row

    // Update log row status
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
// getUntrackedBankTransactions
// ============================================================
// Calls the service-role-only RPC.

export async function getUntrackedBankTransactions(): Promise<{
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

    return { success: true, data: (data ?? []) as BankTransaction[] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

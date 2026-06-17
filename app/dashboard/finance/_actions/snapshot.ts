'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireFinance } from '@/lib/auth/session'
import type { CashSnapshot } from '@/actions/finance'

/**
 * Upsert a cash-on-hand snapshot for today.
 *
 * `finance_cash_snapshots` has no UNIQUE constraint on snapshot_date, so a
 * plain INSERT produces duplicate rows for the same day.  When getMonthSummary
 * then fetches `.order('snapshot_date', { ascending: false }).limit(1)` with
 * no created_at tie-breaker, Postgres may return the original row rather than
 * the new one — making the update appear to silently do nothing.
 *
 * This action avoids the problem by: first looking for an existing row with
 * the same snapshot_date, and UPDATEing it if found, INSERTing only when none
 * exists.  One row per date; latest is always the freshest value.
 *
 * The recorded_by field is always set from the server-verified session —
 * any value passed in input.recorded_by is ignored and overwritten.
 */
export async function upsertCashSnapshot(input: {
  snapshot_date: string
  cash_on_hand: number
  notes?: string
  recorded_by?: string
}): Promise<{ success: boolean; data?: CashSnapshot; error?: string }> {
  const auth = await requireFinance()
  if (!auth.authorized) return { success: false, error: auth.reason }

  // Always use server-derived userId for the audit trail
  const recordedBy = auth.session.userId

  try {
    const supabase = await createServiceClient()

    // Check for an existing snapshot on this date
    const { data: existing, error: lookupError } = await supabase
      .from('finance_cash_snapshots')
      .select('id')
      .eq('snapshot_date', input.snapshot_date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      console.error('Error looking up existing snapshot:', lookupError)
      return { success: false, error: lookupError.message }
    }

    let data: CashSnapshot | undefined
    let error: { message: string } | null = null

    if (existing?.id) {
      // Update the existing row for this date.
      // Always set source='manual' — this marks it as a staff override so the
      // nightly bank-sync cron (sync_bank_snapshot_to_finance) will not
      // overwrite it.
      const result = await supabase
        .from('finance_cash_snapshots')
        .update({
          cash_on_hand: input.cash_on_hand,
          source: 'manual',
          notes: input.notes?.trim() || null,
          recorded_by: recordedBy,
        })
        .eq('id', existing.id)
        .select()
        .single()

      data = result.data as CashSnapshot | undefined
      error = result.error
    } else {
      // No existing row for this date — insert fresh with source='manual'.
      const result = await supabase
        .from('finance_cash_snapshots')
        .insert({
          snapshot_date: input.snapshot_date,
          cash_on_hand: input.cash_on_hand,
          source: 'manual',
          notes: input.notes?.trim() || null,
          recorded_by: recordedBy,
        })
        .select()
        .single()

      data = result.data as CashSnapshot | undefined
      error = result.error
    }

    if (error) {
      console.error('Error upserting cash snapshot:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

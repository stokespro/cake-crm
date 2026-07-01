// lib/finance/banksync-pull.ts
//
// Shared BankSync API pull logic — used by BOTH:
//   - syncBankFromSource() server action (manual "Sync now" from the UI)
//   - /api/cron/banksync-recover route (morning auto-recovery cron)
//
// This module is NOT a server action file itself. It is a plain async helper
// that the callers invoke after completing their own authentication gates.
//
// Flow:
//   1. Trigger balances feed sync  (POST /v1/feeds/{fid}/sync with body {})
//   2. Trigger transactions feed sync
//   3. Poll balances job until completed/failed/timeout
//   4. Poll transactions job until completed/failed/timeout
//   5. Regardless of transactions result, if balances didn't fail to trigger:
//      a. sync_bank_snapshot_to_finance()   — copy bank data into finance_cash_snapshots
//      b. run_daily_reconciliation()        — run auto-reconcile engine
//   6. Return { success, balancesStatus, transactionsStatus, freshDate, cashOnHand, errors }

import { createServiceClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANKSYNC_BASE = 'https://api.banksync.io'
const FEED_BALANCES = 'INqBrEStcs1M5QFxgk90'
const FEED_TRANSACTIONS = 'VjsTTou4DHNVAmfTOgfe'
const FETCH_TIMEOUT_MS = 15_000   // per HTTP call
const POLL_INTERVAL_MS = 2_000   // between status polls
const POLL_TIMEOUT_MS = 60_000   // total polling budget per feed

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PullResult {
  success: boolean
  balancesStatus: string | null       // 'completed' | 'failed' | 'timeout' | 'trigger_failed' | 'already_running'
  transactionsStatus: string | null   // same values
  freshDate: string | null            // 'YYYY-MM-DD' of the written snapshot, or null
  cashOnHand: number | null           // written cash_on_hand value, or null
  errors: string[]                    // non-fatal warnings + fatal messages; check success flag
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timerId)
  }
}

interface TriggerResult {
  jobId: string | null
  alreadyRunning: boolean
  error: string | null
}

async function triggerFeedSync(feedId: string, apiKey: string): Promise<TriggerResult> {
  try {
    const res = await fetchWithTimeout(
      `${BANKSYNC_BASE}/v1/feeds/${feedId}/sync`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        // Body MUST be {} — empty/missing body returns 400 per BankSync API spec
        body: '{}',
      }
    )

    if (res.status === 409) {
      // A sync job is already running for this feed — not an error; treat as in-progress
      return { jobId: null, alreadyRunning: true, error: null }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status))
      return { jobId: null, alreadyRunning: false, error: `HTTP ${res.status}: ${text}` }
    }

    const json = await res.json() as { data?: { id?: string; status?: string } }
    const jobId = json?.data?.id
    if (!jobId) {
      return { jobId: null, alreadyRunning: false, error: 'No job id in trigger response' }
    }

    return { jobId, alreadyRunning: false, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { jobId: null, alreadyRunning: false, error: msg }
  }
}

interface PollResult {
  status: string        // 'completed' | 'failed' | 'timeout'
  errors: string[]
}

async function pollJob(feedId: string, jobId: string, apiKey: string): Promise<PollResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    try {
      const res = await fetchWithTimeout(
        `${BANKSYNC_BASE}/v1/feeds/${feedId}/jobs/${jobId}`,
        { headers: { 'X-API-Key': apiKey } }
      )

      if (!res.ok) {
        // Transient HTTP error — continue polling, don't abort
        continue
      }

      const json = await res.json() as { data?: { status?: string; errors?: unknown[] } }
      const status = json?.data?.status ?? 'unknown'
      const jobErrors = (json?.data?.errors ?? []).map(String)

      if (status === 'completed' || status === 'failed') {
        return { status, errors: jobErrors }
      }
      // 'created' | 'in_progress' | 'unknown' — keep polling
    } catch {
      // Transient network error — keep polling
    }
  }

  return { status: 'timeout', errors: ['Job did not complete within 60s'] }
}

// ---------------------------------------------------------------------------
// Core pull — shared by server action + cron route
// ---------------------------------------------------------------------------

/**
 * Triggers both BankSync feeds, polls until completion, then runs the DB
 * copy + reconciliation RPCs. Returns a structured result.
 *
 * @param apiKey  The BankSync API key, already retrieved from Vault by the caller.
 */
export async function pullBankSync(apiKey: string): Promise<PullResult> {
  const errors: string[] = []
  let balancesStatus: string | null = null
  let transactionsStatus: string | null = null

  // --- 1. Trigger feeds (balances first, then transactions) ---

  const balancesTrigger = await triggerFeedSync(FEED_BALANCES, apiKey)
  if (balancesTrigger.error) {
    errors.push(`Balances trigger: ${balancesTrigger.error}`)
  }

  const txnsTrigger = await triggerFeedSync(FEED_TRANSACTIONS, apiKey)
  if (txnsTrigger.error) {
    errors.push(`Transactions trigger: ${txnsTrigger.error}`)
  }

  // --- 2. Poll balances ---

  if (balancesTrigger.alreadyRunning) {
    // Another sync is in flight — the DB RPCs below will pick up whatever data
    // is available; if that data is fresh enough, sync_bank_snapshot_to_finance
    // will write it.
    balancesStatus = 'already_running'
  } else if (balancesTrigger.jobId) {
    const poll = await pollJob(FEED_BALANCES, balancesTrigger.jobId, apiKey)
    balancesStatus = poll.status
    for (const e of poll.errors) {
      errors.push(`Balances job: ${e}`)
    }
  } else {
    // trigger_failed — error already recorded above
    balancesStatus = 'trigger_failed'
  }

  // --- 3. Poll transactions ---

  if (txnsTrigger.alreadyRunning) {
    transactionsStatus = 'already_running'
  } else if (txnsTrigger.jobId) {
    const poll = await pollJob(FEED_TRANSACTIONS, txnsTrigger.jobId, apiKey)
    transactionsStatus = poll.status
    // Transactions errors are non-critical; prefix so the caller can distinguish
    for (const e of poll.errors) {
      errors.push(`Transactions job: ${e}`)
    }
  } else {
    transactionsStatus = 'trigger_failed'
  }

  // --- 4. Refresh DB (as long as balances didn't hard-fail at trigger time) ---
  //
  // We call the DB RPCs even when balancesStatus is 'already_running' (another sync
  // may have just finished), 'timeout', or 'failed' (the bank may have partial data).
  // sync_bank_snapshot_to_finance() has its own staleness guard and will no-op
  // if the bank data is too old.

  let freshDate: string | null = null
  let cashOnHand: number | null = null

  if (balancesStatus !== 'trigger_failed') {
    try {
      const supabase = await createServiceClient()

      const { error: snapError } = await supabase.rpc('sync_bank_snapshot_to_finance')
      if (snapError) {
        errors.push(`sync_bank_snapshot_to_finance: ${snapError.message}`)
      }

      const { error: reconError } = await supabase.rpc('run_daily_reconciliation')
      if (reconError) {
        errors.push(`run_daily_reconciliation: ${reconError.message}`)
      }

      // Read back the written snapshot so the caller can report it to the UI
      const { data: snapRow } = await supabase
        .from('finance_cash_snapshots')
        .select('cash_on_hand, snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single()

      if (snapRow) {
        freshDate = snapRow.snapshot_date as string
        cashOnHand = snapRow.cash_on_hand as number
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // --- 5. Compute overall success ---
  //
  // Success = balances either completed or was already running (i.e., data may be fresh)
  //           AND no critical errors (anything that is NOT a transactions-job warning).
  const criticalErrors = errors.filter(
    (e) => !e.startsWith('Transactions job:')
  )
  const success =
    criticalErrors.length === 0 &&
    (balancesStatus === 'completed' || balancesStatus === 'already_running')

  return {
    success,
    balancesStatus,
    transactionsStatus,
    freshDate,
    cashOnHand,
    errors,
  }
}

// app/api/cron/banksync-recover/route.ts
//
// Morning auto-recovery cron for BankSync.
//
// Vercel invokes this route on the schedule defined in vercel.json:
//   0 12 * * *   → 7:00am CDT  (UTC-5, summer)
//   30 12 * * *  → 7:30am CDT
//   0 13 * * *   → 7:00am CST  (UTC-6, winter) / 8:00am CDT
//
// Multiple runs are safe — the route is idempotent: if the bank data is already
// fresh for today (America/Chicago), it returns immediately with action='none'.
//
// Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when
// CRON_SECRET is set in Vercel environment variables. Requests without the correct
// header are rejected 401.
//
// NOTE: CRON_SECRET must be added to Vercel environment variables before this cron
// can run in production. The route will always 401 until that secret is configured.

import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { pullBankSync } from '@/lib/finance/banksync-pull'
import type { PullResult } from '@/lib/finance/banksync-pull'

// Allow up to 90s so the 60s polling budget has comfortable headroom.
// Requires Vercel Pro or higher (Hobby cap is 10s).
export const maxDuration = 90

// Force Node.js runtime — pullBankSync uses setTimeout + AbortController (not Edge-compatible)
// and lib/supabase/server.ts uses next/headers.
export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns today's date in America/Chicago timezone as 'YYYY-MM-DD'.
 * Uses en-CA locale because it returns ISO date format (YYYY-MM-DD) natively.
 */
function getTodayCentral(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  // --- Auth gate: Vercel cron Bearer token ---
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const todayCentral = getTodayCentral()

  try {
    const supabase = await createServiceClient()

    // --- Freshness check: is bank data already current for today? ---
    // get_bank_balance() reads banksync.v_latest_balance which sources from banksync.balances.
    // If as_of_date >= today (Central), BankSync has already delivered today's data — no-op.
    const { data: bankData } = await supabase.rpc('get_bank_balance')
    const bankRow = Array.isArray(bankData) ? bankData[0] : bankData
    const asOfDate: string | null = bankRow?.as_of_date ?? null

    if (asOfDate && asOfDate >= todayCentral) {
      console.log(
        `[banksync-recover] Fresh — as_of_date=${asOfDate} >= today=${todayCentral}; no-op.`
      )
      return NextResponse.json({
        ok: true,
        action: 'none',
        reason: 'fresh',
        as_of_date: asOfDate,
        today_central: todayCentral,
      })
    }

    // --- Stale: retrieve API key and pull from source ---
    console.log(
      `[banksync-recover] Stale — as_of_date=${asOfDate ?? 'null'} < today=${todayCentral}; triggering pull.`
    )

    const { data: apiKey, error: keyError } = await supabase.rpc('get_banksync_api_key')
    if (keyError || !apiKey) {
      const msg = keyError?.message ?? 'BankSync API key not found in Vault'
      console.error(`[banksync-recover] ${msg}`)
      return NextResponse.json(
        { ok: false, action: 'pull_attempted', error: msg },
        { status: 500 }
      )
    }

    const result: PullResult = await pullBankSync(apiKey as string)

    console.log('[banksync-recover] Pull result:', result)

    return NextResponse.json({
      ok: result.success,
      action: 'pulled',
      today_central: todayCentral,
      stale_as_of: asOfDate,
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[banksync-recover] Unexpected error:', msg)
    return NextResponse.json(
      { ok: false, action: 'error', error: msg },
      { status: 500 }
    )
  }
}

/**
 * DB layer for packaging_claims table.
 * Used exclusively by the Packaging Board v2.
 */

import { createServiceClient } from '@/lib/supabase/server'
import type { ActiveClaimRecord, DoneItem } from './board-types'
import type { TaskType } from './types'

// ============================================
// READ
// ============================================

/**
 * Read all active, non-expired claims.
 */
export async function readActiveClaims(): Promise<ActiveClaimRecord[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('packaging_claims')
    .select(
      'id, task_key, sku, task_type, claimed_by_user_id, claimed_by_name, session_user_id, session_user_name, claimed_quantity, claimed_at, expires_at'
    )
    .eq('status', 'ACTIVE')
    .gt('expires_at', new Date().toISOString())

  if (error) throw new Error(`Failed to read active claims: ${error.message}`)

  return (data || []).map((row) => ({
    id: row.id,
    taskKey: row.task_key,
    sku: row.sku,
    taskType: row.task_type as TaskType,
    claimedByUserId: row.claimed_by_user_id,
    claimedByName: row.claimed_by_name,
    sessionUserId: row.session_user_id,
    sessionUserName: row.session_user_name,
    claimedQuantity: row.claimed_quantity,
    claimedAt: row.claimed_at,
    expiresAt: row.expires_at,
  }))
}

/**
 * Read done items completed today (local midnight).
 */
export async function readDoneItemsToday(): Promise<DoneItem[]> {
  const now = new Date()
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('packaging_claims')
    .select('id, sku, task_type, claimed_quantity, claimed_by_name, completed_at')
    .eq('status', 'COMPLETED')
    .gte('completed_at', localMidnight.toISOString())
    .order('completed_at', { ascending: false })

  if (error) throw new Error(`Failed to read done items: ${error.message}`)

  return (data || []).map((row) => ({
    id: row.id,
    sku: row.sku,
    taskType: row.task_type as TaskType,
    completedQuantity: row.claimed_quantity,
    completedByName: row.claimed_by_name,
    completedAt: row.completed_at,
  }))
}

// ============================================
// INSERT
// ============================================

export interface InsertClaimParams {
  taskKey: string
  sku: string
  taskType: TaskType
  priority: string
  claimedQuantity: number
  claimedByUserId: string
  claimedByName: string
  sessionUserId: string | null
  sessionUserName: string | null
}

/**
 * Auto-expire stale claims for this task key, then insert a new claim.
 * Returns { success: true, claimId } or { success: false, error }.
 */
export async function insertClaim(
  params: InsertClaimParams
): Promise<{ success: true; claimId: string } | { success: false; error: string }> {
  const supabase = await createServiceClient()

  // Step 1: lazily expire stale claims for this task key
  await supabase
    .from('packaging_claims')
    .update({ status: 'RELEASED', release_reason: 'auto_expired' })
    .eq('task_key', params.taskKey)
    .eq('status', 'ACTIVE')
    .lt('expires_at', new Date().toISOString())

  // Step 2: insert new claim
  const { data, error } = await supabase
    .from('packaging_claims')
    .insert({
      task_key: params.taskKey,
      sku: params.sku,
      task_type: params.taskType,
      priority: params.priority,
      claimed_quantity: params.claimedQuantity,
      claimed_by_user_id: params.claimedByUserId,
      claimed_by_name: params.claimedByName,
      session_user_id: params.sessionUserId,
      session_user_name: params.sessionUserName,
    })
    .select('id')
    .single()

  if (error) {
    // Unique index violation = task already claimed
    if (error.code === '23505') {
      // Read who holds it
      const { data: existing } = await supabase
        .from('packaging_claims')
        .select('claimed_by_name')
        .eq('task_key', params.taskKey)
        .eq('status', 'ACTIVE')
        .single()
      const holder = existing?.claimed_by_name ?? 'someone else'
      return { success: false, error: `Task already claimed by ${holder}` }
    }
    return { success: false, error: error.message }
  }

  return { success: true, claimId: data.id }
}

// ============================================
// RELEASE
// ============================================

export interface ReleaseClaimParams {
  claimId: string
  reason?: string
}

export type ReleaseResult =
  | { success: true }
  | { success: false; error: string }

export async function releaseClaim(params: ReleaseClaimParams): Promise<ReleaseResult> {
  const supabase = await createServiceClient()

  const { data: claim, error: fetchError } = await supabase
    .from('packaging_claims')
    .select('id, status')
    .eq('id', params.claimId)
    .single()

  if (fetchError || !claim) {
    return { success: false, error: 'Claim not found' }
  }

  if (claim.status !== 'ACTIVE') {
    return { success: false, error: `Claim is already ${claim.status.toLowerCase()}` }
  }

  const { error: updateError } = await supabase
    .from('packaging_claims')
    .update({
      status: 'RELEASED',
      released_at: new Date().toISOString(),
      release_reason: params.reason ?? 'worker_released',
    })
    .eq('id', params.claimId)
    .eq('status', 'ACTIVE') // guard

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

// ============================================
// COMPLETE
// ============================================

export interface CompleteClaimParams {
  claimId: string
  actualQuantity: number
}

export type CompleteResult =
  | { success: true }
  | { success: false; error: string }

export async function completeClaim(params: CompleteClaimParams): Promise<CompleteResult> {
  const supabase = await createServiceClient()

  const { error } = await supabase
    .from('packaging_claims')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      claimed_quantity: params.actualQuantity,
    })
    .eq('id', params.claimId)
    .eq('status', 'ACTIVE') // only complete if still active

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

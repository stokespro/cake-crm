'use server'

import { requireRole } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string
  name: string
  pin: string
  role: string
  created_at: string
  slack_user_id?: string
}

export interface UserDetail extends UserRecord {
  slack_mapping_id: string | null
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch all users with their Slack mappings joined.
 * Only callable by admin.
 */
export async function getUsers(): Promise<
  { data: UserRecord[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(['admin'])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  const [usersResult, mappingsResult] = await Promise.all([
    db.from('users').select('id, name, pin, role, created_at').order('name'),
    db.from('slack_user_mappings').select('id, slack_user_id, cake_user_id'),
  ])

  if (usersResult.error) {
    console.error('[users] getUsers error:', usersResult.error)
    return { error: 'Failed to load users' }
  }

  const mappingsByUserId = new Map(
    (mappingsResult.data ?? []).map((m) => [m.cake_user_id, m.slack_user_id])
  )

  const data: UserRecord[] = (usersResult.data ?? []).map((u) => ({
    ...u,
    slack_user_id: mappingsByUserId.get(u.id),
  }))

  return { data }
}

/**
 * Fetch a single user and their Slack mapping.
 * Only callable by admin.
 */
export async function getUser(userId: string): Promise<
  { data: UserDetail; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(['admin'])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  const [userResult, mappingResult] = await Promise.all([
    db
      .from('users')
      .select('id, name, pin, role, created_at')
      .eq('id', userId)
      .single(),
    db
      .from('slack_user_mappings')
      .select('id, slack_user_id')
      .eq('cake_user_id', userId)
      .maybeSingle(),
  ])

  if (userResult.error || !userResult.data) {
    console.error('[users] getUser error:', userResult.error)
    return { error: 'User not found' }
  }

  return {
    data: {
      ...userResult.data,
      slack_user_id: mappingResult.data?.slack_user_id ?? '',
      slack_mapping_id: mappingResult.data?.id ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  name: string
  pin: string
  role: string
  slack_user_id?: string
}

/**
 * Create a new user, optionally with a Slack mapping.
 * PIN uniqueness is validated server-side.
 * Only callable by admin.
 */
export async function createUser(input: CreateUserInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(['admin'])
  if (!auth.authorized) return { error: auth.reason }

  // Validate PIN format server-side — never trust client validation alone
  if (!/^\d{4}$/.test(input.pin)) {
    return { error: 'PIN must be exactly 4 digits' }
  }

  const db = await createServiceClient()

  // Check PIN uniqueness
  const { data: pinConflict } = await db
    .from('users')
    .select('id')
    .eq('pin', input.pin)
    .maybeSingle()

  if (pinConflict) {
    return { error: 'This PIN is already in use. Please choose a different PIN.' }
  }

  const { data: newUser, error: insertError } = await db
    .from('users')
    .insert({ name: input.name, pin: input.pin, role: input.role })
    .select('id')
    .single()

  if (insertError || !newUser) {
    console.error('[users] createUser error:', insertError)
    return { error: 'Failed to create user' }
  }

  // Create Slack mapping if provided
  const slackId = input.slack_user_id?.trim()
  if (slackId) {
    const { error: slackError } = await db
      .from('slack_user_mappings')
      .insert({ slack_user_id: slackId, cake_user_id: newUser.id })

    if (slackError) {
      // Log but don't fail — user was created; Slack link is secondary
      console.error('[users] createUser slack mapping error:', slackError)
    }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateUserInput {
  name: string
  pin: string
  role: string
  slack_user_id: string
  /** id of the existing slack_user_mappings row, if any */
  slack_mapping_id: string | null
}

/**
 * Update an existing user's name, PIN, role, and Slack mapping.
 * PIN uniqueness is validated server-side (excluding the current user).
 * Only callable by admin.
 */
export async function updateUser(userId: string, input: UpdateUserInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(['admin'])
  if (!auth.authorized) return { error: auth.reason }

  if (!/^\d{4}$/.test(input.pin)) {
    return { error: 'PIN must be exactly 4 digits' }
  }

  const db = await createServiceClient()

  // Check PIN uniqueness excluding this user
  const { data: pinConflict } = await db
    .from('users')
    .select('id')
    .eq('pin', input.pin)
    .neq('id', userId)
    .maybeSingle()

  if (pinConflict) {
    return { error: 'This PIN is already in use by another user.' }
  }

  const { error: updateError } = await db
    .from('users')
    .update({ name: input.name, pin: input.pin, role: input.role })
    .eq('id', userId)

  if (updateError) {
    console.error('[users] updateUser error:', updateError)
    return { error: 'Failed to update user' }
  }

  // Sync Slack mapping
  const newSlackId = input.slack_user_id.trim()
  const hadMapping = input.slack_mapping_id !== null

  if (newSlackId && hadMapping) {
    const { error: slackError } = await db
      .from('slack_user_mappings')
      .update({ slack_user_id: newSlackId })
      .eq('cake_user_id', userId)
    if (slackError) console.error('[users] updateUser slack update error:', slackError)
  } else if (newSlackId && !hadMapping) {
    const { error: slackError } = await db
      .from('slack_user_mappings')
      .insert({ slack_user_id: newSlackId, cake_user_id: userId })
    if (slackError) console.error('[users] updateUser slack insert error:', slackError)
  } else if (!newSlackId && hadMapping) {
    const { error: slackError } = await db
      .from('slack_user_mappings')
      .delete()
      .eq('cake_user_id', userId)
    if (slackError) console.error('[users] updateUser slack delete error:', slackError)
  }

  return {}
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a user by id.
 * Only callable by admin.
 */
export async function deleteUser(userId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(['admin'])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  const { error } = await db.from('users').delete().eq('id', userId)

  if (error) {
    console.error('[users] deleteUser error:', error)
    return { error: 'Failed to delete user' }
  }

  return {}
}

'use server'

import { requireRole } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type { ContactMethod } from '@/types/database'

// Roles that can access communications (mirrors canViewSection('communications'))
const COMM_ROLES = ['admin', 'management', 'sales', 'agent'] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommunicationWithCustomer {
  id: string
  agent_id: string
  customer_id: string
  client_name: string | null
  notes: string
  contact_method: ContactMethod
  follow_up_required: boolean
  interaction_date: string
  last_edited_by: string | null
  last_edited_at: string | null
  is_edited: boolean | null
  customer: {
    business_name: string
    email: string | null
    phone_number: string | null
    license_name: string | null
    omma_license: string | null
    city: string | null
  } | null
}

export interface CustomerOption {
  id: string
  business_name: string
  license_name: string | null
  omma_license: string | null
  city: string | null
  is_active: boolean | null
}

export interface UpdateCommunicationInput {
  notes: string
  contact_method: ContactMethod
  client_name: string
  follow_up_required: boolean
  interaction_date: string
}

export interface CreateCommunicationInput {
  customer_id: string
  client_name: string
  notes: string
  contact_method: string
  follow_up_required: boolean
  interaction_date: string
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch communications for the current user.
 * Sales/agent roles see only their own; admin/management see all.
 */
export async function getCommunications(): Promise<
  { data: CommunicationWithCustomer[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole([...COMM_ROLES])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  let query = db
    .from('communications')
    .select(`
      *,
      customer:customers(business_name, email, phone_number, license_name, omma_license, city)
    `)
    .order('interaction_date', { ascending: false })

  // Agents and sales users can only see their own communications
  if (['sales', 'agent'].includes(auth.session.role)) {
    query = query.eq('agent_id', auth.session.userId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[communications] getCommunications error:', error)
    return { error: 'Failed to load communications' }
  }

  return { data: (data as CommunicationWithCustomer[]) ?? [] }
}

/**
 * Fetch all customers for the picker (paginated, returns all).
 */
export async function getCustomersForPicker(): Promise<
  { data: CustomerOption[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole([...COMM_ROLES])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  const allCustomers: CustomerOption[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await db
      .from('customers')
      .select('id, business_name, license_name, omma_license, city, is_active')
      .order('business_name')
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('[communications] getCustomersForPicker error:', error)
      return { error: 'Failed to load customers' }
    }

    if (!data || data.length === 0) break
    allCustomers.push(...(data as CustomerOption[]))
    if (data.length < batchSize) break
    from += batchSize
  }

  return { data: allCustomers }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new communication log entry.
 */
export async function createCommunication(input: CreateCommunicationInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole([...COMM_ROLES])
  if (!auth.authorized) return { error: auth.reason }

  if (!input.customer_id) return { error: 'Customer is required' }
  if (!input.notes?.trim()) return { error: 'Notes are required' }
  if (!input.contact_method) return { error: 'Contact method is required' }
  if (!input.interaction_date) return { error: 'Interaction date is required' }

  const db = await createServiceClient()

  const { error } = await db.from('communications').insert({
    agent_id: auth.session.userId,
    customer_id: input.customer_id,
    client_name: input.client_name?.trim() || null,
    notes: input.notes.trim(),
    contact_method: input.contact_method,
    follow_up_required: input.follow_up_required,
    interaction_date: input.interaction_date,
  })

  if (error) {
    console.error('[communications] createCommunication error:', error)
    return { error: 'Failed to save communication' }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update an existing communication.
 * Only admin/management can edit.
 */
export async function updateCommunication(
  commId: string,
  input: UpdateCommunicationInput
): Promise<{ error?: never } | { error: string }> {
  const auth = await requireRole(['admin', 'management'])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  const { error } = await db
    .from('communications')
    .update({
      ...input,
      last_edited_by: auth.session.userId,
      last_edited_at: new Date().toISOString(),
      is_edited: true,
    })
    .eq('id', commId)

  if (error) {
    console.error('[communications] updateCommunication error:', error)
    return { error: 'Failed to update communication' }
  }

  return {}
}

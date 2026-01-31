'use server'

import { createClient } from '@/lib/supabase/server'
import { Contact, ContactRole } from '@/types/database'

// Input types
export interface CreateContactInput {
  dispensary_id: string
  name: string
  email?: string
  phone?: string
  role?: ContactRole
  is_primary?: boolean
  comm_email?: boolean
  comm_sms?: boolean
  notes?: string
}

export interface UpdateContactInput {
  name?: string
  email?: string
  phone?: string
  role?: ContactRole
  is_primary?: boolean
  comm_email?: boolean
  comm_sms?: boolean
  notes?: string
}

// ============================================
// GET CONTACTS BY DISPENSARY
// ============================================

export async function getContactsByDispensary(dispensaryId: string): Promise<{
  success: boolean
  data?: Contact[]
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('dispensary_id', dispensaryId)
      .order('is_primary', { ascending: false })
      .order('name')

    if (error) {
      console.error('Error fetching contacts:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// GET SINGLE CONTACT
// ============================================

export async function getContact(id: string): Promise<{
  success: boolean
  data?: Contact
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching contact:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// CREATE CONTACT
// ============================================

export async function createContact(input: CreateContactInput): Promise<{
  success: boolean
  data?: Contact
  error?: string
}> {
  try {
    const supabase = await createClient()

    // If this contact is being set as primary, unset other primary contacts first
    if (input.is_primary) {
      await supabase
        .from('contacts')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('dispensary_id', input.dispensary_id)
        .eq('is_primary', true)
    }

    const contactData = {
      dispensary_id: input.dispensary_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role || null,
      is_primary: input.is_primary ?? false,
      comm_email: input.comm_email ?? true,
      comm_sms: input.comm_sms ?? false,
      notes: input.notes?.trim() || null,
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert(contactData)
      .select()
      .single()

    if (error) {
      console.error('Error creating contact:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// UPDATE CONTACT
// ============================================

export async function updateContact(
  id: string,
  input: UpdateContactInput
): Promise<{
  success: boolean
  data?: Contact
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Get current contact to check dispensary_id for primary handling
    const { data: currentContact, error: fetchError } = await supabase
      .from('contacts')
      .select('dispensary_id')
      .eq('id', id)
      .single()

    if (fetchError || !currentContact) {
      return { success: false, error: 'Contact not found' }
    }

    // If this contact is being set as primary, unset other primary contacts first
    if (input.is_primary) {
      await supabase
        .from('contacts')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('dispensary_id', currentContact.dispensary_id)
        .eq('is_primary', true)
        .neq('id', id)
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.name !== undefined) updateData.name = input.name.trim()
    if (input.email !== undefined) updateData.email = input.email?.trim() || null
    if (input.phone !== undefined) updateData.phone = input.phone?.trim() || null
    if (input.role !== undefined) updateData.role = input.role || null
    if (input.is_primary !== undefined) updateData.is_primary = input.is_primary
    if (input.comm_email !== undefined) updateData.comm_email = input.comm_email
    if (input.comm_sms !== undefined) updateData.comm_sms = input.comm_sms
    if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null

    const { data, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating contact:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// DELETE CONTACT
// ============================================

export async function deleteContact(id: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting contact:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// SET PRIMARY CONTACT
// ============================================

export async function setPrimaryContact(
  dispensaryId: string,
  contactId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Unset all primary contacts for this dispensary
    const { error: unsetError } = await supabase
      .from('contacts')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('dispensary_id', dispensaryId)
      .eq('is_primary', true)

    if (unsetError) {
      console.error('Error unsetting primary contacts:', unsetError)
      return { success: false, error: unsetError.message }
    }

    // Set the specified contact as primary
    const { error: setError } = await supabase
      .from('contacts')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('dispensary_id', dispensaryId)

    if (setError) {
      console.error('Error setting primary contact:', setError)
      return { success: false, error: setError.message }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

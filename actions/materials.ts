'use server'

import { createClient } from '@/lib/supabase/server'

// Types for materials
export interface Material {
  id: string
  name: string
  sku_code: string | null
  material_type: string
  current_stock: number
  low_stock_threshold: number
  created_at: string
  updated_at: string
}

export interface MaterialTransaction {
  id: string
  material_id: string
  quantity: number
  transaction_type: 'restock' | 'usage' | 'adjustment' | 'initial'
  sku_id: string | null
  user_id: string | null
  notes: string | null
  created_at: string
  material?: Material
  user?: { id: string; name: string }
}

export interface CreateMaterialInput {
  name: string
  sku_code?: string
  material_type: string
  initial_stock?: number
  low_stock_threshold?: number
}

export interface UpdateMaterialInput {
  name?: string
  sku_code?: string
  material_type?: string
  low_stock_threshold?: number
}

// ============================================
// GET MATERIALS
// ============================================

export async function getMaterials(): Promise<{
  success: boolean
  data?: Material[]
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error fetching materials:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function getMaterial(id: string): Promise<{
  success: boolean
  data?: Material
  error?: string
}> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching material:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// CREATE MATERIAL
// ============================================

export async function createMaterial(input: CreateMaterialInput): Promise<{
  success: boolean
  data?: Material
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Check for duplicate name
    const { data: existing } = await supabase
      .from('materials')
      .select('id')
      .eq('name', input.name.trim())
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'A material with this name already exists' }
    }

    const materialData = {
      name: input.name.trim(),
      sku_code: input.sku_code?.trim() || null,
      material_type: input.material_type,
      current_stock: input.initial_stock || 0,
      low_stock_threshold: input.low_stock_threshold || 10,
    }

    const { data, error } = await supabase
      .from('materials')
      .insert(materialData)
      .select()
      .single()

    if (error) {
      console.error('Error creating material:', error)
      return { success: false, error: error.message }
    }

    // Log initial stock transaction if there's initial stock
    if (input.initial_stock && input.initial_stock > 0) {
      await supabase.from('material_transactions').insert({
        material_id: data.id,
        quantity: input.initial_stock,
        transaction_type: 'initial',
        notes: 'Initial stock',
      })
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// UPDATE MATERIAL
// ============================================

export async function updateMaterial(
  id: string,
  input: UpdateMaterialInput
): Promise<{
  success: boolean
  data?: Material
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Check for duplicate name if name is being updated
    if (input.name) {
      const { data: existing } = await supabase
        .from('materials')
        .select('id')
        .eq('name', input.name.trim())
        .neq('id', id)
        .maybeSingle()

      if (existing) {
        return { success: false, error: 'A material with this name already exists' }
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.name !== undefined) updateData.name = input.name.trim()
    if (input.sku_code !== undefined) updateData.sku_code = input.sku_code?.trim() || null
    if (input.material_type !== undefined) updateData.material_type = input.material_type
    if (input.low_stock_threshold !== undefined) updateData.low_stock_threshold = input.low_stock_threshold

    const { data, error } = await supabase
      .from('materials')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating material:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// DELETE MATERIAL
// ============================================

export async function deleteMaterial(id: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Delete related transactions first
    await supabase
      .from('material_transactions')
      .delete()
      .eq('material_id', id)

    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting material:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// RESTOCK MATERIAL
// ============================================

export async function restockMaterial(
  id: string,
  quantity: number,
  notes?: string,
  userId?: string
): Promise<{
  success: boolean
  data?: Material
  error?: string
}> {
  try {
    if (quantity <= 0) {
      return { success: false, error: 'Quantity must be greater than 0' }
    }

    const supabase = await createClient()

    // Get current material
    const { data: material, error: fetchError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !material) {
      return { success: false, error: 'Material not found' }
    }

    // Update stock
    const newStock = material.current_stock + quantity
    const { data, error: updateError } = await supabase
      .from('materials')
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error restocking material:', updateError)
      return { success: false, error: updateError.message }
    }

    // Log transaction
    await supabase.from('material_transactions').insert({
      material_id: id,
      quantity: quantity,
      transaction_type: 'restock',
      user_id: userId || null,
      notes: notes?.trim() || null,
    })

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// USE MATERIAL (decrease stock)
// ============================================

export async function useMaterial(
  id: string,
  quantity: number,
  skuId?: string,
  notes?: string,
  userId?: string
): Promise<{
  success: boolean
  data?: Material
  error?: string
}> {
  try {
    if (quantity <= 0) {
      return { success: false, error: 'Quantity must be greater than 0' }
    }

    const supabase = await createClient()

    // Get current material
    const { data: material, error: fetchError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !material) {
      return { success: false, error: 'Material not found' }
    }

    if (material.current_stock < quantity) {
      return { success: false, error: 'Insufficient stock' }
    }

    // Update stock
    const newStock = material.current_stock - quantity
    const { data, error: updateError } = await supabase
      .from('materials')
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error using material:', updateError)
      return { success: false, error: updateError.message }
    }

    // Log transaction (negative quantity for usage)
    await supabase.from('material_transactions').insert({
      material_id: id,
      quantity: -quantity,
      transaction_type: 'usage',
      sku_id: skuId || null,
      user_id: userId || null,
      notes: notes?.trim() || null,
    })

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// GET MATERIAL TRANSACTIONS
// ============================================

export async function getMaterialTransactions(materialId?: string): Promise<{
  success: boolean
  data?: MaterialTransaction[]
  error?: string
}> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('material_transactions')
      .select(`
        *,
        material:materials(id, name, sku_code, material_type),
        user:users(id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (materialId) {
      query = query.eq('material_id', materialId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transactions:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// ADJUST STOCK (manual correction)
// ============================================

export async function adjustMaterialStock(
  id: string,
  newStock: number,
  notes?: string,
  userId?: string
): Promise<{
  success: boolean
  data?: Material
  error?: string
}> {
  try {
    if (newStock < 0) {
      return { success: false, error: 'Stock cannot be negative' }
    }

    const supabase = await createClient()

    // Get current material
    const { data: material, error: fetchError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !material) {
      return { success: false, error: 'Material not found' }
    }

    const difference = newStock - material.current_stock

    // Update stock
    const { data, error: updateError } = await supabase
      .from('materials')
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error adjusting material stock:', updateError)
      return { success: false, error: updateError.message }
    }

    // Log transaction
    await supabase.from('material_transactions').insert({
      material_id: id,
      quantity: difference,
      transaction_type: 'adjustment',
      user_id: userId || null,
      notes: notes?.trim() || `Stock adjusted from ${material.current_stock} to ${newStock}`,
    })

    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

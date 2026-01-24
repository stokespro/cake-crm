'use server'

import { createClient } from '@/lib/supabase/server'
import type { VaultPackage, Transaction, PackageFilters, ProductType, Strain, Batch } from '@/types/vault'

// Get a single package by tag ID
export async function getPackage(tagId: string): Promise<{
  success: boolean
  package?: VaultPackage | null
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select(`
      *,
      type:product_types(*),
      strain_info:strains(*),
      creator:users(id, name)
    `)
    .eq('tag_id', tagId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return { success: true, package: null }
    }
    return { success: false, error: error.message }
  }

  return { success: true, package: data as VaultPackage }
}

// Get filtered packages
export async function getFilteredPackages(filters: PackageFilters): Promise<{
  success: boolean
  packages?: VaultPackage[]
  error?: string
}> {
  const supabase = await createClient()

  let query = supabase
    .from('packages')
    .select(`
      *,
      type:product_types(*),
      strain_info:strains(*),
      creator:users(id, name)
    `)

  if (filters.batches && filters.batches.length > 0) {
    query = query.in('batch', filters.batches)
  }

  if (filters.strainIds && filters.strainIds.length > 0) {
    query = query.in('strain_id', filters.strainIds)
  }

  if (filters.typeIds && filters.typeIds.length > 0) {
    query = query.in('type_id', filters.typeIds)
  }

  const { data, error } = await query.order('batch', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, packages: data as VaultPackage[] }
}

// Get all packages (for summary view)
export async function getAllPackages(): Promise<{
  success: boolean
  packages?: VaultPackage[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select(`
      *,
      type:product_types(*),
      strain_info:strains(*)
    `)
    .order('strain', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, packages: data as VaultPackage[] }
}

// Get unique batches for filtering
export async function getUniqueBatches(): Promise<{
  success: boolean
  batches?: string[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select('batch')
    .order('batch', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  const uniqueBatches = [...new Set(data.map(p => p.batch))]
  return { success: true, batches: uniqueBatches }
}

// Get recent transactions for a package
export async function getRecentTransactions(tagId: string, limit: number = 10): Promise<{
  success: boolean
  transactions?: Transaction[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      user:users(id, name)
    `)
    .eq('tag_id', tagId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, transactions: data as Transaction[] }
}

// Adjust weight on a package
export async function adjustWeight(
  tagId: string,
  amount: number,
  type: 'add' | 'remove',
  userId: string
): Promise<{ success: boolean; package?: VaultPackage; error?: string }> {
  const supabase = await createClient()

  if (amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0' }
  }

  // Get current package
  const { data: currentPackage, error: fetchError } = await supabase
    .from('packages')
    .select('current_weight')
    .eq('tag_id', tagId)
    .single()

  if (fetchError || !currentPackage) {
    return { success: false, error: 'Package not found' }
  }

  const currentWeight = Number(currentPackage.current_weight)
  let newBalance: number

  if (type === 'add') {
    newBalance = currentWeight + amount
  } else {
    if (currentWeight < amount) {
      return { success: false, error: 'Insufficient balance' }
    }
    newBalance = currentWeight - amount
  }

  // Round to 2 decimal places
  newBalance = Math.round(newBalance * 100) / 100

  // Update package
  const { error: updateError } = await supabase
    .from('packages')
    .update({ current_weight: newBalance })
    .eq('tag_id', tagId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log transaction
  await supabase
    .from('transactions')
    .insert({
      tag_id: tagId,
      user_id: userId,
      type,
      amount,
      resulting_balance: newBalance,
    })

  // Fetch updated package with joins
  const { data: updatedPackage, error: refetchError } = await supabase
    .from('packages')
    .select(`
      *,
      type:product_types(*),
      strain_info:strains(*),
      creator:users(id, name)
    `)
    .eq('tag_id', tagId)
    .single()

  if (refetchError) {
    return { success: false, error: refetchError.message }
  }

  return { success: true, package: updatedPackage as VaultPackage }
}

// Create a new package
export async function createPackage(
  tagId: string,
  batch: string,
  strain: string,
  strainId: string,
  typeId: string,
  startingWeight: number,
  userId: string
): Promise<{ success: boolean; package?: VaultPackage; error?: string }> {
  const supabase = await createClient()

  if (!tagId.trim()) {
    return { success: false, error: 'Tag ID is required' }
  }

  if (!batch.trim()) {
    return { success: false, error: 'Batch is required' }
  }

  if (!strainId) {
    return { success: false, error: 'Strain is required' }
  }

  if (!typeId) {
    return { success: false, error: 'Type is required' }
  }

  if (startingWeight < 0) {
    return { success: false, error: 'Starting weight must be positive' }
  }

  // Check if tag already exists
  const { data: existing } = await supabase
    .from('packages')
    .select('tag_id')
    .eq('tag_id', tagId.trim())
    .single()

  if (existing) {
    return { success: false, error: 'Tag ID already exists' }
  }

  // Create the package
  const { data: packageData, error: packageError } = await supabase
    .from('packages')
    .insert({
      tag_id: tagId.trim(),
      batch: batch.trim(),
      strain: strain.trim(),
      strain_id: strainId,
      type_id: typeId,
      current_weight: startingWeight,
      created_by: userId,
    })
    .select(`
      *,
      type:product_types(*),
      strain_info:strains(*),
      creator:users(id, name)
    `)
    .single()

  if (packageError) {
    return { success: false, error: packageError.message }
  }

  // Log the initial transaction
  await supabase
    .from('transactions')
    .insert({
      tag_id: tagId.trim(),
      user_id: userId,
      type: 'add',
      amount: startingWeight,
      resulting_balance: startingWeight,
    })

  return { success: true, package: packageData as VaultPackage }
}

// Get all strains
export async function getStrains(): Promise<{
  success: boolean
  strains?: Strain[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('strains')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, strains: data as Strain[] }
}

// Get all product types
export async function getProductTypes(): Promise<{
  success: boolean
  productTypes?: ProductType[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, productTypes: data as ProductType[] }
}

// ============================================================================
// STRAIN CRUD OPERATIONS
// ============================================================================

export async function createStrain(
  name: string
): Promise<{ success: boolean; strain?: Strain; error?: string }> {
  const supabase = await createClient()

  if (!name.trim()) {
    return { success: false, error: 'Name is required' }
  }

  // Check if name already exists
  const { data: existing } = await supabase
    .from('strains')
    .select('id')
    .ilike('name', name.trim())
    .single()

  if (existing) {
    return { success: false, error: 'Strain already exists' }
  }

  const { data, error } = await supabase
    .from('strains')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, strain: data as Strain }
}

export async function updateStrain(
  id: string,
  name: string
): Promise<{ success: boolean; strain?: Strain; error?: string }> {
  const supabase = await createClient()

  if (!name.trim()) {
    return { success: false, error: 'Name is required' }
  }

  // Check if name already exists for another strain
  const { data: existing } = await supabase
    .from('strains')
    .select('id')
    .ilike('name', name.trim())
    .neq('id', id)
    .single()

  if (existing) {
    return { success: false, error: 'Strain already exists' }
  }

  const { data, error } = await supabase
    .from('strains')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, strain: data as Strain }
}

export async function deleteStrain(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Check if any packages use this strain
  const { data: packages } = await supabase
    .from('packages')
    .select('tag_id')
    .eq('strain_id', id)
    .limit(1)

  if (packages && packages.length > 0) {
    return { success: false, error: 'Cannot delete strain that is in use by packages' }
  }

  const { error } = await supabase
    .from('strains')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ============================================================================
// BATCH CRUD OPERATIONS
// ============================================================================

export async function getBatches(): Promise<{
  success: boolean
  batches?: Batch[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('batches')
    .select(`
      *,
      strain:strains(*)
    `)
    .order('name', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, batches: data as Batch[] }
}

export async function createBatch(
  name: string,
  strainId: string
): Promise<{ success: boolean; batch?: Batch; error?: string }> {
  const supabase = await createClient()

  if (!name.trim()) {
    return { success: false, error: 'Batch name is required' }
  }

  if (!strainId) {
    return { success: false, error: 'Strain is required' }
  }

  // Check if batch already exists
  const { data: existing } = await supabase
    .from('batches')
    .select('id')
    .ilike('name', name.trim())
    .single()

  if (existing) {
    return { success: false, error: 'Batch already exists' }
  }

  const { data, error } = await supabase
    .from('batches')
    .insert({ name: name.trim(), strain_id: strainId })
    .select(`
      *,
      strain:strains(*)
    `)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, batch: data as Batch }
}

export async function updateBatch(
  id: string,
  name: string,
  strainId: string
): Promise<{ success: boolean; batch?: Batch; error?: string }> {
  const supabase = await createClient()

  if (!name.trim()) {
    return { success: false, error: 'Batch name is required' }
  }

  if (!strainId) {
    return { success: false, error: 'Strain is required' }
  }

  // Check if another batch with this name exists
  const { data: existing } = await supabase
    .from('batches')
    .select('id')
    .ilike('name', name.trim())
    .neq('id', id)
    .single()

  if (existing) {
    return { success: false, error: 'Another batch with this name already exists' }
  }

  const { data, error } = await supabase
    .from('batches')
    .update({ name: name.trim(), strain_id: strainId })
    .eq('id', id)
    .select(`
      *,
      strain:strains(*)
    `)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, batch: data as Batch }
}

export async function deleteBatch(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // First get the batch name to check packages
  const { data: batch } = await supabase
    .from('batches')
    .select('name')
    .eq('id', id)
    .single()

  if (!batch) {
    return { success: false, error: 'Batch not found' }
  }

  // Check if any packages use this batch (by name, since packages.batch is a text field)
  const { data: packages } = await supabase
    .from('packages')
    .select('tag_id')
    .eq('batch', batch.name)
    .limit(1)

  if (packages && packages.length > 0) {
    return { success: false, error: 'Cannot delete batch that is in use by packages' }
  }

  const { error } = await supabase
    .from('batches')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ============================================================================
// PRODUCT TYPE CRUD OPERATIONS
// ============================================================================

export async function createProductType(
  name: string
): Promise<{ success: boolean; productType?: ProductType; error?: string }> {
  const supabase = await createClient()

  if (!name.trim()) {
    return { success: false, error: 'Name is required' }
  }

  // Check if name already exists
  const { data: existing } = await supabase
    .from('product_types')
    .select('id')
    .ilike('name', name.trim())
    .single()

  if (existing) {
    return { success: false, error: 'Product type already exists' }
  }

  const { data, error } = await supabase
    .from('product_types')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, productType: data as ProductType }
}

export async function updateProductType(
  id: string,
  name: string
): Promise<{ success: boolean; productType?: ProductType; error?: string }> {
  const supabase = await createClient()

  if (!name.trim()) {
    return { success: false, error: 'Name is required' }
  }

  // Check if name already exists for another type
  const { data: existing } = await supabase
    .from('product_types')
    .select('id')
    .ilike('name', name.trim())
    .neq('id', id)
    .single()

  if (existing) {
    return { success: false, error: 'Product type already exists' }
  }

  const { data, error } = await supabase
    .from('product_types')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, productType: data as ProductType }
}

export async function deleteProductType(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Check if any packages use this type
  const { data: packages } = await supabase
    .from('packages')
    .select('tag_id')
    .eq('type_id', id)
    .limit(1)

  if (packages && packages.length > 0) {
    return { success: false, error: 'Cannot delete type that is in use by packages' }
  }

  const { error } = await supabase
    .from('product_types')
    .delete()
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import type { InventoryLevel, PackagingTask, OrderWithItems } from '@/types/packaging'

// Get inventory levels for all SKUs
export async function getInventoryLevels(): Promise<{
  success: boolean
  inventory?: InventoryLevel[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('skus')
    .select(`
      id,
      code,
      name,
      inventory (
        cased,
        filled,
        staged
      )
    `)
    .order('code')

  if (error) {
    return { success: false, error: error.message }
  }

  const inventory: InventoryLevel[] = data.map(sku => ({
    sku_id: sku.id,
    sku_code: sku.code,
    sku_name: sku.name,
    cased: sku.inventory?.[0]?.cased ?? 0,
    filled: sku.inventory?.[0]?.filled ?? 0,
    staged: sku.inventory?.[0]?.staged ?? 0,
  }))

  return { success: true, inventory }
}

// Get current packaging tasks
export async function getPackagingTasks(): Promise<{
  success: boolean
  tasks?: PackagingTask[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packaging_task_state')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, tasks: data as PackagingTask[] }
}

// Get confirmed orders for packaging view
export async function getConfirmedOrders(): Promise<{
  success: boolean
  orders?: OrderWithItems[]
  error?: string
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      requested_delivery_date,
      customer:customers(business_name),
      order_items (
        quantity,
        sku:skus(code)
      )
    `)
    .in('status', ['confirmed', 'pending'])
    .order('requested_delivery_date', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  const orders: OrderWithItems[] = data.map(order => ({
    id: order.id,
    order_number: order.order_number || '',
    customer_name: (order.customer as { business_name: string })?.business_name || 'Unknown',
    status: order.status,
    requested_delivery_date: order.requested_delivery_date,
    order_items: order.order_items.map((item: { quantity: number; sku: { code: string } | null }) => ({
      sku_code: item.sku?.code || '',
      quantity: item.quantity,
    })),
  }))

  return { success: true, orders }
}

// Advance a task (TO_FILL -> TO_CASE, or TO_CASE -> DONE)
export async function advanceTask(
  taskId: string,
  sku: string,
  quantity: number,
  fromColumn: 'TO_FILL' | 'TO_CASE'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get current inventory for this SKU
  const { data: skuData, error: skuError } = await supabase
    .from('skus')
    .select('id')
    .eq('code', sku)
    .single()

  if (skuError || !skuData) {
    return { success: false, error: 'SKU not found' }
  }

  const skuId = skuData.id

  const { data: inventory, error: invError } = await supabase
    .from('inventory')
    .select('*')
    .eq('sku_id', skuId)
    .single()

  if (invError) {
    return { success: false, error: 'Inventory not found' }
  }

  if (fromColumn === 'TO_FILL') {
    // STAGED -> FILLED
    if (inventory.staged < quantity) {
      return { success: false, error: 'Insufficient staged inventory' }
    }

    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        staged: inventory.staged - quantity,
        filled: inventory.filled + quantity,
      })
      .eq('sku_id', skuId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Update task state to TO_CASE
    const { error: taskError } = await supabase
      .from('packaging_task_state')
      .update({
        current_column: 'TO_CASE',
        task_type: 'CASE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    if (taskError) {
      return { success: false, error: taskError.message }
    }
  } else if (fromColumn === 'TO_CASE') {
    // FILLED -> CASED
    if (inventory.filled < quantity) {
      return { success: false, error: 'Insufficient filled inventory' }
    }

    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        filled: inventory.filled - quantity,
        cased: inventory.cased + quantity,
      })
      .eq('sku_id', skuId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Update task state to DONE
    const { error: taskError } = await supabase
      .from('packaging_task_state')
      .update({
        current_column: 'DONE',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    if (taskError) {
      return { success: false, error: taskError.message }
    }
  }

  return { success: true }
}

// Revert a task (TO_CASE -> TO_FILL, or DONE -> TO_CASE)
export async function revertTask(
  taskId: string,
  sku: string,
  quantity: number,
  fromColumn: 'TO_CASE' | 'DONE'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get SKU ID
  const { data: skuData, error: skuError } = await supabase
    .from('skus')
    .select('id')
    .eq('code', sku)
    .single()

  if (skuError || !skuData) {
    return { success: false, error: 'SKU not found' }
  }

  const skuId = skuData.id

  const { data: inventory, error: invError } = await supabase
    .from('inventory')
    .select('*')
    .eq('sku_id', skuId)
    .single()

  if (invError) {
    return { success: false, error: 'Inventory not found' }
  }

  if (fromColumn === 'TO_CASE') {
    // FILLED -> STAGED
    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        filled: inventory.filled - quantity,
        staged: inventory.staged + quantity,
      })
      .eq('sku_id', skuId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Update task state to TO_FILL
    const { error: taskError } = await supabase
      .from('packaging_task_state')
      .update({
        current_column: 'TO_FILL',
        task_type: 'FILL',
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    if (taskError) {
      return { success: false, error: taskError.message }
    }
  } else if (fromColumn === 'DONE') {
    // CASED -> FILLED
    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        cased: inventory.cased - quantity,
        filled: inventory.filled + quantity,
      })
      .eq('sku_id', skuId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Update task state to TO_CASE
    const { error: taskError } = await supabase
      .from('packaging_task_state')
      .update({
        current_column: 'TO_CASE',
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    if (taskError) {
      return { success: false, error: taskError.message }
    }
  }

  return { success: true }
}

// Add staged inventory
export async function addStagedInventory(
  sku: string,
  quantity: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get SKU ID
  const { data: skuData, error: skuError } = await supabase
    .from('skus')
    .select('id')
    .eq('code', sku)
    .single()

  if (skuError || !skuData) {
    return { success: false, error: 'SKU not found' }
  }

  const { data: inventory, error: invError } = await supabase
    .from('inventory')
    .select('staged')
    .eq('sku_id', skuData.id)
    .single()

  if (invError) {
    return { success: false, error: 'Inventory not found' }
  }

  const { error: updateError } = await supabase
    .from('inventory')
    .update({ staged: inventory.staged + quantity })
    .eq('sku_id', skuData.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

// Update inventory levels directly (for manual adjustments)
export async function updateInventory(
  sku: string,
  updates: { cased?: number; filled?: number; staged?: number }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get SKU ID
  const { data: skuData, error: skuError } = await supabase
    .from('skus')
    .select('id')
    .eq('code', sku)
    .single()

  if (skuError || !skuData) {
    return { success: false, error: 'SKU not found' }
  }

  // Build update object with only provided fields
  const updateData: Record<string, number> = {}
  if (updates.cased !== undefined) updateData.cased = updates.cased
  if (updates.filled !== undefined) updateData.filled = updates.filled
  if (updates.staged !== undefined) updateData.staged = updates.staged

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: 'No updates provided' }
  }

  const { error: updateError } = await supabase
    .from('inventory')
    .update(updateData)
    .eq('sku_id', skuData.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log the adjustment
  await supabase.from('inventory_log').insert({
    sku_id: skuData.id,
    change_type: 'manual_adjustment',
    cased_change: updates.cased !== undefined ? updates.cased : null,
    filled_change: updates.filled !== undefined ? updates.filled : null,
    staged_change: updates.staged !== undefined ? updates.staged : null,
    notes: 'Manual adjustment via CRM',
  })

  return { success: true }
}

// Get demand summary (aggregate order quantities by SKU)
export async function getDemandSummary(): Promise<{
  success: boolean
  demand?: Record<string, { total: number; urgent: number; tomorrow: number }>
  error?: string
}> {
  const supabase = await createClient()

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      requested_delivery_date,
      order_items (
        quantity,
        sku:skus(code)
      )
    `)
    .in('status', ['confirmed', 'pending'])

  if (error) {
    return { success: false, error: error.message }
  }

  const demand: Record<string, { total: number; urgent: number; tomorrow: number }> = {}

  orders.forEach(order => {
    const deliveryDate = order.requested_delivery_date
      ? new Date(order.requested_delivery_date + 'T00:00:00')
      : null

    const isUrgent = deliveryDate && deliveryDate <= today
    const isTomorrow = deliveryDate &&
      deliveryDate.toDateString() === tomorrow.toDateString()

    order.order_items.forEach((item: { quantity: number; sku: { code: string } | null }) => {
      const skuCode = item.sku?.code
      if (!skuCode) return

      if (!demand[skuCode]) {
        demand[skuCode] = { total: 0, urgent: 0, tomorrow: 0 }
      }

      demand[skuCode].total += item.quantity
      if (isUrgent) demand[skuCode].urgent += item.quantity
      if (isTomorrow) demand[skuCode].tomorrow += item.quantity
    })
  })

  return { success: true, demand }
}

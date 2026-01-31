'use server'

import {
  readInventory,
  readOrders,
  readStagingContainers,
  readTaskNotes,
  readTaskStates,
  processOrderStatusChanges,
  cleanupOldTaskStates,
  completeWeighAndFill,
  completeSealAndCase,
  saveTaskState,
  saveTaskNote,
  addContainer as dbAddContainer,
  removeContainer as dbRemoveContainer,
  updateInventoryLevels,
  readSKUInventory,
  getSkuId,
} from '@/lib/packaging/db'
import { generateTaskQueue, generateSKUStatus } from '@/lib/packaging/allocation-engine'
import {
  checkMaterialAvailability,
  deductMaterialsForCasing,
} from '@/actions/materials'
import type {
  DashboardData,
  Task,
  CompletedTask,
  SKU,
  ContainerSize,
  InventoryLevels,
} from '@/lib/packaging/types'

// ============================================
// DASHBOARD DATA
// ============================================

export async function getDashboardData(): Promise<DashboardData> {
  try {
    // First, process any order status changes
    const statusChanges = await processOrderStatusChanges()
    if (statusChanges.packedProcessed > 0 || statusChanges.deliveredProcessed > 0 || statusChanges.reversedPacked > 0) {
      console.log('Order status changes processed:', statusChanges)
    }

    // Cleanup old DONE tasks from previous days
    const cleanedUp = await cleanupOldTaskStates()
    if (cleanedUp > 0) {
      console.log(`Cleaned up ${cleanedUp} old task states`)
    }

    // Fetch all data
    const [inventory, orders, containers, taskNotes, taskStates] = await Promise.all([
      readInventory(),
      readOrders(),
      readStagingContainers(),
      readTaskNotes(),
      readTaskStates(),
    ])

    // Generate task queue using allocation engine
    const tasks = generateTaskQueue(inventory, orders)

    // Merge persisted task states with generated tasks
    const completedTasks: CompletedTask[] = []
    const mergedTasks: Task[] = []

    for (const task of tasks) {
      const persistedState = taskStates[task.id]

      if (persistedState) {
        if (persistedState.current_column === 'DONE') {
          completedTasks.push({
            id: task.id,
            sku: task.sku,
            quantity: persistedState.quantity,
            priority: task.priority,
            completedAt: persistedState.completed_at || new Date().toISOString(),
          })
        } else if (persistedState.current_column === 'TO_CASE' && task.column === 'TO_FILL') {
          mergedTasks.push({
            ...task,
            column: 'TO_CASE',
          })
        } else {
          mergedTasks.push(task)
        }
      } else {
        mergedTasks.push(task)
      }
    }

    // Also check for DONE tasks not in generated list
    for (const [taskKey, state] of Object.entries(taskStates)) {
      if (state.current_column === 'DONE') {
        const alreadyAdded = completedTasks.some(t => t.id === taskKey)
        if (!alreadyAdded) {
          completedTasks.push({
            id: taskKey,
            sku: state.sku as SKU,
            quantity: state.quantity,
            priority: 'BACKFILL',
            completedAt: state.completed_at || new Date().toISOString(),
          })
        }
      }
    }

    // Generate SKU status for inventory bar
    const skuStatus = generateSKUStatus(inventory, orders)

    // Filter to only AVAILABLE containers
    const availableContainers = containers.filter(c => c.status === 'AVAILABLE')

    return {
      inventory: skuStatus,
      tasks: mergedTasks,
      containers: availableContainers,
      taskNotes,
      completedTasks,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Dashboard data error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return {
      inventory: [],
      tasks: [],
      containers: [],
      taskNotes: {},
      completedTasks: [],
      lastUpdated: new Date().toISOString(),
      error: `Failed to load dashboard data: ${errorMessage}`,
    }
  }
}

// ============================================
// TASK ACTIONS
// ============================================

export async function advanceTask(
  taskId: string,
  sku: SKU,
  quantity: number,
  fromColumn: 'TO_FILL' | 'TO_CASE'
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentInventory = await readSKUInventory(sku)

    if (fromColumn === 'TO_FILL') {
      // STAGED -> FILLED
      if (currentInventory.staged < quantity) {
        return { success: false, error: 'Insufficient staged inventory' }
      }

      await completeWeighAndFill(sku, quantity, currentInventory)

      // Update task state to TO_CASE
      await saveTaskState(taskId, sku, 'CASE', 'TO_CASE', quantity)
    } else if (fromColumn === 'TO_CASE') {
      // FILLED -> CASED
      if (currentInventory.filled < quantity) {
        return { success: false, error: 'Insufficient filled inventory' }
      }

      // Get SKU ID for material check
      const skuId = await getSkuId(sku)

      // Check material availability before casing
      const materialCheck = await checkMaterialAvailability(skuId, quantity)
      if (!materialCheck.success) {
        return { success: false, error: materialCheck.error || 'Failed to check material availability' }
      }

      if (materialCheck.data && !materialCheck.data.available) {
        // Find the first material with shortage for error message
        const shortage = materialCheck.data.materials.find(m => m.shortage > 0)
        if (shortage) {
          return {
            success: false,
            error: `Cannot case: Insufficient ${shortage.materialName}. Need ${shortage.required}, have ${shortage.available}`
          }
        }
        return { success: false, error: 'Insufficient materials for casing' }
      }

      // Deduct materials
      const deductResult = await deductMaterialsForCasing(skuId, quantity)
      if (!deductResult.success) {
        return { success: false, error: deductResult.error || 'Failed to deduct materials' }
      }

      await completeSealAndCase(sku, quantity, currentInventory)

      // Update task state to DONE
      await saveTaskState(taskId, sku, 'CASE', 'DONE', quantity)
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function revertTask(
  taskId: string,
  sku: SKU,
  quantity: number,
  fromColumn: 'TO_CASE' | 'DONE'
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentInventory = await readSKUInventory(sku)

    if (fromColumn === 'TO_CASE') {
      // FILLED -> STAGED (reverse of fill)
      const newFilled = Math.max(0, currentInventory.filled - quantity)
      const newStaged = currentInventory.staged + quantity

      await updateInventoryLevels(sku, { filled: newFilled, staged: newStaged }, 'task_reverted')

      // Update task state back to TO_FILL
      await saveTaskState(taskId, sku, 'FILL', 'TO_FILL', quantity)
    } else if (fromColumn === 'DONE') {
      // CASED -> FILLED (reverse of case)
      const newCased = Math.max(0, currentInventory.cased - quantity)
      const newFilled = currentInventory.filled + quantity

      await updateInventoryLevels(sku, { cased: newCased, filled: newFilled }, 'task_reverted')

      // Update task state back to TO_CASE
      await saveTaskState(taskId, sku, 'CASE', 'TO_CASE', quantity)
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// TASK NOTES
// ============================================

export async function updateTaskNote(
  taskId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await saveTaskNote(taskId, note)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// CONTAINERS
// ============================================

export async function addContainer(
  sku: SKU,
  size: ContainerSize
): Promise<{ success: boolean; error?: string }> {
  try {
    await dbAddContainer(sku, size)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

export async function removeContainer(
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await dbRemoveContainer(containerId)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

// ============================================
// INVENTORY
// ============================================

export async function updateInventory(
  sku: SKU,
  updates: { cased?: number; filled?: number; staged?: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateInventoryLevels(sku, updates, 'manual_adjustment')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage }
  }
}

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
  deleteTaskState,
  addContainer as dbAddContainer,
  removeContainer as dbRemoveContainer,
  updateInventoryLevels,
  readSKUInventory,
  getSkuId,
} from '@/lib/packaging/db'
import { generateTaskQueue, generateSKUStatus } from '@/lib/packaging/allocation-engine'
// DISABLED: Materials imports - re-enable when materials module is complete
// import {
//   checkMaterialAvailability,
//   deductMaterialsForCasing,
// } from '@/actions/materials'
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

    // Calculate how much FILLED inventory is "claimed" by advanced FILL tasks
    // (tasks that were in TO_FILL but advanced to TO_CASE)
    const claimedFilled: Record<string, number> = {}
    for (const [taskKey, state] of Object.entries(taskStates)) {
      if (state.current_column === 'TO_CASE' && taskKey.startsWith('FILL-')) {
        const sku = state.sku
        claimedFilled[sku] = (claimedFilled[sku] || 0) + state.quantity
      }
    }

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
        // No persisted state - check if this CASE task is using "claimed" filled inventory
        if (task.type === 'CASE' && task.column === 'TO_CASE' && claimedFilled[task.sku]) {
          // Reduce quantity by what's claimed
          const claimed = claimedFilled[task.sku]
          const adjustedQuantity = task.quantity - claimed
          
          if (adjustedQuantity > 0) {
            mergedTasks.push({
              ...task,
              quantity: adjustedQuantity,
            })
          }
          // If adjustedQuantity <= 0, skip this task entirely (all inventory claimed)
          
          // Mark this SKU's claimed inventory as handled
          claimedFilled[task.sku] = Math.max(0, claimed - task.quantity)
        } else {
          mergedTasks.push(task)
        }
      }
    }

    // Also check for DONE tasks not in generated list
    for (const [taskKey, state] of Object.entries(taskStates)) {
      if (state.current_column === 'DONE') {
        const alreadyAdded = completedTasks.some(t => t.id === taskKey)
        if (!alreadyAdded) {
          // Extract priority from task key (e.g., CASE-CM-URGENT -> URGENT)
          const parts = taskKey.split('-')
          const lastPart = parts[parts.length - 1]
          const validPriorities = ['URGENT', 'TOMORROW', 'UPCOMING', 'BACKFILL']
          const priority = validPriorities.includes(lastPart)
            ? lastPart as 'URGENT' | 'TOMORROW' | 'UPCOMING' | 'BACKFILL'
            : 'BACKFILL'

          completedTasks.push({
            id: taskKey,
            sku: state.sku as SKU,
            quantity: state.quantity,
            priority,
            completedAt: state.completed_at || new Date().toISOString(),
          })
        }
      }
    }

    // Handle advanced FILL tasks that need CASE tasks created
    // When a FILL task is advanced to TO_CASE, we need to create a corresponding CASE task
    // even if the allocation engine assigned that FILLED inventory to a different priority
    // BUT only if there's actual FILLED inventory to back it
    // Also clean up ghost task states (TO_CASE with no filled inventory)
    const ghostTasksToDelete: string[] = []

    for (const [taskKey, state] of Object.entries(taskStates)) {
      if (state.current_column === 'TO_CASE' && taskKey.startsWith('FILL-')) {
        // This is a FILL task that was advanced - we need a CASE task for it
        // Extract priority from the task key (e.g., FILL-BB-TOMORROW -> TOMORROW)
        const parts = taskKey.split('-')
        const priority = parts[parts.length - 1] as 'URGENT' | 'TOMORROW' | 'UPCOMING'
        const sku = parts.slice(1, -1).join('-') as SKU // Handle SKUs like BB-B

        // Check if there's actual FILLED inventory for this SKU
        const skuInventory = inventory[sku]
        if (!skuInventory || skuInventory.filled < state.quantity) {
          // No filled inventory to back this task - it's a ghost, mark for deletion
          ghostTasksToDelete.push(taskKey)
          continue
        }

        // Create the corresponding CASE task key
        const caseTaskKey = `CASE-${sku}-${priority}`

        // Check if we already have this task in merged list
        const existingCaseTask = mergedTasks.find(t => t.id === caseTaskKey)

        if (!existingCaseTask) {
          // Create a CASE task for this advanced FILL task
          mergedTasks.push({
            id: caseTaskKey,
            type: 'CASE',
            sku: state.sku as SKU,
            quantity: state.quantity,
            priority: priority,
            status: 'READY',
            column: 'TO_CASE',
            sources: [{
              type: 'ORDER',
              orderId: 'advanced',
              customerName: 'Advanced from Fill',
              quantity: state.quantity,
              deliveryDate: null,
            }],
          })
        }
      }
    }

    // Clean up ghost task states in the background
    if (ghostTasksToDelete.length > 0) {
      console.log(`Cleaning up ${ghostTasksToDelete.length} ghost task states:`, ghostTasksToDelete)
      Promise.all(ghostTasksToDelete.map(taskKey => deleteTaskState(taskKey)))
        .catch(err => console.error('Error cleaning up ghost tasks:', err))
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

      // DISABLED: Materials check temporarily disabled to unblock packaging
      // TODO: Re-enable when materials inventory module is complete
      // const skuId = await getSkuId(sku)
      // const materialCheck = await checkMaterialAvailability(skuId, quantity)
      // if (!materialCheck.success) {
      //   return { success: false, error: materialCheck.error || 'Failed to check material availability' }
      // }
      // if (materialCheck.data && !materialCheck.data.available) {
      //   const shortage = materialCheck.data.materials.find(m => m.shortage > 0)
      //   if (shortage) {
      //     return {
      //       success: false,
      //       error: `Cannot case: Insufficient ${shortage.materialName}. Need ${shortage.required}, have ${shortage.available}`
      //     }
      //   }
      //   return { success: false, error: 'Insufficient materials for casing' }
      // }
      // const deductResult = await deductMaterialsForCasing(skuId, quantity)
      // if (!deductResult.success) {
      //   return { success: false, error: deductResult.error || 'Failed to deduct materials' }
      // }

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

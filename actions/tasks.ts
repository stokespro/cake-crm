'use server'

import { requireRole } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'

// Roles that can access tasks (mirrors canViewSection('tasks'))
const TASK_ROLES = ['admin', 'management', 'sales', 'agent'] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskWithCustomer {
  id: string
  agent_id: string
  customer_id: string | null
  title: string
  description: string | null
  due_date: string
  priority: number
  status: string
  completed_at: string | null
  customer: {
    business_name: string
    license_name: string | null
    omma_license: string | null
    city: string | null
  } | null
}

export interface CreateTaskInput {
  customer_id: string | null
  title: string
  description: string | null
  due_date: string
  priority: number
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch tasks for the current user (always scoped to own agent_id).
 */
export async function getTasks(): Promise<
  { data: TaskWithCustomer[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole([...TASK_ROLES])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  const { data, error } = await db
    .from('sales_tasks')
    .select(`
      *,
      customer:customers(business_name, license_name, omma_license, city)
    `)
    .eq('agent_id', auth.session.userId)
    .order('due_date', { ascending: true })

  if (error) {
    console.error('[tasks] getTasks error:', error)
    return { error: 'Failed to load tasks' }
  }

  return { data: (data as TaskWithCustomer[]) ?? [] }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new sales task for the current user.
 */
export async function createTask(input: CreateTaskInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole([...TASK_ROLES])
  if (!auth.authorized) return { error: auth.reason }

  if (!input.title?.trim()) return { error: 'Title is required' }
  if (!input.due_date) return { error: 'Due date is required' }

  const db = await createServiceClient()

  const { error } = await db.from('sales_tasks').insert({
    agent_id: auth.session.userId,
    customer_id: input.customer_id || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    due_date: input.due_date,
    priority: input.priority,
    status: 'pending',
  })

  if (error) {
    console.error('[tasks] createTask error:', error)
    return { error: 'Failed to create task' }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Mark a task complete. Only the task's owner can mark it.
 */
export async function markTaskComplete(taskId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole([...TASK_ROLES])
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  // Verify ownership before updating
  const { data: existing, error: fetchError } = await db
    .from('sales_tasks')
    .select('agent_id')
    .eq('id', taskId)
    .maybeSingle()

  if (fetchError || !existing) {
    return { error: 'Task not found' }
  }

  if (existing.agent_id !== auth.session.userId && !['admin', 'management'].includes(auth.session.role)) {
    return { error: 'Not authorized to update this task' }
  }

  const { error } = await db
    .from('sales_tasks')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    console.error('[tasks] markTaskComplete error:', error)
    return { error: 'Failed to update task' }
  }

  return {}
}

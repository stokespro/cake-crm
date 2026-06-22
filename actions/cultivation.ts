'use server'

import { requireRole } from '@/lib/auth/session'
import { createServiceClient } from '@/lib/supabase/server'
import type {
  GrowRoom,
  RoomCycle,
  CycleTemplate,
  TemplateTask,
  TaskPriority,
  TemplateType,
} from '@/types/cultivation'

// ---------------------------------------------------------------------------
// Role sets
// ---------------------------------------------------------------------------

// All roles that can view cultivation (mirrors canViewSection('cultivation'))
const VIEW_ROLES = ['admin', 'management', 'vault', 'packaging', 'standard']

// Roles that can complete/start tasks (mirrors canCompleteCultivation)
const COMPLETE_ROLES = ['admin', 'management', 'vault', 'packaging']

// Roles that can manage (create/edit/delete) cultivation data (mirrors canManageCultivation)
const MANAGE_ROLES = ['admin', 'management']

// ---------------------------------------------------------------------------
// Grow Rooms — reads
// ---------------------------------------------------------------------------

export async function getGrowRooms(): Promise<
  { data: GrowRoom[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('grow_rooms')
    .select('*')
    .order('room_number')

  if (error) {
    console.error('[cultivation] getGrowRooms error:', error)
    return { error: 'Failed to load grow rooms' }
  }
  return { data: data as GrowRoom[] }
}

// ---------------------------------------------------------------------------
// Room Cycles — reads
// ---------------------------------------------------------------------------

export async function getActiveCycles(): Promise<
  { data: RoomCycle[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('room_cycles')
    .select('*')
    .eq('status', 'active')

  if (error) {
    console.error('[cultivation] getActiveCycles error:', error)
    return { error: 'Failed to load active cycles' }
  }
  return { data: data as RoomCycle[] }
}

export async function getRoomCycleHistory(roomId: string): Promise<
  { data: unknown[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('room_cycles')
    .select('*, template:cycle_templates(name), tasks:cultivation_tasks(id, status)')
    .eq('room_id', roomId)
    .order('start_date', { ascending: false })

  if (error) {
    console.error('[cultivation] getRoomCycleHistory error:', error)
    return { error: 'Failed to load cycle history' }
  }
  return { data: data ?? [] }
}

// ---------------------------------------------------------------------------
// Cultivation Tasks — reads
// ---------------------------------------------------------------------------

export async function getCultivationTasks(): Promise<
  { data: unknown[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('cultivation_tasks')
    .select(
      '*, room:grow_rooms(id, room_name, room_number), assigned_user:users!cultivation_tasks_assigned_to_fkey(id, name), completed_by_user:users!cultivation_tasks_completed_by_fkey(id, name)'
    )
    .or('frequency.is.null,recurring_parent_id.not.is.null')
    .order('due_date')

  if (error) {
    console.error('[cultivation] getCultivationTasks error:', error)
    return { error: 'Failed to load tasks' }
  }
  return { data: data ?? [] }
}

export async function getCultivationTaskSummary(): Promise<
  {
    data: { id: string; status: string; due_date: string; completed_at: string | null; room_id: string | null }[]
    error?: never
  } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('cultivation_tasks')
    .select('id, status, due_date, completed_at, room_id')
    .or('frequency.is.null,recurring_parent_id.not.is.null')

  if (error) {
    console.error('[cultivation] getCultivationTaskSummary error:', error)
    return { error: 'Failed to load task summary' }
  }
  return { data: data ?? [] }
}

export async function getMyTodayTasks(todayStr: string): Promise<
  { data: unknown[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('cultivation_tasks')
    .select(
      '*, room:grow_rooms(id, room_name, room_number), assigned_user:users!cultivation_tasks_assigned_to_fkey(id, name)'
    )
    // Use server-side verified userId from session — never trust a client-passed id
    .eq('assigned_to', auth.session.userId)
    .in('status', ['pending', 'in_progress'])
    .or('frequency.is.null,recurring_parent_id.not.is.null')
    .lte('due_date', todayStr)
    .order('due_date')
    .limit(10)

  if (error) {
    console.error('[cultivation] getMyTodayTasks error:', error)
    return { error: 'Failed to load your tasks' }
  }
  return { data: data ?? [] }
}

export async function getCultivationTasksForDisplay(todayStr: string): Promise<
  { data: unknown[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('cultivation_tasks')
    .select(
      '*, room:grow_rooms(id, room_name, room_number), assigned_user:users!cultivation_tasks_assigned_to_fkey(id, name)'
    )
    .in('status', ['pending', 'in_progress'])
    .lte('due_date', todayStr)
    .or('frequency.is.null,recurring_parent_id.not.is.null')
    .order('due_date', { ascending: true })
    .order('priority', { ascending: false })

  if (error) {
    console.error('[cultivation] getCultivationTasksForDisplay error:', error)
    return { error: 'Failed to load tasks for display' }
  }
  return { data: data ?? [] }
}

export async function getCultivationUsers(): Promise<
  { data: { id: string; name: string; role: string }[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('users')
    .select('id, name, role')
    .in('role', ['admin', 'management', 'vault', 'packaging', 'standard'])
    .order('name')

  if (error) {
    console.error('[cultivation] getCultivationUsers error:', error)
    return { error: 'Failed to load users' }
  }
  return { data: data ?? [] }
}

// ---------------------------------------------------------------------------
// Cultivation Tasks — mutations
// ---------------------------------------------------------------------------

export interface CompleteTaskInput {
  taskId: string
  completedBy: string
  notes: string | null
}

export async function completeTask(input: CompleteTaskInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(COMPLETE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('cultivation_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: input.completedBy,
      completion_notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.taskId)

  if (error) {
    console.error('[cultivation] completeTask error:', error)
    return { error: 'Failed to complete task' }
  }
  return {}
}

export async function startTask(taskId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(COMPLETE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('cultivation_tasks')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) {
    console.error('[cultivation] startTask error:', error)
    return { error: 'Failed to start task' }
  }
  return {}
}

export async function deleteTask(taskId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('cultivation_tasks').delete().eq('id', taskId)

  if (error) {
    console.error('[cultivation] deleteTask error:', error)
    return { error: 'Failed to delete task' }
  }
  return {}
}

export interface CreateTaskInput {
  title: string
  description: string | null
  room_id: string | null
  due_date: string
  priority: TaskPriority
  assigned_to: string | null
  estimated_minutes: number | null
  task_type: string
  frequency: string | null
  day_of_week: number | null
  created_by: string
}

export async function createTask(input: CreateTaskInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('cultivation_tasks').insert({
    ...input,
    status: 'pending',
  })

  if (error) {
    console.error('[cultivation] createTask error:', error)
    return { error: 'Failed to create task' }
  }
  return {}
}

export interface UpdateTaskInput {
  title: string
  description: string | null
  room_id: string | null
  due_date: string
  priority: TaskPriority
  assigned_to: string | null
  estimated_minutes: number | null
  task_type: string
  frequency: string | null
  day_of_week: number | null
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('cultivation_tasks')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) {
    console.error('[cultivation] updateTask error:', error)
    return { error: 'Failed to update task' }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Grow Rooms — mutations
// ---------------------------------------------------------------------------

export interface UpsertGrowRoomInput {
  room_number: number
  room_name: string
  pairing_group: string | null
  notes: string | null
}

export async function createGrowRoom(input: UpsertGrowRoomInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('grow_rooms')
    .insert({ ...input, current_phase: 'empty' })

  if (error) {
    console.error('[cultivation] createGrowRoom error:', error)
    return { error: 'Failed to add room' }
  }
  return {}
}

export async function updateGrowRoom(roomId: string, input: UpsertGrowRoomInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('grow_rooms')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', roomId)

  if (error) {
    console.error('[cultivation] updateGrowRoom error:', error)
    return { error: 'Failed to update room' }
  }
  return {}
}

export async function deleteGrowRoom(roomId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('grow_rooms').delete().eq('id', roomId)

  if (error) {
    console.error('[cultivation] deleteGrowRoom error:', error)
    return { error: 'Failed to remove room' }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Cycle Templates — reads
// ---------------------------------------------------------------------------

export async function getCycleTemplates(): Promise<
  { data: unknown[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('cycle_templates')
    .select('*, template_tasks(id)')
    .order('template_type', { ascending: false }) // master first
    .order('name')

  if (error) {
    console.error('[cultivation] getCycleTemplates error:', error)
    return { error: 'Failed to load templates' }
  }
  return { data: data ?? [] }
}

export async function getActiveMasterTemplates(): Promise<
  { data: CycleTemplate[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('cycle_templates')
    .select('*')
    .eq('template_type', 'master')
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('[cultivation] getActiveMasterTemplates error:', error)
    return { error: 'Failed to load master templates' }
  }
  return { data: data as CycleTemplate[] }
}

export async function getTemplateTasks(templateId: string): Promise<
  { data: TemplateTask[]; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data, error } = await db
    .from('template_tasks')
    .select('*')
    .eq('template_id', templateId)
    .order('day_number')
    .order('sort_order')

  if (error) {
    console.error('[cultivation] getTemplateTasks error:', error)
    return { error: 'Failed to load template tasks' }
  }
  return { data: data as TemplateTask[] }
}

// ---------------------------------------------------------------------------
// Cycle Templates — mutations
// ---------------------------------------------------------------------------

export interface UpsertTemplateInput {
  name: string
  template_type: TemplateType
  phase: string | null
  duration_days: number
  description: string | null
  is_active: boolean
}

export async function createCycleTemplate(
  input: UpsertTemplateInput,
  createdBy: string
): Promise<{ error?: never } | { error: string }> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('cycle_templates').insert({ ...input, created_by: createdBy })

  if (error) {
    console.error('[cultivation] createCycleTemplate error:', error)
    return { error: 'Failed to create template' }
  }
  return {}
}

export async function updateCycleTemplate(
  templateId: string,
  input: UpsertTemplateInput
): Promise<{ error?: never } | { error: string }> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('cycle_templates')
    .update(input)
    .eq('id', templateId)

  if (error) {
    console.error('[cultivation] updateCycleTemplate error:', error)
    return { error: 'Failed to update template' }
  }
  return {}
}

export async function toggleTemplateActive(
  templateId: string,
  isActive: boolean
): Promise<{ error?: never } | { error: string }> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db
    .from('cycle_templates')
    .update({ is_active: isActive })
    .eq('id', templateId)

  if (error) {
    console.error('[cultivation] toggleTemplateActive error:', error)
    return { error: 'Failed to update template' }
  }
  return {}
}

export async function deleteCycleTemplate(templateId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  // Delete tasks first, then the template
  await db.from('template_tasks').delete().eq('template_id', templateId)

  const { error } = await db.from('cycle_templates').delete().eq('id', templateId)

  if (error) {
    console.error('[cultivation] deleteCycleTemplate error:', error)
    return { error: 'Failed to delete template' }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Template Tasks — mutations
// ---------------------------------------------------------------------------

export interface UpsertTemplateTaskInput {
  name: string
  description: string | null
  day_number: number
  estimated_minutes: number | null
  priority: TaskPriority
  stage: string | null
}

export async function createTemplateTask(
  templateId: string,
  input: UpsertTemplateTaskInput,
  sortOrder: number
): Promise<{ error?: never } | { error: string }> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('template_tasks').insert({
    ...input,
    template_id: templateId,
    sort_order: sortOrder,
  })

  if (error) {
    console.error('[cultivation] createTemplateTask error:', error)
    return { error: 'Failed to create task' }
  }
  return {}
}

export async function updateTemplateTask(
  taskId: string,
  input: UpsertTemplateTaskInput
): Promise<{ error?: never } | { error: string }> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('template_tasks').update(input).eq('id', taskId)

  if (error) {
    console.error('[cultivation] updateTemplateTask error:', error)
    return { error: 'Failed to update task' }
  }
  return {}
}

export async function deleteTemplateTask(taskId: string): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { error } = await db.from('template_tasks').delete().eq('id', taskId)

  if (error) {
    console.error('[cultivation] deleteTemplateTask error:', error)
    return { error: 'Failed to delete task' }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Start Cycle — complex multi-table operation
// ---------------------------------------------------------------------------

export interface StartCycleInput {
  roomId: string
  templateId: string
  cycleNumber: number | null
  domeStart: string
  vegStart: string
  flowerStart: string
  harvestDate: string
  dryStart: string
  trimStart: string
  notes: string | null
  userId: string
}

export async function startCycle(input: StartCycleInput): Promise<
  { taskCount: number; cycleNum: number | null; error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()

  // 1. Create room_cycles with milestone dates
  const { data: newCycle, error: cycleErr } = await db
    .from('room_cycles')
    .insert({
      room_id: input.roomId,
      template_id: input.templateId,
      current_stage: 'dome',
      cycle_number: input.cycleNumber,
      start_date: input.domeStart,
      expected_end_date: input.trimStart,
      dome_start: input.domeStart,
      veg_start: input.vegStart,
      flower_start: input.flowerStart,
      harvest_date: input.harvestDate,
      dry_start: input.dryStart,
      trim_start: input.trimStart,
      status: 'active',
      notes: input.notes,
      created_by: input.userId,
    })
    .select('id')
    .single()

  if (cycleErr || !newCycle) {
    console.error('[cultivation] startCycle cycle insert error:', cycleErr)
    return { error: 'Failed to create cycle' }
  }

  // 2. Update grow_rooms
  await db
    .from('grow_rooms')
    .update({
      current_phase: 'dome',
      phase_start_date: input.domeStart,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.roomId)

  // 3. Generate all tasks from master template using milestone-anchored dates
  const { data: templateTasks } = await db
    .from('template_tasks')
    .select('*')
    .eq('template_id', input.templateId)
    .order('day_number')
    .order('sort_order')

  const milestones: Record<string, string> = {
    dome: input.domeStart,
    veg: input.vegStart,
    flower: input.flowerStart,
    harvest: input.harvestDate,
    dry: input.dryStart,
    trim: input.trimStart,
  }

  let taskCount = 0
  if (templateTasks && templateTasks.length > 0) {
    const tasksToInsert = templateTasks
      .filter((tt: TemplateTask) => tt.stage && milestones[tt.stage])
      .map((tt: TemplateTask) => {
        const milestoneDate = milestones[tt.stage!]
        const milestoneDateObj = new Date(milestoneDate + 'T00:00:00')
        const dueDate = new Date(milestoneDateObj)
        if (tt.day_number > 0) {
          dueDate.setDate(dueDate.getDate() + (tt.day_number - 1))
        } else {
          dueDate.setDate(dueDate.getDate() + tt.day_number)
        }
        return {
          room_cycle_id: newCycle.id,
          room_id: input.roomId,
          template_task_id: tt.id,
          title: tt.name,
          description: tt.description,
          task_type: 'scheduled' as const,
          phase: tt.stage,
          day_number: tt.day_number,
          due_date: dueDate.toISOString().split('T')[0],
          priority: tt.priority,
          estimated_minutes: tt.estimated_minutes,
          status: 'pending' as const,
          created_by: input.userId,
        }
      })

    await db.from('cultivation_tasks').insert(tasksToInsert)
    taskCount = tasksToInsert.length
  }

  return { taskCount, cycleNum: input.cycleNumber }
}

// ---------------------------------------------------------------------------
// Advance Stage — updates room_cycles and grow_rooms
// ---------------------------------------------------------------------------

export interface AdvanceStageInput {
  roomId: string
  cycleId: string
  nextStage: string
}

export async function advanceStage(input: AdvanceStageInput): Promise<
  { error?: never } | { error: string }
> {
  const auth = await requireRole(MANAGE_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const [cycleResult, roomResult] = await Promise.all([
    db
      .from('room_cycles')
      .update({ current_stage: input.nextStage, updated_at: new Date().toISOString() })
      .eq('id', input.cycleId),
    db
      .from('grow_rooms')
      .update({
        current_phase: input.nextStage,
        phase_start_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.roomId),
  ])

  if (cycleResult.error || roomResult.error) {
    console.error('[cultivation] advanceStage error:', cycleResult.error || roomResult.error)
    return { error: 'Failed to advance stage' }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Get last cycle number for a room (for auto-increment)
// ---------------------------------------------------------------------------

export async function getLastCycleNumber(roomId: string): Promise<
  { data: number | null; error?: never } | { data?: never; error: string }
> {
  const auth = await requireRole(VIEW_ROLES)
  if (!auth.authorized) return { error: auth.reason }

  const db = await createServiceClient()
  const { data } = await db
    .from('room_cycles')
    .select('cycle_number')
    .eq('room_id', roomId)
    .not('cycle_number', 'is', null)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { data: data?.cycle_number ?? null }
}

// ---------------------------------------------------------------------------
// Generate recurring tasks (server-side)
// ---------------------------------------------------------------------------

/**
 * How many days ahead to generate recurring task instances.
 */
const LOOKAHEAD_DAYS = 14

/** Add `days` to a YYYY-MM-DD string and return a new YYYY-MM-DD string. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Build an ordered list of due-date strings that need to be generated for a
 * given recurrence pattern.
 */
function dueDatesNeeded(
  frequency: string,
  lastGenStr: string | null,
  todayStr: string,
  horizonStr: string,
  dayOfWeek: number | null,
  createdAt: string
): string[] {
  const dates: string[] = []

  switch (frequency) {
    case 'daily': {
      const startStr = lastGenStr ? addDaysToDateStr(lastGenStr, 1) : todayStr
      let cursor = startStr
      while (cursor <= horizonStr) {
        dates.push(cursor)
        cursor = addDaysToDateStr(cursor, 1)
      }
      break
    }

    case 'weekly': {
      const targetDay = dayOfWeek ?? 1
      const todayDate = new Date(todayStr + 'T00:00:00')
      const dayNum = todayDate.getDay() || 7
      const daysUntilTarget = ((targetDay - dayNum + 7) % 7) || 7
      const firstOccurrence = addDaysToDateStr(todayStr, daysUntilTarget === 7 ? 0 : daysUntilTarget)
      let cursor = firstOccurrence
      while (cursor <= horizonStr) {
        if (!lastGenStr || cursor > lastGenStr) {
          dates.push(cursor)
        }
        cursor = addDaysToDateStr(cursor, 7)
      }
      break
    }

    case 'biweekly': {
      const targetDay = dayOfWeek ?? 1
      const todayDate = new Date(todayStr + 'T00:00:00')
      const dayNum = todayDate.getDay() || 7
      const daysUntilTarget = ((targetDay - dayNum + 7) % 7) || 7
      const firstOccurrence = addDaysToDateStr(todayStr, daysUntilTarget === 7 ? 0 : daysUntilTarget)
      const createdDate = new Date(createdAt)
      let cursor = firstOccurrence
      while (cursor <= horizonStr) {
        const weeksSinceCreation = Math.floor(
          (new Date(cursor + 'T00:00:00').getTime() - createdDate.getTime()) /
            (7 * 24 * 60 * 60 * 1000)
        )
        if (weeksSinceCreation % 2 === 0 && (!lastGenStr || cursor > lastGenStr)) {
          dates.push(cursor)
        }
        cursor = addDaysToDateStr(cursor, 7)
      }
      break
    }

    case 'monthly': {
      const todayDate = new Date(todayStr + 'T00:00:00')
      const year = todayDate.getFullYear()
      const month = todayDate.getMonth()
      for (let i = 0; i < 3; i++) {
        const monthStart = new Date(year, month + i, 1)
        const monthStartStr = monthStart.toISOString().split('T')[0]
        if (monthStartStr <= horizonStr && (!lastGenStr || monthStartStr > lastGenStr)) {
          dates.push(monthStartStr)
        }
      }
      break
    }
  }

  return dates
}

export async function generateRecurringTasksAction(): Promise<
  { generated: number; error?: never } | { error: string }
> {
  try {
    const auth = await requireRole(VIEW_ROLES)
    if (!auth.authorized) return { generated: 0 }

    const db = await createServiceClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    const horizonStr = addDaysToDateStr(todayStr, LOOKAHEAD_DAYS)

    // Fetch all recurring definitions
    const { data: definitions, error } = await db
      .from('cultivation_tasks')
      .select('*')
      .not('frequency', 'is', null)
      .is('recurring_parent_id', null)
      .order('created_at')

    if (error || !definitions) return { generated: 0 }

    let generated = 0

    for (const def of definitions) {
      const needed = dueDatesNeeded(
        def.frequency,
        def.last_generated_date ?? null,
        todayStr,
        horizonStr,
        def.day_of_week ?? null,
        def.created_at
      )

      if (needed.length === 0) continue

      // Fetch existing children to avoid duplicates
      const { data: existing } = await db
        .from('cultivation_tasks')
        .select('due_date')
        .eq('recurring_parent_id', def.id)
        .gte('due_date', needed[0])
        .lte('due_date', needed[needed.length - 1])

      const existingDates = new Set((existing ?? []).map((r: { due_date: string }) => r.due_date))

      const toInsert = needed
        .filter((d) => !existingDates.has(d))
        .map((dueDate) => ({
          title: def.title,
          description: def.description,
          task_type: 'recurring',
          room_id: def.room_id,
          due_date: dueDate,
          priority: def.priority,
          estimated_minutes: def.estimated_minutes,
          assigned_to: def.assigned_to,
          status: 'pending',
          recurring_parent_id: def.id,
          frequency: null,
          created_by: def.created_by,
        }))

      if (toInsert.length === 0) continue

      const { error: insertError } = await db.from('cultivation_tasks').insert(toInsert)

      if (!insertError) {
        generated += toInsert.length
        const maxDate = toInsert[toInsert.length - 1].due_date
        await db
          .from('cultivation_tasks')
          .update({ last_generated_date: maxDate })
          .eq('id', def.id)
      }
    }

    return { generated }
  } catch (err) {
    // Never block page load — recurring generation is best-effort
    console.error('[cultivation] generateRecurringTasksAction unexpected error:', err)
    return { generated: 0 }
  }
}

import { ToolResult } from './types'

export async function queryTasks(supabase: any, params: {
  assigned_to?: string
  room_number?: number
  status?: string
  overdue_only?: boolean
  due_today?: boolean
  limit?: number
}): Promise<ToolResult> {
  try {
    let query = supabase
      .from('cultivation_tasks')
      .select('*, room:grow_rooms(room_name, room_number), assigned_user:users!cultivation_tasks_assigned_to_fkey(name)')
      .or('frequency.is.null,recurring_parent_id.not.is.null') // Exclude recurring definitions

    if (params.assigned_to) {
      query = query.eq('assigned_to', params.assigned_to)
    }
    if (params.room_number) {
      // Need to get room_id from room_number
      const { data: room } = await supabase
        .from('grow_rooms')
        .select('id')
        .eq('room_number', params.room_number)
        .single()
      if (room) query = query.eq('room_id', room.id)
    }
    if (params.status) {
      query = query.eq('status', params.status)
    }
    if (params.overdue_only) {
      const today = new Date().toISOString().split('T')[0]
      query = query.lt('due_date', today).in('status', ['pending', 'in_progress'])
    }
    if (params.due_today) {
      const today = new Date().toISOString().split('T')[0]
      query = query.eq('due_date', today).in('status', ['pending', 'in_progress'])
    }

    query = query.order('due_date').limit(params.limit || 20)

    const { data, error } = await query
    if (error) throw error

    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function completeTask(supabase: any, params: {
  task_id: string
  notes?: string
  completed_by: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('cultivation_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: params.completed_by,
        completion_notes: params.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.task_id)
      .select('title, room:grow_rooms(room_name)')
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createTask(supabase: any, params: {
  title: string
  description?: string
  room_number?: number
  assigned_to?: string
  due_date: string
  priority?: string
  created_by: string
}): Promise<ToolResult> {
  try {
    let roomId = null
    if (params.room_number) {
      const { data: room } = await supabase
        .from('grow_rooms')
        .select('id')
        .eq('room_number', params.room_number)
        .single()
      roomId = room?.id
    }

    const { data, error } = await supabase
      .from('cultivation_tasks')
      .insert({
        title: params.title,
        description: params.description || null,
        room_id: roomId,
        assigned_to: params.assigned_to || null,
        due_date: params.due_date,
        priority: params.priority || 'medium',
        task_type: 'adhoc',
        status: 'pending',
        created_by: params.created_by,
      })
      .select('title')
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function editTask(supabase: any, params: {
  task_id: string
  assigned_to?: string
  priority?: string
  due_date?: string
  status?: string
}): Promise<ToolResult> {
  try {
    const updates: any = { updated_at: new Date().toISOString() }
    if (params.assigned_to !== undefined) updates.assigned_to = params.assigned_to
    if (params.priority) updates.priority = params.priority
    if (params.due_date) updates.due_date = params.due_date
    if (params.status) updates.status = params.status

    const { data, error } = await supabase
      .from('cultivation_tasks')
      .update(updates)
      .eq('id', params.task_id)
      .select('title')
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getRoomStatus(supabase: any, params: {
  room_number?: number
}): Promise<ToolResult> {
  try {
    let query = supabase
      .from('grow_rooms')
      .select('*')
      .order('room_number')

    if (params.room_number) {
      query = query.eq('room_number', params.room_number)
    }

    const { data: rooms, error } = await query
    if (error) throw error

    // Get task counts per room
    for (const room of rooms) {
      const today = new Date().toISOString().split('T')[0]
      const { count: pendingCount } = await supabase
        .from('cultivation_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .in('status', ['pending', 'in_progress'])

      const { count: overdueCount } = await supabase
        .from('cultivation_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', today)

      room.pending_tasks = pendingCount || 0
      room.overdue_tasks = overdueCount || 0

      // Compute current week
      if (room.phase_start_date && room.current_phase !== 'empty') {
        const start = new Date(room.phase_start_date + 'T00:00:00')
        const now = new Date()
        room.current_week = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
      }
    }

    return { success: true, data: rooms }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getUserByName(supabase: any, params: {
  name: string
}): Promise<ToolResult> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role')
      .ilike('name', `%${params.name}%`)

    if (error) throw error
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

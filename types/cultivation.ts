export type GrowPhase = 'empty' | 'dome' | 'veg' | 'flower' | 'harvest' | 'drying_curing'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type CultivationTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type CultivationTaskType = 'scheduled' | 'adhoc'
export type CycleStatus = 'active' | 'completed' | 'cancelled'

export const PHASE_CONFIG: Record<GrowPhase, { label: string; weeks: number; color: string }> = {
  empty:         { label: 'Empty',         weeks: 0,  color: 'gray' },
  dome:          { label: 'Clone Dome',    weeks: 2,  color: 'teal' },
  veg:           { label: 'Veg',           weeks: 4,  color: 'green' },
  flower:        { label: 'Flower',        weeks: 9,  color: 'purple' },
  harvest:       { label: 'Harvest',       weeks: 1,  color: 'amber' },
  drying_curing: { label: 'Drying/Curing', weeks: 2,  color: 'orange' },
}

export interface GrowRoom {
  id: string
  room_number: number
  room_name: string
  pairing_group: string | null
  current_phase: GrowPhase
  phase_start_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CycleTemplate {
  id: string
  name: string
  phase: string
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TemplateTask {
  id: string
  template_id: string
  name: string
  description: string | null
  week_number: number
  day_of_week: number | null
  estimated_minutes: number | null
  priority: TaskPriority
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RoomCycle {
  id: string
  room_id: string
  template_id: string | null
  phase: string
  start_date: string
  expected_end_date: string | null
  actual_end_date: string | null
  status: CycleStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CultivationTask {
  id: string
  room_cycle_id: string | null
  room_id: string | null
  template_task_id: string | null
  title: string
  description: string | null
  task_type: CultivationTaskType
  phase: string | null
  week_number: number | null
  due_date: string
  priority: TaskPriority
  estimated_minutes: number | null
  assigned_to: string | null
  assigned_group: string | null
  status: CultivationTaskStatus
  completed_at: string | null
  completed_by: string | null
  completion_notes: string | null
  attachments: any[]
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined
  room?: GrowRoom
  assigned_user?: { id: string; name: string }
  completed_by_user?: { id: string; name: string }
}

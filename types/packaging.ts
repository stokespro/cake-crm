// Packaging-specific types

export const SKU_LIST = [
  'BG', 'BG-B', 'BB', 'BB-B', 'BIS', 'BIS-B', 'CM', 'CM-B',
  'CR', 'CR-B', 'MAC', 'MAC-B', 'VZ', 'VZ-B'
] as const

export type SKU = typeof SKU_LIST[number]

export interface InventoryLevel {
  sku_id: string
  sku_code: string
  sku_name: string
  cased: number
  filled: number
  staged: number
}

export type PriorityTier = 'URGENT' | 'TOMORROW' | 'UPCOMING' | 'BACKFILL'

export const PRIORITY_COLORS: Record<PriorityTier, string> = {
  URGENT: 'bg-red-500',
  TOMORROW: 'bg-orange-500',
  UPCOMING: 'bg-amber-500',
  BACKFILL: 'bg-green-500',
}

export const PRIORITY_LABELS: Record<PriorityTier, string> = {
  URGENT: 'Urgent',
  TOMORROW: 'Tomorrow',
  UPCOMING: 'Upcoming',
  BACKFILL: 'Backfill',
}

export type TaskType = 'FILL' | 'CASE'
export type TaskColumn = 'TO_FILL' | 'TO_CASE' | 'DONE'

export interface PackagingTask {
  id: string
  task_key: string
  sku: string
  task_type: TaskType
  current_column: TaskColumn
  quantity: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderWithItems {
  id: string
  order_number: string
  customer_name: string
  status: string
  requested_delivery_date: string | null
  order_items: {
    sku_code: string
    quantity: number
  }[]
}

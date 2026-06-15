import type { PriorityTier, TaskType } from './types'

// A packaged SKU card shown on the board (aggregated from tasks)
export interface SkuBoardCard {
  sku: string
  taskType: TaskType
  totalQuantity: number
  urgentUnits: number
  tomorrowUnits: number
  upcomingUnits: number
  backfillUnits: number
  orderLines: OrderLine[]
  hasBlocked: boolean
  activeClaim: ActiveClaimSummary | null
}

// A single order line within a SKU card
export interface OrderLine {
  orderId: string | null
  customerName: string | null
  quantity: number
  priority: PriorityTier
  deliveryDate: string | null
}

// Summary of an active packaging claim (as stored on SkuBoardCard)
export interface ActiveClaimSummary {
  id: string
  claimedByUserId: string
  claimedByName: string
  sessionUserId: string | null
  sessionUserName: string | null
  claimedQuantity: number
  claimedAt: string
  expiresAt: string
}

// Extended claim with lookup fields returned from readActiveClaims
export interface ActiveClaimRecord extends ActiveClaimSummary {
  taskKey: string
  sku: string
  taskType: import('./types').TaskType
}

// A completed item shown in the DONE column
export interface DoneItem {
  id: string
  sku: string
  taskType: TaskType
  completedQuantity: number
  completedByName: string
  completedAt: string
}

// Full board data returned from getBoardData
export interface BoardData {
  toFillCards: SkuBoardCard[]
  toCaseCards: SkuBoardCard[]
  doneItems: DoneItem[]
  lastUpdated: string
  error?: string
}

// A user eligible to be a packaging worker
export interface PackagingUser {
  id: string
  name: string
  role: string
}

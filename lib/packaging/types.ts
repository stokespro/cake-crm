// SKU identifiers - 14 total products
export const SKU_LIST = [
  'BG', 'BG-B', 'BB', 'BB-B', 'BIS', 'BIS-B', 'CM', 'CM-B',
  'CR', 'CR-B', 'MAC', 'MAC-B', 'VZ', 'VZ-B'
] as const;

export type SKU = typeof SKU_LIST[number];

// Column mapping: C=0, D=1, ... P=13
export const SKU_COLUMN_MAP: Record<SKU, number> = {
  'BG': 0, 'BG-B': 1, 'BB': 2, 'BB-B': 3,
  'BIS': 4, 'BIS-B': 5, 'CM': 6, 'CM-B': 7,
  'CR': 8, 'CR-B': 9, 'MAC': 10, 'MAC-B': 11,
  'VZ': 12, 'VZ-B': 13
};

// Inventory levels per SKU
export interface InventoryLevels {
  cased: number;   // Row 2 - finished units ready to sell
  staged: number;  // Row 3 - bulk containers ready for packaging
  filled: number;  // Row 4 - step 1 complete (weighed/filled)
}

// Full inventory map
export type InventoryMap = Record<SKU, InventoryLevels>;

// Order status from sheet
export type OrderStatus = 'Pending' | 'Confirmed' | 'Packed' | 'Delivered' | '';

// Line item within an order
export interface OrderLineItem {
  sku: SKU;
  quantity: number;
}

// Order backup stored in Column S (JSON) for reference after delivery
export interface OrderBackup {
  quantities: Partial<Record<SKU, number>>;
  deliveredOn: string;  // Date string when delivered
}

// Customer order from sheet
export interface Order {
  id: string;
  customerName: string;         // Column A
  status: OrderStatus;          // Column B
  deliveryDate: Date | null;    // Column Q - scheduled delivery date
  lastDeliveryDate: string;     // Column R - actual date when last delivered
  orderBackup: OrderBackup | null; // Column S - JSON backup of last delivered order
  lineItems: OrderLineItem[];
  rowNumber: number;            // For sheet updates
}

// Priority tiers (in order of urgency)
export type PriorityTier = 'URGENT' | 'TOMORROW' | 'UPCOMING' | 'BACKFILL';

// Priority colors for styling
export const PRIORITY_COLORS: Record<PriorityTier, { bg: string; text: string; border: string }> = {
  URGENT: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  TOMORROW: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
  UPCOMING: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' },
  BACKFILL: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
};

// Badge colors for priority
export const PRIORITY_BADGE_COLORS: Record<PriorityTier, string> = {
  URGENT: 'bg-red-600',
  TOMORROW: 'bg-orange-600',
  UPCOMING: 'bg-amber-600',
  BACKFILL: 'bg-green-600',
};

// Task type
export type TaskType = 'FILL' | 'CASE';

// Kanban column
export type KanbanColumn = 'TO_FILL' | 'TO_CASE' | 'DONE';

// Task status
export type TaskStatus = 'READY' | 'BLOCKED' | 'IN_PROGRESS';

// Container size
export type ContainerSize = 1 | 2 | 3 | 4 | 8;

// Container status
export type ContainerStatus = 'AVAILABLE' | 'USED';

// Source of a task (which order/backfill it serves)
export interface TaskSource {
  type: 'ORDER' | 'BACKFILL';
  orderId?: string;
  customerName?: string;
  quantity: number;
  deliveryDate?: Date | string | null;
}

// Packaging task
export interface Task {
  id: string;
  sku: SKU;
  type: TaskType;
  column: KanbanColumn;
  quantity: number;
  priority: PriorityTier;
  status: TaskStatus;
  sources: TaskSource[];
  blockedReason?: string;
  note?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Completed task (stored in localStorage for DONE column)
export interface CompletedTask {
  id: string;
  sku: SKU;
  quantity: number;
  priority: PriorityTier;
  completedAt: string;
  sources?: TaskSource[];
}

// SKU status for inventory bar display
export interface SKUStatus {
  sku: SKU;
  name?: string;
  cased: number;
  filled: number;
  staged: number;
  pending: number;    // Sum of pending/confirmed orders
  gap: number;        // Shortfall if any (demand - available)
  lowStock: boolean;  // STAGED < 4 (partial container)
}

// Dashboard data returned from API
export interface DashboardData {
  inventory: SKUStatus[];
  tasks: Task[];
  completedTasks: CompletedTask[];
  taskNotes: Record<string, string>;
  containers: Container[];
  lastUpdated: string;
  error?: string;
}

// Container in staging
export interface Container {
  id: string;
  sku: SKU;
  size: ContainerSize;
  dateAdded: Date | string;
  status: ContainerStatus;
  rowNumber: number;
}

// Demand summary by SKU
export interface DemandSummary {
  total: number;
  urgent: number;
  tomorrow: number;
  upcoming: number;
}

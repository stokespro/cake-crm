export type UserRole = 'agent' | 'management' | 'admin' | 'packaging' | 'vault'
export type TaskStatus = 'pending' | 'complete'
export type OrderStatus = 'pending' | 'confirmed' | 'packed' | 'delivered' | 'cancelled'
export type ContactMethod = 'phone' | 'email' | 'in-person' | 'text'

export interface Profile {
  id: string
  email?: string
  pin?: string
  name: string
  role: UserRole
  created_at: string
  updated_at?: string
}

// Customer (formerly DispensaryProfile)
export interface Customer {
  id: string
  business_name: string
  address?: string
  phone_number?: string
  email?: string
  omma_license?: string
  ob_license?: string
  created_at: string
  updated_at: string
}

// Alias for backward compatibility during migration
export type DispensaryProfile = Customer

// SKU (finished packaged products)
export interface SKU {
  id: string
  code: string
  name: string
  strain_id: string
  product_type_id: string
  price_per_unit?: number
  description?: string
  thc_percentage?: number
  cbd_percentage?: number
  in_stock: boolean
  created_at: string
  updated_at: string
  pricing?: SKUPricing[]
}

// Legacy Product type for backward compatibility
export interface Product {
  id: string
  strain_name: string
  price_per_unit: number
  description?: string
  thc_percentage?: number
  cbd_percentage?: number
  category?: string
  in_stock: boolean
  created_at: string
  updated_at: string
  pricing?: ProductPricing[]
}

export interface ProductPricing {
  id: string
  product_id: string
  min_quantity: number
  price: number
  created_at: string
  updated_at: string
}

// SKU Pricing (tiered pricing per SKU)
export interface SKUPricing {
  id: string
  sku_id: string
  min_quantity: number
  price: number
  created_at: string
  updated_at?: string
}

export interface Communication {
  id: string
  agent_id: string
  customer_id: string
  client_name?: string
  interaction_date: string
  notes: string
  contact_method?: ContactMethod
  follow_up_required: boolean
  created_at: string
  updated_at: string
  is_edited?: boolean
  last_edited_at?: string
  last_edited_by?: string
  customer?: Customer
  agent?: Profile
  // Legacy alias
  dispensary?: Customer
}

export interface Task {
  id: string
  agent_id: string
  customer_id?: string
  title: string
  description?: string
  due_date: string
  status: TaskStatus
  priority: number // 1=high, 2=medium, 3=low
  created_at: string
  updated_at: string
  completed_at?: string
  customer?: Customer
  agent?: Profile
  // Legacy alias
  dispensary?: Customer
}

export interface Order {
  id: string
  order_number?: string
  customer_id: string
  agent_id?: string
  order_date: string
  order_notes?: string
  requested_delivery_date?: string
  confirmed_delivery_date?: string
  actual_delivery_date?: string
  packed_at?: string
  delivered_at?: string
  status: OrderStatus
  total_price: number
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
  last_edited_at?: string
  last_edited_by?: string
  customer?: Customer
  agent?: Profile
  order_items?: OrderItem[]
  // Legacy aliases
  dispensary?: Customer
  dispensary_id?: string
  order_id?: string
  final_delivery_date?: string
}

export interface EditFormData {
  [key: string]: string | number | boolean | Date | null | undefined
}

export interface UpdateData {
  [key: string]: string | number | boolean | Date | null | undefined
}

export interface UserActivity {
  id: string
  user_id: string
  activity_type: string
  activity_description: string
  created_at: string
  metadata?: Record<string, unknown>
}

export interface PermissionUpdate {
  user_id: string
  permissions: Record<string, boolean>
  updated_by: string
}

export interface OrderItem {
  id: string
  order_id: string
  sku_id: string
  quantity: number
  unit_price?: number
  line_total: number
  created_at: string
  sku?: SKU
  // Legacy fields
  product_id?: string
  strain_name?: string
  product?: Product
}

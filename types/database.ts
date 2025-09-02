export type UserRole = 'agent' | 'management' | 'admin'
export type TaskStatus = 'pending' | 'complete'
export type OrderStatus = 'pending' | 'submitted' | 'approved'
export type ContactMethod = 'phone' | 'email' | 'in-person' | 'text'

export interface Profile {
  id: string
  email: string
  role: UserRole
  full_name?: string
  phone?: string
  created_at: string
  updated_at: string
}

export interface DispensaryProfile {
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
}

export interface Communication {
  id: string
  agent_id: string
  dispensary_id: string
  client_name?: string
  interaction_date: string
  notes: string
  contact_method?: ContactMethod
  follow_up_required: boolean
  created_at: string
  updated_at: string
  dispensary?: DispensaryProfile
  agent?: Profile
}

export interface Task {
  id: string
  agent_id: string
  dispensary_id: string
  title: string
  description?: string
  due_date: string
  status: TaskStatus
  priority: number // 1=high, 2=medium, 3=low
  created_at: string
  updated_at: string
  completed_at?: string
  dispensary?: DispensaryProfile
  agent?: Profile
}

export interface Order {
  id: string
  order_id?: string
  dispensary_id: string
  agent_id: string
  order_date: string
  order_notes?: string
  requested_delivery_date?: string
  final_delivery_date?: string
  status: OrderStatus
  total_price: number
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
  dispensary?: DispensaryProfile
  agent?: Profile
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  strain_name: string
  quantity: number
  unit_price: number
  line_total: number
  created_at: string
  product?: Product
}
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types/database'

export const PERMISSIONS = {
  // User management
  VIEW_USERS: ['admin', 'management'],
  CREATE_USERS: ['admin'],
  EDIT_USERS: ['admin'],
  DELETE_USERS: ['admin'],
  MANAGE_PERMISSIONS: ['admin'],
  
  // Dispensary management  
  VIEW_DISPENSARIES: ['admin', 'management', 'agent'],
  CREATE_DISPENSARIES: ['admin', 'management'],
  EDIT_DISPENSARIES: ['admin', 'management'],
  DELETE_DISPENSARIES: ['admin'],
  
  // Product management
  VIEW_PRODUCTS: ['admin', 'management', 'agent'],
  CREATE_PRODUCTS: ['admin', 'management'],
  EDIT_PRODUCTS: ['admin', 'management'],
  DELETE_PRODUCTS: ['admin'],
  
  // Order management
  VIEW_ORDERS: ['admin', 'management', 'agent'],
  CREATE_ORDERS: ['admin', 'management', 'agent'],
  EDIT_ORDERS: ['admin', 'management'],
  DELETE_ORDERS: ['admin'],
  APPROVE_ORDERS: ['admin', 'management'],
  
  // Communication management
  VIEW_COMMUNICATIONS: ['admin', 'management', 'agent'],
  CREATE_COMMUNICATIONS: ['admin', 'management', 'agent'],
  EDIT_COMMUNICATIONS: ['admin', 'management'],
  DELETE_COMMUNICATIONS: ['admin'],
  
  // Task management
  VIEW_TASKS: ['admin', 'management', 'agent'],
  CREATE_TASKS: ['admin', 'management', 'agent'],
  EDIT_TASKS: ['admin', 'management', 'agent'],
  DELETE_TASKS: ['admin', 'management'],
  
  // Analytics and reporting
  VIEW_ANALYTICS: ['admin', 'management'],
  VIEW_USER_ACTIVITY: ['admin', 'management'],
  
  // System administration
  SYSTEM_SETTINGS: ['admin'],
  VIEW_AUDIT_LOGS: ['admin'],
} as const

export type Permission = keyof typeof PERMISSIONS

export interface SecurityContext {
  userId: string
  userRole: UserRole
  userEmail: string
}

export class SecurityManager {
  private context: SecurityContext | null = null

  async initialize(): Promise<SecurityContext | null> {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        this.context = null
        return null
      }

      // Fetch user profile with role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      this.context = {
        userId: user.id,
        userRole: profile?.role || 'agent',
        userEmail: user.email || ''
      }

      return this.context
    } catch (error) {
      console.error('Failed to initialize security context:', error)
      this.context = null
      return null
    }
  }

  getContext(): SecurityContext | null {
    return this.context
  }

  hasPermission(permission: Permission): boolean {
    if (!this.context) return false
    
    const allowedRoles = PERMISSIONS[permission] as readonly string[]
    return allowedRoles.includes(this.context.userRole)
  }

  requirePermission(permission: Permission): void {
    if (!this.hasPermission(permission)) {
      throw new Error(`Access denied: Missing permission ${permission}`)
    }
  }

  canAccessResource(resourceOwnerId: string, permission: Permission): boolean {
    if (!this.context) return false
    
    // Admin and management can access any resource
    if (['admin', 'management'].includes(this.context.userRole)) {
      return this.hasPermission(permission)
    }
    
    // Agents can only access their own resources
    return resourceOwnerId === this.context.userId && this.hasPermission(permission)
  }

  canEditResource(resourceOwnerId: string): boolean {
    if (!this.context) return false
    
    // Admin and management can edit any resource
    if (['admin', 'management'].includes(this.context.userRole)) {
      return true
    }
    
    // Agents can edit their own resources
    return resourceOwnerId === this.context.userId
  }

  filterDataByAccess<T extends { agent_id?: string }>(data: T[], permission: Permission): T[] {
    if (!this.context) return []
    
    // Admin and management see all data
    if (['admin', 'management'].includes(this.context.userRole)) {
      return this.hasPermission(permission) ? data : []
    }
    
    // Agents see only their own data
    return data.filter(item => 
      item.agent_id === this.context?.userId && this.hasPermission(permission)
    )
  }

  sanitizeForRole<T>(data: T, sensitiveFields: (keyof T)[]): Partial<T> {
    if (!this.context) return {}
    
    // Admin sees all fields
    if (this.context.userRole === 'admin') {
      return data
    }
    
    // Remove sensitive fields for non-admin users
    const sanitized = { ...data }
    sensitiveFields.forEach(field => {
      delete sanitized[field]
    })
    
    return sanitized
  }
}

// Global security manager instance
export const securityManager = new SecurityManager()

// Utility functions for common security checks
export async function requireAuth(): Promise<SecurityContext> {
  const context = await securityManager.initialize()
  if (!context) {
    throw new Error('Authentication required')
  }
  return context
}

export async function requireRole(allowedRoles: UserRole[]): Promise<SecurityContext> {
  const context = await requireAuth()
  if (!allowedRoles.includes(context.userRole)) {
    throw new Error(`Access denied: Required role ${allowedRoles.join(' or ')}`)
  }
  return context
}

export function rateLimiter() {
  const requests = new Map<string, number[]>()
  
  return (identifier: string, maxRequests: number = 10, windowMs: number = 60000) => {
    const now = Date.now()
    const windowStart = now - windowMs
    
    if (!requests.has(identifier)) {
      requests.set(identifier, [])
    }
    
    const userRequests = requests.get(identifier)!
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => time > windowStart)
    
    if (validRequests.length >= maxRequests) {
      throw new Error('Rate limit exceeded')
    }
    
    validRequests.push(now)
    requests.set(identifier, validRequests)
    
    return true
  }
}

// Input validation and sanitization
export function validateAndSanitizeInput(
  input: string,
  maxLength: number = 1000,
  allowedChars: RegExp = /^[a-zA-Z0-9\s\-._@,()]+$/
): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: must be a non-empty string')
  }
  
  const trimmed = input.trim()
  
  if (trimmed.length === 0) {
    throw new Error('Input cannot be empty')
  }
  
  if (trimmed.length > maxLength) {
    throw new Error(`Input too long: maximum ${maxLength} characters`)
  }
  
  if (!allowedChars.test(trimmed)) {
    throw new Error('Input contains invalid characters')
  }
  
  return trimmed
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]+$/
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10
}
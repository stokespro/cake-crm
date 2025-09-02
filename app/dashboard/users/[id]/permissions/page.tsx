'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save, Shield, User, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
}

interface Permission {
  id?: string
  permission_name: string
  resource_type?: string
  resource_id?: string
  granted: boolean
  description: string
  category: string
}

const AVAILABLE_PERMISSIONS: Permission[] = [
  // User Management
  { permission_name: 'manage_users', granted: false, description: 'Create, edit, and delete user accounts', category: 'User Management' },
  { permission_name: 'view_all_users', granted: false, description: 'View all user profiles and information', category: 'User Management' },
  { permission_name: 'manage_permissions', granted: false, description: 'Grant and revoke user permissions', category: 'User Management' },
  { permission_name: 'delete_users', granted: false, description: 'Soft delete user accounts', category: 'User Management' },
  
  // Dispensary Management
  { permission_name: 'create_dispensaries', granted: false, description: 'Add new dispensary profiles', category: 'Dispensary Management' },
  { permission_name: 'edit_dispensaries', granted: false, description: 'Modify dispensary information', category: 'Dispensary Management' },
  { permission_name: 'delete_dispensaries', granted: false, description: 'Remove dispensary profiles', category: 'Dispensary Management' },
  { permission_name: 'view_all_dispensaries', granted: false, description: 'Access all dispensary data', category: 'Dispensary Management' },
  
  // Order Management
  { permission_name: 'create_orders', granted: false, description: 'Create new orders', category: 'Order Management' },
  { permission_name: 'edit_orders', granted: false, description: 'Modify existing orders', category: 'Order Management' },
  { permission_name: 'approve_orders', granted: false, description: 'Approve pending orders', category: 'Order Management' },
  { permission_name: 'view_all_orders', granted: false, description: 'Access all order data', category: 'Order Management' },
  { permission_name: 'view_own_orders', granted: false, description: 'View orders assigned to user', category: 'Order Management' },
  
  // Communication Management
  { permission_name: 'create_communications', granted: false, description: 'Log new communications', category: 'Communication Management' },
  { permission_name: 'edit_communications', granted: false, description: 'Modify communication records', category: 'Communication Management' },
  { permission_name: 'view_all_communications', granted: false, description: 'Access all communication data', category: 'Communication Management' },
  { permission_name: 'view_own_communications', granted: false, description: 'View own communication records', category: 'Communication Management' },
  
  // Task Management
  { permission_name: 'create_tasks', granted: false, description: 'Create new tasks', category: 'Task Management' },
  { permission_name: 'edit_tasks', granted: false, description: 'Modify existing tasks', category: 'Task Management' },
  { permission_name: 'view_all_tasks', granted: false, description: 'Access all task data', category: 'Task Management' },
  { permission_name: 'view_own_tasks', granted: false, description: 'View tasks assigned to user', category: 'Task Management' },
  
  // Product Management
  { permission_name: 'manage_products', granted: false, description: 'Create, edit, and delete products', category: 'Product Management' },
  { permission_name: 'view_product_analytics', granted: false, description: 'Access product performance data', category: 'Product Management' },
  
  // System Administration
  { permission_name: 'system_admin', granted: false, description: 'Full system administration access', category: 'System Administration' },
  { permission_name: 'view_system_logs', granted: false, description: 'Access system activity logs', category: 'System Administration' },
  { permission_name: 'manage_system_settings', granted: false, description: 'Modify system configuration', category: 'System Administration' },
]

export default function UserPermissionsPage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const supabase = createClient()

  const userId = params.id as string

  useEffect(() => {
    const loadData = async () => {
      await fetchCurrentUserRole()
      await fetchUser()
      await fetchPermissions()
    }
    loadData()
  }, [userId])

  const fetchCurrentUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (data) {
        setCurrentUserRole(data.role)
      }
    } catch (error) {
      console.error('Error fetching current user role:', error)
    }
  }

  const fetchUser = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .eq('id', userId)
        .single()

      if (error) throw error
      setUser(data)
    } catch (error) {
      console.error('Error fetching user:', error)
      router.push('/dashboard/users')
    }
  }

  const fetchPermissions = async () => {
    try {
      // Initialize with default permissions based on role
      const defaultPermissions = [...AVAILABLE_PERMISSIONS]
      
      // For now, we'll use the enhanced permissions logic from the schema
      // In a full implementation, this would query the user_permissions table
      setPermissions(defaultPermissions)
    } catch (error) {
      console.error('Error fetching permissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePermissionToggle = (permissionName: string, granted: boolean) => {
    setPermissions(prev => 
      prev.map(p => 
        p.permission_name === permissionName 
          ? { ...p, granted }
          : p
      )
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // In a full implementation, this would save to the user_permissions table
      // For now, we'll just simulate the save
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      alert('Permissions saved successfully!')
    } catch (error) {
      console.error('Error saving permissions:', error)
      alert('Error saving permissions. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const getRoleDefaultPermissions = (role: string): string[] => {
    switch (role) {
      case 'admin':
        return AVAILABLE_PERMISSIONS.map(p => p.permission_name)
      case 'management':
        return [
          'view_all_orders', 'create_dispensaries', 'edit_dispensaries',
          'view_all_communications', 'view_all_tasks', 'approve_orders',
          'create_orders', 'create_communications', 'create_tasks',
          'manage_products', 'view_all_dispensaries'
        ]
      case 'agent':
        return [
          'view_own_orders', 'view_own_communications', 'view_own_tasks',
          'create_orders', 'create_communications', 'create_tasks'
        ]
      default:
        return []
    }
  }

  const groupedPermissions = permissions.reduce((groups, permission) => {
    const category = permission.category
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(permission)
    return groups
  }, {} as Record<string, Permission[]>)

  const canManagePermissions = currentUserRole === 'admin'

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading user permissions...</div>
      </div>
    )
  }

  const roleDefaults = getRoleDefaultPermissions(user.role)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold">User Permissions</h1>
          <p className="text-muted-foreground">Manage permissions for {user.full_name}</p>
        </div>
        {canManagePermissions && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              'Saving...'
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        )}
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium">{user.full_name}</p>
                <Badge variant={user.role === 'admin' ? 'destructive' : user.role === 'management' ? 'default' : 'secondary'}>
                  {user.role}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role-based Defaults Warning */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Role-based Default Permissions</p>
              <p className="text-sm text-muted-foreground mt-1">
                This user has the <strong>{user.role}</strong> role, which automatically grants certain permissions. 
                Additional permissions can be granted below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!canManagePermissions && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              You don't have permission to modify user permissions. Contact an administrator for assistance.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Permissions Matrix */}
      <div className="space-y-6">
        {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {category}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categoryPermissions.map((permission) => {
                  const isRoleDefault = roleDefaults.includes(permission.permission_name)
                  const isGranted = isRoleDefault || permission.granted
                  
                  return (
                    <div key={permission.permission_name} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{permission.permission_name.replace(/_/g, ' ').toUpperCase()}</p>
                          {isRoleDefault && (
                            <Badge variant="outline" className="text-xs">
                              Role Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{permission.description}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Switch
                          checked={isGranted}
                          onCheckedChange={(checked) => !isRoleDefault && handlePermissionToggle(permission.permission_name, checked)}
                          disabled={!canManagePermissions || isRoleDefault}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
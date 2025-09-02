'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Search, Activity, Filter, User, Calendar } from 'lucide-react'
import Link from 'next/link'

interface ActivityLog {
  id: string
  user_id: string
  action_type: string
  resource_type?: string
  resource_id?: string
  details: Record<string, any>
  timestamp: string
  success: boolean
  error_message?: string
  user_email?: string
  user_name?: string
}

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'view', label: 'View' },
]

const RESOURCE_TYPES = [
  { value: '', label: 'All Resources' },
  { value: 'user', label: 'Users' },
  { value: 'dispensary', label: 'Dispensaries' },
  { value: 'order', label: 'Orders' },
  { value: 'communication', label: 'Communications' },
  { value: 'task', label: 'Tasks' },
  { value: 'product', label: 'Products' },
]

export default function UserActivityPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [filteredActivities, setFilteredActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('7') // days
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      await fetchCurrentUserRole()
      await fetchActivities()
    }
    loadData()
  }, [dateFilter])

  useEffect(() => {
    filterActivities()
  }, [activities, searchTerm, actionFilter, resourceFilter])

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

  const fetchActivities = async () => {
    try {
      // For now, we'll generate some mock data since the activity log table 
      // would need the enhanced schema to be fully functional
      const mockActivities: ActivityLog[] = [
        {
          id: '1',
          user_id: 'user-1',
          action_type: 'login',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          success: true,
          user_email: 'stokes@cakeoklahoma.com',
          user_name: 'Joshua Stokes',
          details: { ip_address: '192.168.1.100' }
        },
        {
          id: '2',
          user_id: 'user-1',
          action_type: 'create',
          resource_type: 'dispensary',
          resource_id: 'disp-1',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          success: true,
          user_email: 'stokes@cakeoklahoma.com',
          user_name: 'Joshua Stokes',
          details: { dispensary_name: 'Green Valley Dispensary' }
        },
        {
          id: '3',
          user_id: 'user-2',
          action_type: 'update',
          resource_type: 'order',
          resource_id: 'order-1',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          success: true,
          user_email: 'agent@example.com',
          user_name: 'Sales Agent',
          details: { field: 'status', old_value: 'pending', new_value: 'approved' }
        },
        {
          id: '4',
          user_id: 'user-1',
          action_type: 'view',
          resource_type: 'user',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
          success: true,
          user_email: 'stokes@cakeoklahoma.com',
          user_name: 'Joshua Stokes',
          details: { viewed_user: 'agent@example.com' }
        },
        {
          id: '5',
          user_id: 'user-3',
          action_type: 'login',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
          success: false,
          error_message: 'Invalid password',
          user_email: 'manager@example.com',
          user_name: 'Manager User',
          details: { ip_address: '10.0.0.50', attempts: 3 }
        }
      ]

      setActivities(mockActivities)
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterActivities = () => {
    let filtered = activities

    if (searchTerm) {
      filtered = filtered.filter(activity =>
        activity.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.action_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.resource_type?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (actionFilter) {
      filtered = filtered.filter(activity => activity.action_type === actionFilter)
    }

    if (resourceFilter) {
      filtered = filtered.filter(activity => activity.resource_type === resourceFilter)
    }

    setFilteredActivities(filtered)
  }

  const getActionBadgeVariant = (action: string, success: boolean) => {
    if (!success) return 'destructive'
    
    switch (action) {
      case 'login':
      case 'logout':
        return 'default'
      case 'create':
        return 'default'
      case 'update':
        return 'secondary'
      case 'delete':
        return 'destructive'
      case 'view':
        return 'outline'
      default:
        return 'outline'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60)
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours)
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else {
      const days = Math.floor(diffInHours / 24)
      return `${days} day${days !== 1 ? 's' : ''} ago`
    }
  }

  const canViewActivityLogs = ['admin', 'management'].includes(currentUserRole)

  if (!canViewActivityLogs) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">You don't have permission to view activity logs</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Only admin and management users can access system activity logs.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading activity logs...</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">User Activity Log</h1>
          <p className="text-muted-foreground">Monitor system usage and user actions</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users or actions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Action Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Action Type</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resource Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Resource Type</label>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((resource) => (
                    <SelectItem key={resource.value} value={resource.value}>
                      {resource.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Time Period</label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredActivities.length} of {activities.length} activities
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity ({filteredActivities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm || actionFilter || resourceFilter 
                  ? 'No activities found matching your filters' 
                  : 'No recent activity found'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{activity.user_name || 'Unknown User'}</p>
                        <Badge variant={getActionBadgeVariant(activity.action_type, activity.success)}>
                          {activity.action_type.toUpperCase()}
                        </Badge>
                        {activity.resource_type && (
                          <Badge variant="outline" className="text-xs">
                            {activity.resource_type}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{activity.user_email}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatTimestamp(activity.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {activity.error_message && (
                      <p className="text-destructive font-medium mb-1">Failed</p>
                    )}
                    {activity.details && (
                      <div className="text-muted-foreground text-xs">
                        {activity.details.ip_address && (
                          <div>IP: {activity.details.ip_address}</div>
                        )}
                        {activity.details.dispensary_name && (
                          <div>Created: {activity.details.dispensary_name}</div>
                        )}
                        {activity.details.field && (
                          <div>{activity.details.field}: {activity.details.old_value} → {activity.details.new_value}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
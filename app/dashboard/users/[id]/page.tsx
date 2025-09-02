'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, User, Mail, Phone, Calendar, Shield, Activity, Edit } from 'lucide-react'
import Link from 'next/link'

interface UserProfile {
  id: string
  email: string
  full_name: string
  phone_number?: string
  role: string
  created_at: string
  last_login_at?: string
  login_count?: number
  deleted_at?: string
}

interface UserActivity {
  action_type: string
  resource_type?: string
  timestamp: string
  success: boolean
}

export default function UserDetailPage() {
  const params = useParams()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [recentActivity, setRecentActivity] = useState<UserActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const supabase = createClient()

  const userId = params.id as string

  useEffect(() => {
    const loadData = async () => {
      await fetchCurrentUserRole()
      await fetchUser()
      await fetchRecentActivity()
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
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setUser(data)
    } catch (error) {
      console.error('Error fetching user:', error)
    }
  }

  const fetchRecentActivity = async () => {
    try {
      // Mock recent activity data - in a full implementation this would query the activity log
      const mockActivity: UserActivity[] = [
        {
          action_type: 'login',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          success: true
        },
        {
          action_type: 'create',
          resource_type: 'order',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          success: true
        },
        {
          action_type: 'update',
          resource_type: 'dispensary',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          success: true
        }
      ]
      
      setRecentActivity(mockActivity)
    } catch (error) {
      console.error('Error fetching recent activity:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateString?: string) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive'
      case 'management': return 'default'
      case 'agent': return 'secondary'
      default: return 'outline'
    }
  }

  const canManageUsers = currentUserRole === 'admin'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading user details...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">User Not Found</h1>
            <p className="text-muted-foreground">The requested user could not be found</p>
          </div>
        </div>
      </div>
    )
  }

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
          <h1 className="text-2xl md:text-3xl font-bold">User Details</h1>
          <p className="text-muted-foreground">{user.full_name || user.email}</p>
        </div>
        {canManageUsers && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/users/${user.id}/permissions`}>
                <Shield className="mr-2 h-4 w-4" />
                Manage Permissions
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/dashboard/users/${user.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit User
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* User Status Alert */}
      {user.deleted_at && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <Badge variant="destructive">Deleted</Badge>
              <span className="text-sm">This user account was deleted on {formatDateShort(user.deleted_at)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                User Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-medium">{user.full_name || 'No name set'}</h3>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span>{user.email}</span>
                      </div>
                      {user.phone_number && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>{user.phone_number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Account Created</label>
                    <p className="text-sm text-muted-foreground">{formatDateShort(user.created_at)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Last Login</label>
                    <p className="text-sm text-muted-foreground">{formatDate(user.last_login_at)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Total Logins</label>
                    <p className="text-sm text-muted-foreground">{user.login_count || 0} times</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Account Status</label>
                    <p className="text-sm">
                      <Badge variant={user.deleted_at ? 'destructive' : 'default'}>
                        {user.deleted_at ? 'Deleted' : 'Active'}
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No recent activity found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={activity.success ? 'default' : 'destructive'}>
                            {activity.action_type.toUpperCase()}
                          </Badge>
                          {activity.resource_type && (
                            <Badge variant="outline" className="text-xs">
                              {activity.resource_type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatDate(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-4 border-t">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/users/activity">
                    View All Activity
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManageUsers ? (
                <>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/dashboard/users/${user.id}/permissions`}>
                      <Shield className="mr-2 h-4 w-4" />
                      Manage Permissions
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/dashboard/users/${user.id}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`mailto:${user.email}`}>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email
                    </Link>
                  </Button>
                  {user.phone_number && (
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`tel:${user.phone_number}`}>
                        <Phone className="mr-2 h-4 w-4" />
                        Call User
                      </Link>
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Limited actions available based on your permissions.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Account Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Login Count</span>
                  <span className="font-medium">{user.login_count || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Age</span>
                  <span className="font-medium">
                    {Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Role</span>
                  <Badge variant={getRoleBadgeVariant(user.role)}>
                    {user.role}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={user.deleted_at ? 'destructive' : 'default'}>
                    {user.deleted_at ? 'Deleted' : 'Active'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
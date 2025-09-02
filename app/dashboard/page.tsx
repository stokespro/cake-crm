'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  MessageSquare,
  CheckSquare,
  ShoppingCart,
  Building2,
  ArrowRight,
  Calendar,
  DollarSign
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Task, Order } from '@/types/database'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingTasks: 0,
    todayCommunications: 0,
    monthlyRevenue: 0,
  })
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Get user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch stats
      const today = new Date().toISOString().split('T')[0]
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      // Count pending tasks
      const { count: pendingTasksCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', user.id)
        .eq('status', 'pending')

      // Count today's communications
      const { count: todayCommsCount } = await supabase
        .from('communications')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', user.id)
        .gte('interaction_date', today)

      // Count total orders this month
      const { data: monthlyOrders } = await supabase
        .from('orders')
        .select('total_price')
        .eq('agent_id', user.id)
        .gte('order_date', firstDayOfMonth)

      const monthlyRevenue = monthlyOrders?.reduce((sum, order) => sum + (order.total_price || 0), 0) || 0

      // Fetch recent tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, dispensary:dispensary_profiles(business_name)')
        .eq('agent_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(5)

      // Fetch recent orders
      const { data: orders } = await supabase
        .from('orders')
        .select('*, dispensary:dispensary_profiles(business_name)')
        .eq('agent_id', user.id)
        .order('order_date', { ascending: false })
        .limit(5)

      setStats({
        totalOrders: monthlyOrders?.length || 0,
        pendingTasks: pendingTasksCount || 0,
        todayCommunications: todayCommsCount || 0,
        monthlyRevenue,
      })
      setRecentTasks(tasks || [])
      setRecentOrders(orders || [])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 1:
        return <Badge variant="destructive">High</Badge>
      case 2:
        return <Badge variant="default">Medium</Badge>
      case 3:
        return <Badge variant="secondary">Low</Badge>
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>
      case 'submitted':
        return <Badge variant="default">Submitted</Badge>
      case 'approved':
        return <Badge variant="default" className="bg-green-600">Approved</Badge>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here&apos;s your overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.monthlyRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingTasks}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Communications</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayCommunications}</div>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Tasks */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming Tasks</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/tasks">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardDescription>Tasks that need your attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending tasks</p>
              ) : (
                recentTasks.map((task) => (
                  <div key={task.id} className="flex items-start justify-between space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{task.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Due {format(new Date(task.due_date), 'MMM d, yyyy')}</span>
                        {task.dispensary && (
                          <>
                            <span>•</span>
                            <span>{task.dispensary.business_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {getPriorityBadge(task.priority)}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Orders</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/orders">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardDescription>Latest order submissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent orders</p>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-start justify-between space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">
                        {order.dispensary?.business_name || 'Unknown Dispensary'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>${order.total_price.toFixed(2)}</span>
                        <span>•</span>
                        <span>{format(new Date(order.order_date), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks you might want to do</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/dashboard/communications/new">
                <MessageSquare className="h-5 w-5 mb-2" />
                <span className="text-xs">Log Communication</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/dashboard/tasks/new">
                <CheckSquare className="h-5 w-5 mb-2" />
                <span className="text-xs">Create Task</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/dashboard/orders/new">
                <ShoppingCart className="h-5 w-5 mb-2" />
                <span className="text-xs">New Order</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col py-4" asChild>
              <Link href="/dashboard/dispensaries">
                <Building2 className="h-5 w-5 mb-2" />
                <span className="text-xs">View Dispensaries</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
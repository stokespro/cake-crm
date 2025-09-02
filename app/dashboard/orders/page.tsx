'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import { Plus, Search, ShoppingCart, Calendar, DollarSign, Package, Truck } from 'lucide-react'
import { format } from 'date-fns'
import type { Order } from '@/types/database'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [userRole, setUserRole] = useState<string>('agent')
  const supabase = createClient()

  useEffect(() => {
    fetchUserRole()
    fetchOrders()
  }, [])

  useEffect(() => {
    filterOrders()
  }, [orders, searchTerm, filterStatus])

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (data) setUserRole(data.role)
    } catch (error) {
      console.error('Error fetching user role:', error)
    }
  }

  const fetchOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('orders')
        .select(`
          *,
          dispensary:dispensary_profiles(business_name),
          agent:profiles!orders_agent_id_fkey(full_name, email),
          order_items(
            id,
            quantity,
            unit_price,
            strain_name,
            line_total
          )
        `)
        .order('order_date', { ascending: false })

      // Agents can only see their own orders
      if (userRole === 'agent') {
        query = query.eq('agent_id', user.id)
      }

      const { data, error } = await query

      if (error) throw error
      setOrders(data || [])
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterOrders = () => {
    let filtered = [...orders]

    if (searchTerm) {
      filtered = filtered.filter(order =>
        order.dispensary?.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.order_notes?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(order => order.status === filterStatus)
    }

    setFilteredOrders(filtered)
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

  const canApproveOrders = userRole === 'management' || userRole === 'admin'

  const approveOrder = async (orderId: string) => {
    if (!canApproveOrders) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', orderId)

      if (error) throw error
      fetchOrders()
    } catch (error) {
      console.error('Error approving order:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading orders...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground mt-1">Manage wholesale orders and deliveries</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/orders/new">
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground">
              {filteredOrders.length} of {orders.length} orders
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterStatus !== 'all' 
                  ? 'No orders found matching your filters' 
                  : 'No orders created yet'}
              </p>
              <Button asChild>
                <Link href="/dashboard/orders/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Order
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">
                      {order.dispensary?.business_name || 'Unknown Dispensary'}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {order.order_id && (
                        <span className="font-medium">#{order.order_id}</span>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(order.order_date), 'MMM d, yyyy')}
                      </div>
                      {userRole !== 'agent' && order.agent && (
                        <span>Agent: {order.agent.full_name || order.agent.email}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(order.status)}
                    <div className="text-lg font-semibold flex items-center">
                      <DollarSign className="h-5 w-5" />
                      {order.total_price.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Order Items */}
                {order.order_items && order.order_items.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      Order Items:
                    </div>
                    <div className="pl-5 space-y-1">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="text-sm text-muted-foreground flex justify-between">
                          <span>{item.strain_name} x {item.quantity}</span>
                          <span>${item.line_total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delivery Dates */}
                <div className="flex flex-wrap gap-4 text-sm">
                  {order.requested_delivery_date && (
                    <div className="flex items-center gap-1">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Requested: {format(new Date(order.requested_delivery_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                  )}
                  {order.final_delivery_date && (
                    <div className="flex items-center gap-1">
                      <Truck className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">
                        Final: {format(new Date(order.final_delivery_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Order Notes */}
                {order.order_notes && (
                  <p className="text-sm text-muted-foreground">
                    {order.order_notes}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {order.status === 'submitted' && canApproveOrders && (
                    <Button
                      size="sm"
                      onClick={() => approveOrder(order.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Approve Order
                    </Button>
                  )}
                  {order.status === 'pending' && order.agent_id === orders[0]?.agent_id && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/orders/${order.id}/edit`}>
                        Edit Order
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
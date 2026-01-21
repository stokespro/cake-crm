'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Loader2, Plus, Trash2, DollarSign } from 'lucide-react'
import type { Customer, SKU } from '@/types/database'

interface OrderItem {
  sku_id: string
  sku_code: string
  sku_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export default function NewOrderPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [skus, setSkus] = useState<SKU[]>([])
  const [customerId, setCustomerId] = useState('')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('')
  const [totalPrice, setTotalPrice] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchCustomers()
    fetchSKUs()
    // Set default delivery date to 7 days from now
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 7)
    setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    calculateTotal()
  }, [orderItems])

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('business_name')

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const fetchSKUs = async () => {
    try {
      const { data, error } = await supabase
        .from('skus')
        .select('*')
        .eq('in_stock', true)
        .order('code')

      if (error) throw error
      setSkus(data || [])
    } catch (error) {
      console.error('Error fetching SKUs:', error)
    }
  }

  const addOrderItem = () => {
    if (skus.length === 0) return

    const firstSku = skus[0]
    setOrderItems([
      ...orderItems,
      {
        sku_id: firstSku.id,
        sku_code: firstSku.code,
        sku_name: firstSku.name,
        quantity: 1,
        unit_price: firstSku.price_per_unit || 0,
        line_total: firstSku.price_per_unit || 0
      }
    ])
  }

  const updateOrderItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const updated = [...orderItems]
    updated[index] = { ...updated[index], [field]: value }

    if (field === 'sku_id') {
      const sku = skus.find(s => s.id === value)
      if (sku) {
        updated[index].sku_code = sku.code
        updated[index].sku_name = sku.name
        updated[index].unit_price = sku.price_per_unit || 0
        updated[index].line_total = updated[index].quantity * (sku.price_per_unit || 0)
      }
    } else if (field === 'quantity') {
      updated[index].line_total = (value as number) * updated[index].unit_price
    }

    setOrderItems(updated)
  }

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index))
  }

  const calculateTotal = () => {
    const total = orderItems.reduce((sum, item) => sum + item.line_total, 0)
    setTotalPrice(total)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (orderItems.length === 0) {
      setError('Please add at least one item to the order')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          agent_id: user.id,
          customer_id: customerId,
          order_notes: orderNotes || null,
          requested_delivery_date: requestedDeliveryDate,
          status: 'pending',
          total_price: totalPrice
        })
        .select()
        .single()

      if (orderError) throw orderError

      // Create order items
      const itemsToInsert = orderItems.map(item => ({
        order_id: order.id,
        sku_id: item.sku_id,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError

      router.push('/dashboard/orders')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/orders">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Create Order</h1>
          <p className="text-muted-foreground mt-1">Submit a new wholesale order</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
            <CardDescription>Basic order information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId} required>
                  <SelectTrigger id="customer" className="h-12">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryDate">Requested Delivery Date *</Label>
                <Input
                  id="deliveryDate"
                  type="date"
                  value={requestedDeliveryDate}
                  onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Order Notes</Label>
              <Textarea
                id="notes"
                placeholder="Special instructions, delivery notes, etc..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                rows={3}
                disabled={loading}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Order Items</CardTitle>
                <CardDescription>Add products to this order</CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={addOrderItem}
                disabled={skus.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items added yet. Click &quot;Add Item&quot; to start.
              </div>
            ) : (
              <>
                {orderItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end border-b pb-4">
                    <div className="md:col-span-5 space-y-2">
                      <Label>SKU</Label>
                      <Select
                        value={item.sku_id}
                        onValueChange={(value) => updateOrderItem(index, 'sku_id', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {skus.map((sku) => (
                            <SelectItem key={sku.id} value={sku.id}>
                              {sku.code} - {sku.name} {sku.price_per_unit ? `($${sku.price_per_unit})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label>Unit Price</Label>
                      <div className="flex items-center h-10 px-3 bg-muted rounded-md">
                        ${item.unit_price.toFixed(2)}
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label>Total</Label>
                      <div className="flex items-center h-10 px-3 bg-muted rounded-md font-medium">
                        ${item.line_total.toFixed(2)}
                      </div>
                    </div>

                    <div className="md:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOrderItem(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="flex justify-end pt-4">
                  <div className="flex items-center gap-2 text-xl font-semibold">
                    <span>Order Total:</span>
                    <div className="flex items-center">
                      <DollarSign className="h-5 w-5" />
                      {totalPrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !customerId || orderItems.length === 0}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Order...
              </>
            ) : (
              'Create Order'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

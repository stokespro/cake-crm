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
import type { DispensaryProfile, Product } from '@/types/database'

interface OrderItem {
  product_id: string
  strain_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export default function NewOrderPage() {
  const [dispensaries, setDispensaries] = useState<DispensaryProfile[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dispensaryId, setDispensaryId] = useState('')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('')
  const [totalPrice, setTotalPrice] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchDispensaries()
    fetchProducts()
    // Set default delivery date to 7 days from now
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 7)
    setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    calculateTotal()
  }, [orderItems])

  const fetchDispensaries = async () => {
    try {
      const { data, error } = await supabase
        .from('dispensary_profiles')
        .select('*')
        .order('business_name')

      if (error) throw error
      setDispensaries(data || [])
    } catch (error) {
      console.error('Error fetching dispensaries:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('in_stock', true)
        .order('strain_name')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const addOrderItem = () => {
    if (products.length === 0) return

    const firstProduct = products[0]
    setOrderItems([
      ...orderItems,
      {
        product_id: firstProduct.id,
        strain_name: firstProduct.strain_name,
        quantity: 1,
        unit_price: firstProduct.price_per_unit,
        line_total: firstProduct.price_per_unit
      }
    ])
  }

  const updateOrderItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const updated = [...orderItems]
    updated[index] = { ...updated[index], [field]: value }

    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product) {
        updated[index].strain_name = product.strain_name
        updated[index].unit_price = product.price_per_unit
        updated[index].line_total = updated[index].quantity * product.price_per_unit
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
          dispensary_id: dispensaryId,
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
        product_id: item.product_id,
        strain_name: item.strain_name,
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
                <Label htmlFor="dispensary">Dispensary *</Label>
                <Select value={dispensaryId} onValueChange={setDispensaryId} required>
                  <SelectTrigger id="dispensary" className="h-12">
                    <SelectValue placeholder="Select a dispensary" />
                  </SelectTrigger>
                  <SelectContent>
                    {dispensaries.map((dispensary) => (
                      <SelectItem key={dispensary.id} value={dispensary.id}>
                        {dispensary.business_name}
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
                disabled={products.length === 0}
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
                      <Label>Product</Label>
                      <Select
                        value={item.product_id}
                        onValueChange={(value) => updateOrderItem(index, 'product_id', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.strain_name} - ${product.price_per_unit}
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
            disabled={loading || !dispensaryId || orderItems.length === 0} 
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
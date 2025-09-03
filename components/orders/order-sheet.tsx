'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Trash2, DollarSign } from 'lucide-react'
import type { DispensaryProfile, Product } from '@/types/database'

interface OrderItem {
  product_id: string
  strain_name: string
  quantity: number
  unit_price: number
  line_total: number
}

interface OrderSheetProps {
  open: boolean
  onClose: () => void
  dispensaryId?: string
  onSuccess: () => void
}

export function OrderSheet({ open, onClose, dispensaryId, onSuccess }: OrderSheetProps) {
  const [dispensaries, setDispensaries] = useState<DispensaryProfile[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedDispensaryId, setSelectedDispensaryId] = useState(dispensaryId || '')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('')
  const [totalPrice, setTotalPrice] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchDispensaries()
      fetchProducts()
      // Set default delivery date to 7 days from now
      const defaultDate = new Date()
      defaultDate.setDate(defaultDate.getDate() + 7)
      setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])
      
      // Set dispensary if provided
      if (dispensaryId) {
        setSelectedDispensaryId(dispensaryId)
      }
    }
  }, [open, dispensaryId])

  useEffect(() => {
    calculateTotal()
  }, [orderItems])

  // Reset form when sheet closes
  useEffect(() => {
    if (!open) {
      setSelectedDispensaryId(dispensaryId || '')
      setOrderItems([])
      setOrderNotes('')
      setTotalPrice(0)
      setError(null)
      const defaultDate = new Date()
      defaultDate.setDate(defaultDate.getDate() + 7)
      setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])
    }
  }, [open, dispensaryId])

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

      // Use transaction to ensure data consistency
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          agent_id: user.id,
          dispensary_id: selectedDispensaryId,
          order_notes: orderNotes || null,
          requested_delivery_date: requestedDeliveryDate,
          status: 'pending',
          total_price: totalPrice,
          order_date: new Date().toISOString().split('T')[0]
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
        unit_price: item.unit_price,
        line_total: item.line_total
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError

      onSuccess()
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[600px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create New Order</SheetTitle>
          <SheetDescription>
            Submit a new wholesale order for a dispensary
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {/* Order Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Order Details</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dispensary">Dispensary *</Label>
                <Select 
                  value={selectedDispensaryId} 
                  onValueChange={setSelectedDispensaryId} 
                  required
                  disabled={!!dispensaryId} // Disable if dispensary is pre-selected
                >
                  <SelectTrigger id="dispensary">
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
          </div>

          {/* Order Items */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Order Items</h3>
              <Button
                type="button"
                size="sm"
                onClick={addOrderItem}
                disabled={products.length === 0 || loading}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>

            {orderItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                No items added yet. Click &ldquo;Add Item&rdquo; to start.
              </div>
            ) : (
              <div className="space-y-4">
                {orderItems.map((item, index) => (
                  <div key={index} className="space-y-3 p-4 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Item {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOrderItem(index)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-2">
                        <Label>Product *</Label>
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => updateOrderItem(index, 'product_id', value)}
                          disabled={loading}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.strain_name} - ${product.price_per_unit.toFixed(2)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            disabled={loading}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Unit Price</Label>
                          <div className="flex items-center h-10 px-3 bg-muted rounded-md text-sm">
                            ${item.unit_price.toFixed(2)}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Line Total</Label>
                          <div className="flex items-center h-10 px-3 bg-muted rounded-md text-sm font-medium">
                            ${item.line_total.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Order Total */}
                <div className="flex justify-end pt-4 border-t">
                  <div className="flex items-center gap-2 text-xl font-semibold">
                    <span>Order Total:</span>
                    <div className="flex items-center">
                      <DollarSign className="h-5 w-5" />
                      {totalPrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !selectedDispensaryId || orderItems.length === 0}
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
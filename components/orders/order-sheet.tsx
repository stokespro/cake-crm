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
import type { DispensaryProfile, Product, Order, OrderItem as DatabaseOrderItem } from '@/types/database'

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
  order?: Order // Optional prop for edit mode
}

export function OrderSheet({ open, onClose, dispensaryId, onSuccess, order }: OrderSheetProps) {
  const [dispensaries, setDispensaries] = useState<DispensaryProfile[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedDispensaryId, setSelectedDispensaryId] = useState(dispensaryId || order?.dispensary_id || '')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState(order?.order_notes || '')
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(order?.requested_delivery_date || '')
  const [totalPrice, setTotalPrice] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchDispensaries()
      fetchProducts()
      
      // Initialize form with existing order data or defaults
      if (order) {
        // Edit mode - populate with existing order data
        setSelectedDispensaryId(order.dispensary_id)
        setOrderNotes(order.order_notes || '')
        setRequestedDeliveryDate(order.requested_delivery_date || '')
        
        // Convert database order items to form order items
        if (order.order_items && order.order_items.length > 0) {
          const formOrderItems = order.order_items.map(item => ({
            product_id: item.product_id,
            strain_name: item.strain_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total
          }))
          setOrderItems(formOrderItems)
        }
      } else {
        // Create mode - set defaults
        const defaultDate = new Date()
        defaultDate.setDate(defaultDate.getDate() + 7)
        setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])
        
        // Set dispensary if provided
        if (dispensaryId) {
          setSelectedDispensaryId(dispensaryId)
        }
      }
    }
  }, [open, dispensaryId, order])

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

  const validateForm = () => {
    if (!selectedDispensaryId) {
      setError('Please select a dispensary')
      return false
    }
    
    if (orderItems.length === 0) {
      setError('Please add at least one item to the order')
      return false
    }
    
    if (!requestedDeliveryDate) {
      setError('Please select a requested delivery date')
      return false
    }
    
    // Validate each order item
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i]
      
      if (!item.product_id) {
        setError(`Please select a product for item ${i + 1}`)
        return false
      }
      
      if (!item.quantity || item.quantity <= 0) {
        setError(`Please enter a valid quantity greater than 0 for item ${i + 1}`)
        return false
      }
    }
    
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate form before proceeding
    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated. Please log in and try again.')
      }

      const isEditMode = !!order
      
      if (isEditMode) {
        console.log('Updating order:', order.id)
        console.log('Order items:', orderItems.length)
        console.log('Total price:', totalPrice)

        // Update the existing order
        const { error: orderError } = await supabase
          .from('orders')
          .update({
            dispensary_id: selectedDispensaryId,
            order_notes: orderNotes || null,
            requested_delivery_date: requestedDeliveryDate,
            total_price: totalPrice,
            last_edited_at: new Date().toISOString(),
            last_edited_by: user.id
          })
          .eq('id', order.id)

        if (orderError) {
          console.error('Error updating order:', orderError)
          throw new Error(`Failed to update order: ${orderError.message}`)
        }

        // Delete existing order items
        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', order.id)

        if (deleteError) {
          console.error('Error deleting existing order items:', deleteError)
          throw new Error(`Failed to delete existing order items: ${deleteError.message}`)
        }

        // Insert updated order items
        const itemsToInsert = orderItems.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          strain_name: item.strain_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total
        }))

        console.log('Inserting updated order items:', itemsToInsert.length)

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(itemsToInsert)

        if (itemsError) {
          console.error('Error creating updated order items:', itemsError)
          throw new Error(`Failed to create updated order items: ${itemsError.message}`)
        }

        console.log('Order updated successfully')
      } else {
        console.log('Creating order for dispensary:', selectedDispensaryId)
        console.log('Order items:', orderItems.length)
        console.log('Total price:', totalPrice)

        // Create new order
        const { data: newOrder, error: orderError } = await supabase
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

        if (orderError) {
          console.error('Error creating order:', orderError)
          throw new Error(`Failed to create order: ${orderError.message}`)
        }

        if (!newOrder) {
          throw new Error('Order was not created successfully')
        }

        console.log('Order created successfully:', newOrder.id)

        // Create order items
        const itemsToInsert = orderItems.map(item => ({
          order_id: newOrder.id,
          product_id: item.product_id,
          strain_name: item.strain_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total
        }))

        console.log('Inserting order items:', itemsToInsert.length)

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(itemsToInsert)

        if (itemsError) {
          console.error('Error creating order items:', itemsError)
          throw new Error(`Failed to create order items: ${itemsError.message}`)
        }

        console.log('Order and items created successfully')
      }

      // Call success callback and close sheet
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error in handleSubmit:', error)
      const action = order ? 'updating' : 'creating'
      setError(error instanceof Error ? error.message : `An unexpected error occurred while ${action} the order`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[600px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{order ? 'Edit Order' : 'Create New Order'}</SheetTitle>
          <SheetDescription>
            {order ? 'Update an existing wholesale order' : 'Submit a new wholesale order for a dispensary'}
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
                  disabled={!!dispensaryId || !!order} // Disable if dispensary is pre-selected or in edit mode
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
              disabled={loading || !selectedDispensaryId || orderItems.length === 0 || !requestedDeliveryDate}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {order ? 'Updating Order...' : 'Creating Order...'}
                </>
              ) : (
                order ? 'Update Order' : 'Create Order'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
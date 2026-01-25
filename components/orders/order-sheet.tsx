'use client'

import { useState, useEffect, useCallback } from 'react'
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
import type { Customer, SKU, Order } from '@/types/database'

interface CustomerPricingData {
  sku_id: string | null
  product_type_id: string | null
  price_per_unit: number
}

interface OrderItem {
  sku_id: string
  sku_name: string
  quantity: number
  unit_price: number | null  // null means manual entry required
}

interface OrderSheetProps {
  open: boolean
  onClose: () => void
  customerId?: string
  onSuccess: () => void
  order?: Order // Optional prop for edit mode
}

export function OrderSheet({ open, onClose, customerId, onSuccess, order }: OrderSheetProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [skus, setSkus] = useState<(SKU & { product_type_id?: string })[]>([])
  const [customerPricing, setCustomerPricing] = useState<CustomerPricingData[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || order?.customer_id || '')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderNotes, setOrderNotes] = useState(order?.order_notes || '')
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(order?.requested_delivery_date || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Fetch customer pricing when customer changes
  const fetchCustomerPricing = useCallback(async (custId: string) => {
    if (!custId) {
      setCustomerPricing([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('customer_pricing')
        .select('sku_id, product_type_id, price_per_unit')
        .eq('customer_id', custId)

      if (error) throw error
      setCustomerPricing(data || [])
    } catch (error) {
      console.error('Error fetching customer pricing:', error)
      setCustomerPricing([])
    }
  }, [supabase])

  // Get price for a SKU based on customer pricing rules
  // Priority: item price > category price > null (manual)
  const getPriceForSku = useCallback((skuId: string): number | null => {
    // Check for item-specific price
    const itemPrice = customerPricing.find(p => p.sku_id === skuId)
    if (itemPrice) {
      return itemPrice.price_per_unit
    }

    // Check for category price
    const sku = skus.find(s => s.id === skuId)
    if (sku?.product_type_id) {
      const categoryPrice = customerPricing.find(p => p.product_type_id === sku.product_type_id)
      if (categoryPrice) {
        return categoryPrice.price_per_unit
      }
    }

    // No pricing found
    return null
  }, [customerPricing, skus])

  useEffect(() => {
    if (open) {
      fetchCustomers()
      fetchSkus()

      // Initialize form with existing order data or defaults
      if (order) {
        // Edit mode - populate with existing order data
        setSelectedCustomerId(order.customer_id)
        setOrderNotes(order.order_notes || '')
        setRequestedDeliveryDate(order.requested_delivery_date || '')
        fetchCustomerPricing(order.customer_id)

        // Order items will be loaded in separate useEffect after skus are loaded
      } else {
        // Create mode - set defaults
        const defaultDate = new Date()
        defaultDate.setDate(defaultDate.getDate() + 7)
        setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])

        // Set customer if provided
        if (customerId) {
          setSelectedCustomerId(customerId)
          fetchCustomerPricing(customerId)
        }
      }
    }
  }, [open, customerId, order, fetchCustomerPricing])

  // Fetch pricing when customer changes
  useEffect(() => {
    if (selectedCustomerId && open) {
      fetchCustomerPricing(selectedCustomerId)
    }
  }, [selectedCustomerId, open, fetchCustomerPricing])

  // Update prices when pricing data changes
  useEffect(() => {
    if (customerPricing.length > 0 && orderItems.length > 0) {
      setOrderItems(prev => prev.map(item => ({
        ...item,
        unit_price: getPriceForSku(item.sku_id)
      })))
    }
  }, [customerPricing, getPriceForSku])

  // Load order items when skus are loaded (for edit mode)
  useEffect(() => {
    if (order && order.order_items && skus.length > 0 && orderItems.length === 0) {
      const formOrderItems = order.order_items.map(item => {
        const sku = skus.find(s => s.id === item.sku_id)
        return {
          sku_id: item.sku_id,
          sku_name: sku?.name || 'Unknown SKU',
          quantity: item.quantity,
          unit_price: item.unit_price ?? getPriceForSku(item.sku_id)
        }
      })
      setOrderItems(formOrderItems)
    }
  }, [skus, order, getPriceForSku])

  // Reset form when sheet closes
  useEffect(() => {
    if (!open) {
      setSelectedCustomerId(customerId || '')
      setOrderItems([])
      setOrderNotes('')
      setError(null)
      setCustomerPricing([])
      const defaultDate = new Date()
      defaultDate.setDate(defaultDate.getDate() + 7)
      setRequestedDeliveryDate(defaultDate.toISOString().split('T')[0])
    }
  }, [open, customerId])

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

  const fetchSkus = async () => {
    try {
      const { data, error } = await supabase
        .from('skus')
        .select('*, product_type_id')
        .eq('in_stock', true)
        .order('name')

      if (error) throw error
      setSkus(data || [])
    } catch (error) {
      console.error('Error fetching skus:', error)
    }
  }

  const addOrderItem = () => {
    if (skus.length === 0) return

    const firstSku = skus[0]
    const price = getPriceForSku(firstSku.id)

    setOrderItems([
      ...orderItems,
      {
        sku_id: firstSku.id,
        sku_name: firstSku.name,
        quantity: 1,
        unit_price: price
      }
    ])
  }

  const updateOrderItem = (index: number, field: keyof OrderItem, value: string | number | null) => {
    const updated = [...orderItems]
    updated[index] = { ...updated[index], [field]: value }

    if (field === 'sku_id') {
      const sku = skus.find(s => s.id === value)
      if (sku) {
        updated[index].sku_name = sku.name
        updated[index].unit_price = getPriceForSku(sku.id)
      }
    }

    setOrderItems(updated)
  }

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index))
  }

  // Calculate order total
  const orderTotal = orderItems.reduce((sum, item) => {
    if (item.unit_price !== null) {
      return sum + (item.unit_price * item.quantity)
    }
    return sum
  }, 0)

  const hasUnpricedItems = orderItems.some(item => item.unit_price === null)

  const validateForm = () => {
    if (!selectedCustomerId) {
      setError('Please select a customer')
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

      if (!item.sku_id) {
        setError(`Please select a SKU for item ${i + 1}`)
        return false
      }

      if (!item.quantity || item.quantity <= 0) {
        setError(`Please enter a valid quantity greater than 0 for item ${i + 1}`)
        return false
      }

      if (item.unit_price === null || item.unit_price <= 0) {
        setError(`Please enter a valid price for item ${i + 1} (${item.sku_name})`)
        return false
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const isEditMode = !!order

      if (isEditMode) {
        // Update the existing order
        const { error: orderError } = await supabase
          .from('orders')
          .update({
            customer_id: selectedCustomerId,
            order_notes: orderNotes || null,
            requested_delivery_date: requestedDeliveryDate,
            total_price: orderTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)

        if (orderError) {
          throw new Error(`Failed to update order: ${orderError.message}`)
        }

        // Delete existing order items
        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', order.id)

        if (deleteError) {
          throw new Error(`Failed to delete existing order items: ${deleteError.message}`)
        }

        // Insert updated order items
        const itemsToInsert = orderItems.map(item => ({
          order_id: order.id,
          sku_id: item.sku_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(`Failed to create updated order items: ${itemsError.message}`)
        }
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_id: selectedCustomerId,
            order_notes: orderNotes || null,
            requested_delivery_date: requestedDeliveryDate,
            status: 'pending',
            total_price: orderTotal,
            order_date: new Date().toISOString().split('T')[0]
          })
          .select()
          .single()

        if (orderError) {
          throw new Error(`Failed to create order: ${orderError.message}`)
        }

        if (!newOrder) {
          throw new Error('Order was not created successfully')
        }

        // Create order items
        const itemsToInsert = orderItems.map(item => ({
          order_id: newOrder.id,
          sku_id: item.sku_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(`Failed to create order items: ${itemsError.message}`)
        }
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
      <SheetContent className="sm:max-w-[700px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{order ? 'Edit Order' : 'Create New Order'}</SheetTitle>
          <SheetDescription>
            {order ? 'Update an existing order' : 'Submit a new order for a customer'}
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
                <Label htmlFor="customer">Customer *</Label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={setSelectedCustomerId}
                  required
                  disabled={!!customerId || !!order}
                >
                  <SelectTrigger id="customer">
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
                disabled={skus.length === 0 || loading}
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
              <div className="space-y-3">
                {orderItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={item.sku_id}
                        onValueChange={(value) => updateOrderItem(index, 'sku_id', value)}
                        disabled={loading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {skus.map((sku) => (
                            <SelectItem key={sku.id} value={sku.id}>
                              {sku.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        disabled={loading}
                        placeholder="Qty"
                      />
                    </div>
                    <div className="w-28">
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price ?? ''}
                          onChange={(e) => updateOrderItem(index, 'unit_price', e.target.value ? parseFloat(e.target.value) : null)}
                          disabled={loading}
                          placeholder="Price"
                          className={`pl-7 ${item.unit_price === null ? 'border-amber-400' : ''}`}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right font-medium text-sm">
                      {item.unit_price !== null
                        ? `$${(item.unit_price * item.quantity).toFixed(2)}`
                        : '-'}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOrderItem(index)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}

                {/* Order Total */}
                <div className="flex justify-end items-center gap-4 pt-3 border-t">
                  <span className="text-sm text-muted-foreground">Order Total:</span>
                  <span className="text-lg font-bold">
                    {hasUnpricedItems ? (
                      <span className="text-amber-600">Incomplete pricing</span>
                    ) : (
                      `$${orderTotal.toFixed(2)}`
                    )}
                  </span>
                </div>
              </div>
            )}

            {hasUnpricedItems && (
              <p className="text-sm text-amber-600">
                Some items need pricing. Enter prices manually or set up customer pricing defaults.
              </p>
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
              disabled={loading || !selectedCustomerId || orderItems.length === 0 || !requestedDeliveryDate}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {order ? 'Updating...' : 'Creating...'}
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

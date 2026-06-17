'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, DollarSign, Tag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CustomerPricing, ProductType } from '@/types/database'
import {
  getCustomerPricing,
  getPricingOptions,
  upsertCustomerPricing,
  deleteCustomerPricing,
} from '@/actions/customers'

interface SKUOption {
  id: string
  name: string
  code: string
  product_type_id: string
  product_type_name?: string
}

interface CustomerPricingProps {
  customerId: string
  canManage: boolean
}

export function CustomerPricingSection({ customerId, canManage }: CustomerPricingProps) {
  const [itemPricing, setItemPricing] = useState<CustomerPricing[]>([])
  const [categoryPricing, setCategoryPricing] = useState<CustomerPricing[]>([])
  const [skus, setSkus] = useState<SKUOption[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'item' | 'category'>('item')
  const [saving, setSaving] = useState(false)

  // Form state
  const [selectedSkuId, setSelectedSkuId] = useState('')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [price, setPrice] = useState('')

  const fetchPricing = useCallback(async () => {
    const result = await getCustomerPricing(customerId)
    if (result.data) {
      const all = result.data as unknown as CustomerPricing[]
      setItemPricing(all.filter(p => p.sku_id !== null))
      setCategoryPricing(all.filter(p => p.product_type_id !== null))
    } else {
      console.error('Error fetching pricing:', result.error)
      toast.error('Failed to load pricing')
    }
  }, [customerId])

  const fetchOptions = useCallback(async () => {
    const result = await getPricingOptions()
    if (result.products && result.productTypes) {
      const rawProducts = result.products as unknown as Array<{
        id: string
        item_name: string
        code: string
        product_type_id: string
        product_type_name?: string
      }>
      setSkus(rawProducts.map(s => ({
        id: s.id,
        name: s.item_name,
        code: s.code,
        product_type_id: s.product_type_id,
        product_type_name: s.product_type_name,
      })))
      setProductTypes(result.productTypes as unknown as ProductType[])
    } else {
      console.error('Error fetching options:', result.error)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchPricing(), fetchOptions()])
      setLoading(false)
    }
    load()
  }, [fetchPricing, fetchOptions])

  const openAddDialog = (mode: 'item' | 'category') => {
    setDialogMode(mode)
    setSelectedSkuId('')
    setSelectedTypeId('')
    setPrice('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    // Validate
    if (dialogMode === 'item' && !selectedSkuId) {
      toast.error('Please select a product')
      return
    }
    if (dialogMode === 'category' && !selectedTypeId) {
      toast.error('Please select a category')
      return
    }
    if (!price || parseFloat(price) <= 0) {
      toast.error('Please enter a valid price')
      return
    }

    setSaving(true)

    const result = await upsertCustomerPricing({
      customer_id: customerId,
      sku_id: dialogMode === 'item' ? selectedSkuId : null,
      product_type_id: dialogMode === 'category' ? selectedTypeId : null,
      price_per_unit: parseFloat(price),
      mode: dialogMode,
    })

    setSaving(false)

    if (result.error) {
      console.error('Error saving pricing:', result.error)
      toast.error('Failed to save pricing')
      return
    }

    toast.success('Pricing saved')
    setDialogOpen(false)
    fetchPricing()
  }

  const handleDelete = async (pricingId: string) => {
    const result = await deleteCustomerPricing(pricingId)
    if (result.error) {
      console.error('Error deleting pricing:', result.error)
      toast.error('Failed to remove pricing')
      return
    }
    toast.success('Pricing removed')
    fetchPricing()
  }

  // Filter out SKUs that already have pricing
  const availableSkus = skus.filter(
    s => !itemPricing.some(p => p.sku_id === s.id)
  )

  // Filter out types that already have pricing
  const availableTypes = productTypes.filter(
    t => !categoryPricing.some(p => p.product_type_id === t.id)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Category Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Category Pricing
            </CardTitle>
            {canManage && availableTypes.length > 0 && (
              <Button size="sm" onClick={() => openAddDialog('category')}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Default prices for all products in a category
          </p>
        </CardHeader>
        <CardContent>
          {categoryPricing.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No category pricing set</p>
              {canManage && availableTypes.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => openAddDialog('category')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Category Price
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price/Unit</TableHead>
                  {canManage && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryPricing.map((pricing) => (
                  <TableRow key={pricing.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {(pricing.product_type as ProductType)?.name || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${pricing.price_per_unit.toFixed(2)}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(pricing.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Item Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Item Pricing
            </CardTitle>
            {canManage && availableSkus.length > 0 && (
              <Button size="sm" onClick={() => openAddDialog('item')}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Specific prices for individual products (overrides category pricing)
          </p>
        </CardHeader>
        <CardContent>
          {itemPricing.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No item pricing set</p>
              {canManage && availableSkus.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => openAddDialog('item')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item Price
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Price/Unit</TableHead>
                  {canManage && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemPricing.map((pricing) => {
                  const sku = pricing.sku as SKUOption | undefined
                  return (
                    <TableRow key={pricing.id}>
                      <TableCell className="font-medium">
                        {sku?.name || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{sku?.code || '-'}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${pricing.price_per_unit.toFixed(2)}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(pricing.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Pricing Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {dialogMode === 'item' ? 'Item' : 'Category'} Pricing
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'item'
                ? 'Set a specific price for this product. This overrides category pricing.'
                : 'Set a default price for all products in this category.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {dialogMode === 'item' ? (
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedSkuId} onValueChange={setSelectedSkuId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSkus.map((sku) => (
                      <SelectItem key={sku.id} value={sku.id}>
                        {sku.name} ({sku.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Price per Unit</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Pricing'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

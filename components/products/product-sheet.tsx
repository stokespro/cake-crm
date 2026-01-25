'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { Loader2 } from 'lucide-react'
import type { Product, ProductType } from '@/types/database'

interface ProductSheetProps {
  open: boolean
  onClose: () => void
  product?: Product
  onSuccess: () => void
}

export function ProductSheet({ open, onClose, product, onSuccess }: ProductSheetProps) {
  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [productTypeId, setProductTypeId] = useState('')
  const [unitsPerCase, setUnitsPerCase] = useState<number | ''>('')
  const [inStock, setInStock] = useState(true)
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Fetch product types on mount
  useEffect(() => {
    fetchProductTypes()
  }, [])

  const fetchProductTypes = async () => {
    setLoadingTypes(true)
    try {
      const { data, error } = await supabase
        .from('product_types')
        .select('*')
        .order('name')

      if (error) throw error
      setProductTypes(data || [])
    } catch (error) {
      console.error('Error fetching product types:', error)
    } finally {
      setLoadingTypes(false)
    }
  }

  // Reset form when sheet opens/closes
  useEffect(() => {
    if (open) {
      if (product) {
        // Edit mode - populate with existing product data
        setItemName(product.item_name || product.strain_name || '')
        setDescription(product.description || '')
        setProductTypeId(product.product_type_id || '')
        setUnitsPerCase(product.units_per_case || '')
        setInStock(product.in_stock ?? true)
      } else {
        // Create mode - set defaults
        setItemName('')
        setDescription('')
        setProductTypeId('')
        setUnitsPerCase('')
        setInStock(true)
      }
      setError(null)
    } else {
      // Reset form when closed
      setItemName('')
      setDescription('')
      setProductTypeId('')
      setUnitsPerCase('')
      setInStock(true)
      setError(null)
    }
  }, [open, product])

  const validateForm = async () => {
    if (!itemName.trim()) {
      setError('Item name is required')
      return false
    }

    if (!productTypeId) {
      setError('Type is required')
      return false
    }

    if (unitsPerCase === '' || unitsPerCase <= 0) {
      setError('Units per case is required and must be greater than 0')
      return false
    }

    // Check for duplicate names
    try {
      let query = supabase
        .from('skus')
        .select('id, name')
        .eq('name', itemName.trim())

      // If editing, exclude the current product from the check
      if (product) {
        query = query.neq('id', product.id)
      }

      const { data: existingProducts, error: checkError } = await query

      if (checkError) {
        console.error('Error checking for duplicate name:', checkError)
        setError('Unable to validate item name. Please try again.')
        return false
      }

      if (existingProducts && existingProducts.length > 0) {
        setError('A product with this name already exists. Please choose a different name.')
        return false
      }
    } catch (error) {
      console.error('Error checking for duplicate name:', error)
      setError('Unable to validate item name. Please try again.')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!(await validateForm())) {
      return
    }

    setLoading(true)

    try {
      // Write directly to skus table (products is a view)
      const skuData = {
        name: itemName.trim(),
        description: description.trim() || null,
        product_type_id: productTypeId,
        units_per_case: unitsPerCase as number,
        in_stock: inStock,
        updated_at: new Date().toISOString(),
      }

      if (product) {
        // Edit mode - update existing SKU
        const { error: updateError } = await supabase
          .from('skus')
          .update(skuData)
          .eq('id', product.id)

        if (updateError) {
          if (updateError.code === '23505') {
            throw new Error('A product with this name already exists. Please choose a different name.')
          }
          throw new Error(`Failed to update product: ${updateError.message}`)
        }
      } else {
        // Create mode - need code and strain_id for new SKU
        // For now, generate code from name and require strain selection
        setError('Creating new products is not yet supported. Please use the existing products.')
        setLoading(false)
        return
      }

      // Call success callback and close sheet
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error in handleSubmit:', error)
      const action = product ? 'updating' : 'creating'
      setError(error instanceof Error ? error.message : `An unexpected error occurred while ${action} the product`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[500px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product ? 'Edit Product' : 'Create New Product'}</SheetTitle>
          <SheetDescription>
            {product ? 'Update product information' : 'Add a new product to the catalog'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {/* Product Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Item Name *</Label>
              <Input
                id="itemName"
                placeholder="e.g., Bubble Bath A"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Product description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={loading}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="productType">Type *</Label>
              <Select
                value={productTypeId}
                onValueChange={setProductTypeId}
                disabled={loading || loadingTypes}
              >
                <SelectTrigger id="productType">
                  <SelectValue placeholder={loadingTypes ? "Loading..." : "Select type"} />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitsPerCase">Units Per Case *</Label>
              <Input
                id="unitsPerCase"
                type="number"
                placeholder="e.g., 32"
                min="1"
                value={unitsPerCase}
                onChange={(e) => setUnitsPerCase(e.target.value ? parseInt(e.target.value) : '')}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                A products typically have 32 units per case, B products have 16
              </p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="inStock" className="text-base">In Stock</Label>
                <p className="text-sm text-muted-foreground">
                  Product is available for orders
                </p>
              </div>
              <Switch
                id="inStock"
                checked={inStock}
                onCheckedChange={setInStock}
                disabled={loading}
              />
            </div>
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
              disabled={loading || !itemName.trim() || !productTypeId || unitsPerCase === ''}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {product ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                product ? 'Update Product' : 'Create Product'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

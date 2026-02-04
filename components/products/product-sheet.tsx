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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Loader2, ChevronDown, ChevronUp, Package } from 'lucide-react'
import type { Product, ProductType } from '@/types/database'
import { SkuMaterials } from './sku-materials'

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
  const [code, setCode] = useState('')
  const [strainId, setStrainId] = useState('')
  const [strains, setStrains] = useState<{id: string, name: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [loadingStrains, setLoadingStrains] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const supabase = createClient()

  // Fetch product types and strains on mount
  useEffect(() => {
    fetchProductTypes()
    fetchStrains()
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

  const fetchStrains = async () => {
    setLoadingStrains(true)
    try {
      const { data, error } = await supabase
        .from('strains')
        .select('id, name')
        .order('name')

      if (error) throw error
      setStrains(data || [])
    } catch (error) {
      console.error('Error fetching strains:', error)
    } finally {
      setLoadingStrains(false)
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
        setCode(product.code || '')
        setStrainId(product.strain_id || '')
      } else {
        // Create mode - set defaults
        setItemName('')
        setDescription('')
        setProductTypeId('')
        setUnitsPerCase('')
        setInStock(true)
        setCode('')
        setStrainId('')
      }
      setError(null)
    } else {
      // Reset form when closed
      setItemName('')
      setDescription('')
      setProductTypeId('')
      setUnitsPerCase('')
      setInStock(true)
      setCode('')
      setStrainId('')
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

    // Additional validation for create mode
    if (!product) {
      if (!code.trim()) {
        setError('SKU code is required')
        return false
      }

      if (/\s/.test(code)) {
        setError('SKU code cannot contain spaces')
        return false
      }

      if (!strainId) {
        setError('Strain is required')
        return false
      }

      // Check for duplicate codes
      try {
        const { data: existingCodes, error: codeError } = await supabase
          .from('skus')
          .select('id, code')
          .eq('code', code.trim().toUpperCase())

        if (codeError) {
          console.error('Error checking for duplicate code:', codeError)
          setError('Unable to validate SKU code. Please try again.')
          return false
        }

        if (existingCodes && existingCodes.length > 0) {
          setError('A product with this SKU code already exists. Please choose a different code.')
          return false
        }
      } catch (error) {
        console.error('Error checking for duplicate code:', error)
        setError('Unable to validate SKU code. Please try again.')
        return false
      }
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
        // Create mode - insert new SKU
        const { error: insertError } = await supabase
          .from('skus')
          .insert({
            code: code.trim().toUpperCase(),
            name: itemName.trim(),
            strain_id: strainId,
            product_type_id: productTypeId,
            units_per_case: unitsPerCase as number,
            in_stock: inStock,
            description: description.trim() || null,
          })

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error('A product with this code or name already exists. Please choose different values.')
          }
          throw new Error(`Failed to create product: ${insertError.message}`)
        }
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

            {/* SKU Code - only show when creating */}
            {!product && (
              <div className="space-y-2">
                <Label htmlFor="code">SKU Code *</Label>
                <Input
                  id="code"
                  placeholder="e.g., BUBBLEBATH-A"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this product (no spaces allowed)
                </p>
              </div>
            )}

            {/* Strain - only show when creating */}
            {!product && (
              <div className="space-y-2">
                <Label htmlFor="strain">Strain *</Label>
                <Select
                  value={strainId}
                  onValueChange={setStrainId}
                  disabled={loading || loadingStrains}
                >
                  <SelectTrigger id="strain">
                    <SelectValue placeholder={loadingStrains ? "Loading..." : "Select strain"} />
                  </SelectTrigger>
                  <SelectContent>
                    {strains.map((strain) => (
                      <SelectItem key={strain.id} value={strain.id}>
                        {strain.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

          {/* Materials Section - Only show when editing */}
          {product && (
            <Collapsible open={materialsOpen} onOpenChange={setMaterialsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    <span>Materials</span>
                  </div>
                  {materialsOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <SkuMaterials
                  skuId={product.id}
                  skuName={product.item_name || product.strain_name || ''}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

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
              disabled={loading || !itemName.trim() || !productTypeId || unitsPerCase === '' || (!product && (!code.trim() || !strainId))}
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

'use client'

import { useState, useEffect } from 'react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Loader2, ChevronDown, ChevronUp, Package } from 'lucide-react'
import type { Product, ProductType } from '@/types/database'
import { SkuMaterials } from './sku-materials'
import {
  getProductTypes,
  getStrains,
  checkSkuCodeExists,
  checkSkuNameExists,
  createSku,
  updateSku,
} from '@/actions/products'

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
  const [gramsPerUnit, setGramsPerUnit] = useState<number | ''>('')
  const [status, setStatus] = useState<'active' | 'staged' | 'discontinued'>('active')
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [code, setCode] = useState('')
  const [strainId, setStrainId] = useState('')
  const [strains, setStrains] = useState<{id: string, name: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [loadingStrains, setLoadingStrains] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [materialsOpen, setMaterialsOpen] = useState(false)

  // Fetch product types and strains on mount
  useEffect(() => {
    fetchProductTypes()
    fetchStrains()
  }, [])

  const fetchProductTypes = async () => {
    setLoadingTypes(true)
    try {
      const result = await getProductTypes()
      if ('error' in result) {
        console.error('Error fetching product types:', result.error)
      } else {
        setProductTypes(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching product types:', error)
    } finally {
      setLoadingTypes(false)
    }
  }

  const fetchStrains = async () => {
    setLoadingStrains(true)
    try {
      const result = await getStrains()
      if ('error' in result) {
        console.error('Error fetching strains:', result.error)
      } else {
        setStrains(result.data || [])
      }
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
        setGramsPerUnit(product.grams_per_unit ?? '')
        setStatus(product.status ?? 'active')
        setCode(product.code || '')
        setStrainId(product.strain_id || '')
      } else {
        // Create mode - set defaults
        setItemName('')
        setDescription('')
        setProductTypeId('')
        setUnitsPerCase('')
        setGramsPerUnit('')
        setStatus('active')
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
      setGramsPerUnit('')
      setStatus('active')
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

    if (gramsPerUnit === '' || gramsPerUnit <= 0) {
      setError('Grams per unit is required and must be greater than 0')
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

      // Check for duplicate codes via server action
      const codeCheck = await checkSkuCodeExists(code.trim().toUpperCase())
      if (codeCheck.error) {
        setError('Unable to validate SKU code. Please try again.')
        return false
      }
      if (codeCheck.exists) {
        setError('A product with this SKU code already exists. Please choose a different code.')
        return false
      }
    }

    // Check for duplicate names via server action
    const nameCheck = await checkSkuNameExists(itemName.trim(), product?.id)
    if (nameCheck.error) {
      setError('Unable to validate item name. Please try again.')
      return false
    }
    if (nameCheck.exists) {
      setError('A product with this name already exists. Please choose a different name.')
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
      if (product) {
        // Edit mode - update existing SKU via server action
        const result = await updateSku(product.id, {
          name: itemName.trim(),
          description: description.trim() || null,
          product_type_id: productTypeId,
          units_per_case: unitsPerCase as number,
          grams_per_unit: gramsPerUnit as number,
          status,
        })

        if ('error' in result && result.error) {
          throw new Error(result.error)
        }
      } else {
        // Create mode - insert new SKU via server action
        const result = await createSku({
          code: code.trim().toUpperCase(),
          name: itemName.trim(),
          strain_id: strainId,
          product_type_id: productTypeId,
          units_per_case: unitsPerCase as number,
          grams_per_unit: gramsPerUnit as number,
          status,
          description: description.trim() || null,
        })

        if ('error' in result && result.error) {
          throw new Error(result.error)
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

            <div className="space-y-2">
              <Label htmlFor="gramsPerUnit">Grams Per Unit *</Label>
              <Input
                id="gramsPerUnit"
                type="number"
                placeholder="e.g., 3.5"
                min="0.1"
                step="0.1"
                value={gramsPerUnit}
                onChange={(e) => setGramsPerUnit(e.target.value ? parseFloat(e.target.value) : '')}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Weight per individual unit (e.g., 3.5 for eighths, 14 for half oz)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Lifecycle Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as 'active' | 'staged' | 'discontinued')}
                disabled={loading}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="staged">Staged</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Stock availability is automatically derived from inventory levels.
              </p>
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
              disabled={loading || !itemName.trim() || !productTypeId || unitsPerCase === '' || gramsPerUnit === '' || (!product && (!code.trim() || !strainId))}
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

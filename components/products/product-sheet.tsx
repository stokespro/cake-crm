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
import { Loader2, Plus, Trash2, DollarSign, Percent } from 'lucide-react'
import type { Product } from '@/types/database'

interface PricingTier {
  quantity: number
  price: number
  discount?: number
}

interface ProductSheetProps {
  open: boolean
  onClose: () => void
  product?: Product // Optional for edit mode
  onSuccess: () => void
}

export function ProductSheet({ open, onClose, product, onSuccess }: ProductSheetProps) {
  const [strainName, setStrainName] = useState('')
  const [description, setDescription] = useState('')
  const [thcPercentage, setThcPercentage] = useState<number | ''>('')
  const [cbdPercentage, setCbdPercentage] = useState<number | ''>('')
  const [category, setCategory] = useState('')
  const [inStock, setInStock] = useState(true)
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([
    { quantity: 1, price: 0 } // Base tier - always present
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Reset form when sheet opens/closes
  useEffect(() => {
    if (open) {
      if (product) {
        // Edit mode - populate with existing product data
        setStrainName(product.strain_name || '')
        setDescription(product.description || '')
        setThcPercentage(product.thc_percentage || '')
        setCbdPercentage(product.cbd_percentage || '')
        setCategory(product.category || '')
        setInStock(product.in_stock ?? true)
        
        // Initialize with base tier from existing price_per_unit
        setPricingTiers([{ quantity: 1, price: product.price_per_unit }])
      } else {
        // Create mode - set defaults
        setStrainName('')
        setDescription('')
        setThcPercentage('')
        setCbdPercentage('')
        setCategory('')
        setInStock(true)
        setPricingTiers([{ quantity: 1, price: 0 }])
      }
      setError(null)
    } else {
      // Reset form when closed
      setStrainName('')
      setDescription('')
      setThcPercentage('')
      setCbdPercentage('')
      setCategory('')
      setInStock(true)
      setPricingTiers([{ quantity: 1, price: 0 }])
      setError(null)
    }
  }, [open, product])

  // Calculate discount percentages when tiers change
  useEffect(() => {
    const updatedTiers = pricingTiers.map((tier, index) => {
      if (index === 0) {
        // Base tier has no discount
        return { ...tier, discount: 0 }
      } else {
        // Calculate discount based on base price
        const basePrice = pricingTiers[0].price
        if (basePrice > 0) {
          const discount = ((basePrice - tier.price) / basePrice) * 100
          return { ...tier, discount: Math.max(0, discount) }
        }
        return { ...tier, discount: 0 }
      }
    })
    
    // Only update if discounts actually changed to avoid infinite loop
    const hasDiscountChanges = updatedTiers.some((tier, index) => 
      tier.discount !== pricingTiers[index]?.discount
    )
    
    if (hasDiscountChanges) {
      setPricingTiers(updatedTiers)
    }
  }, [pricingTiers.map(t => `${t.quantity}-${t.price}`).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const addPricingTier = () => {
    const lastTier = pricingTiers[pricingTiers.length - 1]
    const newQuantity = lastTier ? lastTier.quantity + 5 : 1
    const newPrice = lastTier ? lastTier.price * 0.9 : 0 // Default to 10% discount
    
    setPricingTiers([
      ...pricingTiers,
      { quantity: newQuantity, price: parseFloat(newPrice.toFixed(2)) }
    ])
  }

  const updatePricingTier = (index: number, field: keyof PricingTier, value: number) => {
    const updated = [...pricingTiers]
    updated[index] = { ...updated[index], [field]: value }
    
    // Sort by quantity to maintain order
    updated.sort((a, b) => a.quantity - b.quantity)
    
    setPricingTiers(updated)
  }

  const removePricingTier = (index: number) => {
    if (index === 0) return // Cannot remove base tier
    setPricingTiers(pricingTiers.filter((_, i) => i !== index))
  }

  const validateForm = async () => {
    if (!strainName.trim()) {
      setError('Strain name is required')
      return false
    }

    // Check for duplicate strain names
    try {
      let query = supabase
        .from('products')
        .select('id, strain_name')
        .eq('strain_name', strainName.trim())

      // If editing, exclude the current product from the check
      if (product) {
        query = query.neq('id', product.id)
      }

      const { data: existingProducts, error: checkError } = await query

      if (checkError) {
        console.error('Error checking for duplicate strain name:', checkError)
        setError('Unable to validate strain name. Please try again.')
        return false
      }

      if (existingProducts && existingProducts.length > 0) {
        setError('A product with this strain name already exists. Please choose a different name.')
        return false
      }
    } catch (error) {
      console.error('Error checking for duplicate strain name:', error)
      setError('Unable to validate strain name. Please try again.')
      return false
    }

    if (pricingTiers.length === 0) {
      setError('At least one pricing tier is required')
      return false
    }

    // Validate that base tier (quantity 1) exists and has a price
    const baseTier = pricingTiers.find(tier => tier.quantity === 1)
    if (!baseTier || baseTier.price <= 0) {
      setError('Base price (quantity 1) must be greater than 0')
      return false
    }

    // Validate that all tiers have valid quantities and prices
    for (let i = 0; i < pricingTiers.length; i++) {
      const tier = pricingTiers[i]
      
      if (tier.quantity <= 0) {
        setError(`Quantity for tier ${i + 1} must be greater than 0`)
        return false
      }
      
      if (tier.price <= 0) {
        setError(`Price for tier ${i + 1} must be greater than 0`)
        return false
      }
    }

    // Validate pricing tiers are in correct order (prices should decrease or stay same as quantity increases)
    const sortedTiers = [...pricingTiers].sort((a, b) => a.quantity - b.quantity)
    for (let i = 1; i < sortedTiers.length; i++) {
      if (sortedTiers[i].price > sortedTiers[i - 1].price) {
        setError(`Price for quantity ${sortedTiers[i].quantity} should be less than or equal to price for quantity ${sortedTiers[i - 1].quantity}`)
        return false
      }
    }

    // Validate THC and CBD percentages if provided
    if (thcPercentage !== '' && (thcPercentage < 0 || thcPercentage > 100)) {
      setError('THC percentage must be between 0 and 100')
      return false
    }

    if (cbdPercentage !== '' && (cbdPercentage < 0 || cbdPercentage > 100)) {
      setError('CBD percentage must be between 0 and 100')
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated. Please log in and try again.')
      }

      // Get the base price (quantity 1) for the legacy price_per_unit field
      const baseTier = pricingTiers.find(tier => tier.quantity === 1)
      if (!baseTier) {
        throw new Error('Base pricing tier (quantity 1) is required')
      }

      const productData = {
        strain_name: strainName.trim(),
        description: description.trim() || null,
        thc_percentage: thcPercentage !== '' ? thcPercentage : null,
        cbd_percentage: cbdPercentage !== '' ? cbdPercentage : null,
        category: category.trim() || null,
        in_stock: inStock,
        price_per_unit: baseTier.price, // Store base price for compatibility
        // Note: In a full implementation, you might want to store pricing_tiers as JSON
        // pricing_tiers: JSON.stringify(pricingTiers)
      }

      if (product) {
        // Edit mode - update existing product
        const { error: updateError } = await supabase
          .from('products')
          .update({
            ...productData,
            updated_at: new Date().toISOString()
          })
          .eq('id', product.id)

        if (updateError) {
          // Check for duplicate strain_name constraint violation
          if (updateError.code === '23505' && updateError.message.includes('products_strain_name_key')) {
            throw new Error('A product with this strain name already exists. Please choose a different name.')
          }
          throw new Error(`Failed to update product: ${updateError.message}`)
        }
      } else {
        // Create mode - insert new product
        const { error: insertError } = await supabase
          .from('products')
          .insert(productData)

        if (insertError) {
          // Check for duplicate strain_name constraint violation
          if (insertError.code === '23505' && insertError.message.includes('products_strain_name_key')) {
            throw new Error('A product with this strain name already exists. Please choose a different name.')
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
      <SheetContent className="sm:max-w-[700px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product ? 'Edit Product' : 'Create New Product'}</SheetTitle>
          <SheetDescription>
            {product ? 'Update product information and pricing' : 'Add a new cannabis product with tiered pricing'}
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
            <h3 className="text-lg font-medium">Product Information</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="strainName">Strain Name *</Label>
                <Input
                  id="strainName"
                  placeholder="e.g., Blue Dream"
                  value={strainName}
                  onChange={(e) => setStrainName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Product description, effects, and characteristics..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={loading}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="thcPercentage">THC %</Label>
                  <Input
                    id="thcPercentage"
                    type="number"
                    placeholder="0-100"
                    min="0"
                    max="100"
                    step="0.1"
                    value={thcPercentage}
                    onChange={(e) => setThcPercentage(e.target.value ? parseFloat(e.target.value) : '')}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cbdPercentage">CBD %</Label>
                  <Input
                    id="cbdPercentage"
                    type="number"
                    placeholder="0-100"
                    min="0"
                    max="100"
                    step="0.1"
                    value={cbdPercentage}
                    onChange={(e) => setCbdPercentage(e.target.value ? parseFloat(e.target.value) : '')}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory} disabled={loading}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flower">Flower</SelectItem>
                      <SelectItem value="concentrate">Concentrate</SelectItem>
                      <SelectItem value="edible">Edible</SelectItem>
                      <SelectItem value="topical">Topical</SelectItem>
                      <SelectItem value="vape">Vape</SelectItem>
                      <SelectItem value="pre-roll">Pre-roll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="inStock"
                  checked={inStock}
                  onChange={(e) => setInStock(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="inStock" className="text-sm font-normal cursor-pointer">
                  In Stock
                </Label>
              </div>
            </div>
          </div>

          {/* Pricing Tiers */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Pricing Tiers</h3>
              <Button
                type="button"
                size="sm"
                onClick={addPricingTier}
                disabled={loading}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Tier
              </Button>
            </div>

            <div className="space-y-4">
              {pricingTiers
                .sort((a, b) => a.quantity - b.quantity)
                .map((tier, index) => (
                <div key={`${tier.quantity}-${index}`} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">
                      {tier.quantity === 1 ? 'Base Price' : `Tier ${index + 1}`}
                    </span>
                    {tier.quantity !== 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePricingTier(index)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={tier.quantity}
                        onChange={(e) => updatePricingTier(index, 'quantity', parseInt(e.target.value) || 1)}
                        disabled={loading || tier.quantity === 1} // Don't allow changing base quantity
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Price *</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={tier.price}
                          onChange={(e) => updatePricingTier(index, 'price', parseFloat(e.target.value) || 0)}
                          disabled={loading}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Discount</Label>
                      <div className="flex items-center h-10 px-3 bg-muted rounded-md text-sm">
                        <Percent className="h-4 w-4 mr-1" />
                        {tier.discount?.toFixed(1) || '0.0'}%
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Per Unit</Label>
                      <div className="flex items-center h-10 px-3 bg-muted rounded-md text-sm font-medium">
                        <DollarSign className="h-4 w-4 mr-1" />
                        {(tier.price / tier.quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-sm text-muted-foreground">
              <p>• Base price tier (quantity 1) cannot be removed</p>
              <p>• Prices should decrease as quantity increases for volume discounts</p>
              <p>• Discount percentages are calculated automatically</p>
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
              disabled={loading || !strainName.trim() || pricingTiers.length === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {product ? 'Updating Product...' : 'Creating Product...'}
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
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Package, DollarSign, Leaf, CheckCircle, XCircle, MoreHorizontal, Edit } from 'lucide-react'
import type { Product } from '@/types/database'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProductSheet } from '@/components/products/product-sheet'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [userRole, setUserRole] = useState<string>('agent')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      await fetchUserRole()
      await fetchProducts()
    }
    loadData()
  }, [])

  useEffect(() => {
    filterProducts()
  }, [products, searchTerm, filterCategory, filterStock])

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (data) {
        setUserRole(data.role)
        console.log('User role in products:', data.role)
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      setError(null) // Reset error state
      console.log('Starting to fetch products...')
      console.log('User authentication status:', await supabase.auth.getUser())
      
      // First, try a simple query without JOIN to test basic access
      const { data: simpleData, error: simpleError } = await supabase
        .from('products')
        .select('*')
        .order('strain_name')

      console.log('Simple products query:', { data: simpleData, error: simpleError })

      if (simpleError) {
        console.error('Simple query failed:', simpleError)
        throw simpleError
      }

      // If we have products from the simple query, use those and try to enhance with pricing
      if (simpleData && simpleData.length > 0) {
        console.log('Simple query succeeded with', simpleData.length, 'products')
        
        // Try to add pricing data - but don't fail if pricing table doesn't exist
        try {
          const { data: productsWithPricing, error: joinError } = await supabase
            .from('products')
            .select(`
              *,
              product_pricing(
                id,
                min_quantity,
                price
              )
            `)
            .order('strain_name')

          console.log('JOIN query result:', { data: productsWithPricing, error: joinError })

          // Check if the error is specifically about the product_pricing table not existing
          if (joinError) {
            console.warn('JOIN query failed, using simple product data:', joinError)
            
            // Check if it's a "relation does not exist" error which means table doesn't exist yet
            const errorMessage = joinError.message?.toLowerCase() || ''
            if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('product_pricing')) {
              console.info('Product pricing table does not exist yet - this is expected before migration is run')
            }
            
            // Use the simple data without pricing
            setProducts(simpleData)
          } else {
            console.log('JOIN query succeeded with pricing data')
            console.log('Products with pricing:', productsWithPricing?.filter(p => p.product_pricing && p.product_pricing.length > 0).length || 0)
            setProducts(productsWithPricing || [])
          }
        } catch (joinError) {
          console.warn('Error with pricing JOIN, falling back to simple product data:', joinError)
          setProducts(simpleData)
        }
      } else {
        console.log('No products found in simple query')
        setProducts([])
      }
      
    } catch (error) {
      console.error('Error fetching products:', error)
      setError(`Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const filterProducts = () => {
    let filtered = [...products]

    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.strain_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(product => product.category === filterCategory)
    }

    if (filterStock === 'in-stock') {
      filtered = filtered.filter(product => product.in_stock)
    } else if (filterStock === 'out-of-stock') {
      filtered = filtered.filter(product => !product.in_stock)
    }

    setFilteredProducts(filtered)
  }

  const toggleStock = async (productId: string, currentStock: boolean) => {
    if (userRole !== 'management' && userRole !== 'admin') return

    try {
      const { error } = await supabase
        .from('products')
        .update({ in_stock: !currentStock })
        .eq('id', productId)

      if (error) throw error
      fetchProducts()
    } catch (error) {
      console.error('Error updating product stock:', error)
    }
  }

  const canManageProducts = userRole === 'management' || userRole === 'admin'

  // Product sheet handlers
  const openCreateSheet = () => {
    setSelectedProduct(undefined)
    setSheetOpen(true)
  }

  const openEditSheet = (product: Product) => {
    setSelectedProduct(product)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setSelectedProduct(undefined)
  }

  const handleSheetSuccess = () => {
    fetchProducts() // Refresh products after create/edit
    closeSheet()
  }

  // Calculate pricing range for display
  const getPricingRange = (product: Product) => {
    // Check both pricing (old format) and product_pricing (new format)
    const pricingData = (product as any).product_pricing || product.pricing || []
    
    if (!pricingData || pricingData.length === 0) {
      return `$${product.price_per_unit.toFixed(2)}`
    }

    try {
      const prices = pricingData.map((p: any) => p.price).filter((price: number) => price != null && !isNaN(price)).sort((a: number, b: number) => a - b)
      
      if (prices.length === 0) {
        return `$${product.price_per_unit.toFixed(2)}`
      }
      
      const minPrice = Math.min(prices[0], product.price_per_unit)
      const maxPrice = Math.max(prices[prices.length - 1], product.price_per_unit)

      if (minPrice === maxPrice) {
        return `$${minPrice.toFixed(2)}`
      }

      return `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`
    } catch (error) {
      console.warn('Error calculating pricing range:', error)
      return `$${product.price_per_unit.toFixed(2)}`
    }
  }

  // Get unique categories from products
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading products...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground mt-1">Cannabis strains and pricing catalog</p>
        </div>
        {canManageProducts && (
          <Button onClick={openCreateSheet}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search strains..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category!}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStock} onValueChange={setFilterStock}>
              <SelectTrigger>
                <SelectValue placeholder="Stock Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="out-of-stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground">
              {filteredProducts.length} of {products.length} products
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200">
          <CardContent className="py-6">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-red-900 mb-2">Database Connection Error</h3>
              <p className="text-red-700 mb-4">{error}</p>
              <Button onClick={fetchProducts} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          {filteredProducts.length === 0 && !error ? (
            <div className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterCategory !== 'all' || filterStock !== 'all' 
                  ? 'No products found matching your filters' 
                  : 'No products added yet'}
              </p>
              {canManageProducts && !searchTerm && filterCategory === 'all' && filterStock === 'all' && (
                <Button onClick={openCreateSheet}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Product
                </Button>
              )}
            </div>
          ) : !error ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead>Price Range</TableHead>
                    <TableHead className="hidden lg:table-cell">THC/CBD</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Leaf className="h-4 w-4 text-green-600" />
                          <div>
                            <div className="font-medium">{product.strain_name}</div>
                            {product.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1 max-w-[200px]">
                                {product.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {product.category && (
                          <Badge variant="outline" className="text-xs">
                            {product.category}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 font-medium">
                          <DollarSign className="h-4 w-4" />
                          {getPricingRange(product)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="space-y-1 text-sm">
                          {product.thc_percentage && (
                            <div>THC: {product.thc_percentage}%</div>
                          )}
                          {product.cbd_percentage && (
                            <div>CBD: {product.cbd_percentage}%</div>
                          )}
                          {!product.thc_percentage && !product.cbd_percentage && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.in_stock ? (
                          <Badge variant="default" className="bg-green-600">In Stock</Badge>
                        ) : (
                          <Badge variant="secondary">Out of Stock</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canManageProducts && (
                              <DropdownMenuItem onClick={() => openEditSheet(product)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Product
                              </DropdownMenuItem>
                            )}
                            {canManageProducts && (
                              <DropdownMenuItem onClick={() => toggleStock(product.id, product.in_stock)}>
                                {product.in_stock ? (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Mark Out of Stock
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Mark In Stock
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!canManageProducts && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              Note: Only management and admin users can add or edit products.
            </p>
          </CardContent>
        </Card>
      )}

      <ProductSheet
        open={sheetOpen}
        onClose={closeSheet}
        product={selectedProduct}
        onSuccess={handleSheetSuccess}
      />
    </div>
  )
}
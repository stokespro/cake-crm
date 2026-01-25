'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
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
import { Plus, Search, Package, Leaf, CheckCircle, XCircle, MoreHorizontal, Edit } from 'lucide-react'
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
  const [filterType, setFilterType] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const { user } = useAuth()

  // Get user role from auth context
  const userRole = user?.role || 'agent'

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    filterProducts()
  }, [products, searchTerm, filterType, filterStock])

  const fetchProducts = async () => {
    try {
      setError(null)

      const { data, error: queryError } = await supabase
        .from('products')
        .select('*')
        .order('item_name')

      if (queryError) {
        console.error('Error fetching products:', queryError)
        throw queryError
      }

      setProducts(data || [])
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
        (product.item_name || product.strain_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(product => product.product_type_name === filterType)
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
      // Update skus table directly (products is a view)
      const { error } = await supabase
        .from('skus')
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
    fetchProducts()
    closeSheet()
  }

  // Get unique product types from products
  const productTypes = Array.from(new Set(products.map(p => p.product_type_name).filter(Boolean)))

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
          <p className="text-muted-foreground mt-1">Product catalog and inventory management</p>
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
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {productTypes.map(type => (
                  <SelectItem key={type} value={type!}>
                    {type}
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
                {searchTerm || filterType !== 'all' || filterStock !== 'all'
                  ? 'No products found matching your filters'
                  : 'No products added yet'}
              </p>
              {canManageProducts && !searchTerm && filterType === 'all' && filterStock === 'all' && (
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
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Units/Case</TableHead>
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
                            <div className="font-medium">{product.item_name || product.strain_name}</div>
                            {product.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1 max-w-[200px]">
                                {product.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{product.code}</span>
                      </TableCell>
                      <TableCell>
                        {product.product_type_name && (
                          <Badge variant="outline" className="text-xs">
                            {product.product_type_name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">{product.units_per_case || '-'}</span>
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

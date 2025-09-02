'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import { Plus, Search, Package, DollarSign, Leaf, CheckCircle, XCircle } from 'lucide-react'
import type { Product } from '@/types/database'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [userRole, setUserRole] = useState<string>('agent')
  const supabase = createClient()

  useEffect(() => {
    fetchUserRole()
    fetchProducts()
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

      if (data) setUserRole(data.role)
    } catch (error) {
      console.error('Error fetching user role:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('strain_name')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
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
          <Button asChild>
            <Link href="/dashboard/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Link>
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

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterCategory !== 'all' || filterStock !== 'all' 
                  ? 'No products found matching your filters' 
                  : 'No products added yet'}
              </p>
              {canManageProducts && !searchTerm && filterCategory === 'all' && filterStock === 'all' && (
                <Button asChild>
                  <Link href="/dashboard/products/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Product
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredProducts.map((product) => (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">
                    <div className="flex items-center gap-2">
                      <Leaf className="h-5 w-5 text-green-600" />
                      <span className="truncate">{product.strain_name}</span>
                    </div>
                  </CardTitle>
                  {product.in_stock ? (
                    <Badge variant="default" className="bg-green-600">In Stock</Badge>
                  ) : (
                    <Badge variant="secondary">Out of Stock</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-5 w-5" />
                    {product.price_per_unit.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground">per unit</span>
                </div>

                {(product.thc_percentage || product.cbd_percentage) && (
                  <div className="flex gap-4 text-sm">
                    {product.thc_percentage && (
                      <div>
                        <span className="font-medium">THC:</span>
                        <span className="ml-1">{product.thc_percentage}%</span>
                      </div>
                    )}
                    {product.cbd_percentage && (
                      <div>
                        <span className="font-medium">CBD:</span>
                        <span className="ml-1">{product.cbd_percentage}%</span>
                      </div>
                    )}
                  </div>
                )}

                {product.category && (
                  <Badge variant="outline" className="w-fit">
                    {product.category}
                  </Badge>
                )}

                {product.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {product.description}
                  </p>
                )}

                {canManageProducts && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => toggleStock(product.id, product.in_stock)}
                  >
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
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {!canManageProducts && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              Note: Only management and admin users can add or edit products.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
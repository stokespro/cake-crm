'use client'

import { useEffect, useState, useMemo } from 'react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Search,
  RefreshCw,
  Package,
  Warehouse,
  ShoppingCart,
  AlertTriangle,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'

// Type IDs for A Buds and B Buds
const A_BUDS_TYPE_ID = '506cc32c-272c-443b-823e-77652afc2409'
const B_BUDS_TYPE_ID = '06db9d58-e3dd-4c77-aa24-795c31c8f065'

// Conversion rates for vault (grams to cases)
const A_BUDS_GRAMS_PER_CASE = 112
const B_BUDS_GRAMS_PER_CASE = 224

// Low stock threshold (in cases)
const LOW_STOCK_THRESHOLD = 5

interface SKU {
  id: string
  code: string
  name: string
  strain_id: string
  product_type_id: string
}

interface Strain {
  id: string
  name: string
}

interface ProductType {
  id: string
  name: string
}

interface InventoryRecord {
  sku_id: string
  cased: number
  filled: number
  staged: number
}

interface VaultPackage {
  strain_id: string
  type_id: string
  current_weight: number
  is_active: boolean
}

interface OrderItem {
  sku_id: string
  quantity: number
}

interface Order {
  id: string
  status: string
  order_items: OrderItem[]
}

interface InventoryRow {
  skuId: string
  skuCode: string
  skuName: string
  strainId: string
  strainName: string
  productTypeId: string
  productTypeName: string
  vaultGrams: number
  vaultCases: number
  staged: number
  filled: number
  cased: number
  pendingOrders: number
  available: number
  isLowStock: boolean
}

type SortField = 'sku' | 'type' | 'vault' | 'staged' | 'filled' | 'cased' | 'orders' | 'available'
type SortDirection = 'asc' | 'desc'

export default function InventoryPage() {
  const [skus, setSkus] = useState<SKU[]>([])
  const [strains, setStrains] = useState<Strain[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [inventory, setInventory] = useState<InventoryRecord[]>([])
  const [vaultPackages, setVaultPackages] = useState<VaultPackage[]>([])
  const [pendingOrderItems, setPendingOrderItems] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [sortField, setSortField] = useState<SortField>('sku')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const supabase = createClient()
  const { user } = useAuth()

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    try {
      // Fetch all data in parallel
      const [
        skusResult,
        strainsResult,
        productTypesResult,
        inventoryResult,
        packagesResult,
        ordersResult,
      ] = await Promise.all([
        supabase.from('skus').select('id, code, name, strain_id, product_type_id').order('code'),
        supabase.from('strains').select('id, name'),
        supabase.from('product_types').select('id, name'),
        supabase.from('inventory').select('sku_id, cased, filled, staged'),
        supabase.from('packages').select('strain_id, type_id, current_weight, is_active').eq('is_active', true),
        supabase.from('orders').select('id, status, order_items(sku_id, quantity)').in('status', ['pending', 'confirmed', 'packed']),
      ])

      if (skusResult.error) throw skusResult.error
      if (strainsResult.error) throw strainsResult.error
      if (productTypesResult.error) throw productTypesResult.error
      if (inventoryResult.error) throw inventoryResult.error
      if (packagesResult.error) throw packagesResult.error
      if (ordersResult.error) throw ordersResult.error

      setSkus(skusResult.data || [])
      setStrains(strainsResult.data || [])
      setProductTypes(productTypesResult.data || [])
      setInventory(inventoryResult.data || [])
      setVaultPackages(packagesResult.data || [])

      // Calculate pending orders by SKU
      const orderItemsMap = new Map<string, number>()
      const orders = ordersResult.data || []
      for (const order of orders) {
        for (const item of order.order_items || []) {
          const current = orderItemsMap.get(item.sku_id) || 0
          orderItemsMap.set(item.sku_id, current + item.quantity)
        }
      }
      setPendingOrderItems(orderItemsMap)
    } catch (error) {
      console.error('Error fetching inventory data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAllData()
    setRefreshing(false)
  }

  // Calculate vault grams by strain and product type
  const vaultByStrainAndType = useMemo(() => {
    const map = new Map<string, number>()
    for (const pkg of vaultPackages) {
      const key = `${pkg.strain_id}-${pkg.type_id}`
      const current = map.get(key) || 0
      map.set(key, current + pkg.current_weight)
    }
    return map
  }, [vaultPackages])

  // Build inventory rows
  const inventoryRows = useMemo((): InventoryRow[] => {
    const strainMap = new Map(strains.map(s => [s.id, s.name]))
    const typeMap = new Map(productTypes.map(t => [t.id, t.name]))
    const inventoryMap = new Map(inventory.map(i => [i.sku_id, i]))

    return skus.map(sku => {
      const strainName = strainMap.get(sku.strain_id) || 'Unknown'
      const productTypeName = typeMap.get(sku.product_type_id) || 'Unknown'
      const inv = inventoryMap.get(sku.id)

      // Get vault grams for this SKU's strain and product type
      const vaultKey = `${sku.strain_id}-${sku.product_type_id}`
      const vaultGrams = vaultByStrainAndType.get(vaultKey) || 0

      // Convert vault grams to cases based on product type
      let vaultCases = 0
      if (sku.product_type_id === A_BUDS_TYPE_ID) {
        vaultCases = Math.floor(vaultGrams / A_BUDS_GRAMS_PER_CASE)
      } else if (sku.product_type_id === B_BUDS_TYPE_ID) {
        vaultCases = Math.floor(vaultGrams / B_BUDS_GRAMS_PER_CASE)
      }

      const staged = inv?.staged || 0
      const filled = inv?.filled || 0
      const cased = inv?.cased || 0
      const pendingOrders = pendingOrderItems.get(sku.id) || 0

      // Available = Vault (projected cases) + Staged + Filled + Cased - Pending Orders
      const available = vaultCases + staged + filled + cased - pendingOrders
      const isLowStock = available <= LOW_STOCK_THRESHOLD && available >= 0

      return {
        skuId: sku.id,
        skuCode: sku.code,
        skuName: sku.name,
        strainId: sku.strain_id,
        strainName,
        productTypeId: sku.product_type_id,
        productTypeName,
        vaultGrams,
        vaultCases,
        staged,
        filled,
        cased,
        pendingOrders,
        available,
        isLowStock,
      }
    })
  }, [skus, strains, productTypes, inventory, vaultByStrainAndType, pendingOrderItems])

  // Filter and sort
  const filteredAndSortedRows = useMemo(() => {
    let filtered = [...inventoryRows]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(row =>
        row.skuCode.toLowerCase().includes(term) ||
        row.skuName.toLowerCase().includes(term) ||
        row.strainName.toLowerCase().includes(term)
      )
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(row => row.productTypeId === filterType)
    }

    // Stock filter
    if (filterStock === 'low') {
      filtered = filtered.filter(row => row.isLowStock)
    } else if (filterStock === 'out') {
      filtered = filtered.filter(row => row.available <= 0)
    } else if (filterStock === 'in') {
      filtered = filtered.filter(row => row.available > 0)
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'sku':
          aVal = a.skuCode.toLowerCase()
          bVal = b.skuCode.toLowerCase()
          break
        case 'type':
          aVal = a.productTypeName.toLowerCase()
          bVal = b.productTypeName.toLowerCase()
          break
        case 'vault':
          aVal = a.vaultCases
          bVal = b.vaultCases
          break
        case 'staged':
          aVal = a.staged
          bVal = b.staged
          break
        case 'filled':
          aVal = a.filled
          bVal = b.filled
          break
        case 'cased':
          aVal = a.cased
          bVal = b.cased
          break
        case 'orders':
          aVal = a.pendingOrders
          bVal = b.pendingOrders
          break
        case 'available':
          aVal = a.available
          bVal = b.available
          break
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [inventoryRows, searchTerm, filterType, filterStock, sortField, sortDirection])

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalAvailable = inventoryRows.reduce((sum, row) => sum + Math.max(0, row.available), 0)
    const totalVault = inventoryRows.reduce((sum, row) => sum + row.vaultCases, 0)
    const totalPendingOrders = inventoryRows.reduce((sum, row) => sum + row.pendingOrders, 0)
    const lowStockCount = inventoryRows.filter(row => row.isLowStock).length
    const outOfStockCount = inventoryRows.filter(row => row.available <= 0).length

    return {
      totalAvailable,
      totalVault,
      totalPendingOrders,
      lowStockCount,
      outOfStockCount,
    }
  }, [inventoryRows])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />
    return sortDirection === 'asc'
      ? <ChevronUp className="h-4 w-4 ml-1" />
      : <ChevronDown className="h-4 w-4 ml-1" />
  }

  const getTypeBadge = (typeName: string) => {
    if (typeName === 'A Buds') {
      return <Badge variant="default" className="bg-emerald-600">A Buds</Badge>
    } else if (typeName === 'B Buds') {
      return <Badge variant="default" className="bg-amber-600">B Buds</Badge>
    }
    return <Badge variant="outline">{typeName}</Badge>
  }

  const getAvailableDisplay = (available: number, isLowStock: boolean) => {
    if (available <= 0) {
      return <span className="text-red-600 font-semibold">{available}</span>
    }
    if (isLowStock) {
      return <span className="text-amber-600 font-semibold">{available}</span>
    }
    return <span className="text-green-600 font-semibold">{available}</span>
  }

  // Mobile card component for inventory items
  const InventoryCard = ({ row }: { row: InventoryRow }) => (
    <div
      className={`p-4 border-b last:border-b-0 ${
        row.isLowStock ? 'bg-amber-50 dark:bg-amber-950/20' : row.available <= 0 ? 'bg-red-50 dark:bg-red-950/20' : ''
      }`}
    >
      {/* Header row with SKU and Available */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base">{row.skuCode}</span>
            {getTypeBadge(row.productTypeName)}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{row.skuName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Available</div>
          <div className="text-xl font-bold">
            {getAvailableDisplay(row.available, row.isLowStock)}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-muted/50 rounded-md py-2 px-1">
          <div className="text-xs text-muted-foreground">Vault</div>
          <div className="font-semibold text-sm">{row.vaultCases}</div>
        </div>
        <div className="bg-muted/50 rounded-md py-2 px-1">
          <div className="text-xs text-muted-foreground">Staged</div>
          <div className="font-semibold text-sm">{row.staged}</div>
        </div>
        <div className="bg-muted/50 rounded-md py-2 px-1">
          <div className="text-xs text-muted-foreground">Filled</div>
          <div className="font-semibold text-sm">{row.filled}</div>
        </div>
        <div className="bg-muted/50 rounded-md py-2 px-1">
          <div className="text-xs text-muted-foreground">Cased</div>
          <div className="font-semibold text-sm">{row.cased}</div>
        </div>
      </div>

      {/* Pending orders if any */}
      {row.pendingOrders > 0 && (
        <div className="mt-2 text-sm text-blue-600 flex items-center gap-1">
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>{row.pendingOrders} pending orders</span>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading inventory...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Inventory</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Track available stock across all stages</p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          variant="outline"
          className="min-h-[44px] min-w-[44px] px-4"
        >
          <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Summary Cards - 1 col on xs, 2 cols on mobile, 4 cols on lg+ */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Available</CardTitle>
            <Package className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{summaryStats.totalAvailable.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">cases ready to sell</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Vault (Projected)</CardTitle>
            <Warehouse className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{summaryStats.totalVault.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">cases from bulk</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Pending Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{summaryStats.totalPendingOrders.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">cases committed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-amber-600">{summaryStats.lowStockCount}</div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.outOfStockCount > 0 && (
                <span className="text-red-600">{summaryStats.outOfStockCount} out of stock</span>
              )}
              {summaryStats.outOfStockCount === 0 && 'SKUs below threshold'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters - stacks on mobile */}
      <Card>
        <CardHeader className="pb-3 p-4 sm:p-6 sm:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base">Filters</CardTitle>
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {filteredAndSortedRows.length} of {inventoryRows.length} SKUs
              </span>
              {(searchTerm || filterType !== 'all' || filterStock !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] px-3 text-xs sm:text-sm"
                  onClick={() => {
                    setSearchTerm('')
                    setFilterType('all')
                    setFilterStock('all')
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKUs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 min-h-[44px] text-base sm:text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="min-h-[44px] text-sm">
                  <SelectValue placeholder="Product Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="min-h-[44px]">All Types</SelectItem>
                  {productTypes.map(type => (
                    <SelectItem key={type.id} value={type.id} className="min-h-[44px]">{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStock} onValueChange={setFilterStock}>
                <SelectTrigger className="min-h-[44px] text-sm">
                  <SelectValue placeholder="Stock Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="min-h-[44px]">All Levels</SelectItem>
                  <SelectItem value="in" className="min-h-[44px]">In Stock</SelectItem>
                  <SelectItem value="low" className="min-h-[44px]">Low Stock</SelectItem>
                  <SelectItem value="out" className="min-h-[44px]">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Display */}
      {filteredAndSortedRows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">
              {searchTerm || filterType !== 'all' || filterStock !== 'all'
                ? 'No SKUs found matching your filters'
                : 'No inventory data available'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card Layout - shown below md breakpoint */}
          <Card className="md:hidden overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Inventory Items</CardTitle>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground min-h-[44px] px-2"
                  onClick={() => toggleSort('available')}
                >
                  Sort by Available
                  <SortIcon field="available" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredAndSortedRows.map((row) => (
                  <InventoryCard key={row.skuId} row={row} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Desktop Table Layout - shown at md and above */}
          <Card className="hidden md:block overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground min-h-[44px]"
                          onClick={() => toggleSort('sku')}
                        >
                          SKU
                          <SortIcon field="sku" />
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground min-h-[44px]"
                          onClick={() => toggleSort('type')}
                        >
                          Type
                          <SortIcon field="type" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[80px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('vault')}
                        >
                          Vault
                          <SortIcon field="vault" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[80px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('staged')}
                        >
                          Staged
                          <SortIcon field="staged" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[80px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('filled')}
                        >
                          Filled
                          <SortIcon field="filled" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[80px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('cased')}
                        >
                          Cased
                          <SortIcon field="cased" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[80px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('orders')}
                        >
                          Orders
                          <SortIcon field="orders" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[100px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('available')}
                        >
                          Available
                          <SortIcon field="available" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedRows.map((row) => (
                      <TableRow
                        key={row.skuId}
                        className={row.isLowStock ? 'bg-amber-50 dark:bg-amber-950/20' : row.available <= 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}
                      >
                        <TableCell>
                          <div>
                            <span className="font-medium">{row.skuCode}</span>
                            <p className="text-sm text-muted-foreground">{row.skuName}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(row.productTypeName)}</TableCell>
                        <TableCell className="text-right">
                          <div>
                            <span>{row.vaultCases}</span>
                            {row.vaultGrams > 0 && (
                              <p className="text-xs text-muted-foreground">{row.vaultGrams.toLocaleString()}g</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{row.staged}</TableCell>
                        <TableCell className="text-right">{row.filled}</TableCell>
                        <TableCell className="text-right">{row.cased}</TableCell>
                        <TableCell className="text-right">
                          {row.pendingOrders > 0 ? (
                            <span className="text-blue-600">-{row.pendingOrders}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {getAvailableDisplay(row.available, row.isLowStock)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

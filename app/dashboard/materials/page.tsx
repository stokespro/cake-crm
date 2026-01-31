'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Search,
  RefreshCw,
  Package,
  AlertTriangle,
  PackageX,
  Plus,
  MoreHorizontal,
  Pencil,
  PackagePlus,
  History,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  restockMaterial,
  getMaterialTransactions,
  type Material,
  type MaterialTransaction,
  type CreateMaterialInput,
  type UpdateMaterialInput,
} from '@/actions/materials'

// Material types for the dropdown
const MATERIAL_TYPES = [
  { value: 'packaging', label: 'Packaging' },
  { value: 'container', label: 'Container' },
  { value: 'label', label: 'Label' },
  { value: 'seal', label: 'Seal' },
  { value: 'box', label: 'Box' },
  { value: 'other', label: 'Other' },
]

type SortField = 'name' | 'type' | 'stock' | 'threshold'
type SortDirection = 'asc' | 'desc'

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [transactions, setTransactions] = useState<MaterialTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStock, setFilterStock] = useState('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Sheet/Dialog states
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [restockMaterial_, setRestockMaterial] = useState<Material | null>(null)
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyMaterial, setHistoryMaterial] = useState<Material | null>(null)

  const { user } = useAuth()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [materialsResult, transactionsResult] = await Promise.all([
        getMaterials(),
        getMaterialTransactions(),
      ])

      if (materialsResult.success && materialsResult.data) {
        setMaterials(materialsResult.data)
      } else if (materialsResult.error) {
        toast.error(materialsResult.error)
      }

      if (transactionsResult.success && transactionsResult.data) {
        setTransactions(transactionsResult.data)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load materials')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  // Summary stats
  const summaryStats = useMemo(() => {
    const total = materials.length
    const lowStock = materials.filter(m => m.current_stock > 0 && m.current_stock < m.low_stock_threshold).length
    const outOfStock = materials.filter(m => m.current_stock === 0).length

    return { total, lowStock, outOfStock }
  }, [materials])

  // Filter and sort
  const filteredAndSortedMaterials = useMemo(() => {
    let filtered = [...materials]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(term) ||
        (m.sku_code && m.sku_code.toLowerCase().includes(term))
      )
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(m => m.material_type === filterType)
    }

    // Stock filter
    if (filterStock === 'low') {
      filtered = filtered.filter(m => m.current_stock > 0 && m.current_stock < m.low_stock_threshold)
    } else if (filterStock === 'out') {
      filtered = filtered.filter(m => m.current_stock === 0)
    } else if (filterStock === 'in') {
      filtered = filtered.filter(m => m.current_stock >= m.low_stock_threshold)
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'type':
          aVal = a.material_type.toLowerCase()
          bVal = b.material_type.toLowerCase()
          break
        case 'stock':
          aVal = a.current_stock
          bVal = b.current_stock
          break
        case 'threshold':
          aVal = a.low_stock_threshold
          bVal = b.low_stock_threshold
          break
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [materials, searchTerm, filterType, filterStock, sortField, sortDirection])

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
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />
  }

  const getStatusBadge = (material: Material) => {
    if (material.current_stock === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>
    }
    if (material.current_stock < material.low_stock_threshold) {
      return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Low Stock</Badge>
    }
    return <Badge variant="default" className="bg-green-600 hover:bg-green-700">In Stock</Badge>
  }

  const getTypeBadge = (type: string) => {
    const typeInfo = MATERIAL_TYPES.find(t => t.value === type)
    return <Badge variant="outline">{typeInfo?.label || type}</Badge>
  }

  const handleOpenHistory = async (material: Material) => {
    setHistoryMaterial(material)
    setHistoryOpen(true)
    // Fetch transactions for this material
    const result = await getMaterialTransactions(material.id)
    if (result.success && result.data) {
      setTransactions(result.data)
    }
  }

  const handleDelete = async () => {
    if (!deletingMaterial) return

    const result = await deleteMaterial(deletingMaterial.id)
    if (result.success) {
      toast.success('Material deleted')
      setDeletingMaterial(null)
      fetchData()
    } else {
      toast.error(result.error || 'Failed to delete material')
    }
  }

  // Mobile card component
  const MaterialCard = ({ material }: { material: Material }) => (
    <div
      className={`p-4 border-b last:border-b-0 ${
        material.current_stock === 0
          ? 'bg-red-50 dark:bg-red-950/20'
          : material.current_stock < material.low_stock_threshold
          ? 'bg-amber-50 dark:bg-amber-950/20'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base">{material.name}</span>
            {getTypeBadge(material.material_type)}
          </div>
          {material.sku_code && (
            <p className="text-sm text-muted-foreground mt-0.5">{material.sku_code}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(material)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingMaterial(material)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRestockMaterial(material)}>
                <PackagePlus className="h-4 w-4 mr-2" />
                Restock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenHistory(material)}>
                <History className="h-4 w-4 mr-2" />
                History
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeletingMaterial(material)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/50 rounded-md py-2 px-3">
          <div className="text-xs text-muted-foreground">Current Stock</div>
          <div className="font-semibold">{material.current_stock.toLocaleString()}</div>
        </div>
        <div className="bg-muted/50 rounded-md py-2 px-3">
          <div className="text-xs text-muted-foreground">Low Threshold</div>
          <div className="font-semibold">{material.low_stock_threshold.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading materials...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Materials Inventory</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Track packaging materials and supplies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="min-h-[44px] min-w-[44px] px-4"
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            onClick={() => setAddSheetOpen(true)}
            className="min-h-[44px] px-4"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Material</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Materials</CardTitle>
            <Package className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold">{summaryStats.total}</div>
            <p className="text-xs text-muted-foreground">registered materials</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-amber-600">{summaryStats.lowStock}</div>
            <p className="text-xs text-muted-foreground">below threshold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Out of Stock</CardTitle>
            <PackageX className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-red-600">{summaryStats.outOfStock}</div>
            <p className="text-xs text-muted-foreground">need restocking</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3 p-4 sm:p-6 sm:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base">Filters</CardTitle>
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {filteredAndSortedMaterials.length} of {materials.length} materials
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
                placeholder="Search materials..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 min-h-[44px] text-base sm:text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="min-h-[44px] text-sm">
                  <SelectValue placeholder="Material Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="min-h-[44px]">All Types</SelectItem>
                  {MATERIAL_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value} className="min-h-[44px]">{type.label}</SelectItem>
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

      {/* Materials Display */}
      {filteredAndSortedMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">
              {searchTerm || filterType !== 'all' || filterStock !== 'all'
                ? 'No materials found matching your filters'
                : 'No materials added yet'}
            </p>
            {materials.length === 0 && (
              <Button
                onClick={() => setAddSheetOpen(true)}
                className="mt-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Material
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card Layout */}
          <Card className="md:hidden overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Materials</CardTitle>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground min-h-[44px] px-2"
                  onClick={() => toggleSort('stock')}
                >
                  Sort by Stock
                  <SortIcon field="stock" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredAndSortedMaterials.map((material) => (
                  <MaterialCard key={material.id} material={material} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Desktop Table Layout */}
          <Card className="hidden md:block overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground min-h-[44px]"
                          onClick={() => toggleSort('name')}
                        >
                          Name
                          <SortIcon field="name" />
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
                      <TableHead className="text-right min-w-[100px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('stock')}
                        >
                          Stock
                          <SortIcon field="stock" />
                        </button>
                      </TableHead>
                      <TableHead className="text-right min-w-[100px]">
                        <button
                          className="flex items-center font-medium hover:text-foreground ml-auto min-h-[44px]"
                          onClick={() => toggleSort('threshold')}
                        >
                          Threshold
                          <SortIcon field="threshold" />
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedMaterials.map((material) => (
                      <TableRow
                        key={material.id}
                        className={
                          material.current_stock === 0
                            ? 'bg-red-50 dark:bg-red-950/20'
                            : material.current_stock < material.low_stock_threshold
                            ? 'bg-amber-50 dark:bg-amber-950/20'
                            : ''
                        }
                      >
                        <TableCell>
                          <div>
                            <span className="font-medium">{material.name}</span>
                            {material.sku_code && (
                              <p className="text-sm text-muted-foreground">{material.sku_code}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(material.material_type)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {material.current_stock.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {material.low_stock_threshold.toLocaleString()}
                        </TableCell>
                        <TableCell>{getStatusBadge(material)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingMaterial(material)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRestockMaterial(material)}>
                                <PackagePlus className="h-4 w-4 mr-2" />
                                Restock
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenHistory(material)}>
                                <History className="h-4 w-4 mr-2" />
                                History
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingMaterial(material)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Transaction History Collapsible */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {historyMaterial ? `History: ${historyMaterial.name}` : 'Recent Transactions'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {historyMaterial && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setHistoryMaterial(null)
                        getMaterialTransactions().then(result => {
                          if (result.success && result.data) {
                            setTransactions(result.data)
                          }
                        })
                      }}
                    >
                      Show All
                    </Button>
                  )}
                  {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0 border-t">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No transactions recorded yet
                </div>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {tx.material?.name || 'Unknown Material'}
                          </span>
                          <Badge variant={
                            tx.transaction_type === 'restock' ? 'default' :
                            tx.transaction_type === 'usage' ? 'secondary' :
                            tx.transaction_type === 'initial' ? 'outline' :
                            'outline'
                          } className={
                            tx.transaction_type === 'restock' ? 'bg-green-600' :
                            tx.transaction_type === 'usage' ? 'bg-blue-600' :
                            ''
                          }>
                            {tx.transaction_type}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {tx.notes && <span>{tx.notes} &bull; </span>}
                          {tx.user?.name && <span>by {tx.user.name} &bull; </span>}
                          <span>{new Date(tx.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className={`font-semibold text-lg ${
                        tx.quantity >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {tx.quantity >= 0 ? '+' : ''}{tx.quantity}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Add Material Sheet */}
      <MaterialSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        onSuccess={() => {
          fetchData()
          toast.success('Material added')
        }}
      />

      {/* Edit Material Sheet */}
      <MaterialSheet
        open={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        material={editingMaterial || undefined}
        onSuccess={() => {
          fetchData()
          toast.success('Material updated')
        }}
      />

      {/* Restock Sheet */}
      <RestockSheet
        open={!!restockMaterial_}
        onClose={() => setRestockMaterial(null)}
        material={restockMaterial_ || undefined}
        userId={user?.id}
        onSuccess={() => {
          fetchData()
          toast.success('Material restocked')
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingMaterial} onOpenChange={(open) => !open && setDeletingMaterial(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingMaterial?.name}&quot;? This action cannot be undone and will also delete all transaction history for this material.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================
// Material Sheet Component (Add/Edit)
// ============================================

interface MaterialSheetProps {
  open: boolean
  onClose: () => void
  material?: Material
  onSuccess: () => void
}

function MaterialSheet({ open, onClose, material, onSuccess }: MaterialSheetProps) {
  const [name, setName] = useState('')
  const [skuCode, setSkuCode] = useState('')
  const [materialType, setMaterialType] = useState('')
  const [initialStock, setInitialStock] = useState<number | ''>('')
  const [threshold, setThreshold] = useState<number | ''>(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      if (material) {
        setName(material.name)
        setSkuCode(material.sku_code || '')
        setMaterialType(material.material_type)
        setInitialStock('')
        setThreshold(material.low_stock_threshold)
      } else {
        setName('')
        setSkuCode('')
        setMaterialType('')
        setInitialStock('')
        setThreshold(10)
      }
      setError(null)
    }
  }, [open, material])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (!materialType) {
      setError('Type is required')
      return
    }

    setLoading(true)

    try {
      if (material) {
        // Update
        const input: UpdateMaterialInput = {
          name: name.trim(),
          sku_code: skuCode.trim() || undefined,
          material_type: materialType,
          low_stock_threshold: threshold as number || 10,
        }
        const result = await updateMaterial(material.id, input)
        if (!result.success) {
          setError(result.error || 'Failed to update material')
          return
        }
      } else {
        // Create
        const input: CreateMaterialInput = {
          name: name.trim(),
          sku_code: skuCode.trim() || undefined,
          material_type: materialType,
          initial_stock: initialStock as number || 0,
          low_stock_threshold: threshold as number || 10,
        }
        const result = await createMaterial(input)
        if (!result.success) {
          setError(result.error || 'Failed to create material')
          return
        }
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[500px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{material ? 'Edit Material' : 'Add New Material'}</SheetTitle>
          <SheetDescription>
            {material ? 'Update material information' : 'Add a new material to track inventory'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md dark:bg-red-950/20 dark:border-red-900">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., 1oz Glass Jar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skuCode">SKU Code</Label>
              <Input
                id="skuCode"
                placeholder="e.g., JAR-1OZ-001"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                disabled={loading}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="materialType">Type *</Label>
              <Select
                value={materialType}
                onValueChange={setMaterialType}
                disabled={loading}
              >
                <SelectTrigger id="materialType" className="min-h-[44px]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="min-h-[44px]">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!material && (
              <div className="space-y-2">
                <Label htmlFor="initialStock">Initial Stock</Label>
                <Input
                  id="initialStock"
                  type="number"
                  placeholder="0"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value ? parseInt(e.target.value) : '')}
                  disabled={loading}
                  className="min-h-[44px]"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="threshold">Low Stock Threshold</Label>
              <Input
                id="threshold"
                type="number"
                placeholder="10"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value ? parseInt(e.target.value) : '')}
                disabled={loading}
                className="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Alert when stock falls below this number
              </p>
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !materialType}
              className="min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {material ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                material ? 'Update Material' : 'Add Material'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ============================================
// Restock Sheet Component
// ============================================

interface RestockSheetProps {
  open: boolean
  onClose: () => void
  material?: Material
  userId?: string
  onSuccess: () => void
}

function RestockSheet({ open, onClose, material, userId, onSuccess }: RestockSheetProps) {
  const [quantity, setQuantity] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setQuantity('')
      setNotes('')
      setError(null)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!material) {
      setError('No material selected')
      return
    }

    if (!quantity || quantity <= 0) {
      setError('Quantity must be greater than 0')
      return
    }

    setLoading(true)

    try {
      const result = await restockMaterial(material.id, quantity, notes.trim() || undefined, userId)
      if (!result.success) {
        setError(result.error || 'Failed to restock material')
        return
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[500px] w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Restock Material</SheetTitle>
          <SheetDescription>
            Add stock to {material?.name || 'the selected material'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md dark:bg-red-950/20 dark:border-red-900">
              {error}
            </div>
          )}

          {material && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Material</span>
                <span className="font-medium">{material.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Current Stock</span>
                <span className="font-medium">{material.current_stock.toLocaleString()}</span>
              </div>
              {quantity && quantity > 0 && (
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-sm text-muted-foreground">After Restock</span>
                  <span className="font-medium text-green-600">
                    {(material.current_stock + quantity).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity to Add *</Label>
              <Input
                id="quantity"
                type="number"
                placeholder="Enter quantity"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value ? parseInt(e.target.value) : '')}
                required
                disabled={loading}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes (e.g., supplier, PO number)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={loading}
                className="resize-none"
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !quantity || quantity <= 0}
              className="min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restocking...
                </>
              ) : (
                <>
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Restock
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

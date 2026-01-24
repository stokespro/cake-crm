'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Package,
  ClipboardList,
  Loader2,
  Plus,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import {
  getInventoryLevels,
  getPackagingTasks,
  getConfirmedOrders,
  advanceTask,
  addStagedInventory,
} from '@/actions/packaging'
import type { InventoryLevel, PackagingTask, OrderWithItems, SKU_LIST } from '@/types/packaging'

export default function PackagingPage() {
  const [inventory, setInventory] = useState<InventoryLevel[]>([])
  const [tasks, setTasks] = useState<PackagingTask[]>([])
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Add staged dialog
  const [addStagedOpen, setAddStagedOpen] = useState(false)
  const [selectedSku, setSelectedSku] = useState('')
  const [stagedQuantity, setStagedQuantity] = useState('')
  const [addingStaged, setAddingStaged] = useState(false)

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    const [invResult, tasksResult, ordersResult] = await Promise.all([
      getInventoryLevels(),
      getPackagingTasks(),
      getConfirmedOrders(),
    ])

    if (invResult.success && invResult.inventory) {
      setInventory(invResult.inventory)
    }
    if (tasksResult.success && tasksResult.tasks) {
      setTasks(tasksResult.tasks)
    }
    if (ordersResult.success && ordersResult.orders) {
      setOrders(ordersResult.orders)
    }

    setLoading(false)
    setRefreshing(false)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAllData()
  }

  const handleAdvanceTask = async (task: PackagingTask) => {
    if (task.current_column === 'DONE') return

    const result = await advanceTask(
      task.id,
      task.sku,
      task.quantity,
      task.current_column as 'TO_FILL' | 'TO_CASE'
    )

    if (result.success) {
      toast.success(`Task advanced: ${task.sku} x${task.quantity}`)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to advance task')
    }
  }

  const handleAddStaged = async () => {
    if (!selectedSku || !stagedQuantity) return

    const qty = parseInt(stagedQuantity)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setAddingStaged(true)
    const result = await addStagedInventory(selectedSku, qty)

    if (result.success) {
      toast.success(`Added ${qty} units to ${selectedSku} staged`)
      setAddStagedOpen(false)
      setSelectedSku('')
      setStagedQuantity('')
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to add staged inventory')
    }

    setAddingStaged(false)
  }

  // Split inventory into A and B variants
  const aVariants = inventory.filter(i => !i.sku_code.endsWith('-B'))
  const bVariants = inventory.filter(i => i.sku_code.endsWith('-B'))

  // Get tasks by column
  const toFillTasks = tasks.filter(t => t.current_column === 'TO_FILL')
  const toCaseTasks = tasks.filter(t => t.current_column === 'TO_CASE')
  const doneTasks = tasks.filter(t => t.current_column === 'DONE')

  // Calculate demand from orders
  const getDemand = (skuCode: string) => {
    let total = 0
    orders.forEach(order => {
      order.order_items.forEach(item => {
        if (item.sku_code === skuCode) {
          total += item.quantity
        }
      })
    })
    return total
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Packaging</h1>
          <p className="text-muted-foreground mt-1">Track inventory through the packaging pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setAddStagedOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Staged
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cased</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inventory.reduce((sum, i) => sum + i.cased, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Filled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inventory.reduce((sum, i) => sum + i.filled, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Staged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inventory.reduce((sum, i) => sum + i.staged, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Levels
          </CardTitle>
          <CardDescription>Current stock levels for all SKUs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* A Variants */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">A Variants</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cased</TableHead>
                    <TableHead className="text-right">Filled</TableHead>
                    <TableHead className="text-right">Staged</TableHead>
                    <TableHead className="text-right">Demand</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aVariants.map((item) => {
                    const demand = getDemand(item.sku_code)
                    const canFulfill = item.cased >= demand
                    return (
                      <TableRow key={item.sku_id}>
                        <TableCell className="font-medium">{item.sku_code}</TableCell>
                        <TableCell className="text-right">{item.cased}</TableCell>
                        <TableCell className="text-right">{item.filled}</TableCell>
                        <TableCell className="text-right">{item.staged}</TableCell>
                        <TableCell className="text-right">{demand}</TableCell>
                        <TableCell className="text-right">
                          {canFulfill ? (
                            <Badge variant="default" className="bg-green-600">OK</Badge>
                          ) : (
                            <Badge variant="destructive">Need {demand - item.cased}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* B Variants */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">B Variants</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cased</TableHead>
                    <TableHead className="text-right">Filled</TableHead>
                    <TableHead className="text-right">Staged</TableHead>
                    <TableHead className="text-right">Demand</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bVariants.map((item) => {
                    const demand = getDemand(item.sku_code)
                    const canFulfill = item.cased >= demand
                    return (
                      <TableRow key={item.sku_id}>
                        <TableCell className="font-medium">{item.sku_code}</TableCell>
                        <TableCell className="text-right">{item.cased}</TableCell>
                        <TableCell className="text-right">{item.filled}</TableCell>
                        <TableCell className="text-right">{item.staged}</TableCell>
                        <TableCell className="text-right">{demand}</TableCell>
                        <TableCell className="text-right">
                          {canFulfill ? (
                            <Badge variant="default" className="bg-green-600">OK</Badge>
                          ) : (
                            <Badge variant="destructive">Need {demand - item.cased}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* TO FILL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              To Fill ({toFillTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {toFillTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No tasks</p>
            ) : (
              toFillTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <span className="font-medium">{task.sku}</span>
                    <span className="text-muted-foreground ml-2">x{task.quantity}</span>
                  </div>
                  <Button size="sm" onClick={() => handleAdvanceTask(task)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* TO CASE */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              To Case ({toCaseTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {toCaseTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No tasks</p>
            ) : (
              toCaseTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <span className="font-medium">{task.sku}</span>
                    <span className="text-muted-foreground ml-2">x{task.quantity}</span>
                  </div>
                  <Button size="sm" onClick={() => handleAdvanceTask(task)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* DONE */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Done ({doneTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doneTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No completed tasks</p>
            ) : (
              doneTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div>
                    <span className="font-medium">{task.sku}</span>
                    <span className="text-muted-foreground ml-2">x{task.quantity}</span>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending Orders */}
      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Orders</CardTitle>
            <CardDescription>Orders waiting to be packed</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">#{order.order_number}</TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>
                      {order.requested_delivery_date
                        ? new Date(order.requested_delivery_date).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {order.order_items.map((item, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {item.sku_code} x{item.quantity}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'confirmed' ? 'default' : 'outline'}>
                        {order.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add Staged Dialog */}
      <Dialog open={addStagedOpen} onOpenChange={setAddStagedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staged Inventory</DialogTitle>
            <DialogDescription>
              Add containers to staged inventory for a SKU
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>SKU</Label>
              <Select value={selectedSku} onValueChange={setSelectedSku}>
                <SelectTrigger>
                  <SelectValue placeholder="Select SKU..." />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map((item) => (
                    <SelectItem key={item.sku_id} value={item.sku_code}>
                      {item.sku_code} - {item.sku_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                placeholder="Enter quantity..."
                value={stagedQuantity}
                onChange={(e) => setStagedQuantity(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStagedOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStaged}
              disabled={addingStaged || !selectedSku || !stagedQuantity}
            >
              {addingStaged && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Staged
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

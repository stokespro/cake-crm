'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Package,
  Loader2,
  Plus,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  ArrowRight,
  Undo2,
  TrendingUp,
  Box,
  Layers,
} from 'lucide-react'
import {
  getInventoryLevels,
  getPackagingTasks,
  getConfirmedOrders,
  getDemandSummary,
  advanceTask,
  revertTask,
  addStagedInventory,
  updateInventory,
} from '@/actions/packaging'
import type { InventoryLevel, PackagingTask, OrderWithItems } from '@/types/packaging'

type DemandMap = Record<string, { total: number; urgent: number; tomorrow: number }>

export default function PackagingPage() {
  const [inventory, setInventory] = useState<InventoryLevel[]>([])
  const [tasks, setTasks] = useState<PackagingTask[]>([])
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [demand, setDemand] = useState<DemandMap>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Sheet states
  const [editingItem, setEditingItem] = useState<InventoryLevel | null>(null)
  const [editValues, setEditValues] = useState({ cased: 0, filled: 0, staged: 0 })
  const [saving, setSaving] = useState(false)

  // Collapsible states
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    const [invResult, tasksResult, ordersResult, demandResult] = await Promise.all([
      getInventoryLevels(),
      getPackagingTasks(),
      getConfirmedOrders(),
      getDemandSummary(),
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
    if (demandResult.success && demandResult.demand) {
      setDemand(demandResult.demand)
    }

    setLoading(false)
    setRefreshing(false)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAllData()
  }

  const handleQuickStage = async (sku: string, amount: number) => {
    const result = await addStagedInventory(sku, amount)
    if (result.success) {
      toast.success(`Added ${amount} staged to ${sku}`)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to add staged')
    }
  }

  const handleEditOpen = (item: InventoryLevel) => {
    setEditingItem(item)
    setEditValues({
      cased: item.cased,
      filled: item.filled,
      staged: item.staged,
    })
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    setSaving(true)

    const result = await updateInventory(editingItem.sku_code, editValues)
    if (result.success) {
      toast.success(`Updated ${editingItem.sku_code} inventory`)
      setEditingItem(null)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to update')
    }
    setSaving(false)
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
      toast.success(`Advanced: ${task.sku} x${task.quantity}`)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to advance')
    }
  }

  const handleRevertTask = async (task: PackagingTask) => {
    if (task.current_column === 'TO_FILL') return

    const result = await revertTask(
      task.id,
      task.sku,
      task.quantity,
      task.current_column as 'TO_CASE' | 'DONE'
    )

    if (result.success) {
      toast.success(`Reverted: ${task.sku} x${task.quantity}`)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to revert')
    }
  }

  // Calculate summary stats
  const totalDemand = Object.values(demand).reduce((sum, d) => sum + d.total, 0)
  const urgentDemand = Object.values(demand).reduce((sum, d) => sum + d.urgent, 0)
  const tomorrowDemand = Object.values(demand).reduce((sum, d) => sum + d.tomorrow, 0)
  const totalCased = inventory.reduce((sum, i) => sum + i.cased, 0)
  const toFillCount = tasks.filter(t => t.current_column === 'TO_FILL').length
  const toCaseCount = tasks.filter(t => t.current_column === 'TO_CASE').length
  const doneCount = tasks.filter(t => t.current_column === 'DONE').length

  // Get status for a SKU (based on demand vs cased)
  const getSkuStatus = (item: InventoryLevel) => {
    const skuDemand = demand[item.sku_code]?.total || 0
    if (skuDemand === 0) return 'ok'
    if (item.cased >= skuDemand) return 'ok'
    if (item.cased + item.filled >= skuDemand) return 'warning'
    return 'critical'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Packaging</h1>
          <p className="text-sm text-muted-foreground">Inventory & demand management</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="col-span-2 bg-gradient-to-br from-slate-900 to-slate-800">
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Total Demand</p>
                <p className="text-3xl font-bold text-white">{totalDemand}</p>
                <p className="text-xs text-slate-400 mt-1">units from {orders.length} orders</p>
              </div>
              <div className="text-right space-y-1">
                {urgentDemand > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {urgentDemand} urgent
                  </Badge>
                )}
                {tomorrowDemand > 0 && (
                  <Badge className="bg-orange-500 text-xs block">
                    {tomorrowDemand} tomorrow
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Box className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Cased</span>
            </div>
            <p className="text-2xl font-bold">{totalCased}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Layers className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Pipeline</span>
            </div>
            <p className="text-2xl font-bold">{toFillCount + toCaseCount}</p>
            <p className="text-xs text-muted-foreground">{toFillCount} fill, {toCaseCount} case</p>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Package className="h-5 w-5" />
          Inventory
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {inventory.map((item) => {
            const status = getSkuStatus(item)
            const skuDemand = demand[item.sku_code]?.total || 0
            const gap = skuDemand - item.cased

            return (
              <Card
                key={item.sku_id}
                className={`relative overflow-hidden ${
                  status === 'critical' ? 'border-red-500/50 bg-red-500/5' :
                  status === 'warning' ? 'border-orange-500/50 bg-orange-500/5' :
                  'border-green-500/30 bg-green-500/5'
                }`}
              >
                <CardContent className="p-3">
                  {/* SKU Header */}
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-lg">{item.sku_code}</span>
                      {skuDemand > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Need: {skuDemand}
                          {gap > 0 && <span className="text-red-500 ml-1">(−{gap})</span>}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEditOpen(item)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Inventory Counts */}
                  <div className="grid grid-cols-3 gap-1 text-center text-xs mb-2">
                    <div className="bg-green-500/20 rounded p-1.5">
                      <p className="font-semibold text-green-700 dark:text-green-400">{item.cased}</p>
                      <p className="text-[10px] text-muted-foreground">CASED</p>
                    </div>
                    <div className="bg-blue-500/20 rounded p-1.5">
                      <p className="font-semibold text-blue-700 dark:text-blue-400">{item.filled}</p>
                      <p className="text-[10px] text-muted-foreground">FILLED</p>
                    </div>
                    <div className="bg-purple-500/20 rounded p-1.5">
                      <p className="font-semibold text-purple-700 dark:text-purple-400">{item.staged}</p>
                      <p className="text-[10px] text-muted-foreground">STAGED</p>
                    </div>
                  </div>

                  {/* Quick Stage Buttons */}
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => handleQuickStage(item.sku_code, 4)}
                    >
                      <Plus className="h-3 w-3 mr-1" />4
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => handleQuickStage(item.sku_code, 8)}
                    >
                      <Plus className="h-3 w-3 mr-1" />8
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Tasks Pipeline */}
      <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardContent className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-semibold">Task Pipeline</p>
                  <p className="text-xs text-muted-foreground">
                    {toFillCount} to fill • {toCaseCount} to case • {doneCount} done
                  </p>
                </div>
              </div>
              {tasksOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </CardContent>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">No active tasks</p>
          ) : (
            tasks.map((task) => (
              <Card key={task.id} className="overflow-hidden">
                <CardContent className="p-3 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        task.current_column === 'DONE' ? 'default' :
                        task.current_column === 'TO_CASE' ? 'secondary' : 'outline'
                      }
                      className={
                        task.current_column === 'DONE' ? 'bg-green-600' :
                        task.current_column === 'TO_CASE' ? 'bg-blue-600' : ''
                      }
                    >
                      {task.current_column.replace('_', ' ')}
                    </Badge>
                    <div>
                      <span className="font-medium">{task.sku}</span>
                      <span className="text-muted-foreground ml-2">×{task.quantity}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {task.current_column !== 'TO_FILL' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRevertTask(task)}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                    {task.current_column !== 'DONE' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleAdvanceTask(task)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    {task.current_column === 'DONE' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Orders Queue */}
      <Collapsible open={ordersOpen} onOpenChange={setOrdersOpen}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardContent className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="font-semibold">Pending Orders</p>
                  <p className="text-xs text-muted-foreground">
                    {orders.length} orders waiting
                  </p>
                </div>
              </div>
              {ordersOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </CardContent>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {orders.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">No pending orders</p>
          ) : (
            orders.map((order) => {
              const deliveryDate = order.requested_delivery_date
                ? new Date(order.requested_delivery_date + 'T00:00:00')
                : null
              const isUrgent = deliveryDate && deliveryDate <= new Date()
              const isTomorrow = deliveryDate && 
                deliveryDate.toDateString() === new Date(Date.now() + 86400000).toDateString()

              return (
                <Card key={order.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{order.customer_name}</p>
                        <p className="text-xs text-muted-foreground">#{order.order_number}</p>
                      </div>
                      {isUrgent ? (
                        <Badge variant="destructive">Urgent</Badge>
                      ) : isTomorrow ? (
                        <Badge className="bg-orange-500">Tomorrow</Badge>
                      ) : (
                        <Badge variant="outline">
                          {deliveryDate?.toLocaleDateString() || 'No date'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {order.order_items.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {item.sku_code} ×{item.quantity}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Edit Inventory Sheet */}
      <Sheet open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <SheetContent side="bottom" className="h-auto">
          <SheetHeader>
            <SheetTitle>Edit {editingItem?.sku_code} Inventory</SheetTitle>
            <SheetDescription>
              Adjust inventory counts for {editingItem?.sku_name}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-4 py-6">
            <div className="space-y-2">
              <Label className="text-green-600">Cased</Label>
              <Input
                type="number"
                min="0"
                value={editValues.cased}
                onChange={(e) => setEditValues(v => ({ ...v, cased: parseInt(e.target.value) || 0 }))}
                className="text-center text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-600">Filled</Label>
              <Input
                type="number"
                min="0"
                value={editValues.filled}
                onChange={(e) => setEditValues(v => ({ ...v, filled: parseInt(e.target.value) || 0 }))}
                className="text-center text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-purple-600">Staged</Label>
              <Input
                type="number"
                min="0"
                value={editValues.staged}
                onChange={(e) => setEditValues(v => ({ ...v, staged: parseInt(e.target.value) || 0 }))}
                className="text-center text-lg"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleEditSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

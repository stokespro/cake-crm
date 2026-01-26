'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  CircleArrowRight,
  X,
  Trash2,
} from 'lucide-react'
import {
  getInventoryLevels,
  getPackagingTasks,
  getConfirmedOrders,
  getDemandSummary,
  advanceTask,
  addStagedInventory,
  updateInventory,
} from '@/actions/packaging'
import type { InventoryLevel, PackagingTask, OrderWithItems } from '@/types/packaging'

type DemandMap = Record<string, { total: number; urgent: number; tomorrow: number }>

const A_SKUS = ['BG', 'BB', 'BIS', 'CM', 'CR', 'MAC', 'VZ']
const B_SKUS = ['BG-B', 'BB-B', 'BIS-B', 'CM-B', 'CR-B', 'MAC-B', 'VZ-B']
const CONTAINER_SIZES = [8, 4, 3, 2, 1]

export default function PackagingPage() {
  const [inventory, setInventory] = useState<InventoryLevel[]>([])
  const [tasks, setTasks] = useState<PackagingTask[]>([])
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [demand, setDemand] = useState<DemandMap>({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // UI State
  const [inventoryExpanded, setInventoryExpanded] = useState(true)
  const [activeTaskTab, setActiveTaskTab] = useState<'TO_FILL' | 'TO_CASE' | 'DONE'>('TO_FILL')
  
  // Edit Inventory Sheet
  const [editingItem, setEditingItem] = useState<InventoryLevel | null>(null)
  const [editValues, setEditValues] = useState({ cased: 0, filled: 0, staged: 0 })
  const [saving, setSaving] = useState(false)

  // Container Management Sheet
  const [containerSheetOpen, setContainerSheetOpen] = useState(false)
  const [containerTab, setContainerTab] = useState<'add' | 'view'>('add')
  const [selectedSku, setSelectedSku] = useState<string>('')
  const [selectedSize, setSelectedSize] = useState<number>(4)
  const [addingContainer, setAddingContainer] = useState(false)

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

    if (invResult.success && invResult.inventory) setInventory(invResult.inventory)
    if (tasksResult.success && tasksResult.tasks) setTasks(tasksResult.tasks)
    if (ordersResult.success && ordersResult.orders) setOrders(ordersResult.orders)
    if (demandResult.success && demandResult.demand) setDemand(demandResult.demand)

    setLoading(false)
    setLastUpdated(new Date())
  }

  // Get inventory for a specific SKU
  const getSkuInventory = (skuCode: string) => {
    return inventory.find(i => i.sku_code === skuCode)
  }

  // Get orders count for a SKU
  const getOrdersCount = (skuCode: string) => {
    return demand[skuCode]?.total || 0
  }

  // Check if SKU has low stock
  const isLowStock = (skuCode: string) => {
    const inv = getSkuInventory(skuCode)
    const ordersCount = getOrdersCount(skuCode)
    if (!inv || ordersCount === 0) return false
    return inv.cased < ordersCount
  }

  // Handle edit inventory
  const handleEditOpen = (skuCode: string) => {
    const inv = getSkuInventory(skuCode)
    if (inv) {
      setEditingItem(inv)
      setEditValues({ cased: inv.cased, filled: inv.filled, staged: inv.staged })
    }
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    setSaving(true)
    const result = await updateInventory(editingItem.sku_code, editValues)
    if (result.success) {
      toast.success(`Updated ${editingItem.sku_code}`)
      setEditingItem(null)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to update')
    }
    setSaving(false)
  }

  // Handle add container
  const handleAddContainer = async () => {
    if (!selectedSku) {
      toast.error('Please select a SKU')
      return
    }
    setAddingContainer(true)
    const result = await addStagedInventory(selectedSku, selectedSize)
    if (result.success) {
      toast.success(`Added ${selectedSize} to ${selectedSku} staged`)
      fetchAllData()
    } else {
      toast.error(result.error || 'Failed to add')
    }
    setAddingContainer(false)
  }

  // Handle advance task
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

  // Filter tasks by column
  const toFillTasks = tasks.filter(t => t.current_column === 'TO_FILL')
  const toCaseTasks = tasks.filter(t => t.current_column === 'TO_CASE')
  const doneTasks = tasks.filter(t => t.current_column === 'DONE')

  // Get priority color
  const getPriorityColor = (task: PackagingTask) => {
    // For now, simple logic based on task type
    // You can enhance this based on delivery dates
    if (task.current_column === 'DONE') return 'bg-green-600'
    return 'bg-amber-600' // Default to backfill style
  }

  const getPriorityLabel = (task: PackagingTask) => {
    return 'BACKFILL' // Simplified - enhance based on your priority logic
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Inventory Panel */}
      <div className="border-b">
        {inventoryExpanded && (
          <div className="p-4 space-y-4">
            {/* A's Row */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center">A's</p>
              <div className="grid grid-cols-7 gap-2">
                {A_SKUS.map(sku => {
                  const inv = getSkuInventory(sku)
                  const ordersCount = getOrdersCount(sku)
                  const lowStock = isLowStock(sku)
                  return (
                    <Card 
                      key={sku}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${lowStock ? 'border-orange-500' : ''}`}
                      onClick={() => handleEditOpen(sku)}
                    >
                      <CardContent className="p-2 text-center">
                        <p className="font-bold text-sm">{sku}</p>
                        <div className="flex justify-center gap-1 text-[10px] my-1">
                          <span className="text-green-500">{inv?.cased || 0}</span>
                          <span className="text-blue-500">{inv?.filled || 0}</span>
                          <span className="text-purple-500">{inv?.staged || 0}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          CASED FILLED STAGED
                        </p>
                        {ordersCount > 0 && (
                          <p className="text-xs mt-1">Orders: {ordersCount}</p>
                        )}
                        {lowStock && (
                          <Badge variant="outline" className="text-[9px] mt-1 text-orange-500 border-orange-500">
                            Low Stock
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* B's Row */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center">B's</p>
              <div className="grid grid-cols-7 gap-2">
                {B_SKUS.map(sku => {
                  const inv = getSkuInventory(sku)
                  const ordersCount = getOrdersCount(sku)
                  const lowStock = isLowStock(sku)
                  return (
                    <Card 
                      key={sku}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${lowStock ? 'border-orange-500' : ''}`}
                      onClick={() => handleEditOpen(sku)}
                    >
                      <CardContent className="p-2 text-center">
                        <p className="font-bold text-sm">{sku}</p>
                        <div className="flex justify-center gap-1 text-[10px] my-1">
                          <span className="text-green-500">{inv?.cased || 0}</span>
                          <span className="text-blue-500">{inv?.filled || 0}</span>
                          <span className="text-purple-500">{inv?.staged || 0}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          CASED FILLED STAGED
                        </p>
                        {ordersCount > 0 && (
                          <p className="text-xs mt-1">Orders: {ordersCount}</p>
                        )}
                        {lowStock && (
                          <Badge variant="outline" className="text-[9px] mt-1 text-orange-500 border-orange-500">
                            Low Stock
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Toggle Bar */}
        <div 
          className="flex items-center justify-center gap-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors border-t"
          onClick={() => setInventoryExpanded(!inventoryExpanded)}
        >
          <span className="text-xs text-muted-foreground">
            Updated: {lastUpdated?.toLocaleTimeString()}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {inventoryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {inventoryExpanded ? 'Hide Inventory' : 'Show Inventory'}
            {inventoryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Task Board */}
      <div className="flex-1 p-4">
        {/* Desktop: 3 columns */}
        <div className="hidden md:grid md:grid-cols-3 gap-4 h-[calc(100vh-300px)]">
          {/* TO FILL Column */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-amber-500 font-bold">TO FILL</h2>
              <span className="text-sm text-muted-foreground">{toFillTasks.length} tasks</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {toFillTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tasks</p>
              ) : (
                toFillTasks.map(task => (
                  <TaskCard key={task.id} task={task} onAdvance={handleAdvanceTask} />
                ))
              )}
            </div>
          </div>

          {/* TO CASE Column */}
          <div className="flex flex-col bg-purple-950/20 rounded-lg p-3">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-purple-400 font-bold">TO CASE</h2>
              <span className="text-sm text-muted-foreground">{toCaseTasks.length} tasks</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {toCaseTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tasks</p>
              ) : (
                toCaseTasks.map(task => (
                  <TaskCard key={task.id} task={task} onAdvance={handleAdvanceTask} />
                ))
              )}
            </div>
          </div>

          {/* DONE Column */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-green-500 font-bold">DONE</h2>
              <span className="text-sm text-muted-foreground">{doneTasks.length} tasks</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {doneTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nothing completed yet</p>
              ) : (
                doneTasks.map(task => (
                  <TaskCard key={task.id} task={task} onAdvance={handleAdvanceTask} done />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Mobile: Tabs */}
        <div className="md:hidden">
          <Tabs value={activeTaskTab} onValueChange={(v) => setActiveTaskTab(v as typeof activeTaskTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="TO_FILL" className="text-amber-500 data-[state=active]:text-amber-500">
                TO FILL ({toFillTasks.length})
              </TabsTrigger>
              <TabsTrigger value="TO_CASE" className="text-purple-400 data-[state=active]:text-purple-400">
                TO CASE ({toCaseTasks.length})
              </TabsTrigger>
              <TabsTrigger value="DONE" className="text-green-500 data-[state=active]:text-green-500">
                DONE ({doneTasks.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="TO_FILL" className="mt-4 space-y-2">
              {toFillTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tasks</p>
              ) : (
                toFillTasks.map(task => (
                  <TaskCard key={task.id} task={task} onAdvance={handleAdvanceTask} />
                ))
              )}
            </TabsContent>
            <TabsContent value="TO_CASE" className="mt-4 space-y-2">
              {toCaseTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tasks</p>
              ) : (
                toCaseTasks.map(task => (
                  <TaskCard key={task.id} task={task} onAdvance={handleAdvanceTask} />
                ))
              )}
            </TabsContent>
            <TabsContent value="DONE" className="mt-4 space-y-2">
              {doneTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nothing completed yet</p>
              ) : (
                doneTasks.map(task => (
                  <TaskCard key={task.id} task={task} onAdvance={handleAdvanceTask} done />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Floating Action Button */}
      <Button
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setContainerSheetOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Edit Inventory Sheet */}
      <Sheet open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit {editingItem?.sku_code}</SheetTitle>
            <SheetDescription>Adjust inventory counts</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label className="text-green-500">Cased</Label>
              <Input
                type="number"
                min="0"
                value={editValues.cased}
                onChange={(e) => setEditValues(v => ({ ...v, cased: parseInt(e.target.value) || 0 }))}
                className="text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-500">Filled</Label>
              <Input
                type="number"
                min="0"
                value={editValues.filled}
                onChange={(e) => setEditValues(v => ({ ...v, filled: parseInt(e.target.value) || 0 }))}
                className="text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-purple-500">Staged</Label>
              <Input
                type="number"
                min="0"
                value={editValues.staged}
                onChange={(e) => setEditValues(v => ({ ...v, staged: parseInt(e.target.value) || 0 }))}
                className="text-lg"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleEditSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Container Management Sheet */}
      <Sheet open={containerSheetOpen} onOpenChange={setContainerSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Manage Staged Containers</SheetTitle>
          </SheetHeader>
          <Tabs value={containerTab} onValueChange={(v) => setContainerTab(v as 'add' | 'view')} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add">Add New</TabsTrigger>
              <TabsTrigger value="view">View/Remove</TabsTrigger>
            </TabsList>
            <TabsContent value="add" className="space-y-6 mt-4">
              {/* SKU Selection */}
              <div>
                <Label className="text-sm text-muted-foreground">Select SKU</Label>
                <div className="mt-2 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">A's</p>
                    <div className="flex flex-wrap gap-2">
                      {A_SKUS.map(sku => (
                        <Button
                          key={sku}
                          variant={selectedSku === sku ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedSku(sku)}
                        >
                          {sku}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">B's</p>
                    <div className="flex flex-wrap gap-2">
                      {B_SKUS.map(sku => (
                        <Button
                          key={sku}
                          variant={selectedSku === sku ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedSku(sku)}
                        >
                          {sku}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Container Size */}
              <div>
                <Label className="text-sm text-muted-foreground">Container Size</Label>
                <div className="flex gap-2 mt-2">
                  {CONTAINER_SIZES.map(size => (
                    <Button
                      key={size}
                      variant={selectedSize === size ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setSelectedSize(size)}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Add Button */}
              <Button 
                className="w-full" 
                size="lg"
                disabled={!selectedSku || addingContainer}
                onClick={handleAddContainer}
              >
                {addingContainer ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add Container x{selectedSize}
              </Button>
            </TabsContent>
            <TabsContent value="view" className="mt-4">
              <p className="text-center text-muted-foreground py-8">
                Container tracking not yet implemented.
                <br />
                Use Add New to stage inventory.
              </p>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// Task Card Component
function TaskCard({ 
  task, 
  onAdvance, 
  done = false 
}: { 
  task: PackagingTask
  onAdvance: (task: PackagingTask) => void
  done?: boolean 
}) {
  return (
    <Card className={`${done ? 'opacity-60' : ''}`}>
      <CardContent className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge className="bg-amber-600 text-[10px]">BACKFILL</Badge>
          <div>
            <span className="font-bold">{task.sku}</span>
            <span className="text-muted-foreground ml-2">x{task.quantity}</span>
          </div>
        </div>
        {!done && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10"
            onClick={() => onAdvance(task)}
          >
            <CircleArrowRight className="h-6 w-6" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

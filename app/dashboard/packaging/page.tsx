'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  CircleArrowRight,
} from 'lucide-react'
import { FloatingMenu } from '@/components/ui/floating-menu'
import {
  getDashboardData,
  advanceTask,
  revertTask,
  addContainer,
  updateInventory,
  updateTaskNote,
} from '@/actions/packaging-v2'
import type {
  DashboardData,
  Task,
  CompletedTask,
  SKUStatus,
  PriorityTier,
  SKU,
  KanbanColumn,
  ContainerSize,
} from '@/lib/packaging/types'
import { formatTime } from '@/lib/packaging/utils'

// Auto-refresh interval (2.5 minutes)
const REFRESH_INTERVAL = 150000

const A_SKUS: SKU[] = ['BG', 'BB', 'BIS', 'CM', 'CR', 'MAC', 'VZ']
const B_SKUS: SKU[] = ['BG-B', 'BB-B', 'BIS-B', 'CM-B', 'CR-B', 'MAC-B', 'VZ-B']
const CONTAINER_SIZES: ContainerSize[] = [8, 4, 3, 2, 1]

// Priority badge styles (just the badge, not the whole card)
const PRIORITY_BADGE_STYLES: Record<PriorityTier, string> = {
  URGENT: 'bg-red-600 text-white',
  TOMORROW: 'bg-orange-500 text-white',
  UPCOMING: 'bg-amber-500 text-white',
  BACKFILL: 'bg-green-600 text-white',
}

const PRIORITY_ARROW_STYLES: Record<PriorityTier, string> = {
  URGENT: 'text-red-400 hover:text-red-300',
  TOMORROW: 'text-orange-400 hover:text-orange-300',
  UPCOMING: 'text-amber-400 hover:text-amber-300',
  BACKFILL: 'text-green-400 hover:text-green-300',
}

export default function PackagingPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [processingTaskId, setProcessingTaskId] = useState<string | null>(null)

  // UI State
  const [inventoryExpanded, setInventoryExpanded] = useState(true)
  const [activeTaskTab, setActiveTaskTab] = useState<KanbanColumn>('TO_FILL')

  // Edit Inventory Sheet
  const [editingSku, setEditingSku] = useState<SKUStatus | null>(null)
  const [editValues, setEditValues] = useState({ cased: 0, filled: 0, staged: 0 })
  const [saving, setSaving] = useState(false)

  // Container Sheet
  const [containerSheetOpen, setContainerSheetOpen] = useState(false)
  const [selectedSku, setSelectedSku] = useState<SKU | ''>('')
  const [selectedSize, setSelectedSize] = useState<ContainerSize>(4)
  const [addingContainer, setAddingContainer] = useState(false)

  // Mobile Inventory Sheet
  const [mobileInventoryOpen, setMobileInventoryOpen] = useState(false)

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const result = await getDashboardData()
      setData(result)
      setLastUpdated(new Date())

      if (result.error) {
        toast.error(result.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  // Handle advance task
  const handleAdvanceTask = async (task: Task) => {
    if (task.status === 'BLOCKED') {
      toast.error('Cannot advance blocked task')
      return
    }
    if (task.column === 'DONE') return

    setProcessingTaskId(task.id)

    const result = await advanceTask(
      task.id,
      task.sku,
      task.quantity,
      task.column as 'TO_FILL' | 'TO_CASE'
    )

    if (result.success) {
      toast.success(`Advanced: ${task.sku} x${task.quantity}`)
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to advance task')
    }

    setProcessingTaskId(null)
  }

  // Handle revert task (drag to previous column)
  const handleRevertTask = async (task: Task | CompletedTask, toColumn: KanbanColumn) => {
    const taskColumn = 'column' in task ? task.column : 'DONE'
    if (taskColumn === 'TO_FILL') return // Can't revert from first column

    setProcessingTaskId(task.id)

    const result = await revertTask(
      task.id,
      task.sku,
      task.quantity,
      taskColumn as 'TO_CASE' | 'DONE'
    )

    if (result.success) {
      toast.success(`Reverted: ${task.sku} x${task.quantity}`)
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to revert task')
    }

    setProcessingTaskId(null)
  }

  // Handle edit inventory
  const handleEditOpen = (sku: SKUStatus) => {
    setEditingSku(sku)
    setEditValues({ cased: sku.cased, filled: sku.filled, staged: sku.staged })
  }

  const handleEditSave = async () => {
    if (!editingSku) return
    setSaving(true)

    const result = await updateInventory(editingSku.sku, editValues)

    if (result.success) {
      toast.success(`Updated ${editingSku.sku}`)
      setEditingSku(null)
      await fetchData()
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

    const result = await addContainer(selectedSku as SKU, selectedSize)

    if (result.success) {
      toast.success(`Added ${selectedSize} to ${selectedSku} staged`)
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to add')
    }

    setAddingContainer(false)
  }

  // Handle save note
  const handleSaveNote = async (taskId: string, note: string) => {
    const result = await updateTaskNote(taskId, note)

    if (result.success) {
      toast.success('Note saved')
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to save note')
    }
  }

  // Filter tasks
  const toFillTasks = data?.tasks.filter(t => t.column === 'TO_FILL') || []
  const toCaseTasks = data?.tasks.filter(t => t.column === 'TO_CASE') || []
  const doneTasks = data?.completedTasks || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Inventory Panel - Desktop Only */}
      <Card className="hidden md:block">
        <CardContent className="p-4">
          {inventoryExpanded && (
            <div className="space-y-4">
              {data?.error && (
                <div className="text-red-400 text-sm text-center">{data.error}</div>
              )}

              {/* A's Row */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 text-center font-semibold">A's</p>
                <div className="grid grid-cols-7 gap-2">
                  {A_SKUS.map(skuCode => {
                    const sku = data?.inventory.find(i => i.sku === skuCode)
                    if (!sku) return <div key={skuCode} />

                    return (
                      <InventoryCard
                        key={skuCode}
                        sku={sku}
                        onClick={() => handleEditOpen(sku)}
                      />
                    )
                  })}
                </div>
              </div>

              {/* B's Row */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 text-center font-semibold">B's</p>
                <div className="grid grid-cols-7 gap-2">
                  {B_SKUS.map(skuCode => {
                    const sku = data?.inventory.find(i => i.sku === skuCode)
                    if (!sku) return <div key={skuCode} />

                    return (
                      <InventoryCard
                        key={skuCode}
                        sku={sku}
                        onClick={() => handleEditOpen(sku)}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Toggle Bar */}
          <div
            className={`flex items-center justify-center gap-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors ${inventoryExpanded ? 'border-t mt-4' : ''}`}
            onClick={() => setInventoryExpanded(!inventoryExpanded)}
          >
            <span className="text-xs text-muted-foreground">
              Updated: {lastUpdated ? formatTime(lastUpdated) : '—'}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {inventoryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {inventoryExpanded ? 'Hide Inventory' : 'Show Inventory'}
              {inventoryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Board */}
      <div>
        {/* Desktop: 3 columns */}
        <div className="hidden md:grid md:grid-cols-3 gap-4 h-[calc(100vh-300px)]">
          <KanbanColumnComponent
            title="TO FILL"
            column="TO_FILL"
            tasks={toFillTasks}
            taskNotes={data?.taskNotes || {}}
            onAdvanceTask={handleAdvanceTask}
            onRevertTask={handleRevertTask}
            processingTaskId={processingTaskId}
            onSaveNote={handleSaveNote}
          />
          <KanbanColumnComponent
            title="TO CASE"
            column="TO_CASE"
            tasks={toCaseTasks}
            taskNotes={data?.taskNotes || {}}
            onAdvanceTask={handleAdvanceTask}
            onRevertTask={handleRevertTask}
            processingTaskId={processingTaskId}
            onSaveNote={handleSaveNote}
          />
          <KanbanColumnComponent
            title="DONE"
            column="DONE"
            tasks={[]}
            completedTasks={doneTasks}
            taskNotes={data?.taskNotes || {}}
            onAdvanceTask={() => {}}
            onRevertTask={handleRevertTask}
            processingTaskId={processingTaskId}
            onSaveNote={handleSaveNote}
          />
        </div>

        {/* Mobile: Tabs */}
        <div className="md:hidden">
          <Tabs value={activeTaskTab} onValueChange={(v) => setActiveTaskTab(v as KanbanColumn)}>
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
                  <TaskCard
                    key={task.id}
                    task={task}
                    note={data?.taskNotes[task.id] || ''}
                    onAdvance={handleAdvanceTask}
                    isProcessing={processingTaskId === task.id}
                    onSaveNote={handleSaveNote}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="TO_CASE" className="mt-4 space-y-2">
              {toCaseTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tasks</p>
              ) : (
                toCaseTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    note={data?.taskNotes[task.id] || ''}
                    onAdvance={handleAdvanceTask}
                    isProcessing={processingTaskId === task.id}
                    onSaveNote={handleSaveNote}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="DONE" className="mt-4 space-y-2">
              {doneTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nothing completed yet</p>
              ) : (
                doneTasks.map(task => (
                  <CompletedTaskCard key={task.id} task={task} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Floating Menu */}
      <FloatingMenu
        onInventoryClick={() => setMobileInventoryOpen(true)}
        onContainerClick={() => setContainerSheetOpen(true)}
      />

      {/* Edit Inventory Sheet */}
      <Sheet open={!!editingSku} onOpenChange={(open) => !open && setEditingSku(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit {editingSku?.sku}</SheetTitle>
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
              <Button variant="outline" className="flex-1" onClick={() => setEditingSku(null)}>
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
            <SheetTitle>Add Staged Container</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-4">
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
              {addingContainer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Container x{selectedSize}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile Inventory Sheet */}
      <Sheet open={mobileInventoryOpen} onOpenChange={setMobileInventoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Inventory</SheetTitle>
            <SheetDescription>
              Tap any SKU to edit counts • Updated: {lastUpdated ? formatTime(lastUpdated) : '—'}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-4">
            {data?.error && (
              <div className="text-red-400 text-sm text-center">{data.error}</div>
            )}

            {/* A's */}
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-3">A's</p>
              <div className="grid grid-cols-2 gap-3">
                {A_SKUS.map(skuCode => {
                  const sku = data?.inventory.find(i => i.sku === skuCode)
                  if (!sku) return <div key={skuCode} />

                  return (
                    <InventoryCard
                      key={skuCode}
                      sku={sku}
                      onClick={() => {
                        setMobileInventoryOpen(false)
                        handleEditOpen(sku)
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* B's */}
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-3">B's</p>
              <div className="grid grid-cols-2 gap-3">
                {B_SKUS.map(skuCode => {
                  const sku = data?.inventory.find(i => i.sku === skuCode)
                  if (!sku) return <div key={skuCode} />

                  return (
                    <InventoryCard
                      key={skuCode}
                      sku={sku}
                      onClick={() => {
                        setMobileInventoryOpen(false)
                        handleEditOpen(sku)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  )
}

// ============================================
// COMPONENTS
// ============================================

function InventoryCard({ sku, onClick }: { sku: SKUStatus; onClick: () => void }) {
  const hasGap = sku.gap > 0
  const borderClass = hasGap ? 'border-red-500 border-2' : sku.lowStock ? 'border-amber-500 border-2' : ''

  return (
    <Card
      className={`cursor-pointer hover:bg-muted/50 transition-colors ${borderClass}`}
      onClick={onClick}
    >
      <CardContent className="p-2">
        <p className="font-bold text-sm text-center mb-1">{sku.sku}</p>
        <div className="grid grid-cols-3 gap-1 text-xs">
          <div className="text-center">
            <div className="text-green-400 font-semibold">{sku.cased}</div>
            <div className="text-muted-foreground text-[10px]">CASED</div>
          </div>
          <div className="text-center">
            <div className="text-blue-400 font-semibold">{sku.filled}</div>
            <div className="text-muted-foreground text-[10px]">FILLED</div>
          </div>
          <div className="text-center">
            <div className={`font-semibold ${sku.lowStock ? 'text-amber-400' : 'text-purple-400'}`}>
              {sku.staged}
            </div>
            <div className="text-muted-foreground text-[10px]">STAGED</div>
          </div>
        </div>
        {sku.pending > 0 && (
          <p className="text-xs mt-1 text-center">Orders: {sku.pending}</p>
        )}
        {hasGap && (
          <p className="text-xs mt-1 text-center text-red-400">Stage: {sku.gap}</p>
        )}
        {sku.lowStock && !hasGap && (
          <div className="text-center mt-1">
            <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400">
              Low Stock
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function KanbanColumnComponent({
  title,
  column,
  tasks,
  completedTasks = [],
  taskNotes,
  onAdvanceTask,
  onRevertTask,
  processingTaskId,
  onSaveNote,
}: {
  title: string
  column: KanbanColumn
  tasks: Task[]
  completedTasks?: CompletedTask[]
  taskNotes: Record<string, string>
  onAdvanceTask: (task: Task) => void
  onRevertTask: (task: Task | CompletedTask, toColumn: KanbanColumn) => void
  processingTaskId: string | null
  onSaveNote: (taskId: string, note: string) => void
}) {
  const columnHeaderColors: Record<KanbanColumn, string> = {
    TO_FILL: 'text-amber-500',
    TO_CASE: 'text-purple-400',
    DONE: 'text-green-500',
  }

  const headerColor = columnHeaderColors[column]
  const allTasks = column === 'DONE' ? completedTasks : tasks
  const count = allTasks.length

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const taskData = e.dataTransfer.getData('application/json')
      const task = JSON.parse(taskData)

      // Only allow reverting (moving backwards)
      const canDrop =
        (column === 'TO_FILL' && task.column === 'TO_CASE') ||
        (column === 'TO_CASE' && task.column === 'DONE')

      if (canDrop) {
        onRevertTask(task, column)
      }
    } catch (err) {
      console.error('Drop error:', err)
    }
  }

  return (
    <Card
      className="flex flex-col h-full overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col h-full p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className={`text-lg font-bold ${headerColor}`}>{title}</h2>
          <span className="text-muted-foreground text-sm">{count} tasks</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 min-h-0 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {count === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {column === 'DONE' ? 'Nothing completed yet' : 'No tasks'}
            </div>
          ) : column === 'DONE' ? (
            completedTasks.map(task => (
              <CompletedTaskCard
                key={task.id}
                task={task}
                isProcessing={processingTaskId === task.id}
              />
            ))
          ) : (
            tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                note={taskNotes[task.id] || ''}
                onAdvance={onAdvanceTask}
                isProcessing={processingTaskId === task.id}
                onSaveNote={onSaveNote}
              />
            ))
          )}
        </div>

        {column !== 'DONE' && (
          <div className="text-xs text-muted-foreground text-center mt-2 flex-shrink-0">
            Drag here to undo
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TaskCard({
  task,
  note,
  onAdvance,
  isProcessing,
  onSaveNote,
}: {
  task: Task
  note: string
  onAdvance: (task: Task) => void
  isProcessing: boolean
  onSaveNote?: (taskId: string, note: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [localNote, setLocalNote] = useState(note)
  const [isEditingNote, setIsEditingNote] = useState(false)

  const isBlocked = task.status === 'BLOCKED'
  const canAdvance = !isBlocked && task.column !== 'DONE'
  const truncatedNote = note && note.length > 30 ? note.substring(0, 30) + '...' : note

  // Sync local note when prop changes (but not while editing)
  useEffect(() => {
    if (!isEditingNote) {
      setLocalNote(note)
    }
  }, [note, isEditingNote])

  const handleDragStart = (e: React.DragEvent) => {
    if (isProcessing || isExpanded) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('application/json', JSON.stringify(task))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleCardClick = () => {
    if (!isProcessing) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleAdvanceClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (canAdvance && !isProcessing) {
      onAdvance(task)
    }
  }

  const handleNoteSave = () => {
    onSaveNote?.(task.id, localNote)
    setIsEditingNote(false)
  }

  // Get order sources (customers)
  const orderSources = task.sources.filter(s => s.type === 'ORDER')

  return (
    <Card
      className={`
        ${isBlocked ? 'opacity-50' : ''}
        ${isProcessing ? 'animate-pulse' : ''}
        cursor-pointer
      `}
      draggable={!isBlocked && !isProcessing && !isExpanded}
      onDragStart={handleDragStart}
    >
      <CardContent className="p-3" onClick={handleCardClick}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={`${PRIORITY_BADGE_STYLES[task.priority]} text-[10px] font-bold`}>
                {task.priority}
              </Badge>
              {isBlocked && (
                <span className="text-xs text-red-400">Needs Staged</span>
              )}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-bold">{task.sku}</span>
              <span className="text-muted-foreground">x{task.quantity}</span>
              {!isExpanded && truncatedNote && (
                <span className="text-sm text-muted-foreground italic">
                  "{truncatedNote}"
                </span>
              )}
            </div>
          </div>
          {canAdvance && !isProcessing && (
            <Button
              size="icon"
              variant="ghost"
              className={`h-8 w-8 ${PRIORITY_ARROW_STYLES[task.priority]}`}
              onClick={handleAdvanceClick}
            >
              <CircleArrowRight className="h-7 w-7" />
            </Button>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-border mt-3 pt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
            {/* Orders list */}
            {orderSources.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">ORDERS</div>
                <div className="space-y-1">
                  {orderSources.map((source, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{source.customerName}</span>
                      <span className="text-muted-foreground">x{source.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Backfill indicator */}
            {task.sources.some(s => s.type === 'BACKFILL') && (
              <div className="text-sm text-muted-foreground">
                Backfill: x{task.sources.find(s => s.type === 'BACKFILL')?.quantity || 0}
              </div>
            )}

            {/* Notes section */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">NOTES</div>
              {isEditingNote ? (
                <div className="space-y-2">
                  <Textarea
                    value={localNote}
                    onChange={(e) => setLocalNote(e.target.value)}
                    placeholder="Add special instructions..."
                    rows={2}
                    className="text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsEditingNote(false)
                        setLocalNote(note)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleNoteSave}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingNote(true)}
                  className={`
                    p-2 rounded text-sm cursor-text bg-muted/50
                    ${localNote ? '' : 'text-muted-foreground italic'}
                  `}
                >
                  {localNote || 'Click to add note...'}
                </div>
              )}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompletedTaskCard({
  task,
  isProcessing = false,
}: {
  task: CompletedTask
  isProcessing?: boolean
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ ...task, column: 'DONE' }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <Card
      className={`opacity-60 ${isProcessing ? 'animate-pulse' : ''}`}
      draggable={!isProcessing}
      onDragStart={handleDragStart}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Badge className="bg-green-600 text-[10px]">{task.priority}</Badge>
          <div>
            <span className="font-bold">{task.sku}</span>
            <span className="text-muted-foreground ml-2">x{task.quantity}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  SkipForward,
  Play,
  Edit2,
  Trash2,
  X,
  ArrowLeft,
} from 'lucide-react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import Link from 'next/link'
import { useAuth, canManageCultivation, canCompleteCultivation } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import type {
  CultivationTask,
  CultivationTaskStatus,
  TaskPriority,
  GrowRoom,
} from '@/types/cultivation'
import { TaskDetailSheet } from '@/components/cultivation/task-detail-sheet'
import { TaskCompletionSheet } from '@/components/cultivation/task-completion-sheet'
import { CreateTaskSheet } from '@/components/cultivation/create-task-sheet'
import { generateRecurringTasks } from '@/lib/cultivation/generate-recurring-tasks'

// --- Constants ---

const PRIORITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-400 text-white',
}

const STATUS_ICON: Record<CultivationTaskStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-gray-400" />,
  in_progress: <Clock className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  skipped: <SkipForward className="h-4 w-4 text-gray-400" />,
}

const STATUS_BADGE: Record<CultivationTaskStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-200 text-gray-800' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-500' },
}

interface UserOption {
  id: string
  name: string
  role: string
}

export default function CultivationTasksPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<CultivationTask[]>([])
  const [rooms, setRooms] = useState<GrowRoom[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)

  // View mode
  const [viewMode, setViewMode] = useState<'all' | 'mine'>(() =>
    user && canManageCultivation(user.role) ? 'all' : 'mine'
  )

  // Filters
  const [search, setSearch] = useState('')
  const [filterRoom, setFilterRoom] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Sheets
  const [detailTask, setDetailTask] = useState<CultivationTask | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [completionTask, setCompletionTask] = useState<CultivationTask | null>(null)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [createEditTask, setCreateEditTask] = useState<CultivationTask | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTask, setDeleteTask] = useState<CultivationTask | null>(null)

  const canManage = user ? canManageCultivation(user.role) : false
  const canComplete = user ? canCompleteCultivation(user.role) : false

  async function fetchData() {
    const supabase = createClient()

    // Generate any pending recurring task instances
    await generateRecurringTasks()

    const [tasksRes, roomsRes, usersRes] = await Promise.all([
      supabase
        .from('cultivation_tasks')
        .select(
          '*, room:grow_rooms(id, room_name, room_number), assigned_user:users!cultivation_tasks_assigned_to_fkey(id, name), completed_by_user:users!cultivation_tasks_completed_by_fkey(id, name)'
        )
        // Exclude recurring definition rows — only show actionable tasks
        // Definition rows have frequency set AND no recurring_parent_id
        .or('frequency.is.null,recurring_parent_id.not.is.null')
        .order('due_date'),
      supabase.from('grow_rooms').select('*').order('room_number'),
      supabase
        .from('users')
        .select('id, name, role')
        .in('role', ['admin', 'management', 'vault', 'packaging', 'standard'])
        .order('name'),
    ])

    if (tasksRes.data) setTasks(tasksRes.data as CultivationTask[])
    if (roomsRes.data) setRooms(roomsRes.data as GrowRoom[])
    if (usersRes.data) setUsers(usersRes.data as UserOption[])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // --- Filtering ---
  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.completion_notes && t.completion_notes.toLowerCase().includes(q))
      )
    }

    // Room
    if (filterRoom === 'none') {
      result = result.filter((t) => !t.room_id)
    } else if (filterRoom !== 'all') {
      result = result.filter((t) => t.room_id === filterRoom)
    }

    // Status
    if (filterStatus !== 'all') {
      result = result.filter((t) => t.status === filterStatus)
    }

    // Priority
    if (filterPriority !== 'all') {
      result = result.filter((t) => t.priority === filterPriority)
    }

    // Type
    if (filterType !== 'all') {
      result = result.filter((t) => t.task_type === filterType)
    }

    // Assignee
    if (filterAssignee === 'unassigned') {
      result = result.filter((t) => !t.assigned_to)
    } else if (filterAssignee !== 'all') {
      result = result.filter((t) => t.assigned_to === filterAssignee)
    }

    // Date range
    if (filterDateFrom) {
      result = result.filter((t) => t.due_date >= filterDateFrom)
    }
    if (filterDateTo) {
      result = result.filter((t) => t.due_date <= filterDateTo)
    }

    // My Tasks filter
    if (viewMode === 'mine' && user) {
      result = result.filter((t) => t.assigned_to === user.id)
    }

    return result
  }, [tasks, search, filterRoom, filterStatus, filterPriority, filterType, filterAssignee, filterDateFrom, filterDateTo, viewMode, user])

  // --- Sorting ---
  const sortedTasks = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    return [...filteredTasks].sort((a, b) => {
      const aOverdue =
        (a.status === 'pending' || a.status === 'in_progress') && a.due_date < todayStr ? 1 : 0
      const bOverdue =
        (b.status === 'pending' || b.status === 'in_progress') && b.due_date < todayStr ? 1 : 0

      // Overdue first
      if (bOverdue !== aOverdue) return bOverdue - aOverdue

      // Then by due_date ASC
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)

      // Then by priority weight ASC (critical first)
      return (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2)
    })
  }, [filteredTasks])

  // --- Summary stats (from filtered tasks) ---
  const stats = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    let overdue = 0
    let dueToday = 0
    let inProgress = 0
    let completedToday = 0

    for (const t of filteredTasks) {
      if ((t.status === 'pending' || t.status === 'in_progress') && t.due_date < todayStr) {
        overdue++
      }
      if ((t.status === 'pending' || t.status === 'in_progress') && t.due_date === todayStr) {
        dueToday++
      }
      if (t.status === 'in_progress') {
        inProgress++
      }
      if (t.status === 'completed' && t.completed_at && isToday(parseISO(t.completed_at))) {
        completedToday++
      }
    }

    return { overdue, dueToday, inProgress, completedToday }
  }, [filteredTasks])

  // --- Actions ---

  async function handleStartTask(task: CultivationTask) {
    const supabase = createClient()
    const { error } = await supabase
      .from('cultivation_tasks')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', task.id)

    if (error) {
      toast.error('Failed to start task')
      console.error(error)
      return
    }
    toast.success('Task started')
    setDetailOpen(false)
    fetchData()
  }

  async function handleDeleteTask() {
    if (!deleteTask) return
    const supabase = createClient()
    const { error } = await supabase.from('cultivation_tasks').delete().eq('id', deleteTask.id)

    if (error) {
      toast.error('Failed to delete task')
      console.error(error)
      return
    }
    toast.success('Task deleted')
    setDeleteTask(null)
    setDetailOpen(false)
    fetchData()
  }

  function openDetailSheet(task: CultivationTask) {
    setDetailTask(task)
    setDetailOpen(true)
  }

  function openCompleteFlow(task: CultivationTask) {
    setDetailOpen(false)
    setCompletionTask(task)
    setCompletionOpen(true)
  }

  function openEditFlow(task: CultivationTask) {
    setDetailOpen(false)
    setCreateEditTask(task)
    setCreateOpen(true)
  }

  function openCreate() {
    setCreateEditTask(null)
    setCreateOpen(true)
  }

  function clearFilters() {
    setSearch('')
    setFilterRoom('all')
    setFilterStatus('all')
    setFilterPriority('all')
    setFilterType('all')
    setFilterAssignee('all')
    setFilterDateFrom('')
    setFilterDateTo('')
    setViewMode(user && canManageCultivation(user.role) ? 'all' : 'mine')
  }

  const hasFilters =
    search || filterRoom !== 'all' || filterStatus !== 'all' || filterPriority !== 'all' || filterType !== 'all' || filterAssignee !== 'all' || filterDateFrom || filterDateTo

  // --- Helpers ---

  function isOverdue(task: CultivationTask): boolean {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    return (task.status === 'pending' || task.status === 'in_progress') && task.due_date < todayStr
  }

  function phaseWeekLabel(task: CultivationTask): string {
    if (task.phase && task.week_number) {
      return `${task.phase.charAt(0).toUpperCase() + task.phase.slice(1)} Wk ${task.week_number}`
    }
    return '\u2014'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading tasks...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/cultivation">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cultivation Tasks</h1>
            <p className="text-muted-foreground">
              Manage and track grow room tasks
            </p>
          </div>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.overdue > 0 ? 'text-red-600' : ''}`}>
              {stats.overdue}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.dueToday}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedToday}</div>
          </CardContent>
        </Card>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'mine' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('mine')}
          className="flex-1 sm:flex-none"
        >
          My Tasks
        </Button>
        <Button
          variant={viewMode === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('all')}
          className="flex-1 sm:flex-none"
        >
          All Tasks
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <div className="relative w-full sm:w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={filterRoom} onValueChange={setFilterRoom}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Room" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rooms</SelectItem>
            <SelectItem value="none">No Room</SelectItem>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.room_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="adhoc">Ad-hoc</SelectItem>
            <SelectItem value="recurring">Recurring</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} <span className="text-muted-foreground text-xs">({u.role})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="w-full sm:w-[160px]"
          placeholder="From"
        />

        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="w-full sm:w-[160px]"
          placeholder="To"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {sortedTasks.length} task{sortedTasks.length !== 1 ? 's' : ''}
        {hasFilters ? ' (filtered)' : ''}
      </p>

      {/* Desktop Table */}
      <div className="hidden sm:block">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Phase / Week</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No tasks found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedTasks.map((task) => {
                  const taskOverdue = isOverdue(task)
                  return (
                  <TableRow
                    key={task.id}
                    className={`cursor-pointer hover:bg-muted/50 ${taskOverdue ? 'bg-red-500/10 border-l-2 border-l-red-500' : ''}`}
                    onClick={() => openDetailSheet(task)}
                  >
                    <TableCell>{STATUS_ICON[task.status]}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {task.title}
                    </TableCell>
                    <TableCell>{task.room?.room_name || '\u2014'}</TableCell>
                    <TableCell>{phaseWeekLabel(task)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge className={PRIORITY_BADGE[task.priority]}>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </Badge>
                        {taskOverdue && (
                          <Badge className="bg-red-600 text-white text-[10px] px-1.5">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={taskOverdue ? 'text-red-600 font-medium' : ''}>
                        {format(parseISO(task.due_date), 'MMM d, yyyy')}
                      </span>
                    </TableCell>
                    <TableCell>{task.assigned_user?.name || 'Unassigned'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {canComplete &&
                          (task.status === 'pending' || task.status === 'in_progress') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Complete"
                              onClick={() => openCompleteFlow(task)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => openEditFlow(task)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="Delete"
                              onClick={() => setDeleteTask(task)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {sortedTasks.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No tasks found.</p>
        ) : (
          sortedTasks.map((task) => {
            const taskOverdue = isOverdue(task)
            return (
            <Card
              key={task.id}
              className={`cursor-pointer ${taskOverdue ? 'border-red-500 bg-red-500/10' : ''}`}
              onClick={() => openDetailSheet(task)}
            >
              <CardContent className="p-4 space-y-2">
                {/* Row 1: title + priority */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-snug line-clamp-2">{task.title}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {taskOverdue && (
                      <Badge className="bg-red-600 text-white text-[10px] px-1.5">Overdue</Badge>
                    )}
                    <Badge className={`${PRIORITY_BADGE[task.priority]} text-xs`}>
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </Badge>
                  </div>
                </div>

                {/* Row 2: room + phase */}
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{task.room?.room_name || 'No room'}</span>
                  <span>&middot;</span>
                  <span>{phaseWeekLabel(task)}</span>
                </div>

                {/* Row 3: due date + assignee */}
                <div className="flex items-center justify-between text-xs">
                  <span className={taskOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                    Due: {format(parseISO(task.due_date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-muted-foreground">
                    {task.assigned_user?.name || 'Unassigned'}
                  </span>
                </div>

                {/* Row 4: status + actions */}
                <div
                  className="flex items-center justify-between pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Badge className={STATUS_BADGE[task.status].className}>
                    {STATUS_BADGE[task.status].label}
                  </Badge>
                  <div className="flex gap-1">
                    {canComplete &&
                      (task.status === 'pending' || task.status === 'in_progress') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => openCompleteFlow(task)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Complete
                        </Button>
                      )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => openEditFlow(task)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            )
          })
        )}
      </div>

      {/* Detail Sheet */}
      <TaskDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        task={detailTask}
        userRole={user?.role || 'standard'}
        onComplete={() => detailTask && openCompleteFlow(detailTask)}
        onStart={() => detailTask && handleStartTask(detailTask)}
        onEdit={() => detailTask && openEditFlow(detailTask)}
        onDelete={() => {
          setDetailOpen(false)
          detailTask && setDeleteTask(detailTask)
        }}
      />

      {/* Completion Sheet */}
      <TaskCompletionSheet
        open={completionOpen}
        onOpenChange={setCompletionOpen}
        task={completionTask}
        userId={user?.id || ''}
        onCompleted={() => {
          setCompletionOpen(false)
          fetchData()
        }}
      />

      {/* Create/Edit Sheet */}
      <CreateTaskSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        task={createEditTask}
        rooms={rooms}
        users={users}
        userId={user?.id || ''}
        onSaved={() => {
          setCreateOpen(false)
          fetchData()
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTask} onOpenChange={(open) => !open && setDeleteTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTask?.title}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
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
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { format, parseISO, isPast, isToday, subDays, addDays, addWeeks, startOfWeek, endOfWeek } from 'date-fns'
import { parseLocalDate } from '@/lib/utils'
import Link from 'next/link'
import { useAuth, canManageCultivation, canCompleteCultivation } from '@/lib/auth-context'
import type {
  CultivationTask,
  CultivationTaskStatus,
  TaskPriority,
  GrowRoom,
  PipelineStage,
} from '@/types/cultivation'
import { STAGE_ORDER, PHASE_CONFIG } from '@/types/cultivation'
import { TaskDetailSheet } from '@/components/cultivation/task-detail-sheet'
import { TaskCompletionSheet } from '@/components/cultivation/task-completion-sheet'
import { CreateTaskSheet } from '@/components/cultivation/create-task-sheet'
import {
  getCultivationTasks,
  getCultivationTaskSummary,
  getGrowRooms,
  getCultivationUsers,
  startTask,
  deleteTask as deleteTaskAction,
} from '@/actions/cultivation'

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

interface TaskSummaryRow {
  id: string
  status: string
  due_date: string
  completed_at: string | null
  room_id: string | null
}

type TimeframePreset =
  | 'past_due_today'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'next_week'
  | 'next_14_days'
  | 'custom'

const TIMEFRAME_OPTIONS: { value: TimeframePreset; label: string }[] = [
  { value: 'past_due_today', label: 'Past Due & Today' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'next_week', label: 'Next Week' },
  { value: 'next_14_days', label: 'Next 14 Days' },
  { value: 'custom', label: 'Custom' },
]

/** Maps the Status filter dropdown to the server-side statuses param. "All
 * Status" intentionally resolves to the incomplete set (pending, in_progress)
 * rather than every status — completed/skipped rows are only fetched when
 * the user explicitly picks them, so we don't preload the ever-growing
 * history of finished tasks. */
function statusesForFilter(status: string): CultivationTaskStatus[] {
  if (status === 'all') return ['pending', 'in_progress']
  return [status as CultivationTaskStatus]
}

/** Comma-joined assignee names, falling back to the legacy single assignee. */
function assigneeNames(task: CultivationTask): string {
  if (task.assignees && task.assignees.length > 0) {
    return task.assignees.map((a) => a.name).join(', ')
  }
  return task.assigned_user?.name || 'Unassigned'
}

// Rows requested per server-side page — must match DEFAULT_PAGE_SIZE in
// actions/cultivation.ts (kept as a separate constant since the client
// can't import a server-only module's internals).
const PAGE_SIZE = 50

export default function CultivationTasksPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<CultivationTask[]>([])
  const [summary, setSummary] = useState<TaskSummaryRow[]>([])
  const [rooms, setRooms] = useState<GrowRoom[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  // Single loading indicator shared by the initial load and every
  // filter-triggered refetch (Timeframe/Status/Custom dates). Before the
  // first successful load it drives the full-page spinner below; after
  // that, `hasLoadedOnce` switches the UI to keep the existing rows on
  // screen and show an inline "Refreshing…" indicator instead.
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  // Guards against an in-flight fetch resolving out of order (e.g. rapid
  // filter changes) — only the most recently issued request is allowed to
  // apply its data or clear `loading`.
  const fetchSeqRef = useRef(0)

  // Server-side pagination state. `totalCount`/`hasMore` reflect the full
  // set matching the current timeframe+status window on the server;
  // `tasks` only holds the pages loaded so far. Reset to page 0 whenever a
  // filter change triggers a fresh fetchData() (see the effect below).
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)

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
  const [filterStage, setFilterStage] = useState('all')
  const [timeframe, setTimeframe] = useState<TimeframePreset>('past_due_today')
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

  /** Resolves the active Timeframe preset (or Custom dates) to a
   * dateFrom/dateTo window to send to getCultivationTasks(). */
  function computeTimeframeRange(): { dateFrom: string | null; dateTo: string | null } {
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')

    switch (timeframe) {
      case 'today':
        return { dateFrom: todayStr, dateTo: todayStr }
      case 'yesterday': {
        const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd')
        return { dateFrom: yesterdayStr, dateTo: yesterdayStr }
      }
      case 'this_week':
        return {
          dateFrom: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          dateTo: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        }
      case 'next_week': {
        const nextWeek = addWeeks(today, 1)
        return {
          dateFrom: format(startOfWeek(nextWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          dateTo: format(endOfWeek(nextWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        }
      }
      case 'next_14_days':
        return { dateFrom: todayStr, dateTo: format(addDays(today, 14), 'yyyy-MM-dd') }
      case 'custom':
        return { dateFrom: filterDateFrom || null, dateTo: filterDateTo || null }
      case 'past_due_today':
      default:
        // Unbounded start so overdue tasks always show, regardless of age.
        return { dateFrom: null, dateTo: todayStr }
    }
  }

  /** Switch the active Timeframe preset. Entering Custom seeds both dates to
   * today (rather than leaving them unbounded) so we don't accidentally
   * re-trigger the original full-table over-fetch. */
  function handleTimeframeChange(value: TimeframePreset) {
    setTimeframe(value)
    if (value === 'custom') {
      const todayStr = format(new Date(), 'yyyy-MM-dd')
      setFilterDateFrom((prev) => prev || todayStr)
      setFilterDateTo((prev) => prev || todayStr)
    } else {
      setFilterDateFrom('')
      setFilterDateTo('')
    }
  }

  /** Full refetch from page 0 — used for the initial load and any
   * filter-triggered refetch. Resets pagination (offsetRef, tasks, hasMore)
   * so a filter change mid-load-more can't leave stale pages mixed in. */
  async function fetchData() {
    // Bump the sequence so any earlier in-flight request (including a
    // pending "Load more") can recognize itself as stale once this one
    // resolves.
    const requestId = ++fetchSeqRef.current
    offsetRef.current = 0
    setLoading(true)
    setLoadingMore(false)
    try {
      // Recurring task generation now runs on a nightly Vercel Cron
      // (app/api/cron/generate-recurring-tasks/route.ts) instead of on
      // every page load — see generateRecurringTasksCore in
      // actions/cultivation.ts.
      const { dateFrom, dateTo } = computeTimeframeRange()
      const statuses = statusesForFilter(filterStatus)

      const [tasksRes, roomsRes, usersRes, summaryRes] = await Promise.all([
        getCultivationTasks({ dateFrom, dateTo, statuses, limit: PAGE_SIZE, offset: 0 }),
        getGrowRooms(),
        getCultivationUsers(),
        // Lightweight, unfiltered — backs the header stat cards so they stay
        // accurate no matter what Timeframe/Status the table is scoped to.
        getCultivationTaskSummary(),
      ])

      // A newer fetch (from a subsequent filter change) has already
      // started — don't let this stale response overwrite fresher data.
      if (requestId !== fetchSeqRef.current) return

      if (tasksRes.data) {
        const page = tasksRes.data.tasks as CultivationTask[]
        setTasks(page)
        setTotalCount(tasksRes.data.totalCount)
        setHasMore(tasksRes.data.hasMore)
        offsetRef.current = page.length
      }
      if (roomsRes.data) setRooms(roomsRes.data as GrowRoom[])
      if (usersRes.data) setUsers(usersRes.data as UserOption[])
      if (summaryRes.data) setSummary(summaryRes.data)
    } catch (err) {
      console.error('[cultivation/tasks] fetchData error:', err)
    } finally {
      // Only the most recently issued request is allowed to clear the
      // loading indicator — an earlier, slower request resolving late
      // must not flip loading off while a newer refetch is still pending.
      if (requestId === fetchSeqRef.current) {
        setLoading(false)
        setHasLoadedOnce(true)
      }
    }
  }

  /** Fetches the next page (at offsetRef.current) and appends it to `tasks`.
   * Shares fetchSeqRef with fetchData() so a filter change firing mid-flight
   * invalidates this response instead of mixing pages from two different
   * filter states. */
  async function loadMoreTasks() {
    const requestId = ++fetchSeqRef.current
    setLoadingMore(true)
    try {
      const { dateFrom, dateTo } = computeTimeframeRange()
      const statuses = statusesForFilter(filterStatus)

      const res = await getCultivationTasks({
        dateFrom,
        dateTo,
        statuses,
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      })

      // A filter change (or another load-more) superseded this request.
      if (requestId !== fetchSeqRef.current) return

      if (res.data) {
        const page = res.data.tasks as CultivationTask[]
        setTasks((prev) => [...prev, ...page])
        setTotalCount(res.data.totalCount)
        setHasMore(res.data.hasMore)
        offsetRef.current += page.length
      } else if (res.error) {
        toast.error(res.error)
      }
    } catch (err) {
      console.error('[cultivation/tasks] loadMoreTasks error:', err)
    } finally {
      if (requestId === fetchSeqRef.current) {
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, filterStatus, filterDateFrom, filterDateTo])

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

    // Status and date-window filtering happen server-side (see fetchData /
    // getCultivationTasks) — the fetched `tasks` array is already scoped, so
    // there's no need to re-filter by status or date here.

    // Priority
    if (filterPriority !== 'all') {
      result = result.filter((t) => t.priority === filterPriority)
    }

    // Type
    if (filterType !== 'all') {
      result = result.filter((t) => t.task_type === filterType)
    }

    // Stage
    if (filterStage !== 'all') {
      result = result.filter((t) => t.phase === filterStage)
    }

    // Assignee
    if (filterAssignee === 'unassigned') {
      result = result.filter((t) => !t.assignees || t.assignees.length === 0)
    } else if (filterAssignee !== 'all') {
      result = result.filter((t) => t.assignees?.some((a) => a.id === filterAssignee))
    }

    // My Tasks filter
    if (viewMode === 'mine' && user) {
      result = result.filter((t) => t.assignees?.some((a) => a.id === user.id))
    }

    return result
  }, [tasks, search, filterRoom, filterPriority, filterType, filterStage, filterAssignee, viewMode, user])

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

  // --- Summary stats ---
  // Derived from the lightweight, unfiltered getCultivationTaskSummary()
  // fetch (not from `tasks`/`filteredTasks`) so the header cards stay
  // globally accurate regardless of the Timeframe/Status/other filters
  // currently scoping the table below.
  const stats = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    let overdue = 0
    let dueToday = 0
    let inProgress = 0
    let completedToday = 0

    for (const t of summary) {
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
  }, [summary])

  // --- Actions ---

  async function handleStartTask(task: CultivationTask) {
    const result = await startTask(task.id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Task started')
    setDetailOpen(false)
    fetchData()
  }

  async function handleDeleteTask() {
    if (!deleteTask) return
    const result = await deleteTaskAction(deleteTask.id)
    if (result.error) {
      toast.error(result.error)
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
    setFilterStage('all')
    setFilterAssignee('all')
    setTimeframe('past_due_today')
    setFilterDateFrom('')
    setFilterDateTo('')
    setViewMode(user && canManageCultivation(user.role) ? 'all' : 'mine')
  }

  const hasFilters =
    search || filterRoom !== 'all' || filterStatus !== 'all' || filterPriority !== 'all' || filterType !== 'all' || filterStage !== 'all' || filterAssignee !== 'all' || timeframe !== 'past_due_today'

  // --- Helpers ---

  function isOverdue(task: CultivationTask): boolean {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    return (task.status === 'pending' || task.status === 'in_progress') && task.due_date < todayStr
  }

  function phaseDayLabel(task: CultivationTask): string {
    if (task.phase && task.day_number) {
      const label = PHASE_CONFIG[task.phase as PipelineStage]?.label || (task.phase.charAt(0).toUpperCase() + task.phase.slice(1))
      return `${label} Day ${task.day_number}`
    }
    return '\u2014'
  }

  // Full-page spinner only for the very first load (no data on screen yet).
  // Subsequent filter-triggered refetches keep the existing rows visible
  // and surface `loading` via the inline indicator/overlay below instead.
  if (loading && !hasLoadedOnce) {
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

        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {PHASE_CONFIG[s].label}
              </SelectItem>
            ))}
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

        <Select value={timeframe} onValueChange={(v) => handleTimeframeChange(v as TimeframePreset)}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="Timeframe" />
          </SelectTrigger>
          <SelectContent>
            {TIMEFRAME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {timeframe === 'custom' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              id="task-date-from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              aria-label="Start date"
              className="flex-1 min-w-0 sm:flex-none sm:w-[140px]"
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <Input
              id="task-date-to"
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              aria-label="End date"
              className="flex-1 min-w-0 sm:flex-none sm:w-[140px]"
            />
          </div>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Results count — `tasks` is what's loaded from the server so far
          (paginated, scoped to the current timeframe+status); `totalCount`
          is the full server-side match count for that same scope.
          Client-only filters (search/room/priority/type/stage/assignee/My
          Tasks) further narrow `tasks` down to `sortedTasks` without
          fetching more, so when those are active we surface both numbers
          rather than implying `sortedTasks.length` is the server total. */}
      <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
        {sortedTasks.length === tasks.length
          ? `Showing ${tasks.length} of ${totalCount} task${totalCount !== 1 ? 's' : ''}`
          : `Showing ${sortedTasks.length} of ${tasks.length} loaded (${totalCount} total)`}
        {hasFilters ? ' (filtered)' : ''}
        {loading && (
          <span className="inline-flex items-center gap-1 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing…
          </span>
        )}
      </p>

      {/* Desktop Table */}
      <div className={`hidden sm:block transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Phase / Day</TableHead>
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
                    <TableCell>{phaseDayLabel(task)}</TableCell>
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
                        {format(parseLocalDate(task.due_date), 'MMM d, yyyy')}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate" title={assigneeNames(task)}>
                      {assigneeNames(task)}
                    </TableCell>
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
      <div className={`sm:hidden space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
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
                  <span>{phaseDayLabel(task)}</span>
                </div>

                {/* Row 3: due date + assignee */}
                <div className="flex items-center justify-between text-xs">
                  <span className={taskOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                    Due: {format(parseLocalDate(task.due_date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[50%]" title={assigneeNames(task)}>
                    {assigneeNames(task)}
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

      {/* Load More — only appears when the server reports more rows exist
          beyond what's currently loaded for this timeframe+status window. */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={loadMoreTasks} disabled={loadingMore}>
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading…
              </>
            ) : (
              `Load more (${totalCount - tasks.length} remaining)`
            )}
          </Button>
        </div>
      )}

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

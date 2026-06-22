'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { getCultivationTasksForDisplay, completeTask } from '@/actions/cultivation'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PRIORITY_BADGE } from '@/lib/cultivation/helpers'
import { PHASE_CONFIG } from '@/types/cultivation'
import type { CultivationTask, PipelineStage } from '@/types/cultivation'

// ─── Constants ───────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 60_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function groupByRoom(tasks: CultivationTask[]): Array<{ roomName: string; tasks: CultivationTask[] }> {
  const map = new Map<string | null, CultivationTask[]>()

  for (const task of tasks) {
    const key = task.room_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(task)
  }

  const groups: Array<{ roomName: string; tasks: CultivationTask[] }> = []

  // Named room groups first (sorted by room name)
  const namedEntries = Array.from(map.entries()).filter(([key]) => key !== null)
  namedEntries.sort((a, b) => {
    const roomA = a[1][0]?.room?.room_name ?? ''
    const roomB = b[1][0]?.room?.room_name ?? ''
    return roomA.localeCompare(roomB)
  })
  for (const [, tasks] of namedEntries) {
    const roomName = tasks[0]?.room?.room_name ?? 'Unknown Room'
    groups.push({ roomName, tasks })
  }

  // General (null room_id) last
  if (map.has(null)) {
    groups.push({ roomName: 'General', tasks: map.get(null)! })
  }

  return groups
}

function phaseDayLabel(task: CultivationTask): string {
  if (task.phase && task.day_number != null) {
    const label =
      PHASE_CONFIG[task.phase as PipelineStage]?.label ??
      task.phase.charAt(0).toUpperCase() + task.phase.slice(1)
    return `${label} · Day ${task.day_number}`
  }
  if (task.phase) {
    const label =
      PHASE_CONFIG[task.phase as PipelineStage]?.label ??
      task.phase.charAt(0).toUpperCase() + task.phase.slice(1)
    return label
  }
  if (task.day_number != null) {
    return `Day ${task.day_number}`
  }
  return '—'
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: CultivationTask
  userId: string
  onCompleted: (taskId: string) => void
  isOverdue: boolean
}

function TaskRow({ task, userId, onCompleted, isOverdue }: TaskRowProps) {
  const [pending, setPending] = useState(false)

  async function handleComplete() {
    if (pending) return
    setPending(true)
    // Optimistic: caller removes the row immediately
    onCompleted(task.id)
    const result = await completeTask({
      taskId: task.id,
      completedBy: userId,
      notes: null,
    })
    if (result.error) {
      // Revert signal — caller should re-add; simplest is a full refetch
      toast.error(`Failed to complete task: ${result.error}`)
      // Re-add not trivially done optimistically; trigger a refetch via custom event
      window.dispatchEvent(new CustomEvent('cultivation-task-revert'))
    }
    setPending(false)
  }

  return (
    <TableRow
      className={`${isOverdue ? 'border-l-2 border-l-red-500' : ''} h-9`}
    >
      {/* Title + priority badge */}
      <TableCell className="py-1 pr-2 max-w-[260px]">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            className={`${PRIORITY_BADGE[task.priority]} text-xs px-1.5 py-0 shrink-0 leading-5`}
          >
            {task.priority.charAt(0).toUpperCase()}
          </Badge>
          <span className="text-lg font-medium truncate leading-snug">
            {task.title}
          </span>
        </div>
      </TableCell>

      {/* Phase / Day */}
      <TableCell className="py-1 text-base text-zinc-300 whitespace-nowrap">
        {phaseDayLabel(task)}
      </TableCell>

      {/* Assigned To */}
      <TableCell className="py-1 text-base text-zinc-400 whitespace-nowrap">
        {task.assigned_user?.name ?? 'Unassigned'}
      </TableCell>

      {/* Complete checkbox */}
      <TableCell className="py-1 text-center w-12">
        <Checkbox
          checked={false}
          disabled={pending}
          onCheckedChange={handleComplete}
          className="h-5 w-5 border-zinc-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
          aria-label={`Mark "${task.title}" complete`}
        />
      </TableCell>
    </TableRow>
  )
}

// ─── Room Group Table ─────────────────────────────────────────────────────────

interface RoomGroupTableProps {
  group: { roomName: string; tasks: CultivationTask[] }
  userId: string
  completedIds: Set<string>
  onCompleted: (taskId: string) => void
  isOverdue: boolean
}

function RoomGroupTable({ group, userId, completedIds, onCompleted, isOverdue }: RoomGroupTableProps) {
  const visibleTasks = group.tasks.filter((t) => !completedIds.has(t.id))
  if (visibleTasks.length === 0) return null

  return (
    <div className="mb-4">
      <h3 className="text-xl font-semibold text-zinc-300 border-b border-zinc-700 pb-1 mb-1">
        {group.roomName}
      </h3>
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-700 hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-zinc-500 py-1 h-7">Title</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-zinc-500 py-1 h-7 whitespace-nowrap">Phase / Day</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-zinc-500 py-1 h-7 whitespace-nowrap">Assigned To</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-zinc-500 py-1 h-7 w-12 text-center">Done</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              userId={userId}
              onCompleted={onCompleted}
              isOverdue={isOverdue}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  title: string
  count: number
  headingClass: string
  groups: Array<{ roomName: string; tasks: CultivationTask[] }>
  emptyMessage: string
  emptyClass: string
  userId: string
  completedIds: Set<string>
  onCompleted: (taskId: string) => void
  isOverdue: boolean
}

function TaskColumn({
  title,
  count,
  headingClass,
  groups,
  emptyMessage,
  emptyClass,
  userId,
  completedIds,
  onCompleted,
  isOverdue,
}: ColumnProps) {
  const allTaskCount = groups.reduce((n, g) => {
    return n + g.tasks.filter((t) => !completedIds.has(t.id)).length
  }, 0)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column heading */}
      <div className={`rounded-lg border px-5 py-3 mb-4 ${headingClass}`}>
        <h2 className="text-2xl font-bold tracking-tight">
          {title} ({count})
        </h2>
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pr-1">
        {allTaskCount === 0 ? (
          <p className={`text-lg ${emptyClass}`}>{emptyMessage}</p>
        ) : (
          groups.map((group) => (
            <RoomGroupTable
              key={group.roomName}
              group={group}
              userId={userId}
              completedIds={completedIds}
              onCompleted={onCompleted}
              isOverdue={isOverdue}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CultivationTasksDisplayPage() {
  const router = useRouter()
  const [overdueTasks, setOverdueTasks] = useState<CultivationTask[]>([])
  const [todayTasks, setTodayTasks] = useState<CultivationTask[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // UX-only auth redirect — display pages are read-only; gate with localStorage
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('crm-user') : null
    if (!stored) {
      router.replace('/login?next=/cultivation-display/tasks')
      return
    }
    try {
      const parsed = JSON.parse(stored)
      setUserId(parsed.id ?? '')
    } catch {
      // malformed — ignore, completeTask will fail server-side
    }
  }, [router])

  const fetchTasks = useCallback(async () => {
    try {
      const todayStr = getTodayStr()
      const result = await getCultivationTasksForDisplay(todayStr)
      if (result.data) {
        const tasks = result.data as CultivationTask[]
        setOverdueTasks(tasks.filter((t) => t.due_date < todayStr))
        setTodayTasks(tasks.filter((t) => t.due_date === todayStr))
        setLastUpdated(new Date())
        // Clear optimistic completions — server is now source of truth
        setCompletedIds(new Set())
      }
    } catch (err) {
      console.error('[cultivation-display/tasks] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Auto-refresh via chained setTimeout (mirrors packaging board pattern)
  useEffect(() => {
    function schedule() {
      refreshTimerRef.current = setTimeout(() => {
        fetchTasks().then(schedule)
      }, REFRESH_INTERVAL)
    }
    schedule()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [fetchTasks])

  // Listen for revert events (action failure) — trigger immediate refetch
  useEffect(() => {
    function handleRevert() {
      fetchTasks()
    }
    window.addEventListener('cultivation-task-revert', handleRevert)
    return () => window.removeEventListener('cultivation-task-revert', handleRevert)
  }, [fetchTasks])

  function handleCompleted(taskId: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev)
      next.add(taskId)
      return next
    })
  }

  const overdueGroups = groupByRoom(overdueTasks)
  const todayGroups = groupByRoom(todayTasks)

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-zinc-400 text-lg">
        Loading tasks...
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col text-lg">
      {/* Page header */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Cultivation Tasks
        </h1>
        <span className="text-base text-zinc-500">
          {format(new Date(), 'EEEE, MMMM d')}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-6 px-6 pb-12">
        <TaskColumn
          title="Overdue"
          count={overdueTasks.length}
          headingClass="bg-red-900/40 border-red-600"
          groups={overdueGroups}
          emptyMessage="No overdue tasks"
          emptyClass="text-green-400"
          userId={userId}
          completedIds={completedIds}
          onCompleted={handleCompleted}
          isOverdue={true}
        />
        <TaskColumn
          title="Today"
          count={todayTasks.length}
          headingClass="bg-amber-900/40 border-amber-500"
          groups={todayGroups}
          emptyMessage="All caught up for today"
          emptyClass="text-zinc-400"
          userId={userId}
          completedIds={completedIds}
          onCompleted={handleCompleted}
          isOverdue={false}
        />
      </div>

      {/* Last updated footer */}
      {lastUpdated && (
        <div className="fixed bottom-4 right-6 text-base text-zinc-500">
          Updated {format(lastUpdated, 'h:mm a')}
        </div>
      )}
    </div>
  )
}

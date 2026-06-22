'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { getCultivationTasksForDisplay } from '@/actions/cultivation'
import { KioskTaskCard } from '@/components/cultivation/kiosk-task-card'
import type { CultivationTask } from '@/types/cultivation'

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

  // Named room groups first (sorted by room_number via room name)
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

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  title: string
  count: number
  headingClass: string
  groups: Array<{ roomName: string; tasks: CultivationTask[] }>
  emptyMessage: string
  emptyClass: string
}

function TaskColumn({ title, count, headingClass, groups, emptyMessage, emptyClass }: ColumnProps) {
  const allTasks = groups.flatMap((g) => g.tasks)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column heading */}
      <div
        className={`rounded-lg border px-5 py-3 mb-4 ${headingClass}`}
      >
        <h2 className="text-2xl font-bold tracking-tight">
          {title} ({count})
        </h2>
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-6 pr-1">
        {allTasks.length === 0 ? (
          <p className={`text-lg ${emptyClass}`}>{emptyMessage}</p>
        ) : (
          groups.map((group) => (
            <div key={group.roomName} className="space-y-3">
              <h3 className="text-2xl font-semibold text-zinc-300 border-b border-zinc-700 pb-1">
                {group.roomName}
              </h3>
              {group.tasks.map((task) => (
                <KioskTaskCard key={task.id} task={task} />
              ))}
            </div>
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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // UX-only auth redirect — display pages are read-only; gate with localStorage
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('crm-user') : null
    if (!stored) {
      router.replace('/login?next=/cultivation-display/tasks')
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
        />
        <TaskColumn
          title="Today"
          count={todayTasks.length}
          headingClass="bg-amber-900/40 border-amber-500"
          groups={todayGroups}
          emptyMessage="All caught up for today"
          emptyClass="text-zinc-400"
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

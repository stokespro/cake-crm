'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sprout, Clock, CheckCircle, AlertTriangle, CalendarDays, Settings, Home, CheckSquare, MessageSquare } from 'lucide-react'
import { format, isToday, isPast, startOfWeek, endOfWeek, differenceInCalendarDays } from 'date-fns'
import { useAuth, canManageCultivation, canCompleteCultivation } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { GrowRoom, PHASE_CONFIG, GrowPhase, CultivationTask, TaskPriority } from '@/types/cultivation'
import { TaskCompletionSheet } from '@/components/cultivation/task-completion-sheet'
import { generateRecurringTasks } from '@/lib/cultivation/generate-recurring-tasks'

interface TaskStats {
  overdue: number
  dueToday: number
  completedToday: number
  upcomingThisWeek: number
}

interface RoomTaskCounts {
  [roomId: string]: { pending: number; overdue: number }
}

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-400 text-white',
}

const PHASE_BADGE_CLASSES: Record<GrowPhase, string> = {
  empty: 'bg-gray-500 text-white',
  dome: 'bg-teal-600 text-white',
  veg: 'bg-green-600 text-white',
  flower: 'bg-purple-600 text-white',
  harvest: 'bg-amber-600 text-white',
  drying_curing: 'bg-orange-600 text-white',
}

function getWeekProgress(room: GrowRoom): { current: number; total: number } | null {
  const phase = room.current_phase
  if (phase === 'empty' || !room.phase_start_date) return null
  const config = PHASE_CONFIG[phase]
  if (!config || config.weeks === 0) return null
  const daysSinceStart = differenceInCalendarDays(new Date(), new Date(room.phase_start_date))
  const currentWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, config.weeks)
  return { current: Math.max(currentWeek, 1), total: config.weeks }
}

function getPairingLabel(room: GrowRoom, rooms: GrowRoom[]): string | null {
  if (!room.pairing_group) return null
  const paired = rooms.find(
    (r) => r.pairing_group === room.pairing_group && r.id !== room.id
  )
  if (!paired) return null
  return `Paired with ${paired.room_name}`
}

export default function CultivationPage() {
  const { user } = useAuth()
  const [rooms, setRooms] = useState<GrowRoom[]>([])
  const [taskStats, setTaskStats] = useState<TaskStats>({
    overdue: 0,
    dueToday: 0,
    completedToday: 0,
    upcomingThisWeek: 0,
  })
  const [myTodayTasks, setMyTodayTasks] = useState<CultivationTask[]>([])
  const [roomTaskCounts, setRoomTaskCounts] = useState<RoomTaskCounts>({})
  const [completionTask, setCompletionTask] = useState<CultivationTask | null>(null)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const canComplete = user ? canCompleteCultivation(user.role) : false

  async function fetchData() {
    const supabase = createClient()

    // Generate any pending recurring task instances
    await generateRecurringTasks()

    const [roomsRes, tasksRes, myTasksRes] = await Promise.all([
      supabase.from('grow_rooms').select('*').order('room_number'),
      supabase
        .from('cultivation_tasks')
        .select('id, status, due_date, completed_at, room_id')
        .or('frequency.is.null,recurring_parent_id.not.is.null'),
      user
        ? supabase
            .from('cultivation_tasks')
            .select(
              '*, room:grow_rooms(id, room_name, room_number), assigned_user:users!cultivation_tasks_assigned_to_fkey(id, name)'
            )
            .eq('assigned_to', user.id)
            .in('status', ['pending', 'in_progress'])
            .or('frequency.is.null,recurring_parent_id.not.is.null')
            .lte('due_date', format(new Date(), 'yyyy-MM-dd'))
            .order('due_date')
            .limit(10)
        : Promise.resolve({ data: [] }),
    ])

    if (roomsRes.data) {
      setRooms(roomsRes.data as GrowRoom[])
    }

    if (myTasksRes.data) {
      setMyTodayTasks(myTasksRes.data as CultivationTask[])
    }

    if (tasksRes.data) {
      const today = new Date()
      const todayStr = format(today, 'yyyy-MM-dd')
      const weekStart = startOfWeek(today, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

      let overdue = 0
      let dueToday = 0
      let completedToday = 0
      let upcomingThisWeek = 0
      const counts: RoomTaskCounts = {}

      for (const task of tasksRes.data) {
        const dueDate = new Date(task.due_date)
        const isActive = task.status === 'pending' || task.status === 'in_progress'
        const isTaskOverdue = isActive && task.due_date < todayStr

        if (
          task.status === 'completed' &&
          task.completed_at &&
          isToday(new Date(task.completed_at))
        ) {
          completedToday++
        }

        if (isActive && isPast(dueDate) && task.due_date < todayStr) {
          overdue++
        }

        if (isActive && task.due_date === todayStr) {
          dueToday++
        }

        if (
          isActive &&
          dueDate >= weekStart &&
          dueDate <= weekEnd &&
          task.due_date > todayStr
        ) {
          upcomingThisWeek++
        }

        // Room task counts
        if (task.room_id && isActive) {
          if (!counts[task.room_id]) {
            counts[task.room_id] = { pending: 0, overdue: 0 }
          }
          counts[task.room_id].pending++
          if (isTaskOverdue) {
            counts[task.room_id].overdue++
          }
        }
      }

      setTaskStats({ overdue, dueToday, completedToday, upcomingThisWeek })
      setRoomTaskCounts(counts)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading cultivation data...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sprout className="h-6 w-6" />
            Cultivation
          </h1>
          <p className="text-muted-foreground">
            Grow room management and task tracking
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            <span>Slack bot active in #grow channel</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/cultivation/tasks">
            <Button variant="outline">
              <CheckSquare className="h-4 w-4 mr-2" />
              View Tasks
            </Button>
          </Link>
          <Link href="/dashboard/cultivation/rooms">
            <Button variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Manage Rooms
            </Button>
          </Link>
          {user && canManageCultivation(user.role) && (
            <Link href="/dashboard/cultivation/templates">
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Manage Templates
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Task Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${taskStats.overdue > 0 ? 'text-red-600' : ''}`}>
              {taskStats.overdue}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.dueToday}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.completedToday}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Upcoming This Week</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.upcomingThisWeek}</div>
          </CardContent>
        </Card>
      </div>

      {/* My Tasks Today */}
      {myTodayTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Your Tasks Today</CardTitle>
              <Link href="/dashboard/cultivation/tasks">
                <Button variant="link" size="sm" className="text-xs px-0">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myTodayTasks.map((task) => {
                const todayStr = format(new Date(), 'yyyy-MM-dd')
                const taskOverdue = task.due_date < todayStr
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 p-2 rounded-md border ${taskOverdue ? 'border-red-500/50 bg-red-500/5' : 'border-border'}`}
                  >
                    {/* Complete button */}
                    {canComplete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Mark complete"
                        onClick={() => {
                          setCompletionTask(task)
                          setCompletionOpen(true)
                        }}
                      >
                        <CheckCircle className="h-4 w-4 text-muted-foreground hover:text-green-500" />
                      </Button>
                    )}

                    {/* Task info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {task.room?.room_name && <span>{task.room.room_name}</span>}
                        {taskOverdue && (
                          <span className="text-red-600 font-medium">Overdue</span>
                        )}
                      </div>
                    </div>

                    {/* Priority badge */}
                    <Badge className={`${PRIORITY_BADGE[task.priority]} shrink-0 text-[10px] px-1.5`}>
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room Overview Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Grow Rooms</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => {
            const weekProgress = getWeekProgress(room)
            const pairingLabel = getPairingLabel(room, rooms)
            const phaseConfig = PHASE_CONFIG[room.current_phase]

            const roomCounts = roomTaskCounts[room.id]

            return (
              <Link key={room.id} href="/dashboard/cultivation/rooms">
              <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{room.room_name}</CardTitle>
                    <Badge className={PHASE_BADGE_CLASSES[room.current_phase]}>
                      {phaseConfig.label}
                    </Badge>
                  </div>
                  {pairingLabel && (
                    <p className="text-xs text-muted-foreground">{pairingLabel}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Week progress */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        {weekProgress
                          ? `Week ${weekProgress.current} of ${weekProgress.total}`
                          : '\u2014'}
                      </span>
                    </div>
                    {weekProgress ? (
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${PHASE_BADGE_CLASSES[room.current_phase].split(' ')[0]}`}
                          style={{
                            width: `${Math.min((weekProgress.current / weekProgress.total) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-2 w-full rounded-full bg-muted" />
                    )}

                    {/* Task counts */}
                    {roomCounts && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {roomCounts.pending} pending
                        {roomCounts.overdue > 0 && (
                          <span className="text-red-600"> / {roomCounts.overdue} overdue</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Phase start date */}
                  {room.phase_start_date && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Started</span>
                      <span>{format(new Date(room.phase_start_date), 'MMM d, yyyy')}</span>
                    </div>
                  )}

                  {/* Notes */}
                  {room.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {room.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Completion Sheet for quick complete */}
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
    </div>
  )
}

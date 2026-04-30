'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sprout, Clock, CheckCircle, AlertTriangle, CalendarDays } from 'lucide-react'
import { format, isToday, isPast, startOfWeek, endOfWeek, differenceInCalendarDays } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { GrowRoom, PHASE_CONFIG, GrowPhase } from '@/types/cultivation'

interface TaskStats {
  overdue: number
  dueToday: number
  completedToday: number
  upcomingThisWeek: number
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const [roomsRes, tasksRes] = await Promise.all([
        supabase.from('grow_rooms').select('*').order('room_number'),
        supabase
          .from('cultivation_tasks')
          .select('id, status, due_date, completed_at'),
      ])

      if (roomsRes.data) {
        setRooms(roomsRes.data as GrowRoom[])
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

        for (const task of tasksRes.data) {
          const dueDate = new Date(task.due_date)

          if (
            task.status === 'completed' &&
            task.completed_at &&
            isToday(new Date(task.completed_at))
          ) {
            completedToday++
          }

          if (
            (task.status === 'pending' || task.status === 'in_progress') &&
            isPast(dueDate) &&
            task.due_date < todayStr
          ) {
            overdue++
          }

          if (
            (task.status === 'pending' || task.status === 'in_progress') &&
            task.due_date === todayStr
          ) {
            dueToday++
          }

          if (
            (task.status === 'pending' || task.status === 'in_progress') &&
            dueDate >= weekStart &&
            dueDate <= weekEnd &&
            task.due_date > todayStr
          ) {
            upcomingThisWeek++
          }
        }

        setTaskStats({ overdue, dueToday, completedToday, upcomingThisWeek })
      }

      setLoading(false)
    }

    fetchData()
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sprout className="h-6 w-6" />
          Cultivation
        </h1>
        <p className="text-muted-foreground">
          Grow room management and task tracking
        </p>
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

      {/* Room Overview Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Grow Rooms</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => {
            const weekProgress = getWeekProgress(room)
            const pairingLabel = getPairingLabel(room, rooms)
            const phaseConfig = PHASE_CONFIG[room.current_phase]

            return (
              <Card key={room.id}>
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
            )
          })}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { GrowRoom, GrowPhase, PHASE_CONFIG, CycleStatus } from '@/types/cultivation'
import { format } from 'date-fns'

const PHASE_BADGE_CLASSES: Record<GrowPhase, string> = {
  empty: 'bg-gray-500 text-white',
  dome: 'bg-teal-600 text-white',
  veg: 'bg-green-600 text-white',
  flower: 'bg-purple-600 text-white',
  harvest: 'bg-amber-600 text-white',
  drying_curing: 'bg-orange-600 text-white',
}

const STATUS_BADGE_CLASSES: Record<CycleStatus, string> = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

interface CycleWithRelations {
  id: string
  phase: string
  start_date: string
  expected_end_date: string | null
  actual_end_date: string | null
  status: CycleStatus
  notes: string | null
  template: { name: string } | null
  tasks: { id: string; status: string }[]
}

interface RoomHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: GrowRoom | null
}

export function RoomHistorySheet({
  open,
  onOpenChange,
  room,
}: RoomHistorySheetProps) {
  const [cycles, setCycles] = useState<CycleWithRelations[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !room) {
      setCycles([])
      return
    }

    async function fetchHistory() {
      setLoading(true)
      const supabase = createClient()

      const { data, error } = await supabase
        .from('room_cycles')
        .select(
          '*, template:cycle_templates(name), tasks:cultivation_tasks(id, status)'
        )
        .eq('room_id', room!.id)
        .order('start_date', { ascending: false })

      if (error) {
        console.error('Failed to load cycle history:', error)
      } else if (data) {
        setCycles(data as unknown as CycleWithRelations[])
      }

      setLoading(false)
    }

    fetchHistory()
  }, [open, room])

  if (!room) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{room.room_name} — Cycle History</SheetTitle>
          <SheetDescription>
            Past and current growth cycles for this room.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          )}

          {!loading && cycles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No cycles recorded for this room yet.
            </p>
          )}

          {cycles.map((cycle) => {
            const phase = cycle.phase as GrowPhase
            const phaseConfig = PHASE_CONFIG[phase]
            const completedTasks = cycle.tasks.filter(
              (t) => t.status === 'completed'
            ).length
            const totalTasks = cycle.tasks.length
            const endDate = cycle.actual_end_date || cycle.expected_end_date

            return (
              <div
                key={cycle.id}
                className="rounded-lg border p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Badge className={PHASE_BADGE_CLASSES[phase] || 'bg-gray-500 text-white'}>
                    {phaseConfig?.label || phase}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={STATUS_BADGE_CLASSES[cycle.status]}
                  >
                    {cycle.status}
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground">
                  {format(new Date(cycle.start_date), 'MMM d, yyyy')}
                  {endDate && (
                    <>
                      {' '}
                      &rarr;{' '}
                      {format(new Date(endDate), 'MMM d, yyyy')}
                    </>
                  )}
                </div>

                {cycle.template && (
                  <p className="text-xs text-muted-foreground">
                    Template: {cycle.template.name}
                  </p>
                )}

                {totalTasks > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tasks: {completedTasks}/{totalTasks} completed
                  </p>
                )}

                {cycle.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {cycle.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

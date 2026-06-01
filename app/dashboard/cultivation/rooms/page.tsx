'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, RotateCcw, History } from 'lucide-react'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/utils'
import { useAuth, canManageCultivation } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { GrowRoom, RoomCycle, PHASE_CONFIG, GrowPhase } from '@/types/cultivation'
import { FlipRoomDialog } from '@/components/cultivation/flip-room-dialog'
import { RoomHistorySheet } from '@/components/cultivation/room-history-sheet'

const PHASE_BADGE_CLASSES: Record<GrowPhase, string> = {
  empty: 'bg-gray-500 text-white',
  dome: 'bg-teal-600 text-white',
  veg: 'bg-green-600 text-white',
  flower: 'bg-purple-600 text-white',
  harvest: 'bg-amber-600 text-white',
  drying_curing: 'bg-orange-600 text-white',
}

function getDayProgress(room: GrowRoom, activeCycle: RoomCycle | undefined): { current: number; total: number } | null {
  const phase = room.current_phase
  if (phase === 'empty' || !room.phase_start_date) return null
  if (!activeCycle?.start_date || !activeCycle?.expected_end_date) return null
  const startDate = parseLocalDate(activeCycle.start_date)
  const endDate = parseLocalDate(activeCycle.expected_end_date)
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  if (totalDays <= 0) return null
  const currentDay = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return { current: Math.max(Math.min(currentDay, totalDays), 1), total: totalDays }
}

function getPairedRoom(room: GrowRoom, rooms: GrowRoom[]): GrowRoom | null {
  if (!room.pairing_group) return null
  return rooms.find(
    (r) => r.pairing_group === room.pairing_group && r.id !== room.id
  ) || null
}

function getPairingLabel(room: GrowRoom, rooms: GrowRoom[]): string | null {
  const paired = getPairedRoom(room, rooms)
  if (!paired) return null
  return `Paired with ${paired.room_name}`
}

export default function RoomsPage() {
  const { user } = useAuth()
  const [rooms, setRooms] = useState<GrowRoom[]>([])
  const [activeCycles, setActiveCycles] = useState<Record<string, RoomCycle>>({})
  const [loading, setLoading] = useState(true)

  // Flip dialog state
  const [flipOpen, setFlipOpen] = useState(false)
  const [flipRoom, setFlipRoom] = useState<GrowRoom | null>(null)
  const [flipPairedRoom, setFlipPairedRoom] = useState<GrowRoom | null>(null)

  // History sheet state
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyRoom, setHistoryRoom] = useState<GrowRoom | null>(null)

  const fetchRooms = useCallback(async () => {
    const supabase = createClient()
    const [roomsRes, cyclesRes] = await Promise.all([
      supabase.from('grow_rooms').select('*').order('room_number'),
      supabase.from('room_cycles').select('*').eq('status', 'active'),
    ])

    if (roomsRes.data) {
      setRooms(roomsRes.data as GrowRoom[])
    }
    if (cyclesRes.data) {
      const cycleMap: Record<string, RoomCycle> = {}
      for (const cycle of cyclesRes.data as RoomCycle[]) {
        cycleMap[cycle.room_id] = cycle
      }
      setActiveCycles(cycleMap)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  function handleFlipClick(room: GrowRoom) {
    setFlipRoom(room)
    setFlipPairedRoom(getPairedRoom(room, rooms))
    setFlipOpen(true)
  }

  function handleHistoryClick(room: GrowRoom) {
    setHistoryRoom(room)
    setHistoryOpen(true)
  }

  function handleFlipped() {
    fetchRooms()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading rooms...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard/cultivation"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Cultivation
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Grow Rooms</h1>
          <p className="text-muted-foreground">
            Manage room phases and flip rooms to new cycles
          </p>
        </div>
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => {
          const dayProgress = getDayProgress(room, activeCycles[room.id])
          const pairingLabel = getPairingLabel(room, rooms)
          const phaseConfig = PHASE_CONFIG[room.current_phase]
          const isManagement = user && canManageCultivation(user.role)

          return (
            <Card key={room.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {room.room_name}
                    <span className="text-muted-foreground font-normal text-sm ml-1">
                      #{room.room_number}
                    </span>
                  </CardTitle>
                  <Badge className={PHASE_BADGE_CLASSES[room.current_phase]}>
                    {phaseConfig.label}
                  </Badge>
                </div>
                {pairingLabel && (
                  <p className="text-xs text-muted-foreground">{pairingLabel}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {room.current_phase === 'empty' ? (
                  <p className="text-sm text-muted-foreground">No active cycle</p>
                ) : (
                  <>
                    {/* Day progress */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {dayProgress
                            ? `Day ${dayProgress.current} of ${dayProgress.total}`
                            : '\u2014'}
                        </span>
                      </div>
                      {dayProgress ? (
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${PHASE_BADGE_CLASSES[room.current_phase].split(' ')[0]}`}
                            style={{
                              width: `${Math.min((dayProgress.current / dayProgress.total) * 100, 100)}%`,
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
                        <span>
                          {format(parseLocalDate(room.phase_start_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Notes */}
                {room.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {room.notes}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {isManagement && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFlipClick(room)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Flip Room
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHistoryClick(room)}
                  >
                    <History className="h-4 w-4 mr-1" />
                    History
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Flip Dialog */}
      {user && (
        <FlipRoomDialog
          open={flipOpen}
          onOpenChange={setFlipOpen}
          room={flipRoom}
          pairedRoom={flipPairedRoom}
          userId={user.id}
          onFlipped={handleFlipped}
        />
      )}

      {/* History Sheet */}
      <RoomHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        room={historyRoom}
      />
    </div>
  )
}

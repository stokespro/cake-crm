'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { ArrowLeft, Play, FastForward, History, Plus, Edit2, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuth, canManageCultivation } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { GrowRoom, RoomCycle, PHASE_CONFIG, GrowPhase, PipelineStage } from '@/types/cultivation'
import { StartCycleDialog, AdvanceStageDialog } from '@/components/cultivation/flip-room-dialog'
import { RoomHistorySheet } from '@/components/cultivation/room-history-sheet'

const PHASE_BADGE_CLASSES: Record<string, string> = {
  empty: 'bg-gray-500 text-white',
  dome: 'bg-teal-600 text-white',
  veg: 'bg-green-600 text-white',
  flower: 'bg-purple-600 text-white',
  harvest: 'bg-amber-600 text-white',
  dry: 'bg-orange-600 text-white',
  trim: 'bg-rose-600 text-white',
}

function getDayProgress(activeCycle: RoomCycle | undefined): { current: number; total: number } | null {
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

// ─── Room Admin Dialog ───

interface RoomAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: GrowRoom | null // null = add mode
  onSaved: () => void
}

function RoomAdminDialog({ open, onOpenChange, room, onSaved }: RoomAdminDialogProps) {
  const [roomNumber, setRoomNumber] = useState('')
  const [roomName, setRoomName] = useState('')
  const [pairingGroup, setPairingGroup] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!room

  useEffect(() => {
    if (room) {
      setRoomNumber(String(room.room_number))
      setRoomName(room.room_name)
      setPairingGroup(room.pairing_group || '')
      setNotes(room.notes || '')
    } else {
      setRoomNumber('')
      setRoomName('')
      setPairingGroup('')
      setNotes('')
    }
  }, [room, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roomName.trim()) {
      toast.error('Room name is required')
      return
    }
    const num = parseInt(roomNumber, 10)
    if (isNaN(num) || num < 1) {
      toast.error('Room number must be a positive number')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const payload = {
      room_number: num,
      room_name: roomName.trim(),
      pairing_group: pairingGroup.trim() || null,
      notes: notes.trim() || null,
    }

    if (isEditing) {
      const { error } = await supabase
        .from('grow_rooms')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', room.id)
      if (error) {
        toast.error('Failed to update room')
        console.error(error)
      } else {
        toast.success('Room updated')
        onOpenChange(false)
        onSaved()
      }
    } else {
      const { error } = await supabase
        .from('grow_rooms')
        .insert({ ...payload, current_phase: 'empty' })
      if (error) {
        toast.error('Failed to add room')
        console.error(error)
      } else {
        toast.success('Room added')
        onOpenChange(false)
        onSaved()
      }
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Room' : 'Add Room'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update room details.' : 'Add a new grow room.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ra-number">Room Number *</Label>
              <Input
                id="ra-number"
                type="number"
                min={1}
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-name">Room Name *</Label>
              <Input
                id="ra-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g., Flower Room 1"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ra-pairing">Pairing Group</Label>
            <Input
              id="ra-pairing"
              value={pairingGroup}
              onChange={(e) => setPairingGroup(e.target.value)}
              placeholder="e.g., A (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ra-notes">Notes</Label>
            <Textarea
              id="ra-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEditing ? 'Update' : 'Add Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───

export default function RoomsPage() {
  const { user } = useAuth()
  const [rooms, setRooms] = useState<GrowRoom[]>([])
  const [activeCyclesMap, setActiveCyclesMap] = useState<Record<string, RoomCycle[]>>({})
  const [loading, setLoading] = useState(true)

  // Start Cycle dialog
  const [startCycleOpen, setStartCycleOpen] = useState(false)
  const [startCycleRoom, setStartCycleRoom] = useState<GrowRoom | null>(null)

  // Advance Stage dialog
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [advanceRoom, setAdvanceRoom] = useState<GrowRoom | null>(null)

  // History sheet
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyRoom, setHistoryRoom] = useState<GrowRoom | null>(null)

  // Room admin
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminRoom, setAdminRoom] = useState<GrowRoom | null>(null)
  const [deleteRoomOpen, setDeleteRoomOpen] = useState(false)
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<GrowRoom | null>(null)

  const isManagement = user ? canManageCultivation(user.role) : false

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
      const map: Record<string, RoomCycle[]> = {}
      for (const cycle of cyclesRes.data as RoomCycle[]) {
        if (!map[cycle.room_id]) map[cycle.room_id] = []
        map[cycle.room_id].push(cycle)
      }
      setActiveCyclesMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  function handleStartCycle(room: GrowRoom) {
    setStartCycleRoom(room)
    setStartCycleOpen(true)
  }

  function handleAdvanceStage(room: GrowRoom) {
    setAdvanceRoom(room)
    setAdvanceOpen(true)
  }

  function handleHistory(room: GrowRoom) {
    setHistoryRoom(room)
    setHistoryOpen(true)
  }

  function handleAddRoom() {
    setAdminRoom(null)
    setAdminOpen(true)
  }

  function handleEditRoom(room: GrowRoom) {
    setAdminRoom(room)
    setAdminOpen(true)
  }

  function handleDeleteRoom(room: GrowRoom) {
    setDeleteRoomTarget(room)
    setDeleteRoomOpen(true)
  }

  async function confirmDeleteRoom() {
    if (!deleteRoomTarget) return
    const roomCycles = activeCyclesMap[deleteRoomTarget.id]
    if (roomCycles && roomCycles.length > 0) {
      toast.error('Cannot remove a room with active cycles')
      setDeleteRoomOpen(false)
      setDeleteRoomTarget(null)
      return
    }
    const supabase = createClient()
    const { error } = await supabase.from('grow_rooms').delete().eq('id', deleteRoomTarget.id)
    if (error) {
      toast.error('Failed to remove room')
      console.error(error)
    } else {
      toast.success('Room removed')
      fetchRooms()
    }
    setDeleteRoomOpen(false)
    setDeleteRoomTarget(null)
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
            Manage rooms, start cycles, and advance stages
          </p>
        </div>
        {isManagement && (
          <Button onClick={handleAddRoom}>
            <Plus className="h-4 w-4 mr-2" />
            Add Room
          </Button>
        )}
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => {
          const roomCycles = activeCyclesMap[room.id] || []
          const primaryCycle = roomCycles[0]
          const dayProgress = getDayProgress(primaryCycle)
          const pairingLabel = getPairingLabel(room, rooms)
          const phaseConfig = PHASE_CONFIG[room.current_phase]

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
                  <div className="flex items-center gap-1">
                    <Badge className={PHASE_BADGE_CLASSES[room.current_phase] || 'bg-gray-500 text-white'}>
                      {phaseConfig?.label || room.current_phase}
                    </Badge>
                    {roomCycles.length > 1 && (
                      <Badge variant="outline" className="text-xs">
                        {roomCycles.length} cycles
                      </Badge>
                    )}
                  </div>
                </div>
                {pairingLabel && (
                  <p className="text-xs text-muted-foreground">{pairingLabel}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {room.current_phase === 'empty' && roomCycles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active cycle</p>
                ) : (
                  <>
                    {/* Active cycle info */}
                    {roomCycles.map((cycle) => {
                      const progress = getDayProgress(cycle)
                      const stageConfig = PHASE_CONFIG[cycle.current_stage as GrowPhase]
                      const hasMilestones = cycle.dome_start || cycle.veg_start || cycle.flower_start || cycle.harvest_date || cycle.trim_start
                      return (
                        <div key={cycle.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {cycle.cycle_number ? `Cycle #${cycle.cycle_number}` : 'Cycle'}
                            </span>
                            <Badge className={`${PHASE_BADGE_CLASSES[cycle.current_stage] || 'bg-gray-500 text-white'} text-xs`}>
                              {stageConfig?.label || cycle.current_stage}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">
                              {progress
                                ? `Day ${progress.current} of ${progress.total}`
                                : '\u2014'}
                            </span>
                          </div>
                          {progress && (
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${PHASE_BADGE_CLASSES[cycle.current_stage]?.split(' ')[0] || 'bg-gray-500'}`}
                                style={{
                                  width: `${Math.min((progress.current / progress.total) * 100, 100)}%`,
                                }}
                              />
                            </div>
                          )}
                          {hasMilestones && (
                            <div className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                              {cycle.dome_start && <span>Dome: {format(parseLocalDate(cycle.dome_start), 'MMM d')}</span>}
                              {cycle.veg_start && <span> &rarr; Veg: {format(parseLocalDate(cycle.veg_start), 'MMM d')}</span>}
                              {cycle.flower_start && <span> &rarr; Flower: {format(parseLocalDate(cycle.flower_start), 'MMM d')}</span>}
                              {cycle.harvest_date && <span> &rarr; Harvest: {format(parseLocalDate(cycle.harvest_date), 'MMM d')}</span>}
                              {cycle.trim_start && <span> &rarr; Trim: {format(parseLocalDate(cycle.trim_start), 'MMM d')}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Phase start date */}
                    {room.phase_start_date && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stage Started</span>
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
                <div className="flex flex-wrap gap-2 pt-1">
                  {isManagement && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartCycle(room)}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start Cycle
                    </Button>
                  )}
                  {isManagement && roomCycles.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAdvanceStage(room)}
                    >
                      <FastForward className="h-4 w-4 mr-1" />
                      Advance Stage
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHistory(room)}
                  >
                    <History className="h-4 w-4 mr-1" />
                    History
                  </Button>
                  {isManagement && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRoom(room)}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDeleteRoom(room)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Start Cycle Dialog */}
      {user && (
        <StartCycleDialog
          open={startCycleOpen}
          onOpenChange={setStartCycleOpen}
          room={startCycleRoom}
          userId={user.id}
          onCompleted={fetchRooms}
        />
      )}

      {/* Advance Stage Dialog */}
      {advanceRoom && (
        <AdvanceStageDialog
          open={advanceOpen}
          onOpenChange={setAdvanceOpen}
          room={advanceRoom}
          activeCycles={activeCyclesMap[advanceRoom.id] || []}
          onCompleted={fetchRooms}
        />
      )}

      {/* History Sheet */}
      <RoomHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        room={historyRoom}
      />

      {/* Room Admin Dialog */}
      <RoomAdminDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        room={adminRoom}
        onSaved={fetchRooms}
      />

      {/* Delete Room Confirmation */}
      <AlertDialog open={deleteRoomOpen} onOpenChange={setDeleteRoomOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Room</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{deleteRoomTarget?.room_name}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRoom}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

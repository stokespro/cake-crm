'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  GrowRoom,
  GrowPhase,
  PHASE_CONFIG,
  CycleTemplate,
} from '@/types/cultivation'
import { format } from 'date-fns'

const FLIP_PHASES = (
  Object.entries(PHASE_CONFIG) as [GrowPhase, { label: string; weeks: number; color: string }][]
).filter(([key]) => key !== 'empty')

interface FlipRoomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: GrowRoom | null
  pairedRoom: GrowRoom | null
  userId: string
  onFlipped: () => void
}

export function FlipRoomDialog({
  open,
  onOpenChange,
  room,
  pairedRoom,
  userId,
  onFlipped,
}: FlipRoomDialogProps) {
  const [newPhase, setNewPhase] = useState<string>('')
  const [templateId, setTemplateId] = useState<string>('none')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [flipPaired, setFlipPaired] = useState(false)
  const [templates, setTemplates] = useState<CycleTemplate[]>([])
  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setNewPhase('')
      setTemplateId('none')
      setStartDate(format(new Date(), 'yyyy-MM-dd'))
      setNotes('')
      setFlipPaired(false)
      setTemplates([])
    }
  }, [open])

  // Fetch templates when phase changes
  useEffect(() => {
    if (!newPhase || newPhase === 'empty') {
      setTemplates([])
      setTemplateId('none')
      return
    }

    async function fetchTemplates() {
      const supabase = createClient()
      const { data } = await supabase
        .from('cycle_templates')
        .select('*')
        .eq('phase', newPhase)
        .eq('is_active', true)
        .order('name')

      if (data) {
        setTemplates(data as CycleTemplate[])
      }
      setTemplateId('none')
    }

    fetchTemplates()
  }, [newPhase])

  async function flipRoom(
    roomId: string,
    phase: GrowPhase,
    selectedTemplateId: string | null,
    date: string,
    roomNotes: string
  ): Promise<number> {
    const supabase = createClient()

    // 1. Close current cycle (if one exists)
    const { data: activeCycle } = await supabase
      .from('room_cycles')
      .select('id')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .single()

    if (activeCycle) {
      await supabase
        .from('room_cycles')
        .update({
          actual_end_date: new Date().toISOString().split('T')[0],
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeCycle.id)

      // Skip remaining pending tasks on the old cycle
      await supabase
        .from('cultivation_tasks')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('room_cycle_id', activeCycle.id)
        .eq('status', 'pending')
    }

    // 2. Update the room
    await supabase
      .from('grow_rooms')
      .update({
        current_phase: phase,
        phase_start_date: date,
        notes: roomNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)

    // 3. Create new cycle (if not setting to 'empty')
    let newCycleId: string | null = null
    if (phase !== 'empty') {
      const phaseWeeks = PHASE_CONFIG[phase]?.weeks || 0
      const startDateObj = new Date(date + 'T00:00:00')
      const expectedEnd = new Date(startDateObj)
      expectedEnd.setDate(expectedEnd.getDate() + phaseWeeks * 7)

      const { data: newCycle } = await supabase
        .from('room_cycles')
        .insert({
          room_id: roomId,
          template_id: selectedTemplateId,
          phase,
          start_date: date,
          expected_end_date: expectedEnd.toISOString().split('T')[0],
          status: 'active',
          notes: roomNotes || null,
          created_by: userId,
        })
        .select('id')
        .single()

      newCycleId = newCycle?.id || null
    }

    // 4. Auto-generate tasks from template
    let taskCount = 0
    if (selectedTemplateId && newCycleId) {
      const { data: templateTasks } = await supabase
        .from('template_tasks')
        .select('*')
        .eq('template_id', selectedTemplateId)
        .order('week_number')
        .order('sort_order')

      if (templateTasks && templateTasks.length > 0) {
        const startDateObj = new Date(date + 'T00:00:00')

        const tasksToInsert = templateTasks.map((tt) => {
          const dueDate = new Date(startDateObj)
          dueDate.setDate(dueDate.getDate() + (tt.week_number - 1) * 7)
          if (tt.day_of_week) {
            const currentDay = dueDate.getDay() || 7
            const diff = tt.day_of_week - currentDay
            dueDate.setDate(dueDate.getDate() + diff)
          }

          return {
            room_cycle_id: newCycleId,
            room_id: roomId,
            template_task_id: tt.id,
            title: tt.name,
            description: tt.description,
            task_type: 'scheduled' as const,
            phase,
            week_number: tt.week_number,
            due_date: dueDate.toISOString().split('T')[0],
            priority: tt.priority,
            estimated_minutes: tt.estimated_minutes,
            status: 'pending' as const,
            created_by: userId,
          }
        })

        await supabase.from('cultivation_tasks').insert(tasksToInsert)
        taskCount = tasksToInsert.length
      }
    }

    return taskCount
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!newPhase) {
      toast.error('Please select a phase')
      return
    }
    if (!startDate) {
      toast.error('Please select a start date')
      return
    }
    if (!room) return

    setSaving(true)

    try {
      const selectedTemplate = templateId !== 'none' ? templateId : null
      const phase = newPhase as GrowPhase

      // Flip main room
      const taskCount = await flipRoom(room.id, phase, selectedTemplate, startDate, notes)

      // Flip paired room if requested
      let pairedTaskCount = 0
      if (flipPaired && pairedRoom) {
        pairedTaskCount = await flipRoom(
          pairedRoom.id,
          phase,
          selectedTemplate,
          startDate,
          notes
        )
      }

      const totalTasks = taskCount + pairedTaskCount
      const phaseLabel = PHASE_CONFIG[phase]?.label || phase
      const roomLabel = flipPaired && pairedRoom
        ? `${room.room_name} & ${pairedRoom.room_name}`
        : room.room_name

      toast.success(
        `${roomLabel} flipped to ${phaseLabel}. ${totalTasks} task${totalTasks !== 1 ? 's' : ''} generated.`
      )

      onOpenChange(false)
      onFlipped()
    } catch (err) {
      console.error('Flip failed:', err)
      toast.error('Failed to flip room. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!room) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flip {room.room_name}</DialogTitle>
          <DialogDescription>
            Change the growth phase for this room. Any active cycle will be
            completed and pending tasks will be skipped.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flip-phase">New Phase *</Label>
            <Select value={newPhase} onValueChange={setNewPhase}>
              <SelectTrigger id="flip-phase">
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                {FLIP_PHASES.map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label} ({config.weeks} weeks)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flip-template">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="flip-template">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newPhase && templates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No templates available for this phase — tasks won&apos;t be
                auto-generated.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="flip-date">Start Date *</Label>
            <Input
              id="flip-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="flip-notes">Notes</Label>
            <Textarea
              id="flip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional cycle notes..."
              rows={3}
            />
          </div>

          {pairedRoom && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="flip-paired"
                checked={flipPaired}
                onCheckedChange={(checked) => setFlipPaired(checked === true)}
              />
              <Label htmlFor="flip-paired" className="text-sm font-normal">
                Also flip paired room ({pairedRoom.room_name})?
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !newPhase}>
              {saving ? 'Flipping...' : 'Flip Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

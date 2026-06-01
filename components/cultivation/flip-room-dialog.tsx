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
  CycleTemplate,
  RoomCycle,
  STAGE_ORDER,
  PHASE_CONFIG,
  PipelineStage,
} from '@/types/cultivation'
import { format } from 'date-fns'

// ─── Start Cycle Dialog ───

interface StartCycleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: GrowRoom | null
  userId: string
  onCompleted: () => void
}

export function StartCycleDialog({
  open,
  onOpenChange,
  room,
  userId,
  onCompleted,
}: StartCycleDialogProps) {
  const [templateId, setTemplateId] = useState<string>('none')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [cycleNumber, setCycleNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [templates, setTemplates] = useState<CycleTemplate[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !room) return
    setTemplateId('none')
    setStartDate(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')

    async function init() {
      const supabase = createClient()

      // Fetch master templates
      const { data: tplData } = await supabase
        .from('cycle_templates')
        .select('*')
        .eq('template_type', 'master')
        .eq('is_active', true)
        .order('name')

      if (tplData) setTemplates(tplData as CycleTemplate[])

      // Auto-increment cycle_number
      const { data: lastCycle } = await supabase
        .from('room_cycles')
        .select('cycle_number')
        .eq('room_id', room!.id)
        .not('cycle_number', 'is', null)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .single()

      const nextNum = lastCycle?.cycle_number ? lastCycle.cycle_number + 1 : 1
      setCycleNumber(String(nextNum))
    }

    init()
  }, [open, room])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!room) return

    if (templateId === 'none') {
      toast.error('Please select a master template')
      return
    }
    if (!startDate) {
      toast.error('Please select a start date')
      return
    }

    setSaving(true)
    const supabase = createClient()

    try {
      const selectedTemplate = templates.find((t) => t.id === templateId)
      if (!selectedTemplate) throw new Error('Template not found')

      const durationDays = selectedTemplate.duration_days || 127
      const startDateObj = new Date(startDate + 'T00:00:00')
      const expectedEnd = new Date(startDateObj)
      expectedEnd.setDate(expectedEnd.getDate() + durationDays)
      const expectedEndDate = expectedEnd.toISOString().split('T')[0]

      const cycleNum = parseInt(cycleNumber, 10) || null

      // 1. Create room_cycles with current_stage = 'clone'
      const { data: newCycle, error: cycleErr } = await supabase
        .from('room_cycles')
        .insert({
          room_id: room.id,
          template_id: templateId,
          current_stage: 'clone',
          cycle_number: cycleNum,
          start_date: startDate,
          expected_end_date: expectedEndDate,
          status: 'active',
          notes: notes.trim() || null,
          created_by: userId,
        })
        .select('id')
        .single()

      if (cycleErr || !newCycle) throw cycleErr || new Error('Failed to create cycle')

      // 2. Update grow_rooms
      await supabase
        .from('grow_rooms')
        .update({
          current_phase: 'clone',
          phase_start_date: startDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', room.id)

      // 3. Generate ALL tasks from the master template
      const { data: templateTasks } = await supabase
        .from('template_tasks')
        .select('*')
        .eq('template_id', templateId)
        .order('day_number')
        .order('sort_order')

      let taskCount = 0
      if (templateTasks && templateTasks.length > 0) {
        const tasksToInsert = templateTasks.map((tt) => {
          const dueDate = new Date(startDateObj)
          dueDate.setDate(dueDate.getDate() + (tt.day_number - 1))
          return {
            room_cycle_id: newCycle.id,
            room_id: room.id,
            template_task_id: tt.id,
            title: tt.name,
            description: tt.description,
            task_type: 'scheduled' as const,
            phase: tt.stage, // stage from template_task becomes phase on cultivation_task
            day_number: tt.day_number,
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

      toast.success(
        `Cycle #${cycleNum || '?'} started for ${room.room_name}. ${taskCount} tasks generated.`
      )
      onOpenChange(false)
      onCompleted()
    } catch (err) {
      console.error('Start cycle failed:', err)
      toast.error('Failed to start cycle. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!room) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Cycle — {room.room_name}</DialogTitle>
          <DialogDescription>
            Begin a new master cycle. All pipeline tasks will be generated from
            the selected template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sc-template">Master Template *</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="sc-template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{' '}
                    {t.duration_days ? `(${t.duration_days}d)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active master templates found. Create one in Templates first.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sc-date">Start Date *</Label>
              <Input
                id="sc-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-cycle-num">Cycle #</Label>
              <Input
                id="sc-cycle-num"
                type="number"
                min={1}
                value={cycleNumber}
                onChange={(e) => setCycleNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sc-notes">Notes</Label>
            <Textarea
              id="sc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional cycle notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || templateId === 'none'}>
              {saving ? 'Starting...' : 'Start Cycle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Advance Stage Dialog ───

interface AdvanceStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: GrowRoom | null
  activeCycles: RoomCycle[]
  onCompleted: () => void
}

export function AdvanceStageDialog({
  open,
  onOpenChange,
  room,
  activeCycles,
  onCompleted,
}: AdvanceStageDialogProps) {
  const [selectedCycleId, setSelectedCycleId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && activeCycles.length > 0) {
      setSelectedCycleId(activeCycles[0].id)
    }
  }, [open, activeCycles])

  const selectedCycle = activeCycles.find((c) => c.id === selectedCycleId)
  const currentStageIndex = selectedCycle
    ? STAGE_ORDER.indexOf(selectedCycle.current_stage as PipelineStage)
    : -1
  const nextStage: PipelineStage | null =
    currentStageIndex >= 0 && currentStageIndex < STAGE_ORDER.length - 1
      ? STAGE_ORDER[currentStageIndex + 1]
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!room || !selectedCycle || !nextStage) return

    setSaving(true)
    const supabase = createClient()

    try {
      const today = format(new Date(), 'yyyy-MM-dd')

      // Update room_cycles.current_stage
      await supabase
        .from('room_cycles')
        .update({
          current_stage: nextStage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCycle.id)

      // Update grow_rooms.current_phase and phase_start_date
      await supabase
        .from('grow_rooms')
        .update({
          current_phase: nextStage,
          phase_start_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', room.id)

      const stageLabel = PHASE_CONFIG[nextStage]?.label || nextStage
      toast.success(`${room.room_name} advanced to ${stageLabel}`)
      onOpenChange(false)
      onCompleted()
    } catch (err) {
      console.error('Advance stage failed:', err)
      toast.error('Failed to advance stage.')
    } finally {
      setSaving(false)
    }
  }

  if (!room) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Advance Stage — {room.room_name}</DialogTitle>
          <DialogDescription>
            Move an active cycle to the next stage in the pipeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeCycles.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="as-cycle">Select Cycle</Label>
              <Select value={selectedCycleId} onValueChange={setSelectedCycleId}>
                <SelectTrigger id="as-cycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeCycles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Cycle #{c.cycle_number || '?'} — {PHASE_CONFIG[c.current_stage as PipelineStage]?.label || c.current_stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedCycle && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Stage</span>
                <span className="font-medium">
                  {PHASE_CONFIG[selectedCycle.current_stage as PipelineStage]?.label || selectedCycle.current_stage}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Next Stage</span>
                <span className="font-medium">
                  {nextStage
                    ? PHASE_CONFIG[nextStage]?.label || nextStage
                    : 'End of pipeline'}
                </span>
              </div>
              {selectedCycle.cycle_number && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cycle #</span>
                  <span className="font-medium">{selectedCycle.cycle_number}</span>
                </div>
              )}
            </div>
          )}

          {!nextStage && selectedCycle && (
            <p className="text-sm text-amber-600">
              This cycle is at the final stage ({PHASE_CONFIG[selectedCycle.current_stage as PipelineStage]?.label}). No further stages to advance to.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !nextStage}>
              {saving ? 'Advancing...' : 'Advance Stage'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

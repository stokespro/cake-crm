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
import {
  GrowRoom,
  CycleTemplate,
  RoomCycle,
  STAGE_ORDER,
  PHASE_CONFIG,
  PipelineStage,
} from '@/types/cultivation'
import { format, addDays } from 'date-fns'
import {
  getActiveMasterTemplates,
  getLastCycleNumber,
  startCycle,
  advanceStage,
} from '@/actions/cultivation'

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
  const [domeStart, setDomeStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [vegStart, setVegStart] = useState('')
  const [flowerStart, setFlowerStart] = useState('')
  const [harvestDate, setHarvestDate] = useState('')
  const [dryStart, setDryStart] = useState('')
  const [trimStart, setTrimStart] = useState('')
  const [cycleNumber, setCycleNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [templates, setTemplates] = useState<CycleTemplate[]>([])
  const [saving, setSaving] = useState(false)

  // Auto-suggest milestone dates when dome start changes
  function suggestMilestones(dome: string) {
    if (!dome) return
    const d = new Date(dome + 'T00:00:00')
    const veg = addDays(d, 28)
    const flower = addDays(veg, 30)
    const harvest = addDays(flower, 62)
    const dry = harvest // dry starts on harvest day
    const trim = addDays(harvest, 7)
    setVegStart(format(veg, 'yyyy-MM-dd'))
    setFlowerStart(format(flower, 'yyyy-MM-dd'))
    setHarvestDate(format(harvest, 'yyyy-MM-dd'))
    setDryStart(format(dry, 'yyyy-MM-dd'))
    setTrimStart(format(trim, 'yyyy-MM-dd'))
  }

  function handleDomeStartChange(value: string) {
    setDomeStart(value)
    suggestMilestones(value)
  }

  useEffect(() => {
    if (!open || !room) return
    setTemplateId('none')
    const today = format(new Date(), 'yyyy-MM-dd')
    setDomeStart(today)
    suggestMilestones(today)
    setNotes('')

    async function init() {
      // Fetch master templates
      const tplResult = await getActiveMasterTemplates()
      if (tplResult.data) setTemplates(tplResult.data)

      // Auto-increment cycle_number
      const cycleNumResult = await getLastCycleNumber(room!.id)
      const nextNum = cycleNumResult.data ? cycleNumResult.data + 1 : 1
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
    if (!domeStart) {
      toast.error('Please enter a Dome Start date')
      return
    }
    if (!vegStart || !flowerStart || !harvestDate || !dryStart || !trimStart) {
      toast.error('All milestone dates are required')
      return
    }

    setSaving(true)
    try {
      const cycleNum = parseInt(cycleNumber, 10) || null

      const result = await startCycle({
        roomId: room.id,
        templateId,
        cycleNumber: cycleNum,
        domeStart,
        vegStart,
        flowerStart,
        harvestDate,
        dryStart,
        trimStart,
        notes: notes.trim() || null,
        userId,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
      } else if ('taskCount' in result) {
        toast.success(
          `Cycle #${result.cycleNum || '?'} started for ${room.room_name}. ${result.taskCount} tasks generated.`
        )
        onOpenChange(false)
        onCompleted()
      }
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

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Milestone Dates</Label>
            <p className="text-xs text-muted-foreground">
              Set Dome Start to auto-suggest the rest. Override any date as needed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sc-dome" className="text-xs">Dome Start (clone cut) *</Label>
              <Input
                id="sc-dome"
                type="date"
                value={domeStart}
                onChange={(e) => handleDomeStartChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-veg" className="text-xs">Veg Start (transplant) *</Label>
              <Input
                id="sc-veg"
                type="date"
                value={vegStart}
                onChange={(e) => setVegStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-flower" className="text-xs">Flower Start (flip) *</Label>
              <Input
                id="sc-flower"
                type="date"
                value={flowerStart}
                onChange={(e) => setFlowerStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-harvest" className="text-xs">Harvest Date *</Label>
              <Input
                id="sc-harvest"
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-dry" className="text-xs">Dry Start *</Label>
              <Input
                id="sc-dry"
                type="date"
                value={dryStart}
                onChange={(e) => setDryStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-trim" className="text-xs">Trim Start *</Label>
              <Input
                id="sc-trim"
                type="date"
                value={trimStart}
                onChange={(e) => setTrimStart(e.target.value)}
                required
              />
            </div>
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
    try {
      const result = await advanceStage({
        roomId: room.id,
        cycleId: selectedCycle.id,
        nextStage,
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        const stageLabel = PHASE_CONFIG[nextStage]?.label || nextStage
        toast.success(`${room.room_name} advanced to ${stageLabel}`)
        onOpenChange(false)
        onCompleted()
      }
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

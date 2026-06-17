'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { completeTask } from '@/actions/cultivation'
import type { CultivationTask } from '@/types/cultivation'

interface TaskCompletionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: CultivationTask | null
  userId: string
  onCompleted: () => void
}

export function TaskCompletionSheet({
  open,
  onOpenChange,
  task,
  userId,
  onCompleted,
}: TaskCompletionSheetProps) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!task) return

    setSaving(true)
    const result = await completeTask({
      taskId: task.id,
      completedBy: userId,
      notes: notes.trim() || null,
    })

    if (result.error) {
      toast.error(result.error)
      setSaving(false)
      return
    }

    toast.success('Task completed')
    setSaving(false)
    setNotes('')
    onOpenChange(false)
    onCompleted()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Complete Task</SheetTitle>
          <SheetDescription>
            {task?.title}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="completion-notes">Completion Notes</Label>
            <Textarea
              id="completion-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, readings, notes..."
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Optional but encouraged — record any observations or measurements.
            </p>
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Mark as Complete'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

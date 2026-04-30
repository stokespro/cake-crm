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
import { TemplateTask, TaskPriority } from '@/types/cultivation'

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any Day' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

function getDayLabel(day: number | null): string {
  if (day === null) return 'Any'
  const found = DAY_OPTIONS.find((d) => d.value === String(day))
  return found ? found.label : 'Any'
}

export { getDayLabel }

interface TemplateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  task: TemplateTask | null
  maxSortOrder: number
  defaultWeek?: number
  onSaved: () => void
}

export function TemplateTaskDialog({
  open,
  onOpenChange,
  templateId,
  task,
  maxSortOrder,
  defaultWeek,
  onSaved,
}: TemplateTaskDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [weekNumber, setWeekNumber] = useState('1')
  const [dayOfWeek, setDayOfWeek] = useState('any')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [saving, setSaving] = useState(false)

  const isEditing = !!task

  useEffect(() => {
    if (task) {
      setName(task.name)
      setDescription(task.description || '')
      setWeekNumber(String(task.week_number))
      setDayOfWeek(task.day_of_week !== null ? String(task.day_of_week) : 'any')
      setEstimatedMinutes(
        task.estimated_minutes !== null ? String(task.estimated_minutes) : ''
      )
      setPriority(task.priority)
    } else {
      setName('')
      setDescription('')
      setWeekNumber(defaultWeek ? String(defaultWeek) : '1')
      setDayOfWeek('any')
      setEstimatedMinutes('')
      setPriority('medium')
    }
  }, [task, open, defaultWeek])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Task name is required')
      return
    }

    const week = parseInt(weekNumber, 10)
    if (isNaN(week) || week < 1 || week > 12) {
      toast.error('Week must be between 1 and 12')
      return
    }

    const minutes = estimatedMinutes
      ? parseInt(estimatedMinutes, 10)
      : null
    if (estimatedMinutes && (isNaN(minutes!) || minutes! < 1)) {
      toast.error('Estimated minutes must be a positive number')
      return
    }

    setSaving(true)
    const supabase = createClient()

    const data = {
      name: name.trim(),
      description: description.trim() || null,
      week_number: week,
      day_of_week: dayOfWeek === 'any' ? null : parseInt(dayOfWeek, 10),
      estimated_minutes: minutes,
      priority,
    }

    if (isEditing) {
      const { error } = await supabase
        .from('template_tasks')
        .update(data)
        .eq('id', task.id)

      if (error) {
        toast.error('Failed to update task')
        console.error(error)
        setSaving(false)
        return
      }
      toast.success('Task updated')
    } else {
      const { error } = await supabase.from('template_tasks').insert({
        ...data,
        template_id: templateId,
        sort_order: maxSortOrder + 1,
      })

      if (error) {
        toast.error('Failed to create task')
        console.error(error)
        setSaving(false)
        return
      }
      toast.success('Task added')
    }

    setSaving(false)
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Task' : 'Add Task'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the task details.'
              : 'Add a new task to this template.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-name">Name *</Label>
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Check pH levels"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-week">Week Number *</Label>
              <Input
                id="task-week"
                type="number"
                min={1}
                max={12}
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-day">Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger id="task-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-minutes">Est. Minutes</Label>
              <Input
                id="task-minutes"
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="e.g., 30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority *</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
              >
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEditing ? 'Update' : 'Add Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

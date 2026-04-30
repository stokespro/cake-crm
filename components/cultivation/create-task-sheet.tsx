'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
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
import type { CultivationTask, GrowRoom, TaskPriority } from '@/types/cultivation'

interface UserOption {
  id: string
  name: string
}

interface CreateTaskSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: CultivationTask | null // null = create mode, non-null = edit mode
  rooms: GrowRoom[]
  users: UserOption[]
  userId: string
  onSaved: () => void
}

export function CreateTaskSheet({
  open,
  onOpenChange,
  task,
  rooms,
  users,
  userId,
  onSaved,
}: CreateTaskSheetProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [roomId, setRoomId] = useState<string>('none')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignedTo, setAssignedTo] = useState<string>('unassigned')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!task

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setRoomId(task.room_id || 'none')
      setDueDate(task.due_date)
      setPriority(task.priority)
      setAssignedTo(task.assigned_to || 'unassigned')
      setEstimatedMinutes(task.estimated_minutes?.toString() || '')
    } else {
      setTitle('')
      setDescription('')
      setRoomId('none')
      setDueDate('')
      setPriority('medium')
      setAssignedTo('unassigned')
      setEstimatedMinutes('')
    }
  }, [task, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!dueDate) {
      toast.error('Due date is required')
      return
    }

    setSaving(true)
    const supabase = createClient()

    if (isEditing) {
      const { error } = await supabase
        .from('cultivation_tasks')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          room_id: roomId === 'none' ? null : roomId,
          due_date: dueDate,
          priority,
          assigned_to: assignedTo === 'unassigned' ? null : assignedTo,
          estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id)

      if (error) {
        toast.error('Failed to update task')
        console.error(error)
        setSaving(false)
        return
      }
      toast.success('Task updated')
    } else {
      const { error } = await supabase.from('cultivation_tasks').insert({
        title: title.trim(),
        description: description.trim() || null,
        room_id: roomId === 'none' ? null : roomId,
        due_date: dueDate,
        priority,
        assigned_to: assignedTo === 'unassigned' ? null : assignedTo,
        estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
        task_type: 'adhoc',
        status: 'pending',
        created_by: userId,
      })

      if (error) {
        toast.error('Failed to create task')
        console.error(error)
        setSaving(false)
        return
      }
      toast.success('Task created')
    }

    setSaving(false)
    onOpenChange(false)
    onSaved()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Task' : 'New Task'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the task details.'
              : 'Create a new ad-hoc cultivation task.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Check pH levels in Room 1"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details about the task..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-room">Room</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger id="task-room">
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Room (facility-wide)</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.room_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due-date">Due Date *</Label>
            <Input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-priority">Priority *</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger id="task-priority">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-assignee">Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger id="task-assignee">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-estimated-minutes">Estimated Minutes</Label>
            <Input
              id="task-estimated-minutes"
              type="number"
              min="1"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="e.g., 30"
            />
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
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Task'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

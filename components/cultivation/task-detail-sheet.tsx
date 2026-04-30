'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { format, parseISO, isPast, isToday } from 'date-fns'
import {
  CheckCircle,
  Play,
  Edit2,
  Trash2,
  Clock,
  Calendar,
  User,
  Tag,
} from 'lucide-react'
import type { CultivationTask, CultivationTaskStatus, TaskPriority } from '@/types/cultivation'
import type { UserRole } from '@/lib/auth-context'
import { canManageCultivation, canCompleteCultivation } from '@/lib/auth-context'

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-400 text-white',
}

const STATUS_BADGE: Record<CultivationTaskStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-200 text-gray-800' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-500' },
}

interface TaskDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: CultivationTask | null
  userRole: UserRole
  onComplete: () => void
  onStart: () => void
  onEdit: () => void
  onDelete: () => void
}

export function TaskDetailSheet({
  open,
  onOpenChange,
  task,
  userRole,
  onComplete,
  onStart,
  onEdit,
  onDelete,
}: TaskDetailSheetProps) {
  if (!task) return null

  const dueDate = parseISO(task.due_date)
  const isOverdue =
    (task.status === 'pending' || task.status === 'in_progress') &&
    isPast(dueDate) &&
    !isToday(dueDate)

  const statusInfo = STATUS_BADGE[task.status]
  const canComplete = canCompleteCultivation(userRole)
  const canManage = canManageCultivation(userRole)
  const showComplete = canComplete && (task.status === 'pending' || task.status === 'in_progress')
  const showStart = canComplete && task.status === 'pending'

  const phaseWeekLabel =
    task.phase && task.week_number
      ? `${task.phase.charAt(0).toUpperCase() + task.phase.slice(1)} Wk ${task.week_number}`
      : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-lg leading-snug pr-4">{task.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            <Badge className={PRIORITY_BADGE[task.priority]}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </Badge>
            <Badge variant="outline">
              {task.task_type === 'scheduled' ? 'Scheduled' : 'Ad-hoc'}
            </Badge>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-3 text-sm">
            {task.room && (
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-muted-foreground">Room: </span>
                  <span className="font-medium">{task.room.room_name}</span>
                </div>
              </div>
            )}

            {phaseWeekLabel && (
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-muted-foreground">Phase: </span>
                  <span className="font-medium">{phaseWeekLabel}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="text-muted-foreground">Due: </span>
                <span className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
                  {format(dueDate, 'EEEE, MMM d, yyyy')}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="text-muted-foreground">Assigned to: </span>
                <span className="font-medium">
                  {task.assigned_user?.name || 'Unassigned'}
                </span>
              </div>
            </div>

            {task.estimated_minutes && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-muted-foreground">Estimated: </span>
                  <span className="font-medium">{task.estimated_minutes} min</span>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{task.description}</p>
              </div>
            </>
          )}

          {/* Completion info */}
          {task.status === 'completed' && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Completion Details</p>
                {task.completed_by_user && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Completed by: </span>
                    <span className="font-medium">{task.completed_by_user.name}</span>
                  </p>
                )}
                {task.completed_at && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Completed at: </span>
                    <span className="font-medium">
                      {format(parseISO(task.completed_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </p>
                )}
                {task.completion_notes && (
                  <div className="mt-2 p-3 rounded-md bg-muted text-sm whitespace-pre-wrap">
                    {task.completion_notes}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Meta */}
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Created: {format(parseISO(task.created_at), 'MMM d, yyyy h:mm a')}</p>
            {task.updated_at !== task.created_at && (
              <p>Last edited: {format(parseISO(task.updated_at), 'MMM d, yyyy h:mm a')}</p>
            )}
          </div>

          {/* Actions */}
          <Separator />
          <div className="flex flex-wrap gap-2">
            {showStart && (
              <Button variant="outline" size="sm" onClick={onStart}>
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
            )}
            {showComplete && (
              <Button size="sm" onClick={onComplete}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Mark Complete
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

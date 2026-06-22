import { Badge } from '@/components/ui/badge'
import { PRIORITY_BADGE } from '@/lib/cultivation/helpers'
import type { CultivationTask } from '@/types/cultivation'

interface KioskTaskCardProps {
  task: CultivationTask
}

export function KioskTaskCard({ task }: KioskTaskCardProps) {
  const isOverdue = task.status !== 'completed' && task.due_date < new Date().toISOString().slice(0, 10)
  const isInProgress = task.status === 'in_progress'

  const borderClass = isInProgress
    ? 'border-l-4 border-l-blue-500'
    : isOverdue
      ? 'border-l-4 border-l-red-500'
      : 'border-l-4 border-l-zinc-600'

  return (
    <div
      className={`rounded-lg bg-zinc-800 p-4 space-y-2 ${borderClass}`}
    >
      {/* Title */}
      <p className="text-xl font-semibold leading-snug">{task.title}</p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-base text-zinc-400">
        {task.room?.room_name && (
          <span className="font-medium text-zinc-300">{task.room.room_name}</span>
        )}
        {task.assigned_user?.name && (
          <span>{task.assigned_user.name}</span>
        )}
        {isInProgress && (
          <span className="text-blue-400 font-medium">In Progress</span>
        )}
        {isOverdue && !isInProgress && (
          <span className="text-red-400 font-medium">Overdue</span>
        )}
      </div>

      {/* Priority badge */}
      <div>
        <Badge className={`${PRIORITY_BADGE[task.priority]} text-base px-3 py-0.5`}>
          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
        </Badge>
      </div>
    </div>
  )
}

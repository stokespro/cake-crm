'use client'

import type { PackagingUser } from '@/lib/packaging/board-types'
import { cn } from '@/lib/utils'

interface WorkerSelectorProps {
  users: PackagingUser[]
  selectedId: string | null
  onSelect: (userId: string, userName: string) => void
}

export function WorkerSelector({ users, selectedId, onSelect }: WorkerSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Who is doing this?</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {users.map((user) => {
          const isSelected = user.id === selectedId
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelect(user.id, user.name)}
              className={cn(
                'h-14 rounded-lg border-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:border-primary/60 hover:bg-muted'
              )}
            >
              {user.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

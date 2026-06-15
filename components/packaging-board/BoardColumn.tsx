'use client'

import { Badge } from '@/components/ui/badge'
import { SkuCard } from './SkuCard'
import type { SkuBoardCard, DoneItem, PackagingUser } from '@/lib/packaging/board-types'
import type { SessionUser } from '@/lib/auth-context'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

// ============================================
// DONE ITEM ROW
// ============================================

function DoneItemRow({ item }: { item: DoneItem }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{item.sku}</span>
          <Badge
            className={cn(
              'text-[10px] px-1.5 py-0',
              item.taskType === 'FILL' ? 'bg-amber-500 text-white' : 'bg-purple-500 text-white'
            )}
          >
            {item.taskType}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.completedQuantity} units · {item.completedByName} ·{' '}
          {format(new Date(item.completedAt), 'h:mm a')}
        </p>
      </div>
      <span className="text-green-500 text-lg font-bold shrink-0">✓</span>
    </div>
  )
}

// ============================================
// BOARD COLUMN (active cards)
// ============================================

interface BoardColumnProps {
  title: string
  accentColor: 'amber' | 'purple' | 'green'
  cards?: SkuBoardCard[]
  doneItems?: DoneItem[]
  sessionUser: SessionUser | null
  users: PackagingUser[]
  onClaimClick: (card: SkuBoardCard) => void
  onRefresh: () => void
}

export function BoardColumn({
  title,
  accentColor,
  cards,
  doneItems,
  sessionUser,
  users,
  onClaimClick,
  onRefresh,
}: BoardColumnProps) {
  const count = cards ? cards.length : (doneItems?.length ?? 0)

  const accentStyles = {
    amber: 'text-amber-500',
    purple: 'text-purple-400',
    green: 'text-green-500',
  }

  const badgeStyles = {
    amber: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
    green: 'bg-green-500/20 text-green-600 dark:text-green-400',
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center gap-2">
        <h2 className={cn('font-bold text-sm uppercase tracking-wider', accentStyles[accentColor])}>
          {title}
        </h2>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-bold',
            badgeStyles[accentColor]
          )}
        >
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {cards && cards.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">All clear</p>
        )}
        {cards?.map((card) => (
          <SkuCard
            key={`${card.taskType}-${card.sku}`}
            card={card}
            sessionUser={sessionUser}
            users={users}
            onClaimClick={onClaimClick}
            onRefresh={onRefresh}
          />
        ))}

        {doneItems && doneItems.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">Nothing completed yet</p>
        )}
        {doneItems?.map((item) => (
          <DoneItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

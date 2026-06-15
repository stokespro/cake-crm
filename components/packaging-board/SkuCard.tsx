'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { releaseTask, advanceClaimed } from '@/actions/packaging-board'
import type { SkuBoardCard, PackagingUser } from '@/lib/packaging/board-types'
import type { SessionUser } from '@/lib/auth-context'
import { format } from 'date-fns'

interface SkuCardProps {
  card: SkuBoardCard
  sessionUser: SessionUser | null
  users: PackagingUser[]
  onClaimClick: (card: SkuBoardCard) => void
  onRefresh: () => void
}

const PRIORITY_CIRCLE_STYLES = {
  URGENT: 'bg-red-600 text-white',
  TOMORROW: 'bg-orange-500 text-white',
  UPCOMING: 'bg-amber-500 text-white',
  BACKFILL: 'bg-green-600 text-white',
}

const PRIORITY_BADGE_STYLES = {
  URGENT: 'bg-red-600 text-white',
  TOMORROW: 'bg-orange-500 text-white',
  UPCOMING: 'bg-amber-500 text-white',
  BACKFILL: 'bg-green-600 text-white',
}

export function SkuCard({ card, sessionUser, onClaimClick, onRefresh }: SkuCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [advanceQty, setAdvanceQty] = useState(card.activeClaim?.claimedQuantity ?? card.totalQuantity)
  const [advancing, setAdvancing] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const claim = card.activeClaim
  const sessionUserId = sessionUser?.id ?? null
  const sessionUserRole = sessionUser?.role ?? null

  const isClaimedBySession =
    claim !== null &&
    (claim.claimedByUserId === sessionUserId || claim.sessionUserId === sessionUserId)

  const isClaimedByOther = claim !== null && !isClaimedBySession

  const canRelease =
    isClaimedByOther &&
    (sessionUserRole === 'admin' || sessionUserRole === 'management')

  const verb = card.taskType === 'FILL' ? 'Fill' : 'Case'

  // Update advance qty when claim changes
  if (claim && advanceQty !== (claim.claimedQuantity ?? card.totalQuantity)) {
    // Only sync on mount (avoid loops), handled via key on parent if needed
  }

  async function handleAdvance() {
    if (!claim || !sessionUser) return
    setAdvancing(true)
    try {
      const result = await advanceClaimed({
        claimId: claim.id,
        sku: card.sku,
        taskType: card.taskType,
        actualQuantity: advanceQty,
        advancedByUserId: sessionUser.id,
      })
      if (result.success) {
        toast.success(`Done — ${advanceQty} × ${card.sku} ${verb.toLowerCase()}ed`)
        onRefresh()
      } else {
        toast.error(result.error)
      }
    } finally {
      setAdvancing(false)
    }
  }

  async function handleRelease() {
    if (!claim || !sessionUser) return
    setReleasing(true)
    try {
      const result = await releaseTask({
        claimId: claim.id,
        releasedByUserId: sessionUser.id,
        releasedByName: sessionUser.name,
        reason: 'admin_released',
      })
      if (result.success) {
        toast.success('Claim released')
        onRefresh()
      } else {
        toast.error(result.error)
      }
    } finally {
      setReleasing(false)
    }
  }

  async function handleSelfRelease() {
    if (!claim || !sessionUser) return
    setReleasing(true)
    try {
      const result = await releaseTask({
        claimId: claim.id,
        releasedByUserId: sessionUser.id,
        releasedByName: sessionUser.name,
        reason: 'worker_released',
      })
      if (result.success) {
        toast.success('Claim released')
        onRefresh()
      } else {
        toast.error(result.error)
      }
    } finally {
      setReleasing(false)
    }
  }

  const borderClass = isClaimedBySession
    ? 'border-l-4 border-l-amber-400'
    : isClaimedByOther
      ? 'border-l-4 border-l-blue-500'
      : ''

  return (
    <div
      className={cn(
        'rounded-lg border bg-card shadow-sm transition-colors',
        borderClass,
        card.hasBlocked && !claim ? 'opacity-60' : ''
      )}
    >
      {/* Collapsed header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* SKU + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base truncate">{card.sku}</span>
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0 font-bold',
                card.taskType === 'FILL' ? 'bg-amber-500 text-white' : 'bg-purple-500 text-white'
              )}
            >
              {card.taskType}
            </Badge>
            {card.hasBlocked && (
              <Badge className="text-[10px] px-1.5 py-0 bg-zinc-500 text-white">BLOCKED</Badge>
            )}
          </div>

          {/* Claim state text */}
          {isClaimedBySession && claim && (
            <p className="text-xs text-amber-500 mt-0.5">
              Yours — {claim.claimedQuantity} claimed
              {claim.claimedByName !== sessionUser?.name && claim.sessionUserName
                ? ` (for ${claim.claimedByName})`
                : ''}
            </p>
          )}
          {isClaimedByOther && claim && (
            <p className="text-xs text-blue-400 mt-0.5">In Progress — {claim.claimedByName}</p>
          )}
        </div>

        {/* Priority circles */}
        <div className="flex items-center gap-1.5 shrink-0">
          {card.urgentUnits > 0 && (
            <span
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
                PRIORITY_CIRCLE_STYLES.URGENT
              )}
            >
              {card.urgentUnits}
            </span>
          )}
          {card.tomorrowUnits > 0 && (
            <span
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
                PRIORITY_CIRCLE_STYLES.TOMORROW
              )}
            >
              {card.tomorrowUnits}
            </span>
          )}
          {card.upcomingUnits > 0 && (
            <span
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
                PRIORITY_CIRCLE_STYLES.UPCOMING
              )}
            >
              {card.upcomingUnits}
            </span>
          )}
          {card.backfillUnits > 0 && (
            <span
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
                PRIORITY_CIRCLE_STYLES.BACKFILL
              )}
            >
              {card.backfillUnits}
            </span>
          )}
        </div>

        {/* Action arrow — hidden when claimed by other */}
        {!isClaimedByOther && (
          <button
            type="button"
            className={cn(
              'h-12 w-12 shrink-0 flex items-center justify-center rounded-lg transition-colors',
              isClaimedBySession
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            onClick={(e) => {
              e.stopPropagation()
              if (isClaimedBySession) {
                setExpanded(true)
              } else {
                onClaimClick(card)
              }
            }}
            title={isClaimedBySession ? `Advance ${verb}` : `Claim & ${verb}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Release button for admin/management when claimed by other */}
        {canRelease && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground hover:text-red-400 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              handleRelease()
            }}
            disabled={releasing}
          >
            {releasing ? '...' : 'Release'}
          </Button>
        )}

        {/* Expand toggle */}
        <button
          type="button"
          className="h-8 w-8 shrink-0 flex items-center justify-center text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 opacity-0" />}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-3 space-y-3 bg-muted/10">
          {/* Order lines */}
          <div className="space-y-1.5">
            {card.orderLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge
                  className={cn(
                    'text-[10px] px-1.5 py-0 shrink-0',
                    PRIORITY_BADGE_STYLES[line.priority]
                  )}
                >
                  {line.priority}
                </Badge>
                <span className="flex-1 truncate text-foreground font-medium" style={{ maxWidth: '20ch' }}>
                  {line.customerName ?? 'Stock build'}
                </span>
                <span className="text-muted-foreground shrink-0">×{line.quantity}</span>
                {line.deliveryDate && (
                  <span className="text-muted-foreground text-xs shrink-0">
                    {format(new Date(line.deliveryDate + 'T12:00:00'), 'MMM d')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Quantity field (always shown) */}
          {isClaimedBySession && claim && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Actual quantity</p>
              <Input
                type="number"
                min={1}
                max={claim.claimedQuantity}
                value={advanceQty}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v)) setAdvanceQty(Math.min(Math.max(1, v), claim.claimedQuantity))
                }}
                className="h-12 text-lg text-center font-semibold"
                onClick={(e) => e.stopPropagation()}
              />

              {/* Advance + Release row */}
              <div className="flex gap-2">
                <Button
                  className="h-12 flex-1 text-base font-semibold"
                  disabled={advancing || advanceQty < 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAdvance()
                  }}
                >
                  {advancing ? 'Saving...' : `Advance ${advanceQty} — ${verb} complete`}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-4 text-sm text-muted-foreground"
                  disabled={releasing}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelfRelease()
                  }}
                >
                  {releasing ? '...' : 'Release'}
                </Button>
              </div>
            </div>
          )}

          {/* Unclaimed: quantity + claim button */}
          {!claim && (
            <div className="space-y-2">
              <Button
                className="h-12 w-full text-base font-semibold"
                onClick={(e) => {
                  e.stopPropagation()
                  onClaimClick(card)
                }}
              >
                Claim &amp; {verb}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

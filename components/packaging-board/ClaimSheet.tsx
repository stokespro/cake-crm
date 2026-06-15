'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WorkerSelector } from './WorkerSelector'
import { claimTask } from '@/actions/packaging-board'
import type { SkuBoardCard, PackagingUser } from '@/lib/packaging/board-types'
import type { SessionUser } from '@/lib/auth-context'

interface ClaimSheetProps {
  card: SkuBoardCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  users: PackagingUser[]
  sessionUser: SessionUser | null
  onSuccess: () => void
}

export function ClaimSheet({
  card,
  open,
  onOpenChange,
  users,
  sessionUser,
  onSuccess,
}: ClaimSheetProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [loading, setLoading] = useState(false)

  // Pre-select session user and pre-fill quantity when card opens
  useEffect(() => {
    if (open && card) {
      setQuantity(card.totalQuantity)
      if (sessionUser) {
        setSelectedUserId(sessionUser.id)
        setSelectedUserName(sessionUser.name)
      } else {
        setSelectedUserId(null)
        setSelectedUserName(null)
      }
    }
  }, [open, card, sessionUser])

  if (!card) return null

  const maxQty = card.totalQuantity
  const verb = card.taskType === 'FILL' ? 'Fill' : 'Case'
  const buttonLabel =
    selectedUserName && quantity >= 1
      ? `Claim — ${selectedUserName} will ${verb} ${quantity} × ${card.sku}`
      : `Claim & ${verb}`

  // Determine the highest priority for the claim record
  function topPriority(): string {
    if (card!.urgentUnits > 0) return 'URGENT'
    if (card!.tomorrowUnits > 0) return 'TOMORROW'
    if (card!.upcomingUnits > 0) return 'UPCOMING'
    return 'BACKFILL'
  }

  async function handleConfirm() {
    if (!selectedUserId || !selectedUserName || !card) return
    if (quantity < 1 || quantity > maxQty) return

    setLoading(true)
    try {
      const taskKey = `${card.taskType}-${card.sku}`
      const result = await claimTask({
        taskKey,
        sku: card.sku,
        taskType: card.taskType,
        priority: topPriority() as 'URGENT' | 'TOMORROW' | 'UPCOMING' | 'BACKFILL',
        claimedQuantity: quantity,
        claimedByUserId: selectedUserId,
        claimedByName: selectedUserName,
        sessionUserId: sessionUser?.id ?? null,
        sessionUserName: sessionUser?.name ?? null,
      })

      if (result.success) {
        toast.success(`Claimed — ${selectedUserName} is ${verb.toLowerCase()}ing ${quantity} × ${card.sku}`)
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  // Build subtitle with unit breakdown
  const parts: string[] = []
  if (card.urgentUnits > 0) parts.push(`${card.urgentUnits} URGENT`)
  if (card.tomorrowUnits > 0) parts.push(`${card.tomorrowUnits} TOMORROW`)
  if (card.upcomingUnits > 0) parts.push(`${card.upcomingUnits} UPCOMING`)
  if (card.backfillUnits > 0) parts.push(`${card.backfillUnits} BACKFILL`)
  const subtitle = parts.join(' · ')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="md:max-w-lg md:ml-auto md:h-full md:[--radix-sheet-content-transform:translateX(100%)]"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl">
            Claim {card.sku} — {card.taskType}
          </SheetTitle>
          {subtitle && (
            <SheetDescription className="text-sm">{subtitle}</SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-6 pb-6">
          {/* Worker picker */}
          <WorkerSelector
            users={users}
            selectedId={selectedUserId}
            onSelect={(id, name) => {
              setSelectedUserId(id)
              setSelectedUserName(name)
            }}
          />

          {/* Quantity field */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Quantity to claim</p>
            <Input
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v)) setQuantity(Math.min(Math.max(1, v), maxQty))
              }}
              className="h-14 text-xl text-center font-semibold"
            />
            <p className="text-xs text-muted-foreground text-center">Max: {maxQty}</p>
          </div>

          {/* Confirm */}
          <Button
            className="h-14 w-full text-lg font-semibold"
            disabled={!selectedUserId || quantity < 1 || loading}
            onClick={handleConfirm}
          >
            {loading ? 'Claiming...' : buttonLabel}
          </Button>

          {/* Cancel */}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

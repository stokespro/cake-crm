'use client'

import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'

type OrderStatus = 'pending' | 'confirmed' | 'packed' | 'delivered' | 'cancelled'

const STATUS_TRANSITIONS: Record<string, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

interface StatusBadgeDropdownProps {
  orderId: string
  currentStatus: string
  canChangeStatus: boolean
  onStatusChange: (orderId: string, newStatus: string) => Promise<void>
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline">Pending</Badge>
    case 'confirmed':
      return <Badge variant="default">Confirmed</Badge>
    case 'packed':
      return <Badge variant="default" className="bg-blue-600">Packed</Badge>
    case 'delivered':
      return <Badge variant="default" className="bg-green-600">Delivered</Badge>
    case 'cancelled':
      return <Badge variant="destructive">Cancelled</Badge>
    default:
      return null
  }
}

function StatusLabel({ status }: { status: string }) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function StatusBadgeDropdown({
  orderId,
  currentStatus,
  canChangeStatus,
  onStatusChange,
}: StatusBadgeDropdownProps) {
  const transitions = STATUS_TRANSITIONS[currentStatus] || []
  const isInteractive = canChangeStatus && transitions.length > 0

  if (!isInteractive) {
    return <StatusBadge status={currentStatus} />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        onClick={(e) => e.stopPropagation()}
      >
        <button className="inline-flex items-center gap-1 cursor-pointer focus:outline-none">
          <StatusBadge status={currentStatus} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {transitions.map((status) => (
          <DropdownMenuItem
            key={status}
            onClick={(e) => {
              e.stopPropagation()
              onStatusChange(orderId, status)
            }}
          >
            <StatusLabel status={status} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

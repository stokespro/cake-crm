import { parseLocalDate } from '@/lib/utils'
import type { GrowRoom, RoomCycle, TaskPriority } from '@/types/cultivation'

// ─── Constants ───────────────────────────────────────────────────────────────

export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-gray-400 text-white',
}

export const PHASE_BADGE_CLASSES: Record<string, string> = {
  empty: 'bg-gray-500 text-white',
  dome: 'bg-teal-600 text-white',
  veg: 'bg-green-600 text-white',
  flower: 'bg-purple-600 text-white',
  harvest: 'bg-amber-600 text-white',
  dry: 'bg-orange-600 text-white',
  trim: 'bg-rose-600 text-white',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getDayProgress(
  activeCycle: RoomCycle | undefined
): { current: number; total: number } | null {
  if (!activeCycle?.start_date || !activeCycle?.expected_end_date) return null
  const startDate = parseLocalDate(activeCycle.start_date)
  const endDate = parseLocalDate(activeCycle.expected_end_date)
  const totalDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (totalDays <= 0) return null
  const currentDay =
    Math.floor(
      (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1
  return { current: Math.max(Math.min(currentDay, totalDays), 1), total: totalDays }
}

export function getPairingLabel(room: GrowRoom, rooms: GrowRoom[]): string | null {
  if (!room.pairing_group) return null
  const paired = rooms.find(
    (r) => r.pairing_group === room.pairing_group && r.id !== room.id
  )
  if (!paired) return null
  return `Paired with ${paired.room_name}`
}

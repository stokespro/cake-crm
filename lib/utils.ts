import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parse a date string as local time. Handles both date-only (YYYY-MM-DD) and timestamps */
export function parseLocalDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date()
  // If it already has time info (contains T or space followed by time), parse as-is
  if (dateStr.includes('T') || dateStr.match(/\d{4}-\d{2}-\d{2}\s\d{2}:/)) {
    return new Date(dateStr)
  }
  // Date-only string — append T00:00:00 to force local time
  return new Date(dateStr + 'T00:00:00')
}
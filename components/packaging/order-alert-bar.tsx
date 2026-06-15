'use client'

import { useState, useCallback, useEffect } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOrderAlerts, type AlertEvent } from '@/hooks/use-order-alerts'

const SOUND_PREF_KEY = 'packaging-alert-sound'
const BADGE_COUNT_KEY = 'packaging-alert-count'

/**
 * Self-contained alert bar for the packaging page.
 *
 * - Subscribes to Supabase Realtime (orders INSERT + order_items UPDATE)
 * - Shows a persistent red badge count that survives page refresh (localStorage)
 * - Plays a Web Audio bell (arms on first click of the sound toggle)
 * - "Reviewed" button clears the badge
 */
export function OrderAlertBar() {
  // --- Sound preference ---
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [audioArmed, setAudioArmed] = useState(false)

  // Load preference on mount (localStorage not available in SSR, guarded by useEffect)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SOUND_PREF_KEY)
      if (stored !== null) {
        setSoundEnabled(stored === 'true')
        // If they had it on before, mark audio as armed (user already interacted)
        if (stored === 'true') setAudioArmed(true)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SOUND_PREF_KEY, String(next))
      } catch {}
      // First toggle arms the AudioContext (browser requires user gesture)
      if (!audioArmed) setAudioArmed(true)
      return next
    })
  }, [audioArmed])

  // --- Alert badge count (persisted across soft refreshes) ---
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BADGE_COUNT_KEY)
      if (stored) setAlertCount(parseInt(stored, 10) || 0)
    } catch {}
  }, [])

  const handleAlert = useCallback((_event: AlertEvent) => {
    setAlertCount((prev) => {
      const next = prev + 1
      try {
        localStorage.setItem(BADGE_COUNT_KEY, String(next))
      } catch {}
      return next
    })
  }, [])

  const clearAlerts = useCallback(() => {
    setAlertCount(0)
    try {
      localStorage.removeItem(BADGE_COUNT_KEY)
    } catch {}
  }, [])

  // --- Realtime subscription ---
  useOrderAlerts({
    onAlert: handleAlert,
    soundEnabled: soundEnabled && audioArmed,
  })

  // Don't render the bar when count is 0 and we want minimal footprint —
  // always render so the sound toggle is always accessible.
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sound toggle — small, mobile-friendly */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSound}
        className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        title={soundEnabled ? 'Sound on — click to mute' : 'Sound off — click to enable'}
      >
        {soundEnabled ? (
          <Bell className="h-4 w-4 text-amber-400" />
        ) : (
          <BellOff className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{soundEnabled ? 'Sound on' : 'Sound off'}</span>
      </Button>

      {/* Alert badge — only visible when there are unreviewed alerts */}
      {alertCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Badge className="bg-red-600 text-white text-xs px-2 py-0.5 animate-pulse">
            {alertCount} new/changed
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAlerts}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            title="Mark as reviewed — clear badge"
          >
            <X className="h-3 w-3" />
            <span>Reviewed</span>
          </Button>
        </div>
      )}
    </div>
  )
}

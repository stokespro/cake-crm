'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { getGrowRooms, getActiveCycles } from '@/actions/cultivation'
import { RoomCard } from '@/components/cultivation/room-card'
import type { GrowRoom, RoomCycle } from '@/types/cultivation'

// ─── Constants ───────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 60_000

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CultivationRoomsDisplayPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<GrowRoom[]>([])
  const [activeCyclesMap, setActiveCyclesMap] = useState<Record<string, RoomCycle[]>>({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // UX-only auth redirect
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('crm-user') : null
    if (!stored) {
      router.replace('/login?next=/cultivation-display/rooms')
    }
  }, [router])

  const fetchData = useCallback(async () => {
    try {
      const [roomsRes, cyclesRes] = await Promise.all([
        getGrowRooms(),
        getActiveCycles(),
      ])
      if (roomsRes.data) setRooms(roomsRes.data)
      if (cyclesRes.data) {
        const map: Record<string, RoomCycle[]> = {}
        for (const cycle of cyclesRes.data) {
          if (!map[cycle.room_id]) map[cycle.room_id] = []
          map[cycle.room_id].push(cycle)
        }
        setActiveCyclesMap(map)
      }
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[cultivation-display/rooms] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh via chained setTimeout (mirrors packaging board pattern)
  useEffect(() => {
    function schedule() {
      refreshTimerRef.current = setTimeout(() => {
        fetchData().then(schedule)
      }, REFRESH_INTERVAL)
    }
    schedule()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [fetchData])

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-zinc-400 text-lg">
        Loading rooms...
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col text-lg">
      {/* Page header */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Grow Rooms
        </h1>
        <span className="text-base text-zinc-500">
          {format(new Date(), 'EEEE, MMMM d')}
        </span>
      </div>

      {/* Rooms grid */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-6 pb-12">
        {rooms.length === 0 ? (
          <p className="text-lg text-zinc-400 mt-8">No rooms configured</p>
        ) : (
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}
          >
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                activeCycles={activeCyclesMap[room.id] || []}
                allRooms={rooms}
                variant="tv"
              />
            ))}
          </div>
        )}
      </div>

      {/* Last updated footer */}
      {lastUpdated && (
        <div className="fixed bottom-4 right-6 text-base text-zinc-500">
          Updated {format(lastUpdated, 'h:mm a')}
        </div>
      )}
    </div>
  )
}

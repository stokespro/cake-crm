'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export type AlertEvent = {
  type: 'new_order' | 'order_edited'
  orderId: string
  customerName: string
  orderNumber?: string
}

interface UseOrderAlertsOptions {
  /** Called with each new alert event — increment badge, play sound, etc. */
  onAlert: (event: AlertEvent) => void
  /** Whether sound is currently enabled (controlled by parent) */
  soundEnabled: boolean
}

/**
 * Subscribes to Supabase Realtime for orders (INSERT) and order_items (UPDATE).
 * Fires onAlert for each qualifying change so the caller can update badge state.
 *
 * Requires orders and order_items to be in the supabase_realtime publication.
 * See: supabase/migrations/20260615000000_enable_realtime_orders.sql
 */
export function useOrderAlerts({ onAlert, soundEnabled }: UseOrderAlertsOptions) {
  // Keep a stable ref to the latest callback so channel handlers don't get stale
  const onAlertRef = useRef(onAlert)
  const soundEnabledRef = useRef(soundEnabled)

  useEffect(() => {
    onAlertRef.current = onAlert
  }, [onAlert])

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  const playBell = useCallback((type: AlertEvent['type']) => {
    if (!soundEnabledRef.current) return
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      // New order → higher tone; edited → lower tone
      const freq = type === 'new_order' ? 880 : 660
      const gainNode = ctx.createGain()
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)

      const oscillator = ctx.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.6)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.8)
    } catch {
      // AudioContext unavailable — silently skip
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    /**
     * orders INSERT → new order placed
     * We do a quick lookup to get the customer name for the toast.
     */
    const ordersChannel = supabase
      .channel('packaging-orders-insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const row = payload.new as {
            id: string
            customer_id: string
            order_number?: string
          }

          // Fetch customer name for a meaningful toast
          const { data: customer } = await supabase
            .from('customers')
            .select('business_name')
            .eq('id', row.customer_id)
            .single()

          const event: AlertEvent = {
            type: 'new_order',
            orderId: row.id,
            customerName: customer?.business_name ?? 'Unknown dispensary',
            orderNumber: row.order_number,
          }

          playBell('new_order')
          onAlertRef.current(event)

          const label = row.order_number ? ` #${row.order_number}` : ''
          toast.info(`New order${label} — ${event.customerName}`, {
            description: 'Packaging requirements may have changed',
            duration: 8000,
          })
        }
      )
      .subscribe()

    /**
     * order_items UPDATE → quantities or SKUs edited on an existing order
     * We debounce per order_id to avoid N toasts for multi-item edits.
     */
    const debounceMap = new Map<string, ReturnType<typeof setTimeout>>()

    const itemsChannel = supabase
      .channel('packaging-order-items-update')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        async (payload) => {
          const row = payload.new as {
            id: string
            order_id: string
          }
          const orderId = row.order_id

          // Debounce: only one alert per order within 2 s
          if (debounceMap.has(orderId)) {
            clearTimeout(debounceMap.get(orderId)!)
          }

          const timer = setTimeout(async () => {
            debounceMap.delete(orderId)

            // Fetch order + customer for context
            const { data: order } = await supabase
              .from('orders')
              .select('order_number, customer_id, customers(business_name)')
              .eq('id', orderId)
              .single()

            const customer = (order?.customers as unknown as { business_name: string } | null)
            const event: AlertEvent = {
              type: 'order_edited',
              orderId,
              customerName: customer?.business_name ?? 'Unknown dispensary',
              orderNumber: order?.order_number,
            }

            playBell('order_edited')
            onAlertRef.current(event)

            const label = order?.order_number ? ` #${order.order_number}` : ''
            toast.warning(`Order${label} edited — ${event.customerName}`, {
              description: 'Item quantities or SKUs changed',
              duration: 8000,
            })
          }, 2000)

          debounceMap.set(orderId, timer)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(itemsChannel)
      debounceMap.forEach((t) => clearTimeout(t))
      debounceMap.clear()
    }
  }, [playBell])
}

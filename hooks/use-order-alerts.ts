'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderItemSnapshot {
  skuId: string
  skuName: string  // human-readable, e.g. "Blue Dream 3.5g"
  quantity: number
}

export interface ItemDiff {
  type: 'added' | 'removed' | 'changed'
  skuName: string
  oldQty?: number
  newQty?: number
}

export type AlertEvent =
  | {
      type: 'new_order'
      orderId: string
      customerName: string
      orderNumber?: string
      items: OrderItemSnapshot[]
    }
  | {
      type: 'order_edited'
      orderId: string
      customerName: string
      orderNumber?: string
      diff: ItemDiff[]
    }

interface UseOrderAlertsOptions {
  onAlert: (event: AlertEvent) => void
  soundEnabled: boolean
}

// ---------------------------------------------------------------------------
// Web Audio cat meow synthesizer
// Single meow = new order, double meow = edited order.
// Uses AM modulation + pitch envelope to mimic a cat's "miaou" formant shape.
// ---------------------------------------------------------------------------

function playSynthMeow(ctx: AudioContext, startTime: number) {
  const duration = 0.55

  // Carrier: voiced harmonic at ~700 Hz falling to ~400 Hz (vowel body)
  const carrier = ctx.createOscillator()
  carrier.type = 'sawtooth'
  carrier.frequency.setValueAtTime(700, startTime)
  carrier.frequency.exponentialRampToValueAtTime(400, startTime + duration)

  // Formant band-pass to give it a vocal "meow" timbre
  const formant = ctx.createBiquadFilter()
  formant.type = 'bandpass'
  formant.frequency.setValueAtTime(1200, startTime)
  formant.frequency.exponentialRampToValueAtTime(700, startTime + duration)
  formant.Q.value = 3

  // Amplitude envelope: quick attack, sustain, tail off
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.28, startTime + 0.04)
  gain.gain.setValueAtTime(0.28, startTime + 0.35)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  carrier.connect(formant)
  formant.connect(gain)
  gain.connect(ctx.destination)

  carrier.start(startTime)
  carrier.stop(startTime + duration)
}

function playMeow(type: AlertEvent['type'], soundEnabled: boolean) {
  if (!soundEnabled) return
  try {
    const AudioCtx = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()

    if (type === 'new_order') {
      // Single meow
      playSynthMeow(ctx, ctx.currentTime)
    } else {
      // Double meow — second one 0.7 s after first
      playSynthMeow(ctx, ctx.currentTime)
      playSynthMeow(ctx, ctx.currentTime + 0.7)
    }
  } catch {
    // AudioContext unavailable or blocked — silently skip
  }
}

// ---------------------------------------------------------------------------
// SKU name cache (browser-side, lives for the page session)
// Keyed by sku UUID → "name (code)" display string
// ---------------------------------------------------------------------------

const skuNameCache = new Map<string, string>()

async function resolveSkuName(
  skuId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  if (skuNameCache.has(skuId)) return skuNameCache.get(skuId)!

  const { data } = await supabase
    .from('skus')
    .select('code, name')
    .eq('id', skuId)
    .single()

  const label = data ? `${data.name} (${data.code})` : skuId
  skuNameCache.set(skuId, label)
  return label
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribes to Supabase Realtime for:
 *   - orders: INSERT  → new order alert with full item list
 *   - order_items: INSERT | UPDATE | DELETE → diff alert (debounced per order)
 *
 * Requires:
 *   - orders + order_items in supabase_realtime publication
 *     (migration: 20260615000000_enable_realtime_orders.sql)
 *   - order_items REPLICA IDENTITY FULL for UPDATE old-row values
 *     (migration: 20260615120000_order_items_replica_identity_full.sql)
 */
export function useOrderAlerts({ onAlert, soundEnabled }: UseOrderAlertsOptions) {
  const onAlertRef = useRef(onAlert)
  const soundEnabledRef = useRef(soundEnabled)

  useEffect(() => { onAlertRef.current = onAlert }, [onAlert])
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  // Stable meow player — reads latest soundEnabled from ref
  const meow = useCallback((type: AlertEvent['type']) => {
    playMeow(type, soundEnabledRef.current)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // ------------------------------------------------------------------
    // Channel 1: orders INSERT → new order
    // ------------------------------------------------------------------
    const ordersChannel = supabase
      .channel('pkg-orders-insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const row = payload.new as {
            id: string
            customer_id: string
            order_number?: string
          }

          // Fetch customer + all items (with SKU join) in parallel
          const [customerRes, itemsRes] = await Promise.all([
            supabase
              .from('customers')
              .select('business_name')
              .eq('id', row.customer_id)
              .single(),
            supabase
              .from('order_items')
              .select('sku_id, quantity, skus(code, name)')
              .eq('order_id', row.id),
          ])

          const customerName =
            customerRes.data?.business_name ?? 'Unknown dispensary'

          const items: OrderItemSnapshot[] = (itemsRes.data ?? []).map((item) => {
            const skuData = item.skus as unknown as { code: string; name: string } | null
            const label = skuData ? `${skuData.name} (${skuData.code})` : item.sku_id
            // Cache it for future diff lookups
            if (skuData) skuNameCache.set(item.sku_id, label)
            return { skuId: item.sku_id, skuName: label, quantity: item.quantity }
          })

          const event: AlertEvent = {
            type: 'new_order',
            orderId: row.id,
            customerName,
            orderNumber: row.order_number,
            items,
          }

          meow('new_order')
          onAlertRef.current(event)

          const label = row.order_number ? ` #${row.order_number}` : ''
          toast.info(`New order${label} — ${customerName} · ${items.length} item${items.length !== 1 ? 's' : ''}`, {
            duration: 6000,
          })
        }
      )
      .subscribe()

    // ------------------------------------------------------------------
    // Channel 2: order_items INSERT | UPDATE | DELETE → diff per order
    // Debounce 2 s so multi-row saves collapse into one alert.
    // Accumulate per-row change events in pendingDiffs map.
    // ------------------------------------------------------------------

    type RowChange = {
      changeType: 'INSERT' | 'UPDATE' | 'DELETE'
      oldSkuId?: string
      oldQty?: number
      newSkuId?: string
      newQty?: number
      itemId: string
    }

    const pendingDiffs = new Map<string, RowChange[]>()   // orderId → changes
    const debounceMap = new Map<string, ReturnType<typeof setTimeout>>()

    function scheduleFlush(orderId: string) {
      if (debounceMap.has(orderId)) clearTimeout(debounceMap.get(orderId)!)

      const timer = setTimeout(async () => {
        debounceMap.delete(orderId)
        const changes = pendingDiffs.get(orderId) ?? []
        pendingDiffs.delete(orderId)

        if (changes.length === 0) return

        // Fetch customer + order number
        const { data: order } = await supabase
          .from('orders')
          .select('order_number, customer_id, customers(business_name)')
          .eq('id', orderId)
          .single()

        const customerRaw = order?.customers as unknown as { business_name: string } | null
        const customerName = customerRaw?.business_name ?? 'Unknown dispensary'

        // Resolve all unique sku IDs to names
        const allSkuIds = new Set<string>()
        for (const c of changes) {
          if (c.oldSkuId) allSkuIds.add(c.oldSkuId)
          if (c.newSkuId) allSkuIds.add(c.newSkuId)
        }
        await Promise.all(
          Array.from(allSkuIds).map((id) => resolveSkuName(id, supabase))
        )

        // Build human-readable diff
        const diff: ItemDiff[] = []

        for (const c of changes) {
          if (c.changeType === 'INSERT' && c.newSkuId) {
            diff.push({
              type: 'added',
              skuName: skuNameCache.get(c.newSkuId) ?? c.newSkuId,
              newQty: c.newQty,
            })
          } else if (c.changeType === 'DELETE' && c.oldSkuId) {
            diff.push({
              type: 'removed',
              skuName: skuNameCache.get(c.oldSkuId) ?? c.oldSkuId,
              oldQty: c.oldQty,
            })
          } else if (c.changeType === 'UPDATE') {
            // SKU swapped (line item replaced) → treat as remove + add
            if (c.oldSkuId && c.newSkuId && c.oldSkuId !== c.newSkuId) {
              diff.push({
                type: 'removed',
                skuName: skuNameCache.get(c.oldSkuId) ?? c.oldSkuId,
                oldQty: c.oldQty,
              })
              diff.push({
                type: 'added',
                skuName: skuNameCache.get(c.newSkuId) ?? c.newSkuId,
                newQty: c.newQty,
              })
            } else if (
              c.newSkuId &&
              c.oldQty !== undefined &&
              c.newQty !== undefined &&
              c.oldQty !== c.newQty
            ) {
              // Quantity changed on same SKU
              diff.push({
                type: 'changed',
                skuName: skuNameCache.get(c.newSkuId) ?? c.newSkuId,
                oldQty: c.oldQty,
                newQty: c.newQty,
              })
            }
          }
        }

        if (diff.length === 0) return  // No meaningful change

        const event: AlertEvent = {
          type: 'order_edited',
          orderId,
          customerName,
          orderNumber: order?.order_number,
          diff,
        }

        meow('order_edited')
        onAlertRef.current(event)

        const label = order?.order_number ? ` #${order.order_number}` : ''
        toast.warning(`Order${label} edited — ${customerName} · ${diff.length} change${diff.length !== 1 ? 's' : ''}`, {
          duration: 6000,
        })
      }, 2000)

      debounceMap.set(orderId, timer)
    }

    const itemsChannel = supabase
      .channel('pkg-order-items-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_items' },
        (payload) => {
          const row = payload.new as { id: string; order_id: string; sku_id: string; quantity: number }
          const changes = pendingDiffs.get(row.order_id) ?? []
          changes.push({ changeType: 'INSERT', itemId: row.id, newSkuId: row.sku_id, newQty: row.quantity })
          pendingDiffs.set(row.order_id, changes)
          scheduleFlush(row.order_id)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        (payload) => {
          const oldRow = payload.old as { id: string; order_id: string; sku_id?: string; quantity?: number }
          const newRow = payload.new as { id: string; order_id: string; sku_id: string; quantity: number }
          const orderId = newRow.order_id
          const changes = pendingDiffs.get(orderId) ?? []
          changes.push({
            changeType: 'UPDATE',
            itemId: newRow.id,
            oldSkuId: oldRow.sku_id,
            oldQty: oldRow.quantity,
            newSkuId: newRow.sku_id,
            newQty: newRow.quantity,
          })
          pendingDiffs.set(orderId, changes)
          scheduleFlush(orderId)
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'order_items' },
        (payload) => {
          const oldRow = payload.old as { id: string; order_id: string; sku_id?: string; quantity?: number }
          // order_id may not be in the old payload without REPLICA IDENTITY FULL on orders,
          // but it IS present because we set REPLICA IDENTITY FULL on order_items.
          const orderId = oldRow.order_id
          if (!orderId) return
          const changes = pendingDiffs.get(orderId) ?? []
          changes.push({
            changeType: 'DELETE',
            itemId: oldRow.id,
            oldSkuId: oldRow.sku_id,
            oldQty: oldRow.quantity,
          })
          pendingDiffs.set(orderId, changes)
          scheduleFlush(orderId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(itemsChannel)
      debounceMap.forEach((t) => clearTimeout(t))
      debounceMap.clear()
      pendingDiffs.clear()
    }
  }, [meow])
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { BgmTrack, KaraokeRequest, Room } from './types'

export function useRoom(code: string) {
  const [room, setRoom] = useState<Room | null>(null)
  const [requests, setRequests] = useState<KaraokeRequest[]>([])
  const [bgm, setBgm] = useState<BgmTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Serializa refreshes: dos solapados podían escribir datos obsoletos en orden
  // incorrecto y provocar parpadeos. Si llega otro mientras hay uno en vuelo, se encola.
  const inFlight = useRef(false)
  const pending = useRef(false)
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true
      return
    }
    inFlight.current = true
    try {
      const { data: r } = await supabase
        .from('karaoke_rooms')
        .select('*')
        .eq('code', code.toUpperCase())
        .maybeSingle()
      if (!r) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setRoom(r as Room)
      const { data: reqs } = await supabase
        .from('karaoke_requests')
        .select('*')
        .eq('room_id', r.id)
        .in('status', ['queued', 'playing'])
        .order('position', { ascending: true })
      setRequests((reqs ?? []) as KaraokeRequest[])
      const { data: tracks } = await supabase
        .from('karaoke_bgm')
        .select('*')
        .eq('room_id', r.id)
        .order('position', { ascending: true })
      setBgm((tracks ?? []) as BgmTrack[])
      setLoading(false)
    } finally {
      inFlight.current = false
      if (pending.current) {
        pending.current = false
        void refresh()
      }
    }
  }, [code])

  // Agrupa ráfagas de eventos realtime en un solo refresh (120ms)
  const debounce = useRef<number | undefined>(undefined)
  const scheduleRefresh = useCallback(() => {
    if (debounce.current !== undefined) return
    debounce.current = window.setTimeout(() => {
      debounce.current = undefined
      void refresh()
    }, 120)
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!room) return
    const channel = supabase
      .channel(`karaopub:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'karaoke_requests', filter: `room_id=eq.${room.id}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'karaoke_rooms', filter: `id=eq.${room.id}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'karaoke_bgm', filter: `room_id=eq.${room.id}` },
        scheduleRefresh,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, refresh, scheduleRefresh])

  return { room, requests, bgm, loading, notFound, refresh }
}

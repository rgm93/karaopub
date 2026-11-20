'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { BgmTrack, KaraokeRequest, Room } from './types'

export function useRoom(code: string) {
  const [room, setRoom] = useState<Room | null>(null)
  const [requests, setRequests] = useState<KaraokeRequest[]>([])
  const [bgm, setBgm] = useState<BgmTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const refresh = useCallback(async () => {
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
  }, [code])

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
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'karaoke_rooms', filter: `id=eq.${room.id}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'karaoke_bgm', filter: `room_id=eq.${room.id}` },
        () => refresh(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, refresh])

  return { room, requests, bgm, loading, notFound, refresh }
}

'use client'

import { useEffect, useRef } from 'react'
import { loadYouTubeApi } from './KaraokePlayer'

// Preview ligero con la iframe API: permite detectar errores de embed
// (100 = no disponible, 101/150 = reproducción en embeds prohibida)
export function YtPreview({
  videoId,
  onError,
}: {
  videoId: string
  onError: (code: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cbRef = useRef(onError)
  cbRef.current = onError

  useEffect(() => {
    let mounted = true
    let player: { destroy: () => void } | null = null
    loadYouTubeApi().then((YT) => {
      if (!mounted || !containerRef.current) return
      player = new YT.Player(containerRef.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { rel: 0, controls: 1, modestbranding: 1, iv_load_policy: 3 },
        events: { onError: (e) => cbRef.current(e.data) },
      })
    })
    return () => {
      mounted = false
      player?.destroy()
    }
  }, [videoId])

  return <div ref={containerRef} className="aspect-video w-full" />
}

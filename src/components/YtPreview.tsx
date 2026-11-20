'use client'

import { useEffect, useRef } from 'react'
import { loadYouTubeApi } from './KaraokePlayer'

// Preview ligero con la iframe API: permite detectar errores de embed
// (100 = no disponible, 101/150 = reproducción en embeds prohibida)
export function YtPreview({
  videoId,
  onError,
  onOk,
}: {
  videoId: string
  onError: (code: number) => void
  onOk?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cbRef = useRef({ onError, onOk })
  cbRef.current = { onError, onOk }

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
        events: {
          onError: (e) => cbRef.current.onError(e.data),
          // El vídeo carga bien cuando pasa a CUED (5), BUFFERING (3), PLAYING (1) o PAUSED (2)
          onStateChange: (e) => {
            if ([1, 2, 3, 5].includes(e.data)) cbRef.current.onOk?.()
          },
        },
      })
    })
    return () => {
      mounted = false
      player?.destroy()
    }
  }, [videoId])

  return <div ref={containerRef} className="aspect-video w-full" />
}

'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          width?: string
          height?: string
          videoId?: string
          playerVars?: Record<string, number | string>
          events?: Record<string, (e: { data: number }) => void>
        },
      ) => {
        loadVideoById: (id: string) => void
        destroy: () => void
      }
      PlayerState: { ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<NonNullable<Window['YT']>> | null = null
function loadYouTubeApi() {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      if (window.YT?.Player) return resolve(window.YT)
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev?.()
        resolve(window.YT!)
      }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    })
  }
  return apiPromise
}

type Props = {
  videoId: string | null
  onEnded: () => void
  onError: () => void
  onAutoplayBlocked: () => void
}

export function KaraokePlayer({ videoId, onEnded, onError, onAutoplayBlocked }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<{ loadVideoById: (id: string) => void } | null>(null)
  const cbRef = useRef({ onEnded, onError, onAutoplayBlocked })
  cbRef.current = { onEnded, onError, onAutoplayBlocked }

  useEffect(() => {
    let mounted = true
    loadYouTubeApi().then((YT) => {
      if (!mounted || !containerRef.current) return
      playerRef.current = new YT.Player(containerRef.current, {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          disablekb: 1,
        },
        events: {
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) cbRef.current.onEnded()
          },
          onError: () => cbRef.current.onError(),
          onAutoplayBlocked: () => cbRef.current.onAutoplayBlocked(),
        },
      })
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (videoId && playerRef.current) {
      playerRef.current.loadVideoById(videoId)
    }
  }, [videoId])

  return <div ref={containerRef} className="h-full w-full" />
}

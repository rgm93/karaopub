'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { QRImage } from '@/components/QRImage'
import { KaraokePlayer } from '@/components/KaraokePlayer'

export default function TvClient({ code }: { code: string }) {
  const { room, requests, loading, notFound } = useRoom(code)

  const [hostKey, setHostKey] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [guestUrl, setGuestUrl] = useState('')
  const nextLock = useRef(false)
  const lastFinished = useRef<string | null>(null)

  useEffect(() => {
    setGuestUrl(`${window.location.origin}/pub-clients/${code}`)
    const k =
      new URLSearchParams(window.location.search).get('k') ??
      localStorage.getItem(`karaopub_host_${code}`)
    if (k) {
      localStorage.setItem(`karaopub_host_${code}`, k)
      setHostKey(k)
    }
  }, [code])

  const current = requests.find((r) => r.id === room?.current_request_id) ?? null
  const queue = requests.filter((r) => r.status === 'queued')
  const nextUp = queue[0] ?? null

  const interludeEnd = room?.interlude_until ? new Date(room.interlude_until).getTime() : null
  const interludeActive = interludeEnd !== null && interludeEnd > now
  const countdown = interludeEnd ? Math.max(0, Math.ceil((interludeEnd - now) / 1000)) : null

  useEffect(() => {
    if (interludeEnd === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [interludeEnd])

  const rpc = useCallback(
    (fn: string, extra: Record<string, unknown> = {}) => {
      if (!hostKey) return Promise.resolve(null)
      return supabase.rpc(fn, { p_code: code, p_host_key: hostKey, ...extra })
    },
    [code, hostKey],
  )

  // Queue engine: when nothing is playing, no interlude is running and there
  // are songs waiting, the TV starts the next one.
  useEffect(() => {
    if (!started || !room || !hostKey) return
    const interludeLive =
      room.interlude_until && new Date(room.interlude_until).getTime() > Date.now()
    if (!room.current_request_id && !interludeLive && queue.length > 0 && !nextLock.current) {
      nextLock.current = true
      rpc('karaoke_start_next')
      setTimeout(() => {
        nextLock.current = false
      }, 2000)
    }
  }, [started, room, hostKey, queue.length, now, rpc])

  const finish = useCallback(
    (outcome: 'done' | 'skipped' | 'error') => {
      if (!current || lastFinished.current === current.id) return
      lastFinished.current = current.id
      rpc('karaoke_finish_current', { p_outcome: outcome })
    },
    [current, rpc],
  )

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Cargando…</main>
  }
  if (notFound || !room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <h1 className="text-2xl font-bold">La sala {code} no existe</h1>
      </main>
    )
  }

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Cabecera ── */}
      <header className="flex items-center justify-between px-8 py-4">
        <h1 className="text-3xl font-black">
          Karao<span className="text-amber-400">Pub</span>
          <span className="ml-4 text-xl font-medium text-zinc-400">{room.name}</span>
        </h1>
        <span className="rounded-xl bg-zinc-800 px-4 py-2 font-mono text-2xl tracking-[0.3em]">
          {code}
        </span>
      </header>

      {/* ── Contenido: cola + QR ── */}
      <div className="flex min-h-0 flex-1 gap-8 px-8 pb-8">
        <section className="flex-1 overflow-hidden">
          <p className="mb-4 text-sm font-bold tracking-[0.3em] text-zinc-500">A CONTINUACIÓN</p>
          {queue.length === 0 && !current && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-4xl font-black text-zinc-300">La cola está vacía</p>
              <p className="mt-3 text-xl text-zinc-500">Escanea el QR y pide la primera canción</p>
            </div>
          )}
          <ol className="space-y-3">
            {queue.slice(0, 8).map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-5 rounded-2xl p-4 ${
                  i === 0 ? 'bg-amber-500/15 ring-1 ring-amber-500/50' : 'bg-zinc-900'
                }`}
              >
                <span
                  className={`w-10 text-center text-3xl font-black ${
                    i === 0 ? 'text-amber-400' : 'text-zinc-600'
                  }`}
                >
                  {i + 1}
                </span>
                {r.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnail_url}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold">{r.singer_name}</p>
                  <p className="truncate text-lg text-zinc-400">{r.title}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex w-72 shrink-0 flex-col items-center justify-center gap-4 rounded-2xl bg-zinc-900 p-6 text-center">
          <div className="rounded-xl bg-white p-3">
            <QRImage url={guestUrl} size={200} />
          </div>
          <p className="text-xl font-bold">Pide tu canción</p>
          <p className="text-sm text-zinc-400">
            Escanea el QR o entra en
            <br />
            <span className="font-mono text-zinc-200">{guestUrl.replace('https://', '')}</span>
          </p>
          {!room.accepting_requests && (
            <p className="rounded-lg bg-red-500/20 px-3 py-1 text-sm text-red-300">
              Peticiones pausadas
            </p>
          )}
        </aside>
      </div>

      {/* ── Overlay: countdown entre turnos ── */}
      {started && interludeActive && !current && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/95 text-center">
          <p className="text-sm font-bold tracking-[0.4em] text-zinc-500">SIGUIENTE TURNO EN</p>
          <p className="my-6 text-[12rem] leading-none font-black text-amber-400 tabular-nums">
            {countdown}
          </p>
          {nextUp ? (
            <>
              <p className="text-4xl font-black">{nextUp.singer_name}</p>
              <p className="mt-2 max-w-2xl truncate text-2xl text-zinc-400">{nextUp.title}</p>
              <p className="mt-6 animate-pulse text-lg text-zinc-500">¡Ve preparando la voz! 🎤</p>
            </>
          ) : (
            <p className="text-2xl text-zinc-400">La cola está vacía — pide tu canción</p>
          )}
        </div>
      )}

      {/* ── Overlay: reproduciendo ── */}
      {started && current && (
        <div className="absolute inset-0 z-30 bg-black">
          <KaraokePlayer
            videoId={current.video_id}
            onEnded={() => finish('done')}
            onError={() => finish('error')}
            onAutoplayBlocked={() => setAutoplayBlocked(true)}
          />
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/90 to-transparent p-8 pt-24">
            <p className="text-sm font-bold tracking-[0.4em] text-amber-400">CANTANDO AHORA</p>
            <p className="mt-1 text-4xl font-black">{current.singer_name}</p>
            <p className="mt-1 truncate text-xl text-zinc-300">{current.title}</p>
            {nextUp && (
              <p className="mt-3 text-sm text-zinc-400">
                Después: {nextUp.singer_name} — {nextUp.title}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Overlay: arranque (desbloquea el autoplay con sonido) ── */}
      {(!started || autoplayBlocked) && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950 text-center">
          <h1 className="text-6xl font-black">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-2 text-2xl text-zinc-400">{room.name}</p>
          <button
            onClick={() => {
              setAutoplayBlocked(false)
              setStarted(true)
            }}
            className="mt-10 rounded-2xl bg-amber-500 px-12 py-5 text-2xl font-black text-zinc-950 hover:bg-amber-400"
          >
            ▶ Empezar la noche
          </button>
          <p className="mt-6 max-w-md text-sm text-zinc-500">
            Pulsa una vez para activar el sonido. A partir de ahí la cola y los vídeos avanzan solos.
          </p>
        </div>
      )}
    </main>
  )
}

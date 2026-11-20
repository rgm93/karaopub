'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { QRImage } from '@/components/QRImage'
import { KaraokePlayer } from '@/components/KaraokePlayer'
import type { PlayerApi } from '@/components/KaraokePlayer'

export default function TvClient({ code }: { code: string }) {
  const { room, requests, bgm, loading, notFound } = useRoom(code)

  const [hostKey, setHostKey] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [doneId, setDoneId] = useState<string | null>(null)
  const [bgmIdx, setBgmIdx] = useState(0)
  const nextLock = useRef(false)
  const lastFinished = useRef<string | null>(null)
  const playerApi = useRef<PlayerApi | null>(null)
  const lastCmdSeq = useRef<number | null>(null)

  useEffect(() => {
    // La URL del QR se compone cuando cargue la sala (necesita pub_id)
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
  const bgmVideo = bgm.length > 0 ? bgm[bgmIdx % bgm.length] : null

  // Media de votos en directo de la canción actual
  const [voteStats, setVoteStats] = useState<{ avg: number; count: number } | null>(null)
  useEffect(() => {
    if (!room?.voting_enabled || !current) {
      setVoteStats(null)
      return
    }
    let alive = true
    const fetchVotes = async () => {
      const { data } = await supabase
        .from('karaoke_votes')
        .select('score')
        .eq('request_id', current.id)
      if (!alive) return
      const scores = (data ?? []).map((v) => v.score)
      setVoteStats(
        scores.length
          ? { avg: scores.reduce((a, b) => a + b, 0) / scores.length, count: scores.length }
          : null,
      )
    }
    fetchVotes()
    const ch = supabase
      .channel(`votes:${current.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'karaoke_votes', filter: `request_id=eq.${current.id}` },
        fetchVotes,
      )
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [current, room?.voting_enabled])
  const guestUrl =
    room?.pub_id && typeof window !== 'undefined'
      ? `${window.location.origin}/${room.pub_id}/join?c=${code}`
      : ''

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
      // Oculta el vídeo al instante aunque la respuesta de la BD se retrase
      setDoneId(current.id)
      const send = () => rpc('karaoke_finish_current', { p_outcome: outcome })
      send().then((res) => {
        if (res?.error) {
          console.error('finish_current falló, reintentando…', res.error)
          setTimeout(send, 1500)
        }
      })
    },
    [current, rpc],
  )

  // Watchdog: si el vídeo se marcó como terminado en local pero la sala
  // sigue en 'playing' (RPC perdido), reintenta hasta que avance.
  useEffect(() => {
    if (!started || !room || !hostKey || !doneId) return
    const t = setInterval(() => {
      if (room.current_request_id === doneId) {
        rpc('karaoke_finish_current', { p_outcome: 'done' })
      }
    }, 4000)
    return () => clearInterval(t)
  }, [started, room, hostKey, doneId, rpc])

  // Comandos del pub: pause / resume / restart
  useEffect(() => {
    if (!room || room.player_cmd_seq === lastCmdSeq.current) return
    lastCmdSeq.current = room.player_cmd_seq
    const api = playerApi.current
    if (!api) return
    if (room.player_cmd === 'pause') api.pause()
    else if (room.player_cmd === 'resume') api.resume()
    else if (room.player_cmd === 'restart') api.restart()
  }, [room])

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">Cargando…</main>
  }
  if (notFound || !room) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-100">
        <h1 className="text-2xl font-bold">La sala {code} no existe</h1>
      </main>
    )
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Cabecera ── */}
      <header className="flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4">
        <h1 className="text-xl font-black lg:text-3xl">
          Karao<span className="text-amber-400">Pub</span>
          <span className="ml-4 hidden text-xl font-medium text-zinc-400 sm:inline">{room.name}</span>
        </h1>
        <span className="rounded-xl bg-zinc-800 px-4 py-2 font-mono text-lg tracking-[0.3em] lg:text-2xl">
          {code}
        </span>
      </header>

      {/* ── Contenido: cola + QR ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 lg:flex-row lg:gap-8 lg:px-8 lg:pb-8">
        <section className="flex-1 overflow-hidden">
          <p className="mb-4 text-sm font-bold tracking-[0.3em] text-zinc-500">A CONTINUACIÓN</p>
          {queue.length === 0 && !current && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-4xl font-black text-zinc-300">La cola está vacía</p>
              <p className="mt-3 text-xl text-zinc-500">Escanea el QR y pide la primera canción</p>
            </div>
          )}
          <ol className="space-y-3 lg:space-y-4">
            {queue.slice(0, 8).map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-2xl p-3 lg:gap-5 lg:p-4 ${
                  i === 0 ? 'bg-amber-500/15 ring-1 ring-amber-500/50' : 'bg-zinc-900'
                }`}
              >
                <span
                  className={`w-10 text-center text-2xl font-black lg:text-3xl ${
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
                    className="h-10 w-16 shrink-0 rounded-lg object-cover lg:h-14 lg:w-24"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold lg:text-2xl">{r.singer_name}</p>
                  <p className="truncate text-sm text-zinc-400 lg:text-lg">{r.title}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex w-full shrink-0 flex-row items-center justify-center gap-5 rounded-2xl bg-zinc-900 p-4 text-center lg:w-96 lg:flex-col lg:gap-6 lg:p-8">
          <div className="rounded-2xl bg-white p-4">
            <QRImage url={guestUrl} size={280} />
          </div>
          <div>
            <p className="text-xl font-bold lg:text-3xl">Pide tu canción</p>
            <p className="mt-2 text-sm text-zinc-400 lg:text-lg">
              Escanea el QR o entra en
              <br />
              <span className="font-mono text-zinc-200">karaopub.vercel.app/join</span>
            </p>
            <p className="mt-3 text-xs text-zinc-500 lg:text-base">
              y escribe el código{' '}
              <span className="font-mono text-lg font-black tracking-[0.3em] text-amber-400 lg:text-2xl">
                {code}
              </span>
            </p>
          </div>
          {!room.accepting_requests && (
            <p className="rounded-lg bg-red-500/20 px-3 py-1 text-sm text-red-300 lg:text-base">
              Peticiones pausadas
            </p>
          )}
        </aside>
      </div>

      {/* ── Overlay: countdown entre turnos ── */}
      {started && interludeActive && !current && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/95 text-center">
          <p className="text-sm font-bold tracking-[0.4em] text-zinc-500">SIGUIENTE TURNO EN</p>
          <p className="my-6 text-8xl leading-none font-black text-amber-400 tabular-nums sm:text-9xl lg:text-[12rem]">
            {countdown}
          </p>
          {nextUp ? (
            <>
              <p className="text-2xl font-black lg:text-4xl">{nextUp.singer_name}</p>
              <p className="mt-2 max-w-2xl truncate text-lg text-zinc-400 lg:text-2xl">{nextUp.title}</p>
              <p className="mt-6 animate-pulse text-base text-zinc-500 lg:text-lg">¡Ve preparando la voz! 🎤</p>
            </>
          ) : (
            <p className="text-2xl text-zinc-400">La cola está vacía — pide tu canción</p>
          )}
        </div>
      )}

      {/* ── Overlay: reproduciendo ── */}
      {started && current && doneId !== current.id && (
        <div className="absolute inset-0 z-30 bg-black">
          <KaraokePlayer
            apiRef={playerApi}
            videoId={current.video_id}
            onEnded={() => finish('done')}
            onError={() => finish('error')}
            onAutoplayBlocked={() => setAutoplayBlocked(true)}
          />
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-24 lg:p-8">
            <p className="text-sm font-bold tracking-[0.4em] text-amber-400">CANTANDO AHORA</p>
            <p className="mt-1 text-2xl font-black lg:text-4xl">{current.singer_name}</p>
            <p className="mt-1 truncate text-base text-zinc-300 lg:text-xl">{current.title}</p>
            {voteStats && (
              <p className="mt-2 text-lg font-bold text-amber-300 lg:text-2xl">
                {'★'.repeat(Math.round(voteStats.avg))}
                <span className="ml-2 text-base text-zinc-300 lg:text-lg">
                  {voteStats.avg.toFixed(1)}/5 · {voteStats.count} voto{voteStats.count === 1 ? '' : 's'}
                </span>
              </p>
            )}
            {nextUp && (
              <p className="mt-3 text-sm text-zinc-400">
                Después: {nextUp.singer_name} — {nextUp.title}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Música de fondo: suena en la espera (countdown / cola vacía) ── */}
      {started && !current && bgmVideo && (
        <div className="absolute right-4 bottom-4 z-30 w-40 overflow-hidden rounded-xl opacity-90 ring-1 ring-zinc-700 lg:w-72">
          <div className="aspect-video bg-black">
            <KaraokePlayer
              videoId={bgmVideo.video_id}
              onEnded={() => setBgmIdx((i) => i + 1)}
              onError={() => setBgmIdx((i) => i + 1)}
              onAutoplayBlocked={() => setAutoplayBlocked(true)}
            />
          </div>
          <p className="truncate bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
            🎵 {bgmVideo.title}
          </p>
        </div>
      )}

      {/* ── Aviso: sin clave la TV no puede avanzar sola ── */}
      {started && !hostKey && (
        <p className="absolute right-0 bottom-0 left-0 z-50 bg-red-600/90 px-4 py-2 text-center text-sm font-bold">
          Sin clave de control — empareja la tele desde el panel del pub o abre el enlace con ?k=
        </p>
      )}

      {/* ── Overlay: arranque (desbloquea el autoplay con sonido) ── */}
      {(!started || autoplayBlocked) && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950 text-center">
          <h1 className="text-4xl font-black sm:text-6xl">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-2 text-lg text-zinc-400 sm:text-2xl">{room.name}</p>
          <button
            onClick={() => {
              setAutoplayBlocked(false)
              setStarted(true)
              document.documentElement.requestFullscreen?.().catch(() => {})
              // La primera canción también pasa por el countdown
              if (room && !room.current_request_id && queue.length > 0) {
                rpc('karaoke_finish_current', { p_outcome: 'done' })
              }
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

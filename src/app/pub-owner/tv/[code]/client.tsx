'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { QRImage } from '@/components/QRImage'
import { KaraokePlayer } from '@/components/KaraokePlayer'
import type { PlayerApi } from '@/components/KaraokePlayer'

export default function TvClient({ code }: { code: string }) {
  const { room, requests, bgm, loading, notFound, refresh } = useRoom(code)

  const [hostKey, setHostKey] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [doneId, setDoneId] = useState<string | null>(null)
  const [bgmIdx, setBgmIdx] = useState(() => Math.floor(Math.random() * 1000))
  const [engineErr, setEngineErr] = useState('')
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

  // Red de seguridad: si el canal realtime se cae, refresco cada 30s
  useEffect(() => {
    const t = setInterval(() => refresh(), 30000)
    return () => clearInterval(t)
  }, [refresh])

  // Queue engine: when nothing is playing, no interlude is running and there
  // are songs waiting, the TV starts the next one.
  useEffect(() => {
    if (!started || !room || !hostKey) return
    const interludeLive =
      room.interlude_until && new Date(room.interlude_until).getTime() > Date.now()
    if (!room.current_request_id && !interludeLive && queue.length > 0 && !nextLock.current) {
      nextLock.current = true
      rpc('karaoke_start_next').then((res) => {
        if (res?.error) setEngineErr(`start_next: ${res.error.message}`)
        else setEngineErr('')
      })
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
          setEngineErr(`finish_current: ${res.error.message}`)
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

  // Publica qué tema de fondo suena (para TV y clientes)
  const bgmPublished = useRef<string | null>(null)
  useEffect(() => {
    const title = started && !current && bgmVideo ? bgmVideo.title : null
    const key = `${title ?? ''}|${bgmVideo?.video_id ?? ''}`
    if (key === bgmPublished.current || !hostKey) return
    bgmPublished.current = key
    rpc('karaoke_bgm_now', { p_title: title ?? '', p_video_id: bgmVideo?.video_id ?? '' })
  }, [started, current, bgmVideo, hostKey, rpc])

  // Comandos del pub: pause / resume / restart
  useEffect(() => {
    if (!room || room.player_cmd_seq === lastCmdSeq.current) return
    lastCmdSeq.current = room.player_cmd_seq
    const api = playerApi.current
    if (!api) return
    if (room.player_cmd === 'pause') api.pause()
    else if (room.player_cmd === 'resume') api.resume()
    else if (room.player_cmd === 'restart') api.restart()
    else if (room.player_cmd === 'nearend') api.nearEnd()
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
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-10 lg:py-5">
        <h1 className="min-w-0 text-xl font-black lg:text-4xl">
          Karao<span className="text-amber-400">Pub</span>
          <span className="ml-4 hidden text-xl font-medium text-zinc-400 sm:inline lg:text-2xl">{room.name}</span>
        </h1>
        <span className="shrink-0 rounded-xl bg-zinc-800 px-4 py-2 font-mono text-lg tracking-[0.3em] lg:text-3xl">
          {code}
        </span>
      </header>

      {/* ── Contenido: cola + QR ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 lg:flex-row lg:gap-8 lg:px-8 lg:pb-8">
        <section className="min-w-0 flex-1 overflow-hidden">
          <p className="mb-4 text-sm font-bold tracking-[0.3em] text-zinc-500 lg:text-lg">A CONTINUACIÓN</p>
          {queue.length === 0 && !current && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-6xl lg:text-8xl">🎤</p>
              <p className="mt-4 text-4xl font-black text-zinc-300 lg:text-6xl">La cola está vacía</p>
              <p className="mt-3 text-xl text-zinc-500 lg:text-3xl">Escanea el QR y pide la primera canción</p>
            </div>
          )}
          <ol className="space-y-3 lg:space-y-4">
            {queue.slice(0, 8).map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-2xl p-3 lg:gap-6 lg:p-5 ${
                  i === 0 ? 'bg-amber-500/15 ring-1 ring-amber-500/50' : 'bg-zinc-900'
                }`}
              >
                <span
                  className={`w-10 text-center text-2xl font-black lg:w-14 lg:text-5xl ${
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
                    className="h-10 w-16 shrink-0 rounded-lg object-cover lg:h-20 lg:w-32"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold lg:text-4xl">{r.singer_name}</p>
                  <p className="truncate text-sm text-zinc-400 lg:text-2xl">{r.title}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex w-full min-w-0 shrink-0 flex-row items-center justify-center gap-5 overflow-hidden rounded-2xl bg-zinc-900 p-4 text-center lg:w-1/2 lg:flex-col lg:gap-10 lg:p-10">
          <div className="w-full max-w-[440px] shrink-0 rounded-2xl bg-white p-5 [&_img]:h-auto [&_img]:w-full">
            <QRImage url={guestUrl} size={420} />
          </div>
          <div>
            <p className="text-xl font-bold lg:text-6xl">Pide tu canción</p>
            <p className="mt-2 text-sm text-zinc-400 lg:mt-6 lg:text-3xl">
              Escanea el QR o entra en
              <br />
              <span className="font-mono text-zinc-200">karaopub.vercel.app/join</span>
            </p>
            <p className="mt-3 text-xs text-zinc-500 lg:mt-6 lg:text-2xl">y escribe el código</p>
            <p className="mt-3 font-mono text-lg font-black tracking-[0.3em] text-amber-400 lg:mt-5 lg:text-7xl">
              {code}
            </p>
          </div>
          {!room.accepting_requests && (
            <p className="rounded-lg bg-red-500/20 px-3 py-1 text-sm text-red-300 lg:px-6 lg:py-3 lg:text-2xl">
              Peticiones pausadas
            </p>
          )}
        </aside>
      </div>

      {/* ── Interludio: la cola sigue visible con barra de progreso ── */}
      {started && interludeActive && !current && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-zinc-950/95 to-transparent px-6 pt-20 pb-6 text-center lg:px-12">
          {nextUp ? (
            <>
              <p className="text-xs font-bold tracking-[0.4em] text-amber-400 lg:text-base">
                SIGUIENTE TURNO
              </p>
              <p className="mt-2 text-3xl font-black lg:text-6xl">{nextUp.singer_name}</p>
              <p className="mt-1 truncate text-lg text-zinc-400 lg:text-3xl">{nextUp.title}</p>
            </>
          ) : (
            <p className="text-xl text-zinc-400 lg:text-3xl">
              Cola vacía — ¡pide tu canción y serás el siguiente!
            </p>
          )}
          {nextUp && (
          <div className="mx-auto mt-5 flex max-w-4xl items-center gap-4 lg:max-w-5xl">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-800 lg:h-5">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-300 ease-linear"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (1 - (countdown ?? 0) / Math.max(1, room.interlude_seconds)) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
            <span className="w-16 shrink-0 font-mono text-3xl font-black text-amber-400 tabular-nums lg:w-24 lg:text-6xl">
              {countdown}
            </span>
          </div>
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
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-24 lg:p-10">
            <p className="text-sm font-bold tracking-[0.4em] text-amber-400 lg:text-lg">CANTANDO AHORA</p>
            <p className="mt-1 text-2xl font-black lg:text-5xl">{current.singer_name}</p>
            <p className="mt-1 truncate text-base text-zinc-300 lg:text-3xl">{current.title}</p>
            {voteStats && (
              <p className="mt-2 text-lg font-bold text-amber-300 lg:text-3xl">
                {'★'.repeat(Math.round(voteStats.avg))}
                <span className="ml-2 text-base text-zinc-300 lg:text-2xl">
                  {voteStats.avg.toFixed(1)}/5 · {voteStats.count} voto{voteStats.count === 1 ? '' : 's'}
                </span>
              </p>
            )}
            {nextUp && (
              <p className="mt-3 text-sm text-zinc-400 lg:text-xl">
                Después: {nextUp.singer_name} — {nextUp.title}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Música de fondo: solo audio; el título se muestra discreto ── */}
      {started && !current && bgmVideo && (
        <>
          <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
            <KaraokePlayer
              videoId={bgmVideo.video_id}
              onEnded={() =>
                setBgmIdx((i) =>
                  bgm.length <= 1 ? 0 : (i + 1 + Math.floor(Math.random() * (bgm.length - 1))) % bgm.length,
                )
              }
              onError={() =>
                setBgmIdx((i) =>
                  bgm.length <= 1 ? 0 : (i + 1 + Math.floor(Math.random() * (bgm.length - 1))) % bgm.length,
                )
              }
              onAutoplayBlocked={() => setAutoplayBlocked(true)}
            />
          </div>
          <p className="absolute bottom-3 left-4 z-10 max-w-md truncate rounded-lg bg-zinc-950/80 px-3 py-1.5 text-xs text-zinc-400 lg:bottom-5 lg:left-6 lg:max-w-xl lg:text-xl">
            🎵 Suena de fondo: {bgmVideo.title}
          </p>
        </>
      )}

      {/* ── Aviso: error del motor / sin clave ── */}
      {(engineErr || (started && !hostKey)) && (
        <p className="absolute top-16 right-4 left-4 z-50 rounded-xl bg-red-600/90 px-4 py-2 text-center text-sm font-bold lg:top-20">
          {engineErr ||
            'Sin clave de control — empareja la tele desde el panel del pub o abre el enlace con ?k='}
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { QRImage } from '@/components/QRImage'
import { Logo } from '@/components/Logo'
import { KaraokePlayer } from '@/components/KaraokePlayer'
import type { PlayerApi } from '@/components/KaraokePlayer'
import { cleanTitle } from '@/lib/cleanTitle'

export default function TvClient({ code }: { code: string }) {
  const router = useRouter()
  const { room, requests, bgm, loading, notFound, refresh } = useRoom(code)

  const [hostKey, setHostKey] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [coverUntil, setCoverUntil] = useState(0)
  const [doneId, setDoneId] = useState<string | null>(null)
  const [bgmId, setBgmId] = useState<string | null>(null)
  const [engineErr, setEngineErr] = useState('')
  const nextLock = useRef(false)
  const lastFinished = useRef<string | null>(null)
  const playerApi = useRef<PlayerApi | null>(null)
  const bgmApi = useRef<PlayerApi | null>(null)
  const lastCmdSeq = useRef<number | null>(null)
  const lastBgmCmdSeq = useRef<number | null>(null)

  // Lienzo 1366×768 escalado al área visible real (scale-to-fit automático):
  // 1) usa visualViewport (excluye barras del navegador de la tele)
  // 2) factor tv_zoom de la sala (el pub lo calibra desde la cabina, 0.94 por defecto)
  // 3) mide el resultado y lo reduce en pasos si aún sobresale (overscan, zoom…)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const tvZoom = room?.tv_zoom ?? 0.94
  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport
      // Área visible real: visualViewport excluye barras del navegador de la tele;
      // offsetLeft/Top dan su posición por si el área no empieza en (0,0)
      const vx = vv?.offsetLeft ?? 0
      const vy = vv?.offsetTop ?? 0
      const vw = vv?.width ?? window.innerWidth
      const vh = vv?.height ?? window.innerHeight
      let s = Math.min(vw / 1366, vh / 768) * tvZoom
      const el = canvasRef.current
      if (el) {
        el.style.left = `${vx + vw / 2}px`
        el.style.top = `${vy + vh / 2}px`
      }
      setScale(s)
      // auto-ajuste medido: tras aplicar la escala, si el lienzo sobresale del área
      // visible, lo va reduciendo un 4% por paso hasta que quepa (mín. 0.5×)
      requestAnimationFrame(() => {
        if (!el) return
        for (let i = 0; i < 10 && s > 0.5; i++) {
          const r = el.getBoundingClientRect()
          if (r.left >= vx && r.top >= vy && r.right <= vx + vw && r.bottom <= vy + vh) break
          s *= 0.96
          el.style.transform = `translate(-50%, -50%) scale(${s})`
        }
        setScale(s)
      })
    }
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [tvZoom])

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

  // Traspaso automático: si el pub abre una sesión nueva, esta tele salta sola
  // a la sala activa (mismo pub) cada 15s — sin reemparejar
  useEffect(() => {
    if (!hostKey) return
    const iv = setInterval(async () => {
      const { data } = await supabase.rpc('karaoke_tv_handoff', {
        p_code: code,
        p_host_key: hostKey,
      })
      const next = (data?.[0] ?? null) as { code: string; host_key: string } | null
      if (next && next.code !== code) {
        localStorage.setItem(`karaopub_host_${next.code}`, next.host_key)
        router.replace(`/pub-owner/tv/${next.code}?k=${next.host_key}`)
      }
    }, 15000)
    return () => clearInterval(iv)
  }, [code, hostKey, router])

  const current = requests.find((r) => r.id === room?.current_request_id) ?? null
  const queue = requests.filter((r) => r.status === 'queued')
  const nextUp = queue[0] ?? null
  const bgmVideo = (bgmId && bgm.find((t) => t.id === bgmId)) || bgm[0] || null
  const nextBgm = useCallback(() => {
    setBgmId(() => {
      if (bgm.length === 0) return null
      if (bgm.length === 1) return bgm[0].id
      if (room && !room.bgm_shuffle) {
        const i = bgm.findIndex((t) => t.id === bgmVideo?.id)
        return bgm[(i + 1) % bgm.length].id
      }
      const others = bgm.filter((t) => t.id !== bgmVideo?.id)
      return others[Math.floor(Math.random() * others.length)].id
    })
  }, [bgm, bgmVideo, room])

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
  }, [current?.id, room?.voting_enabled])
  const guestUrl =
    room?.pub_id && typeof window !== 'undefined'
      ? `${window.location.origin}/${room.pub_id}/join?c=${code}`
      : ''

  const interludeEnd = room?.interlude_until ? new Date(room.interlude_until).getTime() : null
  const interludeActive = interludeEnd !== null && interludeEnd > now
  const countdown = interludeEnd ? Math.max(0, Math.ceil((interludeEnd - now) / 1000)) : null

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interludeEnd ? 250 : 1000)
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

  // Portada anti-título de YouTube: los primeros segundos de cada canción el
  // embed muestra la tarjeta con el título original — la tapamos con una franja
  // negra arriba (nuestra info propia va por la tarjeta de la esquina)
  const currentId = current?.id ?? null
  useEffect(() => {
    if (currentId) setCoverUntil(Date.now() + 7000)
  }, [currentId])

  // Queue engine: when nothing is playing, no interlude is running and there
  // are songs waiting, the TV starts the next one. Si la cola estaba vacía,
  // primero abre el interludio para que el cantante se prepare.
  const prevQueueLen = useRef(0)
  useEffect(() => {
    if (!started || !room || !hostKey) return
    const interludeLive =
      room.interlude_until && new Date(room.interlude_until).getTime() > Date.now()
    if (!room.current_request_id && !interludeLive && queue.length > 0 && !nextLock.current) {
      nextLock.current = true
      if (prevQueueLen.current === 0) {
        rpc('karaoke_finish_current', { p_outcome: 'done' }).then((res) => {
          if (res?.error) setEngineErr(`finish_current: ${res.error.message}`)
          else setEngineErr('')
        })
      } else {
        rpc('karaoke_start_next').then((res) => {
          if (res?.error) setEngineErr(`start_next: ${res.error.message}`)
          else setEngineErr('')
        })
      }
      setTimeout(() => {
        nextLock.current = false
      }, 2000)
    }
    prevQueueLen.current = queue.length
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
    rpc('karaoke_bgm_now', { p_title: title ?? '', p_video_id: bgmVideo?.video_id ?? '' }).then(
      (res) => {
        if (res?.error) {
          console.error('bgm_now falló', res.error)
          setEngineErr(`bgm_now: ${res.error.message}`)
        }
      },
    )
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

  // Volúmenes independientes: karaoke vs música de fondo (ajustables desde cabina)
  useEffect(() => {
    playerApi.current?.setVolume(room?.karaoke_volume ?? 100)
  }, [room?.karaoke_volume, current?.id])
  useEffect(() => {
    bgmApi.current?.setVolume(room?.bgm_volume ?? 55)
  }, [room?.bgm_volume, bgmVideo?.id])

  // El pub pide sonar un tema de fondo concreto
  const lastBgmPlaySeq = useRef<number | null>(null)
  useEffect(() => {
    if (!room) return
    if (lastBgmPlaySeq.current === null) {
      lastBgmPlaySeq.current = room.bgm_play_seq
      return
    }
    if (room.bgm_play_seq === lastBgmPlaySeq.current) return
    lastBgmPlaySeq.current = room.bgm_play_seq
    if (room.bgm_play_id && bgm.some((t) => t.id === room.bgm_play_id)) {
      setBgmId(room.bgm_play_id)
    }
  }, [room, bgm])

  // Comandos del pub sobre la música de fondo: pause / resume
  useEffect(() => {
    if (!room) return
    if (lastBgmCmdSeq.current === null) {
      lastBgmCmdSeq.current = room.bgm_cmd_seq
      return
    }
    if (room.bgm_cmd_seq === lastBgmCmdSeq.current) return
    lastBgmCmdSeq.current = room.bgm_cmd_seq
    if (room.bgm_cmd === 'pause') bgmApi.current?.pause()
    else if (room.bgm_cmd === 'resume') bgmApi.current?.resume()
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
    <main className="relative h-dvh w-full overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        ref={canvasRef}
        className="fixed left-1/2 top-1/2 flex h-[768px] w-[1366px] flex-col overflow-hidden"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
      {/* ── Cabecera ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-10 py-5">
        <h1 className="flex min-w-0 items-center gap-4 text-4xl font-black">
          <Logo className="h-7 w-auto" />
          <span>Karao<span className="text-amber-400">Pub</span></span>
          <span className="ml-4 flex items-center gap-3 text-2xl font-medium text-zinc-400">
            {room.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={room.logo_url} alt="" className="h-9 w-auto rounded-lg" />
            )}
            {room.name}
          </span>
        </h1>
        {room.promo_text && (
          <p className="max-w-[760px] rounded-2xl bg-amber-500/15 px-6 py-2.5 text-center text-2xl font-black text-amber-300 ring-1 ring-amber-500/40">
            {room.promo_text}
          </p>
        )}
      </header>

      {/* ── Cuenta atrás: tira a todo lo ancho bajo la cabecera,
          fuera de las columnas — la cola y el QR se ven completos ── */}
      {started && interludeActive && !current && nextUp && (
        <div className="mx-8 mb-6 flex items-center gap-6 rounded-2xl bg-zinc-900 px-6 py-3 ring-1 ring-amber-500/40">
          <p className="font-mono text-5xl font-black tabular-nums text-amber-400">
            {countdown}
          </p>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.4em] text-amber-400">
              SIGUIENTE TURNO
            </p>
            <p className="truncate text-2xl font-black">
              {nextUp.singer_name}
              <span className="font-normal text-zinc-400">
                {' '}
                · {cleanTitle(nextUp.title)}
              </span>
            </p>
          </div>
          <div className="h-3 w-72 shrink-0 overflow-hidden rounded-full bg-zinc-800">
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
        </div>
      )}

      {/* ── Contenido: cola + QR ── */}
      <div className="flex min-h-0 flex-1 flex-row gap-8 px-8 pb-8">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <p className="mb-4 text-lg font-bold tracking-[0.3em] text-zinc-500">A CONTINUACIÓN</p>
          {queue.length === 0 && !current && (
            <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
              <p className="text-8xl">🎤</p>
              <p className="mt-4 text-6xl font-black text-zinc-300">La cola está vacía</p>
              <p className="mt-3 text-3xl text-zinc-500">Escanea el QR y pide la primera canción</p>
            </div>
          )}
          <ol className="min-h-0 flex-1 space-y-4 overflow-hidden">
            {queue.slice(0, 8).map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-6 rounded-2xl p-5 ${
                  i === 0 && !current
                    ? 'bg-amber-500/15 ring-1 ring-amber-500/50'
                    : 'bg-zinc-900'
                }`}
              >
                <span
                  className={`w-14 text-center text-5xl font-black ${
                    i === 0 && !current ? 'text-amber-400' : 'text-zinc-600'
                  }`}
                >
                  {i + 1}
                </span>
                {r.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnail_url}
                    alt=""
                    className="h-20 w-32 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-4xl font-bold">
                    {r.is_celebration && '🎉 '}
                    {r.singer_name}
                  </p>
                  <p className="truncate text-2xl text-zinc-400">{cleanTitle(r.title)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex w-1/2 min-w-0 shrink-0 flex-col items-center justify-center gap-6 overflow-hidden rounded-2xl bg-zinc-900 p-8 text-center">
          <div className="w-full max-w-[300px] shrink-0 rounded-2xl bg-white p-4">
            <QRImage url={guestUrl} size={280} />
          </div>
          <div>
            <p className="text-5xl font-bold">Pide tu canción</p>
            <p className="mt-4 text-xl text-zinc-400">
              Escanea el QR o entra en{' '}
              <span className="font-mono text-zinc-200">karaopub.vercel.app/join</span>
            </p>
            <p className="mt-4 text-lg text-zinc-500">y escribe el código</p>
            <p className="mt-3 font-mono text-5xl font-black tracking-[0.3em] text-amber-400">
              {code}
            </p>
          </div>
          {!room.accepting_requests && (
            <p className="rounded-lg bg-red-500/20 px-6 py-3 text-2xl text-red-300">
              Peticiones pausadas
            </p>
          )}
        </aside>
      </div>

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
          {/* Tapa la tarjeta de título que YouTube muestra al empezar */}
          {now < coverUntil && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-black" />
          )}
          {/* Info compacta arriba-izquierda: no tapa la letra del karaoke */}
          <div className="pointer-events-none absolute left-0 top-0 max-w-[620px] rounded-br-2xl bg-black/70 p-5">
            {current.is_celebration ? (
              <p className="text-sm font-bold tracking-[0.3em] text-pink-400">
                🎉 CELEBRACIÓN{current.celebration_text ? ` · ${current.celebration_text}` : ''}
              </p>
            ) : (
              <p className="text-sm font-bold tracking-[0.3em] text-amber-400">CANTANDO AHORA</p>
            )}
            <p className="mt-1 truncate text-3xl font-black">{current.singer_name}</p>
            <p className="truncate text-lg text-zinc-300">{cleanTitle(current.title)}</p>
            {voteStats && (
              <p className="mt-1 text-xl font-bold text-amber-300">
                {'★'.repeat(Math.round(voteStats.avg))}
                <span className="ml-2 text-base text-zinc-300">
                  {voteStats.avg.toFixed(1)}/5 · {voteStats.count} voto{voteStats.count === 1 ? '' : 's'}
                </span>
              </p>
            )}
            {nextUp && (
              <p className="mt-2 truncate text-base text-zinc-400">
                Después: {nextUp.singer_name} — {cleanTitle(nextUp.title)}
              </p>
            )}
          </div>
          {current.applause > 0 && (
            <div className="pointer-events-none absolute top-8 right-8 rounded-2xl bg-black/70 px-6 py-4 text-center">
              <p className="text-5xl">👏</p>
              <p className="mt-1 text-3xl font-black text-amber-400">{current.applause}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Música de fondo: solo audio; el título se muestra discreto ── */}
      {started && !current && bgmVideo && (
        <>
          <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
            <KaraokePlayer
              apiRef={bgmApi}
              videoId={bgmVideo.video_id}
              onEnded={nextBgm}
              onError={nextBgm}
              onAutoplayBlocked={() => setAutoplayBlocked(true)}
            />
          </div>
          {/* Línea discreta abajo-izquierda, bajo la columna de la cola */}
          <p className="absolute bottom-1 left-10 z-30 max-w-[44%] truncate rounded-lg bg-zinc-950/80 px-4 py-1 text-lg text-zinc-400">
            🎵 Suena de fondo: {cleanTitle(bgmVideo.title)}
          </p>
        </>
      )}

      {/* ── Aviso: error del motor / sin clave ── */}
      {(engineErr || (started && !hostKey)) && (
        <p className="absolute top-20 right-4 left-4 z-50 rounded-xl bg-red-600/90 px-4 py-2 text-center text-sm font-bold">
          {engineErr ||
            'Sin clave de control — empareja la tele desde el panel del pub o abre el enlace con ?k='}
        </p>
      )}

      {/* ── Overlay: arranque (desbloquea el autoplay con sonido) ── */}
      {(!started || autoplayBlocked) && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950/85 text-center backdrop-blur-sm">
          <Logo className="h-16 w-auto" />
          <h1 className="mt-2 text-6xl font-black">
            <span>Karao<span className="text-amber-400">Pub</span></span>
          </h1>
          <p className="mt-2 text-2xl text-zinc-400">{room.name}</p>
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
            Un toque para activar el sonido (los navegadores bloquean el audio automático).
            Después la cola y los vídeos avanzan solos.
          </p>
        </div>
      )}
      </div>
    </main>
  )
}

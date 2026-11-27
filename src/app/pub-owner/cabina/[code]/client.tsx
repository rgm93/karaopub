'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { QRImage } from '@/components/QRImage'
import { Logo } from '@/components/Logo'
import { cleanTitle } from '@/lib/cleanTitle'

export default function CabinaClient({ code }: { code: string }) {
  const { room, requests, bgm, loading, notFound } = useRoom(code)

  const [hostKey, setHostKey] = useState<string | null>(null)
  const [tvUrl, setTvUrl] = useState('')
  const [msg, setMsg] = useState('')
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [ranking, setRanking] = useState<
    { id: string; singer: string; title: string; avg: number; count: number }[]
  >([])
  const [bgmQuery, setBgmQuery] = useState('')
  const [bgmResults, setBgmResults] = useState<
    { videoId: string; title: string; channel: string }[]
  >([])
  const [bgmSearching, setBgmSearching] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [promo, setPromo] = useState<string | null>(null)
  const [kVol, setKVol] = useState<number | null>(null)
  const [bVol, setBVol] = useState<number | null>(null)
  const [closeTime, setCloseTime] = useState('')

  useEffect(() => {
    const k =
      new URLSearchParams(window.location.search).get('k') ??
      localStorage.getItem(`karaopub_host_${code}`)
    if (k) {
      localStorage.setItem(`karaopub_host_${code}`, k)
      setHostKey(k)
      setTvUrl(`${window.location.origin}/pub-owner/tv/${code}?k=${k}`)
    }
  }, [code])

  const rpc = useCallback(
    async (fn: string, extra: Record<string, unknown> = {}) => {
      if (!hostKey) return
      setMsg('')
      const { error } = await supabase.rpc(fn, {
        p_code: code,
        p_host_key: hostKey,
        ...extra,
      })
      if (error) setMsg('Acción no permitida — ¿clave de sala correcta?')
    },
    [code, hostKey],
  )

  // Ranking de votos (modo concurso)
  useEffect(() => {
    if (!room?.voting_enabled) return
    let alive = true
    const load = async () => {
      const [{ data: votes }, { data: reqs }] = await Promise.all([
        supabase.from('karaoke_votes').select('request_id, score').eq('room_id', room.id),
        supabase.from('karaoke_requests').select('id, singer_name, title').eq('room_id', room.id),
      ])
      if (!alive) return
      const sums = new Map<string, { sum: number; count: number }>()
      for (const v of votes ?? []) {
        const m = sums.get(v.request_id) ?? { sum: 0, count: 0 }
        m.sum += v.score
        m.count += 1
        sums.set(v.request_id, m)
      }
      setRanking(
        (reqs ?? [])
          .filter((r) => sums.has(r.id))
          .map((r) => ({
            id: r.id,
            singer: r.singer_name,
            title: r.title,
            avg: sums.get(r.id)!.sum / sums.get(r.id)!.count,
            count: sums.get(r.id)!.count,
          }))
          .sort((a, b) => b.avg - a.avg || b.count - a.count),
      )
    }
    load()
  }, [room?.id, room?.voting_enabled, requests])

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
  if (!hostKey) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <h1 className="text-2xl font-bold">Cabina de {room.name}</h1>
        <p className="max-w-sm text-sm text-zinc-400">
          Necesitas el enlace completo con la clave de la sala (el que se generó al crearla).
        </p>
      </main>
    )
  }

  const current = requests.find((r) => r.id === room.current_request_id) ?? null
  const queue = requests.filter((r) => r.status === 'queued')
  const guestUrl =
    room.pub_id && typeof window !== 'undefined'
      ? `${window.location.origin}/${room.pub_id}/join?c=${code}`
      : ''

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 bg-zinc-950 p-5 text-zinc-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Logo className="h-5 w-auto" /> Cabina · {room.name}
          </h1>
          <p className="font-mono text-sm tracking-[0.3em] text-zinc-400">{code}</p>
        </div>
        <a
          href="/pub-owner"
          className="shrink-0 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold hover:bg-zinc-700"
        >
          ← Panel
        </a>
      </header>

      {msg && <p className="rounded-xl bg-red-500/20 p-3 text-sm text-red-300">{msg}</p>}

      {/* Estado actual */}
      <section className="rounded-2xl bg-zinc-900 p-4">
        <p className="text-xs font-bold tracking-widest text-zinc-500">SONANDO AHORA</p>
        {current ? (
          <div className="mt-2 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{current.singer_name}</p>
                <p className="truncate text-sm text-zinc-400">{cleanTitle(current.title)}</p>
              </div>
              <button
                onClick={() => rpc('karaoke_finish_current', { p_outcome: 'skipped' })}
                className="shrink-0 rounded-xl bg-red-500/80 px-4 py-2 font-bold hover:bg-red-500 disabled:opacity-40"
              >
                ⏭ Saltar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'pause' })}
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ⏸ Pausar
              </button>
              <button
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'resume' })}
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ▶ Reanudar
              </button>
              <button
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'restart' })}
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ↺ De 0
              </button>
              <button
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'nearend' })}
                title="Salta a 5 segundos del final (pruebas)"
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ⏩ −5s
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">
            {room.interlude_until ? 'Cuenta atrás entre turnos…' : 'Nadie cantando ahora.'}
          </p>
        )}
      </section>

      {/* Controles de sala */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={() => rpc('karaoke_start_next')}
          className="rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          ▶ Siguiente ahora
        </button>
        <button
          onClick={() => rpc('karaoke_set_accepting', { p_value: !room.accepting_requests })}
          className="rounded-xl bg-zinc-800 py-3 font-bold hover:bg-zinc-700 disabled:opacity-40"
        >
          {room.accepting_requests ? '⏸ Pausar peticiones' : '▶ Reanudar peticiones'}
        </button>
        <button
          disabled={queue.length === 0}
          onClick={() => {
            if (confirm('¿Vaciar toda la cola?')) rpc('karaoke_clear_queue')
          }}
          className="col-span-2 rounded-xl bg-zinc-800 py-3 font-bold text-red-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          🗑 Vaciar cola ({queue.length})
        </button>
      </section>

      {/* Ajustes de la noche */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-4">
        <p className="text-xs font-bold tracking-widest text-zinc-500">✨ LA NOCHE</p>

        <button
          onClick={async () => {
            const { error } = await supabase.rpc('karaoke_add_house', {
              p_code: code,
              p_host_key: hostKey,
            })
            if (error)
              setMsg(
                error.message === 'no_history'
                  ? 'Sin historial: canta alguien primero y luego el señuelo repite éxitos.'
                  : 'No se pudo añadir la canción de la casa.',
              )
          }}
          className="w-full rounded-xl bg-zinc-800 py-3 font-bold hover:bg-zinc-700 disabled:opacity-40"
        >
          🏠 Meter una canción de la casa (rompe el hielo)
        </button>

        <div>
          <label className="text-sm font-bold text-zinc-300">
            📢 Promo en la tele (interludios y cola vacía)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={promo ?? room.promo_text}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="p. ej. 2×1 en cervezas hasta las 22h"
              maxLength={140}
              className="min-w-0 flex-1 rounded-xl bg-zinc-800 px-4 py-2 text-sm outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={() => rpc('karaoke_set_promo', { p_text: promo ?? '' })}
              className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">
            🔊 Volumen karaoke · {kVol ?? room.karaoke_volume}%
            <input
              type="range"
              min={0}
              max={100}
              value={kVol ?? room.karaoke_volume}
              onChange={(e) => setKVol(Number(e.target.value))}
              onPointerUp={() => {
                if (kVol !== null)
                  rpc('karaoke_set_volumes', {
                    p_karaoke: kVol,
                    p_bgm: bVol ?? room.bgm_volume,
                  })
              }}
              className="mt-2 w-full accent-amber-500"
            />
          </label>
          <label className="text-sm text-zinc-300">
            🎵 Volumen fondo · {bVol ?? room.bgm_volume}%
            <input
              type="range"
              min={0}
              max={100}
              value={bVol ?? room.bgm_volume}
              onChange={(e) => setBVol(Number(e.target.value))}
              onPointerUp={() => {
                if (bVol !== null)
                  rpc('karaoke_set_volumes', {
                    p_karaoke: kVol ?? room.karaoke_volume,
                    p_bgm: bVol,
                  })
              }}
              className="mt-2 w-full accent-amber-500"
            />
          </label>
        </div>

        <div>
          <label className="text-sm font-bold text-zinc-300">
            ⏰ Cerrar peticiones automáticamente
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              className="rounded-xl bg-zinc-800 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              disabled={!closeTime}
              onClick={() => {
                const [h, m] = closeTime.split(':').map(Number)
                const d = new Date()
                d.setHours(h, m, 0, 0)
                rpc('karaoke_set_close_at', { p_close_at: d.toISOString() })
              }}
              className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
            >
              Fijar
            </button>
            {room.requests_close_at && (
              <button
                onClick={() => rpc('karaoke_set_close_at', { p_close_at: null })}
                className="rounded-xl bg-red-500/15 px-4 py-2 text-sm text-red-300 hover:bg-red-500/25"
              >
                Quitar (
                {new Date(room.requests_close_at).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                )
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Cola */}
      <section>
        <p className="mb-2 text-sm font-bold tracking-widest text-zinc-400">
          🎤 EN COLA ({queue.length})
        </p>
        <ol className="space-y-3">
          {queue.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
              <div className="flex w-8 flex-col">
                <button
                  disabled={i === 0}
                  onClick={() => rpc('karaoke_move', { p_request_id: r.id, p_dir: 'up' })}
                  title="Subir en la cola"
                  className="rounded-t-lg bg-zinc-800 px-2 py-1 text-xs leading-none hover:bg-zinc-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  disabled={i === queue.length - 1}
                  onClick={() => rpc('karaoke_move', { p_request_id: r.id, p_dir: 'down' })}
                  title="Bajar en la cola"
                  className="mt-0.5 rounded-b-lg bg-zinc-800 px-2 py-1 text-xs leading-none hover:bg-zinc-700 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              {r.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail_url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.singer_name}</p>
                <p className="truncate text-xs text-zinc-400">{cleanTitle(r.title)}</p>
              </div>
              <button
                onClick={() => {
                  const on = !r.is_celebration
                  const txt = on ? (prompt('¿Qué se celebra? (ej: Cumple de Laura)') ?? '') : ''
                  rpc('karaoke_celebrate', { p_request_id: r.id, p_on: on, p_text: txt })
                }}
                title={r.is_celebration ? 'Quitar celebración' : 'Marcar celebración 🎉'}
                className={`rounded-lg px-3 py-2 disabled:opacity-40 ${
                  r.is_celebration ? 'bg-pink-500/30' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                🎉
              </button>
              <button
                onClick={() => rpc('karaoke_play_now', { p_request_id: r.id })}
                title="Reproducir ahora"
                className="rounded-lg bg-zinc-800 px-3 py-2 hover:bg-zinc-700 disabled:opacity-40"
              >
                ▶
              </button>
              <button
                onClick={() => rpc('karaoke_remove', { p_request_id: r.id })}
                title="Quitar de la cola"
                className="rounded-lg bg-zinc-800 px-3 py-2 text-red-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          ))}
          {queue.length === 0 && <p className="text-sm text-zinc-500">Cola vacía.</p>}
        </ol>
      </section>

      {/* Ranking modo concurso */}
      {room.voting_enabled && ranking.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold tracking-widest text-zinc-500">
            🏆 RANKING DE LA NOCHE
          </p>
          <ol className="space-y-2">
            {ranking.slice(0, 10).map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
                <span className="w-6 text-center font-black text-zinc-500">
                  {['🥇', '🥈', '🥉'][i] ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.singer}</p>
                  <p className="truncate text-xs text-zinc-400">{cleanTitle(r.title)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-amber-400">{r.avg.toFixed(1)} ★</p>
                  <p className="text-xs text-zinc-500">{r.count} votos</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Música de fondo: suena en la TV mientras nadie canta */}
      <section className="rounded-2xl bg-zinc-900 p-4">
        <p className="text-xs font-bold tracking-widest text-zinc-500">
          🎵 MÚSICA DE FONDO ({bgm.length})
        </p>
        {room.bgm_now ? (
          <p className="mt-1 truncate text-sm font-bold text-amber-300">
            ▶ Suena ahora: {room.bgm_now}
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Suena en la tele durante la cuenta atrás y cuando la cola está vacía.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!bgmQuery.trim()) return
            setBgmSearching(true)
            const res = await fetch(`/api/search?q=${encodeURIComponent(bgmQuery.trim())}&music=1`)
            const data = await res.json()
            setBgmResults(data.results ?? [])
            setBgmSearching(false)
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={bgmQuery}
            onChange={(e) => setBgmQuery(e.target.value)}
            placeholder="Buscar música en YouTube…"
            className="min-w-0 flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          <button
            disabled={bgmSearching || !bgmQuery.trim()}
            className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {bgmSearching ? '…' : 'Buscar'}
          </button>
        </form>
        {bgmResults.length > 0 && (
          <ol className="mt-3 space-y-2">
            {bgmResults.map((r) => (
              <li key={r.videoId} className="flex items-center gap-2 rounded-xl bg-zinc-800 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{cleanTitle(r.title)}</p>
                  <p className="truncate text-xs text-zinc-500">{r.channel}</p>
                </div>
                <button
                  onClick={() =>
                    supabase
                      .rpc('karaoke_bgm_add', {
                        p_code: code,
                        p_host_key: hostKey,
                        p_video_id: r.videoId,
                        p_title: r.title,
                      })
                      .then(({ error }) => {
                        if (error) setMsg(error.message === 'duplicate_bgm' ? 'Ya está en la lista.' : 'No se pudo añadir.')
                        else {
                          setBgmResults([])
                          setBgmQuery('')
                        }
                      })
                  }
                  className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
                >
                  + Añadir
                </button>
              </li>
            ))}
          </ol>
        )}
        {bgm.length > 0 && (
          <>
            <button
              onClick={() => rpc('karaoke_bgm_set_shuffle', { p_value: !room.bgm_shuffle })}
              className="mt-3 w-full rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
            >
              {room.bgm_shuffle ? '🔀 Orden aleatorio' : '📋 Orden de la lista'}
            </button>
            <ol className="mt-3 space-y-2">
              {bgm.map((t, i) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => setDragIdx(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx === null || dragIdx === i) return
                    const ids = bgm.map((x) => x.id)
                    const [moved] = ids.splice(dragIdx, 1)
                    ids.splice(i, 0, moved)
                    setDragIdx(null)
                    rpc('karaoke_bgm_reorder', { p_ids: ids })
                  }}
                  className={`flex items-center gap-2 rounded-xl p-2 ${
                    dragIdx === i ? 'opacity-40' : ''
                  } ${
                    room.bgm_now_id === t.video_id
                      ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                      : 'bg-zinc-800/60'
                  }`}
                >
                  <span className="shrink-0 cursor-grab text-zinc-600" title="Arrastra para reordenar">
                    ⠿
                  </span>
                  <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                    {room.bgm_now_id === t.video_id
                      ? room.bgm_cmd === 'pause'
                        ? '⏸ '
                        : '▶ '
                      : ''}
                    {cleanTitle(t.title)}
                  </p>
                  {room.bgm_now_id === t.video_id ? (
                    <button
                      onClick={() =>
                        rpc('karaoke_bgm_cmd', {
                          p_cmd: room.bgm_cmd === 'pause' ? 'resume' : 'pause',
                        })
                      }
                      title={room.bgm_cmd === 'pause' ? 'Reanudar' : 'Pausar'}
                      className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
                    >
                      {room.bgm_cmd === 'pause' ? '▶' : '⏸'}
                    </button>
                  ) : (
                    <button
                      onClick={() => rpc('karaoke_bgm_play', { p_id: t.id })}
                      title="Sonar ahora"
                      className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-amber-300 hover:bg-zinc-700 disabled:opacity-40"
                    >
                      ▶
                    </button>
                  )}
                  <button
                    onClick={() => rpc('karaoke_bgm_remove', { p_id: t.id })}
                    title="Quitar de la lista"
                    className="shrink-0 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-red-300 hover:bg-zinc-700 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-zinc-600">
              Arrastra con ⠿ para reordenar · ▶ la pone ahora mismo
            </p>
          </>
        )}
      </section>

      {/* Enlaces */}
      <section className="grid gap-4 pb-8 sm:grid-cols-2">
        <div className="rounded-2xl bg-zinc-900 p-4 text-center">
          <div className="mx-auto w-fit rounded-xl bg-white p-2">
            <QRImage url={guestUrl} size={140} />
          </div>
          <p className="mt-2 text-xs font-bold tracking-widest text-zinc-500">QR CLIENTES</p>
          <p className="mt-1 font-mono text-xs break-all text-zinc-400">{guestUrl}</p>
        </div>
        <div className="rounded-2xl bg-zinc-900 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-500">PANTALLA TV</p>
          {pairCode ? (
            <>
              <p className="mt-2 text-xs text-zinc-400">
                En la tele entra en{' '}
                <span className="font-mono text-zinc-200">…/pub-owner/tv</span> y escribe:
              </p>
              <p className="my-1 font-mono text-3xl font-black tracking-[0.4em] text-amber-400">
                {pairCode}
              </p>
              <p className="text-xs text-zinc-500">Caduca en 15 min</p>
            </>
          ) : (
            <p className="mt-2 text-xs text-zinc-400">
              Genera un código para conectar la tele sin escribir la URL larga
            </p>
          )}
          <button
            onClick={async () => {
              const { data, error } = await supabase.rpc('karaoke_pair_code', {
                p_code: code,
                p_host_key: hostKey,
              })
              if (error) setMsg('No se pudo generar el código de la tele.')
              else setPairCode(data as string)
            }}
            className="mt-3 w-full rounded-xl bg-amber-500 py-2 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            📺 Emparejar tele
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(tvUrl)}
            className="mt-2 w-full rounded-xl bg-zinc-800 py-2 text-sm hover:bg-zinc-700"
          >
            Copiar enlace directo
          </button>
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <p className="text-xs font-bold tracking-widest text-zinc-500">
              TAMAÑO EN PANTALLA
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Si se ve cortado o demasiado grande en tu tele
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                onClick={() =>
                  rpc('karaoke_set_tv_zoom', {
                    p_zoom: Math.max(0.4, Math.round(((room.tv_zoom ?? 0.94) - 0.05) * 100) / 100),
                  })
                }
                className="w-10 rounded-xl bg-zinc-800 py-2 font-black hover:bg-zinc-700"
              >
                −
              </button>
              <span className="w-14 font-mono text-xl font-black text-amber-400">
                {Math.round((room.tv_zoom ?? 0.94) * 100)}%
              </span>
              <button
                onClick={() =>
                  rpc('karaoke_set_tv_zoom', {
                    p_zoom: Math.min(1.2, Math.round(((room.tv_zoom ?? 0.94) + 0.05) * 100) / 100),
                  })
                }
                className="w-10 rounded-xl bg-zinc-800 py-2 font-black hover:bg-zinc-700"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

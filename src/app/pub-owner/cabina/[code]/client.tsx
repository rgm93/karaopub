'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { QRImage } from '@/components/QRImage'

export default function CabinaClient({ code }: { code: string }) {
  const { room, requests, loading, notFound } = useRoom(code)

  const [hostKey, setHostKey] = useState<string | null>(null)
  const [tvUrl, setTvUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [pairCode, setPairCode] = useState<string | null>(null)

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
      setBusy(true)
      setMsg('')
      const { error } = await supabase.rpc(fn, {
        p_code: code,
        p_host_key: hostKey,
        ...extra,
      })
      if (error) setMsg('Acción no permitida — ¿clave de sala correcta?')
      setBusy(false)
    },
    [code, hostKey],
  )

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
          <h1 className="text-2xl font-black">🎛️ Cabina · {room.name}</h1>
          <p className="font-mono text-sm tracking-[0.3em] text-zinc-400">{code}</p>
        </div>
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
                <p className="truncate text-sm text-zinc-400">{current.title}</p>
              </div>
              <button
                disabled={busy}
                onClick={() => rpc('karaoke_finish_current', { p_outcome: 'skipped' })}
                className="shrink-0 rounded-xl bg-red-500/80 px-4 py-2 font-bold hover:bg-red-500 disabled:opacity-40"
              >
                ⏭ Saltar
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                disabled={busy}
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'pause' })}
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ⏸ Pausar
              </button>
              <button
                disabled={busy}
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'resume' })}
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ▶ Reanudar
              </button>
              <button
                disabled={busy}
                onClick={() => rpc('karaoke_player_cmd', { p_cmd: 'restart' })}
                className="rounded-xl bg-zinc-800 py-2 text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
              >
                ↺ Empezar de 0
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
          disabled={busy}
          onClick={() => rpc('karaoke_start_next')}
          className="rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          ▶ Siguiente ahora
        </button>
        <button
          disabled={busy}
          onClick={() => rpc('karaoke_set_accepting', { p_value: !room.accepting_requests })}
          className="rounded-xl bg-zinc-800 py-3 font-bold hover:bg-zinc-700 disabled:opacity-40"
        >
          {room.accepting_requests ? '⏸ Pausar peticiones' : '▶ Reanudar peticiones'}
        </button>
        <button
          disabled={busy || queue.length === 0}
          onClick={() => {
            if (confirm('¿Vaciar toda la cola?')) rpc('karaoke_clear_queue')
          }}
          className="col-span-2 rounded-xl bg-zinc-800 py-3 font-bold text-red-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          🗑 Vaciar cola ({queue.length})
        </button>
      </section>

      {/* Cola */}
      <section>
        <p className="mb-2 text-xs font-bold tracking-widest text-zinc-500">EN COLA ({queue.length})</p>
        <ol className="space-y-3">
          {queue.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
              <div className="flex w-8 flex-col">
                <button
                  disabled={busy || i === 0}
                  onClick={() => rpc('karaoke_move', { p_request_id: r.id, p_dir: 'up' })}
                  title="Subir en la cola"
                  className="rounded-t-lg bg-zinc-800 px-2 py-1 text-xs leading-none hover:bg-zinc-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  disabled={busy || i === queue.length - 1}
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
                <p className="truncate text-xs text-zinc-400">{r.title}</p>
              </div>
              <button
                disabled={busy}
                onClick={() => rpc('karaoke_play_now', { p_request_id: r.id })}
                title="Reproducir ahora"
                className="rounded-lg bg-zinc-800 px-3 py-2 hover:bg-zinc-700 disabled:opacity-40"
              >
                ▶
              </button>
              <button
                disabled={busy}
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
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const { data, error } = await supabase.rpc('karaoke_pair_code', {
                p_code: code,
                p_host_key: hostKey,
              })
              setBusy(false)
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
        </div>
      </section>
    </main>
  )
}

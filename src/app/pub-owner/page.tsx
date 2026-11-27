'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { QRImage } from '@/components/QRImage'
import { Logo } from '@/components/Logo'
import type { Room } from '@/lib/types'

type MySession = { code: string; host_key: string; room_id: string; pub_name: string }

export default function PubOwnerPage() {
  const router = useRouter()
  const [session, setSession] = useState<MySession | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pairCode, setPairCode] = useState<string | null>(null)

  const [maxSongs, setMaxSongs] = useState(5)
  const [interlude, setInterlude] = useState(60)
  const [maxQueue, setMaxQueue] = useState(100)
  const [queueMode, setQueueMode] = useState<'fifo' | 'rotation'>('fifo')
  const [voting, setVoting] = useState(false)
  const [blocks, setBlocks] = useState<{ id: string; term: string }[]>([])
  const [blockTerm, setBlockTerm] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [stats, setStats] = useState<{
    total: number
    applause: number
    topSongs: { title: string; n: number }[]
    topSingers: { name: string; n: number }[]
    rows: {
      played_at: string | null
      singer_name: string
      title: string
      channel_title: string | null
      applause: number
      status: string
    }[]
  } | null>(null)

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) {
      router.replace('/sign-in')
      return
    }
    const { data, error: rpcErr } = await supabase.rpc('karaoke_my_session')
    if (rpcErr) {
      setError(
        rpcErr.message === 'not_pub_staff'
          ? 'Tu cuenta de Pubify no está vinculada a un pub como owner/waiter.'
          : 'Error cargando tu sala.',
      )
      setLoading(false)
      return
    }
    const s = (data?.[0] ?? null) as MySession | null
    setSession(s)
    const { data: bl } = await supabase.rpc('karaoke_blocks_list')
    if (bl) setBlocks(bl as { id: string; term: string }[])
    if (s) {
      const { data: roomRow } = await supabase
        .from('karaoke_rooms')
        .select('*')
        .eq('code', s.code)
        .single()
      if (roomRow) {
        const rr = roomRow as Room
        setRoom(rr)
        setMaxSongs(rr.max_songs_per_singer)
        setInterlude(rr.interlude_seconds)
        setMaxQueue(rr.max_queue)
        setQueueMode(rr.queue_mode)
        setVoting(rr.voting_enabled)
        setLogoUrl(rr.logo_url ?? '')
        // Stats de la noche: peticiones de esta sala
        const { data: reqs } = await supabase
          .from('karaoke_requests')
          .select('singer_name, title, channel_title, status, applause, played_at')
          .eq('room_id', rr.id)
          .in('status', ['done', 'playing', 'queued'])
          .order('created_at', { ascending: true })
        if (reqs) {
          const sung = reqs.filter((r) => r.status === 'done')
          const count = (key: (r: { singer_name: string; title: string }) => string) => {
            const m = new Map<string, number>()
            for (const r of sung) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
            return [...m.entries()].sort((a, b) => b[1] - a[1])
          }
          setStats({
            total: sung.length,
            applause: sung.reduce((a, r) => a + r.applause, 0),
            topSongs: count((r) => r.title).slice(0, 5).map(([title, n]) => ({ title, n })),
            topSingers: count((r) => r.singer_name)
              .filter(([name]) => name !== '🏠 La Casa')
              .slice(0, 5)
              .map(([name, n]) => ({ name, n })),
            rows: sung.map((r) => ({
              played_at: r.played_at,
              singer_name: r.singer_name,
              title: r.title,
              channel_title: r.channel_title,
              applause: r.applause,
              status: r.status,
            })),
          })
        }
      }
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    setOrigin(window.location.origin)
    load()
  }, [load])

  const newSession = async () => {
    setBusy(true)
    const { error: err } = await supabase.rpc('karaoke_new_session')
    if (err) setError('No se pudo crear la sesión.')
    else await load()
    setBusy(false)
  }

  const closeSession = async () => {
    if (!session || !confirm('¿Cerrar la sesión actual? Los clientes ya no podrán unirse.')) return
    setBusy(true)
    await supabase.rpc('karaoke_close_session', {
      p_code: session.code,
      p_host_key: session.host_key,
    })
    await load()
    setBusy(false)
  }

  const pairTv = async () => {
    if (!session) return
    const { data, error: err } = await supabase.rpc('karaoke_pair_code', {
      p_code: session.code,
      p_host_key: session.host_key,
    })
    if (err) setError('No se pudo generar el código de la tele.')
    else setPairCode(data as string)
  }

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const { error: err } = await supabase.rpc('karaoke_update_settings', {
      p_max_songs_per_singer: maxSongs,
      p_interlude_seconds: interlude,
      p_queue_mode: queueMode,
      p_max_queue: maxQueue,
      p_voting_enabled: voting,
    })
    if (err) setError('No se pudieron guardar los ajustes.')
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">Cargando…</main>
  }
  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="max-w-sm text-red-300">{error}</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/sign-in')
          }}
          className="rounded-xl bg-zinc-800 px-6 py-2 font-bold hover:bg-zinc-700"
        >
          Cerrar sesión
        </button>
      </main>
    )
  }

  // ── Sin sesión activa: pantalla de "nueva sesión" ──
  if (!session) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-center text-zinc-100">
        <div>
          <Logo className="mx-auto h-10 w-auto" />
          <h1 className="mt-2 text-3xl font-black">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-2 text-zinc-400">No hay ninguna sesión de karaoke abierta.</p>
        </div>
        <button
          onClick={newSession}
          disabled={busy}
          className="rounded-2xl bg-amber-500 px-10 py-4 text-xl font-black text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          🎤 Abrir sesión de karaoke
        </button>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/sign-in')
          }}
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
        >
          Cerrar sesión de Pubify
        </button>
      </main>
    )
  }

  const joinUrl = `${origin}/${room?.pub_id}/join?c=${session.code}`
  const tvUrl = `${origin}/pub-owner/tv/${session.code}?k=${session.host_key}`
  const cabinaUrl = `${origin}/pub-owner/cabina/${session.code}?k=${session.host_key}`

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-zinc-950 p-5 text-zinc-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Logo className="h-5 w-auto" /> Karaoke · {session.pub_name}
          </h1>
          <p className="text-sm text-zinc-400">
            Sesión activa · código{' '}
            <span className="font-mono tracking-[0.3em] text-amber-400">{session.code}</span>
          </p>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/sign-in')
          }}
          className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold hover:bg-zinc-700"
        >
          Salir
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-zinc-900 p-4 text-center">
          <div className="mx-auto w-fit rounded-xl bg-white p-2">
            <QRImage url={joinUrl} size={150} />
          </div>
          <p className="mt-2 text-xs font-bold tracking-widest text-zinc-500">
            QR CLIENTES · sesión {session.code}
          </p>
          <p className="mt-1 font-mono text-xs break-all text-zinc-400">{joinUrl}</p>
        </div>
        <div className="space-y-2">
          <button
            onClick={pairTv}
            className="w-full rounded-xl bg-amber-500 px-4 py-3 font-bold text-zinc-950 hover:bg-amber-400"
          >
            📺 Emparejar tele
          </button>
          {pairCode && (
            <div className="rounded-xl bg-zinc-800 p-3 text-center">
              <p className="text-xs text-zinc-400">
                En la tele entra en{' '}
                <span className="font-mono text-zinc-200">karaopub.vercel.app/pub-owner/tv</span>{' '}
                y escribe:
              </p>
              <p className="my-1 font-mono text-3xl font-black tracking-[0.4em] text-amber-400">
                {pairCode}
              </p>
              <p className="text-xs text-zinc-500">Caduca en 15 min · puedes generar otro</p>
            </div>
          )}
          <a
            href={cabinaUrl}
            className="block rounded-xl bg-zinc-800 px-4 py-3 text-center font-bold hover:bg-zinc-700"
          >
            🎛️ Abrir cabina
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(tvUrl)}
            className="w-full rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
          >
            Copiar enlace directo de la TV
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(joinUrl)}
            className="w-full rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
          >
            Copiar enlace de clientes
          </button>
          <button
            onClick={newSession}
            disabled={busy}
            className="w-full rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-40"
          >
            🔄 Nueva sesión (nuevo código+QR)
          </button>
          <button
            onClick={closeSession}
            disabled={busy}
            className="w-full rounded-xl bg-red-500/15 px-4 py-2 text-sm text-red-300 hover:bg-red-500/25 disabled:opacity-40"
          >
            ⏹ Cerrar sesión
          </button>
        </div>
      </section>

      <form onSubmit={saveSettings} className="space-y-4 rounded-2xl bg-zinc-900 p-5">
        <h2 className="font-bold">Ajustes de la sala</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Canciones máx. por persona
            <input
              type="number"
              min={1}
              max={20}
              value={maxSongs}
              onChange={(e) => setMaxSongs(Number(e.target.value))}
              className="mt-1 w-full rounded-xl bg-zinc-800 px-4 py-2 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          <label className="block text-sm">
            Tope de la cola
            <input
              type="number"
              min={1}
              max={500}
              value={maxQueue}
              onChange={(e) => setMaxQueue(Number(e.target.value))}
              className="mt-1 w-full rounded-xl bg-zinc-800 px-4 py-2 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          <label className="block text-sm">
            Segundos entre turnos
            <input
              type="number"
              min={0}
              max={600}
              step={5}
              value={interlude}
              onChange={(e) => setInterlude(Number(e.target.value))}
              className="mt-1 w-full rounded-xl bg-zinc-800 px-4 py-2 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          <label className="block text-sm">
            Modo de cola
            <select
              value={queueMode}
              onChange={(e) => setQueueMode(e.target.value as 'fifo' | 'rotation')}
              className="mt-1 w-full rounded-xl bg-zinc-800 px-4 py-2 outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="fifo">Por orden de llegada</option>
              <option value="rotation">Rotación justa (1 por persona)</option>
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-xl bg-zinc-800 px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={voting}
            onChange={(e) => setVoting(e.target.checked)}
            className="h-5 w-5 accent-amber-500"
          />
          <span>
            <span className="font-bold">Modo concurso 🏆</span>
            <span className="block text-zinc-400">
              El público puntúa cada actuación de 1 a 5 estrellas
            </span>
          </span>
        </label>
        <button className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400">
          {saved ? '✓ Guardado' : 'Guardar ajustes'}
        </button>
      </form>

      <section className="space-y-3 rounded-2xl bg-zinc-900 p-5">
        <h2 className="font-bold">🏷️ Marca del pub</h2>
        <p className="text-xs text-zinc-500">
          URL de tu logo — aparece en la cabecera de la tele junto al nombre del pub.
        </p>
        <div className="flex gap-2">
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
            className="min-w-0 flex-1 rounded-xl bg-zinc-800 px-4 py-2 text-sm outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={async () => {
              const { error: err } = await supabase.rpc('karaoke_set_logo', {
                p_code: session.code,
                p_host_key: session.host_key,
                p_url: logoUrl,
              })
              if (err) setError('No se pudo guardar el logo.')
            }}
            className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400"
          >
            Guardar
          </button>
        </div>
      </section>

      {stats && (
        <section className="space-y-4 rounded-2xl bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">📊 La noche en números</h2>
            <button
              onClick={() => {
                const csv = [
                  'cantada_el,cantante,cancion,canal,aplausos',
                  ...stats.rows.map((r) =>
                    [
                      r.played_at ?? '',
                      `"${r.singer_name.replace(/"/g, '""')}"`,
                      `"${r.title.replace(/"/g, '""')}"`,
                      `"${(r.channel_title ?? '').replace(/"/g, '""')}"`,
                      r.applause,
                    ].join(','),
                  ),
                ].join('\n')
                const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                a.download = `karaoke-${session.code}.csv`
                a.click()
                URL.revokeObjectURL(a.href)
              }}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold hover:bg-zinc-700"
            >
              ⬇ Exportar CSV (repertorio SGAE)
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-zinc-800 p-3">
              <p className="text-2xl font-black text-amber-400">{stats.total}</p>
              <p className="text-xs text-zinc-400">cantadas</p>
            </div>
            <div className="rounded-xl bg-zinc-800 p-3">
              <p className="text-2xl font-black text-amber-400">{stats.applause}</p>
              <p className="text-xs text-zinc-400">aplausos 👏</p>
            </div>
            <div className="rounded-xl bg-zinc-800 p-3">
              <p className="text-2xl font-black text-amber-400">{stats.topSingers.length}</p>
              <p className="text-xs text-zinc-400">cantantes</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold tracking-widest text-zinc-500">
                TOP CANCIONES
              </p>
              {stats.topSongs.length === 0 && (
                <p className="text-xs text-zinc-600">Aún no se ha cantado nada.</p>
              )}
              <ol className="space-y-1.5">
                {stats.topSongs.map((s, i) => (
                  <li key={s.title} className="flex items-center gap-2 text-sm">
                    <span className="w-5 font-black text-zinc-500">
                      {['🥇', '🥈', '🥉'][i] ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="shrink-0 text-xs font-bold text-amber-400">×{s.n}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold tracking-widest text-zinc-500">
                TOP CANTANTES
              </p>
              {stats.topSingers.length === 0 && (
                <p className="text-xs text-zinc-600">Aún nadie ha cantado.</p>
              )}
              <ol className="space-y-1.5">
                {stats.topSingers.map((s, i) => (
                  <li key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="w-5 font-black text-zinc-500">
                      {['🥇', '🥈', '🥉'][i] ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 text-xs font-bold text-amber-400">×{s.n}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-2xl bg-zinc-900 p-5">
        <h2 className="font-bold">🚫 Canciones o artistas vetados</h2>
        <p className="text-xs text-zinc-500">
          Si el título o el canal del vídeo contiene alguno de estos términos, el cliente no podrá
          pedirlo. Vale para todas las sesiones del pub.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const t = blockTerm.trim()
            if (!t) return
            const { error: err } = await supabase.rpc('karaoke_block_add', { p_term: t })
            if (err) setError(err.message === 'too_short' ? 'Término demasiado corto.' : 'No se pudo vetar.')
            else {
              setBlockTerm('')
              const { data: bl } = await supabase.rpc('karaoke_blocks_list')
              if (bl) setBlocks(bl as { id: string; term: string }[])
            }
          }}
          className="flex gap-2"
        >
          <input
            value={blockTerm}
            onChange={(e) => setBlockTerm(e.target.value)}
            placeholder="p. ej. bad bunny, despacito…"
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl bg-zinc-800 px-4 py-2 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-amber-400"
          />
          <button
            disabled={!blockTerm.trim()}
            className="shrink-0 rounded-xl bg-red-500/80 px-4 py-2 font-bold hover:bg-red-500 disabled:opacity-40"
          >
            Vetar
          </button>
        </form>
        {blocks.length === 0 ? (
          <p className="text-xs text-zinc-600">Nada vetado por ahora.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blocks.map((b) => (
              <button
                key={b.id}
                title="Quitar veto"
                onClick={async () => {
                  await supabase.rpc('karaoke_block_remove', { p_id: b.id })
                  setBlocks((prev) => prev.filter((x) => x.id !== b.id))
                }}
                className="rounded-lg bg-red-500/15 px-3 py-1.5 text-sm text-red-200 hover:bg-red-500/30"
              >
                {b.term} ✕
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

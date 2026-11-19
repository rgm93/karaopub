'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { QRImage } from '@/components/QRImage'
import type { Room } from '@/lib/types'

type MyRoom = { code: string; host_key: string; room_id: string; pub_name: string }

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!authReady) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Cargando…</main>
  }
  return session ? (
    <Dashboard onLogout={() => supabase.auth.signOut()} />
  ) : (
    <Login />
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError('Email o contraseña incorrectos.')
    setBusy(false)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form onSubmit={login} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-black">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">Entra con tu cuenta de Pubify</p>
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          required
          className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={busy}
          className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </form>
    </main>
  )
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [myRoom, setMyRoom] = useState<MyRoom | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [error, setError] = useState('')
  const [origin, setOrigin] = useState('')

  const [maxSongs, setMaxSongs] = useState(5)
  const [interlude, setInterlude] = useState(60)
  const [maxQueue, setMaxQueue] = useState(100)
  const [queueMode, setQueueMode] = useState<'fifo' | 'rotation'>('fifo')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data, error: rpcErr } = await supabase.rpc('karaoke_my_room')
    if (rpcErr) {
      setError(
        rpcErr.message === 'not_pub_staff'
          ? 'Tu cuenta de Pubify no está vinculada a un pub como owner/waiter.'
          : 'Error cargando tu sala.',
      )
      return
    }
    const r = data[0] as MyRoom
    setMyRoom(r)
    const { data: roomRow } = await supabase
      .from('karaoke_rooms')
      .select('*')
      .eq('code', r.code)
      .single()
    if (roomRow) {
      const rr = roomRow as Room
      setRoom(rr)
      setMaxSongs(rr.max_songs_per_singer)
      setInterlude(rr.interlude_seconds)
      setMaxQueue(rr.max_queue)
      setQueueMode(rr.queue_mode)
    }
  }, [])

  useEffect(() => {
    setOrigin(window.location.origin)
    load()
  }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const { error: err } = await supabase.rpc('karaoke_update_settings', {
      p_max_songs_per_singer: maxSongs,
      p_interlude_seconds: interlude,
      p_queue_mode: queueMode,
      p_max_queue: maxQueue,
    })
    if (err) setError('No se pudieron guardar los ajustes.')
    else {
      setSaved(true)
      load()
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="max-w-sm text-red-300">{error}</p>
        <button onClick={onLogout} className="rounded-xl bg-zinc-800 px-6 py-2 font-bold hover:bg-zinc-700">
          Cerrar sesión
        </button>
      </main>
    )
  }
  if (!myRoom) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Cargando tu sala…</main>
  }

  const guestUrl = `${origin}/sala/${myRoom.code}`
  const tvUrl = `${origin}/tv/${myRoom.code}?k=${myRoom.host_key}`
  const cabinaUrl = `${origin}/cabina/${myRoom.code}?k=${myRoom.host_key}`

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 bg-zinc-950 p-5 text-zinc-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Karaoke · {myRoom.pub_name}</h1>
          <p className="text-sm text-zinc-400">
            Código de sala: <span className="font-mono tracking-[0.3em] text-amber-400">{myRoom.code}</span>
          </p>
        </div>
        <button onClick={onLogout} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold hover:bg-zinc-700">
          Salir
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-zinc-900 p-4 text-center">
          <div className="mx-auto w-fit rounded-xl bg-white p-2">
            <QRImage url={guestUrl} size={150} />
          </div>
          <p className="mt-2 text-xs font-bold tracking-widest text-zinc-500">QR CLIENTES</p>
          <p className="mt-1 font-mono text-xs break-all text-zinc-400">{guestUrl}</p>
        </div>
        <div className="space-y-2">
          <a href={tvUrl} className="block rounded-xl bg-amber-500 px-4 py-3 text-center font-bold text-zinc-950 hover:bg-amber-400">
            📺 Abrir TV
          </a>
          <a href={cabinaUrl} className="block rounded-xl bg-zinc-800 px-4 py-3 text-center font-bold hover:bg-zinc-700">
            🎛️ Abrir cabina
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(tvUrl)}
            className="w-full rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
          >
            Copiar enlace TV
          </button>
          <p className="text-xs text-zinc-500">
            El enlace de TV/cabina lleva la clave de control — no lo compartas con clientes.
          </p>
        </div>
      </section>

      <form onSubmit={save} className="space-y-4 rounded-2xl bg-zinc-900 p-5">
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
        <button className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400">
          {saved ? '✓ Guardado' : 'Guardar ajustes'}
        </button>
      </form>

      {room && (
        <p className="pb-8 text-center text-xs text-zinc-500">
          Peticiones {room.accepting_requests ? 'abiertas' : 'pausadas'} · sala creada{' '}
          {new Date(room.created_at).toLocaleDateString('es-ES')}
        </p>
      )}
    </main>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { QRImage } from '@/components/QRImage'

type CreatedRoom = { code: string; hostKey: string }

export default function Home() {
  const router = useRouter()
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedRoom | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const createDemoRoom = async () => {
    setCreating(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('karaoke_create_room', {
      p_name: 'Sala de prueba',
    })
    setCreating(false)
    if (rpcError || !data?.[0]) {
      setError('No se pudo crear la sala. Inténtalo de nuevo.')
      return
    }
    setCreated({ code: data[0].code, hostKey: data[0].host_key })
  }

  const join = (e: React.FormEvent) => {
    e.preventDefault()
    const c = joinCode.trim().toUpperCase()
    if (c) router.push(`/sala/${c}`)
  }

  if (created) {
    const guestUrl = `${origin}/sala/${created.code}`
    const tvUrl = `${origin}/tv/${created.code}?k=${created.hostKey}`
    const cabinaUrl = `${origin}/cabina/${created.code}?k=${created.hostKey}`
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div>
            <p className="text-amber-400">Sala de prueba creada</p>
            <h1 className="text-5xl font-black tracking-widest">{created.code}</h1>
          </div>
          <div className="mx-auto w-fit rounded-2xl bg-white p-4">
            <QRImage url={guestUrl} size={200} />
          </div>
          <p className="text-sm text-zinc-400">
            Los clientes escanean el QR o entran en <span className="text-zinc-200">{guestUrl}</span>
          </p>
          <div className="space-y-3 text-left">
            <a
              href={tvUrl}
              className="block rounded-xl bg-amber-500 px-4 py-3 font-bold text-zinc-950 hover:bg-amber-400"
            >
              📺 Abrir pantalla TV (en la tele del pub)
            </a>
            <a
              href={cabinaUrl}
              className="block rounded-xl bg-zinc-800 px-4 py-3 font-bold hover:bg-zinc-700"
            >
              🎛️ Abrir cabina de control (en tu móvil/tablet)
            </a>
            <a href={guestUrl} className="block rounded-xl bg-zinc-800 px-4 py-3 hover:bg-zinc-700">
              📱 Vista del cliente
            </a>
          </div>
          <p className="text-xs text-zinc-500">
            Guarda el enlace de la cabina: contiene la clave de control de la sala.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-md space-y-10">
        <div className="text-center">
          <h1 className="text-5xl font-black">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-3 text-zinc-400">
            El karaoke de tu bar, sin papeles ni gritos. Los clientes piden desde el móvil, la tele
            canta por turnos.
          </p>
          <p className="mt-1 text-xs text-zinc-600">Una aplicación de Pubify</p>
        </div>

        <Link
          href="/admin"
          className="block rounded-2xl bg-amber-500 p-6 text-center font-bold text-zinc-950 hover:bg-amber-400"
        >
          <span className="text-lg">Soy el pub — entrar con Pubify</span>
          <span className="mt-1 block text-sm font-medium opacity-70">
            Tu sala de karaoke y sus ajustes
          </span>
        </Link>

        <form onSubmit={join} className="space-y-3 rounded-2xl bg-zinc-900 p-6">
          <h2 className="font-bold">Soy cliente — unirme con código</h2>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Código de 5 letras"
            maxLength={5}
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] uppercase outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          <button
            disabled={joinCode.trim().length < 5}
            className="w-full rounded-xl bg-zinc-700 py-3 font-bold hover:bg-zinc-600 disabled:opacity-40"
          >
            Entrar a la sala
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={createDemoRoom}
            disabled={creating}
            className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300 disabled:opacity-40"
          >
            {creating ? 'Creando…' : 'Crear sala de prueba (sin Pubify)'}
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  )
}

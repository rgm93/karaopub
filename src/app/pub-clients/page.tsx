'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PubClientsPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  const join = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c) router.push(`/pub-clients/${c}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form onSubmit={join} className="w-full max-w-sm space-y-5 text-center">
        <h1 className="text-3xl font-black">
          Karao<span className="text-amber-400">Pub</span>
        </h1>
        <p className="text-zinc-400">
          Escribe el código de la sala — lo ves en la tele del local o en el QR de tu mesa.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código de 5 letras"
          maxLength={5}
          autoFocus
          className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] uppercase outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={code.trim().length < 5}
          className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          Entrar a la sala
        </button>
      </form>
    </main>
  )
}

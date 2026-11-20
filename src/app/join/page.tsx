'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { data, error: rpcErr } = await supabase.rpc('karaoke_find_by_code', {
      p_code: code.trim(),
    })
    setBusy(false)
    const row = (data?.[0] ?? null) as { code: string; pub_id: string | null } | null
    if (rpcErr || !row) {
      setError('No hay ninguna sesión activa con ese código.')
      return
    }
    router.push(`/${row.pub_id ?? 'invitado'}/${row.code}`)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-center text-zinc-100">
      <div>
        <h1 className="text-4xl font-black">
          Karao<span className="text-amber-400">Pub</span>
        </h1>
        <p className="mt-2 text-zinc-400">Escribe el código de la sesión que ves en la pantalla</p>
      </div>
      <form onSubmit={join} className="flex w-full max-w-xs flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCDE"
          maxLength={5}
          autoCapitalize="characters"
          autoFocus
          className="rounded-2xl bg-zinc-900 px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] uppercase outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={busy || code.trim().length < 5}
          className="rounded-2xl bg-amber-500 py-4 text-lg font-black text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {busy ? 'Buscando…' : 'Entrar a cantar 🎤'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
    </main>
  )
}

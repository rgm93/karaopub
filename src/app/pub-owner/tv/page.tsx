'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

export default function TvPairPage() {
  const router = useRouter()
  const [pair, setPair] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { data, error: rpcErr } = await supabase.rpc('karaoke_tv_join', {
      p_pair: pair.trim(),
    })
    setBusy(false)
    const row = (data?.[0] ?? null) as { code: string; host_key: string } | null
    if (rpcErr || !row) {
      setError(
        rpcErr?.message === 'pair_not_found'
          ? 'Código caducado o incorrecto. Genera uno nuevo desde el panel del pub.'
          : 'No se pudo conectar. Inténtalo de nuevo.',
      )
      return
    }
    localStorage.setItem(`karaopub_host_${row.code}`, row.host_key)
    router.push(`/pub-owner/tv/${row.code}`)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-center text-zinc-100">
      <div>
        <Logo className="mx-auto h-14 w-auto" />
        <h1 className="mt-3 text-4xl font-black">
          Karao<span className="text-amber-400">Pub</span> · TV
        </h1>
        <p className="mt-2 max-w-sm text-zinc-400">
          En el panel del pub pulsa «Emparejar tele» y escribe aquí el código de 6 dígitos
        </p>
      </div>
      <form onSubmit={join} className="flex w-full max-w-xs flex-col gap-3">
        <input
          value={pair}
          onChange={(e) => setPair(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          maxLength={6}
          inputMode="numeric"
          autoFocus
          className="rounded-2xl bg-zinc-900 px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={busy || pair.length < 6}
          className="rounded-2xl bg-amber-500 py-4 text-lg font-black text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {busy ? 'Conectando…' : 'Conectar esta pantalla'}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
    </main>
  )
}

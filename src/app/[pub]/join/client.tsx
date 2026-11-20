'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

export default function JoinClient({ pubId }: { pubId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pubName, setPubName] = useState<string | null>(null)
  const [badPub, setBadPub] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  const tryJoin = useCallback(
    async (c: string) => {
      setJoining(true)
      setError('')
      const { error: err } = await supabase.rpc('karaoke_find_session', {
        p_pub_id: pubId,
        p_code: c,
      })
      if (err) {
        setError('Ese código no está activo. Mira la pantalla del local.')
        setJoining(false)
        return
      }
      router.push(`/${pubId}/${c.toUpperCase()}`)
    },
    [pubId, router],
  )

  useEffect(() => {
    supabase.rpc('karaoke_pub_info', { p_pub_id: pubId }).then(({ data }) => {
      if (data) setPubName(data)
      else setBadPub(true)
    })
  }, [pubId])

  useEffect(() => {
    const c = searchParams.get('c')
    if (c && c.trim().length >= 5) {
      setCode(c.toUpperCase())
      tryJoin(c)
    }
  }, [searchParams, tryJoin])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.trim().length >= 5) tryJoin(code.trim())
  }

  if (badPub) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6 text-center text-zinc-100">
        <h1 className="text-xl font-bold">Este local no existe</h1>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 text-center">
        <div>
          <Logo className="mx-auto h-9 w-auto" />
          <h1 className="mt-2 text-3xl font-black">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-2 text-zinc-400">
            {pubName ? `en ${pubName}` : '…'}
          </p>
        </div>
        <p className="text-sm text-zinc-400">
          Escribe el código de 5 letras que sale en la pantalla
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código"
          maxLength={5}
          autoFocus
          className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] uppercase outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={code.trim().length < 5 || joining}
          className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {joining ? 'Entrando…' : 'Unirme'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/pub-owner')
      else setChecking(false)
    })
  }, [router])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Email o contraseña incorrectos.')
      setBusy(false)
    } else {
      router.push('/pub-owner')
    }
  }

  if (checking) {
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">…</main>
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form onSubmit={login} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <Logo className="mx-auto h-9 w-auto" />
          <h1 className="mt-2 text-3xl font-black">
            <span>Karao<span className="text-amber-400">Pub</span></span>
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

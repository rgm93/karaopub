'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import type { SearchResult } from '@/lib/types'

const ERROR_MESSAGES: Record<string, string> = {
  room_not_found: 'La sala no existe.',
  not_accepting: 'El pub ha pausado las peticiones. Inténtalo en un rato.',
  singer_limit: 'Ya tienes el máximo de canciones en cola. Deja cantar a los demás 😄',
  queue_full: 'La cola está llena. Espera a que avance un poco.',
  session_closed: 'La sesión ha terminado. ¡Gracias por cantar!',
}

export default function SalaClient({ pubId, code }: { pubId: string; code: string }) {
  const { room, requests, loading, notFound } = useRoom(code)
  const wrongPub = room !== null && room.pub_id !== null && room.pub_id !== pubId

  const [name, setName] = useState('')
  const [nameSet, setNameSet] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [msg, setMsg] = useState('')
  const [myIds, setMyIds] = useState<string[]>([])

  useEffect(() => {
    const n = localStorage.getItem('karaopub_name')
    if (n) {
      setName(n)
      setNameSet(true)
    }
    setMyIds(JSON.parse(localStorage.getItem(`karaopub_my_${code}`) ?? '[]'))
  }, [code])

  const queue = requests.filter((r) => r.status === 'queued')
  const playing = requests.find((r) => r.status === 'playing') ?? null

  const saveName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    localStorage.setItem('karaopub_name', name.trim())
    setName(name.trim())
    setNameSet(true)
  }

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setMsg('')
    setSearched(true)
    const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
    const data = await res.json()
    setResults(data.results ?? [])
    setSearching(false)
  }

  const pick = async (r: SearchResult) => {
    setMsg('')
    const { data, error } = await supabase.rpc('karaoke_add_request', {
      p_code: code,
      p_singer: name,
      p_video_id: r.videoId,
      p_title: r.title,
      p_channel: r.channel,
      p_thumb: r.thumbnail,
      p_duration: r.durationSeconds,
    })
    if (error) {
      setMsg(ERROR_MESSAGES[error.message] ?? 'No se pudo añadir. Inténtalo de nuevo.')
      return
    }
    const ids = [...myIds, data as string]
    setMyIds(ids)
    localStorage.setItem(`karaopub_my_${code}`, JSON.stringify(ids))
    setResults([])
    setQuery('')
    setSearched(false)
    setMsg(`¡Apuntada! «${r.title}»`)
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">Cargando sala…</main>
  }
  if (notFound || !room || wrongPub) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-4xl">🎤</p>
        <h1 className="text-xl font-bold">La sala {code} no existe</h1>
        <p className="text-sm text-zinc-400">Revisa el código o escanea el QR de nuevo.</p>
      </main>
    )
  }
  if (!room.is_active) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-4xl">🎤</p>
        <h1 className="text-xl font-bold">La sesión ha terminado</h1>
        <p className="text-sm text-zinc-400">¡Gracias por cantar! Hasta la próxima.</p>
      </main>
    )
  }

  if (!nameSet) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <form onSubmit={saveName} className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-black">
            Karao<span className="text-amber-400">Pub</span> · {room.name}
          </h1>
          <p className="text-zinc-400">¿Cómo te llamamos cuando te toque cantar?</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre o apodo"
            maxLength={40}
            autoFocus
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-lg outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          <button
            disabled={!name.trim()}
            className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            Entrar
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-zinc-950 p-5 text-zinc-100">
      <header className="text-center">
        <h1 className="text-xl font-black">
          Karao<span className="text-amber-400">Pub</span> · {room.name}
        </h1>
        <p className="text-sm text-zinc-400">Hola, {name} 👋</p>
      </header>

      {playing && (
        <div className="rounded-2xl bg-amber-500/10 p-4 text-center ring-1 ring-amber-500/40">
          <p className="text-xs font-bold tracking-widest text-amber-400">CANTANDO AHORA</p>
          <p className="mt-1 font-bold">{playing.singer_name}</p>
          <p className="text-sm text-zinc-300">{playing.title}</p>
        </div>
      )}

      <form onSubmit={search} className="space-y-3 rounded-2xl bg-zinc-900 p-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Canción, artista…"
          className="w-full rounded-xl bg-zinc-800 px-4 py-3 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
        />
        <button
          disabled={searching || !query.trim() || !room.accepting_requests}
          className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {searching ? 'Buscando…' : 'Buscar karaoke'}
        </button>
        {!room.accepting_requests && (
          <p className="text-center text-sm text-zinc-400">Peticiones pausadas por el pub.</p>
        )}
      </form>

      {msg && <p className="rounded-xl bg-zinc-900 p-3 text-center text-sm text-amber-300">{msg}</p>}

      {searching && <p className="text-center text-zinc-400">Buscando en YouTube…</p>}
      {!searching && searched && results.length === 0 && (
        <p className="text-center text-zinc-400">Sin resultados. Prueba a añadir el artista.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold tracking-widest text-zinc-400">ELIGE LA TUYA</p>
          {results.map((r) => (
            <button
              key={r.videoId}
              onClick={() => pick(r)}
              className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 p-2 text-left hover:bg-zinc-800"
            >
              {r.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-zinc-400">
                  {r.channel}
                  {r.durationSeconds
                    ? ` · ${Math.floor(r.durationSeconds / 60)}:${String(r.durationSeconds % 60).padStart(2, '0')}`
                    : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <section className="pb-8">
        <p className="mb-2 text-xs font-bold tracking-widest text-zinc-400">LA COLA</p>
        {queue.length === 0 && !playing && (
          <p className="text-sm text-zinc-500">Cola vacía — pide la primera canción.</p>
        )}
        <ol className="space-y-2">
          {queue.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-xl p-3 ${
                myIds.includes(r.id) ? 'bg-amber-500/15 ring-1 ring-amber-500/40' : 'bg-zinc-900'
              }`}
            >
              <span className="w-6 text-center font-black text-zinc-500">{i + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{r.singer_name}</p>
                <p className="truncate text-xs text-zinc-400">{r.title}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

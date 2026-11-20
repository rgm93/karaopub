'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import type { KaraokeRequest, SearchResult } from '@/lib/types'

const ERROR_MESSAGES: Record<string, string> = {
  room_not_found: 'La sala no existe.',
  not_accepting: 'El pub ha pausado las peticiones. Inténtalo en un rato.',
  singer_limit: 'Ya tienes el máximo de canciones en cola. Deja cantar a los demás 😄',
  queue_full: 'La cola está llena. Espera a que avance un poco.',
  session_closed: 'La sesión ha terminado. ¡Gracias por cantar!',
  duplicate_song: 'Esa canción ya está pedida o ya se ha cantado. ¡Elige otra! 🎵',
  not_found: 'No se pudo quitar. ¿Ya habrá empezado?',
}

function Modal({
  title,
  children,
  confirmLabel = 'Confirmar',
  onConfirm,
  onClose,
}: {
  title: string
  children: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-zinc-900 p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 text-sm text-zinc-400">{children}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="rounded-xl bg-zinc-800 py-3 font-bold hover:bg-zinc-700"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
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
  const [deviceKey, setDeviceKey] = useState<string | null>(null)
  const [pendingPick, setPendingPick] = useState<SearchResult | null>(null)
  const [pendingCancel, setPendingCancel] = useState<KaraokeRequest | null>(null)
  const [nameTaken, setNameTaken] = useState(false)
  const [myVote, setMyVote] = useState(0)
  const [previewReq, setPreviewReq] = useState<{
    video_id: string
    title: string
    heading: string
  } | null>(null)

  useEffect(() => {
    const n = localStorage.getItem('karaopub_name')
    if (n) {
      setName(n)
      setNameSet(true)
    }
    setMyIds(JSON.parse(localStorage.getItem(`karaopub_my_${code}`) ?? '[]'))
    let dk = localStorage.getItem('karaopub_device')
    if (!dk) {
      dk = crypto.randomUUID()
      localStorage.setItem('karaopub_device', dk)
    }
    setDeviceKey(dk)
  }, [code])

  const queue = requests.filter((r) => r.status === 'queued')
  const playing = requests.find((r) => r.status === 'playing') ?? null

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !room) return
    // ¿Ya hay alguien con ese nombre en la cola (desde otro dispositivo)?
    const { data: clash } = await supabase
      .from('karaoke_requests')
      .select('singer_key')
      .eq('room_id', room.id)
      .in('status', ['queued', 'playing'])
      .ilike('singer_name', n)
    const taken = (clash ?? []).some((r) => r.singer_key !== deviceKey)
    if (taken) {
      setNameTaken(true)
      return
    }
    localStorage.setItem('karaopub_name', n)
    setName(n)
    setNameTaken(false)
    setNameSet(true)
  }

  const vote = async (score: number) => {
    if (!playing || !deviceKey) return
    const { error } = await supabase.rpc('karaoke_vote', {
      p_code: code,
      p_request_id: playing.id,
      p_voter_key: deviceKey,
      p_score: score,
    })
    if (!error) setMyVote(score)
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
    setPendingPick(null)
    setMsg('')
    const { data, error } = await supabase.rpc('karaoke_add_request', {
      p_code: code,
      p_singer: name,
      p_singer_key: deviceKey,
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

  const cancelMine = async (r: KaraokeRequest) => {
    setPendingCancel(null)
    setMsg('')
    const { error } = await supabase.rpc('karaoke_cancel', {
      p_code: code,
      p_request_id: r.id,
      p_singer_key: deviceKey,
    })
    if (error) {
      setMsg(ERROR_MESSAGES[error.message] ?? 'No se pudo quitar. Inténtalo de nuevo.')
      return
    }
    const ids = myIds.filter((id) => id !== r.id)
    setMyIds(ids)
    localStorage.setItem(`karaopub_my_${code}`, JSON.stringify(ids))
    setMsg('Canción quitada de la cola.')
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">Cargando sala…</main>
  }
  if (notFound || !room || wrongPub) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-4xl">🎤</p>
        <h1 className="text-xl font-bold">La sala {code} no existe</h1>
        <p className="text-sm text-zinc-400">Revisa el código o escanea el QR de nuevo.</p>
      </main>
    )
  }
  if (!room.is_active) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-4xl">🎤</p>
        <h1 className="text-xl font-bold">La sesión ha terminado</h1>
        <p className="text-sm text-zinc-400">¡Gracias por cantar! Hasta la próxima.</p>
      </main>
    )
  }

  if (!nameSet) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <form onSubmit={saveName} className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-black">
            Karao<span className="text-amber-400">Pub</span> · {room.name}
          </h1>
          <p className="text-zinc-400">¿Cómo te llamamos cuando te toque cantar?</p>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTaken(false)
            }}
            placeholder="Tu nombre o apodo"
            maxLength={40}
            autoFocus
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-lg outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          {nameTaken && (
            <div className="rounded-xl bg-zinc-900 p-3 text-sm">
              <p className="text-amber-300">
                Ya hay un(a) {name.trim()} en la cola. Elige un distintivo:
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {[`${name.trim()} 2`, `${name.trim()} 🎤`, `${name.trim()} ⭐`].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setName(s)
                      setNameTaken(false)
                    }}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 font-bold hover:bg-zinc-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-zinc-950 p-5 text-zinc-100 sm:max-w-lg">
      <header className="text-center">
        <h1 className="text-xl font-black">
          Karao<span className="text-amber-400">Pub</span> · {room.name}
        </h1>
        <p className="text-sm text-zinc-400">Hola, {name} 👋</p>
        {room.bgm_now && !room.bgm_now_id && (
          <p className="mt-2 truncate rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400">
            🎵 Suena de fondo: {room.bgm_now}
          </p>
        )}
      </header>

      {playing && (
        <div className="rounded-2xl bg-amber-500/10 p-4 text-center ring-1 ring-amber-500/40">
          <p className="text-xs font-bold tracking-widest text-amber-400">CANTANDO AHORA</p>
          <p className="mt-1 font-bold">{playing.singer_name}</p>
          <p className="text-sm text-zinc-300">{playing.title}</p>
          {room.voting_enabled && (
            <div className="mt-3">
              <p className="text-xs text-zinc-400">¿Qué tal lo está haciendo?</p>
              <div className="mt-1 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => vote(s)}
                    className={`px-1.5 text-2xl transition-transform active:scale-125 ${
                      s <= myVote ? '' : 'opacity-30 grayscale'
                    }`}
                  >
                    ⭐
                  </button>
                ))}
              </div>
              {myVote > 0 && <p className="mt-1 text-xs text-zinc-500">¡Votado {myVote}/5!</p>}
            </div>
          )}
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
              onClick={() => setPendingPick(r)}
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
        <p
          className={`mb-2 text-xs font-bold tracking-widest text-zinc-400 ${
            queue.length === 0 && !playing ? 'text-center' : ''
          }`}
        >
          LA COLA
        </p>
        {room.bgm_now && room.bgm_now_id && (
          <button
            onClick={() =>
              setPreviewReq({
                video_id: room.bgm_now_id!,
                title: room.bgm_now!,
                heading: '🎵 Suena de fondo ahora',
              })
            }
            className="mb-3 flex w-full items-center gap-3 rounded-xl bg-zinc-800/60 p-3 text-left ring-1 ring-zinc-700/50 hover:bg-zinc-800"
          >
            <span className="w-6 text-center">🎵</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-zinc-300">Suena de fondo</p>
              <p className="truncate text-xs text-zinc-400">{room.bgm_now}</p>
            </div>
          </button>
        )}
        {queue.length === 0 && !playing && (
          <div className="py-8 text-center">
            <p className="text-4xl">🎤</p>
            <p className="mt-3 text-sm text-zinc-500">Cola vacía — pide la primera canción.</p>
          </div>
        )}
        <ol className="space-y-3">
          {queue.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-xl p-3 ${
                myIds.includes(r.id) ? 'bg-amber-500/15 ring-1 ring-amber-500/40' : 'bg-zinc-900'
              }`}
            >
              <button
                onClick={() =>
                  setPreviewReq({
                    video_id: r.video_id,
                    title: r.title,
                    heading: `${r.singer_name} cantará…`,
                  })
                }
                title="Ver qué canción es"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="w-6 text-center font-black text-zinc-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.singer_name}</p>
                  <p className="truncate text-xs text-zinc-400">{r.title}</p>
                </div>
              </button>
              {myIds.includes(r.id) && (
                <button
                  onClick={() => setPendingCancel(r)}
                  title="Quitar mi canción"
                  className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-red-300 hover:bg-zinc-700"
                >
                  ✕ Quitar
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      {pendingPick && (
        <Modal
          title="¿Apuntar esta canción?"
          confirmLabel="🎤 ¡A cantar!"
          onConfirm={() => pick(pendingPick)}
          onClose={() => setPendingPick(null)}
        >
          <div className="mb-3 overflow-hidden rounded-xl">
            <iframe
              src={`https://www.youtube.com/embed/${pendingPick.videoId}?rel=0`}
              title={pendingPick.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>
          <p className="font-bold text-zinc-200">{pendingPick.title}</p>
          <p className="mt-1">{pendingPick.channel} · dale al play para escucharla antes</p>
        </Modal>
      )}
      {pendingCancel && (
        <Modal
          title="¿Quitar tu canción?"
          confirmLabel="Sí, quitarla"
          onConfirm={() => cancelMine(pendingCancel)}
          onClose={() => setPendingCancel(null)}
        >
          <p className="font-bold text-zinc-200">{pendingCancel.title}</p>
          <p className="mt-1">Perderás tu turno en la cola.</p>
        </Modal>
      )}
      {previewReq && (
        <Modal
          title={previewReq.heading}
          confirmLabel="▶ Abrir en YouTube"
          onConfirm={() => {
            window.open(`https://www.youtube.com/watch?v=${previewReq.video_id}`, '_blank')
            setPreviewReq(null)
          }}
          onClose={() => setPreviewReq(null)}
        >
          <div className="mb-3 overflow-hidden rounded-xl">
            <iframe
              src={`https://www.youtube.com/embed/${previewReq.video_id}?rel=0`}
              title={previewReq.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>
          <p className="font-bold text-zinc-200">{previewReq.title}</p>
          <p className="mt-1">Dale al play para escucharla, o ábrela en YouTube.</p>
        </Modal>
      )}
    </main>
  )
}

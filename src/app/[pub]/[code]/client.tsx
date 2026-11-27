'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRoom } from '@/lib/useRoom'
import { Logo } from '@/components/Logo'
import { YtPreview } from '@/components/YtPreview'
import { STR, type Lang } from '@/lib/i18n'
import type { KaraokeRequest, SearchResult } from '@/lib/types'

const ERROR_MESSAGES: Record<string, string> = {
  room_not_found: 'La sala no existe.',
  not_accepting: 'El pub ha pausado las peticiones. Inténtalo en un rato.',
  singer_limit: 'Ya tienes el máximo de canciones en cola. Deja cantar a los demás 😄',
  queue_full: 'La cola está llena. Espera a que avance un poco.',
  session_closed: 'La sesión ha terminado. ¡Gracias por cantar!',
  duplicate_song: 'Esa canción ya está pedida o ya se ha cantado. ¡Elige otra! 🎵',
  blocked: 'El pub tiene vetada esa canción o artista 🚫 ¡Elige otra!',
  not_found: 'No se pudo quitar. ¿Ya habrá empezado?',
  requests_closed: 'El pub ya cerró las peticiones — ¡a disfrutar de las que quedan!',
}

const EMOJIS = ['🎤', '⭐', '🦁', '👑', '🎸', '🦄', '🔥', '🍀', '🐸', '💃', '🕺', '🚀']

type Fav = { videoId: string; title: string; channel: string; thumbnail: string; durationSeconds: number | null }

function Modal({
  title,
  children,
  confirmLabel = 'Confirmar',
  confirmDisabled = false,
  onConfirm,
  onClose,
}: {
  title: string
  children: React.ReactNode
  confirmLabel?: React.ReactNode
  confirmDisabled?: boolean
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
        <div className="mt-5 grid gap-3">
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="w-full rounded-xl bg-amber-500 py-3.5 text-base font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-zinc-800 py-3 font-bold hover:bg-zinc-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SalaClient({ pubId, code }: { pubId: string; code: string }) {
  const { room, requests, loading, notFound } = useRoom(code)
  const wrongPub = room !== null && room.pub_id !== null && room.pub_id !== pubId

  const [lang, setLang] = useState<Lang>('es')
  const t = STR[lang]
  const [name, setName] = useState('')
  const [nameSet, setNameSet] = useState(false)
  const [emoji, setEmoji] = useState('')
  const [duet, setDuet] = useState('')
  const [favs, setFavs] = useState<Fav[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [msg, setMsg] = useState('')
  const [myIds, setMyIds] = useState<string[]>([])
  const [deviceKey, setDeviceKey] = useState<string | null>(null)
  const [pendingPick, setPendingPick] = useState<SearchResult | null>(null)
  const [pickStatus, setPickStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [blockedPick, setBlockedPick] = useState<SearchResult | null>(null)
  const [pendingCancel, setPendingCancel] = useState<KaraokeRequest | null>(null)
  const [nameTaken, setNameTaken] = useState(false)
  const [blockTerms, setBlockTerms] = useState<string[]>([])
  const [myVote, setMyVote] = useState(0)
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = (m: string) => {
    setMsg(m)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(''), 4000)
  }
  const [previewReq, setPreviewReq] = useState<{
    video_id: string
    title: string
    heading: string
  } | null>(null)

  // Resetea el estado del preview cada vez que se abre el modal
  useEffect(() => {
    if (pendingPick) setPickStatus('loading')
  }, [pendingPick])

  useEffect(() => {
    if (!('Notification' in window)) setNotifPerm('unsupported')
    else setNotifPerm(Notification.permission)
    const l = localStorage.getItem('karaopub_lang')
    if (l === 'en' || l === 'es') setLang(l)
    const n = localStorage.getItem('karaopub_name')
    if (n) {
      setName(n)
      setNameSet(true)
    }
    setEmoji(localStorage.getItem('karaopub_emoji') ?? '')
    setFavs(JSON.parse(localStorage.getItem('karaopub_favs') ?? '[]'))
    setMyIds(JSON.parse(localStorage.getItem(`karaopub_my_${code}`) ?? '[]'))
    let dk = localStorage.getItem('karaopub_device')
    if (!dk) {
      dk = crypto.randomUUID()
      localStorage.setItem('karaopub_device', dk)
    }
    setDeviceKey(dk)
    supabase
      .rpc('karaoke_block_terms', { p_code: code })
      .then(({ data }) => setBlockTerms(data ?? []))
  }, [code])

  const isBlocked = (r: SearchResult) => {
    const hay = `${r.title} ${r.channel}`.toLowerCase()
    return blockTerms.some((t) => hay.includes(t))
  }

  const queue = requests.filter((r) => r.status === 'queued')
  const playing = requests.find((r) => r.status === 'playing') ?? null
  const imNext = queue.length > 0 && myIds.includes(queue[0].id)
  const requestsClosed =
    !!room?.requests_close_at && new Date(room.requests_close_at).getTime() <= Date.now()

  // Espera estimada por posición: duración de las canciones de delante + interludios
  const avgSong = queue.length
    ? queue.reduce((a, r) => a + (r.duration_seconds ?? 240), 0) / queue.length
    : 240
  const waitFor = (idx: number) =>
    Math.round(
      (queue.slice(0, idx).reduce((a, r) => a + (r.duration_seconds ?? avgSong), 0) +
        (playing ? (playing.duration_seconds ?? avgSong) / 2 : 0) +
        idx * room!.interlude_seconds) /
        60,
    )

  const applaud = async () => {
    if (!playing) return
    await supabase.rpc('karaoke_applaud', { p_code: code, p_request_id: playing.id })
  }

  // Aviso "¡te toca!": banner + vibración + notificación del navegador
  const warnedNext = useRef(false)
  useEffect(() => {
    if (imNext && !warnedNext.current) {
      warnedNext.current = true
      navigator.vibrate?.([250, 120, 250])
      if (notifPerm === 'granted') {
        try {
          new Notification('🎤 ¡Te toca!', {
            body: `${t.nextUpNotify} ${queue[0].title}`,
            tag: 'karaopub-turn',
          })
        } catch {
          // algunos navegadores solo permiten notificaciones vía SW
        }
      }
    } else if (!imNext) {
      warnedNext.current = false
    }
  }, [imNext, notifPerm, queue])

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
    localStorage.setItem('karaopub_emoji', emoji)
    setName(n)
    setNameTaken(false)
    setNameSet(true)
  }

  // Nombre final en la cola: emoji opcional + dúo opcional
  const stageName = [emoji, name.trim(), duet.trim() ? `& ${duet.trim()}` : '']
    .filter(Boolean)
    .join(' ')

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
    const q = query.trim()
    if (!q) return
    // Si lo buscado está vetado por el pub, modal directo
    if (blockTerms.some((t) => q.toLowerCase().includes(t))) {
      setResults([])
      setSearched(false)
      setBlockedPick({ videoId: '', title: q, channel: '', thumbnail: '', durationSeconds: null })
      return
    }
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
      p_singer: stageName,
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
    const nextFavs = [
      { videoId: r.videoId, title: r.title, channel: r.channel, thumbnail: r.thumbnail, durationSeconds: r.durationSeconds },
      ...favs.filter((f) => f.videoId !== r.videoId),
    ].slice(0, 6)
    setFavs(nextFavs)
    localStorage.setItem('karaopub_favs', JSON.stringify(nextFavs))
    setResults([])
    setQuery('')
    setSearched(false)
    flash(`${t.addedFlash} «${r.title}»`)
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
    flash('Canción quitada de la cola.')
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">{t.loading}</main>
  }
  if (notFound || !room || wrongPub) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-4xl">🎤</p>
        <h1 className="text-xl font-bold">{t.roomNotFound} · {code}</h1>
        <p className="text-sm text-zinc-400">{t.roomNotFoundHint}</p>
      </main>
    )
  }
  if (!room.is_active) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-4xl">🎤</p>
        <h1 className="text-xl font-bold">{t.sessionEnded}</h1>
        <p className="text-sm text-zinc-400">{t.sessionEndedHint}</p>
      </main>
    )
  }

  if (!nameSet) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <form onSubmit={saveName} className="w-full max-w-sm space-y-5 text-center">
          <Logo className="mx-auto h-10 w-auto" />
          <h1 className="text-3xl font-black">
            Karao<span className="text-amber-400">Pub</span> · {room.name}
          </h1>
          <p className="text-lg text-zinc-400">{t.namePrompt}</p>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameTaken(false)
            }}
            placeholder={t.namePlaceholder}
            maxLength={40}
            autoFocus
            className="w-full rounded-xl bg-zinc-800 px-4 py-4 text-center text-xl outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          <input
            value={duet}
            onChange={(e) => setDuet(e.target.value)}
            placeholder={t.duetPlaceholder}
            maxLength={40}
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-base outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          <div>
            <p className="mb-2 text-xs font-bold tracking-widest text-zinc-500">
              {t.emojiTitle}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(emoji === e ? '' : e)}
                  className={`rounded-lg px-2.5 py-1.5 text-2xl transition-transform active:scale-125 ${
                    emoji === e ? 'bg-amber-500/30 ring-2 ring-amber-400' : 'bg-zinc-800'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          {nameTaken && (
            <div className="rounded-xl bg-zinc-900 p-4 text-base">
              <p className="text-amber-300">
                {t.thereIsAlready} {name.trim()} {t.nameTakenHint}
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
                    className="rounded-lg bg-zinc-800 px-4 py-2 font-bold hover:bg-zinc-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            disabled={!name.trim()}
            className="w-full rounded-xl bg-amber-500 py-4 text-lg font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {t.enter}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 overflow-x-hidden bg-zinc-950 p-5 text-zinc-100 sm:max-w-lg">
      <header className="text-center">
        <div className="flex items-center justify-center gap-3">
          <h1 className="flex items-center justify-center gap-2 text-xl font-black">
            <Logo className="h-5 w-auto" />
            Karao<span className="text-amber-400">Pub</span> · {room.name}
          </h1>
          <button
            onClick={() => {
              const next = lang === 'es' ? 'en' : 'es'
              setLang(next)
              localStorage.setItem('karaopub_lang', next)
            }}
            title={lang === 'es' ? 'Switch to English' : 'Cambiar a español'}
            className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700"
          >
            {lang === 'es' ? 'EN' : 'ES'}
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          {t.hello} {stageName} 👋
        </p>
        {notifPerm === 'default' && (
          <button
            onClick={async () => {
              try {
                setNotifPerm(await Notification.requestPermission())
              } catch {
                setNotifPerm('unsupported')
              }
            }}
            className="mt-2 rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300 hover:bg-zinc-700"
          >
            {t.notifyMe}
          </button>
        )}
        {notifPerm === 'denied' && (
          <p className="mt-2 text-xs text-zinc-600">{t.notifDenied}</p>
        )}
        {room.bgm_now && !room.bgm_now_id && (
          <p className="mt-2 truncate rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400">
            🎵 {t.bgmLabel}: {room.bgm_now}
          </p>
        )}
      </header>

      {room.promo_text && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-2.5 text-center text-sm font-bold text-amber-300 ring-1 ring-amber-500/30">
          {room.promo_text}
        </p>
      )}

      {imNext && (
        <div className="animate-pulse rounded-2xl bg-amber-500 p-4 text-center font-black text-zinc-950 shadow-lg shadow-amber-500/30">
          {t.youAreNext}
        </div>
      )}

      {playing && (
        <div className="rounded-2xl bg-amber-500/10 p-4 text-center ring-1 ring-amber-500/40">
          <p className="text-xs font-bold tracking-widest text-amber-400">
            {playing.is_celebration ? `🎉 ${t.celebration}` : t.singingNow}
          </p>
          {playing.is_celebration && playing.celebration_text && (
            <p className="mt-1 text-sm font-bold text-amber-300">🎂 {playing.celebration_text}</p>
          )}
          <p className="mt-1 font-bold">{playing.singer_name}</p>
          <p className="text-sm text-zinc-300">{playing.title}</p>
          <button
            onClick={applaud}
            className="mt-3 rounded-xl bg-zinc-800 px-5 py-2 text-sm font-bold transition-transform hover:bg-zinc-700 active:scale-110"
          >
            {t.applaud}
            {playing.applause > 0 && (
              <span className="ml-1.5 text-amber-400">{playing.applause}</span>
            )}
          </button>
          {room.voting_enabled && (
            <div className="mt-3">
              <p className="text-xs text-zinc-400">{t.howIsItGoing}</p>
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
              {myVote > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  {t.voted} {myVote}/5!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={search} className="space-y-3 rounded-2xl bg-zinc-900 p-4">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 pr-10 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            >
              ✕
            </button>
          )}
        </div>
        <button
          disabled={searching || !query.trim() || !room.accepting_requests || requestsClosed}
          className="w-full rounded-xl bg-amber-500 py-3 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
        >
          {searching ? t.searching : t.searchBtn}
        </button>
        {!room.accepting_requests && (
          <p className="text-center text-sm text-zinc-400">{t.paused}</p>
        )}
        {requestsClosed && (
          <p className="text-center text-sm text-zinc-400">{t.closedNote}</p>
        )}
      </form>

      {msg && <p className="rounded-xl bg-zinc-900 p-3 text-center text-sm text-amber-300">{msg}</p>}

      {!searching && searched && results.length === 0 && (
        <p className="text-center text-zinc-400">{t.noResults}</p>
      )}

      {!searched && favs.length > 0 && (
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-bold tracking-widest text-zinc-400">{t.yourLast}</p>
          {favs.map((r) => (
            <button
              key={r.videoId}
              onClick={() =>
                isBlocked(r)
                  ? setBlockedPick(r)
                  : setPendingPick(r)
              }
              className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 p-3 text-left hover:bg-zinc-800"
            >
              {r.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{r.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-400">{r.channel}</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-amber-400">↻</span>
            </button>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-bold tracking-widest text-zinc-400">{t.pickYours}</p>
          {results.map((r) => (
            <button
              key={r.videoId}
              onClick={() => (isBlocked(r) ? setBlockedPick(r) : setPendingPick(r))}
              className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 p-3 text-left hover:bg-zinc-800"
            >
              {r.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{r.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-400">
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

      <section className={room.bgm_now && room.bgm_now_id ? 'pb-20' : 'pb-8'}>
        {queue.length > 0 && (
          <p className="mb-2 text-xs font-bold tracking-widest text-zinc-400">{t.queue}</p>
        )}
        {queue.length === 0 && !playing && (
          <div className="py-8 text-center">
            <p className="text-lg font-bold text-zinc-300">{t.emptyQueue}</p>
            <p className="mt-3 text-5xl">🎤</p>
            <p className="mt-3 text-base text-zinc-400">{t.emptyQueueHint}</p>
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
                    heading: `${r.singer_name} ${t.willSing}`,
                  })
                }
                title={t.view}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="w-6 text-center font-black text-zinc-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {r.is_celebration && '🎉 '}
                    {r.singer_name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{r.title}</p>
                </div>
                {myIds.includes(r.id) && i > 0 && (
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-400">
                    ~{waitFor(i)} {t.min}
                  </span>
                )}
              </button>
              {myIds.includes(r.id) && (
                <button
                  onClick={() => setPendingCancel(r)}
                  title={t.removeMine}
                  className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-red-300 hover:bg-zinc-700"
                >
                  {t.removeMine}
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      {pendingPick && (
        <Modal
          title={t.confirmPick}
          confirmLabel={
            pickStatus === 'loading' ? (
              <span className="inline-flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-950"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            ) : (
              t.letsSing
            )
          }
          confirmDisabled={pickStatus !== 'ok'}
          onConfirm={() => pick(pendingPick)}
          onClose={() => setPendingPick(null)}
        >
          <div className="mb-3 overflow-hidden rounded-xl">
            <YtPreview
              videoId={pendingPick.videoId}
              onError={() => setPickStatus('error')}
              onOk={() => setPickStatus('ok')}
            />
          </div>
          <p className="font-bold text-zinc-200">{pendingPick.title}</p>
          {pickStatus === 'error' ? (
            <p className="mt-1 text-red-300">{t.notPlayable}</p>
          ) : (
            <p className="mt-1">
              {pendingPick.channel} · {t.previewHint}
            </p>
          )}
        </Modal>
      )}
      {blockedPick && (
        <Modal
          title={t.blockedTitle}
          confirmLabel={t.searchAnother}
          onConfirm={() => setBlockedPick(null)}
          onClose={() => setBlockedPick(null)}
        >
          <p className="font-bold text-zinc-200">{blockedPick.title}</p>
          <p className="mt-1">{t.blockedBody}</p>
        </Modal>
      )}
      {pendingCancel && (
        <Modal
          title={t.removeTitle}
          confirmLabel={t.removeConfirm}
          onConfirm={() => cancelMine(pendingCancel)}
          onClose={() => setPendingCancel(null)}
        >
          <p className="font-bold text-zinc-200">{pendingCancel.title}</p>
          <p className="mt-1">{t.removeBody}</p>
        </Modal>
      )}
      {previewReq && (
        <Modal
          title={previewReq.heading}
          confirmLabel={
            <span className="inline-flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12c0 1.9.2 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.3-1.9.5-3.9.5-5.8 0-1.9-.2-3.9-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
              </svg>
              {t.openYoutube}
            </span>
          }
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
          <p className="mt-1">{t.previewBody}</p>
        </Modal>
      )}
      {room.bgm_now && room.bgm_now_id && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
          <button
            onClick={() =>
              setPreviewReq({
                video_id: room.bgm_now_id!,
                title: room.bgm_now!,
                heading: t.playingBgm,
              })
            }
            className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3 text-left sm:max-w-lg"
          >
            <span className="text-base">🎵</span>
            <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300">{t.bgmLabel}</span> · {room.bgm_now}
            </p>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {t.view}
            </span>
          </button>
        </div>
      )}
    </main>
  )
}

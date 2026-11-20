import Link from 'next/link'
import { Logo } from '@/components/Logo'

// ── Mocks de dispositivo (CSS puro, sin imágenes) ──

function FakeQR() {
  // patrón 7×7 decorativo con esquinas tipo QR
  const corner = 'bg-zinc-900'
  const cells = Array.from({ length: 49 }, (_, i) => {
    const r = Math.floor(i / 7)
    const c = i % 7
    const inCorner = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2)
    return inCorner || (i * 7 + r) % 3 === 0
  })
  return (
    <div className="grid grid-cols-7 gap-px rounded-md bg-white p-1.5">
      {cells.map((on, i) => (
        <div key={i} className={`aspect-square w-full ${on ? 'bg-zinc-900' : ''}`} />
      ))}
    </div>
  )
}

function IPhoneMock() {
  return (
    <div className="mx-auto w-48 shrink-0 rounded-[2.2rem] border-4 border-zinc-700 bg-zinc-950 p-2 shadow-2xl shadow-black/60">
      <div className="mx-auto h-4 w-16 rounded-full bg-zinc-800" />
      <div className="mt-2 space-y-2 rounded-2xl bg-zinc-900/80 p-3 text-left">
        <p className="text-[10px] font-black">Karao<span className="text-amber-400">Pub</span></p>
        <div className="rounded-lg bg-amber-500 px-2 py-1.5 text-center text-[8px] font-black text-zinc-950">
          🎤 ¡Te toca! Eres el siguiente
        </div>
        <div className="rounded-lg bg-zinc-800 px-2 py-1.5 text-[8px] text-zinc-500">
          Canción, artista…
        </div>
        <div className="rounded-lg bg-amber-500 py-1 text-center text-[9px] font-black text-zinc-950">
          Buscar karaoke
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-zinc-800 p-1.5">
          <div className="h-6 w-10 rounded bg-zinc-700" />
          <div className="min-w-0">
            <p className="truncate text-[8px] font-bold text-zinc-200">Bicho raro — Estopa</p>
            <p className="text-[7px] text-zinc-500">KaraokeMedia</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 p-1.5 ring-1 ring-amber-500/40">
          <span className="text-[8px] font-black text-zinc-500">1</span>
          <div>
            <p className="text-[8px] font-bold text-zinc-100">Rubén</p>
            <p className="text-[7px] text-zinc-500">Gravity — John Mayer</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabletMock() {
  return (
    <div className="mx-auto w-64 shrink-0 rounded-2xl border-4 border-zinc-700 bg-zinc-950 p-2 shadow-2xl shadow-black/60">
      <div className="space-y-2 rounded-xl bg-zinc-900/80 p-3 text-left">
        <p className="text-[10px] font-black text-zinc-300">
          🎛️ Cabina · <span className="text-amber-400">Pub Raymi</span>
        </p>
        <p className="text-[7px] font-bold tracking-widest text-zinc-500">EN COLA (3)</p>
        {[
          ['1', 'Rubén', 'Gravity — John Mayer'],
          ['2', 'Marta', 'Bicho raro — Estopa'],
          ['3', 'Jorge', 'La macarena — Los del Río'],
        ].map(([n, s, t]) => (
          <div key={n} className="flex items-center gap-1.5 rounded-lg bg-zinc-800 p-1.5">
            <span className="text-[8px] font-black text-zinc-500">{n}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[8px] font-bold text-zinc-100">{s}</p>
              <p className="truncate text-[7px] text-zinc-500">{t}</p>
            </div>
            <span className="text-[7px] text-zinc-600">▲▼</span>
            <span className="text-[7px] text-amber-400">▶</span>
            <span className="text-[7px] text-red-400">✕</span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-lg bg-zinc-800/60 px-1.5 py-1">
          <p className="text-[7px] text-zinc-400">🎵 Música de fondo</p>
          <p className="text-[7px] text-amber-400">🔀 Aleatoria</p>
        </div>
      </div>
    </div>
  )
}

function TVMock() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="aspect-video w-full overflow-hidden rounded-xl border-8 border-zinc-800 bg-black shadow-2xl shadow-black/80">
        <div className="flex h-full">
          {/* cola */}
          <div className="flex-1 p-4 text-left">
            <p className="text-[8px] font-bold tracking-[0.3em] text-zinc-500 sm:text-[10px]">
              A CONTINUACIÓN
            </p>
            <div className="mt-3 space-y-2">
              {[
                ['1', 'Rubén', 'Gravity — John Mayer'],
                ['2', 'Marta', 'Bicho raro — Estopa'],
                ['3', 'Jorge', 'La macarena'],
              ].map(([n, s, t]) => (
                <div key={n} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-2 py-1.5">
                  <span className="text-[10px] font-black text-amber-400 sm:text-sm">{n}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black text-zinc-100 sm:text-sm">{s}</p>
                    <p className="truncate text-[8px] text-zinc-500 sm:text-[10px]">{t}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <p className="font-mono text-2xl font-black text-amber-400 sm:text-4xl">47</p>
              <p className="text-[7px] font-bold tracking-[0.3em] text-amber-400 sm:text-[9px]">
                SIGUIENTE TURNO
              </p>
              <div className="mx-auto mt-1.5 h-1 max-w-[160px] overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full w-2/3 rounded-full bg-amber-400" />
              </div>
            </div>
          </div>
          {/* QR */}
          <div className="flex w-2/5 flex-col items-center justify-center gap-2 bg-zinc-900 p-3">
            <div className="w-1/2 max-w-24">
              <FakeQR />
            </div>
            <p className="text-[10px] font-black text-zinc-100 sm:text-sm">Pide tu canción</p>
            <p className="font-mono text-sm font-black tracking-[0.2em] text-amber-400 sm:text-lg">
              H R 7 4 P
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto h-3 w-24 rounded-b-lg bg-zinc-800" />
      <div className="mx-auto h-1 w-40 rounded-full bg-zinc-800" />
    </div>
  )
}

// ── Landing ──

export default function Home() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-20 pb-16 text-center">
        <Logo className="h-12 w-auto" />
        <h1 className="mt-6 text-5xl font-black sm:text-6xl">
          Karao<span className="text-amber-400">Pub</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-400 sm:text-xl">
          El karaoke de tu bar. Tus clientes piden canciones desde el móvil, la tele las pone por
          turnos y tú lo controlas todo desde la cabina. Sin apps, sin registros, sin complicaciones.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-xl bg-amber-500 px-6 py-3 font-black text-zinc-950 hover:bg-amber-400"
          >
            Soy un pub — Empezar gratis
          </Link>
          <Link
            href="/join"
            className="rounded-xl bg-zinc-800 px-6 py-3 font-bold hover:bg-zinc-700"
          >
            Entrar a una sala
          </Link>
        </div>
      </section>

      {/* Cómo funciona: 3 pasos */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <h2 className="text-center text-xs font-bold tracking-[0.3em] text-zinc-500">
          CÓMO FUNCIONA
        </h2>
        <div className="mt-8 grid gap-6 text-center sm:grid-cols-3">
          {[
            ['📱', '1 · Escanea', 'El cliente escanea el QR de la tele o escribe el código. Pone su nombre y ya está dentro — sin instalar nada.'],
            ['🎵', '2 · Pide', 'Busca su canción de karaoke como en YouTube, la preescucha y se apunta a la cola. Si está vetada o repetida, lo sabe al instante.'],
            ['🎤', '3 · Canta', 'La tele anuncia su turno con cuenta atrás, pone el vídeo a pantalla completa y pasa al siguiente automáticamente.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="rounded-2xl bg-zinc-900 p-6">
              <p className="text-3xl">{icon}</p>
              <p className="mt-3 font-black text-amber-400">{title}</p>
              <p className="mt-2 text-sm text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mocks de dispositivos */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-center gap-8">
          <div className="text-center">
            <IPhoneMock />
            <p className="mt-3 text-xs font-bold text-zinc-400">📱 El cliente pide desde su móvil</p>
          </div>
          <div className="text-center">
            <TabletMock />
            <p className="mt-3 text-xs font-bold text-zinc-400">🎛️ Tú controlas desde la cabina</p>
          </div>
        </div>
        <div className="mt-10 text-center">
          <TVMock />
          <p className="mt-3 text-xs font-bold text-zinc-400">
            📺 La tele canta: cola, cuenta atrás y QR siempre a la vista
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-center text-xs font-bold tracking-[0.3em] text-zinc-500">
          PENSADO PARA EL BAR DE VERDAD
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['⚡', 'Cero fricción', 'QR + código corto. El cliente no descarga nada ni se registra.'],
            ['🎵', 'Música de fondo', 'Entre turnos suena tu minilista de YouTube — aleatoria o en orden.'],
            ['🚫', 'Vetos por artista', '¿Harto de Despacito? Veta canciones o artistas y el cliente lo ve al buscar.'],
            ['🏆', 'Modo concurso', 'Activa la votación por estrellas y la sala puntúa cada actuación.'],
            ['🔁', 'Anti-repeticiones', 'Detecta la misma canción aunque sea otra subida de YouTube.'],
            ['🎛️', 'Control total', 'Pausa, salta, reordena, adelanta al final y elige quién canta desde la cabina.'],
            ['🔔', 'Aviso de turno', 'El móvil vibra y notifica a cada cliente cuando le toca cantar.'],
            ['📺', 'Tele sin instalar', 'Cualquier navegador vale — emparejas la TV con un código corto.'],
            ['🆓', 'Open source', 'Gratis y de código abierto. Tu sala, tus datos.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="rounded-2xl bg-zinc-900 p-5">
              <p className="text-2xl">{icon}</p>
              <p className="mt-2 font-black">{title}</p>
              <p className="mt-1 text-sm text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-8 text-center">
        <p className="text-2xl font-black">
          ¿Listo para que cante tu bar esta noche?
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block rounded-xl bg-amber-500 px-8 py-4 font-black text-zinc-950 hover:bg-amber-400"
        >
          Crear mi sesión de karaoke
        </Link>
        <p className="mt-10 text-xs text-zinc-600">
          Una aplicación de{' '}
          <a href="https://pubify.es" className="underline hover:text-zinc-400">
            Pubify
          </a>{' '}
          · Código abierto
        </p>
      </section>
    </main>
  )
}

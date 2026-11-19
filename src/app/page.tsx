import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="space-y-10 text-center">
        <div>
          <h1 className="text-6xl font-black">
            Karao<span className="text-amber-400">Pub</span>
          </h1>
          <p className="mt-4 max-w-sm text-zinc-400">
            El karaoke de tu bar: los clientes piden desde el móvil y la tele canta por turnos.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <Link href="/pub-owner" className="block text-zinc-300 underline underline-offset-4 hover:text-amber-400">
            Soy el pub →
          </Link>
          <Link href="/pub-clients" className="block text-zinc-300 underline underline-offset-4 hover:text-amber-400">
            Quiero cantar →
          </Link>
        </div>
        <p className="text-xs text-zinc-600">Una aplicación de Pubify</p>
      </div>
    </main>
  )
}

import { Logo } from '@/components/Logo'

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-100">
      <Logo className="h-28 w-auto" />
      <h1 className="mt-4 text-6xl font-black">
        Karao<span className="text-amber-400">Pub</span>
      </h1>
      <p className="mt-4 max-w-sm text-zinc-400">
        Escanea el QR de la pantalla del local para pedir tu canción.
      </p>
      <p className="mt-10 text-xs text-zinc-600">Una aplicación de Pubify</p>
    </main>
  )
}

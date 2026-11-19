# KaraoPub

El karaoke de tu bar, sin papeles ni gritos. Los clientes piden su canción
desde el móvil (buscando en YouTube modo karaoke) y la tele del local las va
cantando por turnos — con autoplay, avance automático al terminar y cuenta
atrás de 60 segundos entre cantantes.

## Cómo funciona

- **El pub** crea una sala en `/` → obtiene un código de 5 letras, un QR para
  los clientes y dos enlaces privados (TV y cabina).
- **El cliente** (`/sala/CODIGO`) escribe su nombre, busca la canción y elige
  entre los resultados de YouTube — sin salir de la web.
- **La tele** (`/tv/CODIGO`) muestra la cola y el QR. Al pulsar "Empezar la
  noche" reproduce cada canción a pantalla completa (embed de YouTube),
  avanza sola al terminar y muestra un countdown de 60 s entre turnos.
- **La cabina** (`/cabina/CODIGO`) permite al personal saltar canciones,
  reordenar, quitar peticiones, pausar la cola o vaciarla.

## Stack

- **Next.js 16 + React 19 + Tailwind 4** (App Router, Turbopack)
- **Supabase** (Postgres + Realtime): tablas `karaoke_*` y RPCs
  security-definer — toda la lógica de cola vive en la base de datos, el
  frontend solo usa la anon key.
- **youtubei.js** para la búsqueda de canciones (server-side, sin cuota de
  la API oficial).
- **YouTube IFrame API** para la reproducción.

## Desarrollo

```bash
cp .env.example .env.local   # rellena URL + anon key de Supabase
npm install
npm run dev                  # http://localhost:3000
```

El esquema SQL (tablas + RPCs) vive en Supabase; ver historial de migraciones
`karaoke_*` en el proyecto.

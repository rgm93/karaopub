# KaraoPub

El karaoke de tu bar, sin papeles ni gritos. Los clientes piden su canción
desde el móvil (buscando en YouTube modo karaoke) y la tele del local las va
cantando por turnos — con autoplay, avance automático al terminar y cuenta
atrás de 60 segundos entre cantantes.

## Cómo funciona

- **El pub** entra en `/sign-in` con sus credenciales de **Pubify**
  (owner/waiter) → `/pub-owner`. Desde ahí **abre una sesión** de karaoke:
  cada sesión tiene código de 5 letras y QR **únicos**, visibles siempre en
  la tele. También configura: máx. canciones por persona, segundos de
  interludio entre turnos, modo de cola (llegada o rotación justa) y tope
  de la cola. Solo puede haber una sesión activa por pub.
- **El cliente** entra por el QR (`/{ID-PUB}/join?c=CODIGO`) o escribe el
  código de sesión en `/join` (o en `/{ID-PUB}/join`). Ya dentro
  (`/{ID-PUB}/CODIGO`) pone su nombre, busca la canción y elige entre
  resultados de YouTube — sin salir de la web.
- **La tele** se empareja tipo Netflix: el pub genera un código de 6
  dígitos en `/pub-owner` (o en la cabina) y la tele lo introduce en
  `/pub-owner/tv`. Ya emparejada (`/pub-owner/tv/CODIGO`) muestra la cola,
  el código de sesión y el QR. Al pulsar "Empezar la noche" pasa a
  pantalla completa, hace el countdown inicial, reproduce cada canción
  (embed de YouTube), avanza sola al terminar y muestra la cuenta atrás
  entre turnos.
- **La cabina** (`/pub-owner/cabina/CODIGO`) permite al personal saltar
  canciones, reordenar, quitar peticiones, pausar la cola o vaciarla.

## Stack

- **Next.js 16 + React 19 + Tailwind 4** (App Router, Turbopack)
- **Supabase** (Postgres + Realtime + Auth): tablas `karaoke_*` y RPCs
  security-definer — toda la lógica de cola vive en la base de datos, el
  frontend solo usa la anon key. La clave de control vive en
  `karaoke_room_keys`, inaccesible desde el cliente.
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

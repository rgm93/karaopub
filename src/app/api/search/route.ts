import { Innertube } from 'youtubei.js'

type SearchResult = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  durationSeconds: number | null
}

// Innertube instance reuse across invocations / dev reloads
const globalTube = globalThis as unknown as { __karaopubTube?: Innertube }
async function getTube() {
  if (!globalTube.__karaopubTube) {
    globalTube.__karaopubTube = await Innertube.create({
      retrieve_player: false,
      generate_session_locally: true,
    })
  }
  return globalTube.__karaopubTube
}

// ── 1. Innertube (gratis, sin cuota; YouTube a veces bloquea IPs de DC) ──
async function searchInnertube(query: string): Promise<SearchResult[]> {
  const yt = await getTube()
  const search = await yt.search(query, { type: 'video' })
  return ((search.results ?? []) as { type?: string }[])
    .filter((v) => v.type === 'Video')
    .slice(0, 10)
    .map((v) => {
      const video = v as {
        id: string
        title?: { text?: string }
        author?: { name?: string }
        thumbnails?: { url: string }[]
        duration?: { seconds?: number }
      }
      return {
        videoId: video.id,
        title: video.title?.text ?? '',
        channel: video.author?.name ?? '',
        thumbnail: video.thumbnails?.[0]?.url ?? '',
        durationSeconds: video.duration?.seconds ?? null,
      }
    })
}

// ── 2. Invidious (instancias públicas; van y vienen, probamos varias) ──
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://iv.melmac.space',
  'https://invidious.privacyredirect.com',
]

async function searchInvidious(query: string): Promise<SearchResult[]> {
  for (const base of INVIDIOUS) {
    try {
      const res = await fetch(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
        { signal: AbortSignal.timeout(4000), next: { revalidate: 0 } },
      )
      if (!res.ok) continue
      const items = (await res.json()) as {
        type?: string
        videoId?: string
        title?: string
        author?: string
        lengthSeconds?: number
        videoThumbnails?: { url: string }[]
      }[]
      const results = items
        .filter((v) => v.type === 'video' && v.videoId)
        .slice(0, 10)
        .map((v) => ({
          videoId: v.videoId!,
          title: v.title ?? '',
          channel: v.author ?? '',
          thumbnail: v.videoThumbnails?.[0]?.url
            ? `https:${v.videoThumbnails[0].url}`
            : `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          durationSeconds: v.lengthSeconds ?? null,
        }))
      if (results.length) return results
    } catch {
      continue
    }
  }
  return []
}

// ── 3. YouTube Data API oficial (si hay key; ~100 búsquedas/día gratis) ──
async function searchDataApi(query: string): Promise<SearchResult[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
    `&videoEmbeddable=true&maxResults=10&q=${encodeURIComponent(query)}&key=${key}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) return []
  const data = (await res.json()) as {
    items?: {
      id: { videoId: string }
      snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } }
    }[]
  }
  return (data.items ?? []).map((v) => ({
    videoId: v.id.videoId,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    thumbnail:
      v.snippet.thumbnails?.medium?.url ??
      `https://i.ytimg.com/vi/${v.id.videoId}/mqdefault.jpg`,
    durationSeconds: null,
  }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json({ results: [] })

  // ?music=1 → canciones normales para la música de fondo (sin filtro karaoke)
  const query = searchParams.get('music') === '1' ? q : `${q} karaoke`

  let results: SearchResult[] = []
  let source = 'none'

  try {
    results = await searchInnertube(query)
    if (results.length) source = 'innertube'
  } catch {
    // sigue con el siguiente
  }
  if (!results.length) {
    results = await searchInvidious(query)
    if (results.length) source = 'invidious'
  }
  if (!results.length) {
    try {
      results = await searchDataApi(query)
      if (results.length) source = 'data-api'
    } catch {
      // agotado
    }
  }

  return Response.json({ results, source })
}

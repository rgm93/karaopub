import { Innertube } from 'youtubei.js'

// Innertube instance reuse across invocations / dev reloads
const globalTube = globalThis as unknown as { __karaopubTube?: Innertube }
async function getTube() {
  if (!globalTube.__karaopubTube) {
    globalTube.__karaopubTube = await Innertube.create({ retrieve_player: false })
  }
  return globalTube.__karaopubTube
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json({ results: [] })

  try {
    const yt = await getTube()
    const search = await yt.search(`${q} karaoke`, { type: 'video' })
    const items = ((search.results ?? []) as unknown[]).filter(
      (v) => (v as { type?: string }).type === 'Video',
    )
    const results = items.slice(0, 10).map((v) => {
      const video = v as {
        id: string
        title?: { text?: string }
        author?: { name?: string }
        thumbnails?: { url: string }[]
        duration?: { seconds?: number; text?: string }
      }
      return {
        videoId: video.id,
        title: video.title?.text ?? '',
        channel: video.author?.name ?? '',
        thumbnail: video.thumbnails?.[0]?.url ?? '',
        durationSeconds: video.duration?.seconds ?? null,
      }
    })
    return Response.json({ results })
  } catch {
    return Response.json({ results: [], error: 'search_failed' }, { status: 502 })
  }
}

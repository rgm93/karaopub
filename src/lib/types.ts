export type Room = {
  id: string
  code: string
  name: string
  pub_id: string | null
  is_active: boolean
  queue_mode: 'fifo' | 'rotation'
  accepting_requests: boolean
  max_songs_per_singer: number
  interlude_seconds: number
  max_queue: number
  current_request_id: string | null
  interlude_until: string | null
  created_at: string
}

export type RequestStatus = 'queued' | 'playing' | 'done' | 'skipped' | 'error'

export type KaraokeRequest = {
  id: string
  room_id: string
  singer_name: string
  video_id: string
  title: string
  channel_title: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  status: RequestStatus
  created_at: string
  played_at: string | null
}

export type SearchResult = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  durationSeconds: number | null
}

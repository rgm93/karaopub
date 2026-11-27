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
  player_cmd: string | null
  player_cmd_seq: number
  voting_enabled: boolean
  bgm_now: string | null
  bgm_now_id: string | null
  bgm_shuffle: boolean
  tv_zoom: number
  bgm_play_id: string | null
  bgm_play_seq: number
  bgm_cmd: string | null
  bgm_cmd_seq: number
  promo_text: string
  logo_url: string
  karaoke_volume: number
  bgm_volume: number
  requests_close_at: string | null
  created_at: string
}

export type RequestStatus = 'queued' | 'playing' | 'done' | 'skipped' | 'error' | 'removed'

export type KaraokeRequest = {
  id: string
  room_id: string
  singer_name: string
  singer_key: string | null
  video_id: string
  title: string
  channel_title: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  status: RequestStatus
  applause: number
  is_celebration: boolean
  celebration_text: string
  position: number
  created_at: string
  played_at: string | null
}

export type BgmTrack = {
  id: string
  room_id: string
  video_id: string
  title: string
  position: number
}

export type SearchResult = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  durationSeconds: number | null
}

export interface User {
  id: string
  handle: string
}

export interface Label {
  id: string
  slug: string
  name: string
  description: string
  accent_color: string // hex neon colour, e.g. '#00ffcc'
  owner_id?: string // profile that owns this station (null for seeded/system)
  created_at: string
}

export interface Release {
  id: string
  label_id: string
  title: string
  audio_url?: string // for single-track releases
  artwork_url?: string
  owner_id?: string
  released_at: string
  track_count?: number // populated by fetchReleases via an embedded count
}

export interface Track {
  id: string
  release_id: string
  title: string
  audio_url: string // Supabase Storage CDN URL
  duration: number // seconds
  track_number: number
  owner_id?: string
}

export interface ChatMessage {
  handle: string
  text: string
  timestamp: number
}

export interface PresenceMember {
  handle: string
  clientId: string
}

export type Screen = 'auth' | 'stations' | 'tunein' | 'manage'

export interface AppState {
  screen: Screen
  user: User | null
  activeLabel: Label | null
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { oneLine } from './format.js'
import type { Label, Release, Track } from '../types/index.js'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY

// createClient throws on an empty URL; callers gate on hasSupabaseConfig anyway
const PLACEHOLDER_URL = 'http://localhost:54321'

// we persist the session ourselves (lib/session.ts)
export const supabase: SupabaseClient = createClient(url || PLACEHOLDER_URL, anon || 'public-anon-key', {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export function hasSupabaseConfig(): boolean {
  return Boolean(url && anon)
}

export async function fetchLabels(): Promise<Label[]> {
  const { data, error } = await supabase.from('labels').select('*').order('name')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Label[]).map((l) => ({
    ...l,
    name: oneLine(l.name),
    description: l.description ? oneLine(l.description) : l.description,
  }))
}

export async function fetchReleases(labelId: string): Promise<Release[]> {
  // aggregate track count for the "N tk" display
  const { data, error } = await supabase
    .from('releases')
    .select('*, tracks(count)')
    .eq('label_id', labelId)
    .order('released_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const tracks = r.tracks as Array<{ count: number }> | undefined
    return { ...r, title: oneLine(String(r.title ?? '')), track_count: tracks?.[0]?.count ?? 0 } as Release
  })
}

export async function fetchTracks(releaseId: string): Promise<Track[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .eq('release_id', releaseId)
    .order('track_number')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Track[]).map((t) => ({ ...t, title: oneLine(t.title) }))
}

import { supabase } from './supabase.js'
import { oneLine } from './format.js'
import type { Label, Release, Track, User } from '../types/index.js'

export function slugify(name: string): string {
  return (
    oneLine(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'station'
  )
}

// stations owned by the current user
export async function fetchMyStations(ownerId: string): Promise<Label[]> {
  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Label[]
}

// create a station, retrying with a random suffix on slug collision
export async function createStation(
  owner: User,
  opts: { name: string; description?: string; accent_color: string },
): Promise<Label> {
  const base = slugify(opts.name)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase
      .from('labels')
      .insert({
        slug,
        name: oneLine(opts.name),
        description: opts.description ? oneLine(opts.description) : '',
        accent_color: opts.accent_color,
        owner_id: owner.id,
      })
      .select()
      .single()
    if (!error && data) return data as Label
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)
  }
  throw new Error('Could not create station — slug already taken')
}

export async function createRelease(owner: User, labelId: string, title: string): Promise<Release> {
  const { data, error } = await supabase
    .from('releases')
    .insert({ label_id: labelId, title: oneLine(title), owner_id: owner.id })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Release
}

export async function updateStation(
  id: string,
  patch: { name?: string; description?: string; accent_color?: string },
): Promise<void> {
  const next: Record<string, string> = {}
  if (patch.name !== undefined) next.name = oneLine(patch.name)
  if (patch.description !== undefined) next.description = oneLine(patch.description)
  if (patch.accent_color !== undefined) next.accent_color = patch.accent_color
  const { error } = await supabase.from('labels').update(next).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteStation(id: string): Promise<void> {
  const { error } = await supabase.from('labels').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateRelease(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('releases').update({ title: oneLine(title) }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteRelease(id: string): Promise<void> {
  const { error } = await supabase.from('releases').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateTrack(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('tracks').update({ title: oneLine(title) }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTrack(id: string): Promise<void> {
  const { error } = await supabase.from('tracks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function addTrack(
  owner: User,
  releaseId: string,
  t: { title: string; audio_url: string; duration: number; track_number: number },
): Promise<Track> {
  const { data, error } = await supabase
    .from('tracks')
    .insert({
      release_id: releaseId,
      title: oneLine(t.title),
      audio_url: t.audio_url,
      duration: t.duration,
      track_number: t.track_number,
      owner_id: owner.id,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Track
}

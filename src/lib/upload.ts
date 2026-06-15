import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { supabase } from './supabase.js'

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
}

// upload to audio/<uid>/<slug>/<file> (the RLS-scoped prefix), return public URL
export async function uploadAudio(uid: string, slug: string, filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  const safe = basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_')
  const objectPath = `${uid}/${slug}/${Date.now()}-${safe}`
  const data = readFileSync(filePath)
  const { error } = await supabase.storage.from('audio').upload(objectPath, data, {
    contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return supabase.storage.from('audio').getPublicUrl(objectPath).data.publicUrl
}

// remove an uploaded file by public URL; no-op for external URLs
export async function deleteAudio(publicUrl: string): Promise<void> {
  const marker = '/object/public/audio/'
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length))
  await supabase.storage.from('audio').remove([path]).catch(() => {})
}

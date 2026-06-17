import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { supabase } from './supabase.js'
import type { StorageProvider } from '../types/index.js'

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
}

const serverUrl = (): string | undefined => process.env.XMIT_SERVER_URL?.replace(/\/+$/, '')

// Supabase access token for the token-server's Authorization header (the server
// validates it and scopes the storage key to the caller's uid).
async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('not signed in')
  return token
}

export interface UploadResult {
  url: string // public CDN URL to store in audio_url
  key: string // object key within the bucket
  provider: StorageProvider
}

// Upload via the token server: request a presigned R2 PUT URL, then PUT the
// bytes directly to R2 (the server never proxies the file body). The server
// derives the uid from the JWT and owns the key prefix.
export async function uploadAudio(slug: string, filePath: string): Promise<UploadResult> {
  const base = serverUrl()
  if (!base) throw new Error('XMIT_SERVER_URL not set — uploads require the token server')

  const ext = extname(filePath).toLowerCase()
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
  const data = readFileSync(filePath)
  const token = await accessToken()

  const signRes = await fetch(`${base}/upload/sign`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ slug, filename: basename(filePath), contentType, size: data.byteLength }),
  })
  if (!signRes.ok) {
    const detail = await signRes.text().catch(() => '')
    throw new Error(`upload authorization failed (${signRes.status})${detail ? `: ${detail}` : ''}`)
  }
  const { uploadUrl, publicUrl, key, requiredHeaders } = (await signRes.json()) as {
    uploadUrl: string
    publicUrl: string
    key: string
    requiredHeaders?: Record<string, string>
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { ...(requiredHeaders ?? {}) },
    body: data,
  })
  if (!putRes.ok) throw new Error(`upload to storage failed (${putRes.status})`)

  return { url: publicUrl, key, provider: 'r2' }
}

interface Deletable {
  audio_url: string
  storage_provider?: StorageProvider
  storage_key?: string | null
}

// Remove an uploaded object. R2 objects go through the token server (the client
// can't authenticate to R2); legacy Supabase objects are removed directly.
export async function deleteAudio(track: Deletable): Promise<void> {
  if (track.storage_provider === 'r2') {
    const base = serverUrl()
    if (!base || !track.storage_key) return
    try {
      const token = await accessToken()
      await fetch(`${base}/upload/delete`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ key: track.storage_key }),
      })
    } catch {
      // best-effort: a failed delete leaves an orphan object, never crashes the app
    }
    return
  }

  // Legacy Supabase Storage: derive the key from the public URL.
  const marker = '/object/public/audio/'
  const idx = track.audio_url.indexOf(marker)
  if (idx === -1) return
  const path = decodeURIComponent(track.audio_url.slice(idx + marker.length))
  await supabase.storage.from('audio').remove([path]).catch(() => {})
}

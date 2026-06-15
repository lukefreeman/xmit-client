import { parseFile } from 'music-metadata'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, extname, basename } from 'node:path'
import { oneLine } from './format.js'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus'])

export interface AudioMeta {
  path: string
  title: string
  artist?: string
  album?: string
  duration: number // seconds
  trackNumber?: number
}

// expand a leading ~ (the TUI gets the literal path)
export function expandHome(p: string): string {
  const t = p.trim()
  if (t === '~') return homedir()
  if (t.startsWith('~/')) return join(homedir(), t.slice(2))
  return t
}

// resolve a file or folder path to a sorted list of audio files
export function findAudioFiles(input: string): string[] {
  const p = expandHome(input)
  try {
    const st = statSync(p)
    if (st.isFile()) return AUDIO_EXT.has(extname(p).toLowerCase()) ? [p] : []
    if (st.isDirectory()) {
      return readdirSync(p)
        .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()))
        .map((f) => join(p, f))
        .filter((f) => {
          try {
            return statSync(f).isFile()
          } catch {
            return false
          }
        })
        .sort()
    }
  } catch {}
  return []
}

export async function readAudioMeta(filePath: string): Promise<AudioMeta> {
  let title = basename(filePath).replace(/\.[^.]+$/, '')
  let artist: string | undefined
  let album: string | undefined
  let duration = 0
  let trackNumber: number | undefined
  try {
    const md = await parseFile(filePath, { duration: true })
    if (md.common.title) title = md.common.title
    artist = md.common.artist ?? undefined
    album = md.common.album ?? undefined
    trackNumber = md.common.track?.no ?? undefined
    duration = Math.round(md.format.duration ?? 0)
  } catch {
    // unreadable tags: keep filename title + 0 duration
  }
  return {
    path: filePath,
    title: oneLine(title),
    artist: artist ? oneLine(artist) : undefined,
    album: album ? oneLine(album) : undefined,
    duration,
    trackNumber,
  }
}

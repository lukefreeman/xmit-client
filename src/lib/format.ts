// collapse control chars/newlines to spaces and trim to one line
export function oneLine(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 32
    out += code < 32 || code === 127 ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim()
}

// seconds → "m:ss"
export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// epoch ms → "HH:MM" local
export function fmtClock(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// audio format from a URL's extension
export function audioFormat(url: string): string {
  const m = url.toLowerCase().match(/\.(flac|mp3|wav|ogg|m4a|aac|opus)(?:\?|#|$)/)
  return m?.[1] ?? 'stream'
}

// fixed-width "left    right" row, left truncated with an ellipsis
export function padRow(width: number, left: string, right: string): string {
  const w = Math.max(8, width)
  const maxLeft = Math.max(1, w - right.length - 1)
  let l = left
  if (l.length > maxLeft) l = l.slice(0, Math.max(1, maxLeft - 1)) + '…'
  const gap = Math.max(1, w - l.length - right.length)
  return l + ' '.repeat(gap) + right
}

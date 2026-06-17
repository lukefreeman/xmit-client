import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Append diagnostics to ~/.xmit/debug.log. The alt-screen swallows on-screen
// output, so this file is how crashes/connection failures stay root-causable.
// Never throws — logging must not become a new failure mode.
export function logDebug(label: string, detail: unknown): void {
  try {
    const dir = join(homedir(), '.xmit')
    mkdirSync(dir, { recursive: true })
    const text = detail instanceof Error ? (detail.stack ?? detail.message) : String(detail)
    appendFileSync(join(dir, 'debug.log'), `[${new Date().toISOString()}] ${label}: ${text}\n`)
  } catch {}
}

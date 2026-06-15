import { homedir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

// login is in-memory only; this clears session files left by older builds
const DIR = join(homedir(), '.xmit')

export function wipeSessions(): void {
  try {
    rmSync(join(DIR, 'sessions'), { recursive: true, force: true })
  } catch {}
  try {
    rmSync(join(DIR, 'session.json'), { force: true })
  } catch {}
}

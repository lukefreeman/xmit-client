// best-effort mpv install (native dep, can't come through bun install)
//   bun run setup         install mpv via the OS package manager
//   bun run setup --check  report status only (postinstall; never fails)
import { spawnSync } from 'node:child_process'

function isInstalled(cmd: string): boolean {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
  return r.status === 0
}

interface Manager {
  name: string
  install: string[] // command + args to install mpv
}

function detectManager(): Manager | null {
  if (process.platform === 'darwin' && isInstalled('brew')) {
    return { name: 'Homebrew', install: ['brew', 'install', 'mpv'] }
  }
  if (process.platform === 'linux') {
    if (isInstalled('apt-get')) return { name: 'apt', install: ['sudo', 'apt-get', 'install', '-y', 'mpv'] }
    if (isInstalled('dnf')) return { name: 'dnf', install: ['sudo', 'dnf', 'install', '-y', 'mpv'] }
    if (isInstalled('pacman')) return { name: 'pacman', install: ['sudo', 'pacman', '-S', '--noconfirm', 'mpv'] }
    if (isInstalled('zypper')) return { name: 'zypper', install: ['sudo', 'zypper', 'install', '-y', 'mpv'] }
  }
  return null
}

function manualHint(): string {
  switch (process.platform) {
    case 'darwin':
      return 'brew install mpv'
    case 'win32':
      return 'winget install mpv   (or: choco install mpv / scoop install mpv)'
    default:
      return 'install mpv with your package manager, e.g. `sudo apt install mpv`'
  }
}

const checkOnly = process.argv.includes('--check')

if (isInstalled('mpv')) {
  console.log('\x1b[32m✓\x1b[0m mpv is installed — audio playback is enabled.')
  process.exit(0)
}

if (checkOnly) {
  console.log('\x1b[33m·\x1b[0m mpv not found — playback will be disabled until it is installed.')
  console.log('  run \x1b[1mbun run setup\x1b[0m to install it, or: ' + manualHint())
  process.exit(0)
}

const manager = detectManager()
if (!manager) {
  console.log('\x1b[33m·\x1b[0m Could not find a supported package manager.')
  console.log('  Install mpv manually: ' + manualHint())
  process.exit(0)
}

console.log(`Installing mpv via ${manager.name}: ${manager.install.join(' ')}`)
const result = spawnSync(manager.install[0]!, manager.install.slice(1), { stdio: 'inherit' })

if (result.status === 0 && isInstalled('mpv')) {
  console.log('\x1b[32m✓\x1b[0m mpv installed — audio playback is enabled.')
} else {
  console.log('\x1b[33m·\x1b[0m mpv install did not complete. Install it manually: ' + manualHint())
}

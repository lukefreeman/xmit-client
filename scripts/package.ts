// assembles per-platform release archives (binary + bundled mpv from vendor/mpv/<id>/).
// prereqs: bun run compile:all, then place mpv in vendor/mpv/<id>/.
//   bun run scripts/package.ts [id ...]
import { existsSync, rmSync, mkdirSync, cpSync, chmodSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface Target {
  id: string
  bin: string
  exe: string
  win?: boolean
}

const TARGETS: Target[] = [
  { id: 'macos-arm64', bin: 'dist/xmit-macos-arm64', exe: 'xmit' },
  { id: 'macos-x64', bin: 'dist/xmit-macos-x64', exe: 'xmit' },
  { id: 'linux-x64', bin: 'dist/xmit-linux-x64', exe: 'xmit' },
  { id: 'linux-arm64', bin: 'dist/xmit-linux-arm64', exe: 'xmit' },
  { id: 'windows-x64', bin: 'dist/xmit-windows-x64.exe', exe: 'xmit.exe', win: true },
]

const only = process.argv.slice(2)
const targets = only.length ? TARGETS.filter((t) => only.includes(t.id)) : TARGETS

rmSync('release', { recursive: true, force: true })
mkdirSync('release', { recursive: true })

for (const t of targets) {
  if (!existsSync(t.bin)) {
    console.warn(`• skip ${t.id}: ${t.bin} not found — run the matching compile script first`)
    continue
  }
  const outDir = join('release', `xmit-${t.id}`)
  mkdirSync(outDir, { recursive: true })
  cpSync(t.bin, join(outDir, t.exe))
  if (!t.win) chmodSync(join(outDir, t.exe), 0o755)

  const vendorDir = join('vendor', 'mpv', t.id)
  const vendorFiles = existsSync(vendorDir) ? readdirSync(vendorDir).filter((f) => f !== 'README.md') : []
  if (vendorFiles.length) {
    for (const entry of vendorFiles) {
      cpSync(join(vendorDir, entry), join(outDir, entry), { recursive: true })
    }
    console.log(`✓ ${t.id}: bundled mpv (${vendorFiles.join(', ')})`)
  } else {
    console.warn(`• ${t.id}: no mpv in ${vendorDir} — archive will fall back to system mpv`)
  }

  const zipName = `xmit-${t.id}.zip`
  const r = spawnSync('zip', ['-r', '-q', zipName, `xmit-${t.id}`], { cwd: 'release', stdio: 'inherit' })
  if (r.status === 0) console.log(`✓ ${t.id}: release/${zipName}`)
  else console.warn(`• ${t.id}: folder ready at ${outDir} (zip unavailable — archive it manually)`)
}

console.log('done.')

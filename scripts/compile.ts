// bakes public config (Supabase URL/anon key, XMIT_SERVER_URL) into the binary
// via Bun's --define. the Ably key is emptied so a distributed binary uses server mode.
// usage: bun run scripts/compile.ts [bun-<os>-<arch>] [outfile]
import { spawnSync } from 'node:child_process'

const target = process.argv[2]?.trim() ?? ''
const outfile = process.argv[3]?.trim() || 'dist/xmit'

const PUBLIC = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
  XMIT_SERVER_URL: process.env.XMIT_SERVER_URL ?? '',
}

if (!PUBLIC.SUPABASE_URL || !PUBLIC.SUPABASE_ANON_KEY) {
  console.warn('⚠  SUPABASE_URL / SUPABASE_ANON_KEY not set — binary will boot to the config screen.')
}
if (!PUBLIC.XMIT_SERVER_URL) {
  console.warn(
    '⚠  XMIT_SERVER_URL not set — realtime (presence/chat) will be OFF in this binary.\n' +
      '   Deploy ./server and set XMIT_SERVER_URL before a real distribution build.',
  )
}

const defines: string[] = []
for (const [k, v] of Object.entries(PUBLIC)) {
  defines.push('--define', `process.env.${k}=${JSON.stringify(v)}`)
}
// never ship the Ably secret in a binary
defines.push('--define', 'process.env.ABLY_API_KEY=""')
// eliminate ink's DEV-only devtools branch so its react-devtools-core import
// (not installed) is dropped from the bundle instead of crashing at launch.
defines.push('--define', 'process.env.DEV="false"')

const args = [
  'build',
  'src/index.ts',
  '--compile',
  '--minify',
  ...(target ? ['--target', target] : []),
  ...defines,
  '--outfile',
  outfile,
]

console.log(`→ baking public config into ${outfile}${target ? ` (${target})` : ''}`)
const r = spawnSync('bun', args, { stdio: 'inherit' })
process.exit(r.status ?? 1)

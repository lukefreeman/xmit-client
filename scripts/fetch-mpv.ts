// downloads + extracts mpv per platform into vendor/mpv/<id>/ from sources.json.
// entries are { url } or { github, tag, match } (resolves the asset by name).
//   bun run fetch-mpv [id ...]    download + extract
//   bun run fetch-mpv --dry       print resolved URLs only
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const SRC = 'vendor/mpv/sources.json'
if (!existsSync(SRC)) {
  console.error(`✕ missing ${SRC}`)
  process.exit(1)
}

interface Entry {
  url?: string
  github?: string
  tag?: string
  match?: string
  archive?: 'tar.gz' | 'zip'
}
const sources = JSON.parse(readFileSync(SRC, 'utf8')) as Record<string, Entry | string>

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const only = args.filter((a) => !a.startsWith('-'))
const ids = Object.keys(sources).filter((id) => !id.startsWith('_') && (only.length ? only.includes(id) : true))

const releaseCache = new Map<string, { assets?: Array<{ name?: string; browser_download_url?: string }> }>()

// authenticated calls dodge the unauthenticated api.github.com rate limit (60/hr
// per IP), which CI runners share and routinely hit.
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

async function resolveUrl(e: Entry): Promise<string | null> {
  if (e.url) return e.url
  if (!e.github || !e.match) return null
  const key = `${e.github}@${e.tag ?? 'latest'}`
  if (!releaseCache.has(key)) {
    const api = e.tag
      ? `https://api.github.com/repos/${e.github}/releases/tags/${e.tag}`
      : `https://api.github.com/repos/${e.github}/releases/latest`
    const headers: Record<string, string> = { 'user-agent': 'xmit-fetch-mpv', accept: 'application/vnd.github+json' }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(api, { headers })
    if (!res.ok) {
      const hint = res.status === 403 && !token ? ' (rate-limited — set GITHUB_TOKEN)' : ''
      console.warn(`  github api ${res.status} for ${e.github}${hint}`)
      return null
    }
    releaseCache.set(key, (await res.json()) as { assets?: Array<{ name?: string; browser_download_url?: string }> })
  }
  const asset = (releaseCache.get(key)?.assets ?? []).find((a) => a.name?.includes(e.match!))
  return asset?.browser_download_url ?? null
}

// a source is "configured" if it names an explicit url or a github+match to
// resolve. an unconfigured entry (e.g. linux's empty url) is an expected skip;
// a configured one that fails is a real error and fails the run.
const failed: string[] = []

for (const id of ids) {
  const raw = sources[id]
  const e: Entry = typeof raw === 'object' ? raw : {}
  const configured = Boolean(e.url) || Boolean(e.github && e.match)
  const url = await resolveUrl(e)
  if (!url) {
    if (configured) {
      console.warn(`✕ ${id}: configured source did not resolve (asset "${e.match ?? e.url}")`)
      failed.push(id)
    } else {
      console.warn(`• ${id}: no source configured — skip`)
    }
    continue
  }
  if (dry) {
    console.log(`${id}: ${url}`)
    continue
  }

  const outDir = join('vendor', 'mpv', id)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const archive = e.archive ?? (url.endsWith('.zip') ? 'zip' : 'tar.gz')
  const tmp = join(outDir, archive === 'zip' ? '_dl.zip' : '_dl.tgz')

  console.log(`→ ${id}: downloading ${url}`)
  let r = spawnSync('curl', ['-fSL', '-o', tmp, url], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.warn(`✕ ${id}: download failed`)
    failed.push(id)
    continue
  }

  console.log(`→ ${id}: extracting`)
  r =
    archive === 'zip'
      ? spawnSync('unzip', ['-q', '-o', tmp, '-d', outDir], { stdio: 'inherit' })
      : spawnSync('tar', ['-xzf', tmp, '-C', outDir], { stdio: 'inherit' })
  rmSync(tmp, { force: true })
  if (r.status !== 0) {
    console.warn(`✕ ${id}: extract failed`)
    failed.push(id)
    continue
  }

  // some builds are double-archived (e.g. macOS zip → mpv.tar.gz → mpv.app)
  for (const f of readdirSync(outDir)) {
    if (f.endsWith('.tar.gz') || f.endsWith('.tgz') || f.endsWith('.tar.xz')) {
      const inner = join(outDir, f)
      spawnSync('tar', [f.endsWith('.xz') ? '-xJf' : '-xzf', inner, '-C', outDir], { stdio: 'inherit' })
      rmSync(inner, { force: true })
    }
  }

  // confirm something landed, so an empty extract can't pass as success.
  if (readdirSync(outDir).filter((f) => f !== 'README.md').length === 0) {
    console.warn(`✕ ${id}: nothing extracted`)
    failed.push(id)
    continue
  }
  console.log(`✓ ${id}: mpv ready in ${outDir}`)
}

console.log('done.')
if (!dry && failed.length) {
  console.error(`✕ failed to fetch mpv for: ${failed.join(', ')}`)
  process.exit(1)
}

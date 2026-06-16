// Fail-silent update check. Reads the running version (baked at compile time)
// and compares it to the newest GitHub release, resolved via the releases/latest
// redirect — no API call, so no rate limit. Returns the newer version or null.
const REPO = 'lukefreeman/xmit-client'

function parts(v: string): number[] {
  return v
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const a = parts(latest)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

export async function checkForUpdate(): Promise<string | null> {
  const current = process.env.XMIT_VERSION
  if (!current) return null // unversioned (dev) builds don't check
  try {
    const res = await fetch(`https://github.com/${REPO}/releases/latest`, {
      redirect: 'manual',
      headers: { 'user-agent': 'xmit' },
      signal: AbortSignal.timeout(4000),
    })
    const loc = res.headers.get('location')
    const latest = loc?.match(/\/tag\/v?(\d+\.\d+\.\d+)/)?.[1]
    if (!latest) return null
    return isNewer(latest, current) ? latest : null
  } catch {
    return null
  }
}

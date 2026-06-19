// cuts a release: bumps the version, commits it, tags `v<version>`, and pushes
// the tag — which is what triggers .github/workflows/release.yml (build + sign +
// notarize + GitHub Release + Homebrew tap). The git TAG is the source of truth
// for the version (CI bakes it as XMIT_VERSION); package.json is kept in sync
// for tidiness only.
//
//   bun run release            # patch bump from the latest tag (default)
//   bun run release minor      # or: major
//   bun run release 0.2.0      # or an explicit version / vX.Y.Z
//   bun run release --dry      # print the plan, change nothing
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const PKG = join(ROOT, 'package.json')

type Bump = 'patch' | 'minor' | 'major'

function git(args: string[], capture = false): string {
  const r = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  })
  if (r.status !== 0) {
    if (capture && r.stderr) process.stderr.write(r.stderr)
    throw new Error(`git ${args.join(' ')} failed`)
  }
  return (r.stdout ?? '').trim()
}

function die(msg: string): never {
  console.error(`✕ ${msg}`)
  process.exit(1)
}

function parse(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.replace(/^v/, ''))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function cmp(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

// latest semver among `v*` tags (the released version), or null if none
function latestTagVersion(): [number, number, number] | null {
  const tags = git(['tag', '--list', 'v*'], true)
    .split('\n')
    .map((s) => s.trim())
    .map(parse)
    .filter((v): v is [number, number, number] => v !== null)
    .sort(cmp)
  return tags.length ? tags[tags.length - 1]! : null
}

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const positional = args.filter((a) => !a.startsWith('--'))
const arg = positional[0] ?? 'patch'

const pkgRaw = readFileSync(PKG, 'utf8')
const pkgVersion = parse(JSON.parse(pkgRaw).version) ?? [0, 0, 0]
// the released version leads package.json — prefer the latest tag as the base
const base = latestTagVersion() ?? pkgVersion

let next: [number, number, number]
if (parse(arg)) {
  next = parse(arg)!
} else if (arg === 'patch' || arg === 'minor' || arg === 'major') {
  const bump = arg as Bump
  next =
    bump === 'major'
      ? [base[0] + 1, 0, 0]
      : bump === 'minor'
        ? [base[0], base[1] + 1, 0]
        : [base[0], base[1], base[2] + 1]
} else {
  die(`unknown argument "${arg}" — use patch|minor|major or an explicit version`)
}

const version = next.join('.')
const tag = `v${version}`

// safety checks
if (git(['tag', '--list', tag], true)) die(`tag ${tag} already exists`)
const dirty = git(['status', '--porcelain'], true)
if (dirty && !dry) die('working tree is not clean — commit or stash first')
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], true)
if (branch !== 'main') console.warn(`⚠ on branch "${branch}", not main`)

const baseStr = base.join('.')
console.log(`→ release ${baseStr} → ${version}  (tag ${tag}, branch ${branch})`)

if (dry) {
  console.log('  --dry: no changes made')
  console.log(`  would: bump package.json, commit, tag ${tag}, push --follow-tags`)
  process.exit(0)
}

// sync package.json version (regex-replace to preserve formatting)
const bumped = pkgRaw.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`)
if (bumped === pkgRaw) die('could not find "version" in package.json')
writeFileSync(PKG, bumped)
console.log(`✓ package.json → ${version}`)

git(['add', 'package.json'])
git(['commit', '-m', `release ${tag}`])
git(['tag', '-a', tag, '-m', `xmit ${tag}`])
console.log(`✓ committed + tagged ${tag}`)

git(['push', 'origin', branch, '--follow-tags'])
console.log(`✓ pushed ${branch} + ${tag} — CI release is now running`)
console.log('  watch: https://github.com/lukefreeman/xmit-client/actions')

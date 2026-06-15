# Bundled mpv

Drop a self-contained mpv build into the folder for each platform you ship. The
packaging script (`bun run package`) copies these next to the XMIT binary, and
the app finds them at runtime (`lib/mpv.ts` → `resolveMpv`).

```
vendor/mpv/
  macos-arm64/   mpv.app/                (or: mpv + its .dylibs)
  macos-x64/     mpv.app/
  linux-x64/     mpv                     (static build or AppImage renamed to `mpv`)
  linux-arm64/   mpv
  windows-x64/   mpv.exe + *.dll
```

The resolver looks (next to the executable) for `mpv` / `mpv.exe`, `bin/mpv`,
`vendor/mpv`, or `mpv.app/Contents/MacOS/mpv` — so dropping a whole `mpv.app` or
a folder of `mpv.exe + dlls` works as-is.

## Getting builds

`sources.json` resolves the current asset from mpv's GitHub `git-release`
(rolling nightly), so the URLs don't go stale:

```bash
bun run fetch-mpv          # macOS (arm64 + intel) + Windows x64 — download + extract
bun run fetch-mpv --dry    # just print the resolved URLs
```

`fetch-mpv` un-nests double archives (macOS is zip → `mpv.tar.gz` → `mpv.app`).
Version notes: **macos-arm64 needs macOS 14+**, **macos-x64 needs macOS 15+**.

**Linux isn't published on mpv's git-release** — supply your own `url` in
`sources.json` (a static build or an AppImage renamed to `mpv`, `chmod +x`;
AppImages need FUSE on the host).

Or place builds manually: drop a whole `mpv.app` (macOS), `mpv.exe` + `.dll`s
(Windows), or a static `mpv` (Linux) into the platform folder.

## ⚠ Licensing (important)

mpv is **GPLv2+ / LGPL**. Redistributing it (which bundling does) obliges you to
comply: ship the license text and make the **corresponding source** available
(a written offer or a link to the exact build's source is fine, since these are
public builds). Keep the upstream `LICENSE`/`Copyright` files in each folder.

> These binaries are intentionally **git-ignored** (large + license). Fetch them
> per release; don't commit them.

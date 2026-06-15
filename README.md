# XMIT

> Underground music streaming, from your terminal.

XMIT is a TUI music station. Tune into label **stations**, stream their
releases, see who else is listening in real time, and chat — all rendered in the
terminal with neon-on-black cyberpunk styling.

```
Boot ─▶ Auth ─▶ Station Select ─▶ Tune In ─▶ (ESC) ─▶ Station Select
```

## Stack

- **Bun** + **TypeScript** runtime
- **Ink** (React for the terminal) + Yoga layout
- **Supabase** — Postgres (labels / releases / tracks / profiles) + Storage CDN for audio
- **Ably** — realtime presence + chat per station
- **mpv** — audio playback over a JSON IPC socket

## Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Install mpv** (required for playback; the app runs without it but can't play audio)
   ```bash
   brew install mpv        # macOS
   # sudo apt install mpv  # Debian/Ubuntu
   ```

3. **Configure Supabase**
   - Create a project, then run [`schema.sql`](./schema.sql) in the SQL editor.
   - **Disable email confirmation**: Authentication → Providers → Email → turn off
     "Confirm email". Handles map to synthetic `<handle>@xmit.local` emails, so
     confirmation must be off for sign-up to return a session.
   - Upload audio to a **public** Storage bucket and put the public URLs in
     `tracks.audio_url`.

4. **Configure Ably** — grab an API key with presence + publish/subscribe.

5. **Environment**
   ```bash
   cp .env.example .env
   # fill in SUPABASE_URL, SUPABASE_ANON_KEY, ABLY_API_KEY
   ```
   Bun loads `.env` automatically.

6. **Run**
   ```bash
   bun run dev
   ```

## Standalone binary (distribution)

`bun run compile` produces a single self-contained executable (Bun runtime + all
deps) with the **public config baked in** — users run it with **zero env**:

```bash
bun run compile            # this platform → dist/xmit (~62MB)
bun run compile:all        # cross-compile mac/linux/windows → dist/xmit-<os>-<arch>
```

The compile step (`scripts/compile.ts`) bakes `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
and `XMIT_SERVER_URL` from the build env into the binary via `--define`. It
**never bakes the Ably key** — realtime runs through the token server (server
mode), so a distributed binary ships **no secrets**. Set those three in your
`.env` (or shell) before compiling; deploy `./server` first so `XMIT_SERVER_URL`
points somewhere real (otherwise presence/chat are off in the binary).

Run it directly: `./dist/xmit` — no env needed. (macOS: distributed binaries
need code-signing + notarization to avoid Gatekeeper warnings.)

### Bundling mpv (zero-install playback)

mpv isn't embedded *into* the single file (it links many dylibs; per-platform
builds are 50–150MB), so it ships **alongside** the binary in a release archive.
The app finds a co-located mpv at runtime (`lib/mpv.ts` → `resolveMpv`: explicit
`XMIT_MPV_PATH` → next to the executable → system `mpv`).

```bash
bun run compile:all                 # binaries → dist/
# get mpv per platform: paste URLs into vendor/mpv/sources.json, then:
bun run fetch-mpv                    # downloads + extracts into vendor/mpv/<id>/
#   (or place builds manually — see vendor/mpv/README.md)
bun run package                     # → release/xmit-<platform>/ (xmit + mpv) and .zip
```

A user unzips one archive and runs `./xmit` — playback works with no separate
install. mpv is GPL — keep its license/source with the build (see `vendor/mpv`).
If `vendor/mpv/<id>/` is empty the archive still works but falls back to a
system mpv.

### macOS: code-signing + notarization

A downloaded, unsigned binary is Gatekeeper-blocked. Sign + notarize each macOS
release folder (the `xmit` binary **and** the bundled mpv):

```bash
# one-time: store notarization creds in the keychain
xcrun notarytool store-credentials xmit-notary \
  --apple-id you@example.com --team-id TEAMID --password <app-specific-password>

# per release (needs a "Developer ID Application" cert):
export DEVELOPER_ID_APP="Developer ID Application: Your Name (TEAMID)"
scripts/macos/sign.sh release/xmit-macos-arm64
scripts/macos/sign.sh release/xmit-macos-x64
```

`scripts/macos/sign.sh` signs nested dylibs → mpv → the `xmit` binary (hardened
runtime + `scripts/macos/xmit.entitlements`: JIT for Bun, library-validation
disabled so it can load the bundled mpv), zips, and notarizes via `notarytool`.
Loose binaries can't be stapled — Gatekeeper checks the ticket online; for an
offline-stapled artifact, wrap the folder in a `.dmg`/`.pkg` and staple that.

## Controls

**Auth** — `tab` move between fields · `enter` submit · `esc` quit

**Station Select** — `↑/↓` move · `enter` tune in · `esc` log out (back to login) · `Q` quit

**Tune In**
- `tab` — cycle focus: releases → tracks → chat
- `↑/↓` — navigate the focused list
- `enter` — on releases: open tracks · on tracks: play
- `space` — play / pause
- `←/→` — seek ∓10s
- `+/-` — volume
- `esc` — leave station (disconnects presence)

> Note: `↑/↓` drives list navigation in the focused panel; volume is `+`/`-`
> (the spec's `↑/↓`-for-volume would collide with list nav). Seek and play/pause
> work from either list panel.

## Layout

Minimum terminal size **120×30**. The tune-in view is a three-panel grid: a
left releases/tracks column, and a right column stacking now-playing, the live
listener list, and chat.

## Notes

- The Supabase session is cached **per terminal window** under
  `~/.xmit/sessions/` for auto-login — each window keeps its own handle. Set
  `XMIT_SESSION_ID` to share a session across windows (same value) or name one
  explicitly; unset, it keys off the tmux pane / terminal session id / TTY.
- Each label carries its own neon `accent_color` (hex), threaded through the UI.

# Packaging & distribution

## Automated releases (`.github/workflows/release.yml`)

Push a tag → CI compiles all platforms, bundles mpv, packages, signs+notarizes
macOS, and publishes a GitHub Release with the zips:

```bash
git tag v0.1.0 && git push --tags
```

### Required repo secrets

Settings → Secrets and variables → Actions:

| Secret | What |
|---|---|
| `SUPABASE_URL` | baked into the binaries (public) |
| `SUPABASE_ANON_KEY` | baked in (public, RLS-protected) |
| `XMIT_SERVER_URL` | your token server URL, baked in |

### Optional (macOS signing — skipped if absent)

| Secret | What |
|---|---|
| `DEVELOPER_ID_APP` | `Developer ID Application: Name (TEAMID)` (presence enables signing) |
| `MACOS_CERT_P12` | base64 of your Developer ID cert: `base64 -i cert.p12 \| pbcopy` |
| `MACOS_CERT_PASSWORD` | the .p12 export password |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | notarization (app-specific password) |

Without these, the workflow still builds + publishes — macOS users just bypass
Gatekeeper once (right-click → Open).

> CI fetches mpv for macOS + Windows. Linux mpv isn't on mpv's git-release, so
> the Linux binary falls back to system mpv unless you add a URL to
> `vendor/mpv/sources.json`.

## Homebrew tap (`homebrew/xmit.rb`)

Create a repo `github.com/lukefreeman/homebrew-xmit`, copy `xmit.rb` to
`Formula/xmit.rb`, fill in the release URLs + sha256s (`shasum -a 256 …`). Then:

```bash
brew install lukefreeman/xmit/xmit      # and `brew upgrade` handles updates
```

## curl installer (`install.sh`)

Host it (it can live in the repo) and users run:

```bash
curl -fsSL https://raw.githubusercontent.com/lukefreeman/xmit-client/main/packaging/install.sh | sh
```

Installs to `~/.xmit` (binary + mpv together) and symlinks `~/.local/bin/xmit`.

> Per release, update the `version`, release URLs, and sha256s in `xmit.rb`
> (`shasum -a 256 release/xmit-*.zip`).

# Spec 001 — Audio storage on Cloudflare R2

| | |
|---|---|
| **Status** | Draft (planning only — no implementation) |
| **Author** | Luke Freeman |
| **Created** | 2026-06-17 |
| **Affects** | `src/lib/upload.ts`, `server/`, `migrations/`, `src/types/index.ts` |
| **Does not affect** | playback path (`TuneInScreen`, `mpv.ts`), auth, presence/chat |

## 1. Summary

Move uploaded audio from **Supabase Storage** to **Cloudflare R2**, served over a
Cloudflare CDN custom domain. Uploads are authorized by the existing token
server (`server/`) via **presigned PUT URLs**, mirroring the Ably-token pattern.
The DB keeps storing a playable URL per track, so the playback path is untouched.

## 2. Motivation

For a streaming app the dominant cost is **egress** (bytes served), not storage.
R2 charges **zero egress**; Supabase Storage charges ~$0.09/GB over quota. The
catalog itself is cheap to store either way — what scales with listeners is
bandwidth, and that is exactly where R2 wins.

### Rough cost comparison

| | Storage / GB-mo | Egress / GB | Read/Write ops |
|---|---|---|---|
| Supabase Storage | ~$0.021 | **~$0.09** | included |
| Cloudflare R2 | ~$0.015 | **$0.00** | Class A (write) ~$4.50/M · Class B (read) ~$0.36/M |

Illustrative: 500 listeners × 50 tracks × 8 MB ≈ **200 GB/mo egress** →
~$18/mo on Supabase vs **$0** on R2. The gap widens with usage. (Confirm current
published pricing before committing; these numbers drift.)

## 3. Goals / Non-goals

**Goals**
- New uploads land in R2; playback streams from R2 over a CDN domain.
- R2 credentials never leave the server (consistent with "no Ably secret in the binary").
- Existing Supabase-hosted tracks keep working throughout and after migration.
- Storage backend is identified per-track so deletes/migration are not URL-string-parsing.

**Non-goals**
- Changing the playback UX or `mpv` integration.
- Per-listener access control / DRM (public access retained for v1; see §8).
- Transcoding, waveform generation, or any media processing.
- Replacing Supabase for the database, auth, or presence — only Storage.

## 4. Current state (as built)

- **Upload** — `src/lib/upload.ts::uploadAudio(uid, slug, filePath)` reads the file
  and calls `supabase.storage.from('audio').upload('<uid>/<slug>/<ts>-<file>', …)`
  using the signed-in user's JWT (RLS scopes the `<uid>/…` prefix). Returns the
  **public** URL from `getPublicUrl`.
- **Persistence** — the public URL is stored in `tracks.audio_url` (see
  `src/types/index.ts`, written via `src/lib/library.ts`).
- **Playback** — `src/screens/TuneInScreen.tsx` calls `mpv.play(track.audio_url)`.
  mpv streams directly from the URL; the play path is **storage-agnostic**.
- **Delete** — `src/lib/upload.ts::deleteAudio(publicUrl)` reverse-engineers the
  object key by string-matching `/object/public/audio/` in the URL, then calls
  `supabase.storage.remove`. This coupling to the URL format is the main thing
  that must change.
- **Server** — `server/` is a Fastify app. Routes live in `server/src/routes/`
  and are registered in `server/src/index.ts`. JWT validation is
  `server/src/auth.ts::handleFromRequest` (uses `supabase.auth.getUser(token)`).
  Env is validated in `server/src/env.ts` via `required()`. Per-route rate limits
  already exist (e.g. `tokenRateMax` for `/ably/token`).

Audio is currently **public** (anyone with the URL can stream) — effectively a
public CDN already, which makes the access model in §8 a continuation, not a change.

## 5. Proposed architecture

```
  Upload (write)                          Playback (read)
  ──────────────                          ───────────────
  client                                  client (mpv)
    │ 1. POST /upload/sign (Bearer JWT)      │
    ▼                                        │ GET https://cdn.xmit.../<uid>/<slug>/<ts>-<file>
  token server  ── validates JWT             │   (HTTP range requests for seeking)
    │ 2. returns { uploadUrl, publicUrl,      ▼
    │    key, headers }                     Cloudflare CDN  ──(cache miss)──▶ R2 bucket
    ▼                                        (free egress, edge-cached)
  client ── 3. PUT bytes ──▶ R2 (presigned, direct; no server proxy)
    │ 4. write track row via Supabase (RLS), storing key + publicUrl
    ▼
  Supabase DB (tracks)
```

Key properties:
- Large bytes go **client → R2 directly** (presigned PUT). The server only signs;
  it never proxies file bodies (no bandwidth/memory cost on the server).
- R2 is S3-compatible, so presigning uses standard S3 SigV4.
- Reads go through a **Cloudflare custom domain** bound to the bucket → CDN
  cache + zero egress. Object keys are unique (timestamped), so responses can be
  `Cache-Control: public, max-age=31536000, immutable`.
- The client is **not a browser** → no CORS preflight on the PUT. (R2 CORS only
  matters if a browser client is ever added.)

## 6. Server API (new route module `server/src/routes/upload.ts`)

### `POST /upload/sign`
Authorize and presign a single upload.

- **Auth**: `Authorization: Bearer <supabase access token>`. Validate with the
  same path as `handleFromRequest`, but resolve the **user id** (`data.user.id`),
  not just the handle — the storage prefix is `<uid>/…`. (Extend `auth.ts` to
  return `{ uid, handle }` or add a sibling helper.)
- **Request body**: `{ slug: string, filename: string, contentType: string, size: number }`
- **Server-side checks**:
  - reject if unauthenticated → 401
  - validate `contentType` against an allowlist (mirror `CONTENT_TYPES` in
    `upload.ts`) → 415
  - enforce a max `size` (see migration `003-track-limit.sql`; keep the limit
    authoritative **here**, not only client-side) → 413
  - sanitize `filename` (`[^a-zA-Z0-9._-] → _`) and build the key
    `key = "<uid>/<slug>/<ts>-<safe>"`
- **Response**: `{ uploadUrl, publicUrl, key, requiredHeaders: { "Content-Type": … } }`
  - `uploadUrl` — presigned `PUT`, short TTL (e.g. 5 min)
  - `publicUrl` — `https://<cdn-domain>/<key>` (the value stored in `tracks.audio_url`)
- **Rate limit**: dedicated bucket like `tokenRateMax` (e.g. `uploadRateMax`).

### `POST /upload/delete`
Delete an object (client can't authenticate to R2 directly).

- **Auth**: Bearer JWT.
- **Body**: `{ key: string }`
- **Check**: the key **must** start with the caller's `<uid>/` prefix → else 403.
  (Never trust a client-supplied key without prefix-binding to the caller.)
- Performs `DeleteObject` against R2 with the server's credentials.

### Presigning library
R2 is S3-compatible. Two options for the server:
- **`aws4fetch`** — tiny, dependency-light, Bun/Workers-friendly. Recommended.
- **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`** — heavier but canonical.

### Server env additions (`server/src/env.ts`)
```
R2_ACCOUNT_ID         required
R2_ACCESS_KEY_ID      required
R2_SECRET_ACCESS_KEY  required
R2_BUCKET             required            // e.g. "xmit-audio"
R2_PUBLIC_BASE_URL    required            // e.g. "https://cdn.xmit.fm"
R2_ENDPOINT           derived             // https://<account>.r2.cloudflarestorage.com
uploadRateMax         optional (default ~20/min)
```
These are **server-only** secrets — added to the server host (Fly/Railway, per
`server/fly.toml` / `railway.json`) and to the server's CI secrets if it deploys
via CI. They are **never** baked into the client binary.

## 7. Data model changes (`migrations/004-track-storage-provider.sql`)

Stop depending on URL string-parsing. Add to `tracks` (and any other table that
references audio — single-track release `audio_url` on `releases`, per
`types/index.ts`):

```sql
alter table tracks
  add column storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column storage_key text;        -- object key within the bucket
```

- New R2 uploads write `storage_provider = 'r2'`, `storage_key = <key>`, and the
  CDN URL into `audio_url`.
- Existing rows stay `supabase` (backfilled to `r2` during migration §9).
- `deleteAudio` becomes provider-aware: `r2` → `POST /upload/delete`,
  `supabase` → existing path. No more URL parsing.
- RLS: keep insert/update/delete scoped to the owning user, as in
  `001-user-stations.sql` / `002-rls-hardening.sql`.

## 8. Access model — decision point

| | Public (recommended v1) | Signed GET |
|---|---|---|
| URL | stable CDN URL in `audio_url` | short-lived, minted per play by server |
| Caching | full edge cache, cache-forever | weaker (query-string/TTL churn) |
| Cost | $0 egress, fewest ops | $0 egress + extra server calls per play |
| Control | anyone with URL can stream | revocable, per-listener |
| Client change | none | `TuneInScreen` must fetch a fresh URL before `mpv.play` |

v1 keeps **public** (matches today's behavior, simplest, best caching).
Signed URLs can be added later as a per-station/per-release toggle without a
schema change beyond a flag — the `storage_key` column already enables minting.

Hotlink/abuse mitigation for public mode: Cloudflare rate-limiting / WAF, and
the option to flip to signed later.

## 9. Migration of existing audio

Both Supabase Storage and R2 are S3-compatible → copy bucket-to-bucket with
**`rclone`**.

1. **Dual-write** (Phase 1): new uploads → R2; old tracks keep Supabase URLs and
   keep playing. No backfill required to ship the write path.
2. **Backfill** (Phase 3): `rclone sync supabase-audio: r2-audio:` (S3 remotes on
   both ends), preserving keys. Then a SQL update rewrites `audio_url` →
   `R2_PUBLIC_BASE_URL || '/' || storage_key` and sets `storage_provider='r2'`
   for migrated rows.
3. **Verify** then **decommission**: confirm playback on migrated rows, then
   retire the Supabase `audio` bucket (or keep read-only as cold backup for a grace period).

## 10. Client changes (`src/lib/upload.ts`)

- `uploadAudio(uid, slug, filePath)`:
  1. read file + derive `contentType`/`size` (as today)
  2. `POST {XMIT_SERVER_URL}/upload/sign` with the Supabase access token
     (reuse the session-token retrieval already used by `ably.ts::requestToken`)
  3. `fetch(uploadUrl, { method: 'PUT', body: bytes, headers: requiredHeaders })`
  4. return `{ publicUrl, key }` so the caller stores both
- `deleteAudio`: branch on `storage_provider` (`r2` → `/upload/delete`,
  `supabase` → existing).
- `library.ts` / `ManageScreen.tsx`: persist `storage_provider` + `storage_key`
  alongside `audio_url` when creating tracks/releases.
- **Graceful degradation** (load-bearing per `CLAUDE.md`): if the server is
  unreachable, uploads fail with a clear error — never crash. Playback is
  unaffected (URLs are already in the DB).

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Seeking breaks** if range requests aren't served | mpv relies on HTTP `Range`; R2+Cloudflare supports it. **Verify first in Phase 2** with a real scrub test — this is the highest-signal early check. |
| Presigned URL leaks | short TTL (5 min), single-use intent, key prefix bound to caller |
| Client sends forged key to delete | server enforces `key.startsWith(uid + '/')` |
| Two providers during migration | `storage_provider` column drives all branching; no URL parsing |
| Server becomes critical for uploads | it already is for Ably tokens — no new operational surface; keep rate limits |
| Cost surprise from ops | Class A/B ops are negligible at this scale; egress is the only thing that mattered and it's $0 |
| Secret sprawl | R2 creds only on server host + server CI; never in `compile.ts` `--define` |

## 12. Rollout & rollback

- **Rollout**: Phase 0 infra → Phase 1 write path (dual-run) → Phase 2 verify →
  Phase 3 backfill + cutover. Each phase is independently shippable.
- **Rollback**: because old URLs remain valid and `storage_provider` is explicit,
  reverting the client to Supabase uploads is a one-line switch; already-migrated
  rows keep working from R2. No data loss path as long as the Supabase bucket is
  retained until Phase 3 verification passes.

## 13. Test plan

- Upload a track → row has `storage_provider='r2'`, `storage_key`, CDN `audio_url`.
- Play it end-to-end in a real client; **scrub/seek** mid-track (range requests).
- Confirm Cloudflare cache `HIT` on second play.
- Delete a track → object gone from R2; forged-key delete (other uid) → 403.
- Mixed catalog: a Supabase-era track and an R2 track both play in the same session.
- Server down → upload fails cleanly; existing playback unaffected.

## 14. Open questions / decisions to confirm

1. **Access model**: public (recommended v1) vs signed GET? → §8
2. **CDN domain**: dedicated subdomain (e.g. `cdn.xmit.fm`) or `r2.dev`? Affects
   `R2_PUBLIC_BASE_URL` and cache rules.
3. **Presign lib**: `aws4fetch` (recommended) vs AWS SDK.
4. **Where does the server deploy** (Fly vs Railway) and where do R2 secrets live in CI?
5. **Backfill timing**: lazy (migrate-on-next-touch) vs one-shot `rclone`? One-shot
   is simpler and recommended given catalog size is modest.

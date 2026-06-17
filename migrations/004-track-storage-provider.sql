-- XMIT — track which storage backend each audio object lives in. Run in the
-- Supabase SQL editor after 003. Idempotent.
--
-- Audio is migrating from Supabase Storage to Cloudflare R2 (Spec 001). Storing
-- the provider + object key (instead of reverse-engineering the public URL on
-- delete) lets old Supabase tracks and new R2 tracks coexist, and makes a
-- public-base-URL swap (r2.dev -> custom domain) a one-line UPDATE.
--
--   storage_provider : where the object lives ('supabase' = legacy, 'r2' = new)
--   storage_key      : object key within the bucket (R2 only; null for legacy)

alter table tracks
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_key text;

-- Single-track releases can also carry audio directly.
alter table releases
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_key text;

-- After backfilling objects to R2 (rclone), point existing rows at the CDN:
--   update tracks
--     set audio_url = 'https://<public-base>/' || storage_key, storage_provider = 'r2'
--     where storage_provider = 'r2' and storage_key is not null;

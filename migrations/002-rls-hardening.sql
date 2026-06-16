-- XMIT — RLS hardening. Run in the Supabase SQL editor after 001. Idempotent.
-- Fixes cross-station content injection and tightens the audio bucket.

-- 1. Re-parenting fix --------------------------------------------------------
-- The 001 UPDATE policies only checked owner_id = auth.uid(), so an owner could
-- repoint their release/track at someone else's label/release (the INSERT
-- policies guard this, UPDATE did not). Re-check parent ownership on UPDATE too.

drop policy if exists "Owners update releases" on releases;
create policy "Owners update releases" on releases for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from labels l where l.id = label_id and l.owner_id = auth.uid())
  );

drop policy if exists "Owners update tracks" on tracks;
create policy "Owners update tracks" on tracks for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from releases r where r.id = release_id and r.owner_id = auth.uid())
  );

-- 2. Audio bucket: cap size + restrict to audio MIME types -------------------
-- Stops the public-read user-prefix bucket from being used as a general file
-- host and caps per-object storage cost.
-- Must cover every type upload.ts sends (CONTENT_TYPES), incl. audio/opus.
update storage.buckets
set file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = array[
      'audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/x-m4a',
      'audio/flac','audio/x-flac','audio/ogg','audio/opus','audio/wav','audio/x-wav'
    ]
where id = 'audio';

-- 3. (Optional) per-user content quota --------------------------------------
-- Pure RLS can't cap row counts; uncomment to limit stations per user as an
-- anti-abuse measure. Adjust the cap to taste.
--
-- create or replace function enforce_label_quota() returns trigger as $$
-- begin
--   if (select count(*) from labels where owner_id = new.owner_id) >= 25 then
--     raise exception 'station limit reached';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer;
-- drop trigger if exists label_quota on labels;
-- create trigger label_quota before insert on labels
--   for each row execute function enforce_label_quota();

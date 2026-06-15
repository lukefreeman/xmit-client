-- XMIT — user-owned stations (Model A: upload & share).
-- Run this in the Supabase SQL editor on an existing project. Idempotent.

-- 1. Ownership ---------------------------------------------------------------
alter table labels   add column if not exists owner_id uuid references profiles(id) on delete cascade;
alter table releases add column if not exists owner_id uuid references profiles(id) on delete cascade;
alter table tracks   add column if not exists owner_id uuid references profiles(id) on delete cascade;

-- 2. RLS: owners manage their own rows (public read policies already exist) ---
-- labels
drop policy if exists "Owners insert labels" on labels;
create policy "Owners insert labels" on labels for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "Owners update labels" on labels;
create policy "Owners update labels" on labels for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Owners delete labels" on labels;
create policy "Owners delete labels" on labels for delete to authenticated
  using (owner_id = auth.uid());

-- releases (must belong to a label the user owns)
drop policy if exists "Owners insert releases" on releases;
create policy "Owners insert releases" on releases for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from labels l where l.id = label_id and l.owner_id = auth.uid())
  );
drop policy if exists "Owners update releases" on releases;
create policy "Owners update releases" on releases for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Owners delete releases" on releases;
create policy "Owners delete releases" on releases for delete to authenticated
  using (owner_id = auth.uid());

-- tracks (must belong to a release the user owns)
drop policy if exists "Owners insert tracks" on tracks;
create policy "Owners insert tracks" on tracks for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from releases r where r.id = release_id and r.owner_id = auth.uid())
  );
drop policy if exists "Owners update tracks" on tracks;
create policy "Owners update tracks" on tracks for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Owners delete tracks" on tracks;
create policy "Owners delete tracks" on tracks for delete to authenticated
  using (owner_id = auth.uid());

-- 3. Storage: public-read 'audio' bucket, write scoped to each user's prefix --
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read audio" on storage.objects;
create policy "Public read audio" on storage.objects for select
  using (bucket_id = 'audio');

-- objects are stored as  audio/<uid>/<station-slug>/<file>  — first folder = uid
drop policy if exists "Users upload own audio" on storage.objects;
create policy "Users upload own audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own audio" on storage.objects;
create policy "Users update own audio" on storage.objects for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own audio" on storage.objects;
create policy "Users delete own audio" on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

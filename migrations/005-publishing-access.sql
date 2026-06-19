-- XMIT — gated publishing. Run in the Supabase SQL editor after 004. Idempotent.
--
-- Model: anyone can register + listen, but creating stations/releases/tracks
-- requires `can_publish`. Access is granted by redeeming an invite code (or set
-- manually in the dashboard). Enforcement lives in RLS — the TUI only adapts UX,
-- and the token server double-checks before signing uploads.

-- 1. publisher flag ----------------------------------------------------------
alter table profiles add column if not exists can_publish boolean not null default false;

-- helper: is the CURRENT user a publisher? Used in RLS insert policies below.
create or replace function public.is_publisher() returns boolean as $$
  select coalesce((select can_publish from profiles where id = auth.uid()), false);
$$ language sql stable security definer;

-- 2. invite codes ------------------------------------------------------------
create table if not exists invite_codes (
  code text primary key,
  grants_publish boolean not null default true,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Locked down: no client policies => deny all direct access. Codes are created
-- by an admin (SQL/dashboard) and redeemed only via redeem_invite() below.
alter table invite_codes enable row level security;

-- Redeem an invite for the calling user; grants publish access. Atomic
-- (row lock), security definer so it can update profiles + invite_codes despite
-- their RLS. Raises a human-readable exception on any failure.
create or replace function public.redeem_invite(invite_code text)
returns boolean as $$
declare
  rec invite_codes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select * into rec from invite_codes where code = invite_code for update;
  if not found then
    raise exception 'invalid invite code';
  end if;
  if rec.expires_at is not null and rec.expires_at < now() then
    raise exception 'invite code expired';
  end if;
  if rec.used_count >= rec.max_uses then
    raise exception 'invite code already used';
  end if;

  update invite_codes set used_count = used_count + 1 where code = rec.code;
  if rec.grants_publish then
    update profiles set can_publish = true where id = auth.uid();
  end if;
  return true;
end;
$$ language plpgsql security definer;

grant execute on function public.redeem_invite(text) to authenticated;

-- 3. gate content creation on can_publish ------------------------------------
-- (recreate the 001 insert policies with the publisher check added)
drop policy if exists "Owners insert labels" on labels;
create policy "Owners insert labels" on labels for insert to authenticated
  with check (owner_id = auth.uid() and public.is_publisher());

drop policy if exists "Owners insert releases" on releases;
create policy "Owners insert releases" on releases for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_publisher()
    and exists (select 1 from labels l where l.id = label_id and l.owner_id = auth.uid())
  );

drop policy if exists "Owners insert tracks" on tracks;
create policy "Owners insert tracks" on tracks for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_publisher()
    and exists (select 1 from releases r where r.id = release_id and r.owner_id = auth.uid())
  );

-- 4. anti-abuse quotas -------------------------------------------------------
-- stations per user
create or replace function enforce_label_quota() returns trigger as $$
begin
  if (select count(*) from labels where owner_id = new.owner_id) >= 5 then
    raise exception 'station limit reached (max 5 per user)';
  end if;
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists label_quota on labels;
create trigger label_quota before insert on labels
  for each row execute function enforce_label_quota();

-- per-user total storage cap (sum of track bytes). bytes is recorded at upload.
alter table tracks add column if not exists bytes bigint not null default 0;
create or replace function enforce_storage_quota() returns trigger as $$
declare
  used bigint;
  cap  bigint := 2147483648; -- 2 GB per user
begin
  select coalesce(sum(bytes), 0) into used from tracks where owner_id = new.owner_id;
  if used + coalesce(new.bytes, 0) > cap then
    raise exception 'storage limit reached (max 2GB per user)';
  end if;
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists storage_quota on tracks;
create trigger storage_quota before insert on tracks
  for each row execute function enforce_storage_quota();

-- Generate an invite (run as admin in the SQL editor):
--   insert into invite_codes (code, max_uses, note)
--   values ('XMIT- ' || substr(md5(random()::text), 1, 8), 1, 'for <person>');

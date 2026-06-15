-- XMIT — Supabase schema. Run in the Supabase SQL editor.
-- NOTE: handle-based auth maps each handle to a synthetic email
-- (<handle>@xmit.local), so you MUST disable "Confirm email" under
-- Authentication → Providers → Email, or sign-ups won't return a session.
--
-- For user-owned stations + uploads (Model A), also run
-- migrations/001-user-stations.sql after this file.

-- Profiles (linked to Supabase Auth) ------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  created_at timestamptz default now()
);

-- Labels (stations) -----------------------------------------------------------
create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  accent_color text not null default '#00ffcc',
  created_at timestamptz default now()
);

-- Releases --------------------------------------------------------------------
create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  label_id uuid references labels(id) on delete cascade,
  title text not null,
  artwork_url text,
  released_at timestamptz default now()
);

-- Tracks ----------------------------------------------------------------------
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references releases(id) on delete cascade,
  title text not null,
  audio_url text not null,
  duration integer not null default 0,
  track_number integer not null default 1
);

-- Row Level Security ----------------------------------------------------------
alter table profiles enable row level security;
create policy "Public profiles" on profiles for select using (true);
create policy "Own profile insert" on profiles for insert with check (auth.uid() = id);

alter table labels enable row level security;
create policy "Public labels" on labels for select using (true);

alter table releases enable row level security;
create policy "Public releases" on releases for select using (true);

alter table tracks enable row level security;
create policy "Public tracks" on tracks for select using (true);

-- Seed data (dev) -------------------------------------------------------------
insert into labels (slug, name, description, accent_color)
values ('nocturne', 'Nocturne Records', 'Dark ambient and industrial electronics', '#5af7be')
on conflict (slug) do nothing;

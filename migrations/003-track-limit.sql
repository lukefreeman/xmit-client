-- XMIT — cap tracks per release. Run in the Supabase SQL editor after 002. Idempotent.
-- Hard-enforces the 10-track-per-release limit the TUI checks client-side
-- (MAX_TRACKS_PER_RELEASE in src/screens/ManageScreen.tsx). Pure RLS can't cap
-- row counts, so use a BEFORE INSERT trigger (same pattern as 002's quota note).

create or replace function enforce_track_limit() returns trigger as $$
begin
  if (select count(*) from tracks where release_id = new.release_id) >= 10 then
    raise exception 'track limit reached (max 10 per release)';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists track_limit on tracks;
create trigger track_limit before insert on tracks
  for each row execute function enforce_track_limit();

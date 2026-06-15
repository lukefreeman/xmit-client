-- Mock data for the 'nocturne' station so the scrolling panels have content.
-- Run in the Supabase SQL editor. Safe to re-run (it just adds more).
-- Remove later with:  delete from releases where title like 'Transmission %';

with lbl as (
  select id from labels where slug = 'nocturne'
),
ins as (
  insert into releases (label_id, title, released_at)
  select (select id from lbl),
         'Transmission ' || lpad(g::text, 2, '0'),
         now() - (g || ' days')::interval
  from generate_series(1, 24) as g
  returning id
)
insert into tracks (release_id, title, audio_url, duration, track_number)
select ins.id,
       'Signal ' || lpad(t::text, 2, '0'),
       'https://archive.org/download/testmp3testfile/mpthreetest.mp3',
       120 + (t * 13) % 240,                    -- 2:00–6:00 spread
       t
from ins
cross join lateral generate_series(1, 5 + floor(random() * 16)::int) as t;  -- 5–20 tracks each

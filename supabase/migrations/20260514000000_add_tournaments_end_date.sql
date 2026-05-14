-- Required by public home and tournament logic (see app/page.tsx, types/tournament.ts).
-- Run in Supabase SQL Editor on production if this migration was never applied.
alter table public.tournaments
  add column if not exists end_date date;

comment on column public.tournaments.end_date is 'Last day of the tournament; optional. Used for public active/past filters.';

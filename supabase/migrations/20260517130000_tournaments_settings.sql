-- Cierre oficial de ronda (round_closures en JSON), captura R2 y listados públicos.
-- Run in Supabase SQL Editor on production if this migration was never applied.

alter table public.tournaments
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.tournaments.settings is
  'Tournament config JSON: format, handicap, tee_sheet, round_closures (official round close timestamps by round_no), etc.';

-- Firmas de tarjeta por jugador dentro de un grupo de captura.
-- Cada inscripción (entry) tiene una fila por grupo que se actualiza con
-- dos firmas:
--   * signed_by_player_at: el propio jugador firma (con sus iniciales).
--   * signed_by_witness_at + signed_by_witness_entry_id: el testigo
--     asignado a este jugador firma como testigo de la tarjeta.
-- Cuando ambos timestamps están presentes la tarjeta queda
-- "entregada y firmada".

create table if not exists public.card_signatures (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pairing_groups(id) on delete cascade,
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  round_id uuid null,
  signed_by_player_at timestamptz null,
  signed_by_witness_at timestamptz null,
  signed_by_witness_entry_id uuid null
    references public.tournament_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, entry_id)
);

create index if not exists card_signatures_group_idx
  on public.card_signatures(group_id);

alter table public.card_signatures enable row level security;

drop policy if exists "anon read card_signatures" on public.card_signatures;
create policy "anon read card_signatures"
  on public.card_signatures for select to anon using (true);

drop policy if exists "auth read card_signatures" on public.card_signatures;
create policy "auth read card_signatures"
  on public.card_signatures for select to authenticated using (true);

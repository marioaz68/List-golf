-- Witnesses (cruce de tarjetas) + private hole scores ("Mi Tarjeta").
--
-- - private_hole_scores: tarjeta personal del jugador (no visible para
--   los demás del grupo). El jugador y su caddie la editan; los demás
--   no la ven. No alimenta el scoring oficial.
--
-- - score_witnesses: por grupo, a cada jugador se le asigna un testigo
--   (otro jugador del mismo grupo). Se asigna al azar en server al
--   primer load del grupo.
--
-- - hole_scores.pending_witness: cuando alguien modifica un score que
--   ya tenía valor, la celda queda pendiente hasta que el testigo la
--   apruebe.

-- ============================================================
-- 1) score_witnesses
-- ============================================================
create table if not exists public.score_witnesses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pairing_groups(id) on delete cascade,
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  witness_entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, entry_id),
  check (entry_id <> witness_entry_id)
);

create index if not exists score_witnesses_group_idx
  on public.score_witnesses(group_id);
create index if not exists score_witnesses_witness_idx
  on public.score_witnesses(witness_entry_id);

alter table public.score_witnesses enable row level security;

drop policy if exists "anon read score_witnesses" on public.score_witnesses;
create policy "anon read score_witnesses"
  on public.score_witnesses for select to anon using (true);

drop policy if exists "auth read score_witnesses" on public.score_witnesses;
create policy "auth read score_witnesses"
  on public.score_witnesses for select to authenticated using (true);

-- ============================================================
-- 2) private_hole_scores
-- ============================================================
create table if not exists public.private_hole_scores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pairing_groups(id) on delete cascade,
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  strokes int null check (strokes is null or (strokes >= 1 and strokes <= 15)),
  last_edited_by_role text null,
  last_edited_at timestamptz not null default now(),
  unique (group_id, entry_id, hole_number)
);

create index if not exists private_hole_scores_entry_idx
  on public.private_hole_scores(group_id, entry_id);

alter table public.private_hole_scores enable row level security;

-- Los endpoints API usan service role: cliente no puede leer/escribir
-- directo. Si en el futuro queremos lectura via realtime, aquí van las
-- policies finas (por entry_id del que abrió el link).

-- ============================================================
-- 3) hole_scores: marcar pendiente de aprobación
-- ============================================================
alter table public.hole_scores
  add column if not exists pending_witness boolean not null default false;

alter table public.hole_scores
  add column if not exists pending_at timestamptz null;

alter table public.hole_scores
  add column if not exists pending_by_role text null;

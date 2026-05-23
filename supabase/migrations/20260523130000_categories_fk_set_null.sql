-- Permitir borrar categorías sin bloquear por rondas o inscripciones huérfanas.
-- Antes: ON DELETE NO ACTION → 409 al borrar una categoría con datos asociados.
-- Después: ON DELETE SET NULL → la categoría se borra y las filas relacionadas
--          quedan con category_id NULL (se pueden reasignar después).

alter table public.rounds
  drop constraint if exists rounds_category_id_fkey;
alter table public.rounds
  add constraint rounds_category_id_fkey
  foreign key (category_id)
  references public.categories(id)
  on delete set null;

alter table public.tournament_entries
  drop constraint if exists tournament_entries_category_id_fkey;
alter table public.tournament_entries
  add constraint tournament_entries_category_id_fkey
  foreign key (category_id)
  references public.categories(id)
  on delete set null;

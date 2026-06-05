-- Hora real de salida del grupo (match play R2+: sin tee_time programado).
-- Usada por ritmo de juego en lugar de pairing_groups.tee_time cuando está presente.
alter table public.pairing_groups
  add column if not exists actual_start_at timestamptz;

comment on column public.pairing_groups.actual_start_at is
  'Momento en que el grupo salió al campo (marcado manualmente o por comité).';

create index if not exists idx_pairing_groups_actual_start_at
  on public.pairing_groups (actual_start_at)
  where actual_start_at is not null;

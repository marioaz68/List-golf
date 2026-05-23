-- Columnas usadas en home público y backoffice (evita error si faltan en producción).
alter table public.tournaments
  add column if not exists is_public boolean not null default true;

alter table public.tournaments
  add column if not exists is_archived boolean not null default false;

comment on column public.tournaments.is_public is
  'Si false, el torneo no aparece en listgolf.club ni en páginas públicas.';
comment on column public.tournaments.is_archived is
  'Torneos archivados: ocultos del listado público y del alta por nombre duplicado.';

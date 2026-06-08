-- ============================================================================
-- Nuevo rol 'restaurante' — acceso limitado al módulo F&B
--
-- Para el chef/manager del restaurante Mucho (o de cualquier restaurante del
-- club). Solo puede entrar a /fb-admin y a la futura /fb-cocina. NO ve
-- tee-sheet, handicap, scorecards, ni nada más del backoffice.
--
-- El comité asigna este rol desde /users → asignar rol global.
-- ============================================================================

INSERT INTO public.roles (code, name, description)
VALUES (
  'restaurante',
  'Restaurante / Cocina',
  'Personal del restaurante. Solo puede editar el menú F&B y ver pedidos entrantes en cocina. Sin acceso al resto del backoffice del club.'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Sincronización en vivo de captura grupal (opcional con políticas RLS de lectura).
-- El cliente usa polling por defecto; esta migración habilita Realtime si se configuran políticas.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hole_scores'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.hole_scores';
  END IF;
END $$;

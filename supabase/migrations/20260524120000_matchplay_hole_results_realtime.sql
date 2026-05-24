-- Agrega matchplay_hole_results al publication supabase_realtime para que
-- las pantallas públicas de "matches en vivo" reciban cada hoyo capturado
-- al instante (live scoring sin recargar la página).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'matchplay_hole_results'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.matchplay_hole_results';
  END IF;
END $$;

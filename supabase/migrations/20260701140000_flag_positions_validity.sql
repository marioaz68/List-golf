-- Ventana de vigencia de la bandera: "válida de X (effective_date) a Y".
-- Si hoy ya pasó valid_until y no hay captura nueva, Yardas vuelve al centro.
-- valid_until NULL = vigente indefinidamente hasta la próxima captura (default).

ALTER TABLE public.course_hole_flag_positions
  ADD COLUMN IF NOT EXISTS valid_until date NULL;

COMMENT ON COLUMN public.course_hole_flag_positions.valid_until IS
  'Último día en que la bandera es vigente. NULL = hasta la próxima captura. Pasada esta fecha sin recaptura, Yardas usa el centro del green.';

-- La sesión de captura por Telegram también arrastra el valid_until para que
-- la ubicación que comparta el encargado herede la ventana indicada.
ALTER TABLE public.telegram_flag_sessions
  ADD COLUMN IF NOT EXISTS valid_until date NULL;

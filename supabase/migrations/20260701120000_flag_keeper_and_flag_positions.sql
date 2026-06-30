-- Encargado de banderas (flag_keeper) + posiciones diarias de la bandera/pin.
--
-- Caso de uso: una persona dedicada recorre los 18 greens y registra dónde
-- quedó la bandera ese día. Normalmente 2 veces por semana; en torneo, a
-- diario. Captura principalmente por GPS en vivo (parado junto a la bandera)
-- desde Telegram, con ajuste fino opcional en el mapa satélite.
--
-- Se guarda histórico por fecha: la posición vigente de cada hoyo es la del
-- registro más reciente.

-- 1) Rol nuevo dedicado: flag_keeper.
INSERT INTO public.roles (code, name, description)
VALUES (
  'flag_keeper',
  'Encargado de banderas',
  'Registra la posición de la bandera (pin) en los 18 greens cada que cambian. Acceso solo al módulo de banderas.'
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2) Posiciones de bandera por hoyo y fecha (con histórico).
CREATE TABLE IF NOT EXISTS public.course_hole_flag_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  -- 'gps'  = ubicación en vivo de Telegram (parado en el green)
  -- 'map'  = ajustada/arrastrada en el mapa satélite (respaldo)
  source text NOT NULL DEFAULT 'gps'
    CHECK (source IN ('gps', 'map')),
  -- Fecha a la que aplica la bandera (horario de México). La vigente de cada
  -- hoyo es la del registro más reciente por (course, hole, effective_date).
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  -- Quién la capturó (chat de Telegram y, si está vinculado, su profile).
  captured_by_chat_id text NULL,
  captured_by_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  accuracy_m double precision NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- La posición vigente se resuelve por la más reciente: ordenar por fecha y
-- por created_at descendente filtrando course+hole.
CREATE INDEX IF NOT EXISTS idx_flag_positions_course_hole_recent
  ON public.course_hole_flag_positions
  (course_id, hole_number, effective_date DESC, created_at DESC);

COMMENT ON TABLE public.course_hole_flag_positions IS
  'Histórico de posiciones de la bandera (pin) por hoyo y fecha. La vigente de cada hoyo es la más reciente.';

ALTER TABLE public.course_hole_flag_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flag_positions_select_authenticated"
  ON public.course_hole_flag_positions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "flag_positions_write_authenticated"
  ON public.course_hole_flag_positions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3) Sesión activa de captura por Telegram: indica en qué hoyo está parado el
--    encargado, para que su SIGUIENTE ubicación en vivo se guarde en ese hoyo
--    (en vez de tratarse como ritmo de juego). Una fila por usuario de Telegram.
CREATE TABLE IF NOT EXISTS public.telegram_flag_sessions (
  telegram_user_id text PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.telegram_flag_sessions IS
  'Hoyo activo de captura de bandera por encargado (telegram_user_id). Su próxima ubicación en vivo se guarda en ese hoyo.';

ALTER TABLE public.telegram_flag_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_flag_sessions_write_authenticated"
  ON public.telegram_flag_sessions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

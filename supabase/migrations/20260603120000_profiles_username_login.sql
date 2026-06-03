-- Usuario (username) independiente del correo para iniciar sesión.
--
-- Permite que un usuario entre al sistema con su email O con un nombre de
-- usuario corto. El username es opcional, único (sin distinguir mayúsculas) y
-- nunca debe contener "@" para no confundirse con un email durante el login.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

COMMENT ON COLUMN public.profiles.username IS
  'Nombre de usuario opcional para login alterno al email. Único sin distinguir mayúsculas. No debe contener "@".';

-- Único sin distinguir mayúsculas, ignorando valores nulos.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uniq
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

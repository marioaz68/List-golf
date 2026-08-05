-- Firma digital opcional al capturar distancia (más cerca de la bandera).

ALTER TABLE public.closest_to_pin_entries
  ADD COLUMN IF NOT EXISTS signature_payload text NULL,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signer_name text NULL;

COMMENT ON COLUMN public.closest_to_pin_entries.signature_payload IS
  'Firma dibujada (data URL PNG) del capturador/testigo al guardar la distancia.';
COMMENT ON COLUMN public.closest_to_pin_entries.signed_at IS
  'Momento de la firma digital.';
COMMENT ON COLUMN public.closest_to_pin_entries.signer_name IS
  'Nombre escrito del firmante (staff o testigo).';

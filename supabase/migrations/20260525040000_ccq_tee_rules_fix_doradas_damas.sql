-- Ajuste de reglas de salidas para el torneo CCQ Match Play Mixto 2026
-- conforme a la convocatoria oficial:
--
--   - DORADAS: solo CABALLEROS (M) mayores de 65 años.
--   - BLANCAS (Damas): Damas con HI <= 5.9.
--   - ROJAS: Damas con HI >= 6.0.
--   - AZULES: Caballeros con HI <= 6.4.
--   - BLANCAS (Caballeros): Caballeros con HI 6.5 - 25.6.
--
-- Idempotente: WHERE por id, no rompe si ya está aplicado.

UPDATE public.category_tee_rules
SET gender = 'M'
WHERE id = '4871daca-9ef5-4dc9-afef-2b50345a5cb3'
  AND tournament_id = 'a3badced-0b7d-47cc-9f31-1d13545dc5f9';

UPDATE public.category_tee_rules
SET handicap_max = 5.9
WHERE id = '54cba025-7b90-48df-929d-f71592987ad3'
  AND tournament_id = 'a3badced-0b7d-47cc-9f31-1d13545dc5f9';

UPDATE public.category_tee_rules
SET handicap_min = 6.0
WHERE id = 'c1a90a9f-fac4-4890-8ee0-1578510352fb'
  AND tournament_id = 'a3badced-0b7d-47cc-9f31-1d13545dc5f9';

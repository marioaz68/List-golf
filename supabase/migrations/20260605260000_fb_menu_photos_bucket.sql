-- ============================================================================
-- Bucket de Supabase Storage para fotos del menú F&B.
--
-- El restaurante sube una foto por item desde /fb-admin/emojis. La URL
-- pública se guarda en fb_menu_items.image_url y la Mini App la muestra
-- como thumbnail de 56x56.
--
-- Convención de path en el bucket: '{item_id}.{ext}' — sobreescribe la
-- foto anterior del mismo item, no hay versionado.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('fb-menu-photos', 'fb-menu-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Lectura pública: cualquiera puede ver las fotos (las muestra la Mini App
-- sin autenticación). Las fotos son del menú del restaurante, no es info
-- sensible.
DROP POLICY IF EXISTS "fb_menu_photos_public_read" ON storage.objects;
CREATE POLICY "fb_menu_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fb-menu-photos');

-- Escritura: solo service_role (las server actions usan createAdminClient
-- que bypassa RLS). No exponemos upload directo al cliente.

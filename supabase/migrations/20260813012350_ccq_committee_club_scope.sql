-- Comité permanente CCQ: handicap_committee a alcance club.
-- No toca roles de torneo del Mixto. Cuentas de prueba pasan a Torneo prueba 2.

DO $$
DECLARE
  v_role uuid := '9cf3c206-14bf-48ae-8ccc-4cbcbfb43225'; -- handicap_committee
  v_club uuid := '14a694e1-e268-4090-951f-032570385731'; -- Club Campestre de Querétaro
  v_prueba uuid := 'eb492f19-b690-41f2-9adb-e31eb1a37a05'; -- Torneo prueba 2
  v_eugenio uuid := 'c40f5cda-172f-43cf-aedd-a160e5bd92e5';
  v_mariate uuid := '31c07567-d6fc-44b7-b771-0c11926d2081';
BEGIN
  INSERT INTO public.user_club_roles (user_id, club_id, role_id, is_active)
  SELECT u, v_club, v_role, true
  FROM unnest(ARRAY[
    '56efda55-2fd8-471b-91a9-571ce4747da1'::uuid, -- arecamier@ccq.mx
    '6fd3ecb8-838f-436b-a61e-8e60d580580a'::uuid, -- grupoartheria@yahoo.com
    '20452a8b-2dc9-4983-a3b4-8089beb2c73b'::uuid, -- jessibarreda12@gmail.com
    'adbc3a3e-7616-45c1-9345-1fe6722618d8'::uuid, -- jvalentin@ccq.mx
    'cc96f6d5-b811-4d63-b2cb-034d2d8b1097'::uuid, -- licsergioborbolladiaz@gmail.com
    '638aa1de-fad7-44a2-a8f3-4bf20788a00b'::uuid, -- loyolacarla96@gmail.com
    '62315bf4-7976-4bce-b336-3d6ac2f7766e'::uuid, -- luisfelipe@logoro.com.mx
    '0b1bfd60-49f2-42a5-904b-506751f3a30d'::uuid, -- mario.alvarez@onaxis.mx
    '6cfae02c-aafd-4e78-805e-f9244f78bb05'::uuid, -- sandovalsam@icloud.com
    '0f3808e2-7f61-4e89-872a-f40a9f2a121e'::uuid  -- suarezjosealfonso@gmail.com
  ]) AS u
  ON CONFLICT (user_id, club_id, role_id)
  DO UPDATE SET is_active = true;

  UPDATE public.user_club_roles
     SET is_active = false
   WHERE club_id = v_club
     AND role_id = v_role
     AND user_id IN (v_eugenio, v_mariate);

  INSERT INTO public.user_tournament_roles (user_id, tournament_id, role_id, is_active)
  VALUES
    (v_eugenio, v_prueba, v_role, true),
    (v_mariate, v_prueba, v_role, true)
  ON CONFLICT (user_id, tournament_id, role_id)
  DO UPDATE SET is_active = true;
END $$;

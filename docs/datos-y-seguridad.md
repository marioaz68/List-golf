---
titulo: Modelo de datos, roles y seguridad
modulo: datos-y-seguridad
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Modelo de datos, roles y seguridad

## Que resuelve
Quien puede tocar que cosa del torneo: el comite y el director configuran, los capturistas y marshals meten scores, el comite de handicap vota ajustes de HI en secreto, el restaurante solo ve su menu, y el publico solo ve el leaderboard.
Al mismo tiempo tiene que dejar operar en el campo a gente que NO tiene cuenta: jugadores y caddies capturan desde un link de Telegram, el jugador firma su distancia de par 3 desde un QR, el comensal pide desde el QR de la mesa.
La solucion es doble: roles en tres alcances (global / club / torneo) para el backoffice, y tokens de un solo uso con caducidad para todo lo que pasa sin sesion. Casi todas las escrituras de campo van por API con service role (RLS saltada) porque el actor no esta autenticado.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| lib/auth/permissions.ts | Catalogo de roles, matriz MODULE_ACCESS, ruta→modulo, prefijos que exigen sesion | 411 |
| proxy.ts | Middleware de Next 16: sesion + gate por modulo + redirect de solo-comite | 106 |
| lib/auth/getUserRoles.ts | Une roles global+club+torneo (is_active=true) en un solo array de codigos | 89 |
| lib/auth/requireTournamentAccess.ts | Gate por torneo (super_admin / club_admin / marshal de club / roles de torneo) | 146 |
| lib/auth/listAccessibleTournaments.ts | Scope de torneos visibles del usuario (global vs limitado) | 107 |
| app/(backoffice)/layout.tsx | Segunda barrera: sin sesion o sin ningun modulo → /login | 68 |
| app/(backoffice)/users/actions.ts | Editar perfil, password y asignar/quitar roles de club y torneo | 587 |
| app/(backoffice)/users/new/actions.ts | Alta de usuario (auth.admin.createUser + profiles + rol inicial) | 405 |
| app/login/actions.ts | Login con email o username, y landing segun rol | 175 |
| utils/supabase/server.ts | createClient (anon+cookies, respeta RLS) y createAdminClient | 43 |
| utils/supabase/admin.ts | createAdminClient / tryCreateAdminClient (service role, salta RLS) | 30 |
| lib/auth/scoreEntryDataClient.ts | Valida acceso al torneo y luego devuelve cliente admin a proposito | 32 |
| lib/auth/isCommitteeOnlyUser.ts | Detecta usuario que SOLO es handicap_committee | 14 |
| lib/auth/navModules.ts | Modulo de permiso de cada item del sidebar | 57 |
| lib/telegram/linkToken.ts | Tokens t.me/?start= para vincular jugador/caddie (14 dias, one-time) | 268 |
| lib/telegram/validateInitData.ts | Valida HMAC del initData de Mini App (max 24 h) | 77 |
| lib/mobile/resolvePlayer.ts | initData → players.id via telegram_user_id | 26 |
| lib/cercanos/acceptToken.ts | Token de aceptacion de distancia del jugador (48 h) | 36 |
| lib/fb/userScope.ts | Scope de venues F&B por rol y fb_user_venues | 63 |
| lib/captura/roundClosure.ts | Ronda cerrada por fecha (hoy en America/Mexico_City) | 21 |
| app/setup-admin/actions.ts | Bootstrap del primer admin con BOOTSTRAP_ADMIN_SECRET (legacy) | 127 |
| supabase/migrations/20260525120000_handicap_committee.sql | fn_user_is_super_admin, fn_user_can_manage_tournament, fn_user_is_handicap_committee_member, RLS del comite | 320 |
| supabase/migrations/20260812145036_ghin_tables_rls.sql | fn_user_can_read_ghin + RLS/grants de tablas GHIN | 121 |
| supabase/migrations/20260813000615_harden_archive_committee_rpc.sql | RPC de archivado de votos (solo service_role) | 139 |
| supabase/migrations/20260603120000_profiles_username_login.sql | profiles.username unico case-insensitive | 16 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| roles | Catalogo de roles (id, code, name, description). El codigo compara contra `code` | no (creada en Supabase); filas nuevas se insertan en 20260525120000, 20260601190000, 20260605220000, 20260701120000 |
| user_global_roles | Rol en todo el sistema (super_admin, club_admin, handicap_committee...) | no (creada en Supabase) |
| user_club_roles | Rol dentro de un club → alcanza todos los torneos del club | no (creada en Supabase) |
| user_tournament_roles | Rol solo en un torneo | no (creada en Supabase) |
| profiles | Perfil del usuario del sistema: email, username, first/last name, is_active, telegram_username, telegram_chat_id | no (creada en Supabase); columnas nuevas en 20260601190000 y 20260603120000 |
| user_profiles | LEGACY. Solo la usa /setup-admin con role='admin'. No participa en permisos | no (creada en Supabase) |
| tournaments, tournament_entries, rounds, pairing_groups, pairing_group_members, players, categories, clubs, courses, course_holes, tee_sets, tournament_tee_sets, course_tee_sets, tee_set_catalog, tournament_holes, category_* , round_advancement_rules | Nucleo del torneo | no (creada en Supabase); columnas nuevas si en migraciones (is_private/kind, tee_override, flagged_for_committee...) |
| hole_scores, round_scores, scorecards, scorecard_signatures, scorecard_signature_requests, scorecard_audit_log | Scores y tarjetas | no (creada en Supabase) |
| hole_score_audit | Bitacora de captura/edicion de scores con actor | 20260529190000_hole_score_audit.sql |
| private_hole_scores, score_witnesses, card_signatures | Mi Tarjeta privada, testigo por jugador y firmas de tarjeta | 20260527230000, 20260528010000 |
| matchplay_matches, matchplay_brackets, matchplay_pair_teams, matchplay_hole_results, tournament_matchplay_rules | Match play y subasta | 20260522120000 y siguientes |
| matchplay_sessions, matchplay_ryder_cups, matchplay_ryder_scoreboard | Sesiones y Ryder | no (creada en Supabase) |
| tournament_handicap_committees, handicap_committee_votes, handicap_committee_member_presence, handicap_committee_vote_sessions, handicap_committee_vote_snapshots | Comite de handicap por torneo, votos, presencia y archivo | 20260525120000, 20260526160000, 20260812211059 |
| ghin_rounds, ghin_index_revisions, ghin_competition_rounds, ghin_import_log | Historico GHIN del club (datos personales de socios) | 20260812140908, 20260812202303 |
| player_files | Archivos del jugador (reporte GHIN) + bucket privado `player-files` | 20260527020000 |
| course_hole_reference_points, course_hole_polygons, course_hole_tee_positions, course_hole_flag_positions, yardage_shot_logs, yardage_player_bags, watch_swing_events | Yardas/GPS/banderas/reloj | 20260610180000 … 20260713140000 |
| yardage_excluded_shots, yardage_excluded_holes | Exclusiones de estadisticas de la app movil | no (creada en Supabase) |
| ritmo_positions | Posiciones GPS de grupos, carritos y marshals | no (creada en Supabase); columnas en 20260607163000, 20260607240000, 20260819120000 |
| telegram_link_tokens, telegram_pending_links, telegram_outbox, telegram_flag_sessions, tournament_telegram_kit_content | Vinculacion y mensajeria Telegram | 20260822000000, 20260516120000, 20260602030000, 20260701120000, 20260517120000 |
| mobile_auth_codes | Codigo de 6 digitos del bot para la app nativa Android | 20260605120000 |
| closest_to_pin_entries, closest_to_pin_prizes | Mas cerca de la bandera + token de aceptacion del jugador | 20260805150000 … 20260805180000 |
| fb_venues, fb_categories, fb_menu_items, fb_orders, fb_order_items, fb_tables, fb_house_accounts, fb_user_venues, fb_venue_stock, fb_deposit_accounts, fb_business_profile, fb_favorite_actions | Restaurante y carritos bar | 20260605140000 y siguientes |
| caddies, caddie_assignments, caddie_favorites | Caddies | no (creada en Supabase); columnas telegram en 20260527160000 y 20260822000000 |
| tie_break_profiles, tie_break_steps, tournament_convocatoria, category_templates, category_template_items | Desempates, convocatoria y plantillas | tie_break/convocatoria si (20260519120000, 20260518120000); plantillas no |
| **Vistas** | | |
| handicap_committee_vote_summary | Agregado ANONIMO de votos por entry: n_votes, n_abstained, avg/min/max/median del ajuste | 20260525120000 (linea 101) |
| v_ghin_player_activity | Por ghin_number: rondas total / ano / 3 anos / 12 meses, primera y ultima ronda, diferencial promedio del ano | 20260812141303 |
| v_ghin_competition_summary | Rondas de competencia por socio (casa/fuera, campos distintos, dif promedio). Sin consumidor en el codigo | 20260812141303 |
| v_yardage_shots | Golpes de Yardas normalizados (shot_log_id, hole, stroke_no, club, actual_yards, metricas de swing) para /api/mobile/stats y suggest-club | no (creada en Supabase) |

## Reglas de negocio
1. Existen exactamente 15 codigos de rol validos: super_admin, club_admin, tournament_director, score_capture, entries_operator, caddie_manager, checkin, viewer, handicap_committee, marshal, flag_keeper, restaurante, mesero, cocinero, operador_carrito — `lib/auth/permissions.ts:1`, validados en `normalizeRole` `lib/auth/permissions.ts:309`.
2. Un `roles.code` desconocido se agrega al array tal cual (`lib/auth/getUserRoles.ts:34`), pero no otorga nada porque `canAccessModule` solo compara contra la matriz — `lib/auth/permissions.ts:399`.
3. El permiso es la pareja (rol, modulo) de `MODULE_ACCESS` — `lib/auth/permissions.ts:61`. La ruta se traduce a modulo en `getModuleFromPath` — `lib/auth/permissions.ts:333`. El sidebar usa el mismo modulo via `NAV_ITEM_MODULE` — `lib/auth/navModules.ts:7`.
4. Los roles se acumulan de las tres tablas con `is_active = true`; el alcance (club o torneo) NO se conserva en el array de codigos — `lib/auth/getUserRoles.ts:47`. Por eso el gate de modulo es global y el filtro por torneo se hace aparte con `requireTournamentAccess`.
5. Acceso a un torneo concreto: super_admin global pasa siempre; club_admin del `tournaments.club_id`; marshal con rol de ese club si la ruta admite marshal; si no, rol activo en `user_tournament_roles` de ese torneo — `lib/auth/requireTournamentAccess.ts:57`. Con `allowedRoles` vacio, CUALQUIER rol de torneo activo pasa — `lib/auth/requireTournamentAccess.ts:104`.
6. Scope de listados de torneos: super_admin global → todos; cualquier rol de club (no solo club_admin) → todos los torneos de ese club; roles de torneo → solo esos — `lib/auth/listAccessibleTournaments.ts:51`.
7. Usuario solo-comite = tiene `handicap_committee` y ningun otro codigo — `lib/auth/isCommitteeOnlyUser.ts:6`. El proxy lo encierra: cualquier ruta de backoffice que no sea `comite-handicap` lo redirige a `/comite-handicap` conservando `tournament_id` — `proxy.ts:82`.
8. Landing post-login por prioridad: admin (super/club/director) → /dashboard; restaurante o mesero → /fb-mesero; cocinero → /fb-cocina; operador_carrito → /captura/carrito; solo-comite → comite del torneo mas proximo por jugarse; marshal → /tee-sheet; resto → /dashboard — `app/login/actions.ts:128`.
9. Solo-comite que llega desde el poster publico aterriza en la votacion de ESE torneo solo si el comite esta abierto y el torneo aun no se juega — `app/login/actions.ts:163` + `lib/handicap-committee/committeeOnlyPublic.ts:14`.
10. Login por username: si el identificador no contiene "@" se resuelve `profiles.username` → email con service role (para saltar RLS) y se hace `signInWithPassword` con el email — `app/login/actions.ts:22` y `:58`. Username: unico case-insensitive (indice parcial en `20260603120000_profiles_username_login.sql:14`), sin "@", sin espacios, minimo 3 caracteres — `app/(backoffice)/users/actions.ts:18`.
11. Password minimo 6 caracteres en todos los caminos: alta/edicion de usuario `app/(backoffice)/users/actions.ts:382`, reset `app/login/reset-password/actions.ts:22`, bootstrap `app/setup-admin/actions.ts:32`.
12. Reset de password: `resetPasswordForEmail` con `redirectTo=/auth/callback?next=/auth/update-password` — `app/login/forgot-password/actions.ts:56`; el callback canjea el `code` por sesion — `app/auth/callback/route.ts:43`; `/auth/update-password` exige sesion viva del link — `app/auth/update-password/page.tsx:17`.
13. Quien puede asignar roles (edicion): super_admin todo. club_admin a nivel club: marshal, viewer, score_capture, caddie_manager, entries_operator, checkin, handicap_committee — `app/(backoffice)/users/actions.ts:266`. A nivel torneo el club_admin agrega tournament_director; el tournament_director puede asignar score_capture, entries_operator, checkin, viewer, handicap_committee, marshal — `app/(backoffice)/users/actions.ts:289`.
14. Nadie por debajo de super_admin puede modificar a un super_admin ni a otro club_admin, ni a otro tournament_director del mismo torneo — `app/(backoffice)/users/actions.ts:183`, `:200`, `:246`.
15. En el ALTA de usuario las listas son mas estrictas que en la edicion: club_admin solo puede crear con rol de club `marshal` — `app/(backoffice)/users/new/actions.ts:174` y `:182`. Si se crea desde un torneo sin elegir rol, se asigna `viewer` por defecto — `app/(backoffice)/users/new/actions.ts:302`.
16. `/setup-admin` requiere `BOOTSTRAP_ADMIN_SECRET` y aborta si ya existe una fila `user_profiles.role='admin'` — `app/setup-admin/actions.ts:20` y `:60`.
17. Patron RLS dominante: `ENABLE ROW LEVEL SECURITY` sin ninguna policy = tabla accesible solo por service_role. Aplica a mobile_auth_codes (`20260605120000:41`), telegram_link_tokens (`20260822000000:77`), fb_user_venues (`20260607260000:34`), private_hole_scores (`20260527230000:60`), handicap_committee_vote_sessions/snapshots (`20260526160000:43`), fb_orders y fb_order_items (`20260605140000:173`).
18. Segundo patron: SELECT abierto para tablero en vivo + escritura por service role. `closest_to_pin_entries` y `closest_to_pin_prizes` tienen SELECT `TO anon, authenticated USING (true)` — `20260805150000_closest_to_pin.sql:36`. `score_witnesses` y `card_signatures` tambien — `20260527230000:36`, `20260528010000:31`. `fb_tables` y `fb_house_accounts` con `USING (true)` sin clausula TO — `20260608100000:37` y `:61`.
19. Los votos del comite son anonimos por diseno: cada miembro SOLO lee sus propias filas de `handicap_committee_votes` (`20260525120000:220`); el admin del torneo NO puede leer la tabla, solo la vista agregada `handicap_committee_vote_summary` con GRANT a authenticated (`20260525120000:276`).
20. Insertar un voto exige tres cosas a la vez: `member_user_id = auth.uid()`, ser miembro del comite y que el comite este `status='open'` — `20260525120000:227`. Update y delete del voto propio tambien exigen comite abierto — `:243`, `:264`.
21. `fn_user_is_handicap_committee_member(user, torneo)` acepta el rol `handicap_committee` en los tres alcances (torneo, club del torneo, global), mas `tournament_director` de ese torneo, mas cualquiera que pase `fn_user_can_manage_tournament` — `20260525120000:165`.
22. `fn_user_can_manage_tournament` = super_admin global OR tournament_director de ese torneo OR club_admin del club del torneo — `20260525120000:134`. `fn_user_is_super_admin` mira solo `user_global_roles` con `is_active=true` — `20260525120000:122`.
23. `fn_user_can_read_ghin` autoriza lectura de datos GHIN a super_admin, club_admin, tournament_director, handicap_committee, entries_operator y (solo global) viewer — `20260812145036_ghin_tables_rls.sql:6`. Las tablas GHIN quedan con SELECT para authenticated y escritura exclusiva de service_role — `:83`.
24. `fn_user_can_view_player_files(user, player)` = super_admin OR handicap_committee global OR (handicap_committee | tournament_director) en algun torneo donde el jugador este inscrito OR (club_admin | handicap_committee) del club del jugador — `20260527030000_harden_fn_user_can_view_player_files.sql:5`. La policy del bucket privado `player-files` repite la misma condicion cruzando `storage.objects.name` con `player_files.file_path` — `20260527020000:145`.
25. Toda funcion SECURITY DEFINER lleva `SET search_path` fijo y `REVOKE EXECUTE ... FROM PUBLIC, anon` — `20260813001134_harden_committee_ghin_function_grants.sql:4`, `20260527030000:47`, `20260812145036:58`.
26. `fn_archive_and_reset_handicap_committee_votes(committee, actor, session, snapshots)` es la unica escritura del archivo de votos: solo `service_role` puede ejecutarla, verifica al actor con `fn_user_can_read_ghin` (porque con service role `auth.uid()` es null), obtiene `tournament_id` del comite e ignora el del payload, devuelve NULL si no hay votos, y archiva + borra los votos vivos en la misma transaccion — `20260813000615_harden_archive_committee_rpc.sql:22`, `:126`, `:136`.
27. Trigger `trg_renumber_tournament_entries_after_delete` (AFTER DELETE en `tournament_entries`) llama a `renumber_tournament_entry_player_numbers`, que primero desplaza todos los `player_number` sumando `max+1000` y luego renumera 1..N ordenando por numero previo — el desplazamiento existe para no violar el unique a mitad del UPDATE — `20260818174500:19`.
28. Trigger `trg_matchplay_pair_teams_autodeactivate` (BEFORE INSERT/UPDATE de player_a/player_b/is_active) pone `is_active=false` si falta el jugador A, o si falta B y `tournament_matchplay_rules.match_type` es 'pairs' (default cuando no hay fila) — `20260523150000:19`.
29. `fb_touch_updated_at()` es el trigger de `updated_at` de F&B (fb_venues, fb_menu_items y las tablas de cuentas de deposito) — `20260605140000:151`, `20260610130000`. Su equivalente del comite es `handicap_committee_touch_updated_at()` — `20260525120000:80`.
30. Caducidad de cada token sin sesion: `closest_to_pin_entries.accept_token` 48 h y 24 bytes hex (`lib/cercanos/acceptToken.ts:3`); `telegram_link_tokens` 14 dias, 16 bytes hex, one-time (`lib/telegram/linkToken.ts:4`); `mobile_auth_codes` 6 digitos y 10 minutos (`lib/telegram/ritmo/mobileCode.ts:15`, `:29`); `scorecard_signature_requests` 24 h por defecto y token de 64 hex (`lib/scorecards/create-signature-request.ts:39`).
31. Un token de vinculacion nuevo invalida los anteriores del mismo jugador/caddie (`consumed_at = now`) antes de insertar — `lib/telegram/linkToken.ts:60`. Al canjearlo se sobrescribe `telegram_user_id`/`telegram_chat_id`, se limpian `telegram_chat_invalid_*` y se borra la fila de `telegram_pending_links` — `lib/telegram/linkToken.ts:154`.
32. El `accept_token` de una distancia se conserva solo si la distancia no cambio y no expiro; si la distancia cambia se mina token nuevo y se borra la aceptacion y la firma del jugador — `app/(backoffice)/cercanos/actions.ts:174` y `:202`.
33. La Mini App de Telegram se autentica con `initData`: HMAC-SHA256 con clave derivada del bot token, comparacion en tiempo constante, y rechazo si `auth_date` tiene mas de 24 h — `lib/telegram/validateInitData.ts:31`, `:57`, `:62`. Luego `resolvePlayerId` mapea `telegram_user_id` → `players.id` — `lib/mobile/resolvePlayer.ts:16`.
34. `/mesa/[tableCode]` no tiene sesion: busca `fb_tables` por `code` con `is_active=true` usando service role, y el pedido cae con `requires_waiter_approval` — `app/mesa/[tableCode]/page.tsx:29`.
35. Scope F&B: super_admin, club_admin, tournament_director y `restaurante` ven todos los venues y cuentan como owner; mesero/cocinero/operador_carrito ven solo sus filas de `fb_user_venues`; sin filas no ven nada; `is_owner=true` en cualquier fila abre todo — `lib/fb/userScope.ts:26`, `:39`, `:55`.
36. Captura de campo bloqueada si la ronda es de un dia anterior a hoy en `America/Mexico_City` — `lib/captura/roundClosure.ts:14`, aplicada en `lib/captura/saveGroupHoleScore.ts:132`. Bloqueada tambien si `scorecards.locked_at` existe y el actor no es rol `admin` — `lib/captura/saveGroupHoleScore.ts:157`.
37. `CRON_SECRET` protege `/api/ritmo/check-reminders` aceptando `Authorization: Bearer <secret>` O `?secret=`; si la variable NO esta definida el endpoint queda abierto — `app/api/ritmo/check-reminders/route.ts:30`. Unico cron declarado, cada 5 min — `vercel.json`.
38. Otros secretos de endpoint: `TELEGRAM_WEBHOOK_SETUP_SECRET` para `GET /api/telegram/webhook?setup=1` (`app/api/telegram/webhook/route.ts:756`) y `STRIPE_WEBHOOK_SECRET` verificado con `constructEvent` (`app/api/stripe/webhook/route.ts:36`).
39. Torneo privado: `tournaments.is_private=true` lo saca de la home publica; `kind` es 'competition' | 'daily_round' | 'practice' con CHECK NOT VALID — `20260608300000_tournaments_private_kind.sql:21`. La home filtra `is_private=false` y reintenta sin el filtro si la columna no existe — `app/page.tsx:190`.
40. Solo los miembros con `handicap_committee_member_presence.is_present=true` pueden votar, y esa regla se valida en las server actions, NO en RLS — `20260525120000:278`. La presencia la escribe quien pasa `fn_user_can_manage_tournament` — `:309`.
41. Realtime esta habilitado para exactamente 5 tablas: `hole_scores` (`20260527180000`) y `matchplay_pair_teams`, `matchplay_matches`, `matchplay_brackets`, `matchplay_hole_results` (`20260522160000`, `20260524120000`). Cualquier otra pantalla "en vivo" es polling.
42. Buckets de Storage: `player-files` privado con policy espejo de `fn_user_can_view_player_files` (`20260527020000:43`, `:145`); `fb-menu-photos` publico de lectura y escritura solo service_role (`20260605260000:12`); `tournament-posters` se usa desde el codigo (`app/(backoffice)/tournaments/actions.ts:111`) pero no se crea en ninguna migracion.
43. Variables de entorno que gobiernan seguridad (nombres, nunca valores): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOTSTRAP_ADMIN_SECRET`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SETUP_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` (base de los links con token, con fallback a `VERCEL_URL` y a www.listgolf.club — `lib/cercanos/acceptToken.ts:19`), `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `TELEGRAM_COMMITTEE_CHAT_ID`, `FB_STAFF_TELEGRAM_CHAT_ID`, `CALIBRATION_TELEGRAM_IDS`.

## Flujos
### 1. Request al backoffice
1. `proxy.ts:18` calcula modulo (`getModuleFromPath`) y si la ruta exige sesion (`isBackofficePath`). Si no es ninguno de los dos, ni siquiera crea cliente Supabase.
2. Si falta env de Supabase → redirect a `/login?next=...` (`proxy.ts:30`).
3. `supabase.auth.getUser()`; sin usuario → `/login?next=...` (`proxy.ts:66`).
4. `getUserRoles` (3 queries) y `isCommitteeOnlyUser`; solo-comite fuera de su modulo → `/comite-handicap` (`proxy.ts:82`).
5. `canAccessModule` falla → `/comite-handicap`, `/tournaments` o `/login` segun lo que el usuario alcance (`proxy.ts:90`).
6. `app/(backoffice)/layout.tsx:41` repite sesion y `canAccessAnyBackofficeModule`, y publica los roles al cliente via `BackofficeRolesProvider`.
7. La pagina o server action llama `requireTournamentAccess` / `checkTournamentAccess` con su lista de roles (p. ej. `SCORE_CAPTURE_TOURNAMENT_ROLES` en `lib/auth/scoreCaptureAccess.ts:4`).
8. Si la lectura la bloquearia RLS, se usa `createScoreEntryDataClient`, que valida acceso PRIMERO y despues devuelve cliente admin — `lib/auth/scoreEntryDataClient.ts:15`.

### 2. Login
1. `app/login/LoginForm.tsx` → `loginAction` con `email` (email o username) y `next`.
2. Sin "@" → `resolveEmailFromUsername` con service role sobre `profiles.username` (`app/login/actions.ts:22`).
3. `signInWithPassword` escribe las cookies de sesion (`app/login/actions.ts:100`).
4. `resolveLandingForUser` busca el `profiles.id` por email, carga roles con el cliente admin y decide destino (`app/login/actions.ts:128`).
5. Salir: `POST` o `GET` a `/auth/signout` → `signOut()` + redirect 303 a `/login` (`app/auth/signout/route.ts:35`, `:42`).

### 3. Acceso sin sesion por token
1. Backoffice mina el token: `mintPlayerAcceptToken` (cercanos), `createTelegramLinkToken` (Telegram), `createSignatureRequest` (firma remota), o el bot genera el codigo (`buildMobileCodeReply`).
2. El token viaja al jugador/caddie por QR, Telegram o link.
3. La pagina publica lo resuelve con service role: `app/aceptar-cerca/[token]/page.tsx:27` → `lib/cercanos/loadPlayerAccept.ts:30` (rechaza tokens de menos de 16 caracteres); `app/sign/scorecard/[token]/page.tsx:45` → `lib/scorecards/get-signature-request-by-token.ts:16` (exige `status='pending'` y no expirado).
4. La accion valida caducidad y estado y escribe una sola fila filtrando por el token: `app/aceptar-cerca/[token]/actions.ts:62` usa `.eq("accept_token", token).is("player_accepted_at", null)`.
5. Firma consumida → `markSignatureRequestUsed` pone `status='used'` (`lib/scorecards/mark-signature-request-used.ts:29`); codigo movil consumido → `consumed_at` (`app/api/mobile/auth/redeem/route.ts:77`).

## Invariantes y trampas
- **El esquema nucleo no esta versionado.** `tournaments`, `tournament_entries`, `rounds`, `pairing_groups`, `pairing_group_members`, `players`, `categories`, `clubs`, `courses`, `course_holes`, `tournament_holes`, `tee_sets`, `tee_set_catalog`, `tournament_tee_sets`, `category_templates`, `category_template_items`, `category_competition_rules`, `category_prize_rules`, `round_advancement_rules`, `hole_scores`, `round_scores`, `scorecards`, `scorecard_signatures`, `scorecard_signature_requests`, `scorecard_audit_log`, `caddies`, `caddie_assignments`, `caddie_favorites`, `ritmo_positions`, `matchplay_sessions`, `matchplay_ryder_cups`, `matchplay_ryder_scoreboard`, `yardage_excluded_shots`, `yardage_excluded_holes`, `roles`, `user_global_roles`, `user_club_roles`, `user_tournament_roles`, `profiles`, `user_profiles` y la vista `v_yardage_shots` NO aparecen en `supabase/migrations/`. Solo columnas nuevas se agregaron por migracion. Nunca supongas la forma de esas tablas: consultala en Supabase.
- **RLS de las tablas de roles: desconocida.** ATENCION SIN VERIFICAR: `user_global_roles`, `user_club_roles`, `user_tournament_roles` y `profiles` no tienen policies en el repo, pero `getUserRoles` las lee con el cliente anon+sesion y funciona, asi que en produccion deben permitir al menos leer las filas propias. Si cambias esas policies rompes el login de todos.
- `checkTournamentAccess` NO filtra `is_active` al leer `user_club_roles` — `lib/auth/requireTournamentAccess.ts:71`. Desactivar un rol de club no quita el acceso al torneo por esta via (si lo quita en `getUserRoles` y en el scope de listados). Es inconsistencia real, no la "arregles" sin revisar quien pierde acceso.
- Un rol de torneo da el modulo en TODO el backoffice (regla 4). El gate por torneo es responsabilidad de cada pagina; si agregas una pantalla nueva y olvidas `requireTournamentAccess`, un score_capture de un torneo entra a los datos de otro.
- `MODULE_ACCESS`, `BACKOFFICE_PATH_PREFIXES` y `getModuleFromPath` son tres listas independientes. Ruta nueva sin prefijo → sin sesion exigida. Con prefijo pero sin mapeo a modulo → pide sesion y deja pasar a cualquier rol (`proxy.ts:75`). Hay que tocar las tres.
- `/torneos/[id]` salta el filtro `is_public`/`is_private` de dos maneras: cualquier usuario logueado, y cualquier visitante que agregue `?return_captura=1` (usa cliente admin) — `app/torneos/[id]/page.tsx:206`. Viene del commit d4eb899 para el torneo de prueba del Calcuta.
- `POST /api/telegram/webhook` no valida el header secreto de Telegram (`app/api/telegram/webhook/route.ts:155`): cualquiera puede simular un update del bot. El `TELEGRAM_WEBHOOK_SETUP_SECRET` solo protege el GET de setup.
- `/api/upload` y `/api/upload-players` hacen `upsert` en `players` con service role y sin ninguna autenticacion — `app/api/upload/route.ts:11`, `app/api/upload-players/route.ts:33`.
- Alrededor de 50 rutas de `app/api/**` (todo `captura/*`, `marshal/*`, `matchplay/*`, `mesa/order`, `fb-admin/orders`, `captura/sign`) no verifican sesion ni token: su unica defensa son las validaciones de dominio (grupo existe, jugador pertenece al grupo, ronda no cerrada, tarjeta no firmada). Si quitas una de esas guardas, abres escritura anonima.
- `closest_to_pin_entries` es legible por `anon` completa, incluyendo `accept_token`, `signature_payload` y `player_signature_payload` — `20260805150000:36`. Quien tenga la anon key puede listar tokens y aceptar distancias en nombre de jugadores.
- `fb_house_accounts` (nombre, email, telefono, `member_no`, limite de credito de socios) es legible por `anon` — `20260608100000:61`.
- `/api/mobile/auth/redeem` acepta codigos de 4 a 8 digitos sin rate limit — `app/api/mobile/auth/redeem/route.ts:39` — aunque el bot solo emite de 6 (`lib/telegram/ritmo/mobileCode.ts:29`).
- El comite espera 10 miembros para el CCQ (`20260813023432`), pero `expected_members` no entra en ninguna formula, solo en el quorum informativo.
- Si borras un voto de comite fuera del RPC pierdes el archivo: el RPC es lo unico que escribe `handicap_committee_vote_sessions` + `_snapshots` y borra los votos en una sola transaccion (regla 26).
- El orden importa en `createScoreEntryDataClient`: validar acceso ANTES de devolver el cliente admin. Invertirlo entrega service role a cualquiera.
- `createAdminClient` en `utils/supabase/server.ts:38` no valida env y no fija `persistSession:false`; la version buena es `utils/supabase/admin.ts:3`. Usa siempre la de `admin.ts`.

## Deuda y preguntas abiertas
- `lib/auth/getUserTournamentRole.ts` esta vacio (0 bytes) y no lo importa nadie.
- Codigo muerto: `app/(backoffice)/rounds/page.backup.tsx` y `app/torneos/[id]/page.backup.tsx`.
- `user_profiles` es legado: solo `/setup-admin` la usa, con `role='admin'`, que el sistema de permisos ignora. Un admin creado por ahi no obtiene ningun rol real (ni fila en `profiles`), asi que `canAccessAnyBackofficeModule` lo manda a `/login`. `/setup-admin` esta efectivamente roto para arrancar de cero.
- Los roles `mesero`, `cocinero` y `operador_carrito` NO se insertan en ninguna migracion: existen solo en la tabla `roles` de produccion. Un entorno nuevo se levanta sin ellos y el F&B queda sin staff asignable.
- `app/(backoffice)/users/actions.ts` y `app/(backoffice)/users/new/actions.ts` duplican `getCurrentAccessContext`, `ensureUsersManageAccess`, `getRoleById` y `normalizeUsername`, con listas de roles asignables DISTINTAS entre alta y edicion. Es la fuente mas probable de bugs de permisos.
- La migracion `20260813012350_ccq_committee_club_scope.sql` trae UUIDs de usuarios y correos de miembros reales del comite en texto plano dentro del repo.
- Vista `v_ghin_competition_summary`: creada y con GRANT, sin ningun consumidor en el codigo.
- `handicap_committee_vote_summary` no lleva `security_invoker`, a diferencia de las vistas GHIN (`20260812145036:96`). ATENCION SIN VERIFICAR: si la vista corre como su owner, el GRANT a `authenticated` podria exponer agregados de torneos ajenos.
- ATENCION SIN VERIFICAR: `profiles` parece no tener trigger `on auth.users insert` — las altas hacen `upsert` manual (`app/(backoffice)/users/new/actions.ts:345`). Un usuario creado directo en el dashboard de Supabase Auth queda sin `profiles` y sin poder entrar por username.
- ATENCION SIN VERIFICAR: `players.email_norm` / `phone_norm` se llenan por trigger segun el comentario de `app/api/upload-players/route.ts:42`, pero ese trigger no esta en migraciones.
- Las migraciones solo cubren mayo-agosto 2026 (101 archivos, del `20260514000000` al `20260822000000`).

## Relacionado
[[arquitectura]] · [[torneos-setup]] · [[captura-scores]] · [[handicap-whs]] · [[telegram]] · [[fb-restaurante]] · [[distancias-gps]] · [[ritmo-juego]] · [[mobile-watch]] · [[resultados-cortes-premios]]

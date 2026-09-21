---
titulo: "Torneos: configuracion, categorias, campos e inscripciones"
modulo: torneos-setup
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Torneos: configuracion, categorias, campos e inscripciones

## Que resuelve
Todo lo que el comite hace antes del primer tee time: dar de alta el torneo (Anual stroke play, Calcuta match play mixto o Ryder), definir categorias por sexo/handicap/edad, elegir de que salida (tee) juega cada categoria, cargar la tarjeta del campo (par y handicap de hoyo), inscribir jugadores con su handicap de torneo, asignarles numero de jugador y caddie, y cerrar inscripciones.
La convocatoria oficial es la fuente de verdad: se captura o importa, se cierra y se "aplica" para generar categorias, reglas de competencia, cortes y premios.
Nada de salidas, captura de scores ni resultados vive aqui: este modulo termina cuando `registration_status = 'closed'`.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| app/(backoffice)/entries/actions.ts | Todas las mutaciones de inscritos: alta, bulk, baja, DQ, HI, categoria, cerrar/reabrir | 2355 |
| app/(backoffice)/entries/page.tsx | Pantalla de inscritos (4 tabs) y calculo de HI/CH/PH/80% por inscrito | 1379 |
| app/(backoffice)/entries/EntriesListPanel.tsx | Tabla de inscritos, edicion inline de HI/categoria/salida, botones caddie | 1328 |
| app/(backoffice)/tournaments/actions.ts | Crear/editar/borrar torneo, poster, publicar, archivar | 719 |
| app/(backoffice)/tournaments/page.tsx | Listado de torneos con semaforo de configuracion | 1300 |
| app/(backoffice)/tournaments/setup/page.tsx | Asistente de configuracion (campo, categorias, rondas, liga) | 1287 |
| app/(backoffice)/tournaments/setup/actions.ts | applyCourse / applyCategoryTemplate / initializeTournament | 336 |
| lib/tournaments/cloneTournamentRules.ts | Deep-clone de reglas de un torneo plantilla al nuevo | 538 |
| lib/tournaments/templatePresets.ts | Resolucion de plantillas anual / calcuta_mixto / ryder | 208 |
| app/(backoffice)/categories/actions.ts | CRUD de categorias, snapshot, plantillas de categorias | 738 |
| lib/tee-assignment.ts | Motor de asignacion de salida por reglas de categoria | 156 |
| lib/handicap/resolveTournamentEntryHandicap.ts | Resuelve salida efectiva + CH/PH WHS del inscrito | 510 |
| lib/handicap/loadTournamentHandicapContext.ts | Carga tee_sets, reglas, course_tee_sets y % de allowance | 183 |
| lib/tournament/entryDisplayOrder.ts | Orden canonico de inscritos y renumeracion de player_number | 235 |
| app/(backoffice)/category-tee-rules/actions.ts | Snapshot de reglas categoria -> salida | 170 |
| app/(backoffice)/competition-rules/actions.ts | Snapshot de reglas de competencia (% handicap, premios) | 218 |
| app/(backoffice)/convocatoria/actions.ts | Workflow editing/closed/applied + importar docx/pdf/xlsx | 343 |
| lib/convocatoria/applyDraft.ts | Aplica el borrador: categorias, reglas, cortes, premios, rondas | 229 |
| app/(backoffice)/convocatoria/MatchPlayConvocatoriaEditor.tsx | Editor de convocatoria para match play / calcuta | 1902 |
| app/(backoffice)/players/NewPlayerForm.tsx | Alta y edicion de jugador con deteccion de duplicados | 1645 |
| app/(backoffice)/players/actions.ts | savePlayerAction / deletePlayerAction y propagacion de HI | 394 |
| app/(backoffice)/courses/actions.ts | Campos, tarjeta base y salidas del campo con rating/slope WHS | 403 |
| app/(backoffice)/tee-sets/actions.ts | Catalogo global de salidas + seleccion por torneo | 179 |
| lib/caddies/assignCaddieToEntry.ts | Asignacion de caddie con conflictos y propagacion por ronda | 252 |
| app/(backoffice)/clubs/actions.ts | Clubes, siglas, logo, merge de duplicados | 713 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| tournaments | Torneo. status, registration_status, settings jsonb, is_public/is_archived/is_private/kind, poster_path | no (creada en Supabase); columnas en 20260514000000, 20260517130000, 20260523120000, 20260608300000 |
| tournament_entries | Inscripcion: handicap_index del torneo, category_id, status, player_number, tee_set_id_override, flags de comite | no (creada en Supabase); columnas en 20260529220000, 20260527020000, 20260818174500 |
| categories | Categorias del torneo (codigo, sexo, rango HI, min_age, max_players, % override) | no (creada en Supabase); FK en 20260523130000 |
| category_templates | Plantillas reutilizables de categorias | no (creada en Supabase) |
| category_template_items | Renglones de cada plantilla de categorias | no (creada en Supabase) |
| category_tee_rules | Regla categoria -> salida por sexo/edad/rango HI y priority | no (creada en Supabase); fix CCQ en 20260525040000 |
| category_competition_rules | Modalidad, base de leaderboard/premios, % handicap por categoria | no (creada en Supabase) |
| category_prize_rules | Premios por categoria y posicion | no (creada en Supabase) |
| courses | Campo de golf, ligado a club | no (creada en Supabase) |
| course_holes | Tarjeta base del campo: par, handicap de hoyo, pace_minutes | no (creada en Supabase); columnas GPS en 20260611120000, 20260614120000 |
| course_tee_sets | Salidas del campo con rating/slope/par/yardaje por sexo (datos WHS) | columnas en 20260525210000 y seed en 20260527140000 |
| tee_set_catalog | Catalogo global de salidas (code, name, color) | no (creada en Supabase) |
| tournament_tee_sets | Salidas del catalogo seleccionadas para un torneo | no (creada en Supabase) |
| tee_sets | Salidas por torneo; a esto apuntan category_tee_rules y tee_set_id_override | no (creada en Supabase) |
| tournament_holes | Tarjeta que usa el torneo (copia de course_holes) | no (creada en Supabase) |
| clubs | Clubes: nombre normalizado, siglas, logo_url, primary_color | no (creada en Supabase) |
| players | Persona: HI, handicap_torneo, GHIN, action_number, tallas, telegram, is_resident/address | no (creada en Supabase); columnas en 20260609100000, 20260610140000 |
| player_files | Reportes GHIN y capturas por jugador (bucket privado player-files) | 20260527020000_player_files_and_committee_flag.sql |
| caddies | Catalogo de caddies (nivel, telefonos, telegram) | no (creada en Supabase); telegram en 20260527160000 |
| caddie_assignments | Caddie <-> inscrito, por ronda o a nivel torneo | no (creada en Supabase) |
| caddie_favorites | Jugadores favoritos de un caddie | no (creada en Supabase) |
| tournament_convocatoria | Documento fuente + draft_json + status editing/closed/applied | 20260518120000 y 20260518130000 |
| round_advancement_rules | Reglas de corte generadas por la convocatoria | no (creada en Supabase) |
| user_tournament_roles | Staff asignado a un torneo (rol por torneo) | no (creada en Supabase) |

## Reglas de negocio
1. Nombre de torneo unico por club, comparando `ilike` e ignorando archivados; el mensaje sugiere archivar el existente — app/(backoffice)/tournaments/actions.ts:288.
2. El campo elegido debe pertenecer al club elegido, y el club debe estar `is_active = true` — tournaments/actions.ts:270 y :412.
3. `status` es texto libre en BD; la UI solo ofrece `draft | active | closed`, default `draft` — tournaments/new/page.tsx:533, tournaments/actions.ts:191.
4. Al crear cualquier torneo el flujo redirige a `/convocatoria?tournament_id=...`, no al setup — tournaments/actions.ts:346.
5. Poster: bucket `tournament-posters`, ruta `tournaments/{id}/poster.{ext}` con upsert; si cambia la extension borra el anterior — tournaments/actions.ts:79. Desde el listado solo jpg/png/webp y max 8 MB — :527.
6. `togglePublic` sobre un torneo archivado siempre deja `is_public = false`; archivar fuerza `is_public = false` — tournaments/actions.ts:665 y :702.
7. Borrar torneo se bloquea si tiene 1 o mas inscritos; si procede borra tambien el poster del storage — tournaments/actions.ts:598.
8. `kind` admite `competition | daily_round | practice`; las rondas del dia se excluyen del listado de torneos y del clonado — migracion 20260608300000, tournaments/page.tsx:646.
9. `registration_status = 'closed'` bloquea TODA mutacion de inscritos con redirect y mensaje — entries/actions.ts:172. Inversamente, salidas/captura/avance de ronda exigen inscripciones cerradas — lib/tournaments/registrationGate.ts:31.
10. Plantillas: 3 roles operativos (`anual`, `calcuta_mixto`, `ryder`) mas `blank` y `other` — lib/tournaments/templatePresets.ts:14.
11. Fuente de plantilla: env `TOURNAMENT_TEMPLATE_ANUAL_ID` / `_CALCUTA_ID` / `_RYDER_ID` si ese torneo sigue vivo, si no el que tenga `settings.template_role`, si no el mas reciente clasificado por formato/nombre; se excluyen archivados, `daily_round` y `practice` — templatePresets.ts:121.
12. Clasificacion de un torneo: `settings.template_role` > `matchplay_variant = ryder` > `format_type = matchplay` (calcuta_mixto) > `stroke|stableford` (anual, o pista por nombre) — templatePresets.ts:90.
13. Defaults por rol: ryder = matchplay/ryder, 3 rondas, gross, pairs; calcuta_mixto = matchplay, 4 rondas, pairs, bracket 16; anual = stroke, 3 rondas; blank = stroke, 1 ronda — templatePresets.ts:163.
14. `cloneTournamentRules` copia settings, categorias, convocatoria (siempre en estado `editing`), tournament_holes, tournament_tee_sets, category_tee_rules, category_competition_rules, category_prize_rules, tie_break_profiles + steps, round_advancement_rules y matchplay_rules. NO copia inscritos, rondas, pairing groups ni `tee_sets` — cloneTournamentRules.ts:367.
15. En el clonado, `round_advancement_rules.tie_break_profile_id` se anula a proposito porque los perfiles se recrean con ids nuevos — cloneTournamentRules.ts:504.
16. Un fallo parcial del clonado no aborta la creacion del torneo: se acumula en `messages` — cloneTournamentRules.ts:22.
17. Categoria: `handicap_min/max` validados a -10..54 con min <= max; `min_age` 0..120; `max_age` siempre se guarda `null` — categories/actions.ts:65, :105, :210.
18. `category_group` admite `main | senior | ladies | super_senior | mixed` — categories/actions.ts:42.
19. `sort_order` de categorias se recompacta 1..N ordenando por (sort_order, handicap_min, code) tras cada alta/baja — categories/actions.ts:125.
20. Auto-categorizacion: candidatos = categorias con `gender == jugador` o `gender = 'X'` y HI dentro de [handicap_min, handicap_max]; se prefieren las de genero exacto y entre esas la de `handicap_min` menor — entries/actions.ts:65.
21. En match play por parejas, si hay una sola categoria para el sexo del jugador se asigna aunque su HI individual no entre: el rango de la categoria aplica a la suma de HI del equipo — entries/actions.ts:249.
22. `max_players` cuenta inscritos con status distinto de `dq` y `withdrawn`; al pasarse lanza `CAPACITY_FULL|...` que la UI muestra como error, no como excepcion — entries/actions.ts:281 y :331.
23. Si el torneo tiene categorias con `min_age`, el alta individual obliga a elegir categoria manualmente. Edad = anio actual menos `birth_year` — entries/SinglePlayerEntryPanel.tsx:96.
24. Borrar categoria desliga primero inscripciones y rondas (`category_id = null`); las FK son `ON DELETE SET NULL` — categories/actions.ts:468, migracion 20260523130000.
25. En `saveCategoriesSnapshot`, si queda una sola categoria activa se reasignan a ella las inscripciones y rondas sin categoria — categories/actions.ts:440.
26. Aplicar una plantilla de categorias BORRA todas las categorias del torneo y las reinserta — categories/actions.ts:505 y tournaments/setup/actions.ts:67.
27. Guardar categorias como plantilla nueva rechaza nombre duplicado activo (`ilike`); en modo actualizar reemplaza todos los items — categories/actions.ts:636.
28. Borrar plantilla de categorias solo la desactiva (`is_active = false`) — categories/actions.ts:695.
29. Reglas de competencia: se exige una fila ACTIVA por cada categoria del torneo o el guardado falla listando las que faltan — competition-rules/actions.ts:190.
30. `handicap_percentage` valido 0..150; `stableford` fuerza leaderboard y premios a stableford, gross_prize_places = 0 y net = null — competition-rules/actions.ts:105 y :120.
31. Reglas de salida: se evaluan por `priority` ascendente dentro de la categoria y gana la primera que cumple. `priority` se reescribe como el indice de fila al guardar — lib/tee-assignment.ts:111, category-tee-rules/actions.ts:82.
32. Si una regla exige edad y el jugador no tiene `birth_year`, la regla NO aplica. Antes si aplicaba y metia jugadores sin fecha en salidas de seniors — lib/tee-assignment.ts:44.
33. Fallback "extrapolated": si ningun rango de HI aplica, se toma la regla del mismo sexo/edad cuyo rango este mas cerca del HI (empate por `priority` menor) — lib/tee-assignment.ts:121. En ese caso el HI se capa al `handicap_max`/`handicap_min` de la regla para calcular CH/PH — resolveTournamentEntryHandicap.ts:318.
34. `tournament_entries.tee_set_id_override` manda sobre `category_tee_rules` — resolveTournamentEntryHandicap.ts:243. Cambiarlo recalcula handicaps de ese inscrito — entries/actions.ts:2340.
35. Reglas CCQ Match Play Mixto 2026 segun convocatoria: Doradas solo caballeros mayores de 65; Blancas damas HI <= 5.9; Rojas damas HI >= 6.0; Azules caballeros HI <= 6.4; Blancas caballeros 6.5 a 25.6 — migracion 20260525040000.
36. Los `tee_sets` del torneo se enlazan a `course_tee_sets` (rating/slope) por code con alias (AZUL/BLU, BLANC/WHT, DORAD/GLD, NEGRA/BLK), luego por nombre normalizado sin acentos ni parentesis, luego por color — resolveTournamentEntryHandicap.ts:87 y :109.
37. `course_tee_sets` guarda rating y slope separados para caballeros y damas: en CCQ las Blancas son M 70.7/127 y F 77.2/152 — migracion 20260525210000.
38. La columna "80%" de inscritos usa allowance fijo de 80%, no el `handicap_percentage` de la regla de competencia — resolveTournamentEntryHandicap.ts:398 y :424.
39. Tarjeta del campo: par 3..6, handicap de hoyo 1..18, `pace_minutes` 1..60, upsert por (course_id, hole_number) — course-holes/actions.ts:21 y :75.
40. `tournament_holes` es la tarjeta que consume el torneo; aplicar campo la borra y la vuelve a copiar de `course_holes` — tournaments/setup/actions.ts:118. El seed default usa `CCQ_COURSE_PARS` con stroke index igual al numero de hoyo — course-holes/actions.ts:43.
41. `initializeTournament` exige campo con tarjeta base, borra `tournament_holes` y TODAS las `rounds` del torneo, y crea N rondas en dias consecutivos desde `start_date` (o hoy) — tournaments/setup/actions.ts:206.
42. Salidas: `tee_set_catalog` es global, `tournament_tee_sets` es la seleccion por torneo con `sort_order` recompactado 1..N; los codes no se pueden repetir — tee-sets/actions.ts:55 y :85.
43. Clubes: el nombre "Club Campestre de Queretaro" esta reservado a CCQ con sigla CCQ, y cualquier variante incompleta tipo "club campestre de quer..." se rechaza — lib/clubs/clubIdentity.ts:50.
44. Siglas de club: 3 caracteres, con tabla de overrides por nombre completo (CCQ, BRC, BRE, CCL...) — clubs/actions.ts:56 y :68.
45. Merge de clubes duplicados: mueve `courses` y `players` al club destino, desactiva el origen y activa el destino — clubs/actions.ts:642.
46. `/api/club-logo?club_id=` devuelve `logo_url`, si no `generated_logo_url`, si no un SVG con las siglas y color derivado del hash; reescribe enlaces de Dropbox a `dl.dropboxusercontent.com` — app/api/club-logo/route.ts:67 y :130.
47. Jugador: obligatorios nombre, apellido y sexo — players/actions.ts:100. HI valido -10..54, `birth_year` 1900..2100 — NewPlayerForm.tsx:759.
48. Al guardar desde el alta, `handicap_torneo` se fuerza igual al HI; CH y PH son informativos y se calculan por WHS en cada torneo — NewPlayerForm.tsx:736.
49. Duplicados de jugador se avisan (no se bloquean en BD) por `whatsapp_phone_e164`, `email` y `ghin_number` — NewPlayerForm.tsx:768.
50. Cambiar el HI del jugador propaga el nuevo valor a todas sus inscripciones no canceladas SIN `playing_handicap_override` y recalcula CH/PH — players/actions.ts:158.
51. Borrar jugador: solo super_admin, club_admin o tournament_director, y se bloquea si tiene cualquier inscripcion en cualquier torneo — players/actions.ts:337.
52. HI de la inscripcion al inscribir = handicap capturado en el formulario, si no `players.handicap_torneo`, si no `players.handicap_index`; sin ninguno falla — entries/actions.ts:483.
53. Estados de inscripcion: `confirmed` al alta, `withdrawn` en baja, `dq`. Un DQ escribe `gross_score = 400` en `round_scores` — entries/actions.ts:1181 y :1193.
54. Borrar inscrito: si ya tiene `hole_scores` NO se borra, se convierte en `dq` con gross 400; si solo hay tarjetas vacias se borran y luego se borra la inscripcion — entries/actions.ts:1049.
55. `player_number` 1..N se recalcula por HI ascendente manteniendo juntas las parejas J1/J2, con los bloques de pareja ordenados por suma de HI; bajas y cancelados quedan sin numero — lib/tournament/entryDisplayOrder.ts:81 y :161.
56. La renumeracion se dispara como efecto secundario al cargar `/entries` y `/comite-handicap`, y al editar HI de la inscripcion — entries/page.tsx:721, entries/actions.ts:1290 y :1400.
57. Al BORRAR una inscripcion, un trigger de BD recompacta 1..N; primero desplaza todos los numeros +max+1000 para no chocar con el indice unico, luego reasigna por `row_number()` ordenado por player_number — migracion 20260818174500.
58. `updateEntryHandicap` re-categoriza al jugador; `updateEntryHandicapIndexInline` NO re-categoriza a proposito, para no chocar con limites de capacidad en un cambio rapido — entries/actions.ts:1249 y :1299.
59. Editar HI inline tambien escribe `players.handicap_index` y `handicap_torneo` para que el modal de Editar jugador no revierta el HI del torneo al guardar — entries/actions.ts:1384.
60. Emparejar al inscribir (match play parejas): crea la inscripcion de la pareja si no existe, fuerza la misma categoria en ambos, capa los HI al rango de la categoria e inserta en `matchplay_pair_teams`; falla si alguno ya esta en otro equipo — entries/actions.ts:612.
61. Al cerrar inscripciones se recalcula `bracket_main_pairs` y `bracket_round_count` desde el numero real de parejas o jugadores activos, con tope 64 — lib/matchplay/syncFieldBracketSize.ts:22 y :70.
62. Convocatoria: `editing -> closed -> applied`. Solo se edita en `editing`, solo se aplica desde `closed`, y `applied` es terminal (no se puede reabrir) — convocatoria/actions.ts:153, :196, :275.
63. Aplicar convocatoria falla si el torneo ya tiene inscripciones — lib/convocatoria/applyDraft.ts:17.
64. Aplicar convocatoria borra y recrea `categories`, `category_competition_rules`, `round_advancement_rules` y `category_prize_rules`; crea rondas (una por ronda x categoria) SOLO si el torneo no tiene ninguna — applyDraft.ts:29, :68, :100.
65. La importacion acepta .docx, .pdf y .xlsx, y elige parser normal o de match play segun el formato del torneo — convocatoria/actions.ts:224 y :262.
66. Caddie: no puede estar asignado a dos inscritos en la misma ronda; sin ronda el conflicto se evalua a nivel torneo — lib/caddies/assignCaddieToEntry.ts:31.
67. Asignar caddie en una ronda lo propaga a las demas rondas elegibles (misma categoria, o rondas sin categoria) saltando conflictos; el fallo de propagacion solo hace warn — assignCaddieToEntry.ts:80 y :170.
68. Alta de caddie: bloquea duplicado por `whatsapp_phone_e164` y por (nombre + apellido + telefono); los telefonos MX se normalizan a E.164 (+52 + 10 digitos) — caddies/new/actions.ts:100 y :18.
69. Staff por torneo en `user_tournament_roles` con upsert por (user_id, tournament_id, role_id); solo super_admin, club_admin o tournament_director pueden asignarlo — tournaments/staff/actions.ts:13 y :29.
70. Carga masiva CSV: encabezados en mayusculas `JUGADOR`, `HANDICAP INDICE`, `CORREO ELECTRONICO`, `TELEFONO`, `CLUB`, `HANDICAP TORNEO`; el nombre se parte en primera palabra = first_name y el resto = last_name; upsert por `email_norm` y, sin email, por `phone_norm` — app/upload-players/page.tsx:26 y app/api/upload-players/route.ts:44.

## Flujos
### A. Crear torneo desde plantilla
1. `/tournaments/new` — se eligen club, campo, formato y plantilla (`template_role`) o torneo fuente (`copy_from_tournament_id`).
2. `tournaments/actions.ts:184` valida duplicado de nombre, club activo y pertenencia del campo; arma `settings` con `defaultSettingsForTemplateRole` (:224).
3. Inserta en `tournaments`, sube poster si viene, y llama `cloneTournamentRules` si hay torneo fuente (:335).
4. Redirige a `/convocatoria?tournament_id=...` (:346).
5. En `/convocatoria` se edita o importa el borrador, se cierra (`closeConvocatoria`) y se aplica (`applyConvocatoriaToTournament` -> `lib/convocatoria/applyDraft.ts`), lo que genera categorias, reglas de competencia, cortes, premios y rondas.
6. En `/tournaments/setup` se aplica campo (`applyCourseToTournament`, copia `course_holes` a `tournament_holes`) y, si hace falta, `initializeTournament` para regenerar rondas.
7. En `/tee-sets` se selecciona el juego de salidas y en `/category-tee-rules` se define que categoria juega desde cual, con `priority`, sexo, edad y rango de HI.
8. En `/tournaments/staff` se asignan roles del comite.

### B. Inscribir jugadores y numerarlos
1. `/entries?tab=manual` — `SinglePlayerEntryPanel` busca jugador (tokens sin acentos, `lib/players/playerNameSearch.ts`) y opcionalmente su pareja.
2. `addEntry` (entries/actions.ts:458) verifica rol, que inscripciones esten abiertas, resuelve HI, elige categoria (`pickCategoryForEnroll`) y valida `max_players`.
3. Inserta en `tournament_entries` con `status = 'confirmed'` y los flags de comite; si hay pareja, `pairWithPartnerOnEnroll` crea el equipo.
4. Al renderizar `/entries`, `syncTournamentCommitteeRoster` (page.tsx:721) alinea los flags del comite y llama `syncEntryDisplayPlayerNumbers`, que asigna `player_number` 1..N por HI.
5. `/entries` calcula por inscrito la salida efectiva, CH, PH y la columna 80% con `loadTournamentHandicapContext` + `resolveTournamentEntryHandicap`.
6. Bulk: `PlayersBulkSelector` + `addSelectedEntries` (:880) inserta en lotes de 100 saltando los ya inscritos; `enrollAllPlayersToTournament` (:1561) inscribe a todo el padron.
7. `closeTournamentRegistration` (:1687) marca `closed`, guarda quien y cuando, y sincroniza el tamano del cuadro match play. A partir de aqui se pueden generar salidas.

### C. Cargar un campo nuevo
1. `/clubs` — crear el club (valida identidad e impide usurpar el nombre de CCQ) y su logo.
2. `/courses` — `createCourse` liga el campo al club; `saveCourseHoles` captura par y handicap de hoyo 1..18.
3. `saveCourseTeeSets` (courses/actions.ts:297) captura las salidas del campo con `course_rating_men/women` y `slope_men/women`.
4. `/course-holes` permite ajustar par, stroke index y `pace_minutes` con validacion estricta; `seedCourseHoles` precarga la tarjeta CCQ.
5. `/tournaments/setup` copia esa tarjeta a `tournament_holes` del torneo; `/tournament-holes` permite retocarla solo para ese torneo.

## Invariantes y trampas
- `tee_sets` (salidas por torneo) NO se crea ni se copia desde ningun punto del codigo: solo se lee. `cloneTournamentRules` copia `category_tee_rules` con el `tee_set_id` del torneo ORIGEN, asi que un torneo clonado apunta a salidas de otro torneo. Por eso `loadTournamentHandicapContext.ts:156` tiene un rescate que busca los `tee_set_id` desconocidos por id. Si se rompe ese rescate, los clones se quedan sin CH/PH.
- Numeracion de jugador: hay DOS mecanismos que no coinciden. `syncEntryDisplayPlayerNumbers` pone `null` a bajas y cancelados; el trigger `trg_renumber_entries_after_delete` renumera TODAS las filas sin filtrar status, o sea vuelve a numerar retirados hasta que se recargue `/entries`. Nunca asumir que `player_number` es estable ni que solo lo tienen los activos.
- La renumeracion vive en un render de servidor. Si alguien deja de llamar `syncTournamentCommitteeRoster` en `/entries`, los inscritos nuevos se quedan con `player_number = null` para siempre: `addEntry` no lo asigna.
- `updateEntryCategory` NO puede usar `ensureRegistrationOpen`: ese helper hace `redirect()` y el modal de Editar lo interpreta como "Error al guardar: NEXT_REDIRECT" aunque el HI si se haya guardado. Ver el comentario en entries/actions.ts:1651 (commit 36eb491).
- El HI de la inscripcion es la fuente de verdad del torneo, no `players.handicap_index`. Los commits f7f416e y 8be53e5 arreglaron que el modal de Editar jugador pisara el HI del torneo con el valor viejo; por eso el editor inline escribe en ambos lados.
- Cambiar la salida (`tee_set_id_override`) SI recalcula CH/PH desde el commit da1b716, aunque el comentario de la migracion 20260529220000 sigue diciendo "sin recalcular HC/PH". El comentario esta obsoleto, el codigo manda.
- Un DQ nunca borra datos: escribe `gross_score = 400`. Si se cambia ese numero magico se rompen leaderboard, cortes y premios.
- Aplicar convocatoria o plantilla de categorias es DESTRUCTIVO: borra categorias y con ellas (por `ON DELETE SET NULL`) deja `category_id = null` en inscripciones y rondas. Hacerlo con torneo ya inscrito deja a todos sin categoria; de ahi la guarda de applyDraft.ts:17.
- `assignTeeSet` con `birth_year` nulo: el fix documentado en lib/tee-assignment.ts:44 es intencional. Restaurar el comportamiento antiguo manda jugadores sin fecha de nacimiento a salidas de seniors.
- El seed WHS de CCQ (20260527140000) actualiza "Blancas damas" con `upper(name) LIKE '%DAMAS%'`, asi que cualquier salida cuyo nombre contenga "DAMAS" (por ejemplo "Rojas (Damas)") queda con rating/slope de Blancas. ATENCION SIN VERIFICAR: no confirme en produccion si alguna fila quedo mal por esto.
- `mergeClubIntoWinner` mueve `courses` y `players` pero NO actualiza `tournaments.club_id` ni `tournaments.club_name`: los torneos siguen colgados del club desactivado — clubs/actions.ts:642.
- `tournaments.club_name` y `course_name` son copias desnormalizadas; el listado y los filtros usan `club_name` con `ilike`. Renombrar un club o un campo sin refrescar esas columnas rompe los filtros de `/tournaments`.
- Cerrar inscripciones es prerequisito de salidas y captura (`assertRegistrationClosedForTeeSheet`). Reabrir a mitad de torneo permite volver a mover inscritos y renumerar, lo que desincroniza tarjetas ya impresas.

## Deuda y preguntas abiertas
- `app/upload-players`, `app/api/upload-players/route.ts` y `app/api/upload/route.ts` no estan referenciados desde ninguna pantalla y no validan sesion ni rol: hacen upsert directo en `players` con service role. `/api/upload` ademas hace upsert de `rows` crudos sin normalizar. Candidatos a borrar o blindar.
- `saveCourseHoles` esta duplicado en `courses/actions.ts:268` y `course-holes/actions.ts:75`; solo la version de `course-holes` valida par 3..6 y handicap 1..18.
- `copyConvocatoriaDraft` en tournaments/actions.ts:166 esta marcado `@deprecated` y solo delega a `cloneTournamentRules`.
- `competition-rules/actions.ts:84` deja un `console.log("🔥 ACTIONS NUEVO EJECUTANDO")` en produccion.
- `getTournamentOrgId` en categories/actions.ts siempre devuelve `null`: `categories.org_id` se escribe siempre nulo. Multi-organizacion quedo a medias.
- `app/(backoffice)/tournaments/[id]/page.tsx` es una pantalla cliente de 47 lineas que solo muestra nombre y estatus; parece resto de un prototipo.
- Archivos muertos: `app/(backoffice)/rounds/page.backup.tsx` y `app/torneos/[id]/page.backup.tsx`.
- `lib/tournaments/cancelledStamp.ts` tiene hardcodeado el UUID del torneo "Prueba Calcuta" y una heuristica por nombre para estampar CANCELADO.
- `app/(backoffice)/categories/templates.ts` (222 lineas, 4 plantillas hardcodeadas: basic_men_ladies, flights_a_b_c, senior_championship, mixed_open) es codigo muerto: ninguna pantalla lo importa, la UI usa la tabla `category_templates`.
- No hay migracion para el nucleo del esquema (`tournaments`, `tournament_entries`, `categories`, `courses`, `tee_sets`, `tournament_holes`, `clubs`, `players`, `caddies`...). Todo eso se creo directo en Supabase y no hay forma de reconstruir un entorno limpio desde el repo.
- ATENCION SIN VERIFICAR: no encontre en el codigo quien asigna `player_number` al insertar una inscripcion desde `addEntry`; todo apunta a que queda `null` hasta la siguiente renumeracion. Si existe un default o trigger creado directo en Supabase, no esta en migraciones.
- `createPlayerAndAddEntry` (entries/actions.ts:774) inserta en `players` con el cliente de sesion, no con service role, a diferencia del resto del modulo. ATENCION SIN VERIFICAR: puede depender de una policy RLS permisiva en `players`.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[tee-sheet-salidas]] · [[captura-scores]] · [[matchplay]] · [[calcuta-subasta]] · [[handicap-whs]] · [[resultados-cortes-premios]] · [[distancias-gps]] · [[ritmo-juego]] · [[telegram]] · [[fb-restaurante]] · [[mobile-watch]]

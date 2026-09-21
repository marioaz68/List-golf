---
titulo: Tee sheet, grupos y salidas
modulo: tee-sheet-salidas
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Tee sheet, grupos y salidas

## Que resuelve
Define quien juega con quien, a que hora sale cada grupo y de que hoyo arranca. Cubre salida por tee times (intervalo fijo desde una hora base) y salida a la canona / shotgun (los 18 hoyos a la vez, con dobles salidas A/B en H1, H10 y pares 5 cuando hay mas de 18 grupos). En R1 agrupa por handicap dentro de cada categoria; en R2+ agrupa por posicion en la clasificacion. En match play arma los foursomes (2 parejas por grupo) copiando el cuadro. Congela el orden ("orden definitivo") para poder publicarlo e imprimirlo, y guarda la hora real de arranque de cada grupo para ritmo de juego.

## Mapa de archivos
| Ruta | Que hace | Lineas |
| --- | --- | --- |
| app/(backoffice)/tee-sheet/actions.ts | Todas las server actions: generar grupos, shotgun slots, recalcular tee times, mover jugadores, confirmar/reabrir orden, match play | 2156 |
| app/(backoffice)/tee-sheet/page.tsx | Pantalla de salidas: selector de sesion, panel de planeacion por categoria, preview match play, gates | 1834 |
| app/(backoffice)/tee-sheet/TeeSheetDnD.tsx | Tarjetas de grupo con drag & drop (dnd-kit), buscador, filtro Huecos, editar tee/hoyo/notas | 1116 |
| app/(backoffice)/tee-sheet/sessionBlock.ts | Agrupa filas `rounds` en "bloques de sesion" (dia+turno+tipo+hora) y formatea etiquetas | 237 |
| lib/tee-sheet/leaderboardOrderForPairing.ts | Orden de R2+ por clasificacion + columna de score acumulado + corte | 449 |
| lib/tee-sheet/pairingGroupLabels.ts | Etiquetas H1B/H1A/H2A por bloque de sesion (shotgun) | 154 |
| lib/tee-sheet/formatStartingHoleLabel.ts | Parseo/formato `H10B` -> `HOYO 10 B` | 66 |
| lib/tee-sheet/matchPlayPairing.ts | Lee `notes` de grupo match play, colores pareja superior/inferior | 115 |
| lib/tee-sheet/pairingGroupCategoryMatch.ts | Marcador de orden confirmado + match de categoria por `notes` | 90 |
| lib/tee-sheet/publicTeeSheetScope.ts | Que jornadas/rondas puede ver el publico (dia competitivo publicado) | 93 |
| app/api/tee-sheet/export/route.ts | Export XLSX (exceljs) de todo el bloque de sesion | 443 |
| lib/salidas/loadCapturaGroupRows.ts | Filas de salida para paneles Telegram/captura; grupos de consolacion MP por fecha | 306 |
| lib/matchplay/maybeCreateNextRoundGroup.ts | Crea/actualiza la salida de la ronda siguiente al avanzar un match | 337 |
| lib/matchplay/pairingGroupOrder.ts | `compactPairingGroupNumbers` + `compactAndSyncRoundGroups` | 60 |
| lib/matchplay/ensureMatchPlayCalendarRounds.ts | Calendario Calcuta (R1..R6), `syncPairingGroupTeeTimes`, horarios del domingo | 434 |
| lib/matchplay/consolationMatchPlay.ts | Salidas de consolacion MP y en que ronda de calendario caen | 1024 |
| lib/ritmo/groupStart.ts | `markGroupStarted` / `clearGroupStart` / `resolveGroupStartDate` | 112 |
| app/api/ritmo/mark-start/route.ts | Endpoint del comite para fijar/editar/limpiar `actual_start_at` | 99 |
| app/(backoffice)/rondas-diarias/actions.ts | Rondas del dia: generar rejilla, agregar/quitar salida, jugadores, avisar Telegram | 566 |
| app/(backoffice)/rondas-diarias/[id]/page.tsx | Agenda del dia por hoyo 1/10 con caddies y hora real | 328 |
| lib/dailyRounds/seedSchedule.ts | Auto-seed de categoria ABIERTA + round + 80 salidas en 3 tandas | 312 |
| lib/dailyRounds/salidaCapacity.ts | Cupo por salida segun dia (L-V 7, S-D 5) | 20 |
| app/(backoffice)/rounds/page.tsx + actions.ts | Alta/edicion del calendario `rounds` del torneo | 822 / 169 |
| lib/rounds/categoryRoundGate.ts | Gate: la ronda anterior debe estar cerrada por categoria | 142 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
| --- | --- | --- |
| pairing_groups | La salida: `id, round_id, group_no, tee_time (time), starting_hole, notes, actual_start_at` | solo la columna `actual_start_at` (20260605160000_pairing_groups_actual_start.sql); la tabla, no (creada en Supabase) |
| pairing_group_members | Jugadores de la salida: `id, group_id, entry_id, position` | no (creada en Supabase) |
| rounds | Calendario logico: `round_no, round_date, start_type, start_time, interval_minutes, wave, category_id, group_size, tee_time_end, is_final_round, name, notes` | no (creada en Supabase) |
| round_scores | Score por ronda y jugador (`round_id, player_id, gross_score`); lo escribe captura, no este modulo | no (creada en Supabase) |
| round_advancement_rules | Reglas de corte/avance entre rondas; deciden si R2+ excluye jugadores | no (creada en Supabase) |
| tournament_entries | Inscritos que se reparten en grupos (`status in ('active','confirmed')`) | no (creada en Supabase) |
| categories | Categorias y su `sort_order` (orden de carriles en shotgun) | no (creada en Supabase) |
| tee_sets / category_tee_rules | Color del tee por jugador en la tarjeta de grupo | 20260525210000_course_tee_sets_whs.sql, 20260525040000_ccq_tee_rules_fix_doradas_damas.sql |
| caddie_assignments | Caddie activo por inscrito, mostrado en cada salida | 20260527160000_caddies_telegram_link.sql |
| matchplay_brackets / matchplay_matches / matchplay_pair_teams | Fuente de los foursomes de match play | 20260522120000_matchplay.sql |
| tournaments | `kind='daily_round'` distingue ronda diaria; `settings.round_closures` marca cierre oficial | 20260608300000_tournaments_private_kind.sql |

Indices/constraints que importan: `uq_pairing_groups_round_group_no UNIQUE (round_id, group_no)`, `uq_rounds_tournament_round_category_wave UNIQUE (tournament_id, round_no, category_id, COALESCE(wave,''))`, `round_scores_round_player_uidx UNIQUE (round_id, player_id)`. `pairing_groups` y `pairing_group_members` tienen **RLS deshabilitado**; `rounds` tiene RLS con una sola policy `public read rounds` (SELECT para anon/authenticated) y ninguna de escritura.

## Reglas de negocio
1. Una "sesion" o bloque de juego no es una fila `rounds`: es el conjunto de filas con igual `tournament_id|round_no|round_date|start_type normalizado|start_time|wave` — una fila por categoria. La clave la calcula `sessionBlockKey` (app/(backoffice)/tee-sheet/sessionBlock.ts:30) y el representante del bloque es el primer `round_id` ordenado por wave/hora/categoria (sessionBlock.ts:73). La URL siempre se normaliza al representante (page.tsx:334).
2. `start_type` tiene dos escrituras vivas: `rounds` guarda `tee_time` (app/(backoffice)/rounds/actions.ts:42 y lib/rounds/createRoundFromForm.ts:37 convierten `tee_times` -> `tee_time`), y tee-sheet compara contra `tee_times`. Toda comparacion debe pasar por `normalizeStartTypeForSession` (sessionBlock.ts:23).
3. Generar grupos exige inscripciones cerradas: `assertRegistrationClosedForTeeSheet` lanza en actions.ts:1303 (match play) y actions.ts:1717 (stroke).
4. Para R2+ todas las categorias del plan deben tener la ronda anterior cerrada (tarjetas locked + cierre oficial en `tournaments.settings.round_closures`); si no, se aborta con el conteo de pendientes (actions.ts:1765, gate en lib/rounds/categoryRoundGate.ts:79).
5. Generar grupos borra TODO el bloque de sesion primero (`deletePairingGroupsForRoundIds` sobre todos los round_id de la sesion, actions.ts:1919 y 593). No es incremental: regenerar pierde cualquier ajuste manual del bloque completo, no solo de la categoria elegida.
6. Orden dentro de la categoria: R1 ordena por `handicap_index` asc y luego apellido/nombre (actions.ts:2025). R2+ ordena por posicion de clasificacion via `sortEntriesForTeeSheetRound` (lib/tee-sheet/leaderboardOrderForPairing.ts:422); sin posicion, rank 999999 y desempate por `id`.
7. R2+ solo excluye jugadores si `cutEnforces === true`, o sea si existe regla activa con `to_round_no === ronda objetivo` y `from_round_no < objetivo` (lib/cuts/computeCutLine.ts:401 y :421). Con corte "informativo" (destino futuro) nadie se cae del tee sheet.
8. Antes de leer el corte, tanto la pagina como la accion ejecutan `repairCutRulesTargetFinalRound`, que **reescribe** `to_round_no` de todas las reglas activas al `round_no` maximo del torneo cuando el torneo tiene mas de 2 rondas (page.tsx:889, actions.ts:1925, lib/convocatoria/upgradeTournamentRules.ts:132). Abrir /tee-sheet en R2+ muta datos de reglas de corte.
9. R2+ requiere `category_competition_rules` activas: sin ellas `buildTeeSheetEntryOrderMap` lanza "Configura reglas de competencia antes de generar salidas de ronda 2 o 3" (leaderboardOrderForPairing.ts:135).
10. Tamano de grupo: parametro de URL `group_size` acotado a 2..8 con default 4 (page.tsx:270, `MAX_GROUP_SIZE = 8` en page.tsx:61); el plan por categoria solo admite 4 o 5 (actions.ts:985) y el formulario de `rounds` solo acepta 2..5 (rounds/actions.ts:62).
11. `buildBalancedChunks` (actions.ts:995): con 1-2 jugadores devuelve un unico grupo corto; con 3+ busca el reparto con todos los grupos entre 3 y el tamano preferido probando de `ceil(total/size)` a `floor(total/3)` grupos, repartiendo el residuo a los primeros; si no encuentra reparto limpio cae a bloques del tamano preferido dejando el ultimo corto.
12. Shotgun — asignacion de hoyos (`buildShotgunSlots`, actions.ts:263): los primeros 18 grupos toman una salida A por hoyo 1..18. Cada grupo extra convierte un hoyo en doble salida en este orden de prioridad: H1, H10, pares 5, pares 4, pares 3 (actions.ts:246, pares desde `lib/distances/ccqScorecard`). En hoyo doble sale primero **B** y luego **A** (actions.ts:283). Maximo duro 36 grupos; mas lanza error (actions.ts:272 y :1042).
13. Shotgun — orden por categoria: las categorias se consumen completas y en secuencia segun `categories.sort_order` (que el propio formulario reescribe, actions.ts:1718 y 1088); `group_no` sigue el orden de categoria, NO el numero de hoyo (actions.ts:1082). En shotgun `tee_time` de todos los grupos es el `start_time` de la ronda y `starting_hole` es el asignado (actions.ts:2075-2082).
14. Tee times — formula: `tee_time = start_time + i * interval_minutes` con **i = indice denso 0..n-1** por orden de `group_no`, nunca `group_no - 1` (actions.ts:2075, recalculo en actions.ts:527 y 658). Si faltan `start_time` o `interval_minutes` validos los grupos quedan sin hora. En tee times `starting_hole` se pone a NULL.
15. Al generar por categoria, cada grupo se inserta en la fila `rounds` de SU categoria dentro del bloque (`resolveRoundIdForCategoryInSession`, actions.ts:2094 y :323); si la categoria no tiene fila propia usa la fila sin categoria del bloque, y si no existe, la ronda seleccionada.
16. `pairing_groups.notes` es un campo semantico, no un comentario libre. Valores producidos: `"<CODIGO> — <Nombre categoria>"` o `"SIN CATEGORIA"` (actions.ts:2091), `"MATCH PLAY · #seedTop vs #seedBot"` (actions.ts:1628), `"CONSOLACION MP · ..."` (lib/matchplay/consolationMatchPlay.ts:19), `"STROKE AGREGADO · ..."` (lib/matchplay/consolationStrokePlay.ts:13), `"3ER LUGAR MP · ..."` (lib/matchplay/thirdPlaceMatch.ts:12), `"Manual"` y `"<Tanda> · Hoyo N"` en rondas diarias. Filtros, colores, paneles y horarios del domingo dependen de estos prefijos.
17. Match play — fuente de los foursomes: si existe bracket publicado (excluyendo el llamado "Consolacion Match Play") se leen los `matchplay_matches` de esa `round_no` y se copian tal cual, ordenados por `position_no` (actions.ts:1365-1410). Solo en R1 sin bracket hay fallback que reconstruye parejas desde `seed`, y si falta seed por postura desc + `auction_order` asc (actions.ts:1424-1533). Para R2+ sin bracket se lanza error explicito.
18. Match play — composicion del grupo: `position` 1 y 2 = pareja superior (top), 3 y 4 = pareja inferior (bottom) (actions.ts:1646, convencion documentada en lib/tee-sheet/matchPlayPairing.ts:1). El intervalo del formulario se acota a 5..30 min con default 10 (actions.ts:1283) y se persiste en `rounds` junto a `start_type='tee_times'`.
19. Confirmar orden definitivo: agrega el marcador literal `[LIST_GOLF_STARTING_ORDER_CONFIRMED]` a `rounds.notes` de **todas** las filas del bloque (actions.ts:1116); reabrir lo quita (actions.ts:1209). Requiere al menos un grupo en el bloque. Ese marcador es lo que hace publica la jornada (lib/tee-sheet/pairingGroupCategoryMatch.ts:6, lib/tee-sheet/publicTeeSheetScope.ts:26).
20. Con el orden confirmado, toda mutacion de grupos queda bloqueada del lado servidor: `ensureStartingOrderIsEditable` lanza si `notes` trae el marcador (actions.ts:379) y se aplica a todo el bloque en generar/limpiar (actions.ts:342). El cliente tambien bloquea DnD y auto-balance (TeeSheetDnD.tsx:443 y :476).
21. Mover un jugador (DnD o click) usa `moveEntryToGroupPosition`: **borra al entry de TODOS los grupos** (no solo del origen), reconstruye el grupo destino insertando en la posicion pedida, renumera 1..n, borra grupos que quedaron vacios y renumera `group_no`, y recalcula tee times (actions.ts:801-880). Tope de 4 pasos en ese orden; alterarlo deja posiciones duplicadas.
22. El limite de jugadores por grupo en DnD es `maxGroupSize` = 8 y solo se valida en el cliente al mover a otro grupo (TeeSheetDnD.tsx:453); el servidor no lo valida. Arrastre activo desde 3 px (TeeSheetDnD.tsx:319); soltar sobre la tarjeta (no sobre una linea) manda al final del grupo (TeeSheetDnD.tsx:518).
23. `recalcStartsForRound` recalcula tee times solo en `tee_times`; en shotgun no toca nada a proposito, porque los hoyos vienen de la planeacion aprobada (actions.ts:571).
24. Editar un grupo a mano valida `starting_hole` entre 1 y 18 y `tee_time` en HH:MM (actions.ts:614-618); si el tee cambia se dispara aviso Telegram de "ajuste de salida" (actions.ts:642, lib/matchplay/notifyGroupTeeTimeChanged.ts:27). El recalculo masivo tambien notifica grupo por grupo (actions.ts:736).
25. Todo Telegram que cite grupo/hora relee la salida en vivo con `refreshLiveGroupSalida` y usa el `tee_time` de BD, no el calculado por el caller (lib/telegram/refreshLiveGroupSalida.ts:41; callers en notifyGroupStart.ts:51, notifyNextRoundGroup.ts:98, ritmo/reminders.ts:94, sendGroupCaptureLinks.ts:64).
26. Hora real de salida (`actual_start_at`): la fija `markGroupStarted`, idempotente salvo `force` (lib/ritmo/groupStart.ts:56 y :79). Disparadores: el comite desde Ritmo en vivo via POST /api/ritmo/mark-start (permiso de modulo `ritmo`, app/api/ritmo/mark-start/route.ts:34), "Avisar/Iniciar" en rondas diarias (rondas-diarias/actions.ts:532, con modo `scheduled` = hora del tee o `now`), y la primera captura de un hoyo cuando el grupo no tiene ni `actual_start_at` ni `tee_time` — caso match play R2+ (lib/captura/saveGroupHoleScore.ts:291). Ritmo prefiere `actual_start_at` sobre el tee programado (lib/ritmo/groupStart.ts:19).
27. Etiqueta de salida publicada: en shotgun se calcula por bloque de sesion completo (todas las categorias del dia juntas, sin partir por wave) y para el mismo hoyo el grupo de menor `group_no` se rotula B y el siguiente A (lib/tee-sheet/pairingGroupLabels.ts:17 y :68). Sin shotgun la etiqueta es `H<hoyo>` o nada.
28. Export XLSX: `GET /api/tee-sheet/export?tournament_id&round_id`, exige sesion (401) y que la ronda sea del torneo. Exporta **todo el bloque de sesion**, una fila por jugador (o una fila placeholder si el grupo esta vacio), hoja "Salidas" con fila 1 congelada y anchos automaticos (route.ts:395-430). Columnas fijas Torneo, Ronda, Fecha ronda, Tipo salida, Categoria ronda, Grupo, Hora tee, Salida, Categoria grupo, Pos, Jugador, Club + una ultima columna variable: `HCP` en R1, `R1` en R2, `R1+R2` en R3+ (route.ts:78). Archivo `salidas_R<n>_<fecha>_<torneo>.xlsx` (route.ts:432).
29. Ronda del torneo vs ronda diaria: la ronda del torneo es una fila `rounds` con `round_no` logico dentro de un `tournaments` de competencia. La ronda diaria es un `tournaments` con `kind='daily_round'` (privado, fuera de la pagina publica) que contiene UNA sola fila `rounds` (`round_no=1`, categoria `ABIERTA` 0-54 mixta, `start_type='tee_time'`, 07:00, intervalo 10) mas 80 `pairing_groups` prearmados (lib/dailyRounds/seedSchedule.ts:29 y :120).
30. Rejilla de la ronda diaria: 3 tandas cada 10 min y en cada hora se crean dos salidas, hoyo 1 y hoyo 10 — manana 07:00-09:10, mediodia 11:40-13:50, tarde 16:00-17:50, extremos inclusive (lib/dailyRounds/seedSchedule.ts:292-301) = 40 horarios x 2 hoyos = 80 grupos. `notes` guarda la tanda.
31. Cupo de la ronda diaria: 7 jugadores L-V y 5 S-D, derivado de la fecha de la ronda a las 12:00 locales, NO de `rounds.group_size` (lib/dailyRounds/salidaCapacity.ts:12, validacion en rondas-diarias/actions.ts:356-364, UI en rondas-diarias/[id]/page.tsx:81).
32. En rondas diarias agregar jugador crea la `tournament_entries` sobre la marcha con `status='confirmed'` y el handicap del jugador si no existe (rondas-diarias/actions.ts:314-341); solo se puede borrar una salida vacia (actions.ts:251); las salidas manuales entran con `group_no = max+1` y `notes='Manual'` (actions.ts:226).
33. Consolacion match play nunca cae en la ronda AM del cuadro principal: se resuelve a R5 (PM) o al domingo (ultima ronda), no a R4 (lib/matchplay/consolationMatchPlay.ts:273-300).
34. Horarios Calcuta: intervalo 12 min, R1 jue 07:00, R2 jue 11:00, R3 vie 11:00, R4 sab 07:00, R5 sab 11:00, R6 dom (lib/matchplay/ensureMatchPlayCalendarRounds.ts:13 y :62). Domingo con horarios fijos por tipo de grupo leidos del prefijo de `notes`: stroke agregado 08:00 hoyo 10, consolacion MP 09:30 hoyo 1, 3er/4to 09:42, final 09:54 (ensureMatchPlayCalendarRounds.ts:16 y :148).
35. `syncPairingGroupTeeTimes` tambien usa indice denso 0..n-1 y no `group_no-1`, para que el primer grupo caiga exactamente en `start_time` aunque falten numeros de grupo (ensureMatchPlayCalendarRounds.ts:117 y comentario en :132).

## Flujos
**A. Armar salidas stroke play de una jornada**
1. `/rounds` crea una fila `rounds` por categoria con `round_no`, fecha, turno AM/PM, tipo, hora e intervalo (app/(backoffice)/rounds/actions.ts:92 -> lib/rounds/createRoundFromForm.ts:87). El indice unico impide duplicar categoria+ronda+turno.
2. `/tee-sheet` normaliza la URL al representante del bloque y carga grupos de todas las filas de la sesion (page.tsx:334, page.tsx:418).
3. El comite fija en el panel de planeacion el orden de categorias y 4 o 5 jugadores por grupo; ese orden se persiste en `categories.sort_order` (actions.ts:1718).
4. "Generar grupos": cierra gates (inscripciones, ronda anterior), borra el bloque completo, ordena cada categoria (HCP en R1, clasificacion en R2+), corta en chunks, asigna hoyos shotgun o tee times y escribe `pairing_groups` + `pairing_group_members` (actions.ts:1696-2130).
5. Ajustes finos con DnD y edicion de tarjeta; cada movimiento recompacta grupos y recalcula tee times (actions.ts:801).
6. "Confirmar orden definitivo" marca todas las filas del bloque y publica la jornada; a partir de ahi el servidor rechaza cambios hasta reabrir (actions.ts:1116 / :1209).
7. Export XLSX del bloque para imprimir (app/api/tee-sheet/export/route.ts).

**B. Salidas de match play**
1. `ensureMatchPlayCalendarRounds` crea/ajusta R1..Rn del calendario (lib/matchplay/ensureMatchPlayCalendarRounds.ts:231).
2. Al cerrar la subasta se autopublica el bracket; `generateMatchPlayTeeSheet` copia los `matchplay_matches` de la ronda a grupos de 4 con `notes = "MATCH PLAY · #a vs #b"` y tee times por formula (actions.ts:1276).
3. `compactAndSyncRoundGroups` renumera `group_no` 1..n y resincroniza horas (lib/matchplay/pairingGroupOrder.ts:34).
4. Al cerrar un partido, `maybeCreateNextRoundGroup` crea o actualiza la salida del match siguiente y publica la ronda con `confirmStartingOrderForRound` (lib/matchplay/maybeCreateNextRoundGroup.ts:67 y :321), y `notifyNextRoundGroupCreated` avisa por Telegram releyendo la hora en vivo.

**C. Ronda del dia del club**
1. Se crea el `tournaments` `kind='daily_round'` y `seedDailyRoundSchedule` deja categoria ABIERTA, la fila `rounds` y las 80 salidas (rondas-diarias/actions.ts:123).
2. `/rondas-diarias/[id]` re-ejecuta el seed en cada carga (idempotente) y lista las salidas por hora y hoyo (rondas-diarias/[id]/page.tsx:63).
3. Se agregan jugadores del padron a cada salida respetando el cupo del dia, y caddies por inscrito.
4. "Avisar Telegram" fija `actual_start_at` (hora programada o "ahora") y manda el link de captura al grupo (rondas-diarias/actions.ts:478).

## Invariantes y trampas
- `(round_id, group_no)` es unico. Cualquier codigo que invente `group_no` debe comprobar los ocupados; `maybeCreateNextRoundGroup` usa `max+1` cuando el slot esta tomado (lib/matchplay/maybeCreateNextRoundGroup.ts:282).
- Trampa 61e8818: al avanzar match play, `position_no` del bracket **no** mapea 1:1 a `group_no` cuando la ronda ya tiene grupos extra (p. ej. una extraordinaria en G1). La identidad del grupo se busca por los dos seeds en `notes` en cualquier orden, y solo si no existe se crea uno nuevo (maybeCreateNextRoundGroup.ts:233). Volver a emparejar por `group_no = position_no` sobrescribe la salida de OTRO partido.
- Trampa 8d11529: al actualizar un grupo existente nunca se pisa un `tee_time` ya puesto por el comite; la formula solo aplica al crear o si el grupo no tiene hora (maybeCreateNextRoundGroup.ts:255). Grupos nuevos se encolan en `max(tee) + intervalo`, no en `start_time + (n-1)*iv`.
- Trampa 0e414a1: regenerar las salidas de match play ya NO reserva slots de consolacion en la ronda del cuadro principal; la consolacion vive en R5/R6 (`resolveConsolationCalendarRound`, consolationMatchPlay.ts:273). Reintroducir el pre-conteo de consolacion vuelve a mezclar CONSOL con cuartos de R4 AM.
- Trampa 0a1e124: nunca mandar por Telegram el tee time que traia el caller. Siempre `refreshLiveGroupSalida` primero; si difiere queda log `tee stale` (lib/telegram/refreshLiveGroupSalida.ts:94).
- Trampa bdb987c: los tee times se calculan con indice denso, no con `group_no - 1`. Con un hueco en `group_no` la primera salida se corria fuera de la hora oficial (actions.ts:658, ensureMatchPlayCalendarRounds.ts:132).
- `rounds` tiene RLS activo con solo policy de lectura. Toda escritura a `rounds` desde el cliente de sesion es un no-op silencioso: por eso confirmar/reabrir orden usa cliente admin y falla explicito si falta `SUPABASE_SERVICE_ROLE_KEY` (actions.ts:158). En cambio `_generateMatchPlayTeeSheet` actualiza `rounds.start_time/interval_minutes` con el cliente de usuario (actions.ts:1328): ATENCION SIN VERIFICAR: esa escritura probablemente no persiste en produccion y el horario solo queda en los `pairing_groups`.
- `pairing_groups` y `pairing_group_members` no tienen RLS: cualquier rol autenticado con la clave anon podria escribirlas. Todo el control de acceso a salidas es de aplicacion, no de base.
- Regenerar salidas de una sola categoria es imposible: el borrado es por bloque de sesion (actions.ts:1919). Antes de regenerar, exportar.
- Abrir /tee-sheet en R2+ ejecuta `repairCutRulesTargetFinalRound` y reescribe `to_round_no` de las reglas de corte activas (page.tsx:889). Es la causa de que un corte configurado "R1->R2" aparezca luego como "R1->R3".
- En shotgun el maximo real es 36 grupos (actions.ts:272) pero el recomendador de la pantalla sugiere hasta 44 con `shotgunExtendedCapacity` (page.tsx:882). Seguir esa recomendacion produce el error "Demasiados grupos para shotgun".
- El orden de hoyos dobles depende de las constantes de par del CCQ en codigo (`CCQ_PAR5_HOLES`, etc.), no del par real del campo en BD; hay TODO explicito para leerlo de `course_holes` (actions.ts:246).
- Etiquetas A/B y `group_no` son cosas distintas: `group_no` sigue el orden de categorias, la etiqueta H1B/H1A se deriva por bloque en el render (pairingGroupLabels.ts:68). Reordenar `group_no` cambia las etiquetas publicadas.
- El marcador de orden confirmado es texto dentro de `rounds.notes`. Editar `notes` a mano puede publicar o despublicar una jornada sin querer.

## Deuda y preguntas abiertas
- `balanceGroupsByCategory` llama `supabase.rpc("balance_groups_by_category")` (actions.ts:956) y esa funcion **no existe** en la base (no hay ninguna funcion con "group" o "pairing" en el nombre). El boton "Auto-balance" siempre falla.
- `app/(backoffice)/rondas-diarias/page.tsx:103` consulta `pairing_groups.select("tournament_id")`, columna inexistente: `groupsCount` de la lista de rondas diarias siempre sale 0 y el error se ignora.
- Codigo muerto: `app/(backoffice)/tee-sheet/TeeSheetDrag.tsx` (310 lineas, nunca importado; duplica el DnD de `TeeSheetDnD.tsx`), `app/(backoffice)/rounds/page.backup.tsx` (643 lineas), y las server actions exportadas `moveEntryToGroup` y `recalculateStartingHoles` (actions.ts:883 y :753) sin ningun consumidor.
- Duplicacion: `buildShotgunSlots` y el orden de hoyos extra existen dos veces, en `app/(backoffice)/tee-sheet/actions.ts:263` y en `app/torneos/[id]/lib/shotgunStartingLabels.ts:24`; el segundo no valida el tope de 36.
- Duplicacion: los helpers de FormData (`reqStr`, `normalizeTime`, `reqGroupSize`...) estan repetidos en `app/(backoffice)/rounds/actions.ts` y `lib/rounds/createRoundFromForm.ts`.
- `scripts/apply-r5-consolation-tee-sheet.mjs` es un parche de un solo uso con UUIDs de grupos, entries y nombres reales incrustados para las salidas del 07/06/2026; sirve como referencia de como consolidar salidas a mano, no como herramienta reutilizable.
- `scripts/apply-calcuta-schedule.ts` trae los ids del torneo oficial y del de prueba hardcodeados y por default apunta al de PRUEBA (scripts/apply-calcuta-schedule.ts:18-19); ejecutarlo sin argumento no toca el torneo oficial.
- `scripts/compact-round-groups.ts` repara `group_no`/`tee_time` de una ronda (llama `compactAndSyncRoundGroups`) pero tiene un `round_id` por default hardcodeado (scripts/compact-round-groups.ts:29).
- `scripts/move-player-capture-round.ts` mueve la captura de un jugador entre rondas logicas por `player_number` (`moveCaptureBetweenRoundNos`, con lock de la tarjeta destino); es para arreglar capturas que quedaron en la ronda equivocada, no toca `pairing_groups`.
- `rounds.tee_time_end`, `rounds.name` y `rounds.is_final_round` existen en BD pero este modulo no los usa; `rounds.group_size` se escribe en /rounds y se ignora en tee-sheet, que usa el `group_size` de la URL.
- ATENCION SIN VERIFICAR: no encontre ninguna validacion de traslapes entre bloques de sesion (dos jornadas distintas pueden generar salidas a la misma hora en el mismo campo).
- ATENCION SIN VERIFICAR: `pairing_group_members` no tiene unicidad sobre `(group_id, entry_id)` ni sobre `entry_id` por ronda; la no-duplicidad depende del borrado previo en `moveEntryToGroupPosition`.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[torneos-setup]] · [[captura-scores]] · [[matchplay]] · [[calcuta-subasta]] · [[resultados-cortes-premios]] · [[ritmo-juego]] · [[telegram]] · [[handicap-whs]]

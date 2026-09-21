---
titulo: Ritmo de juego y marshals
modulo: ritmo-juego
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Ritmo de juego y marshals

## Que resuelve
Durante la ronda el comite necesita saber, sin salir a la cancha, en que hoyo va cada salida, cuales
vienen lentas y a cual mandar un marshal. No hay GPS obligatorio: el sistema deduce el hoyo del grupo
de los escores que va capturando el caddie y, si alguien comparte ubicacion, de su posicion real.
Compara ese avance contra el ritmo objetivo del campo (minutos por hoyo desde la hora de salida) y
pinta el campo con bolas de color. Ademas ubica a los marshals en el mapa y guarda su recorrido del
dia para saber si recorrieron el campo o se quedaron parados.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| app/(backoffice)/ritmo/RitmoLiveView.tsx | UI completa: mapa, chips G#, sidebar, marcar salida, editor de orden | 2269 |
| lib/ritmo/buildRitmoLiveGroups.ts | Corazon: convierte una ronda en filas `LiveGroup` (hoyo, estado, GPS, detalle) | 446 |
| lib/ritmo/captureLag.ts | Clasifica el atraso: kind, holesBehind, paceDelayMinutes, causa | 483 |
| lib/telegram/ritmo/paceCalculator.ts | Minutos por hoyo, hora de salida efectiva, `computePace`, moda de hoyo GPS | 352 |
| app/ritmo/demo/RitmoMap.tsx | Mapa Leaflet: bolas, spiderfy, rotacion, capa de hits | 638 |
| app/(backoffice)/ritmo/page.tsx | SSR: elige rondas en vivo, arma grupos, carga marshals | 250 |
| lib/ritmo/opsDay.ts | Hoy en Mexico, ronda cerrada, eleccion de rondas en vivo del dia | 335 |
| lib/ritmo/loadCaptureLagGroups.ts | Grupos retrasados en captura, match play cerrado, rondas del dia | 508 |
| lib/ritmo/scoreProgress.ts | Hoyos capturados por grupo + primera/ultima captura | 151 |
| lib/ritmo/startHole.ts | Hoyo de salida efectivo y conteo de hoyos con wrap 1..18 | 93 |
| lib/ritmo/gpsSources.ts | Quien manda GPS (caddie/jugador) y si esta live o viejo | 253 |
| lib/ritmo/groupCoverage.ts | Caddies del grupo, Telegram, `gpsState` por antiguedad del ping | 161 |
| lib/ritmo/groupOnCourse.ts | Esta en cancha? Ya termino? (filtro de la vista en vivo) | 52 |
| lib/ritmo/groupStart.ts | Marca / limpia `actual_start_at` (salida real) | 112 |
| lib/ritmo/holeCenters.ts | Centro del poligono del hoyo + abanico para grupos encimados | 32 |
| lib/captura/positionFromActor.ts | Guarda ping de jugador/caddie con filtros de ruido y antisalto | 192 |
| components/captura/GpsChip.tsx | Chip GPS de jugador/caddie en captura (armado ~8 h) | 326 |
| components/marshal/MarshalGpsChip.tsx | Chip GPS del marshal en la mini app | 241 |
| app/(backoffice)/ritmo/marshals/MarshalTrailReport.tsx | Reporte de recorrido del dia de cada marshal | 419 |
| lib/marshal/marshalTrailStats.ts | Distancia, tiempo estatico, GPS apagado, estancias | 213 |
| lib/marshal/loadMarshalDayTrails.ts | Pings del dia agrupados por marshal + colores | 134 |
| lib/marshal/loadMarshalPositions.ts | Ultima posicion reciente de cada marshal (bolas azules) | 91 |
| lib/marshal/loadMarshalRitmoSnapshot.ts | Mismo mapa de ritmo para la mini app marshal | 193 |
| lib/marshal/resolveMarshal.ts | Auth del marshal por `telegram_chat_id` + rol marshal | 226 |
| app/api/ritmo/check-reminders/route.ts | Cron cada 5 min: recordatorios, alertas al comite, aviso a marshals | 70 |

Otras rutas API: `app/api/ritmo/{mark-start,group-schedule,marshals,marshal-trails}`,
`app/api/marshal/{position,ritmo,capture-lag}`, `app/api/captura/position`.

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| ritmo_positions | Pings GPS de jugador, caddie, carrito y marshal + `hoyo_detectado`, `ts`, `is_live_update` | Solo ALTERs (20260607163000_ritmo_positions_telegram_nullable.sql, 20260607240000_ritmo_positions_cart.sql, 20260819120000_ritmo_positions_marshal.sql). El CREATE TABLE no esta (creada en Supabase) |
| pairing_groups | `group_no`, `starting_hole`, `tee_time`, `actual_start_at`, `notes` | no (creada en Supabase) |
| pairing_group_members | entry_id por grupo | no (creada en Supabase) |
| hole_scores | Hoyos capturados (`strokes`, `picked_up`): de aqui sale el avance | no (creada en Supabase) |
| hole_score_audit | Bitacora: primera/ultima captura, actor, actividad del dia | 20260529190000_hole_score_audit.sql |
| rounds | `round_date`, `round_no`, `start_time` para elegir la ronda en vivo | no (creada en Supabase) |
| tournaments | `start_date`, `end_date`, `course_id`, `course_name`, `settings.pace.match_duration_minutes` | no (creada en Supabase) |
| course_holes | `pace_minutes` y `par` = ritmo objetivo del campo | no la columna pace_minutes (creada en Supabase) |
| caddie_assignments / caddies | Caddie activo por entry y su `telegram` | no (creada en Supabase) |
| tournament_entries / players | Nombres y `players.telegram_user_id` para atribuir pings | no (creada en Supabase) |
| profiles | Marshals: `telegram_chat_id`, `telegram_username`, `is_active` | 20260601190000_marshal_role_and_telegram.sql |
| roles / user_club_roles / user_tournament_roles | Rol `marshal` por club o por torneo | rol en 20260601190000_marshal_role_and_telegram.sql |
| matchplay_matches / matchplay_pair_teams | Match cerrado antes del H18 = grupo terminado | 20260522120000_matchplay.sql |
| telegram_outbox | Idempotencia y cooldown de recordatorios y alertas | 20260602030000_telegram_outbox.sql |
| fb_venues | Carrito bar como cuarto actor GPS de `ritmo_positions` | 20260607240000_ritmo_positions_cart.sql (columna) |

## Reglas de negocio
1. Hoyo mostrado, en orden: `lag.captureHole ?? score.lastHole ?? lag.expectedHole`; solo si los tres son null, el GPS no esta stale y hay moda de `hoyo_detectado`, se usa GPS (buildRitmoLiveGroups.ts:366-378). Si el grupo no capturo nada pero tiene tee time, la bola se dibuja donde el RELOJ dice que deberia ir.
2. `holeSource` indica procedencia: `"scores"` (📝), `"gps"` (📡) o `null` cuando el hoyo es el esperado por ritmo (buildRitmoLiveGroups.ts:368-374, RitmoLiveView.tsx:1413-1420).
3. Hoyos avanzados = hoyo capturado MAS LEJANO desde el tee, aunque falte uno intermedio (startHole.ts:14-25). Cortar en el primer hueco dejaba al grupo clavado en H7 con "66 min atrasado" aunque ya iba en H11 (commit 408c620).
4. Un hoyo cuenta como jugado si `strokes != null` o `picked_up === true` (scoreProgress.ts:77).
5. Hoyo actual desde captura = `((startHole - 1 + holesPlayed) % 18) + 1`; null con 0 hoyos o con 18 (scoreProgress.ts:144-151).
6. Hoyo de salida efectivo: `starting_hole` valido 1..18 → notas (`STROKE AGREGADO` → 10, o regex `H`/`HOYO` + numero) → hoyos capturados (minimo >= 10 → 10; todos <= 9 → 1) → 1 (startHole.ts:51-92). Sin esto las salidas del 10 marcan atraso falso.
7. Referencia de salida = `actual_start_at`, pero NUNCA anterior al tee programado; si no hay ninguno, la primera captura del grupo (match play R2+ sin tee sheet) (paceCalculator.ts:101-116, captureLag.ts:157-168).
8. `tee_time` se interpreta como hora de Queretaro UTC-6 fija, sin DST: `${round_date}T${HH:MM:SS}-06:00` (paceCalculator.ts:246-254).
9. Minutos objetivo por hoyo = `course_holes.pace_minutes`; fallback plano de 14 min por hoyo (18 x 14 = 252 min ≈ 4:12) (paceCalculator.ts:8, 58-71). Defaults por par cuando falta el dato: par 3 = 13.5, par 4 = 14.5, par 5 = 15.25 (paceCalculator.ts:22-26).
10. Si existe `tournaments.settings.pace.match_duration_minutes`, los 18 hoyos se escalan para sumar ese total (Calcuta = 300 min, 5 h por match) (paceCalculator.ts:16, 29-53, 228-243).
11. `expectedHoles` = maximo n cuya suma de minutos objetivo desde el tee es <= minutos desde la salida (captureLag.ts:56-73). `expectedHole` = ese hoyo con wrap; null si `expectedHoles >= 18`, el propio tee si <= 0 (captureLag.ts:76-84).
12. `paceDelayMinutes` = round(minutos desde salida − minutos objetivo de los hoyos CAPTURADOS); null si <= 0 (captureLag.ts:86-101).
13. `evaluateCaptureLag` devuelve el primer caso que aplica, en este orden (captureLag.ts:184-422): match cerrado → `terminado` prio 95 · ronda/torneo congelado → `terminado` (18) o `cerrado` · 18 hoyos → `terminado` · sin hora de salida → `sin_hora` · faltan > 2 min al tee → `no_salido` · 0 hoyos y >= 22 min en cancha → `critico` prio 0 · `holesBehind >= 3` → `critico` prio 1 · `>= 2` → `atrasado` prio 5 · sin capturar hace >= 20 min y >= 20 min desde la salida → `silencioso` prio 10 · 0 hoyos y >= 8 min → `silencioso` prio 12 · `>= 1` → `atrasado` prio 15 · resto → `ok` prio 40. Umbrales en captureLag.ts:10-16.
14. Mapeo kind → color: critico/atrasado/silencioso → `atrasado` (rojo); `ok` → `adelantado` (azul) si `holesPlayed > expectedHoles`, si no `en_ritmo` (verde); terminado/cerrado → `cerrado`; resto → `sin_datos` (buildRitmoLiveGroups.ts:67-86, colores en RitmoLiveView.tsx:103-109).
15. Causa del retraso: `paceLate = paceDelayMinutes > 0`, `captureLate = holesBehind > 0 || kind === "silencioso"` → `ritmo` / `captura` / `ambas` / `ninguno` (captureLag.ts:434-459, commit 0b62eec). Es lo unico que distingue "van lentos" de "no anotan la tarjeta".
16. `computePace` es un motor DISTINTO, usado solo por Telegram y las alertas al comite: delta = transcurridos − (hoyos completos + medio hoyo actual); atrasado si > 8 min, adelantado si < −5 min (paceCalculator.ts:9-10, 156-192).
17. Grupo terminado y oculto de la vista en vivo: `status === "cerrado"` o `scoreFinished` (groupOnCourse.ts:4-9, RitmoLiveView.tsx:211-214, loadMarshalRitmoSnapshot.ts:152-164; commit 900ac54). `scoreFinished` = 18 hoyos capturados (opsDay.ts:60-65) o match cerrado (buildRitmoLiveGroups.ts:297, 328).
18. Match cerrado = `matchplay_matches.status` in (`completed`, `halved`, `walkover`) y la clave ordenada de entry_id del grupo coincide con los 4 del match (loadCaptureLagGroups.ts:92-146, commit a416eb2). Sin esto un 5&4 en H16 quedaba atrasado para siempre.
19. Ronda congelada (`opsClosed`): `round_date < hoy`, o `end_date < hoy`, o —sin round_date ni end_date— `start_date < hoy` (opsDay.ts:41-57). Congelada = el reloj de atraso deja de crecer.
20. Grupo "en cancha": `scoreHolesPlayed > 0`, o `actual_start_at`, o GPS live, o (GPS viejo / ultima captura / simplemente) ya paso tee − 2 min (groupOnCourse.ts:12-41; commits 91a570a y 00f1088 para no meter al mapa el grupo de las 11:00 a las 7:00 por ruido de bitacora).
21. `gpsState` por antiguedad del ultimo ping: `live` <= 12 min, `stale` <= 45 min, `none` mas viejo o sin ping (groupCoverage.ts:48-61). La consulta de pings mira 90 min atras (buildRitmoLiveGroups.ts:64).
22. `activeSources` = dispositivos distintos (`tg:<telegram_user_id>` o `pl:<player_id>`) con ping en 5 min: 0 = sin tracking, 1 = un solo punto de falla (buildRitmoLiveGroups.ts:65, 383-394).
23. `resolveGpsSources` toma el ultimo ping por dispositivo, descarta > 45 min, live <= 12 min, caddies antes que jugadores (gpsSources.ts:119-183). Texto del chip por prioridad: caddie live > caddie viejo > jugador live > sin caddie > sin Telegram > GPS apagado (gpsSources.ts:186-253).
24. Pings con `accuracy > 30 m` se guardan pero con `hoyo_detectado = null` (positionFromActor.ts:11, 137-152; api/marshal/position/route.ts:23, 105-107). `accuracy` no se persiste (positionFromActor.ts:165-167).
25. Antisalto: el hoyo solo se acepta si es el hoyo estable del grupo (moda de los ultimos 10 pings de 15 min) o el siguiente con wrap 18→1 (positionFromActor.ts:142-152, paceCalculator.ts:329-352).
26. `detectHole`: dentro de un poligono gana ese hoyo; si cae en varios traslapados gana el de centroide mas cercano; fuera de todos, el borde mas cercano a <= 30 m; si no, null (geometry.ts:109-144). Los 18 poligonos del CCQ estan hardcodeados en holes.ts:11-33 y `getCourseHoles` solo reconoce nombres con "ccq" o "campestre" (holes.ts:35-42).
27. Posicion de la bola: con lat/lon del ultimo ping → `positionSource "gps"`; si no, centro del poligono del hoyo con abanico de 0.00008 grados entre grupos del mismo hoyo → `"capture"`, dibujada con borde punteado y halo azul (RitmoLiveView.tsx:244-291, holeCenters.ts:20-32, RitmoMap.tsx:417-434).
28. Libreria real del mapa: **Leaflet 1.9.4 cargado en runtime desde unpkg.com** con `<script>` y `<link>` inyectados (RitmoMap.tsx:227-242); tiles satelitales de Google `mt{s}.google.com/vt/lyrs=s` (RitmoMap.tsx:260-263). No hay dependencia npm de mapas ni react-leaflet.
29. Todo gesto del mapa esta desactivado (dragging, zoom, tap = false), encuadra con `fitBounds` de los poligonos y los markers son `interactive: false` (RitmoMap.tsx:246-258, 448, 544-548).
30. Spiderfy: puntos a <= 22 px se agrupan y se abren en circulo de 18 px (+3 px por punto extra), con linea y punto tenue hacia la posicion real; nunca se agranda el icono (RitmoMap.tsx:80-168, 373-398; commits c03f496, 3958901).
31. Rotacion 90 grados por CSS solo en la demo (`useViewport.shouldRotateMap`, useViewport.ts:38-40). En ritmo en vivo, mini app marshal y reporte se usa `rotate={false}` a proposito (RitmoLiveView.tsx:994, MarshalRitmoPanel.tsx:210, MarshalTrailReport.tsx:396) porque la rotacion CSS rompia el hit-testing de Leaflet (commit 6739a4b).
32. Los toques se resuelven fuera de Leaflet: `onHitsChange` devuelve coordenadas de pantalla de cada bola (compensando la rotacion) y el padre pone `<a href>` nativos de 44 px encima (RitmoMap.tsx:452-463, RitmoLiveView.tsx:1041-1065). Los chips G# de arriba son los mismos links (RitmoLiveView.tsx:1012-1038) y todos llevan a `/seguimiento-captura?scope=one&group_id=...` (RitmoLiveView.tsx:953-961).
33. Auth de la mini app marshal: `?tg=` se busca en `profiles.telegram_chat_id`, el perfil debe estar activo y tener rol `marshal` activo por club o por torneo (resolveMarshal.ts:65-130). Torneos accesibles = los de sus clubes no archivados + los de rol por torneo (resolveMarshal.ts:133-151).
34. Ping de marshal: fila con `profile_id` set y `group_id` null, `round_id` = la ronda en vivo resuelta en ese momento (api/marshal/position/route.ts:82-117). Bolas azules = ultima posicion por `profile_id` en 90 min (loadMarshalPositions.ts:6, 23-52), refrescadas con poll propio de 15 s a `/api/ritmo/marshals` (RitmoLiveView.tsx:171-193, commit 36a7eea).
35. Reporte del dia (commit 260afcf): pings del dia Mexico (00:00 = 06:00 UTC, tope 20000 filas) por marshal con color por orden (loadMarshalDayTrails.ts:47-118, 121-133).
36. Estatico = puntos dentro de 100 m del ancla de la estancia, y solo cuentan estancias >= 2 min (marshalTrailStats.ts:146-169). GPS apagado = huecos >= 3 min entre pings mas el hueco desde el ultimo ping hasta ahora (marshalTrailStats.ts:171-194). `movingMin = span − static − gpsOff`, acotado a 0 (:196-199).
37. Cron: `vercel.json` corre `*/5 * * * *` sobre `GET /api/ritmo/check-reminders`, con `Authorization: Bearer <CRON_SECRET>` o `?secret=` (route.ts:24-36). Dispara `runRitmoReminders`, `runPaceAlertsForCommittee` y `runMarshalDayStartReminders`, cada uno en su try/catch (route.ts:45-62).
38. Recordatorios a jugadores y caddies: invitacion a compartir Live Location cuando faltan 15-25 min al tee; aviso "no veo tu ubicacion" entre 10 y 30 min despues del tee si no hubo ping en 15 min. El grupo se salta si ya tiene `actual_start_at` (reminders.ts:19-23, 91, 111-141).
39. Las alertas de atraso van SOLO al chat del comite (`TELEGRAM_COMMITTEE_CHAT_ID`), nunca al jugador o caddie; umbral 15 min y cooldown de 1 h por grupo via `telegram_outbox` kind `ritmo_committee_late` (paceAlerts.ts:1-15, 26-27, 138-157).
40. Aviso de dia de torneo a marshals: solo si la hora Mexico esta entre 5:00 y 5:59, para cada ronda con `round_date` = hoy, idempotente por kind `marshal_day_start` (runMarshalDayStartReminders.ts:31-41, notifyMarshalsRoundDayStart.ts:67-88).
41. `POST /api/ritmo/mark-start` es idempotente: sin hora respeta la existente; con `time` HH:MM la interpreta en -06:00 y fuerza sobreescritura; `clear: true` la borra (mark-start/route.ts:58-98, groupStart.ts:56-112).
42. `POST /api/ritmo/group-schedule` reordena en DOS fases: primero manda los `group_no` a negativos temporales y luego a su valor final, porque existe unique `(round_id, group_no)`. Rechaza ordenes repetidos y grupos ajenos a la ronda (group-schedule/route.ts:79-136). No toca `actual_start_at`.
43. Rondas a mostrar: `round_id` explicito gana; si no, todas las de hoy que ya arrancaron por `start_time` o con captura hoy; si ninguna es de hoy, las que tienen captura hoy; luego las abiertas ordenadas hoy > futuras > pasadas; en ultimo caso la ultima pasada (opsDay.ts:197-222, 253-335; commits 3563a5d, c65b14e, e42f9c9). Asi R4 y R5 del mismo dia conviven.
44. "Ronda con captura hoy" = existe `hole_score_audit.created_at` dentro del dia Mexico (loadCaptureLagGroups.ts:395-412); sirve para torneos de prueba con `round_date` futuro y captura real hoy (`resolveOpsRoundDate`, opsDay.ts:107-118).
45. Permiso del modulo `ritmo`: super_admin, club_admin, tournament_director, score_capture, entries_operator, caddie_manager, checkin, viewer y marshal (permissions.ts:135-145). `/ritmo` exige sesion via proxy (permissions.ts:264, proxy.ts:19).

## Flujos

### 1. Ritmo en vivo del backoffice
1. `app/(backoffice)/ritmo/page.tsx:64-70` valida sesion y modulo `ritmo`.
2. Carga torneo, `loadPerHoleMinutes` (course_holes + escalado por settings) y las `rounds` (:85-114).
3. `loadRoundIdsWithCaptureActivityToday` + `resolveLiveRoundsForTournament` eligen las rondas en cancha (:116-129).
4. Por cada ronda, `buildRitmoLiveGroupsForRound` arma los `LiveGroup`: grupos, miembros, nombres, cobertura de caddies, pings de 90 min, progreso de escores, matches cerrados y actores GPS (:180-193).
5. `loadMarshalPositions` agrega las bolas azules (:218) y se renderiza `RitmoLiveView`.
6. En el cliente: `router.refresh()` cada 30 s (RitmoLiveView.tsx:196-199) y poll de marshals cada 15 s (:171-193).
7. Tocar un chip G# o una bola abre `/seguimiento-captura?scope=one&group_id=...`; desde la tarjeta se marca "Salio ahora" (RitmoLiveView.tsx:2074-2200).

### 2. Ping GPS de jugador o caddie
1. `components/captura/GpsChip.tsx` arranca `watchPosition` y manda como maximo un ping cada 30 s o cuando se movio >= 8 m (:18-19, 176-182).
2. `POST /api/captura/position` → `saveCapturaPosition`: resuelve el actor (caddie primero, luego entry), obtiene torneo/ronda/grupo activos, detecta hoyo, aplica filtro de accuracy y antisalto e inserta en `ritmo_positions` con `telegram_user_id` si existe (positionFromActor.ts:104-184).
3. Ese insert alimenta el mapa, `gpsState`, `activeSources` y el chip "caddies con GPS".

### 3. Reporte de recorrido de marshals
1. `/ritmo/marshals?tournament_id=...&day=YYYY-MM-DD` (marshals/page.tsx:38-73) calcula los limites del dia Mexico y llama `loadMarshalDayTrails` con `staticMeters: 100` y `gapThresholdMin: 3`.
2. `computeMarshalTrailStats` produce distancia, span, estatico, GPS off, estancias y huecos.
3. `MarshalTrailReport` dibuja polilineas en el mismo `RitmoMap` y refresca cada 20 s contra `/api/ritmo/marshal-trails` (MarshalTrailReport.tsx:73-96).

## Invariantes y trampas
- **El rojo casi siempre es atraso de CAPTURA, no de juego.** `holesBehind` compara hoyos capturados contra reloj: un grupo rapido cuyo caddie no anota sale rojo. Solo `classifyDelayCause` (captureLag.ts:434-459) distingue ritmo de captura; no cambiar esa semantica sin cambiar los textos.
- No cortar el avance en el primer hueco de captura (startHole.ts:14-25). Es el bug de 408c620 y reaparece si alguien "arregla" el conteo para que sea contiguo.
- No reordenar las guardas de `evaluateCaptureLag`: `matchplayCompleted` y `opsClosed` van ANTES del reloj, o las rondas pasadas y los matches cerrados vuelven a acumular atraso (captureLag.ts:184-237).
- `actual_start_at` nunca puede quedar antes del tee programado (paceCalculator.ts:110-113); si se permite, el atraso se infla para todo el grupo.
- Nada de `<Link>` de Next ni handlers de Leaflet sobre el mapa: los toques usan `<a href>` nativos y `window.location.assign` (commits e91bf00, 6739a4b, c2628aa, 432cbb4, 48ee10f). Los cambios sin commitear ponen `pointerEvents: "none"` en el host del mapa y `auto` solo en cada chip (RitmoMap.tsx:534-539, 594-607; RitmoLiveView.tsx:978-1065): subir el `zIndex` del mapa o quitar ese `pointerEvents` deja muertos los chips y el boton "Recorrido marshals".
- `RitmoMap` reinicia Leaflet solo cuando cambian tamano, `rotate` o `showHoleLabels`; los datos entran por refs y se redibujan sin remontar (RitmoMap.tsx:192-208, 573-578). Meter `groups` o `marshals` en ese array de dependencias hace desaparecer las bolas en cada refresh (commit 36a7eea).
- Leaflet y los tiles son externos (unpkg + Google). Sin salida a internet el mapa queda negro y solo sirve la lista; no hay fallback.
- 45 minutos es el corte duro de presencia: un grupo con pings de hace 1 h queda en `gpsState: "none"` aunque la consulta traiga 90 min (groupCoverage.ts:53-58, gpsSources.ts:124).
- Campo distinto a CCQ: `mapUnsupported = true` y `hoyo_detectado` siempre null, asi que el ritmo depende 100% de la captura (holes.ts:35-42, page.tsx:101).
- La zona -06:00 esta hardcodeada en varios puntos (paceCalculator.ts:251, opsDay.ts:97-99, loadMarshalDayTrails.ts:131, mark-start/route.ts:80). Correcto para Queretaro hoy, pero es un supuesto.
- El chip de resumen "cerrados" nunca se puede ver: `activeGroups` ya filtro los terminados antes de contar (RitmoLiveView.tsx:211-214 vs 294-304, 529-535).
- El chip GPS del marshal solo recuerda su estado en `sessionStorage`, sin el TTL de 8 h del chip de captura (MarshalGpsChip.tsx:18-20, 152-198): al cerrar la pestana se apaga.
- Ciclo de vida del chip GPS de captura: se arma ~8 h en `localStorage` con marca de tiempo, un "off" explicito gana sobre todo, y `visibilitychange`/`focus` reinician `watchPosition` (GpsChip.tsx:24, 41-70, 211-273). Con pantalla bloqueada o mini app cerrada `watchPosition` se suspende: el unico GPS real de 8 h es Live Location de Telegram (GpsChip.tsx:11-13, 290).

## Deuda y preguntas abiertas
- `lib/ritmo/buildRitmoLiveGroups.ts`, `app/(backoffice)/ritmo/RitmoLiveView.tsx` y `app/ritmo/demo/RitmoMap.tsx` tienen cambios SIN COMMITEAR: migracion de `computePace` a `evaluateCaptureLag` en la vista y arreglos de `pointerEvents`/`zIndex`. Revisar `git diff` antes de editarlos.
- Efecto de ese cambio: `gpsHole` (moda de `hoyo_detectado`) quedo practicamente muerto, porque `lag.expectedHole` casi nunca es null cuando hay tee time (buildRitmoLiveGroups.ts:366-378). Hoy el GPS sirve para la POSICION de la bola, no para el hoyo. ATENCION SIN VERIFICAR: no esta claro si es intencional.
- Dos motores de ritmo con umbrales distintos: `evaluateCaptureLag` (hoyos) para la UI y `computePace` (8 min / −5 min) para Telegram y alertas. Un grupo puede salir verde en pantalla y generar alerta en el chat.
- `runPaceAlertsForCommittee` llama `loadPerHoleMinutes(supabase, null)` (paceAlerts.ts:128), que siempre devuelve `{}`: las alertas al comite usan el fallback de 14 min/hoyo, no el ritmo configurado del campo ni el escalado de Calcuta.
- `RitmoMap.tsx` es componente de produccion pero vive en `app/ritmo/demo/`, junto a `DemoView.tsx`, `SidebarGroups.tsx` y un `page.tsx` con 6 grupos ficticios y nombres reales de socios. Deberia moverse a `components/ritmo/`.
- Codigo muerto confirmado: `opsDay.shouldFreezePace`, `opsDay.isOpsRoundLive`, `startHole.countContiguousHolesFromStart`. `RitmoMap.onSelectGroup` esta marcado `@deprecated` (RitmoMap.tsx:50) y ya nadie lo pasa.
- `/api/marshal/{position,ritmo,capture-lag}` se autentican solo con `?tg=<telegram_chat_id>` en la URL, sin firma ni init-data de Telegram: quien tenga el link tiene el panel. `check-reminders` tambien acepta `?secret=` en query, que queda en logs de acceso.
- `accuracy` de cada ping se usa para filtrar y se descarta; no se puede auditar despues por que un hoyo quedo en null (positionFromActor.ts:165-167).
- `hole_score_audit` se lee con `.limit(3000)` (scoreProgress.ts:95) y `.limit(5000)` (activeCapturers.ts:65, loadCaptureLagGroups.ts:406), sin filtro de fecha en scoreProgress: en un torneo largo esos topes pueden truncar y falsear la ultima captura. ATENCION SIN VERIFICAR: no medido en produccion.
- No hay tests de `captureLag`, `startHole`, `opsDay` ni `marshalTrailStats`, que son calculo puro y facil de cubrir.
- `ritmo_positions` no tiene su `CREATE TABLE` ni sus politicas RLS en migraciones; todos los inserts del modulo pasan por el cliente admin (service role), asi que la RLS real es desconocida desde el repo.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[tee-sheet-salidas]] · [[captura-scores]] ·
[[resultados-cortes-premios]] · [[matchplay]] · [[distancias-gps]] · [[telegram]] ·
[[torneos-setup]] · [[mobile-watch]]

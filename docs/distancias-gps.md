---
titulo: Distancias, GPS del campo y seguimiento de tiros
modulo: distancias-gps
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Distancias, GPS del campo y seguimiento de tiros

## Que resuelve
El jugador (o su caddie) necesita saber en el campo cuantas yardas le faltan al frente, centro y fondo del green, donde estan los bunkers y el agua, y donde quedo la bandera de hoy. Ademas registra golpe por golpe: bastón elegido, yardas planeadas, donde cayo la bola y en que lie (calle, rough, trampa, agua, OB), con los castigos de reglas. Con eso arma la tarjeta del hoyo, alimenta las estadisticas personales del jugador y aprende sus distancias reales por bastón. El campo del CCQ se calibra en sitio: se caminan los greens, salidas, fairways, trampas y lagos y se dibujan sobre satelite.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| app/captura/distancias/DistanciasClient.tsx | Pantalla Yardas completa (mapa, deteccion de hoyo, captura de golpes, putts, castigos). Ver seccionado abajo | 4184 |
| lib/distances/holeShots.ts | Store de golpes por hoyo (HoleShotsStore), castigos, merge multi-dispositivo, totales de ronda | 996 |
| app/captura/calibrar/CalibrarClient.tsx | Editor satelital de calibracion por hoyo (green, salidas, poligonos, centerline, OB) | 1207 |
| lib/distances/suggestClub.ts | Eleccion de bastón y valores de los rodillos de yardas | 412 |
| lib/distances/playerBag.ts | Bolsa del jugador (catalogo activo + yardas full/3-4) con sync remoto y cola offline | 374 |
| lib/distances/centerline.ts | Linea central del fairway: proyeccion, distancia acumulada, preview del golpe | 326 |
| lib/flags/flagStore.ts | Banderas: guardar/leer pin vigente, sesion Telegram, rol flag_keeper | 324 |
| app/api/captura/distancias/course-layout/route.ts | Una sola llamada con todo el layout calibrado de los 18 hoyos | 306 |
| lib/distances/yardageStats.ts | GIR, putts, fairways, scramble, sand save, driving, plan vs real | 302 |
| lib/distances/detectLie.ts | Prioridad de lie y deteccion de OB por lado de la linea | 277 |
| lib/distances/calibrationStore.ts | Escrituras de calibracion en Supabase (green, poligonos, boundary, tee) | 272 |
| lib/distances/ccqHolePoints.ts | Puntos derivados por hoyo (front/center/back/tee/corners) + yardsBetween | 262 |
| app/api/mobile/stats/route.ts | Estadistica personal por bastón y swing para la mini app | 246 |
| app/api/captura/distancias/bag/route.ts | GET/POST bolsa remota con llave `player:{id}` | 213 |
| app/api/captura/banderas/route.ts | Captura de bandera por pin sheet (color+lado+2 yardas) y geometria del green | 202 |
| app/api/captura/distancias/shots/route.ts | Snapshot de golpes: GET/POST con merge en servidor | 191 |
| lib/flags/greenDiagram.ts | Normaliza el green a un diagrama SVG con frente abajo | 187 |
| lib/telegram/ritmo/geometry.ts | Primitivas: pointInPolygon, distancias en plano local, detectHole con umbral 30 m | 153 |
| lib/flags/pinSheetGeometry.ts | Convierte pin sheet (yardas) a lat/lon usando la circunferencia del green | 141 |
| lib/distances/detectActiveHole.ts | Deteccion del hoyo activo por centerline / poligono / salida | 130 |
| lib/distances/holeComplete.ts | Umbrales de cierre de hoyo, putts y snap al centro | 129 |
| lib/distances/clubCatalog.ts | Catalogo fijo de 26 bastones con yardas default | 121 |
| lib/distances/teePositions.ts | Sets de salida (BLK/BLU/WHT/GLD/RED) y resolucion de la salida del hoyo | 120 |
| app/api/captura/suggest-club/route.ts | Sugerencia de bastón por constancia historica del jugador | 118 |
| lib/captura/mergeWatchSwingYardage.ts | Inserta golpes detectados por el Apple Watch en el store de yardas | 359 |

### Seccionado de DistanciasClient.tsx (4184 lineas — no lo leas completo)
| Lineas | Que hay ahi |
|---|---|
| 1-145 | 53 bloques de import (todo `lib/distances/*`, `lib/flags/*` y ~20 componentes de `components/captura/`) |
| 146-292 | Helpers y constantes de modulo: `framingPinAt` (146), `HoleYardageMap` dinamico (169), `GeoState` (175), `MAX_DISTANCE_FROM_COURSE_M` / `GREEN_ENTRY_DWELL_MS` / `AUTO_GREEN_ENTRY_PROMPT` / `GREEN_PUTT_MAX_YARDS` (182-188), `PaceState` (192), `GreenEntryPuttPrompt` (202), `GREEN_HALF_WIDTH_YARDS` + `computeGreenBallPoint` (217-257), `PACE_STYLE` (260), `timeAgo` (286) |
| 293-482 | Inicio del componente y ~90 `useState`/`useRef`. `bagScope` en 465, `parByHole` en 470, `teeCenters` en 436 |
| 483-624 | Contextos de sync (`shotsSyncCtx` 487, `bagSyncCtx` 505), hidratacion de bolsa y golpes (543), poll del Apple Watch cada 12 s (579), `actorQuery` (614) |
| 625-660 | Puente a la tarjeta del grupo: `saveHoleScoreToCard` |
| 661-728 | `watchPosition` del GPS y manejo de errores transitorios |
| 729-844 | Carga de `course-layout` y volcado a los ~10 mapas de estado por hoyo |
| 845-986 | Deteccion de hoyo: `insideHole` (845), `nearest` / `farFromCourse` (855-872), auto-hoyo pegajoso (874-948), reanudacion tras hoyo manual (956-982) |
| 987-1072 | Carga por hoyo: puntos de referencia, green resuelto y bandera del dia |
| 1073-1355 | Memos derivados: `activeHolePoints` (1073), `pendingShot` (1093), `lastBall` (1108), `teeMark` (1127), `shotLandings`/`completedShotArcs` (1162-1195), encuadre del mapa (1226), `liveGreenYds`/`playGreenYds` (1250-1323) |
| 1356-1593 | `detectLieForPoint` (1369), `openPlanFromPoint` (1448), `syncPuttYardsForGreen` (1485), `correctLastShotLanding` (1508), `currentBallLie` (1540) |
| 1594-1695 | `markTeeAt` (1594) y `confirmRoundTee` (1649) |
| 1696-1894 | `finishHoleAndAdvance` (1696), `advanceAfterAutoGreenPutts` (1779), apertura manual de captura de putts (1852), pad de coordenadas (1875) |
| 1895-2047 | `handleConfirmGreenEntryPutts` (1895), `showHoleFinishPrompt` (1998), `continueHoleAfterMiss` (2024) |
| 2048-2338 | Efectos: plan automatico al cambiar de hoyo (2048), menu de salida (2077-2147), toasts, entrada al green desactivada (2238), GPS simulado en demo (2322) |
| 2339-2462 | `greenYds` (2339), `refPoints` (2399), `playFromPoint` (2416), `greenPuttTapEnabled` (2426) |
| 2463-2656 | `applyPendingShotLanding` (2463) — el corazon del registro de golpes — y `confirmGreenPuttAdjust` (2599) |
| 2657-2788 | `onMapTap`: prioridad suelta de lago → marcar salida → esperar bastón → golpe pendiente (D/G) → reubicar en green |
| 2789-3039 | Handlers: GPS como posicion de bola (2789), medir distancia (2797), elegir golpe (2822), castigo manual (2852), `handleConfirmPlan` (2901), `handleConfirmWithSuggest` (2985), `handleBagChange` (3030) |
| 3040-3262 | Poll de ritmo cada 60 s (3040), navegacion de hoyos (`goToHole` 3069, `startAtHole` 3105, `resetActiveHole` 3147, modo correccion 3190, `returnToResumeHole` 3232) |
| 3263-4096 | JSX: mapa (3269), hojas y overlays (3408-3479), pad del green (3553), controles inferiores y ENT/CEN/FON (3771-3947), `GpsChip` (3963), `ShotPlanPanel` (4001), `ShotResultOverlay` (4026), `ClubSuggestOverlay` (4037) |
| 4098-4184 | Subcomponentes `PaceBannerThin` y `MiniDist` |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| course_holes | Tabla base del hoyo. Columnas green_front/center/back_lat/lon y boundary_geojson son de este modulo | tabla: no (creada en Supabase). Columnas: 20260611120000_course_holes_green_points.sql y 20260614120000_course_holes_boundary.sql |
| course_hole_polygons | Poligonos calibrados por hoyo: fairway, green, bunker, water, ob, centerline. Slot unico por (course,hole,kind,sort_order) | 20260615140000_course_hole_polygons.sql (+ 20260615190000 centerline, + 20260616080000 permite hole_number=0) |
| course_hole_reference_points | Puntos nombrados (bunker, water, dogleg, hazard, other, custom) para el rangefinder | 20260610180000_course_hole_reference_points.sql |
| course_hole_tee_positions | Salida GPS por hoyo y color de marcadores | 20260621120000_course_hole_tee_positions.sql |
| course_hole_flag_positions | Historico de posiciones del pin por hoyo y fecha, con ventana de vigencia y datos de pin sheet | 20260701120000_flag_keeper_and_flag_positions.sql (+ 20260701140000 valid_until, + 20260701160000 color/side/depth/edge) |
| telegram_flag_sessions | Hoyo activo de captura de bandera por encargado en Telegram | 20260701120000_flag_keeper_and_flag_positions.sql |
| yardage_shot_logs | Snapshot JSON del HoleShotsStore por scope_key (privada, solo service_role) | 20260619120000_yardage_shot_logs.sql |
| yardage_player_bags | Snapshot JSON de la bolsa por scope_key (privada, solo service_role) | 20260626000000_yardage_player_bags.sql |
| v_yardage_shots | Vista que aplana yardage_shot_logs a un renglon por tiro (player_id, hole, stroke_no, club, swing, actual/planned_yards, lie_kind, is_penalty, to_lat/lon, completed_at, metricas de swing) | no (creada en Supabase) |
| yardage_excluded_shots | Tiros que el jugador excluyo de sus promedios (por shot_id) | no (creada en Supabase) |
| yardage_excluded_holes | Jugadas de hoyo excluidas (round_key + hole) | no (creada en Supabase) |
| watch_swing_events | Swings del Apple Watch; columnas yardage_shot_id / yardage_merged_at los ligan a yardas | tabla: no. Columnas: 20260713130000_watch_swing_yardage_merge.sql |
| ritmo_positions | Pings GPS; el carrito bar escribe aqui con fb_venue_id | 20260607240000_ritmo_positions_cart.sql |
| fb_venues / fb_venue_stock / fb_menu_items | Carrito bar: identidad del venue tipo 'cart' y su stock | modulo F&B |
| courses / players / tournament_entries / profiles / roles / user_club_roles | Identidad, campo y jugadores | no (creadas en Supabase) |

## Reglas de negocio
1. **Distancia base = Haversine con R = 6 371 000 m**; conversion a yardas con factor **1.09361** (`lib/distances/ccqGreens.ts:52`, `:68`).
2. **`yardsBetween` REDONDEA a yarda entera** antes de devolver (`lib/distances/ccqHolePoints.ts:176`). Todo lo que se muestra y se guarda como yardas viene de aqui: no hay decimales en el sistema.
3. **Geometria fina en plano local equirectangular**, no en la esfera: `M_PER_DEG_LAT = 110_574` y `metersPerDegLon(lat) = 111_320 * cos(lat)` (`lib/telegram/ritmo/geometry.ts:42`). Se repite identico en `centerline.ts:9`, `inBunker.ts:21`, `detectLie.ts:88`, `pinSheetGeometry.ts:16`, `ccqHolePoints.ts:44`, `DistanciasClient.tsx:227`. Unidad interna: **metros**; solo se convierte a yardas al mostrar o al guardar el golpe.
4. **1 yarda = 0.9144 m** (`lib/distances/centerline.ts:40`, `shotTrajectory.ts:4`, `pinSheetGeometry.ts:17`, `DistanciasClient.tsx:220`).
5. **Punto dentro de poligono** = ray casting sobre coordenadas [lon,lat] en grados, con anillos interiores como huecos (`lib/telegram/ritmo/geometry.ts:21-40`). **Sin tolerancia**: estar 1 cm fuera del green calibrado ya no es green (`lib/distances/onGreen.ts:5`).
6. **Frente y fondo del green sin calibrar** se derivan sobre el eje salida→centro a **15 yd a cada lado** (`HALF_GREEN_DEPTH_M = 15 * 0.9144`, `lib/distances/ccqHolePoints.ts:104-110`). Derivarlos de los vertices del poligono del hoyo daba errores de 100+ yd porque ese poligono traza todo el hoyo.
7. **Salida por defecto sin calibrar** = promedio de los **dos vertices mas lejanos** del anillo del hoyo respecto al centro del green (`lib/distances/ccqHolePoints.ts:69-79`).
8. **Los valores calibrados en BD ganan punto por punto**: front, center y back se pueden calibrar por separado y cada uno sobrescribe solo su default (`lib/distances/greenPoints.ts:43-64`). Igual el poligono del hoyo (`resolveCourseHoles.ts:6`) y la salida (`teePositions.ts:104`).
9. **La bandera del dia manda sobre el centro del green**: si hay pin vigente, `center` apunta a la bandera y `source` pasa a `"db"` aunque el green no este calibrado (`lib/distances/loadGreenPoints.ts:52-62`, `app/api/captura/distancias/course-layout/route.ts:120-140`).
10. **Vigencia de la bandera**: `effective_date <= hoy` **y** (`valid_until IS NULL` o `valid_until >= hoy`), con hoy en zona `America/Mexico_City` (`lib/flags/flagStore.ts:15`, `:85-91`). Si vencio y no hay recaptura, el hoyo desaparece del mapa de banderas y Yardas vuelve al centro. La vigente es la de `effective_date DESC, created_at DESC` (`:107-117`).
11. **Pin sheet → lat/lon**: color roja=frente, blanca=medio, azul=atras (`zoneForColor`, `lib/flags/pinSheetGeometry.ts:26`). `depth_yards` se mide desde el **frente** si roja/blanca y desde **atras** si azul, sobre el eje frente→atras. `edge_yards` se resuelve intersectando la perpendicular con la circunferencia calibrada del green y metiendose esas yardas hacia adentro (`:92-140`). Sin anillo calibrado cae a un desplazamiento lateral desde el eje (aproximado).
12. Validacion de pin sheet: `depth_yards` en [0,60], `edge_yards` en [0,40], color en {roja,blanca,azul}, lado en {left,right} (`app/api/captura/banderas/route.ts:145-156`). Sin frente/atras del green calibrados el POST **falla con 400** (`:176-181`).
13. **Deteccion del hoyo activo, en orden**: (a) centerline mas cercana si esta a < 45 m; (b) poligono que te contiene, desempatando por centerline o green mas cercano; (c) null (`lib/distances/detectActiveHole.ts:81-93`). La **semilla inicial** usa 70 m de tolerancia y, si estas fuera de todo, la **salida** mas cercana, no el green (`:100-129`) — con el green, en la salida del 1 brincaba al 3.
14. **El hoyo automatico es pegajoso y solo ascendente**: de `prev` solo puede pasar a `(prev % 18) + 1`, y solo si (a) el hoyo actual esta **terminado** (putt final o dada registrados) y (b) el GPS te ubica dentro del siguiente en **2 lecturas seguidas** (`DistanciasClient.tsx:917-948`). Nunca retrocede ni se salta hoyos.
15. Si fijaste hoyo a mano, el automatico se reanuda **solo** al llegar al hoyo siguiente en orden y solo si el GPS te vio antes en el hoyo fijado (`wasOnManualHoleRef`, `DistanciasClient.tsx:956-982`). Si el hoyo no esta cerrado se muestra el letrero "Termina el hoyo N: marca tu golpe tocando el mapa" y **no** se cambia de hoyo.
16. **Fuera del campo no se mide**: si el green mas cercano queda a mas de **300 m** (`MAX_DISTANCE_FROM_COURSE_M`, `DistanciasClient.tsx:184`) la pantalla no calcula yardas (evita numeros absurdos abriendo la app desde casa). En modo prueba (`?prueba=1`) no aplica.
17. **Prioridad de lie: OB → agua → trampa → green → fairway → rough** (`lib/distances/detectLie.ts:206-257`). Solo poligonos calibrados, sin buffer.
18. **OB se calibra como LINEA abierta de todo el campo** (`hole_number = 0`, kind `ob`, LineString) porque el borde del fraccionamiento lo comparten muchos hoyos (`20260616080000_...sql`, `CalibrarClient.tsx:87-92`). La bola esta OB si esta a menos de **80 m** (`OB_PAST_LINE_MAX_M`) del tramo y del **lado opuesto** al del hoyo activo; sobre la linea, OB si esta a menos de **12 m** (`OB_LINE_BUFFER_M`) (`detectLie.ts:83-165`). El lado valido se toma de las anclas del hoyo activo: teeMark, salida, centerline y green (`activeHoleInBoundsRefs`, `:183-203`).
19. **Castigo OB = stroke-and-distance**: +1 golpe y se vuelve a jugar desde `shot.from` del golpe que salio (`lib/distances/holeShots.ts:697-731`). Idempotente: si el golpe siguiente ya es castigo, no se duplica.
20. **Castigo de lago**: +1 golpe con `to = null` (queda pendiente de suelta). El jugador debe tocar el mapa **fuera del agua** para fijar la suelta; tocar dentro del agua se rechaza (`holeShots.ts:594-640`, `DistanciasClient.tsx:2662-2683`).
21. **Castigos manuales +1 por clic**: BI (unplayable), Zanja (hazard), Perdida (lost), Lugar (wrong_place), Equivocada (wrong_ball), Otro. OB y agua los pone el sistema (`holeShots.ts:46-58`).
22. **`lastBallPosition` es el ancla del siguiente golpe, no el ultimo `to`**: salta el castigo de agua sin suelta, devuelve `from` si el lie fue OB y salta los tiros que quedaron en agua (`holeShots.ts:557-580`). Si no hay nada, la marca de salida y luego la salida del catalogo.
23. **Yardas reales del golpe**: con putter o lie green se redondea a **1 yd (minimo 1)**; en cualquier otro caso **al multiplo de 5** (`strokeActualYards`, `lib/distances/holeComplete.ts:95-106`).
24. Si la caida queda a **<= 3 yd** del centro calibrado, la bola se **ancla al centro** (`LANDING_SNAP_TO_CENTER_YDS`, `holeComplete.ts:13`, `:113-124`).
25. **Cierre de hoyo**: se pregunta "entro / quedo dada / sigo jugando" si la distancia al centro es **<= 1 yd**, o si el lie es green con golpe planeado **<= 2 yd** y estas a **<= 2 yd** del hoyo (`holeComplete.ts:8-38`). "Quedo dada" **siempre suma +1** golpe (`recordGivenPutt`, `holeShots.ts:400-424`). "Entro" cierra el golpe pendiente sin agregar otro (`:427-441`).
26. **Captura obligatoria de putts al green** (boton manual; el disparo automatico esta apagado con `AUTO_GREEN_ENTRY_PROMPT = false`, `DistanciasClient.tsx:187`): la bola debe estar en green por un **golpe capturado**, no por estar parado ahi; el dwell era de 4 s (`GREEN_ENTRY_DWELL_MS`) y las yardas de putt se topan a **35 yd** (`GREEN_PUTT_MAX_YARDS`, `:188`, `:2268-2295`, `:1895-1985`).
27. **Bola en el green por pad de coordenadas** (A/I/D/F): profundidad desde frente o fondo y lateral asumiendo **media anchura de green de 11 yd** — valor estimado, no medido (`GREEN_HALF_WIDTH_YARDS`, `DistanciasClient.tsx:219`, `computeGreenBallPoint` `:223-257`).
28. **Eleccion de bastón (`pickBestClubAndCarry`, `lib/distances/suggestClub.ts:151-283`), en orden**: (a) putter si hay putter y el lie es green; (b) en trampa, la cuña de mas loft disponible en 3/4 con orden `lw, w58, sw, w54, w52, w50, w48, pw`; (c) a **<= 75 yd** (`SHORT_GAME_LW_MAX_YARDS`), LW con carry = yardas exactas al centro; (d) carry **exacto** al objetivo (empate: gana full); (e) el **menor carry >= objetivo** (nunca quedarse corto); (f) el mas cercano en valor absoluto (empate: mayor carry y full).
29. **3/4 por defecto = redondear(full * 0.75 / 5) * 5** (`clubCatalog.ts:81`). El catalogo tiene 26 bastones con yardas amateur; la bolsa inicial activa 16 (`playerBag.ts:47-64`).
30. **Sugerencia por historial (`app/api/captura/suggest-club/route.ts`)**: lee `v_yardage_shots` del `player_id` (max 10 000 filas), quita los `yardage_excluded_shots`, descarta putter y penalty, se queda con los tiros cuyas **yardas reales** caen en **±5 yd** de la distancia pedida (`WINDOW_YD = 5`), agrupa por bastón, exige **>= 3 tiros** (`MIN_SHOTS`), calcula promedio y **desviacion estandar poblacional**, y sugiere el bastón de **menor desviacion** (el mas parejo, no el mas cercano en promedio). Si el bastón ya elegido es ese, no molesta (`:100-107`).
31. **Estadisticas derivadas del store (`lib/distances/yardageStats.ts`)**: GIR = llegar al green en **<= par-2** golpes contando castigos (`:88-128`); putts = golpes con la bola ya en green mas los concedidos (`:98-122`); fairway solo en par >= 4 y se juzga el **primer golpe no-castigo** (`:130-135`); scramble = fallo GIR y aun asi score <= par (`:179-184`); sand save = paso por trampa y score <= par (`:185-186`); porcentajes con 1 decimal (`:208-211`).
32. **Endpoints de estadistica de la mini app** (`app/api/mobile/stats/*`), todos POST con `initData` de Telegram firmado — el jugador se **deriva del initData**, nunca del body, porque `yardage_shot_logs` es privada (`app/api/mobile/stats/route.ts:1-20`): `/` distancias por bastón x swing (full y 3/4 como bastones independientes) y promedios de swing del reloj; `shots` y `approach-list` / `putt-list` listas para drill-down; `approach` cubetas 0-10…51-60 yd; `putts` cubetas 0-5…>25 con % metidos y % de 3-putts; `green-map` donde quedo el tiro de approach por hoyo; `hole-plan` secuencia de bastones que suma la distancia salida→bandera; `hole` / `holes` detalle y promedios por hoyo; `shot-lines` estilo de linea solid/dashed/dotted segun si alcanzo >=95% / >=85% del objetivo; `exclude` y `exclude-hole` marcan exclusiones reversibles.
33. **Llaves de scope**. Golpes: `entry:{entry_id}` si hay entry, si no la `scope_key` cruda (`app/api/captura/distancias/shots/route.ts:69`). Bolsa: `player:{player_id}` resuelto desde entry o telegram, porque la bolsa es de la persona y no de la ronda (`bag/route.ts:22-53`). Fallback de scope: `scope > entry > telegram > caddie:{id}` (`lib/distances/shotsScopeKey.ts`).
34. **Merge de golpes hoyo por hoyo** (nunca a nivel store): gana el que tiene **mas golpes completados** en ese hoyo; en empate, el de marca de tiempo mas reciente. Las marcas de salida se unen con las locales encima (`mergeHoleShotsStores`, `holeShots.ts:187-223`). El POST del servidor tambien fusiona con lo que ya hay antes de guardar (`shots/route.ts:153-163`).
35. **Solo estos telegram_user_id pueden calibrar**: lista fija en codigo mas la variable de entorno **`CALIBRATION_TELEGRAM_IDS`** (IDs separados por coma) (`lib/distances/calibrationAccess.ts`). Los cinco endpoints de `/api/captura/calibrar/*` validan `tg` en cada request y responden 403.
36. **Solo un perfil con rol `flag_keeper` activo** (de club o global) captura banderas, resuelto por `profiles.telegram_chat_id` (`lib/flags/flagStore.ts:221-251`, `:298-317`). Auto-vinculacion por `telegram_username` al escribir /BANDERAS (`:258-295`).
37. **Marcas por defecto de la centerline**, medidas desde el centro del green hacia la salida: par 3 → [70]; par 4 → [170, 70]; par 5 → [300, 170, 70] yd; se omite la marca que caeria detras de la salida (`lib/distances/centerline.ts:47-97`).
38. **Poligonos cerrados exigen >= 3 puntos; centerline y OB son lineas abiertas y exigen >= 2** (`CalibrarClient.tsx:105`). Guardar un slot vacio equivale a **borrarlo** (`:445-456`). Al borrar un bunker/lago se reescriben todos los slots con `sort_order` contiguo 0..n-1 para no dejar huecos (`:494-535`).
39. **Carrito bar**: el operador deja abierta `/captura/carrito?venue=XXX` y el chip GPS postea a `cart-position`. Solo venues `type = 'cart'`; pings con `accuracy > 30 m` se guardan **sin** hoyo detectado (`MAX_ACCURACY_M`, `app/api/captura/cart-position/route.ts:17`, `:72-74`). `cart-locations` solo devuelve carritos vistos en los **ultimos 15 min** (`FRESH_MIN`).
40. **Puente Yardas → tarjeta del grupo**: al cerrar un hoyo se postea el total de golpes a `/api/captura/score` con `mode: "approve"` (no queda en rojo) y **solo** si la URL trae `group_id` y `me` (`DistanciasClient.tsx:629-659`). Si falla la red, la ronda sigue: los golpes ya quedaron en localStorage.

## Flujos

### 1. Calibrar un hoyo en campo (solo IDs autorizados)
1. Telegram: `/CALIBRAR` abre `/captura/calibrar?tg=...`; `app/captura/calibrar/page.tsx:21` bloquea si el id no esta autorizado.
2. Modo **green**: se paran los 3 puntos (Entrada / Centro / Atras) y se manda cada uno a `POST /api/captura/calibrar/green` (`calibrationStore.ts:13` escribe la columna correspondiente de `course_holes`, creando el renglon si falta).
3. Modo **tee**: por cada color (Negras…Rojas) se guarda la posicion con `POST /api/captura/calibrar/tee` → upsert en `course_hole_tee_positions`.
4. Modo **boundary** (linea azul del hoyo): `POST /api/captura/calibrar/boundary` → `course_holes.boundary_geojson`.
5. Modos **greenarea / fairway / bunker / water** (poligonos) y **centerline / ob** (lineas): `POST /api/captura/calibrar/polygon` con `kind` + `sort_order`; el OB va con `hole = 0`.
6. Modo **point**: bunkers/agua/dogleg sueltos con `POST /api/captura/calibrar/point`, movibles con PATCH y borrables con DELETE (`course_hole_reference_points`).
7. Orden practico recomendado por el codigo: green (3 puntos) → salidas → boundary → centerline → area del green → bunkers/lagos → OB del campo una sola vez. Sin frente/atras del green la captura de banderas por pin sheet **no funciona** (regla 12) y sin centerline la deteccion de hoyo pierde su mejor señal (regla 13).

### 2. Bandera del dia
1. El encargado escribe `/BANDERA 7` en Telegram → `setFlagSession` fija hoyo 7 (`lib/flags/flagStore.ts:151`).
2. Se para junto a la bandera y comparte ubicacion. El webhook intercepta la ubicacion **antes** de ritmo de juego (`app/api/telegram/webhook/route.ts:177-198`) y `handleFlagLocationUpdate` la guarda con `source = "gps"`, luego **avanza la sesion al hoyo siguiente** (`lib/telegram/banderas/handleFlagLocationUpdate.ts:46-78`). Los updates de Live Location solo refrescan, sin avanzar.
3. Alternativa mas exacta: `/captura/banderas?tg=...` (rol `flag_keeper`), elegir color + lado + las 2 yardas y guardar → `POST /api/captura/banderas` convierte con `computeFlagPosition` y guarda con `source = "yards"`.
4. El jugador lo consume por `course-layout` (todos los hoyos) o `GET /api/captura/banderas/view` (lectura publica de un hoyo, sin rol).

### 3. Jugar un hoyo en Yardas
1. Entrada tipica: `/captura/distancias?tg=...&me={entry_id}&group_id=...` (tambien `caddie=`, o `?prueba=1` para demo).
2. Se hidrata la bolsa y los golpes de localStorage, se bajan del servidor y se fusionan (`DistanciasClient.tsx:543-570`); `course-layout` trae todo el layout de los 18 hoyos en una llamada (`:729-838`).
3. Menu de salida: se elige color de marcadores y hoyo de salida (1 o 10). Eso ancla `roundStartHole` en el store y auto-marca la salida calibrada (`confirmRoundTee`, `:1649-1694`).
4. Elegir bastón y yardas en `ShotPlanPanel` → `handleConfirmPlan` crea el golpe pendiente (`addPlannedShot`). Antes de eso, si hay `entry_id`, se consulta `suggest-club` y se ofrece el bastón mas constante sin bloquear el juego (`handleConfirmWithSuggest`, `:2985-3012`).
5. Se camina, se toca el mapa donde cayo la bola → botones **D** (solo medir) / **G** (ahi quedo) (`onMapTap`, `:2705-2726`). En green el toque abre el panel de ajuste de yardas de putt en vez de marcar directo.
6. `applyPendingShotLanding` (`:2463-2589`) hace, en este orden: detectar lie → snap al centro si procede → calcular yardas reales → cerrar el golpe → si OB, castigo y reencuadre al punto de repeticion → si agua, castigo y espera suelta → si no, preguntar cierre de hoyo o abrir el siguiente plan.
7. Al cerrar el hoyo: se limpia el hoyo siguiente, se auto-marca su salida calibrada, se avanza el hoyo activo y se manda el score a la tarjeta del grupo (`finishHoleAndAdvance`, `:1696-1775`). Al terminar los 18 se muestra el resumen de la ronda.
8. Cada `saveHoleShots` escribe localStorage y encola el sync remoto con debounce de 450 ms (`holeShots.ts:152-167`, `syncHoleShotsRemote.ts:35-49`).

## Invariantes y trampas
- **No toques `yardsBetween` sin revisar todo**: es la unica puerta de metros→yardas y ya redondea. Devolver decimales cambia los umbrales de cierre de hoyo (1 yd), el snap (3 yd) y todos los promedios.
- **Metros vs yardas**: todo lo geometrico (distancias a segmentos, poligonos, umbrales de deteccion de hoyo, buffers de OB) esta en **metros**; todo lo que ve el jugador esta en **yardas**. Mezclarlos es el error mas caro del modulo. `MAX_DISTANCE_FROM_COURSE_M`, `OB_*_M`, `GREEN_ENTRY_DWELL_MS` son metros/ms; `SHORT_GAME_LW_MAX_YARDS`, `PUTTER_MAX_YARDS`, `GREEN_PUTT_MAX_YARDS` son yardas.
- **No adelantar de hoyo con el GPS antes de cerrar el actual**: fue arreglado dos veces (`c4595d6`, `77d525c` "no avanzar de hoyo hasta terminarlo"). Si se quita la guarda `isHoleFinished`, los golpes del hoyo actual empiezan a caer en el hoyo siguiente.
- **El desempate de hoyos por centerline es lo que evita el brinco 1→3 en la salida** (`aea686e`, `abbce30`, `3dcd383`). Si un hoyo pierde su centerline calibrada, `course-layout` genera una recta por defecto (`:160-167`) que en doglegs desambigua peor.
- **El lado del OB depende del hoyo activo**, no de la geometria sola: la misma linea de fraccionamiento tiene OB a la derecha para un hoyo y a la izquierda para el vecino (`3dcd383`, `abbce30`). Cambiar `activeHoleInBoundsRefs` marca OB bolas buenas.
- **Los castigos son idempotentes a proposito**: `applyObPenaltyStroke` y `applyWaterPenaltyStroke` revisan si el golpe siguiente ya es castigo antes de agregar (`holeShots.ts:715-718`, `:664-667`). Historicos: `e15a014` (OB +1 no se sumaba), `d5034e4` / `beaa8a5` / `5d8d3f9` (conteo de "quedo dada"), `4acb895` (putt extra al confirmar "entro").
- **El merge de golpes es por hoyo**: el bug que arregla `mergeHoleShotsStores` es pisar los castigos de un hoyo con datos viejos de otro dispositivo (`563170b`). El servidor tambien fusiona: si se cambia a upsert simple, el iPad borra lo del telefono.
- **`bagScope` prefiere `tg` sobre `me`** (`DistanciasClient.tsx:465`), pero la llave canonica del servidor prefiere `entry:` para golpes y `player:` para bolsa. Son intencionalmente distintos: localStorage por dispositivo, servidor por persona. Unificarlos a la ligera pierde rondas guardadas.
- **`detectLieAtPoint` no tiene tolerancia** (`80af23f` "deteccion de lie estricta por poligono"). Un green calibrado apretado deja putts marcados como rough y rompe el conteo de putts y el GIR.
- **`clearHoleShots` del hoyo siguiente al cerrar uno** (`finishHoleAndAdvance`, `:1714-1717`) es deliberado: evita arrastrar toques de prueba. Si se aplica al hoyo que se acaba de cerrar, se borra la ronda.
- **`isHoleFinished` solo es true con putt final registrado o dada** (`holeShots.ts:906-910`); es la condicion de la que dependen el avance de hoyo, `inferRoundStartHole` y el resumen de ronda.
- **La sesion de bandera abierta secuestra las ubicaciones del encargado**: mientras `telegram_flag_sessions` tenga fila, sus pings **no** cuentan para ritmo de juego (`webhook/route.ts:177`). Hay que limpiarla con `clearFlagSession`.
- **`source = "map"` esta permitido en la BD y nunca se escribe** (`flagStore.ts:12`): la pantalla de banderas hoy solo captura por pin sheet, aunque su docstring dice que sirve para arrastrar el pin en el satelite (`app/captura/banderas/page.tsx:1-10`).
- **`BanderasClient.tsx:45` usa `M_PER_DEG_LAT = 111_320`**, distinto del 110_574 del resto del modulo: ~0.7% de error de escala en el eje norte. Solo afecta el diagrama en pantalla, no lo que se guarda, pero es una inconsistencia real.
- **`app/api/mobile/stats/hole-plan/route.ts:22-30` reimplementa Haversine inline** con su propia conversion a yardas y sin redondear. Si se ajusta el factor en un lado y no en el otro, el plan de hoyo deja de coincidir con la pantalla.
- **Los golpes del Apple Watch entran por el servidor**, no por la pantalla: `mergeWatchSwingYardage` inserta con id `watch-{uuid}` y Yardas los descubre con un poll cada 12 s (`DistanciasClient.tsx:579-601`). Ese camino usa un lie **aproximado** (green si estas a <= 22 yd del centro, si no fairway; `lib/captura/mergeWatchSwingYardage.ts:52-62`) porque el servidor no carga los poligonos calibrados.

## Deuda y preguntas abiertas
- `app/captura/distancias/demo/DistanciasDemoClient.tsx` (319 lineas) es **codigo muerto**: `demo/page.tsx` solo redirige a `/captura/distancias?prueba=1` y nadie importa el componente.
- `defaultDistanciasCourseId()` esta **duplicado** en `lib/distances/loadGreenPoints.ts:78` y `lib/distances/loadCourseReferencePoints.ts:47`; ambos devuelven `CCQ_COURSE_ID` hardcodeado (`lib/distances/courseReferencePoints.ts:5`). **Todo el modulo asume un solo campo**: Yardas no soporta otro club sin tocar codigo.
- `CCQ_COURSE_ID` tambien esta hardcodeado en `scripts/detect_bunkers.py:36`.
- Funciones `@deprecated` vivas: `pointAtYardsAlongCenterline` y `buildShotPreviewAlongCenterline` (`centerline.ts:179`, `:230`), `isWithinLwThreeQuarterReach` (`suggestClub.ts:64`).
- Parametros muertos por firma: `detectLieAtPoint` recibe `_bunkerPoints`, `holePoints` y `waterPoints` y los descarta con `void` (`detectLie.ts:222-224`); `isPointOnGreen` ignora `_holePoints` (`onGreen.ts:9`); `shouldSuggestPutter` ignora `targetYards` y `greenDist` y solo mira `onGreen` (`clubCatalog.ts:71-78`), lo que deja `PUTTER_MAX_YARDS = 55` sin uso real.
- Los puntos sueltos de bunker/agua (`course_hole_reference_points` con kind bunker/water) se cargan y se pasan por todo el arbol pero **ya no se usan** para detectar lie: solo cuentan los poligonos.
- `AUTO_GREEN_ENTRY_PROMPT = false` deja ~90 lineas de deteccion de entrada al green inactivas (`DistanciasClient.tsx:2238-2317`); el dwell de 4 s solo aplica si se reactiva.
- `scripts/detect_bunkers.py` (357 lineas) y `scripts/detect_water.py` (209) son **experimentales y se corren a mano**: `scripts/.venv-bunkers/bin/python scripts/detect_bunkers.py --holes all [--dry-run]`. Bajan tiles satelitales (Google con respaldo Esri), recortan al boundary calibrado, segmentan por color HSV y escriben **borradores** en `course_hole_polygons` (`kind='bunker'` / `'water'`). Dan falsos positivos (caminos, albercas, techos azules) y el usuario los ajusta en Calibrar. No estan integrados a la app ni al deploy; `detect_water.py` importa la infraestructura de `detect_bunkers.py`.
- Basura a limpiar en la raiz: `diag-yardas.txt`, `diag-merge.txt`, `diag-merge2.txt`, `diag-merge3.txt` son volcados de depuracion (fragmentos de `holeShots.ts` y `shots/route.ts`), ya cubiertos por `.gitignore:47` (`diag-*.txt`). `banderas_yardas_integration.patch` es un parche **ya aplicado** (su cambio de `loadLatestFlags` esta en `course-layout/route.ts`, commit `cdc892f`) y si esta versionado: borrable.
- Fuente externa de diseño: **`Arquitectura-Seguimiento-Tiros-golf-torneo.docx`** en la raiz del proyecto (documento de arquitectura del seguimiento de tiros, no leido aqui).
- Pendientes de precision reconocidos en el codigo: `CCQ_GREEN_CENTERS` viene de un PDF con **±5-10 m** de error (`ccqGreens.ts:1-13`); el hoyo 10 tenia la coordenada 600 m fuera del poligono y esta **estimada**; el hoyo 11 tenia un typo (88 segundos) y usa el centroide del poligono (`:35-41`). `GREEN_HALF_WIDTH_YARDS = 11` esta marcado como estimado a afinar en campo.
- ATENCION SIN VERIFICAR: `v_yardage_shots`, `yardage_excluded_shots` y `yardage_excluded_holes` no aparecen en `supabase/migrations`; su definicion exacta (columnas, indices, RLS y como aplana el JSON de `yardage_shot_logs`) solo se puede confirmar en Supabase. El codigo asume que la vista expone `player_id`, `shot_id`, `shot_log_id`, `round_id`, `course_id`, `hole`, `stroke_no`, `club`, `swing`, `actual_yards`, `planned_yards`, `lie_kind`, `is_penalty`, `to_lat`, `to_lon`, `completed_at` y metricas de swing.
- ATENCION SIN VERIFICAR: `yardage_shot_logs` y `yardage_player_bags` tienen RLS solo para `service_role`, asi que toda lectura pasa por rutas con `createAdminClient()`. No encontre limpieza ni retencion de estos snapshots; podrian crecer sin tope.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[torneos-setup]] · [[tee-sheet-salidas]] · [[captura-scores]] · [[handicap-whs]] · [[resultados-cortes-premios]] · [[ritmo-juego]] · [[telegram]] · [[mobile-watch]] · [[fb-restaurante]] · [[matchplay]] · [[calcuta-subasta]]

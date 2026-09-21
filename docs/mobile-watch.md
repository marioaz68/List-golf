---
titulo: App movil nativa y Apple Watch
modulo: mobile-watch
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# App movil nativa y Apple Watch

## Que resuelve
El caddie y el jugador caminan 4 horas con el celular en la bolsa y la pantalla apagada: el navegador
mata el GPS y Telegram Live Location caduca a las 8 h y exige tocar el chat. La app Expo nativa
mantiene un foreground service mandando la posicion al ritmo del campo aunque la app este cerrada.
El Apple Watch resuelve otra cosa: contar golpes y medir el swing sin sacar el telefono del carrito,
y meter cada golpe al modulo de yardas con el bastón sugerido sin que el jugador anote nada. Todo
cae en el mismo backend de listgolf.club: no hay servidor aparte.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| mobile/lib/locationTask.ts | Task de background (expo-task-manager), throttle 30 s / 8 m, espejo de sesion | 178 |
| mobile/app/ritmo.tsx | Pantalla principal: boton GPS on/off, estado del Watch, logout | 304 |
| mobile/app/index.tsx | Login con codigo de 6 digitos del bot de Telegram | 217 |
| mobile/lib/watchSync.ts | Puente JS: eventos del Watch -> POST a la API, throttle propio | 132 |
| mobile/lib/api.ts | Cliente HTTP: redeem, position, watch/swing | 126 |
| mobile/lib/config.ts | API_BASE_URL, PING_INTERVAL_MS, MIN_DISTANCE_M, LOCATION_TASK_NAME | 24 |
| mobile/lib/auth.ts | Sesion en SecureStore (caddieId / entryId / displayName) | 59 |
| mobile/modules/listgolf-watch-sync/ios/ListgolfWatchSyncModule.swift | WCSessionDelegate del iPhone, reenvia a RN | 138 |
| mobile/modules/listgolf-watch-sync/src/index.ts | API JS del modulo nativo (solo iOS) | 75 |
| mobile/watch/ListGolfWatch/Services/PhoneRelay.swift | WatchConnectivity del reloj hacia el iPhone | 133 |
| mobile/watch/ListGolfWatch/Services/SwingDetector.swift | Deteccion de swing a 50 Hz (umbral accel+giro) | 126 |
| mobile/watch/ListGolfWatch/Services/RoundCoordinator.swift | Orquesta GPS + swing + workout + relay | 97 |
| mobile/watch/ListGolfWatch/Services/LocationTracker.swift | GPS del reloj, filtro 3 m, descarta >25 m | 110 |
| mobile/watch/ListGolfWatch/Services/WorkoutSessionManager.swift | HKWorkoutSession .golf para no perder sensores | 88 |
| mobile/watch/ListGolfWatch/Services/SwingMotionAnalyzer.swift | Metricas del swing (vel. angular y grados) | 82 |
| golf-torneo-watch/MotionRecorder.swift | Version viva: 800 Hz CMBatchedSensorManager + workout | 176 |
| golf-torneo-watch/SwingDetector.swift | Detector con histeresis, prominencia y pre-swing | 129 |
| golf-torneo-watch/SwingAnalyzer.swift | Metricas + validacion de forma + delta de muneca | 113 |
| golf-torneo-watch/{RoundRecorder,WatchSwingUploader}.swift | Orquesta y hace POST directo con cola en memoria | 90 / 56 |
| lib/telegram/ritmo/mobileCode.ts | Comando /codigo del bot, genera y reusa el codigo | 166 |
| app/api/mobile/auth/redeem/route.ts | Canjea el codigo one-time y devuelve caddieId/entryId | 95 |
| lib/captura/saveWatchSwing.ts | Resuelve actor, detecta hoyo, inserta y dispara merge (endpoint: app/api/captura/watch/swing) | 129 |
| lib/captura/mergeWatchSwingYardage.ts | Convierte el swing en golpe de yardas (idempotente) | 359 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| mobile_auth_codes | Codigos one-time del bot para loguear la app nativa | 20260605120000_mobile_auth_codes.sql |
| watch_swing_events | Un renglon por swing del reloj; +liga a yardas (130000) y metricas dps/deg (140000) | 20260713120000_watch_swing_events.sql |
| watch_swing_events (wrist_delta_pitch/roll/yaw_deg) | Angulo de muneca address->impacto | no (creada en Supabase) |
| ritmo_positions | Destino de cada ping GPS de la app y del reloj | no (creada en Supabase; solo ALTERs en migraciones) |
| yardage_shot_logs | Payload de golpes donde se inyecta el golpe del reloj | 20260619120000_yardage_shot_logs.sql |
| yardage_player_bags | Bolsa del jugador para elegir bastón del swing | 20260626000000_yardage_player_bags.sql |
| tournament_entries / players / caddies | Identidad del actor (entry_id, caddie_id, telegram) | no (creada en Supabase) |

## Reglas de negocio
1. La app nativa no tiene usuario ni password: la identidad es `caddie_id` o `entry_id` obtenidos por
   canje de codigo. Sesion valida = cualquiera de los dos presente (mobile/lib/auth.ts:57).
2. El bot resuelve primero JUGADOR por `players.telegram_user_id` y solo si no hay, CADDIE por
   `caddies.telegram` (lib/telegram/ritmo/mobileCode.ts:47-95). Si no esta en ninguno, no da codigo.
3. El `entry_id` del codigo es el entry MAS RECIENTE por `created_at` del jugador (mobileCode.ts:55-61):
   con entries de varios torneos puede quedar apuntando a un torneo viejo.
4. Codigo de 6 digitos, vigencia 10 min; si hay uno vigente sin consumir se reusa en vez de generar
   otro (mobileCode.ts:15,31,113-135). El canje acepta 4 a 8 digitos en cliente y servidor
   (mobile/app/index.tsx:64, redeem/route.ts:39) aunque el bot solo emita 6.
5. Canje one-time: marca `consumed_at` y el indice unico parcial solo cubre codigos no consumidos
   (redeem/route.ts:77-87, migracion 20260605120000:25-27). Expirado devuelve 410 (redeem:69-74).
6. El redeem nunca devuelve `player_id`; la app solo guarda caddieId, entryId y displayName
   (redeem/route.ts:89-94). La tabla tiene RLS activo sin policies: solo service role
   (migracion 20260605120000:41-42).
7. Ping GPS al backend solo si paso `PING_INTERVAL_MS` = 30 s O el usuario se movio
   `MIN_DISTANCE_M` = 8 m (mobile/lib/config.ts:15,19; locationTask.ts:66-70). El primer ping tras
   instalar siempre pasa (no hay lastPing).
8. El task de background lee credenciales de AsyncStorage con las llaves `*.public`, NO de
   SecureStore, porque SecureStore no es confiable al despertar el task (locationTask.ts:74-77,
   98-113). Sin ese espejo el task retorna sin enviar y sin error visible (locationTask.ts:78).
9. Encender GPS exige permiso foreground Y background; si falta el background se aborta con mensaje
    (locationTask.ts:122-133). `startLocationUpdatesAsync` va con `BestForNavigation`,
    `pausesUpdatesAutomatically: false` y notificacion de foreground service (locationTask.ts:140-152).
10. Arrancar es idempotente: si `hasStartedLocationUpdatesAsync` ya es true no vuelve a registrar
    (locationTask.ts:135-138). Lo mismo al apagar (159-170).
11. Logout apaga tracking, borra el espejo de AsyncStorage y luego SecureStore, en ese orden
    (mobile/app/ritmo.tsx:133-137). Si se invierte, el task sigue mandando pings del usuario anterior.
12. `API_BASE_URL` default `https://www.listgolf.club`, sobrescribible con
    `EXPO_PUBLIC_API_BASE_URL` en build (mobile/lib/config.ts:9-12).
13. El servidor guarda el ping aunque no pueda detectar hoyo. `accuracy` > 30 m marca el ping como
    ruidoso y el hoyo se guarda en null (lib/captura/positionFromActor.ts:11,136-141). El valor de
    accuracy NO se persiste, solo filtra (positionFromActor.ts:169-171).
14. Antisalto: el hoyo detectado se acepta solo si es el hoyo estabilizado del grupo o el siguiente
    con wrap 18->1; si no, se guarda null (positionFromActor.ts:143-155).
15. El actor debe tener contexto de torneo/ronda ACTIVA o el ping se rechaza con 400 "Actor no
    vinculado a torneo/ronda activa" (positionFromActor.ts:117-125). Fuera de torneo la app no sirve.
16. Watch -> iPhone: si `WCSession.isReachable` usa `sendMessage`; si no (o si falla) cae a
    `transferUserInfo`, que el SO encola y entrega despues (mobile/watch/.../PhoneRelay.swift:86-99).
    Sin red del telefono los eventos se acumulan en la cola del SO, no en disco de la app.
17. iPhone -> Watch solo viaja `authenticated` y `displayName` via
    `updateApplicationContext` (ListgolfWatchSyncModule.swift:69-87). El reloj NUNCA conoce
    caddie_id ni entry_id: la identidad la estampa el telefono al hacer el POST.
18. El puente JS descarta cualquier evento del reloj si el telefono no tiene sesion
    (mobile/lib/watchSync.ts:70-71). Las posiciones del reloj usan el mismo throttle 30 s / 8 m pero
    con llave propia `listgolf.watch.lastPing` (watchSync.ts:21,41-56) y solo marcan enviado si el
    POST regreso ok (watchSync.ts:84-86). Los swings NO se throttlean (watchSync.ts:90-103).
19. `event.ts` del reloj viene en segundos epoch y se convierte a ISO antes de mandarlo (watchSync.ts:97).
20. Deteccion de swing en mobile/watch: deviceMotion a 50 Hz; exige aceleracion >= 3.2 g Y rotacion
    >= 5.0 rad/s en 3 muestras consecutivas (~60 ms), cooldown de 5 s entre swings
    (SwingDetector.swift:9-13,95-107); buffer de 55 muestras ~1.1 s (SwingMotionAnalyzer.swift:29).
21. Metricas de mobile/watch: top del backswing = maximo |pitch - pitch(address)| antes del impacto;
    velocidades = maximo de |rotationRate| por fase; angulos = diferencia de pitch en grados;
    descarta si ambas velocidades pico <= 0.5 rad/s; redondea a 1 decimal; exige >= 20 muestras e
    impacto en indice >= 8 (SwingMotionAnalyzer.swift:45-79).
22. Un swing sin GPS se descarta: usa la posicion del swing o la ultima de la sesion, y si no hay
    ninguna no se manda (RoundCoordinator.swift:48-55).
23. Iniciar ronda pone `swingCount` en 0 (RoundCoordinator.swift:33); el `swing_no` que llega al
    servidor es un contador de la ronda del reloj, NO el numero de golpe del hoyo.
24. Si el workout falla, la ronda sigue: solo guarda `lastError` (RoundCoordinator.swift:65-70). Si
    HealthKit falla al cerrar, tampoco bloquea (WorkoutSessionManager.swift:55-60).
25. GPS del reloj: `BestForNavigation`, `distanceFilter` 3 m, descarta lecturas con accuracy < 0 o
    > 25 m (LocationTracker.swift:21-25,60-72). `allowsBackgroundLocationUpdates = false`
    (LocationTracker.swift:24): el GPS sobrevive a la baja de muneca SOLO por el workout activo.
26. golf-torneo-watch usa `CMBatchedSensorManager` (800 Hz acelerometro + 200 Hz deviceMotion), que
    exige `HKWorkoutSession` activa; espera 700 ms tras arrancar el workout antes de pedir el sensor
    (MotionRecorder.swift:14,78-87,107-120). Buffer de 600 muestras = 3 s (MotionRecorder.swift:23).
27. Detector de golf-torneo-watch: `thresholdG` 4.0, `releaseG` 2.0 (histeresis), `refractory` 2.0 s,
    `preWindow` 0.6 s, `minPreActivityG` 0.25, `minProminenceG` 2.5, `maxPeakDuration` 0.15 s
    (SwingDetector.swift:22-35). El disparo es en el PICO, no en el cruce del umbral, y valida en
    orden: duracion, refractory, prominencia sobre linea base, actividad previa (SwingDetector.swift:84-96).
28. Analizador de golf-torneo-watch: impacto = pico de velocidad angular; top = minimo de velocidad
    angular en las ~400 muestras previas; inicio = primer punto < 0.5 rad/s hacia atras; grados =
    integral trapezoidal ignorando dt > 0.1 s; RECHAZA el swing si el downswing no llega a 80 grados/s
    o no recorre 12 grados (SwingAnalyzer.swift:25-27,37-92). Delta de muneca normalizado a +/-180 (30-35).
29. El endpoint del swing exige entry_id o caddie_id (route.ts:54-59) y lat/lon finitos; `caddie_id`
    tiene prioridad sobre `entry_id` al resolver contexto (saveWatchSwing.ts:44-57).
30. Si el actor no tiene torneo/ronda activa el swing se rechaza y NO se guarda nada, ni el evento
    crudo (saveWatchSwing.ts:58-60). No hay forma de registrar swings fuera de torneo.
31. Las 4 metricas base (back/forward dps y deg) son obligatorias juntas: si falta una,
    `parseWatchSwingMetrics` devuelve null y el renglon queda sin metricas; los deltas de muneca son
    opcionales (lib/distances/swingMetrics.ts:27-42).
32. Merge a yardas: hoyo = el detectado por poligono; si no hay, el hoyo mas cercano siempre que este
    a <= 550 yardas; luego se fuerza al hoyo estabilizado del grupo si el candidato no es ese ni el
    siguiente (mergeWatchSwingYardage.ts:220-246).
33. Idempotencia del merge: el golpe se inserta con id `watch-{watch_event_id}`; si ya existe se
    aborta (mergeWatchSwingYardage.ts:74-78). Si habia un golpe manual pendiente en el hoyo que no
    sea de reloj, el swing lo COMPLETA en vez de crear otro (mergeWatchSwingYardage.ts:100-127).
34. El bastón se elige solo con `pickBestClubAndCarry` sobre la bolsa habilitada; si no hay pick, no
    hay golpe (mergeWatchSwingYardage.ts:131-138). Bolsa buscada por `player:{id}` y si no por
    scope_key, con default si nada existe (mergeWatchSwingYardage.ts:176-205).
35. Tras el upsert en `yardage_shot_logs` (onConflict scope_key, payload_version 2) se actualiza el
    evento con `yardage_shot_id`, `yardage_merged_at` y el hoyo final
    (mergeWatchSwingYardage.ts:322-348).
36. La Mini App de yardas hace poll cada 12 s y muestra el toast `⌚ Watch · H{n} · {bastón}` con las
    metricas cortas (app/captura/distancias/DistanciasClient.tsx:578-601).
37. `/api/mobile/stats` promedia las 4 metricas del reloj por `player_id`, con tope de 5000 filas
    (app/api/mobile/stats/route.ts:195-221).

## Flujos
### 1. Vinculacion por codigo
1. Caddie/jugador manda `/codigo` (o CODE, APP) al bot — `app/api/telegram/webhook/route.ts:240`.
2. `buildMobileCodeReply` identifica sujeto, reusa o inserta fila en `mobile_auth_codes` y responde
   con el codigo espaciado — `lib/telegram/ritmo/mobileCode.ts:101-165`.
3. El usuario lo teclea (`mobile/app/index.tsx:62`) y `redeemCode` pega al endpoint
   — `mobile/lib/api.ts:16`, `app/api/mobile/auth/redeem/route.ts:47-94`.
4. La app guarda en SecureStore, espeja a AsyncStorage y empuja contexto al Watch
   — `mobile/app/index.tsx:91-96`.

### 2. GPS en background del telefono
1. `mobile/app/_layout.tsx:8` importa `locationTask` para que `defineTask` corra antes de navegar.
2. Al abrir Ritmo se re-sincroniza el espejo de sesion — `mobile/app/ritmo.tsx:67-70`.
3. Boton -> `startBackgroundTracking` pide permisos y arranca el foreground service
   — `mobile/lib/locationTask.ts:115-157`.
4. Cada wake del SO: throttle, lee credenciales `*.public`, `POST /api/captura/position`
   — `locationTask.ts:39-95`, `mobile/lib/api.ts:48`.
5. `saveCapturaPosition` resuelve contexto, filtra ruido y antisalto, inserta en `ritmo_positions`
   — `lib/captura/positionFromActor.ts:104-190`.

### 3. Swing del Apple Watch a yardas (mobile/watch, ruta con iPhone)
1. `RoundView` -> `RoundCoordinator.startRound` pide HealthKit, arranca workout, GPS y detector
   — `mobile/watch/ListGolfWatch/Services/RoundCoordinator.swift:29-75`.
2. `SwingDetector` confirma el swing y `SwingMotionAnalyzer` calcula metricas — `SwingDetector.swift:87-125`.
3. `PhoneRelay.sendSwing` transmite por WatchConnectivity — `PhoneRelay.swift:53-99`.
4. `WatchPhoneRelay` en el iPhone recibe y emite `onWatchEvent`
   — `mobile/modules/listgolf-watch-sync/ios/ListgolfWatchSyncModule.swift:117-137`.
5. `handleWatchEvent` agrega la sesion y hace `POST /api/captura/watch/swing` — `mobile/lib/watchSync.ts:69-103`.
6. `saveWatchSwing` inserta en `watch_swing_events` y llama al merge; el golpe aparece en la Mini App
   al siguiente poll — `saveWatchSwing.ts:38-126`, `DistanciasClient.tsx:600`.

En golf-torneo-watch el paso 3-5 se salta: el reloj hace el POST directo con
`WatchSwingUploader` (golf-torneo-watch/RoundRecorder.swift:84, WatchSwingUploader.swift:29-52).

## Invariantes y trampas
- **El espejo de sesion en AsyncStorage es obligatorio.** El fix `2495dbe` (2026-06-07) existe por
  esto: la app decia "GPS ACTIVO" y los pings se tiraban en silencio porque el task no encontraba
  credenciales. Todo cambio en login/logout debe llamar `syncSessionToBackgroundStorage`
  (mobile/app/ritmo.tsx:67, 108, 135).
- **`LOCATION_TASK_NAME` es un contrato** entre `defineTask` y `startLocationUpdatesAsync`; si cambia
  el string el SO despierta un task inexistente (mobile/lib/config.ts:24). Y `defineTask` solo puede
  vivir en el root layout: dentro de un componente expo-task-manager no lo encuentra al despertar
  (mobile/lib/locationTask.ts:7-11).
- **`requireNativeModule` truena si el modulo no esta enlazado** y se llama en el top level de
  `mobile/modules/listgolf-watch-sync/src/index.ts:39-41`, importado en cadena desde `_layout.tsx`.
  En iOS sin `expo prebuild` + pods (o en Expo Go) la app crashea al arrancar, no degrada.
  Lo correcto seria `requireOptionalNativeModule`.
- **Sin workout no hay sensores en watchOS.** `allowsBackgroundLocationUpdates` esta en false y la
  API de 800 Hz exige sesion activa: `HKWorkoutSession` tipo `.golf`/`.outdoor` es el truco que
  mantiene GPS y acelerometro vivos con la muneca baja y la app en background
  (WorkoutSessionManager.swift:22-48, MotionRecorder.swift:9,107-120). Quitar el workout o el
  entitlement de HealthKit apaga la deteccion de swing por completo. El commit `9dacc28` agrego las
  claves NSHealth*UsageDescription al Info.plist porque la app crasheaba al abrir sin ellas.
- **`isSupported` de CMBatchedSensorManager da falso negativo** en watchOS 26; el commit `9c6b898`
  quito el bloqueo del boton y ahora el error real llega del catch (MotionRecorder.swift:73-77).
- **Los umbrales del swing ya se recalibraron a la baja en campo.** `3253801` bajo thresholdG 6.0->4.0,
  releaseG 3.0->2.0, prominencia 4.0->2.5, pre-actividad 0.35->0.25, minForwardPeakDps 120->80 y
  minForwardDeg 20->12. Subirlos otra vez vuelve a perder wedges y putts. Los dos relojes tienen
  umbrales DISTINTOS y no comparables (3.2 g a 50 Hz vs 4.0 g a 800 Hz).
- **Un swing sin hoyo resoluble se guarda pero no llega a yardas:** queda con `yardage_merged_at`
  null y el endpoint regresa ok con `yardage: null` (saveWatchSwing.ts:114-126).
- **La cola offline del reloj standalone es solo memoria:** cerrar la app pierde los swings pendientes
  (WatchSwingUploader.swift:14,51). El camino via iPhone aguanta mas porque `transferUserInfo` lo
  encola el SO.
- **`mobile/` esta excluida del tsconfig raiz** (exclude: `["node_modules", "**/*.backup.tsx",
  "mobile"]`), asi que ningun error de tipos de la app movil rompe el build ni se ve en CI. Por eso
  nadie nota que el `new EventEmitter(Native)` de
  `mobile/modules/listgolf-watch-sync/src/index.ts:43` esta deprecado desde Expo SDK 52 (el modulo
  nativo ya ES un EventEmitter).

## Deuda y preguntas abiertas
- **Dos apps de reloj, una viva.** `mobile/watch/ListGolfWatch/` y `golf-torneo-watch/` entraron en el
  MISMO commit `f24a569` (2026-07-19). No son copias identicas: `mobile/watch` es companion
  (`club.listgolf.mobile.watch`, 50 Hz, relay por iPhone) y `golf-torneo-watch` es standalone
  (`club.listgolf.watch`, `WKWatchOnly`, 800 Hz, POST directo, sin PhoneRelay). Duplican detector,
  analizador, GPS y workout con umbrales distintos. `mobile/watch` no se toco nunca desde ese dia;
  `golf-torneo-watch` recibio 8 commits Swift hasta `6554347` (2026-07-29): esa es la linea viva.
- `golf-torneo-watch/ContentView.swift:14` tiene un `testEntryId` hardcodeado (UUID de una ronda de
  julio 2026) y dos commits (`295c38b`, `89f342a`) que solo lo actualizan. Esa app no tiene auth:
  nunca consume `/api/mobile/auth/redeem`, no es instalable para otro jugador.
- `golf-torneo-watch/SupabaseUploader.swift` es un archivo vacio marcado "OBSOLETO" que sigue en el
  target (project.pbxproj:129). El `.xcodeproj` esta versionado con `xcuserdata` y
  `UserInterfaceState.xcuserstate`: 7 de los 20 commits de la carpeta son solo ese binario, y el
  `DEVELOPMENT_TEAM` va relleno con la cuenta real (en `mobile/watch/project.yml:9` esta vacio).
- Sin `eas.json` ni carpetas `ios/`/`android/` versionadas no hay build reproducible: iOS + Watch
  exige `expo prebuild` + `expo run:ios` a mano (mobile/watch/README.md:123). ATENCION SIN VERIFICAR:
  el bot ya invita a descargar la app de Play Store (mobileCode.ts:164) pero no hay nada en el repo
  que confirme una publicacion en Play Store ni TestFlight.
- Madurez: la Expo tiene 3 commits (jun 2026, un roce en jul) con el GPS de fondo completo y un fix
  de produccion, sin build publicado — en pruebas. `mobile/watch` — abandonada el dia que nacio.
  `golf-torneo-watch` es la unica con iteracion de campo (umbrales, permisos, falso negativo) y se
  detiene el 2026-07-29 — en pruebas, parada desde hace un mes.
- `mobile_auth_codes` nunca se purga: la migracion dice que el codigo "se borra al consumir" pero el
  redeem solo escribe `consumed_at` (redeem/route.ts:77-80) y no hay cron de limpieza.
- Las columnas `wrist_delta_*` que escribe `saveWatchSwing.ts:83-85` no estan en ninguna migracion.
  Si alguien reconstruye la base desde `supabase/migrations`, todo POST de swing falla en el insert.
  Ademas nadie las lee: se escriben y se olvidan.
- `app/api/mobile/stats/*` NO es de la app nativa, es la Mini App de estadisticas del navegador. El
  unico endpoint que la app nativa usa bajo `/api/mobile` es `auth/redeem`.
- ATENCION SIN VERIFICAR: segun la doc de Expo `timeInterval` en `startLocationUpdatesAsync` es solo
  Android; si es cierto, en iPhone los despertares los decide el SO y el throttle de
  `locationTask.ts:66-70` es lo unico que limita los pings a 30 s.
- `.vercelignore` no excluye `mobile/` ni `golf-torneo-watch/`: van al deploy como peso muerto.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[distancias-gps]] · [[ritmo-juego]] · [[telegram]] · [[captura-scores]]

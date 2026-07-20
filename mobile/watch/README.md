# List.Golf — Apple Watch (watchOS)

App nativa **watchOS** para el módulo de yardas. Fase 1: GPS de alta precisión + detección heurística de swing en el reloj.

> Punto 2 (siguiente): enviar pings y golpes al backend `listgolf.club` vía iPhone o red del Watch.

## Qué incluye (fase 1)

| Componente | Archivo | Rol |
|------------|---------|-----|
| GPS alta precisión | `Services/LocationTracker.swift` | `CLLocationManager` con `kCLLocationAccuracyBestForNavigation`, filtro 3 m, descarta lecturas >25 m |
| Detección de swing | `Services/SwingDetector.swift` | `CMMotionManager` a 50 Hz; pico de aceleración + rotación; cooldown 4 s |
| Workout golf | `Services/WorkoutSessionManager.swift` | `HKWorkoutSession` tipo `.golf` outdoor — mantiene sensores activos en ronda |
| UI | `Views/RoundView.swift` | Iniciar/terminar ronda, conteo de golpes, estado GPS |

## Requisitos

- Mac con **Xcode 15+**
- Apple Watch (ideal: **Ultra**) emparejado
- Cuenta **Apple Developer** ($99/año) para instalar en dispositivo real
- Opcional: [XcodeGen](https://github.com/yonaskolb/XcodeGen) para generar el `.xcodeproj`

## Abrir en Xcode

### Opción A — con XcodeGen (recomendado)

```bash
cd mobile/watch
brew install xcodegen   # si no lo tienes
xcodegen generate
open ListGolfWatch.xcodeproj
```

1. En **Signing & Capabilities**, pon tu **Team** (Apple Developer).
2. Bundle ID: `club.listgolf.watch` (o el que uses en tu cuenta).
3. Selecciona el scheme **ListGolfWatch** y tu Apple Watch como destino.
4. **Run** (⌘R).

### Opción B — proyecto manual en Xcode

1. File → New → Project → **watchOS** → **App**
2. Nombre: `ListGolfWatch`, Interface: **SwiftUI**, Language: **Swift**
3. Borra los archivos plantilla y arrastra la carpeta `ListGolfWatch/` al proyecto.
4. Capabilities: **HealthKit**
5. Info.plist: las mismas claves que en `project.yml` (`NSLocationWhenInUseUsageDescription`, HealthKit).
6. Entitlements: copia `ListGolfWatch.entitlements`.

## Probar en campo

1. En el Watch: **Iniciar ronda** → pide permisos de ubicación y HealthKit.
2. Camina o juega un hoyo; el contador **Golpes** sube al detectar un swing (vibración corta).
3. Revisa coordenadas y precisión GPS en pantalla.
4. **Terminar ronda** guarda el workout de golf en Salud.

### Calibración de swings (v2 — CCQ / Watch Ultra)

Umbrales en `SwingDetectorConfig` (`SwingDetector.swift`):

| Parámetro | Valor v2 | Notas |
|-----------|----------|-------|
| `accelThresholdG` | 3.2 | Sube vs v1; filtra caminar |
| `rotationThresholdRadS` | 5.0 | Swing full tiene rotación alta |
| `cooldownSeconds` | 5.0 | Evita doble conteo follow-through |
| `confirmSamples` | 3 | ~60 ms de pico sostenido a 50 Hz |

Si **no detecta** driver/wedge: bajar `accelThresholdG` a 2.8.  
Si **falsos positivos** al caminar: subir a 3.5–3.8 o `rotationThresholdRadS` a 5.5.  
Putts cortos pueden no disparar — marcar en el mapa del teléfono o bajar a 2.2 solo en green (futuro).

### Métricas por golpe (nuevo)

Además del conteo, cada swing registra:

| Métrica | Significado |
|---------|-------------|
| Back °/s | Velocidad angular pico en backswing |
| Fwd °/s | Velocidad angular pico en bajada/impacto |
| Back ° | Ángulo muñeca/bastón en el tope vs address |
| Fwd ° | Ángulo del tope al impacto |

> Estimado desde la **muñeca** (Watch en la muñeca lead), no sensor en el bastón. Sirve para comparar swings entre sí; no es TrackMan.

Se ven en el Watch, en el toast de yardas y en el detalle de golpes del hoyo.

## Estructura

```
mobile/watch/
├── project.yml              # XcodeGen
├── README.md
└── ListGolfWatch/
    ├── ListGolfWatchApp.swift
    ├── ListGolfWatch.entitlements
    ├── Models/
    │   └── GolfSessionState.swift
    ├── Services/
    │   ├── LocationTracker.swift
    │   ├── SwingDetector.swift
    │   ├── WorkoutSessionManager.swift
    │   └── RoundCoordinator.swift
    └── Views/
        ├── ContentView.swift
        └── RoundView.swift
```

## Integración con backend (fase 2) ✅

El Watch **no llama la API directo**. Flujo:

```
Apple Watch  ──WatchConnectivity──►  iPhone (Expo)  ──HTTPS──►  listgolf.club
```

| Evento Watch | Endpoint iPhone |
|--------------|-----------------|
| GPS cada ~30 s / 8 m | `POST /api/captura/position` |
| Swing detectado | `POST /api/captura/watch/swing` |

### Requisitos

1. **iPhone**: app `mobile/` con sesión activa (código del bot `/codigo`)
2. **Watch**: misma pareja; bundle `club.listgolf.mobile.watch` (companion de `club.listgolf.mobile`)
3. En el iPhone: `npx expo prebuild` + `npx expo run:ios` (el módulo `listgolf-watch-sync` se enlaza solo)
4. Migración Supabase: `20260713120000_watch_swing_events.sql`

### Probar

1. Login en iPhone → pantalla Ritmo muestra estado del Watch
2. En el Watch → **Iniciar ronda**
3. Camina / haz swings → pings en `ritmo_positions` y filas en `watch_swing_events`
4. Abre mini-app yardas en el teléfono → toast `⌚ Watch · H{n} · {bastón}` cada ~12 s

## Fase 3 — merge con yardas ✅

Al registrar un swing (`POST /api/captura/watch/swing`):

1. Detecta **hoyo activo** (GPS + ritmo del grupo)
2. Carga **bolsa del jugador** desde `yardage_player_bags`
3. Sugiere **bastón** con `pickBestClubAndCarry`
4. Inserta golpe en `yardage_shot_logs` (`source: watch`, id `watch-{uuid}`)
5. La mini-app hace **poll cada 12 s** y muestra el golpe en el mapa

Si había un golpe manual pendiente en el hoyo, el swing del Watch lo **completa** automáticamente.

### Código clave

- Watch: `Services/PhoneRelay.swift`
- iPhone nativo: `modules/listgolf-watch-sync/ios/`
- JS bridge: `mobile/lib/watchSync.ts`

## Integración futura (fase 3)

- Emparejar golpe detectado con hoyo activo y bolsa del jugador en la mini-app de yardas
- Calibración de umbrales de swing en campo

## Estado

- **Fase 1**: GPS + swing local en Watch ✅
- **Fase 2**: auth + sync Watch → iPhone → API ✅
- **Fase 3**: merge con yardas (hoyo activo + auto-bastón + yardage_shot_logs) ✅

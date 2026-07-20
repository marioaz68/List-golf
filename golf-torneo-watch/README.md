# Golf Torneo – App de Apple Watch (starter, Fase 1)

Proyecto inicial para capturar tiros automáticamente con el **Apple Watch Ultra 3**
usando movimiento de alta frecuencia (800 Hz) + GPS, y subirlos a la tabla
`yardage_shot_logs` del sistema **golf-torneo** en Supabase.

> Este es el **esqueleto funcional** que valida todo el flujo (detección → GPS →
> payload → subida). La detección de swing es por **umbral simple**; el modelo de
> Machine Learning llega en la Fase 2 (ver el documento de arquitectura).

## Requisitos

- **Mac con Xcode 15 o superior** (ya lo tienes).
- **Apple Watch Series 8, Ultra o posterior** (la API de 800 Hz no existe en modelos previos ni en el SE).
- **Cuenta Apple Developer (US$99/año)** para instalar la app en tu reloj físico.
  Para probar en el **simulador** no hace falta, pero el simulador **no** entrega
  datos reales de sensores ni GPS de campo — la prueba de verdad es en el reloj.

## Archivos

> **Arquitectura (importante):** el backend del reloj **ya existe** en listgolf.club.
> El reloj NO escribe a Supabase ni calcula hoyos: solo detecta el swing, mide
> velocidad y grados de back/forward, y **envía el evento** a
> `POST /api/captura/watch/swing`. El backend detecta el hoyo por GPS, guarda en
> `watch_swing_events` y hace el merge a yardas automáticamente.

| Archivo | Qué hace |
|---|---|
| `GolfTorneoWatchApp.swift` | Punto de entrada de la app. |
| `ContentView.swift` | UI: iniciar/detener, ver swings y métricas del último. |
| `RoundRecorder.swift` | Orquesta movimiento + GPS + detector; envía cada swing. |
| `MotionRecorder.swift` | Movimiento de alta frecuencia (CMBatchedSensorManager + HKWorkoutSession). |
| `LocationManager.swift` | GPS del reloj. |
| `SwingDetector.swift` | Detector de impacto por umbral (placeholder del futuro modelo ML). |
| `SwingAnalyzer.swift` | Calcula velocidad (°/s) y grados de back/forward por swing. |
| `WatchSwingUploader.swift` | Envía cada swing a `/api/captura/watch/swing` (con cola offline). |
| `Models.swift` | Estructuras (WatchSwingEvent, SwingMetrics) + utilidades. |
| `SupabaseUploader.swift` | Obsoleto (puedes borrarlo). |

## Cómo crear el proyecto en Xcode

1. Abre Xcode → **File ▸ New ▸ Project**.
2. Pestaña **watchOS** → **App** → siguiente.
3. Product Name: `GolfTorneoWatch`. Interface: **SwiftUI**. Language: **Swift**.
   (Puedes marcar "Watch App" sin app de iOS por ahora, o con companion si prefieres.)
4. Cuando se cree el proyecto, **borra** el `ContentView.swift` y el `...App.swift`
   que Xcode generó, y **arrastra a la carpeta del target** los archivos `.swift`
   de esta carpeta.
5. Añade los permisos (paso siguiente) y ya puedes compilar.

## Permisos (Info.plist / Signing & Capabilities)

En el target del Watch App agrega estas claves y capacidades:

- **NSMotionUsageDescription** → "Usamos el movimiento del reloj para detectar tus tiros."
- **NSLocationWhenInUseUsageDescription** → "Usamos tu ubicación para medir las distancias de tus tiros."
- **Signing & Capabilities ▸ + Capability ▸ HealthKit** (obligatorio: la API de
  alta frecuencia solo funciona con una sesión de workout activa).
- En **Background Modes** del Watch App, activa **Workout processing**.

## Identidad del jugador (entry_id)

El endpoint identifica al jugador por `entry_id` (o `caddie_id`), que se obtiene
al vincular la cuenta con el bot (`/api/mobile/auth/redeem`). Para **pruebas**,
pega un `entry_id` real en `testEntryId` dentro de `ContentView.swift`. Más
adelante se guarda de forma segura (SecureStore / Keychain) tras el redeem.

La URL base en `WatchSwingUploader.swift` ya apunta a `https://www.listgolf.club`.

## Cómo probar

1. Compila y ejecuta en tu **Apple Watch físico** (el simulador no da sensores/GPS reales).
2. Pega un `entry_id` de prueba en `ContentView.swift`.
3. Pulsa **Iniciar ronda** y pega unos tiros.
4. Cada swing detectado se mide y se **envía** a `/api/captura/watch/swing`;
   el backend detecta el hoyo y lo une a las yardas.
5. Revisa en la Mini App (`/estadisticas`) o en la BD (`watch_swing_events`) que lleguen.

## Calibración del detector (importante)

El umbral inicial es `thresholdG = 6.0` en `SwingDetector.swift`. Es casi seguro que
tengas que ajustarlo con datos reales. Recomendación:

1. Graba 2-3 rondas apuntando cuántos golpes diste de verdad por hoyo.
2. Compara con los tiros detectados y sube/baja el umbral y el `refractory`.
3. Cuando tengas suficientes rondas etiquetadas, ese dataset alimenta el
   **modelo Core ML** que reemplazará el umbral (Fase 2).

## Datos que se capturan y cómo llegan a listgolf.club

Todo se sube al **mismo Supabase** (`golf-torneo`) que alimenta listgolf.club, así
que no hay un sistema aparte. Resumen de lo que pediste:

| Dato | De dónde sale | Dónde se guarda | Fiabilidad |
|---|---|---|---|
| Distancias por tiro | GPS (from→to) | `yardage_shot_logs.payload` (actualYards) | Alta (±3–5 m) |
| Golpes / score | Conteo de tiros por hoyo | `hole_scores` / `round_scores` | Alta |
| Distancias por palo | Histórico de tiros por palo | `yardage_player_bags.payload` | Media (depende de inferir el palo) |
| Posición / ritmo | GPS en vivo | `ritmo_positions` | Alta |
| Swing: tempo, tiempos, velocidad °/s | Giroscopio 200 Hz | `yardage_shot_logs` → `shot.swingMetrics` | Media-alta |
| Swing: plano (grados), velocidad lineal | Actitud + giroscopio | `shot.swingMetrics` | Estimación |

### Sobre las métricas de swing (importante)

Desde la muñeca se mide con buena fiabilidad el **tempo** (relación backswing/downswing),
la **duración** de cada fase y la **velocidad angular pico** en °/s. El **plano de swing**
en grados y la **velocidad lineal** de la muñeca son ESTIMACIONES. Esto **no** es
velocidad de cabeza de palo real (para eso se necesita un launch monitor), pero sí
sirve para que cada jugador compare y siga su progreso.

### Estadística personal del jugador (vista en listgolf.club)

Como cada tiro ya trae `swingMetrics` dentro del payload, listgolf.club puede mostrar
por jugador: distancia media por palo, tempo promedio, velocidad de bajada, y la
evolución ronda a ronda. Recomendación: crear en Supabase una **vista** que aplane
`yardage_shot_logs.payload` a filas (un renglón por tiro) para consultarla fácil desde
el frontend, en lugar de leer el JSON crudo cada vez.

## Próximos pasos (del documento de arquitectura)

- **Fase 2:** modelo ML de detección de swing (reemplaza el umbral).
- Inferencia del **palo** por distancia/orden (o confirmación en pantalla).
- Atribución de tiro→hoyo con `course_holes.boundary_geojson` en el backend.
- Detección de **green** para putts y cambio de hoyo automático por GPS.

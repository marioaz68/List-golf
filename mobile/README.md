# List.Golf — App nativa Android (Expo)

App móvil que mantiene el GPS del caddie/jugador mandando posición al ritmo del campo **incluso con la pantalla bloqueada o con otra app al frente**. Resuelve la limitación de la Mini App (web) y de Telegram Live Location (8 h con tocadas iniciales).

## Cómo se integra con el sistema

- **Mismo backend**: pega contra `https://www.listgolf.club/api/captura/position` igual que el chip GPS de la Mini App.
- **Misma base de datos**: los pings se guardan en `ritmo_positions` y aparecen en el dashboard `/ritmo` junto a los pings de Telegram y de la Mini App.
- **Login**: el caddie/jugador escribe `/codigo` al bot `@ListGolfBot`, recibe un código de 6 dígitos, lo mete en la app y queda autenticado.

## Estructura

```
mobile/
├── app/
│   ├── _layout.tsx         # Root con import del task de background
│   ├── index.tsx           # Login (código del bot)
│   └── ritmo.tsx           # Pantalla principal: botón activar/apagar GPS
├── lib/
│   ├── api.ts              # Cliente HTTP del backend
│   ├── auth.ts             # SecureStore del session
│   ├── config.ts           # API_BASE_URL, intervalos
│   └── locationTask.ts     # Task de background + foreground service
├── app.json                # Permisos Android + iOS, plugin expo-location
├── package.json
└── tsconfig.json
```

## Setup local (primera vez)

```bash
cd mobile
npm install          # instala Expo + dependencias

# Para probar en tu Android conectado por USB con depuración habilitada:
npx expo run:android
```

Para probar SOLO el UI sin background (más rápido):

```bash
npx expo start --tunnel
# escanea el QR con la app Expo Go en tu Android
```

> ⚠️ Expo Go **no soporta background location**. Para probar el tracking en background necesitas un dev build (`expo run:android`).

## Variables de entorno

Si quieres apuntar a un backend de staging en vez de producción, crea `mobile/.env.local`:

```
EXPO_PUBLIC_API_BASE_URL=https://staging.listgolf.club
```

## Publicar en Google Play (interno)

1. Pagar **$25 USD una sola vez** en https://play.google.com/console/developers
2. Configurar EAS Build:
   ```bash
   npm install -g eas-cli
   eas login
   eas build:configure
   ```
3. Generar AAB firmado:
   ```bash
   eas build --platform android --profile production
   ```
4. Subir el AAB al Play Console en "Pruebas internas" → invitar testers por email.
5. Cuando el sistema esté estable, promover a "Producción".

## Backend que requiere esta app (ya creado en este commit)

- `app/api/mobile/auth/redeem/route.ts` — valida códigos generados por el bot
- `lib/telegram/ritmo/mobileCode.ts` — comando `/codigo` en el bot
- `supabase/migrations/20260605120000_mobile_auth_codes.sql` — tabla de códigos

## Estado del proyecto

- **Fase 1 (este commit)**: scaffolding + login + GPS background ✅
- **Fase 2**: build AAB y prueba con 2-3 caddies
- **Fase 3**: agregar captura de scores en la app (opcional)
- **Fase 4** (futuro): iOS con cuenta de Apple Developer ($99/año)

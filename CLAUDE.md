# List Golf — sistema de torneos de golf (CCQ)

Plataforma de gestión de torneos del Club Campestre de Querétaro: inscripciones, salidas,
captura de scores en el campo, match play, handicap WHS, ritmo de juego, GPS/distancias,
restaurante y notificaciones por Telegram.

**Next 16 (App Router) · React 19 · Supabase (Postgres + Auth + RLS + Realtime) · Tailwind 4 · Vercel**
~226,000 líneas TS/TSX · ~90 tablas · 82 API routes · repo `marioaz68/List-golf` · ramas `main` y `staging`.
UI en español. Se usa **en el campo, en celular, con señal mala**: eso manda sobre cualquier decisión técnica.

---

## ⚠️ Antes de escribir código: lee el doc del módulo

`docs/` existe para que **no** tengas que leer archivos de 4,000 líneas. Abre el doc del
módulo que vas a tocar, y solo ese. Cada regla trae su referencia `archivo:línea`.
Índice completo + índice inverso por síntoma: **`docs/mapa-de-modulos.md`**.

| Vas a tocar | Lee |
|---|---|
| Estructura, convenciones, deploy, i18n, permisos | `docs/arquitectura.md` |
| Tablas, RLS, roles, tokens de acceso sin sesión | `docs/datos-y-seguridad.md` |
| Torneos, categorías, campos, tees, jugadores, inscripciones, caddies | `docs/torneos-setup.md` |
| Tee sheet, grupos, salidas, shotgun, avance de ronda | `docs/tee-sheet-salidas.md` |
| Captura de golpes, tarjetas, testigos, firmas, bloqueos | `docs/captura-scores.md` |
| Cuadros, matches, ventajas MP, consolaciones, Ryder | `docs/matchplay.md` |
| Subasta, rifa, proyección | `docs/calcuta-subasta.md` |
| Handicap WHS, GHIN, comité y sus votaciones | `docs/handicap-whs.md` |
| Leaderboard, cortes, desempates, premios, cercanos | `docs/resultados-cortes-premios.md` |
| GPS, calibración, yardajes, banderas, tiros | `docs/distancias-gps.md` |
| Ritmo de juego, marshals, mapa en vivo | `docs/ritmo-juego.md` |
| Telegram, cola de envíos, vinculación de chats | `docs/telegram.md` |
| Restaurante, pedidos, mesas QR, inventario, Stripe | `docs/fb-restaurante.md` |
| App Expo, Apple Watch, detección de swing | `docs/mobile-watch.md` |

**Si el doc está desactualizado, corrígelo en el mismo turno en que lo descubras.**
Un doc que miente es peor que no tener doc, porque se le cree.
Lo marcado `⚠️ SIN VERIFICAR` (32 marcas) es sospecha, no hecho.

Riesgos y pendientes conocidos, priorizados: **`../cerebro/pendientes.md`**. Revísalo antes
de proponer un cambio grande: es probable que el problema ya esté catalogado.

---

## Comandos

```bash
npm run dev                    # localhost:3000
npm run build                  # verifica que compila antes de desplegar
npx tsc --noEmit               # strict está activado
npm run lint
npm run deploy:vercel:prod     # main → producción
```

Scripts de mantenimiento: `npx tsx scripts/<script>.ts`. Catalogados en `docs/arquitectura.md`.
`scripts/` y `*.backup.tsx` no se despliegan (`.vercelignore`).

> **No uses `deploy:vercel:both` ni despliegues `staging`.** La rama `staging` está
> **227 commits detrás de `main`** y tiene 9 commits propios (último: 17-ago). Ese script
> además despliega producción *antes* de validar staging. Ver `../cerebro/pendientes.md` #9.

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `app/(backoffice)/` | Panel del comité y staff. ~76 páginas. El grupo más grande y más caliente. |
| `app/captura/` | PWA de campo (jugadores y caddies): score, distancias, menú, marshal. **Pública por diseño.** |
| `app/torneos/[id]/` | Vistas públicas: resultados, cuadro en vivo, matches en vivo, Ryder, cercanos. |
| `app/api/` | 82 endpoints. Mucha lógica en vivo pasa por aquí. |
| `app/mesa/`, `app/restaurante/`, `app/mini/` | F&B con QR de mesa y mini app de Telegram. |
| `app/sign/scorecard/[token]/` | Firma de tarjeta sin sesión, por token. |
| `lib/` | 41 módulos de dominio, 65k líneas. |
| `proxy.ts` | El middleware de Next 16 (así se llama aquí, no `middleware.ts`). |
| `utils/supabase/` | Los 3 clientes reales: `server.ts`, `client.ts`, `admin.ts`. |
| `supabase/migrations/` | 101 migraciones — **solo mayo–agosto 2026**. |
| `mobile/`, `golf-torneo-watch/` | Apps nativas. Subproyectos aparte, fuera del tsconfig. |

## Convenciones obligatorias

1. **Imports con alias:** `@/lib/...`, `@/components/...`. Nunca rutas relativas largas.
2. **Mutaciones por Server Actions** en archivos `actions.ts` con `'use server'`. Es el patrón
   dominante; no crees API routes para lo que ya se hace con actions.
3. **Clientes de Supabase:** `utils/supabase/server.ts` (sesión), `client.ts` (browser),
   `admin.ts` (service role, **salta RLS**). `lib/supabaseClient.ts` es un singleton anon
   legado con 6 usos: no lo extiendas.
4. **Todo es `force-dynamic`** (171 archivos) y no se usa `unstable_cache`, `revalidateTag` ni
   `use cache` en ningún lado. Es deliberado: los datos son en vivo. No introduzcas caché sin decidirlo antes.
5. **Textos de UI vía `lib/i18n/messages.ts`.** `es` es la fuente de verdad y está tipada
   (`type Messages = typeof es`): una clave nueva **rompe el build** hasta traducirla en `en`.
6. **`strict: true`.** Sin `any` ni `@ts-ignore` para salir del paso.
7. **En zsh cita los patrones de grep:** `grep -rn "x" app lib --include='*.ts'`. Sin comillas falla.
8. **Archivos gigantes: léelos por tramos** (`sed -n '1,250p'`), nunca completos.
   `app/captura/distancias/DistanciasClient.tsx` 4,184 · `lib/i18n/messages.ts` 3,456 ·
   `app/(backoffice)/score-entry/mobile/page.tsx` 2,820 · `app/(backoffice)/entries/actions.ts` 2,355 ·
   `app/(backoffice)/ritmo/RitmoLiveView.tsx` 2,269 · `app/torneos/[id]/page.tsx` 2,244.

## Permisos: cómo funciona de verdad

- La autorización vive en **código de aplicación, no en RLS**: 175 archivos usan service role.
- `lib/auth/permissions.ts` es la fuente de verdad: 15 roles (`AppRole`), 20 módulos
  (`AppModule`) y la matriz `MODULE_ACCESS`.
- **Dos barreras al backoffice:** `proxy.ts` y `app/(backoffice)/layout.tsx`. Una ruta nueva
  **no queda protegida** hasta agregarla a `BACKOFFICE_PATH_PREFIXES` (`permissions.ts:255`)
  y a `getModuleFromPath` (`:333`).
- **Agregar un item al sidebar toca 4 lugares:** `messages.ts` (`es` y `en`),
  `lib/auth/navModules.ts`, `components/layout/Sidebar.tsx`, `lib/auth/permissions.ts`.
- **64 de las 82 API routes no verifican sesión ni secreto** y usan service role. Si agregas
  una ruta, no heredas ninguna protección: decide y escribe la verificación explícitamente.

## Base de datos

- **El esquema núcleo NO está en migraciones.** `tournaments`, `players`, `tournament_entries`,
  `rounds`, `hole_scores`, `pairing_groups`, `scorecards`, `roles`, `user_*_roles`, `profiles`,
  `ritmo_positions` y ~35 más se crearon directo en Supabase. **Nunca supongas su forma:**
  verifícala con el MCP de Supabase de la sesión.
- Cambios nuevos **sí** van como migración en `supabase/migrations/` con timestamp.
- **`rounds` tiene una fila por categoría.** Usar el `round_id` equivocado captura y cierra en
  la categoría ajena: es el origen de 5 scripts de reparación. Ver `docs/captura-scores.md`.
- **PostgREST corta en 1,000 filas.** `hole_scores` y `round_scores` se paginan en chunks de
  150 ids; si no, las semifinales quedan sin marcador en vivo.

## Trampas de Next que ya costaron caro

- **Nunca `redirect()` dentro de un `try/catch` genérico:** lanza `NEXT_REDIRECT`, se traga el
  guardado y el usuario ve "Error al guardar: NEXT_REDIRECT". Patrón correcto en
  `app/(backoffice)/layout.tsx:11-16`.
- **`revalidatePath()` dentro de una action rompe `useActionState`** y deja `isPending` colgado.
- **Límite de Server Actions: 8 MB** (`next.config.ts`). Importa en cargas de Excel y fotos.
- **Cron activo:** `/api/ritmo/check-reminders` cada 5 min (`vercel.json`), con `CRON_SECRET`.

## Protocolo de sesión

**Al empezar:** `head -60 ../cerebro/bitacora.md` para saber en qué se quedó el trabajo.

**Al terminar** trabajo sustantivo: entrada nueva **al inicio** de `../cerebro/bitacora.md`
(formato en `../cerebro/plantillas/sesion.md`). Si se decidió algo que cambia el rumbo, nota en
`../cerebro/decisiones/`. Si cambió una regla, actualiza el doc del módulo.

## Prohibido

- Escribir valores de `.env.local` / `.env.prod` en docs, commits, logs o respuestas. Nombres sí, valores nunca.
- Leer `node_modules/`, `.next/`, `.vercel/`.
- Abrir `.xlsx`, `.xlsm`, `.docx`, `.pdf` con `cat`. Usa las skills `xlsx` / `docx` / `pdf`.
- Commitear, desplegar o correr scripts de reparación sin que el usuario lo pida.

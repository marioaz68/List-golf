---
titulo: Arquitectura y convenciones
modulo: arquitectura
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Arquitectura y convenciones

## Que resuelve
Un torneo del CCQ ocurre en tres lugares a la vez: el comite en la oficina moviendo inscritos y salidas, el jugador y el caddie en el hoyo 7 anotando con el celular, y el socio en su casa viendo la clasificacion. El repo separa esos tres mundos en grupos de rutas con reglas de acceso distintas: `(backoffice)` exige sesion y rol, `captura` funciona con un link sin login porque en el campo nadie se va a autenticar, y `torneos` es publico. Este doc es el mapa de esa separacion y el manual de estilo obligatorio para no romperla.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| proxy.ts | Middleware de Next 16 (antes middleware.ts): gate de sesion y rol por path, inyecta header `x-pathname` | 106 |
| lib/auth/permissions.ts | Fuente de verdad de roles, modulos, prefijos del backoffice y path→modulo | 411 |
| app/(backoffice)/layout.tsx | Segunda barrera: `getUser` + `getUserRoles`, blindado contra errores; monta sidebar y locale | 68 |
| components/layout/Sidebar.tsx | Menu lateral, modo Operacion/Config, arrastra `tournament_id` en todos los links | 776 |
| lib/i18n/messages.ts | Diccionario ES + EN completo. `es` es la fuente de verdad del tipo | 3456 |
| utils/supabase/server.ts | Cliente SSR con cookies (anon key, respeta RLS) + `createAdminClient` duplicado | 43 |
| utils/supabase/admin.ts | Cliente service role (`createAdminClient` / `tryCreateAdminClient`). Salta RLS | 30 |
| utils/supabase/client.ts | Cliente de navegador (`createBrowserClient`) | 9 |
| lib/auth/requireTournamentAccess.ts | Gate por torneo dentro de server actions (`check*` no redirige, `require*` si) | 146 |
| lib/auth/getUserRoles.ts | Une roles globales + de club + de torneo en un solo `string[]` | 89 |
| lib/auth/navModules.ts | Mapa item-de-menu → modulo de permiso. `NavKey` se deriva de messages.ts | 57 |
| components/layout/BackofficeLayoutClient.tsx | Chrome del backoffice y sus 3 modos especiales (proyeccion, captura movil, ritmo) | 133 |
| app/layout.tsx | Root layout: `lang="es"`, fondo `#08111f`, fuentes Geist, header condicional | 51 |
| components/layout/ConditionalAppHeader.tsx | Oculta el header publico en backoffice/login/auth/torneos/sign/captura | 21 |
| app/globals.css | Tailwind 4 CSS-first, clases `.btn3d*`, reglas de impresion, fix z-index de Leaflet | 290 |
| lib/i18n/locale.ts | Cookie `listgolf_locale`, `parseLocale`, lectura desde `document.cookie` | 21 |
| components/i18n/AppLocaleProvider.tsx | Contexto `useAppLocale()` → `{ locale, t }` para client components | 44 |
| app/login/actions.ts | Login por email o username y landing por rol | 175 |
| lib/ui/backofficeTableSticky.ts | Estilos compartidos de tablas con `thead` sticky del backoffice | 63 |
| app/error.tsx, app/(backoffice)/error.tsx | Los unicos error boundaries reales (mas entries y torneos/[id]) | 95 / 60 |
| next.config.ts | `serverActions.bodySizeLimit: 8mb` e `images.remotePatterns` de Dropbox | 23 |
| vercel.json | Un solo cron: `/api/ritmo/check-reminders` cada 5 min | 8 |
| scripts/deploy-staging-and-main.sh | Deploy manual: main a prod, luego staging a preview | 27 |
| lib/supabaseClient.ts | Singleton anon LEGADO, solo 6 archivos (Sidebar entre ellos) | 8 |
| lib/supabase/queryInChunks.ts | Parte `.in()` en lotes para no reventar el largo de URL de PostgREST | 23 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| profiles | Usuario de la app; `email`, `username` (login alterno), `telegram` | parcial: 20260603120000_profiles_username_login.sql (columna username) |
| roles | Catalogo de roles con `code`. Los `code` deben coincidir con `AppRole` | no (creada en Supabase); filas nuevas si: 20260605220000_role_restaurante.sql, 20260601190000_marshal_role_and_telegram.sql, 20260701120000_flag_keeper_and_flag_positions.sql |
| user_global_roles | Rol sin scope (super_admin, etc). Filtra `is_active = true` | no (creada en Supabase) |
| user_club_roles | Rol con scope de club (club_admin, marshal, F&B) | no (creada en Supabase) |
| user_tournament_roles | Rol con scope de torneo. Filtra `is_active = true` | no (creada en Supabase) |
| tournaments | El Sidebar la lee con el cliente anon para pintar el torneo activo | no (creada en Supabase) |
| tournament_matchplay_rules | El Sidebar la consulta para decidir si muestra el item Subasta | 20260522120000_matchplay.sql |

El esquema nucleo (tournaments, players, tournament_entries, rounds, hole_scores, pairing_groups, scorecards, courses, categories, y las tablas de roles) NO esta en `supabase/migrations/`: se creo directo en Supabase. Las 101 migraciones cubren mayo-agosto 2026 y son casi todas de modulos nuevos (matchplay, F&B, GHIN, banderas, yardas, cercanos).

## Reglas de negocio
Aqui son las reglas de ingenieria del repo. Son obligatorias.

1. **La autorizacion vive en codigo de app, no en RLS.** 175 archivos importan `utils/supabase/admin` (service role) contra 118 que usan el cliente SSR. Si escribes una query nueva con `createAdminClient`, tu eres el unico control de acceso. `utils/supabase/admin.ts:15`
2. **Dos barreras de acceso al backoffice, ambas necesarias.** `proxy.ts:13` valida sesion y modulo por path; `app/(backoffice)/layout.tsx:32-56` revalida `getUser()` y `canAccessAnyBackofficeModule`. Quitar una deja la otra como unico gate: no lo hagas.
3. **Una ruta nueva del backoffice no queda protegida hasta agregarla a `BACKOFFICE_PATH_PREFIXES`** (`lib/auth/permissions.ts:255`) **y a `getModuleFromPath`** (`:333`). Si falta en la primera, `proxy.ts:22` la trata como publica y ni pide login.
4. **Agregar un item al sidebar toca 4 lugares** y TypeScript solo obliga dos: clave nueva en `sidebar.nav` de `es` y de `en` (`lib/i18n/messages.ts`), entrada en `NAV_ITEM_MODULE` (`lib/auth/navModules.ts:7`, cuyo `NavKey` se deriva de messages), item en el array de `components/layout/Sidebar.tsx:176`, y prefijo + modulo en permissions.
5. **Agregar un rol toca 3 lugares:** fila en la tabla `roles` (patron: `INSERT ... ON CONFLICT (code) DO UPDATE`, ver `supabase/migrations/20260701120000_flag_keeper_and_flag_positions.sql:12`), union `AppRole` (`lib/auth/permissions.ts:1`), y la lista literal de `normalizeRole` (`:309`). Falta la tercera y el rol se propaga como string crudo sin fallar (`lib/auth/getUserRoles.ts:34-39`), asi que el bug es silencioso.
6. **Los roles se acumulan de tres tablas** (`user_global_roles`, `user_club_roles`, `user_tournament_roles`) en un `Set` plano sin scope (`lib/auth/getUserRoles.ts:41-89`). `canAccessModule` no distingue si el rol venia de otro club u otro torneo: para eso existe `checkTournamentAccess` (`lib/auth/requireTournamentAccess.ts:28`), que si valida `club_id`/`tournament_id`.
7. **`handicap_committee` puro es un usuario de tunel.** Si su unico rol es ese (`lib/auth/isCommitteeOnlyUser.ts:6`), `proxy.ts:82-88` lo reenvia a `/comite-handicap` desde cualquier otra ruta.
8. **`page.tsx` es Server Component** (99 de 109 lo son). La interactividad va en un `XxxClient.tsx` colocado en la misma carpeta y marcado `"use client"` (40 archivos con ese sufijo). No conviertas una page a client para "arreglar" un hook.
9. **`params` y `searchParams` son Promises** y hay que await: `app/captura/grupo/page.tsx:20`, `app/mesa/[tableCode]/page.tsx:19`. Es Next 16.
10. **Todo es dinamico a proposito.** 171 archivos declaran `export const dynamic = "force-dynamic"` casi siempre con `export const revalidate = 0` al lado (`app/(backoffice)/tee-sheet/page.tsx:58-59`). No se usa `unstable_cache`, `revalidateTag`, `use cache` ni `cache()` de React en ningun archivo. Un torneo en vivo no tolera datos cacheados.
11. **Las server actions viven en `actions.ts` junto a la pagina**, con `"use server"` en la linea 1 (55 archivos). Nombres en camelCase ingles con verbo: `addEntry`, `closeTournamentRegistration`. El sufijo `Action` es inconsistente y no significa nada (`deletePlayerAction` vs `deleteEntry`).
12. **Dos contratos de error, elige segun quien llama.** Formularios clasicos: `throw new Error("mensaje en espanol")` y lo atrapa el error boundary (`app/(backoffice)/rounds/actions.ts:11`). Acciones consumidas con `useActionState` (17 archivos): devolver `{ ok: false, message }` en TODOS los caminos, nunca lanzar.
13. **Nunca metas `redirect()` dentro de un `try`/`catch` generico.** `redirect` lanza una excepcion con `digest` `NEXT_REDIRECT`; si la atrapas, el guardado se pierde. El patron correcto es re-lanzarla: `app/(backoffice)/layout.tsx:11-16` y `:36`. Origen del problema: commit `36eb491`.
14. **`revalidatePath` despues de mutar, salvo con `useActionState`.** 384 llamadas en 46 archivos (`app/(backoffice)/matchplay/actions.ts` tiene 71). Pero en una action leida por `useActionState` aborta el vuelo del hook y deja `pending` en true para siempre; commit `fc703a9` lo quito del reset del comite.
15. **Validacion de `FormData` a mano con helpers locales.** `reqStr`/`optStr`/`reqInt`/`optInt` estan copiados en 26 archivos (`app/(backoffice)/rounds/actions.ts:9-37`). No hay Zod. Si agregas un campo, agrega su validacion; nada lo hace por ti.
16. **Cuatro clientes de Supabase, uno por contexto.** Server Component / action con sesion: `utils/supabase/server.ts:9`. Operacion privilegiada en servidor: `utils/supabase/admin.ts:3` (o `tryCreateAdminClient:24` en paginas publicas, que devuelve null en vez de tumbar la pagina). Navegador: `utils/supabase/client.ts:5`. `lib/supabaseClient.ts` es un singleton anon legado; solo 6 archivos.
17. **El service role solo se permite en servidor:** API routes, server actions, Server Components y `scripts/`. Nunca en un archivo con `"use client"` ni en `lib/` importado por cliente, porque `SUPABASE_SERVICE_ROLE_KEY` acabaria en el bundle.
18. **API routes devuelven siempre `NextResponse.json({ ok, ... })`** con `{ ok: false, error: "<espanol>" }` y status explicito en el fallo (`app/api/captura/score/route.ts:22-26`). 77 de 82 routes siguen esa forma.
19. **`tournament_id` es el estado global del backoffice y viaja por querystring.** El Sidebar lo re-inyecta en cada href (`components/layout/Sidebar.tsx:432-456`) porque al salir a pantallas de catalogo se perderia y el menu de Operacion se vaciaria. Nunca guardes el torneo activo en un contexto o localStorage.
20. **i18n: `es` es la fuente de verdad.** `lib/i18n/messages.ts:3` define `es`, `:1735` hace `type Messages = typeof es`, `:1737` declara `const en: Messages`. Una clave nueva en `es` rompe la compilacion hasta traducirla en `en`. Server Components importan `messages` y lo indexan con `getLocale()` (`lib/i18n/server.ts:4`); client components usan `useAppLocale()` (`components/i18n/AppLocaleProvider.tsx:38`).
21. **El idioma es una cookie, no un segmento de ruta.** `listgolf_locale`, 400 dias, `secure` solo en produccion (`lib/i18n/actions.ts:8-17`). No hay rutas `/es` ni `/en`.
22. **Tailwind 4 CSS-first: no existe `tailwind.config.*`.** El tema se declara con `@theme inline` en `app/globals.css:8` y el unico plugin es `@tailwindcss/postcss` (`postcss.config.mjs`). Los tokens de color duros del backoffice (`#0F1720`, `#141c26`, `#1C252D`, `#08111f`) estan escritos a mano en los layouts, no como variables.
23. **`inputs` a 16px obligatorio** (`app/globals.css:46-50`): menos y Safari iOS hace zoom al enfocar, y en el campo eso arruina la captura.
24. **El comite y el staff imprimen mucho.** El bloque `@media print` de `app/globals.css` oculta todo lo que no este dentro de `.report-printable`. Una pantalla nueva que deba imprimirse necesita esa clase.
25. **`bodySizeLimit` de server actions esta en 8mb** (`next.config.ts:5`) por los posters de convocatoria; subirlo mas choca con el limite de Vercel.
26. **Los scripts de `scripts/` corren con `npx tsx`, cargan `.env.local` a mano y usan service role**, es decir apuntan a la base de PRODUCCION (`scripts/recompute-handicaps-once.ts:1-20`). Solo 4 de 30 tienen modo dry-run. Lee el script completo antes de ejecutarlo.
27. **`.vercelignore` excluye `scripts/` y `*.backup.tsx`** para que un script local no rompa el build de preview (commit `dcf89a8`).
28. **Variables de entorno (nombres, jamas valores en el doc).** Publicas, van al bundle: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` (base de los links que manda el bot), `NEXT_PUBLIC_SITE_URL` (redirect de recuperar password, `app/login/forgot-password/actions.ts:26`), `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Secretas, solo servidor: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SETUP_SECRET` (`app/api/telegram/webhook/route.ts:75`), `TELEGRAM_COMMITTEE_CHAT_ID` y `FB_STAFF_TELEGRAM_CHAT_ID` (`lib/fb/notifyFbPayment.ts:91-92`), `CALIBRATION_TELEGRAM_IDS` (`lib/distances/calibrationAccess.ts:15`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `BOOTSTRAP_ADMIN_SECRET` (`app/setup-admin/actions.ts:20`), `TOURNAMENT_TEMPLATE_ANUAL_ID` / `_CALCUTA_ID` / `_RYDER_ID` (`lib/tournaments/templatePresets.ts:109-111`). Inyectadas por Vercel: `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_ENV`. Meter una secreta con prefijo `NEXT_PUBLIC_` la publica en el navegador.
29. **El type-check real solo pasa en `next build`.** `npm run dev` no tipa el proyecto entero, por eso hay una racha de commits `fix(...): tipar ... para que compile en Vercel` (`d6be869`, `5c7536b`, `45cb805`). Corre `npm run build` antes de desplegar.

## Flujos
### 1. Request al backoffice
1. `proxy.ts:14-26` calcula `pathname`, `getModuleFromPath` y `isBackofficePath`; si no es ninguno, pasa sin crear cliente Supabase (para que la home no se caiga si falla el env).
2. Sin `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` redirige a `/login?next=<path>` (`proxy.ts:30-37`).
3. Crea `createServerClient` con las cookies del request y llama `auth.getUser()`; sin usuario, `/login?next=` (`proxy.ts:62-73`).
4. Con modulo: `getUserRoles` → `isCommitteeOnlyUser` desvia a `/comite-handicap` (`:82`); `canAccessModule` falso desvia a `/comite-handicap`, `/tournaments` o `/login` (`:90-97`).
5. Pasa el header `x-pathname` (`proxy.ts:16`) que `components/layout/ConditionalAppHeader.tsx:7` lee para decidir si oculta el header publico.
6. `app/layout.tsx` monta html/body y `app/(backoffice)/layout.tsx` repite `getUser` + `getUserRoles`, provee `BackofficeRolesProvider` y renderiza `BackofficeLayoutClient`.
7. `Sidebar.tsx` filtra items con `canAccessModule(roles, NAV_ITEM_MODULE[key])` y con `requiresTournament` contra el `tournament_id` de la URL.

### 2. Mutacion desde el backoffice
1. `<form action={miAction}>` en un Server o Client Component de la carpeta de la pantalla.
2. `actions.ts` con `"use server"` parsea el `FormData` con `reqStr`/`reqInt` y lanza `Error` en espanol si falta algo.
3. `requireTournamentAccess({ tournamentId, allowedRoles })` valida rol contra ese torneo (`app/(backoffice)/rounds/actions.ts:87-90`); dentro de una action que devuelve estado se usa `checkTournamentAccess` para no redirigir.
4. Escribe con `createAdminClient()` (service role) o con el cliente SSR si necesita `auth.uid()`.
5. `revalidatePath("/ruta")` y opcionalmente `redirect()` fuera de cualquier `try`.

### 3. Deploy staging → main
1. `scripts/deploy-staging-and-main.sh:7-10` aborta si hay cambios sin commitear.
2. `git checkout main && git pull` y `npx vercel deploy --prod --yes` → produccion (`www.listgolf.club`).
3. `git checkout staging && git pull` y `npx vercel deploy --yes` → preview (`staging.listgolf.club` si el dominio esta ligado a la rama).
4. Vuelve a `main`. El orden es prod-primero: el script no valida staging antes de publicar.
5. Vercel toma las variables de entorno de su dashboard, no de `.env.prod`.
6. `vercel.json` registra el cron de 5 minutos a `/api/ritmo/check-reminders`, que se autentica con `Authorization: Bearer $CRON_SECRET` o `?secret=` (`app/api/ritmo/check-reminders/route.ts:25-36`).

## Invariantes y trampas
- **`/captura/*` es publico por diseno y la identidad se declara, no se verifica.** `app/captura/grupo/page.tsx:11-12` usa `tryCreateAdminClient()` y cae al cliente SSR; `lib/captura/resolveActor.ts:33-53` toma `me_entry_id`/`caddie_id` del body o del `Referer`. El unico "secreto" es conocer el UUID del grupo, que llega por el bot de Telegram. No agregues datos sensibles a esas pantallas ni asumas que el actor es quien dice.
- **62 de 82 API routes no tienen ninguna comprobacion de auth** y usan service role (todo `app/api/captura/*`, `app/api/mobile/stats/*`, `app/api/matchplay/*`, `app/api/marshal/*`). Solo 14 llaman `auth.getUser()`. Antes de agregar un endpoint que borre o cobre, decide explicitamente su gate.
- Si conviertes `app/(backoffice)/layout.tsx` en un layout que lanza excepciones, te quedas sin `error.tsx` util: el commit `600f690` lo blindo a proposito para que los fallos de auth redirijan a `/login` en vez de tumbar el arbol.
- `app/(backoffice)/score-entry/mobile/page.tsx:315-355` tiene **PAR y HANDICAP de los 18 hoyos hardcodeados** (el campo del CCQ). Es la unica pantalla del sistema que no lee el par de la base. Un torneo en otro campo calcula mal ahi.
- `BackofficeLayoutClient.tsx:54-88` tiene tres rutas con chrome especial: `/score-entry/mobile` (sin sidebar), `/matchplay/auction/proyeccion*` (pantalla negra de TV) y `/ritmo*` (main sin padding). Renombrar esas rutas rompe el layout sin error de compilacion.
- Leaflet (mapa de Ritmo) usa z-index 400-1000 y se sale de su contenedor: por eso existen `.ritmo-map-host` en `app/globals.css` y el `isolate` de `BackofficeLayoutClient.tsx:109`. Los commits `48ee10f`, `6739a4b` y `432cbb4` son sintomas: sobre el mapa hay que navegar con `location.assign`, no con `<Link>`.
- `.in()` de PostgREST revienta la URL con muchos ids; usa `lib/supabase/queryInChunks.ts` (hoy solo lo aprovecha `app/(backoffice)/entries/page.tsx`).
- `NEXT_PUBLIC_APP_URL` mal puesta (localhost o http) rompe los botones de Telegram en silencio; por eso `lib/telegram/appUrl.ts:11-16` y `lib/score-entry/groupCaptureUrl.ts:18-36` caen a `https://www.listgolf.club`. No quites esos fallbacks.
- **La rama `staging` esta divergida**: 9 commits que no estan en `main` y 227 commits de `main` que no estan en ella. Desplegar staging hoy publica codigo viejo. Verifica con `git log --oneline main..staging` antes de usar el script.
- No hay ni un test en el repo (`*.test.ts` / `*.spec.ts` = 0). El unico gate automatico es `next build` con `strict: true`.

## Deuda y preguntas abiertas
- **Archivos monstruo. Como leerlos sin quemar contexto:** `app/captura/distancias/DistanciasClient.tsx` (4184) es *un solo componente* de la linea 294 a la 4098 — nunca lo leas de corrido: `grep -n "function \|useEffect\|useState" ` y luego `sed -n 'X,Yp'`. `app/(backoffice)/score-entry/mobile/page.tsx` (2820) si esta seccionado en subcomponentes (`MatchStatusBar:200`, `ScoreCell:440`, `SignaturePad:477`, `CompactCardSection:631`, `PrivateCardSection:815`, `HoleDots:916`). `app/(backoffice)/entries/actions.ts` (2355) son 22 exports desde la linea 458: lista con `grep -n "^export async function"` y lee solo el que necesitas. Igual con `tee-sheet/actions.ts` (2156), `matchplay/actions.ts` (1683), `RitmoLiveView.tsx` (2269) y `app/torneos/[id]/page.tsx` (2244).
- Codigo muerto confirmado: `lib/public/detectInstallPlatform.ts` (nadie lo importa; el vivo es `lib/install/detectInstallPlatform.ts`, con firma distinta), `lib/auth/getUserTournamentRole.ts` (0 bytes), `app/torneos/[id]/components/PublicFooterCards.tsx` y `PublicTournamentHeader.tsx` (0 bytes), `app/torneos/[id]/page.backup.tsx` (1599) y `app/(backoffice)/rounds/page.backup.tsx`.
- `createAdminClient` esta definido dos veces con comportamiento distinto: `utils/supabase/admin.ts:3` valida env y desactiva `autoRefreshToken`; `utils/supabase/server.ts:38` no valida nada. Deberia quedar solo el primero.
- `lib/tournament/` y `lib/tournaments/` coexisten (un archivo vs cuatro). Igual `lib/install/` vs `lib/public/`. Las carpetas de `lib/` mezclan ingles (`handicap`, `scorecards`, `rounds`) y espanol (`salidas`, `cercanos`, `convocatoria`, `ritmo`).
- `reqStr`/`optStr`/`reqInt` duplicados en 26 archivos de actions. Candidato obvio a `lib/forms/`.
- Conflicto de fondos sin resolver: `app/globals.css:25` fuerza `body { background: #065f46 !important }` (verde) mientras `app/layout.tsx:45` pinta un div `#08111f` (azul oscuro) encima. El verde solo asoma si algo falla.
- i18n a medias: solo 37 archivos usan `messages` y 14 usan `useAppLocale()`. Todo `/captura/*`, todos los modulos F&B y casi todo `matchplay` tienen el espanol hardcodeado; un usuario en EN vera pantallas mezcladas.
- Solo 4 error boundaries y 7 usos de `Suspense` en 109 paginas. La mayoria de las pantallas del backoffice no tienen fallback propio.
- Basura en la raiz del repo que deberia estar en `.gitignore` o borrada: `main` (archivo vacio de 0 bytes), `.deploy-touch`, `diag-*.txt`, `banderas_yardas_integration.patch`, `tmp/`, varios `.xlsx`/`.csv` con datos de jugadores, y `malvarez.pem` / `malvarez.pub`. El `.pem` (llave privada) NO esta trackeado: `.gitignore` incluye `*.pem`. El `.pub` si esta en git y deberia salir.
- `README.md` sigue siendo el de `create-next-app`. No hay `CLAUDE.md` ni `AGENTS.md`.
- ATENCION SIN VERIFICAR: `experimental.serverActions.bodySizeLimit` en `next.config.ts:4-6` puede estar deprecado en Next 16.1 (movido fuera de `experimental`); no aparecio warning en los logs revisados, pero conviene confirmarlo en el proximo build.
- ATENCION SIN VERIFICAR: no se auditaron las policies RLS reales en Supabase. Solo 2 de 101 migraciones mencionan `enable row level security`, y como casi todo el codigo de servidor usa service role, es posible que varias tablas nucleo esten sin policies efectivas.

## Relacionado
[[datos-y-seguridad]] · [[torneos-setup]] · [[tee-sheet-salidas]] · [[captura-scores]] · [[matchplay]] · [[calcuta-subasta]] · [[handicap-whs]] · [[resultados-cortes-premios]] · [[distancias-gps]] · [[ritmo-juego]] · [[telegram]] · [[fb-restaurante]] · [[mobile-watch]]

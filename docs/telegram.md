---
titulo: Telegram, WhatsApp y notificaciones
modulo: telegram
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Telegram, WhatsApp y notificaciones

## Que resuelve
El comite necesita hablarle a 200 jugadores y sus caddies el mismo dia sin lista de telefonos: avisar el tee time, mandar la tarjeta electronica del grupo, confirmar que el kit del torneo llego, empujar a compartir ubicacion para medir ritmo, y avisar al comite cuando un grupo se atrasa. Todo pasa por un solo bot de Telegram (`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, en produccion @ListGolfBot). El jugador queda "vinculado" cuando su `telegram_user_id` esta en `players`; sin eso el sistema es mudo con el. WhatsApp existe solo como webhook entrante de Twilio y no se usa para avisos.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| app/api/telegram/webhook/route.ts | Unico entrypoint entrante. Router de comandos, /start token, vinculacion marshal/banderas, kit, GRUPO. GET?setup=1 refija webhook | 792 |
| lib/telegram/sendMessage.ts | sendMessage/deleteMessage/getWebhookInfo, botones inline (url vs web_app), clasificacion de errores fatales | 220 |
| lib/telegram/outbox.ts | `sendAndTrackTelegramMessage`: borra el mensaje previo del mismo kind+chat, envia, registra en `telegram_outbox` | 245 |
| lib/telegram/linkToken.ts | Crear/consumir tokens one-time de deep link, `classifyTelegramLinkStatus` | 268 |
| lib/telegram/refreshLiveGroupSalida.ts | Relectura obligatoria de `pairing_groups` antes de citar grupo/tee en un mensaje | 115 |
| lib/matchplay/notifyNextRoundGroup.ts | Aviso "avanzaste de ronda" / "ajuste de horario" a los 4 jugadores + caddies | 404 |
| lib/dailyRounds/notifyGroupStart.ts | Aviso "tu ronda del dia empieza" al publicar salida en rondas diarias | 272 |
| lib/telegram/sendGroupCaptureLinks.ts | Envio automatico de links de captura al crear grupo de consolacion MP | 307 |
| app/(backoffice)/captura-telegram/actions.ts | Envio manual de links de captura: por grupo y "todo el torneo" | 396 |
| app/(backoffice)/captura-telegram/page.tsx | Pantalla del comite: salidas de la ronda + estado Telegram por persona + modal de auditoria | 311 |
| lib/telegram/ritmo/reminders.ts | Cron: invitacion pre-tee y recordatorio post-tee de Live Location | 381 |
| lib/telegram/ritmo/paceAlerts.ts | Cron: alerta de atraso SOLO al chat del comite, con cooldown | 202 |
| lib/marshal/notifyMarshalsRoundDayStart.ts | Aviso 5:00 AM a marshals con boton a la mini app marshal | 91 |
| lib/telegram/markChatInvalid.ts | Marca `telegram_chat_invalid_at/reason` en players y caddies | 59 |
| lib/telegram/coverageStatus.ts | Modelo del tablero de cobertura (quien NO recibira el aviso) | 88 |
| components/telegram/TelegramCoveragePanel.tsx | UI del tablero de cobertura + boton "Copiar link" de vinculacion | 167 |
| app/(backoffice)/telegram/link-actions.ts | Server actions que generan el deep link (no hay pantalla /telegram) | 68 |
| lib/telegram/kitMessage.ts | Plantilla del mensaje de kit + reconocimiento de RECIBIDO / RECIBIDO PARCIAL | 89 |
| lib/telegram/kitReceive.ts | Registra confirmacion del kit en `tournament_entries` | 145 |
| app/(backoffice)/entries/telegram-kit/page.tsx + TelegramKitPanel.tsx | Pantalla KIT por jugador: pegar ID, verificar, enviar kit, bandeja de contactos pendientes | 294 + 505 |
| app/(backoffice)/entries/actions.ts | `savePlayerTelegramFromKit` (1773), `verifyTelegramLinkFromKit` (1881), `deliverTelegramKit` (1980) | 1980+ |
| lib/telegram/validateInitData.ts | Validacion HMAC del initData de Mini App (unico camino seguro de identidad) | 77 |
| app/mini/estadisticas/page.tsx | Mini App real (boton `web_app`); carga telegram-web-app.js y monta PlayerStats | 62 |
| app/api/whatsapp/webhook/route.ts | Webhook Twilio TwiML, solo comando INICIO. Sin firma, sin envio saliente | 449 |
| app/api/telegram/set-menu-button/route.ts | Fija el boton de menu del bot a /mini/estadisticas. Protegido con BOOTSTRAP_ADMIN_SECRET | 41 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| telegram_outbox | Bitacora de mensajes enviados (chat_id, message_id, kind, round_id, group_id) para borrar el anterior y para cooldowns | 20260602030000_telegram_outbox.sql |
| telegram_pending_links | Quien escribio al bot sin estar vinculado; alimenta la bandeja del KIT | 20260516120000_telegram_pending_links.sql |
| telegram_link_tokens | Tokens one-time de `t.me/BOT?start=TOKEN` (player_id XOR caddie_id) | 20260822000000_telegram_link_tokens_and_chat_invalid.sql |
| tournament_telegram_kit_content | Plantilla del kit por torneo (greeting_line, body_lines, footer_line) | 20260517120000_telegram_kit_module.sql |
| tournament_entries | Columnas `telegram_kit_sent_at`, `_received_at`, `_partial_received_at`, `_pending_items` | tabla: no (creada en Supabase); columnas: 20260515120000 y 20260517120000 |
| players | `telegram_user_id`, `telegram_chat_id`, `telegram_username`, `telegram_chat_invalid_at/reason` | tabla: no (creada en Supabase); cols invalid: 20260822000000 |
| caddies | `telegram` (legacy), `telegram_user_id`, `telegram_chat_id`, cols invalid | tabla: no (creada en Supabase); cols: 20260527160000 y 20260822000000 |
| profiles | `telegram_chat_id`, `telegram_username` para marshal y flag_keeper | 20260601190000_marshal_role_and_telegram.sql |
| pairing_groups / pairing_group_members / rounds / tournaments | Origen de grupo, tee time, hoyo de salida y nombre del torneo en cada mensaje | no (creada en Supabase) |
| caddie_assignments | Resolver que caddie recibe el link del grupo (por entry_id) | no (creada en Supabase) |
| ritmo_positions | Saber si el grupo ya comparte ubicacion antes de mandar recordatorio | no (creada en Supabase) |
| user_club_roles / roles | Validar rol marshal en `/soy_marshal` y flag_keeper en `/soy_banderas` | roles: alta de `marshal` en 20260601190000 |
| matchplay_brackets / matchplay_matches / matchplay_pair_teams | Solo el script de correccion de consolacion los recorre para armar la lista | no (creada en Supabase) |

## Reglas de negocio
1. Un jugador esta vinculado si `players.telegram_user_id` tiene digitos; el chat destino es `telegram_chat_id ?? telegram_user_id` (en chat privado son iguales) — lib/matchplay/notifyNextRoundGroup.ts:190, app/(backoffice)/entries/actions.ts:2045.
2. `classifyTelegramLinkStatus` decide el estado del tablero de cobertura con esta precedencia: `telegram_chat_invalid_at` no nulo => `invalid`; si no, chat_id o user_id numerico => `linked`; si no => `unlinked` — lib/telegram/linkToken.ts:243.
3. Los avisos de salida OMITEN (skipped, no failed) a quien tenga `telegram_chat_invalid_at` distinto de null, incluso si tiene chat_id — lib/matchplay/notifyNextRoundGroup.ts:184, lib/dailyRounds/notifyGroupStart.ts:115.
4. Solo dos errores de Telegram son fatales y marcan el chat invalido: `chat_not_found` y `bot_blocked` (incluye "user is deactivated" y cualquier HTTP 403) — lib/telegram/sendMessage.ts:24, lib/telegram/markChatInvalid.ts:55.
5. Marcar invalido NO borra `telegram_user_id`: el deep link puede reparar el vinculo sobrescribiendo chat_id — lib/telegram/markChatInvalid.ts:8. `markTelegramChatInvalid` exige chat_id de solo digitos, si no no hace nada — markChatInvalid.ts:19.
6. Token de deep link: 16 bytes aleatorios (32 hex), TTL 14 dias, unico activo por sujeto (crear uno consume los previos del mismo player/caddie) — lib/telegram/linkToken.ts:4, :60.
7. Al consumir el token (`/start TOKEN`) se SOBRESCRIBE `telegram_user_id` y `telegram_chat_id`, se limpian los flags de invalido, se marca `consumed_at` y se borra la fila de `telegram_pending_links` — lib/telegram/linkToken.ts:155. En caddies tambien escribe la columna legacy `telegram` porque paths viejos aun la leen — linkToken.ts:201.
8. Token expirado se marca `consumed_at` al intentar usarlo (no se puede reintentar) — lib/telegram/linkToken.ts:143.
9. Cualquiera que escriba al bot sin estar vinculado queda en `telegram_pending_links` (upsert por telegram_user_id, `last_message` truncado a 500 chars) y el bot le contesta su ID numerico para que lo copie — app/api/telegram/webhook/route.ts:127, :415.
10. La bandeja del KIT muestra los ultimos 25 contactos pendientes ordenados por `last_seen_at` desc — app/(backoffice)/entries/telegram-kit/page.tsx:205.
11. Guardar Telegram a mano exige `telegram_user_id` de solo digitos, y chat_id vacio o solo digitos; al guardar se limpian los flags de invalido y se borra el pendiente — app/(backoffice)/entries/actions.ts:1831, app/(backoffice)/caddies/[id]/edit/telegram-actions.ts:63.
12. Kit: `deliverTelegramKit` requiere `telegram_user_id`; al enviar pone `telegram_kit_sent_at=now` y RESETEA `telegram_kit_received_at` y `_partial_received_at` a null (reenviar el kit borra la confirmacion previa) — app/(backoffice)/entries/actions.ts:2079.
13. La plantilla del kit sale de `tournament_telegram_kit_content` por torneo; si no hay fila se usa DEFAULT_CONTENT del codigo. Variables soportadas: `{player_name}` y `{tournament_name}` — lib/telegram/kitMessage.ts:7, app/(backoffice)/entries/actions.ts:2051.
14. Si la entrega es parcial, `telegram_kit_pending_items` se inyecta al mensaje como lista de "lo que aun te debe el comite" — lib/telegram/kitMessage.ts:44.
15. `RECIBIDO` marca completo y pone `telegram_kit_pending_items = null`; `RECIBIDO PARCIAL` solo marca `_partial_received_at`. Ambos buscan la entry mas reciente con `telegram_kit_sent_at` no nulo y `telegram_kit_received_at` nulo — lib/telegram/kitReceive.ts:20, :72.
16. El comando `GRUPO`/`INICIO` esta bloqueado hasta que el jugador confirme el kit (parcial basta). Si nunca se envio kit, el bot lo dice; si se envio y no confirmo, pide confirmar — app/api/telegram/webhook/route.ts:699, lib/telegram/kitAccess.ts:2.
17. ANTES de cualquier mensaje que cite grupo, tee time u hoyo de salida hay que releer `pairing_groups` con `refreshLiveGroupSalida`. Si el tee que traia el caller difiere del vivo, el mensaje cambia a modo "ajuste de horario" — lib/telegram/refreshLiveGroupSalida.ts:41, lib/matchplay/notifyNextRoundGroup.ts:98.
18. `notifyNextRoundGroupCreated` relee salidas DOS veces: al inicio y otra vez despues de armar la lista de destinatarios — lib/matchplay/notifyNextRoundGroup.ts:98 y :270.
19. Tee time siempre se normaliza a HH:MM (`normalizeTeeHHMM`) antes de compararlo o publicarlo — lib/telegram/refreshLiveGroupSalida.ts:31.
20. `notifyIfGroupTeeTimeChanged` no manda nada si el tee nuevo es vacio o igual al anterior; si cambio, reenvia con `reason="tee_adjusted"` (reemplaza el mensaje previo) — lib/matchplay/notifyGroupTeeTimeChanged.ts:27.
21. Borrado de mensajes previos (`kind="next_round_group"`): se borra el previo si su `round_no` es menor al actual, o si es la MISMA ronda (reemplazo por ajuste de tee). Para otros kinds se borra siempre el previo del mismo kind+chat — lib/telegram/outbox.ts:170.
22. Limpieza global por chat: filas de `telegram_outbox` cuyo `round_date` es anterior a hoy (Mexico) se borran del chat y de la tabla, sin importar el torneo — lib/telegram/outbox.ts:122, lib/captura/roundClosure.ts:14.
23. Telegram solo permite borrar mensajes propios de menos de 48 h; si `deleteMessage` falla no se aborta el envio — lib/telegram/sendMessage.ts:134.
24. El link de captura es personal: al jugador se le manda `?me=<entry_id>` y al caddie `?caddie=<caddie_id>`, y por eso el dedupe es por `chatId|role|entryId|caddieId` (si un caddie es tambien jugador recibe dos mensajes distintos) — lib/score-entry/groupCaptureUrl.ts:69, app/(backoffice)/captura-telegram/actions.ts:222.
25. Caddie del grupo se resuelve por `entry_id` de los integrantes, no por `pairing_group_id` (las asignaciones se guardan sin grupo), filtrando `is_active !== false` y `round_id` nulo o igual a la ronda — app/(backoffice)/captura-telegram/actions.ts:171, lib/telegram/sendGroupCaptureLinks.ts:142.
26. Alertas de ritmo: umbral 15 min de atraso, cooldown 60 min por grupo (consultando `telegram_outbox` por kind + group_id), y van UNICAMENTE a `TELEGRAM_COMMITTEE_CHAT_ID`. Nunca al jugador ni al caddie — lib/telegram/ritmo/paceAlerts.ts:26, :139.
27. Recordatorios de Live Location: invitacion cuando faltan entre 15 y 25 min para el tee; recordatorio "no veo tu ubicacion" entre 10 y 30 min despues del tee y solo si no hubo `ritmo_positions` en los ultimos 15 min. Si el grupo ya tiene `actual_start_at` se omite todo — lib/telegram/ritmo/reminders.ts:19, :91, :127.
28. Aviso a marshals: solo entre las 5:00 y 5:59 hora Mexico, para rondas con `round_date = hoy` y torneo no archivado — lib/marshal/runMarshalDayStartReminders.ts:32, :49.
29. Todo el calculo de "hoy" usa `America/Mexico_City` via `Intl.DateTimeFormat("en-CA")`, porque Vercel corre en UTC y `round_date` es fecha local — lib/telegram/ritmo/reminders.ts:41, lib/telegram/ritmo/paceAlerts.ts:69.
30. Botones: `url` abre navegador in-app SIN identidad firmada; `web_app` abre Mini App e inyecta initData firmado. Solo `/mini/estadisticas` usa `web_app` — lib/telegram/sendMessage.ts:100, lib/telegram/statsCommand.ts:44.
31. La identidad en las demas mini apps viaja como query param en claro (`?tg=`, `?u=`, `?me=`) — lib/telegram/distancesCommand.ts:44, lib/telegram/fb/menuCommand.ts:36, lib/marshal/marshalMiniAppUrl.ts:40. ATENCION SIN VERIFICAR: quien conozca un chat_id numerico puede abrir esas pantallas suplantando a otro; no encontre validacion server-side de ese parametro.
32. `validateTelegramInitData` usa el algoritmo oficial (secret = HMAC("WebAppData", token)), compara en tiempo constante y rechaza initData de mas de 24 h — lib/telegram/validateInitData.ts:31, :57.
33. `NEXT_PUBLIC_APP_URL` con localhost, http o vacio se ignora y se cae a `https://www.listgolf.club`: Telegram rechaza botones con URL invalida y el comando parecia "no responder" — lib/telegram/appUrl.ts:11.
34. `/soy_marshal email` y `/soy_banderas email` exigen que el email exista en `profiles`, `is_active !== false` y el rol activo correspondiente (`marshal` en `user_club_roles`, flag_keeper via `profileHasFlagKeeperRole`); solo entonces se guarda `profiles.telegram_chat_id` — app/api/telegram/webhook/route.ts:442, :521.
35. En grupos/canales (`chat.id` negativo) el bot no puede resolver user id si falta `from.id` y responde pidiendo chat privado — lib/telegram/resolveUserId.ts:14, app/api/telegram/webhook/route.ts:382.
36. F&B: el aviso de pago al staff usa `FB_STAFF_TELEGRAM_CHAT_ID` y cae a `TELEGRAM_COMMITTEE_CHAT_ID`; si ninguno esta configurado no manda nada (no falla) — lib/fb/notifyFbPayment.ts:90.
37. WhatsApp: el webhook solo entiende `INICIO`, responde TwiML con un link que contiene un token base64 SIN firmar (`entryId|roundId|phone|timestamp`) y apunta a `/score-entry/mobile`. No hay envio saliente ni validacion de firma Twilio. Es un prototipo marcado "Paso 1 temporal" en el propio codigo — app/api/whatsapp/webhook/route.ts:152, :372.

## Flujos
**A. Vincular un jugador (camino recomendado)**
1. Comite abre tee-sheet o rondas-diarias y despliega el tablero de cobertura — components/telegram/TelegramCoveragePanel.tsx:57.
2. Pulsa "Copiar link" en la fila del no vinculado; se llama `generateTelegramDeepLink` — app/(backoffice)/telegram/link-actions.ts:60 → `createTelegramLinkToken` (invalida tokens previos, inserta fila, arma `t.me/BOT?start=TOKEN`) — lib/telegram/linkToken.ts:36.
3. El link se le pasa al jugador por WhatsApp/correo a mano (el sistema no lo envia).
4. El jugador abre el link; Telegram manda `/start TOKEN` al webhook — app/api/telegram/webhook/route.ts:384.
5. `redeemTelegramLinkToken` guarda user_id + chat_id reales, limpia flags de invalido, consume el token y borra el pendiente — lib/telegram/linkToken.ts:112.
6. Alternativa manual: el jugador escribe `ID`, copia su numero, el comite lo pega en KIT (`savePlayerTelegramFromKit`) y valida con "Verificar" (`verifyTelegramLinkFromKit` manda un ping y, si falla fatal, marca el chat invalido) — app/(backoffice)/entries/actions.ts:1773, :1881.

**B. Aviso de salida con tarjeta de captura**
1. Disparador: cierre de grupo de match play (lib/score-entry/closeMatchPlayGroupRound.ts:337), avance de cuadro (lib/matchplay/closeAndAdvance.ts:480), publicar salida diaria (app/(backoffice)/rondas-diarias/actions.ts:552), cambio de tee en tee-sheet (app/(backoffice)/tee-sheet/actions.ts:642), o envio manual desde /captura-telegram.
2. `refreshLiveGroupSalida` relee grupo y ronda; si el tee difiere, el mensaje se convierte en "ajuste de horario" — lib/telegram/refreshLiveGroupSalida.ts:41.
3. Se arma la lista: jugadores de `pairing_group_members` + caddies por `caddie_assignments`, descartando invalidos y sin chat.
4. Segunda relectura de salidas y construccion del texto + boton `📝 Capturar Grupo N` con URL personal.
5. `sendAndTrackTelegramMessage` borra el mensaje previo del mismo kind, envia, y registra en `telegram_outbox`; si el error es fatal marca el chat invalido — lib/telegram/outbox.ts:57.
6. El resultado vuelve a la UI como sent / failed / skipped con nombres, para que el comite sepa a quien llamar por telefono.

**C. Kit del torneo**
1. Comite edita la plantilla en /entries/telegram-kit-content (upsert en `tournament_telegram_kit_content`) — app/(backoffice)/entries/telegram-kit-content/actions.ts:37.
2. En /entries/telegram-kit por jugador: verifica vinculo, marca entrega parcial y pendientes, y pulsa entregar (`deliverTelegramKit`) — app/(backoffice)/entries/actions.ts:1980.
3. El jugador responde `RECIBIDO` o `RECIBIDO PARCIAL`; el webhook lo enruta a `confirmKit*ForPlayer` — app/api/telegram/webhook/route.ts:675.
4. Recien entonces `GRUPO`/`INICIO` devuelve salida, companeros y link de captura — lib/telegram/buildPlayerGroupReply.ts:59.

## Invariantes y trampas
- **`telegram_outbox` NO es una cola de salida con reintentos.** Es una bitacora de mensajes ya enviados. Nadie la procesa, no hay columna de estado ni de intentos, y un envio fallido no deja rastro ahi. Si un mensaje falla, se reintenta a mano o con script. No implementar "reintentos" leyendo esa tabla creyendo que es una cola.
- **Releer salidas antes de enviar no es opcional** (commit 0a1e124). Antes se mandaba el tee calculado al crear el grupo y los jugadores llegaban a la hora vieja. Cualquier nuevo envio que cite hora o grupo debe pasar por `refreshLiveGroupSalida`, nunca por un tee cacheado por el caller.
- **Cambiar `kind` rompe el borrado.** El borrado del mensaje anterior filtra por `kind` exacto (outbox.ts:140). Si renombras un kind, los mensajes viejos quedan huerfanos en el chat para siempre. `OutboxKind` es una union cerrada — outbox.ts:14.
- **La idempotencia de `marshal_day_start` y `ritmo_share_*` es aparente.** `sendAndTrackTelegramMessage` con kind distinto de `next_round_group` siempre borra y reenvia (outbox.ts:180). El cron corre cada 5 min y la ventana de marshals es de 30 min, asi que el marshal recibe ~6 notificaciones aunque solo vea un mensaje. Mismo efecto en la invitacion pre-tee (ventana 15–25 min).
- **paceAlerts NO puede usar `sendAndTrackTelegramMessage`**: borraria las alertas de los demas grupos del mismo chat del comite. Por eso envia directo e inserta la fila del outbox a mano (paceAlerts.ts:170). Si alguien "unifica" ese envio, el comite pierde el historial de atrasos.
- **Tres caminos distintos para el chat del caddie.** `sendGroupCaptureLinks.ts:165` y `captura-telegram/actions.ts:194` leen SOLO la columna legacy `telegram`; `notifyNextRoundGroup.ts:249` y `notifyGroupStart.ts:186` leen `telegram_chat_id ?? telegram_user_id ?? telegram`. Un caddie vinculado solo por `telegram_user_id` recibe unos avisos y no otros. Origen del bug: commits 3bc848a y 7c5dd36.
- **El envio manual desde /captura-telegram no pasa por el outbox**: no borra el aviso anterior, no registra nada y no marca chats invalidos (actions.ts:298). Usarlo repetido acumula mensajes en el chat del jugador.
- **El POST del webhook no valida nada.** No hay `X-Telegram-Bot-Api-Secret-Token` ni allowlist; cualquiera que conozca la URL puede inyectar updates falsos y, por ejemplo, vincular su chat a un jugador ajeno enviando un `/start TOKEN` capturado. `setWebhook` tampoco pasa `secret_token` — lib/telegram/sendMessage.ts:192.
- **Solo `?setup=1` esta protegido** (con `TELEGRAM_WEBHOOK_SETUP_SECRET`); `?diag=1` es publico y expone si hay token, el username del bot, `NEXT_PUBLIC_APP_URL` y el `webhookInfo` de Telegram — app/api/telegram/webhook/route.ts:753.
- **El webhook loguea el update completo** con `console.log(JSON.stringify(body))` (route.ts:159): telefonos, nombres y ubicaciones GPS quedan en los logs de Vercel.
- **`allowed_updates` esta limitado a `message` y `edited_message`** (sendMessage.ts:203). `callback_query` no llega, asi que los botones inline solo pueden abrir URLs, nunca ejecutar acciones.
- **Orden del router del webhook importa.** Ubicacion de banderas se evalua antes que ubicacion de ritmo (route.ts:181 vs :206), `/YARDAS DEMO` antes que `/YARDAS` (distancesCommand.ts:23), y `/start TOKEN` antes que el trato de `/START` como peticion de ID (route.ts:384 vs :415). Reordenar rompe los tres.
- **Reenviar el kit borra la confirmacion.** `deliverTelegramKit` pone `telegram_kit_received_at = null`, y con eso el jugador pierde acceso a `GRUPO` hasta reconfirmar (actions.ts:2079).
- **`telegram_outbox` y `telegram_pending_links` no tienen RLS habilitado** en sus migraciones; `telegram_link_tokens` si (y sin policies: solo service_role). Ver [[datos-y-seguridad]].
- **`markTelegramChatInvalid` usa `.or()` con interpolacion del chatId** (markChatInvalid.ts:38 y :46); la guarda `/^\d+$/` previa es lo unico que evita inyeccion en el filtro. No relajar esa validacion.

## Deuda y preguntas abiertas
- Duplicacion completa: `app/(backoffice)/captura-telegram/actions.ts` (loadGroupRecipients + buildMessage) es una copia de `lib/telegram/sendGroupCaptureLinks.ts`. Toda correccion hay que aplicarla dos veces. Consolidar en la libreria.
- Columna legacy `caddies.telegram` sigue viva y se escribe a proposito en dos lados (linkToken.ts:201, telegram-actions.ts:81) "porque paths viejos la leen". Nadie migro esos paths.
- No existe pantalla `app/(backoffice)/telegram/`: solo `link-actions.ts`. La ruta /telegram no resuelve.
- `app/mini/` tiene una sola pantalla (`estadisticas`). Las demas "mini apps" del bot viven en `/captura/*` y se abren como URL normal sin initData.
- WhatsApp es un stub sin terminar: token base64 sin firma con comentario "Paso 1 temporal" (route.ts:152) y destino `/score-entry/mobile`. ATENCION SIN VERIFICAR: no confirme que esa ruta exista publicamente (el modulo real es `app/(backoffice)/score-entry/mobile`, detras de auth), asi que el link probablemente esta roto. No hay integracion saliente de WhatsApp: los botones de "compartir" solo abren `wa.me/?text=` en el navegador del operador (app/(backoffice)/reports/ReportToolbar.tsx:181).
- `scripts/send-r4-quarterfinal-telegram.ts` y `scripts/send-consol-correction-telegram.ts` traen `TOURNAMENT_ID` y `ROUND_ID` hardcodeados del Calcuta 2026. Son parches de un incidente real (commits af75f42, 74cc7cb, e462a5a): el sistema mando salidas de sabado a perdedores que no jugaban. El de correccion excluye a los cuartofinalistas vivos y deduplica por chat_id; el de R4 reenvia con `reason="tee_adjusted"` para reemplazar el aviso erroneo. Sirven de plantilla para el proximo blast manual, pero hay que reescribir los IDs.
- `ACTIVE_ROUND_GAP_DAYS` en paceAlerts.ts:28 esta declarada, nunca usada y se "consume" con `void` para pasar el linter (paceAlerts.ts:89).
- El aviso de pago F&B al cliente (`notifyClientPaymentReceived`) no clasifica errores ni marca chats invalidos (lib/fb/notifyFbPayment.ts:49).
- Pregunta abierta: no hay ningun proceso que limpie `telegram_link_tokens` consumidos/expirados ni `telegram_pending_links` viejos.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[tee-sheet-salidas]] · [[captura-scores]] · [[matchplay]] · [[ritmo-juego]] · [[distancias-gps]] · [[fb-restaurante]] · [[mobile-watch]] · [[torneos-setup]]

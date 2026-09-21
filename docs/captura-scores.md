---
titulo: Captura de scores, tarjetas y firmas
modulo: captura-scores
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Captura de scores, tarjetas y firmas

## Que resuelve
Anotar los golpes de cada jugador hoyo por hoyo mientras el grupo esta en el campo, sin papel y sin login: el link de Telegram abre la tarjeta del foursome y jugador, caddie o testigo capturan en vivo.
Reproduce el ritual de la tarjeta de golf: cada jugador lleva su tarjeta, otro jugador del grupo es su testigo (marcador), al terminar se firma y se entrega; una vez entregada queda cerrada y ya no se toca.
Marca en rojo cualquier score que alguien cambio despues de anotado hasta que el testigo lo confirme, y deja bitacora de quien anoto que en cada hoyo.
Da al comite en la mesa una via paralela para capturar/corregir tarjetas completas y cerrar rondas oficialmente.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| lib/captura/saveGroupHoleScore.ts | Corazon del guardado de un hoyo: validaciones, bloqueos, gross, bitacora | 363 |
| lib/captura/loadGroupCapture.ts | Payload unico que consumen las 3 UIs de campo (scores, testigos, firmas, locks, ventajas MP) | 583 |
| lib/captura/cardSignatures.ts | Firma jugador/testigo, curacion en parejas y cierre (`scorecards.locked_at`) | 514 |
| app/captura/tarjeta/TarjetaCaptureClient.tsx | Tarjeta vertical 18 hoyos + "Mi Tarjeta" privada + botones Firmar/Testigo | 1893 |
| app/captura/grupo/GrupoCaptureClient.tsx | Captura rapida en tabla horizontal 4 jugadores + tramo de desempate P1-P9 | 1604 |
| app/(backoffice)/score-entry/mobile/page.tsx | Teclado "anotar por hoyo"; se reusa publico en /captura/mobile | 2820 |
| app/(backoffice)/score-entry/actions.ts | savePlayerScores, cierre/apertura staff, cierre oficial de ronda, cierre de grupo MP | 1249 |
| app/(backoffice)/score-entry/page.tsx | Buscador de jugador y tarjeta completa del backoffice (tabs capturar/modificar) | 1519 |
| app/api/captura/score/route.ts | POST de un hoyo publico; resuelve actor y dispara auto-cierre de match | 136 |
| app/api/captura/sign/route.ts | POST de firma; valida ronda, hoyos completos, identidad y cierra tarjeta | 232 |
| app/api/captura/private-score/route.ts | POST de tarjeta privada; autoriza por `me`/`caddie` | 125 |
| app/api/captura/audit/route.ts | GET bitacora del grupo (requiere login + modulo captura-telegram) | 184 |
| app/api/captura/group/route.ts | GET del payload de captura (lo pollean las 3 UIs) | 42 |
| lib/captura/witnesses.ts | Asigna testigos: derangement aleatorio o pareja rival | 152 |
| lib/captura/pairWitness.ts | Reglas de lados/compañero/rival en torneos de parejas | 123 |
| lib/captura/privateScores.ts | CRUD de `private_hole_scores` | 110 |
| lib/captura/roundClosure.ts | `isRoundClosedByDate`: cierra por fecha en zona Mexico | 21 |
| lib/captura/resolveActor.ts | Identidad del capturador para bitacora (body, referer, sesion) | 137 |
| lib/captura/types.ts | Contratos del modulo; `PICKED_UP_STROKES`, hoyos 19-27 | 197 |
| lib/captura/playoffCaptureState.ts | Que hoyo de desempate falta y quien no capturo | 92 |
| lib/scorecards/alignCaptureToScorecardRound.ts | Copia la captura a la ronda de la tarjeta (misma `round_no`, otra categoria) | 198 |
| lib/scorecards/listMisalignedLockedScorecards.ts | Detecta cierres en categoria equivocada / faltantes | 236 |
| lib/scorecards/repairInvalidLockedScorecards.ts | Abre tarjetas cerradas sin 18 hoyos | 143 |
| lib/scorecards/countHolesOnPlayerRound.ts | Cuenta hoyos distintos y `assertEighteenHolesBeforeLock` | 54 |
| app/(backoffice)/seguimiento-captura/SeguimientoCapturaLive.tsx | Tablero en vivo de grupos atrasados de captura | 1134 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| hole_scores | Score oficial por hoyo. Columnas duplicadas `hole_no`/`hole_number`, denormaliza `entry_id`/`round_id` | no (creada en Supabase); columnas `pending_witness`/`pending_at`/`pending_by_role` en 20260527230000_witnesses_and_private_scores.sql; realtime en 20260527180000_hole_scores_realtime.sql |
| round_scores | Fila por (round_id, player_id) con `gross_score`; padre de hole_scores | no (creada en Supabase) |
| scorecards | Estado formal de la tarjeta: `status`, `locked_at`, `player_signed_at`, `witness_signed_at`, `marker_signed_at` | no (creada en Supabase) |
| private_hole_scores | "Mi Tarjeta": score personal del jugador, no oficial | 20260527230000_witnesses_and_private_scores.sql; hoyos 19-27 en 20260528230000_matchplay_playoff_holes.sql |
| score_witnesses | Testigo asignado a cada jugador dentro de un `pairing_group` | 20260527230000_witnesses_and_private_scores.sql |
| card_signatures | Firmas de campo por (group_id, entry_id): jugador + testigo | 20260528010000_card_signatures.sql |
| hole_score_audit | Bitacora inmutable de create/update/delete de hole_scores con actor y source | 20260529190000_hole_score_audit.sql |
| scorecard_signatures | Firmas del sistema formal viejo (roles player/marker/witness/staff, tipo tap/typed_name/drawn/otp) | no (creada en Supabase) |
| scorecard_signature_requests | Tokens de firma remota que consume /sign/scorecard/[token] | no (creada en Supabase) |
| scorecard_audit_log | Bitacora del sistema formal viejo (signature_added, locked, disputed…) | no (creada en Supabase) |
| pairing_groups / pairing_group_members | Grupo y sus 4 jugadores; `notes` decide consolacion / stroke agregado | no (creada en Supabase) |
| rounds | Una fila POR CATEGORIA y round_no; origen de casi todos los bugs de alineacion | no (creada en Supabase) |
| tournament_entries | Inscripcion: categoria, `playing_handicap`, `playing_handicap_override` | no (creada en Supabase) |
| caddie_assignments | Autoriza a un caddie sobre un entry (`is_active`, `pairing_group_id`, `round_id`) | no (creada en Supabase) |
| tournament_holes | `handicap_index` (stroke index) para ventajas en stroke agregado | no (creada en Supabase) |

## Reglas de negocio
1. Rango valido de golpes: 1–15; fuera de rango se rechaza (lib/captura/saveGroupHoleScore.ts:111; backoffice: app/(backoffice)/score-entry/actions.ts:474).
2. Hoyos aceptados: 1–27. 1–18 es el recorrido; 19–27 es el desempate de match play y equivale fisicamente a los hoyos 1–9 (`playoffSourceHole`, lib/captura/types.ts:40; app/api/captura/score/route.ts:14).
3. `strokes` vacio/null y sin marca de levantada BORRA la fila del hoyo (lib/captura/saveGroupHoleScore.ts:238).
4. "Levanto" (tecla X en match play) guarda `picked_up=true` y `strokes = PICKED_UP_STROKES = 10`, para que el total stroke play siga sumando algo (lib/captura/types.ts:36; lib/captura/saveGroupHoleScore.ts:108). El API acepta `picked_up:true`, `pickedUp:true` o `strokes:"X"` (app/api/captura/score/route.ts:36).
5. `round_scores.gross_score` se recalcula en cada guardado sumando SOLO hoyos 1–18; los 19–27 nunca entran al gross (lib/captura/saveGroupHoleScore.ts:301-320).
6. Ronda cerrada por fecha: si `rounds.round_date` < hoy en `America/Mexico_City`, se bloquea capturar y firmar desde el link publico (lib/captura/roundClosure.ts:14; saveGroupHoleScore.ts:132; app/api/captura/sign/route.ts:119). Es comparacion de string YYYY-MM-DD.
7. Tarjeta cerrada = existe `scorecards` con `locked_at` para ESE `round_id` + `entry_id`. Con la tarjeta cerrada nadie captura ni edita desde el link publico; solo `actor.role === "admin"` pasa (lib/captura/saveGroupHoleScore.ts:155-170).
8. El bloqueo por cierre se evalua por ronda, nunca global: la clave es `round_id|entry_id`. Un jugador con R4 cerrada sigue capturando su R5 de consolacion (fix fa20dfe, lib/matchplay/loadConsolationMatchPlayPublic.ts:191-217).
9. Primera captura de un hoyo NUNCA queda pendiente de testigo (`pending_witness=false`) (lib/captura/saveGroupHoleScore.ts:278-287).
10. Recaptura sobre un hoyo que ya tenia valor con `mode="modify"` marca `pending_witness=true` + `pending_at` + `pending_by_role` (celda roja) (lib/captura/saveGroupHoleScore.ts:246-273).
11. `mode="approve"` limpia el rojo, dando el mismo valor o uno distinto (lib/captura/saveGroupHoleScore.ts:250).
12. El cliente decide `approve` vs `modify` por "autoridad" sobre el jugador P: son autoridad P mismo, el caddie de P, el testigo de P y el caddie del testigo de P; cualquier otro deja rojo (app/captura/tarjeta/TarjetaCaptureClient.tsx:1007-1025; app/(backoffice)/score-entry/mobile/page.tsx:1663-1686).
13. La celda roja bloquea la firma: `isCardReadyForSigning` exige score (o X) y `pending=false` en 1..holesRequired (app/captura/tarjeta/TarjetaCaptureClient.tsx:66-80).
14. Primera insercion de un score en grupo sin `tee_time` ni `actual_start_at` marca la salida real del grupo (match play R2+) (lib/captura/saveGroupHoleScore.ts:290-293).
15. Testigos sin parejas: se generan una sola vez al primer load como derangement aleatorio (nadie se atestigua a si mismo) y NO se regeneran si ya hay filas (lib/captura/witnesses.ts:74-80,124-152). Grupos de 1 jugador no reciben testigo (witnesses.ts:54).
16. Torneo de parejas: el testigo es siempre de la pareja RIVAL, nunca el compañero; si las asignaciones guardadas no cumplen, se borran y regeneran (lib/captura/witnesses.ts:61-72; lib/captura/pairWitness.ts:57-107).
17. Firmar como jugador: solo el propio jugador; en parejas cualquiera de su lado firma por ambos (app/api/captura/sign/route.ts:150-164; lib/captura/cardSignatures.ts:199-213,237-242).
18. Firmar como testigo: en parejas, cualquiera del lado rival; sin parejas, exactamente el `score_witnesses.witness_entry_id` asignado (app/api/captura/sign/route.ts:165-192; lib/captura/cardSignatures.ts:141-154).
19. No se acepta firma si faltan hoyos: se exige score o `picked_up` en 1..holesRequired (app/api/captura/sign/route.ts:12-44,129-146).
20. `holesRequired` = hoyo donde se decidio el match, si el match ya esta decidido; en cualquier otro caso 18 (lib/captura/matchPlayGroupDecision.ts:504,520,539,549).
21. Las firmas son idempotentes: un timestamp ya escrito no se sobreescribe (lib/captura/cardSignatures.ts:102-107).
22. Cierre automatico de tarjeta: con `signed_by_player_at` + `signed_by_witness_at` y los hoyos 1..holesRequired con strokes, se escribe `scorecards.status='locked'`, `locked_at`, `player_signed_at`, `witness_signed_at`; si no hay fila se inserta (lib/captura/cardSignatures.ts:399-513). Se intenta para todos los entries tocados por la firma (app/api/captura/sign/route.ts:206-217).
23. En parejas, cada load del grupo "cura" las firmas: si un jugador del lado firmo, se copia a su compañero, y lo mismo con la firma del testigo rival (lib/captura/cardSignatures.ts:326-383, invocado en lib/captura/loadGroupCapture.ts:314-321).
24. Tarjeta privada ("Mi Tarjeta"): existe para que el jugador lleve su propia cuenta sin exponerla al grupo. No alimenta scoring, leaderboard ni handicap. Se guarda por `(group_id, entry_id, hole_number)` — no por ronda (lib/captura/privateScores.ts:97-107).
25. Los scores privados NUNCA se hacen publicos automaticamente. El payload solo incluye `privateScores` para el propio jugador (`?me=`) o para el caddie con asignacion valida (lib/captura/loadGroupCapture.ts:369-388). Para pasar un valor a la tarjeta oficial hay que capturarlo de nuevo en la tabla publica.
26. Escritura de tarjeta privada autorizada server-side: `me === entry_id`, o `caddie_assignments` con `is_active != false` y `pairing_group_id` nulo o igual al grupo (app/api/captura/private-score/route.ts:71-99).
27. Visibilidad de caddie en el payload: asignaciones con `is_active != false`, `pairing_group_id` igual al grupo (o nulo con `round_id` coincidente) (lib/captura/loadGroupCapture.ts:343-367).
28. Actor de bitacora: prioridad body (`me_entry_id`, `caddie_id`, `actor_user_id`) > `?me=`/`?caddie=` del referer > sesion autenticada. Rol inferido: caddie > player > admin (lib/captura/resolveActor.ts:34-71). `source` se deriva del referer: `telegram_player|telegram_caddie|telegram_witness|backoffice|unknown` (resolveActor.ts:114-127).
29. La bitacora se escribe en `hole_score_audit` con old/new de strokes, picked_up y pending_witness, mas actor y source. Es best-effort: si falla, solo se loggea y el guardado sigue (lib/captura/saveGroupHoleScore.ts:322-355).
30. Leer bitacora exige login y permiso del modulo `captura-telegram` (app/api/captura/audit/route.ts:34-50).
31. Tras cada score guardado se intenta cerrar el match automaticamente; si falla no rompe el guardado (app/api/captura/score/route.ts:117-124). La UI de grupo tambien lo intenta una vez al cargar si el match esta decidido y no cerrado (app/captura/grupo/GrupoCaptureClient.tsx:867-920).
32. Desempate: se muestra el tramo P1–P9 solo si `needsPlayoff` o `viaPlayoff`; un hoyo de desempate solo cuenta cuando los 4 jugadores capturaron; scores en 19–27 con match ya decidido al 18 se reportan como huerfanos (lib/captura/playoffCaptureState.ts:43-83).
33. Backoffice `savePlayerScores` BORRA todos los `hole_scores` del `round_score_id` y reinserta los hoyos de la pantalla (app/(backoffice)/score-entry/actions.ts:786-806). Pantalla vacia = limpiar la ronda (actions.ts:736-776).
34. Tarjeta cerrada en backoffice: solo `super_admin`, `club_admin` o `tournament_director` pueden sobreescribir; el resto debe usar "Abrir ronda" (app/(backoffice)/score-entry/actions.ts:413-424,637-648).
35. Cerrar ronda desde la mesa exige 18 hoyos reales en la ronda del jugador (`countHolesOnPlayerRound`) y ademas cierra la tarjeta en TODAS las rondas hermanas del mismo `round_no` (otras categorias). "Abrir ronda" las reabre todas (app/(backoffice)/score-entry/actions.ts:288-338,343-410).
36. Cierre de grupo match play: `minHolesRequired = 0`. El resultado oficial vive en `matchplay_matches`, no en hole_scores, y hay BYEs y matches decididos antes del 18 (lib/score-entry/closeMatchPlayGroupRound.ts:150-154).
37. Cierre oficial de ronda del torneo (banner del comite) escribe `tournaments.settings` y requiere que ningun jugador quede sin tarjeta cerrada en su categoria; solo super_admin/club_admin/tournament_director (app/(backoffice)/score-entry/actions.ts:972-1013).
38. Grupo de consolacion stroke: si `pairing_groups.notes` empieza con "STROKE AGREGADO", se anula el estado de match play (`strokeOnly=true`) y las ventajas se recalculan absolutas por jugador: `base = floor(PH/18)`, `extra = PH % 18`, y el hoyo recibe `base + (stroke_index <= extra ? 1 : 0)`. El PH se lee de la inscripcion (`playing_handicap_override` sobre `playing_handicap`), no del match (lib/captura/loadGroupCapture.ts:415-497, fix fe126ad).
39. Firma remota por token (sistema formal viejo): token = dos UUID sin guiones, expira en 24 h por defecto y solo sirve con `status='pending'` (lib/scorecards/create-signature-request.ts:39-40; lib/scorecards/get-signature-request-by-token.ts:37-45).
40. En ese sistema el lock requiere las TRES firmas (player + marker + witness) y valida 18 hoyos antes de escribir `locked_at` (app/(backoffice)/scorecards/actions.ts:121-152).
41. Calcuta (match play individual o parejas, variante distinta de "ryder") oculta el pad de firma con el dedo: bastan los botones Firmar/Testigo (app/(backoffice)/score-entry/mobile/page.tsx:1154-1159,1213-1216).
42. En el teclado "anotar por hoyo" la fila del jugador identificado usa el id sintetico `ME_ID = "__me__"` y escribe a `/api/captura/private-score`, no al score oficial (app/(backoffice)/score-entry/mobile/page.tsx:1067,1618-1640). El 0 siempre esta en el teclado y la X (levanto) es tecla aparte que guarda 10 (commit 54134e9).
43. El poll no sobreescribe mientras hay guardados en vuelo ni mientras un input de score tiene el foco (app/captura/grupo/GrupoCaptureClient.tsx:157,931; app/(backoffice)/score-entry/mobile/page.tsx:1230).

## Flujos
### 1. Capturar un hoyo desde el campo
1. El comite manda el link por Telegram: `buildGroupCaptureUrl` arma `/captura/tarjeta?group_id=…&me=<entry>&caddie=<caddie>` (lib/score-entry/groupCaptureUrl.ts:53-79) desde app/(backoffice)/captura-telegram/actions.ts:264.
2. `app/captura/tarjeta/page.tsx` (o `/captura/grupo`, o `/captura/mobile`) llama `loadGroupCapture` con service role y renderiza el payload.
3. El cliente decide `mode` (`approve`/`modify`) y `role` segun autoridad y hace POST a `/api/captura/score`.
4. `resolveScoreActor` identifica al actor; `saveGroupHoleScore` valida rango, ronda por fecha, pertenencia al grupo y lock; upsert/delete en `hole_scores`; recalcula `gross_score`; escribe `hole_score_audit`.
5. `tryAutoCloseMatchForGroup` intenta cerrar el match (best-effort).
6. Todas las UIs pollean `/api/captura/group` cada 2000–2500 ms y fusionan con lo local (TarjetaCaptureClient.tsx:814; GrupoCaptureClient.tsx:969; score-entry/mobile/page.tsx:1412).

### 2. Firmar y cerrar la tarjeta en el campo
1. El jugador completa hasta `holesRequired` sin celdas rojas; la UI habilita "Firmar" y "Testigo".
2. POST `/api/captura/sign` con `{group_id, entry_id, role, me}`.
3. El route valida ronda no cerrada por fecha, hoyos completos y la identidad (propio jugador / pareja / rival / testigo asignado).
4. `saveCardSignature` escribe `card_signatures` (en parejas cubre compañero y atestigua al lado rival).
5. Para cada entry tocado corre `lockScorecardIfSignedAndComplete`: con las dos firmas y los hoyos completos escribe `scorecards.locked_at` y `status='locked'`.
6. Desde ese momento `saveGroupHoleScore` rechaza toda captura publica de ese entry en esa ronda; el leaderboard oficial ya la considera.

### 3. Corregir desde la mesa
1. `/score-entry` busca al jugador y resuelve su ronda por categoria (`resolveEntryCaptureRound`); si la ronda previa no esta cerrada en su categoria, o no se cerro oficialmente en el comite, no deja capturar (actions.ts:586-620).
2. Si la tarjeta esta cerrada: "Abrir ronda" (`save_mode=open_round`) quita `locked_at` en la ronda y sus hermanas.
3. Se editan los 18 hoyos y se guarda: borra e reinserta `hole_scores`, recalcula gross y corre `syncCaptureToEntryRound` (alinea a la ronda de la categoria y poda duplicados).
4. "Guardar y cerrar" exige 18 hoyos, cierra la tarjeta con firmas de staff y revalida `/score-entry`, `/leaderboard` y la pagina publica del torneo.

## Invariantes y trampas
- **Identidad = parametro de URL.** No hay auth en las rutas publicas: quien tenga el link con `?me=` de otro jugador captura y firma como el. `?me=` solo se valida contra la membresia del grupo (lib/captura/loadGroupCapture.ts:339-340). Si se endurece esto, hay que cambiar tambien resolveActor y private-score.
- **El orden de guardado importa:** buscar/crear `round_scores` → upsert `hole_scores` → recalcular `gross_score` → bitacora. Saltarse el paso 3 deja el leaderboard desfasado; hacerlo antes del paso 2 calcula con datos viejos (lib/captura/saveGroupHoleScore.ts:183-320).
- **`rounds` tiene una fila por categoria.** De ahi vienen los "misaligned": captura en la ronda de otra categoria, tarjeta cerrada en la categoria equivocada, o 18 hoyos sin cierre en la ronda correcta (lib/rounds/resolveRoundForEntry.ts:14-24; lib/scorecards/listMisalignedLockedScorecards.ts:32-34). Nunca uses el `round_id` de la sesion de la UI para cerrar: resuelvelo por categoria + `round_no`.
- **`hole_scores` tiene columnas duplicadas** `hole_no` y `hole_number`; hay que escribir las dos siempre (saveGroupHoleScore.ts:266-267,282-283) porque los lectores usan una u otra (`normalizeHoleNumber` prefiere `hole_no`, loadGroupCapture.ts:90-97; `findExistingHoleRow` prefiere `hole_number`, saveGroupHoleScore.ts:61-71).
- **Dos caminos de lectura de hole_scores:** por `round_id`+`entry_id` (loadGroupCapture.ts:230-236) y por `round_score_id` (countHolesOnPlayerRound.ts:28-31). Una fila sin `entry_id`/`round_id` es invisible para la captura pero cuenta para el cierre, y al reves.
- **El guardado del backoffice destruye estado de campo:** `savePlayerScores` borra todos los `hole_scores` del `round_score_id`, incluidos los hoyos 19–27 de desempate, y pierde `picked_up` y `pending_witness` (actions.ts:786-796). Igual `alignCaptureToScorecardRound`, que solo copia hoyos 1–18 con strokes (alignCaptureToScorecardRound.ts:99-101,169-183).
- **Cerrar una ronda cierra las hermanas.** `staffCloseRoundScorecard` crea `scorecards` en todas las rondas del mismo `round_no` y las cierra (actions.ts:311-338). Eso es lo que genera tarjetas fantasma en categorias ajenas que despues limpia `prune-ghost-scorecards`.
- **Fixes historicos que explican el codigo:** `b1d2f4a` cerro rondas viejas por fecha y bloqueo edicion/firma publica; `f490e1e` corrigio que en parejas el testigo debia ser el rival; `511c691` evita que el poll borre una celda pendiente cuando el remoto viene vacio (loadGroupCapture.ts:277-282, TarjetaCaptureClient.tsx:757-766); `14b2546` introdujo `inFlightCountRef` + optimismo con TTL de 12 s porque el poll pisaba scores al anotar rapido (score-entry/mobile/page.tsx:1172,1230,1348-1381); `fa20dfe` volvio el lock evaluable por ronda; `fe126ad` separo la consolacion stroke del estado de match play.
- **`isRoundClosedByDate` compara strings de fecha.** Un `round_date` con hora o con otro formato rompe la comparacion y deja la ronda abierta para siempre (roundClosure.ts:19-20).
- **El par esta hardcodeado** en `PAR_BASE` dentro de lib/captura/loadGroupCapture.ts:32-51 (par del CCQ). No se lee de `tournament_holes` ni `course_holes`: en otro campo las marcas de birdie/bogey de la captura salen mal.
- **`healPairCardSignatures` corre en cada load del grupo** y escribe en `card_signatures`. Un GET de captura no es de solo lectura (loadGroupCapture.ts:314-321).
- **Dos sistemas de firma coexisten** y no se sincronizan: `card_signatures` (campo, 2 firmas, cierra por `locked_at`) y `scorecard_signatures` + `scorecard_signature_requests` (mesa/token, 3 firmas). Solo el primero se usa desde la mini app.
- **Scripts de reparacion y el problema real que atacaban** — todos por `npx tsx`, requieren `SUPABASE_SERVICE_ROLE_KEY`:
  - `scripts/audit-locked-scorecards.ts`: diagnostico. Cierres en categoria equivocada y jugadores con 18 hoyos sin cierre en su ronda correcta.
  - `scripts/repair-invalid-locked-scorecards.ts`: tarjetas con `locked_at` y menos de 18 hoyos entraron al leaderboard oficial; las reabre (`locked_at=null`, `status='open'`).
  - `scripts/restore-round-locks.ts`: tras limpiar cierres mal ubicados quedaban jugadores con 18 hoyos sin cierre; vuelve a cerrar R{n} en la ronda de su categoria.
  - `scripts/prune-ghost-scorecards.ts`: borra `scorecards` (y poda `round_scores` huerfanos) en rondas cuya categoria no es la del inscrito — las fantasmas que crea el cierre de hermanas.
  - `scripts/repair-tournament-captures.ts`: mueve los `hole_scores` al `round_id` de la categoria del inscrito. Tambien expuesto en UI (`repairTournamentCapturesAction`, actions.ts:905).

## Deuda y preguntas abiertas
- `app/(backoffice)/scorecards/page.tsx` es una pagina de PRUEBA con `REAL_TOURNAMENT_ID`, `REAL_ROUND_ID` y `REAL_ENTRY_ID` hardcodeados (lineas 17-19). No sirve para operar.
- El sistema formal (`scorecard_signatures`, `scorecard_signature_requests`, `scorecard_audit_log`, `lib/scorecards/helpers.ts` con `getNextStatusAfterSignature` y los estados `in_review`/`disputed`/`needs_staff_review`) esta a medias: los estados casi no se usan y el flujo real cierra por `card_signatures`. Candidato a codigo muerto salvo `/sign/scorecard/[token]`.
- Ninguna de las tres tablas de ese sistema esta en migraciones; su esquema solo se puede inferir de lib/scorecards/types.ts.
- No hay soporte offline real: cero `localStorage`, cero service worker, cero manifest en `public/`. La "PWA" es una web movil que depende de red; sin señal el score se pierde con "Error de red al guardar" (TarjetaCaptureClient.tsx:944). ATENCION SIN VERIFICAR: es posible que se apoye en el cache del webview de Telegram, pero no hay codigo que lo gestione.
- `lib/scorecards/RemoteSignForm.tsx` vive en `lib/` en lugar de `components/`.
- `app/(backoffice)/rounds/page.backup.tsx` y `app/torneos/[id]/page.backup.tsx` son archivos de respaldo en el arbol.
- `private_hole_scores` tiene RLS activo sin ninguna policy: solo service role escribe/lee. Si algun dia se quiere realtime del lado del cliente hay que escribirlas (20260527230000_witnesses_and_private_scores.sql, comentario final).
- `hole_score_audit` no guarda `group_id` ni el hoyo fisico del desempate por separado; la UI de auditoria solo pinta hoyos 1–18 (`HOLES_ALL`, app/(backoffice)/captura-telegram/AuditCaptureModal.tsx:37).
- Pregunta abierta: `staffCloseRoundScorecard` cierra las rondas hermanas a proposito, pero `prune-ghost-scorecards` las borra. No esta claro cual de los dos comportamientos es el deseado hoy.
- Pregunta abierta: `lockScorecardIfSignedAndComplete` exige `strokes != null`; un hoyo marcado solo como `picked_up` sin strokes (fila creada por codigo viejo) impediria el cierre.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[torneos-setup]] · [[tee-sheet-salidas]] · [[matchplay]] · [[handicap-whs]] · [[resultados-cortes-premios]] · [[ritmo-juego]] · [[telegram]] · [[distancias-gps]] · [[fb-restaurante]] · [[mobile-watch]] · [[calcuta-subasta]]

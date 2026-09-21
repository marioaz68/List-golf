---
titulo: "Match play: cuadros, matches y consolaciones"
modulo: matchplay
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# Match play: cuadros, matches y consolaciones

## Que resuelve
Torneos de eliminacion directa por parejas (Calcuta 64 del CCQ) y Copa Ryder por sesiones.
Arma el cuadro desde la subasta o desde las salidas de R1, decide cada hoyo con ventajas WHS,
detecta cuando un match ya esta matematicamente cerrado (3&2, dormie, muerte subita en hoyos extra),
avanza al ganador y le crea la salida de la ronda siguiente con su tee time y aviso por Telegram.
Ademas maneja los dos premios de consuelo: consolacion match play (perdedores de cuartos) y
consolacion stroke play agregado por parejas (todos los demas eliminados), mas el partido por 3er/4to lugar.

## Mapa de archivos

| Ruta | Que hace | Lineas |
|---|---|---|
| lib/matchplay/scoring/lowHigh.ts | Motor Bola Baja + Bola Alta: ventajas por carril, puntos por hoyo, cierre matematico | 364 |
| lib/matchplay/scoring/singles.ts | Motor individual (Ryder singles): 1 pt/hoyo, notacion 3&2 / 1 UP / AS | 285 |
| lib/matchplay/deriveMatchHolesFromStrokes.ts | Recalcula todo el match desde `hole_scores` brutos + playoff 19-27 | 580 |
| lib/matchplay/closeAndAdvance.ts | Orquestador de cierre: match real, ganador, avance, consolacion, 3er lugar, Telegram | 529 |
| lib/matchplay/consolationMatchPlay.ts | Cuadro de consolacion MP, ruteo de perdedores, salidas R5/R6, orden de grupos | 1024 |
| lib/matchplay/consolationStrokePlay.ts | Foursomes de consolacion stroke agregado por genero | 345 |
| lib/matchplay/strokeAggregateStandings.ts | Clasificacion neta por pareja + cadena de desempates de retrocesion | 759 |
| lib/matchplay/advanceWinner.ts | Coloca ganador en el slot siguiente + candados Ryder + cascada BYE | 320 |
| lib/matchplay/maybeCreateNextRoundGroup.ts | Crea/actualiza el `pairing_group` de la ronda siguiente y su tee time | 337 |
| lib/matchplay/generateSingleElimBracket.ts | Draw estandar 1vN por seeds, BYE vs Vacio, cascada controlada | 188 |
| lib/matchplay/autoPublishBracketFromPairings.ts | Regenera el cuadro tomando los grupos de R1 como matches R1 | 433 |
| lib/matchplay/resolveUnplayableMatchByes.ts | Limpia parejas fantasma y evita BYE/avance prematuro | 274 |
| lib/matchplay/loadMatchForScoring.ts | Carga un match oficial con hoyos, PH y fallback a stroke play | 685 |
| lib/matchplay/buildLiveStrokeSnapshot.ts | Snapshot en vivo para las vistas publicas (matches + hoyos + result_text) | 361 |
| lib/matchplay/ensureMatchPlayCalendarRounds.ts | Calendario Calcuta jueves-domingo y tee times fijos del domingo | 434 |
| lib/matchplay/thirdPlaceMatch.ts | Partido 3er/4to (ronda final, position_no=2) | 452 |
| lib/matchplay/derivePairingGroupMatches.ts | Matches "derived-" desde salidas cuando aun no hay bracket | 226 |
| lib/matchplay/pickStrokeRoundForMatch.ts | Elige la ronda de captura correcta (evita tarjetas frankenstein) | 96 |
| lib/matchplay/loadPrintableMpScorecards.ts | Tarjetas imprimibles MP (puntos de ventaja, 3er/4to, consolaciones) | 1248 |
| lib/ryder/loadRyderPublic.ts | Copa Ryder: sesiones, marcador, puntos por partido, resultado de copa | 623 |
| app/(backoffice)/matchplay/actions.ts | Server actions: equipos, subasta, generar/publicar cuadro, capturar match | 1683 |
| app/torneos/[id]/cuadro-vivo/LiveBracketView.tsx | Cuadro publico en vivo (la BD manda en R>=2) | 1873 |
| app/torneos/[id]/matches-vivo/MatchDetailModal.tsx | Detalle hoyo a hoyo con ventajas en amarillo y netos | 1949 |
| app/torneos/[id]/ryder/RyderMatchDetail.tsx | Detalle de match Ryder con tarjeta de brutos | 1952 |
| lib/matchplay/usgaAllowances.ts | Tabla USGA de allowances por formato + handicap combinado de pareja | 180 |

## Tablas de Supabase

| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| tournament_matchplay_rules | Reglas del torneo: formato, allowance, hoyos, tamano de cuadro, WHS, `config_json` con consolaciones | 20260522120000_matchplay.sql (+180000 caps, +25170000 WHS) |
| matchplay_pair_teams | Parejas/equipos inscritos: entries A/B, `combined_hi`, `seed`, `auction_bid`, `auction_order` | 20260522120000_matchplay.sql (+140000, +150000) |
| matchplay_brackets | Cuadro por torneo. Nombre "Principal" o "Consolación Match Play"; `config_json.bracket_size` | 20260522120000_matchplay.sql |
| matchplay_matches | Cada partido: `round_no`, `position_no`, top/bottom/winner pair, `status`, `result_text`, `next_match_id` | 20260522120000_matchplay.sql |
| matchplay_hole_results | Resultado por hoyo: strokes por jugador, `top_points`/`bottom_points`, `detail_json.breakdown` | 20260522120000 + 20260522170000_matchplay_low_high_scoring.sql |
| matchplay_sessions | Sesiones de Copa Ryder (`scoring_format`, `round_id`, `points_per_match`, `start_tees`) | no (creada en Supabase) |
| matchplay_ryder_cups | Copa por categoria: nombre, edicion, `retain_on_tie`, serie historica | no (creada en Supabase) |
| matchplay_ryder_scoreboard | Marcador por equipo/lado con `puntos_totales` y `puntos_para_ganar` | no (creada en Supabase) |
| tournament_entries | `course_handicap`, `playing_handicap`, `playing_handicap_override`, `handicap_calc_meta` | 20260525170000_matchplay_whs_handicap.sql |
| private_hole_scores | Permite hoyos 1..27 para el desempate (19-27 = repeticion de 1-9) | 20260528230000_matchplay_playoff_holes.sql |
| pairing_groups / pairing_group_members | Salidas del match play; `notes` es la clave de identidad del cruce | no (creada en Supabase) |
| rounds / hole_scores / round_scores / scorecards | Captura stroke play de la que se derivan los puntos del match | no (creada en Supabase) |

ATENCION SIN VERIFICAR: `matchplay_ryder_scoreboard` se lee con `select("*")` y expone columnas agregadas
(`categoria_code`, `puntos_totales`, `puntos_para_ganar`, `campeon_vigente`) — probablemente es una vista, no una tabla base.
ATENCION SIN VERIFICAR: `matchplay_matches.session_id`, `is_halved`, `points_top`, `points_bottom` se usan en codigo
(`lib/matchplay/advanceWinner.ts:38`, `app/(backoffice)/matchplay/actions.ts:1393`) pero no aparecen en ninguna migracion.

## Reglas de negocio

1. Solo se procesa match play si `tournaments.settings.format.format_type === "matchplay"` — `lib/matchplay/tournamentFormat.ts:21`.
2. El motor de parejas exige `tournament_matchplay_rules.pair_format === "low_high"`. Cualquier otro formato aborta el calculo (retorna vacio) — `lib/matchplay/deriveMatchHolesFromStrokes.ts:111`, `lib/matchplay/closeAndAdvance.ts:117`, `lib/matchplay/loadMatchForScoring.ts:120`.
3. PH efectivo por jugador, en este orden: `playing_handicap_override` → `playing_handicap` guardado → calculo WHS del contexto del torneo. Nunca se re-aplica el % sobre un PH ya guardado — `lib/matchplay/resolveEntryPhForMatch.ts:25-51`.
4. WHS: `CH = round(HI × Slope/113 + (CR − Par))`, luego `PH = round(CH × Allowance%/100)`. Slope/CR/Par por sexo viven en `tournament_matchplay_rules.whs_*` (slope 55-155, CR 50-90, par 60-80) — `supabase/migrations/20260525170000_matchplay_whs_handicap.sql:1-40`, `lib/handicap/whs.ts:6`.
5. Allowance resuelto: `scratch`→0; `custom`→`handicap_allowance_pct` si es finito y >=0; `full_relative`→100; si no, `match_play_pct` de la tabla USGA — `lib/matchplay/scoring/resolveHandicapPct.ts:9-39`. Tabla: individual 100%, fourball 90%, low_high 90% (con `custom_pct: 80` como valor CCQ), foursomes 50%, greensome/chapman 60% — `lib/matchplay/usgaAllowances.ts:29-95`.
6. **Ventajas low/high (pareja vs pareja).** En cada pareja el de menor PH es la "bola baja" (empate ⇒ el jugador A es el bajo). Se comparan dos carriles independientes: bajo-vs-bajo y alto-vs-alto. En cada carril, el jugador con PH mayor recibe la diferencia entera; el otro recibe 0. Un jugador solo recibe golpes de su carril, nunca de los dos — `lib/matchplay/scoring/lowHigh.ts:70-99`.
7. **Ventajas individuales.** El de PH mas alto recibe la diferencia entera; el mas bajo juega scratch relativo — `lib/matchplay/scoring/singles.ts:55-61`.
8. Golpes recibidos en un hoyo: `floor(PH/18) + (SI(hoyo) <= PH mod 18 ? 1 : 0)`. SI viene de `tournament_holes.handicap_index` con fallback a `course_holes`; si falta, SI = numero de hoyo clampeado 1..18 — `lib/leaderboard/handicapStrokes.ts:34-54`, `lib/matchplay/loadCourseLayout.ts:22`.
9. **Como se decide un hoyo en low/high.** Cada hoyo reparte hasta 2 puntos: 1 al ganador neto del carril bajo y 1 al del carril alto. Empate en un carril reparte 0.5-0.5 — `lib/matchplay/scoring/lowHigh.ts:128-135`, `:240-256`.
10. En individual cada hoyo reparte 1 punto; empate 0.5-0.5 — `lib/matchplay/scoring/singles.ts:69-76`.
11. **Levanto la bola (X / `picked_up`).** Su net es +infinito, cae automaticamente a la bola alta y pierde su carril. 1 X: pierde su carril. 2 X en la misma pareja: la rival barre los 2 puntos. 3 X (solo uno termino): 1 punto para la pareja del que termino y 0 para la otra, sin repartos fraccionales. 4 X: 0-0, hoyo sin puntos — `lib/matchplay/scoring/lowHigh.ts:174-183`, `:239-253`. En individual, si ambos levantan el hoyo es 0-0 — `lib/matchplay/scoring/singles.ts:162-172`.
12. Un hoyo solo se calcula si los 4 jugadores (2 en individual) tienen `strokes` o bandera `picked_up`. Si falta uno, el hoyo se salta y no rompe la secuencia — `lib/matchplay/scoring/lowHigh.ts:192-200`, `lib/matchplay/deriveMatchHolesFromStrokes.ts:377-384`.
13. **Match decidido.** Se cierra cuando `|diff| > hoyos_restantes × puntos_por_hoyo` (2 en low/high, 1 en individual). Dormie exacto (diff == restantes×pts) NO cierra: todavia se puede empatar — `lib/matchplay/scoring/lowHigh.ts:324-338`, `lib/matchplay/scoring/singles.ts:235-249`.
14. Tras la decision, los hoyos posteriores se siguen capturando para stroke play pero se registran con 0-0 y estado `Decidido en H{n}` — `lib/matchplay/deriveMatchHolesFromStrokes.ts:390-400`.
15. Notacion de cierre individual: `3&2` (3 arriba, 2 por jugar), `1 UP` al 18, `AS` si empate, `Desempate H{n}` via playoff — `lib/matchplay/scoring/singles.ts:258-285`. En low/high: `H{n} · {lead} arriba · {pts} por jugar` con `pts = restantes × 2` — `lib/matchplay/closeAndAdvance.ts:54-71`, `lib/matchplay/scoring/lowHigh.ts:346-364`.
16. **Desempate (muerte subita).** Si al hoyo 18 hay empate y se repartio al menos 1 punto, se juegan los hoyos fisicos 1-9 y se guardan como 19-27. Las ventajas y el SI usan el hoyo fisico via `playoffSourceHole(h) = h-18` — `lib/matchplay/scoring/lowHigh.ts:9-12`, `:208`. El match termina en el primer hoyo del playoff donde `top_points !== bottom_points`; un 1-1 (split de carriles) o 0-0 sigue empatado y se pasa al siguiente — `lib/matchplay/deriveMatchHolesFromStrokes.ts:447-566`. `holes_played` guardado = `18 + playoff_hole` — `lib/matchplay/closeAndAdvance.ts:265-267`.
17. En Copa Ryder NO hay muerte subita: un AS al 18 cierra el partido y reparte medio punto por lado — `lib/ryder/loadRyderPublic.ts:131-153`, `:243-244`.
18. Ryder: cada partido aporta como maximo `matchplay_sessions.points_per_match` a la copa (1 individual, 2 parejas). Quien va arriba se lleva el match completo; empate = mitad cada uno. Nunca se suman los puntos de hoyo al marcador de copa — `lib/ryder/loadRyderPublic.ts:343-357`.
19. Ryder: la copa se define cuando un lado alcanza `puntos_para_ganar`; si se reparten todos los puntos empatado, aplica `tie_label`/`retain_on_tie` — `lib/ryder/loadRyderPublic.ts:367-399`.
20. **Tamano del cuadro.** Siempre potencia de 2 entre 8 y 64: `fieldBracketSize(unidades)` (36 parejas → 64; menos de 8 → 8) — `lib/matchplay/bracketUtils.ts:19-34`. Unidades = `max(equipos activos, floor(inscritos/2))` en parejas, o inscritos en individual, excluyendo status withdrawn/cancelled/wd — `:36-57`, `lib/matchplay/syncFieldBracketSize.ts:22`.
21. Draw estandar recursivo 1 vs N, 8 vs 9, etc. — `lib/matchplay/bracketUtils.ts:2-16`. Etiquetas por slots de la ronda: Final / Semifinal / Cuartos / Octavos / Dieciseisavos — `:65-77`.
22. Siembra: `auction` ordena por `auction_bid` desc, empate por `auction_order` asc, luego `seed`; `hi_combined` por seed y luego HI combinado; `random`; `manual` por seed y nombre — `lib/matchplay/sortTeamsForSeeding.ts:26-62`.
23. **BYE vs Vacio.** Un slot de R1 con una sola pareja es `status: "bye"`, `result_text: "BYE"`, con `winner_pair_id`. Un slot sin ninguna pareja es `status: "bye"` con `result_text: "Vacío"` y SIN ganador — `lib/matchplay/generateSingleElimBracket.ts:31-46`.
24. La cascada de ganadores solo aplica a un match de R>=2 cuando AMBOS feeders terminaron: feeder terminado = tiene `winner_pair_id`, o es un shell estructural vacio (`bye` + sin parejas + `result_text === "Vacío"`) — `lib/matchplay/generateSingleElimBracket.ts:68-94`, `lib/matchplay/resolveUnplayableMatchByes.ts:22-43`.
25. Slot destino del ganador: `next_round = round_no + 1`, `next_position = floor((position_no-1)/2)+1`, y ocupa el lado top si `(position_no-1) % 2 === 0` — `lib/matchplay/advanceWinner.ts:150-182`.
26. Pareja "jugable" = activa y con al menos un `entry_id`. Una pareja fantasma en un slot se limpia y cuenta como BYE del rival — `lib/matchplay/playablePairTeam.ts:10-18`, `lib/matchplay/advanceWinner.ts:271-320`.
27. Trigger de BD: un equipo con `player_a_entry_id` NULL (o sin B cuando `match_type='pairs'`) se auto-desactiva (`is_active=false`) — `supabase/migrations/20260523150000_matchplay_auto_deactivate_orphans.sql`. Un inscrito solo puede estar en un equipo activo por torneo (indices unicos parciales) — `20260522130000_matchplay_team_entry_unique.sql`.
28. La salida de la ronda siguiente se crea solo cuando el match siguiente ya tiene AMBAS parejas y las 4 entries; `group_no = position_no` (desplazado por los grupos de consolacion ya presentes) y `tee_time = start_time + (group_no-1) × interval_minutes` (default 10 min) — `lib/matchplay/maybeCreateNextRoundGroup.ts:89-175`.
29. En la ronda final el orden es: consolacion, luego 3er/4to (`position_no=2`), luego la final (`position_no=1`) — `lib/matchplay/maybeCreateNextRoundGroup.ts:166-171`, `lib/matchplay/consolationMatchPlay.ts:143`.
30. La identidad de una salida de match play son sus `notes`, no su `group_no`: `MATCH PLAY · #a vs #b`, `CONSOLACIÓN MP · …`, `STROKE AGREGADO · …`, `3ER LUGAR MP · …`. Se reusa el grupo por notas y se respeta el `tee_time` que el comite haya ajustado — `lib/matchplay/maybeCreateNextRoundGroup.ts:223-268`.
31. Crear/actualizar una salida marca la ronda como orden confirmado insertando `[LIST_GOLF_STARTING_ORDER_CONFIRMED]` en `rounds.notes`, lo que la hace visible en el tee sheet publico — `lib/matchplay/confirmMatchPlaySalidasPublished.ts:7-30`.
32. **Calendario Calcuta 64** (6 rondas, intervalo 12 min): R1 jue 07:00, R2 jue 11:00, R3 vie 11:00, R4 sab 07:00, R5 sab 11:00, R6 dom. Domingo con horarios fijos: stroke agregado 08:00 salida hoyo 10, consolacion MP 09:30 hoyo 1, 3er/4to 09:42, final 09:54 — `lib/matchplay/ensureMatchPlayCalendarRounds.ts:13-82`.
33. **Consolacion match play.** Se activa con la regla de `config_json.consolations` que tenga `enabled && consolation_format === "match_play"`. Solo los perdedores de `from_round_no` entran (en Calcuta = 4, cuartos). Se rutean con la misma geometria del cuadro: posiciones 1-2 → consol match 1, etc. — `lib/matchplay/consolationMatchPlay.ts:30-50`, `:599-660`.
34. Las salidas de consolacion MP nunca caen en la misma ronda AM del cuadro principal: si la ronda del cuadro de consolacion es < `mainRoundCount` va a `max(mainRoundCount-1, 5)`; si es >= va a `mainRoundCount` — `lib/matchplay/consolationMatchPlay.ts:273-311`.
35. Si el `group_no` destino de consolacion lo ocupa otro grupo (ej. una semifinal), ese grupo se aparca en un slot alto y `reconcileRoundGroupOrder` reordena la ronda como stroke → consolacion → 3er lugar → resto, resincronizando tee times — `lib/matchplay/consolationMatchPlay.ts:104-177`, `:453-481`.
36. El campeon de consolacion sale cuando `round_no >= mainRoundCount`: no hay mas rondas — `lib/matchplay/consolationMatchPlay.ts:763-775`.
37. **Consolacion stroke agregado.** Participan las parejas que ya perdieron en cualquier cuadro y NO tienen ningun match pendiente. La regla no depende del numero de ronda: el perdedor de semifinal queda fuera porque le toca el 3er/4to, y quien cayo a la consolacion MP entra solo si tambien perdio ahi — `lib/matchplay/consolationStrokePlay.ts:24-55`.
38. Se agrupan por genero (`players.gender` M/F, resto "Mixto") en foursomes aleatorios de 4 en la ultima ronda, con `starting_hole = 10` y tee base 08:00 cada 12 min — `lib/matchplay/consolationStrokePlay.ts:273-324`.
39. Clasificacion stroke agregado: se ordena por la SUMA del neto sobre par de los 2 jugadores (menor mejor). Las parejas con ambos jugadores van primero, las incompletas despues, las vacias al final — `lib/matchplay/strokeAggregateStandings.ts:668-700`.
40. Desempate stroke agregado (retrocesion neta, en orden): hoyos 10-18, 13-18, 16-18, 18, 1-9, 4-9, 7-9, 9. Opcionalmente `lowest_hi` (HI combinado) y `drawing_lots` — `lib/matchplay/types.ts:94-103`, `lib/matchplay/strokeAggregateStandings.ts:154-299`. Si existe un perfil `tie_break_profiles` llamado "Consolación stroke · …" con pasos, ese gana sobre la secuencia por defecto — `:213-238`.
41. Los perfiles de desempate de consolacion se siembran al aplicar la convocatoria, con neto al 80% (`handicap_mode: course`) — `lib/matchplay/seedConsolationTieBreak.ts:25-56`, llamado desde `lib/matchplay/applyMatchPlayDraft.ts:321`.
42. **3er/4to lugar.** Se crea al cerrar una semifinal (`round_no === roundCount-1`) como match del cuadro principal en la ronda final con `position_no = 2`; el perdedor de la semi 1 va arriba y el de la semi 2 abajo. Requiere cuadro >= 4 — `lib/matchplay/thirdPlaceMatch.ts:11-20`, `:118-200`, `:53`.
43. **Copa Ryder nunca avanza en bracket.** Cualquier `matchplay_matches.session_id` no vacio bloquea el avance, y tampoco se rutea a consolacion ni a 3er/4to. Ademas se detecta torneo Ryder por existir filas en `matchplay_sessions` o `matchplay_ryder_cups` — `lib/matchplay/advanceWinner.ts:29-82`, `:134-146`, `lib/matchplay/closeAndAdvance.ts:300-318`.
44. Cierre idempotente: si el match ya esta `completed` con el mismo ganador, se reintentan solo los pasos de avance y salidas; si esta `completed` con OTRO ganador, se aborta con error y hay que reabrir desde `/matchplay` — `lib/matchplay/closeAndAdvance.ts:249-263`.
45. Si al cerrar no hay cuadro publicado, se intenta publicar automaticamente con `autoPublishOnAuctionComplete`; falla con "Faltan N pareja(s) por adjudicar" si la subasta esta incompleta (`auction_order` null) — `lib/matchplay/closeAndAdvance.ts:126-173`, `lib/matchplay/autoPublishOnAuctionComplete.ts:48-51`.
46. Validacion de pareja: ambos inscritos con status `confirmed`, sin repetir el mismo entry, con topes individuales de HI por genero (`male_individual_hi_max`, `female_individual_hi_max`) y `combined_hi` redondeado a 1 decimal — `lib/matchplay/validateTeam.ts:24-80`. Si la suma excede el `handicap_max` de la categoria, se recorta el HI del jugador mas alto — `lib/matchplay/capPairToCategory.ts:32-50`.
47. La captura (PWA) intenta cerrar el match automaticamente en cada guardado de hoyo; no lo intenta si `needsPlayoff` o si aun no esta decidido — `lib/matchplay/tryAutoCloseMatchForGroup.ts:31-57`, llamado desde `app/api/captura/score/route.ts:121`.
48. Reabrir una ronda de match play revierte el cierre: match a `in_progress` sin ganador, quita al ganador del slot siguiente y borra la salida auto-generada `MATCH PLAY …` — `lib/matchplay/revertMatchAdvanceForGroup.ts:14-20`, `lib/score-entry/reopenMatchPlayGroupRound.ts:40`.

## Flujos

### 1. Cierre de un match y avance del cuadro (`closeMatchAndAdvanceForGroup`)
1. `pairing_groups` → `rounds` para obtener `tournament_id` y `round_no` — `closeAndAdvance.ts:88-109`.
2. Valida `pair_format === "low_high"`; carga el bracket principal (excluye "Consolación Match Play") o lo publica — `:112-174`.
3. `derivePairingGroupMatches` arma el match sintetico `derived-{round_id}-g{group_no}` y saca las 2 `pair_id` — `:177-191`.
4. `findBracketMatchForPairs` localiza la fila real en el cuadro principal o de consolacion, en esa ronda o (con `allowOtherRounds`) en cualquier match `scheduled`/`in_progress` con ese cruce — `:195-212`, `consolationMatchPlay.ts:867-928`.
5. `deriveMatchHolesFromStrokes` recalcula desde `hole_scores`; sin decision se aborta ("todavia no esta matematicamente decidido") — `:228-239`.
6. UPDATE del match: `winner_pair_id`, `status: completed`, `result_text`, `holes_played` — `:276-290`.
7. Avance: Ryder → no-op; cuadro principal → `advanceWinnerInBracket` (+ cascada BYE + `maybeCreateNextRoundGroup`); cuadro de consolacion → `advanceConsolationWinner` — `:304-355`.
8. Ruteo del perdedor: `routeLoserToConsolationMp` (si `closedRoundNo === from_round_no`) y `routeLoserToThirdPlace` (si es semifinal) — `:359-454`.
9. Telegram best-effort al nuevo grupo (jugadores + caddies) con la nueva ronda y link a la tarjeta — `:475-490`, `notifyNextRoundGroup.ts`.

### 2. Live scoring publico
1. `MatchesLiveGrid` pide `GET /api/matchplay/live-from-strokes?tournament_id=` cada 4 s y ademas se suscribe a Realtime en `hole_scores`, `round_scores` (debounce 1.2 s), `matchplay_matches` (filtrado por `bracket_id`) y `matchplay_hole_results` — `MatchesLiveGrid.tsx:136`, `:174-290`.
2. `buildLiveStrokeSnapshot` combina el cuadro real con los derivados de salidas, sincroniza el 3er/4to y produce `result_text` por match — `buildLiveStrokeSnapshot.ts:186`, `:262-330`.
3. El detalle abre `GET /api/matchplay/match-detail?match_id=…`: UUID → `loadMatchForScoring`; `derived-*` → `loadDerivedMatchDetail` (requiere `tournament_id`) — `app/api/matchplay/match-detail/route.ts:60-90`.
4. `matchplay_matches`, `matchplay_brackets`, `matchplay_pair_teams` estan en la publicacion `supabase_realtime` desde `20260522160000_matchplay_realtime.sql`; `matchplay_hole_results` desde `20260524120000_matchplay_hole_results_realtime.sql`. `hole_scores` **no** esta garantizado en la publicacion — de ahi el polling.

### 3. Consolacion stroke agregado (domingo)
1. Comite pulsa "Stroke agregado" → `POST /api/matchplay/create-stroke-consolation` (`group_size`, `replace`) — `ConsolationActionsPanel.tsx:136`.
2. `createStrokeAggregateGroups` recolecta parejas sin match pendiente, agrupa por genero, inserta salidas con `notes` `STROKE AGREGADO · …`, reordena la ronda y confirma el orden de salida — `consolationStrokePlay.ts:99-336`.
3. `POST /api/matchplay/stroke-aggregate-move` mueve jugadores entre esas salidas sin tocar la final ni la consolacion MP de la misma ronda — `app/api/matchplay/stroke-aggregate-move/route.ts:1-70`.
4. `GET /api/matchplay/stroke-aggregate-standings` alimenta `/torneos/[id]/consolacion-stroke` (requiere `tournaments.is_public !== false`).

## Invariantes y trampas

- **`autoPublishBracketFromPairings` borra TODOS los brackets del torneo**, incluido "Consolación Match Play", antes de reinsertar el principal — `autoPublishBracketFromPairings.ts:319-332`. Reparar el cuadro despues de cuartos destruye la consolacion; hay que rehacerla con `POST /api/matchplay/backfill-consolation`.
- Nunca marcar BYE ni avanzar cuando el feeder hermano sigue abierto. Los commits `bf4f3d6` y `21f5a91` corrigieron exactamente esto: el cliente inventaba ganadores y llenaba semis/final antes de tiempo. En `LiveBracketView` para R>=2 **la BD manda**; solo si no existe la fila se hace un preview con ganadores reales — `LiveBracketView.tsx:842-860`.
- Un match con DOS parejas reales nunca puede quedar `status: "bye"` ni con `winner_pair_id` heredado de una cascada: `resolveUnplayableMatchByes` lo revierte a `scheduled` — `resolveUnplayableMatchByes.ts:150-172`.
- El cuadro publico se posiciona por **indice de columna**, no por `round_no` (commit `4f1e5f1`): la consolacion empieza en la ronda 5, y usar `gridColumn: roundNo` la sacaba del grid — `app/torneos/[id]/components/PublicMatchPlayBracket.tsx:82-86`, `:106-124`.
- PostgREST devuelve maximo 1000 filas. `hole_scores`, `round_scores` y `matchplay_hole_results` se paginan con chunks de 150 ids + `range`; sin eso las semifinales se quedaban sin marcador en vivo (commit `628ffd6`) — `deriveMatchHolesFromStrokes.ts:239-290`.
- No reutilizar "cualquier salida donde aparezcan >=2 jugadores del match": eso armaba tarjetas frankenstein en cuartos con scores de R3 (commit `1072f7b`). El grupo candidato debe contener a TODOS los jugadores y su `round_no` debe ser >= la ronda del cuadro — `pickStrokeRoundForMatch.ts:1-52`.
- Dormie no cierra el match. La condicion es `>` estricto, no `>=`, en los tres motores — `lowHigh.ts:334`, `singles.ts:245`, `loadRyderPublic.ts:150`.
- En el playoff, un hoyo 1-1 (cada pareja gana un carril) esta EMPATADO y se sigue jugando. Solo `top_points !== bottom_points` cierra — `deriveMatchHolesFromStrokes.ts:549-565`.
- `from_round_no` de la consolacion MP es dato de negocio en `config_json`, no derivado. En Calcuta estaba en 3 (octavos) y produjo 4 grupos prematuros; se corrigio a 4 con `scripts/fix-consol-mp-r4-calcuta.ts` (commits `f03cdc3`, `74cc7cb`) y hubo que enviar un aviso correctivo por Telegram (`scripts/send-consol-correction-telegram.ts`).
- Nunca escribir salidas de consolacion en la ronda AM del cuadro principal (commit `0e414a1`): los perdedores recibieron avisos de salida el sabado 07:00 que no existian.
- `reconcileRoundGroupOrder` renumera en dos pasadas (primero a `group_no` negativos temporales) para no chocar con la unicidad de `group_no` por ronda — `consolationMatchPlay.ts:143-158`.
- Con `handicap_allowance = "custom"` y `handicap_allowance_pct` NULL, low_high cae a `match_play_pct = 90`, no al 80% que usa el CCQ — `resolveHandicapPct.ts:20-23`, `usgaAllowances.ts:52-62`. Hay que guardar el 80 explicito.
- Si el SI del hoyo falta en `tournament_holes` y en `course_holes`, se usa el numero de hoyo como SI: las ventajas caen en hoyos equivocados sin fallar — `handicapStrokes.ts:45-54`.
- El cierre respeta los tee times que el comite ya ajusto: `maybeCreateNextRoundGroup` solo aplica la formula al crear el grupo o si no hay `tee_time` (commits `8d11529`, `61e8818`) — `maybeCreateNextRoundGroup.ts:244-268`.
- La consolacion publica muestra solo la ronda activa (la ultima con partidos de consolacion), no todas — commit `21cf1f9`, `loadConsolationMatchPlayPublic.ts:156-168`.
- Un match play que cierra en H14 (5&4) no es una captura retrasada: el ritmo de juego trata `completed`/`halved`/`walkover` como terminado — commit `a416eb2`, `lib/ritmo/captureLag.ts`.

## Deuda y preguntas abiertas

- `matchplay_hole_results.hole_winner` tiene CHECK a `('top','bottom','halved')` pero en low/high se escribe derivandolo de los puntos (`actions.ts:1565-1570`); no representa los dos carriles. El detalle real vive en `detail_json.breakdown`.
- `matchplay_hole_results.top_strokes`/`bottom_strokes` son legacy (columnas originales de la migracion); el flujo actual escribe null y usa las 4 columnas por jugador — `20260522170000_matchplay_low_high_scoring.sql`.
- `lib/matchplay/scoring/lowHigh.ts:44` (`relativePhInMatch`) y `lib/matchplay/completeBracketToChampion.ts` solo se usan en el ciclo de prueba: candidatos a codigo muerto. `lib/matchplay/loadPublicBracket.ts` y `loadBracketView.ts` son dos cargadores casi identicos del mismo cuadro para publico y backoffice.
- `playoffSourceHole` y `courseHandicapFromHi` estan duplicados literalmente en `scoring/lowHigh.ts:9` y `scoring/singles.ts:9`.
- El bloque de calculo de `nextTeeTime` con `parseHHMM`/`formatHHMM` esta copiado tres veces dentro de `closeAndAdvance.ts` (:396-415, :432-451) y otra vez en `consolationStrokePlay.ts:66-74` y `maybeCreateNextRoundGroup.ts:49-65`.
- `types.ts` declara formatos (`double_elim`, `round_robin`, `stroke_qualifier`, `foursomes`, `greensome`, `chapman`, `scramble`) y desempates (`extra_3_holes`, `lowest_hi`, `play_until_decided`) que ningun motor implementa: todo el runtime exige `low_high` o `singles`.
- `POST /api/matchplay/backfill-consolation`, `create-stroke-consolation`, `consolation-match` y `stroke-aggregate-move` **no verifican rol ni sesion** (solo `createAdminClient`), a diferencia de `auto-publish`, `repair-from-r1`, `decided-pending` y `run-test-cycle` que exigen `canAccessModule`.
- `scripts/fix-consol-mp-r4-calcuta.ts:16` y `scripts/send-consol-correction-telegram.ts:10` traen el `TOURNAMENT_ID` de Calcuta hardcodeado: son scripts de un solo uso, no herramientas.
- `app/torneos/[id]/page.backup.tsx` y `app/(backoffice)/rounds/page.backup.tsx` siguen en el repo.
- `matchplay_ryder_cups`, `matchplay_ryder_scoreboard`, `matchplay_sessions` y las columnas `session_id`/`is_halved`/`points_top`/`points_bottom` de `matchplay_matches` no tienen migracion: cualquier reconstruccion del esquema desde `supabase/migrations` deja Ryder roto.

## Relacionado

[[arquitectura]] · [[datos-y-seguridad]] · [[torneos-setup]] · [[tee-sheet-salidas]] · [[captura-scores]] · [[calcuta-subasta]] · [[handicap-whs]] · [[resultados-cortes-premios]] · [[ritmo-juego]] · [[telegram]]

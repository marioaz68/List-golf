---
titulo: Leaderboard, cortes, desempates y premios
modulo: resultados-cortes-premios
actualizado: 2026-09-20
tags: [modulo, golf-torneo]
---

# Leaderboard, cortes, desempates y premios

## Que resuelve
Convierte los golpes capturados hoyo por hoyo en la tabla que decide quien gana: posicion por categoria, gross vs neto vs Stableford, acumulado por rondas, quien pasa el corte, como se rompen los empates en el limite del cupo, que premios se anuncian y quien gano los "mas cerca de la bandera" en los pares 3. Tambien decide que se puede mostrar en publico: si la tarjeta no esta cerrada por el comite, la ronda no cuenta para el total oficial.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| app/torneos/[id]/page.tsx | Vista publica: orquesta TODO el pipeline (datos → reglas → leaderboard → cortes → premios) | 2244 |
| lib/cuts/computeCutLine.ts | Motor de corte: cupo, alcance de regla, exencion gross, merge y linea de corte | 585 |
| lib/leaderboard/roundCategoryMatch.ts | Resuelve que fila `rounds`/`round_scores` corresponde a un inscrito (multi-categoria) | 496 |
| lib/leaderboard/applyStandings.ts | Posiciones POS/MV por ronda, general y por categoria (base to-par) | 405 |
| lib/leaderboard/buildLiveLeaderboard.ts | Construye la fila base: 18 hoyos, OUT/IN/TOT, DQ, acumulados | 384 |
| lib/cercanos/loadClosestToPin.ts | Par 3 del torneo, grupos de captura y tablero publico de cercanos | 351 |
| lib/cuts/publicCutDisplay.ts | Ordena la tabla con la metrica del corte y pinta el divisor | 263 |
| lib/leaderboard/competitionScoring.ts | Stableford, neto por hoyo, to-par y acumulado por base de clasificacion | 250 |
| lib/leaderboard/competitionStandings.ts | Recalcula POS por categoria con la regla real (neto/puntos) | 248 |
| app/(backoffice)/cut-rules/actions.ts | Guarda `round_advancement_rules` (snapshot) con validaciones duras | 272 |
| app/(backoffice)/cercanos/actions.ts | Captura de distancias por grupo, firma del capturista y token del jugador | 247 |
| app/(backoffice)/prize-rules/actions.ts | Guarda `category_prize_rules` | 220 |
| app/(backoffice)/competition-rules/actions.ts | Guarda `category_competition_rules` (borra e inserta) | 218 |
| lib/cuts/cutRanking.ts | Rango de rondas del corte y valor de ranking por regla | 183 |
| lib/cuts/tieBreak.ts | Compara pasos de desempate por segmento de hoyos | 172 |
| lib/leaderboard/publicRoundScorePolicy.ts | Politica publica: solo tarjetas cerradas cuentan | 171 |
| lib/tournament-rules/collectRulesBlockers.ts | Bloqueadores: sin reglas no se muestra clasificacion | 151 |
| lib/leaderboard/competitionDisplay.ts | Encabezados TOT/NET/PTS/GR y formato de celdas | 138 |
| lib/leaderboard/cumulativeInRoundRange.ts | Acumulado en [minRound, maxRound] para cortes | 99 |
| lib/convocatoria/ccqTieBreakProfiles.ts | Perfiles y pasos de desempate CCQ (retrocesion 10-18…) | 90 |
| lib/cuts/cutAdvancementPolicy.ts | Cupo exacto (floor %), campo inscrito, quien pasa | 79 |
| lib/leaderboard/lockedScorecards.ts | Indices de tarjetas cerradas (`locked_at`) | 78 |
| lib/leaderboard/handicapStrokes.ts | PH, golpes recibidos por hoyo, stroke index | 54 |
| lib/cercanos/ranking.ts | Ranking de cercanos (empates comparten lugar, tope 15) | 61 |
| scripts/diagnose-cut-simulation.ts | Reproduce el pipeline publico fuera de Next para depurar cortes | 309 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| tournament_entries | Campo del torneo, categoria, status, HI/CH/PH y overrides | no (creada en Supabase) |
| rounds | Ronda logica (`round_no`) + fila por categoria/wave | no (creada en Supabase) |
| round_scores | Cabecera de tarjeta por jugador y ronda (`gross_score`) | no (creada en Supabase) |
| hole_scores | Golpes por hoyo (`hole_number` o `hole_no`) | parcial: 20260527180000_hole_scores_realtime.sql, 20260529190000_hole_score_audit.sql |
| scorecards | `locked_at` = tarjeta cerrada; base de la clasificacion oficial | no (creada en Supabase) |
| tournament_holes | `par` y `handicap_index` (stroke index) del torneo | no (creada en Supabase) |
| categories | Codigo/grupo de categoria; alcance de reglas | parcial: 20260523130000_categories_fk_set_null.sql |
| category_competition_rules | Modalidad, base de clasificacion/premios, % handicap, plazas | no (creada en Supabase) |
| round_advancement_rules | Reglas de corte (from/to ronda, alcance, cupo, exencion, perfil) | no (creada en Supabase) |
| tie_break_profiles | Perfil de desempate por torneo (`applies_to`: cut/trophy/general) | 20260519120000_tie_break_profiles.sql + 20260523140000_tie_break_profiles_sort_order.sql |
| tie_break_steps | Pasos ordenados del desempate (`step_no`, `hole_scope`…) | 20260519120000_tie_break_profiles.sql |
| category_prize_rules | Premios declarados (posicion, base, alcance, visibilidad) | no (creada en Supabase) |
| closest_to_pin_entries | Distancia al pin por jugador/ronda/hoyo + firmas y token | 20260805150000_closest_to_pin.sql (+160000 firma, +170000 aceptacion) |
| closest_to_pin_prizes | Premio por (torneo, par 3, lugar 1-15) | 20260805180000_closest_to_pin_prizes.sql |
| pairing_groups / pairing_group_members | Grupo de captura de cercanos y `group_no` mostrado | no (creada en Supabase) |

## Reglas de negocio
1. DQ por score: cualquier `gross_score >= 400` marca la ronda como descalificada; tambien `entry.status === "dq"` (`app/torneos/[id]/lib/utils.ts:45`). Fila DQ va al final y sus totales quedan en null (`lib/leaderboard/sortLeaderboardRows.ts:15`, `lib/leaderboard/buildLiveLeaderboard.ts:315`).
2. Una ronda con `category_id` nulo aplica a todas las categorias; con categoria solo aplica a esa (`lib/leaderboard/roundCategoryMatch.ts:25`). Esta es la base de todo el manejo multi-categoria.
3. Si hay varias filas `round_scores` para la misma ronda logica, gana la que tenga MAS hoyos con golpes; empate → la que tenga `gross_score`; empate → menor `id` (`lib/leaderboard/buildLiveLeaderboard.ts:34`).
4. El acumulado suma UNA sola ronda por `round_no`, prefiriendo la fila de la categoria del inscrito, y nunca pasa de la ronda vista (`maxRoundNo`) (`lib/leaderboard/buildLiveLeaderboard.ts:124`).
5. Clasificacion gross se ordena por **to-par acumulado** (± vs par de los hoyos jugados), no por golpes brutos totales (`lib/leaderboard/competitionScoring.ts:225`). `total_gross` solo se muestra en la columna GR.
6. Stableford: puntos = 5 si neto ≤ par-3, 4 si -2, 3 si -1, 2 si par, 1 si +1, 0 si peor (`lib/leaderboard/competitionScoring.ts:17`). En Stableford mas es mejor y se ordena descendente (`lib/leaderboard/sortLeaderboardRows.ts:61`).
7. Golpes recibidos en un hoyo = `floor(PH/18) + (strokeIndex <= PH mod 18 ? 1 : 0)`; PH ≤ 0 → 0 golpes (`lib/leaderboard/handicapStrokes.ts:34`). Stroke index viene de `tournament_holes.handicap_index`; si falta, se usa el numero de hoyo como indice (`lib/leaderboard/handicapStrokes.ts:45`, carga en `app/torneos/[id]/page.tsx:591`).
8. PH efectivo para netos: si ya hay PH del torneo se usa **redondeado** tal cual; si no, fallback legacy `round(HI × %)` (`lib/leaderboard/handicapStrokes.ts:19` y `:4`).
9. Una fila `category_competition_rules` guardada como `stroke_play` + `leaderboard_basis: stableford` se normaliza a Stableford al leerla (`lib/leaderboard/categoryCompetitionRules.ts:38`). Solo se consideran filas `is_active` (`:24`).
10. Sin regla de competencia para la categoria NO se inventa default: `competitionRuleForCategory` devuelve null (`lib/leaderboard/resolveCompetitionRule.ts:9`) y `defaultRuleForCategory` esta marcada deprecated (`lib/leaderboard/categoryCompetitionRules.ts:57`).
11. La pagina publica se BLOQUEA si: falta service role, fallo la lectura de reglas, alguna categoria con jugadores no tiene regla activa, la regla es incoherente (stroke+stableford, % fuera de 0-150) o falta stroke index de los 18 hoyos en categorias net/both/Stableford (`lib/tournament-rules/collectRulesBlockers.ts:51`). El bloqueo de reglas de corte solo aplica en ronda > 1 (`:139`).
12. Toggle Gross/Neto solo aparece si `leaderboard_basis` o `prize_basis` es `both`, o si difieren entre si (`lib/leaderboard/categoryCompetitionRules.ts:12`); por defecto el toggle arranca en `gross` (`app/torneos/[id]/page.tsx:915`).
13. `leaderboard_basis: both` sin override se muestra como GROSS (`lib/leaderboard/leaderboardViewOverride.ts:29`).
14. Vista oficial: solo cuentan rondas con tarjeta cerrada; las no cerradas se anulan hoyo por hoyo antes de acumular (`lib/leaderboard/publicRoundScorePolicy.ts:54`). En Live y Favoritos `includeIncompleteRounds = true` y sí se suma la captura parcial (`app/torneos/[id]/page.tsx:985`).
15. Cierre de tarjeta se evalua por `entry_id + round_id` EXACTO, nunca por `round_no` a secas (`lib/leaderboard/lockedScorecards.ts:51`); solo cuenta si `locked_at` no es null (`:35`).
16. Si en vista oficial ninguna tarjeta esta cerrada, se muestra la tabla en vivo como provisional y la vista se degrada a "live" (`app/torneos/[id]/page.tsx:1126`).
17. Posiciones POS: se ordenan por to-par asc (nulls al final), luego mas hoyos jugados; los empatados comparten posicion con clave `to_par|holes_played|gross|played_rounds`; DQ recibe `pos: null` (`lib/leaderboard/applyStandings.ts:152` y `:195`).
18. MV (movimiento) = posicion previa − posicion actual, con la ronda anterior resuelta por categoria del inscrito (`lib/leaderboard/applyStandings.ts:325`, `lib/leaderboard/roundCategoryMatch.ts:370`).
19. Corte REAL solo existe si hay una regla activa con `to_round_no === ronda que se arma` y `from_round_no < to_round_no` (`lib/cuts/computeCutLine.ts:401`). Sin regla con `to_round_no: 2`, en R2 sale el campo completo.
20. Corte informativo (referencia): reglas con `to_round_no > ronda vista` y `from_round_no <= ronda vista` (`lib/cuts/computeCutLine.ts:432`). `computeDisplayCutLines` prefiere el real y cae al informativo (`:569`).
21. Prioridad de alcance de regla por categoria: `category` (0) → `category_code_list` (1) → `category_group` (2) → `overall` (3); empate por `sort_order` (`lib/cuts/computeCutLine.ts:71` y `:79`).
22. `category_group` hace match por codigo exacto o por prefijo de **al menos 2 letras** (`lib/cuts/computeCutLine.ts:118`), y guardar un grupo de 1 letra se rechaza (`lib/cuts/validateCutScope.ts:19`). Sin esto, el grupo "D" aplicaba a DE y DC a la vez.
23. Cupo: `top_percent` → `max(1, floor(inscritos × %/100))`; `top_n` → `max(1, trunc(N))`; `all` → todo el campo (`lib/cuts/cutAdvancementPolicy.ts:20`). El 50% se redondea SIEMPRE a la baja.
24. Tamaño del campo = inscritos de la categoria excluyendo `withdrawn` y `cancelled` (los DQ SI cuentan para el %) (`lib/cuts/cutAdvancementPolicy.ts:4` y `:49`); si el conteo es menor que las filas en tabla, se usa el mayor (`lib/cuts/computeCutLine.ts:525`).
25. Pasan EXACTAMENTE `cutSlots` jugadores: `include_ties` se ignora por completo (se fuerza `false` al guardar, `app/(backoffice)/cut-rules/actions.ts:150`) y en el limite decide el perfil de desempate (`lib/cuts/cutAdvancementPolicy.ts:38`). Solo son elegibles quienes tienen valor de ranking (`lib/cuts/computeCutLine.ts:190`).
26. Guardar una regla de corte que no sea `all` EXIGE `tie_break_profile_id` (`app/(backoffice)/cut-rules/actions.ts:199`). El selector solo ofrece perfiles activos con `applies_to` en (`cut`, `general`) (`app/(backoffice)/cut-rules/page.tsx:171`).
27. Exencion gross: si `gross_exemption_enabled`, los `gross_exemption_top_n` mejores por gross se AGREGAN al corte por encima del cupo (`lib/cuts/computeCutLine.ts:197`).
28. Rango de rondas del corte: `tournament_to_date` → 1..ronda vista; `last_round_only` → solo `from_round_no`; `specified_rounds` → `from_round_no .. min(to_round_no-1, ronda vista)`, y con clasificacion cerrada se fija en `to_round_no-1` (`lib/cuts/cutRanking.ts:83`).
29. La base de ranking del corte se alinea con la modalidad: categoria Stableford fuerza `points_*`; categoria neta convierte `gross_total`→`net_total` y `gross_round`→`net_round` (`lib/cuts/cutRanking.ts:53`). `gross_*` usa to-par acumulado y cae a golpes brutos si no hay par (`lib/leaderboard/cumulativeInRoundRange.ts:78`).
30. **Cadena de desempate**: se aplican los `tie_break_steps` ordenados por `step_no`; solo se ejecuta `method === "segment_compare"` (`lib/cuts/tieBreak.ts:145`). Cada paso compara un segmento de hoyos (`hole_scope`: `18`, `a_b` como `10_18`, o un hoyo suelto) con `basis` gross/net/points y `direction` (`lib/cuts/tieBreak.ts:26`). Si todos los pasos empatan, desempata gross total y por ultimo `entry_id` (`lib/cuts/computeCutLine.ts:177`).
31. **Orden CCQ de retrocesion** (los 4 perfiles sembrados usan exactamente esta secuencia de 8 pasos): 10-18 → 13-18 → 16-18 → hoyo 18 → 1-9 → 4-9 → 7-9 → hoyo 9 (`lib/convocatoria/ccqTieBreakProfiles.ts:9`). Perfiles: `gross_cut` (gross, menor mejor), `stableford_cut` (points, mayor mejor), `seniors_cut` (gross con handicap proporcional), `trophy_gross` (`:39` y `:71`). El perfil se elige por la base de la regla: `points_total`→stableford, `net_total`→seniors, resto→gross (`:83`).
32. No hay paso de sorteo ni de handicap puro: los unicos metodos implementados son segmentos de hoyos. Cualquier otro `method` guardado se ignora en silencio.
33. Cuando hay corte, la tabla se reordena: primero los que pasan (ordenados por la metrica DEL CORTE), luego los que no; el divisor se pinta antes de la primera fila que no paso, una sola vez por categoria (`lib/cuts/publicCutDisplay.ts:117` y `:212`).
34. Si una categoria tiene varias lineas de corte, el conjunto que pasa es la INTERSECCION (hay que cumplir todas) y el cupo mostrado es el minimo (`lib/cuts/computeCutLine.ts:361`).
35. Reglas de competencia se guardan como snapshot: se borra todo el torneo y se reinserta; exige una fila activa por cada categoria del torneo o falla (`app/(backoffice)/competition-rules/actions.ts:179`). `handicap_percentage` debe estar entre 0 y 150 (`:105`); Stableford fuerza `leaderboard_basis`/`prize_basis` a stableford, `gross_prize_places = 0` y `net_prize_places = null` (`:120`).
36. Premios publicos: solo se listan reglas `is_active && show_on_leaderboard`, filtradas por alcance (overall / category / lista de codigos / grupo) y ordenadas por `sort_order ?? priority ?? prize_position` (`lib/leaderboard/filterPublicPrizeRules.ts:29`). El "grupo" de la categoria se deriva de la PRIMERA letra del codigo (`app/torneos/[id]/page.tsx:947`).
37. Si no se escribe etiqueta de premio, se genera `"<posicion> Gross|Neto|Stableford"` (`app/(backoffice)/prize-rules/actions.ts:146`).
38. Cercanos: solo se capturan hoyos par 3 segun `tournament_holes`/campo; si el torneo no tiene pares cargados se usa el fallback CCQ [3, 8, 12, 17] (`lib/cercanos/loadClosestToPin.ts:23`). Un jugador solo puede tener una distancia por (ronda, hoyo) — `UNIQUE (round_id, hole_number, entry_id)`.
39. La distancia se guarda en centimetros (0 = en el palo, tope 100 000 cm). El parser acepta metros (`1.25`), `cm`, `m`, `ft`/pies y pies-pulgadas (`5'6"`, `5-6`); un numero entero ≥ 100 sin unidad se interpreta como cm, cualquier otro numero como metros (`lib/cercanos/distanceFormat.ts:4`).
40. Ranking de cercanos: distancia ascendente, empates comparten lugar (marcados `tied`) y se truncan los lugares por encima de 15 (`lib/cercanos/ranking.ts:19`, `lib/cercanos/types.ts:2`). Los premios se configuran por (hoyo, lugar 1-15) con unicidad en BD.
41. Solo se pueden capturar distancias de jugadores que pertenecen al `pairing_group` indicado, y la ronda debe pertenecer al torneo (`app/(backoffice)/cercanos/actions.ts:89` y `:98`). Dejar el campo vacio BORRA la distancia (`:161`).
42. Token de aceptacion del jugador: 48 hex aleatorios, vigencia 48 h (`lib/cercanos/acceptToken.ts:3`). Si la distancia CAMBIA se emite token nuevo y se borra la aceptacion previa; si no cambia y el token vive, se conserva (`app/(backoffice)/cercanos/actions.ts:173`).
43. La aceptacion del jugador es idempotente: el update exige `player_accepted_at IS NULL` y token vigente; ya aceptado devuelve exito sin reescribir (`app/aceptar-cerca/[token]/actions.ts:48`). Firmas: PNG base64, maximo 600 000 caracteres (`app/(backoffice)/cercanos/actions.ts:20`).
44. Toda lectura de configuracion (competencia, cortes, pasos de desempate, premios) en la pagina publica usa service role porque RLS bloquea anon en esas tablas (`app/torneos/[id]/page.tsx:757`).
45. Paginacion obligatoria: `round_scores`, `hole_scores` (en bloques de 250 ids), `tournament_entries` y `scorecards` se leen de 1000 en 1000; sin paginar el detalle hoyo por hoyo sale vacio (`app/torneos/[id]/lib/data.ts:4`, `lib/leaderboard/fetchLockedScorecards.ts:4`).

## Flujos
### 1. Render de la clasificacion publica (orden OBLIGATORIO)
1. `app/torneos/[id]/page.tsx` resuelve vista (`live` | `official` | `favorites` | `tee-sheet` | `convocatoria`), categoria y ronda seleccionada.
2. Carga inscritos, `round_scores` y `hole_scores` paginados (`app/torneos/[id]/lib/data.ts`), `tournament_holes` (par + stroke index) y tarjetas cerradas (`lib/leaderboard/fetchLockedScorecards.ts` → `buildLockedScorecardLookups`).
3. Lee con service role `category_competition_rules`, `round_advancement_rules` y `tie_break_steps` de los perfiles referenciados (`page.tsx:757-823`).
4. Calcula PH por jugador con el contexto WHS del torneo (`lib/handicap/loadTournamentHandicapContext`, `page.tsx:833`).
5. `collectRulesBlockers` → si hay bloqueos se renderiza `PublicRulesBlockedView` y NO se calcula nada mas.
6. `buildLiveLeaderboard` → `applyStandings` → `applyCompetitionRules` → `applyCompetitionStandings` (`page.tsx:971-1023`). Este orden no es negociable: los pasos 3 y 4 sobreescriben totales y posiciones del paso 2 con la regla real de la categoria.
7. `cutEnforcesAtTargetRound` + `buildInscribedCountByCategory` + `computeDisplayCutLines` (con `useClosedRoundClassification: true`) → se marca `made_cut` por fila (`page.tsx:1025-1075`).
8. `orderLeaderboardForCutDisplay` → `annotateCutDividers` → `activeCutLineForUi`; despues se filtra `officialLeaderboard` por tarjetas cerradas de la categoria (`page.tsx:1080-1117`).
9. Render: `PublicLeaderboardWithSearch` / `PublicLeaderboardTable` / `PublicLeaderboardDetailTable` (+ `PublicLeaderboardHoleAuditRows` para el desglose por hoyo) y `PublicPrizesPanel`.

### 2. Configurar y aplicar un corte
1. `/competition-rules` guarda modalidad y % handicap por categoria (snapshot completo).
2. `/cut-rules` guarda `round_advancement_rules`: `from_round_no`, `to_round_no`, alcance, base, modo, tipo de cupo y perfil de desempate obligatorio.
3. Los perfiles CCQ se siembran desde la convocatoria (`lib/convocatoria/seedTieBreakProfiles.ts`, que BORRA y reinserta los pasos del perfil).
4. Al ver la ronda o al armar salidas de `to_round_no`, `computePublicCutLines` calcula cupo, ordena con la metrica del corte + desempate y devuelve `madeCutEntryIds`.
5. `lib/tee-sheet/leaderboardOrderForPairing.ts` reusa el mismo motor para ordenar y filtrar las salidas de R2+.
6. Depuracion: `npx tsx scripts/diagnose-cut-by-category.ts <tournament_id> [round_no]` imprime inscritos por categoria, reglas activas, cupo del motor vs mitad esperada y el `tie_break_profile_id` de cada regla. `npx tsx scripts/diagnose-cut-simulation.ts <tournament_id> [round_no]` reproduce el pipeline completo y compara cuantas filas tienen valor de ranking con y sin `useClosedRoundClassification` — es la forma de detectar "el corte sale vacio porque nadie tiene tarjeta cerrada".

### 3. Mas cerca de la bandera
1. `/cercanos`: se elige torneo, ronda, hoyo par 3 y grupo; se teclea la distancia de cada jugador y el capturista firma (`app/(backoffice)/cercanos/actions.ts`).
2. Se genera un token por jugador y se muestra QR/link `/aceptar-cerca/<token>` (`PlayerAcceptLinkButton.tsx`).
3. El jugador abre el link, firma y acepta (`app/aceptar-cerca/[token]/actions.ts`).
4. `/cercanos/premios` da de alta el premio por (hoyo, lugar).
5. `app/torneos/[id]/cercanos` publica el tablero por hoyo con `rankClosestToPin` + premios (`lib/cercanos/loadClosestToPin.ts:225`).

## Invariantes y trampas
- **No reordenes despues de calcular POS.** `applyCompetitionRules` ordena al final con `sortLeaderboardByCompetitionOrder`, y `applyCompetitionStandings` vuelve a ordenar; si se mete un sort intermedio las posiciones dejan de coincidir con la tabla (fix `319811f`, `0b7180d`).
- **Nunca sumes por `round_no` sin filtrar por categoria.** Duplicar capturas de otra categoria infla GR y TOT; por eso `sumCumulativeTotals` deduplica y prefiere la fila de la categoria del inscrito (fix `62751b5`).
- **Nunca evalues cierre de tarjeta por `round_no`.** En torneos multi-categoria daba falsos "cerrado" (`lib/leaderboard/lockedScorecards.ts:47`, fix `fa20dfe`, `659c1f5`).
- **No reintroduzcas `include_ties`.** El motor corta por plazas exactas; incluir a todos los empatados rompia el cupo del 50% (fix `535638e`, `07aeac6`).
- **El cupo % se calcula sobre inscritos, no sobre filas con score.** Si se usa el tamaño de la tabla, el cupo baja conforme falta captura (fix `387095c`, `783b04e`, `f780dfc`).
- **Un corte informativo no debe eliminar ni reordenar de forma que parezca real.** Solo reglas con `to_round_no === ronda objetivo` eliminan jugadores (fix `22d92c6`).
- **Una sola linea de corte por categoria.** `annotateCutDividers` corta el bucle con `break` tras el primer cruce; varias reglas se combinan con `mergeCutLinesForCategory` (fix `0b7180d`, `ad41c4b`).
- **Doble aplicacion del % de handicap — CORREGIDO el 2026-09-20.** `handicapByPlayerId` contiene el **PH ya calculado** (`page.tsx:839`), pero `lib/cuts/tieBreak.ts` y `lib/leaderboard/perHoleCompetition.ts` lo pasaban por `playingHandicap(hi, rule.handicap_percentage)`, multiplicandolo otra vez: con 80% el desglose por hoyo repartia menos golpes de los que descontaba el total en la MISMA pantalla, y el desempate neto comparaba con un PH bajo. Hoy ambos usan `effectivePlayingHandicapForScoring`, igual que `scoreRoundDetail`, y el parametro se llama `resolvedPlayingHandicap` para que no se vuelva a confundir con el indice. Ademas `lib/tee-sheet/leaderboardOrderForPairing.ts:277` armaba ese mapa con el **HI crudo** en vez del PH, asi que el mismo desempate daba un resultado en el orden del tee sheet y otro en la leaderboard publica; ya usa la misma convencion. Ver [[handicap-whs]] reglas 49 y 50.
- **`round_scope` de `tie_break_steps` es configuracion muerta.** `compareByTieBreakSteps` nunca lo lee; la ronda del desempate la fija `rankingRoundRange().tieBreakRound` (`lib/cuts/cutRanking.ts:83`). Igual pasa con `handicap_mode: "course_handicap_80_percent_proportional"`: solo se comprueba `!== "none"` y el 80% sale del `handicap_percentage` de la categoria (`lib/cuts/tieBreak.ts:105`).
- **Sin service role la clasificacion publica no existe.** No hay fallback a defaults: se muestra la pantalla de bloqueo (`collectRulesBlockers.ts:76`).
- **Guardar reglas de competencia borra las anteriores.** Es un snapshot destructivo; guardar con una categoria faltante lanza error antes de borrar, pero un guardado parcial deja el torneo sin reglas de las categorias omitidas (`competition-rules/actions.ts:194`).
- Si `computeCutLine` no encuentra regla de competencia para la categoria devuelve `null` y NO hay linea de corte, aunque exista regla de avance (`lib/cuts/computeCutLine.ts:289`).

## Deuda y preguntas abiertas
- `app/torneos/[id]/page.backup.tsx` (1599 lineas) y `app/(backoffice)/rounds/page.backup.tsx`: copias muertas que Next puede intentar compilar. Deben salir del repo.
- `app/torneos/[id]/page.tsx` con 2244 lineas hace fetching, reglas, cortes, premios, tee sheet y render. Es el mayor riesgo del modulo.
- **No existe motor de adjudicacion de premios.** `category_prize_rules.unique_winner`, `ranking_mode` y `round_nos` se guardan y clonan pero NINGUN codigo los lee para decidir ganadores (verificado por grep en `app` y `lib`); `PublicPrizesPanel` solo lista etiquetas. El "quien recibe que" sigue siendo manual.
- `lib/cuts/publicCutDisplay.ts:197` conserva `sortLeaderboardForCutAlignment` marcada `@deprecated` que solo devuelve `params.rows`: codigo muerto.
- `lib/leaderboard/categoryCompetitionRules.ts:57` `defaultRuleForCategory` deprecated pero exportada.
- `app/(backoffice)/competition-rules/actions.ts:85` deja un `console.log("ACTIONS NUEVO EJECUTANDO")` de depuracion en produccion.
- `app/(backoffice)/dashboard/page.tsx` muestra KPIs hardcodeados (3 torneos, 248 jugadores, 96 en vivo). No lee BD.
- `/reports` tiene una sola pestaña real ("Handicaps por categoria"); `REPORT_TABS` esta preparado para mas. Salida: impresion del navegador + Excel via import dinamico de `exceljs` en cliente (`ReportToolbar.tsx:62`, `PlayersReportToolbar.tsx:55`). `jszip` y `pdfjs-dist` NO se usan en reportes: solo en `lib/convocatoria/extract*` y `lib/handicap-committee/parseHoleByHoleXlsx.ts`.
- Tres carpetas parecidas y realmente distintas: `lib/tournament-rules/` = un unico modulo de bloqueadores de reglas; `lib/tournament/` = orden canonico de inscripciones (`entryDisplayOrder.ts`); `lib/tournaments/` = ciclo de vida del torneo (clonado de reglas, plantillas, gate de inscripcion, sello de cancelado). No es duplicacion funcional, pero los nombres invitan al error: `lib/tournament/` con un solo archivo deberia fusionarse en `lib/tournaments/`.
- `lib/tournaments/cancelledStamp.ts` tiene un UUID de torneo hardcodeado ("Prueba Calcuta") mas match por texto del nombre.
- `secondaryTotalColumnHeader` (`lib/leaderboard/competitionDisplay.ts:37`) devuelve "GR" en las tres ramas: las condiciones no hacen nada.
- ATENCION SIN VERIFICAR: `closest_to_pin_entries` no tiene columna de categoria ni de "premio adjudicado"; el ranking mezcla todas las categorias del hoyo. Si el comite quisiera cercanos por categoria habria que cambiar el esquema.
- ATENCION SIN VERIFICAR: `components/PlayerStats.tsx` (1369 lineas) y `lib/playerStats.ts` (499) no pertenecen a este modulo: consultan `yardage_shot_logs` (tiros GPS, palos, putts, tempo) via `/api/mobile/stats` y son estadistica personal del jugador, no resultados del torneo. Documentarlos en distancias-gps.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[torneos-setup]] · [[tee-sheet-salidas]] · [[captura-scores]] · [[handicap-whs]] · [[matchplay]] · [[distancias-gps]] · [[telegram]]

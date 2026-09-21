---
titulo: "Calcuta: subasta, rifa y proyeccion"
modulo: calcuta-subasta
actualizado: 2026-09-20
tags: [modulo, golf-torneo]
---

# Calcuta: subasta, rifa y proyeccion

## Que resuelve
La noche previa al Calcuta se subastan las parejas inscritas en el salon del club: cada pareja sale a
piso en un turno rifado al azar y alguien la compra con una postura en pesos. La postura mas alta se
convierte en el seed 1 del cuadro y la suma de lo subastado forma la bolsa de premios. Este modulo
reemplaza la hoja del subastador y el proyector manual: rifa el turno de forma auditable en el
servidor, captura la postura, proyecta a pantalla grande la pareja sorteada y el cuadro armandose, y
al cerrar la ultima pareja publica el bracket con sus salidas de R1 para que el jueves haya tee sheet.

## Mapa de archivos

| Ruta | Que hace | Lineas |
|---|---|---|
| app/(backoffice)/matchplay/actions.ts | Server actions de subasta: rifar, adjudicar, hoja, sembrar, reiniciar | 1683 |
| app/(backoffice)/matchplay/auction/raffle/RaffleStage.tsx | Pantalla teatral del subastador: ruleta, adjudicar, re-rifar turno, paneles | 991 |
| app/(backoffice)/matchplay/auction/show/AuctionShowClient.tsx | Vista clasica de subasta en vivo (misma logica, giro corto, mas tabla) | 736 |
| app/(backoffice)/matchplay/auction/AuctionLiveSheet.tsx | Hoja de subasta editable/imprimible: # de turno + postura por equipo | 538 |
| app/torneos/[id]/cuadro-vivo/LiveBracketView.tsx | Cuadro en vivo; `variant="auction-tv"` = camara TV con zoom al slot | 1873 |
| app/(backoffice)/matchplay/auction/proyeccion/SorteoProyeccionClient.tsx | Proyeccion de salon: tambor lento + revelado gigante de la pareja | 343 |
| lib/matchplay/drawNextAuctionPair.ts | Sorteo del turno en el servidor (`crypto.randomInt`) + liberar turno | 195 |
| app/(backoffice)/matchplay/MatchPlayAuctionPanel.tsx | Panel de subasta dentro de /matchplay (tabla, renumerar, sembrar) | 481 |
| lib/matchplay/generateSingleElimBracket.ts | Cuadro 8/16/32/64 con draw estandar y cascada de BYE | 188 |
| lib/matchplay/autoPublishBracket.ts | Borra brackets previos, siembra 1..N y publica el cuadro | 168 |
| lib/matchplay/loadMatchPlayTeamsData.ts | Loader unico de parejas + inscritos + reglas + tamano de cuadro | 254 |
| lib/matchplay/autoPublishOnAuctionComplete.ts | Al cerrar la subasta: publica cuadro, crea rondas y foursomes | 104 |
| app/(backoffice)/matchplay/auction/{,raffle/,show/,proyeccion/,proyeccion-cuadro/}page.tsx | Server pages casi identicas: validan match play, leen reglas y montan el cliente | 179/147/220/47/100 |
| lib/matchplay/useMatchPlayTeamsRealtime.ts | Suscripcion Realtime a `matchplay_pair_teams` para las 4 pantallas | 119 |
| lib/matchplay/sortTeamsForSeeding.ts | Orden de siembra por metodo (`auction` = postura desc, turno asc) | 70 |
| lib/matchplay/auctionTeamPh.ts | PH de torneo por inscrito y suma de la pareja (columna "H") | 54 |
| lib/matchplay/auctionOpenTurn.ts | Quien esta "en subasta": turno abierto mas bajo sin postura | 44 |
| app/(backoffice)/reports/AuctionPairsReport.tsx | Reporte de parejas para la subasta: nombres, HI y PH de cada jugador | 132 |
| app/(backoffice)/reports/AuctionPairsClient.tsx | Tabla imprimible + export a Excel de la hoja de subasta | 504 |
| scripts/clone-calcuta-prueba.ts | Clona el Calcuta oficial a un torneo de prueba con parejas | 211 |

## Tablas de Supabase

| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| matchplay_pair_teams | Parejas inscritas; guarda `auction_bid`, `auction_order`, `seed`, `is_active` | 20260522120000_matchplay.sql; `auction_bid` en 20260522140000_matchplay_auction_bid.sql; `auction_order` en 20260522150000_matchplay_auction_order.sql; auditoria en 20260817140000_auction_order_audit.sql; unicidad de inscrito en 20260522130000_matchplay_team_entry_unique.sql; trigger en 20260523150000_matchplay_auto_deactivate_orphans.sql |
| tournament_matchplay_rules | Reglas del torneo, incluidos los 5 campos `auction_*` y `config_json.auction` | 20260522120000_matchplay.sql; topes en 20260522180000_matchplay_individual_caps.sql; WHS en 20260525170000_matchplay_whs_handicap.sql |
| matchplay_brackets | Cuadro; `config_json` guarda `bracket_size`, `seeding_method`, `bye_count` | 20260522120000_matchplay.sql |
| matchplay_matches | Enfrentamientos generados desde la siembra por postura | 20260522120000_matchplay.sql |
| tournament_entries | Fuente del PH (columna "H" de la hoja = suma del PH de la pareja) | no (creada en Supabase); columnas PH en 20260525170000_matchplay_whs_handicap.sql |
| tournaments | `settings` decide si es match play; `settings.matchplay.bracket_main_pairs` se sincroniza | no (creada en Supabase) |
| categories | Categoria del equipo y rango de HI combinado que valida la pareja | no (creada en Supabase) |
| rounds, pairing_groups, pairing_group_members | Rondas y foursomes que se crean al cerrar la subasta | no (creada en Supabase) |
| tournament_convocatoria | `draft_json.matchplay.auction` es el origen de las reglas de subasta | 20260518120000_tournament_convocatoria.sql |
| auth.users | `auction_order_by` (quien disparo el sorteo) apunta aqui | Supabase Auth |

Realtime esta publicado para `matchplay_pair_teams`, `matchplay_matches` y `matchplay_brackets`
(20260522160000_matchplay_realtime.sql): sin eso las cuatro pantallas dejan de sincronizarse.

## Reglas de negocio

1. La siembra por subasta ordena: postura descendente; empate → menor `auction_order` (salio antes)
   gana mejor seed; ultimo criterio, `seed` previo. Sin postura entra como `-Infinity`, o sea al final
   — lib/matchplay/sortTeamsForSeeding.ts:27-41.
2. El azar del turno vive SOLO en el servidor: `crypto.randomInt` sobre las parejas pendientes y se
   persiste `auction_order` + `auction_order_at` + `auction_order_by` antes de responder. La animacion
   del cliente solo representa ese resultado — lib/matchplay/drawNextAuctionPair.ts:157-172.
3. Un solo turno abierto a la vez: si existe alguna pareja con `auction_order` y sin `auction_bid`, el
   sorteo se rechaza con `code:"busy"`. Unica excepcion: `preferredOrder` (re-rifa de un turno
   liberado), que reutiliza ese numero si sigue libre; si no, se usa `max+1` —
   lib/matchplay/drawNextAuctionPair.ts:110-130 y 154-155.
4. "La pareja en subasta" es siempre la del turno abierto mas BAJO, no la ultima rifada; las cuatro
   pantallas se alinean a ella — lib/matchplay/auctionOpenTurn.ts:26-36.
5. El UPDATE del sorteo lleva guarda `.is("auction_order", null)` y reintenta hasta 4 veces; el error
   23505 (indice unico de turno) tambien reintenta — lib/matchplay/drawNextAuctionPair.ts:170-177.
6. "Volver a rifar turno #N" libera la pareja: pone `auction_order`, `auction_order_at`,
   `auction_order_by` **y `auction_bid`** en NULL, y devuelve `freedOrder` para reutilizar el mismo
   numero de turno — lib/matchplay/drawNextAuctionPair.ts:55-72.
7. Adjudicar conserva el `auction_order` que ya tenia la pareja; si no tenia, le asigna `max+1` —
   app/(backoffice)/matchplay/actions.ts:734-763.
8. Bolsa = `suma(auction_bid) × auction_pot_percent / 100` (NULL = 100% de lo subastado); reparto por
   puesto = `bolsa × prize_shares[i].percent / 100` desde `config_json.prize_shares`; "Cubre X%" =
   `postura × player_cover_percent / 100`, lo que el propio jugador subastado recompra —
   RaffleStage.tsx:113-117, AuctionLiveSheet.tsx:245-250 y 369-373.
9. `auction_min_bid` y `auction_max_bid` son **informativos**: se muestran como placeholder y nota,
   ninguna accion valida la postura contra ellos — app/(backoffice)/matchplay/actions.ts:734-777.
10. La columna "H" de la hoja es la suma del PH de torneo de la pareja. `entryTournamentPh`
    ya no implementa el orden a mano: delega en `effectivePlayingHandicapForEntry`, el
    resolvedor canonico (override -> PH guardado -> WHS), con contexto `null` porque en la
    subasta no se carga contexto de handicap. Es el MISMO numero que ven el marcador en vivo,
    la captura y las tarjetas impresas — lib/matchplay/auctionTeamPh.ts:15-31 y 51-56,
    lib/handicap/resolveTournamentEntryHandicap.ts:492. Ver [[handicap-whs]] regla 49.
11. Tamano del cuadro = potencia de 2 del campo real, minimo 8 y maximo 64:
    `max(equipos activos, floor(inscritos/2))`. 36 parejas dan cuadro de 64, no 32 —
    lib/matchplay/bracketUtils.ts:26-34 y 44-56, lib/matchplay/syncFieldBracketSize.ts:20-70.
12. El draw es el estandar: `bracketSeedOrder` recursivo (1 vs N, 8 vs 9, …), el seed k ocupa el slot k
    y quien queda sin rival gana BYE — lib/matchplay/bracketUtils.ts:2-16,
    lib/matchplay/generateSingleElimBracket.ts:145-153.
13. Un match solo se marca BYE hacia la ronda siguiente cuando AMBOS alimentadores ya tienen ganador
    real; un shell "Vacio" sin ganador no cuenta — lib/matchplay/generateSingleElimBracket.ts:68-90.
14. Cierre automatico: cuando **todas** las parejas jugables tienen `auction_order` (no requiere
    postura) se publica el cuadro si no existe, se crean las rondas del calendario, se resuelven BYEs y
    se generan los foursomes definidos. Solo lo disparan `saveAuctionSheet`, `awardAuctionBid` y
    `updateTeamAuctionBid`, nunca el sorteo — autoPublishOnAuctionComplete.ts:44-80 y
    actions.ts:621, 702, 779.
15. `autoPublishBracket` deja el cuadro en `status:"published"`; el boton manual
    `generateMatchPlayBracket` lo deja en `"draft"` — autoPublishBracket.ts:100 vs actions.ts:1054.
16. "Aplicar siembra" solo reescribe `seed` 1..N; no regenera el cuadro ni toca los matches —
    app/(backoffice)/matchplay/actions.ts:566-594.
17. Reiniciar subasta borra `auction_bid`, `auction_order`, `auction_order_at` y `auction_order_by` de
    todo el torneo y NO toca los `seed` ya aplicados — app/(backoffice)/matchplay/actions.ts:833-860.
18. Solo `super_admin`, `club_admin` y `tournament_director` pueden rifar, adjudicar o reiniciar —
    app/(backoffice)/matchplay/actions.ts:49-54.
19. Las cuatro pantallas exigen `isMatchPlayFormat(settings)` (si no, redirigen o avisan) y el item
    "Subasta" del menu solo aparece con `match_type = 'pairs'` y `auction_enabled !== false` —
    auction/show/page.tsx:69-84, components/layout/Sidebar.tsx:145-160 y 190-197.
20. En el Cuadro TV una pareja ocupa slot solo cuando ya tiene **postura**; en el cuadro publico basta
    el **turno**. Vacante real (BYE permanente) = seed > `pairFieldSize`; seed dentro del campo pero
    sin adjudicar se dibuja "Por adjudicar" — LiveBracketView.tsx:737-742, 753-756 y 785-793.
21. Duraciones de animacion: rifa teatral 6200 ms, vista clasica 2400 ms, proyeccion TV 7800 ms +
    900 ms de pausa antes del revelado; con `prefers-reduced-motion` se aterriza de inmediato —
    RaffleStage.tsx:202, AuctionShowClient.tsx:219, SorteoProyeccionClient.tsx:25-26.
22. Plantilla CCQ Mixto (unica referencia real de calcuta en el repo): `seeding_method:"auction"`,
    bolsa 90% de lo subastado, postura 10.000–40.000 MXN, jugador cubre 20%, reparto 43/20/12/10 + 8%
    consolacion MP + 7% stroke agregado — lib/convocatoria/templates/ccqMatchPlayMixto.ts:29-90.
23. Las reglas de subasta llegan a `tournament_matchplay_rules` desde la convocatoria:
    `enabled → auction_enabled`, `pot_percent_of_total → auction_pot_percent`,
    `min_bid`/`max_bid`/`currency`, y el objeto completo queda en `config_json` —
    lib/matchplay/applyMatchPlayDraft.ts:271-297.
24. Trigger `matchplay_pair_teams_autodeactivate` (BEFORE INSERT/UPDATE de A, B o `is_active`): si
    `player_a_entry_id` es NULL desactiva el equipo, y si el torneo es `pairs` y falta B tambien. Existe
    porque las FK a `tournament_entries` son ON DELETE SET NULL y al borrar un inscrito quedaban
    equipos en blanco — 20260523150000_matchplay_auto_deactivate_orphans.sql:10-52.
25. Indices unicos parciales: un inscrito no puede estar en dos equipos activos del torneo
    (`tournament_id`+`player_a_entry_id` y +`player_b_entry_id` con `is_active = true`,
    20260522130000_matchplay_team_entry_unique.sql:3-9) y `auction_order` es unico por torneo donde no
    es NULL (20260817140000_auction_order_audit.sql:14-16).
26. Borrar un equipo desde la UI es baja logica (`is_active = false`), nunca DELETE —
    app/(backoffice)/matchplay/actions.ts:429-445.
27. Al cerrar la subasta el calendario Calcuta 64 se crea con 6 rondas: R1 jue 07:00, R2 jue 11:00,
    R3 vie 11:00, R4 sab 07:00, R5 sab 11:00, R6 dom (stroke 08:00 h10, consolacion MP 09:30 h1,
    3er/4to 09:42, final 09:54), intervalo 12 min — lib/matchplay/ensureMatchPlayCalendarRounds.ts:55-82.

## Flujos

### 1. Rifa y subasta en vivo (noche de subasta)
1. El comite abre **/matchplay/auction/raffle**; en el salon se proyectan **/auction/proyeccion**
   (tambor + pareja gigante) y **/auction/proyeccion-cuadro** (cuadro con camara).
2. "Girar ruleta" → `drawNextAuctionPairAction` (actions.ts:875) → `drawNextAuctionPair` sortea con
   `randomInt`, escribe `auction_order` + auditoria y devuelve el `teamId`.
3. El cliente anima el tambor y aterriza en ese equipo (RaffleStage.tsx:146-231). Realtime propaga el
   cambio y la proyeccion corre su propio giro largo (SorteoProyeccionClient.tsx:181-202).
4. El subastador teclea la postura y pulsa "Adjudicar" → `awardAuctionBid` guarda `auction_bid`
   conservando el turno (actions.ts:734). Si la pareja no esta en el salon, "Volver a rifar turno #N"
   la libera y vuelve a girar el mismo numero (RaffleStage.tsx:234-251).
5. Al adjudicar la ultima pareja, `autoPublishOnAuctionComplete` publica el cuadro, crea R1..R6 y arma
   los foursomes; el mensaje de vuelta dice "Cuadro publicado automaticamente".

### 1-bis. Reporte previo de parejas (para el subastador y el salon)
1. **/reports?tab=subasta** lista una fila por pareja activa: turno rifado, J1 y J2 con su HI
   (indice) y su PH (handicap de torneo), suma de PH, suma de HI, categoria y postura.
2. Lee de `loadMatchPlayTeamsData` y resuelve el PH con `entryTournamentPh`, el mismo helper de
   la rifa, la proyeccion y el cuadro: por construccion no puede desalinearse de esas pantallas.
3. Orden: por `auction_order` cuando ya se rifo; las que faltan, por suma de PH ascendente.
4. Boton "Recalcular y guardar CH/PH" antes de imprimir si cambio algun indice; imprimir / PDF /
   Excel desde la barra del reporte.

### 2. Hoja de subasta (respaldo en papel / captura masiva)
1. **/matchplay/auction** lista los equipos ordenados por `auction_order` y luego `seed`
   (AuctionLiveSheet.tsx:88-96). "Auto-numerar # 1..N" llena los turnos con el orden en pantalla.
2. "Guardar hoja" → `saveAuctionSheet` recorre los arreglos paralelos `team_id` / `auction_order` /
   `auction_bid` con un UPDATE por fila (actions.ts:649-716).
3. La "Vista previa de siembra" muestra el orden resultante y marca en ambar los empates de postura;
   "Aplicar siembra" escribe `seed` 1..N (AuctionLiveSheet.tsx:167-183 y 489-497).

### 3. Montar un Calcuta de prueba con los scripts
1. `npx tsx scripts/clone-calcuta-prueba.ts` — clona el oficial `5d88f527-…` a "Prueba Torneo Calcuta
   de Parejas Varonil 2026": reglas via `cloneTournamentRules`, inscritos con su PH, parejas con
   `auction_bid: null` (conserva `auction_order`) y premios de mas cerca. Idempotente por nombre.
2. `npx tsx scripts/apply-calcuta-schedule.ts <tid>` — rondas R1..R6 del plan Calcuta,
   `settings.pace.match_duration_minutes = 300`, publica salidas y escribe los textos de horario+ritmo
   en reglas y convocatoria. Sin argumento usa el TEST_ID `03b3dde9-…`.
3. Se corre la subasta (flujo 1) o se llena la hoja (flujo 2) → el cuadro se autopublica.
4. `npx tsx scripts/restore-auction-bracket.ts <tid>` — si el cuadro quedo sucio: borra los
   `pairing_groups` con notas `MATCH PLAY%` de las rondas > 1 y regenera el bracket sembrado por
   postura, dejando todo `scheduled`/`bye` sin cerrar partidos.
5. `scripts/fix-consol-mp-r4-calcuta.ts` movio la consolacion MP de perdedores de octavos a cuartos
   (`from_round_no` 3 → 4) en el torneo oficial hardcodeado; ya esta aplicado.
   `scripts/show-calcuta-pace.ts` es solo diagnostico del ritmo (campo `4bd3a144-…`), no escribe nada.

## Invariantes y trampas

- **No rifes el siguiente turno con uno abierto.** Antes del fix `5cdaa31` las pantallas saltaban al
  #5 mientras el #4 seguia sin postura. Hoy la guarda vive en el servidor (regla 3) y en el cliente
  (`canSpinNext`, RaffleStage.tsx:316). Si tocas `openUnbidAuctionTeams` o `currentOpenAuctionTeam`,
  las tres pantallas se desincronizan.
- **`auction_order` unico + UPDATE fila por fila = colision.** `saveAuctionSheet` no usa transaccion:
  si intercambias dos turnos (A de 1 a 2 y B de 2 a 1) el primer UPDATE choca con el indice parcial y
  la accion lanza el mensaje crudo de Postgres (actions.ts:698). Para reordenar, limpia con "Reiniciar
  subasta" o usa "Renumerar" (`reorderAuctionSequence`, actions.ts:937), que asigna en orden
  ascendente. Ojo: `reorderAuctionSequence` y `applyAuctionSeeding` ignoran el error de cada UPDATE y
  pueden dejar la numeracion a medias sin avisar (actions.ts:582-589 y 962-969).
- **"Volver a rifar" borra la postura.** `releaseAuctionPairForRedraw` pone `auction_bid` en NULL
  (regla 6). En la rifa el equipo actual nunca tiene postura, pero el boton "Liberar turno #N (aun no
  toca)" (RaffleStage.tsx:566) y cualquier llamada nueva a la funcion si pueden borrar dinero.
- **Guardar la hoja con turnos completos y posturas vacias autopublica el cuadro.** El disparador es
  `auction_order`, no `auction_bid` (regla 14): todas las posturas serian `-Infinity`, empatarian y la
  siembra saldria por orden de turno. Llena posturas antes de guardar turnos completos.
- **`autoPublishBracket` borra TODOS los brackets del torneo**, incluida la "Consolacion Match Play"
  (autoPublishBracket.ts:75-81), mientras el chequeo de existencia previo la excluye
  (autoPublishOnAuctionComplete.ts:57). Si un torneo solo tiene el bracket de consolacion, cerrar la
  subasta lo destruye con sus matches en cascada. Igual riesgo al correr
  `scripts/restore-auction-bracket.ts` despues de haber jugado consolaciones.
- **El tamano del cuadro sale del campo cerrado, no de la convocatoria** (fix `dd5ea57`): con 38
  parejas es 64 aunque `max_pairs_per_category` diga 32. `loadMatchPlayTeamsData` sincroniza
  `bracket_main_pairs` en cada carga (loadMatchPlayTeamsData.ts:230-236); no lo fijes a mano.
- **Las salidas de R1 leen `matchplay_matches`, no `auction_order`** (fix `49b6f0d`). El fallback por
  postura de `app/(backoffice)/tee-sheet/actions.ts:1420-1520` solo aplica si el cuadro no esta
  publicado; si el bracket se autopublico, nunca debe activarse.
- **BYE contra pareja fantasma** (fix `5630769`): `seedDefinedMatchPlayGroups` solo arma foursomes con
  4 jugadores reales, nunca grupos de 2. Si relajas `isPlayablePairTeam` reaparecen los grupos
  incompletos en R1/R2.
- **El trigger de autodesactivacion puede "desaparecer" parejas.** Si borras un inscrito, su equipo
  pasa a `is_active = false` en silencio; como los loaders filtran `is_active = true`
  (loadMatchPlayTeamsData.ts:184), la pareja se cae de la subasta, del conteo del campo y del cuadro.
- **Realtime no trae los jugadores.** El hook solo refresca campos editables y deja `player_a`/
  `player_b` en NULL para filas nuevas (useMatchPlayTeamsRealtime.ts:70-88): una pareja creada durante
  la subasta se ve como "(equipo)" hasta recargar. Y en la hoja, `dirtyIds` es lo que evita que un
  evento de Realtime sobreescriba la postura a medio teclear (AuctionLiveSheet.tsx:84-135).
- **Las pantallas no validan rol por torneo.** Leen con `createAdminClient` y solo dependen del gate
  general de `app/(backoffice)/layout.tsx`: cualquier usuario de backoffice puede abrir la proyeccion
  de cualquier torneo, aunque no pueda escribir (regla 18).

## Deuda y preguntas abiertas

- Motor de Excel del proyecto padre, en `/Users/marioalvarez/Dropbox/MARIO ALVAREZ ZERECERO/GOLF SISTEMA WEB/`:
  `ENGINE_MASTER_CALCUTA_2026.xlsm` (+ `.xlsx`), `TORNEO_CALCUTA_26.xlsm`, `TORNEO_CALCUTA_26_IMP.xlsm`,
  `TORNEO_CALCUTA_26_IMP_HP.xlsm`, `CALCUTA INVIDIDUAL 2026.xlsx` (typo en el nombre) y los `.docx` de
  tarjetas. Hay archivos de bloqueo `~$…`, o sea que se siguen abriendo en Excel. No se abrieron aqui y
  nada del repo los lee ni escribe. ATENCION SIN VERIFICAR: a la web migro la siembra por postura, el
  cuadro 8/16/32/64 con BYEs, el reparto porcentual de la bolsa, el horario de 12 min y la impresion de
  tarjetas (`lib/matchplay/loadPrintableMpScorecards.ts`); en Excel seguirian la cobranza a los
  compradores, el Calcuta **individual** y los formatos `_IMP` / `_IMP_HP`.
- No hay cobranza en el sistema: `player_cover_percent` solo pinta un monto y no existe tabla de
  compradores, pagos ni recibos — quien compro a cada pareja no se guarda en ningun campo. Tampoco se
  validan `auction_min_bid` / `auction_max_bid` (regla 9).
- Motor de giro duplicado tres veces con constantes distintas (RaffleStage.tsx:146-231,
  AuctionShowClient.tsx:176-241, SorteoProyeccionClient.tsx:109-178); la vista clasica `/show` es casi
  un subconjunto de `/raffle`. Y `lib/matchplay/auctionWheel.ts` exporta `AUCTION_WHEEL_SPIN_MS`,
  `AUCTION_WHEEL_PAUSE_MS` y `wheelIndexProgress` que nadie usa (solo se consume
  `prefersReducedMotion()`): codigo muerto.
- Los botones "Cuadro TV" y "Zoom llave TV" apuntan a la MISMA ruta `/proyeccion-cuadro`
  (AuctionLiveSheet.tsx:278 y 293; show/page.tsx:163 y 178): falta una variante de camara o sobra un
  boton.
- Calculo de bolsa inconsistente: la hoja usa `potPercent ? … : total` (AuctionLiveSheet.tsx:193), asi
  que `auction_pot_percent = 0` muestra el 100%; la rifa y el cuadro usan `!= null` y muestran 0
  (RaffleStage.tsx:115, LiveBracketView.tsx:942).
- `scripts/clone-calcuta-prueba.ts:170` inserta `session_id: null` en `matchplay_pair_teams`, columna
  que no aparece en ninguna migracion ni en `MatchPlayTeamRow`. ATENCION SIN VERIFICAR: si esa columna
  no existe en Supabase, el clonado de parejas falla en silencio (el error solo se imprime con
  `console.warn`).
- IDs hardcodeados en los scripts: oficial `5d88f527-…`, prueba `03b3dde9-…` (tambien en
  `lib/tournaments/cancelledStamp.ts:2`), default `a3badced-…` en `restore-auction-bracket.ts:37`,
  campo `4bd3a144-…` en `show-calcuta-pace.ts:33`.
- No hay RLS declarada para las tablas de match play en `supabase/migrations`: todo el acceso pasa por
  server actions con service role. ATENCION SIN VERIFICAR: confirmar en Supabase si
  `matchplay_pair_teams` tiene RLS habilitada, porque el cliente se suscribe por Realtime con la llave
  publica.

## Relacionado

[[matchplay]] · [[torneos-setup]] · [[tee-sheet-salidas]] · [[handicap-whs]] ·
[[resultados-cortes-premios]] · [[datos-y-seguridad]] · [[arquitectura]] · [[ritmo-juego]]
